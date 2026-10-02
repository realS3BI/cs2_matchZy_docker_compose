import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextScheduledRestart, RestartScheduler } from "../src/restart-scheduler.js";
import { humanPlayersFromStatus } from "../src/rcon.js";
import { Store } from "../src/store.js";

const start = new Date("2026-09-03T03:00:15.000Z");
const due = "2026-09-03T05:00:15.000Z";

test("the new schedule replaces daily time with two elapsed hours", () => {
  assert.equal(nextScheduledRestart(start, { automaticRestartEnabled: true, restartTime: "05:00" }), due);
  assert.equal(nextScheduledRestart(start, { automaticRestartEnabled: false }), null);
});

test("player counts include humans and ignore bots, unknown responses stay unknown", () => {
  assert.equal(humanPlayersFromStatus("players : 2 humans, 10 bots (20 max)"), 2);
  assert.equal(humanPlayersFromStatus("players : 0 humans, 10 bots (20 max)"), 0);
  assert.equal(humanPlayersFromStatus("[Server] Players: 12 (10 bots) / 20 humans"), 2);
  assert.equal(humanPlayersFromStatus("Players: 10 (10 bots) / 20 humans"), 0);
  for (const output of ["", "Server starting", "players: 1 (2 bots)", "players: 0"]) {
    assert.equal(humanPlayersFromStatus(output), null);
  }
});

async function fixture(t, output = "players : 0 humans, 10 bots (20 max)") {
  const dir = await mkdtemp(join(tmpdir(), "restart-scheduler-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runtimeSettingsFile = join(dir, "settings.json");
  await writeFile(runtimeSettingsFile, JSON.stringify({ rconPassword: "applied-password" }));
  const state: any = {};
  const events: string[] = [];
  let enabled = true;
  let rconOutput = output;
  let restartResult = { ok: true, stdout: "restarted" };
  const store = {
    getSettings: async () => ({ automaticRestartEnabled: enabled, rconPassword: "draft-password" }),
    ensureScheduledRestart: async (nextRunAt) => { state.nextRunAt ??= nextRunAt; return { ...state }; },
    getMaintenanceState: async () => ({ ...state }),
    claimScheduledRestart: async (slot, now) => {
      if (state.nextRunAt !== slot || state.lastClaimedSlot === slot) return false;
      events.push("claim");
      Object.assign(state, { lastClaimedSlot: slot, nextRunAt: new Date(now.getTime() + 3600000).toISOString() });
      return true;
    },
    completeScheduledRestart: async (slot, result) => { events.push("complete"); Object.assign(state, result); },
    logAction: async () => { events.push("log"); }
  };
  const options = {
    store, config: { runtimeSettingsFile, serviceName: "cs2" },
    rcon: async (request) => {
      events.push("status");
      assert.equal(request.password, "applied-password");
      assert.equal(request.command, "status");
      if (rconOutput === "error") throw new Error("timeout");
      return rconOutput;
    },
    compose: { restartService: async () => { events.push("restart"); return restartResult; } }
  };
  return { scheduler: new RestartScheduler(options), options, state, events,
    disable: () => { enabled = false; },
    setOutput: (value) => { rconOutput = value; },
    failRestart: () => { restartResult = { ok: false, stdout: "failed" }; } };
}

test("first run waits two hours, empty server restarts, then waits two hours again", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.scheduler.check(start), false);
  assert.equal(f.state.nextRunAt, due);
  assert.equal(await f.scheduler.check(new Date(due)), true);
  assert.deepEqual(f.events, ["claim", "status", "restart", "complete", "log"]);
  assert.equal(f.state.nextRunAt, "2026-09-03T07:00:15.000Z");
  assert.equal(await f.scheduler.check(new Date(due)), false);
});

test("occupied server retries hourly across panel restarts until it is empty", async (t) => {
  const f = await fixture(t, "players : 2 humans, 0 bots (20 max)");
  await f.scheduler.check(start);
  assert.equal(await f.scheduler.check(new Date(due)), false);
  assert.equal(f.state.state, "skipped");
  assert.equal(f.state.nextRunAt, "2026-09-03T06:00:15.000Z");
  const resumed = new RestartScheduler(f.options);
  assert.equal(await resumed.check(new Date("2026-09-03T05:59:59Z")), false);
  await resumed.check(new Date(f.state.nextRunAt));
  assert.equal(f.state.nextRunAt, "2026-09-03T07:00:15.000Z");
  assert.equal(f.events.includes("restart"), false);
  f.setOutput("players : 0 humans, 0 bots (20 max)");
  assert.equal(await resumed.check(new Date(f.state.nextRunAt)), true);
  assert.equal(f.state.nextRunAt, "2026-09-03T09:00:15.000Z");
});

for (const output of ["error", "unrecognized status"]) {
  test(`failed player check (${output}) defers an hour without restarting`, async (t) => {
    const f = await fixture(t, output);
    await f.scheduler.check(start);
    assert.equal(await f.scheduler.check(new Date(due)), false);
    assert.equal(f.state.nextRunAt, "2026-09-03T06:00:15.000Z");
    assert.equal(f.events.includes("restart"), false);
  });
}

test("failed restart retries in one hour", async (t) => {
  const f = await fixture(t);
  f.failRestart();
  await f.scheduler.check(start);
  assert.equal(await f.scheduler.check(new Date(due)), false);
  assert.equal(f.state.nextRunAt, "2026-09-03T06:00:15.000Z");
});

test("disabled scheduler does not claim or check players", async (t) => {
  const f = await fixture(t);
  f.disable();
  assert.equal(await f.scheduler.check(start), false);
  assert.equal((await f.scheduler.status()).nextRunAt, null);
  assert.deepEqual(f.events, []);
});

test("two panel instances claim an overdue run only once", async (t) => {
  const f = await fixture(t);
  await f.scheduler.check(start);
  const other = new RestartScheduler(f.options);
  await Promise.all([f.scheduler.check(new Date("2026-09-03T05:05:00Z")), other.check(new Date("2026-09-03T05:05:00Z"))]);
  assert.equal(f.events.filter(e => e === "restart").length, 1);
});

test("MongoDB claim atomically checks the scheduled time and advances crash recovery", async () => {
  const store = new Store({ mongodbUri: "mongodb://127.0.0.1:27017/test" });
  store.maintenance = { findOneAndUpdate: async (filter, update) => {
    assert.equal(filter.nextRunAt, due);
    assert.equal(filter.lastClaimedSlot.$ne, due);
    assert.equal(update.$set.nextRunAt, "2026-09-03T06:00:15.000Z");
    return { _id: "scheduled-restart" };
  } } as any;
  assert.equal(await store.claimScheduledRestart(due, new Date(due)), true);
});
