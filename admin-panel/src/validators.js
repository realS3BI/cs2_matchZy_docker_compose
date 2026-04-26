import { FLAG_PRESETS } from "./defaults.js";

const STEAM64_RE = /^[0-9]{17}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
