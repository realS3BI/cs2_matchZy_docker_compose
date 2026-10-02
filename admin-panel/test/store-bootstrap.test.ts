import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { TEST_USER_ID } from "../src/auth.js";

const mongodbUri = process.env.TEST_MONGODB_URI;

test("test account logins preserve personal favorites and never inherit admin privileges", { skip: !mongodbUri }, async () => {
  const store = new Store({ mongodbUri, mongoDbName: `test_login_${randomUUID()}`, bootstrapAdminSteamId: "" });
  try {
    await store.connect();
    const steamId = "76561198000000001";
    await store.saveUser({ identitySteam64: steamId, name: "Admin", role: "admin" });
    await store.recordTestLogin(TEST_USER_ID, "test");
    assert.equal((await store.getUser(TEST_USER_ID)).role, "player");
    const reference = { owner: steamId, map: "de_mirage", name: "window" };
    await store.setNadeFavorite(TEST_USER_ID, reference, true);
    const before = await store.users.findOne({ _id: TEST_USER_ID });
    await store.saveUser({ identitySteam64: TEST_USER_ID, name: "Promoted", role: "admin" });
    await store.recordTestLogin(TEST_USER_ID, "test");
    assert.equal((await store.getUser(TEST_USER_ID)).role, "player");
    assert.deepEqual((await store.getUser(TEST_USER_ID)).flags, []);
    assert.deepEqual(await store.getNadeFavorites(TEST_USER_ID), [reference]);
    assert.deepEqual(await store.getNadeFavorites(steamId), []);
    assert.equal((await store.getUser(steamId)).role, "admin");
    assert.deepEqual((await store.users.findOne({ _id: TEST_USER_ID })).createdAt, before.createdAt);
  } finally {
    if (store.db) await store.db.dropDatabase();
    await store.close();
  }
});

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
