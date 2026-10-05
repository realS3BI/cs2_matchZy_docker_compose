import { isPlatformAdmin } from "../shared/authorization.js";
import { randomUUID } from "node:crypto";
import { chmod, chown, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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
  await chmod(temporary, 0o644);
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
  private async prepareDirectory(actor: string) {
    const folder = dirname(this.path(actor, "session"));
    await mkdir(folder, { recursive: true });
    // The webpanel runs as root, CS2 as steam. Inherit the game directory's
    // owner so the plugin can atomically create command.json in its session.
    // Also repair directories made by older webpanel versions on the next poll.
    if (process.getuid?.() === 0) {
      const owner = await stat(dirname(this.directory));
      for (const path of [this.directory, folder]) {
        await chown(path, owner.uid, owner.gid);
        await chmod(path, 0o755);
      }
    }
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
      await this.prepareDirectory(actor);
      const previous = await read(this.path(actor, "session"));
      if (previous?.expiresAt > now) fail(409, "Eine Aufnahme ist bereits in einem anderen Tab verbunden. Dort beenden oder 90 Sekunden warten.");
      const { owner = "", map = "", name = "", followPanel = false } = reference;
      const session = { id: randomUUID(), actor, owner, map, name, followPanel, expiresAt: now + leaseMs };
      await write(this.path(actor, "session"), session);
      return session;
    });
  }
  async session(actor: string, id: string, now = Date.now()) {
    const session = await read(this.path(actor, "session"));
    if (!id || session?.id !== id || session.actor !== actor || session.expiresAt <= now) fail(409, "Die Ingame-Verbindung ist abgelaufen. Spielbild erneut verbinden.");
    return session;
  }
  async poll(actor: string, id: string, validate: (reference) => Promise<void>, now = Date.now(), recording = false) {
    return this.exclusive(actor, async () => {
      const session = await this.session(actor, id, now);
      if (!session.followPanel) await validate(session);
      await this.prepareDirectory(actor);
      await write(this.path(actor, "session"), { ...session, recording, expiresAt: now + leaseMs });
      const command = await read(this.path(actor, "command"));
      const result = await read(this.path(actor, "result"));
      const captured = await read(this.path(actor, "captured"));
      const request = await read(this.path(actor, "request"));
      const requestResult = await read(this.path(actor, "request-result"));
      if (request?.sessionId === id && request.expiresAt > now && requestResult?.sessionId === id && requestResult.commandId === request.id)
        return { id: request.id, action: "error", message: String(requestResult.message || "Die Aufnahme-Vorbereitung ist fehlgeschlagen.").slice(0, 300) };
      if (command?.sessionId === id && command.action === "photo" && result?.sessionId === id && result.commandId === command.id && result.ok === false)
        return { id: command.id, action: "error", message: String(result.message || "Foto abgebrochen. Bitte erneut aufnehmen.").slice(0, 300) };
      if (!command || command.sessionId !== id || result?.commandId === command.id ||
          captured?.sessionId === id && captured.commandId === command.id ||
          !/^[a-f0-9]{32}$/.test(command.id) || command.expiresAt <= now || command.notBefore > now ||
          !Number.isFinite(command.expiresAt) || !Number.isFinite(command.notBefore) ||
          !["photo", "video-start", "video-stop"].includes(command.action) ||
          (command.action === "photo" && (!isReviewSlot(command.slot) || command.slot === "video"))) return null;
      const reference = { owner: command.owner, map: command.map, name: command.name };
      if (session.followPanel) await validate(reference);
      return { id: command.id, action: command.action, slot: command.slot,
        ...(session.followPanel ? { reference } : {}),
        ...(command.slot === "front" && command.presentation === "review-v6" && Number.isFinite(command.cameraPitch) && Math.abs(command.cameraPitch) <= 89 ? { cameraPitch: command.cameraPitch } : {}),
        ...(["review-v2", "review-v3", "review-v4", "review-v5", "review-v6"].includes(command.presentation) ? { presentation: command.presentation } : {}) };
    });
  }
  async selection(actor: string, id: string, now = Date.now()) {
    await this.session(actor, id, now);
    const selection = await read(this.path(actor, "selection"));
    if (selection?.sessionId !== id || selection.actor !== actor || !["overview", "aim", "position", "front", "effect", "video", "details", "finish"].includes(selection.step) ||
        ![selection.owner, selection.map, selection.name].every(value => typeof value === "string" && value.length > 0 && value.length <= 500)) return null;
    return selection;
  }
  async requestPhoto(actor: string, id: string, slot: unknown, now = Date.now()) {
    return this.requestCapture(actor, id, "photo", slot, now);
  }
  async requestVideo(actor: string, id: string, action: unknown, now = Date.now()) {
    return this.requestCapture(actor, id, action, "video", now);
  }
  private async requestCapture(actor: string, id: string, action: unknown, slot: unknown, now: number) {
    return this.exclusive(actor, async () => {
      const session = await this.session(actor, id, now);
      if (action === "photo" ? !isReviewSlot(slot) || slot === "video" : !["video-start", "video-stop"].includes(String(action)) || slot !== "video") fail(400, "Ungültiger Aufnahmeschritt.");
      const request = await read(this.path(actor, "request"));
      const result = await read(this.path(actor, "result"));
      const requestResult = await read(this.path(actor, "request-result"));
      if (request?.sessionId === id && request.expiresAt > now && result?.commandId !== request.id && requestResult?.commandId !== request.id)
        fail(409, "Die vorige Aufnahme-Anfrage läuft noch.");
      const video = action === "video-stop" ? await read(this.path(actor, "command")) : null;
      const reference = session.followPanel
        ? video?.sessionId === id && video.action === "video-start" ? video : await this.selection(actor, id, now)
        : session;
      if (!reference) fail(409, "Bitte zuerst im Ingame-Panel ein Medien-Review öffnen.");
      const next = { id: randomUUID().replaceAll("-", ""), sessionId: id, action, slot,
        owner: reference.owner, map: reference.map, name: reference.name, expiresAt: now + 30_000 };
      await write(this.path(actor, "request"), next);
      return next;
    });
  }
  async captured(actor: string, input, now = Date.now()) {
    return this.exclusive(actor, async () => {
      await this.session(actor, input?.sessionId, now);
      const command = await read(this.path(actor, "command"));
      const result = await read(this.path(actor, "result"));
      if (!input?.commandId || command?.id !== input.commandId || command.sessionId !== input.sessionId || !["photo", "video-start", "video-stop"].includes(command.action) || (command.action !== "video-start" && command.expiresAt <= now) ||
          result?.sessionId === input.sessionId && result.commandId === command.id && result.ok === false)
        fail(409, "Die Aufnahme-Anfrage ist nicht mehr aktuell.");
      await write(this.path(actor, "captured"), { sessionId: input.sessionId, commandId: command.id });
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
      if (!isPlatformAdmin(res.locals.user)) return res.status(403).json({ error: "Ingame-Aufnahmen sind nur für Plattform-Admins verfügbar." });
      if (!config.uploadthingToken) return res.status(503).json({ error: "UploadThing ist noch nicht eingerichtet." });
      if (!bridge) return res.status(503).json({ error: "Die Verbindung zum Spielserver ist nicht eingerichtet." });
      res.json(await handler(req.body, res.locals.user));
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "Die Verbindung zum Spielserver konnte nicht hergestellt werden." }); }
  });
  route("start", async (input, user) => {
    const entry = input?.followPanel === true ? { followPanel: true } : reviewEntry(await store.getNades(), input, user);
    return { session: await bridge.start(user.identitySteam64, entry) };
  });
  route("poll", async (input, user) => {
    const entries = await store.getNades();
    const command = await bridge.poll(user.identitySteam64, input?.sessionId, async reference => { reviewEntry(entries, reference, user); }, Date.now(), input?.recording === true);
    const selected = await bridge.selection(user.identitySteam64, input?.sessionId);
    const nade = selected && entries.find(entry => entry.owner === selected.owner && entry.map === selected.map && entry.name === selected.name);
    return { command: command && "reference" in command && command.reference ? { ...command, nade: reviewEntry(entries, command.reference, user) } : command,
      selection: nade ? { ...selected, nade } : null };
  });
  route("ack", async (input, user) => { await bridge.acknowledge(user.identitySteam64, input); return { ok: true }; });
  route("photo", async (input, user) => ({ request: await bridge.requestPhoto(user.identitySteam64, input?.sessionId, input?.slot) }));
  route("video", async (input, user) => ({ request: await bridge.requestVideo(user.identitySteam64, input?.sessionId, input?.action) }));
  route("captured", async (input, user) => { await bridge.captured(user.identitySteam64, input); return { ok: true }; });
  route("stop", async (input, user) => { await bridge.stop(user.identitySteam64, input?.sessionId); return { ok: true }; });
}
