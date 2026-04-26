export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getConfig() {
  return {
    port: Number(process.env.ADMIN_PANEL_PORT || 8080),
    password: requireEnv("ADMIN_PANEL_PASSWORD"),
    sessionSecret: requireEnv("ADMIN_PANEL_SESSION_SECRET"),
    mongodbUri: requireEnv("MONGODB_URI"),
    mongoDbName: process.env.MONGODB_DB || "cs2_admin_panel",
    projectDir: process.env.COMPOSE_PROJECT_DIR || "",
    composeFile: process.env.COMPOSE_FILE || "docker-compose.yml",
    envFile: process.env.ADMIN_PANEL_ENV_FILE || "",
    runtimeEnvFile: process.env.ADMIN_PANEL_RUNTIME_ENV_FILE || "/runtime/settings.env",
    runtimeAdminsFile: process.env.ADMIN_PANEL_RUNTIME_ADMINS_FILE || "/runtime/csharp-admins.json",
    runtimeMatchZyAdminsFile: process.env.ADMIN_PANEL_RUNTIME_MATCHZY_ADMINS_FILE || "/runtime/matchzy-admins.json",
    controlMode: process.env.ADMIN_PANEL_CONTROL_MODE || "docker",
    composeProjectName: process.env.COMPOSE_PROJECT_NAME || "",
    serviceName: process.env.ADMIN_PANEL_CS2_SERVICE || "cs2",
    containerName: process.env.ADMIN_PANEL_CS2_CONTAINER || ""
  };
}
