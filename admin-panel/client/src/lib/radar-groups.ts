import { lineupId, lineupKey, type LineupReference } from "./lineups.js";
import { type MapDefinition, type RadarPoint } from "./maps.js";
import { resolveRadarPoints, type PositionedNade, type RadarCalibration } from "./nade-radar.js";

export type RadarSide = "from" | "to";
export type RadarLineup = LineupReference & PositionedNade & {
  type?: string; team?: string; displayName?: string; throwFromTitle?: string; throwToTitle?: string;
};
export type RadarGroup<T extends RadarLineup = RadarLineup> = {
  id: string; point: RadarPoint; title: string; nades: T[];
};

// Cluster in image space, accounting for non-square radars. Every pair must be
// close: a chain of adjacent points must not swallow an entire bombsite.
export function groupRadarNades<T extends RadarLineup>(nades: T[], side: RadarSide, map: MapDefinition, calibration: RadarCalibration | null): RadarGroup<T>[] {
  const width = map.radarWidth || 1024, height = map.radarHeight || 1024;
  const extent = Math.max(width, height);
  const distance = (a: RadarPoint, b: RadarPoint) => Math.hypot((a.x - b.x) * width / extent, (a.y - b.y) * height / extent);
  const groups: { nades: T[]; points: RadarPoint[] }[] = [];
  for (const nade of [...nades].sort((a, b) => lineupKey(a).localeCompare(lineupKey(b)))) {
    const resolved = resolveRadarPoints(nade, calibration);
    const point = side === "from" ? resolved.radarFrom : resolved.radarTo;
    if (!point) continue;
    const group = groups.find(group => group.points.every(other => distance(point, other) <= 0.035));
    if (group) { group.nades.push(nade); group.points.push(point); }
    else groups.push({ nades: [nade], points: [point] });
  }
  return groups.map(({ nades, points }) => ({
    id: lineupId(nades[0]), nades,
    point: { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length },
    title: [...new Set(nades.map(n => side === "from" ? n.throwFromTitle : n.throwToTitle).filter(Boolean))].join(" / ") || (side === "from" ? "Startposition" : "Landeposition"),
  }));
}

export function findRadarGroup<T extends RadarLineup>(groups: RadarGroup<T>[], id: string | null) {
  return id ? groups.find(group => group.nades.some(nade => lineupId(nade) === id)) : undefined;
}
