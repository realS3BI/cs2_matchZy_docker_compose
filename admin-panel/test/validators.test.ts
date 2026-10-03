import { assignNadeIds } from "../src/nade-ids.js";
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
    { name: "", identitySteam64: "76561198000000001", role: "player", flags: [] }
  ]);
});

test("adminsToCssConfig builds CounterStrikeSharp config", () => {
  assert.deepEqual(adminsToCssConfig([{ identitySteam64: "76561198000000001", role: "admin", flags: ["@css/root"] }]), {
    "76561198000000001": {
      identity: "76561198000000001",
      flags: ["@css/root"]
    }
  });
});

test("adminsToMatchZyConfig keeps the MatchZy admin file empty", () => {
  assert.deepEqual(adminsToMatchZyConfig([{ identitySteam64: "76561198000000001", flags: ["@css/root"] }]), {});
});

test("sanitizeAdmins derives permissions from the selected role", () => {
  const [entry]: any = sanitizeAdmins([{ identitySteam64: "76561198000000001", role: "match_admin", flags: ["@css/root"] }]);
  assert.deepEqual(entry.flags, ["@css/config", "@custom/prac", "@css/map", "@css/chat", "@css/rcon", "@matchzy/control"]);
});

test("custom admins cannot silently escalate from an empty permission list", () => {
  assert.throws(() => sanitizeAdmins([{ identitySteam64: "76561198000000001", role: "custom", flags: [] }]), /Ungültige Rolle/);
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
    id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
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
    id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
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
        Id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
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
        Id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
        LineupPos: "1 2 3",
        LineupAng: "4 5 6",
        Desc: "from T roof",
        Map: "de_mirage",
        Type: "Smoke"
      }
    }
  });

  assert.deepEqual(entries.map(({ updatedAt, ...entry }) => entry), [{
    id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
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
    Id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
    LineupPos: "1 2 3",
    LineupAng: "4 5 6",
    Desc: "from T roof",
    Map: "de_mirage",
    Type: ""
  });
});

test("radar floor corrections survive validation and reject invalid levels", () => {
  const entry = { owner: "player", name: "test", map: "de_nuke", type: "Smoke", lineupPos: "1 2 3", lineupAng: "4 5 6",
    radarFrom: { x: .2, y: .3, level: "upper" }, radarTo: { x: .4, y: .5, level: "lower" } };
  const [saved] = sanitizeNades([entry]);
  assert.deepEqual(saved.radarFrom, entry.radarFrom);
  assert.deepEqual(saved.radarTo, entry.radarTo);
  assert.throws(() => sanitizeNades([{ ...entry, radarTo: { ...entry.radarTo, level: "invalid" } }]), /Kartenebene/);
});

test("effect coordinates export as strings while panel radar metadata is omitted", () => {
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
    Id: assignNadeIds([{ owner: "default", map: "de_mirage", name: "window_smoke" }])[0].id,
    LineupPos: "1 2 3",
    LineupAng: "4 5 6",
    Desc: "from T roof",
    Map: "de_mirage",
    Type: "Smoke",
    LandingPos: "7 8 9"
  });
  assert.throws(() => nadesToMatchZySavedNadesConfig([{
    name: "bad",
    map: "de_mirage",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    radarFrom: { x: 1.2, y: 0.4 }
  }]), /between 0 and 1/);
});
test("display names change presentation without changing IDs or MatchZy keys", () => {
  const original = { id: "Ab1Cd2E", owner: "default", name: "window_smoke", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "4 5 6" };
  const [entry] = sanitizeNades([{ ...original, displayName: "  Fenster / T-Spawn – schön  " }]);
  assert.equal(entry.id, original.id);
  assert.equal(entry.name, original.name);
  assert.equal(entry.displayName, "Fenster / T-Spawn – schön");
  const config: any = nadesToMatchZySavedNadesConfig([entry]);
  assert.deepEqual(Object.keys(config.default), ["window_smoke"]);
  assert.equal(matchZySavedNadesConfigToNades(config)[0].displayName, entry.displayName);
  assert.throws(() => sanitizeNades([{ ...original, displayName: "bad\nname" }]), /Display name/);
  assert.throws(() => sanitizeNades([{ ...original, displayName: "x".repeat(121) }]), /Display name/);
});

test("Must Know round-trips as a strict boolean without changing lineup identity", () => {
  const original = { owner: "default", name: "window_smoke", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "4 5 6" };
  for (const mustKnow of [true, false]) {
    const [entry] = sanitizeNades([{ ...original, mustKnow }]);
    const config: any = nadesToMatchZySavedNadesConfig([entry]);
    assert.equal(config.default.window_smoke.MustKnow, mustKnow);
    const [imported] = matchZySavedNadesConfigToNades(config);
    assert.equal(imported.mustKnow, mustKnow);
    assert.equal(imported.id, entry.id);
  }
  assert.equal(sanitizeNades([original])[0].mustKnow, undefined);
  for (const mustKnow of ["false", "true", 1, null])
    assert.throws(() => sanitizeNades([{ ...original, mustKnow }]), /Must Know must be a boolean/);
});
