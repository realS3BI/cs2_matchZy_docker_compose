import { api } from "./api";
import { serverNow } from "./live";
import { sessionTime, type LiveSession } from "../../../shared/recordings";

type PendingSegment = {
  key: string;
  trackId: string;
  sequence: number;
  ownerId: string;
  blob: Blob;
};
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("playbook-live-audio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("segments", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Audio konnte nicht lokal gesichert werden."));
  });
}
async function stored(
  operation: "put" | "delete" | "getAll",
  value?: any,
): Promise<any> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
          "segments",
          operation === "getAll" ? "readonly" : "readwrite",
        ),
        store = transaction.objectStore("segments");
      const request =
        operation === "getAll"
          ? store.getAll()
          : operation === "put"
            ? store.put(value)
            : store.delete(value);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () =>
        reject(
          new Error("Der lokale Audiospeicher ist nicht verfügbar oder voll."),
        );
    });
  } finally {
    db.close();
  }
}
export async function uploadAudioFile(
  sessionId: string,
  file: File,
  start = 0,
  source: "file" | "game" | "discord" = "file",
) {
  if (file.size > 512 * 1024 * 1024)
    throw new Error("Die Audiodatei darf höchstens 512 MiB groß sein.");
  const mime = file.name.match(/\.m4a$|\.mp4$/i)
    ? "audio/mp4"
    : file.name.match(/\.wav$/i)
      ? "audio/wav"
      : file.name.match(/\.mp3$/i)
        ? "audio/mpeg"
        : file.name.match(/\.ogg$|\.opus$/i)
          ? "audio/ogg"
          : "audio/webm";
  const { track } = await api(`/api/analysis/live/${sessionId}/tracks`, {
    method: "POST",
    body: JSON.stringify({
      source,
      name: file.name.slice(0, 120),
      mime,
      start,
    }),
  });
  for (
    let offset = 0, sequence = 0;
    offset < file.size;
    offset += 8 * 1024 * 1024, sequence++
  ) {
    await api(`/api/analysis/audio/${track.id}/segments/${sequence}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.slice(offset, offset + 8 * 1024 * 1024),
    });
  }
  await api(`/api/analysis/audio/${track.id}/finish`, { method: "POST" });
  return track.id;
}

class BrowserAudio {
  recorder: MediaRecorder | null = null;
  stream: MediaStream | null = null;
  trackId = "";
  sessionId = "";
  ownerId = "";
  sequence = 0;
  muted = false;
  error = "";
  pending = 0;
  private writes: Promise<any> = Promise.resolve();
  private uploading: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  notify() {
    this.listeners.forEach((callback) => callback());
  }
  async start(sessionId: string, ownerId: string, session: LiveSession) {
    if (this.recorder) throw new Error("Eine Mikrofonaufnahme läuft bereits.");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw new Error(
        "Dieser Browser unterstützt keine Mikrofonaufnahme. Verwende die Desktop-App oder eine Audiodatei.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    try {
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("Kein unterstützter Audiocodec gefunden.");
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 64_000,
      });
      const { track } = await api(`/api/analysis/live/${sessionId}/tracks`, {
        method: "POST",
        body: JSON.stringify({
          source: "microphone",
          name: "Mikrofon",
          mime: mime.split(";")[0],
          start: sessionTime(session, serverNow()),
        }),
      });
      this.stream = stream;
      this.recorder = recorder;
      this.trackId = track.id;
      this.sessionId = sessionId;
      this.ownerId = ownerId;
      this.sequence = 0;
      this.error = "";
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const sequence = this.sequence++,
          value: PendingSegment = {
            key: `${track.id}:${sequence}`,
            trackId: track.id,
            sequence,
            ownerId,
            blob: event.data,
          };
        this.writes = this.writes
          .then(() => stored("put", value))
          .then(() => {
            this.pending++;
            this.notify();
            void this.retry(ownerId);
          })
          .catch((error) => {
            this.error = error.message;
            if (recorder.state !== "inactive") recorder.stop();
            this.notify();
          });
      };
      recorder.onerror = () => {
        this.error =
          "Die Mikrofonaufnahme wurde unterbrochen. Bereits gesicherte Segmente bleiben erhalten.";
        this.notify();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.recorder = null;
        this.stream = null;
        this.notify();
      };
      stream.getAudioTracks()[0].onended = () => {
        if (recorder.state !== "inactive") recorder.stop();
        this.error =
          "Die Mikrofonquelle wurde getrennt. Stelle die gesicherten Segmente fertig.";
        this.notify();
      };
      recorder.start(2000);
      this.notify();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }
  mute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !this.muted;
    });
    this.notify();
  }
  async stop(finalize = true) {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive")
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    await this.writes;
    if (!finalize) return;
    await this.retry(this.ownerId);
    if (
      (await stored("getAll")).some(
        (segment: PendingSegment) => segment.trackId === this.trackId,
      )
    )
      throw new Error(
        "Audiosegmente warten noch auf den Upload. Stelle die Tonspur nach dem Wiederverbinden fertig.",
      );
    if (this.trackId)
      await api(`/api/analysis/audio/${this.trackId}/finish`, {
        method: "POST",
      });
    this.notify();
  }
  async retry(ownerId: string) {
    if (this.uploading) return this.uploading;
    this.uploading = this.upload(ownerId).finally(() => {
      this.uploading = null;
    });
    return this.uploading;
  }
  private async upload(ownerId: string) {
    try {
      const segments: PendingSegment[] = (await stored("getAll"))
        .filter((segment) => segment.ownerId === ownerId)
        .sort(
          (a, b) =>
            a.trackId.localeCompare(b.trackId) || a.sequence - b.sequence,
        );
      this.pending = segments.length;
      for (const segment of segments) {
        await api(
          `/api/analysis/audio/${segment.trackId}/segments/${segment.sequence}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: segment.blob,
          },
        );
        await stored("delete", segment.key);
        this.pending--;
        this.notify();
      }
      this.error = "";
    } catch (error) {
      this.error = `Audio ist lokal gesichert. ${error.message}`;
    } finally {
      this.notify();
    }
  }
}
export const browserAudio = new BrowserAudio();
setInterval(() => {
  if (!browserAudio.recorder || !browserAudio.sessionId) return;
  void api(`/api/analysis/live/${browserAudio.sessionId}/room`)
    .then((room) => {
      if (room.session.status !== "recording" || !room.canRecord)
        return browserAudio.stop();
    })
    .catch((error) => {
      if ([401, 403, 404].includes(error.status))
        void browserAudio.stop().catch(() => {});
    });
}, 5000);
window.addEventListener("online", () => {
  if (browserAudio.ownerId) void browserAudio.retry(browserAudio.ownerId);
});
window.addEventListener("beforeunload", (event) => {
  if (browserAudio.recorder) {
    event.preventDefault();
    event.returnValue = "";
  }
});
