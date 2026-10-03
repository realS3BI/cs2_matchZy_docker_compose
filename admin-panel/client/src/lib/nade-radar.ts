import { isRadarPoint, mapMatchesNade, type MapDefinition, type RadarPoint } from "./maps.js";

export type RadarCalibration = { xScale: number; xOffset: number; yScale: number; yOffset: number };
export type PositionedNade = {
  lineupPos?: string; landingPos?: string;
  radarFrom?: RadarPoint | null; radarTo?: RadarPoint | null;
};

// Valve overview: pos_x=-2796, pos_y=3328, scale=5.22 (1024px).
// The bundled CSNADES Anubis image crops/resizes that overview. Registration against
// the extracted game radar (94 matching features) gives this pixel transform.
// Source: https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/data/radar_info/de_anubis.txt
const ANUBIS_RADAR: RadarCalibration = {
  xScale: 2.07353388 / (5.22 * 2048), xOffset: (2796 / 5.22 * 2.07353388 - 46.5108868) / 2048,
  yScale: -2.07353388 / (5.22 * 2048), yOffset: (3328 / 5.22 * 2.07353388 - 25.9679913) / 2048,
};

function coordinates(value: string | undefined) {
  const parts = String(value || "").trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
}

// The bundled CSNADES images are cropped, not Valve's square overview textures.
// Calibrate against saved manual references on this exact image instead of guessing its bounds.
export function inferRadarCalibration(map: MapDefinition, nades: (PositionedNade & { map?: string })[]): RadarCalibration | null {
  // Nuke's bundled radar lays two floors side by side. A single XY transform would be misleading.
  if (map.mapName === "de_nuke") return null;
  const refs: { world: number[]; radar: RadarPoint }[] = [];
  for (const nade of nades.filter(n => mapMatchesNade(map, n.map || ""))) {
    for (const [pos, point] of [[nade.lineupPos, nade.radarFrom], [nade.landingPos, nade.radarTo]] as const) {
      const world = coordinates(pos);
      if (world && isRadarPoint(point)) refs.push({ world, radar: point });
    }
  }
  if (refs.length < 2) return map.mapName === "de_anubis" && map.radarUrl === "/maps/anubis.webp" ? ANUBIS_RADAR : null;
  function fit(axis: 0 | 1, key: "x" | "y") {
    const meanWorld = refs.reduce((sum, r) => sum + r.world[axis], 0) / refs.length;
    const meanRadar = refs.reduce((sum, r) => sum + r.radar[key], 0) / refs.length;
    const spanWorld = Math.max(...refs.map(r => r.world[axis])) - Math.min(...refs.map(r => r.world[axis]));
    const spanRadar = Math.max(...refs.map(r => r.radar[key])) - Math.min(...refs.map(r => r.radar[key]));
    if (spanWorld < 256 || spanRadar < 0.1) return null;
    const variance = refs.reduce((sum, r) => sum + (r.world[axis] - meanWorld) ** 2, 0);
    const scale = refs.reduce((sum, r) => sum + (r.world[axis] - meanWorld) * (r.radar[key] - meanRadar), 0) / variance;
    const offset = meanRadar - scale * meanWorld;
    if (!Number.isFinite(scale) || (axis === 0 ? scale <= 0 : scale >= 0)) return null;
    // Inconsistent references must be corrected, never silently used to place more markers.
    if (refs.some(r => Math.abs(r.world[axis] * scale + offset - r.radar[key]) > 0.02)) return null;
    return { scale, offset };
  }
  const x = fit(0, "x"), y = fit(1, "y");
  return x && y ? { xScale: x.scale, xOffset: x.offset, yScale: y.scale, yOffset: y.offset } : null;
}

export function worldToRadar(position: string | undefined, calibration: RadarCalibration | null): RadarPoint | null {
  const world = coordinates(position);
  if (!world || !calibration) return null;
  const point = { x: world[0] * calibration.xScale + calibration.xOffset, y: world[1] * calibration.yScale + calibration.yOffset };
  // Do not clamp off-map coordinates onto a false point on the image edge.
  return isRadarPoint(point) ? point : null;
}

export function resolveRadarPoints(nade: PositionedNade, calibration: RadarCalibration | null) {
  return {
    radarFrom: isRadarPoint(nade.radarFrom) ? nade.radarFrom : worldToRadar(nade.lineupPos, calibration),
    radarTo: isRadarPoint(nade.radarTo) ? nade.radarTo : worldToRadar(nade.landingPos, calibration)
  };
}
