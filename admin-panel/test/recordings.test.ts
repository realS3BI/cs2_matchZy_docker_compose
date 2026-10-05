import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workspaceFixture, ids } from "./workspace-fixture.js";
import { newStratContent } from "../shared/strats.js";
import { audioTimeAtTick, presentationAt } from "../shared/recordings.js";

const mongo = { skip: !process.env.TEST_MONGODB_URI };
async function setup(t) {
  const f = await workspaceFixture();
  t.after(() => f.close());
  let team = (await f.request(0, "/teams", "POST", { name: "Live-Team" })).team;
  for (const index of [1, 2]) {
    const invitation = await f.request(
      0,
      `/teams/${team.id}/invitations`,
      "POST",
      { revision: team.revision },
    );
    team = (
      await f.request(
        index,
        `/team-invitations/${invitation.url.split("/").at(-1)}`,
        "POST",
        { accept: true },
      )
    ).team;
  }
  team = (
    await f.request(0, `/teams/${team.id}`, "PATCH", {
      revision: team.revision,
      action: "role",
      userId: ids[1],
      role: "captain",
    })
  ).team;
  const actor = await f.store.getUser(ids[0]);
  const session = (
    await f.request(0, "/analysis/live", "POST", {
      teamId: team.id,
      title: "Mirage gemeinsam",
      mode: "review",
      recorderId: ids[2],
    })
  ).session;
  const command = async (index, action, body = {}) => {
    const user = await f.store.getUser(ids[index]);
    const current = await f.store.recordings.session(session.id, user);
    return f.store.analysis.mutate(() =>
      f.store.recordings.command(session.id, user, {
        revision: current.revision,
        commandId: randomUUID(),
        action,
        ...body,
      }),
    );
  };
  await command(0, "start", { consent: true });
  return { ...f, team, actor, session, command };
}
function wav() {
  const data = Buffer.alloc(8000 * 2),
    header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
async function segment(f, user, trackId, sequence, body = wav()) {
  const response = await fetch(
    `${f.base}/api/analysis/audio/${trackId}/segments/${sequence}`,
    {
      method: "PUT",
      headers: {
        Cookie: `cs2_panel_session=${String(user + 1).repeat(43)}`,
        "Content-Type": "application/octet-stream",
      },
      body,
    },
  );
  return { status: response.status, ...((await response.json()) as any) };
}

test(
  "Live recording separates moderation, recorder and current team access",
  mongo,
  async (t) => {
    const f = await setup(t);
    assert.equal(
      (await f.request(3, `/analysis/live/${f.session.id}/room`)).status,
      404,
    );
    assert.equal(
      (await f.request(2, `/analysis/live/${f.session.id}/room`)).canRecord,
      true,
    );
    await assert.rejects(f.command(2, "present", { kind: "notes" }), {
      status: 403,
    });
    await assert.rejects(f.command(1, "stop"), { status: 403 });
    await f.command(1, "takeover");
    await f.command(2, "note", { text: "Wir üben Überzahl." });
    await f.command(1, "stop");
    const timeline = (
      await f.request(2, `/analysis/live/${f.session.id}/timeline`)
    ).session;
    assert.deepEqual(
      timeline.events.map((e) => e.type),
      ["start", "takeover", "note", "stop"],
    );
    assert.equal(timeline.moderatorId, ids[1]);
    const user = await f.store.getUser(ids[1]);
    const stop = timeline.events.at(-1);
    assert.equal(
      (
        await f.store.analysis.mutate(() =>
          f.store.recordings.command(timeline.id, user, {
            action: "stop",
            commandId: stop.id,
            revision: 1,
          }),
        )
      ).duplicate,
      true,
    );
  },
);

test(
  "Live strat presentation freezes the published version",
  mongo,
  async (t) => {
    const f = await setup(t),
      content = { ...newStratContent(), title: "A ausführlich" };
    const stratId = randomUUID();
    await f.store.db.collection<any>("strats").insertOne({
      _id: stratId,
      id: stratId,
      teamId: f.team.id,
      draft: content,
      published: { version: 1, content },
    });
    await f.command(0, "present", { kind: "strat", stratId });
    await f.store.db
      .collection<any>("strats")
      .updateOne(
        { _id: stratId },
        { $set: { "published.content.title": "Später geändert" } },
      );
    const timeline = (
      await f.request(2, `/analysis/live/${f.session.id}/timeline`)
    ).session;
    assert.equal(timeline.snapshots[0].content.title, "A ausführlich");
    assert.equal(
      presentationAt(timeline.events, timeline.events.at(-1).at).kind,
      "strat",
    );
  },
);

test(
  "Audio upload retries, gaps, private playback and finalization",
  mongo,
  async (t) => {
    const f = await setup(t),
      id = randomUUID(),
      input = {
        id,
        source: "file",
        name: "Erklärung",
        mime: "audio/wav",
        start: 0,
      };
    assert.equal(
      (
        await f.request(
          0,
          `/analysis/live/${f.session.id}/tracks`,
          "POST",
          input,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          2,
          `/analysis/live/${f.session.id}/tracks`,
          "POST",
          input,
        )
      ).track.id,
      id,
    );
    assert.equal(
      (
        await f.request(
          2,
          `/analysis/live/${f.session.id}/tracks`,
          "POST",
          input,
        )
      ).track.id,
      id,
    );
    assert.equal((await segment(f, 2, id, 1)).status, 200);
    assert.equal(
      (await f.request(2, `/analysis/audio/${id}/finish`, "POST")).status,
      409,
    );
    assert.equal((await segment(f, 2, id, 0)).status, 200);
    assert.equal((await segment(f, 2, id, 0)).status, 200);
    assert.equal(
      (await segment(f, 2, id, 0, Buffer.from("different"))).status,
      409,
    );
    assert.equal(
      (await f.store.recordings.tracks.findOne({ _id: id })).segments,
      2,
    );
    // A browser file is a single bitstream split into chunks, not independent WAV files.
    await f.store.recordings.segments.deleteOne({ trackId: id, sequence: 1 });
    await f.store.recordings.tracks.updateOne(
      { _id: id },
      { $set: { segments: 1, bytes: wav().length } },
    );
    const finished = await f.request(2, `/analysis/audio/${id}/finish`, "POST");
    assert.equal(finished.status, 200, JSON.stringify(finished));
    assert.equal(
      (await f.request(2, `/analysis/audio/${id}/finish`, "POST")).status,
      200,
    );
    const manifest = await f.request(1, `/analysis/audio/${id}/manifest`);
    assert.equal(manifest.parts.length, 1);
    assert.equal(
      (await f.request(3, `/analysis/audio/${id}/manifest`)).status,
      404,
    );
    const response = await fetch(`${f.base}${manifest.parts[0].url}`, {
      headers: {
        Cookie: `cs2_panel_session=${"2".repeat(43)}`,
        Range: "bytes=0-15",
      },
    });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 16);
    assert.equal(
      (
        await f.request(2, `/analysis/audio/${id}`, "PATCH", {
          start: 5,
          anchors: [],
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(1, `/analysis/audio/${id}`, "PATCH", {
          start: 5,
          anchors: [],
        })
      ).status,
      200,
    );
  },
);

test(
  "Expired upload leases recover and quota rejects before writing",
  mongo,
  async (t) => {
    const f = await setup(t),
      id = randomUUID();
    await f.request(2, `/analysis/live/${f.session.id}/tracks`, "POST", {
      id,
      source: "file",
      name: "WAV",
      mime: "audio/wav",
      start: 0,
    });
    await f.store.recordings.segments.insertOne({
      trackId: id,
      sequence: 0,
      status: "receiving",
      claim: "old",
      leaseUntil: new Date(0),
    });
    assert.equal((await segment(f, 2, id, 0)).status, 200);
    f.store.storage.config.analysisScopeLimit = 1;
    // Identical retries need no new storage reservation.
    assert.equal((await segment(f, 2, id, 0)).status, 200);
    assert.equal((await segment(f, 2, id, 1)).status, 507);
    assert.equal(
      await f.store.recordings.segments.countDocuments({ trackId: id }),
      1,
    );
  },
);

test("Audio anchors interpolate and extrapolate drift", () => {
  const track = {
    anchors: [
      { audio: 5, demoTick: 100 },
      { audio: 15, demoTick: 200 },
      { audio: 35, demoTick: 300 },
    ],
  } as any;
  assert.equal(audioTimeAtTick(track.anchors, 150), 10);
  assert.equal(audioTimeAtTick(track.anchors, 250), 25);
  assert.equal(audioTimeAtTick(track.anchors, 50), 0);
});

test(
  "Two live clients follow recorded presentations and reconnect to the persisted room",
  mongo,
  async (t) => {
    const { WebSocket } = await import("ws"),
      { once } = await import("node:events");
    const f = await setup(t),
      path = `/api/analysis/live/${f.session.id}/room`;
    async function client(index) {
      const ws = new WebSocket(f.base.replace("http:", "ws:") + "/api/live", {
        headers: {
          Origin: f.config.publicUrl,
          Cookie: `cs2_panel_session=${String(index + 1).repeat(43)}`,
        },
      });
      const messages: any[] = [],
        wakes = new Set<() => void>();
      ws.on("message", (raw) => {
        messages.push(JSON.parse(raw.toString()));
        for (const wake of wakes) wake();
      });
      const wait = (predicate) =>
        new Promise<any>((resolve, reject) => {
          const timer = setTimeout(() => {
            wakes.delete(check);
            reject(new Error("Live message missing"));
          }, 5000);
          const check = () => {
            const i = messages.findIndex(predicate);
            if (i < 0) return;
            clearTimeout(timer);
            wakes.delete(check);
            resolve(messages.splice(i, 1)[0]);
          };
          wakes.add(check);
          check();
        });
      await once(ws, "open");
      t.after(() => ws.terminate());
      ws.send(JSON.stringify({ type: "subscribe", paths: [path] }));
      return { ws, wait };
    }
    const owner = await client(0),
      member = await client(2);
    const initial = await owner.wait(
      (m) => m.type === "snapshot" && m.path === path,
    );
    await member.wait((m) => m.type === "snapshot" && m.path === path);
    owner.ws.send(
      JSON.stringify({
        type: "command",
        requestId: "present-command",
        path,
        body: {
          action: "present",
          kind: "notes",
          commandId: randomUUID(),
          revision: initial.data.session.revision,
        },
      }),
    );
    assert.equal(
      (
        await owner.wait(
          (m) => m.type === "result" && m.requestId === "present-command",
        )
      ).data.revision,
      initial.data.session.revision + 1,
    );
    const changed = await member.wait(
      (m) => m.type === "snapshot" && m.data.session.eventCount === 2,
    );
    assert.equal(changed.data.session.presentation.kind, "notes");
    member.ws.terminate();
    const reconnected = await client(2),
      restored = await reconnected.wait(
        (m) => m.type === "snapshot" && m.path === path,
      );
    assert.equal(restored.data.session.revision, changed.data.session.revision);
  },
);

test(
  "Strat explanations pin the session until the link is deliberately removed",
  mongo,
  async (t) => {
    const f = await setup(t),
      stratId = randomUUID(),
      content = { ...newStratContent(), title: "A üben" };
    await f.store.db.collection<any>("strats").insertOne({
      _id: stratId,
      id: stratId,
      teamId: f.team.id,
      draft: content,
      published: { version: 1, content },
    });
    await f.command(0, "stop");
    await f.store.recordings.sessions.updateOne(
      { _id: f.session.id },
      { $set: { duration: 60 } },
    );
    const result = await f.request(
      1,
      `/analysis/live/${f.session.id}/explanations`,
      "POST",
      { stratId, title: "Überzahl üben", start: 10, end: 30 },
    );
    assert.equal(result.status, 201);
    assert.equal(
      (await f.store.recordings.sessions.findOne({ _id: f.session.id })).pinned,
      true,
    );
    assert.equal(
      (
        await f.request(1, `/analysis/live/${f.session.id}/pin`, "POST", {
          pinned: false,
        })
      ).status,
      409,
    );
    const entries = await f.request(2, `/analysis/explanations/${stratId}`);
    assert.equal(entries.entries.length, 1);
    assert.equal(entries.canEdit, false);
    assert.equal(
      (
        await f.request(
          2,
          `/analysis/explanations/${result.explanation.id}`,
          "DELETE",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(
          1,
          `/analysis/explanations/${result.explanation.id}`,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await f.request(1, `/analysis/live/${f.session.id}/pin`, "POST", {
          pinned: false,
        })
      ).status,
      200,
    );
  },
);

test(
  "Game imports retain independent left and right channels at 48 kHz",
  mongo,
  async (t) => {
    const f = await setup(t),
      id = randomUUID();
    await f.request(2, `/analysis/live/${f.session.id}/tracks`, "POST", {
      id,
      source: "game",
      name: "CS2",
      mime: "audio/wav",
      start: 0,
    });
    const mono = wav(),
      data = Buffer.alloc(8000 * 4),
      header = Buffer.from(mono.subarray(0, 44));
    header.writeUInt32LE(36 + data.length, 4);
    header.writeUInt16LE(2, 22);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(4, 32);
    header.writeUInt32LE(data.length, 40);
    for (let i = 0; i < 8000; i++)
      data.writeInt16LE(
        Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 8000)),
        i * 4,
      );
    assert.equal(
      (await segment(f, 2, id, 0, Buffer.concat([header, data]))).status,
      200,
    );
    const finished = await f.request(2, `/analysis/audio/${id}/finish`, "POST");
    assert.equal(finished.status, 200, JSON.stringify(finished));
    const manifest = await f.request(1, `/analysis/audio/${id}/manifest`);
    const response = await fetch(`${f.base}${manifest.parts[0].url}`, {
      headers: { Cookie: `cs2_panel_session=${"2".repeat(43)}` },
    });
    assert.equal(response.status, 200);
    const input = Buffer.from(await response.arrayBuffer());
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=channels,sample_rate",
        "-of",
        "json",
        "pipe:0",
      ],
      { input },
    );
    assert.equal(probe.status, 0, probe.stderr.toString());
    assert.deepEqual(JSON.parse(probe.stdout.toString()).streams[0], {
      sample_rate: "48000",
      channels: 2,
    });
    const decoded = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", "pipe:0", "-f", "f32le", "pipe:1"],
      { input },
    );
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    let left = 0,
      right = 0;
    for (let i = 0; i + 8 <= decoded.stdout.length; i += 8) {
      left += decoded.stdout.readFloatLE(i) ** 2;
      right += decoded.stdout.readFloatLE(i + 4) ** 2;
    }
    assert.ok(left > 1);
    assert.ok(
      right < left * 0.01,
      "The silent right channel must not become a mono copy",
    );
  },
);
