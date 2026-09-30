import test from "node:test";
import assert from "node:assert/strict";
import { fetchUsers, fetchDiagnostics } from "../client/src/lib/admin-data.js";
import { buildDiagnostics } from "../src/diagnostics.js";

const report = () => buildDiagnostics({ service: { state: "stopped" }, container: null, probe: { ok: false, stdout: "", stderr: "" }, logs: "", desired: {}, controlMode: "docker" });
function respond(t, body, status = 200) {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status }));
}

test("users loader rejects the empty response that crashed /access", async t => {
  respond(t, {});
  await assert.rejects(fetchUsers(), /Benutzerliste/);
});
test("diagnostics loader rejects the empty response that crashed /diagnostics", async t => {
  respond(t, {});
  await assert.rejects(fetchDiagnostics(), /Diagnosebericht/);
});
test("users loader accepts a real empty list and registered users", async t => {
  respond(t, { entries: [] });
  assert.deepEqual(await fetchUsers(), []);
  const entries = [{ identitySteam64: "76561198000000001", name: "Test", role: "admin" }];
  respond(t, { entries });
  assert.deepEqual(await fetchUsers(), entries);
});
test("diagnostics loader accepts server reports including stopped containers", async t => {
  const expected = report();
  respond(t, expected);
  assert.deepEqual(await fetchDiagnostics(), expected);
});
test("malformed lists and missing report sections never reach React state", async t => {
  for (const entries of [null, {}, [null]]) {
    respond(t, { entries });
    await assert.rejects(fetchUsers(), /Benutzerliste/);
  }
  for (const patch of [{ versions: null }, { checks: [null] }, { findings: {} }, { service: null }, { nades: null }, { plugins: [{ status: "fail" }] }]) {
    respond(t, { ...report(), ...patch });
    await assert.rejects(fetchDiagnostics(), /Diagnosebericht/);
  }
});
test("HTTP errors remain visible to the page instead of becoming empty data", async t => {
  respond(t, { error: "Zugriff verweigert" }, 403);
  await assert.rejects(fetchUsers(), /Zugriff verweigert/);
  await assert.rejects(fetchDiagnostics(), /Zugriff verweigert/);
});
