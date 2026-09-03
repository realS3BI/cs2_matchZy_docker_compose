import test from "node:test";
import assert from "node:assert/strict";
import { Compose } from "../src/compose.js";

test("container name filters are exact and escape regex characters", () => {
  const compose = new Compose({});
  assert.equal(compose.exactNameFilter("cs2"), "name=^/cs2$");
  assert.equal(compose.exactNameFilter("project.cs2"), "name=^/project\\.cs2$");
});
