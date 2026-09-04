import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

test("healthz is public while diagnostics remain authenticated", async () => {
  const app = createApp({
    config: {
      password: "test-password",
      sessionSecret: "test-session-secret"
    },
    store: {
      logAction: async () => undefined
    },
    compose: {},
    nadesSync: null
  });
  const server = createServer(app);

  try {
    const address: any = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${baseUrl}/healthz`);
    const diagnostics = await fetch(`${baseUrl}/api/server/diagnostics`);

    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: "cs2-matchzy-admin" });
    assert.equal(diagnostics.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("authenticated lineup uploads are stored locally", async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), "matchzy-uploads-"));
  const app = createApp({
    config: {
      password: "test-password",
      sessionSecret: "test-session-secret",
      uploadDir
    },
    store: {
      logAction: async () => undefined
    },
    compose: {},
    nadesSync: null
  });
  const server = createServer(app);

  try {
    const address: any = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" })
    });
    const cookie = String(login.headers.get("set-cookie")).split(";")[0];
    const content = Buffer.from("test-image");
    const upload = await fetch(`${baseUrl}/api/uploads/lineup-image`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/png", "X-File-Name": encodeURIComponent("lineup.png") },
      body: content
    });
    const image: any = await upload.json();

    assert.equal(upload.status, 200);
    assert.match(image.url, /^\/api\/uploads\/[0-9a-f-]+\.png$/);
    assert.deepEqual(await readFile(join(uploadDir, image.key)), content);

    const served = await fetch(`${baseUrl}${image.url}`, { headers: { Cookie: cookie } });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), content);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test("authenticated nades status reports sync health and library version", async () => {
  const updatedAt = new Date("2026-09-04T09:00:00.000Z");
  const app = createApp({
    config: {
      password: "test-password",
      sessionSecret: "test-session-secret"
    },
    store: {
      logAction: async () => undefined,
      getNadesDocument: async () => ({ entries: [{ name: "window_smoke" }], updatedAt })
    },
    compose: {},
    nadesSync: {
      status: () => ({ state: "healthy", lastConfirmedAt: updatedAt.toISOString() })
    }
  });
  const server = createServer(app);

  try {
    const address: any = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" })
    });
    const cookie = String(login.headers.get("set-cookie")).split(";")[0];
    const response = await fetch(`${baseUrl}/api/nades/status`, { headers: { Cookie: cookie } });
    const status: any = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(status.library, { count: 1, updatedAt: updatedAt.toISOString() });
    assert.equal(status.sync.state, "healthy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
