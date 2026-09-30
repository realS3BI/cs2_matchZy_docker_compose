import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp as createRealApp } from "../src/app.js";

const testToken = "a".repeat(43);
function createApp(options) {
  return createRealApp({ ...options, store: {
    getSession: async () => ({ purpose: "user", steamId: "76561198000000001" }),
    getUser: async () => ({ identitySteam64: "76561198000000001", role: "admin" }),
    ...options.store
  } });
}

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
    assert.deepEqual(await health.json(), { ok: true, service: "playbook" });
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
    const cookie = `cs2_panel_session=${testToken}`;
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
    const cookie = `cs2_panel_session=${testToken}`;
    const response = await fetch(`${baseUrl}/api/nades/status`, { headers: { Cookie: cookie } });
    const status: any = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(status.library, { count: 1, updatedAt: updatedAt.toISOString() });
    assert.equal(status.sync.state, "healthy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("restart writes the saved server mode before restarting CS2", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "matchzy-restart-runtime-"));
  const config = {
    password: "test-password",
    sessionSecret: "test-session-secret",
    runtimeSettingsFile: join(runtimeDir, "settings.json"),
    runtimeAdminsFile: join(runtimeDir, "csharp-admins.json"),
    runtimeMatchZyAdminsFile: join(runtimeDir, "matchzy-admins.json"),
    runtimeMatchZyNadesFile: join(runtimeDir, "matchzy-savednades.json")
  };
  let runtimeModeAtRestart = "";
  const app = createApp({
    config,
    store: {
      getSettings: async () => ({ steamToken: "token", rconPassword: "secret", serverMode: "matchzy" }),
      getAdmins: async () => [],
      getNades: async () => [],
      logAction: async () => undefined
    },
    compose: {
      restartService: async () => {
        runtimeModeAtRestart = JSON.parse(await readFile(config.runtimeSettingsFile, "utf8")).serverMode;
        return { ok: true, stdout: "restarted", stderr: "" };
      }
    },
    nadesSync: { writeFromMongo: async () => undefined }
  });
  const server = createServer(app);

  try {
    const address: any = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const cookie = `cs2_panel_session=${testToken}`;
    const response = await fetch(`${baseUrl}/api/server/restart`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}"
    });

    assert.equal(response.status, 200);
    assert.equal(runtimeModeAtRestart, "matchzy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(runtimeDir, { recursive: true, force: true });
  }
});


test("live map controls use applied credentials, validate input and preserve saved settings", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "matchzy-map-control-"));
  const runtimeSettingsFile = join(runtimeDir, "settings.json");
  const applied = { rconPassword: "applied-secret", startMap: "de_mirage", serverMode: "nades", workshopMaps: "123456" };
  await writeFile(runtimeSettingsFile, JSON.stringify(applied));
  const commands = [];
  const actions = [];
  let fail = false;
  const app = createApp({
    config: { password: "test-password", sessionSecret: "secret", runtimeSettingsFile, liveMatchZyNadesFile: join(runtimeDir, "savednades.json"), serviceName: "cs2" },
    store: { logAction: async (...args) => actions.push(args) },
    compose: {},
    nadesSync: null,
    rcon: async ({ host, password, command }) => {
      assert.equal(host, "cs2");
      assert.equal(password, "applied-secret");
      commands.push(command);
      if (fail) throw new Error("Cannot reach CS2 RCON");
      return command === "status" ? "map : de_inferno" : "";
    }
  });
  const server = createServer(app);
  try {
    const address: any = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const denied = await fetch(`${baseUrl}/api/server/map`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ map: "de_dust2" }) });
    assert.equal(denied.status, 401);
    assert.equal(commands.length, 0);
    const cookie = `cs2_panel_session=${testToken}`;
    const headers = { Cookie: cookie, "Content-Type": "application/json" };
    const status = await fetch(`${baseUrl}/api/server/game`, { headers });
    assert.deepEqual(await status.json(), { map: "de_inferno", mode: "nades", startMap: "de_mirage" });
    const change = (body) => fetch(`${baseUrl}/api/server/map`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal((await change({ map: "de_dust2;quit" })).status, 400);
    assert.equal((await change({ workshopId: "654321" })).status, 400);
    assert.deepEqual(commands, ["status"]);
    assert.equal((await change({ map: "de_dust2" })).status, 200);
    assert.equal((await change({ workshopId: "123456" })).status, 200);
    assert.deepEqual(commands, ["status", "changelevel de_dust2", "host_workshop_map 123456"]);
    await writeFile(join(runtimeDir, "savednades.maps.json"), JSON.stringify([
      { MapName: "de_thera", Available: false }, { MapName: "de_nuke", Available: true, WorkshopId: "" }
    ]));
    assert.equal((await change({ map: "de_thera" })).status, 400);
    assert.equal((await change({ map: "de_mirage_vanity" })).status, 400);
    assert.equal((await change({ workshopId: "123456" })).status, 400);
    assert.deepEqual(commands, ["status", "changelevel de_dust2", "host_workshop_map 123456"]);
    assert.deepEqual(JSON.parse(await readFile(runtimeSettingsFile, "utf8")), applied);
    fail = true;
    assert.equal((await change({ map: "de_nuke" })).status, 502);
    assert.equal(actions.at(-1)[0], "map_change");
    assert.equal(actions.at(-1)[1], "failed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
