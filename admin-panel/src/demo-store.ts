import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { Collection, Db } from "mongodb";
import { authorize, type Actor, type Action } from "../shared/authorization.js";
import type {
  Demo,
  DemoReview,
  DemoScene,
  SceneReference,
  RoundReplay,
  ReviewRoom,
} from "../shared/demos.js";
import { roundEnd, roundStart } from "../shared/demos.js";
import { newStratContent, type Team } from "../shared/strats.js";
import { problem, textField, sceneReference } from "./strats.js";
import type { WorkspaceStore } from "./workspace-store.js";
import type { Changes } from "./live-resources.js";

const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[\w-]{1,100}$/.test(id);

export class DemoStore {
  readonly demos: Collection<any>;
  readonly reviews: Collection<any>;
  private presence = new Map<
    string,
    Map<
      string,
      {
        id: string;
        name: string;
        readyKey: string;
        following: boolean;
        at: number;
      }
    >
  >();
  private pointers = new Map<
    string,
    { x: number; y: number; level: string; at: number; sceneKey: string }
  >();
  constructor(
    readonly db: Db,
    readonly directory: string,
    private workspace: WorkspaceStore,
    private changes: Changes,
  ) {
    this.demos = db.collection("demoAssets");
    this.reviews = db.collection("demoReviews");
  }
  async initialize() {
    await this.demos.createIndex({ ownerId: 1, createdAt: -1 });
    await this.demos.createIndex({ teamId: 1, createdAt: -1 });
    await this.demos.createIndex({ status: 1, leaseUntil: 1 });
    await this.demos.createIndex(
      { scope: 1, hash: 1 },
      { unique: true, partialFilterExpression: { hash: { $type: "string" } } },
    );
    await this.reviews.createIndex({ teamId: 1, updatedAt: -1 });
  }
  private mutationQueue: Promise<unknown> = Promise.resolve();
  // This application has one API instance. Keep reference validation and writes
  // ordered with deletion and team membership changes across HTTP and WebSocket.
  mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.catch(() => {});
    return result;
  }
  changed() {
    this.changes.publish();
  }
  path(id: string, file: string) {
    if (!validId(id) || !/^[\w.-]+$/.test(file))
      problem(400, "Ungültiger Dateiverweis.");
    return join(this.directory, id, file);
  }
  async team(
    id: string,
    actor: Actor,
    action: Action = "analysis.read",
  ): Promise<Team> {
    if (!validId(id)) problem(404, "Team nicht gefunden.");
    const team = await this.workspace.getTeam(id);
    if (!team || !authorize(actor, action, team))
      problem(404, "Team nicht gefunden oder nicht mehr zugänglich.");
    return team;
  }
  async demo(id: string, actor: Actor, edit = false): Promise<Demo> {
    if (!validId(id)) problem(404, "Demo nicht gefunden.");
    const demo = await this.demos.findOne(
      { _id: id },
      { projection: { _id: 0, scope: 0, leaseUntil: 0, attempt: 0, claim: 0 } },
    );
    if (!demo) problem(404, "Demo nicht gefunden oder nicht mehr zugänglich.");
    let canEdit =
      demo.ownerId === actor.identitySteam64 &&
      authorize(actor, "demos.personal");
    if (demo.teamId) {
      const team = await this.team(demo.teamId, actor);
      canEdit ||= authorize(actor, "analysis.prepare", team);
    } else if (!canEdit)
      problem(404, "Demo nicht gefunden oder nicht mehr zugänglich.");
    if (edit && !canEdit) problem(403, "Du darfst diese Demo nicht ändern.");
    return { ...demo, canEdit } as Demo;
  }
  async list(actor: Actor) {
    const teams = (
      await this.workspace.listTeams(actor.identitySteam64)
    ).filter((team) => authorize(actor, "analysis.read", team));
    const entries = await this.demos
      .find(
        {
          $or: [
            ...(authorize(actor, "demos.personal")
              ? [{ ownerId: actor.identitySteam64, teamId: null }]
              : []),
            { teamId: { $in: teams.map((team) => team.id) } },
          ],
        },
        {
          projection: { _id: 0, scope: 0, leaseUntil: 0, attempt: 0, claim: 0 },
        },
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    return { entries };
  }
  async create(actor: Actor, input: any) {
    if (!authorize(actor, "demos.personal"))
      problem(403, "Melde dich mit Steam an, um Demos hochzuladen.");
    const teamId = input?.teamId || null;
    if (teamId) await this.team(teamId, actor, "analysis.upload");
    if (!/\.dem(?:\.gz|\.bz2)?$/i.test(input?.filename || ""))
      problem(400, "Wähle eine .dem-, .dem.gz- oder .dem.bz2-Datei.");
    if (!["faceit", "premier", "other"].includes(input.source))
      problem(400, "Wähle die Herkunft der Demo.");
    if (
      (await this.demos.countDocuments({
        ownerId: actor.identitySteam64,
        status: { $in: ["uploading", "receiving", "queued", "processing"] },
      })) >= 3
    )
      problem(
        429,
        "Drei deiner Demos sind noch in Bearbeitung. Bitte warte auf deren Abschluss.",
      );
    const now = new Date().toISOString();
    const demo: Demo = {
      id: randomUUID(),
      ownerId: actor.identitySteam64,
      teamId,
      title: textField(input.title, "Matchname", 120, true),
      filename: textField(input.filename, "Dateiname", 200, true),
      source: input.source,
      status: "uploading",
      createdAt: now,
      updatedAt: now,
    };
    await this.demos.insertOne({
      _id: demo.id,
      ...demo,
      scope: teamId ? `team:${teamId}` : `user:${demo.ownerId}`,
    });
    this.changed();
    return demo;
  }
  async replay(
    id: string,
    roundId: string,
    actor: Actor,
  ): Promise<RoundReplay> {
    const demo = await this.demo(id, actor);
    if (
      demo.status !== "ready" ||
      !demo.summary?.rounds.some((round) => round.id === roundId)
    )
      problem(404, "Diese Runde ist noch nicht verfügbar.");
    return JSON.parse(await readFile(this.path(id, `${roundId}.json`), "utf8"));
  }
  async validateScene(
    value: any,
    actor: Actor,
    teamId?: string,
  ): Promise<SceneReference> {
    const scene = sceneReference(value);
    const demo = await this.demo(scene.demoId, actor);
    const round = demo.summary?.rounds.find(
      (round) => round.id === scene.roundId,
    );
    if (
      demo.status !== "ready" ||
      !round ||
      scene.version !== demo.summary.version ||
      scene.start < roundStart(round) - 0.001 ||
      scene.end > roundEnd(round) + 0.001
    )
      problem(400, "Der Ausschnitt liegt außerhalb einer verfügbaren Runde.");
    if (
      scene.focusId &&
      !demo.summary.players.some((player) => player.id === scene.focusId)
    )
      problem(400, "Der Fokusspieler fehlt in dieser Demo.");
    if (teamId && demo.teamId !== teamId)
      problem(400, "Gib die Demo zuerst ausdrücklich für dieses Team frei.");
    return scene;
  }
  async validateContentScenes(content: any, actor: Actor, teamId: string) {
    for (const scene of [
      content.scene,
      ...content.slots.flatMap((slot) => slot.steps.map((step) => step.scene)),
    ].filter(Boolean)) {
      await this.validateScene(scene, actor, teamId);
      const demo = await this.demo(scene.demoId, actor);
      if (demo.summary.map !== content.map)
        problem(400, "Beispielszene und Strat müssen dieselbe Map verwenden.");
    }
  }
  async share(id: string, actor: Actor, teamId: string) {
    const demo = await this.demo(id, actor, true);
    if (demo.ownerId !== actor.identitySteam64 || demo.teamId)
      problem(
        400,
        "Nur eigene private Demos können für ein Team freigegeben werden.",
      );
    await this.team(teamId, actor, "analysis.upload");
    if (demo.status !== "ready")
      problem(400, "Warte, bis die Analyse abgeschlossen ist.");
    try {
      const result = await this.demos.updateOne(
        { _id: id, teamId: null, status: "ready" },
        {
          $set: {
            teamId,
            scope: `team:${teamId}`,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      if (!result.modifiedCount)
        problem(409, "Die Demo wurde inzwischen geändert.");
    } catch (error) {
      if (error.code === 11000)
        problem(409, "Diese Demo ist im Team bereits vorhanden.");
      throw error;
    }
    this.changed();
  }
  async remove(id: string, actor: Actor) {
    const demo = await this.demo(id, actor, true);
    if (["receiving", "processing"].includes(demo.status))
      problem(409, "Warte, bis die Verarbeitung beendet ist.");
    if (await this.db.collection("liveSessions").findOne({ $or: [{ demoId: id }, { "events.presentation.scene.demoId": id }, { "snapshots.content.scene.demoId": id }, { "snapshots.content.slots.steps.scene.demoId": id }] }) ||
      await this.db.collection("prematches").findOne({ demoIds: id }))
      problem(409, "Diese Demo wird in einer Live-Aufzeichnung oder Matchvorbereitung verwendet.");
    if (
      await this.reviews.findOne({
        $or: [{ "scenes.demoId": id }, { "session.scenes.demoId": id }],
      })
    )
      problem(
        409,
        "Diese Demo wird in einem Review verwendet. Entferne dort zuerst die Szenen und beende die Sitzung.",
      );
    // Published and active copies have their own lifetime.
    const strats = demo.teamId
      ? await this.workspace.listStrats([demo.teamId])
      : [];
    const team = demo.teamId ? await this.workspace.getTeam(demo.teamId) : null;
    const references = (content) =>
      content &&
      [
        content.scene,
        ...content.slots.flatMap((slot) =>
          slot.steps.map((step) => step.scene),
        ),
      ].some((scene) => scene?.demoId === id);
    if (
      strats.some(
        (strat) =>
          references(strat.draft) || references(strat.published?.content),
      ) ||
      references(team?.active?.content)
    )
      problem(
        409,
        "Diese Demo ist noch mit einer Strat oder deren aktiver Fassung verknüpft.",
      );
    if (await this.referenced(id)) problem(409, "Diese Demo wird noch in einer Matchvorbereitung oder Aufzeichnung verwendet.");
    const removed = await this.demos.deleteOne({
      _id: id,
      status: demo.status,
    });
    if (!removed.deletedCount)
      problem(409, "Die Demo wurde inzwischen geändert.");
    await rm(join(this.directory, id), { recursive: true, force: true });
    this.changed();
  }
  async referenced(id: string) {
    const scenePaths = ["draft.scene.demoId", "draft.slots.steps.scene.demoId", "published.content.scene.demoId", "published.content.slots.steps.scene.demoId"];
    if (await this.reviews.findOne({ $or: [{ "scenes.demoId": id }, { "session.scenes.demoId": id }] }) ||
      await this.db.collection("strats").findOne({ $or: scenePaths.map(path => ({ [path]: id })) }) ||
      await this.db.collection("teams").findOne({ $or: [{ "active.content.scene.demoId": id }, { "active.content.slots.steps.scene.demoId": id }] }) ||
      await this.db.collection("liveSessions").findOne({ $or: [{ demoId: id }, { "events.presentation.scene.demoId": id }, { "snapshots.content.scene.demoId": id }, { "snapshots.content.slots.steps.scene.demoId": id }] })) return true;
    const matches = await this.db.collection("matchIndex").find({ demoId: id }, { projection: { id: 1 } }).toArray();
    return !!await this.db.collection("prematches").findOne({ matchIds: { $in: matches.map(m => m.id) } });
  }
  async review(id: string, actor: Actor): Promise<DemoReview> {
    if (!validId(id)) problem(404, "Review nicht gefunden.");
    const review = await this.reviews.findOne(
      { _id: id },
      { projection: { _id: 0 } },
    );
    if (!review) problem(404, "Review nicht gefunden.");
    await this.team(review.teamId, actor);
    return review as DemoReview;
  }
  async listReviews(actor: Actor) {
    const teams = (
      await this.workspace.listTeams(actor.identitySteam64)
    ).filter((team) => authorize(actor, "analysis.read", team));
    return {
      entries: await this.reviews
        .find(
          { teamId: { $in: teams.map((team) => team.id) } },
          { projection: { _id: 0, notes: 0 } },
        )
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray(),
    };
  }
  async createReview(actor: Actor, input: any) {
    await this.team(input?.teamId, actor, "analysis.prepare");
    const review: DemoReview = {
      id: randomUUID(),
      teamId: input.teamId,
      title: textField(input.title, "Reviewname", 120, true),
      revision: 1,
      scenes: [],
      notes: [],
      session: null,
      createdBy: actor.identitySteam64,
      updatedAt: new Date().toISOString(),
    };
    await this.reviews.insertOne({ _id: review.id, ...review });
    this.changed();
    return review;
  }
  private async save(review: DemoReview, expected: number) {
    review.updatedAt = new Date().toISOString();
    const result = await this.reviews.replaceOne(
      { _id: review.id, revision: expected },
      { _id: review.id, ...review, revision: expected + 1 },
    );
    if (!result.matchedCount)
      problem(
        409,
        "Der Review wurde inzwischen geändert. Der aktuelle Stand wird geladen.",
      );
    review.revision = expected + 1;
    this.changed();
    return review;
  }
  async prepare(id: string, actor: Actor, input: any) {
    const review = await this.review(id, actor);
    await this.team(review.teamId, actor, "analysis.prepare");
    if (input?.revision !== review.revision)
      problem(409, "Der Review wurde inzwischen geändert.");
    if (input.action === "rename")
      review.title = textField(input.title, "Reviewname", 120, true);
    else if (input.action === "scene") {
      const reference = await this.validateScene(
        input.scene,
        actor,
        review.teamId,
      );
      const scene: DemoScene = {
        ...reference,
        id: validId(input.scene.id) ? input.scene.id : randomUUID(),
        title: textField(input.scene.title, "Szenentitel", 120, true),
        note: textField(input.scene.note || "", "Beobachtung", 3000),
      };
      const index = review.scenes.findIndex((entry) => entry.id === scene.id);
      if (index < 0) {
        if (review.scenes.length >= 60)
          problem(400, "Ein Review kann höchstens 60 Szenen enthalten.");
        review.scenes.push(scene);
      } else review.scenes[index] = scene;
    } else if (input.action === "remove")
      review.scenes = review.scenes.filter(
        (scene) => scene.id !== input.sceneId,
      );
    else if (input.action === "reorder") {
      if (
        !Array.isArray(input.ids) ||
        input.ids.length !== review.scenes.length ||
        new Set(input.ids).size !== review.scenes.length ||
        input.ids.some((id) => !review.scenes.some((scene) => scene.id === id))
      )
        problem(400, "Ungültige Szenenreihenfolge.");
      review.scenes = input.ids.map(
        (id) => review.scenes.find((scene) => scene.id === id)!,
      );
    } else problem(400, "Unbekannte Review-Aktion.");
    return this.save(review, review.revision);
  }
  async note(id: string, actor: Actor, input: any) {
    const review = await this.review(id, actor);
    await this.team(review.teamId, actor, "analysis.note");
    if (review.notes.length >= 200)
      problem(400, "Dieser Review enthält bereits 200 Notizen.");
    if (
      ![...review.scenes, ...(review.session?.scenes || [])].some(
        (scene) => scene.id === input?.sceneId,
      )
    )
      problem(400, "Die Szene ist nicht mehr vorhanden.");
    const note = {
      id: randomUUID(),
      authorId: actor.identitySteam64,
      authorName: actor.name || actor.identitySteam64,
      sceneId: input.sceneId,
      text: textField(input.text, "Erkenntnis oder Aufgabe", 3000, true),
      createdAt: new Date().toISOString(),
    };
    review.notes.push(note);
    return this.save(review, review.revision);
  }
  async room(id: string, actor: Actor): Promise<ReviewRoom> {
    const review = await this.review(id, actor);
    const team = await this.team(review.teamId, actor);
    const participants = new Map<string, any>();
    const readyKey = review.session
      ? `${review.session.id}:${review.session.playback.sceneIndex}`
      : "";
    for (const [connection, participant] of this.presence.get(id) || []) {
      if (
        Date.now() - participant.at > 45_000 ||
        !team.members.some((member) => member.userId === participant.id)
      ) {
        this.presence.get(id)?.delete(connection);
        continue;
      }
      participants.set(participant.id, {
        id: participant.id,
        name: participant.name,
        ready: !!readyKey && participant.readyKey === readyKey,
        following: participant.following,
      });
    }
    const pointer = this.pointers.get(id);
    return {
      review,
      canEdit: authorize(actor, "analysis.prepare", team),
      participants: [...participants.values()],
      pointer:
        pointer &&
        pointer.sceneKey === readyKey &&
        Date.now() - pointer.at < 5000
          ? pointer
          : null,
    };
  }
  disconnect(connectionId: string) {
    for (const [id, participants] of this.presence)
      if (participants.delete(connectionId)) {
        if (!participants.size) this.presence.delete(id);
        this.changes.publish([`/api/analysis/reviews/${id}/room`]);
      }
  }
  async command(id: string, actor: Actor, input: any, connectionId: string) {
    const review = await this.review(id, actor);
    const team = await this.team(review.teamId, actor);
    if (input?.action === "leave") {
      this.presence.get(id)?.delete(connectionId);
      this.changes.publish([`/api/analysis/reviews/${id}/room`]);
      return { revision: review.revision };
    }
    if (input?.action === "presence") {
      let participants = this.presence.get(id);
      if (!participants) this.presence.set(id, (participants = new Map()));
      participants.set(connectionId, {
        id: actor.identitySteam64,
        name: actor.name || actor.identitySteam64,
        readyKey: String(input.readyKey || "").slice(0, 140),
        following: input.following === true,
        at: Date.now(),
      });
      this.changes.publish([`/api/analysis/reviews/${id}/room`]);
      return { ok: true };
    }
    if (!authorize(actor, "analysis.control", team))
      problem(403, "Nur Owner und Captains steuern den Review.");
    if (input?.revision !== review.revision)
      problem(409, "Die Wiedergabe wurde inzwischen geändert.");
    const now = Date.now();
    if (input.action === "start") {
      if (review.session)
        problem(
          409,
          "Eine Sitzung läuft bereits. Übernimm bei Bedarf die Steuerung.",
        );
      if (!review.scenes.length)
        problem(400, "Bereite zuerst mindestens eine Szene vor.");
      for (const scene of review.scenes)
        await this.validateScene(scene, actor, review.teamId);
      const scene = review.scenes[0];
      review.session = {
        id: randomUUID(),
        moderatorId: actor.identitySteam64,
        scenes: structuredClone(review.scenes),
        playback: {
          sceneIndex: 0,
          time: scene.start,
          playing: false,
          speed: 1,
          anchoredAt: now,
          focusId: scene.focusId,
        },
      };
    } else {
      const session = review.session;
      if (!session)
        problem(400, "Die gemeinsame Sitzung ist noch nicht gestartet.");
      if (input.action === "takeover")
        session.moderatorId = actor.identitySteam64;
      else {
        if (session.moderatorId !== actor.identitySteam64)
          problem(403, "Übernimm zuerst ausdrücklich die Steuerung.");
        const playback = session.playback;
        const scene = session.scenes[playback.sceneIndex];
        if (input.action === "pointer") {
          if (
            ![input.x, input.y].every(
              (value) => Number.isFinite(value) && value >= 0 && value <= 1,
            ) ||
            !["upper", "lower"].includes(input.level)
          )
            problem(400, "Ungültige Kartenposition.");
          this.pointers.set(id, {
            x: input.x,
            y: input.y,
            level: input.level,
            at: now,
            sceneKey: `${session.id}:${playback.sceneIndex}`,
          });
          this.changes.publish([`/api/analysis/reviews/${id}/room`]);
          return { ok: true };
        }
        if (input.action === "stop") review.session = null;
        else if (input.action === "scene") {
          if (!Number.isInteger(input.index) || !session.scenes[input.index])
            problem(400, "Ungültige Szene.");
          const next = session.scenes[input.index];
          session.playback = {
            sceneIndex: input.index,
            time: next.start,
            playing: false,
            speed: playback.speed,
            anchoredAt: now,
            focusId: next.focusId,
          };
        } else if (input.action === "playback") {
          if (
            typeof input.playing !== "boolean" ||
            ![0.25, 0.5, 1, 2, 4].includes(input.speed) ||
            !Number.isFinite(input.time) ||
            input.time < scene.start ||
            input.time > scene.end
          )
            problem(400, "Ungültiger Wiedergabezustand.");
          const demo = await this.demo(scene.demoId, actor);
          if (
            typeof input.focusId !== "string" ||
            (input.focusId &&
              !demo.summary?.players.some(
                (player) => player.id === input.focusId,
              ))
          )
            problem(400, "Ungültiger Fokusspieler.");
          session.playback = {
            ...playback,
            time: input.time,
            speed: input.speed,
            playing: input.playing && input.time < scene.end,
            focusId: input.focusId,
            anchoredAt: now,
          };
        } else problem(400, "Unbekannter Wiedergabebefehl.");
      }
    }
    await this.save(review, review.revision);
    return { revision: review.revision };
  }
  async stratFromScene(actor: Actor, input: any) {
    const team = await this.team(input?.teamId, actor, "strats.edit");
    const scene = await this.validateScene(input.scene, actor, team.id);
    const demo = await this.demo(scene.demoId, actor);
    const content = newStratContent(demo.summary!.map);
    content.title = textField(input.title, "Stratname", 120, true);
    content.description = textField(input.note || "", "Beschreibung", 3000);
    content.scene = scene;
    const strat = {
      id: randomUUID(),
      teamId: team.id,
      revision: 1,
      draft: content,
      published: null,
      archived: false,
      createdBy: actor.identitySteam64,
      updatedAt: new Date().toISOString(),
    };
    await this.workspace.createStrat(strat);
    return strat;
  }
}
