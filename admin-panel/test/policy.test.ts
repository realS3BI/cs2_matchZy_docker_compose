import test from "node:test";
import assert from "node:assert/strict";
import { buildControlModel, normalizeServerSettings, validateServerSettings } from "../src/policy.js";

test("normalizeServerSettings makes MatchZy and Executes mutually exclusive", () => {
  const settings = normalizeServerSettings({ SERVER_MODE: "executes", MATCHZY_ENABLED: "1", EXECUTES_ENABLED: "0" });
  assert.equal(settings.SERVER_MODE, "executes");
  assert.equal(settings.MATCHZY_ENABLED, "0");
  assert.equal(settings.EXECUTES_ENABLED, "1");
});

test("legacy configuration with both modes enabled prefers MatchZy", () => {
  const settings = normalizeServerSettings({ MATCHZY_ENABLED: "1", EXECUTES_ENABLED: "1" });
  assert.equal(settings.SERVER_MODE, "matchzy");
  assert.equal(settings.EXECUTES_ENABLED, "0");
});

test("legacy configuration can migrate an explicit Executes-only state", () => {
  const settings = normalizeServerSettings({ MATCHZY_ENABLED: "0", EXECUTES_ENABLED: "1" });
  assert.equal(settings.SERVER_MODE, "executes");
});

test("normalizeServerSettings drops unknown and legacy admin keys", () => {
  const settings = normalizeServerSettings({ SERVER_MODE: "matchzy", ADMINS: "76561198000000001", UNKNOWN: "value" });
  assert.equal(settings.ADMINS, undefined);
  assert.equal(settings.UNKNOWN, undefined);
});

test("control model reports installed dependency chains", () => {
  const model: any = buildControlModel({ SERVER_MODE: "matchzy", WEAPONPAINTS_ENABLED: "1" });
  const weaponPaints = model.plugins.find((plugin) => plugin.id === "weaponpaints");
  assert.equal(weaponPaints.enabled, true);
  assert.ok(weaponPaints.dependencies.includes("MySQL"));
  assert.match(weaponPaints.warning, /GSLT/);
});

test("save validation rejects invalid mode and maintenance settings", () => {
  assert.throws(() => validateServerSettings({ SERVER_MODE: "both" }), /SERVER_MODE/);
  assert.throws(() => validateServerSettings({ AUTO_RESTART_TIME: "25:00" }), /HH:mm/);
  assert.throws(() => validateServerSettings({ AUTO_RESTART_TIMEZONE: "Vienna" }), /IANA/);
});
