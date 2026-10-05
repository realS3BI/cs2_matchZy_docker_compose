import { MongoClient } from "mongodb";
import { setTimeout as wait } from "node:timers/promises";
import { processDemoJob } from "./demo-worker.js";

const abort = new AbortController();
process.on("SIGTERM", () => abort.abort());
process.on("SIGINT", () => abort.abort());
const client = new MongoClient(
  process.env.DEMO_MONGODB_URI || "mongodb://mongodb:27017/cs2_admin_panel",
);
try {
  await client.connect();
  const db = client.db(process.env.DEMO_DATABASE || "cs2_admin_panel");
  console.log("Demo-Worker bereit.");
  while (!abort.signal.aborted) {
    try {
      const processed = await processDemoJob(
        db,
        process.env.DEMO_DIRECTORY || "/demos",
        abort.signal,
      );
      if (!processed) await wait(1000, undefined, { signal: abort.signal });
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error(
          "Demo-Aufträge vorübergehend nicht erreichbar:",
          error.message,
        );
        await wait(3000, undefined, { signal: abort.signal }).catch(() => {});
      }
    }
  }
} finally {
  await client.close();
}
