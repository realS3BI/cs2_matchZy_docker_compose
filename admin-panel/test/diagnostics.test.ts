import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagnostics, parseProbeOutput } from "../src/diagnostics.js";

const healthyProbe = [
  "FILE\tpreHook\t1",
  "FILE\tinstallerState\t1",
  "FILE\tmetamod\t1",
  "FILE\tgameinfoMetamod\t1",
  "FILE\tcounterStrikeSharpNative\t1",
  "FILE\tcounterStrikeSharpApi\t1",
  "FILE\tmatchZyCoach\t1",
  "FILE\tmatchZyNades\t1",
  "FILE\tmatchZyNadesBundled\t1",
  "FILE\tmatchZy\t1",
  "FILE\tmatchZyConfig\t1",
  "FILE\tmatchZySavedNades\t1",
  "VERSION\tMATCHZY\t0.8.15",
  "VERSION\tCOUNTERSTRIKESHARP\tv1.0.373"
].join("\n");

function input(patch = {}) {
  return {
    service: { state: "running" },
    container: {
      id: "1234567890abcdef",
      name: "coolify-cs2",
      startedAt: "2026-09-02T12:00:00.000Z",
      restartCount: 2
    },
    probe: { ok: true, stdout: `${healthyProbe}\n${heartbeat()}`, stderr: "" },
    logs: "[pre.sh] Mod bootstrap complete\nMatchZy Coach loaded\n[MatchZy 0.8.15 LOADED] MatchZy by WD-",
    desired: { matchZyVersion: "latest" },
    controlMode: "docker",
    ...patch
  };
}

function heartbeat(patch = {}) {
  return `RUNTIME\tmatchZyNades\t${JSON.stringify({
    state: "loaded", version: "1.0.1", practice: true,
    loadedAt: new Date(Date.now() - 5000).toISOString(), updatedAt: new Date().toISOString(),
    ...patch
  })}`;
}

test("parseProbeOutput reads only supported diagnostic records", () => {
  assert.deepEqual(parseProbeOutput("FILE\tmatchZy\t1\nSECRET\tTOKEN\tvalue\nVERSION\tMATCHZY\t0.8.15"), {
    files: { matchZy: true },
    versions: { MATCHZY: "0.8.15" },
    runtime: {}
  });
});

test("buildDiagnostics reports a healthy MatchZy load chain", () => {
  const report = buildDiagnostics(input());

  assert.equal(report.overall, "healthy");
  assert.equal(report.checks.at(-1).status, "pass");
  assert.equal(report.repairAvailable, false);
  assert.equal(report.service.containerId, "1234567890ab");
  assert.equal(report.versions.find((item) => item.key === "MATCHZY").installed, "0.8.15");
});

test("buildDiagnostics identifies release asset failures before MatchZy install", () => {
  const report = buildDiagnostics(input({
    probe: { ok: true, stdout: "FILE\tpreHook\t1", stderr: "" },
    logs: [
      "[pre.sh] ERROR: Could not resolve cs2-fake-rcon asset from upstream",
      "[pre.sh] Hook failed with exit code 1; continuing container startup"
    ].join("\n")
  }));

  assert.equal(report.overall, "critical");
  assert.match(report.findings[0].detail, /cs2-fake-rcon/);
  assert.equal(report.checks.find((item) => item.id === "bootstrap").status, "fail");
  assert.equal(report.checks.find((item) => item.id === "matchzy").status, "fail");
  assert.equal(report.repairAvailable, true);
});

test("buildDiagnostics treats an active bootstrap as in progress", () => {
  const report = buildDiagnostics(input({
    logs: "[pre.sh] Resolving MatchZy release: latest"
  }));

  assert.equal(report.checks.find((item) => item.id === "bootstrap").status, "warn");
  assert.equal(report.overall, "degraded");
});

test("Nades menu reports current runtime and practice state", () => {
  const menu = buildDiagnostics(input()).nades.menu;
  assert.equal(menu.state, "loaded");
  assert.equal(menu.practice, true);
  assert.equal(menu.version, "1.0.1");
  const report = buildDiagnostics(input({ probe: { ok: true, stdout: `${healthyProbe}\n${heartbeat({ practice: false })}` } }));
  assert.equal(report.nades.menu.state, "loaded");
  assert.equal(report.nades.menu.practice, false);
  assert.match(report.nades.menu.detail, /\.prac/);
});

test("missing menu distinguishes old image from installation needing restart", () => {
  const missing = healthyProbe.replace("FILE\tmatchZyNades\t1", "FILE\tmatchZyNades\t0");
  const report = buildDiagnostics(input({ probe: { ok: true, stdout: missing } }));
  assert.equal(report.nades.menu.state, "missing");
  assert.match(report.nades.menu.detail, /Apply & restart/);
  const oldImage = buildDiagnostics(input({ probe: { ok: true, stdout: missing.replace("FILE\tmatchZyNadesBundled\t1", "FILE\tmatchZyNadesBundled\t0") } }));
  assert.match(oldImage.nades.menu.detail, /Rebuild and redeploy/);
  assert.equal(oldImage.checks.find(check => check.id === "matchzy-nades").status, "fail");
});

test("old logs and files alone never confirm a running menu", () => {
  const report = buildDiagnostics(input({ probe: { ok: true, stdout: healthyProbe }, logs: "Finished loading plugin MatchZyNades" }));
  assert.equal(report.nades.menu.state, "unconfirmed");
  assert.equal(report.nades.menu.practice, null);
  assert.equal(report.checks.at(-1).status, "warn");
});

test("stale, future, malformed and previous-start heartbeats cannot show Loaded", () => {
  const samples = [
    heartbeat({ updatedAt: new Date(Date.now() - 60000).toISOString() }),
    heartbeat({ updatedAt: new Date(Date.now() + 60000).toISOString() }),
    heartbeat({ loadedAt: "2020-01-01T00:00:00Z" }),
    heartbeat({ updatedAt: "broken" }),
    heartbeat({ practice: "true" }),
    "RUNTIME\tmatchZyNades\t{broken",
    "RUNTIME\tmatchZyNades\tnull"
  ];
  for (const sample of samples) {
    const report = buildDiagnostics(input({ probe: { ok: true, stdout: `${healthyProbe}\n${sample}` } }));
    assert.equal(report.nades.menu.state, "unconfirmed", sample);
  }
});

test("a stopped server or failed probe overrides a fresh heartbeat", () => {
  assert.equal(buildDiagnostics(input({ service: { state: "exited" } })).nades.menu.state, "stopped");
  assert.equal(buildDiagnostics(input({ probe: { ok: false, stdout: `${healthyProbe}\n${heartbeat()}` } })).nades.menu.state, "unavailable");
});

test("framework rejection and plugin unload are visible", () => {
  assert.equal(buildDiagnostics(input({ logs: "cannot enable executable stack as shared object requires" })).nades.menu.state, "blocked");
  const report = buildDiagnostics(input({ probe: { ok: true, stdout: `${healthyProbe}\n${heartbeat({ state: "unloaded", practice: false })}` } }));
  assert.equal(report.nades.menu.state, "unloaded");
  const rejected = buildDiagnostics(input({ probe: { ok: true, stdout: healthyProbe }, logs: 'Failed to load plugin "MatchZyNades.dll"' }));
  assert.equal(rejected.nades.menu.state, "failed");
});

test("menu is not required in unrelated modes", () => {
  const report = buildDiagnostics(input({ desired: { serverMode: "vanilla" }, probe: { ok: true, stdout: healthyProbe.replace("FILE\tmatchZyNades\t1", "FILE\tmatchZyNades\t0") } }));
  assert.equal(report.nades.menu.expected, false);
  assert.equal(report.nades.menu.state, "inactive");
  assert.equal(report.checks.some(check => check.id === "matchzy-nades"), false);
});

test("MatchZy status never matches sibling plugin names", () => {
  const report = buildDiagnostics(input({ logs: "Finished loading plugin MatchZy\nFailed to load plugin MatchZyNades\nFailed to load plugin MatchZyCoach" }));
  assert.equal(report.checks.at(-1).status, "pass");
  const failed = buildDiagnostics(input({ logs: 'Finished loading plugin MatchZyNades\nFailed to load plugin "MatchZy.dll"' }));
  assert.equal(failed.checks.at(-1).status, "fail");
});

test("buildDiagnostics explains an executable-stack rejection even when CSS files exist", () => {
  const report = buildDiagnostics(input({
    logs: [
      "[pre.sh] Mod bootstrap complete",
      "Failed to load plugin addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so",
      "cannot enable executable stack as shared object requires: Invalid argument"
    ].join("\n")
  }));

  assert.equal(report.overall, "critical");
  assert.equal(report.checks.find((item) => item.id === "counterstrikesharp").status, "fail");
  assert.match(report.findings.find((item) => item.title.includes("blocked")).detail, /Rebuild and redeploy/);
});

test("buildDiagnostics explains the Metamod interface-18 incompatibility", () => {
  const report = buildDiagnostics(input({
    logs: "[META] Failed to load plugin addons/counterstrikesharp: Plugin uses old SourceHook Metamod build, probably 1.12.x or an early 2.0 version (17 < 18)."
  }));

  assert.equal(report.overall, "critical");
  assert.equal(report.checks.find((item) => item.id === "metamod").status, "fail");
  assert.match(report.findings.find((item) => item.title.includes("incompatible")).detail, /build 1411/);
});

test("buildDiagnostics identifies CounterStrikeSharp requiring a newer Metamod interface", () => {
  const report = buildDiagnostics(input({
    logs: "[META] Failed to load plugin addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp: Plugin requires newer Metamod version (18 > 17)"
  }));

  assert.equal(report.overall, "critical");
  assert.equal(report.checks.find((item) => item.id === "metamod").status, "fail");
  assert.equal(report.checks.find((item) => item.id === "counterstrikesharp").status, "fail");
  assert.equal(report.checks.find((item) => item.id === "matchzy").status, "fail");
  assert.match(report.findings.find((item) => item.title.includes("incompatible")).detail, /1467 or newer/);
});

test("buildDiagnostics follows Executes instead of requiring MatchZy", () => {
  const report = buildDiagnostics(input({
    desired: { serverMode: "executes" },
    probe: { ok: true, stdout: `${healthyProbe.replace("FILE\tmatchZy\t1", "FILE\tmatchZy\t0")}\nFILE\texecutes\t1`, stderr: "" },
    logs: "[pre.sh] Mod bootstrap complete\nMatchZy Coach loaded"
  }));

  assert.equal(report.overall, "healthy");
  assert.equal(report.mode.id, "executes");
  assert.equal(report.checks.at(-1).id, "executes");
  assert.equal(report.nades.relevant, false);
});

test("buildDiagnostics treats warmup as a dedicated Workshop map", () => {
  const report = buildDiagnostics(input({ desired: { serverMode: "warmup" } }));

  assert.equal(report.overall, "healthy");
  assert.equal(report.mode.id, "warmup");
  assert.equal(report.checks.at(-1).id, "warmup");
  assert.equal(report.nades.relevant, false);
  assert.equal(report.versions.find((item) => item.key === "MATCHZY").relevant, false);
});

test("buildDiagnostics treats nades as a MatchZy-backed mode", () => {
  const report = buildDiagnostics(input({ desired: { serverMode: "nades" } }));

  assert.equal(report.overall, "healthy");
  assert.equal(report.mode.id, "nades");
  assert.equal(report.checks.at(-1).id, "nades");
  assert.equal(report.nades.relevant, true);
  assert.equal(report.versions.find((item) => item.key === "MATCHZY").relevant, true);
});

test("buildDiagnostics reports incomplete enabled optional plugins", () => {
  const report = buildDiagnostics(input({ desired: { serverMode: "matchzy", simpleAdminEnabled: true } }));
  assert.equal(report.overall, "critical");
  assert.equal(report.plugins[0].id, "simpleadmin");
  assert.match(report.findings[0].title, /SimpleAdmin/);
});
