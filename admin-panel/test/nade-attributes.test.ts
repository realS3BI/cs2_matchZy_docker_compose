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

test("training captures cannot replace any saved measured data", () => {
  const measured = { ...entry, ...attributes, flightDuration: 3.125, landingPos: "7 8 9", captureId: "first" };
  assert.deepEqual(mergeNadeCaptures([measured], [{ ...entry, ...attributes, captureId: "second", landingPos: "10 20 30", flightDuration: 2.5 }]), [measured]);
});

test("only side and position labels can be changed through chat or the web", () => {
  const measured = { ...entry, ...attributes, flightDuration: 3.125, landingPos: "7 8 9" };
  const actor = { identitySteam64: owner, role: "player" };
  for (const [action, value] of Object.entries({ team: "ct", throwFromTitle: "Über T-Spawn", throwToTitle: "Fenster" })) {
    const [game] = applyPlayerNadeRequest([measured], { ...request, action, value });
    const [web] = applyWebNadeAction([measured], { ...request, action: "edit", patch: { [action]: value } }, actor);
    for (const updated of [game, web]) {
      assert.equal(updated[action], value);
      assert.equal(updated.flightDuration, 3.125);
      assert.equal(updated.landingPos, measured.landingPos);
      for (const key of Object.keys(attributes)) assert.equal(updated[key], measured[key]);
    }
  }
  for (const [action, value] of Object.entries({ flightDuration: 2.5, lineupPos: "4 5 6", lineupAng: "0 180 0", landingPos: "10 20 30", type: "Flash", movement: "walk", displayName: "New", desc: "Changed", ...attributes })) {
    assert.throws(() => applyPlayerNadeRequest([measured], { ...request, action, value }), action);
    assert.throws(() => applyWebNadeAction([measured], { ...request, action: "edit", patch: { [action]: value } }, actor), action);
  }
  for (const value of [null, 0, 3.125, -1, Infinity, NaN, "2"])
    assert.throws(() => applyWebNadeAction([measured], { ...request, action: "edit", patch: { flightDuration: value } }, actor));
});

test("explicit measured replacements atomically replace throw data, clear obsolete media and preserve metadata", () => {
  const measured = { ...entry, ...attributes, flightDuration: 3.125, landingPos: "7 8 9", captureId: "first",
    team: "ct", throwFromTitle: "CT-Spawn", throwToTitle: "Fenster", reviewStatus: "pending",
    radarFrom: { x: .2, y: .3 }, radarTo: { x: .4, y: .5 } };
  const capture = { ...entry, ...attributes, newLineup: false, editRevision: entry.updatedAt,
    captureId: "replacement", lineupPos: "4 5 6", lineupAng: "0 100 0", landingPos: "10 20 30", flightDuration: 2.5,
    is_jumpthrow: false, team: "t", throwTechnique: "Stand", throwTrace: "[]" };
  const [updated] = applyPlayerNadeRequest([measured], { ...request, action: "replace", value: capture });
  assert.equal(updated.flightDuration, 2.5);
  assert.equal(updated.lineupPos, capture.lineupPos);
  assert.equal(updated.lineupAng, capture.lineupAng);
  assert.equal(updated.landingPos, capture.landingPos);
  assert.equal(updated.is_jumpthrow, false);
  assert.equal(updated.desc, "Stand");
  assert.equal(updated.team, "ct");
  assert.equal(updated.throwFromTitle, measured.throwFromTitle);
  assert.equal(updated.reviewStatus, "");
  assert.equal(updated.radarFrom, undefined);
  assert.equal(updated.radarTo, undefined);
  assert.deepEqual(updated.lineupImages, []);
  assert.notEqual(updated.updatedAt, entry.updatedAt);
  const [merged] = mergeNadeCaptures([measured], [capture]);
  assert.deepEqual({ ...merged, updatedAt: undefined }, { ...updated, updatedAt: undefined });
  for (const patch of [{ editRevision: "stale" }, { captureId: "first" }, { flightDuration: null }, { flightDuration: -1 },
    { landingPos: "NaN 0 0" }, { owner: "default" }, { map: "de_anubis" }, { name: "other" }, { is_crouch: undefined }, { newLineup: true }]) {
    assert.throws(() => applyPlayerNadeRequest([measured], { ...request, action: "replace", value: { ...capture, ...patch } }));
    assert.deepEqual(mergeNadeCaptures([measured], [{ ...capture, ...patch }]), [measured]);
  }
  assert.throws(() => applyPlayerNadeRequest([{ ...measured, official: true }], { ...request, action: "replace", value: capture }));
  assert.throws(() => applyPlayerNadeRequest([measured], { ...request, action: "replace", actor: "76561198000000002", value: capture }));
});

test("new recordings require a measured duration and valid end coordinates", () => {
  const capture = { ...entry, ...attributes, newLineup: true, captureId: "first", landingPos: "10 20 30", flightDuration: 2.5 };
  for (const patch of [{ flightDuration: undefined }, { flightDuration: null }, { flightDuration: -1 }, { flightDuration: Infinity }, { landingPos: "" }, { landingPos: "NaN 0 0" }, { is_crouch: undefined }, { click_type: null }])
    assert.deepEqual(mergeNadeCaptures([], [{ ...capture, ...patch }]), []);
  assert.equal(mergeNadeCaptures([], [capture]).length, 1);
});

test("invalid booleans, click types and durations are rejected without inventing legacy measurements", () => {
  for (const patch of [{ is_jumpthrow: "false" }, { is_crouch: 1 }, { click_type: "middle" }, { flightDuration: -1 }, { flightDuration: Infinity }, { flightDuration: "2" }]) {
    assert.throws(() => sanitizeNades([{ ...entry, ...patch }]));
  }
  assert.equal(sanitizeNades([entry])[0].flightDuration, undefined);
});
