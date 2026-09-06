import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeCoachSession } from "./validators.js";

export async function syncCoachOutbox({ directory, store, limit = 500 }) {
  let names;
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, limit);
  } catch (error) {
    if (error.code === "ENOENT") return { found: 0, imported: 0, invalid: 0 };
    throw error;
  }

  const sessions = [];
  let invalid = 0;
  for (const name of names) {
    try {
      const parsed = JSON.parse(await readFile(join(directory, name), "utf8"));
      sessions.push(sanitizeCoachSession(parsed));
    } catch {
      invalid++;
    }
  }
  const imported = await store.importCoachSessions(sessions);
  return { found: names.length, imported, invalid };
}
