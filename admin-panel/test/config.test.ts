import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("Steam login uses the configured public origin", () => {
  const previous = {
    ADMIN_PANEL_PUBLIC_URL: process.env.ADMIN_PANEL_PUBLIC_URL,
    ADMIN_PANEL_SESSION_SECRET: process.env.ADMIN_PANEL_SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    PLAYBOOK_COMPOSE_PROJECT_NAME: process.env.PLAYBOOK_COMPOSE_PROJECT_NAME
  };
  Object.assign(process.env, {
    ADMIN_PANEL_PUBLIC_URL: "https://cs2.example.com",
    ADMIN_PANEL_SESSION_SECRET: "session-secret",
    NODE_ENV: "production",
    PLAYBOOK_COMPOSE_PROJECT_NAME: ""
  });

  try {
    const config = getConfig();
    assert.equal(config.publicUrl, "https://cs2.example.com");
    assert.equal(config.sessionSecret, "session-secret");
    assert.equal(config.port, 8080);
    assert.equal(config.mongodbUri, "mongodb://mongodb:27017/cs2_admin_panel");
    assert.equal(config.controlMode, "docker");
    assert.equal(config.composeProjectName, "playbook");
    process.env.PLAYBOOK_COMPOSE_PROJECT_NAME = "cs2-matchzy";
    assert.equal(getConfig().composeProjectName, "cs2-matchzy");
    assert.equal(config.promoteBootstrapAdmin, false);
    process.env.NODE_ENV = "development";
    assert.equal(getConfig().promoteBootstrapAdmin, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
