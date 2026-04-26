export const SERVER_ENV_KEYS = [
  "SRCDS_TOKEN",
  "CS2_SERVERNAME",
  "CS2_RCONPW",
  "CS2_PW",
  "CS2_MAXPLAYERS",
  "CS2_STARTMAP",
  "CS2_PORT",
  "TV_PORT",
  "CS2_ADDITIONAL_ARGS",
  "METAMOD_VERSION",
  "MATCHZY_VERSION",
  "COUNTERSTRIKESHARP_VERSION",
  "FAKE_RCON_ENABLED",
  "FAKE_RCON_VERSION",
  "WEAPONPAINTS_ENABLED",
  "WEAPONPAINTS_VERSION",
  "FORTNITE_EMOTES_ENABLED",
  "FORTNITE_EMOTES_VERSION",
  "FORTNITE_EMOTES_WORKSHOP_ADDON_ID",
  "MULTIADDONMANAGER_VERSION",
  "RAYTRACE_VERSION",
  "CS2_WORKSHOP_MAPS",
  "CS2_WORKSHOP_FORCE_DOWNLOAD",
  "EXECUTES_ENABLED",
  "EXECUTES_VERSION",
  "SIMPLEADMIN_ENABLED",
  "SIMPLEADMIN_VERSION",
  "PLAYERSETTINGS_VERSION",
  "ANYBASELIB_VERSION",
  "MENUMANAGER_VERSION",
  "MATCHZY_SMOKE_COLOR",
  "MATCHZY_SAVE_NADES_AS_GLOBAL",
  "MATCHZY_CHAT_PREFIX",
  "ADMINS",
  "MOD_REINSTALL"
];

export const ENV_KEYS = [
  ...SERVER_ENV_KEYS,
  "ADMIN_PANEL_PASSWORD",
  "ADMIN_PANEL_SESSION_SECRET",
  "ADMIN_PANEL_PORT",
  "ADMIN_PANEL_CONTROL_MODE",
  "ADMIN_PANEL_CS2_CONTAINER",
  "MONGODB_URI"
];

export const CURATED_FIELDS = [
  { key: "CS2_SERVERNAME", label: "Server name", type: "text" },
  { key: "CS2_RCONPW", label: "RCON password", type: "password" },
  { key: "CS2_PW", label: "Join password", type: "text" },
  { key: "CS2_MAXPLAYERS", label: "Max players", type: "number" },
  { key: "CS2_STARTMAP", label: "Start map", type: "text" },
  { key: "CS2_WORKSHOP_MAPS", label: "Workshop maps", type: "textarea" },
  { key: "MATCHZY_SMOKE_COLOR", label: "MatchZy smoke color", type: "boolean" },
  { key: "MATCHZY_SAVE_NADES_AS_GLOBAL", label: "MatchZy global saved nades", type: "boolean" },
  { key: "MATCHZY_CHAT_PREFIX", label: "MatchZy chat prefix", type: "text" },
  { key: "FAKE_RCON_ENABLED", label: "Fake RCON", type: "boolean" },
  { key: "WEAPONPAINTS_ENABLED", label: "WeaponPaints", type: "boolean" },
  { key: "FORTNITE_EMOTES_ENABLED", label: "Fortnite Emotes", type: "boolean" },
  { key: "EXECUTES_ENABLED", label: "Executes", type: "boolean" },
  { key: "SIMPLEADMIN_ENABLED", label: "SimpleAdmin", type: "boolean" },
  { key: "MOD_REINSTALL", label: "Force mod reinstall on next start", type: "boolean" }
];

export const FLAG_PRESETS = [
  "@css/root",
  "@css/config",
  "@custom/prac",
  "@css/map",
  "@css/rcon",
  "@css/chat"
];
