export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getConfig() {
  return {
    port: 8080,
    publicUrl: publicOrigin(requireEnv("ADMIN_PANEL_PUBLIC_URL")),
    bootstrapAdminSteamId: process.env.ADMIN_PANEL_ADMIN_STEAM_ID || "",
    promoteBootstrapAdmin: process.env.NODE_ENV === "development",
    sessionSecret: requireEnv("ADMIN_PANEL_SESSION_SECRET"),
    testLoginUsername: process.env.ADMIN_PANEL_TEST_USERNAME || "test",
    testLoginPassword: process.env.ADMIN_PANEL_TEST_PASSWORD || "",
    mongodbUri: "mongodb://mongodb:27017/cs2_admin_panel",
    mongoDbName: "cs2_admin_panel",
    projectDir: "",
    composeFile: "docker-compose.yml",
    runtimeSettingsFile: "/runtime/settings.json",
    runtimeAdminsFile: "/runtime/csharp-admins.json",
    runtimeMatchZyAdminsFile: "/runtime/matchzy-admins.json",
    runtimeMatchZyNadesFile: "/runtime/matchzy-savednades.json",
    liveMatchZyNadesFile: "/cs2-data/game/csgo/cfg/MatchZy/savednades.json",
    liveMatchZyConfigFile: "/cs2-data/game/csgo/cfg/MatchZy/config.cfg",
    uploadDir: "/uploads",
    demoDir: "/demos",
    recordingStorage: process.env.RECORDING_STORAGE || "local",
    analysisStorageLimit: positiveBytes("ANALYSIS_STORAGE_LIMIT_GIB", 100),
    analysisScopeLimit: positiveBytes("ANALYSIS_SCOPE_LIMIT_GIB", 20),
    analysisMinimumFree: positiveBytes("ANALYSIS_MINIMUM_FREE_GIB", 2),
    faceitApiKey: process.env.FACEIT_API_KEY || "",
    faceitDownloadsToken: process.env.FACEIT_DOWNLOADS_TOKEN || "",
    steamWebApiKey: process.env.STEAM_WEB_API_KEY || "",
    steamGcRefreshToken: process.env.STEAM_GC_REFRESH_TOKEN || "",
    uploadthingToken: process.env.UPLOADTHING_TOKEN || "",
    nadesSyncEnabled: true,
    nadesSyncIntervalMs: 2000,
    controlMode: "docker",
    composeProjectName: "cs2-matchzy",
    serviceName: "cs2",
    containerName: ""
  };
}

function positiveBytes(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} muss eine positive Zahl sein.`);
  return Math.floor(value * 1024 ** 3);
}

function publicOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("ADMIN_PANEL_PUBLIC_URL muss die öffentliche HTTP(S)-Adresse ohne Pfad sein.");
  return url.origin;
}
