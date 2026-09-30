import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAdminRuntimeFiles, writeServerRuntimeFiles } from "../src/runtime-files.js";

test("runtime files use the typed JSON settings contract", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "matchzy-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = {
    runtimeSettingsFile: join(directory, "settings.json"),
    runtimeAdminsFile: join(directory, "csharp-admins.json"),
    runtimeMatchZyAdminsFile: join(directory, "matchzy-admins.json"),
    runtimeMatchZyNadesFile: join(directory, "matchzy-savednades.json")
  };
  let synchronizedNades: any[] | null = null;

  await writeServerRuntimeFiles(
    config,
    { writeFromMongo: async (entries) => { synchronizedNades = entries; } },
    { steamToken: "token", rconPassword: "secret", maxPlayers: 12, weaponPaintsEnabled: true },
    [],
    []
  );

  const settings = JSON.parse(await readFile(config.runtimeSettingsFile, "utf8"));
  assert.equal(settings.schemaVersion, 1);
  assert.equal(settings.steamToken, "token");
  assert.equal(settings.rconPassword, "secret");
  assert.equal(settings.maxPlayers, 12);
  assert.equal(settings.weaponPaintsEnabled, true);
  assert.equal(typeof settings.weaponPaintsEnabled, "boolean");
  assert.deepEqual(synchronizedNades, []);
  assert.deepEqual(JSON.parse(await readFile(config.runtimeAdminsFile, "utf8")), {});
  assert.deepEqual(JSON.parse(await readFile(config.runtimeMatchZyAdminsFile, "utf8")), {});
});

test("concurrent runtime publication reads the latest role after a demotion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "matchzy-role-sync-"));
  const config = { runtimeAdminsFile: join(directory, "admins.json"), runtimeMatchZyAdminsFile: join(directory, "matchzy-admins.json") };
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let role = "admin";
  const first = writeAdminRuntimeFiles(config, async () => { await gate; return [{ identitySteam64: "76561198000000001", role }]; });
  const second = writeAdminRuntimeFiles(config, async () => [{ identitySteam64: "76561198000000001", role }]);
  role = "player";
  release();
  try {
    await Promise.all([first, second]);
    assert.deepEqual(JSON.parse(await readFile(config.runtimeAdminsFile, "utf8")), {});
    assert.deepEqual(JSON.parse(await readFile(join(directory, "platform-roles.json"), "utf8")), { "76561198000000001": "player" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("training players are published to the plugin without CSS or MatchZy admin privileges", async () => {
  const directory = await mkdtemp(join(tmpdir(), "matchzy-training-role-"));
  const config = { runtimeAdminsFile: join(directory, "admins.json"), runtimeMatchZyAdminsFile: join(directory, "matchzy-admins.json") };
  try {
    await writeAdminRuntimeFiles(config, [{ identitySteam64: "76561198000000001", role: "training_player", flags: ["@css/root"] }]);
    assert.deepEqual(JSON.parse(await readFile(config.runtimeAdminsFile, "utf8")), {});
    assert.deepEqual(JSON.parse(await readFile(config.runtimeMatchZyAdminsFile, "utf8")), {});
    assert.deepEqual(JSON.parse(await readFile(join(directory, "platform-roles.json"), "utf8")), { "76561198000000001": "training_player" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
