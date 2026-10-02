export const REVIEW_STEPS = [
  { id: "aim", title: "Ausrichtung", short: "Lineup", description: "Zeige aus der Ego-Perspektive genau, worauf das Fadenkreuz zielt. Orientierungspunkte müssen gut erkennbar sein." },
  { id: "position", title: "Standposition", short: "Position", description: "Zeige den Boden und die Kanten, an denen du dich für den Wurf positionierst." },
  { id: "front", title: "Vorderansicht", short: "Vorne", description: "Zeige die Spielfigur von vorne in Third Person, zusammen mit ihrer unmittelbaren Umgebung." },
  { id: "effect", title: "Wirkung am Ziel", short: "Wirkung", description: "Wirf die Granate und zeige den tatsächlichen Effekt am Ziel ohne Fadenkreuz. Bei einer Smoke muss die Rauchwolke vollständig sichtbar sein." },
  { id: "video", title: "Den ganzen Wurf zeigen", short: "Video", description: "Laufe zum Startpunkt, richte das Fadenkreuz aus und wirf. Fliege anschließend mit Noclip zum Ziel und zeige die Wirkung." },
] as const;
export type ReviewSlot = typeof REVIEW_STEPS[number]["id"];

export const REVIEW_DETAIL_FIELDS = [
  { key: "displayName", label: "Name" },
  { key: "desc", label: "Beschreibung" },
  { key: "throwFromTitle", label: "Startposition" },
  { key: "throwToTitle", label: "Endposition" },
] as const;
export function missingReviewDetails(nade: { name?: string; displayName?: string; desc?: string; throwFromTitle?: string; throwToTitle?: string }) {
  return REVIEW_DETAIL_FIELDS.filter(field => !(field.key === "displayName" ? nade.displayName?.trim() || nade.name?.trim() : nade[field.key]?.trim())).map(field => field.label);
}

export function reviewUploadName(reference: { map: string; name: string }, slot: ReviewSlot, type: string, time = Date.now()) {
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/webm": "webm", "video/mp4": "mp4" };
  const extension = extensions[type];
  if (!extension) throw new Error("Unbekanntes Aufnahmeformat.");
  const segment = (value: string, limit: number) => {
    const cleaned = value.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
    let result = "", bytes = 0;
    for (const char of cleaned) {
      bytes += new TextEncoder().encode(char).length;
      if (bytes > limit) break;
      result += char;
    }
    return result || "unbekannt";
  };
  const stamp = new Date(time).toISOString().replace(/[-:.]/g, "");
  return `${segment(reference.map, 40)}__${segment(reference.name, 100)}__${slot}__${stamp}.${extension}`;
}
export function reviewPresentationError(slot: ReviewSlot, presentation?: string) {
  if (slot === "front" && presentation !== "review-v6")
    return "Die Vorderansicht benötigt Server-Plugin 2.3.4 oder neuer. CS2-Image neu bauen und deployen; hud.cmd aktualisiert die lokale App und das Panorama-Panel.";
  if (!["review-v2", "review-v3", "review-v4", "review-v5", "review-v6"].includes(presentation || ""))
    return "Bitte das Server-Plugin aktualisieren. Die ältere Version blendet das echte Fadenkreuz noch aus.";
  return "";
}
export type ReviewMedia = Partial<Record<ReviewSlot, {
  key: string; url: string; name: string; size: number; mime: string; uploadedAt: string; uploadedBy: string;
}>>;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm"];
export const PHOTO_LIMIT = 8 * 1024 * 1024;
export const VIDEO_LIMIT = 128 * 1024 * 1024;
export function isReviewSlot(value: unknown): value is ReviewSlot {
  return REVIEW_STEPS.some(step => step.id === value);
}
export function missingReviewMedia(nade: { reviewMedia?: ReviewMedia }) {
  return REVIEW_STEPS.filter(step => !nade.reviewMedia?.[step.id]);
}
export function canUploadReviewMedia(nade: { owner: string; official?: boolean }, user?: { identitySteam64: string; role: string }) {
  return !!user && !nade.official && (user.role === "admin" || nade.owner !== "default" && nade.owner === user.identitySteam64);
}
export function reviewFileError(slot: ReviewSlot, file: { type: string; size: number }) {
  const video = slot === "video";
  if (!(video ? VIDEO_TYPES : PHOTO_TYPES).includes(file.type)) return video ? "Bitte ein MP4- oder WebM-Video auswählen." : "Bitte ein JPEG-, PNG- oder WebP-Bild auswählen.";
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > (video ? VIDEO_LIMIT : PHOTO_LIMIT)) return video ? "Das Video darf höchstens 128 MB groß sein." : "Das Bild darf höchstens 8 MB groß sein.";
  return "";
}
