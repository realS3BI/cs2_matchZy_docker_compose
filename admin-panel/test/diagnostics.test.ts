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
    probe: { ok: true, stdout: healthyProbe, stderr: "" },
    logs: "[pre.sh] Mod bootstrap complete\n[MatchZy 0.8.15 LOADED] MatchZy by WD-",
    desired: { MATCHZY_VERSION: "latest" },
    controlMode: "docker",
    ...patch
  };
}

test("parseProbeOutput reads only file and version records", () => {
  assert.deepEqual(parseProbeOutput("FILE\tmatchZy\t1\nSECRET\tTOKEN\tvalue\nVERSION\tMATCHZY\t0.8.15"), {
    files: { matchZy: true },
    versions: { MATCHZY: "0.8.15" }
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
