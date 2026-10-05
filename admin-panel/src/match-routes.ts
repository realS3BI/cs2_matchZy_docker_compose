import { Router } from "express";
import { authorize } from "../shared/authorization.js";
import { problem } from "./strats.js";
export function installMatches(app, { store, live }) {
  if (!store.matches) return;
  const router = Router(),
    matches = store.matches;
  const route = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  const mutate = (handler) =>
    route((req, res) => store.analysis.mutate(() => handler(req, res)));
  live.get(router, "/analysis/matches", ({ user }) => matches.list(user), 5000);
  live.get(
    router,
    "/analysis/connections",
    ({ user }) => matches.listConnections(user),
    5000,
  );
  router.post(
    "/analysis/connections",
    route(async (req, res) =>
      res.status(201).json(await matches.connect(res.locals.user, req.body)),
    ),
  );
  router.patch(
    "/analysis/connections/:id",
    mutate(async (req, res) => {
      await matches.connection(req.params.id, res.locals.user);
      if (
        typeof req.body.enabled !== "boolean" ||
        typeof req.body.autoDownload !== "boolean"
      )
        problem(400, "Ungültige Import-Einstellungen.");
      await matches.connections.updateOne(
        { _id: req.params.id },
        {
          $set: {
            enabled: req.body.enabled,
            autoDownload: req.body.autoDownload,
          },
        },
      );
      store.analysis.changed();
      res.json({ ok: true });
    }),
  );
  router.delete(
    "/analysis/connections/:id",
    mutate(async (req, res) => {
      await matches.connections.deleteOne({
        _id: req.params.id,
        ownerId: res.locals.user.identitySteam64,
      });
      store.analysis.changed();
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/connections/:id/sync",
    route(async (req, res) => {
      await matches.sync(
        await matches.connection(req.params.id, res.locals.user),
      );
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/matches/faceit",
    route(async (req, res) =>
      res
        .status(201)
        .json({ ids: await matches.importFaceit(res.locals.user, req.body) }),
    ),
  );
  router.post(
    "/analysis/matches/:id/download",
    route(async (req, res) =>
      res.json(await store.imports.download(req.params.id, res.locals.user)),
    ),
  );
  router.post(
    "/analysis/matches/:id/demo",
    mutate(async (req, res) => {
      const match = await matches.entries.findOne({ _id: req.params.id });
      if (!match) problem(404, "Match nicht gefunden.");
      if (
        (await matches.scope(res.locals.user, match.teamId, true)) !==
        match.scope
      )
        problem(404, "Match nicht zugänglich.");
      const demo = await store.analysis.demo(req.body?.demoId, res.locals.user);
      if (
        demo.teamId !== match.teamId ||
        (!match.teamId && demo.ownerId !== match.ownerId)
      )
        problem(400, "Match und Demo müssen dieselbe Freigabe haben.");
      await matches.entries.updateOne(
        { _id: match._id },
        {
          $set: {
            demoId: demo.id,
            demoStatus: demo.status === "ready" ? "imported" : "queued",
          },
        },
      );
      store.analysis.changed();
      res.json({ ok: true });
    }),
  );
  router.post(
    "/analysis/demos/:id/pin",
    mutate(async (req, res) => {
      await store.analysis.demo(req.params.id, res.locals.user, true);
      if (typeof req.body.pinned !== "boolean")
        problem(400, "Ungültige Aufbewahrung.");
      await store.analysis.demos.updateOne(
        { _id: req.params.id },
        { $set: { pinned: req.body.pinned } },
      );
      store.analysis.changed();
      res.json({ ok: true });
    }),
  );
  live.get(
    router,
    "/analysis/storage/:id",
    async ({ user, params }) => {
      const scope = await matches.scope(
        user,
        params.id === "personal" ? null : params.id,
      );
      return {
        usage: await store.storage.usage(scope),
        scopeLimit: store.config.analysisScopeLimit || 20 * 1024 ** 3,
        storage: store.config.recordingStorage || "local",
        originalDays: 14,
        analysisDays: 90,
      };
    },
    5000,
  );
  live.get(router, "/analysis/prematches", async ({ user }) => {
    const teams = await store.workspace.listTeams(user.identitySteam64),
      editable = teams
        .filter((t) => authorize(user, "analysis.scout", t))
        .map((t) => t.id);
    return {
      entries: await matches.preparations
        .find(
          {
            teamId: { $in: teams.map((t) => t.id) },
            $or: [{ published: true }, { teamId: { $in: editable } }],
          },
          { projection: { _id: 0 } },
        )
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray(),
    };
  });
  live.get(router, "/analysis/prematches/:id", async ({ user, params }) => ({
    preparation: await matches.preparation(params.id, user),
  }));
  router.get(
    "/analysis/prematches/:id/report",
    route(async (req, res) =>
      res.json(await matches.report(req.params.id, res.locals.user)),
    ),
  );
  router.post(
    "/analysis/prematches",
    mutate(async (req, res) =>
      res.status(201).json({
        preparation: await matches.savePreparation(res.locals.user, req.body),
      }),
    ),
  );
  router.patch(
    "/analysis/prematches/:id",
    mutate(async (req, res) =>
      res.json({
        preparation: await matches.savePreparation(
          res.locals.user,
          req.body,
          req.params.id,
        ),
      }),
    ),
  );
  router.post(
    "/analysis/prematches/:id/sync",
    route(async (req, res) => {
      await matches.syncOpponent(req.params.id, res.locals.user);
      res.json({ ok: true });
    }),
  );
  app.use("/api", router);
}
