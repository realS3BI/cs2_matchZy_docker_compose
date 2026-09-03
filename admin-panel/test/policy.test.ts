import test from "node:test";
import assert from "node:assert/strict";
import { buildControlModel, normalizeServerSettings, validateRunnableServerSettings, validateServerSettings } from "../src/policy.js";
import { SERVER_ENV_KEYS } from "../src/defaults.js";

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

test("new installations receive complete panel-managed defaults", () => {
  const settings = normalizeServerSettings({});
  for (const key of SERVER_ENV_KEYS) assert.ok(Object.prototype.hasOwnProperty.call(settings, key), `missing default for ${key}`);
  assert.equal(settings.SRCDS_TOKEN, "");
  assert.equal(settings.CS2_RCONPW, "");
  assert.equal(settings.MATCHZY_VERSION, "latest");
  assert.equal(settings.CS2_PORT, "27015");
});

test("infrastructure ports and addon id cannot be overridden by stored settings", () => {
  const settings = normalizeServerSettings({
    CS2_PORT: "27016",
    TV_PORT: "27021",
    FORTNITE_EMOTES_WORKSHOP_ADDON_ID: "123"
  });
  assert.equal(settings.CS2_PORT, "27015");
  assert.equal(settings.TV_PORT, "27020");
  assert.equal(settings.FORTNITE_EMOTES_WORKSHOP_ADDON_ID, "3328582199");
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

test("apply validation requires platform-managed Steam and RCON secrets", () => {
  assert.throws(() => validateRunnableServerSettings({ SRCDS_TOKEN: "", CS2_RCONPW: "secret" }), /Steam Game Server Login Token/);
  assert.throws(() => validateRunnableServerSettings({ SRCDS_TOKEN: "token", CS2_RCONPW: "" }), /RCON password/);
  assert.doesNotThrow(() => validateRunnableServerSettings({ SRCDS_TOKEN: "token", CS2_RCONPW: "secret" }));
});
