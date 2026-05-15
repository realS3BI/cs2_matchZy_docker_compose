import crypto from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import {
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeNades
} from "./validators.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableNades(entries) {
  return JSON.stringify(sanitizeNades(entries).map((entry) => ({
    id: entry.id,
    name: entry.name,
    map: entry.map,
    type: entry.type,
    desc: entry.desc,
    lineupPos: entry.lineupPos,
    lineupAng: entry.lineupAng,
    owner: entry.owner
  })).sort((left, right) => `${left.owner}\0${left.map}\0${left.name}`.localeCompare(`${right.owner}\0${right.map}\0${right.name}`)));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonFile(path) {
  const content = await readFile(path, "utf8");
  return {
    content,
    hash: sha256(content),
    value: JSON.parse(content)
  };
}

async function writeJsonFileAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, path);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
  return {
    content,
    hash: sha256(content)
  };
}

export class NadesSyncService {
  config: any;
  store: any;
  liveFile: string;
  runtimeFile: string;
  intervalMs: number;
  enabled: boolean;
  running: boolean;
  polling: boolean;
  timer: NodeJS.Timeout | null;
  lastSeenMtimeMs: number;
  lastSeenHash: string;
  lastSelfWrittenHash: string;
  lastReadAt: string;
  lastWriteAt: string;
  lastError: string;

  constructor({ config, store }) {
    this.config = config;
    this.store = store;
    this.liveFile = config.liveMatchZyNadesFile;
    this.runtimeFile = config.runtimeMatchZyNadesFile;
    this.intervalMs = Number.isFinite(config.nadesSyncIntervalMs) && config.nadesSyncIntervalMs > 0
      ? config.nadesSyncIntervalMs
      : 2000;
    this.enabled = config.nadesSyncEnabled !== false;
    this.running = false;
    this.polling = false;
    this.timer = null;
    this.lastSeenMtimeMs = 0;
    this.lastSeenHash = "";
    this.lastSelfWrittenHash = "";
    this.lastReadAt = "";
    this.lastWriteAt = "";
    this.lastError = "";
  }

  status() {
    return {
      enabled: this.enabled,
      liveFile: this.liveFile,
      runtimeFile: this.runtimeFile,
      running: this.running,
      lastReadAt: this.lastReadAt,
      lastWriteAt: this.lastWriteAt,
      lastError: this.lastError
    };
  }

  async start() {
    if (!this.enabled || this.running) return;
    this.running = true;
    await this.bootstrap();
    this.schedule();
  }

  async stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async bootstrap() {
    try {
      if (await exists(this.liveFile)) {
        await this.importLiveFile("startup");
        return;
      }

      const nades = await this.store.getNades();
      if (nades.length > 0) {
        await this.writeFromMongo(nades);
      }
    } catch (error) {
      await this.handleError(error, "startup");
    }
  }

  schedule() {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.poll();
      this.schedule();
    }, this.intervalMs);
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const fileStat = await stat(this.liveFile).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (!fileStat) return;

      const { content, hash, value } = await readJsonFile(this.liveFile);
      if (fileStat.mtimeMs === this.lastSeenMtimeMs && hash === this.lastSeenHash) return;
      this.lastSeenMtimeMs = fileStat.mtimeMs;
      this.lastSeenHash = hash;

      if (hash === this.lastSelfWrittenHash) return;

      await this.importParsedConfig(value, hash, content.length, "poll");
    } catch (error) {
      await this.handleError(error, "poll");
    } finally {
      this.polling = false;
    }
  }

  async importLiveFile(source) {
    const fileStat = await stat(this.liveFile);
    const { content, hash, value } = await readJsonFile(this.liveFile);
    this.lastSeenMtimeMs = fileStat.mtimeMs;
    this.lastSeenHash = hash;
    await this.importParsedConfig(value, hash, content.length, source);
  }

  async importParsedConfig(config, hash, bytes, source) {
    const entries = matchZySavedNadesConfigToNades(config);
    const current = await this.store.getNades();
    if (stableNades(entries) !== stableNades(current)) {
      await this.store.replaceNadesFromSync(entries, { source, hash, bytes });
    }
    this.lastReadAt = new Date().toISOString();
    this.lastError = "";
  }

  async writeFromMongo(entries) {
    if (!this.enabled) return;
    const cleanEntries = sanitizeNades(entries);
    const config = nadesToMatchZySavedNadesConfig(cleanEntries);

    const liveWrite = await writeJsonFileAtomic(this.liveFile, config);
    this.lastSelfWrittenHash = liveWrite.hash;
    this.lastSeenHash = liveWrite.hash;
    const fileStat = await stat(this.liveFile).catch(() => null);
    this.lastSeenMtimeMs = fileStat?.mtimeMs || 0;

    await writeJsonFileAtomic(this.runtimeFile, config);
    this.lastWriteAt = new Date().toISOString();
    this.lastError = "";
  }

  async handleError(error, source) {
    this.lastError = error?.message || String(error);
    await this.store.logAction("nades_sync", "failed", this.lastError, { source }).catch(() => {});
  }
}
