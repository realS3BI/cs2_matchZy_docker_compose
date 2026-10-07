import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { workspaceFixture, ids } from "./workspace-fixture.js";
import { SourceSecrets, trustedDemoUrl } from "../src/match-sources.js";
import { MatchStore } from "../src/match-store.js";

const mongo = { skip: !process.env.TEST_MONGODB_URI };
async function setup(t) {
  const f = await workspaceFixture();
  t.after(() => f.close());
  const team = (await f.request(0, "/teams", "POST", { name: "Scout-Team" }))
    .team;
  const actor = await f.store.getUser(ids[0]);
  return { ...f, team, actor };
}
function faceit(
  roster = Array.from({ length: 5 }, () => randomUUID()),
  maps = ["de_mirage"],
) {
  return {
    match_id: randomUUID(),
    started_at: Date.now() / 1000,
    competition_name: "Liga Österreich",
    competition_id: "",
    voting: { map: { pick: maps } },
    demo_url: maps.map((_, i) => `https://demos.faceit.com/match${i}.dem.gz`),
    results: { score: { faction1: 13, faction2: 7 } },
    teams: {
      faction1: {
        faction_id: randomUUID(),
        name: "Gegner",
        roster: roster.map((id, index) => ({
          player_id: id,
          nickname: `Spieler ${index}`,
          game_player_id: ids[index % 4],
        })),
      },
      faction2: {
        faction_id: randomUUID(),
        name: "Rivale",
        roster: Array.from({ length: 5 }, () => ({
          player_id: randomUUID(),
          nickname: "Rivale",
        })),
      },
    },
  };
}
test("FACEIT setup is admin-only, validates keys, encrypts credentials and enables imports after restart", mongo, async (t) => {
  const f = await setup(t);
  const endpoint = "/analysis/providers/faceit";
  assert.equal((await f.request(1, endpoint, "PUT", { apiKey: "secret-key" })).status, 403);
  assert.equal((await f.request(0, endpoint, "PUT", {})).status, 400);
  assert.equal((await f.request(0, endpoint, "PUT", { apiKey: 123 })).status, 400);
  assert.equal((await f.request(0, endpoint, "PUT", { apiKey: "invalid key" })).status, 400);
  assert.equal((await f.request(0, endpoint, "PUT", { downloadsToken: "download-token" })).status, 400);
  const originalFetch = globalThis.fetch;
  const raw = faceit();
  const playerId = randomUUID();
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (!address.startsWith("https://open.faceit.com/data/v4")) return originalFetch(url, options);
    if (options?.headers?.["Authorization"] !== "Bearer secret-key") return new Response("{}", { status: 401 });
    if (address.endsWith("/games/cs2")) return Response.json({ game_id: "cs2" });
    if (address.includes("/players?game=cs2&game_player_id=")) return Response.json({ player_id: playerId });
    if (address.includes("/history?")) return Response.json({ items: [{ match_id: raw.match_id }] });
    if (address.endsWith(`/matches/${raw.match_id}`)) return Response.json(raw);
    throw new Error(`Unexpected FACEIT request: ${address}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await f.request(0, endpoint, "PUT", { apiKey: "rejected-key" })).status, 502);
  assert.equal(await f.store.matches.providerCredentials.findOne({ _id: "faceit" }), null);
  const saved = await f.request(0, endpoint, "PUT", { apiKey: "secret-key" });
  assert.deepEqual(saved, { status: 200, ok: true });
  let capabilities = (await f.request(1, "/analysis/connections")).capabilities;
  assert.equal(capabilities.faceit, true);
  assert.equal(capabilities.faceitDownloads, false);
  const imported = await f.request(1, "/analysis/matches/faceit", "POST", { matchId: raw.match_id });
  assert.equal(imported.status, 201);
  assert.equal((await f.store.matches.entries.findOne({ _id: imported.ids[0] })).demoStatus, "access_required");
  assert.equal((await f.request(0, endpoint, "PUT", { downloadsToken: "download-token" })).status, 200);
  const credentials = await f.store.matches.providerCredentials.findOne({ _id: "faceit" });
  assert.notEqual(credentials.apiKey, "secret-key");
  assert.notEqual(credentials.downloadsToken, "download-token");
  assert.equal(f.store.matches.secrets.decrypt(credentials.apiKey), "secret-key");
  assert.equal(f.store.matches.secrets.decrypt(credentials.downloadsToken), "download-token");
  assert.equal((await f.store.matches.entries.findOne({ _id: imported.ids[0] })).demoStatus, "available");
  const restarted = new MatchStore(f.store.db, f.store.analysis, f.store.workspace, { sessionSecret: f.config.sessionSecret });
  await restarted.initialize();
  assert.equal(restarted.config.faceitApiKey, "secret-key");
  assert.equal(restarted.config.faceitDownloadsToken, "download-token");
  const connection = await f.request(1, "/analysis/connections", "POST", { source: "faceit", autoDownload: true });
  assert.equal(connection.status, 201);
  assert.equal((await f.request(1, `/analysis/connections/${connection.id}/sync`, "POST")).status, 200);
  const publicSources = await f.request(1, "/analysis/connections");
  assert.equal(publicSources.entries[0].playerId, playerId);
  assert.equal(publicSources.capabilities.faceitDownloads, true);
  assert.equal(JSON.stringify(publicSources).includes("secret-key"), false);
  assert.equal(JSON.stringify(publicSources).includes("download-token"), false);
  assert.equal((await f.request(1, "/analysis/matches")).entries.length, 1);
});
test(
  "FACEIT history deduplicates maps within each scope and keeps series scores out of map statistics",
  mongo,
  async (t) => {
    const f = await setup(t),
      raw = faceit(undefined, ["de_mirage", "de_nuke"]);
    const first = await f.store.matches.saveFaceit(raw, ids[0], f.team.id);
    assert.deepEqual(
      await f.store.matches.saveFaceit(raw, ids[0], f.team.id),
      first,
    );
    assert.equal(
      await f.store.matches.entries.countDocuments({ teamId: f.team.id }),
      2,
    );
    const personal = await f.store.matches.saveFaceit(raw, ids[0], null);
    assert.notEqual(personal[0], first[0]);
    const records = await f.store.matches.entries
      .find({ teamId: f.team.id })
      .toArray();
    assert.deepEqual(records.map((m) => m.map).sort(), [
      "de_mirage",
      "de_nuke",
    ]);
    assert.ok(records.every((m) => m.sides.every((s) => s.score === null)));
    assert.equal(
      (await f.store.matches.list(await f.store.getUser(ids[3]))).entries
        .length,
      0,
    );
  },
);
test(
  "Prematch reports separate confirmed lineups and partial rosters and disclose missing demos",
  mongo,
  async (t) => {
    const f = await setup(t),
      raw = faceit(),
      roster = raw.teams.faction1.roster.map((p) => p.player_id);
    const exact = await f.store.matches.saveFaceit(raw, ids[0], f.team.id);
    const partial = await f.store.matches.saveFaceit(
      faceit([...roster.slice(0, 4), randomUUID()]),
      ids[0],
      f.team.id,
    );
    const prep = await f.store.matches.savePreparation(f.actor, {
      teamId: f.team.id,
      title: "Liga vorbereiten",
      opponent: "",
      roster,
      matchIds: [...exact, ...partial],
      competition: "Liga",
      days: 30,
    });
    const report = await f.store.matches.report(prep.id, f.actor);
    assert.deepEqual(report.coverage, {
      found: 2,
      exact: 1,
      partial: 1,
      analyzed: 0,
    });
    assert.equal(report.maps[0].matches, 1);
    assert.equal(report.maps[0].results, 1);
    assert.equal(report.maps[0].wins, 1);
    assert.deepEqual(report.observations, []);
    await assert.rejects(
      f.store.matches.preparation(prep.id, await f.store.getUser(ids[3])),
      { status: 404 },
    );
    await assert.rejects(
      f.store.matches.savePreparation(
        f.actor,
        { ...prep, revision: 0 },
        prep.id,
      ),
      { status: 409 },
    );
  },
);
test("Source pause prevents pending automatic downloads", mongo, async (t) => {
  const f = await setup(t),
    connectionId = randomUUID();
  await f.store.matches.connections.insertOne({
    _id: connectionId,
    enabled: false,
    autoDownload: true,
  });
  await f.store.matches.entries.insertOne({
    _id: randomUUID(),
    ownerId: ids[0],
    demoId: null,
    autoDownload: true,
    connectionIds: [connectionId],
  });
  let calls = 0;
  f.store.imports.download = async () => {
    calls++;
    return { demoId: "" };
  };
  await f.store.imports.tick();
  assert.equal(calls, 0);
});
test(
  "Storage accounts replay files, excludes team audio from personal quota and protects pinned recordings",
  mongo,
  async (t) => {
    const f = await setup(t);
    await f.store.recordings.tracks.insertOne({
      _id: "audio",
      id: "audio",
      teamId: f.team.id,
      ownerId: ids[0],
      bytes: 1024,
      sessionId: "protected",
      parts: [],
    });
    assert.equal((await f.store.storage.usage(`user:${ids[0]}`)).audio, 0);
    assert.equal(
      (await f.store.storage.usage(`team:${f.team.id}`)).audio,
      1024,
    );
    await f.store.recordings.sessions.insertOne({
      _id: "protected",
      id: "protected",
      teamId: f.team.id,
      status: "finished",
      pinned: false,
      expiresAt: new Date(0).toISOString(),
    });
    await f.store.recordings.explanations.insertOne({
      _id: randomUUID(),
      sessionId: "protected",
    });
    await f.store.imports.cleanup();
    assert.ok(await f.store.recordings.sessions.findOne({ _id: "protected" }));
    await f.store.recordings.explanations.deleteMany({
      sessionId: "protected",
    });
    await f.store.imports.cleanup();
    assert.equal(
      await f.store.recordings.sessions.findOne({ _id: "protected" }),
      null,
    );
  },
);
test(
  "Prematch references prevent deleting imported demos",
  mongo,
  async (t) => {
    const f = await setup(t),
      demo = await f.store.analysis.create(f.actor, {
        teamId: f.team.id,
        title: "Gegnerdemo",
        filename: "match.dem",
        source: "faceit",
      });
    const matchId = randomUUID();
    await f.store.matches.entries.insertOne({
      _id: matchId,
      id: matchId,
      demoId: demo.id,
      teamId: f.team.id,
    });
    await f.store.matches.preparations.insertOne({
      _id: randomUUID(),
      matchIds: [matchId],
    });
    assert.equal(await f.store.analysis.referenced(demo.id), true);
    await assert.rejects(f.store.analysis.remove(demo.id, f.actor), {
      status: 409,
    });
  },
);
test("Provider URLs reject untrusted hosts and secret envelopes authenticate their data", () => {
  for (const url of [
    "http://127.0.0.1/x.dem",
    "https://evil.example/x.dem",
    "https://demos.faceit.com.evil.example/x.dem",
    "https://user:password@demos.faceit.com/x.dem",
  ])
    assert.throws(() => trustedDemoUrl(url, "faceit"));
  assert.equal(
    trustedDemoUrl("https://demos.faceit.com/x.dem.gz", "faceit").hostname,
    "demos.faceit.com",
  );
  const secrets = new SourceSecrets("fixture-secret"),
    encrypted = secrets.encrypt("sensitive-auth-code");
  assert.equal(secrets.decrypt(encrypted), "sensitive-auth-code");
  assert.ok(!encrypted.includes("sensitive-auth-code"));
  assert.throws(() => new SourceSecrets("other-secret").decrypt(encrypted));
});

test(
  "Premier history credentials remain encrypted and visible only to their owner",
  mongo,
  async (t) => {
    const f = await setup(t),
      authenticationCode = "fixture-authentication-code";
    const result = await f.request(0, "/analysis/connections", "POST", {
      source: "premier",
      teamId: f.team.id,
      shareCode: "CSGO-ABCDE-ABCDE-ABCDE-ABCDE-ABCDE",
      authenticationCode,
    });
    assert.equal(result.status, 201);
    const stored = await f.store.matches.connections.findOne({
      _id: result.id,
    });
    assert.notEqual(stored.historySecret, authenticationCode);
    assert.equal(
      f.store.matches.secrets.decrypt(stored.historySecret),
      authenticationCode,
    );
    const own = await f.request(0, "/analysis/connections");
    assert.equal(own.entries[0].hasHistoryAccess, true);
    assert.equal(own.entries[0].historySecret, undefined);
    assert.equal(own.entries[0].cursor, undefined);
    assert.deepEqual((await f.request(3, "/analysis/connections")).entries, []);
    assert.equal(
      (
        await f.request(3, `/analysis/connections/${result.id}`, "PATCH", {
          enabled: false,
          autoDownload: false,
        })
      ).status,
      404,
    );
  },
);

test(
  "Opponent sync imports matching tournament entries with an explicit competition filter",
  mongo,
  async (t) => {
    const f = await setup(t),
      raw = faceit(),
      roster = raw.teams.faction1.roster.map((p) => p.player_id),
      competitionId = randomUUID(),
      opponentId = randomUUID();
    raw.competition_id = competitionId;
    const prep = await f.store.matches.savePreparation(f.actor, {
      teamId: f.team.id,
      title: "Turnier",
      opponent: opponentId,
      roster,
      matchIds: [],
      competitionSource: `https://www.faceit.com/en/championship/${competitionId}/Cup`,
    });
    const calls = [];
    f.store.matches.faceit = async (path) => {
      calls.push(path);
      if (path === `/teams/${opponentId}`) return { members: [] };
      if (path.includes("/history?")) return { items: [] };
      if (path === `/championships/${competitionId}`)
        return { name: "Liga Österreich" };
      if (path.startsWith(`/championships/${competitionId}/matches?`))
        return { items: [raw] };
      if (path === `/matches/${raw.match_id}`) return raw;
      throw new Error(`Unexpected fixture request ${path}`);
    };
    await f.store.matches.syncOpponent(prep.id, f.actor);
    const report = await f.store.matches.report(prep.id, f.actor);
    assert.equal(report.preparation.matchIds.length, 1);
    assert.equal(report.coverage.exact, 1);
    assert.equal(report.preparation.competition, "Liga Österreich");
    assert.ok(
      calls.some((path) => path.includes("type=past&offset=0&limit=100")),
    );
  },
);
