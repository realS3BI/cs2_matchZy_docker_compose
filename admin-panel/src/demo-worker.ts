import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "mongodb";
import type { DemoSummary, RoundReplay } from "../shared/demos.js";

async function verifiedSummary(folder: string): Promise<DemoSummary> {
  const summary: DemoSummary = JSON.parse(await readFile(join(folder, "summary.json"), "utf8"));
  if (!summary.rounds?.length) throw new Error("Die Analyse enthält keine Runden.");
  for (const round of summary.rounds) {
    if (!/^r\d+$/.test(round.id)) throw new Error("Ungültige Runde in der Analyse.");
    const replay: RoundReplay = JSON.parse(await readFile(join(folder, `${round.id}.json`), "utf8"));
    if (replay.round?.id !== round.id || !replay.frames?.length ||
        !Array.isArray(replay.events) || !Array.isArray(replay.grenades))
      throw new Error(`Die gespeicherten Replay-Daten für Runde ${round.number} sind unvollständig.`);
  }
  return summary;
}

// Persist ready results before deleting the source. A restart repeats unfinished cleanup.
export async function removeAnalyzedOriginals(db: Db, directory: string) {
  const assets = db.collection<any>("demoAssets");
  const demos = await assets.find({
    status: "ready",
    originalCleanupPending: true,
    $or: [{ originalCleanupRetryAt: { $exists: false } }, { originalCleanupRetryAt: { $lte: new Date() } }],
  }).limit(10).toArray();
  for (const demo of demos) {
    try {
      const folder = join(directory, demo.id);
      await verifiedSummary(folder);
      await rm(join(folder, "source"), { force: true });
      await assets.updateOne({ _id: demo._id, status: "ready", originalCleanupPending: true }, {
        $set: { originalRetained: false },
        $unset: { originalCleanupPending: "", originalCleanupRetryAt: "", originalExpiresAt: "", analysisExpiresAt: "" },
      });
    } catch (error) {
      console.error(`Originaldemo ${demo.id} konnte noch nicht entfernt werden:`, error.message);
      await assets.updateOne({ _id: demo._id, originalCleanupPending: true }, {
        $set: { originalCleanupRetryAt: new Date(Date.now() + 3600_000) },
      });
    }
  }
}

export async function processDemoJob(
  db: Db,
  directory: string,
  signal?: AbortSignal,
) {
  await removeAnalyzedOriginals(db, directory);
  const assets = db.collection<any>("demoAssets");
  const now = Date.now();
  await assets.updateMany(
    {
      status: { $in: ["uploading", "receiving"] },
      updatedAt: { $lt: new Date(now - 3600_000).toISOString() },
    },
    {
      $set: {
        status: "failed",
        error:
          "Der Upload wurde nicht abgeschlossen. Bitte lade die Datei erneut hoch.",
        updatedAt: new Date().toISOString(),
      },
    },
  );
  await assets.updateMany(
    {
      status: "processing",
      leaseUntil: { $lt: new Date(now) },
      attempt: { $gte: 2 },
    },
    {
      $set: {
        status: "failed",
        error:
          "Die Analyse wurde wiederholt unterbrochen. Die Datei ist möglicherweise zu groß oder wird noch nicht unterstützt.",
        updatedAt: new Date().toISOString(),
      },
    },
  );
  const claim = randomUUID();
  const demo = await assets.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        {
          status: "processing",
          leaseUntil: { $lt: new Date(now) },
          attempt: { $lt: 2 },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        claim,
        leaseUntil: new Date(now + 10 * 60_000),
        updatedAt: new Date().toISOString(),
      },
      $inc: { attempt: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
  if (!demo) return false;
  const folder = join(directory, demo.id);
  try {
    // A previous attempt may have left partial derived files; preserve only the upload.
    for (const file of await readdir(folder))
      if (file !== "source") await rm(join(folder, file), { force: true });
    await new Promise<void>((resolve, reject) => {
      const child = fork(
        fileURLToPath(new URL("./demo-parser-process.js", import.meta.url)),
        [folder],
        {
          execArgv: ["--max-old-space-size=2048"],
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: { PATH: process.env.PATH, RAYON_NUM_THREADS: "2" },
        },
      );
      let result: any;
      const kill = () => child.kill("SIGKILL");
      const timer = setTimeout(kill, 5 * 60_000);
      signal?.addEventListener("abort", kill, { once: true });
      if (signal?.aborted) kill();
      child.on("message", (message) => {
        result = message;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", kill);
        if (result?.ok && code === 0) resolve();
        else
          reject(
            new Error(
              result?.error ||
                "Die Analyse wurde abgebrochen oder hat das Ressourcenlimit erreicht.",
            ),
          );
      });
    });
    const summary = await verifiedSummary(folder);
    const sizes = await Promise.all((await readdir(folder)).filter(file => file !== "source").map(async file => (await stat(join(folder, file))).size));
    const derivedBytes = sizes.reduce((total, size) => total + size, 0);
    await assets.updateOne(
      { _id: demo._id, claim },
      {
        $set: { status: "ready", summary, derivedBytes, originalRetained: true, originalCleanupPending: true, updatedAt: new Date().toISOString() },
        $unset: { error: "", leaseUntil: "", claim: "" },
      },
    );
  } catch (error) {
    if (signal?.aborted) {
      await assets.updateOne(
        { _id: demo._id, claim },
        {
          $set: { status: "queued", updatedAt: new Date().toISOString() },
          $unset: { leaseUntil: "", claim: "" },
        },
      );
    } else {
      await assets.updateOne(
        { _id: demo._id, claim },
        {
          $set: {
            status: "failed",
            error: String(error.message).slice(0, 500),
            updatedAt: new Date().toISOString(),
          },
          $unset: { leaseUntil: "", claim: "" },
        },
      );
    }
  }
  await removeAnalyzedOriginals(db, directory);
  return true;
}
