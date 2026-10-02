import { canUploadReviewMedia, isReviewSlot, reviewFileError, type ReviewMedia } from "../shared/review-media.js";

function reject(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }

export function sanitizeReviewMedia(value: unknown): ReviewMedia {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Ungültige Review-Medien.");
  const result: ReviewMedia = {};
  for (const [slot, file] of Object.entries(value)) {
    if (!isReviewSlot(slot) || !file || typeof file !== "object") throw new Error("Ungültiger Aufnahmeschritt.");
    const url = new URL(file.url);
    if (url.protocol !== "https:" || url.username || url.password || !/^[a-z0-9-]+\.ufs\.sh$/.test(url.hostname) ||
        !/^[\w-]{1,256}$/.test(file.key) || url.pathname !== `/f/${file.key}` || url.search || url.hash ||
        typeof file.name !== "string" || file.name.length > 256 || !/^\d{17}$/.test(file.uploadedBy) ||
        !Number.isFinite(Date.parse(file.uploadedAt)) || reviewFileError(slot, { type: file.mime, size: file.size }))
      throw new Error("Ungültige Review-Datei.");
    result[slot] = { key: file.key, url: file.url, name: file.name, size: file.size, mime: file.mime, uploadedAt: file.uploadedAt, uploadedBy: file.uploadedBy };
  }
  return result;
}

export function reviewEntry(entries, reference, user) {
  if (!reference || ![reference.owner, reference.map, reference.name].every(v => typeof v === "string" && v.length > 0 && v.length <= 500)) reject(400, "Ungültiges Lineup.");
  const entry = entries.find(n => n.owner === reference.owner && n.map === reference.map && n.name === reference.name);
  if (!entry) reject(404, "Dieses Lineup ist nicht mehr verfügbar.");
  if (!canUploadReviewMedia(entry, user)) reject(403, "Nur der Ersteller oder ein Plattform-Admin darf Review-Medien ergänzen. Offizielle Lineups sind gesperrt.");
  return entry;
}

// Only the verified UploadThing callback supplies files. Client URLs never enter this path.
export function attachReviewMedia(entries, input, user, file) {
  const entry = reviewEntry(entries, input, user);
  if (!isReviewSlot(input.slot)) reject(400, "Ungültiger Aufnahmeschritt.");
  if (entry.reviewMedia?.[input.slot]?.key === file.key) return entries; // Callback retry.
  if (typeof input.revision !== "string" || input.revision !== entry.updatedAt) reject(409, "Das Lineup wurde während des Uploads geändert. Bitte aktualisieren und erneut hochladen.");
  const reviewMedia = sanitizeReviewMedia({ ...entry.reviewMedia, [input.slot]: { ...file, uploadedBy: user.identitySteam64 } });
  return entries.map(n => n === entry ? { ...entry, reviewMedia,
    reviewStatus: user.role === "admin" ? entry.reviewStatus : "",
    updatedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1 || 0)).toISOString(),
  } : n);
}
