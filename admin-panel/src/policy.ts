import { SERVER_ENV_KEYS } from "./defaults.js";

export const SERVER_MODES = [
  { id: "matchzy", name: "MatchZy", description: "Competitive matches, practice commands and saved nade lineups." },
  { id: "executes", name: "Executes", description: "Executes scenarios. MatchZy is removed while this mode is active." },
  { id: "vanilla", name: "Vanilla + framework", description: "No match mode plugin; Metamod and CounterStrikeSharp remain available." }
];

export const ADMIN_ROLES = [
  { id: "owner", name: "Owner", description: "Full CounterStrikeSharp access, including RCON.", flags: ["@css/root"] },
  { id: "match_operator", name: "Match operator", description: "Runs MatchZy matches and practice sessions without full root access.", flags: ["@css/config", "@custom/prac", "@css/map", "@css/chat"] },
  { id: "moderator", name: "Moderator", description: "Player moderation, chat and votes.", flags: ["@css/generic", "@css/kick", "@css/ban", "@css/unban", "@css/slay", "@css/chat", "@css/vote"] },
  { id: "custom", name: "Custom", description: "Explicit CounterStrikeSharp permissions.", flags: [] }
];

export const SETTINGS_GROUPS = [
  {
    id: "identity", title: "Server identity", description: "The public name, slots and initial map.",
    fields: [
      { key: "CS2_SERVERNAME", label: "Server name", type: "text" },
      { key: "CS2_MAXPLAYERS", label: "Max players", type: "number" },
      { key: "CS2_STARTMAP", label: "Start map", type: "text" },
      { key: "CS2_PW", label: "Join password", type: "password" },
      { key: "CS2_RCONPW", label: "RCON password", type: "password" }
    ]
  },
  {
    id: "matchzy", title: "MatchZy behavior", description: "Used only while MatchZy is the active server mode.", mode: "matchzy",
    fields: [
      { key: "MATCHZY_SMOKE_COLOR", label: "Colored practice smokes", type: "boolean" },
      { key: "MATCHZY_SAVE_NADES_AS_GLOBAL", label: "Share saved nades globally", type: "boolean" },
      { key: "MATCHZY_CHAT_PREFIX", label: "Chat prefix", type: "text", placeholder: "[{Green}MatchZy{Default}]" }
    ]
  },
  {
    id: "workshop", title: "Workshop maps", description: "MultiAddonManager is installed automatically when maps are enabled.",
    fields: [
      { key: "CS2_WORKSHOP_MAPS_ENABLED", label: "Load workshop maps", type: "boolean" },
      { key: "CS2_WORKSHOP_MAPS", label: "Workshop IDs or links", type: "textarea", placeholder: "3070244462, 3077265396" },
      { key: "CS2_WORKSHOP_FORCE_DOWNLOAD", label: "Check downloads on every map load", type: "boolean" }
    ]
  },
  {
    id: "advanced", title: "Advanced launch", description: "Ports and extra process arguments. Usually unchanged in Coolify.",
    fields: [
      { key: "CS2_PORT", label: "Game port", type: "number" },
      { key: "TV_PORT", label: "TV port", type: "number" },
      { key: "CS2_ADDITIONAL_ARGS", label: "Additional launch arguments", type: "textarea" }
    ]
  }
];

const DEFAULTS: Record<string, string> = {
  CS2_SERVERNAME: "CS2 MatchZy Server", CS2_MAXPLAYERS: "10", CS2_STARTMAP: "de_mirage", CS2_PORT: "27015", TV_PORT: "27020",
  SERVER_MODE: "matchzy", MATCHZY_ENABLED: "1", EXECUTES_ENABLED: "0", FAKE_RCON_ENABLED: "0", WEAPONPAINTS_ENABLED: "0",
  FORTNITE_EMOTES_ENABLED: "0", SIMPLEADMIN_ENABLED: "0", CS2_WORKSHOP_MAPS_ENABLED: "0", CS2_WORKSHOP_FORCE_DOWNLOAD: "0",
  MATCHZY_SMOKE_COLOR: "0", MATCHZY_SAVE_NADES_AS_GLOBAL: "1", AUTO_RESTART_ENABLED: "1", AUTO_RESTART_TIME: "05:00",
  AUTO_RESTART_TIMEZONE: "Europe/Vienna", MOD_REINSTALL: "0"
};

const BOOLEAN_KEYS = ["MATCHZY_ENABLED", "EXECUTES_ENABLED", "FAKE_RCON_ENABLED", "WEAPONPAINTS_ENABLED", "FORTNITE_EMOTES_ENABLED", "SIMPLEADMIN_ENABLED", "CS2_WORKSHOP_MAPS_ENABLED", "CS2_WORKSHOP_FORCE_DOWNLOAD", "MATCHZY_SMOKE_COLOR", "MATCHZY_SAVE_NADES_AS_GLOBAL", "AUTO_RESTART_ENABLED", "MOD_REINSTALL"];

export function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

export function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return true;
  } catch {
    return false;
  }
}

export function inferServerMode(input) {
  const explicit = String(input?.SERVER_MODE || "").toLowerCase();
  if (SERVER_MODES.some((mode) => mode.id === explicit)) return explicit;
  if (isEnabled(input?.EXECUTES_ENABLED) && input?.MATCHZY_ENABLED !== undefined && !isEnabled(input.MATCHZY_ENABLED)) return "executes";
  return "matchzy";
}

export function validateServerSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (source.SERVER_MODE !== undefined && !SERVER_MODES.some((mode) => mode.id === String(source.SERVER_MODE).toLowerCase())) {
    throw new Error("SERVER_MODE must be matchzy, executes, or vanilla");
  }
  if (source.AUTO_RESTART_TIME !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.AUTO_RESTART_TIME))) {
    throw new Error("Restart time must use HH:mm in 24-hour format");
  }
  if (source.AUTO_RESTART_TIMEZONE !== undefined && !isValidTimezone(source.AUTO_RESTART_TIMEZONE)) {
    throw new Error("Restart timezone must be a valid IANA timezone, for example Europe/Vienna");
  }
  return source;
}

export function normalizeServerSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const mode = inferServerMode(source);
  const output: Record<string, string> = { ...DEFAULTS };
  for (const key of SERVER_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) output[key] = String(source[key] ?? "");
  }
  for (const key of BOOLEAN_KEYS) output[key] = isEnabled(output[key]) ? "1" : "0";
  output.SERVER_MODE = mode;
  output.MATCHZY_ENABLED = mode === "matchzy" ? "1" : "0";
  output.EXECUTES_ENABLED = mode === "executes" ? "1" : "0";
  output.AUTO_RESTART_TIME = /^([01]\d|2[0-3]):[0-5]\d$/.test(output.AUTO_RESTART_TIME) ? output.AUTO_RESTART_TIME : DEFAULTS.AUTO_RESTART_TIME;
  output.AUTO_RESTART_TIMEZONE = isValidTimezone(output.AUTO_RESTART_TIMEZONE) ? output.AUTO_RESTART_TIMEZONE : DEFAULTS.AUTO_RESTART_TIMEZONE;
  delete output.ADMINS;
  return output;
}

const PLUGINS: any[] = [
  { id: "metamod", name: "Metamod", detail: "Native plugin loader", locked: true, enabled: true, dependencies: [] },
  { id: "counterstrikesharp", name: "CounterStrikeSharp", detail: "Admin and managed plugin framework", locked: true, enabled: true, dependencies: ["Metamod"] },
  { id: "fake-rcon", name: "Fake RCON", detail: "In-game RCON bridge", envKey: "FAKE_RCON_ENABLED", dependencies: ["Metamod"] },
  { id: "simpleadmin", name: "SimpleAdmin", detail: "Additional moderation commands", envKey: "SIMPLEADMIN_ENABLED", dependencies: ["CounterStrikeSharp", "PlayerSettings", "AnyBaseLib", "MenuManager"], warning: "Configure its database or SQLite settings after the first start." },
  { id: "weaponpaints", name: "WeaponPaints", detail: "Cosmetic weapon inventory", envKey: "WEAPONPAINTS_ENABLED", dependencies: ["CounterStrikeSharp", "PlayerSettings", "AnyBaseLib", "MenuManager", "MySQL"], warning: "Experimental plugin. It disables CounterStrikeSharp's server-guideline guard and may put the GSLT at risk." },
  { id: "fortnite-emotes", name: "Fortnite Emotes", detail: "Emote and dance commands", envKey: "FORTNITE_EMOTES_ENABLED", dependencies: ["CounterStrikeSharp", "MultiAddonManager", "RayTrace", "Workshop addon"] },
  { id: "workshop-maps", name: "Workshop maps", detail: "Mount configured Workshop map addons", envKey: "CS2_WORKSHOP_MAPS_ENABLED", dependencies: ["MultiAddonManager"] }
];

export function buildControlModel(input) {
  const env = normalizeServerSettings(input);
  const mode = SERVER_MODES.find((item) => item.id === env.SERVER_MODE)!;
  const modePlugin = mode.id === "vanilla" ? [] : [{ id: mode.id, name: mode.name, detail: mode.description, enabled: true, locked: true, envKey: null, dependencies: ["CounterStrikeSharp"], warning: null }];
  const plugins = [...modePlugin, ...PLUGINS.map((plugin) => ({ ...plugin, enabled: plugin.locked ? true : isEnabled(env[plugin.envKey]), envKey: plugin.envKey || null, warning: plugin.warning || null }))];
  return {
    mode, modes: SERVER_MODES, plugins, settingsGroups: SETTINGS_GROUPS, adminRoles: ADMIN_ROLES,
    rules: ["MatchZy and Executes are mutually exclusive server modes.", "CounterStrikeSharp is the single source of admin permissions.", "Plugin dependencies are installed and removed automatically."]
  };
}

export function roleForFlags(flags) {
  const values = [...new Set((flags || []).map(String))].sort();
  for (const role of ADMIN_ROLES) {
    if (role.id === "custom") continue;
    if ([...role.flags].sort().join("\0") === values.join("\0")) return role.id;
  }
  return values.includes("@css/root") ? "owner" : "custom";
}

export function flagsForRole(role, customFlags = []) {
  const preset = ADMIN_ROLES.find((item) => item.id === role);
  if (!preset) throw new Error(`Invalid admin role: ${role}`);
  return preset.id === "custom" ? customFlags : preset.flags;
}
