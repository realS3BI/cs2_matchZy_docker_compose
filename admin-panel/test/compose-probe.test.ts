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
  t.after(() => rm(fixture, { recursive: true, force: true }));

  await mkdir(join(root, "addons", "metamod", "bin", "linuxsteamrt64"), { recursive: true });
  await writeFile(join(root, "addons", "metamod", "bin", "linuxsteamrt64", "libserver.so"), "fixture");
  await writeFile(join(root, "gameinfo.gi"), "SearchPaths\n{\n  Game csgo/addons/metamod\n}\n");
  await writeFile(preHook, "fixture");

  const { stdout } = await execFileAsync("sh", ["-lc", buildDiagnosticProbe({
    root,
    state: join(fixture, "state.json"),
    preHook
  })]);
  const { files } = parseProbeOutput(stdout);

  assert.equal(files.metamod, true);
  assert.equal(files.gameinfoMetamod, true);
});
