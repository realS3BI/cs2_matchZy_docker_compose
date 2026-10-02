import { mapMatchesNade, type MapDefinition } from "./maps.js";
import type { LineupReference } from "./lineups.js";
import type { ReviewMedia } from "../../../shared/review-media.js";

export const REVIEW_QUEUE_PATH = "/server/reviews";
export const REVIEW_FILTERS = [
  { value: "all", label: "Alle offenen Reviews" },
  { value: "pending", label: "Zum Review eingereicht" },
  { value: "open", label: "Review ausstehend" },
  { value: "rejected", label: "Überarbeitung angefragt" },
] as const;
export function reviewQueueStatus(search: URLSearchParams) {
  const status = search.get("status");
  return REVIEW_FILTERS.find(filter => filter.value === status)?.value ?? "pending";
}
export function reviewStatus(nade: { reviewStatus?: string }) {
  return nade.reviewStatus === "pending" ? "pending" : nade.reviewStatus === "rejected" ? "rejected" : "open";
}
export function reviewQueue<T extends LineupReference & { official?: boolean; reviewStatus?: string; displayName?: string; throwFromTitle?: string; throwToTitle?: string; type?: string; reviewMedia?: ReviewMedia }>(nades: T[], maps: MapDefinition[], search: URLSearchParams) {
  const selectedMap = search.get("map");
  const status = reviewQueueStatus(search);
  const query = (search.get("q") || "").trim().toLocaleLowerCase("de");
  return nades.filter(nade => !nade.official &&
    (!selectedMap || selectedMap === "all" || maps.some(map => map.key === selectedMap && mapMatchesNade(map, nade.map))) &&
    (status === "all" || reviewStatus(nade) === status) &&
    `${nade.displayName || nade.name} ${nade.map} ${nade.throwFromTitle || ""} ${nade.throwToTitle || ""}`.toLocaleLowerCase("de").includes(query)
  ).sort((a, b) => Number(b.reviewStatus === "pending") - Number(a.reviewStatus === "pending") ||
    a.map.localeCompare(b.map, "de") || (a.displayName || a.name).localeCompare(b.displayName || b.name, "de", { numeric: true }));
}
export function queueSearch(search: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ["map", "status", "q"]) if (search.get(key)) next.set(key, search.get(key)!);
  return next;
}
