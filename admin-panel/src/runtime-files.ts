import { BUILT_IN_MAPS } from "../client/src/lib/maps.js";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { normalizeSettings } from "./policy.js";
import {
  sanitizeAdmins,
  adminsToCssConfig,
  adminsToMatchZyConfig,
  nadesToMatchZySavedNadesConfig
} from "./validators.js";

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

const adminWrites = new Map<string, Promise<void>>();

export async function writeAdminRuntimeFiles(config, admins) {
  const key = config.runtimeAdminsFile;
  // Read current roles inside the queue so a concurrent apply/restart cannot
  // republish permissions captured before a user's demotion.
  const write = (adminWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const entries = sanitizeAdmins(typeof admins === "function" ? await admins() : admins);
    await writeJsonFile(`${dirname(key)}/platform-roles.json`, Object.fromEntries(entries.map(user => [user.identitySteam64, user.role])));
    await writeJsonFile(key, adminsToCssConfig(entries));
    await writeJsonFile(config.runtimeMatchZyAdminsFile, adminsToMatchZyConfig(entries));
  });
  adminWrites.set(key, write);
  try { await write; } finally { if (adminWrites.get(key) === write) adminWrites.delete(key); }
}

export async function writeServerRuntimeFiles(config, nadesSync, settings, admins, nades) {
  await mkdir(dirname(config.runtimeSettingsFile), { recursive: true });
  await writeAdminRuntimeFiles(config, admins);
  await writeJsonFile(config.runtimeMatchZyNadesFile, nadesToMatchZySavedNadesConfig(nades));
  await nadesSync?.writeFromMongo(nades);
  await writeJsonFile(config.runtimeSettingsFile, normalizeSettings(settings));
  await writeJsonFile(`${dirname(config.runtimeSettingsFile)}/map-catalog.json`, BUILT_IN_MAPS.map(m => ({ mapName: m.mapName, title: m.name, category: m.category })));
}

export async function writeServerRuntimeSettings(config, settings) {
  await mkdir(dirname(config.runtimeSettingsFile), { recursive: true });
  await writeJsonFile(config.runtimeSettingsFile, normalizeSettings(settings));
  await writeJsonFile(`${dirname(config.runtimeSettingsFile)}/map-catalog.json`, BUILT_IN_MAPS.map(m => ({ mapName: m.mapName, title: m.name, category: m.category })));
}
