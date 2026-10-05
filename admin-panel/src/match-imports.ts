import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEMO_UPLOAD_LIMIT } from "../shared/demos.js";
import { sourceJson, trustedDemoUrl } from "./match-sources.js";
import { problem } from "./strats.js";

export class MatchImports {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private downloading = new Set<string>();
  constructor(
    readonly store: any,
    readonly config: any,
  ) {}
  start() {
    this.store.matches.steam.start(this.config.steamGcRefreshToken);
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
    void this.tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.store.matches.steam.close();
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const matches = this.store.matches;
      const connection = await matches.connections.findOne(
        { enabled: true, nextSyncAt: { $lte: new Date() } },
        { sort: { nextSyncAt: 1 } },
      );
      if (connection) {
        try {
          const actor = await this.store.getUser(connection.ownerId);
          await matches.scope(actor, connection.teamId, true);
          await matches.sync(connection);
        } catch (error) {
          await matches.connections.updateOne(
            { _id: connection._id },
            {
              $set: {
                lastError: error.status
                  ? error.message
                  : "Der Quellenabgleich wurde unterbrochen. Ein neuer Versuch folgt automatisch.",
                nextSyncAt: new Date(Date.now() + 15 * 60_000),
              },
            },
          );
        }
      }
      const enabled = await matches.connections
        .find({ enabled: true, autoDownload: true }, { projection: { _id: 1 } })
        .toArray();
      const candidates = await matches.entries
        .find({
          autoDownload: true,
          connectionIds: { $in: enabled.map((c) => c._id) },
          demoId: null,
          nextDownloadAt: { $not: { $gt: new Date() } },
        })
        .sort({ playedAt: -1 })
        .limit(2)
        .toArray();
      for (const match of candidates) {
        try {
          await this.download(
            match._id,
            await this.store.getUser(match.ownerId),
          );
        } catch (error) {
          await matches.entries.updateOne(
            { _id: match._id },
            {
              $set: {
                error: error.status
                  ? error.message
                  : "Die Demodatei konnte nicht importiert werden.",
                nextDownloadAt: new Date(Date.now() + 30 * 60_000),
              },
            },
          );
        }
      }
      await this.cleanup();
    } catch {
      /* A failing provider or maintenance pass must not stop future imports. */
    } finally {
      this.running = false;
      this.store.changes.publish();
    }
  }
  async download(id: string, actor: any) {
    const { matches, analysis, storage } = this.store;
    const match = await matches.entries.findOne({ _id: id });
    if (!match) problem(404, "Match nicht gefunden.");
    const scope = await matches.scope(actor, match.teamId, true);
    if (scope !== match.scope) problem(404, "Match nicht zugänglich.");
    if (match.demoId) return { demoId: match.demoId };
    if (this.downloading.has(id))
      problem(409, "Dieses Match wird bereits importiert.");
    if (this.downloading.size)
      problem(
        429,
        "Ein Matchimport läuft bereits. Versuche es anschließend erneut.",
      );
    this.downloading.add(id);
    let demo: any;
    const reservation = `download:${id}`;
    try {
      let value: string;
      if (match.source === "faceit") {
        if (!this.config.faceitDownloadsToken)
          problem(
            503,
            "Für automatische FACEIT-Demos fehlt noch die Downloads-Freigabe.",
          );
        const raw = await matches.faceit(
          `/matches/${encodeURIComponent(match.externalId)}`,
        );
        const resource = raw.demo_url?.[match.mapIndex || 0];
        if (typeof resource !== "string")
          problem(404, "FACEIT stellt diese Demodatei noch nicht bereit.");
        trustedDemoUrl(resource, "faceit");
        const signed = await sourceJson(
          "https://api.faceit.com/download/v2/demos/download",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.faceitDownloadsToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ resource_url: resource }),
          },
        );
        value = signed.payload?.download_url;
      } else {
        const raw = await matches.steam.resolve(match.shareCode),
          last = raw.roundstatsall?.at(-1) || raw.roundstats_legacy;
        value = last?.map;
        const accountIds = last?.reservation?.account_ids || [];
        await matches.entries.updateOne(
          { _id: id },
          {
            $set: {
              map: raw.watchablematchinfo?.game_map || "",
              playedAt: raw.matchtime
                ? new Date(raw.matchtime * 1000).toISOString()
                : match.playedAt,
              players: accountIds.map((account) => {
                const steamId = String(76561197960265728n + BigInt(account));
                return { id: steamId, steamId, name: steamId };
              }),
            },
          },
        );
      }
      let url = trustedDemoUrl(value, match.source);
      await analysis.mutate(() =>
        storage.reserve(scope, reservation, 3 * DEMO_UPLOAD_LIMIT),
      );
      let response: Response;
      for (let redirects = 0; redirects <= 3; redirects++) {
        response = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(15 * 60_000),
        });
        if (response.status < 300 || response.status >= 400) break;
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 3)
          problem(502, "Die Demoquelle enthält zu viele Weiterleitungen.");
        url = trustedDemoUrl(new URL(location, url).href, match.source);
      }
      if (!response.ok || !response.body)
        problem(
          502,
          "Die Demodatei ist nicht mehr verfügbar oder ihr Download wurde abgewiesen.",
        );
      if (Number(response.headers.get("content-length")) > DEMO_UPLOAD_LIMIT) {
        await response.body.cancel();
        problem(413, "Die automatische Demo überschreitet 1 GiB.");
      }
      const filename = url.pathname.split("/").at(-1);
      if (!/\.dem(?:\.gz|\.bz2)?$/i.test(filename || "")) {
        await response.body.cancel();
        problem(502, "Die Quelle liefert kein unterstütztes Demoformat.");
      }
      demo = await analysis.mutate(() =>
        analysis.create(actor, {
          teamId: match.teamId,
          title: match.title,
          source: match.source,
          filename,
        }),
      );
      await analysis.demos.updateOne(
        { _id: demo.id },
        {
          $set: {
            status: "receiving",
            autoImport: true,
            matchId: id,
            pinned: false,
          },
        },
      );
      const path = analysis.path(demo.id, "source"),
        hash = createHash("sha256");
      let bytes = 0;
      await mkdir(dirname(path), { recursive: true });
      await pipeline(
        Readable.fromWeb(response.body as any),
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > DEMO_UPLOAD_LIMIT)
              return callback(
                new Error("Die automatische Demo überschreitet 1 GiB."),
              );
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(path, { flags: "wx" }),
      );
      if (bytes < 16)
        problem(400, "Die Quelle lieferte keine vollständige Demo.");
      await matches.scope(
        await this.store.getUser(actor.identitySteam64),
        match.teamId,
        true,
      );
      await analysis.mutate(async () => {
        const digest = hash.digest("hex"),
          previous = await analysis.demos.findOne({ scope, hash: digest });
        if (previous) {
          await analysis.demos.deleteOne({ _id: demo.id });
          await rm(dirname(path), { recursive: true, force: true });
          demo = previous;
        } else {
          await storage.reservations.updateOne(
            { _id: `parse:${demo.id}` },
            {
              $setOnInsert: {
                scope,
                bytes: 2 * DEMO_UPLOAD_LIMIT,
                expiresAt: new Date(Date.now() + 24 * 3600_000),
              },
            },
            { upsert: true },
          );
          await storage.release(reservation);
          await analysis.demos.updateOne(
            { _id: demo.id, status: "receiving" },
            {
              $set: {
                status: "queued",
                bytes,
                hash: digest,
                updatedAt: new Date().toISOString(),
              },
            },
          );
        }
        await matches.entries.updateOne(
          { _id: id },
          {
            $set: { demoId: demo.id, demoStatus: "queued" },
            $unset: { error: "", nextDownloadAt: "" },
          },
        );
      });
      return { demoId: demo.id };
    } catch (error) {
      if (demo) {
        await analysis.demos.updateOne(
          { _id: demo.id, status: "receiving" },
          {
            $set: {
              status: "failed",
              error: "Der automatische Download wurde unterbrochen.",
              updatedAt: new Date().toISOString(),
            },
          },
        );
        await rm(analysis.path(demo.id, "source"), { force: true }).catch(
          () => {},
        );
      }
      throw error;
    } finally {
      await storage.release(reservation);
      this.downloading.delete(id);
      analysis.changed();
    }
  }
  async cleanup() {
    const { analysis, recordings, matches, storage } = this.store;
    const now = new Date().toISOString();
    await analysis.demos.updateMany(
      {
        autoImport: true,
        status: "ready",
        originalExpiresAt: { $exists: false },
      },
      {
        $set: {
          originalRetained: true,
          originalExpiresAt: new Date(
            Date.now() + 14 * 86400_000,
          ).toISOString(),
          analysisExpiresAt: new Date(
            Date.now() + 90 * 86400_000,
          ).toISOString(),
        },
      },
    );
    for (const demo of await analysis.demos
      .find({
        autoImport: true,
        status: "ready",
        pinned: { $ne: true },
        originalRetained: true,
        originalExpiresAt: { $lt: now },
      })
      .limit(10)
      .toArray()) {
      await analysis.mutate(async () => {
        if (
          !(await analysis.demos.findOne({
            _id: demo.id,
            pinned: { $ne: true },
            originalRetained: true,
          }))
        )
          return;
        await rm(analysis.path(demo.id, "source"), { force: true });
        await analysis.demos.updateOne(
          { _id: demo.id },
          { $set: { originalRetained: false } },
        );
      });
    }
    for (const session of await recordings.sessions
      .find({ status: "finished", pinned: false, expiresAt: { $lt: now } })
      .limit(5)
      .toArray()) {
      if (await recordings.explanations.findOne({ sessionId: session.id }))
        continue;
      await analysis.mutate(async () => {
        if (
          (await recordings.explanations.findOne({ sessionId: session.id })) ||
          !(await recordings.sessions.findOne({
            _id: session.id,
            pinned: false,
            status: "finished",
          }))
        )
          return;
        const tracks = await recordings.tracks
          .find({ sessionId: session.id })
          .toArray();
        if (tracks.some((t) => recordings.isFinalizing(t.id))) return;
        if (
          await recordings.segments.findOne({
            trackId: { $in: tracks.map((t) => t.id) },
            status: "receiving",
            leaseUntil: { $gt: new Date() },
          })
        )
          return;
        const remoteKeys = tracks.flatMap((t) =>
          (t.parts || []).map((p) => p.remoteKey).filter(Boolean),
        );
        if (remoteKeys.length) {
          const { UTApi } = await import("uploadthing/server");
          await new UTApi({ token: this.config.uploadthingToken }).deleteFiles(
            remoteKeys,
          );
        }
        await recordings.sessions.deleteOne({ _id: session.id, pinned: false });
        for (const track of tracks) {
          await recordings.tracks.deleteOne({ _id: track.id });
          await recordings.segments.deleteMany({ trackId: track.id });
          await rm(join(recordings.directory, track.id), {
            force: true,
            recursive: true,
          });
        }
      });
    }
    for (const demo of await analysis.demos
      .find({
        autoImport: true,
        status: "ready",
        pinned: { $ne: true },
        analysisExpiresAt: { $lt: now },
      })
      .limit(5)
      .toArray()) {
      await analysis.mutate(async () => {
        if (await analysis.referenced(demo.id)) return;
        if (
          !(
            await analysis.demos.deleteOne({
              _id: demo.id,
              status: "ready",
              pinned: { $ne: true },
            })
          ).deletedCount
        )
          return;
        await rm(join(analysis.directory, demo.id), {
          force: true,
          recursive: true,
        });
        await matches.entries.updateMany(
          { demoId: demo.id },
          {
            $set: {
              demoId: null,
              demoStatus: "unavailable",
              autoDownload: false,
            },
          },
        );
      });
    }
    const completed = await analysis.demos
      .find({ status: { $in: ["ready", "failed"] } }, { projection: { id: 1 } })
      .toArray();
    await storage.reservations.deleteMany({
      _id: { $in: completed.map((d) => `parse:${d.id}`) },
    });
  }
}
