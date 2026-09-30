import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { normalizeSettings } from "../src/policy.js";

const execFileAsync = promisify(execFile);
const quote = (path: string) => `'${path.replaceAll("\\", "/").replaceAll("'", `'"'"'`)}'`;

test("bootstrap enables MatchZy only for scrims and retires its plugin without deleting lineups", async (t) => {
  const pre = await readFile(resolve("../cs2/pre.sh"), "utf8");
  const modeSwitch = pre.match(/  case "\$server_mode" in[\s\S]*?\n  esac/)?.[0];
  const remove = pre.match(/  remove_matchzy_component\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(modeSwitch);
  assert.ok(remove);
  const fixture = await mkdtemp(join(tmpdir(), "playbook-modes-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const plugin = join(fixture, "plugins", "MatchZy");
  const library = join(fixture, "cfg", "MatchZy", "savednades.json");
  await mkdir(join(fixture, "cfg", "MatchZy"), { recursive: true });
  await writeFile(library, "existing lineups");
  const script = `set -eu
CSS_DIR=${quote(fixture)}
server_mode="$1"
matchzy_enabled=0
matchzy_autostart_mode=1
log() { :; }
fail() { exit 1; }
${remove}
${modeSwitch}
if [[ "$matchzy_enabled" == 0 ]]; then remove_matchzy_component; fi
printf '%s' "$matchzy_enabled"
`;
  for (const mode of ["matchzy", "nades", "vanilla", "warmup"]) {
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, "MatchZy.dll"), "old plugin");
    assert.equal((await execFileAsync("bash", ["-c", script, "modes", mode])).stdout, mode === "matchzy" ? "1" : "0");
    if (mode === "matchzy") await access(join(plugin, "MatchZy.dll"));
    else await assert.rejects(access(plugin));
    assert.equal(await readFile(library, "utf8"), "existing lineups");
  }
});

test("panel HUD controls override legacy environment and clear only client addons", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "matchzy-hud-settings-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const settingsFile = join(fixture, "settings.json");
  const config = join(fixture, "multiaddonmanager.cfg");
  const entry = await readFile(resolve("../cs2/entrypoint.sh"), "utf8");
  const configure = entry.match(/configure_upstream_process\(\) \{[\s\S]*?\n\}/)?.[0];
  const pre = await readFile(resolve("../cs2/pre.sh"), "utf8");
  const writer = pre.match(/  write_multiaddonmanager_config\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(configure);
  assert.ok(writer);
  const script = `set -eu
settings_file=${quote(settingsFile)}
read_setting() { jq -er "$1" "$settings_file"; }
log() { :; }
fail() { exit 1; }
is_enabled() { [[ "$1" == "1" ]]; }
${configure}
${writer}
export MATCHZY_TRAINING_HUD_READY=1
export MATCHZY_TRAINING_HUD_ADDON_ID=999
configure_upstream_process
write_multiaddonmanager_config ${quote(config)} 1 111 222
printf '%s' "$MATCHZY_TRAINING_HUD_READY"
`;
  for (const [enabled, workshop, expectedId, ready] of [
    [true, true, "123456", "1"], [true, false, "", "1"], [false, true, "", "0"]
  ] as const) {
    await writeFile(settingsFile, JSON.stringify(normalizeSettings({ trainingHudEnabled: enabled, trainingHudWorkshopEnabled: workshop, trainingHudWorkshopId: "123456" })));
    const result = await execFileAsync("bash", ["-c", script]);
    assert.equal(result.stdout, ready);
    assert.equal(await readFile(config, "utf8"), `mm_extra_addons "111,222"\nmm_client_extra_addons "${expectedId}"\nmm_addon_mount_download "1"\n`);
  }
  const legacy: any = normalizeSettings({});
  delete legacy.trainingHudEnabled;
  delete legacy.trainingHudWorkshopEnabled;
  delete legacy.trainingHudWorkshopId;
  await writeFile(settingsFile, JSON.stringify(legacy));
  assert.equal((await execFileAsync("bash", ["-c", script])).stdout, "1");
  assert.match(await readFile(config, "utf8"), /mm_client_extra_addons "999"/);
  await writeFile(settingsFile, JSON.stringify(normalizeSettings({ trainingHudEnabled: true, trainingHudWorkshopEnabled: true })));
  await assert.rejects(execFileAsync("bash", ["-c", script]));
});

test("bootstrap installs the role guard in every mode and preserves its data", async (t) => {
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
      assert.equal(await readFile(join(plugin, "MatchZyNades.dll"), "utf8"), "bundled plugin");
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
