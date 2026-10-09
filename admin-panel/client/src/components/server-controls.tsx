import { useLiveResource } from "../hooks/use-live-resource";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, Check, Crosshair, Flag, Gamepad2, LayoutGrid, MapPinned, RefreshCw, Server } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { ACTIVE_DUTY_MAPS, BUILT_IN_MAPS, workshopMapsFromSettings, type MapDefinition } from "../lib/maps";
import { MAP_CARD_ART } from "../lib/map-card-art";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { ActionButton } from "./action-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";

/** Map and mode the running server reports; shared by the mode and map panels. */
export function useLiveGame({ busy, running }) {
  const gameVersion = useRef(0);
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const version = gameVersion.current;
      const data = await api("/api/server/game");
      if (version === gameVersion.current) setGame(data);
    } catch (error) {
      setGame(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (busy || !running) { setGame(null); return; }
    let cancelled = false;
    setLoading(true);
    const version = gameVersion.current;
    api("/api/server/game").then((result) => {
      if (!cancelled && version === gameVersion.current) { setGame(result); setError(""); }
    }).catch((error) => {
      if (!cancelled) { setGame(null); setError(error.message); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [busy, running]);

  useLiveResource(running ? "/api/server/game" : null, data => { gameVersion.current++; setGame(data); setError(""); }, error => { setGame(null); setError(error.message); });

  return { game, setGame, loading, error, setError, refresh, running };
}

const TEAM_ICONS = ["/assets/nades/t.png", "/assets/nades/ct.png"];
const NADE_ICONS = ["smoke", "flashbang", "hegrenade", "molotov"].map((name) => `/assets/nades/${name}-icon.png`);

/** Accent, backdrop and emblem per mode; unknown modes fall back to a neutral card. */
const MODE_LOOKS = {
  matchzy: { accent: "var(--side-t)", radar: "/maps/dust2.webp", icons: TEAM_ICONS, tag: "5v5 · Practice" },
  nades: { accent: "var(--brand)", radar: "/maps/mirage.webp", icons: NADE_ICONS, tag: "Lineups · Ingame-Panel" },
  warmup: { accent: "var(--nade-he)", pattern: "target", Icon: Crosshair, tag: "Bots · Aim" },
  vanilla: { accent: "var(--side-ct)", pattern: "grid", Icon: Server, tag: "Ohne Match-Plugin" }
};

function ModeEmblem({ look }) {
  if (look.icons) return <span className="mode-card-emblem mode-card-emblem-icons">{look.icons.map((src) => <img key={src} src={src} alt="" />)}</span>;
  const Icon = look.Icon || Gamepad2;
  return <span className="mode-card-emblem"><Icon /></span>;
}

export function ModeControls({ settings, setSettings, policy, busy, live }) {
  const modes = policy?.modes || [];
  const selected = settings.serverMode || "matchzy";
  const activeMode = modes.find((mode) => mode.id === live.game?.mode);
  const selectedMode = modes.find((mode) => mode.id === selected);
  return (
    <div className="grid gap-3">
      <RadioGroup className="mode-card-grid" value={selected} disabled={busy} aria-label="Spielmodus für den nächsten Start" onValueChange={(value) => setSettings((current) => ({ ...current, serverMode: value }))}>
        {modes.map((mode) => {
          const look = MODE_LOOKS[mode.id] || { accent: "var(--muted-foreground)", pattern: "grid" };
          const isSelected = selected === mode.id;
          const isLive = live.game?.mode === mode.id;
          return (
            <label key={mode.id} className={cn("mode-card", isSelected && "mode-card-selected")} style={{ "--mode-accent": look.accent } as CSSProperties}>
              {look.radar ? <img className="mode-card-backdrop" src={look.radar} alt="" loading="lazy" /> : <span className={cn("mode-card-backdrop", `mode-card-pattern-${look.pattern}`)} aria-hidden="true" />}
              <span className="mode-card-top">
                <ModeEmblem look={look} />
                <RadioGroupItem value={mode.id} aria-label={mode.name} />
              </span>
              <span className="mode-card-tag">{look.tag}</span>
              <strong className="mode-card-name">{mode.name}</strong>
              <span className="mode-card-description">{mode.description}</span>
              <span className="mode-card-status">
                {isLive && <Badge variant="success"><span className="server-status-dot" />Läuft</Badge>}
                {isSelected && <Badge variant="outline" className="mode-card-next"><Check className="size-3" />Nächster Start</Badge>}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      <p className="text-xs text-muted-foreground">
        {activeMode && activeMode.id !== selected
          ? <>Wechsel von {activeMode.name} zu {selectedMode?.name || selected} wird mit „Übernehmen & neu starten“ wirksam.</>
          : activeMode ? <>{activeMode.name} läuft gerade. Eine andere Auswahl wird mit „Übernehmen & neu starten“ wirksam.</>
          : <>Aktiver Modus: Nicht verfügbar. Die Auswahl wird mit „Übernehmen & neu starten“ wirksam.</>}
      </p>
    </div>
  );
}

function MapArt({ map, className = "" }: { map: MapDefinition; className?: string }) {
  const art = map.workshopId ? undefined : MAP_CARD_ART[map.mapName];
  const [failed, setFailed] = useState(false);
  if (!art?.imageUrl || failed) return null;
  return <img className={className} src={art.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function MapEmblem({ map, className = "" }: { map: MapDefinition; className?: string }) {
  const art = map.workshopId ? undefined : MAP_CARD_ART[map.mapName];
  const [failed, setFailed] = useState(false);
  return <span className={className} aria-hidden="true">
    {art?.logoUrl && !failed ? <img src={art.logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <MapPinned />}
  </span>;
}

function MapStateBadges({ live, start }: { live: boolean; start: boolean }) {
  return <>
    {live && <Badge variant="success"><span className="server-status-dot" />Läuft</Badge>}
    {start && <Badge variant="outline"><Flag className="size-3" />Startmap</Badge>}
  </>;
}

/** One click switches the running map; the flag marks it as start map for the next server start. */
function MapSwitchTile({ map, isLive, isStart, switching, canSwitch, canMarkStart, onSwitch, onMarkStart }) {
  return (
    <div className={cn("map-switch-tile", isLive && "map-switch-tile-live")}>
      <button type="button" className="map-switch-tile-main" disabled={!canSwitch || isLive} aria-busy={switching} aria-label={isLive ? `${map.name} läuft gerade` : `Zu ${map.name} wechseln`} onClick={onSwitch}>
        <MapArt map={map} className="map-switch-tile-background" />
        <MapEmblem map={map} className="map-switch-tile-emblem" />
        <span className="map-switch-tile-label"><strong>{map.name}</strong>{isStart && <span><Flag aria-hidden="true" />Startmap</span>}</span>
        {switching && <span className="map-switch-tile-pending"><Spinner />Wird gewechselt …</span>}
      </button>
      {isLive && <span className="map-switch-tile-badges"><MapStateBadges live start={false} /></span>}
      <Button type="button" size="icon" variant={isStart ? "default" : "secondary"} className="map-switch-tile-flag" disabled={!canMarkStart || isStart} aria-pressed={isStart} aria-label={isStart ? `${map.name} ist die Startmap` : `${map.name} als Startmap vormerken`} title={isStart ? "Startmap" : "Als Startmap vormerken"} onClick={onMarkStart}>
        <Flag />
      </Button>
    </div>
  );
}

export function MapControls({ settings, setSettings, busy, live }) {
  const [switching, setSwitching] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMaps = BUILT_IN_MAPS.filter((map) => !["active", "community"].includes(map.category));
  const workshops = workshopMapsFromSettings(settings);
  const canSwitch = live.running && !busy && !switching && !live.loading;
  const liveMap = live.game?.map || "";
  const isLive = (map: MapDefinition) => Boolean(map.mapName) && map.mapName === liveMap;
  const isStart = (map: MapDefinition) => !map.workshopId && map.mapName === settings.startMap;
  const liveOther = liveMap && !ACTIVE_DUTY_MAPS.some(isLive) ? [...moreMaps, ...workshops].find(isLive) || { key: liveMap, name: liveMap, mapName: liveMap, category: "other" } as MapDefinition : null;
  const startOther = settings.startMap && !ACTIVE_DUTY_MAPS.some(isStart) ? moreMaps.find(isStart)?.name || settings.startMap : "";

  async function changeMap(map: MapDefinition) {
    setSwitching(map.key);
    live.setError("");
    try {
      await api("/api/server/map", {
        method: "POST",
        body: JSON.stringify(map.workshopId ? { workshopId: map.workshopId } : { map: map.mapName })
      });
      live.setGame(null);
      setMoreOpen(false);
    } catch (error) {
      live.setError(error instanceof Error ? error.message : "Map-Wechsel fehlgeschlagen.");
    } finally {
      setSwitching("");
    }
  }

  const markStart = (map: MapDefinition) => setSettings((current) => ({ ...current, startMap: map.mapName }));
  const tileProps = (map: MapDefinition) => ({
    map, isLive: isLive(map), isStart: isStart(map), switching: switching === map.key, canSwitch,
    canMarkStart: !busy && !map.workshopId, onSwitch: () => changeMap(map), onMarkStart: () => markStart(map)
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={liveMap ? "success" : "outline"}><MapPinned className="size-3" />Aktuelle Map: {liveMap || (live.loading ? "Wird geprüft …" : "Nicht verfügbar")}</Badge>
        <ActionButton variant="ghost" size="sm" onClick={live.refresh} disabled={busy || !!switching || live.loading || !live.running} icon={RefreshCw} pendingLabel="Wird aktualisiert …" successLabel="Aktualisiert">Live-Map aktualisieren</ActionButton>
        {live.error && <span role="alert" className="text-xs text-destructive">{live.error}</span>}
      </div>
      <div className="map-switch-grid" role="group" aria-label="Map wechseln">
        {ACTIVE_DUTY_MAPS.map((map) => <MapSwitchTile key={map.key} {...tileProps(map)} />)}
        <button type="button" className={cn("map-switch-more", liveOther && "map-switch-tile-live")} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          {liveOther && <MapArt map={liveOther} className="map-switch-tile-background" />}
          <span className="map-switch-more-icon" aria-hidden="true"><LayoutGrid /></span>
          <strong>{liveOther ? liveOther.name : "Andere Map"}</strong>
          <span className="map-switch-more-detail">
            {liveOther ? "Läuft · weitere Maps" : `${moreMaps.length + workshops.length} weitere Maps`}
          </span>
          {startOther && <span className="map-switch-more-detail"><Flag className="size-3" />Startmap: {startOther}</span>}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {live.running ? "Ein Klick wechselt sofort die Map im laufenden Spiel. Verbundene Spieler laden die neue Map." : "Starte den Server, um die Map im laufenden Spiel zu wechseln."}
        {" "}Die Fahne merkt eine Map als Startmap vor; sie gilt nach „Übernehmen & neu starten“.
      </p>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="w-[min(880px,calc(100vw-24px))]">
          <DialogHeader>
            <DialogTitle>Andere Map wählen</DialogTitle>
            <DialogDescription>{live.running ? "Wechselt sofort die Map im laufenden Spiel." : "Der Server läuft nicht. Du kannst eine Startmap vormerken."}</DialogDescription>
          </DialogHeader>
          {live.error && <p role="alert" className="text-xs text-destructive">{live.error}</p>}
          <MoreMapGroup title="Reserve-Pool" maps={moreMaps.filter((map) => map.category === "reserve")} tileProps={tileProps} />
          <MoreMapGroup title="Weitere Maps" maps={moreMaps.filter((map) => map.category === "other")} tileProps={tileProps} />
          <MoreMapGroup title="Workshop" maps={workshops} tileProps={tileProps} empty="Noch keine Workshop-Maps. Neue Workshop-Maps musst du zuerst übernehmen." />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MoreMapGroup({ title, maps, tileProps, empty = "" }) {
  if (!maps.length && !empty) return null;
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {maps.length ? <ul className="map-switch-list">{maps.map((map) => <MoreMapRow key={map.key} {...tileProps(map)} />)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function MoreMapRow({ map, isLive, isStart, switching, canSwitch, canMarkStart, onSwitch, onMarkStart }) {
  return (
    <li className={cn("map-switch-row", isLive && "map-switch-tile-live")}>
      <MapEmblem map={map} className="map-switch-row-emblem" />
      <span className="grid min-w-0 flex-1">
        <strong className="truncate text-sm">{map.name}</strong>
        <span className="truncate font-mono text-xs text-muted-foreground">{map.mapName || `Workshop ${map.workshopId}`}</span>
      </span>
      <MapStateBadges live={isLive} start={isStart} />
      <Button type="button" size="icon" variant={isStart ? "default" : "ghost"} disabled={!canMarkStart || isStart} aria-pressed={isStart} aria-label={isStart ? `${map.name} ist die Startmap` : `${map.name} als Startmap vormerken`} title={isStart ? "Startmap" : "Als Startmap vormerken"} onClick={onMarkStart}><Flag /></Button>
      <Button type="button" size="sm" variant="secondary" disabled={!canSwitch || isLive} aria-busy={switching} onClick={onSwitch}>
        {switching ? <Spinner data-icon="inline-start" /> : <ArrowLeftRight data-icon="inline-start" />}Wechseln
      </Button>
    </li>
  );
}
