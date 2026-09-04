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

function nadeKey(entry) {
  return `${entry.owner}\0${entry.map}\0${entry.name}`.toLowerCase();
}

function preservePanelMetadata(importedEntries, currentEntries) {
  const currentByKey = new Map(sanitizeNades(currentEntries).map((entry) => [nadeKey(entry), entry]));
  return importedEntries.map((entry) => {
    const current = currentByKey.get(nadeKey(entry));
    if (!current) return entry;
    return {
      ...entry,
      id: current.id || entry.id,
      lineupImages: current.lineupImages || []
    };
  });
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
  matchZyConfigFile: string;
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
  lastCheckAt: string;
  lastConfirmedAt: string;
  lastDirection: string;
  liveFilePresent: boolean;
  runtimeFilePresent: boolean;
  matchZyConfigPresent: boolean;
  globalSavesEnabled: boolean | null;

  constructor({ config, store }) {
    this.config = config;
    this.store = store;
    this.liveFile = config.liveMatchZyNadesFile;
    this.runtimeFile = config.runtimeMatchZyNadesFile;
    this.matchZyConfigFile = config.liveMatchZyConfigFile || `${dirname(this.liveFile)}/config.cfg`;
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
    this.lastCheckAt = "";
    this.lastConfirmedAt = "";
    this.lastDirection = "";
    this.liveFilePresent = false;
    this.runtimeFilePresent = false;
    this.matchZyConfigPresent = false;
    this.globalSavesEnabled = null;
  }

  status() {
    const state = !this.enabled
      ? "disabled"
      : this.lastError
          ? "error"
          : !this.running
            ? "stopped"
            : this.liveFilePresent && this.runtimeFilePresent && this.lastConfirmedAt
              ? "healthy"
              : "waiting";
    return {
      enabled: this.enabled,
      state,
      liveFile: this.liveFile,
      runtimeFile: this.runtimeFile,
      intervalMs: this.intervalMs,
      running: this.running,
      liveFilePresent: this.liveFilePresent,
      runtimeFilePresent: this.runtimeFilePresent,
      matchZyConfigPresent: this.matchZyConfigPresent,
      globalSavesEnabled: this.globalSavesEnabled,
      lastCheckAt: this.lastCheckAt,
      lastConfirmedAt: this.lastConfirmedAt,
      lastDirection: this.lastDirection,
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
      await this.refreshFileState();
      if (this.liveFilePresent) {
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
      const fileStat = await this.refreshFileState();
      this.lastCheckAt = new Date().toISOString();
      if (!fileStat) {
        this.lastError = "";
        return;
      }

      const { content, hash, value } = await readJsonFile(this.liveFile);
      this.lastReadAt = this.lastCheckAt;
      this.lastConfirmedAt = this.lastCheckAt;
      this.lastError = "";
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
    this.liveFilePresent = true;
    await this.importParsedConfig(value, hash, content.length, source);
  }

  async importParsedConfig(config, hash, bytes, source) {
    const importedEntries = matchZySavedNadesConfigToNades(config);
    const current = await this.store.getNades();
    if (stableNades(importedEntries) !== stableNades(current)) {
      const entries = preservePanelMetadata(importedEntries, current);
      await this.store.replaceNadesFromSync(entries, { source, hash, bytes });
      this.lastDirection = "matchzy-to-panel";
    }
    this.lastReadAt = new Date().toISOString();
    this.lastConfirmedAt = this.lastReadAt;
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
    this.lastConfirmedAt = this.lastWriteAt;
    this.lastDirection = "panel-to-matchzy";
    await this.refreshFileState();
    this.lastError = "";
  }

  async refreshFileState() {
    const [liveFileStat, runtimeFileStat, matchZyConfig] = await Promise.all([
      stat(this.liveFile).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
      stat(this.runtimeFile).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
      readFile(this.matchZyConfigFile, "utf8").catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      })
    ]);

    this.liveFilePresent = Boolean(liveFileStat);
    this.runtimeFilePresent = Boolean(runtimeFileStat);
    this.matchZyConfigPresent = matchZyConfig !== null;
    const globalSavesMatch = matchZyConfig?.match(/^\s*matchzy_save_nades_as_global_enabled\s+"?([^"\s]+)"?/m);
    this.globalSavesEnabled = globalSavesMatch
      ? ["1", "true"].includes(globalSavesMatch[1].toLowerCase())
      : null;
    return liveFileStat;
  }

  async handleError(error, source) {
    this.lastError = error?.message || String(error);
    this.lastCheckAt = new Date().toISOString();
    await this.store.logAction("nades_sync", "failed", this.lastError, { source }).catch(() => {});
  }
}
