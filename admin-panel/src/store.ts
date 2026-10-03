import { assignNadeIds } from "./nade-ids.js";
import { Collection, Db, MongoClient } from "mongodb";
import { sanitizeAdmins, sanitizeNades, sanitizeSettings } from "./validators.js";
import { normalizeSettings, migrateAdmins } from "./policy.js";
import { NadeEvents } from "./nade-events.js";

type UserDocument = {
  _id: string;
  identitySteam64?: string;
  name?: string;
  role?: string;
  flags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  nadeFavorites?: { owner: string; map: string; name: string }[];
};

export class Store {
  readonly nadeEvents = new NadeEvents();
  config: any;
  client: MongoClient;
  db!: Db;
  settings!: Collection<any>;
  admins!: Collection<any>;
  nades!: Collection<any>;
  actions!: Collection<any>;
  maintenance!: Collection<any>;
  users!: Collection<UserDocument>;
  sessions!: Collection<any>;

  constructor(config) {
    this.config = config;
    this.client = new MongoClient(config.mongodbUri);
  }

  async connect() {
    await this.client.connect();
    this.db = this.client.db(this.config.mongoDbName);
    this.settings = this.db.collection("settings");
    this.admins = this.db.collection("admins");
    this.nades = this.db.collection("nades");
    this.actions = this.db.collection("actions");
    this.maintenance = this.db.collection("maintenance");
    this.users = this.db.collection<UserDocument>("users");
    this.sessions = this.db.collection("sessions");
    await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const legacy = await this.admins.findOne({ _id: "current" });
    for (const entry of sanitizeAdmins(migrateAdmins(legacy?.entries || []))) {
      await this.users.updateOne({ _id: entry.identitySteam64 }, { $setOnInsert: { ...entry, createdAt: new Date() } }, { upsert: true });
    }
    if (this.config.bootstrapAdminSteamId) {
      if (!/^[0-9]{17}$/.test(this.config.bootstrapAdminSteamId)) throw new Error("Ungültige ADMIN_PANEL_ADMIN_STEAM_ID.");
      await this.users.updateOne({ _id: this.config.bootstrapAdminSteamId }, {
        $setOnInsert: { identitySteam64: this.config.bootstrapAdminSteamId, name: "", role: "admin", createdAt: new Date() }
      }, { upsert: true });
      if (this.config.promoteBootstrapAdmin) {
        await this.users.updateOne({ _id: this.config.bootstrapAdminSteamId }, { $set: { role: "admin" } });
      }
    }
    await this.actions.createIndex({ createdAt: -1 });
    await this.maintenance.updateOne(
      { _id: "scheduled-restart" },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    const current = await this.settings.findOne({ _id: "current" });
    if (!current?.settings || current.settings.schemaVersion !== 1) {
      await this.settings.replaceOne(
        { _id: "current" },
        { _id: "current", settings: normalizeSettings({}), createdAt: new Date() },
        { upsert: true }
      );
    } else if (current.settings.serverMode === "executes" || Object.prototype.hasOwnProperty.call(current.settings, "executesVersion")) {
      await this.settings.updateOne(
        { _id: "current" },
        { $set: { settings: normalizeSettings(current.settings), updatedAt: new Date() } }
      );
    }
    await this.migrateNadeIds();
  }

  async migrateNadeIds() {
    for (;;) {
      const document = await this.nades.findOne({ _id: "current" });
      if (!document?.entries) return;
      const entries = assignNadeIds(document.entries);
      if (entries.every((entry, index) => entry.id === document.entries[index].id)) return;
      await this.nades.updateOne(
        { _id: "before-short-ids-v1" },
        { $setOnInsert: { entries: document.entries, updatedAt: document.updatedAt, backedUpAt: new Date() } },
        { upsert: true }
      );
      const result = await this.nades.updateOne(
        { _id: "current", entries: document.entries },
        { $set: { entries, idSchemaVersion: 1 } }
      );
      if (result.matchedCount) return;
    }
  }

  async close() {
    await this.client.close();
  }

  async getSettings() {
    const doc = await this.settings.findOne({ _id: "current" });
    if (doc?.settings) return normalizeSettings(doc.settings);
    return normalizeSettings({});
  }

  async saveSettings(settings) {
    const cleanSettings = normalizeSettings(sanitizeSettings(settings));
    await this.settings.updateOne(
      { _id: "current" },
      { $set: { settings: cleanSettings, updatedAt: new Date() } },
      { upsert: true }
    );
    await this.logAction("save", "success", "Settings saved");
    return cleanSettings;
  }

  async getAdmins() {
    return sanitizeAdmins(await this.users.find({}).sort({ createdAt: 1 }).toArray());
  }

  async getUser(steamId) {
    const user = await this.users.findOne({ _id: steamId });
    return user ? { ...sanitizeAdmins([user])[0], lastLoginAt: user.lastLoginAt || null } : null;
  }

  async recordLogin(steamId) {
    await this.users.updateOne({ _id: steamId }, {
      $setOnInsert: { identitySteam64: steamId, name: "", role: "player", createdAt: new Date() },
      $set: { lastLoginAt: new Date() }
    }, { upsert: true });
  }

  async recordTestLogin(steamId: string, name: string) {
    await this.users.updateOne({ _id: steamId }, {
      $setOnInsert: { identitySteam64: steamId, createdAt: new Date() },
      $set: { name, role: "player", flags: [], lastLoginAt: new Date() }
    }, { upsert: true });
  }

  async getNadeFavorites(steamId) {
    const user = await this.users.findOne({ _id: steamId }, { projection: { nadeFavorites: 1 } });
    return user?.nadeFavorites || [];
  }

  async setNadeFavorite(steamId, reference, favorite) {
    await this.users.updateOne({ _id: steamId }, favorite
      ? { $addToSet: { nadeFavorites: reference } }
      : { $pull: { nadeFavorites: reference } });
    return this.getNadeFavorites(steamId);
  }

  async saveUser(entry) {
    const clean = sanitizeAdmins([entry])[0];
    await this.users.updateOne({ _id: clean.identitySteam64 }, {
      $set: { ...clean, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() }
    }, { upsert: true });
    return clean;
  }

  async createSession(id, value) { await this.sessions.insertOne({ _id: id, ...value }); }
  async getSession(id) { return this.sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } }); }
  async consumeSession(id, purpose) { return this.sessions.findOneAndDelete({ _id: id, purpose, expiresAt: { $gt: new Date() } }); }
  async deleteSession(id) { await this.sessions.deleteOne({ _id: id }); }

  async ensureScheduledRestart(nextRunAt) {
    await this.maintenance.updateOne(
      { _id: "scheduled-restart", nextRunAt: { $exists: false } },
      { $set: { nextRunAt } }
    );
    return this.getMaintenanceState();
  }

  async claimScheduledRestart(slot, now = new Date()) {
    const result = await this.maintenance.findOneAndUpdate(
      { _id: "scheduled-restart", nextRunAt: slot, lastClaimedSlot: { $ne: slot } },
      { $set: { lastClaimedSlot: slot, claimedAt: now, state: "running", nextRunAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString() } },
      { returnDocument: "after" }
    );
    return Boolean(result);
  }

  async completeScheduledRestart(slot, result) {
    await this.maintenance.updateOne(
      { _id: "scheduled-restart", lastClaimedSlot: slot },
      { $set: { state: result.state || (result.ok ? "success" : "failed"), nextRunAt: result.nextRunAt, lastRunAt: new Date(), lastMessage: String(result.message || "") } }
    );
  }

  async getMaintenanceState() {
    return await this.maintenance.findOne({ _id: "scheduled-restart" });
  }

  async getNades() {
    const doc = await this.nades.findOne({ _id: "current" });
    return doc?.entries || [];
  }

  async getNadesDocument() {
    return await this.nades.findOne({ _id: "current" });
  }

  async saveNades(entries) {
    const cleanEntries = sanitizeNades(entries);
    await this.nades.updateOne(
      { _id: "current" },
      { $set: { entries: cleanEntries, updatedAt: new Date() } },
      { upsert: true }
    );
    await this.logAction("save", "success", "Nades saved");
    this.nadeEvents.publish(cleanEntries);
    return cleanEntries;
  }

  async replaceNadesFromSync(entries, details = {}) {
    const cleanEntries = sanitizeNades(entries);
    await this.nades.updateOne(
      { _id: "current" },
      { $set: { entries: cleanEntries, updatedAt: new Date() } },
      { upsert: true }
    );
    await this.logAction("nades_sync", "success", "Nades imported from MatchZy savednades.json", details);
    this.nadeEvents.publish(cleanEntries);
    return cleanEntries;
  }

  async logAction(type, status, message, details = {}) {
    await this.actions.insertOne({
      type,
      status,
      message: String(message || ""),
      details,
      createdAt: new Date()
    });
  }

  async getLastAction(types = []) {
    const query = types.length > 0 ? { type: { $in: types } } : {};
    return this.actions.find(query).sort({ createdAt: -1 }).limit(1).next();
  }

}
