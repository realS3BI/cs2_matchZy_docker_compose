import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReviewCaptureBridge } from "../src/review-capture.js";

test("browser video start/stop wait for the game and release its panel before upload acknowledgement", async t => {
  const directory = await mkdtemp(join(tmpdir(), "playbook-video-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bridge = new ReviewCaptureBridge(directory), actor = "76561198000000001";
  const session = await bridge.start(actor, { owner: "default", map: "de_mirage", name: "window" }, 1000);
  const put = (name, value) => writeFile(join(directory, actor, `${name}.json`), JSON.stringify(value));
  await assert.rejects(bridge.requestVideo(actor, session.id, "photo", 1100), { status: 400 });
  const start = await bridge.requestVideo(actor, session.id, "video-start", 1200);
  assert.equal(await bridge.poll(actor, session.id, async () => {}, 1500), null);
  await assert.rejects(bridge.requestVideo(actor, session.id, "video-start", 1600), { status: 409 });
  await put("command", { id: start.id, sessionId: session.id, action: "video-start", slot: "video", notBefore: 3000, expiresAt: 31_200 });
  assert.equal((await bridge.poll(actor, session.id, async () => {}, 3000))?.action, "video-start");
  await bridge.acknowledge(actor, { sessionId: session.id, commandId: start.id, ok: true }, 3100);
  await bridge.poll(actor, session.id, async () => {}, 50_000, true);
  // A local duration limit can finish using the original video-start command.
  await bridge.captured(actor, { sessionId: session.id, commandId: start.id }, 51_000);
  const stop = await bridge.requestVideo(actor, session.id, "video-stop", 52_000);
  await put("command", { id: stop.id, sessionId: session.id, action: "video-stop", slot: "video", notBefore: 52_000, expiresAt: 82_000 });
  assert.equal((await bridge.poll(actor, session.id, async () => {}, 52_100))?.action, "video-stop");
  await bridge.captured(actor, { sessionId: session.id, commandId: stop.id }, 52_200);
  assert.equal(JSON.parse(await readFile(join(directory, actor, "captured.json"), "utf8")).commandId, stop.id);
  assert.equal(JSON.parse(await readFile(join(directory, actor, "result.json"), "utf8")).commandId, start.id, "game release must precede upload acknowledgement");
  assert.equal(await bridge.poll(actor, session.id, async () => {}, 52_300), null);
  await bridge.acknowledge(actor, { sessionId: session.id, commandId: stop.id, ok: true }, 52_400);
});
