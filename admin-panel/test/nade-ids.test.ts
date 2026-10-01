import test from "node:test";
import assert from "node:assert/strict";
import { assignNadeIds } from "../src/nade-ids.js";
import { Store } from "../src/store.js";
import { findLineup, legacyLineupId, lineupPath } from "../client/src/lib/lineups.js";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";
import { findRadarGroup } from "../client/src/lib/radar-groups.js";
import { sanitizeNades, nadesToMatchZySavedNadesConfig, matchZySavedNadesConfigToNades } from "../src/validators.js";

const sample = { owner: "default", map: "de_mirage", name: "Fenster über T-Spawn", type: "Smoke", lineupPos: "1 2 3", lineupAng: "0 90 0", desc: "", flightDuration: 2.4 };

test("short IDs are unique, repeatable and preserve existing IDs even on collision", () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({ ...sample, name: `nade_${i}`, id: "old-long-id" }));
  const migrated = assignNadeIds(entries);
  assert.ok(migrated.every(entry => /^[A-Za-z0-9]{7}$/.test(entry.id)));
  assert.equal(new Set(migrated.map(entry => entry.id)).size, entries.length);
  assert.deepEqual(assignNadeIds(entries), migrated);
  assert.deepEqual(assignNadeIds(migrated), migrated);
  const collision = assignNadeIds([{ ...sample }, { ...sample, name: "other", id: assignNadeIds([sample])[0].id }]);
  assert.notEqual(collision[0].id, collision[1].id);
  assert.equal(collision[1].id, assignNadeIds([sample])[0].id);
  const duplicates = assignNadeIds([{ ...sample, id: "Ab1Cd2E" }, { ...sample, name: "other", id: "Ab1Cd2E" }]);
  assert.equal(duplicates[0].id, "Ab1Cd2E");
  assert.notEqual(duplicates[1].id, "Ab1Cd2E");
});

test("short URLs and old detail and radar URLs resolve the same migrated recording", () => {
  const [entry] = assignNadeIds([sample]);
  assert.equal(lineupPath(ACTIVE_DUTY_MAPS[0], entry), `/maps/mirage/lineups/${entry.id}`);
  assert.equal(findLineup([entry], entry.id), entry);
  assert.equal(findLineup([entry], legacyLineupId(sample)), entry);
  const group = { id: entry.id!, nades: [entry], point: { x: 0.1, y: 0.2 }, title: "Fenster" };
  assert.equal(findRadarGroup([group], legacyLineupId(sample)), group);
  assert.equal(assignNadeIds([{ ...entry, name: "renamed" }])[0].id, entry.id);
});

test("IDs survive game export/import and validation", () => {
  const [entry] = sanitizeNades([{ ...sample, id: "Ab1Cd2E" }]);
  const imported = matchZySavedNadesConfigToNades(nadesToMatchZySavedNadesConfig([entry]));
  assert.equal(imported[0].id, entry.id);
  assert.equal(imported[0].flightDuration, 2.4);
});

test("database migration backs up original records, preserves metadata and is idempotent", async () => {
  const original = [{ ...sample, id: "old-long-id", official: true, radarFrom: { x: 0.2, y: 0.3 }, updatedAt: "2026-01-01" }];
  let current: any = { _id: "current", entries: original, updatedAt: "unchanged" };
  let backup: any;
  let writes = 0;
  const store = Object.create(Store.prototype) as Store;
  store.nades = {
    findOne: async () => current,
    updateOne: async (filter, update) => {
      writes++;
      if (filter._id === "before-short-ids-v1") backup ??= structuredClone(update.$setOnInsert);
      else {
        assert.deepEqual(filter.entries, current.entries);
        current = { ...current, ...update.$set };
      }
      return { matchedCount: 1 };
    }
  } as any;
  await store.migrateNadeIds();
  assert.deepEqual(backup.entries, original);
  assert.deepEqual(current.entries.map(({ id, ...rest }) => rest), original.map(({ id, ...rest }) => rest));
  assert.equal(current.updatedAt, "unchanged");
  assert.match(current.entries[0].id, /^[A-Za-z0-9]{7}$/);
  await store.migrateNadeIds();
  assert.equal(writes, 2);
});
