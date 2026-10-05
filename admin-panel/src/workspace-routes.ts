import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import {
  authorize,
  capabilities,
  type Actor,
  type Action,
} from "../shared/authorization.js";
import type { Team, Strat, TeamView } from "../shared/strats.js";
import { problem, stratView, textField, validateContent } from "./strats.js";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function installWorkspace(app, { store, config, live }) {
  const router = Router();
  const route = (handler) => async (req, res, next) => {
    try {
      if (store.analysis && !["GET", "HEAD"].includes(req.method)) await store.analysis.mutate(() => handler(req, res));
      else await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  const actor = (res): Actor => res.locals.user;
  function requireAction(res, action: Action, team?: Team) {
    if (!authorize(actor(res), action, team))
      problem(403, "Für diese Aktion fehlt dir die Berechtigung.");
  }
  async function teamFor(id: string, user: Actor): Promise<Team> {
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id))
      problem(404, "Team nicht gefunden.");
    const team = await store.workspace.getTeam(id);
    if (!team || !authorize(user, "teams.read", team))
      problem(404, "Team nicht gefunden oder nicht mehr zugänglich.");
    return team;
  }
  async function view(team: Team, user: Actor): Promise<TeamView> {
    const members = await Promise.all(
      team.members.map(async (member) => ({
        ...member,
        name: (await store.getUser(member.userId))?.name || member.userId,
      })),
    );
    return {
      ...team,
      members,
      permissions: capabilities(user, team),
      invitations: authorize(user, "teams.manage", team)
        ? team.invitations
            .filter((invite) => Date.parse(invite.expiresAt) > Date.now())
            .map(({ hash: _hash, ...invite }) => invite)
        : [],
    };
  }
  function revision(req, document) {
    if (
      !Number.isInteger(req.body?.revision) ||
      req.body.revision !== document.revision
    )
      problem(
        409,
        "Inzwischen wurde etwas geändert. Bitte lade den aktuellen Stand.",
      );
  }
  async function saveTeam(team: Team) {
    if (!(await store.workspace.replaceTeam(team, team.revision)))
      problem(409, "Das Team wurde inzwischen geändert. Bitte neu laden.");
    team.revision++;
  }
  async function audit(res, type: string, subject: string, details = {}) {
    await store.logAction(
      type,
      "success",
      "Team- oder Strat-Aktion ausgeführt",
      { actor: actor(res).identitySteam64, subject, ...details },
    );
  }

  live.get(router, "/teams", async ({ user }) => ({
    entries: await Promise.all((await store.workspace.listTeams(user.identitySteam64))
      .filter(team => authorize(user, "teams.read", team)).map(team => view(team, user))),
  }));
  router.post(
    "/teams",
    route(async (req, res) => {
      requireAction(res, "teams.create");
      const team: Team = {
        id: randomUUID(),
        name: textField(req.body?.name, "Teamname", 80, true),
        revision: 1,
        members: [
          {
            userId: actor(res).identitySteam64,
            role: "owner",
            joinedAt: new Date().toISOString(),
          },
        ],
        invitations: [],
        active: null,
        createdAt: new Date().toISOString(),
      };
      await store.workspace.createTeam(team);
      await audit(res, "team_create", team.id);
      res.status(201).json({ team: await view(team, actor(res)) });
    }),
  );
  live.get(router, "/teams/:id", async ({ user, params }) => ({
    team: await view(await teamFor(params.id, user), user),
  }));
  router.patch(
    "/teams/:id",
    route(async (req, res) => {
      const team = await teamFor(req.params.id, actor(res));
      const action = req.body.action;
      if (action !== "leave") requireAction(res, "teams.manage", team);
      revision(req, team);
      const current = team.members.find(
        (member) => member.userId === actor(res).identitySteam64,
      )!;
      if (action === "rename")
        team.name = textField(req.body.name, "Teamname", 80, true);
      else if (action === "role") {
        const target = team.members.find(
          (member) => member.userId === req.body.userId,
        );
        if (
          !target ||
          target.role === "owner" ||
          !["member", "captain"].includes(req.body.role)
        )
          problem(400, "Diese Teamrolle kann nicht vergeben werden.");
        target.role = req.body.role;
      } else if (action === "transfer") {
        const target = team.members.find(
          (member) =>
            member.userId === req.body.userId &&
            member.userId !== current.userId,
        );
        if (!target)
          problem(400, "Wähle ein anderes Teammitglied als neuen Owner.");
        current.role = "member";
        target.role = "owner";
        team.invitations = [];
      } else if (action === "remove" || action === "leave") {
        const userId = action === "leave" ? current.userId : req.body.userId;
        const target = team.members.find((member) => member.userId === userId);
        if (!target || target.role === "owner")
          problem(400, "Der Owner muss zuerst das Eigentum übertragen.");
        team.members = team.members.filter(
          (member) => member.userId !== userId,
        );
      } else if (action === "revokeInvite")
        team.invitations = team.invitations.filter(
          (invite) => invite.id !== req.body.invitationId,
        );
      else problem(400, "Unbekannte Teamaktion.");
      await saveTeam(team);
      await audit(res, "team_change", team.id, {
        action,
        userId: req.body.userId,
        role: req.body.role,
      });
      res.json({ team: action === "leave" ? null : await view(team, actor(res)) });
    }),
  );
  router.post(
    "/teams/:id/invitations",
    route(async (req, res) => {
      const team = await teamFor(req.params.id, actor(res));
      requireAction(res, "teams.manage", team);
      revision(req, team);
      team.invitations = team.invitations.filter(
        (invite) => Date.parse(invite.expiresAt) > Date.now(),
      );
      if (team.invitations.length >= 20)
        problem(
          400,
          "Bitte widerrufe einen alten Einladungslink, bevor du einen weiteren erstellst.",
        );
      const token = randomBytes(32).toString("base64url");
      const invitation = {
        id: randomUUID(),
        hash: hash(token),
        createdBy: actor(res).identitySteam64,
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      };
      team.invitations.push(invitation);
      await saveTeam(team);
      await audit(res, "team_invite", team.id);
      res.status(201).json({
        team: await view(team, actor(res)),
        url: `${config.publicUrl}/teams/join/${token}`,
        expiresAt: invitation.expiresAt,
      });
    }),
  );
  router.post(
    "/team-invitations/:token",
    rateLimit({ windowMs: 60_000, limit: 20 }),
    route(async (req, res) => {
      requireAction(res, "teams.create");
      if (!/^[\w-]{43}$/.test(req.params.token))
        problem(404, "Einladung ungültig oder abgelaufen.");
      for (let attempt = 0; attempt < 5; attempt++) {
        const team: Team = await store.workspace.findInvitation(
          hash(req.params.token),
        );
        const invitation = team?.invitations.find(
          (invite) => invite.hash === hash(req.params.token),
        );
        if (
          !team ||
          !invitation ||
          Date.parse(invitation.expiresAt) <= Date.now() ||
          !team.members.some(
            (member) =>
              member.userId === invitation.createdBy && member.role === "owner",
          )
        )
          problem(404, "Einladung ungültig oder abgelaufen.");
        if (req.body?.accept !== true) {
          res.json({ name: team.name, expiresAt: invitation.expiresAt });
          return;
        }
        if (
          team.members.some(
            (member) => member.userId === actor(res).identitySteam64,
          )
        ) {
          res.json({ team: await view(team, actor(res)) });
          return;
        }
        team.members.push({
          userId: actor(res).identitySteam64,
          role: "member",
          joinedAt: new Date().toISOString(),
        });
        if (await store.workspace.replaceTeam(team, team.revision)) {
          team.revision++;
          await audit(res, "team_join", team.id);
          res.json({ team: await view(team, actor(res)) });
          return;
        }
      }
      problem(409, "Das Team wurde gerade geändert. Bitte erneut beitreten.");
    }),
  );

  live.get(router, "/strats", async ({ user }) => {
    const teams: Team[] = (await store.workspace.listTeams(user.identitySteam64))
      .filter(team => authorize(user, "strats.read", team));
    return { entries: (await store.workspace.listStrats(teams.map(team => team.id)))
      .map(strat => stratView(strat, teams.find(team => team.id === strat.teamId)!, user)).filter(Boolean) };
  });
  router.post(
    "/strats",
    route(async (req, res) => {
      const team = await teamFor(req.body?.teamId, actor(res));
      requireAction(res, "strats.edit", team);
      const content = validateContent(req.body.content, team);
      await store.analysis?.validateContentScenes(content, actor(res), team.id);
      const strat: Strat = {
        id: randomUUID(),
        teamId: team.id,
        revision: 1,
        draft: content,
        published: null,
        archived: false,
        createdBy: actor(res).identitySteam64,
        updatedAt: new Date().toISOString(),
      };
      await store.workspace.createStrat(strat);
      await audit(res, "strat_create", strat.id, { teamId: team.id });
      res.status(201).json({ strat: stratView(strat, team, actor(res)) });
    }),
  );
  async function stratFor(id: string, user: Actor) {
    const strat: Strat = await store.workspace.getStrat(id);
    if (!strat) problem(404, "Strat nicht gefunden.");
    const team = await teamFor(strat.teamId, user);
    if (!stratView(strat, team, user))
      problem(404, "Strat nicht gefunden.");
    return { strat, team };
  }
  live.get(router, "/strats/:id", async ({ user, params }) => {
    const { strat, team } = await stratFor(params.id, user);
    return { strat: stratView(strat, team, user), team: await view(team, user) };
  });
  router.put(
    "/strats/:id",
    route(async (req, res) => {
      const { strat, team } = await stratFor(req.params.id, actor(res));
      requireAction(res, "strats.edit", team);
      revision(req, strat);
      strat.draft = validateContent(req.body.content, team);
      await store.analysis?.validateContentScenes(strat.draft, actor(res), team.id);
      strat.updatedAt = new Date().toISOString();
      if (!(await store.workspace.replaceStrat(strat, strat.revision)))
        problem(409, "Die Strat wurde inzwischen geändert. Bitte neu laden.");
      strat.revision++;
      await audit(res, "strat_edit", strat.id, { teamId: team.id });
      res.json({ strat: stratView(strat, team, actor(res)) });
    }),
  );
  router.post(
    "/strats/:id/:action",
    route(async (req, res) => {
      const { strat, team } = await stratFor(req.params.id, actor(res));
      const action = req.params.action;
      if (!["activate", "publish", "archive", "restore"].includes(action))
        problem(404, "Unbekannte Strat-Aktion.");
      requireAction(
        res,
        action === "activate" ? "strats.activate" : "strats.publish",
        team,
      );
      revision(req, strat);
      if (action === "activate") {
        if (!strat.published || strat.archived)
          problem(400, "Veröffentliche die Strat zuerst.");
        validateContent(strat.published.content, team);
        await store.analysis?.validateContentScenes(strat.published.content, actor(res), team.id);
        team.active = {
          stratId: strat.id,
          version: strat.published.version,
          content: structuredClone(strat.published.content),
          activationId: randomUUID(),
          activatedAt: new Date().toISOString(),
          activatedBy: actor(res).identitySteam64,
        };
        await saveTeam(team);
      } else if (
        action === "publish" ||
        action === "archive" ||
        action === "restore"
      ) {
        if (action === "publish") {
          if (strat.archived)
            problem(400, "Stelle die archivierte Strat zuerst wieder her.");
          const content = validateContent(strat.draft, team);
          await store.analysis?.validateContentScenes(content, actor(res), team.id);
          const nades = await store.getNades();
          const refs = content.slots.flatMap((slot) =>
            slot.steps.flatMap((step) => step.nadeIds),
          );
          if (
            refs.some(
              (id) =>
                !nades.some(
                  (nade) => nade.id === id && nade.map === content.map,
                ),
            )
          )
            problem(
              400,
              "Eine verknüpfte Nade fehlt oder gehört zu einer anderen Map. Bitte korrigiere die Verknüpfung.",
            );
          strat.published = {
            version: (strat.published?.version || 0) + 1,
            publishedAt: new Date().toISOString(),
            content: structuredClone(content),
          };
        } else {
          // Archiving only affects the library. The team's independent live snapshot
          // remains valid until explicitly stopped, including concurrent activation.
          strat.archived = action === "archive";
        }
        strat.updatedAt = new Date().toISOString();
        if (!(await store.workspace.replaceStrat(strat, strat.revision)))
          problem(409, "Die Strat wurde inzwischen geändert. Bitte neu laden.");
        strat.revision++;
      } else problem(404, "Unbekannte Strat-Aktion.");
      await audit(res, `strat_${action}`, strat.id, { teamId: team.id });
      res.json({
        strat: stratView(strat, team, actor(res)),
        team: await view(team, actor(res)),
      });
    }),
  );
  live.get(router, "/teams/:id/live", async ({ user, params }) => {
    const team = await teamFor(params.id, user);
    return { team: await view(team, user), active: team.active };
  });
  router.delete(
    "/teams/:id/live",
    route(async (req, res) => {
      const team = await teamFor(req.params.id, actor(res));
      requireAction(res, "strats.activate", team);
      revision(req, team);
      team.active = null;
      await saveTeam(team);
      await audit(res, "strat_deactivate", team.id);
      res.json({ team: await view(team, actor(res)) });
    }),
  );
  app.use("/api", router);
}
