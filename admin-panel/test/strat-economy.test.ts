import test from "node:test";
import assert from "node:assert/strict";
import { matchesEconomy, newStratContent, type Team } from "../shared/strats.js";
import { validateContent } from "../src/strats.js";
import { workspaceFixture } from "./workspace-fixture.js";

const team: Team = {
  id: "team", name: "Team", revision: 1, members: [], invitations: [],
  active: null, createdAt: new Date().toISOString(),
};
const content = () => ({ ...newStratContent(), title: "Eco rush" });

test("economy selections accept multiple situations and preserve unrestricted legacy strats", () => {
  const legacy = content();
  delete legacy.ownEconomy;
  delete legacy.opponentEconomy;
  const validated = validateContent(legacy, team);
  assert.deepEqual(validated.ownEconomy, []);
  assert.deepEqual(validated.opponentEconomy, []);
  const selected = validateContent({
    ...legacy, ownEconomy: ["eco", "semi-buy", "eco"], opponentEconomy: ["fullbuy", "pistol"],
  }, team);
  assert.deepEqual(selected.ownEconomy, ["semi-buy", "eco"]);
  assert.deepEqual(selected.opponentEconomy, ["fullbuy", "pistol"]);
});

test("invalid economy input is rejected for either team", () => {
  for (const field of ["ownEconomy", "opponentEconomy"]) {
    for (const invalid of [null, "eco", {}, ["forcebuy"], [1], ["eco", "eco", "eco", "eco", "eco"]]) {
      assert.throws(() => validateContent({ ...content(), [field]: invalid }, team), { status: 400 });
    }
  }
});

test("economy filters match alternatives and unrestricted strats", () => {
  assert.equal(matchesEconomy(["fullbuy"], []), true);
  assert.equal(matchesEconomy(undefined, ["eco"]), true);
  assert.equal(matchesEconomy([], ["pistol"]), true);
  assert.equal(matchesEconomy(["eco", "semi-buy"], ["fullbuy", "semi-buy"]), true);
  assert.equal(matchesEconomy(["eco", "semi-buy"], ["fullbuy", "pistol"]), false);
});

test("economy metadata survives saving, copying and publishing without changing older snapshots",
  { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
    const f = await workspaceFixture();
    t.after(f.close);
    const team = (await f.request(0, "/teams", "POST", { name: "Economy test" })).team;
    const initial = { ...content(), ownEconomy: ["eco"], opponentEconomy: ["fullbuy", "semi-buy"] };
    let response = await f.request(0, "/strats", "POST", { teamId: team.id, content: initial });
    assert.equal(response.status, 201);
    let strat = response.strat;
    assert.deepEqual(strat.content.ownEconomy, initial.ownEconomy);
    strat = (await f.request(0, `/strats/${strat.id}/publish`, "POST", { revision: strat.revision })).strat;
    response = await f.request(0, `/strats/${strat.id}`, "PUT", {
      revision: strat.revision, content: { ...initial, ownEconomy: ["pistol"] },
    });
    assert.equal(response.status, 200);
    strat = (await f.request(0, `/strats/${strat.id}`)).strat;
    assert.deepEqual(strat.content.ownEconomy, ["pistol"]);
    assert.deepEqual(strat.published.content.ownEconomy, ["eco"]);
    assert.deepEqual(strat.published.content.opponentEconomy, initial.opponentEconomy);
    response = await f.request(0, "/strats", "POST", { teamId: team.id, content: strat.content });
    assert.equal(response.status, 201);
    assert.deepEqual(response.strat.content.ownEconomy, ["pistol"]);
    assert.deepEqual(response.strat.content.opponentEconomy, initial.opponentEconomy);
    strat = (await f.request(0, `/strats/${strat.id}/publish`, "POST", { revision: strat.revision })).strat;
    assert.deepEqual(strat.published.content.ownEconomy, ["pistol"]);
  });
