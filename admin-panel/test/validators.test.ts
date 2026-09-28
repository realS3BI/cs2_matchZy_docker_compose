import test from "node:test";
import assert from "node:assert/strict";
import {
  adminsToCssConfig,
  adminsToMatchZyConfig,
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeAdmins,
  sanitizeSettings,
  sanitizeNades
} from "../src/validators.js";

test("sanitizeSettings rejects fields outside the application schema", () => {
  assert.throws(() => sanitizeSettings(undefined), /must be an object/);
  assert.throws(() => sanitizeSettings({ unknownSetting: "value" }), /Unknown setting/);
});

test("sanitizeAdmins validates steam ids and defaults flags", () => {
  assert.deepEqual(sanitizeAdmins([{ identitySteam64: "76561198000000001" }]), [
    { name: "", identitySteam64: "76561198000000001", role: "owner", flags: ["@css/root"] }
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

test("adminsToMatchZyConfig keeps the MatchZy admin file empty", () => {
  assert.deepEqual(adminsToMatchZyConfig([{ identitySteam64: "76561198000000001", flags: ["@css/root"] }]), {});
});

test("sanitizeAdmins derives permissions from the selected role", () => {
  const [entry]: any = sanitizeAdmins([{ identitySteam64: "76561198000000001", role: "match_operator", flags: ["@css/root"] }]);
  assert.deepEqual(entry.flags, ["@css/config", "@custom/prac", "@css/map", "@css/chat"]);
});

test("custom admins cannot silently escalate from an empty permission list", () => {
  assert.throws(() => sanitizeAdmins([{ identitySteam64: "76561198000000001", role: "custom", flags: [] }]), /at least one permission/);
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
    lineupImages: [],
    owner: "default"
  }]);
});

test("sanitizeNades accepts lineup images", () => {
  assert.deepEqual(sanitizeNades([{
    name: "window_smoke",
    map: "de_mirage",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    lineupImages: [{
      key: "abc123",
      url: "https://example.com/image.jpg",
      name: "image.jpg",
      size: 1234,
      uploadedAt: "2026-05-15T00:00:00.000Z"
    }]
  }]).map(({ updatedAt, ...entry }) => entry), [{
    id: "default-de_mirage-window_smoke",
    name: "window_smoke",
    map: "de_mirage",
    type: "",
    desc: "",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    lineupImages: [{
      key: "abc123",
      url: "https://example.com/image.jpg",
      name: "image.jpg",
      size: 1234,
      uploadedAt: "2026-05-15T00:00:00.000Z"
    }],
    owner: "default"
  }]);
});

test("sanitizeNades rejects invalid entries", () => {
  assert.throws(() => sanitizeNades([{ name: "", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3" }]), /Nade name is required/);
  assert.throws(() => sanitizeNades([{ name: "bad/name", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3" }]), /Invalid nade name/);
  assert.throws(() => sanitizeNades([{ name: "a", map: "de_mirage", lineupPos: "1 2", lineupAng: "1 2 3" }]), /Lineup position/);
  assert.throws(() => sanitizeNades([{ name: "a", map: "de_mirage", lineupPos: "1 2 3", lineupAng: "1 2 3", lineupImages: [{ key: "x", url: "ftp://example.com/a.jpg", name: "a.jpg", size: 1 }] }]), /Lineup image URL/);
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
    lineupImages: [],
    owner: "default"
  }]);
});

test("nadesToMatchZySavedNadesConfig omits lineup images", () => {
  const config: any = nadesToMatchZySavedNadesConfig([{
    name: "window_smoke",
    map: "de_mirage",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    lineupImages: [{
      key: "abc123",
      url: "https://example.com/image.jpg",
      name: "image.jpg",
      size: 1234
    }]
  }]);

  assert.equal(config.default.window_smoke.LineupImages, undefined);
  assert.deepEqual(config.default.window_smoke, {
    LineupPos: "1 2 3",
    LineupAng: "4 5 6",
    Desc: "from T roof",
    Map: "de_mirage",
    Type: ""
  });
});

test("panel radar metadata is validated and omitted from MatchZy output", () => {
  const config: any = nadesToMatchZySavedNadesConfig([{
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    landingPos: "7 8 9",
    throwFromTitle: "T Spawn",
    throwToTitle: "Window",
    radarFrom: { x: 0.72, y: 0.18 },
    radarTo: { x: 0.43, y: 0.49 }
  }]);

  assert.deepEqual(config.default.window_smoke, {
    LineupPos: "1 2 3",
    LineupAng: "4 5 6",
    Desc: "from T roof",
    Map: "de_mirage",
    Type: "Smoke"
  });
  assert.throws(() => nadesToMatchZySavedNadesConfig([{
    name: "bad",
    map: "de_mirage",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    radarFrom: { x: 1.2, y: 0.4 }
  }]), /between 0 and 1/);
});
