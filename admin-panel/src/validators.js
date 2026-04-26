import { FLAG_PRESETS } from "./defaults.js";

const STEAM64_RE = /^[0-9]{17}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAMES_WITHOUT_SLASHES_RE = /^[^\\/]+$/;
const VECTOR_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)\s+-?(?:\d+(?:\.\d+)?|\.\d+)\s+-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const NADE_TYPES = new Set(["", "Smoke", "Flash", "HE", "Molly", "Decoy"]);

export function sanitizeEnv(input) {
  const output = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [key, value] of Object.entries(source)) {
    if (!ENV_KEY_RE.test(key)) {
      throw new Error(`Invalid env key: ${key}`);
    }
    output[key] = String(value ?? "");
  }
  return output;
}

export function sanitizeAdmins(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Admins must be an array");
  }

  const seen = new Set();
  return entries.map((entry) => {
    const name = String(entry.name ?? "").trim();
    const identitySteam64 = String(entry.identitySteam64 ?? "").trim();
    const flags = Array.isArray(entry.flags) ? entry.flags.map((flag) => String(flag).trim()).filter(Boolean) : [];

    if (!STEAM64_RE.test(identitySteam64)) {
      throw new Error(`Invalid Steam64 ID: ${identitySteam64 || "(empty)"}`);
    }
    if (seen.has(identitySteam64)) {
      throw new Error(`Duplicate Steam64 ID: ${identitySteam64}`);
    }
    seen.add(identitySteam64);
    for (const flag of flags) {
      if (!FLAG_PRESETS.includes(flag) && !flag.startsWith("@custom/")) {
        throw new Error(`Invalid admin flag: ${flag}`);
      }
    }

    return {
      name,
      identitySteam64,
      flags: flags.length > 0 ? flags : ["@css/root"]
    };
  });
}

export function adminsToCssConfig(entries) {
  const config = {};
  for (const entry of sanitizeAdmins(entries)) {
    config[entry.identitySteam64] = {
      identity: entry.identitySteam64,
      flags: entry.flags
    };
  }
  return config;
}

export function adminsToMatchZyConfig(entries) {
  const config = {};
  for (const entry of sanitizeAdmins(entries)) {
    config[entry.identitySteam64] = "";
  }
  return config;
}

function normalizeVector(value, fieldName) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!VECTOR_RE.test(normalized)) {
    throw new Error(`${fieldName} must contain exactly 3 numeric values`);
  }
  return normalized;
}

function nadeId(entry) {
  const source = `${entry.owner}:${entry.map}:${entry.name}`;
  return source.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "nade";
}

export function sanitizeNades(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Nades must be an array");
  }

  const seen = new Set();
  return entries.map((entry) => {
    const name = String(entry.name ?? "").trim();
    const map = String(entry.map ?? "").trim();
    const type = String(entry.type ?? "").trim();
    const desc = String(entry.desc ?? "");
    const owner = String(entry.owner ?? "default").trim() || "default";
    const lineupPos = normalizeVector(entry.lineupPos, "Lineup position");
    const lineupAng = normalizeVector(entry.lineupAng, "Lineup angle");

    if (!name) {
      throw new Error("Nade name is required");
    }
    if (!NAMES_WITHOUT_SLASHES_RE.test(name)) {
      throw new Error(`Invalid nade name: ${name}`);
    }
    if (!map) {
      throw new Error("Nade map is required");
    }
    if (!NADE_TYPES.has(type)) {
      throw new Error(`Invalid nade type: ${type}`);
    }

    const duplicateKey = `${owner}\u0000${map}\u0000${name}`.toLowerCase();
    if (seen.has(duplicateKey)) {
      throw new Error(`Duplicate nade for ${map}: ${name}`);
    }
    seen.add(duplicateKey);

    const cleanEntry = {
      id: String(entry.id ?? "").trim(),
      name,
      map,
      type,
      desc,
      lineupPos,
      lineupAng,
      owner,
      updatedAt: String(entry.updatedAt ?? "").trim() || new Date().toISOString()
    };
    if (!cleanEntry.id) cleanEntry.id = nadeId(cleanEntry);
    return cleanEntry;
  });
}

export function nadesToMatchZySavedNadesConfig(entries) {
  const config = {};
  for (const entry of sanitizeNades(entries)) {
    if (!config[entry.owner]) config[entry.owner] = {};
    config[entry.owner][entry.name] = {
      LineupPos: entry.lineupPos,
      LineupAng: entry.lineupAng,
      Desc: entry.desc,
      Map: entry.map,
      Type: entry.type
    };
  }
  return config;
}

export function matchZySavedNadesConfigToNades(config) {
  const entries = [];
  const source = config && typeof config === "object" && !Array.isArray(config) ? config : {};

  for (const [ownerKey, ownerNades] of Object.entries(source)) {
    if (!ownerNades || typeof ownerNades !== "object" || Array.isArray(ownerNades)) continue;
    const owner = String(ownerKey || "default").trim() || "default";
    for (const [name, nade] of Object.entries(ownerNades)) {
      if (!nade || typeof nade !== "object" || Array.isArray(nade)) continue;
      const entry = {
        name,
        map: nade.Map,
        type: nade.Type || "",
        desc: nade.Desc || "",
        lineupPos: nade.LineupPos,
        lineupAng: nade.LineupAng,
        owner
      };
      entries.push({ ...entry, id: nadeId({ ...entry, map: String(entry.map ?? ""), name: String(name ?? ""), owner }) });
    }
  }

  return sanitizeNades(entries);
}
