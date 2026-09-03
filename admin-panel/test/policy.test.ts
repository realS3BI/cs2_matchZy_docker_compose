import test from "node:test";
import assert from "node:assert/strict";
import { buildControlModel, normalizeSettings, SETTING_KEYS, validateRunnableSettings, validateSettings } from "../src/policy.js";

test("normalizeSettings keeps one explicit server mode", () => {
  const settings = normalizeSettings({ serverMode: "executes" });
  assert.equal(settings.serverMode, "executes");
});

test("warmup uses the dedicated Workshop map without a mode plugin", () => {
  const model: any = buildControlModel({ serverMode: "warmup" });
  assert.equal(model.mode.id, "warmup");
  assert.equal(model.plugins.some((plugin) => plugin.id === "warmup"), false);
});

test("nades is a MatchZy-backed server mode", () => {
  const model: any = buildControlModel({ serverMode: "nades" });
  assert.equal(model.mode.id, "nades");
  assert.equal(model.plugins[0].id, "nades");
  assert.ok(model.plugins[0].dependencies.includes("CounterStrikeSharp"));
});

test("normalizeSettings drops fields outside the application schema", () => {
  const settings: any = normalizeSettings({ serverMode: "matchzy", unknownSetting: "value" });
  assert.equal(settings.unknownSetting, undefined);
});

test("new installations receive complete typed defaults", () => {
  const settings = normalizeSettings({});
  for (const key of SETTING_KEYS) assert.ok(Object.prototype.hasOwnProperty.call(settings, key), `missing default for ${key}`);
  assert.equal(settings.schemaVersion, 1);
  assert.equal(settings.steamToken, "");
  assert.equal(settings.rconPassword, "");
  assert.equal(settings.matchZyVersion, "latest");
  assert.equal(settings.maxPlayers, 10);
  assert.equal(settings.fakeRconEnabled, false);
});

test("control model reports installed dependency chains", () => {
  const model: any = buildControlModel({ serverMode: "matchzy", weaponPaintsEnabled: true });
  const weaponPaints = model.plugins.find((plugin) => plugin.id === "weaponpaints");
  assert.equal(weaponPaints.enabled, true);
  assert.ok(weaponPaints.dependencies.includes("MySQL"));
  assert.match(weaponPaints.warning, /GSLT/);
});

test("save validation rejects invalid mode and maintenance settings", () => {
  assert.throws(() => validateSettings({ serverMode: "both" }), /Server mode/);
  assert.throws(() => validateSettings({ restartTime: "25:00" }), /HH:mm/);
  assert.throws(() => validateSettings({ restartTimezone: "Vienna" }), /IANA/);
  assert.throws(() => validateSettings({ maxPlayers: 0 }), /between 1 and 64/);
  assert.throws(() => validateSettings({ fakeRconEnabled: "true" }), /must be a boolean/);
});

test("apply validation requires platform-managed Steam and RCON secrets", () => {
  assert.throws(() => validateRunnableSettings({ steamToken: "", rconPassword: "secret" }), /Steam Game Server Login Token/);
  assert.throws(() => validateRunnableSettings({ steamToken: "token", rconPassword: "" }), /RCON password/);
  assert.doesNotThrow(() => validateRunnableSettings({ steamToken: "token", rconPassword: "secret" }));
});
