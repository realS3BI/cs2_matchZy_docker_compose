import test from "node:test";
import assert from "node:assert/strict";
import { newStratContent, type StratView } from "../shared/strats.js";
import { playableStrats, filterLiveStrats, type LiveFilters } from "../client/src/lib/live-strats.js";

const filters: LiveFilters = { map: "", side: "", ownEconomy: [], opponentEconomy: [], query: "" };
const strat = (patch: Partial<StratView> = {}): StratView => ({
  id: "published", teamId: "team", teamName: "Team", revision: 2, archived: false, canEdit: true, updatedAt: "",
  content: { ...newStratContent(), map: "de_nuke", title: "Changed draft", ownEconomy: ["eco"] },
  published: { version: 1, publishedAt: "", content: { ...newStratContent(), map: "de_mirage", title: "Über A", ownEconomy: ["fullbuy"], opponentEconomy: ["eco"] } },
  ...patch,
});

test("live candidates exclude drafts, archived strats and other teams", () => {
  const result = playableStrats([strat(), strat({ id: "draft", published: null }), strat({ id: "archived", archived: true }), strat({ id: "other", teamId: "other" })], "team");
  assert.deepEqual(result.map(item => item.id), ["published"]);
  assert.equal(result[0].revision, 2);
});
test("live filters use the published map, economy and title rather than draft edits", () => {
  const entries = playableStrats([strat()], "team");
  assert.equal(filterLiveStrats(entries, { ...filters, map: "de_mirage", ownEconomy: ["fullbuy"], query: " ÜBER " }).length, 1);
  assert.equal(filterLiveStrats(entries, { ...filters, map: "de_nuke" }).length, 0);
  assert.equal(filterLiveStrats(entries, { ...filters, ownEconomy: ["eco"] }).length, 0);
});
test("our and opponent buys combine, alternatives within a buy match, unrestricted versions stay available", () => {
  const entries = playableStrats([strat(), strat({ id: "legacy", published: { version: 1, publishedAt: "", content: newStratContent() } })], "team");
  assert.deepEqual(filterLiveStrats(entries, { ...filters, ownEconomy: ["eco", "fullbuy"], opponentEconomy: ["eco"] }).map(item => item.id), ["published", "legacy"]);
  assert.deepEqual(filterLiveStrats(entries, { ...filters, ownEconomy: ["fullbuy"], opponentEconomy: ["fullbuy"] }).map(item => item.id), ["legacy"]);
  assert.equal(filterLiveStrats(entries, { ...filters, side: "ct" }).length, 0);
});
