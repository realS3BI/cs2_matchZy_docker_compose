import test from "node:test";
import assert from "node:assert/strict";
import { attachReviewMedia, reviewEntry, sanitizeReviewMedia } from "../src/review-media.js";
import { applyGameReviewDecision, applyWebNadeAction } from "../src/nade-review.js";
import { sanitizeNades } from "../src/validators.js";
import { reviewMediaFixture } from "./review-fixtures.js";
import { missingReviewMedia, reviewFileError, reviewPresentationError, VIDEO_LIMIT } from "../shared/review-media.js";
import express from "express";
import cookieParser from "cookie-parser";
import { installReviewUploads, createReviewFileRouter } from "../src/uploadthing.js";

const owner = { identitySteam64: "76561198000000001", role: "player" };
const admin = { identitySteam64: "76561198000000002", role: "admin" };
const entry = { owner: owner.identitySteam64, map: "de_anubis", name: "window", type: "Smoke", lineupPos: "1 2 3", lineupAng: "4 5 6", updatedAt: "2026-10-02T08:00:00.000Z" };
const input = { owner: entry.owner, map: entry.map, name: entry.name, slot: "aim", revision: entry.updatedAt };
const file = reviewMediaFixture.aim!;

test("front photos require the corrected server camera while other photos keep v2 compatibility", () => {
  assert.equal(reviewPresentationError("front", "review-v4"), "");
  for (const version of [undefined, "review-v1", "review-v2", "review-v3", "unknown"])
    assert.match(reviewPresentationError("front", version), /Server-Plugin 2\.3\.2/);
  for (const slot of ["aim", "position", "effect"] as const) {
    assert.equal(reviewPresentationError(slot, "review-v2"), "");
    assert.equal(reviewPresentationError(slot, "review-v3"), "");
    assert.equal(reviewPresentationError(slot, "review-v4"), "");
    assert.ok(reviewPresentationError(slot, "unknown"));
  }
});

test("review files are scoped to a lineup, owner/admin permission and current revision", () => {
  const [result] = attachReviewMedia([entry], input, owner, file);
  assert.equal(result.reviewMedia.aim.url, file.url);
  assert.equal(result.reviewMedia.aim.uploadedBy, owner.identitySteam64);
  assert.equal(missingReviewMedia(result).length, 4);
  assert.deepEqual(attachReviewMedia([result], input, owner, file), [result]);
  assert.throws(() => attachReviewMedia([result], input, owner, { ...file, key: "other", url: "https://test.ufs.sh/f/other" }), { status: 409 });
  assert.throws(() => attachReviewMedia([entry], input, { ...owner, identitySteam64: "76561198000000003" }, file), { status: 403 });
  assert.throws(() => attachReviewMedia([{ ...entry, official: true }], input, admin, file), { status: 403 });
  assert.throws(() => reviewEntry([], input, admin), { status: 404 });
  const [reviewed] = attachReviewMedia([{ ...entry, reviewStatus: "pending" }], input, admin, file);
  assert.equal(reviewed.reviewStatus, "pending");
  assert.equal(reviewed.reviewMedia.aim.uploadedBy, admin.identitySteam64);
  assert.equal(attachReviewMedia([{ ...entry, reviewStatus: "pending" }], input, owner, file)[0].reviewStatus, "");
});

test("media validation rejects forged storage URLs, wrong slots, formats and oversized files", () => {
  assert.deepEqual(sanitizeReviewMedia(reviewMediaFixture), reviewMediaFixture);
  for (const patch of [{ url: "javascript:alert(1)" }, { url: "https://evil.example/file" }, { url: "https://test.ufs.sh/f/wrong" }, { mime: "image/svg+xml" }, { size: -1 }, { uploadedBy: "admin" }]) {
    assert.throws(() => sanitizeReviewMedia({ aim: { ...file, ...patch } }));
  }
  assert.throws(() => sanitizeReviewMedia({ extra: file }));
  assert.ok(reviewFileError("video", { type: "video/webm", size: VIDEO_LIMIT + 1 }));
  assert.ok(reviewFileError("aim", { type: "video/webm", size: 100 }));
  assert.equal(reviewFileError("video", { type: "video/mp4", size: VIDEO_LIMIT }), "");
  assert.deepEqual(sanitizeNades([{ ...entry, reviewMedia: reviewMediaFixture }])[0].reviewMedia, reviewMediaFixture);
});

test("web and game approval require all perspectives and the current platform admin", () => {
  const request = { ...input, action: "approve", id: "a".repeat(32), actor: admin.identitySteam64 };
  assert.throws(() => applyWebNadeAction([entry], request, admin), /vier Review-Fotos/);
  const complete = { ...entry, reviewMedia: reviewMediaFixture };
  assert.equal(applyGameReviewDecision([complete], request, admin)[0].official, true);
  for (const user of [owner, { ...admin, role: "match_admin" }, undefined]) assert.throws(() => applyGameReviewDecision([complete], request, user), { status: 403 });
  assert.throws(() => applyGameReviewDecision([complete], { ...request, revision: "stale" }, admin), { status: 409 });
  assert.throws(() => applyWebNadeAction([entry], { ...input, action: "edit", patch: { reviewMedia: reviewMediaFixture } }, owner), { status: 400 });
});

test("UploadThing middleware authenticates before presigning and rejects cross-origin and mismatched files", async () => {
  const config = { publicUrl: "https://playbook.example", sessionSecret: "test" };
  const store = { getSession: async () => ({ purpose: "user", steamId: owner.identitySteam64 }), getUser: async () => owner, getNades: async () => [entry] };
  const router = createReviewFileRouter({ config, store, changeEntries: null, utapi: null });
  const req = { headers: { origin: config.publicUrl }, cookies: { cs2_panel_session: "a".repeat(43) } };
  const args = { req: req as any, res: {} as any, input, files: [{ name: "aim.jpg", type: "image/jpeg", size: 100 }] };
  const metadata = await router.reviewPhoto.middleware(args);
  assert.equal(metadata.actor, owner.identitySteam64);
  await assert.rejects(async () => router.reviewPhoto.middleware({ ...args, req: { ...req, cookies: {} } as any }), /anmelden/);
  await assert.rejects(async () => router.reviewPhoto.middleware({ ...args, req: { ...req, headers: { origin: "https://evil.example" } } as any }), /Herkunft/);
  await assert.rejects(async () => router.reviewPhoto.middleware({ ...args, input: { ...input, slot: "video" } }), /MP4/);
});

test("verified callbacks attach once, preserve on replay and clean up rejected uploads", async () => {
  let entries: any[] = [entry];
  let user: any = admin;
  const deleted: string[] = [];
  const store = { getUser: async () => user, getNades: async () => entries };
  const router = createReviewFileRouter({ config: {}, store, changeEntries: async change => entries = change(entries), utapi: { deleteFiles: async key => deleted.push(key) } });
  const args: any = { metadata: { ...input, actor: admin.identitySteam64, role: "admin" }, file: { ...file, ufsUrl: file.url, type: file.mime } };
  assert.equal((await router.reviewPhoto.onUploadComplete(args)).saved, true);
  assert.equal(entries[0].reviewMedia.aim.key, file.key);
  entries[0].official = true;
  assert.equal((await router.reviewPhoto.onUploadComplete(args)).saved, true);
  assert.deepEqual(deleted, []);
  user = { ...admin, role: "player" };
  await assert.rejects(async () => router.reviewPhoto.onUploadComplete({ ...args, file: { ...args.file, key: "unassigned" } }));
  assert.deepEqual(deleted, ["unassigned"]);
});


test("public UploadThing HTTP callbacks require a valid SDK signature", async t => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  let changed = false;
  const token = Buffer.from(JSON.stringify({ apiKey: "sk_test_signature_only", appId: "test", regions: ["fra1"] })).toString("base64");
  installReviewUploads(app, { config: { uploadthingToken: token, publicUrl: "http://localhost" },
    store: { getNades: async () => [entry] }, changeEntries: async () => { changed = true; } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const response = await fetch(`http://127.0.0.1:${address.port}/api/uploadthing?slug=reviewPhoto`, {
    method: "POST", headers: { "Content-Type": "application/json", "uploadthing-hook": "callback", "x-uploadthing-signature": "hmac-sha256=invalid" },
    body: JSON.stringify({ status: "uploaded", metadata: { ...input, actor: admin.identitySteam64, role: "admin" }, file: { ...file, ufsUrl: file.url, type: file.mime } }),
  });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /signature/i);
  assert.equal(changed, false);
});
