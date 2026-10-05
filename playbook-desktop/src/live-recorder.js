import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const validId = (value) =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);
const recordSources = (record) => record.sources || ["discord", "microphone"];
export function audioOptions(value) {
  if (
    !value ||
    typeof value.gameDeviceId !== "string" ||
    typeof value.voiceDeviceId !== "string" ||
    !value.gameDeviceId ||
    !value.voiceDeviceId ||
    value.gameDeviceId.length > 1000 ||
    value.voiceDeviceId.length > 1000 ||
    value.gameDeviceId === value.voiceDeviceId ||
    !Number.isInteger(value.microphoneStrip) ||
    value.microphoneStrip < -1 ||
    value.microphoneStrip > 4
  )
    throw new Error(
      "Wähle zwei unterschiedliche Aufnahmegeräte und einen gültigen Mikrofonkanal.",
    );
  return {
    gameDeviceId: value.gameDeviceId,
    voiceDeviceId: value.voiceDeviceId,
    microphoneStrip: value.microphoneStrip,
  };
}
export class LiveRecorder {
  constructor({ directory, executable, request, capture = spawn }) {
    this.directory = directory;
    this.executable = executable;
    this.request = request;
    this.capture = capture;
    this.child = null;
    this.active = null;
    this.muted = false;
    this.error = "";
    this.captureError = "";
    this.pending = 0;
    this.uploading = null;
    this.writes = Promise.resolve();
  }
  state() {
    return {
      recording: !!this.child,
      sessionId: this.active?.sessionId || "",
      muted: this.muted,
      pending: this.pending,
      error: this.captureError || this.error,
      microphone: this.active?.microphone || "",
      microphoneControl: !!this.active?.microphoneControl,
      levels: this.levels || { game: 0, discord: 0 },
    };
  }
  async save(value) {
    const data = JSON.stringify(value),
      directory = path.join(this.directory, value.id);
    const work = this.writes.then(async () => {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "recording.tmp"), data);
      await rename(
        path.join(directory, "recording.tmp"),
        path.join(directory, "recording.json"),
      );
    });
    this.writes = work.catch(() => {});
    return work;
  }
  async begin(sessionId, options) {
    if (!validId(sessionId) || this.child)
      throw new Error(
        "Eine Tonaufnahme läuft bereits oder die Sitzung ist ungültig.",
      );
    const before = Date.now(),
      room = await this.request(`/api/analysis/live/${sessionId}/room`),
      after = Date.now();
    if (!room.canRecord || room.session.status !== "recording")
      throw new Error(
        "Du bist für diese laufende Sitzung nicht als Aufnehmender eingeteilt.",
      );
    options = audioOptions(options);
    const offset = (room.serverTime || after) - (before + after) / 2;
    const record = {
      id: randomUUID(),
      sessionId,
      ownerId: room.session.recorderId,
      startedAt: 0,
      sessionStartedAt: room.session.startedAt,
      sessionBase:
        room.session.clockAt === undefined
          ? (room.serverTime - room.session.startedAt) / 1000
          : room.session.duration +
            (room.serverTime - room.session.clockAt) / 1000,
      receivedAt: (before + after) / 2,
      offset,
      finished: false,
      tracks: {},
      sources: ["game", "discord"],
      options,
      trackIds: { discord: randomUUID(), game: randomUUID() },
      uploaded: { discord: [], game: [] },
    };
    this.active = record;
    this.levels = { game: 0, discord: 0 };
    this.captureError = "";
    this.error = "";
    this.muted = false;
    await this.save(record);
    const directory = path.join(this.directory, record.id);
    const child = this.capture(
      this.executable,
      [
        "audio",
        directory,
        options.gameDeviceId,
        options.voiceDeviceId,
        String(options.microphoneStrip),
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout });
    let settled = false,
      stoppedResolve;
    this.stopped = new Promise((resolve) => {
      stoppedResolve = resolve;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.stdin.end();
        reject(
          new Error(
            "Windows hat die Audioquellen nicht rechtzeitig freigegeben.",
          ),
        );
      }, 15_000);
      const failure = (error) => {
        this.captureError = error.message;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      };
      child.on("error", failure);
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4096) stderr += chunk.toString("utf8");
      });
      lines.on("line", (line) => {
        if (line.length > 4096) return;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event.type === "ready" && Number.isFinite(event.startedAt)) {
          record.startedAt = event.startedAt;
          record.microphone = String(event.microphone || "").slice(0, 200);
          record.microphoneControl = !!event.microphoneControl;
          this.muted = !!event.muted;
          void this.save(record)
            .then(async () => {
              await this.register(record);
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve();
              }
            })
            .catch((error) => {
              child.stdin.end();
              failure(error);
            });
        } else if (event.type === "levels") {
          this.levels = {
            game: Math.max(0, Math.min(1, Number(event.game) || 0)),
            discord: Math.max(0, Math.min(1, Number(event.discord) || 0)),
          };
        } else if (event.type === "microphone") {
          this.muted = !!event.muted;
        } else if (event.type === "error") {
          this.captureError = String(
            event.message || "Die Tonaufnahme wurde unterbrochen.",
          ).slice(0, 500);
        } else if (event.type === "segment") void this.retry();
      });
      child.on("close", (code) => {
        if (code && stderr.trim())
          this.captureError = stderr.trim().slice(0, 500);
        lines.close();
        clearTimeout(timer);
        this.child = null;
        record.finished = true;
        void this.save(record).then(() => {
          stoppedResolve();
          void this.retry();
        });
        if (!settled)
          failure(
            new Error(
              stderr.trim() ||
                "Die Audioquellen konnten nicht geöffnet werden.",
            ),
          );
      });
    });
  }
  async register(record) {
    if (!record.startedAt) return;
    for (const source of recordSources(record))
      if (!record.tracks[source]) {
        (record.trackIds ||= {})[source] ||= randomUUID();
        await this.save(record);
        const result = await this.request(
          `/api/analysis/live/${record.sessionId}/tracks`,
          {
            method: "POST",
            body: JSON.stringify({
              id: record.trackIds[source],
              source,
              name:
                source === "discord"
                  ? "Kommunikation"
                  : source === "game"
                    ? "Spiel"
                    : record.microphone || "Mikrofon",
              mime: "audio/mp4",
              independent: true,
              start: Math.max(
                0,
                record.sessionBase === undefined
                  ? (record.startedAt +
                      record.offset -
                      record.sessionStartedAt) /
                      1000
                  : record.sessionBase +
                      (record.startedAt - record.receivedAt) / 1000,
              ),
            }),
          },
        );
        if (!validId(result.track?.id))
          throw new Error("Der Server hat die Tonspur nicht bestätigt.");
        record.tracks[source] = result.track.id;
        await this.save(record);
      }
  }
  mute(value) {
    if (!this.child || typeof value !== "boolean")
      throw new Error("Es läuft keine Tonaufnahme.");
    if (!this.active?.microphoneControl)
      throw new Error("Die Voicemeeter-Mikrofonsteuerung ist nicht aktiviert.");
    this.child.stdin.write(
      JSON.stringify({ action: "mute", muted: value }) + "\n",
    );
  }
  async stop(flush = true) {
    if (this.child) {
      this.child.stdin.write('{"action":"stop"}\n');
      this.child.stdin.end();
      await this.stopped;
    }
    if (flush) await this.retry();
  }
  async retry() {
    if (this.uploading) return this.uploading;
    this.uploading = this.upload()
      .catch((error) => {
        this.error = error.message;
      })
      .finally(() => {
        this.uploading = null;
      });
    return this.uploading;
  }
  async upload() {
    await mkdir(this.directory, { recursive: true });
    this.pending = 0;
    this.error = "";
    for (const id of await readdir(this.directory)) {
      if (!validId(id)) continue;
      const directory = path.join(this.directory, id);
      let record;
      try {
        record = JSON.parse(
          await readFile(path.join(directory, "recording.json"), "utf8"),
        );
      } catch {
        continue;
      }
      if (
        record.id !== id ||
        !validId(record.sessionId) ||
        !record.uploaded ||
        !record.tracks
      )
        continue;
      if (this.active?.id === id) record = this.active;
      const localFiles = await readdir(directory);
      for (const source of recordSources(record)) {
        const unsent = new Set(
          localFiles
            .filter((name) =>
              new RegExp(`^${source}-\\d+\\.(json|wav)$`).test(name),
            )
            .map((name) => Number(name.match(/-(\d+)/)[1]))
            .filter((sequence) => !record.uploaded[source].includes(sequence)),
        );
        this.pending += unsent.size;
      }
      let room;
      try {
        room = await this.request(
          `/api/analysis/live/${record.sessionId}/room`,
        );
      } catch (error) {
        if (
          [401, 403, 404].includes(error.status) &&
          this.child &&
          this.active?.id === id
        )
          await this.stop(false);
        throw error;
      }
      if (!room.canRecord || room.session.recorderId !== record.ownerId) {
        if (this.child && this.active?.id === id) await this.stop(false);
        continue;
      }
      if (
        this.child &&
        this.active?.id === id &&
        room.session.status !== "recording"
      )
        await this.stop(false);
      if (!this.child || this.active?.id !== id) {
        if (!record.finished) {
          record.finished = true;
          await this.save(record);
        }
        if (
          (await readdir(directory)).some((name) =>
            /^(game|discord|microphone)-\d+\.wav$/.test(name),
          )
        ) {
          await new Promise((resolve, reject) => {
            const recovery = this.capture(
              this.executable,
              ["audio-recover", directory],
              { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
            );
            recovery.on("error", reject);
            recovery.on("close", (code) =>
              code === 0
                ? resolve()
                : reject(
                    new Error(
                      "Lokale Audiosegmente konnten noch nicht wiederhergestellt werden.",
                    ),
                  ),
            );
          });
        }
      }
      await this.register(record);
      const files = await readdir(directory);
      let complete = record.finished;
      if (
        files.some((name) => /^(game|discord|microphone)-\d+\.wav$/.test(name))
      )
        complete = false;
      for (const source of recordSources(record)) {
        const segments = files
          .filter((name) => new RegExp(`^${source}-\\d+\\.json$`).test(name))
          .sort(
            (a, b) =>
              Number(a.match(/-(\d+)/)[1]) - Number(b.match(/-(\d+)/)[1]),
          );
        for (const file of segments) {
          const segment = JSON.parse(
            await readFile(path.join(directory, file), "utf8"),
          );
          if (
            segment.source !== source ||
            !Number.isInteger(segment.sequence) ||
            segment.sequence < 0 ||
            segment.sequence >= 2000
          )
            throw new Error(
              "Ein lokal gespeichertes Audiosegment ist ungültig.",
            );
          if (record.uploaded[source].includes(segment.sequence)) continue;
          const body = await readFile(
            path.join(directory, `${source}-${segment.sequence}.m4a`),
          );
          if (body.length > 16 * 1024 * 1024)
            throw new Error(
              "Das lokale Audiosegment überschreitet das Uploadlimit.",
            );
          await this.request(
            `/api/analysis/audio/${record.tracks[source]}/segments/${segment.sequence}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body,
            },
          );
          record.uploaded[source].push(segment.sequence);
          await this.save(record);
          this.pending--;
          // Local files remain until the server confirms a finished, playable track.
        }
        if (complete && segments.length)
          await this.request(
            `/api/analysis/audio/${record.tracks[source]}/finish`,
            { method: "POST" },
          );
        else complete = false;
      }
      if (complete) {
        await rm(directory, { recursive: true, force: true });
        if (this.active?.id === id && !this.child) this.active = null;
      }
    }
  }
}
