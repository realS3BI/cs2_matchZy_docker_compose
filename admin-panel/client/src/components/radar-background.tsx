import { type MapDefinition } from "../lib/maps";
import { type RadarLevel } from "../lib/radar-layout";

// Shared by the library, details and placement editor; all use the same layout.
export function RadarBackground({ map, level = "upper" }: { map: MapDefinition; level?: RadarLevel }) {
  const width = map.radarWidth || 1024, height = map.radarHeight || 1024;
  return <image href={level === "lower" && map.radarLowerUrl ? map.radarLowerUrl : map.radarUrl}
    width={width} height={height} preserveAspectRatio="none" />;
}
