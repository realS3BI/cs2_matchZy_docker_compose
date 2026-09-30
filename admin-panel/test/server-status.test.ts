import test from "node:test";
import assert from "node:assert/strict";
import { serverPresentation } from "../client/src/lib/server-status.js";

test("missing and failed status checks never report a stopped or healthy server", () => {
  assert.equal(serverPresentation().label, "Status unbekannt");
  assert.equal(serverPresentation({ service: { state: "future-state" } }).label, "Status unbekannt");
  for (const unavailable of [false, true]) {
    const result = serverPresentation({ service: { state: "running", ok: false } }, null, unavailable);
    assert.equal(result.label, "Status nicht verfügbar");
    assert.equal(result.tone, "warning");
  }
  assert.equal(serverPresentation({ service: { state: "running", ok: true } }, null, true).tone, "warning");
});

test("Docker inspect and Compose health results override the running state", () => {
  for (const Health of ["unhealthy", { Status: "unhealthy" }]) {
    assert.equal(serverPresentation({ service: { state: "running", raw: { Health } } }).tone, "destructive");
  }
  for (const Health of ["starting", { Status: "starting" }]) {
    assert.equal(serverPresentation({ service: { state: "running", raw: { Health } } }).label, "Server startet");
  }
  assert.equal(serverPresentation({ service: { state: "running", raw: "unparsed" } }).label, "Server läuft");
});

test("normal stops, crashes and paused containers are distinguished", () => {
  assert.equal(serverPresentation({ service: { state: "exited", raw: { ExitCode: 0 } } }).label, "Server gestoppt");
  for (const raw of [{ ExitCode: 1 }, { OOMKilled: true }, { Error: "failed" }]) {
    assert.equal(serverPresentation({ service: { state: "exited", raw } }).tone, "destructive");
  }
  assert.equal(serverPresentation({ service: { state: "paused" } }).label, "Server pausiert");
  assert.equal(serverPresentation({ service: { state: "created" } }).label, "Noch nicht gestartet");
  assert.equal(serverPresentation({ service: { state: "not-created" } }).label, "Nicht eingerichtet");
  assert.equal(serverPresentation({ service: { state: "restarting" } }).icon, "loading");
});

test("active operations take priority over the previous snapshot", () => {
  const status = { service: { state: "running" } };
  assert.equal(serverPresentation(status, { kind: "apply", phase: "working" }).label, "Wird übernommen");
  assert.equal(serverPresentation(status, { kind: "restart", phase: "working" }).label, "Server startet neu");
  assert.equal(serverPresentation(status, { kind: "restart", phase: "refreshing" }, true).label, "Status wird geprüft");
});
