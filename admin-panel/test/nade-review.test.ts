import test from "node:test";
import assert from "node:assert/strict";
import { applyPlayerNadeRequest } from "../src/nade-review.js";

const owner = "76561198000000001";
const entry = { owner, name: "window", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "0 90 0", desc: "Alt", updatedAt: "2026-09-01T00:00:00.000Z" };
const request = { id: "a".repeat(32), actor: owner, owner, name: entry.name, map: entry.map, revision: entry.updatedAt, action: "review" };

test("player review and edit preserve ownership and cannot grant official status", () => {
  const [review] = applyPlayerNadeRequest([entry], { ...request, official: true, mustKnow: true });
  assert.equal(review.reviewStatus, "pending");
  assert.equal(review.official, undefined);
  assert.equal(review.mustKnow, undefined);
  assert.equal(review.owner, owner);
  const [edited] = applyPlayerNadeRequest([review], { ...request, revision: review.updatedAt, action: "throwToTitle", value: "Fenster über T-Spawn" });
  assert.equal(edited.throwToTitle, "Fenster über T-Spawn");
  assert.equal(edited.name, "window");
  assert.equal(edited.reviewStatus, "");
  assert.notEqual(edited.updatedAt, review.updatedAt);
  assert.equal(applyPlayerNadeRequest([entry], { ...request, action: "delete" }).length, 0);
});

test("foreign, official, stale, absent and unsupported requests are rejected", () => {
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, actor: "76561198000000002" }));
  assert.throws(() => applyPlayerNadeRequest([{ ...entry, official: true }], request));
  assert.throws(() => applyPlayerNadeRequest([{ ...entry, updatedAt: "newer" }], request));
  assert.throws(() => applyPlayerNadeRequest([], request));
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "official", value: true }));
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "desc", value: "x".repeat(301) }));
  assert.throws(() => applyPlayerNadeRequest([entry], { ...request, action: "displayName", value: "bad\nname" }));
});
