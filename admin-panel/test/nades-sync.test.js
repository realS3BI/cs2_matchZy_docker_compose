import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { NadesSyncService } from "../src/nades-sync.js";

function sampleEntry(patch = {}) {
  return {
    name: "window_smoke",
    map: "de_mirage",
    type: "Smoke",
    desc: "from T roof",
    lineupPos: "1 2 3",
    lineupAng: "4 5 6",
    owner: "default",
    ...patch
  };
}

function sampleConfig(patch = {}) {
  const entry = sampleEntry(patch);
  return {
    [entry.owner]: {
      [entry.name]: {
        LineupPos: entry.lineupPos,
        LineupAng: entry.lineupAng,
        Desc: entry.desc,
        Map: entry.map,
        Type: entry.type
      }
    }
  };
}

function comparable(entries) {
  return entries.map(({ updatedAt, id, ...entry }) => entry);
}

class FakeStore {
  constructor(entries = []) {
    this.entries = entries;
    this.actions = [];
  }

  async getNades() {
    return this.entries;
  }

  async replaceNadesFromSync(entries, details = {}) {
    this.entries = entries;
    await this.logAction("nades_sync", "success", "Nades imported from MatchZy savednades.json", details);
    return entries;
  }

  async logAction(type, status, message, details = {}) {
    this.actions.push({ type, status, message, details });
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createHarness(t, entries = []) {
  const dir = await mkdtemp(join(tmpdir(), "nades-sync-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const store = new FakeStore(entries);
  const service = new NadesSyncService({
    config: {
      liveMatchZyNadesFile: join(dir, "cs2", "savednades.json"),
      runtimeMatchZyNadesFile: join(dir, "runtime", "matchzy-savednades.json"),
      nadesSyncEnabled: true,
      nadesSyncIntervalMs: 10000
    },
    store
  });
  return { dir, store, service };
}

test("nades sync imports existing live file on startup", async (t) => {
  const { store, service } = await createHarness(t);
  await writeJson(service.liveFile, sampleConfig());

  await service.start();
  await service.stop();

  assert.deepEqual(comparable(store.entries), [sampleEntry()]);
  assert.equal(store.actions.at(-1).type, "nades_sync");
  assert.equal(store.actions.at(-1).status, "success");
});

test("nades sync writes Mongo entries when live file is missing on startup", async (t) => {
  const { service } = await createHarness(t, [sampleEntry()]);

  await service.start();
  await service.stop();

  assert.deepEqual(JSON.parse(await readFile(service.liveFile, "utf8")), sampleConfig());
  assert.deepEqual(JSON.parse(await readFile(service.runtimeFile, "utf8")), sampleConfig());
});

test("writeFromMongo atomically updates live and runtime files", async (t) => {
  const { service } = await createHarness(t);
  const updated = sampleEntry({ name: "stairs_flash", type: "Flash", desc: "pop flash" });

  await service.writeFromMongo([updated]);

  assert.deepEqual(JSON.parse(await readFile(service.liveFile, "utf8")), sampleConfig(updated));
  assert.deepEqual(JSON.parse(await readFile(service.runtimeFile, "utf8")), sampleConfig(updated));
  assert.ok(service.status().lastWriteAt);
});

test("poll ignores a file change written by the service itself", async (t) => {
  const { store, service } = await createHarness(t);

  await service.writeFromMongo([sampleEntry()]);
  await service.poll();

  assert.deepEqual(store.actions, []);
});

test("poll imports external live file changes", async (t) => {
  const { store, service } = await createHarness(t, [sampleEntry()]);
  const external = sampleEntry({ name: "connector_molly", type: "Molly", desc: "deep molly" });

  await service.writeFromMongo([sampleEntry()]);
  await wait(5);
  await writeJson(service.liveFile, sampleConfig(external));
  await stat(service.liveFile);
  await service.poll();

  assert.deepEqual(comparable(store.entries), [external]);
  assert.equal(store.actions.at(-1).status, "success");
});

test("invalid live JSON is logged and does not overwrite Mongo entries", async (t) => {
  const existing = sampleEntry();
  const { store, service } = await createHarness(t, [existing]);
  await mkdir(dirname(service.liveFile), { recursive: true });
  await writeFile(service.liveFile, "{invalid", "utf8");

  await service.poll();

  assert.deepEqual(comparable(store.entries), [existing]);
  assert.equal(store.actions.at(-1).type, "nades_sync");
  assert.equal(store.actions.at(-1).status, "failed");
});
