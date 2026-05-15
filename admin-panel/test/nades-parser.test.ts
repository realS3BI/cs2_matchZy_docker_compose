import test from "node:test";
import assert from "node:assert/strict";
import { parseSetposSetang } from "../client/src/lib/nades.js";

test("parseSetposSetang parses CS2 setpos setang commands", () => {
  assert.deepEqual(
    parseSetposSetang("setpos 1422.968750 34.830574 -103.968750;setang -24.193808 -166.485611 0.000000"),
    {
      lineupPos: "1422.968750 34.830574 -103.968750",
      lineupAng: "-24.193808 -166.485611 0.000000"
    }
  );
});

test("parseSetposSetang accepts extra whitespace", () => {
  assert.deepEqual(parseSetposSetang("setpos  1 2 3 ; setang 4 5 6"), {
    lineupPos: "1 2 3",
    lineupAng: "4 5 6"
  });
});

test("parseSetposSetang rejects invalid commands", () => {
  assert.equal(parseSetposSetang("setpos 1 2 3"), null);
  assert.equal(parseSetposSetang("setpos 1 2;setang 3 4 5"), null);
  assert.equal(parseSetposSetang("setpos 1 nope 3;setang 4 5 6"), null);
});
