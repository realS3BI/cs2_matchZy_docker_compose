import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { NadeEvents } from "../src/nade-events.js";

test("library streams publish initial snapshots, subsequent commits and reconnect snapshots", async t => {
  const events = new NadeEvents();
  let entries = [{ name: "original" }];
  const app = express();
  app.get("/", (req, res) => { void events.stream(req, res, async () => entries); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const response = await fetch(url);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const reader = response.body!.getReader();
  const decode = async () => new TextDecoder().decode((await reader.read()).value);
  assert.match(await decode(), /event: library\ndata: \{"entries":\[\{"name":"original"\}\]\}/);
  entries = [{ name: "updated" }, { name: "new" }];
  events.publish(entries);
  assert.match(await decode(), /"updated".*"new"/);
  await reader.cancel();
  const reconnect = await fetch(url);
  const second = reconnect.body!.getReader();
  assert.match(new TextDecoder().decode((await second.read()).value), /"updated".*"new"/);
  await second.cancel();
});

test("a commit during the initial stream read cannot be replaced by an older snapshot", async t => {
  const events = new NadeEvents();
  const app = express();
  app.get("/", (req, res) => { void events.stream(req, res, async () => {
    events.publish([{ name: "newer" }]);
    return [{ name: "stale" }];
  }); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}`);
  const reader = response.body!.getReader();
  const text = new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /newer/);
  assert.doesNotMatch(text, /stale/);
  await reader.cancel();
});
