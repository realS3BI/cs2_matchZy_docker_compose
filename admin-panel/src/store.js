import { MongoClient } from "mongodb";
import { loadEnvFile } from "./env-file.js";
import { SERVER_ENV_KEYS } from "./defaults.js";
import { sanitizeAdmins, sanitizeEnv, sanitizeNades } from "./validators.js";

function currentProcessEnv() {
  const env = {};
  for (const key of SERVER_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
}

export class Store {
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
    await this.actions.createIndex({ createdAt: -1 });
  }

  async close() {
    await this.client.close();
  }

  async getSettings() {
    const doc = await this.settings.findOne({ _id: "current" });
    if (doc?.env) return doc.env;
    if (this.config.envFile) {
      const fileEnv = await loadEnvFile(this.config.envFile);
      if (Object.keys(fileEnv).length > 0) return fileEnv;
    }
    return currentProcessEnv();
  }

  async saveSettings(env) {
    const cleanEnv = sanitizeEnv(env);
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
    return doc?.entries || [];
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
