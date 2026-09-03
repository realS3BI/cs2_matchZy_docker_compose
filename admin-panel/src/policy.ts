type SettingValue = string | number | boolean;

export type ServerSettings = {
  schemaVersion: number;
  steamToken: string;
  serverName: string;
  rconPassword: string;
  joinPassword: string;
  maxPlayers: number;
  startMap: string;
  additionalArgs: string;
  serverMode: string;
  metamodVersion: string;
  matchZyVersion: string;
  counterStrikeSharpVersion: string;
  fakeRconEnabled: boolean;
  fakeRconVersion: string;
  weaponPaintsEnabled: boolean;
  weaponPaintsVersion: string;
  fortniteEmotesEnabled: boolean;
  fortniteEmotesVersion: string;
  multiAddonManagerVersion: string;
  rayTraceVersion: string;
  workshopMaps: string;
  workshopMapsEnabled: boolean;
  workshopForceDownload: boolean;
  executesVersion: string;
  simpleAdminEnabled: boolean;
  simpleAdminVersion: string;
  playerSettingsVersion: string;
  anyBaseLibVersion: string;
  menuManagerVersion: string;
  matchZySmokeColor: boolean;
  matchZySaveNadesGlobally: boolean;
  matchZyChatPrefix: string;
  automaticRestartEnabled: boolean;
  restartTime: string;
  restartTimezone: string;
  repairMods: boolean;
};

type SettingField = {
  key: keyof ServerSettings;
  label: string;
  type: "boolean" | "number" | "password" | "text" | "textarea";
  description?: string;
  placeholder?: string;
};

type SettingsGroup = {
  id: string;
  title: string;
  description: string;
  mode?: string;
  fields: SettingField[];
};

export const GAME_MODES = [
  { id: "matchzy", name: "MatchZy", description: "Competitive matches with MatchZy." },
  { id: "nades", name: "Nades", description: "Starts MatchZy directly in practice mode with nade commands and saved lineups." },
  { id: "warmup", name: "Warmup / Aim Botz", description: "Solo aim training with bots on the Aim Botz Workshop map." },
  { id: "executes", name: "Executes", description: "Executes scenarios. MatchZy is removed while this mode is active." },
  { id: "vanilla", name: "Vanilla + framework", description: "No match mode plugin; Metamod and CounterStrikeSharp remain available." }
];

export const ADMIN_ROLES = [
  { id: "owner", name: "Owner", description: "Full CounterStrikeSharp access, including RCON.", flags: ["@css/root"] },
  { id: "match_operator", name: "Match operator", description: "Runs MatchZy matches and practice sessions without full root access.", flags: ["@css/config", "@custom/prac", "@css/map", "@css/chat"] },
  { id: "moderator", name: "Moderator", description: "Player moderation, chat and votes.", flags: ["@css/generic", "@css/kick", "@css/ban", "@css/unban", "@css/slay", "@css/chat", "@css/vote"] },
  { id: "custom", name: "Custom", description: "Explicit CounterStrikeSharp permissions.", flags: [] }
];

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "registration", title: "Steam registration", description: "Required once before the game server can start.",
    fields: [
      { key: "steamToken", label: "Steam Game Server Login Token", type: "password", description: "The GSLT for app 730. Stored in MongoDB and only written to the private runtime volume." }
    ]
  },
  {
    id: "identity", title: "Server identity", description: "The public name, slots and initial map.",
    fields: [
      { key: "serverName", label: "Server name", type: "text" },
      { key: "maxPlayers", label: "Max players", type: "number" },
      { key: "startMap", label: "Start map", type: "text", description: "Used by MatchZy, Executes and Vanilla. Warmup always starts Aim Botz." },
      { key: "joinPassword", label: "Join password", type: "password" },
      { key: "rconPassword", label: "RCON password", type: "password" }
    ]
  },
  {
    id: "matchzy", title: "MatchZy behavior", description: "Used while MatchZy or Nades is active.", mode: "matchzy",
    fields: [
      { key: "matchZySmokeColor", label: "Colored practice smokes", type: "boolean" },
      { key: "matchZySaveNadesGlobally", label: "Share saved nades globally", type: "boolean" },
      { key: "matchZyChatPrefix", label: "Chat prefix", type: "text", placeholder: "[{Green}MatchZy{Default}]" }
    ]
  },
  {
    id: "workshop", title: "Workshop maps", description: "MultiAddonManager is installed automatically when maps are enabled.",
    fields: [
      { key: "workshopMapsEnabled", label: "Load workshop maps", type: "boolean" },
      { key: "workshopMaps", label: "Workshop IDs or links", type: "textarea", placeholder: "3070244462, 3077265396" },
      { key: "workshopForceDownload", label: "Check downloads on every map load", type: "boolean" }
    ]
  },
  {
    id: "advanced", title: "Advanced launch", description: "Optional process arguments passed to the dedicated server.",
    fields: [
      { key: "additionalArgs", label: "Additional launch arguments", type: "textarea" }
    ]
  },
  {
    id: "versions", title: "Component versions", description: "Use latest for automatic updates or enter a release tag to pin a component.",
    fields: [
      { key: "metamodVersion", label: "Metamod", type: "text", placeholder: "latest" },
      { key: "counterStrikeSharpVersion", label: "CounterStrikeSharp", type: "text", placeholder: "latest" },
      { key: "matchZyVersion", label: "MatchZy", type: "text", placeholder: "latest" },
      { key: "executesVersion", label: "Executes", type: "text", placeholder: "latest" },
      { key: "fakeRconVersion", label: "Fake RCON", type: "text", placeholder: "latest" },
      { key: "weaponPaintsVersion", label: "WeaponPaints", type: "text", placeholder: "latest" },
      { key: "simpleAdminVersion", label: "SimpleAdmin", type: "text", placeholder: "latest" },
      { key: "playerSettingsVersion", label: "PlayerSettings", type: "text", placeholder: "latest" },
      { key: "anyBaseLibVersion", label: "AnyBaseLib", type: "text", placeholder: "latest" },
      { key: "menuManagerVersion", label: "MenuManager", type: "text", placeholder: "latest" },
      { key: "fortniteEmotesVersion", label: "Fortnite Emotes", type: "text", placeholder: "latest" },
      { key: "multiAddonManagerVersion", label: "MultiAddonManager", type: "text", placeholder: "latest" },
      { key: "rayTraceVersion", label: "RayTrace", type: "text", placeholder: "latest" }
    ]
  }
];

const DEFAULTS: ServerSettings = {
  schemaVersion: 1,
  steamToken: "",
  serverName: "CS2 MatchZy Server",
  rconPassword: "",
  joinPassword: "",
  maxPlayers: 10,
  startMap: "de_mirage",
  additionalArgs: "",
  serverMode: "matchzy",
  metamodVersion: "latest",
  matchZyVersion: "latest",
  counterStrikeSharpVersion: "latest",
  fakeRconEnabled: false,
  fakeRconVersion: "latest",
  weaponPaintsEnabled: false,
  weaponPaintsVersion: "latest",
  fortniteEmotesEnabled: false,
  fortniteEmotesVersion: "latest",
  multiAddonManagerVersion: "latest",
  rayTraceVersion: "latest",
  workshopMaps: "",
  workshopMapsEnabled: false,
  workshopForceDownload: false,
  executesVersion: "latest",
  simpleAdminEnabled: false,
  simpleAdminVersion: "latest",
  playerSettingsVersion: "latest",
  anyBaseLibVersion: "latest",
  menuManagerVersion: "latest",
  matchZySmokeColor: false,
  matchZySaveNadesGlobally: true,
  matchZyChatPrefix: "",
  automaticRestartEnabled: true,
  restartTime: "05:00",
  restartTimezone: "Europe/Vienna",
  repairMods: false
};

export const SETTING_KEYS = Object.freeze(Object.keys(DEFAULTS) as (keyof ServerSettings)[]);

const BOOLEAN_KEYS = SETTING_KEYS.filter((key) => typeof DEFAULTS[key] === "boolean");
const STRING_KEYS = SETTING_KEYS.filter((key) => typeof DEFAULTS[key] === "string");

export function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  for (const key of STRING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && typeof source[key] !== "string") {
      throw new Error(`${key} must be a string`);
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && typeof source[key] !== "boolean") {
      throw new Error(`${key} must be a boolean`);
    }
  }
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) {
    throw new Error("Unsupported settings schema version");
  }
  if (source.serverMode !== undefined && !GAME_MODES.some((mode) => mode.id === String(source.serverMode).toLowerCase())) {
    throw new Error("Server mode must be matchzy, nades, warmup, executes, or vanilla");
  }
  if (source.restartTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.restartTime))) {
    throw new Error("Restart time must use HH:mm in 24-hour format");
  }
  if (source.restartTimezone !== undefined && !isValidTimezone(source.restartTimezone)) {
    throw new Error("Restart timezone must be a valid IANA timezone, for example Europe/Vienna");
  }
  if (source.maxPlayers !== undefined && (typeof source.maxPlayers !== "number" || !Number.isInteger(source.maxPlayers) || source.maxPlayers < 1 || source.maxPlayers > 64)) {
    throw new Error("Max players must be an integer between 1 and 64");
  }
  return source;
}

export function validateRunnableSettings(input) {
  const source = validateSettings(input);
  if (!String(source.steamToken || "").trim()) {
    throw new Error("Steam Game Server Login Token is required before CS2 can start");
  }
  if (!String(source.rconPassword || "").trim()) {
    throw new Error("RCON password is required before CS2 can start");
  }
  return source;
}

export function normalizeSettings(input): ServerSettings {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = { ...DEFAULTS };
  const writable = output as unknown as Record<string, SettingValue>;

  for (const key of STRING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) writable[key] = String(source[key] ?? "");
  }
  for (const key of BOOLEAN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) writable[key] = source[key] === true;
  }
  if (Object.prototype.hasOwnProperty.call(source, "maxPlayers")) output.maxPlayers = Number(source.maxPlayers);

  output.schemaVersion = DEFAULTS.schemaVersion;
  output.serverMode = GAME_MODES.some((mode) => mode.id === output.serverMode) ? output.serverMode : DEFAULTS.serverMode;
  output.maxPlayers = Number.isInteger(output.maxPlayers) && output.maxPlayers >= 1 && output.maxPlayers <= 64 ? output.maxPlayers : DEFAULTS.maxPlayers;
  output.restartTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(output.restartTime) ? output.restartTime : DEFAULTS.restartTime;
  output.restartTimezone = isValidTimezone(output.restartTimezone) ? output.restartTimezone : DEFAULTS.restartTimezone;
  return output;
}

const PLUGINS: any[] = [
  { id: "metamod", name: "Metamod", detail: "Native plugin loader", locked: true, enabled: true, dependencies: [] },
  { id: "counterstrikesharp", name: "CounterStrikeSharp", detail: "Admin and managed plugin framework", locked: true, enabled: true, dependencies: ["Metamod"] },
  { id: "fake-rcon", name: "Fake RCON", detail: "In-game RCON bridge", settingKey: "fakeRconEnabled", dependencies: ["Metamod"] },
  { id: "simpleadmin", name: "SimpleAdmin", detail: "Additional moderation commands", settingKey: "simpleAdminEnabled", dependencies: ["CounterStrikeSharp", "PlayerSettings", "AnyBaseLib", "MenuManager"], warning: "Configure its database or SQLite settings after the first start." },
  { id: "weaponpaints", name: "WeaponPaints", detail: "Cosmetic weapon inventory", settingKey: "weaponPaintsEnabled", dependencies: ["CounterStrikeSharp", "PlayerSettings", "AnyBaseLib", "MenuManager", "MySQL"], warning: "Experimental plugin. It disables CounterStrikeSharp's server-guideline guard and may put the GSLT at risk." },
  { id: "fortnite-emotes", name: "Fortnite Emotes", detail: "Emote and dance commands", settingKey: "fortniteEmotesEnabled", dependencies: ["CounterStrikeSharp", "MultiAddonManager", "RayTrace", "Workshop addon"] },
  { id: "workshop-maps", name: "Workshop maps", detail: "Mount configured Workshop map addons", settingKey: "workshopMapsEnabled", dependencies: ["MultiAddonManager"] }
];

export function buildControlModel(input) {
  const settings = normalizeSettings(input);
  const mode = GAME_MODES.find((item) => item.id === settings.serverMode)!;
  const modePlugin = ["vanilla", "warmup"].includes(mode.id) ? [] : [{ id: mode.id, name: mode.name, detail: mode.description, enabled: true, locked: true, settingKey: null, dependencies: ["CounterStrikeSharp"], warning: null }];
  const plugins = [...modePlugin, ...PLUGINS.map((plugin) => ({
    ...plugin,
    enabled: plugin.locked ? true : settings[plugin.settingKey],
    settingKey: plugin.settingKey || null,
    warning: plugin.warning || null
  }))];
  return {
    mode, modes: GAME_MODES, plugins, settingsGroups: SETTINGS_GROUPS, adminRoles: ADMIN_ROLES,
    rules: ["MatchZy-based modes and Executes are mutually exclusive.", "Nades starts MatchZy practice mode automatically.", "Warmup starts Aim Botz as a dedicated Workshop map.", "CounterStrikeSharp is the single source of admin permissions.", "Plugin dependencies are installed and removed automatically."]
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
