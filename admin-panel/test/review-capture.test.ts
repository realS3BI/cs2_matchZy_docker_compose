import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, chown, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReviewCaptureBridge } from "../src/review-capture.js";

test("capture leases isolate browser tabs and Steam IDs; commands expire and acknowledgements deduplicate", async t => {
  const directory = await mkdtemp(join(tmpdir(), "playbook-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bridge = new ReviewCaptureBridge(directory);
  const actor = "76561198000000001";
  const other = "76561198000000002";
  const reference = { owner: "default", map: "de_anubis", name: "window" };
  const session = await bridge.start(actor, reference, 1000);
  await assert.rejects(() => bridge.start(actor, reference, 1001), { status: 409 });
  await assert.rejects(() => bridge.session(other, session.id, 1001), { status: 409 });
  const command = { id: "a".repeat(32), sessionId: session.id, action: "photo", slot: "aim", notBefore: 4000, expiresAt: 30_000 };
  const put = data => writeFile(join(directory, actor, "command.json"), JSON.stringify(data));
  let validations = 0;
  const validate = async ref => { assert.equal(ref.name, reference.name); validations++; };
  await put(command);
  assert.equal(await bridge.poll(actor, session.id, validate, 3999), null);
  assert.deepEqual(await bridge.poll(actor, session.id, validate, 4000), { id: command.id, action: "photo", slot: "aim" });
  await assert.rejects(() => bridge.acknowledge(actor, { sessionId: session.id, commandId: "wrong", ok: true }, 4001), { status: 409 });
  await bridge.acknowledge(actor, { sessionId: session.id, commandId: command.id, ok: true }, 4001);
  assert.equal(await bridge.poll(actor, session.id, validate, 4002), null);
  await put({ ...command, id: "b".repeat(32), expiresAt: 4000 });
  assert.equal(await bridge.poll(actor, session.id, validate, 4003), null);
  await put({ ...command, id: "c".repeat(32), sessionId: "another-tab" });
  assert.equal(await bridge.poll(actor, session.id, validate, 4004), null);
  await put({ ...command, id: "d".repeat(32), slot: "video" });
  assert.equal(await bridge.poll(actor, session.id, validate, 4005), null);
  assert.ok(validations > 0);
  await assert.rejects(() => bridge.poll(actor, session.id, async () => { throw new Error("role revoked"); }, 5000), /role revoked/);
  await bridge.stop(actor, "another-tab");
  assert.equal((await bridge.session(actor, session.id, 5000)).id, session.id);
  await bridge.stop(actor, session.id);
  await assert.rejects(() => bridge.session(actor, session.id, 5000), { status: 409 });
  const next = await bridge.start(actor, reference, 6000);
  assert.notEqual(next.id, session.id);
  await assert.rejects(() => bridge.session(actor, next.id, 96_001), { status: 409 });
});

test("simultaneous connection attempts grant only one browser a lease", async t => {
  const directory = await mkdtemp(join(tmpdir(), "playbook-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bridge = new ReviewCaptureBridge(directory);
  const connect = () => bridge.start("76561198000000001", { owner: "default", map: "de_anubis", name: "window" });
  const results = await Promise.allSettled([connect(), connect()]);
  assert.deepEqual(results.map(r => r.status).sort(), ["fulfilled", "rejected"]);
});


test("CS2's steam user can write a command into a browser-created session directory", { skip: process.platform !== "linux" || process.getuid?.() !== 0 }, async t => {
  const parent = await mkdtemp(join(tmpdir(), "playbook-shared-review-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  // MatchZy's directory belongs to steam; the webpanel container runs as root.
  await chown(parent, 1000, 1000);
  await chmod(parent, 0o755);
  const directory = join(parent, "savednades.review");
  const actor = "76561198000000001";
  const bridge = new ReviewCaptureBridge(directory);
  const session = await bridge.start(actor, { owner: actor, map: "de_anubis", name: "ct_to_a_main" });
  const command = { id: "a".repeat(32), sessionId: session.id, action: "photo", slot: "aim", notBefore: 0, expiresAt: Date.now() + 30_000 };
  const issue = () => spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { readFileSync, writeFileSync, renameSync } from 'node:fs';
    const folder = process.argv[1];
    JSON.parse(readFileSync(folder + '/session.json', 'utf8'));
    writeFileSync(folder + '/command.json.tmp', process.argv[2]);
    renameSync(folder + '/command.json.tmp', folder + '/command.json');
  `, join(directory, actor), JSON.stringify(command)], { uid: 1000, gid: 1000, encoding: "utf8" });
  const result = issue();
  assert.equal(result.status, 0, `Aufnahmesignal konnte nicht gespeichert werden: ${result.stderr}`);
  assert.equal((await bridge.poll(actor, session.id, async () => {}))?.id, command.id);

  // An already-connected browser must repair old root-owned directories too.
  await chown(directory, 0, 0);
  await chown(join(directory, actor), 0, 0);
  await chmod(join(directory, actor, "session.json"), 0o600);
  await bridge.poll(actor, session.id, async () => {});
  const repaired = issue();
  assert.equal(repaired.status, 0, `Bestehende Sitzung wurde nicht repariert: ${repaired.stderr}`);
});

test("photos require server preparation and release the game before upload acknowledgement", async t => {
  const directory = await mkdtemp(join(tmpdir(), "playbook-photo-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bridge = new ReviewCaptureBridge(directory);
  const actor = "76561198000000001";
  const session = await bridge.start(actor, { owner: actor, map: "de_anubis", name: "ct_to_a_main" }, 1000);
  const request = await bridge.requestPhoto(actor, session.id, "front", 1100);
  assert.equal(await bridge.poll(actor, session.id, async () => {}, 1200), null);
  await assert.rejects(() => bridge.requestPhoto(actor, session.id, "aim", 1300), { status: 409 });
  await assert.rejects(() => bridge.requestPhoto(actor, session.id, "video", 1300), { status: 400 });
  const command = { id: request.id, sessionId: session.id, action: "photo", slot: "front", presentation: "review-v3", notBefore: 5000, expiresAt: 30_000 };
  const put = (name, data) => writeFile(join(directory, actor, `${name}.json`), JSON.stringify(data));
  await put("command", command);
  assert.equal(await bridge.poll(actor, session.id, async () => {}, 4999), null);
  assert.deepEqual(await bridge.poll(actor, session.id, async () => {}, 5000), { id: request.id, action: "photo", slot: "front", presentation: "review-v3" });
  await assert.rejects(() => bridge.captured(actor, { sessionId: session.id, commandId: "wrong" }, 5001), { status: 409 });
  await bridge.captured(actor, { sessionId: session.id, commandId: request.id }, 5001);
  assert.equal(JSON.parse(await readFile(join(directory, actor, "captured.json"), "utf8")).commandId, request.id);
  assert.equal(await bridge.poll(actor, session.id, async () => {}, 5002), null);
  // Taking the photo is not an upload acknowledgement; the plugin can restore
  // the game while the upload is still pending and a second request is blocked.
  await assert.rejects(() => bridge.requestPhoto(actor, session.id, "aim", 5100), { status: 409 });
  await bridge.acknowledge(actor, { sessionId: session.id, commandId: request.id, ok: true }, 5200);
  const next = await bridge.requestPhoto(actor, session.id, "aim", 5300);
  assert.notEqual(next.id, request.id);
  await put("request-result", { sessionId: session.id, commandId: next.id, ok: false, message: "Kamera nicht verfügbar" });
  assert.deepEqual(await bridge.poll(actor, session.id, async () => {}, 5400), { id: next.id, action: "error", message: "Kamera nicht verfügbar" });
  assert.equal(JSON.parse(await readFile(join(directory, actor, "result.json"), "utf8")).commandId, request.id);
  assert.notEqual((await bridge.requestPhoto(actor, session.id, "aim", 5500)).id, next.id);
  await put("result", { sessionId: session.id, commandId: request.id, ok: false });
  await assert.rejects(() => bridge.captured(actor, { sessionId: session.id, commandId: request.id }, 5600), { status: 409 });
});
