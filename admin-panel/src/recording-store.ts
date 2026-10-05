import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  appendFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Db, Collection } from "mongodb";
import { authorize, type Actor } from "../shared/authorization.js";
import {
  sessionTime,
  type LiveSession,
  type RecordingRoom,
  type SessionEvent,
  type AudioTrack,
  type Presentation,
} from "../shared/recordings.js";
import { problem, textField } from "./strats.js";
import type { DemoStore } from "./demo-store.js";
import type { WorkspaceStore } from "./workspace-store.js";

const execute = promisify(execFile);
export const recordingId = (id: unknown): id is string =>
  typeof id === "string" && /^[\w-]{1,100}$/.test(id);
const MAX_DURATION = 8 * 3600;

export class RecordingStore {
  readonly sessions: Collection<any>;
  readonly tracks: Collection<any>;
  readonly segments: Collection<any>;
  readonly explanations: Collection<any>;
  private finalizing = new Set<string>();
  private clocks = new Map<string, { base: number; anchor: number }>();
  private elapsed(session: LiveSession) {
    if (session.status !== "recording") return session.duration;
    let clock = this.clocks.get(session.id);
    if (!clock) {
      clock = {
        base: Math.max(session.duration, sessionTime(session, Date.now())),
        anchor: performance.now(),
      };
      this.clocks.set(session.id, clock);
    }
    return Math.max(0, clock.base + (performance.now() - clock.anchor) / 1000);
  }
  constructor(
    db: Db,
    readonly directory: string,
    readonly analysis: DemoStore,
    readonly workspace: WorkspaceStore,
    readonly config: any,
  ) {
    this.sessions = db.collection("liveSessions");
    this.tracks = db.collection("audioTracks");
    this.segments = db.collection("audioSegments");
    this.explanations = db.collection("learningExplanations");
  }
  async initialize() {
    await this.sessions.createIndex({ teamId: 1, updatedAt: -1 });
    await this.tracks.createIndex({ sessionId: 1 });
    await this.segments.createIndex(
      { trackId: 1, sequence: 1 },
      { unique: true },
    );
    await this.explanations.createIndex({ stratId: 1 });
  }
  isFinalizing(id: string) {
    return this.finalizing.has(id);
  }
  path(trackId: string, file: string) {
    if (!recordingId(trackId) || !/^[\w.-]+$/.test(file))
      problem(400, "Ungültiger Audioverweis.");
    return join(this.directory, trackId, file);
  }
  async session(
    id: string,
    actor: Actor,
    timeline = false,
  ): Promise<LiveSession & { events?: SessionEvent[] }> {
    if (!recordingId(id)) problem(404, "Live-Sitzung nicht gefunden.");
    const session = await this.sessions.findOne(
      { _id: id },
      { projection: { _id: 0, ...(!timeline && { events: 0 }) } },
    );
    if (!session) problem(404, "Live-Sitzung nicht gefunden.");
    await this.analysis.team(session.teamId, actor);
    return session;
  }
  async room(id: string, actor: Actor): Promise<RecordingRoom> {
    const session = await this.session(id, actor),
      team = await this.analysis.team(session.teamId, actor);
    const tracks = await this.tracks
      .find({ sessionId: id }, { projection: { _id: 0, parts: 0, lease: 0 } })
      .toArray();
    return {
      session:
        session.status === "recording"
          ? { ...session, duration: this.elapsed(session), clockAt: Date.now() }
          : session,
      tracks: tracks as AudioTrack[],
      canControl: authorize(actor, "analysis.control", team),
      canRecord:
        session.recorderId === actor.identitySteam64 &&
        authorize(actor, "analysis.record", team),
      serverTime: Date.now(),
    };
  }
  async list(actor: Actor) {
    const teams = await this.workspace.listTeams(actor.identitySteam64);
    return {
      entries: await this.sessions
        .find(
          { teamId: { $in: teams.map((t) => t.id) } },
          { projection: { _id: 0, events: 0, snapshots: 0 } },
        )
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray(),
    };
  }
  async create(actor: Actor, input: any) {
    const team = await this.analysis.team(
      input?.teamId,
      actor,
      "analysis.prepare",
    );
    if (!["match", "review"].includes(input.mode))
      problem(400, "Wähle Match oder Besprechung.");
    const recorderId = input.recorderId || actor.identitySteam64;
    if (!team.members.some((m) => m.userId === recorderId))
      problem(400, "Die Tonaufnahme muss einem Teammitglied zugewiesen sein.");
    if (
      (await this.sessions.countDocuments({
        teamId: team.id,
        status: { $ne: "finished" },
      })) >= 5
    )
      problem(409, "Beende zuerst eine der fünf offenen Live-Sitzungen.");
    const now = new Date().toISOString();
    const session: LiveSession = {
      id: randomUUID(),
      teamId: team.id,
      title: textField(input.title, "Sitzungsname", 120, true),
      mode: input.mode,
      recorderId,
      moderatorId: actor.identitySteam64,
      createdBy: actor.identitySteam64,
      revision: 1,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      duration: 0,
      presentation: { kind: "notes" },
      snapshots: [],
      eventCount: 0,
      demoId: null,
      pinned: false,
      expiresAt: null,
    };
    await this.sessions.insertOne({ _id: session.id, ...session, events: [] });
    this.analysis.changed();
    return session;
  }
  async command(id: string, actor: Actor, input: any) {
    const session = await this.session(id, actor, true),
      team = await this.analysis.team(session.teamId, actor);
    if (!recordingId(input?.commandId))
      problem(400, "Der Befehl benötigt eine eindeutige ID.");
    if (session.events.some((e) => e.id === input.commandId))
      return { revision: session.revision, duplicate: true };
    const action = input.action;
    if (action === "note") {
      if (!authorize(actor, "analysis.note", team))
        problem(403, "Du darfst hier keine Notiz schreiben.");
    } else {
      if (!authorize(actor, "analysis.control", team))
        problem(403, "Nur Owner und Captains dürfen die Sitzung steuern.");
      if (
        action !== "takeover" &&
        actor.identitySteam64 !== session.moderatorId
      )
        problem(403, "Übernimm zuerst ausdrücklich die Moderation.");
    }
    if (input.revision !== session.revision)
      problem(
        409,
        "Die Sitzung wurde geändert. Der aktuelle Stand wird geladen.",
      );
    if (session.status === "finished")
      problem(409, "Die Aufzeichnung ist bereits beendet.");
    const now = Date.now(),
      at = this.elapsed(session);
    if (at > MAX_DURATION && action !== "stop")
      problem(
        409,
        "Die maximale Sitzungsdauer ist erreicht. Beende die Sitzung.",
      );
    const event: SessionEvent = {
      id: input.commandId,
      sequence: session.eventCount + 1,
      at,
      authorId: actor.identitySteam64,
      type: action,
    };
    if (action === "start") {
      if (session.status !== "prepared")
        problem(409, "Die Sitzung läuft bereits.");
      if (input.consent !== true)
        problem(400, "Bestätige vor dem Start die Zustimmung zur Aufnahme.");
      session.status = "recording";
      session.startedAt = now;
      this.clocks.set(id, { base: 0, anchor: performance.now() });
      event.at = 0;
      event.presentation = session.presentation;
    } else if (action === "stop") {
      if (session.status !== "recording")
        problem(409, "Die Sitzung läuft noch nicht.");
      session.status = "finished";
      session.duration = Math.min(MAX_DURATION, at);
      event.at = session.duration;
      session.expiresAt = session.pinned
        ? null
        : new Date(now + 90 * 86400_000).toISOString();
    } else if (action === "takeover") {
      session.moderatorId = actor.identitySteam64;
    } else if (action === "note") {
      event.text = textField(input.text, "Notiz", 3000, true);
    } else if (action === "point") {
      if (
        session.presentation.kind !== "demo" ||
        !Number.isFinite(input.point?.x) ||
        !Number.isFinite(input.point?.y) ||
        input.point.x < 0 ||
        input.point.x > 1 ||
        input.point.y < 0 ||
        input.point.y > 1 ||
        !["upper", "lower"].includes(input.point.level)
      )
        problem(400, "Ungültige Kartenmarkierung.");
      event.point = {
        x: input.point.x,
        y: input.point.y,
        level: input.point.level,
      };
    } else if (action === "present") {
      if (input.kind === "demo") {
        const scene = await this.analysis.validateScene(
          input.scene,
          actor,
          session.teamId,
        );
        session.presentation = {
          kind: "demo",
          scene,
          playback: {
            sceneIndex: 0,
            time: scene.start,
            playing: false,
            speed: 1,
            anchoredAt: now,
            focusId: scene.focusId,
          },
        };
      } else if (input.kind === "strat") {
        const strat = await this.workspace.getStrat(input.stratId);
        if (!strat || strat.teamId !== session.teamId || !strat.published)
          problem(400, "Wähle eine veröffentlichte Strat dieses Teams.");
        const snapshotId = `${strat.id}-${strat.published.version}`;
        if (!session.snapshots.some((s) => s.id === snapshotId)) {
          if (session.snapshots.length >= 30)
            problem(
              400,
              "Eine Sitzung kann höchstens 30 Strat-Versionen enthalten.",
            );
          await this.analysis.validateContentScenes(
            strat.published.content,
            actor,
            session.teamId,
          );
          session.snapshots.push({
            id: snapshotId,
            stratId: strat.id,
            version: strat.published.version,
            content: strat.published.content,
          });
        }
        session.presentation = { kind: "strat", snapshotId };
      } else if (input.kind === "notes")
        session.presentation = { kind: "notes" };
      else problem(400, "Wähle Demo, Stratbook oder Notizen.");
      event.presentation = session.presentation;
    } else if (action === "playback") {
      if (session.presentation.kind !== "demo")
        problem(400, "Es wird gerade keine Demo präsentiert.");
      const { scene } = session.presentation,
        value = input.playback;
      if (
        !Number.isFinite(value?.time) ||
        value.time < scene.start ||
        value.time > scene.end ||
        typeof value.playing !== "boolean" ||
        ![0.25, 0.5, 1, 2, 4].includes(value.speed)
      )
        problem(400, "Ungültige Wiedergabe.");
      const demo = await this.analysis.demo(scene.demoId, actor);
      if (
        value.focusId &&
        !demo.summary.players.some((p) => p.id === value.focusId)
      )
        problem(400, "Fokusspieler nicht gefunden.");
      session.presentation = {
        ...session.presentation,
        playback: {
          ...session.presentation.playback,
          ...value,
          anchoredAt: now,
        },
      };
      event.presentation = session.presentation;
    } else problem(400, "Unbekannte Live-Aktion.");
    if (session.status === "recording") {
      session.duration = event.at;
      session.clockAt = now;
    } else if (session.status === "finished") this.clocks.delete(id);
    session.events.push(event);
    session.eventCount++;
    session.updatedAt = new Date(now).toISOString();
    if (
      (session.eventCount > 6000 ||
        Buffer.byteLength(JSON.stringify(session)) > 10 * 1024 * 1024) &&
      action !== "stop"
    )
      problem(
        409,
        "Diese Sitzung hat ihr Aufzeichnungslimit erreicht. Beende sie und starte eine neue.",
      );
    const result = await this.sessions.replaceOne(
      { _id: id, revision: session.revision },
      { _id: id, ...session, revision: session.revision + 1 },
    );
    if (!result.modifiedCount)
      problem(409, "Die Sitzung wurde inzwischen geändert.");
    this.analysis.changed();
    return { revision: session.revision + 1 };
  }
  async track(id: string, actor: Actor, edit = false) {
    if (!recordingId(id)) problem(404, "Tonspur nicht gefunden.");
    const track = await this.tracks.findOne(
      { _id: id },
      { projection: { _id: 0 } },
    );
    if (!track) problem(404, "Tonspur nicht gefunden.");
    const room = await this.room(track.sessionId, actor);
    if (edit && track.ownerId !== actor.identitySteam64)
      problem(403, "Nur der Aufnehmende darf die Tonspur hochladen.");
    if (edit && !room.canRecord)
      problem(403, "Du bist nicht mehr für die Tonaufnahme eingeteilt.");
    return track;
  }
  async createTrack(sessionId: string, actor: Actor, input: any) {
    const room = await this.room(sessionId, actor);
    if (!room.canRecord)
      problem(
        403,
        "Die Tonaufnahme ist einem anderen Teammitglied zugewiesen.",
      );
    if (room.session.status === "prepared")
      problem(409, "Starte zuerst die Sitzung.");
    if (
      !["microphone", "discord", "game", "file"].includes(input?.source) ||
      ![
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
        "audio/mp4",
      ].includes(input.mime)
    )
      problem(400, "Wähle eine unterstützte Audioquelle und Datei.");
    if (
      !Number.isFinite(input.start) ||
      input.start < -3600 ||
      input.start > MAX_DURATION
    )
      problem(400, "Ungültiger Beginn der Tonspur.");
    if (input.id !== undefined) {
      if (!recordingId(input.id)) problem(400, "Ungültige Tonspur-ID.");
      const existing = await this.tracks.findOne({ _id: input.id });
      if (existing) {
        if (
          existing.sessionId !== sessionId ||
          existing.ownerId !== actor.identitySteam64 ||
          existing.source !== input.source
        )
          problem(409, "Diese Tonspur-ID ist bereits vergeben.");
        const { _id, parts, ...publicTrack } = existing;
        return publicTrack;
      }
    }
    if ((await this.tracks.countDocuments({ sessionId })) >= 20)
      problem(400, "Eine Sitzung kann höchstens 20 Tonspuren enthalten.");
    const track: AudioTrack = {
      id: input.id || randomUUID(),
      sessionId,
      teamId: room.session.teamId,
      ownerId: actor.identitySteam64,
      source: input.source,
      name: textField(input.name, "Spurname", 120, true),
      mime: input.mime,
      status: "uploading",
      start: input.start,
      duration: 0,
      bytes: 0,
      segments: 0,
      anchors: [],
      createdAt: new Date().toISOString(),
    };
    await this.tracks.insertOne({
      _id: track.id,
      ...track,
      independent: input.independent === true,
      parts: [],
    });
    this.analysis.changed();
    return track;
  }
  async finalize(
    id: string,
    actor: Actor,
    reserve?: (track: any) => Promise<void>,
  ) {
    const { track, segments } = await this.analysis.mutate(async () => {
      const track = await this.track(id, actor, true);
      if (track.status === "ready") return { track, segments: [] };
      if (this.finalizing.has(id))
        problem(409, "Die Tonspur wird bereits verarbeitet.");
      if (this.finalizing.size)
        problem(
          429,
          "Eine Tonspur wird gerade verarbeitet. Versuche es anschließend erneut.",
        );
      if (await this.segments.findOne({ trackId: id, status: "receiving" }))
        problem(409, "Warte, bis alle Audiosegmente hochgeladen sind.");
      const segments = await this.segments
        .find({ trackId: id, status: "ready" })
        .sort({ sequence: 1 })
        .toArray();
      if (!segments.length || segments.some((s, index) => s.sequence !== index))
        problem(409, "Es fehlen Audiosegmente. Lade sie erneut hoch.");
      if (reserve) await reserve(track);
      this.finalizing.add(id);
      return { track, segments };
    });
    if (track.status === "ready") return;
    let remoteParts: any[] = [];
    try {
      for (const file of await readdir(join(this.directory, id)))
        if (/^part-\d{4}\.ogg$/.test(file))
          await rm(this.path(id, file), { force: true });
      const input = this.path(id, "input"),
        list = this.path(id, "concat.txt");
      const names = segments.map((s) => this.path(id, `segment-${s.sequence}`));
      if (track.independent)
        await writeFile(list, names.map((file) => `file '${file}'`).join("\n"));
      else {
        await writeFile(input, Buffer.alloc(0));
        for (const name of names) await appendFile(input, await readFile(name));
      }
      const output = join(this.directory, id, "part-%04d.ogg");
      await execute(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-y",
          "-protocol_whitelist",
          "file,pipe",
          ...(track.independent
            ? ["-f", "concat", "-safe", "0", "-i", list]
            : ["-i", input]),
          "-map",
          "0:a:0",
          "-vn",
          "-threads",
          "1",
          "-ar",
          "48000",
          "-ac",
          track.source === "game" ? "2" : "1",
          "-c:a",
          "libopus",
          "-b:a",
          track.source === "game" ? "128k" : "64k",
          "-t",
          String(MAX_DURATION),
          "-f",
          "segment",
          "-segment_time",
          "300",
          "-reset_timestamps",
          "1",
          "-segment_format",
          "ogg",
          output,
        ],
        { timeout: 5 * 60_000, maxBuffer: 32_768 },
      );
      const files = (await readdir(join(this.directory, id)))
        .filter((f) => /^part-\d{4}\.ogg$/.test(f))
        .sort();
      let duration = 0,
        bytes = 0;
      const parts: any[] = [];
      remoteParts = parts;
      for (const file of files) {
        const info = await execute(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            this.path(id, file),
          ],
          { timeout: 10_000 },
        );
        const seconds = Number(JSON.parse(info.stdout).format.duration),
          size = (await stat(this.path(id, file))).size;
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 310)
          problem(400, "Die Tonspur enthält ungültige Audiodaten.");
        parts.push({
          index: parts.length,
          file,
          start: duration,
          duration: seconds,
          bytes: size,
        });
        duration += seconds;
        bytes += size;
      }
      if (!parts.length)
        problem(400, "Die Datei enthält keine abspielbare Tonspur.");
      await this.track(id, actor, true);
      if (this.config.recordingStorage === "uploadthing") {
        if (!this.config.uploadthingToken)
          problem(
            503,
            "UploadThing ist für private Tonaufnahmen noch nicht eingerichtet.",
          );
        const { UTApi, UTFile } = await import("uploadthing/server");
        const api = new UTApi({ token: this.config.uploadthingToken });
        try {
          for (const part of parts) {
            const file = new UTFile(
              [await readFile(this.path(id, part.file))],
              part.file,
              { type: "audio/ogg" },
            );
            const uploaded = await api.uploadFiles(file, { acl: "private" });
            if (uploaded.error || !uploaded.data?.key)
              problem(
                503,
                "Die private Audioablage ist nicht verfügbar. Prüfe die UploadThing-ACL-Einstellungen.",
              );
            part.remoteKey = uploaded.data.key;
          }
        } catch (error) {
          const keys = parts.filter((p) => p.remoteKey).map((p) => p.remoteKey);
          if (keys.length) await api.deleteFiles(keys).catch(() => {});
          throw error;
        }
      }
      await this.analysis.mutate(async () => {
        await this.track(id, actor, true);
        await this.tracks.updateOne(
          { _id: id },
          {
            $set: {
              status: "ready",
              parts,
              duration,
              bytes,
              segments: segments.length,
            },
            $unset: { error: "" },
          },
        );
        const session = await this.session(track.sessionId, actor);
        if (
          session.status === "finished" &&
          session.mode === "match" &&
          track.source === "file"
        )
          await this.sessions.updateOne(
            { _id: session.id },
            {
              $max: {
                duration: Math.min(
                  MAX_DURATION,
                  Math.max(0, track.start) + duration,
                ),
              },
              $inc: { revision: 1 },
            },
          );
      });
      remoteParts = [];
      for (const file of [
        ...names,
        input,
        list,
        ...parts.filter((p) => p.remoteKey).map((p) => this.path(id, p.file)),
      ])
        await rm(file, { force: true }).catch(() => {});
      await this.segments.deleteMany({ trackId: id });
    } catch (error) {
      const keys = remoteParts
        .filter((p) => p.remoteKey)
        .map((p) => p.remoteKey);
      if (keys.length) {
        const { UTApi } = await import("uploadthing/server");
        await new UTApi({ token: this.config.uploadthingToken })
          .deleteFiles(keys)
          .catch(() => {});
      }
      await this.tracks.updateOne(
        { _id: id },
        {
          $set: {
            status: "failed",
            error:
              "Die Tonspur konnte nicht fertiggestellt werden. Prüfe die Datei und wiederhole die Verarbeitung.",
          },
        },
      );
      throw error;
    } finally {
      this.finalizing.delete(id);
      this.analysis.changed();
    }
  }
  async align(id: string, actor: Actor, input: any) {
    const track = await this.track(id, actor),
      session = await this.session(track.sessionId, actor);
    await this.analysis.team(session.teamId, actor, "analysis.prepare");
    if (track.status !== "ready")
      problem(409, "Warte auf die fertiggestellte Tonspur.");
    const start = input?.start;
    if (!Number.isFinite(start) || Math.abs(start) > MAX_DURATION)
      problem(400, "Ungültiger Audio-Versatz.");
    const anchors = input.anchors || [];
    if (!Array.isArray(anchors) || anchors.length > 100)
      problem(400, "Zu viele Zeitanker.");
    if (anchors.length) {
      if (!session.demoId || anchors.length < 2)
        problem(
          400,
          "Verknüpfe eine Demo und setze mindestens zwei Zeitanker.",
        );
      const demo = await this.analysis.demo(session.demoId, actor);
      const maxTick = Math.max(...demo.summary.rounds.map((r) => r.endTick));
      let lastAudio = -1,
        lastTick = -1;
      for (const anchor of anchors) {
        if (
          !Number.isFinite(anchor.audio) ||
          !Number.isInteger(anchor.demoTick) ||
          anchor.audio <= lastAudio ||
          anchor.audio > track.duration ||
          anchor.demoTick <= lastTick ||
          anchor.demoTick > maxTick
        )
          problem(
            400,
            "Zeitanker müssen innerhalb der Tonspur und Demo aufsteigend sein.",
          );
        lastAudio = anchor.audio;
        lastTick = anchor.demoTick;
      }
    }
    await this.tracks.updateOne(
      { _id: id },
      {
        $set: {
          start,
          anchors: anchors.map((a) => ({
            audio: a.audio,
            demoTick: a.demoTick,
          })),
        },
      },
    );
    this.analysis.changed();
  }
  async linkDemo(id: string, actor: Actor, demoId: string) {
    const session = await this.session(id, actor);
    await this.analysis.team(session.teamId, actor, "analysis.prepare");
    const demo = await this.analysis.demo(demoId, actor);
    if (demo.teamId !== session.teamId || demo.status !== "ready")
      problem(400, "Wähle eine analysierte Demo dieses Teams.");
    if (await this.explanations.findOne({ sessionId: id }))
      problem(
        409,
        "Eine als Erklärung verwendete Aufnahme darf ihre Demo nicht wechseln.",
      );
    if (session.demoId && session.demoId !== demoId)
      await this.tracks.updateMany(
        { sessionId: id },
        { $set: { anchors: [] } },
      );
    await this.sessions.updateOne(
      { _id: id },
      { $set: { demoId }, $inc: { revision: 1 } },
    );
    this.analysis.changed();
  }
  async explain(id: string, actor: Actor, input: any) {
    const session = await this.session(id, actor);
    await this.analysis.team(session.teamId, actor, "strats.edit");
    const strat = await this.workspace.getStrat(input?.stratId);
    if (
      !strat ||
      strat.teamId !== session.teamId ||
      session.status !== "finished"
    )
      problem(400, "Wähle eine Strat dieses Teams und eine beendete Aufnahme.");
    let scene = null;
    if (session.mode === "match") {
      if (!session.demoId || input.scene?.demoId !== session.demoId)
        problem(400, "Wähle einen Ausschnitt der verbundenen Matchdemo.");
      scene = await this.analysis.validateScene(
        { ...input.scene, start: input.start, end: input.end },
        actor,
        session.teamId,
      );
    }
    if (
      !Number.isFinite(input.start) ||
      !Number.isFinite(input.end) ||
      input.start < 0 ||
      input.end <= input.start ||
      (!scene && input.end > session.duration)
    )
      problem(400, "Ungültiger Erklärungsabschnitt.");
    const slotId = input.slotId || null;
    if (slotId && !strat.draft.slots.some((s) => s.id === slotId))
      problem(400, "Die Rolle ist nicht mehr vorhanden.");
    const explanation = {
      id: randomUUID(),
      teamId: session.teamId,
      sessionId: id,
      stratId: strat.id,
      slotId,
      ...(scene && { scene }),
      title: textField(input.title, "Titel der Erklärung", 120, true),
      start: input.start,
      end: input.end,
      createdBy: actor.identitySteam64,
    };
    await this.explanations.insertOne({ _id: explanation.id, ...explanation });
    await this.sessions.updateOne(
      { _id: id },
      { $set: { pinned: true, expiresAt: null } },
    );
    this.analysis.changed();
    return explanation;
  }
  async pin(id: string, actor: Actor, pinned: boolean) {
    const session = await this.session(id, actor);
    await this.analysis.team(session.teamId, actor, "analysis.prepare");
    if (!pinned && (await this.explanations.findOne({ sessionId: id })))
      problem(
        409,
        "Diese Aufzeichnung ist mit einer Strat-Erklärung verknüpft.",
      );
    await this.sessions.updateOne(
      { _id: id },
      {
        $set: {
          pinned,
          expiresAt:
            pinned || session.status !== "finished"
              ? null
              : new Date(Date.now() + 90 * 86400_000).toISOString(),
        },
      },
    );
    this.analysis.changed();
  }
}
