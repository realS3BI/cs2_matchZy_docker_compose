import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";

const mongodbUri = process.env.TEST_MONGODB_URI;

test("development bootstrap promotes the configured existing player and preserves their data", { skip: !mongodbUri }, async () => {
  const steamId = "76561198000000001";
  const otherSteamId = "76561198000000002";
  const store = new Store({
    mongodbUri,
    mongoDbName: `bootstrap_test_${randomUUID()}`,
    bootstrapAdminSteamId: "",
    promoteBootstrapAdmin: false
  });
  try {
    await store.connect();
    const favorites = [{ owner: steamId, map: "de_mirage", name: "window" }];
    await store.recordLogin(steamId);
    await store.recordLogin(otherSteamId);
    await store.users.updateOne({ _id: steamId }, { $set: { name: "Lokaler Spieler", nadeFavorites: favorites } });
    const before = await store.users.findOne({ _id: steamId });

    // Production bootstrap remains insert-only.
    store.config.bootstrapAdminSteamId = steamId;
    await store.connect();
    assert.equal((await store.getUser(steamId)).role, "player");

    store.config.promoteBootstrapAdmin = true;
    await store.connect();
    const promoted = await store.users.findOne({ _id: steamId });
    assert.deepEqual(promoted, { ...before, role: "admin" });
    assert.equal((await store.getUser(otherSteamId)).role, "player");
    await store.connect();
    assert.deepEqual(await store.users.findOne({ _id: steamId }), promoted);

    // The same update must also support accounts that have never logged in.
    store.config.bootstrapAdminSteamId = "76561198000000003";
    await store.connect();
    assert.equal((await store.getUser(store.config.bootstrapAdminSteamId)).role, "admin");
  } finally {
    if (store.db) await store.db.dropDatabase();
    await store.close();
  }
});
