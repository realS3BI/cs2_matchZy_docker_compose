export const REVIEW_STEPS = [
  { id: "aim", title: "Ausrichtung", short: "Lineup", description: "Zeige aus der Ego-Perspektive genau, worauf das Fadenkreuz zielt. Orientierungspunkte müssen gut erkennbar sein." },
  { id: "position", title: "Standposition", short: "Position", description: "Zeige den Boden und die Kanten, an denen du dich für den Wurf positionierst." },
  { id: "front", title: "Vorderansicht", short: "Vorne", description: "Zeige die Spielfigur von vorne in Third Person, zusammen mit ihrer unmittelbaren Umgebung." },
  { id: "effect", title: "Wirkung am Ziel", short: "Wirkung", description: "Wirf die Granate und zeige den tatsächlichen Effekt am Ziel ohne Fadenkreuz. Bei einer Smoke muss die Rauchwolke vollständig sichtbar sein." },
  { id: "video", title: "Den ganzen Wurf zeigen", short: "Video", description: "Laufe zum Startpunkt, richte das Fadenkreuz aus und wirf. Fliege anschließend mit Noclip zum Ziel und zeige die Wirkung." },
] as const;
export type ReviewSlot = typeof REVIEW_STEPS[number]["id"];
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
