import test from "node:test";
import assert from "node:assert/strict";
import { applyPlayerNadeRequest, applyWebNadeAction } from "../src/nade-review.js";
import { mergeNadeCaptures } from "../src/nades-sync.js";
import { sanitizeNades, nadesToMatchZySavedNadesConfig, matchZySavedNadesConfigToNades } from "../src/validators.js";

const owner = "76561198000000001";
const entry = { owner, name: "window", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "0 90 0", desc: "", updatedAt: "2026-09-01T00:00:00.000Z" };
const attributes = { is_jumpthrow: true, is_crouch: false, is_walking: false, is_running: true, is_stepping: false, click_type: "both" };
const request = { id: "a".repeat(32), actor: owner, owner, name: entry.name, map: entry.map, revision: entry.updatedAt };

test("typed throw attributes and measured seconds survive capture and MatchZy export/import", () => {
  const capture = { ...entry, ...attributes, captureId: "measured", newLineup: true, landingPos: "10 20 30", flightDuration: 3.125, team: "ct", capturedAt: entry.updatedAt };
  const [nade] = mergeNadeCaptures([], [capture]);
  for (const [key, value] of Object.entries(attributes)) assert.equal(nade[key], value, key);
  assert.equal(nade.flightDuration, 3.125);
  assert.equal(nade.team, "ct");
  const [roundTrip] = matchZySavedNadesConfigToNades(nadesToMatchZySavedNadesConfig([nade]));
  for (const [key, value] of Object.entries(attributes)) assert.equal(roundTrip[key], value, key);
  assert.equal(roundTrip.flightDuration, 3.125);
});

test("existing captures update measured duration without replacing manually edited attributes", () => {
  const [updated] = mergeNadeCaptures([{ ...entry, ...attributes }], [{ ...entry, captureId: "second", landingPos: "10 20 30", flightDuration: 2.5, is_jumpthrow: false }]);
  assert.equal(updated.flightDuration, 2.5);
  assert.equal(updated.is_jumpthrow, true);
});

test("chat edits accept sides, location names, techniques and typed throw attributes", () => {
  for (const [action, value] of Object.entries({ team: "ct", throwFromTitle: "Über T-Spawn", throwToTitle: "Fenster", throwTechnique: "Zwei Schritte", ...attributes })) {
    const [updated] = applyPlayerNadeRequest([entry], { ...request, action, value });
    assert.equal(updated[action], value, action);
    assert.equal(updated.owner, owner);
  }
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "flightDuration", value: 99 }));
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "is_jumpthrow", value: "true" }));
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "click_type", value: "middle" }));
});

test("web edits accept booleans but measured flight time remains server controlled", () => {
  const [updated] = applyWebNadeAction([entry], { ...request, action: "edit", patch: attributes }, { identitySteam64: owner, role: "player" });
  for (const [key, value] of Object.entries(attributes)) assert.equal(updated[key], value);
  assert.throws(() => applyWebNadeAction([entry], { ...request, action: "edit", patch: { flightDuration: 42 } }, { identitySteam64: owner, role: "player" }));
});

test("invalid booleans, click types and durations are rejected without inventing legacy measurements", () => {
  for (const patch of [{ is_jumpthrow: "false" }, { is_crouch: 1 }, { click_type: "middle" }, { flightDuration: -1 }, { flightDuration: Infinity }, { flightDuration: "2" }]) {
    assert.throws(() => sanitizeNades([{ ...entry, ...patch }]));
  }
  assert.equal(sanitizeNades([entry])[0].flightDuration, undefined);
});

test("changing actual launch coordinates invalidates old seconds but editing location names preserves them", () => {
  const measured = { ...entry, ...attributes, flightDuration: 3.125 };
  const [named] = applyPlayerNadeRequest([measured], { ...request, action: "throwFromTitle", value: "T-Spawn" });
  assert.equal(named.flightDuration, 3.125);
  const [moved] = applyPlayerNadeRequest([measured], { ...request, action: "lineupPos", value: "4 5 6" });
  assert.equal(moved.flightDuration, undefined);
  const [rotated] = applyWebNadeAction([measured], { ...request, action: "edit", patch: { lineupAng: "0 180 0" } }, { identitySteam64: owner, role: "player" });
  assert.equal(rotated.flightDuration, undefined);
  const [unmeasured] = mergeNadeCaptures([measured], [{ ...entry, landingPos: "10 20 30", captureId: "unknown-time" }]);
  assert.equal(unmeasured.flightDuration, undefined);
});
