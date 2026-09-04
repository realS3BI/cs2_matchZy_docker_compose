export type MapCategory = "active" | "reserve" | "community" | "workshop";

export type MapDefinition = {
  key: string;
  name: string;
  mapName: string;
  category: MapCategory;
  radarUrl?: string;
  radarWidth?: number;
  radarHeight?: number;
  sourceUrl?: string;
  workshopId?: string;
};

export type WorkshopMapInput = {
  title: string;
  mapName: string;
  workshopId: string;
  radarUrl?: string;
  radarWidth?: number;
  radarHeight?: number;
};

export type RadarPoint = {
  x: number;
  y: number;
};

export function isRadarPoint(value: unknown): value is RadarPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as RadarPoint;
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export const ACTIVE_DUTY_MAPS: MapDefinition[] = [
  { key: "mirage", name: "Mirage", mapName: "de_mirage", category: "active", radarUrl: "/maps/mirage.webp", radarWidth: 1374, radarHeight: 1196, sourceUrl: "https://csnades.gg/mirage" },
  { key: "dust2", name: "Dust II", mapName: "de_dust2", category: "active", radarUrl: "/maps/dust2.webp", radarWidth: 1516, radarHeight: 1619, sourceUrl: "https://csnades.gg/dust2" },
  { key: "nuke", name: "Nuke", mapName: "de_nuke", category: "active", radarUrl: "/maps/nuke.webp", radarWidth: 1558, radarHeight: 848, sourceUrl: "https://csnades.gg/nuke" },
  { key: "inferno", name: "Inferno", mapName: "de_inferno", category: "active", radarUrl: "/maps/inferno.webp", radarWidth: 1500, radarHeight: 1491, sourceUrl: "https://csnades.gg/inferno" },
  { key: "ancient", name: "Ancient", mapName: "de_ancient", category: "active", radarUrl: "/maps/ancient.webp", radarWidth: 1290, radarHeight: 1467, sourceUrl: "https://csnades.gg/ancient" },
  { key: "anubis", name: "Anubis", mapName: "de_anubis", category: "active", radarUrl: "/maps/anubis.webp", radarWidth: 2048, radarHeight: 2048, sourceUrl: "https://csnades.gg/anubis" },
  { key: "cache", name: "Cache", mapName: "de_cache", category: "active", radarUrl: "/maps/cache.webp", radarWidth: 2048, radarHeight: 1596, sourceUrl: "https://csnades.gg/cache" }
];

export const CSNADES_REFERENCE_MAPS: MapDefinition[] = [
  { key: "overpass", name: "Overpass", mapName: "de_overpass", category: "reserve", radarUrl: "/maps/overpass.webp", radarWidth: 1274, radarHeight: 1632, sourceUrl: "https://csnades.gg/overpass" },
  { key: "train", name: "Train", mapName: "de_train", category: "reserve", radarUrl: "/maps/train.webp", radarWidth: 1638, radarHeight: 1638, sourceUrl: "https://csnades.gg/train" },
  { key: "vertigo", name: "Vertigo", mapName: "de_vertigo", category: "reserve", radarUrl: "/maps/vertigo.webp", radarWidth: 1135, radarHeight: 1219, sourceUrl: "https://csnades.gg/vertigo" },
  { key: "office", name: "Office", mapName: "cs_office", category: "reserve", radarUrl: "/maps/office.webp", radarWidth: 2048, radarHeight: 1823, sourceUrl: "https://csnades.gg/office" },
  { key: "agency", name: "Agency", mapName: "cs_agency", category: "community", radarUrl: "/maps/agency.webp", radarWidth: 1024, radarHeight: 1024, sourceUrl: "https://csnades.gg/agency" },
  { key: "grail", name: "Grail", mapName: "de_grail", category: "community", radarUrl: "/maps/grail.webp", radarWidth: 2048, radarHeight: 2048, sourceUrl: "https://csnades.gg/grail" },
  { key: "jura", name: "Jura", mapName: "de_jura", category: "community", radarUrl: "/maps/jura.webp", radarWidth: 1679, radarHeight: 1843, sourceUrl: "https://csnades.gg/jura" },
  { key: "italy", name: "Italy", mapName: "cs_italy", category: "community", radarUrl: "/maps/italy.webp", radarWidth: 1830, radarHeight: 1830, sourceUrl: "https://csnades.gg/italy" },
  { key: "thera", name: "Thera", mapName: "de_thera", category: "community", radarUrl: "/maps/thera.webp", radarWidth: 1638, radarHeight: 1638, sourceUrl: "https://csnades.gg/thera" },
  { key: "mills", name: "Mills", mapName: "de_mills", category: "community", radarUrl: "/maps/mills.webp", radarWidth: 1698, radarHeight: 1698, sourceUrl: "https://csnades.gg/mills" },
  { key: "contact", name: "Contact", mapName: "de_contact", category: "community", radarUrl: "/maps/contact.webp", radarWidth: 2048, radarHeight: 2048, sourceUrl: "https://csnades.gg/contact" }
];

export const BUILT_IN_MAPS = [...ACTIVE_DUTY_MAPS, ...CSNADES_REFERENCE_MAPS];

export function extractWorkshopId(value: string) {
  const normalized = String(value || "").trim();
  if (/^\d+$/.test(normalized)) return normalized;
  const match = normalized.match(/[?&]id=(\d+)(?:$|[^\d])/);
  return match?.[1] || "";
}

export function parseWorkshopIds(value: string) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of String(value || "").split(/[\n,]+/)) {
    const id = extractWorkshopId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseCatalog(value: string): WorkshopMapInput[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const workshopId = extractWorkshopId(String(entry.workshopId || ""));
      const title = String(entry.title || "").trim();
      const mapName = String(entry.mapName || "").trim();
      const radarUrl = String(entry.radarUrl || "").trim();
      const radarWidth = Number(entry.radarWidth || 0);
      const radarHeight = Number(entry.radarHeight || 0);
      if (!workshopId || !title || !mapName) return [];
      return [{
        workshopId,
        title,
        mapName,
        ...(radarUrl && radarWidth > 0 && radarHeight > 0 ? { radarUrl, radarWidth, radarHeight } : {})
      }];
    });
  } catch {
    return [];
  }
}

export function workshopMapsFromSettings(settings): MapDefinition[] {
  const ids = parseWorkshopIds(settings?.workshopMaps || "");
  const metadata = new Map(parseCatalog(settings?.workshopMapCatalog || "[]").map((entry) => [entry.workshopId, entry]));
  return ids.map((workshopId) => {
    const entry = metadata.get(workshopId);
    return {
      key: `workshop-${workshopId}`,
      name: entry?.title || `Workshop ${workshopId}`,
      mapName: entry?.mapName || "",
      category: "workshop",
      workshopId,
      radarUrl: entry?.radarUrl,
      radarWidth: entry?.radarWidth,
      radarHeight: entry?.radarHeight
    };
  });
}

export function addWorkshopMap(settings, input: WorkshopMapInput) {
  const workshopId = extractWorkshopId(input.workshopId);
  if (!workshopId) throw new Error("Enter a valid Steam Workshop ID or item URL.");
  const title = String(input.title || "").trim();
  const mapName = String(input.mapName || "").trim();
  const radarUrl = String(input.radarUrl || "").trim();
  const radarWidth = Number(input.radarWidth || 0);
  const radarHeight = Number(input.radarHeight || 0);
  if (!title) throw new Error("Display name is required.");
  if (!/^[a-z0-9_]+$/i.test(mapName)) throw new Error("Game map name may contain only letters, numbers and underscores.");

  const ids = parseWorkshopIds(settings?.workshopMaps || "");
  if (!ids.includes(workshopId)) ids.push(workshopId);
  const catalog = parseCatalog(settings?.workshopMapCatalog || "[]").filter((entry) => entry.workshopId !== workshopId);
  catalog.push({
    workshopId,
    title,
    mapName,
    ...(radarUrl && radarWidth > 0 && radarHeight > 0 ? { radarUrl, radarWidth, radarHeight } : {})
  });
  return {
    workshopMaps: ids.join("\n"),
    workshopMapCatalog: JSON.stringify(catalog)
  };
}

export function removeWorkshopMap(settings, workshopId: string) {
  const ids = parseWorkshopIds(settings?.workshopMaps || "").filter((id) => id !== workshopId);
  const catalog = parseCatalog(settings?.workshopMapCatalog || "[]").filter((entry) => entry.workshopId !== workshopId);
  return {
    workshopMaps: ids.join("\n"),
    workshopMapCatalog: JSON.stringify(catalog)
  };
}

export function mapMatchesNade(map: MapDefinition, nadeMap: string) {
  const normalize = (value: string) => String(value || "").toLowerCase().replace(/^(de|cs)_/, "").replace(/[^a-z0-9]/g, "");
  return normalize(nadeMap) === normalize(map.mapName) || normalize(nadeMap) === normalize(map.name);
}
