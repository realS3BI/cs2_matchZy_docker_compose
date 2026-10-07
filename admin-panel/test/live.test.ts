import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { WebSocket } from "ws";
import { Changes, LiveResources } from "../src/live-resources.js";
import { installLiveServer } from "../src/live-server.js";
import { tokenHash } from "../src/auth.js";
import { workspaceFixture, ids } from "./workspace-fixture.js";
import { newStratContent } from "../shared/strats.js";

function inbox(ws: WebSocket) {
  const messages: any[] = [];
  const wake = new Set<() => void>();
  ws.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()));
    for (const notify of wake) notify();
  });
  return {
    messages,
    wait(predicate: (message: any) => boolean, timeout = 3000): Promise<any> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          wake.delete(check);
          reject(new Error("Expected WebSocket message did not arrive"));
        }, timeout);
        function check() {
          const index = messages.findIndex(predicate);
          if (index < 0) return;
          clearTimeout(timer);
          wake.delete(check);
          resolve(messages.splice(index, 1)[0]);
        }
        wake.add(check);
        check();
      });
    },
    subscribe(...paths: string[]) {
      ws.send(JSON.stringify({ type: "subscribe", paths }));
    },
  };
}

async function transport(t) {
  const app = express();
  const changes = new Changes();
  const resources = new LiveResources(changes);
  const config = { publicUrl: "https://playbook.test", sessionSecret: "test" };
  let user: any = {
    identitySteam64: ids[0],
    access: { platform: "user", server: "server_admin" },
  };
  let active = true;
  const store = {
    getSession: async (id) =>
      active && id === tokenHash("1".repeat(43), "test")
        ? { purpose: "user", steamId: ids[0] }
        : null,
    getUser: async () => structuredClone(user),
  };
  const server = createServer(app);
  const live = installLiveServer(server, { config, store, resources });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as any).port}/api/live`;
  const headers = {
    Origin: config.publicUrl,
    Cookie: `cs2_panel_session=${"1".repeat(43)}`,
  };
  t.after(async () => {
    live.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    app,
    changes,
    resources,
    url,
    headers,
    revoke: () => {
      active = false;
      changes.publish();
    },
    demote: () => {
      user.access.server = "none";
      changes.publish();
    },
  };
}

test("WebSocket requires the exact Origin and a current authenticated session", async (t) => {
  const f = await transport(t);
  for (const [headers, status] of [
    [{}, 403],
    [{ ...f.headers, Origin: "https://evil.test" }, 403],
    [{ Origin: f.headers.Origin }, 401],
  ] as const) {
    const socket = new WebSocket(f.url, { headers });
    socket.on("error", () => {});
    const [, response] = await once(socket, "unexpected-response");
    assert.equal(response.statusCode, status);
    response.resume();
    socket.terminate();
  }
});

test("snapshots push after commits, catch up on reconnect and enforce live role revocation", async (t) => {
  const f = await transport(t);
  let state = "running";
  f.resources.get(f.app, "/api/server/status", async () => ({
    service: { state },
  }));
  const socket = new WebSocket(f.url, { headers: f.headers });
  const box = inbox(socket);
  await once(socket, "open");
  box.subscribe("/api/server/status");
  assert.equal(
    (await box.wait((m) => m.type === "snapshot")).data.service.state,
    "running",
  );
  state = "stopped";
  f.changes.publish();
  assert.equal(
    (await box.wait((m) => m.type === "snapshot")).data.service.state,
    "stopped",
  );
  socket.close();
  await once(socket, "close");
  state = "restarting";
  f.changes.publish();
  const next = new WebSocket(f.url, { headers: f.headers });
  const again = inbox(next);
  await once(next, "open");
  again.subscribe("/api/server/status");
  assert.equal(
    (await again.wait((m) => m.type === "snapshot")).data.service.state,
    "restarting",
  );
  f.demote();
  assert.equal((await again.wait((m) => m.type === "error")).status, 403);
  const closed = once(next, "close");
  f.revoke();
  assert.equal((await closed)[0], 4401);
});

test("a role change during a slow read suppresses the now forbidden response", async (t) => {
  const f = await transport(t);
  let release: () => void;
  let started: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.resources.get(f.app, "/api/server/logs", async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { logs: "private" };
  });
  const socket = new WebSocket(f.url, { headers: f.headers });
  const box = inbox(socket);
  await once(socket, "open");
  box.subscribe("/api/server/logs");
  await reading;
  f.demote();
  release!();
  assert.equal((await box.wait((m) => m.type === "error")).status, 403);
  assert.equal(
    box.messages.some((m) => m.type === "snapshot"),
    false,
  );
});

test("unknown subscriptions and binary or oversized messages close cleanly", async (t) => {
  const f = await transport(t);
  for (const payload of [
    JSON.stringify({ type: "subscribe", paths: ["/api/settings/../users"] }),
    Buffer.from("binary"),
    "x".repeat(17000),
  ]) {
    const socket = new WebSocket(f.url, { headers: f.headers });
    socket.on("error", () => {});
    await once(socket, "open");
    const closed = once(socket, "close");
    socket.send(payload);
    assert.ok([1008, 1009].includes((await closed)[0]));
  }
});

test("shared server probes are coalesced while each subscriber is authorized independently", async (t) => {
  const f = await transport(t);
  let reads = 0;
  let release: () => void;
  f.resources.get(
    f.app,
    "/api/server/status",
    async () => {
      reads++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ok: true };
    },
    0,
    true,
  );
  const actor = {
    identitySteam64: ids[0],
    access: { platform: "user" as const, server: "server_admin" as const },
  };
  const first = f.resources.read("/api/server/status", actor);
  const second = f.resources.read("/api/server/status", {
    ...actor,
    identitySteam64: ids[1],
  });
  await assert.rejects(
    f.resources.read("/api/server/status", {
      ...actor,
      access: { platform: "user", server: "none" },
    }),
    { status: 403 },
  );
  release!();
  await Promise.all([first, second]);
  assert.equal(reads, 1);
});

test(
  "real commits push team activation and stop, hide drafts and evict removed members",
  { skip: !process.env.TEST_MONGODB_URI },
  async (t) => {
    const f = await workspaceFixture();
    t.after(() => f.close());
    let team = (await f.request(0, "/teams", "POST", { name: "Live team" }))
      .team;
    const invitation = await f.request(
      0,
      `/teams/${team.id}/invitations`,
      "POST",
      { revision: team.revision },
    );
    const token = invitation.url.split("/").at(-1);
    team = (
      await f.request(1, `/team-invitations/${token}`, "POST", { accept: true })
    ).team;
    const connect = async (index: number) => {
      const ws = new WebSocket(f.base.replace("http:", "ws:") + "/api/live", {
        headers: {
          Origin: f.config.publicUrl,
          Cookie: `cs2_panel_session=${String(index + 1).repeat(43)}`,
        },
      });
      const box = inbox(ws);
      await once(ws, "open");
      return box;
    };
    const member = await connect(1);
    const outsider = await connect(2);
    const path = `/api/teams/${team.id}/live`;
    member.subscribe(path, "/api/strats");
    outsider.subscribe(path);
    assert.equal((await outsider.wait((m) => m.type === "error")).status, 404);
    assert.equal(
      (await member.wait((m) => m.path === path && m.type === "snapshot")).data
        .active,
      null,
    );
    assert.deepEqual(
      (await member.wait((m) => m.path === "/api/strats")).data.entries,
      [],
    );
    const content = newStratContent();
    content.title = "Published title";
    let strat = (
      await f.request(0, "/strats", "POST", { teamId: team.id, content })
    ).strat;
    strat = (
      await f.request(0, `/strats/${strat.id}/publish`, "POST", {
        revision: strat.revision,
      })
    ).strat;
    assert.equal(
      (await member.wait((m) => m.path === "/api/strats")).data.entries[0]
        .content.title,
      "Published title",
    );
    team = (await f.request(0, `/teams/${team.id}/live`, "POST", { revision: team.revision })).team;
    const waiting = await member.wait(m => m.path === path && m.data?.team.live && m.data.active === null);
    assert.equal(waiting.data.team.live, true);
    let result = await f.request(0, `/strats/${strat.id}/activate`, "POST", {
      revision: strat.revision,
    });
    assert.equal(result.status, 200);
    team = result.team;
    assert.equal(
      (await member.wait((m) => m.path === path && m.data?.active)).data.active
        .content.title,
      "Published title",
    );
    result = await f.request(0, `/teams/${team.id}/live/strat`, "DELETE", { revision: team.revision });
    team = result.team;
    await member.wait(m => m.path === path && m.data?.team.live && m.data.active === null);
    assert.equal(team.live, true);
    await f.request(0, `/strats/${strat.id}`, "PUT", {
      revision: strat.revision,
      content: { ...content, title: "Secret draft" },
    });
    result = await f.request(0, `/teams/${team.id}/live`, "DELETE", {
      revision: team.revision,
    });
    team = result.team;
    await member.wait(
      (m) => m.path === path && m.type === "snapshot" && m.data.team.live === false && m.data.active === null,
    );
    assert.ok(!JSON.stringify(member.messages).includes("Secret draft"));
    await f.request(0, `/teams/${team.id}`, "PATCH", {
      revision: team.revision,
      action: "remove",
      userId: ids[1],
    });
    assert.equal(
      (await member.wait((m) => m.path === path && m.type === "error")).status,
      404,
    );
    assert.deepEqual(
      (
        await member.wait(
          (m) => m.path === "/api/strats" && !m.data?.entries?.length,
        )
      ).data.entries,
      [],
    );
    assert.ok(!outsider.messages.some((m) => m.type === "snapshot"));
  },
);
