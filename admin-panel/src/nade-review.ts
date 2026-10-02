import { sanitizeNades } from "./validators.js";
import { LINEUP_EDIT_FIELDS, lineupPermissions } from "../shared/lineup-policy.js";
import { THROW_FLAGS, MOVEMENT_FLAGS, MOVEMENT_TYPES, movementPatch, type MovementType } from "../shared/throw-attributes.js";
import { randomUUID } from "node:crypto";
import { missingReviewMedia, missingReviewDetails } from "../shared/review-media.js";

function reject(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

// The actor always comes from the authenticated session, never the request body.
export function applyWebNadeAction(entries, request, user) {
  if (request?.action === "create") {
    if (user?.role !== "admin" || !/^[0-9]{17}$/.test(user.identitySteam64 || ""))
      reject(403, "Nur Plattform-Admins dürfen Nades manuell hinzufügen.");
    if (typeof request.map !== "string" || !request.map.trim() || request.map.length > 500 || /[\u0000-\u0020\u007f]/.test(request.map))
      reject(400, "Ungültige Map.");
    if (typeof request.patch?.displayName !== "string" || !request.patch.displayName.trim())
      reject(400, "Bitte gib einen Namen für die Nade ein.");
    const patch = validateWebNadePatch(request.patch);
    let entry;
    try {
      [entry] = sanitizeNades([{ ...patch, owner: user.identitySteam64, map: request.map,
        name: `web_${randomUUID()}`, official: false, mustKnow: false, reviewStatus: "",
      }]);
    } catch {
      reject(400, "Ungültige Wurfdaten. Prüfe Name, Seite, Granatentyp, Koordinaten (je drei Zahlen) und Radarpositionen.");
    }
    return [...entries, entry];
  }
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
    patch = { ...validateWebNadePatch(request.patch), reviewStatus: "" };
  } else if (request.action === "submit") patch = { reviewStatus: "pending" };
  else if (request.action === "approve") {
    if (missingReviewMedia(entry).length) reject(400, "Vor der Freigabe bitte die vier Review-Fotos und das Video ergänzen.");
    const missing = missingReviewDetails(entry);
    if (missing.length) reject(400, `Vor der Freigabe bitte ergänzen: ${missing.join(", ")}.`);
    patch = { official: true, reviewStatus: "approved" };
  }
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
  if (["lineupPos", "lineupAng", "type"].some(key => entry[key] !== next[index][key]) && !Object.hasOwn(patch, "flightDuration")) delete next[index].flightDuration;
  return next;
}

export function applyGameReviewDecision(entries, request, user) {
  if (!request || !/^[0-9a-f]{32}$/.test(request.id || "") || !/^[0-9]{17}$/.test(request.actor || "") ||
      !["approve", "reject"].includes(request.action) || user?.role !== "admin" || user.identitySteam64 !== request.actor)
    reject(403, "Nur Plattform-Admins dürfen Reviews abschließen.");
  return applyWebNadeAction(entries, request, user);
}

function validateWebNadePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      Object.keys(patch).some(key => !LINEUP_EDIT_FIELDS.includes(key as any)))
    reject(400, "Diese Felder dürfen nicht geändert werden.");
  for (const [key, value] of Object.entries(patch)) {
    if (key === "flightDuration") {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) reject(400, "Die Flugzeit muss eine endliche, nicht negative Sekundenzahl sein.");
      continue;
    }
    if (THROW_FLAGS.includes(key as any)) {
      if (typeof value !== "boolean") reject(400, "Das Wurfattribut muss ein Boolean sein.");
      continue;
    }
    if (["radarFrom", "radarTo"].includes(key)) continue;
    const limit = key === "desc" ? 4000 : 120;
    if (typeof value !== "string" || value.length > limit) reject(400, "Ein Textfeld ist ungültig oder zu lang.");
  }
  if (MOVEMENT_FLAGS.filter(key => patch[key] === true).length > 1) reject(400, "Wähle nur eine Bewegung: Gehen, Laufen oder Schrittwurf.");
  const movement = MOVEMENT_FLAGS.some(key => patch[key] === true)
    ? Object.fromEntries(MOVEMENT_FLAGS.map(key => [key, patch[key] === true])) : {};
  return { ...patch, ...movement, ...(Object.hasOwn(patch, "flightDuration") ? { flightDuration: patch.flightDuration ?? undefined } : {}) };
}

// Requests originate from the game plugin, which supplies the authenticated Steam ID.
// Never let a game request set ownership, official status or Must Know.
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
  else if (request.action === "movement") {
    if (!MOVEMENT_TYPES.includes(request.value)) throw new Error("Ungültige Bewegung.");
    patch = { ...movementPatch(request.value as MovementType), reviewStatus: "" };
  } else if (request.action === "flightDuration") {
    if (request.value !== null && (typeof request.value !== "number" || !Number.isFinite(request.value) || request.value < 0))
      throw new Error("Die Flugzeit muss eine endliche, nicht negative Sekundenzahl sein.");
    patch = { flightDuration: request.value ?? undefined, reviewStatus: "" };
  } else if (THROW_FLAGS.includes(request.action)) {
    if (typeof request.value !== "boolean") throw new Error("Das Wurfattribut muss ein Boolean sein.");
    patch = { ...(request.value && MOVEMENT_FLAGS.includes(request.action) ? Object.fromEntries(MOVEMENT_FLAGS.map(key => [key, key === request.action])) : { [request.action]: request.value }), reviewStatus: "" };
  } else if (["displayName", "desc", "team", "throwFromTitle", "throwToTitle", "click_type", "type", "lineupPos", "lineupAng", "landingPos"].includes(request.action)) {
    const max = request.action === "desc" ? 300 : 120;
    const mayClear = ["desc", "throwFromTitle", "throwToTitle"].includes(request.action);
    if (typeof request.value !== "string" || (!mayClear && !request.value.trim()) || request.value.length > max || /[\u0000-\u001f\u007f]/.test(request.value))
      throw new Error("Der eingegebene Wert ist ungültig oder zu lang.");
    patch = { [request.action]: request.value.trim(), reviewStatus: "" };
  } else throw new Error("Unbekannte Aufnahme-Aktion.");
  next[index] = { ...entry, ...patch, updatedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1 || 0)).toISOString() };
  if (["lineupPos", "lineupAng", "type"].includes(request.action) && entry[request.action] !== next[index][request.action])
    delete next[index].flightDuration;
  return sanitizeNades(next);
}
