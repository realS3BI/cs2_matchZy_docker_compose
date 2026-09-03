import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { SERVER_ENV_KEYS } from "./defaults.js";
import { writeEnvFile } from "./env-file.js";
import {
  adminsToCssConfig,
  adminsToMatchZyConfig,
  nadesToMatchZySavedNadesConfig
} from "./validators.js";

function serverRuntimeEnv(env) {
  const output = {};
  for (const key of SERVER_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      output[key] = env[key];
    }
  }
  return output;
}

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

export async function writeServerRuntimeFiles(config, nadesSync, env, admins, nades) {
  await mkdir(dirname(config.runtimeEnvFile), { recursive: true });
  await writeAdminRuntimeFiles(config, admins);
  await writeJsonFile(config.runtimeMatchZyNadesFile, nadesToMatchZySavedNadesConfig(nades));
  await nadesSync?.writeFromMongo(nades);
  await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(env));
}

export async function writeServerRuntimeEnv(config, env) {
  await mkdir(dirname(config.runtimeEnvFile), { recursive: true });
  await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(env));
}
