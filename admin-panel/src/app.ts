import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_PRESETS } from "./defaults.js";
import {
  matchZySavedNadesConfigToNades,
  nadesToMatchZySavedNadesConfig,
  sanitizeAdmins,
  sanitizeSettings,
  sanitizeNades
} from "./validators.js";
import { buildDiagnostics } from "./diagnostics.js";
import { buildControlModel, normalizeSettings, SETTINGS_GROUPS, validateRunnableSettings, validateSettings } from "./policy.js";
import { writeAdminRuntimeFiles, writeServerRuntimeFiles, writeServerRuntimeSettings } from "./runtime-files.js";

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

function nadesLibraryStatus(document) {
  return {
    count: Array.isArray(document?.entries) ? document.entries.length : 0,
    updatedAt: document?.updatedAt || null
  };
}

async function resetRepairFlagAfterBootstrap({ config, store, compose, since }) {
  const observed = await compose.waitForServiceLog(
    ["[pre.sh] Hook finished successfully", "[pre.sh] Hook failed"],
    since
  );

  const resetSettings = sanitizeSettings({ ...(await store.getSettings()), repairMods: false });
  await writeServerRuntimeSettings(config, resetSettings);
  await store.saveSettings(resetSettings);
  await store.logAction(
    "repair_reset",
    observed ? "success" : "failed",
    observed
      ? "Reset the one-shot repair switch after the mod bootstrap"
      : "Reset the one-shot repair switch after timing out while waiting for the mod bootstrap"
  );
}

export function createApp({ config, store, compose, nadesSync, restartScheduler = null }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
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
      secure: req.secure,
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

  app.post(
    "/api/uploads/lineup-image",
    express.raw({ type: ["image/jpeg", "image/png", "image/webp", "image/gif"], limit: "4mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Select a JPEG, PNG, WebP or GIF image" });
      }
      const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
      const extension = extensions[String(req.headers["content-type"] || "").split(";")[0]];
      if (!extension) return res.status(415).json({ error: "Unsupported image type" });

      const originalName = decodeURIComponent(String(req.headers["x-file-name"] || "lineup-image")).slice(0, 180);
      const key = `${crypto.randomUUID()}${extension}`;
      await mkdir(config.uploadDir, { recursive: true });
      await writeFile(join(config.uploadDir, key), req.body);
      return res.json({
        key,
        url: `/api/uploads/${key}`,
        name: originalName || `lineup-image${extname(key)}`,
        size: req.body.length,
        uploadedAt: new Date().toISOString()
      });
    }
  );

  app.get("/api/uploads/:key", async (req, res) => {
    const key = String(req.params.key || "");
    if (!/^[0-9a-f-]+\.(?:jpg|png|webp|gif)$/i.test(key)) return res.status(404).end();
    try {
      const content = await readFile(join(config.uploadDir, key));
      const contentTypes = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
      res.type(contentTypes[extname(key).toLowerCase()] || "application/octet-stream").send(content);
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).end();
      throw error;
    }
  });

  app.get("/api/settings", async (req, res) => {
    res.json({
      settings: await store.getSettings(),
      curatedFields: SETTINGS_GROUPS.flatMap((group) => group.fields),
      settingsGroups: SETTINGS_GROUPS
    });
  });

  app.put("/api/settings", async (req, res) => {
    const settings = normalizeSettings(validateSettings(sanitizeSettings(req.body?.settings)));
    res.json({ settings: await store.saveSettings(settings) });
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
    const document = await store.getNadesDocument();
    res.json({
      entries: document?.entries || [],
      library: nadesLibraryStatus(document),
      sync: nadesSync?.status() || { enabled: false, state: "disabled" }
    });
  });

  app.get("/api/nades/status", async (req, res) => {
    const document = await store.getNadesDocument();
    res.json({
      library: nadesLibraryStatus(document),
      sync: nadesSync?.status() || { enabled: false, state: "disabled" }
    });
  });

  app.get("/api/control", async (req, res) => {
    const [settings, admins, nadesDocument, service, lastAction, maintenance] = await Promise.all([
      store.getSettings(),
      store.getAdmins(),
      store.getNadesDocument(),
      compose.serviceStatus(),
      store.getLastAction(["apply", "restart", "scheduled_restart", "repair", "save", "nades_sync", "login_fail"]),
      restartScheduler?.status() || Promise.resolve({ enabled: false })
    ]);
    const nades = nadesDocument?.entries || [];
    res.json({ settings, admins, nades, flagPresets: FLAG_PRESETS, status: { service, lastAction, maintenance, nadesSync: nadesSync?.status() || { enabled: false, state: "disabled" }, nadesLibrary: nadesLibraryStatus(nadesDocument) }, policy: buildControlModel(settings) });
  });

  app.put("/api/control", async (req, res) => {
    const settings = normalizeSettings(validateSettings(sanitizeSettings(req.body?.settings)));
    const admins = sanitizeAdmins(req.body?.admins);
    const [savedSettings, savedAdmins] = await Promise.all([store.saveSettings(settings), store.saveAdmins(admins)]);
    await writeAdminRuntimeFiles(config, savedAdmins);
    res.json({ settings: savedSettings, admins: savedAdmins, policy: buildControlModel(savedSettings) });
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
    const settings = normalizeSettings(validateRunnableSettings(await store.getSettings()));
    const admins = await store.getAdmins();
    const nades = await store.getNades();
    const nextSettings = normalizeSettings(settings);

    await writeServerRuntimeFiles(config, nadesSync, nextSettings, admins, nades);
    await store.saveSettings(nextSettings);

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
    const nextSettings = normalizeSettings(validateRunnableSettings(sanitizeSettings(req.body?.settings)));
    const admins = sanitizeAdmins(req.body?.admins);
    const nades = await store.getNades();
    await Promise.all([store.saveSettings(nextSettings), store.saveAdmins(admins)]);
    await writeServerRuntimeFiles(config, nadesSync, nextSettings, admins, nades);

    const result = await compose.recreateService();
    await store.logAction("apply", result.ok ? "success" : "failed", actionMessage(result), { code: result.code, mode: nextSettings.serverMode });
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, message: actionMessage(result), settings: nextSettings, admins, policy: buildControlModel(nextSettings) });
  });

  app.post("/api/server/repair", async (req, res) => {
    const admins = await store.getAdmins();
    const nades = await store.getNades();
    const repairSettings = normalizeSettings({
      ...(await store.getSettings()),
      repairMods: true
    });

    const repairStartedAt = new Date().toISOString();
    await writeServerRuntimeFiles(config, nadesSync, repairSettings, admins, nades);
    await store.saveSettings(repairSettings);
    const result = await compose.restartService();

    if (result.ok) {
      void resetRepairFlagAfterBootstrap({ config, store, compose, since: repairStartedAt }).catch(async (error) => {
        await store.logAction("repair_reset", "failed", error.message || "Could not reset the repair switch");
      });
    } else {
      const resetSettings = sanitizeSettings({ ...repairSettings, repairMods: false });
      await writeServerRuntimeSettings(config, resetSettings);
      await store.saveSettings(resetSettings);
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
