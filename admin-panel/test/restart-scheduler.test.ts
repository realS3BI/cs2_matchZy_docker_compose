import test from "node:test";
import assert from "node:assert/strict";
import { nextScheduledRestart, RestartScheduler, scheduledSlot } from "../src/restart-scheduler.js";

test("scheduledSlot follows the configured IANA timezone", () => {
  const settings = { AUTO_RESTART_ENABLED: "1", AUTO_RESTART_TIME: "05:00", AUTO_RESTART_TIMEZONE: "Europe/Vienna" };
  assert.equal(scheduledSlot(new Date("2026-09-03T03:00:15.000Z"), settings), "2026-09-03T05:00@Europe/Vienna");
  assert.equal(nextScheduledRestart(new Date("2026-09-03T02:59:15.000Z"), settings), "2026-09-03T03:00:00.000Z");
});

test("scheduler claims a daily slot before restarting", async () => {
  const events: string[] = [];
  const scheduler = new RestartScheduler({
    store: {
      getSettings: async () => ({ AUTO_RESTART_ENABLED: "1", AUTO_RESTART_TIME: "05:00", AUTO_RESTART_TIMEZONE: "Europe/Vienna" }),
      claimScheduledRestart: async (slot) => { events.push(`claim:${slot}`); return true; },
      completeScheduledRestart: async (slot) => events.push(`complete:${slot}`),
      logAction: async (type) => events.push(`log:${type}`)
    },
    compose: { restartService: async () => { events.push("restart"); return { ok: true, stdout: "restarted" }; } }
  });
  assert.equal(await scheduler.check(new Date("2026-09-03T03:00:15.000Z")), true);
  assert.deepEqual(events.map((event) => event.split(":")[0]), ["claim", "restart", "complete", "log"]);
});
