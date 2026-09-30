import { api } from "./api.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordList(value) {
  return Array.isArray(value) && value.every(isRecord);
}

export async function fetchUsers() {
  const result = await api("/api/users");
  if (!isRecord(result) || !isRecordList(result.entries) ||
      !result.entries.every(user => typeof user.identitySteam64 === "string" && typeof user.role === "string")) {
    throw new Error("Die Benutzerliste konnte nicht geladen werden: Der Server hat eine unvollständige Antwort geliefert.");
  }
  return result.entries;
}

export async function fetchDiagnostics() {
  const result = await api("/api/server/diagnostics");
  if (!isRecord(result) || ![result.versions, result.checks, result.findings].every(isRecordList) ||
      !isRecord(result.service) || !isRecord(result.nades) ||
      (result.plugins != null && (!isRecordList(result.plugins) || !result.plugins.every(plugin => Array.isArray(plugin.missingFiles))))) {
    throw new Error("Der Diagnosebericht konnte nicht geladen werden: Der Server hat eine unvollständige Antwort geliefert.");
  }
  return result;
}
