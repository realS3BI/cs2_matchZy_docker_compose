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
    password: requireEnv("ADMIN_PANEL_PASSWORD"),
    sessionSecret: requireEnv("ADMIN_PANEL_SESSION_SECRET"),
    mongodbUri: "mongodb://mongodb:27017/cs2_admin_panel",
    mongoDbName: "cs2_admin_panel",
    projectDir: "",
    composeFile: "docker-compose.yml",
    runtimeSettingsFile: "/runtime/settings.json",
    runtimeAdminsFile: "/runtime/csharp-admins.json",
    runtimeMatchZyAdminsFile: "/runtime/matchzy-admins.json",
    runtimeMatchZyNadesFile: "/runtime/matchzy-savednades.json",
    liveMatchZyNadesFile: "/cs2-data/game/csgo/cfg/MatchZy/savednades.json",
    uploadDir: "/uploads",
    nadesSyncEnabled: true,
    nadesSyncIntervalMs: 2000,
    controlMode: "docker",
    composeProjectName: "cs2-matchzy",
    serviceName: "cs2",
    containerName: ""
  };
}
