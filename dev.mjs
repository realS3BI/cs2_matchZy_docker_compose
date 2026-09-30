#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`Lokale Entwicklung mit MongoDB, API und Vite.

  ./dev.sh [--url http://localhost:5173] [--admin STEAM64_ID]
  node dev.mjs [--url http://localhost:5173] [--admin STEAM64_ID]
  cd admin-panel && pnpm dev

Voraussetzungen: Node.js ab 22, Docker mit Compose ab 2.22.
Die Einstellungen stehen in .env.development. Strg+C stoppt die Container;
die Entwicklungsdaten bleiben für den nächsten Start erhalten.`);
      return;
    }
    if (!["--url", "--admin"].includes(arg) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error(`Unbekanntes oder unvollständiges Argument: ${arg}. Hilfe: --help`);
    }
    options[arg.slice(2)] = args[++i];
  }

  const envFile = ".env.development";
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const publicUrl = new URL(options.url || process.env.ADMIN_PANEL_PUBLIC_URL || "http://localhost:5173");
  if (publicUrl.protocol !== "http:" || publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    throw new Error("Für die lokale Entwicklung eine HTTP-Adresse ohne Pfad angeben, z. B. http://localhost:5173.");
  }
  const admin = options.admin ?? process.env.ADMIN_PANEL_ADMIN_STEAM_ID ?? "";
  if (admin && !/^\d{17}$/.test(admin)) throw new Error("Die Steam64-ID muss aus 17 Ziffern bestehen.");
  const port = Number(publicUrl.port || 80);
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${port} ist belegt. Den bisherigen Dev-Server beenden oder mit --url einen anderen Port wählen.`)));
    server.listen(port, "0.0.0.0", () => server.close(resolve));
  });

  const info = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (info.status !== 0) throw new Error("Docker ist nicht erreichbar. Docker Desktop bzw. den Docker-Dienst starten.");
  const compose = spawnSync("docker", ["compose", "version", "--short"], { encoding: "utf8" });
  const version = compose.stdout?.trim().replace(/^v/, "").split(".").map(Number);
  if (compose.status !== 0 || !version || !(version[0] > 2 || (version[0] === 2 && version[1] >= 22))) {
    throw new Error("Docker Compose ab Version 2.22 wird für das automatische Neuladen benötigt.");
  }

  const secret = process.env.ADMIN_PANEL_SESSION_SECRET || randomBytes(32).toString("hex");
  if (!existsSync(envFile)) {
    writeFileSync(envFile, [
      "# Lokale Entwicklung. Diese Datei nicht einchecken.",
      `ADMIN_PANEL_PUBLIC_URL=${publicUrl.origin}`,
      `ADMIN_PANEL_ADMIN_STEAM_ID=${admin}`,
      `ADMIN_PANEL_SESSION_SECRET=${secret}`,
      ""
    ].join("\n"), { mode: 0o600, flag: "wx" });
  }
  console.log(`Starte die Entwicklungsumgebung für ${publicUrl.origin}`);
  console.log(`Browser und Steam-Callback: ${publicUrl.origin}, interner API-Port: 8080.`);
  console.log("Frontend-Änderungen lädt Vite direkt. API-Änderungen bauen den API-Container neu.");
  if (admin) console.log("Die konfigurierte Steam-ID erhält beim Start lokale Admin-Rechte, auch bei einem bestehenden Konto.");
  if (!admin) console.log("Ohne ADMIN_PANEL_ADMIN_STEAM_ID erhält eine neue Steam-Anmeldung die Rolle Player.");
  console.log("Strg+C stoppt die Container. Die lokalen Daten bleiben erhalten.");

  const child = spawn("docker", ["compose", "--project-name", "cs2-matchzy-dev", "--env-file", envFile, "-f", "docker-compose.dev.yml", "up", "--build", "--watch", "--attach", "api", "--attach", "web"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ADMIN_PANEL_PUBLIC_URL: publicUrl.origin,
      ADMIN_PANEL_ADMIN_STEAM_ID: admin,
      ADMIN_PANEL_SESSION_SECRET: secret,
      DEV_PORT: String(port)
    }
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.once("error", error => { console.error(error.message); process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 0; });
}

main().catch(error => {
  console.error(`Start fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
