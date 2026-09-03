import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { normalizeSettings } from "./policy.js";
import {
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

export async function writeAdminRuntimeFiles(config, admins) {
  await writeJsonFile(config.runtimeAdminsFile, adminsToCssConfig(admins));
  await writeJsonFile(config.runtimeMatchZyAdminsFile, adminsToMatchZyConfig(admins));
}

export async function writeServerRuntimeFiles(config, nadesSync, settings, admins, nades) {
  await mkdir(dirname(config.runtimeSettingsFile), { recursive: true });
  await writeAdminRuntimeFiles(config, admins);
  await writeJsonFile(config.runtimeMatchZyNadesFile, nadesToMatchZySavedNadesConfig(nades));
  await nadesSync?.writeFromMongo(nades);
  await writeJsonFile(config.runtimeSettingsFile, normalizeSettings(settings));
}

export async function writeServerRuntimeSettings(config, settings) {
  await mkdir(dirname(config.runtimeSettingsFile), { recursive: true });
  await writeJsonFile(config.runtimeSettingsFile, normalizeSettings(settings));
}
