import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildDiagnosticProbe } from "../src/compose.js";
import { parseProbeOutput } from "../src/diagnostics.js";

const execFileAsync = promisify(execFile);

test("diagnostic probe recognizes the Metamod CS2 linux runtime", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "matchzy-diagnostic-probe-"));
  const root = join(fixture, "game", "csgo");
  const preHook = join(fixture, "pre.sh");
  const nadesDirectory = join(root, "addons", "counterstrikesharp", "plugins", "MatchZyNades");
  t.after(() => rm(fixture, { recursive: true, force: true }));

  await mkdir(join(root, "addons", "metamod", "bin", "linuxsteamrt64"), { recursive: true });
  await mkdir(join(root, "addons", "counterstrikesharp", "plugins", "MatchZyCoach"), { recursive: true });
  await writeFile(join(root, "addons", "metamod", "bin", "linuxsteamrt64", "libserver.so"), "fixture");
  await writeFile(join(root, "gameinfo.gi"), "SearchPaths\n{\n  Game csgo/addons/metamod\n}\n");
  await writeFile(join(root, "addons", "counterstrikesharp", "plugins", "MatchZyCoach", "MatchZyCoach.dll"), "fixture");
  await writeFile(preHook, "fixture");
  await mkdir(join(nadesDirectory, "data"), { recursive: true });
  await writeFile(join(nadesDirectory, "MatchZyNades.dll"), "fixture");
  await writeFile(join(nadesDirectory, "data", "status.json"), JSON.stringify({
    state: "loaded", version: "1.0.1", practice: true, map: "de_mirage",
    loadedAt: "2026-09-28T09:00:00Z", updatedAt: "2026-09-28T09:00:05Z", secret: "must-not-leak"
  }));

  const { stdout } = await execFileAsync("sh", ["-lc", buildDiagnosticProbe({
    root: root.replaceAll("\\", "/"),
    state: join(fixture, "state.json").replaceAll("\\", "/"),
    preHook: preHook.replaceAll("\\", "/")
  })]);
  const { files, runtime } = parseProbeOutput(stdout);

  assert.equal(files.metamod, true);
  assert.equal(files.gameinfoMetamod, true);
  assert.equal(files.matchZyCoach, true);
  assert.equal(files.matchZyNades, true);
  assert.equal(runtime.matchZyNades.state, "loaded");
  assert.equal(runtime.matchZyNades.practice, true);
  assert.equal(runtime.matchZyNades.version, "1.0.1");
  assert.doesNotMatch(stdout, /must-not-leak/);
});
