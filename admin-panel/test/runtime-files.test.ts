import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeServerRuntimeFiles } from "../src/runtime-files.js";

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
    { steamToken: "token", rconPassword: "secret", maxPlayers: 12, fakeRconEnabled: true },
    [],
    []
  );

  const settings = JSON.parse(await readFile(config.runtimeSettingsFile, "utf8"));
  assert.equal(settings.schemaVersion, 1);
  assert.equal(settings.steamToken, "token");
  assert.equal(settings.rconPassword, "secret");
  assert.equal(settings.maxPlayers, 12);
  assert.equal(settings.fakeRconEnabled, true);
  assert.equal(typeof settings.fakeRconEnabled, "boolean");
  assert.deepEqual(synchronizedNades, []);
  assert.deepEqual(JSON.parse(await readFile(config.runtimeAdminsFile, "utf8")), {});
  assert.deepEqual(JSON.parse(await readFile(config.runtimeMatchZyAdminsFile, "utf8")), {});
});
