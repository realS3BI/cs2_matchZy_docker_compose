import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AUDIO_SEGMENT_LIMIT,
  AUDIO_UPLOAD_LIMIT,
} from "../shared/recordings.js";
import { problem } from "./strats.js";
import { authorize } from "../shared/authorization.js";

export function installRecordings(app, { store, live, config }) {
  const recordings = store.recordings;
  if (!recordings) return;
  const router = Router();
  const route = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  const mutate = (handler) =>
    route((req, res) => store.analysis.mutate(() => handler(req, res)));
  live.get(router, "/analysis/live", ({ user }) => recordings.list(user));
  live.get(router, "/analysis/live/:id/room", ({ user, params }) =>
    recordings.room(params.id, user),
  );
  live.onCommand("/api/analysis/live/:id/room", ({ user, params, body }) =>
    store.analysis.mutate(() => recordings.command(params.id, user, body)),
  );
  router.post(
    "/analysis/live",
    mutate(async (req, res) =>
      res
        .status(201)
        .json({ session: await recordings.create(res.locals.user, req.body) }),
    ),
  );
  router.get(
    "/analysis/live/:id/timeline",
    route(async (req, res) =>
      res.json({
        session: await recordings.session(req.params.id, res.locals.user, true),
      }),
    ),
  );
  router.post(
    "/analysis/live/:id/demo",
    mutate(async (req, res) => {
      await recordings.linkDemo(
        req.params.id,
        res.locals.user,
        req.body?.demoId,
      );
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/live/:id/pin",
    mutate(async (req, res) => {
      if (typeof req.body?.pinned !== "boolean")
        problem(400, "Wähle, ob die Aufnahme behalten werden soll.");
      await recordings.pin(req.params.id, res.locals.user, req.body.pinned);
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/live/:id/explanations",
    mutate(async (req, res) =>
      res.status(201).json({
        explanation: await recordings.explain(
          req.params.id,
          res.locals.user,
          req.body,
        ),
      }),
    ),
  );
  live.get(router, "/analysis/explanations/:id", async ({ user, params }) => {
    const strat = await store.workspace.getStrat(params.id);
    if (!strat) problem(404, "Strat nicht gefunden.");
    const team = await store.analysis.team(strat.teamId, user, "strats.read");
    return {
      canEdit: authorize(user, "strats.edit", team),
      entries: await recordings.explanations
        .find({ stratId: strat.id }, { projection: { _id: 0 } })
        .toArray(),
    };
  });
  router.delete(
    "/analysis/explanations/:id",
    mutate(async (req, res) => {
      const explanation = await recordings.explanations.findOne({
        _id: req.params.id,
      });
      if (!explanation) problem(404, "Erklärung nicht gefunden.");
      await store.analysis.team(
        explanation.teamId,
        res.locals.user,
        "strats.edit",
      );
      await recordings.explanations.deleteOne({ _id: explanation.id });
      store.analysis.changed();
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/live/:id/tracks",
    mutate(async (req, res) =>
      res.status(201).json({
        track: await recordings.createTrack(
          req.params.id,
          res.locals.user,
          req.body,
        ),
      }),
    ),
  );
  router.put(
    "/analysis/audio/:id/segments/:sequence",
    route(async (req, res) => {
      if (!req.is("application/octet-stream"))
        problem(415, "Sende Audiosegmente als Binärdatei.");
      const sequence = Number(req.params.sequence),
        id = req.params.id,
        key = `audio:${id}:${sequence}`;
      const claim = randomUUID();
      let duplicate = false;
      if (!/^\d{1,4}$/.test(req.params.sequence) || sequence >= 2000)
        problem(400, "Ungültige Segmentnummer.");
      const length = Number(req.headers["content-length"]);
      if (Number.isFinite(length) && length > AUDIO_SEGMENT_LIMIT)
        problem(413, "Ein Audiosegment darf höchstens 16 MiB groß sein.");
      await store.analysis.mutate(async () => {
        const track = await recordings.track(id, res.locals.user, true);
        const previous = await recordings.segments.findOne({
          trackId: id,
          sequence,
        });
        if (recordings.isFinalizing(id))
          problem(409, "Die Tonspur wird gerade verarbeitet.");
        if (
          previous?.status === "receiving" &&
          previous.leaseUntil > new Date()
        )
          problem(409, "Dieses Audiosegment wird bereits hochgeladen.");
        duplicate = previous?.status === "ready";
        if (track.status === "ready")
          problem(409, "Die Tonspur ist bereits fertiggestellt.");
        if (
          !duplicate &&
          track.bytes + (length || AUDIO_SEGMENT_LIMIT) > AUDIO_UPLOAD_LIMIT
        )
          problem(
            413,
            "Eine Tonspur darf höchstens 512 MiB Quelldaten enthalten.",
          );
        if (!duplicate) {
          await store.storage.reserve(
            `team:${track.teamId}`,
            key,
            length || AUDIO_SEGMENT_LIMIT,
          );
          await recordings.segments.updateOne(
            { trackId: id, sequence },
            {
              $set: {
                status: "receiving",
                bytes: 0,
                claim,
                leaseUntil: new Date(Date.now() + 150_000),
              },
            },
            { upsert: true },
          );
        }
      });
      const path = recordings.path(id, `incoming-${sequence}-${claim}`),
        final = recordings.path(id, `segment-${sequence}`);
      const hash = createHash("sha256");
      let bytes = 0;
      try {
        await mkdir(dirname(path), { recursive: true });
        req.setTimeout(120_000);
        await pipeline(
          req,
          new Transform({
            transform(chunk, _encoding, callback) {
              bytes += chunk.length;
              if (bytes > AUDIO_SEGMENT_LIMIT)
                return callback(
                  Object.assign(new Error("Das Audiosegment ist zu groß."), {
                    status: 413,
                  }),
                );
              hash.update(chunk);
              callback(null, chunk);
            },
          }),
          createWriteStream(path, { flags: "wx" }),
        );
        if (!bytes) problem(400, "Das Audiosegment ist leer.");
        await store.analysis.mutate(async () => {
          const track = await recordings.track(id, res.locals.user, true),
            digest = hash.digest("hex");
          const previous = await recordings.segments.findOne({
            trackId: id,
            sequence,
          });
          if (previous?.status === "ready") {
            if (previous.hash !== digest)
              problem(
                409,
                "Dieses Segment wurde bereits mit anderem Inhalt gespeichert.",
              );
          } else {
            if (previous?.claim !== claim || recordings.isFinalizing(id))
              problem(409, "Der Upload wurde inzwischen ersetzt.");
            if (track.bytes + bytes > AUDIO_UPLOAD_LIMIT)
              problem(413, "Die Tonspur überschreitet 512 MiB.");
            const { rename } = await import("node:fs/promises");
            await rename(path, final);
            await recordings.segments.updateOne(
              { trackId: id, sequence },
              {
                $set: { status: "ready", bytes, hash: digest },
                $unset: { claim: "", leaseUntil: "" },
              },
            );
            await recordings.tracks.updateOne(
              { _id: id },
              { $inc: { bytes, segments: 1 } },
            );
          }
        });
        res.json({ ok: true, sequence, bytes });
      } catch (error) {
        await recordings.segments.deleteOne({
          trackId: id,
          sequence,
          status: "receiving",
          claim,
        });
        throw error;
      } finally {
        await rm(path, { force: true });
        if (!duplicate) await store.storage.release(key);
        store.analysis.changed();
      }
    }),
  );
  router.post(
    "/analysis/audio/:id/finish",
    route(async (req, res) => {
      const key = `finalize:${req.params.id}`;
      let reserved = false;
      try {
        await recordings.finalize(
          req.params.id,
          res.locals.user,
          async (track) => {
            await store.storage.reserve(
              `team:${track.teamId}`,
              key,
              track.bytes + 8 * 3600 * (track.source === "game" ? 16000 : 8000),
            );
            reserved = true;
          },
        );
        res.json({ ok: true });
      } finally {
        if (reserved) await store.storage.release(key);
      }
    }),
  );
  router.patch(
    "/analysis/audio/:id",
    mutate(async (req, res) => {
      await recordings.align(req.params.id, res.locals.user, req.body);
      res.json({ ok: true });
    }),
  );
  router.get(
    "/analysis/audio/:id/manifest",
    route(async (req, res) => {
      const track = await recordings.track(req.params.id, res.locals.user);
      if (track.status !== "ready")
        problem(409, "Die Tonspur ist noch nicht fertiggestellt.");
      res.json({
        parts: track.parts.map((p) => ({
          index: p.index,
          start: p.start,
          duration: p.duration,
          url: `/api/analysis/audio/${track.id}/parts/${p.index}`,
        })),
      });
    }),
  );
  router.get(
    "/analysis/audio/:id/parts/:part",
    route(async (req, res) => {
      const track = await recordings.track(req.params.id, res.locals.user);
      if (!/^\d{1,4}$/.test(req.params.part) || track.status !== "ready")
        problem(404, "Audiodatei nicht gefunden.");
      const part = track.parts.find((p) => p.index === Number(req.params.part));
      if (!part) problem(404, "Audiodatei nicht gefunden.");
      if (part.remoteKey) {
        const { UTApi } = await import("uploadthing/server");
        const api = new UTApi({ token: config.uploadthingToken });
        const url = await api.generateSignedURL(part.remoteKey, {
          expiresIn: 120,
        });
        return res.redirect(url.ufsUrl);
      }
      res.type("audio/ogg").sendFile(recordings.path(track.id, part.file));
    }),
  );
  app.use("/api", router);
}
