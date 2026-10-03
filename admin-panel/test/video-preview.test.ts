import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { createVideoPreviewCache, installVideoPreviews } from "../src/video-preview.js";
import { reviewMediaFixture } from "./review-fixtures.js";
import { createApp } from "../src/app.js";
import { createReviewFileRouter } from "../src/uploadthing.js";

const file = reviewMediaFixture.video!;

test("a verified video upload prepares its preview without blocking or failing the upload", async () => {
  const admin = { identitySteam64: "76561198000000001", role: "admin" };
  let entries: any[] = [{ owner: admin.identitySteam64, map: "de_mirage", name: "window", updatedAt: "2026-10-02T08:00:00.000Z" }];
  let prepared;
  const router = createReviewFileRouter({ config: {},
    store: { getUser: async () => admin, getNades: async () => entries },
    changeEntries: async change => entries = change(entries), utapi: { deleteFiles: async () => {} },
    preparePreview: async source => { prepared = source; throw Error("encoder unavailable"); },
  });
  const result = await router.reviewVideo.onUploadComplete({ metadata: {
    owner: admin.identitySteam64, map: "de_mirage", name: "window", revision: entries[0].updatedAt,
    slot: "video", actor: admin.identitySteam64, role: "admin",
  }, file: { ...file, ufsUrl: file.url, type: file.mime } } as any);
  assert.equal(result.saved, true);
  assert.equal(prepared.key, file.key);
  assert.equal(entries[0].reviewMedia.video.key, file.key);
});

test("preview requests coalesce, cache their output and remove downloaded originals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-test-"));
  try {
    let downloads = 0, encodes = 0;
    const preview = createVideoPreviewCache({ directory,
      download: async () => { downloads++; return new Response("source video"); },
      encode: async (input, output) => { encodes++; assert.equal(await readFile(input, "utf8"), "source video"); await writeFile(output, "small preview"); },
    });
    const paths = await Promise.all(Array.from({ length: 8 }, () => preview(file)));
    assert.equal(new Set(paths).size, 1);
    assert.equal(downloads, 1);
    assert.equal(encodes, 1);
    assert.equal(await preview(file), paths[0]);
    assert.deepEqual(await readdir(directory), [`${file.key}.mp4`]);
    assert.equal(downloads, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed encoding leaves no original and can be retried", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-test-"));
  try {
    let failed = true;
    const preview = createVideoPreviewCache({ directory, download: async () => new Response("source"),
      encode: async (_, output) => { if (failed) throw Error("encoder failed"); await writeFile(output, "preview"); },
    });
    await assert.rejects(preview(file), /encoder failed/);
    assert.deepEqual(await readdir(directory), []);
    failed = false;
    assert.ok(await preview(file));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("preview generation rejects untrusted URLs and oversized downloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-test-"));
  try {
    let downloads = 0;
    const preview = createVideoPreviewCache({ directory,
      download: async () => { downloads++; return new Response("source", { headers: { "content-length": String(129 * 1024 * 1024) } }); },
      encode: async () => { assert.fail("oversized source must not reach the encoder"); },
    });
    await assert.rejects(preview({ ...file, url: "http://127.0.0.1/private" }), /Review-Datei/);
    assert.equal(downloads, 0);
    await assert.rejects(preview(file), /geladen/);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("preview encoding concurrency is bounded without rejecting a request for an in-flight key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-test-"));
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  try {
    const preview = createVideoPreviewCache({ directory, download: async () => new Response("source"),
      encode: async (_, output) => { await hold; await writeFile(output, "preview"); },
    });
    const other = key => ({ ...file, key, url: `https://test.ufs.sh/f/${key}` });
    const first = preview(file), second = preview(other("second"));
    // Wait for the async cache probes to complete.
    await new Promise(resolve => setTimeout(resolve, 30));
    await assert.rejects(preview(other("third")), { status: 503 });
    const duplicate = preview(file);
    release();
    assert.equal((await Promise.all([first, second, duplicate]))[0], await duplicate);
  } finally { release(); await rm(directory, { recursive: true, force: true }); }
});

test("preview endpoint requires an official upload and checks a withdrawal during encoding", async () => {
  let entries = [{ official: false, reviewMedia: { video: file } }];
  let generated = 0;
  const app = express();
  installVideoPreviews(app, { store: { getNades: async () => entries }, preview: async () => { generated++; entries[0].official = false; return "/unused.mp4"; } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/nades/video-preview/${file.key}`;
  try {
    assert.equal((await fetch(url)).status, 404);
    assert.equal(generated, 0);
    entries[0].official = true;
    assert.equal((await fetch(url)).status, 404);
    assert.equal(generated, 1);
    entries = [];
    assert.equal((await fetch(url)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("all website roles can request previews while anonymous requests remain authenticated", async () => {
  let role = "player";
  const app = createApp({ config: { sessionSecret: "preview-test-secret" }, compose: {}, nadesSync: null,
    store: {
      getSession: async () => ({ purpose: "user", steamId: "76561198000000001" }),
      getUser: async () => ({ identitySteam64: "76561198000000001", role }),
      getNades: async () => [],
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/nades/video-preview/missing-video`;
  try {
    assert.equal((await fetch(url)).status, 401);
    for (role of ["player", "training_player", "match_admin", "admin"]) {
      assert.equal((await fetch(url, { headers: { Cookie: `cs2_panel_session=${"a".repeat(43)}` } })).status, 404, role);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
