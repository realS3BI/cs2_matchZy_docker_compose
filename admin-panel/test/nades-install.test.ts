import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access } from "node:fs/promises";
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
  const fixture = await mkdtemp(join(tmpdir(), "playbook-hud-settings-"));
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
export PLAYBOOK_TRAINING_HUD_READY=1
export PLAYBOOK_TRAINING_HUD_ADDON_ID=999
configure_upstream_process
write_multiaddonmanager_config ${quote(config)} 1 111 222
printf '%s' "$PLAYBOOK_TRAINING_HUD_READY"
`;
  for (const [enabled, workshop, expectedId, ready] of [
    [true, true, "123456", "1"], [true, false, "", "1"], [false, true, "", "0"]
  ] as const) {
    await writeFile(settingsFile, JSON.stringify(normalizeSettings({ trainingHudEnabled: enabled, trainingHudWorkshopEnabled: workshop, trainingHudWorkshopId: "123456" })));
    const result = await execFileAsync("bash", ["-c", script]);
    assert.equal(result.stdout.trim().split("\n").at(-1), ready);
    assert.equal(await readFile(config, "utf8"), `mm_extra_addons "111,222"\nmm_client_extra_addons "${expectedId}"\nmm_addon_mount_download "1"\n`);
  }
  const legacy: any = normalizeSettings({});
  delete legacy.trainingHudEnabled;
  delete legacy.trainingHudWorkshopEnabled;
  delete legacy.trainingHudWorkshopId;
  await writeFile(settingsFile, JSON.stringify(legacy));
  assert.equal((await execFileAsync("bash", ["-c", script])).stdout.trim().split("\n").at(-1), "1");
  assert.match(await readFile(config, "utf8"), /mm_client_extra_addons "999"/);
  await writeFile(settingsFile, JSON.stringify(normalizeSettings({ trainingHudEnabled: true, trainingHudWorkshopEnabled: true })));
  await assert.rejects(execFileAsync("bash", ["-c", script]));
});

test("bootstrap installs the role guard in every mode and preserves its data", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "playbook-plugin-install-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const bundle = join(fixture, "bundled.dll");
  const gamedata = join(fixture, "playbook-nades.json");
  const signatures = await readFile(resolve("../server-plugin/gamedata/playbook-nades.json"), "utf8");
  const plugin = join(fixture, "css", "plugins", "Playbook");
  const legacy = join(fixture, "css", "plugins", "MatchZyNades");
  await mkdir(join(legacy, "data", "players"), { recursive: true });
  await writeFile(join(legacy, "MatchZyNades.dll"), "previous plugin");
  await writeFile(join(legacy, "data", "players", "76561198000000000.json"), '{"favorites":["owner/map/lineup"],"hotkey":"KP_0"}');
  await writeFile(join(legacy, "data", "keep.json"), "older settings");
  await mkdir(join(plugin, "data"), { recursive: true });
  await writeFile(bundle, "bundled plugin");
  await writeFile(gamedata, signatures);
  await writeFile(join(plugin, "data", "keep.json"), "keep");
  const pre = await readFile(resolve("../cs2/pre.sh"), "utf8");
  const install = pre.match(/  install_playbook\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(install);
  // Exercise the real bootstrap function with its image bundle paths redirected to this fixture.
  const script = `set -eu
CSS_DIR=${quote(join(fixture, "css"))}
log() { :; }
fail() { exit 1; }
copy_file_atomic() { cp "$1" "$2"; }
${install.replace('"/opt/playbook/Playbook.dll"', quote(bundle)).replace('"/opt/playbook/playbook-nades.json"', quote(gamedata))}
install_playbook "$1"
`;
  for (const mode of ["matchzy", "nades", "warmup", "vanilla"]) {
    await execFileAsync("bash", ["-c", script, "nades-install", mode]);
    assert.equal(await readFile(join(plugin, "Playbook.dll"), "utf8"), "bundled plugin");
    assert.equal(await readFile(join(plugin, "data", "keep.json"), "utf8"), "keep");
    assert.equal(await readFile(join(plugin, "data", "players", "76561198000000000.json"), "utf8"), '{"favorites":["owner/map/lineup"],"hotkey":"KP_0"}');
    await assert.rejects(access(legacy));
    assert.equal(await readFile(join(fixture, "css", "gamedata", "playbook-nades.json"), "utf8"), signatures);
  }
  const archiveRoot = join(fixture, "css", "playbook-migration");
  const archives = await readdir(archiveRoot);
  assert.equal(archives.length, 1, "Repeated startup must not repeat the migration");
  assert.equal(await readFile(join(archiveRoot, archives[0], "MatchZyNades", "data", "keep.json"), "utf8"), "older settings");
  assert.equal(await readFile(join(archiveRoot, archives[0], "MatchZyNades", "MatchZyNades.dll"), "utf8"), "previous plugin");
  // The real bootstrap is called from an if, which disables implicit errexit.
  // A failed copy must still stop before moving the only original data.
  await mkdir(join(legacy, "data"), { recursive: true });
  await writeFile(join(legacy, "data", "uncopied.json"), "original");
  await writeFile(join(legacy, "MatchZyNades.dll"), "previous plugin");
  const failedCopy = script.replace('install_playbook "$1"', 'cp() { return 1; }\nif install_playbook "$1"; then :; fi');
  await assert.rejects(execFileAsync("bash", ["-c", failedCopy, "playbook-install", "nades"]));
  assert.equal(await readFile(join(legacy, "data", "uncopied.json"), "utf8"), "original");
  assert.equal(await readFile(join(legacy, "MatchZyNades.dll"), "utf8"), "previous plugin");
  assert.equal((await readdir(archiveRoot)).length, 1);
});

test("training HUD mounts as client addon and preserves the server addon list", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "playbook-hud-install-"));
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
PLAYBOOK_TRAINING_HUD_ADDON_ID="$1"
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
