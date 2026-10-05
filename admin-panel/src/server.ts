import { createServer } from "node:http";
import { installLiveServer } from "./live-server.js";
import { watchLiveRuntime } from "./live-runtime.js";
import { getConfig } from "./config.js";
import { Compose } from "./compose.js";
import { createApp } from "./app.js";
import { NadesSyncService } from "./nades-sync.js";
import { Store } from "./store.js";
import { setTimeout as wait } from "node:timers/promises";
import { RestartScheduler } from "./restart-scheduler.js";
import { writeServerRuntimeFiles } from "./runtime-files.js";

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

const nadesSync = new NadesSyncService({ config, store });
if (config.nadesSyncEnabled) {
  await nadesSync.start();
}
await writeServerRuntimeFiles(
  config,
  nadesSync,
  await store.getSettings(),
  () => store.getAdmins(),
  await store.getNades()
);

const compose = new Compose(config);
const restartScheduler = new RestartScheduler({ store, compose, config });
restartScheduler.start();
store.imports.start();

const app = createApp({
  config,
  store,
  compose,
  nadesSync,
  restartScheduler
});

const server = createServer(app);
const live = installLiveServer(server, { config, store, resources: app.locals.live });
const stopWatching = watchLiveRuntime({ config, compose, changes: store.changes });
server.listen(config.port, "0.0.0.0", () => {
  console.log(`API bereit unter ${config.publicUrl}/api, interner Port ${config.port}.`);
});

async function shutdown() {
  live.close();
  stopWatching();
  server.close();
  restartScheduler.stop();
  store.imports.stop();
  await nadesSync.stop();
  await store.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
