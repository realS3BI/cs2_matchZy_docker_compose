import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { applyWebNadeAction } from "../src/nade-review.js";
import { createApp } from "../src/app.js";
import { lineupPermissions } from "../shared/lineup-policy.js";

const owner = "76561198000000001";
const player = { identitySteam64: owner, role: "player" };
const admin = { identitySteam64: "76561198000000002", role: "admin" };
const entry = { owner, name: "window", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "0 90 0", desc: "Alt", updatedAt: "2026-09-01T00:00:00.000Z", captureId: "capture-one", lineupImages: [{ key: "image.png", url: "/api/uploads/abc123.png", name: "Ausrichtung" }] };
const request = { owner, name: entry.name, map: entry.map, revision: entry.updatedAt, action: "submit" };
const denied = status => error => error.status === status;
const creation = { action: "create", map: "de_mirage", patch: {
  displayName: "Fenster über T-Spawn", type: "Smoke", team: "t", lineupPos: "1 2 3", lineupAng: "0 90 0",
  desc: "Links ausrichten, dann werfen.", radarFrom: { x: .25, y: .75 }, radarTo: { x: .5, y: .1 },
  is_jumpthrow: true, click_type: "left",
} };

test("manual creation assigns the session admin as owner and creates a distinct, editable draft", () => {
  const entries = applyWebNadeAction([entry], { ...creation, owner: "default", role: "player", official: true, mustKnow: true }, admin);
  const created = entries[1];
  assert.equal(entries[0], entry);
  assert.equal(created.owner, admin.identitySteam64);
  assert.equal(created.map, creation.map);
  assert.equal(created.displayName, creation.patch.displayName);
  assert.match(created.name, /^web_[0-9a-f-]+$/);
  assert.equal(created.official, false);
  assert.equal(created.mustKnow, false);
  assert.equal(created.reviewStatus, "");
  assert.equal(created.flightDuration, undefined);
  assert.deepEqual(created.radarFrom, creation.patch.radarFrom);
  assert.equal(lineupPermissions(created, admin).edit, true);
  assert.notEqual(applyWebNadeAction(entries, creation, admin)[2].name, created.name);
  const updated = applyWebNadeAction(entries, { ...created, action: "edit", revision: created.updatedAt, patch: { desc: "Überarbeitet" } }, admin);
  assert.equal(updated[1].desc, "Überarbeitet");
});

test("manual creation rejects other roles, forged fields and invalid throw data", () => {
  for (const role of ["player", "training_player", "match_admin"]) {
    assert.throws(() => applyWebNadeAction([entry], { ...creation, role: "admin" }, { ...admin, role }), denied(403));
  }
  assert.throws(() => applyWebNadeAction([], creation, undefined), denied(403));
  for (const key of ["owner", "map", "name", "official", "mustKnow", "reviewStatus", "lineupImages", "updatedAt", "flightDuration"]) {
    assert.throws(() => applyWebNadeAction([], { ...creation, patch: { ...creation.patch, [key]: "forged" } }, admin), denied(400));
  }
  for (const patch of [{ displayName: " " }, { lineupPos: "" }, { lineupAng: "NaN 0 0" }, { type: "invalid" }, { radarTo: { x: 2, y: 0 } }, { desc: "x".repeat(4001) }]) {
    assert.throws(() => applyWebNadeAction([], { ...creation, patch: { ...creation.patch, ...patch } }, admin), denied(400));
  }
  for (const map of ["", "de_mirage\n", null]) {
    assert.throws(() => applyWebNadeAction([], { ...creation, map }, admin), denied(400));
  }
});

test("owners edit their draft directly, preserving identity, media and unrelated recordings", () => {
  const foreign = { ...entry, owner: admin.identitySteam64 };
  const [updated, untouched] = applyWebNadeAction([{ ...entry, reviewStatus: "pending" }, foreign], { ...request, action: "edit", patch: {
    displayName: "Fenster über T-Spawn", team: "ct", desc: "Links ausrichten, dann werfen.", is_jumpthrow: true, radarFrom: { x: .25, y: .75 }, radarTo: { x: .5, y: .1 },
  } }, player);
  assert.equal(updated.name, entry.name);
  assert.equal(updated.owner, owner);
  assert.equal(updated.map, entry.map);
  assert.equal(updated.captureId, entry.captureId);
  assert.equal(updated.lineupImages[0].url, entry.lineupImages[0].url);
  assert.equal(updated.reviewStatus, "");
  assert.equal(updated.team, "ct");
  assert.equal(updated.displayName, "Fenster über T-Spawn");
  assert.notEqual(updated.updatedAt, entry.updatedAt);
  assert.deepEqual(updated.radarFrom, { x: .25, y: .75 });
  assert.equal(untouched, foreign);
  assert.deepEqual(applyWebNadeAction([entry, foreign], { ...request, action: "delete" }, player), [foreign]);
});

test("owner actions reject foreign, official and stale recordings and permission-changing fields", () => {
  for (const action of ["edit", "delete", "submit"]) {
    if (action !== "delete") assert.throws(() => applyWebNadeAction([entry], { ...request, action, actor: owner }, admin), denied(403));
    assert.throws(() => applyWebNadeAction([{ ...entry, official: true }], { ...request, action }, player), denied(403));
    assert.throws(() => applyWebNadeAction([entry], { ...request, action, revision: "old" }, player), denied(409));
  }
  for (const key of ["owner", "map", "name", "official", "mustKnow", "reviewStatus", "lineupImages", "updatedAt"]) {
    assert.throws(() => applyWebNadeAction([entry], { ...request, action: "edit", patch: { [key]: "forged" } }, player), denied(400));
  }
  assert.throws(() => applyWebNadeAction([entry], { ...request, action: "approve", role: "admin" }, player), denied(403));
  assert.throws(() => applyWebNadeAction([entry], { ...request, action: "edit", patch: { radarFrom: { x: 2, y: 0 } } }, player));
  assert.throws(() => applyWebNadeAction([entry], { ...request, action: "edit", patch: { team: "invalid" } }, player), denied(400));
  assert.throws(() => applyWebNadeAction([], request, player), denied(404));
});

test("platform admins can delete all recordings while other roles retain owner restrictions", () => {
  for (const owner of [entry.owner, admin.identitySteam64, "default"]) {
    for (const official of [false, true]) {
      const recording = { ...entry, owner, official, mustKnow: official };
      const deletion = { ...request, owner, action: "delete" };
      const untouched = { ...entry, name: "other" };
      assert.equal(lineupPermissions(recording, admin).delete, true);
      assert.deepEqual(applyWebNadeAction([recording, untouched], deletion, admin), [untouched]);
      assert.throws(() => applyWebNadeAction([recording], { ...deletion, revision: "old" }, admin), denied(409));
      for (const role of ["player", "training_player", "match_admin"]) {
        const user = { ...admin, role };
        const ownDraft = owner === user.identitySteam64 && !official;
        assert.equal(lineupPermissions(recording, user).delete, ownDraft);
        if (!ownDraft) assert.throws(() => applyWebNadeAction([recording], { ...deletion, role: "admin" }, user), denied(403));
      }
      assert.equal(lineupPermissions(recording).delete, false);
    }
  }
});

test("review transitions separate owner submission from admin approval and Must Know", () => {
  const [submitted] = applyWebNadeAction([entry], request, { ...player, role: "match_admin" });
  assert.equal(submitted.reviewStatus, "pending");
  const [rejected] = applyWebNadeAction([submitted], { ...request, revision: submitted.updatedAt, action: "reject" }, admin);
  assert.equal(rejected.reviewStatus, "rejected");
  const [approved] = applyWebNadeAction([submitted], { ...request, revision: submitted.updatedAt, action: "approve" }, admin);
  assert.equal(approved.official, true);
  assert.equal(approved.reviewStatus, "approved");
  const [mustKnow] = applyWebNadeAction([approved], { ...request, revision: approved.updatedAt, action: "mustKnow", value: true }, admin);
  assert.equal(mustKnow.mustKnow, true);
  const [revoked] = applyWebNadeAction([mustKnow], { ...request, revision: mustKnow.updatedAt, action: "revoke" }, admin);
  assert.equal(revoked.official, false);
  assert.equal(revoked.mustKnow, false);
  assert.equal(revoked.reviewStatus, "");
  assert.throws(() => applyWebNadeAction([entry], { ...request, action: "mustKnow", value: true }, admin), denied(400));
});

test("authenticated endpoint enforces owner and role from the session, and serializes revisions", async t => {
  let user = player;
  let entries = [entry];
  const app = createApp({ config: { sessionSecret: "test-secret" }, compose: {}, nadesSync: null, store: {
    getSession: async () => ({ purpose: "user", steamId: user.identitySteam64 }),
    getUser: async () => user,
    getNades: async () => structuredClone(entries),
    saveNades: async value => { await new Promise(resolve => setTimeout(resolve, 10)); entries = value; return entries; },
  } });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/nades/entry`;
  const send = (body, authenticated = true) => fetch(url, { method: "POST", headers: {
    "Content-Type": "application/json", ...(authenticated ? { Cookie: `cs2_panel_session=${"a".repeat(43)}` } : {}),
  }, body: JSON.stringify(body) });
  assert.equal((await send(request, false)).status, 401);
  assert.equal((await send({ ...request, action: "approve", role: "admin" })).status, 403);
  const results = await Promise.all([send(request), send(request)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(entries[0]["reviewStatus"], "pending");
  user = { ...player, identitySteam64: admin.identitySteam64 };
  assert.equal((await send({ ...request, revision: entries[0].updatedAt, action: "delete", actor: owner })).status, 403);
  user = admin;
  assert.equal((await send({ ...request, revision: entries[0].updatedAt, action: "approve" })).status, 200);
  for (const [path, method] of [["/api/nades", "PUT"], ["/api/nades/import", "POST"]]) {
    const legacy = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: `cs2_panel_session=${"a".repeat(43)}` }, body: JSON.stringify({ entries: [], matchzyConfig: {} }) });
    assert.equal(legacy.status, 410);
    assert.equal(entries.length, 1);
  }
  user = player;
  assert.equal((await send({ ...request, revision: entries[0].updatedAt, action: "edit", patch: { desc: "Trotz Freigabe" } })).status, 403);
  user = admin;
  assert.equal((await send({ ...request, revision: entries[0].updatedAt, action: "delete" })).status, 200);
  assert.equal(entries.length, 0);
  user = player;
  assert.equal((await send({ ...creation, role: "admin", owner: admin.identitySteam64 })).status, 403);
  user = admin;
  const creations = await Promise.all([send(creation), send(creation)]);
  assert.deepEqual(creations.map(result => result.status), [200, 200]);
  assert.equal(entries.length, 2);
  const created = ((await creations[0].json()) as any).entry;
  assert.equal(created.owner, admin.identitySteam64);
  assert.equal(created.official, false);
  assert.notEqual(entries[0].name, entries[1].name);
  assert.equal((await send({ ...creation, patch: { ...creation.patch, lineupPos: "invalid" } })).status, 400);
  assert.equal(entries.length, 2);
});
