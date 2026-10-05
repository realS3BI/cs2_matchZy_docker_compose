import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { createApp } from "../src/app.js";
import { tokenHash } from "../src/auth.js";
import { writeAdminRuntimeFiles } from "../src/runtime-files.js";
import { installLiveServer } from "../src/live-server.js";

export const ids = [1, 2, 3, 4].map((value) => `7656119800000000${value}`);
export async function workspaceFixture(publicUrl = "http://localhost:5177") {
  const directory = await mkdtemp(join(tmpdir(), "playbook-workspace-"));
  const config = {
    mongodbUri: process.env.TEST_MONGODB_URI,
    mongoDbName: `test_workspace_${randomUUID().replaceAll("-", "")}`,
    bootstrapAdminSteamId: ids[0],
    publicUrl,
    sessionSecret: "isolated-integration-test-secret",
    liveNadesFile: join(directory, "nades.json"),
    runtimeSettingsFile: join(directory, "settings.json"),
    runtimeAdminsFile: join(directory, "admins.json"),
    runtimeMatchZyAdminsFile: join(directory, "matchzy-admins.json"),
    runtimeNadesFile: join(directory, "savednades.json"),
    uploadDir: directory,
  };
  const store = new Store(config);
  await store.connect();
  for (let index = 0; index < ids.length; index++) {
    await store.saveUser({
      identitySteam64: ids[index],
      name: ["Anna Owner", "Ben Captain", "Clara Member", "David Other"][index],
      access: {
        platform: index === 0 ? "platform_admin" : "user",
        server: "none",
      },
    });
    await store.createSession(
      tokenHash(String(index + 1).repeat(43), config.sessionSecret),
      {
        purpose: "user",
        steamId: ids[index],
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
  }
  await writeAdminRuntimeFiles(config, () => store.getAdmins());
  const app = createApp({
    config,
    store,
    compose: {
      serviceStatus: async () => {
        throw new Error("CS2 offline");
      },
    },
    nadesSync: null,
  });
  const server = createServer(app);
  const live = installLiveServer(server, { config, store, resources: app.locals.live });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (
    index: number,
    path: string,
    method = "GET",
    body?: any,
  ) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Cookie: `cs2_panel_session=${String(index + 1).repeat(43)}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json()) as any;
    return { status: response.status, ...data };
  };
  return {
    config,
    directory,
    store,
    app,
    server,
    base,
    request,
    close: async () => {
      live.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.db.dropDatabase();
      await store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
