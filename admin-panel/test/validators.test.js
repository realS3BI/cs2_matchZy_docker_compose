import test from "node:test";
import assert from "node:assert/strict";
import { adminsToCssConfig, adminsToMatchZyConfig, sanitizeAdmins, sanitizeEnv } from "../src/validators.js";

test("sanitizeEnv rejects unsafe keys", () => {
  assert.throws(() => sanitizeEnv({ "BAD-KEY": "1" }), /Invalid env key/);
});

test("sanitizeAdmins validates steam ids and defaults flags", () => {
  assert.deepEqual(sanitizeAdmins([{ identitySteam64: "76561198000000001" }]), [
    { name: "", identitySteam64: "76561198000000001", flags: ["@css/root"] }
  ]);
});

test("adminsToCssConfig builds CounterStrikeSharp config", () => {
  assert.deepEqual(adminsToCssConfig([{ identitySteam64: "76561198000000001", flags: ["@css/map"] }]), {
    "76561198000000001": {
      identity: "76561198000000001",
      flags: ["@css/map"]
    }
  });
});

test("adminsToMatchZyConfig derives MatchZy admin ids", () => {
  assert.deepEqual(adminsToMatchZyConfig([{ identitySteam64: "76561198000000001", flags: ["@css/root"] }]), {
    "76561198000000001": ""
  });
});
