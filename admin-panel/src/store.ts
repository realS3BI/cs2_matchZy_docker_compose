import { Collection, Db, MongoClient } from "mongodb";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "./env-file.js";
import { sanitizeAdmins, sanitizeEnv, sanitizeNades } from "./validators.js";
import { normalizeServerSettings } from "./policy.js";

async function loadRuntimeAdmins(path, legacyAdmins = "") {
  try {
    const config = JSON.parse(await readFile(path, "utf8"));
    const entries = sanitizeAdmins(Object.entries(config).map(([identitySteam64, entry]: [string, any]) => ({
      name: String(entry?.name || "Imported admin"),
      identitySteam64: String(entry?.identity || identitySteam64),
      flags: Array.isArray(entry?.flags) ? entry.flags : ["@css/root"]
    })));
    if (entries.length > 0) return entries;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const identities = [...new Set(String(legacyAdmins).split(",").map((value) => value.trim()).filter((value) => /^[0-9]{17}$/.test(value)))];
  return sanitizeAdmins(identities.map((identitySteam64) => ({
    name: "Imported admin",
    identitySteam64,
    role: "owner"
  })));
}

export class Store {
  config: any;
  client: MongoClient;
  db!: Db;
  settings!: Collection<any>;
  admins!: Collection<any>;
  nades!: Collection<any>;
  actions!: Collection<any>;
  maintenance!: Collection<any>;

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
    await this.actions.createIndex({ createdAt: -1 });
    await this.maintenance.updateOne(
      { _id: "scheduled-restart" },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    const runtimeEnv: Record<string, any> = await loadEnvFile(this.config.runtimeEnvFile);
    await this.settings.updateOne(
      { _id: "current" },
      { $setOnInsert: { env: normalizeServerSettings(runtimeEnv), createdAt: new Date() } },
      { upsert: true }
    );
    if (!(await this.admins.findOne({ _id: "current" }))) {
      const entries = await loadRuntimeAdmins(this.config.runtimeAdminsFile, runtimeEnv.ADMINS);
      if (entries.length > 0) {
        await this.admins.insertOne({ _id: "current", entries, createdAt: new Date(), migratedFrom: "runtime" });
        await this.logAction("admin_migration", "success", `Imported ${entries.length} admin${entries.length === 1 ? "" : "s"} from the runtime volume`);
      }
    }
  }

  async close() {
    await this.client.close();
  }

  async getSettings() {
    const doc = await this.settings.findOne({ _id: "current" });
    if (doc?.env) return normalizeServerSettings(doc.env);
    return normalizeServerSettings({});
  }

  async saveSettings(env) {
    const cleanEnv = normalizeServerSettings(sanitizeEnv(env));
    await this.settings.updateOne(
      { _id: "current" },
      { $set: { env: cleanEnv, updatedAt: new Date() } },
      { upsert: true }
    );
    await this.logAction("save", "success", "Settings saved");
    return cleanEnv;
  }

  async getAdmins() {
    const doc = await this.admins.findOne({ _id: "current" });
    return sanitizeAdmins(doc?.entries || []);
  }

  async saveAdmins(entries) {
    const cleanEntries = sanitizeAdmins(entries);
    await this.admins.updateOne(
      { _id: "current" },
      { $set: { entries: cleanEntries, updatedAt: new Date() } },
      { upsert: true }
    );
    await this.logAction("save", "success", "Admins saved");
    return cleanEntries;
  }

  async claimScheduledRestart(slot) {
    const result = await this.maintenance.findOneAndUpdate(
      { _id: "scheduled-restart", lastClaimedSlot: { $ne: slot } },
      { $set: { lastClaimedSlot: slot, claimedAt: new Date(), state: "running" } },
      { returnDocument: "after" }
    );
    return Boolean(result);
  }

  async completeScheduledRestart(slot, result) {
    await this.maintenance.updateOne(
      { _id: "scheduled-restart", lastClaimedSlot: slot },
      { $set: { state: result.ok ? "success" : "failed", lastRunAt: new Date(), lastMessage: String(result.message || "") } }
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
