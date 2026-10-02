import test from "node:test";
import assert from "node:assert/strict";
import { buildControlModel, normalizeSettings, SETTING_KEYS, settingsForRole, validateRunnableSettings, validateSettings } from "../src/policy.js";

test("normalizeSettings migrates the retired mode and drops its version field", () => {
  const settings: any = normalizeSettings({ serverMode: "executes", executesVersion: "1.1.1" });
  assert.equal(settings.serverMode, "matchzy");
  assert.equal(settings.executesVersion, undefined);
  assert.equal(buildControlModel(settings).modes.some((mode) => mode.id === "executes"), false);
});

test("warmup uses the dedicated Workshop map without a mode plugin", () => {
  const model: any = buildControlModel({ serverMode: "warmup" });
  assert.equal(model.mode.id, "warmup");
  assert.equal(model.plugins.some((plugin) => plugin.id === "warmup"), false);
});

test("nades is an independent Playbook server mode", () => {
  const model: any = buildControlModel({ serverMode: "nades" });
  assert.equal(model.mode.id, "nades");
  assert.equal(model.plugins[0].id, "nades");
  assert.ok(model.plugins[0].dependencies.includes("CounterStrikeSharp"));
  assert.match(model.mode.description, /ohne MatchZy/);
  assert.equal(model.plugins.some(plugin => plugin.id === "matchzy"), false);
});

test("Playbook branding migrates shipped defaults and preserves custom names", () => {
  assert.equal(normalizeSettings({}).serverName, "Playbook");
  const migrated = normalizeSettings({ serverName: "CS2 MatchZy Server", matchZyChatPrefix: "[{Green}MatchZy{Default}]" });
  assert.equal(migrated.serverName, "Playbook");
  assert.equal(migrated.matchZyChatPrefix, "");
  const custom = normalizeSettings({ serverName: "Unser Server", matchZyChatPrefix: "[{Red}Unser Team{Default}]" });
  assert.equal(custom.serverName, "Unser Server");
  assert.equal(custom.matchZyChatPrefix, "[{Red}Unser Team{Default}]");
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
  assert.equal("fakeRconEnabled" in settings, false);
  assert.equal(settings.workshopMapCatalog, "[]");
});

test("normalizeSettings persists Workshop map metadata", () => {
  const catalog = '[{"title":"Aim Botz","mapName":"aim_botz","workshopId":"3070244462"}]';
  assert.equal(normalizeSettings({ workshopMapCatalog: catalog }).workshopMapCatalog, catalog);
});

test("VAC defaults to enabled and only admins can configure it", () => {
  assert.equal(normalizeSettings({}).vacEnabled, true);
  for (const vacEnabled of [true, false]) {
    const settings = normalizeSettings({ vacEnabled });
    assert.equal(settings.vacEnabled, vacEnabled);
    assert.equal(settingsForRole(settings, "admin").vacEnabled, vacEnabled);
    assert.equal(settingsForRole(settings, "match_admin").vacEnabled, undefined);
    const group = buildControlModel(settings).settingsGroups.find(group => group.id === "security");
    assert.equal(group.fields.find(field => field.key === "vacEnabled").type, "boolean");
    assert.match(group.description, /neu starten/);
  }
  for (const value of ["false", "true", null, 0, 1]) {
    assert.throws(() => validateSettings({ vacEnabled: value }), /boolean/);
    assert.equal(normalizeSettings({ vacEnabled: value }).vacEnabled, true);
  }
});

test("legacy insecure arguments migrate without changing other launch arguments", () => {
  for (const flag of ["-insecure", '"-insecure"', "'-insecure'", "-INSECURE"]) {
    const settings = normalizeSettings({ additionalArgs: `+sv_lan 0 ${flag} -dev` });
    assert.equal(settings.vacEnabled, false);
    assert.equal(settings.additionalArgs, "+sv_lan 0  -dev");
    assert.deepEqual(normalizeSettings(settings), settings);
  }
  assert.equal(normalizeSettings({ additionalArgs: "-insecure\n-insecure\t-secure" }).additionalArgs, "");
  assert.equal(normalizeSettings({ additionalArgs: "-secure" }).vacEnabled, true);
  assert.equal(normalizeSettings({ additionalArgs: "+exec insecure.cfg -insecure_suffix" }).vacEnabled, true);
  assert.equal(normalizeSettings({ vacEnabled: true, additionalArgs: "-insecure" }).vacEnabled, true);
  assert.equal(normalizeSettings({ vacEnabled: false, additionalArgs: "-secure" }).vacEnabled, false);
});

test("additional arguments cannot bypass the VAC switch", () => {
  for (const flag of ["-insecure", "-secure", '"-insecure"', "'-secure'", "-INSECURE"]) {
    for (const vacEnabled of [true, false]) {
      assert.throws(() => validateSettings({ vacEnabled, additionalArgs: `-dev ${flag}` }), /VAC und Spielzugang/);
    }
  }
  assert.doesNotThrow(() => validateSettings({ vacEnabled: false, additionalArgs: "+exec insecure.cfg -insecure_suffix" }));
});

test("control model reports installed dependency chains", () => {
  const model: any = buildControlModel({ serverMode: "matchzy", weaponPaintsEnabled: true });
  const weaponPaints = model.plugins.find((plugin) => plugin.id === "weaponpaints");
  assert.equal(weaponPaints.enabled, true);
  assert.ok(weaponPaints.dependencies.includes("MySQL"));
  assert.match(weaponPaints.warning, /GSLT/);
});

test("every plugin stack entry links to project documentation", () => {
  const model: any = buildControlModel({ serverMode: "vanilla" });
  assert.ok(model.plugins.length > 0);
  for (const plugin of model.plugins) {
    assert.match(plugin.url, /^https:\/\//, `${plugin.name} needs a documentation URL`);
  }
});

test("save validation rejects invalid mode and maintenance settings", () => {
  assert.throws(() => validateSettings({ serverMode: "both" }), /Server mode/);
  assert.throws(() => validateSettings({ serverMode: "executes" }), /Server mode/);
  assert.throws(() => validateSettings({ restartTime: "25:00" }), /HH:mm/);
  assert.throws(() => validateSettings({ restartTimezone: "Vienna" }), /IANA/);
  assert.throws(() => validateSettings({ maxPlayers: 0 }), /between 1 and 64/);
  assert.throws(() => validateSettings({ weaponPaintsEnabled: "true" }), /must be a boolean/);
});

test("apply validation requires platform-managed Steam and RCON secrets", () => {
  assert.throws(() => validateRunnableSettings({ steamToken: "", rconPassword: "secret" }), /Steam Game Server Login Token/);
  assert.throws(() => validateRunnableSettings({ steamToken: "token", rconPassword: "" }), /RCON password/);
  assert.doesNotThrow(() => validateRunnableSettings({ steamToken: "token", rconPassword: "secret" }));
});

test("HUD settings retain the Workshop ID while delivery is disabled and validate activation", () => {
  const settings = normalizeSettings({ trainingHudEnabled: true, trainingHudWorkshopEnabled: false, trainingHudWorkshopId: "123456" });
  assert.equal(settings.trainingHudWorkshopId, "123456");
  assert.equal(settings.trainingHudWorkshopEnabled, false);
  assert.equal(normalizeSettings({}).trainingHudEnabled, false);
  const runnable = { ...settings, steamToken: "token", rconPassword: "secret" };
  assert.doesNotThrow(() => validateRunnableSettings({ ...runnable, trainingHudWorkshopId: "" }));
  assert.throws(() => validateRunnableSettings({ ...runnable, trainingHudWorkshopEnabled: true, trainingHudWorkshopId: "" }), /Workshop-ID/);
  assert.doesNotThrow(() => validateRunnableSettings({ ...runnable, trainingHudWorkshopEnabled: true }));
  for (const id of ["0", "123;quit", "123\n", "https://steamcommunity.com/", "1".repeat(21)]) {
    assert.throws(() => validateSettings({ trainingHudWorkshopId: id }), /Workshop-ID/);
  }
});
