import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, serializeEnvFile } from "../src/env-file.js";

test("parseEnvFile handles quotes and comments", () => {
  assert.deepEqual(parseEnvFile('A=1\nB="two words"\n# ignored\nC=\n'), {
    A: "1",
    B: "two words",
    C: ""
  });
});

test("serializeEnvFile quotes values with spaces", () => {
  const output = serializeEnvFile({ CS2_SERVERNAME: "CS2 MatchZy Server", CS2_MAXPLAYERS: "10" });
  assert.match(output, /CS2_SERVERNAME="CS2 MatchZy Server"/);
  assert.match(output, /CS2_MAXPLAYERS=10/);
});
