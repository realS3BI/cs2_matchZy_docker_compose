import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { reviewEntry } from "./review-media.js";
import { isReviewSlot } from "../shared/review-media.js";

const leaseMs = 90_000;
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
async function read(path: string) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function write(path: string, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}

// Files bridge the existing shared CS2 volume. Only the authenticated admin's
// browser can lease, poll and acknowledge that admin's capture session.
export class ReviewCaptureBridge {
  private queues = new Map<string, Promise<unknown>>();
  constructor(private directory: string) {}
  private path(actor: string, file: string) {
    if (!/^\d{17}$/.test(actor)) fail(403, "Ungültiger Benutzer.");
    return join(this.directory, actor, `${file}.json`);
  }
  async exclusive<T>(actor: string, operation: () => Promise<T>): Promise<T> {
    const pending = (this.queues.get(actor) || Promise.resolve()).then(operation);
    const settled = pending.catch(() => {});
    this.queues.set(actor, settled);
    try { return await pending; }
    finally { if (this.queues.get(actor) === settled) this.queues.delete(actor); }
  }
  async start(actor: string, reference, now = Date.now()) {
    return this.exclusive(actor, async () => {
      const previous = await read(this.path(actor, "session"));
      if (previous?.expiresAt > now) fail(409, "Eine Aufnahme ist bereits in einem anderen Tab verbunden. Dort beenden oder 90 Sekunden warten.");
      const { owner, map, name } = reference;
      const session = { id: randomUUID(), actor, owner, map, name, expiresAt: now + leaseMs };
      await write(this.path(actor, "session"), session);
      return session;
    });
  }
  async session(actor: string, id: string, now = Date.now()) {
    const session = await read(this.path(actor, "session"));
    if (!id || session?.id !== id || session.expiresAt <= now) fail(409, "Die Ingame-Verbindung ist abgelaufen. Bildschirm erneut verbinden.");
    return session;
  }
  async poll(actor: string, id: string, validate: (reference) => Promise<void>, now = Date.now()) {
    return this.exclusive(actor, async () => {
      const session = await this.session(actor, id, now);
      await validate(session);
      await write(this.path(actor, "session"), { ...session, expiresAt: now + leaseMs });
      const command = await read(this.path(actor, "command"));
      const result = await read(this.path(actor, "result"));
      if (!command || command.sessionId !== id || result?.commandId === command.id ||
          !/^[a-f0-9]{32}$/.test(command.id) || command.expiresAt <= now || command.notBefore > now ||
          !Number.isFinite(command.expiresAt) || !Number.isFinite(command.notBefore) ||
          !["photo", "video-start", "video-stop"].includes(command.action) ||
          (command.action === "photo" && (!isReviewSlot(command.slot) || command.slot === "video"))) return null;
      return { id: command.id, action: command.action, slot: command.slot };
    });
  }
  async acknowledge(actor: string, input, now = Date.now()) {
    return this.exclusive(actor, async () => {
      await this.session(actor, input.sessionId, now);
      const command = await read(this.path(actor, "command"));
      if (command?.id !== input.commandId || command.sessionId !== input.sessionId) fail(409, "Die Aufnahme-Anfrage ist nicht mehr aktuell.");
      await write(this.path(actor, "result"), { sessionId: input.sessionId, commandId: command.id, ok: input.ok === true,
        message: input.ok === true ? command.action === "video-start" ? "Videoaufnahme läuft. Zum Beenden das Review-Panel öffnen." : "Aufnahme hochgeladen und dem Review zugeordnet." : "Aufnahme fehlgeschlagen. Bitte die Meldung im Browser prüfen.",
      });
    });
  }
  async stop(actor: string, id: string) {
    return this.exclusive(actor, async () => {
      const session = await read(this.path(actor, "session"));
      if (session?.id === id) await write(this.path(actor, "session"), { ...session, expiresAt: 0 });
    });
  }
}

export function installReviewCapture(app, { config, store }) {
  const bridge = config.liveMatchZyNadesFile ? new ReviewCaptureBridge(join(dirname(config.liveMatchZyNadesFile), "savednades.review")) : null;
  const route = (path, handler) => app.post(`/api/nades/review/capture/${path}`, async (req, res) => {
    try {
      if (res.locals.user.role !== "admin") return res.status(403).json({ error: "Ingame-Aufnahmen sind nur für Plattform-Admins verfügbar." });
      if (!config.uploadthingToken) return res.status(503).json({ error: "UploadThing ist noch nicht eingerichtet." });
      if (!bridge) return res.status(503).json({ error: "Die Verbindung zum Spielserver ist nicht eingerichtet." });
      res.json(await handler(req.body, res.locals.user));
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "Die Verbindung zum Spielserver konnte nicht hergestellt werden." }); }
  });
  route("start", async (input, user) => {
    const entry = reviewEntry(await store.getNades(), input, user);
    return { session: await bridge.start(user.identitySteam64, entry) };
  });
  route("poll", async (input, user) => ({ command: await bridge.poll(user.identitySteam64, input?.sessionId, async reference => {
    reviewEntry(await store.getNades(), reference, user);
  }) }));
  route("ack", async (input, user) => { await bridge.acknowledge(user.identitySteam64, input); return { ok: true }; });
  route("stop", async (input, user) => { await bridge.stop(user.identitySteam64, input?.sessionId); return { ok: true }; });
}
