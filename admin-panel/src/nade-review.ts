import { sanitizeNades } from "./validators.js";

// Requests originate from the game plugin, which supplies the authenticated Steam ID.
// Never let a game request set ownership, official status, Must Know or coordinates.
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
  else if (["displayName", "desc"].includes(request.action)) {
    const max = request.action === "displayName" ? 120 : 300;
    if (typeof request.value !== "string" || !request.value.trim() || request.value.length > max || /[\u0000-\u001f\u007f]/.test(request.value))
      throw new Error("Name oder Beschreibung ist ungültig.");
    patch = { [request.action]: request.value.trim(), reviewStatus: "" };
  } else throw new Error("Unbekannte Aufnahme-Aktion.");
  next[index] = { ...entry, ...patch, updatedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1 || 0)).toISOString() };
  return sanitizeNades(next);
}
