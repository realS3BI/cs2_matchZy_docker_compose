import { type MapDefinition, type RadarPoint } from "./maps.js";
export type RadarLevel = "upper" | "lower";

export function radarCanvasSize(map: MapDefinition) {
  return { width: map.radarWidth || 1024, height: map.radarHeight || 1024 };
}

export function radarPointVisible(map: MapDefinition, point: RadarPoint, level: RadarLevel) {
  return !map.radarLowerUrl || (point.level || "upper") === level;
}

// Both images retain their original local XY; clicks record the selected floor.
export function radarInputPoint(map: MapDefinition, point: RadarPoint, level: RadarLevel): RadarPoint {
  if (!map.radarLowerUrl) return point;
  return { ...point, level };
}
