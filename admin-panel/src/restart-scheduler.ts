import { normalizeSettings } from "./policy.js";

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function slotForSettings(date, settings) {
  const parts = localParts(date, settings.restartTimezone);
  const localTime = `${parts.hour}:${parts.minute}`;
  if (!settings.automaticRestartEnabled || localTime !== settings.restartTime) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${localTime}@${settings.restartTimezone}`;
}

export function scheduledSlot(date, settings) {
  return slotForSettings(date, normalizeSettings(settings));
}

export function nextScheduledRestart(now, settings) {
  const normalized = normalizeSettings(settings);
  if (!normalized.automaticRestartEnabled) return null;
  const cursor = new Date(now);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  for (let minute = 0; minute < 60 * 49; minute += 1) {
    if (slotForSettings(cursor, normalized)) return cursor.toISOString();
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

export class RestartScheduler {
  store: any;
  compose: any;
  intervalMs: number;
  timer: NodeJS.Timeout | null = null;
  checking = false;

  constructor({ store, compose, intervalMs = 30000 }) {
    this.store = store;
    this.compose = compose;
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check(), this.intervalMs);
    this.timer.unref?.();
    void this.check();
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
      const slot = scheduledSlot(now, settings);
      if (!slot || !(await this.store.claimScheduledRestart(slot))) return false;

      const result = await this.compose.restartService();
      const message = `${result.stdout || ""}\n${result.stderr || ""}`.trim() || (result.ok ? "Scheduled restart completed" : "Scheduled restart failed");
      await this.store.completeScheduledRestart(slot, { ok: result.ok, message });
      await this.store.logAction("scheduled_restart", result.ok ? "success" : "failed", message, { slot, code: result.code });
      return result.ok;
    } finally {
      this.checking = false;
    }
  }

  async status() {
    const [settings, lastRun] = await Promise.all([this.store.getSettings(), this.store.getMaintenanceState()]);
    const normalized = normalizeSettings(settings);
    return {
      enabled: normalized.automaticRestartEnabled,
      time: normalized.restartTime,
      timezone: normalized.restartTimezone,
      nextRunAt: nextScheduledRestart(new Date(), normalized),
      lastRun
    };
  }
}
