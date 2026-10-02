import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { normalizeSettings } from "../src/policy.js";

const execFileAsync = promisify(execFile);
const quote = (path: string) => `'${path.replaceAll("\\", "/").replaceAll("'", `'"'"'`)}'`;

test("the real entrypoint configures VAC and insecure access for every server mode", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "playbook-vac-start-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const settingsFile = join(fixture, "settings.json");
  const entry = await readFile(resolve("../cs2/entrypoint.sh"), "utf8");
  const configure = entry.match(/configure_upstream_process\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(configure);
  const script = `set -eu
settings_file=${quote(settingsFile)}
read_setting() { jq -er "$1" "$settings_file"; }
${configure}
configure_upstream_process
printf 'ARGS:%s' "$CS2_ADDITIONAL_ARGS"
`;
  for (const serverMode of ["matchzy", "nades", "warmup", "vanilla"]) {
    for (const vacEnabled of [true, false]) {
      const settings = normalizeSettings({ serverMode, vacEnabled, additionalArgs: "+sv_lan 0 -dev" });
      await writeFile(settingsFile, JSON.stringify(settings));
      const { stdout } = await execFileAsync("bash", ["-c", script]);
      assert.match(stdout, vacEnabled ? /VAC aktiviert/ : /VAC deaktiviert/);
      assert.equal(stdout.split("ARGS:")[1], vacEnabled ? "+sv_lan 0 -dev" : "+sv_lan 0 -dev -insecure");
    }
  }
  const cases = [
    { vacEnabled: true, additionalArgs: "-insecure -secure -insecure", expected: "" },
    { vacEnabled: false, additionalArgs: "-insecure -secure -insecure", expected: "-insecure" },
    { vacEnabled: true, additionalArgs: '"-insecure"\n\'-secure\' -dev', expected: "-dev" },
    { vacEnabled: false, additionalArgs: "", expected: "-insecure" },
    { vacEnabled: true, additionalArgs: "", expected: "" },
    { vacEnabled: undefined, additionalArgs: "-insecure -dev", expected: "-dev -insecure" },
    { vacEnabled: undefined, additionalArgs: "", expected: "" },
    { vacEnabled: undefined, additionalArgs: "+exec insecure.cfg -insecure_suffix", expected: "+exec insecure.cfg -insecure_suffix" }
  ];
  for (const { vacEnabled, additionalArgs, expected } of cases) {
    const settings: any = { ...normalizeSettings({}), vacEnabled, additionalArgs };
    if (vacEnabled === undefined) delete settings.vacEnabled;
    await writeFile(settingsFile, JSON.stringify(settings));
    const { stdout } = await execFileAsync("bash", ["-c", script]);
    assert.equal(stdout.split("ARGS:")[1], expected);
  }
  for (const vacEnabled of ["false", "true", null, 0]) {
    await writeFile(settingsFile, JSON.stringify({ ...normalizeSettings({}), vacEnabled }));
    await assert.rejects(execFileAsync("bash", ["-c", script]), /vacEnabled muss ein boolean-Wert sein/);
  }
});
