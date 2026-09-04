export type MapCategory = "active" | "reserve" | "community" | "workshop";

export type MapDefinition = {
  key: string;
  name: string;
  mapName: string;
  category: MapCategory;
  sketch: number;
  workshopId?: string;
};

export type WorkshopMapInput = {
  title: string;
  mapName: string;
  workshopId: string;
};

export const ACTIVE_DUTY_MAPS: MapDefinition[] = [
  { key: "mirage", name: "Mirage", mapName: "de_mirage", category: "active", sketch: 0 },
  { key: "dust2", name: "Dust II", mapName: "de_dust2", category: "active", sketch: 1 },
  { key: "nuke", name: "Nuke", mapName: "de_nuke", category: "active", sketch: 2 },
  { key: "inferno", name: "Inferno", mapName: "de_inferno", category: "active", sketch: 3 },
  { key: "ancient", name: "Ancient", mapName: "de_ancient", category: "active", sketch: 4 },
  { key: "anubis", name: "Anubis", mapName: "de_anubis", category: "active", sketch: 5 },
  { key: "cache", name: "Cache", mapName: "de_cache", category: "active", sketch: 6 }
];

export const CSNADES_REFERENCE_MAPS: MapDefinition[] = [
  { key: "overpass", name: "Overpass", mapName: "de_overpass", category: "reserve", sketch: 7 },
  { key: "train", name: "Train", mapName: "de_train", category: "reserve", sketch: 8 },
  { key: "vertigo", name: "Vertigo", mapName: "de_vertigo", category: "reserve", sketch: 9 },
  { key: "office", name: "Office", mapName: "cs_office", category: "reserve", sketch: 10 },
  { key: "agency", name: "Agency", mapName: "cs_agency", category: "community", sketch: 11 },
  { key: "grail", name: "Grail", mapName: "de_grail", category: "community", sketch: 12 },
  { key: "jura", name: "Jura", mapName: "de_jura", category: "community", sketch: 13 },
  { key: "italy", name: "Italy", mapName: "cs_italy", category: "community", sketch: 14 },
  { key: "thera", name: "Thera", mapName: "de_thera", category: "community", sketch: 15 },
  { key: "mills", name: "Mills", mapName: "de_mills", category: "community", sketch: 16 },
  { key: "contact", name: "Contact", mapName: "de_contact", category: "community", sketch: 17 }
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
      if (!workshopId || !title || !mapName) return [];
      return [{ workshopId, title, mapName }];
    });
  } catch {
    return [];
  }
}

export function workshopMapsFromSettings(settings): MapDefinition[] {
  const ids = parseWorkshopIds(settings?.workshopMaps || "");
  const metadata = new Map(parseCatalog(settings?.workshopMapCatalog || "[]").map((entry) => [entry.workshopId, entry]));
  return ids.map((workshopId, index) => {
    const entry = metadata.get(workshopId);
    return {
      key: `workshop-${workshopId}`,
      name: entry?.title || `Workshop ${workshopId}`,
      mapName: entry?.mapName || "",
      category: "workshop",
      workshopId,
      sketch: 18 + index
    };
  });
}

export function addWorkshopMap(settings, input: WorkshopMapInput) {
  const workshopId = extractWorkshopId(input.workshopId);
  if (!workshopId) throw new Error("Enter a valid Steam Workshop ID or item URL.");
  const title = String(input.title || "").trim();
  const mapName = String(input.mapName || "").trim();
  if (!title) throw new Error("Display name is required.");
  if (!/^[a-z0-9_]+$/i.test(mapName)) throw new Error("Game map name may contain only letters, numbers and underscores.");

  const ids = parseWorkshopIds(settings?.workshopMaps || "");
  if (!ids.includes(workshopId)) ids.push(workshopId);
  const catalog = parseCatalog(settings?.workshopMapCatalog || "[]").filter((entry) => entry.workshopId !== workshopId);
  catalog.push({ workshopId, title, mapName });
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
