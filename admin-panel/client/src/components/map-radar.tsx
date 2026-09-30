import { useId, useState } from "react";
import { Crosshair, MapPin, RotateCcw, Target } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { isRadarPoint, type MapDefinition, type RadarPoint } from "../lib/maps";
import { cn } from "../lib/utils";
import { resolveRadarPoints, type RadarCalibration } from "../lib/nade-radar";

type RadarNade = {
  id?: string;
  name?: string;
  displayName?: string;
  lineupPos?: string;
  landingPos?: string;
  type?: string;
  throwFromTitle?: string;
  throwToTitle?: string;
  radarFrom?: RadarPoint | null;
  radarTo?: RadarPoint | null;
};

type NadeFlightMapProps = {
  map: MapDefinition;
  nades?: RadarNade[];
  compact?: boolean;
  className?: string;
  emptyMessage?: string;
  onMapClick?: (point: RadarPoint) => void;
  onSelectNade?: (nade: RadarNade) => void;
  calibration?: RadarCalibration | null;
};

const TYPE_COLORS = {
  Smoke: "#8ea5b6",
  Flash: "#f6c453",
  HE: "#ef6461",
  Molly: "#f58b45",
  Decoy: "#ae8eff"
};

function colorForType(type = "") {
  return TYPE_COLORS[type] || "#a5f3c6";
}

function pixelPoint(point: RadarPoint, width: number, height: number) {
  return { x: point.x * width, y: point.y * height };
}

function flightPath(from: RadarPoint, to: RadarPoint, width: number, height: number) {
  const start = pixelPoint(from, width, height);
  const end = pixelPoint(to, width, height);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const bend = Math.min(Math.max(length * 0.11, 18), 76);
  const controlX = (start.x + end.x) / 2 + (-dy / length) * bend;
  const controlY = (start.y + end.y) / 2 + (dx / length) * bend;
  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}

export function NadeFlightMap({
  map,
  nades = [],
  compact = false,
  className,
  emptyMessage,
  onMapClick,
  onSelectNade,
  calibration = null
}: NadeFlightMapProps) {
  const markerPrefix = useId().replace(/:/g, "");
  const width = map.radarWidth || 1024;
  const height = map.radarHeight || 1024;
  const markerRadius = Math.max(width, height) * (compact ? 0.009 : 0.011);
  const placedCount = nades.filter((nade) => { const p = resolveRadarPoints(nade, calibration); return p.radarFrom && p.radarTo; }).length;

  function handleMapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!onMapClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onMapClick({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    });
  }

  if (!map.radarUrl) {
    return (
      <div className={cn("radar-map radar-map-empty", compact && "radar-map-compact", className)}>
        <MapPin aria-hidden="true" />
        <span>Für diese Map ist noch keine Radaransicht hinterlegt.</span>
      </div>
    );
  }

  return (
    <div className={cn("radar-map", compact && "radar-map-compact", onMapClick && "radar-map-editable", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role={onSelectNade ? "group" : "img"}
        aria-label={`${map.name}: ${placedCount} Wurfwege auf dem Radar`}
        onClick={handleMapClick}
      >
        <image href={map.radarUrl} width={width} height={height} preserveAspectRatio="none" />
        <defs>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <marker
              key={type}
              id={`${markerPrefix}-${type.toLowerCase()}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={compact ? 5 : 6}
              markerHeight={compact ? 5 : 6}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
          <marker id={`${markerPrefix}-other`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a5f3c6" />
          </marker>
        </defs>
        <g className="radar-routes">
          {nades.map((nade, index) => {
            const points = resolveRadarPoints(nade, calibration);
            const from = points.radarFrom ? pixelPoint(points.radarFrom, width, height) : null;
            const to = points.radarTo ? pixelPoint(points.radarTo, width, height) : null;
            const color = colorForType(nade.type);
            const markerId = TYPE_COLORS[nade.type || ""] ? `${markerPrefix}-${String(nade.type).toLowerCase()}` : `${markerPrefix}-other`;
            const title = `${nade.displayName || nade.name || `Nade ${index + 1}`}: ${nade.throwFromTitle || "start"} → ${nade.throwToTitle || "target"}`;
            return (
              <g
                key={nade.id || `${nade.name}-${index}`}
                className={cn("radar-route", onSelectNade && "radar-route-selectable")}
                style={{ "--route-color": color } as React.CSSProperties}
                role={onSelectNade && (from || to) ? "button" : undefined}
                tabIndex={onSelectNade && (from || to) ? 0 : undefined}
                aria-label={onSelectNade && (from || to) ? title : undefined}
                onKeyDown={onSelectNade && (from || to) ? event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectNade(nade);
                  }
                } : undefined}
                onClick={onSelectNade ? (event) => {
                  event.stopPropagation();
                  onSelectNade(nade);
                } : undefined}
              >
                <title>{title}</title>
                {from && to ? (
                  <>
                    <path className="radar-route-halo" d={flightPath(points.radarFrom!, points.radarTo!, width, height)} />
                    <path className="radar-route-line" d={flightPath(points.radarFrom!, points.radarTo!, width, height)} markerEnd={`url(#${markerId})`} />
                  </>
                ) : null}
                {from ? (
                  <g transform={`translate(${from.x} ${from.y})`}>
                    <circle className="radar-origin-ring" r={markerRadius * 1.45} />
                    <circle className="radar-origin" r={markerRadius} />
                    {!compact ? <text className="radar-marker-label" y={markerRadius * 0.32}>{index + 1}</text> : null}
                  </g>
                ) : null}
                {to ? (
                  <g transform={`translate(${to.x} ${to.y}) rotate(45)`}>
                    <rect className="radar-target-ring" x={-markerRadius * 1.25} y={-markerRadius * 1.25} width={markerRadius * 2.5} height={markerRadius * 2.5} rx={markerRadius * 0.3} />
                    <rect className="radar-target" x={-markerRadius * 0.78} y={-markerRadius * 0.78} width={markerRadius * 1.56} height={markerRadius * 1.56} rx={markerRadius * 0.18} />
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {emptyMessage && placedCount === 0 ? <div className="radar-map-message">{emptyMessage}</div> : null}
    </div>
  );
}

type NadePlacementEditorProps = {
  map?: MapDefinition;
  calibration?: RadarCalibration | null;
  value: {
    id?: string;
    name?: string;
    displayName?: string;
    lineupPos?: string;
    landingPos?: string;
    type?: string;
    throwFromTitle?: string;
    throwToTitle?: string;
    radarFrom?: RadarPoint | null;
    radarTo?: RadarPoint | null;
  };
  onChange: (patch: { radarFrom?: RadarPoint | null; radarTo?: RadarPoint | null }) => void;
};

export function NadePlacementEditor({ map, value, onChange, calibration = null }: NadePlacementEditorProps) {
  const [mode, setMode] = useState<"from" | "to">("from");
  const points = resolveRadarPoints(value, calibration);

  function place(point: RadarPoint) {
    const rounded = { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) };
    if (mode === "from") {
      onChange({ radarFrom: rounded });
      setMode("to");
    } else {
      onChange({ radarTo: rounded });
    }
  }

  if (!map) {
    return <div className="radar-placement-empty">Choose a known map to place the throw.</div>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={mode === "from" ? "default" : "secondary"} onClick={() => setMode("from")}>
            <Crosshair data-icon="inline-start" />Set start
          </Button>
          <Button type="button" size="sm" variant={mode === "to" ? "default" : "secondary"} onClick={() => setMode("to")}>
            <Target data-icon="inline-start" />Set target
          </Button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ radarFrom: null, radarTo: null })}>
          <RotateCcw data-icon="inline-start" />{calibration ? "Use automatic positions" : "Clear markers"}
        </Button>
      </div>
      <NadeFlightMap map={map} nades={[value]} calibration={calibration} onMapClick={place} />
      <div className="radar-placement-status">
        <span><i className={cn("radar-status-dot", points.radarFrom && "radar-status-dot-ready")} />Start {value.radarFrom ? "manual" : points.radarFrom ? "automatic" : "missing"}</span>
        <span><i className={cn("radar-status-diamond", points.radarTo && "radar-status-dot-ready")} />Target {value.radarTo ? "manual" : points.radarTo ? "automatic" : "missing"}</span>
        <Badge variant="outline">Click map to set {mode === "from" ? "start" : "target"}</Badge>
      </div>
    </div>
  );
}
