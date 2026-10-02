import { readFile } from "node:fs/promises";
import { normalizeSettings } from "./policy.js";
import { executeRcon, humanPlayersFromStatus } from "./rcon.js";

const HOUR_MS = 60 * 60 * 1000;

export function nextScheduledRestart(now, settings) {
  return normalizeSettings(settings).automaticRestartEnabled
    ? new Date(new Date(now).getTime() + 2 * HOUR_MS).toISOString() : null;
}

export class RestartScheduler {
  store: any;
  compose: any;
  config: any;
  rcon: typeof executeRcon;
  intervalMs: number;
  timer: NodeJS.Timeout | null = null;
  checking = false;

  constructor({ store, compose, config, rcon = executeRcon, intervalMs = 30000 }) {
    this.store = store;
    this.compose = compose;
    this.config = config;
    this.rcon = rcon;
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check().catch(console.error), this.intervalMs);
    this.timer.unref?.();
    void this.check().catch(console.error);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(now = new Date()) {
    if (this.checking) return false;
    this.checking = true;
    try {
      const settings = await this.store.getSettings();
      const initialRun = nextScheduledRestart(now, settings);
      if (!initialRun) return false;
      const state = await this.store.ensureScheduledRestart(initialRun);
      const slot = state.nextRunAt;
      if (new Date(slot) > now || !(await this.store.claimScheduledRestart(slot, now))) return false;

      let result;
      try {
        const applied = JSON.parse(await readFile(this.config.runtimeSettingsFile, "utf8"));
        if (!applied.rconPassword) throw new Error("Kein angewendetes RCON-Passwort vorhanden.");
        const output = await this.rcon({ host: this.config.serviceName || "cs2", password: applied.rconPassword, command: "status" });
        const players = humanPlayersFromStatus(output);
        if (players === null) throw new Error("Die Spielerzahl konnte nicht erkannt werden.");
        if (players > 0) {
          result = { ok: false, state: "skipped", message: `Neustart verschoben: ${players} Spieler verbunden. Neuer Versuch in einer Stunde.` };
        } else {
          const restart = await this.compose.restartService();
          result = { ...restart, message: `${restart.stdout || ""}\n${restart.stderr || ""}`.trim() || (restart.ok ? "Geplanter Neustart abgeschlossen." : "Geplanter Neustart fehlgeschlagen.") };
        }
      } catch {
        result = { ok: false, message: "Spielerprüfung oder Neustart fehlgeschlagen. Neuer Versuch in einer Stunde." };
      }
      const nextRunAt = new Date(now.getTime() + (result.ok ? 2 : 1) * HOUR_MS).toISOString();
      await this.store.completeScheduledRestart(slot, { ...result, nextRunAt });
      await this.store.logAction("scheduled_restart", result.state || (result.ok ? "success" : "failed"), result.message, { slot, nextRunAt, code: result.code });
      return result.ok;
    } finally {
      this.checking = false;
    }
  }

  async status() {
    const settings = await this.store.getSettings();
    const next = nextScheduledRestart(new Date(), settings);
    const lastRun = next ? await this.store.ensureScheduledRestart(next) : await this.store.getMaintenanceState();
    return { enabled: Boolean(next), intervalHours: 2, retryHours: 1, nextRunAt: next ? lastRun.nextRunAt : null, lastRun };
  }
}
