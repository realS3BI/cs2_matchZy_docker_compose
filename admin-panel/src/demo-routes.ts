import { Router } from "express";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import rateLimit from "express-rate-limit";
import { DEMO_UPLOAD_LIMIT } from "../shared/demos.js";
import { problem } from "./strats.js";
import type { DemoStore } from "./demo-store.js";
import { authorize } from "../shared/authorization.js";

export function installDemoAnalysis(app, { store, live }) {
  const analysis: DemoStore = store.analysis;
  if (!analysis) return;
  const router = Router();
  const route = (handler) => async (req, res, next) => {
    try {
      if (!["GET", "HEAD"].includes(req.method) && !req.path.endsWith("/file"))
        await analysis.mutate(() => handler(req, res));
      else await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  const uploads = rateLimit({
    windowMs: 60_000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Bitte warte kurz vor dem nächsten Demo-Upload." },
  });
  live.get(router, "/analysis/demos", ({ user }) => analysis.list(user), 2000);
  router.post(
    "/analysis/demos/lookup",
    route(async (req, res) => {
      const actor = res.locals.user;
      if (!authorize(actor, "demos.personal")) problem(403, "Melde dich mit Steam an.");
      const { hash, teamId = null } = req.body || {};
      if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) problem(400, "Ungültiger Datei-Fingerabdruck.");
      if (teamId) await analysis.team(teamId, actor, "analysis.upload");
      const existing = await analysis.demos.findOne({
        scope: teamId ? `team:${teamId}` : `user:${actor.identitySteam64}`,
        hash,
      });
      res.json({ demo: existing ? { id: existing.id, status: existing.status } : null });
    }),
  );
  live.get(
    router,
    "/analysis/demos/:id",
    async ({ user, params }) => ({
      demo: await analysis.demo(params.id, user),
    }),
    2000,
  );
  router.post(
    "/analysis/demos",
    uploads,
    route(async (req, res) => {
      res
        .status(201)
        .json({ demo: await analysis.create(res.locals.user, req.body) });
    }),
  );
  router.put(
    "/analysis/demos/:id/file",
    uploads,
    route(async (req, res) => {
      if (!req.is("application/octet-stream"))
        problem(415, "Sende die Demo als Binärdatei.");
      const demo = await analysis.demo(req.params.id, res.locals.user, true);
      if (demo.ownerId !== res.locals.user.identitySteam64)
        problem(403, "Nur der Ersteller darf diesen Upload abschließen.");
      if (Number(req.headers["content-length"]) > DEMO_UPLOAD_LIMIT)
        problem(413, "Die Demo darf höchstens 1 GiB groß sein.");
      const reservation = `parse:${demo.id}`;
      await analysis.mutate(async () => {
        if (!await analysis.demos.findOne({ _id: demo.id, status: "uploading" })) problem(409, "Dieser Upload wurde bereits gestartet.");
        await store.storage.reserve(demo.teamId ? `team:${demo.teamId}` : `user:${demo.ownerId}`, reservation, 3 * DEMO_UPLOAD_LIMIT);
        const claimed = await analysis.demos.updateOne({ _id: demo.id, status: "uploading" }, { $set: { status: "receiving", updatedAt: new Date().toISOString() } });
        if (!claimed.modifiedCount) { await store.storage.release(reservation); problem(409, "Dieser Upload wurde bereits gestartet."); }
      });
      analysis.changed();
      const path = analysis.path(demo.id, "source");
      const digest = createHash("sha256");
      let bytes = 0;
      let completed = false;
      try {
        await mkdir(dirname(path), { recursive: true });
        req.setTimeout(15 * 60_000);
        const limit = new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > DEMO_UPLOAD_LIMIT)
              return callback(
                Object.assign(
                  new Error("Die Demo darf höchstens 1 GiB groß sein."),
                  { status: 413 },
                ),
              );
            digest.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(req, limit, createWriteStream(path, { flags: "wx" }));
        if (bytes < 16)
          problem(400, "Die Datei enthält keine vollständige Demo.");
        await analysis.demo(demo.id, res.locals.user, true);
        const hash = digest.digest("hex");
        try {
          const result = await analysis.demos.updateOne(
            { _id: demo.id, status: "receiving" },
            {
              $set: {
                status: "queued",
                bytes,
                hash,
                updatedAt: new Date().toISOString(),
              },
            },
          );
          if (!result.modifiedCount)
            problem(409, "Der Upload wurde zwischenzeitlich beendet.");
          completed = true;
          res.json({ demo: await analysis.demo(demo.id, res.locals.user) });
        } catch (error) {
          if (error.code !== 11000) throw error;
          const existing = await analysis.demos.findOne({
            scope: demo.teamId ? `team:${demo.teamId}` : `user:${demo.ownerId}`,
            hash,
          });
          if (!existing) throw error;
          const accessible = await analysis.demo(existing.id, res.locals.user);
          await analysis.demos.deleteOne({ _id: demo.id });
          await rm(dirname(path), { recursive: true, force: true });
          completed = true;
          await store.storage.release(reservation);
          res.json({ demo: accessible, duplicate: true });
        }
      } finally {
        if (!completed) {
          await store.storage.release(reservation);
          await rm(path, { force: true }).catch(() => {});
          await analysis.demos.updateOne(
            { _id: demo.id, status: "receiving" },
            {
              $set: {
                status: "failed",
                error:
                  "Der Upload wurde unterbrochen. Bitte lade die Datei erneut hoch.",
                updatedAt: new Date().toISOString(),
              },
            },
          );
        }
        analysis.changed();
      }
    }),
  );
  router.get(
    "/analysis/demos/:id/rounds/:round",
    route(async (req, res) =>
      res.json(
        await analysis.replay(req.params.id, req.params.round, res.locals.user),
      ),
    ),
  );
  router.post(
    "/analysis/demos/:id/share",
    route(async (req, res) => {
      await analysis.share(req.params.id, res.locals.user, req.body?.teamId);
      res.json({ demo: await analysis.demo(req.params.id, res.locals.user) });
    }),
  );
  router.delete(
    "/analysis/demos/:id",
    route(async (req, res) => {
      await analysis.remove(req.params.id, res.locals.user);
      res.json({ ok: true });
    }),
  );
  live.get(router, "/analysis/reviews", ({ user }) =>
    analysis.listReviews(user),
  );
  router.post(
    "/analysis/reviews",
    route(async (req, res) =>
      res.status(201).json({
        review: await analysis.createReview(res.locals.user, req.body),
      }),
    ),
  );
  live.get(router, "/analysis/reviews/:id/room", ({ user, params }) =>
    analysis.room(params.id, user),
  );
  live.onCommand(
    "/api/analysis/reviews/:id/room",
    ({ user, params, body, connectionId }) =>
      analysis.mutate(() =>
        analysis.command(params.id, user, body, connectionId),
      ),
  );
  live.onDisconnect((connectionId) => analysis.disconnect(connectionId));
  router.patch(
    "/analysis/reviews/:id",
    route(async (req, res) =>
      res.json({
        review: await analysis.prepare(
          req.params.id,
          res.locals.user,
          req.body,
        ),
      }),
    ),
  );
  router.post(
    "/analysis/reviews/:id/notes",
    route(async (req, res) =>
      res.json({
        review: await analysis.note(req.params.id, res.locals.user, req.body),
      }),
    ),
  );
  router.post(
    "/analysis/strats",
    route(async (req, res) =>
      res.status(201).json({
        strat: await analysis.stratFromScene(res.locals.user, req.body),
      }),
    ),
  );
  app.use("/api", router);
}
