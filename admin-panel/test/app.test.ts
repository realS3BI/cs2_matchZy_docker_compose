import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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
