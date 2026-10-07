import { type MapDefinition } from "../lib/maps";
import { type RadarLevel } from "../lib/radar-layout";

// Shared by the library, details and placement editor; all use the same layout.
export function RadarBackground({ map, level = "upper" }: { map: MapDefinition; level?: RadarLevel }) {
  const width = map.radarWidth || 1024, height = map.radarHeight || 1024;
  const url = level === "lower" && map.radarLowerUrl ? map.radarLowerUrl : map.radarUrl;
  // A reused SVG image keeps its old bitmap until the new URL loads, stretching
  // the previous map to the new dimensions. Replace it when the source changes.
  return <image key={url} href={url}
    width={width} height={height} preserveAspectRatio="none" />;
}
