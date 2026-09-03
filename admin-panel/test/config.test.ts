import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("only the two bootstrap secrets come from deployment environment", () => {
  const previous = {
    ADMIN_PANEL_PASSWORD: process.env.ADMIN_PANEL_PASSWORD,
    ADMIN_PANEL_SESSION_SECRET: process.env.ADMIN_PANEL_SESSION_SECRET,
    ADMIN_PANEL_PORT: process.env.ADMIN_PANEL_PORT,
    MONGODB_URI: process.env.MONGODB_URI,
    ADMIN_PANEL_CONTROL_MODE: process.env.ADMIN_PANEL_CONTROL_MODE
  };
  Object.assign(process.env, {
    ADMIN_PANEL_PASSWORD: "panel-password",
    ADMIN_PANEL_SESSION_SECRET: "session-secret",
    ADMIN_PANEL_PORT: "9999",
    MONGODB_URI: "mongodb://external.invalid/db",
    ADMIN_PANEL_CONTROL_MODE: "compose"
  });

  try {
    const config = getConfig();
    assert.equal(config.password, "panel-password");
    assert.equal(config.sessionSecret, "session-secret");
    assert.equal(config.port, 8080);
    assert.equal(config.mongodbUri, "mongodb://mongodb:27017/cs2_admin_panel");
    assert.equal(config.controlMode, "docker");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
