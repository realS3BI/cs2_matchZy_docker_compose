import test from "node:test";
import assert from "node:assert/strict";
import { queueSearch, reviewQueue } from "../client/src/lib/review-queue.js";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";

test("review queue contains every non-official owner and imported lineup, prioritizes submissions and filters maps/status/search", () => {
  const entries = [
    { owner: "default", map: "de_mirage", name: "window", displayName: "Fenster", reviewStatus: "" },
    { owner: "76561198000000001", map: "de_nuke", name: "garage", reviewStatus: "pending" },
    { owner: "76561198000000002", map: "de_mirage", name: "A smoke", reviewStatus: "pending" },
    { owner: "76561198000000003", map: "de_mirage", name: "mid", reviewStatus: "rejected" },
    { owner: "default", map: "de_mirage", name: "official", official: true, reviewStatus: "approved" },
  ];
  const all = reviewQueue(entries, ACTIVE_DUTY_MAPS, new URLSearchParams());
  assert.equal(all.length, 4);
  assert.equal(all[0].reviewStatus, "pending");
  assert.ok(all.some(entry => entry.owner === "default"));
  assert.deepEqual(reviewQueue(entries, ACTIVE_DUTY_MAPS, new URLSearchParams("map=mirage&status=pending")).map(entry => entry.name), ["A smoke"]);
  assert.deepEqual(reviewQueue(entries, ACTIVE_DUTY_MAPS, new URLSearchParams("q=FENSTER&status=open")).map(entry => entry.name), ["window"]);
  assert.deepEqual(reviewQueue(entries, ACTIVE_DUTY_MAPS, new URLSearchParams("status=rejected")).map(entry => entry.name), ["mid"]);
  assert.equal(reviewQueue(entries, ACTIVE_DUTY_MAPS, new URLSearchParams("map=invalid")).length, 0);
  assert.equal(entries[0].name, "window", "sorting must not mutate the library");
});
test("review filter state survives queue links without carrying unrelated query parameters", () => {
  assert.equal(queueSearch(new URLSearchParams("queue=1&map=mirage&status=pending&q=Fenster&redirect=https://example.com")).toString(), "map=mirage&status=pending&q=Fenster");
});
