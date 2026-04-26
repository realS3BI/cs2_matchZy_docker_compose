import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CURATED_FIELDS, FLAG_PRESETS, SERVER_ENV_KEYS } from "./defaults.js";
import { writeEnvFile } from "./env-file.js";
import {
  adminsToCssConfig,
  adminsToMatchZyConfig,
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeAdmins,
  sanitizeEnv,
  sanitizeNades
} from "./validators.js";

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

export function createApp({ config, store, compose }) {
  const app = express();
  app.disable("x-powered-by");
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

  app.use("/api", requireAuth(config));

  app.get("/api/settings", async (req, res) => {
    res.json({
      env: await store.getSettings(),
      curatedFields: CURATED_FIELDS
    });
  });

  app.put("/api/settings", async (req, res) => {
    const env = sanitizeEnv(req.body?.env);
    res.json({ env: await store.saveSettings(env) });
  });

  app.get("/api/admins", async (req, res) => {
    res.json({
      entries: await store.getAdmins(),
      flagPresets: FLAG_PRESETS
    });
  });

  app.put("/api/admins", async (req, res) => {
    const entries = sanitizeAdmins(req.body?.entries);
    res.json({ entries: await store.saveAdmins(entries) });
  });

  app.get("/api/nades", async (req, res) => {
    res.json({
      entries: await store.getNades()
    });
  });

  app.put("/api/nades", async (req, res) => {
    const entries = sanitizeNades(req.body?.entries);
    res.json({ entries: await store.saveNades(entries) });
  });

  app.post("/api/nades/import", async (req, res) => {
    const importedEntries = matchZySavedNadesConfigToNades(req.body?.matchzyConfig);
    const mode = req.body?.mode === "merge" ? "merge" : "replace";
    if (mode === "merge") {
      const merged = [...await store.getNades(), ...importedEntries];
      res.json({ entries: await store.saveNades(merged) });
      return;
    }
    res.json({ entries: await store.saveNades(importedEntries) });
  });

  app.get("/api/nades/export", async (req, res) => {
    res.json(nadesToMatchZySavedNadesConfig(await store.getNades()));
  });

  app.post("/api/server/apply", async (req, res) => {
    const env = await store.getSettings();
    const admins = await store.getAdmins();
    const nades = await store.getNades();
    const nextEnv = sanitizeEnv({
      ...env,
      MATCHZY_SAVE_NADES_AS_GLOBAL: env.MATCHZY_SAVE_NADES_AS_GLOBAL ?? "1",
      ADMINS: admins.map((entry) => entry.identitySteam64).join(",")
    });

    await writeEnvFile(config.runtimeEnvFile, serverRuntimeEnv(nextEnv));
    await writeJsonFile(config.runtimeAdminsFile, adminsToCssConfig(admins));
    await writeJsonFile(config.runtimeMatchZyAdminsFile, adminsToMatchZyConfig(admins));
    await writeJsonFile(config.runtimeMatchZyNadesFile, nadesToMatchZySavedNadesConfig(nades));
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

  app.get("/api/server/status", async (req, res) => {
    res.json({
      service: await compose.serviceStatus(),
      lastAction: await store.getLastAction(["apply", "restart", "save", "login_fail"])
    });
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
