import { type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Crosshair, MapPin, Target } from "lucide-react";
import { type MapDefinition } from "../lib/maps";
import { lineupKey } from "../lib/lineups";
import { type RadarGroup, type RadarLineup, type RadarSide } from "../lib/radar-groups";
import { radarMarkerAsset } from "../lib/nade-assets";
import { TEAM_LABELS, isLineupTeam } from "../../../shared/lineup-teams";
import { cn } from "../lib/utils";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

type Props = {
  map: MapDefinition; side: RadarSide; groups: RadarGroup[];
  selected?: RadarGroup; counterparts: RadarGroup[]; expanded?: RadarGroup;
  onSelect: (group: RadarGroup) => void; onExpand: (group: RadarGroup) => void;
  href: (nade: RadarLineup) => string;
};

export function RadarBrowser({ map, side, groups, selected, counterparts, expanded, onSelect, onExpand, href }: Props) {
  if (!map.radarUrl) return <Empty className="border"><EmptyHeader><MapPin /><EmptyTitle>Keine Radarkarte hinterlegt</EmptyTitle><EmptyDescription>Alle Lineups findest du in der Liste darunter.</EmptyDescription></EmptyHeader></Empty>;
  const width = map.radarWidth || 1024, height = map.radarHeight || 1024;
  function marker(group: RadarGroup, markerSide: RadarSide, secondary = false) {
    const active = group === selected || group === expanded;
    const asset = markerSide === "to" ? radarMarkerAsset(group.nades) : null;
    const team = group.nades.every(nade => nade.team === group.nades[0].team) ? group.nades[0].team : undefined;
    const teamLabel = isLineupTeam(team) ? ` · ${TEAM_LABELS[team]}` : "";
    const Icon = markerSide === "from" ? Crosshair : Target;
    return <button key={`${secondary}-${group.id}`} type="button"
      className={cn("radar-spot", markerSide === "from" && "radar-spot-from", active && "radar-spot-active", asset && "radar-spot-asset", group.nades.length > 1 && "radar-spot-stack")}
      data-team={team || "unassigned"}
      style={{ left: `${group.point.x * 100}%`, top: `${group.point.y * 100}%` }}
      aria-label={`${markerSide === "from" ? "Start" : "Ziel"}: ${group.title}, ${group.nades.length} ${group.nades.length === 1 ? "Lineup" : "Lineups"}${teamLabel}`}
      aria-pressed={active} aria-expanded={secondary ? group === expanded : undefined}
      title={`${group.title} · ${group.nades.length} Lineups`}
      onClick={() => secondary ? onExpand(group) : onSelect(group)}>
      {asset && <img className="radar-marker-art" src={asset} alt="" aria-hidden="true" />}
      <span className="radar-marker-label">{group.nades.length > 1 ? group.nades.length : <Icon aria-hidden="true" />}</span>
    </button>;
  }
  return <div className="radar-browser" role="group" aria-label={`Interaktive Radarkarte von ${map.name}`}>
    <div className="radar-browser-image" style={{ aspectRatio: `${width} / ${height}`, "--radar-aspect": width / height } as CSSProperties}>
      <img src={map.radarUrl} alt={`Vollständige Radarkarte von ${map.name}`} draggable={false} />
      {selected && <svg className="radar-browser-lines" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {counterparts.map(group => <line key={group.id} x1={selected.point.x * width} y1={selected.point.y * height} x2={group.point.x * width} y2={group.point.y * height} className={cn(expanded && group !== expanded && "radar-line-muted")} />)}
      </svg>}
      {(selected ? [selected] : groups).map(group => marker(group, side))}
      {selected && counterparts.map(group => marker(group, side === "from" ? "to" : "from", true))}
      {expanded && <div className="radar-spot-options" aria-label={`Lineups bei ${expanded.title}`}
        data-below={expanded.point.y < 0.25}
        style={{ left: `clamp(6rem, ${expanded.point.x * 100}%, calc(100% - 6rem))`, top: `${expanded.point.y * 100}%` }}>
        {expanded.nades.map((nade, index) => <Link key={lineupKey(nade)} to={href(nade)} title={nade.displayName || nade.name} aria-label={`${nade.displayName || nade.name} ansehen`}>{index + 1}</Link>)}
      </div>}
    </div>
  </div>;
}
