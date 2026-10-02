import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { type MapDefinition } from "../lib/maps";
import { lineupKey } from "../lib/lineups";
import { type RadarGroup, type RadarLineup, type RadarSide } from "../lib/radar-groups";
import { radarMarkerAsset } from "../lib/nade-assets";
import { TEAM_LABELS, isLineupTeam } from "../../../shared/lineup-teams";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { GrenadeIcon } from "./nade-icons";
import { throwAttributeSummary } from "../../../shared/throw-attributes";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

type Props = {
  map: MapDefinition; side: RadarSide; groups: RadarGroup[];
  selected?: RadarGroup; counterparts: RadarGroup[]; expanded?: RadarGroup;
  onSelect: (group: RadarGroup) => void; onExpand: (group: RadarGroup) => void;
  onDismiss: () => void; onCloseOptions: () => void;
  href: (nade: RadarLineup) => string;
};

export function RadarBrowser({ map, side, groups, selected, counterparts, expanded, onSelect, onExpand, onDismiss, onCloseOptions, href }: Props) {
  const optionsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selected || expanded) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".radar-spot")) return;
      onDismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [selected, expanded, onDismiss]);
  if (!map.radarUrl) return <Empty className="border"><EmptyHeader><MapPin /><EmptyTitle>Keine Radarkarte hinterlegt</EmptyTitle><EmptyDescription>Alle Lineups findest du in der Liste darunter.</EmptyDescription></EmptyHeader></Empty>;
  const width = map.radarWidth || 1024, height = map.radarHeight || 1024;
  function marker(group: RadarGroup, markerSide: RadarSide, secondary = false) {
    const active = group === selected || group === expanded;
    const asset = markerSide === "to" ? radarMarkerAsset(group.nades) : null;
    const team = group.nades.every(nade => nade.team === group.nades[0].team) ? group.nades[0].team : undefined;
    const teamLabel = isLineupTeam(team) ? ` · ${TEAM_LABELS[team]}` : "";
    const countLabel = group.nades.length > 1 ? ` · ${group.nades.length} Lineups` : "";
    const label = `${markerSide === "from" ? "Start" : "Ziel"}: ${group.title}${countLabel}${teamLabel}`;
    const className = cn("radar-spot", markerSide === "from" && "radar-spot-from", active && "radar-spot-active", asset && "radar-spot-asset", group.nades.length > 1 && "radar-spot-stack");
    const style = { left: `${group.point.x * 100}%`, top: `${group.point.y * 100}%` };
    const content = <>
      {asset && <img className="radar-marker-art" src={asset} alt="" aria-hidden="true" />}
      {group.nades.length > 1 && <span className="radar-marker-label">{group.nades.length}</span>}
    </>;
    if (secondary && group.nades.length === 1) return <Link key={`true-${group.id}`} to={href(group.nades[0])}
      className={className} data-team={team || "unassigned"} style={style} aria-label={label} title={group.title}>{content}</Link>;
    return <button key={`${secondary}-${group.id}`} type="button" className={className}
      data-team={team || "unassigned"} style={style} aria-label={label}
      aria-pressed={active} aria-expanded={secondary ? group === expanded : undefined}
      aria-haspopup={secondary ? "dialog" : undefined} title={`${group.title}${countLabel}`}
      onClick={event => {
        if (secondary) { optionsTrigger.current = event.currentTarget; onExpand(group); }
        else onSelect(group);
      }}>{content}</button>;
  }
  return <div className="radar-browser" role="group" aria-label={`Interaktive Radarkarte von ${map.name}`}>
    <div className="radar-browser-image" style={{ aspectRatio: `${width} / ${height}`, "--radar-aspect": width / height } as CSSProperties}>
      <img src={map.radarUrl} alt={`Vollständige Radarkarte von ${map.name}`} draggable={false} />
      {selected && <svg className="radar-browser-lines" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {counterparts.map(group => <line key={group.id} x1={selected.point.x * width} y1={selected.point.y * height} x2={group.point.x * width} y2={group.point.y * height} className={cn(expanded && group !== expanded && "radar-line-muted")} />)}
      </svg>}
      {(selected ? [selected] : groups).map(group => marker(group, side))}
      {selected && counterparts.map(group => marker(group, side === "from" ? "to" : "from", true))}
    </div>
    <Dialog open={!!expanded} onOpenChange={open => { if (!open) onCloseOptions(); }}>
      <DialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        optionsTrigger.current?.focus();
      }}>
        <DialogHeader><DialogTitle>Lineup auswählen</DialogTitle><DialogDescription>{expanded?.nades.length} Lineups mit diesem Start und Ziel.</DialogDescription></DialogHeader>
        <ol className="map-lineup-list">
          {expanded?.nades.map(nade => <li key={lineupKey(nade)}><Link className="map-lineup-row" to={href(nade)}>
            <span className="map-lineup-kind"><GrenadeIcon type={nade.type || ""} /></span>
            <div className="map-lineup-name"><strong>{nade.displayName || nade.name}</strong><span>{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Landeposition"}</span><span>{throwAttributeSummary(nade)}</span></div>
          </Link></li>)}
        </ol>
      </DialogContent>
    </Dialog>
  </div>;
}
