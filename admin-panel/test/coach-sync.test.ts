import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncCoachOutbox } from "../src/coach-sync.js";

function session() {
  return {
    schemaVersion: 1, id: "0123456789abcdef0123456789abcdef", steamId: "76561198000000001", playerName: "Player", focus: "mechanics", map: "de_mirage",
    startedAt: "2026-09-06T10:00:00.000Z", endedAt: "2026-09-06T10:20:00.000Z", durationSeconds: 1200, endReason: "player_finished",
    rounds: 5, shots: 100, shotsHit: 40, shotAccuracy: 0.4, shotsWhileMoving: 10, movingShotRate: 0.1, burstCount: 30,
    averageBurstLength: 3.3, longBursts: 1, kills: 20, firearmKills: 18, headshots: 12, headshotRate: 0.6, deaths: 5, damage: 2100,
    openingKills: 3, openingDeaths: 1, tradeKills: 2, deathsTraded: 2, grenadesThrown: 4, utilityDamage: 80,
    enemiesFlashed: 3, enemyFlashSeconds: 5.4, teammatesFlashed: 0, teamFlashSeconds: 0, timeToKillSamples: 12,
    averageTimeToKillMs: 410, notes: [], feedback: []
  };
}

test("syncCoachOutbox imports valid reports and isolates corrupt files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "matchzy-coach-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "valid.json"), JSON.stringify(session()));
  await writeFile(join(directory, "invalid.json"), "not-json");
  let imported = [];
  const result = await syncCoachOutbox({ directory, store: { importCoachSessions: async (sessions) => { imported = sessions; return sessions.length; } } });
  assert.deepEqual(result, { found: 2, imported: 1, invalid: 1 });
  assert.equal(imported[0].steamId, "76561198000000001");
});

test("syncCoachOutbox treats a missing plugin directory as empty", async () => {
  const directory = join(tmpdir(), `missing-coach-${Date.now()}`, "outbox");
  const result = await syncCoachOutbox({ directory, store: { importCoachSessions: async () => 0 } });
  assert.deepEqual(result, { found: 0, imported: 0, invalid: 0 });
});
