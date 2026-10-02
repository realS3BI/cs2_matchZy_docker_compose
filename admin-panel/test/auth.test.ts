import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { TEST_USER_ID, tokenHash, verifySteam } from "../src/auth.js";
import { normalizeSettings, migrateAdmins, ADMIN_ROLES } from "../src/policy.js";

const steamId = "76561198000000001";
const token = "b".repeat(43);
async function fixture(role = "admin", testLogin = false) {
  const directory = await mkdtemp(join(tmpdir(), "matchzy-auth-"));
  const user = { identitySteam64: steamId, name: "Test", role };
  let testUser = null;
  const sessions = new Map<string, any>([[tokenHash(token, "secret"), { purpose: "user", steamId, expiresAt: new Date(Date.now() + 60_000) }]]);
  let settings = normalizeSettings({ steamToken: "gslt-secret", rconPassword: "rcon-secret", joinPassword: "join-secret" });
  const nades = [{ name: "public", official: true, owner: "default", map: "de_mirage", lineupImages: [{ url: "/api/uploads/aaaa.png" }] }, { name: "private", owner: steamId, map: "de_mirage", lineupImages: [{ url: "/api/uploads/bbbb.png" }] }];
  const favorites = new Map<string, any[]>();
  const commands = [];
  const actions = [];
  const config = { testLoginUsername: "test", testLoginPassword: testLogin ? "test-password" : "", publicUrl: "https://cs2.example.com", sessionSecret: "secret", liveMatchZyNadesFile: join(directory, "nades.json"), runtimeSettingsFile: join(directory, "settings.json"), runtimeAdminsFile: join(directory, "admins.json"), runtimeMatchZyAdminsFile: join(directory, "matchzy-admins.json"), runtimeMatchZyNadesFile: join(directory, "savednades.json"), uploadDir: directory };
  await writeFile(config.runtimeSettingsFile, JSON.stringify(settings));
  await writeFile(join(directory, "aaaa.png"), "official");
  await writeFile(join(directory, "bbbb.png"), "private");
  const store = {
    getSession: async id => { const session = sessions.get(id); return session?.expiresAt > new Date() ? session : null; },
    createSession: async (id, value) => { sessions.set(id, value); },
    consumeSession: async (id, purpose) => { const value = await store.getSession(id); if (value?.purpose !== purpose) return null; sessions.delete(id); return value; },
    deleteSession: async id => { sessions.delete(id); },
    getUser: async id => id === TEST_USER_ID ? testUser : user,
    recordLogin: async id => assert.equal(id, steamId),
    recordTestLogin: async (id, name) => { testUser = { identitySteam64: id, name, role: "player", flags: [] }; },
    getSettings: async () => settings,
    saveSettings: async value => { settings = value; return value; },
    getNades: async () => nades,
    getNadeFavorites: async id => favorites.get(id) || [],
    setNadeFavorite: async (id, reference, favorite) => {
      const entries = (favorites.get(id) || []).filter(entry => JSON.stringify(entry) !== JSON.stringify(reference));
      if (favorite) entries.push(reference);
      favorites.set(id, entries);
      return entries;
    },
    getNadesDocument: async () => ({ entries: nades }),
    getAdmins: async () => [user],
    saveUser: async value => Object.assign(user, value),
    getLastAction: async () => null,
    logAction: async (...args) => { actions.push(args); }
  };
  const app = createApp({ config, store, compose: { serviceStatus: async () => ({ state: "running" }) }, nadesSync: null,
    steamVerifier: async () => steamId,
    rcon: async ({ command, password }) => { assert.equal(password, "rcon-secret"); commands.push(command); return "hostname: Testserver"; }
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (path, method = "GET", body = undefined, extra = {}) => fetch(`${base}/api${path}`, {
    method, redirect: "manual", headers: { Cookie: `cs2_panel_session=${token}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { request, user, config, store, nades, sessions, commands, actions, directory, base, close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); } };
}

test("test login switches an admin to a separate player session with no admin access", async () => {
  const f = await fixture("admin", true);
  try {
    const response = await f.request("/auth/test", "POST", { username: "test", password: "test-password", role: "admin", steamId });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /Secure/);
    assert.match(response.headers.get("set-cookie"), /SameSite=Lax/);
    assert.equal(f.sessions.has(tokenHash(token, "secret")), false);
    const request = (path, method = "GET", body = undefined) => f.request(path, method, body, { Cookie: cookie });
    const me = await (await request("/auth/me")).json() as any;
    assert.equal(me.user.identitySteam64, TEST_USER_ID);
    assert.equal(me.user.role, "player");
    assert.equal(f.user.role, "admin");
    assert.equal((await request("/nades")).status, 200);
    for (const path of ["/users", "/server/logs", "/server/game"]) assert.equal((await request(path)).status, 403);
    assert.equal((await request("/control/apply", "POST", {})).status, 403);
    const settings = await (await request("/control")).json();
    assert.doesNotMatch(JSON.stringify(settings), /gslt-secret|rcon-secret|join-secret/);
    const reference = { owner: "default", map: "de_mirage", name: "public", favorite: true };
    assert.equal((await request("/nades/favorites", "PUT", reference)).status, 200);
    assert.deepEqual(await f.store.getNadeFavorites(steamId), []);
    Object.assign(await f.store.getUser(TEST_USER_ID), { role: "admin", flags: ["@css/root"] });
    assert.equal((await request("/users")).status, 403);
    assert.equal((await (await request("/auth/me")).json() as any).user.role, "player");
    assert.deepEqual((await (await request("/auth/me")).json() as any).user.flags, []);
    assert.equal((await request("/auth/logout", "POST", {})).status, 200);
    assert.equal((await request("/auth/me")).status, 401);
  } finally { await f.close(); }
});

test("test login is opt-in and rejects invalid credentials without changing the current session", async () => {
  const f = await fixture();
  try {
    const credentials = { username: "test", password: "test-password" };
    assert.equal((await f.request("/auth/test", "POST", credentials)).status, 404);
    f.config.testLoginPassword = "test-password";
    for (const body of [{}, { ...credentials, username: "other" }, { ...credentials, password: "wrong" }, { ...credentials, password: ["test-password"] }]) {
      const response = await f.request("/auth/test", "POST", body);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal(f.sessions.size, 1);
    assert.equal((await f.request("/auth/me")).status, 200);
    const response = await f.request("/auth/test", "POST", credentials, { Cookie: "" });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    f.config.testLoginPassword = "";
    assert.equal((await f.request("/auth/me", "GET", undefined, { Cookie: cookie })).status, 401);
  } finally { await f.close(); }
});

test("test login rejects cross-site requests and limits password attempts", async () => {
  const f = await fixture("admin", true);
  try {
    const credentials = { username: "test", password: "test-password" };
    for (const headers of [{ Origin: "https://attacker.example" }, { "Sec-Fetch-Site": "cross-site" }, { "Content-Type": "application/x-www-form-urlencoded" }])
      assert.equal((await f.request("/auth/test", "POST", credentials, headers)).status, 403);
    for (let i = 0; i < 10; i++) assert.equal((await f.request("/auth/test", "POST", { ...credentials, password: "wrong" })).status, 401);
    assert.equal((await f.request("/auth/test", "POST", credentials)).status, 429);
    assert.equal(f.sessions.size, 1);
  } finally { await f.close(); }
});

for (const role of ["player", "training_player"]) test(`${role} receives all recordings and map metadata without administrative access or secrets`, async () => {
  const f = await fixture(role);
  try {
    const control = await (await f.request("/control")).json() as any;
    assert.deepEqual(control.nades.map(n => n.name), ["public", "private"]);
    assert.deepEqual(Object.keys(control.settings).sort(), ["workshopMapCatalog", "workshopMaps"]);
    assert.ok(!JSON.stringify(control).includes("secret"));
    assert.equal(control.status.mapInventory, null);
    assert.equal(control.admins, undefined);
    const library = await (await f.request("/nades")).json() as any;
    assert.equal(library.library.count, 2);
    for (const path of ["/users", "/settings", "/admins", "/nades/export", "/server/game", "/server/diagnostics", "/server/logs"])
      assert.equal((await f.request(path)).status, 403, path);
    for (const [path, method] of [["/control", "PUT"], ["/nades", "PUT"], ["/nades/import", "POST"], ["/server/rcon", "POST"], ["/server/map", "POST"], ["/server/restart", "POST"], ["/control/apply", "POST"], [`/users/${steamId}`, "PUT"]])
      assert.equal((await f.request(path, method, {})).status, 403, path);
    assert.equal((await f.request("/uploads/aaaa.png")).status, 200);
    assert.equal((await f.request("/uploads/bbbb.png")).status, 200);
  } finally { await f.close(); }
});

test("match admins see all nades, can control permitted settings and RCON but cannot edit content or roles", async () => {
  const f = await fixture("match_admin");
  try {
    const control = await (await f.request("/control")).json() as any;
    assert.equal(control.nades.length, 2);
    assert.ok(!JSON.stringify(control).includes("secret"));
    for (const path of ["/users", "/settings", "/server/logs", "/server/diagnostics"]) assert.equal((await f.request(path)).status, 403);
    assert.equal((await f.request(`/users/${steamId}`, "PUT", { role: "admin" })).status, 403);
    assert.equal((await f.request("/nades", "PUT", { entries: [] })).status, 403);
    assert.equal((await f.request("/control", "PUT", { settings: { serverMode: "nades", matchZySmokeColor: true } })).status, 200);
    assert.equal((await f.request("/control", "PUT", { settings: { rconPassword: "changed" } })).status, 400);
    assert.equal((await f.request("/control", "PUT", { settings: { vacEnabled: false } })).status, 400);
    assert.equal((await f.request("/control/apply", "POST", { settings: { vacEnabled: false } })).status, 400);
    assert.equal((await f.store.getSettings()).vacEnabled, true);
    assert.equal((await f.request("/control", "PUT", { settings: {}, admins: [{ role: "admin" }] })).status, 400);
    assert.equal((await f.request("/server/rcon", "POST", { command: "status" })).status, 200);
    assert.deepEqual(f.commands, ["status"]);
    assert.equal((await f.request("/server/rcon", "POST", { command: "status\nquit" })).status, 400);
    assert.equal(f.actions.at(-1)[3].actor, steamId);
    const map = { workshopId: "123456", title: "Test", mapName: "de_test" };
    assert.equal((await f.request("/control", "PUT", { settings: { workshopMaps: "123456", workshopMapCatalog: JSON.stringify([map]) } })).status, 200);
    assert.equal((await f.request("/control", "PUT", { settings: { workshopMaps: "" } })).status, 400);
    assert.equal((await f.request("/control", "PUT", { settings: { workshopMapCatalog: JSON.stringify([{ ...map, title: "Changed" }]) } })).status, 400);
  } finally { await f.close(); }
});

test("admins save VAC drafts without modifying the running server configuration", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request("/control", "PUT", { settings: { vacEnabled: false } })).status, 200);
    assert.equal((await f.store.getSettings()).vacEnabled, false);
    assert.equal(JSON.parse(await readFile(f.config.runtimeSettingsFile, "utf8")).vacEnabled, true);
    assert.equal((await f.request("/control", "PUT", { settings: { vacEnabled: "false" } })).status, 400);
    assert.equal((await f.request("/control", "PUT", { settings: { vacEnabled: true, additionalArgs: "-insecure" } })).status, 400);
    assert.equal((await f.store.getSettings()).vacEnabled, false);
    assert.equal((await f.request("/control", "PUT", { settings: { vacEnabled: true } })).status, 200);
    assert.equal((await f.store.getSettings()).vacEnabled, true);
  } finally { await f.close(); }
});

test("role changes take effect on existing sessions, logout revokes cookies, cross-origin writes fail", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request("/users")).status, 200);
    assert.equal((await f.request(`/users/${steamId}`, "PUT", { role: "player" })).status, 400);
    assert.equal((await f.request(`/users/${steamId}`, "PUT", { role: "custom" })).status, 400);
    assert.equal((await f.request("/server/rcon", "POST", { command: "quit" }, { Origin: "https://attacker.example" })).status, 403);
    f.user.role = "player";
    assert.equal((await f.request("/users")).status, 403);
    assert.equal((await f.request("/auth/logout", "POST", {})).status, 200);
    assert.equal((await f.request("/auth/me")).status, 401);
    assert.equal((await f.request("/auth/login", "POST", { password: "old" })).status, 401);
  } finally { await f.close(); }
});

test("expired and unknown sessions cannot authenticate", async () => {
  const f = await fixture();
  try {
    f.sessions.get(tokenHash(token, "secret")).expiresAt = new Date(0);
    assert.equal((await f.request("/auth/me")).status, 401);
    assert.equal((await f.request("/auth/me", "GET", undefined, { Cookie: `cs2_panel_session=${"z".repeat(43)}` })).status, 401);
    assert.equal((await f.request("/auth/me", "GET", undefined, { Cookie: "cs2_panel_session=old.signed.password-session" })).status, 401);
  } finally { await f.close(); }
});

test("Steam callback binds to the browser, consumes state once and creates an HttpOnly session", async () => {
  const f = await fixture();
  try {
    const start = await f.request("/auth/steam");
    assert.equal(start.status, 302);
    const provider = new URL(start.headers.get("location"));
    assert.equal(provider.origin, "https://steamcommunity.com");
    const callback = new URL(provider.searchParams.get("openid.return_to"));
    const stateCookie = start.headers.get("set-cookie").split(";")[0];
    const path = callback.pathname.replace("/api", "") + callback.search;
    assert.equal((await f.request(path)).headers.get("location"), "/login?error=steam");
    const response = await f.request(path, "GET", undefined, { Cookie: stateCookie });
    assert.equal(response.headers.get("location"), "/");
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /Secure/);
    assert.equal((await f.request(path, "GET", undefined, { Cookie: stateCookie })).headers.get("location"), "/login?error=steam");
  } finally { await f.close(); }
});

test("Steam verification rejects forged identity, unsigned fields, wrong return URL and expired nonces", async () => {
  const returnTo = "https://cs2.example.com/api/auth/steam/callback?state=test";
  const query = { "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res", "openid.op_endpoint": "https://steamcommunity.com/openid/login", "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`, "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`, "openid.return_to": returnTo, "openid.response_nonce": new Date().toISOString().replace(/\.\d{3}Z$/, "Z") + "nonce", "openid.signed": "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle", "openid.assoc_handle": "handle" };
  let calls = 0;
  const fetcher = (async (url, options) => { calls++; assert.equal(url, "https://steamcommunity.com/openid/login"); assert.equal((options.body as URLSearchParams).get("openid.mode"), "check_authentication"); return new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"); }) as typeof fetch;
  assert.equal(await verifySteam(query, returnTo, fetcher), steamId);
  for (const patch of [{ "openid.identity": "https://attacker.example/id" }, { "openid.op_endpoint": "https://attacker.example" }, { "openid.return_to": "https://attacker.example" }, { "openid.signed": "identity" }, { "openid.mode": "cancel" }, { "openid.response_nonce": "2000-01-01T00:00:00Zx" }, { "openid.identity": [query["openid.identity"]] }])
    await assert.rejects(verifySteam({ ...query, ...patch }, returnTo, fetcher));
  assert.equal(calls, 1);
  await assert.rejects(verifySteam(query, returnTo, (async () => new Response("is_valid:false")) as typeof fetch));
});

test("migration preserves owners and match operators and removes custom privileges", () => {
  assert.deepEqual(ADMIN_ROLES.map(role => role.name), ["Admin", "Match Admin", "Trainingsspieler", "Player"]);
  assert.equal(migrateAdmins([{ role: "training_player" }])[0].role, "training_player");
  assert.deepEqual(migrateAdmins([{ role: "owner" }, { role: "match_operator" }, { role: "moderator" }, { role: "custom", flags: ["@css/map"] }]).map(user => user.role), ["admin", "match_admin", "player", "player"]);
});


for (const role of ["player", "training_player"]) test(`${role} favorites are personal, idempotent and use owner, map and internal name`, async () => {
  const f = await fixture(role);
  try {
    const reference = { owner: "default", map: "de_mirage", name: "public" };
    for (let i = 0; i < 2; i++) {
      const response = await f.request("/nades/favorites", "PUT", { ...reference, favorite: true, identitySteam64: "76561198000000002" });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json() as any).entries, [reference]);
    }
    // Changing a display name does not affect the stored identity.
    Object.assign(f.nades[0], { displayName: "Fenster über T-Spawn" });
    assert.deepEqual((await (await f.request("/nades/favorites")).json() as any).entries, [reference]);
    for (const change of [{ owner: "someone-else" }, { map: "de_nuke" }, { name: "another" }])
      assert.equal((await f.request("/nades/favorites", "PUT", { ...reference, ...change, favorite: true })).status, 404);
    f.user.identitySteam64 = "76561198000000002";
    assert.deepEqual((await (await f.request("/nades/favorites")).json() as any).entries, []);
    f.user.identitySteam64 = steamId;
    // Deleted recordings can still be removed from favorites.
    f.nades.shift();
    assert.deepEqual((await (await f.request("/nades/favorites", "PUT", { ...reference, favorite: false })).json() as any).entries, []);
    assert.equal((await f.request("/nades/favorites", "PUT", { ...reference, favorite: "true" })).status, 400);
    assert.equal((await f.request("/nades/favorites", "GET", undefined, { Cookie: "" })).status, 401);
  } finally { await f.close(); }
});
