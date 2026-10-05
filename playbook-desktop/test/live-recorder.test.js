import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { LiveRecorder, audioOptions } from "../src/live-recorder.js";

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "live-recorder-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [],
    record = {
      id: "local-record",
      ownerId: "owner",
      sessionId: "session",
      startedAt: 1000,
      sessionStartedAt: 1000,
      offset: 0,
      finished: true,
      tracks: { discord: "discord-track", microphone: "microphone-track" },
      uploaded: { discord: [], microphone: [] },
    };
  const folder = path.join(directory, record.id);
  await mkdir(folder);
  await writeFile(path.join(folder, "recording.json"), JSON.stringify(record));
  for (const source of ["discord", "microphone"]) {
    await writeFile(
      path.join(folder, `${source}-0.json`),
      JSON.stringify({ source, sequence: 0, start: 0, duration: 30 }),
    );
    await writeFile(path.join(folder, `${source}-0.m4a`), "synthetic-aac");
  }
  const request = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/room"))
      return {
        canRecord: true,
        session: { recorderId: "owner", status: "finished" },
        ...options.room,
      };
    if (options.fail?.(url)) throw new Error("Offline");
    return { ok: true };
  };
  const recorder = new LiveRecorder({
    directory,
    executable: "unused.exe",
    request,
    capture: () => {
      throw new Error("Must not launch a process");
    },
  });
  return { directory, folder, calls, record, recorder, options };
}
test("Failed audio uploads remain local and resume before deleting the recording", async (t) => {
  let fail = true;
  const f = await fixture(t, {
    fail: (url) => fail && url.includes("/segments/"),
  });
  await f.recorder.retry();
  assert.match(f.recorder.state().error, /Offline/);
  await access(f.folder);
  fail = false;
  await f.recorder.retry();
  await assert.rejects(access(f.folder));
  assert.equal(f.calls.filter((c) => c.url.endsWith("/finish")).length, 2);
  assert.equal(f.recorder.state().error, "");
});
test("Unconfirmed finalization preserves all audio and skips acknowledged segments on retry", async (t) => {
  let fail = true;
  const f = await fixture(t, {
    fail: (url) => fail && url.endsWith("/finish"),
  });
  await f.recorder.retry();
  await access(f.folder);
  const saved = JSON.parse(
    await readFile(path.join(f.folder, "recording.json"), "utf8"),
  );
  assert.deepEqual(saved.uploaded.discord, [0]);
  fail = false;
  await f.recorder.retry();
  assert.equal(
    f.calls.filter((c) => c.url.includes("/discord-track/segments/")).length,
    1,
  );
  await assert.rejects(access(f.folder));
});
test("A different logged-in recorder cannot upload or finalize retained audio", async (t) => {
  const f = await fixture(t, {
    room: { canRecord: true, session: { recorderId: "another-owner" } },
  });
  await f.recorder.retry();
  assert.equal(f.calls.length, 1);
  await access(f.folder);
});
test("Incomplete WAV data is kept when native recovery is not available", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.folder, "discord-1.wav"), "incomplete");
  await f.recorder.retry();
  assert.match(f.recorder.state().error, /Must not launch/);
  await access(f.folder);
  assert.equal(f.calls.filter((c) => c.url.endsWith("/finish")).length, 0);
});
test("A finished manifest after an app crash can be uploaded without starting CS2 or capture", async (t) => {
  const f = await fixture(t);
  f.record.finished = false;
  await writeFile(
    path.join(f.folder, "recording.json"),
    JSON.stringify(f.record),
  );
  await f.recorder.retry();
  await assert.rejects(access(f.folder));
});

test("A lost track-registration response retries the same persisted ID and uses the session clock", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "live-registration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const record = {
    id: "registration",
    sessionId: "session",
    ownerId: "owner",
    startedAt: 6000,
    sessionStartedAt: 0,
    offset: 999_000,
    receivedAt: 4000,
    sessionBase: 12,
    tracks: {},
    uploaded: { discord: [], microphone: [] },
  };
  const registrations = [];
  let fail = true;
  const recorder = new LiveRecorder({
    directory,
    executable: "unused.exe",
    request: async (url, options) => {
      const input = JSON.parse(options.body);
      registrations.push(input);
      const saved = JSON.parse(
        await readFile(
          path.join(directory, record.id, "recording.json"),
          "utf8",
        ),
      );
      assert.equal(saved.trackIds[input.source], input.id);
      if (fail) {
        fail = false;
        throw new Error("Response lost");
      }
      return { track: { id: input.id } };
    },
  });
  await assert.rejects(recorder.register(record), /Response lost/);
  await recorder.register(record);
  assert.equal(registrations[0].id, registrations[1].id);
  assert.equal(registrations[1].start, 14);
  assert.notEqual(record.tracks.discord, record.tracks.microphone);
});

test("Starting a recording requires the currently assigned recorder and never starts capture otherwise", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "live-permission-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let captured = false;
  const recorder = new LiveRecorder({
    directory,
    executable: "unused.exe",
    request: async () => ({
      canRecord: false,
      session: { status: "recording" },
    }),
    capture: () => {
      captured = true;
    },
  });
  await assert.rejects(recorder.begin("session"), /nicht als Aufnehmender/);
  assert.equal(captured, false);
  assert.equal(recorder.state().recording, false);
});

test("Device capture records only game and communication with explicit stable endpoint IDs", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "live-devices-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  const posts = [];
  let argumentsUsed;
  const recorder = new LiveRecorder({
    directory,
    executable: "helper.exe",
    request: async (url, init) => {
      if (url.endsWith("/room"))
        return {
          canRecord: true,
          serverTime: Date.now(),
          session: {
            recorderId: "owner",
            status: "recording",
            duration: 5,
            clockAt: Date.now(),
          },
        };
      const data = JSON.parse(init.body);
      posts.push(data);
      return { track: { id: data.id } };
    },
    capture: (executable, args) => {
      argumentsUsed = args;
      setImmediate(() =>
        child.stdout.write(
          JSON.stringify({
            type: "ready",
            startedAt: Date.now(),
            microphoneControl: true,
            muted: false,
          }) + "\n",
        ),
      );
      return child;
    },
  });
  const options = {
    gameDeviceId: "{game-device}",
    voiceDeviceId: "{voice-device}",
    microphoneStrip: 0,
  };
  await recorder.begin("session", options);
  assert.deepEqual(argumentsUsed.slice(2), [
    options.gameDeviceId,
    options.voiceDeviceId,
    "0",
  ]);
  assert.deepEqual(
    posts.map((p) => p.source),
    ["game", "discord"],
  );
  assert.equal(posts[0].start, posts[1].start);
  assert.deepEqual(recorder.active.sources, ["game", "discord"]);
  let command;
  child.stdin.once("data", (value) => {
    command = JSON.parse(value);
  });
  recorder.mute(true);
  assert.deepEqual(command, { action: "mute", muted: true });
  assert.equal(
    recorder.state().muted,
    false,
    "Only an acknowledged routing change changes the indicator",
  );
  child.stdout.write('{"type":"microphone","muted":true}\n');
  assert.equal(recorder.state().muted, true);
  child.emit("close", 0);
  await recorder.stopped;
  await recorder.retry();
});

test("Device selection rejects missing and duplicate sources without falling back to the microphone", () => {
  for (const options of [
    undefined,
    {},
    { gameDeviceId: "same", voiceDeviceId: "same", microphoneStrip: 0 },
    { gameDeviceId: "game", voiceDeviceId: "voice", microphoneStrip: 5 },
  ])
    assert.throws(
      () => audioOptions(options),
      /unterschiedliche Aufnahmegeräte/,
    );
});

test("New two-bus recordings resume uploads and finalize both sources after restart", async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.folder, "microphone-0.json"));
  await rm(path.join(f.folder, "microphone-0.m4a"));
  f.record.sources = ["game", "discord"];
  f.record.tracks = { game: "game-track", discord: "discord-track" };
  f.record.uploaded = { game: [], discord: [] };
  await writeFile(
    path.join(f.folder, "recording.json"),
    JSON.stringify(f.record),
  );
  await writeFile(
    path.join(f.folder, "game-0.json"),
    JSON.stringify({ source: "game", sequence: 0, start: 0, duration: 30 }),
  );
  await writeFile(path.join(f.folder, "game-0.m4a"), "synthetic-aac");
  await f.recorder.retry();
  assert.equal(f.calls.filter((c) => c.url.endsWith("/finish")).length, 2);
  assert.equal(
    f.calls.some((c) => c.url.includes("microphone")),
    false,
  );
  await assert.rejects(access(f.folder));
});
