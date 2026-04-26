import { getConfig } from "./config.js";
import { Compose } from "./compose.js";
import { createApp } from "./app.js";
import { Store } from "./store.js";
import { setTimeout as wait } from "node:timers/promises";

const config = getConfig();
const store = new Store(config);

for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    await store.connect();
    break;
  } catch (error) {
    if (attempt === 30) throw error;
    console.log(`waiting for MongoDB (${attempt}/30): ${error.message}`);
    await wait(2000);
  }
}

const app = createApp({
  config,
  store,
  compose: new Compose(config)
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`admin-panel listening on ${config.port}`);
});

async function shutdown() {
  server.close();
  await store.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
