import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createRequire } from "node:module";
import { problem } from "./strats.js";

export async function sourceJson(url: string, options: any = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 202) {
    await response.body?.cancel();
    problem(
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "Die Quelle begrenzt gerade die Abfragen. Der Import wird später nachgeholt."
        : "Die Matchquelle ist nicht erreichbar oder der Zugang wurde abgewiesen.",
    );
  }
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > 4 * 1024 * 1024)
          problem(502, "Die Matchquelle lieferte eine zu große Antwort.");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    problem(502, "Die Matchquelle lieferte keine gültige Antwort.");
  }
}
export class SourceSecrets {
  private key: Buffer;
  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }
  encrypt(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    return [
      iv.toString("base64"),
      cipher.update(value, "utf8", "base64") + cipher.final("base64"),
      cipher.getAuthTag().toString("base64"),
    ].join(".");
  }
  decrypt(value: string) {
    try {
      const [iv, data, tag] = value.split(".");
      const cipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(iv, "base64"),
      );
      cipher.setAuthTag(Buffer.from(tag, "base64"));
      return cipher.update(data, "base64", "utf8") + cipher.final("utf8");
    } catch {
      problem(
        503,
        "Die gespeicherte History-Freigabe muss erneut verbunden werden.",
      );
    }
  }
}
export class SteamDemoResolver {
  private user: any;
  private gc: any;
  private queue: Promise<any> = Promise.resolve();
  start(refreshToken: string) {
    if (!refreshToken || this.user) return;
    const require = createRequire(import.meta.url),
      SteamUser = require("steam-user"),
      GlobalOffensive = require("globaloffensive");
    this.user = new SteamUser({ dataDirectory: null, autoRelogin: true });
    this.gc = new GlobalOffensive(this.user);
    this.user.on("error", () => {});
    this.user.on("loggedOn", () => this.user.gamesPlayed([730]));
    this.user.logOn({ refreshToken });
  }
  get ready() {
    return !!this.gc?.haveGCSession;
  }
  resolve(shareCode: string): Promise<any> {
    const task = this.queue.then(async () => {
      if (!this.ready)
        problem(
          503,
          "Der Steam-Demozugang ist noch nicht verbunden. Die Matchhistorie bleibt gespeichert.",
        );
      const require = createRequire(import.meta.url),
        { ShareCode } = require("globaloffensive-sharecode");
      const details = new ShareCode(shareCode).decode();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          this.gc.removeListener("matchList", received);
        };
        const received = (matches: any[]) => {
          const match = matches.find(
            (m) => String(m.matchid) === String(details.matchId),
          );
          if (match) {
            cleanup();
            resolve(match);
          }
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(
            Object.assign(
              new Error("Steam hat die Demo noch nicht bereitgestellt."),
              { status: 503 },
            ),
          );
        }, 20_000);
        this.gc.on("matchList", received);
        try {
          this.gc.requestGame(details);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    });
    this.queue = task.catch(() => {});
    return task;
  }
  close() {
    this.user?.logOff();
  }
}
export function trustedDemoUrl(value: string, source: "faceit" | "premier") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problem(502, "Die Quelle enthält keinen gültigen Demolink.");
  }
  const host = url.hostname.toLowerCase();
  const allowed =
    source === "faceit"
      ? url.protocol === "https:" &&
        (host === "demos.faceit.com" ||
          host.endsWith(".faceit.com") ||
          /^faceit[-a-z0-9.]*\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(
            host,
          ))
      : ["http:", "https:"].includes(url.protocol) &&
        /^replay\d*\.(?:valve\.net|steamcontent\.com)$/.test(host);
  if (
    !allowed ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    problem(502, "Die Demodatei liegt auf einer nicht freigegebenen Quelle.");
  return url;
}
