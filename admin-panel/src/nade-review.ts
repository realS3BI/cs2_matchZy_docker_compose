import { sanitizeNades } from "./validators.js";
import { LINEUP_EDIT_FIELDS, lineupPermissions } from "../shared/lineup-policy.js";
import { THROW_FLAGS } from "../shared/throw-attributes.js";

function reject(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

// The actor always comes from the authenticated session, never the request body.
export function applyWebNadeAction(entries, request, user) {
  if (!request || ![request.owner, request.map, request.name].every(value => typeof value === "string" && value.length > 0 && value.length <= 500))
    reject(400, "Ungültiges Lineup.");
  const index = entries.findIndex(n => n.owner === request.owner && n.map === request.map && n.name === request.name);
  if (index < 0) reject(404, "Dieses Lineup ist nicht mehr verfügbar.");
  const entry = entries[index];
  const permissions = lineupPermissions(entry, user);
  const ownerAction = ["edit", "delete", "submit"].includes(request.action);
  const adminAction = ["approve", "reject", "revoke", "mustKnow"].includes(request.action);
  if (!ownerAction && !adminAction) reject(400, "Unbekannte Lineup-Aktion.");
  const allowed = request.action === "delete" ? permissions.delete : ownerAction ? permissions.edit : permissions.moderate;
  if (!allowed) {
    if (request.action === "delete") reject(403, "Nur der Ersteller seiner noch nicht offiziellen Aufnahme oder ein Plattform-Admin darf dieses Lineup löschen.");
    reject(403, ownerAction ? "Nur der Ersteller darf seine noch nicht offiziellen Aufnahmen ändern." : "Nur Plattform-Admins dürfen Lineups freigeben.");
  }
  if (typeof request.revision !== "string" || request.revision !== (entry.updatedAt || ""))
    reject(409, "Das Lineup wurde inzwischen geändert. Lade es erneut, bevor du fortfährst.");
  const next = [...entries];
  if (request.action === "delete") { next.splice(index, 1); return next; }
  let patch;
  if (request.action === "edit") {
    if (!request.patch || typeof request.patch !== "object" || Array.isArray(request.patch) ||
        Object.keys(request.patch).some(key => !LINEUP_EDIT_FIELDS.includes(key as any)))
      reject(400, "Diese Felder dürfen nicht geändert werden.");
    for (const [key, value] of Object.entries(request.patch)) {
      if (["radarFrom", "radarTo"].includes(key) || THROW_FLAGS.includes(key as any)) continue;
      const limit = key === "desc" ? 4000 : key === "throwTechnique" ? 500 : 120;
      if (typeof value !== "string" || value.length > limit) reject(400, "Ein Textfeld ist ungültig oder zu lang.");
    }
    patch = { ...request.patch, reviewStatus: "" };
  } else if (request.action === "submit") patch = { reviewStatus: "pending" };
  else if (request.action === "approve") patch = { official: true, reviewStatus: "approved" };
  else if (request.action === "reject") {
    if (entry.official || entry.reviewStatus !== "pending") reject(400, "Nur eingereichte Aufnahmen können abgelehnt werden.");
    patch = { official: false, mustKnow: false, reviewStatus: "rejected" };
  } else if (request.action === "revoke") patch = { official: false, mustKnow: false, reviewStatus: "" };
  else {
    if (!entry.official || typeof request.value !== "boolean") reject(400, "Must Know setzt ein offiziell freigegebenes Lineup voraus.");
    patch = { mustKnow: request.value };
  }
  try {
    [next[index]] = sanitizeNades([{ ...entry, ...patch,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1 || 0)).toISOString(),
    }]);
  } catch {
    reject(400, "Ungültige Wurfdaten. Prüfe Name, Seite, Granatentyp, Koordinaten (je drei Zahlen) und Radarpositionen.");
  }
  if (["lineupPos", "lineupAng", "type"].some(key => entry[key] !== next[index][key])) delete next[index].flightDuration;
  return next;
}

// Requests originate from the game plugin, which supplies the authenticated Steam ID.
// Never let a game request set ownership, official status, Must Know or measured flight time.
export function applyPlayerNadeRequest(entries, request) {
  if (!request || !/^[0-9a-f]{32}$/.test(request.id || "") || !/^[0-9]{17}$/.test(request.actor || "") ||
      request.actor !== request.owner) throw new Error("Ungültiger Ersteller der Anfrage.");
  const index = entries.findIndex(n => n.owner === request.owner && n.map === request.map && n.name === request.name);
  const entry = entries[index];
  if (!entry || entry.owner === "default" || entry.official) throw new Error("Nur eigene, noch nicht offizielle Aufnahmen können geändert werden.");
  if (!request.revision || request.revision !== entry.updatedAt) throw new Error("Die Aufnahme wurde inzwischen geändert. Bitte erneut öffnen.");
  const next = [...entries];
  if (request.action === "delete") { next.splice(index, 1); return next; }
  let patch;
  if (request.action === "review") patch = { reviewStatus: "pending" };
  else if (THROW_FLAGS.includes(request.action)) {
    if (typeof request.value !== "boolean") throw new Error("Das Wurfattribut muss ein Boolean sein.");
    patch = { [request.action]: request.value, reviewStatus: "" };
  } else if (["displayName", "desc", "team", "throwFromTitle", "throwToTitle", "throwTechnique", "click_type", "type", "lineupPos", "lineupAng", "landingPos"].includes(request.action)) {
    const max = request.action === "desc" ? 300 : request.action === "throwTechnique" ? 500 : 120;
    const mayClear = ["desc", "throwFromTitle", "throwToTitle", "throwTechnique"].includes(request.action);
    if (typeof request.value !== "string" || (!mayClear && !request.value.trim()) || request.value.length > max || /[\u0000-\u001f\u007f]/.test(request.value))
      throw new Error("Der eingegebene Wert ist ungültig oder zu lang.");
    patch = { [request.action]: request.value.trim(), reviewStatus: "" };
  } else throw new Error("Unbekannte Aufnahme-Aktion.");
  next[index] = { ...entry, ...patch, updatedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1 || 0)).toISOString() };
  if (["lineupPos", "lineupAng", "type"].includes(request.action) && entry[request.action] !== next[index][request.action])
    delete next[index].flightDuration;
  return sanitizeNades(next);
}
