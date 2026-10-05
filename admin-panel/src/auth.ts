import crypto from "node:crypto";
import type { Express } from "express";
import { capabilities } from "../shared/authorization.js";

export const SESSION_COOKIE = "cs2_panel_session";
// Reserved synthetic identity, outside the range of Steam-issued account IDs.
export const TEST_USER_ID = "00000000000000001";
const STATE_COOKIE = "cs2_steam_state";
const STEAM_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
export const tokenHash = (token: string, secret: string) => crypto.createHmac("sha256", secret).update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
export const safeReturnPath = (value: unknown) => typeof value === "string" && /^\/(?:teams|strats|maps|admin|analysis)(?:[/?][\w/?=&%.-]*)?$/.test(value) && value.length < 1000 ? value : "/";

export async function authenticatedUser(req, config, store) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === "string" && /^[\w-]{43}$/.test(token) ? await store.getSession(tokenHash(token, config.sessionSecret)) : null;
  if (!session || !["user", "test"].includes(session.purpose) ||
      (session.purpose === "test" && (!config.testLoginPassword || session.steamId !== TEST_USER_ID))) return null;
  const user = await store.getUser(session.steamId);
  return user && (session.purpose === "test" ? { ...user, role: "player", access: { platform: "user", server: "none" }, flags: [], authKind: "test" } : { ...user, authKind: "steam" });
}

export async function verifySteam(query, returnTo: string, fetcher = fetch) {
  const fields = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];
  if (Object.values(query).some(value => typeof value !== "string") ||
      query["openid.ns"] !== OPENID_NS || query["openid.mode"] !== "id_res" ||
      query["openid.op_endpoint"] !== STEAM_ENDPOINT || query["openid.return_to"] !== returnTo ||
      query["openid.identity"] !== query["openid.claimed_id"] ||
      !fields.every(field => String(query["openid.signed"] || "").split(",").includes(field)))
    throw new Error("Ungültige Steam-Anmeldung.");
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/.exec(query["openid.claimed_id"]);
  const nonceTime = Date.parse(String(query["openid.response_nonce"]).slice(0, 20));
  if (!match || !Number.isFinite(nonceTime) || Math.abs(Date.now() - nonceTime) > 5 * 60_000)
    throw new Error("Steam-Anmeldung ist ungültig oder abgelaufen.");
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key.startsWith("openid.")) body.set(key, String(value));
  body.set("openid.mode", "check_authentication");
  const response = await fetcher(STEAM_ENDPOINT, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !(await response.text()).split(/\r?\n/).includes("is_valid:true"))
    throw new Error("Steam konnte die Anmeldung nicht bestätigen.");
  return match[1];
}

export function installAuth(app: Express, { config, store, loginLimiter, steamVerifier = verifySteam, live }) {
  app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  const hash = (token: string) => tokenHash(token, config.sessionSecret);
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: config.publicUrl?.startsWith("https://"), path: "/" };
  app.get("/api/auth/steam", loginLimiter, async (req, res, next) => {
    try {
      const token = newToken();
      await store.createSession(hash(token), { purpose: "steam", returnPath: safeReturnPath(req.query.returnTo), expiresAt: new Date(Date.now() + 10 * 60_000) });
      res.cookie(STATE_COOKIE, token, { ...cookieOptions, maxAge: 10 * 60_000 });
      const params = new URLSearchParams({
        "openid.ns": OPENID_NS, "openid.mode": "checkid_setup",
        "openid.return_to": `${config.publicUrl}/api/auth/steam/callback?state=${token}`,
        "openid.realm": `${config.publicUrl}/`,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
      });
      res.redirect(`${STEAM_ENDPOINT}?${params}`);
    } catch (error) { next(error); }
  });
  app.get("/api/auth/steam/callback", loginLimiter, async (req, res) => {
    try {
      const state = req.query.state;
      if (typeof state !== "string" || !/^[\w-]{43}$/.test(state) || state !== req.cookies[STATE_COOKIE])
        throw new Error("Anmeldung bitte erneut starten.");
      const pending = await store.consumeSession(hash(state), "steam");
      res.clearCookie(STATE_COOKIE, cookieOptions);
      if (!pending) throw new Error("Anmeldung ist abgelaufen oder bereits verwendet.");
      const steamId = await steamVerifier(req.query, `${config.publicUrl}/api/auth/steam/callback?state=${state}`);
      await store.recordLogin(steamId);
      if (req.cookies[SESSION_COOKIE]) await store.deleteSession(hash(req.cookies[SESSION_COOKIE]));
      const token = newToken();
      await store.createSession(hash(token), { purpose: "user", steamId, expiresAt: new Date(Date.now() + 12 * 60 * 60_000) });
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: 12 * 60 * 60_000 });
      res.redirect(safeReturnPath(pending.returnPath));
    } catch {
      res.redirect("/login?error=steam");
    }
  });
  // All mutations require a same-origin browser request. API clients may omit Origin,
  // but cross-site browser requests and form submissions are rejected.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        ((req.headers.origin && req.headers.origin !== config.publicUrl) ||
         req.headers["sec-fetch-site"] === "cross-site" ||
         (req.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" && !req.is("image/*") && !(req.method === "PUT" && /^\/analysis\/(?:demos\/[\w-]{1,100}\/file|audio\/[\w-]{1,100}\/segments\/\d{1,4})$/.test(req.path) && req.is("application/octet-stream")))))
      return res.status(403).json({ error: "Anfrage von dieser Herkunft ist nicht erlaubt." });
    next();
  });
  app.post("/api/auth/test", loginLimiter, async (req, res, next) => {
    try {
      if (!config.testLoginPassword) return res.status(404).json({ error: "Der Testzugang ist nicht aktiviert." });
      const { username, password } = req.body || {};
      if (typeof username !== "string" || typeof password !== "string" || username.length > 100 || password.length > 1024)
        return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
      const same = (value: string, expected: string) => crypto.timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(hash(expected), "hex"));
      const validUsername = same(username, config.testLoginUsername);
      const validPassword = same(password, config.testLoginPassword);
      if (!validUsername || !validPassword) return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
      await store.recordTestLogin(TEST_USER_ID, config.testLoginUsername);
      if (req.cookies[SESSION_COOKIE]) await store.deleteSession(hash(req.cookies[SESSION_COOKIE]));
      const token = newToken();
      await store.createSession(hash(token), { purpose: "test", steamId: TEST_USER_ID, expiresAt: new Date(Date.now() + 12 * 60 * 60_000) });
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: 12 * 60 * 60_000 });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      if (req.cookies[SESSION_COOKIE]) await store.deleteSession(hash(req.cookies[SESSION_COOKIE]));
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.use("/api", async (req, res, next) => {
    try {
      const user = await authenticatedUser(req, config, store);
      if (!user) return res.status(401).json({ error: "Bitte anmelden." });
      res.locals.user = user;
      next();
    } catch (error) { next(error); }
  });
  live.get(app, "/api/auth/me", async ({ user }) => ({ user, permissions: capabilities(user) }));
}
