import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  accessOf,
  authorize,
  cssFlags,
  gamePermissions,
} from "../shared/authorization.js";
import { newStratContent } from "../shared/strats.js";
import { lineupPermissions } from "../shared/lineup-policy.js";
import { safeReturnPath } from "../src/auth.js";
import { WorkspaceStore } from "../src/workspace-store.js";
import { writeAdminRuntimeFiles } from "../src/runtime-files.js";
import { ids, workspaceFixture } from "./workspace-fixture.js";

test("platform, server and team roles do not imply privileges in another scope", () => {
  const admin = {
    identitySteam64: ids[0],
    role: "admin",
    access: { platform: "platform_admin" as const, server: "none" as const },
  };
  const team = {
    id: "a",
    members: [{ userId: ids[1], role: "owner" as const }],
  };
  assert.equal(authorize(admin, "users.manage"), true);
  assert.equal(authorize(admin, "server.manage"), false);
  assert.equal(authorize(admin, "strats.read", team), false);
  assert.deepEqual(cssFlags(admin), []);
  assert.deepEqual(gamePermissions(admin), ["lineups.capture"]);
  const server = {
    identitySteam64: ids[1],
    access: { platform: "user" as const, server: "server_admin" as const },
  };
  assert.equal(authorize(server, "server.manage"), true);
  assert.equal(
    authorize(server, "server.manage", { serverId: "other" }),
    false,
  );
  assert.equal(authorize(server, "users.manage"), false);
  assert.equal(authorize(server, "lineups.moderate"), false);
  assert.equal(authorize(server, "strats.edit", team), true);
  assert.equal(
    authorize({ ...admin, authKind: "test" }, "teams.create"),
    false,
  );
  assert.deepEqual(accessOf({ ...admin, access: {} as any }), {
    platform: "user",
    server: "none",
  });
  assert.equal(
    lineupPermissions({ owner: ids[2], official: true }, admin).delete,
    true,
  );
  assert.equal(
    lineupPermissions(
      { owner: ids[2], official: true },
      { ...server, role: "admin" },
    ).delete,
    false,
  );
  assert.equal(
    lineupPermissions(
      { owner: ids[2], official: true },
      { identitySteam64: ids[2], role: "player" },
    ).position,
    true,
  );
});

test("Steam return paths preserve team invitations without allowing external redirects", () => {
  assert.equal(safeReturnPath("/teams/join/abc-123"), "/teams/join/abc-123");
  for (const path of [
    "//evil.test",
    "https://evil.test",
    "/\\evil.test",
    "/teams\nLocation: evil",
    ["/teams"],
  ])
    assert.equal(safeReturnPath(path), "/");
});

const integration = { skip: !process.env.TEST_MONGODB_URI };
test(
  "teams isolate memberships, invitations and owner-only management across existing sessions",
  integration,
  async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    const a = (await f.request(0, "/teams", "POST", { name: "Alpha" })).team;
    const b = (await f.request(3, "/teams", "POST", { name: "Bravo" })).team;
    assert.equal((await f.request(0, `/teams/${b.id}`)).status, 404); // Platform admin has no bypass.
    assert.equal((await f.request(1, `/teams/${a.id}`)).status, 404);
    let invited = await f.request(0, `/teams/${a.id}/invitations`, "POST", {
      revision: a.revision,
    });
    assert.equal(invited.status, 201);
    const token = invited.url.split("/").at(-1);
    assert.equal(JSON.stringify(invited.team).includes('"hash"'), false);
    assert.equal(
      (await f.request(1, `/team-invitations/${token}`, "POST", {})).name,
      "Alpha",
    );
    let joined = await f.request(1, `/team-invitations/${token}`, "POST", {
      accept: true,
      role: "owner",
    });
    assert.equal(
      joined.team.members.find((member) => member.userId === ids[1]).role,
      "member",
    );
    assert.deepEqual(joined.team.invitations, []);
    assert.equal(
      (
        await f.request(1, `/teams/${a.id}`, "PATCH", {
          action: "role",
          revision: joined.team.revision,
          userId: ids[1],
          role: "owner",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(0, `/teams/${a.id}`, "PATCH", {
          action: "rename",
          revision: a.revision,
          name: "Stale",
        })
      ).status,
      409,
    );
    let promoted = await f.request(0, `/teams/${a.id}`, "PATCH", {
      action: "role",
      revision: joined.team.revision,
      userId: ids[1],
      role: "captain",
    });
    assert.equal(promoted.status, 200);
    assert.equal(
      (
        await f.request(1, `/teams/${a.id}/invitations`, "POST", {
          revision: promoted.team.revision,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(0, `/teams/${a.id}`, "PATCH", {
          action: "leave",
          revision: promoted.team.revision,
        })
      ).status,
      400,
    );
    const transferred = await f.request(0, `/teams/${a.id}`, "PATCH", {
      action: "transfer",
      revision: promoted.team.revision,
      userId: ids[1],
    });
    assert.equal(
      transferred.team.members.filter((member) => member.role === "owner")
        .length,
      1,
    );
    assert.equal(
      (
        await f.request(2, `/team-invitations/${token}`, "POST", {
          accept: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(0, `/teams/${a.id}/invitations`, "POST", {
          revision: transferred.team.revision,
        })
      ).status,
      403,
    );
    const inviteB = await f.request(3, `/teams/${b.id}/invitations`, "POST", {
      revision: b.revision,
    });
    assert.equal(
      (
        await f.request(
          1,
          `/team-invitations/${inviteB.url.split("/").at(-1)}`,
          "POST",
          { accept: true },
        )
      ).status,
      200,
    );
    assert.equal((await f.request(1, "/teams")).entries.length, 2);
    const removed = await f.request(1, `/teams/${a.id}`, "PATCH", {
      action: "remove",
      revision: transferred.team.revision,
      userId: ids[0],
    });
    assert.equal(removed.status, 200);
    assert.equal((await f.request(0, `/teams/${a.id}/live`)).status, 404);
    assert.equal(
      (
        await f.request(1, "/strats", "POST", {
          teamId: { $ne: null },
          content: {},
        })
      ).status,
      404,
    );
  },
);

test(
  "published and active snapshots remain stable while captains edit; members see only published content",
  integration,
  async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    let team = (await f.request(0, "/teams", "POST", { name: "Alpha" })).team;
    const invitation = await f.request(
      0,
      `/teams/${team.id}/invitations`,
      "POST",
      { revision: team.revision },
    );
    const token = invitation.url.split("/").at(-1);
    await f.request(1, `/team-invitations/${token}`, "POST", { accept: true });
    team = (
      await f.request(2, `/team-invitations/${token}`, "POST", { accept: true })
    ).team;
    team = (
      await f.request(0, `/teams/${team.id}`, "PATCH", {
        action: "role",
        revision: team.revision,
        userId: ids[1],
        role: "captain",
      })
    ).team;
    const content = newStratContent();
    content.title = "A Execute";
    content.slots[0].userId = ids[2];
    content.slots[0].steps.push({
      id: "step-1",
      text: "Auf Flash peeken",
      timing: "1:45",
      position: "Ramp",
      nadeIds: [],
    });
    assert.equal(
      (await f.request(2, "/strats", "POST", { teamId: team.id, content }))
        .status,
      403,
    );
    let strat = (
      await f.request(1, "/strats", "POST", { teamId: team.id, content })
    ).strat;
    assert.equal((await f.request(2, `/strats/${strat.id}`)).status, 404);
    assert.equal((await f.request(2, "/strats")).entries.length, 0);
    assert.equal((await f.request(3, `/strats/${strat.id}`)).status, 404);
    const post = (action: string) =>
      f.request(1, `/strats/${strat.id}/${action}`, "POST", {
        revision: strat.revision,
      });
    strat = (await post("publish")).strat;
    assert.equal(team.live, false);
    assert.equal((await post("activate")).status, 400);
    assert.equal((await f.request(2, `/teams/${team.id}/live`, "POST", { revision: team.revision })).status, 403);
    assert.equal((await f.request(1, `/teams/${team.id}/live`, "POST", { revision: 999 })).status, 409);
    team = (await f.request(1, `/teams/${team.id}/live`, "POST", { revision: team.revision })).team;
    assert.equal(team.live, true);
    assert.equal(team.active, null);
    const waiting = await f.request(2, `/teams/${team.id}/live`);
    assert.equal(waiting.team.live, true);
    assert.equal(waiting.active, null);
    assert.equal((await f.request(2, "/teams")).entries.find(entry => entry.id === team.id).live, true);
    assert.equal((await post("activate")).status, 200);
    team = (await f.request(1, `/teams/${team.id}/live`)).team;
    assert.equal((await f.request(2, `/teams/${team.id}/live/strat`, "DELETE", { revision: team.revision })).status, 403);
    assert.equal((await f.request(1, `/teams/${team.id}/live/strat`, "DELETE", { revision: 999 })).status, 409);
    team = (await f.request(1, `/teams/${team.id}/live/strat`, "DELETE", { revision: team.revision })).team;
    assert.equal(team.live, true);
    assert.equal(team.active, null);
    assert.equal((await post("activate")).status, 200);
    assert.equal(
      (
        await f.request(2, `/strats/${strat.id}/activate`, "POST", {
          revision: strat.revision,
        })
      ).status,
      403,
    );
    content.title = "B Fake · Secret Draft";
    strat = (
      await f.request(1, `/strats/${strat.id}`, "PUT", {
        revision: strat.revision,
        content,
      })
    ).strat;
    assert.equal(
      (await f.request(2, `/strats/${strat.id}`)).strat.content.title,
      "A Execute",
    );
    assert.equal(
      (
        await f.request(1, `/strats/${strat.id}`, "PUT", {
          revision: 1,
          content,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.request(2, `/teams/${team.id}/live`)).active.content.title,
      "A Execute",
    );
    strat = (await post("publish")).strat;
    assert.equal(
      (await f.request(2, `/strats/${strat.id}`)).strat.content.title,
      content.title,
    );
    assert.equal(
      (await f.request(2, `/teams/${team.id}/live`)).active.content.title,
      "A Execute",
    );
    await post("activate");
    assert.equal(
      (await f.request(2, `/teams/${team.id}/live`)).active.version,
      2,
    );
    strat = (await post("archive")).strat;
    assert.equal((await f.request(2, `/strats/${strat.id}`)).status, 404);
    assert.equal(
      (await f.request(2, `/teams/${team.id}/live`)).active.version,
      2,
    );
    assert.equal((await post("activate")).status, 400);
    strat = (await post("restore")).strat;
    assert.equal(
      (
        await f.request(2, `/strats/${strat.id}/publish`, "POST", {
          revision: 999,
        })
      ).status,
      403,
    );
    team = (await f.request(0, `/teams/${team.id}`)).team;
    assert.equal(
      (
        await f.request(2, `/teams/${team.id}/live`, "DELETE", {
          revision: team.revision,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(1, `/teams/${team.id}/live`, "DELETE", {
          revision: team.revision,
        })
      ).status,
      200,
    );
    team = (await f.request(2, `/teams/${team.id}/live`)).team;
    assert.equal(team.live, false);
    assert.equal(team.active, null);
    team = (await f.request(0, `/teams/${team.id}/live`, "POST", { revision: team.revision })).team;
    assert.equal(team.live, true);
    assert.equal(team.active, null);
    strat = (await post("archive")).strat;
    assert.equal((await f.request(2, `/strats/${strat.id}`)).status, 404);
    strat = (await post("restore")).strat;
    content.slots[0].steps[0].nadeIds = ["Missing"];
    strat = (
      await f.request(1, `/strats/${strat.id}`, "PUT", {
        revision: strat.revision,
        content,
      })
    ).strat;
    assert.equal((await post("publish")).status, 400);
    content.slots[1].userId = ids[2];
    assert.equal(
      (
        await f.request(1, `/strats/${strat.id}`, "PUT", {
          revision: strat.revision,
          content,
        })
      ).status,
      400,
    );
    team = (await f.request(0, `/teams/${team.id}`)).team;
    await f.request(0, `/teams/${team.id}`, "PATCH", {
      action: "role",
      revision: team.revision,
      userId: ids[1],
      role: "member",
    });
    assert.equal((await post("publish")).status, 403);
  },
);

test(
  "role migration is idempotent, role updates are atomic and runtime files respect explicit scopes",
  integration,
  async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    await f.store.saveUser({
      identitySteam64: ids[1],
      name: "Ben",
      access: { platform: "platform_admin", server: "server_admin" },
    });
    const before = await f.store.workspace.getAccessDocument();
    const second = new WorkspaceStore(f.store.db);
    await second.initialize({
      [ids[2]]: { platform: "platform_admin", server: "server_admin" },
    });
    assert.deepEqual(await second.getAccessDocument(), before);
    const outcomes = await Promise.allSettled([
      f.store.saveUser(
        {
          identitySteam64: ids[1],
          access: { platform: "user", server: "none" },
          accessRevision: before.revision,
        },
        ids[0],
      ),
      f.store.saveUser(
        {
          identitySteam64: ids[0],
          access: { platform: "user", server: "none" },
          accessRevision: before.revision,
        },
        ids[1],
      ),
    ]);
    assert.equal(
      outcomes.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      Object.values((await second.getAccessDocument()).users).filter(
        (access) => access.platform === "platform_admin",
      ).length,
      1,
    );
    const admin = Object.entries((await second.getAccessDocument()).users).find(
      ([, access]) => access.platform === "platform_admin",
    )[0];
    await assert.rejects(() =>
      f.store.saveUser(
        {
          identitySteam64: admin,
          access: { platform: "user", server: "none" },
        },
        admin,
      ),
    );
    await f.store.saveUser(
      {
        identitySteam64: ids[2],
        access: { platform: "user", server: "server_admin" },
      },
      admin,
    );
    await writeAdminRuntimeFiles(f.config, () => f.store.getAdmins());
    const manifest = JSON.parse(
      await readFile(join(f.directory, "permissions.json"), "utf8"),
    );
    assert.deepEqual(manifest.users[ids[2]], [
      "training.use",
      "commands.control",
    ]);
    assert.match(manifest.revision, /^[a-f0-9]{64}$/);
    const index = ids.indexOf(admin);
    assert.equal((await f.request(index, "/auth/me")).status, 200);
    assert.equal((await f.request(2, "/users")).status, 403);
    assert.equal((await f.request(2, "/teams")).status, 200);
  },
);

test(
  "migration keeps all four legacy roles and favorites, then ignores stale users.role",
  integration,
  async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    const legacy = ["admin", "match_admin", "training_player", "player"];
    for (let index = 0; index < ids.length; index++) {
      await f.store.users.updateOne(
        { _id: ids[index] },
        {
          $set: {
            role: legacy[index],
            nadeFavorites: [
              { owner: ids[index], map: "de_mirage", name: "window" },
            ],
          },
        },
      );
    }
    await f.store.db.collection("roleAssignments").deleteMany({});
    await f.store.connect();
    for (let index = 0; index < ids.length; index++) {
      const user = await f.store.getUser(ids[index]);
      assert.equal(
        user.access.platform,
        index === 0 ? "platform_admin" : "user",
      );
      assert.equal(
        user.access.server,
        ["server_admin", "match_admin", "training_player", "none"][index],
      );
      assert.equal((await f.store.getNadeFavorites(ids[index])).length, 1);
    }
    await f.store.saveUser(
      { identitySteam64: ids[1], access: { platform: "user", server: "none" } },
      ids[0],
    );
    await f.store.users.updateOne({ _id: ids[1] }, { $set: { role: "admin" } });
    await f.store.connect();
    assert.deepEqual((await f.store.getUser(ids[1])).access, {
      platform: "user",
      server: "none",
    });
  },
);

test(
  "expired and explicitly revoked invitations cannot grant access",
  integration,
  async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    let team = (await f.request(0, "/teams", "POST", { name: "Invite expiry" }))
      .team;
    const invitation = await f.request(
      0,
      `/teams/${team.id}/invitations`,
      "POST",
      { revision: team.revision },
    );
    const path = `/team-invitations/${invitation.url.split("/").at(-1)}`;
    team = await f.store.workspace.getTeam(team.id);
    team.invitations[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await f.store.workspace.replaceTeam(team, team.revision);
    assert.equal(
      (await f.request(1, path, "POST", { accept: true })).status,
      404,
    );
    team = (await f.request(0, `/teams/${team.id}`)).team;
    const next = await f.request(0, `/teams/${team.id}/invitations`, "POST", {
      revision: team.revision,
    });
    await f.request(0, `/teams/${team.id}`, "PATCH", {
      action: "revokeInvite",
      invitationId: next.team.invitations[0].id,
      revision: next.team.revision,
    });
    assert.equal(
      (
        await f.request(
          1,
          `/team-invitations/${next.url.split("/").at(-1)}`,
          "POST",
          { accept: true },
        )
      ).status,
      404,
    );
  },
);
