import test from "node:test";
import assert from "node:assert/strict";
import { lineupId, lineupKey, lineupPath, findLineup } from "../client/src/lib/lineups.js";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";

test("lineup links survive display renames and distinguish owner, map and internal name", () => {
  const nade = { owner: "76561198000000001", map: "de_mirage", name: "Fenster über T-Spawn", displayName: "Window" };
  const renamed = { ...nade, displayName: "Fenster" };
  assert.equal(lineupId(nade), lineupId(renamed));
  assert.match(lineupId(nade), /^[A-Za-z0-9_-]+$/);
  assert.equal(findLineup([renamed], lineupId(nade)), renamed);
  assert.equal(findLineup([nade], "invalid"), undefined);
  for (const change of [{ owner: "default" }, { map: "de_nuke" }, { name: "Window" }]) {
    assert.notEqual(lineupId(nade), lineupId({ ...nade, ...change }));
    assert.notEqual(lineupKey(nade), lineupKey({ ...nade, ...change }));
  }
  assert.match(lineupPath(ACTIVE_DUTY_MAPS[0], nade), /^\/maps\/mirage\/lineups\/[A-Za-z0-9_-]+$/);
});
