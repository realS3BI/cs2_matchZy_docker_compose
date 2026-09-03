import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnvFile } from "./env-file.js";

function loadLocalEnvFile() {
  const candidates = [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const env = parseEnvFile(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(env)) {
      process.env[key] ??= String(value);
    }
    return;
  }
}

loadLocalEnvFile();

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getConfig() {
  return {
    port: 8080,
    password: requireEnv("ADMIN_PANEL_PASSWORD"),
    sessionSecret: requireEnv("ADMIN_PANEL_SESSION_SECRET"),
    mongodbUri: "mongodb://mongodb:27017/cs2_admin_panel",
    mongoDbName: "cs2_admin_panel",
    projectDir: "",
    composeFile: "docker-compose.yml",
    envFile: "",
    runtimeEnvFile: "/runtime/settings.env",
    runtimeAdminsFile: "/runtime/csharp-admins.json",
    runtimeMatchZyAdminsFile: "/runtime/matchzy-admins.json",
    runtimeMatchZyNadesFile: "/runtime/matchzy-savednades.json",
    liveMatchZyNadesFile: "/cs2-data/game/csgo/cfg/MatchZy/savednades.json",
    uploadDir: "/uploads",
    nadesSyncEnabled: true,
    nadesSyncIntervalMs: 2000,
    controlMode: "docker",
    composeProjectName: "cs2-matchzy",
    serviceName: "cs2",
    containerName: ""
  };
}
