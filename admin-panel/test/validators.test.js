import test from "node:test";
import assert from "node:assert/strict";
import {
  adminsToCssConfig,
  adminsToMatchZyConfig,
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeAdmins,
  sanitizeEnv,
  sanitizeNades
} from "../src/validators.js";

test("sanitizeEnv rejects unsafe keys", () => {
  assert.throws(() => sanitizeEnv({ "BAD-KEY": "1" }), /Invalid env key/);
});

test("sanitizeAdmins validates steam ids and defaults flags", () => {
  assert.deepEqual(sanitizeAdmins([{ identitySteam64: "76561198000000001" }]), [
    { name: "", identitySteam64: "76561198000000001", flags: ["@css/root"] }
  ]);
});

test("adminsToCssConfig builds CounterStrikeSharp config", () => {
  assert.deepEqual(adminsToCssConfig([{ identitySteam64: "76561198000000001", flags: ["@css/map"] }]), {
    "76561198000000001": {
      identity: "76561198000000001",
      flags: ["@css/map"]
    }
  });
});

test("adminsToMatchZyConfig derives MatchZy admin ids", () => {
  assert.deepEqual(adminsToMatchZyConfig([{ identitySteam64: "76561198000000001", flags: ["@css/root"] }]), {
    "76561198000000001": ""
  });
});

test("sanitizeNades validates and defaults owner", () => {
  assert.deepEqual(sanitizeNades([{
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6"
  }]).map(({ updatedAt, ...entry }) => entry), [{
    id: "default-de_mirage-window_smoke",
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    owner: "default"
  }]);
});

test("sanitizeNades rejects invalid entries", () => {
  assert.throws(() => sanitizeNades([{ name: "", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3" }]), /Nade name is required/);
  assert.throws(() => sanitizeNades([{ name: "bad/name", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3" }]), /Invalid nade name/);
  assert.throws(() => sanitizeNades([{ name: "a", map: "de_mirage", lineupPos: "1 2", lineupAng: "1 2 3" }]), /Lineup position/);
  assert.throws(() => sanitizeNades([
    { name: "a", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3" },
    { name: "a", map: "de_mirage", lineupPos: "4 5 6", lineupAng: "4 5 6" }
  ]), /Duplicate nade/);
});

test("nadesToMatchZySavedNadesConfig builds MatchZy savednades.json", () => {
  assert.deepEqual(nadesToMatchZySavedNadesConfig([{
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6"
  }]), {
    default: {
      window_smoke: {
        LineupPos: "1 2 3",
        LineupAng: "4 5 6",
        Desc: "from T roof",
        Map: "de_mirage",
        Type: "Smoke"
      }
    }
  });
});

test("matchZySavedNadesConfigToNades imports MatchZy savednades.json", () => {
  const entries = matchZySavedNadesConfigToNades({
    default: {
      window_smoke: {
        LineupPos: "1 2 3",
        LineupAng: "4 5 6",
        Desc: "from T roof",
        Map: "de_mirage",
        Type: "Smoke"
      }
    }
  });

  assert.deepEqual(entries.map(({ updatedAt, ...entry }) => entry), [{
    id: "default-de_mirage-window_smoke",
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    owner: "default"
  }]);
});
