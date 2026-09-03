import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_PRESETS, SERVER_ENV_KEYS } from "./defaults.js";
import { writeEnvFile } from "./env-file.js";
import { uploadRouter } from "./uploadthing.js";
import {
  adminsToCssConfig,
  adminsToMatchZyConfig,
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeAdmins,
  sanitizeEnv,
  sanitizeNades
} from "./validators.js";
import { createRouteHandler } from "uploadthing/express";
import { buildDiagnostics } from "./diagnostics.js";
import { buildControlModel, normalizeServerSettings, SETTINGS_GROUPS, validateServerSettings } from "./policy.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "..", "dist");
const COOKIE_NAME = "cs2_panel_session";

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSession(secret) {
  const payload = Buffer.from(JSON.stringify({ authenticated: true, createdAt: Date.now() }), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function isValidSession(cookie, secret) {
  if (!cookie || !cookie.includes(".")) return false;
  const [payload, signature] = cookie.split(".");
  const expected = sign(payload, secret);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.authenticated === true && Date.now() - Number(data.createdAt || 0) < 12 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function requireAuth(config) {
  return (req, res, next) => {
    if (isValidSession(req.cookies[COOKIE_NAME], config.sessionSecret)) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };
}

function actionMessage(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return output || (result.ok ? "Command completed" : "Command failed");
}

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
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeAdminRuntimeFiles(config, admins) {
  await writeJsonFile(config.runtimeAdminsFile, adminsToCssConfig(admins));
  await writeJsonFile(config.runtimeMatchZyAdminsFile, adminsToMatchZyConfig(admins));
}

async function writeServerRuntimeFiles(config, nadesSync, env, admins, nades) {
  await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(env));
  await writeAdminRuntimeFiles(config, admins);
  await writeJsonFile(config.runtimeMatchZyNadesFile, nadesToMatchZySavedNadesConfig(nades));
  await nadesSync?.writeFromMongo(nades);
}

async function resetRepairFlagAfterBootstrap({ config, store, compose, since }) {
  const observed = await compose.waitForServiceLog(
    ["[pre.sh] Hook finished successfully", "[pre.sh] Hook failed"],
    since
  );

  const resetEnv = sanitizeEnv({ ...(await store.getSettings()), MOD_REINSTALL: "0" });
  await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(resetEnv));
  await store.saveSettings(resetEnv);
  await store.logAction(
    "repair_reset",
    observed ? "success" : "failed",
    observed
      ? "Reset MOD_REINSTALL after the one-shot repair"
      : "Reset MOD_REINSTALL after timing out while waiting for the mod bootstrap"
  );
}

export function createApp({ config, store, compose, nadesSync, restartScheduler = null }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    "/api/uploadthing",
    createRouteHandler({
      router: uploadRouter(config)
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const password = String(req.body?.password || "");
    const isMatch = crypto.timingSafeEqual(
      crypto.createHash("sha256").update(password).digest(),
      crypto.createHash("sha256").update(config.password).digest()
    );
    if (!isMatch) {
      await store.logAction("login_fail", "failed", "Invalid password");
      return res.status(401).json({ error: "Invalid password" });
    }
    res.cookie(COOKIE_NAME, createSession(config.sessionSecret), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.ADMIN_PANEL_SECURE_COOKIE === "1",
      maxAge: 12 * 60 * 60 * 1000
    });
    return res.json({ ok: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  app.get("/healthz", (req, res) => {
    res.json({ ok: true, service: "cs2-matchzy-admin" });
  });

  app.use("/api", requireAuth(config));

  app.get("/api/settings", async (req, res) => {
    res.json({
      env: await store.getSettings(),
      curatedFields: SETTINGS_GROUPS.flatMap((group) => group.fields),
      settingsGroups: SETTINGS_GROUPS
    });
  });

  app.put("/api/settings", async (req, res) => {
    const env = normalizeServerSettings(validateServerSettings(sanitizeEnv(req.body?.env)));
    res.json({ env: await store.saveSettings(env) });
  });

  app.get("/api/admins", async (req, res) => {
    res.json({
      entries: await store.getAdmins(),
      flagPresets: FLAG_PRESETS,
      roles: buildControlModel(await store.getSettings()).adminRoles
    });
  });

  app.put("/api/admins", async (req, res) => {
    const entries = sanitizeAdmins(req.body?.entries);
    const savedEntries = await store.saveAdmins(entries);
    await writeAdminRuntimeFiles(config, savedEntries);
    res.json({ entries: savedEntries });
  });

  app.get("/api/nades", async (req, res) => {
    res.json({
      entries: await store.getNades()
    });
  });

  app.get("/api/control", async (req, res) => {
    const [env, admins, nades, service, lastAction, maintenance] = await Promise.all([
      store.getSettings(),
      store.getAdmins(),
      store.getNades(),
      compose.serviceStatus(),
      store.getLastAction(["apply", "restart", "scheduled_restart", "repair", "save", "nades_sync", "login_fail"]),
      restartScheduler?.status() || Promise.resolve({ enabled: false })
    ]);
    res.json({ env, admins, nades, flagPresets: FLAG_PRESETS, status: { service, lastAction, maintenance, nadesSync: nadesSync?.status() || { enabled: false } }, policy: buildControlModel(env) });
  });

  app.put("/api/control", async (req, res) => {
    const env = normalizeServerSettings(validateServerSettings(sanitizeEnv(req.body?.env)));
    const admins = sanitizeAdmins(req.body?.admins);
    const [savedEnv, savedAdmins] = await Promise.all([store.saveSettings(env), store.saveAdmins(admins)]);
    await writeAdminRuntimeFiles(config, savedAdmins);
    res.json({ env: savedEnv, admins: savedAdmins, policy: buildControlModel(savedEnv) });
  });

  app.put("/api/nades", async (req, res) => {
    const entries = sanitizeNades(req.body?.entries);
    const savedEntries = await store.saveNades(entries);
    await nadesSync?.writeFromMongo(savedEntries);
    res.json({ entries: savedEntries });
  });

  app.post("/api/nades/import", async (req, res) => {
    const importedEntries = matchZySavedNadesConfigToNades(req.body?.matchzyConfig);
    const mode = req.body?.mode === "merge" ? "merge" : "replace";
    if (mode === "merge") {
      const mergedByKey = new Map();
      for (const entry of [...(await store.getNades()), ...importedEntries]) {
        mergedByKey.set(`${entry.owner}\u0000${entry.map}\u0000${entry.name}`.toLowerCase(), entry);
      }
      const merged = [...mergedByKey.values()];
      const savedEntries = await store.saveNades(merged);
      await nadesSync?.writeFromMongo(savedEntries);
      res.json({ entries: savedEntries });
      return;
    }
    const savedEntries = await store.saveNades(importedEntries);
    await nadesSync?.writeFromMongo(savedEntries);
    res.json({ entries: savedEntries });
  });

  app.get("/api/nades/export", async (req, res) => {
    res.json(nadesToMatchZySavedNadesConfig(await store.getNades()));
  });

  app.post("/api/server/apply", async (req, res) => {
    const env = normalizeServerSettings(await store.getSettings());
    const admins = await store.getAdmins();
    const nades = await store.getNades();
    const nextEnv = normalizeServerSettings(env);

    await writeServerRuntimeFiles(config, nadesSync, nextEnv, admins, nades);
    if (config.envFile) {
      await writeEnvFile(config.envFile, nextEnv);
    }
    await store.saveSettings(nextEnv);

    const result = await compose.recreateService();
    await store.logAction("apply", result.ok ? "success" : "failed", actionMessage(result), { code: result.code });
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, message: actionMessage(result) });
  });

  app.post("/api/server/restart", async (req, res) => {
    const result = await compose.restartService();
    await store.logAction("restart", result.ok ? "success" : "failed", actionMessage(result), { code: result.code });
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, message: actionMessage(result) });
  });

  app.post("/api/control/apply", async (req, res) => {
    const nextEnv = normalizeServerSettings(validateServerSettings(sanitizeEnv(req.body?.env)));
    const admins = sanitizeAdmins(req.body?.admins);
    const nades = await store.getNades();
    await Promise.all([store.saveSettings(nextEnv), store.saveAdmins(admins)]);
    await writeServerRuntimeFiles(config, nadesSync, nextEnv, admins, nades);
    if (config.envFile) await writeEnvFile(config.envFile, nextEnv);

    const result = await compose.recreateService();
    await store.logAction("apply", result.ok ? "success" : "failed", actionMessage(result), { code: result.code, mode: nextEnv.SERVER_MODE });
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, message: actionMessage(result), env: nextEnv, admins, policy: buildControlModel(nextEnv) });
  });

  app.post("/api/server/repair", async (req, res) => {
    const admins = await store.getAdmins();
    const nades = await store.getNades();
    const repairEnv = normalizeServerSettings({
      ...(await store.getSettings()),
      MOD_REINSTALL: "1"
    });

    const repairStartedAt = new Date().toISOString();
    await writeServerRuntimeFiles(config, nadesSync, repairEnv, admins, nades);
    await store.saveSettings(repairEnv);
    const result = await compose.restartService();

    if (result.ok) {
      void resetRepairFlagAfterBootstrap({ config, store, compose, since: repairStartedAt }).catch(async (error) => {
        await store.logAction("repair_reset", "failed", error.message || "Could not reset MOD_REINSTALL");
      });
    } else {
      const resetEnv = sanitizeEnv({ ...repairEnv, MOD_REINSTALL: "0" });
      await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(resetEnv));
      await store.saveSettings(resetEnv);
    }

    await store.logAction("repair", result.ok ? "success" : "failed", actionMessage(result), { code: result.code });
    res.status(result.ok ? 200 : 500).json({
      ok: result.ok,
      message: result.ok ? "One-shot mod repair started. Diagnostics will update as the server boots." : actionMessage(result)
    });
  });

  app.get("/api/server/status", async (req, res) => {
    res.json({
      service: await compose.serviceStatus(),
      nadesSync: nadesSync?.status() || { enabled: false },
      maintenance: restartScheduler ? await restartScheduler.status() : { enabled: false },
      lastAction: await store.getLastAction(["apply", "restart", "scheduled_restart", "repair", "save", "nades_sync", "login_fail"])
    });
  });

  app.get("/api/server/diagnostics", async (req, res) => {
    const [raw, desired] = await Promise.all([
      compose.serviceDiagnostics(),
      store.getSettings()
    ]);
    res.json(buildDiagnostics({
      ...raw,
      desired,
      controlMode: config.controlMode
    }));
  });

  app.get("/api/server/logs", async (req, res) => {
    const result = await compose.serviceLogs({ tail: req.query.tail });
    const output = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trimEnd();
    res.status(result.ok ? 200 : 500).json({
      ok: result.ok,
      logs: output,
      message: actionMessage(result)
    });
  });

  app.use(express.static(publicDir));
  app.get("*", (req, res) => res.sendFile(join(publicDir, "index.html")));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(400).json({ error: error.message || "Bad request" });
  });

  return app;
}
