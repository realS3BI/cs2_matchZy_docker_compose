import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const quote = (path: string) => `'${path.replaceAll("\\", "/").replaceAll("'", `'"'"'`)}'`;

test("bootstrap installs the menu for both MatchZy and Nades, removes only its DLL in other modes", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "matchzy-nades-install-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const bundle = join(fixture, "bundled.dll");
  const plugin = join(fixture, "css", "plugins", "MatchZyNades");
  await mkdir(join(plugin, "data"), { recursive: true });
  await writeFile(bundle, "bundled plugin");
  await writeFile(join(plugin, "data", "keep.json"), "keep");
  const pre = await readFile(resolve("../cs2/pre.sh"), "utf8");
  const install = pre.match(/  install_matchzy_nades\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(install);
  // Exercise the real bootstrap function with only its image bundle path redirected to this fixture.
  const script = `set -eu
CSS_DIR=${quote(join(fixture, "css"))}
log() { :; }
fail() { exit 1; }
copy_file_atomic() { cp "$1" "$2"; }
${install.replace('"/opt/matchzy-nades/MatchZyNades.dll"', quote(bundle))}
install_matchzy_nades "$1"
`;
  for (const mode of ["matchzy", "nades", "warmup", "vanilla"]) {
    await execFileAsync("bash", ["-c", script, "nades-install", mode]);
    if (["matchzy", "nades"].includes(mode))
      assert.equal(await readFile(join(plugin, "MatchZyNades.dll"), "utf8"), "bundled plugin");
    else
      await assert.rejects(access(join(plugin, "MatchZyNades.dll")));
    assert.equal(await readFile(join(plugin, "data", "keep.json"), "utf8"), "keep");
  }
});

test("training HUD mounts as client addon and preserves the server addon list", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "matchzy-hud-install-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const config = join(fixture, "multiaddonmanager.cfg");
  const pre = await readFile(resolve("../cs2/pre.sh"), "utf8");
  const writer = pre.match(/  write_multiaddonmanager_config\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(writer);
  const script = `set -eu
log() { :; }
fail() { exit 1; }
is_enabled() { [[ "$1" == "1" ]]; }
${writer}
MATCHZY_TRAINING_HUD_ADDON_ID="$1"
shift
write_multiaddonmanager_config ${quote(config)} 1 "$@"
`;
  await execFileAsync("bash", ["-c", script, "hud-config", "123456", "111", "222", "111"]);
  assert.equal(await readFile(config, "utf8"), 'mm_extra_addons "111,222"\nmm_client_extra_addons "123456"\nmm_addon_mount_download "1"\n');
  await execFileAsync("bash", ["-c", script, "hud-config", "123456"]);
  assert.match(await readFile(config, "utf8"), /mm_extra_addons ""\nmm_client_extra_addons "123456"/);
  await assert.rejects(execFileAsync("bash", ["-c", script, "hud-config", '123";quit']));
  assert.match(await readFile(config, "utf8"), /mm_client_extra_addons "123456"/);
  await execFileAsync("bash", ["-c", script, "hud-config", "", "111"]);
  assert.match(await readFile(config, "utf8"), /mm_client_extra_addons ""/);
});
