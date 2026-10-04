import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, Crosshair, Plus, Star, Target, Zap } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "./ui/empty";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { FavoriteButton, useNadeFavorites } from "./nade-favorites";
import { GrenadeIcon, TeamIcon } from "./nade-icons";
import { isLineupTeam, matchesLineupTeam, TEAM_LABELS } from "../../../shared/lineup-teams";
import { RadarBrowser } from "./radar-browser";
import { findRadarGroup, groupRadarNades, type RadarSide } from "../lib/radar-groups";
import { mapMatchesNade, mapPath, mapSlug } from "../lib/maps";
import { lineupKey, lineupPath } from "../lib/lineups";
import { inferRadarCalibration } from "../lib/nade-radar";
import { throwAttributeSummary } from "../../../shared/throw-attributes";

const kinds = [
  { value: "all", label: "Alle" }, { value: "Smoke", label: "Smokes" },
  { value: "Flash", label: "Flashes" }, { value: "HE", label: "HE" },
  { value: "Molly", label: "Molotovs" }, { value: "Decoy", label: "Decoys" },
];
const collections = [
  { value: "all", label: "Alle", icon: Crosshair },
  { value: "favorites", label: "Favoriten", icon: Star },
  { value: "mustKnow", label: "Must Know", icon: Zap },
  { value: "official", label: "Offiziell", icon: Check },
];

export function LegacyLibraryRedirect({ maps }) {
  const [search] = useSearchParams();
  const previousMap = search.get("map");
  const map = previousMap && maps.find(map => previousMap === map.key || mapSlug(map) === previousMap || mapMatchesNade(map, previousMap));
  const next = new URLSearchParams(search);
  next.delete("map");
  next.delete("view");
  return <Navigate to={`${map ? mapPath(map) : "/maps"}${map && next.size ? `?${next}` : ""}`} replace />;
}

export function NadeLibrary({ nades, maps, user }) {
  const { mapSlug: slug } = useParams();
  const [search, setSearch] = useSearchParams();
  const favorites = useNadeFavorites();
  const [expandedId, setExpandedId] = useState<string>();
  const map = maps.find(map => mapSlug(map) === slug);
  const query = search.get("q") || "";
  const kind = kinds.some(kind => kind.value === search.get("type")) ? search.get("type") : "all";
  const team = ["t", "ct"].includes(search.get("team")) ? search.get("team") : "all";
  const collection = collections.some(item => item.value === search.get("collection")) ? search.get("collection") : "all";
  if (!map) return <Empty><EmptyHeader><EmptyTitle>Map nicht gefunden</EmptyTitle><EmptyDescription>Diese Map ist nicht in der Bibliothek. Wähle eine Map aus der Übersicht.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="secondary"><Link to="/maps">All Maps</Link></Button></EmptyContent></Empty>;
  const mapNades = nades.filter(nade => mapMatchesNade(map, nade.map));
  const filtered = mapNades.filter(nade =>
    (kind === "all" || nade.type === kind) && matchesLineupTeam(nade, team) &&
    (collection !== "official" || nade.official) &&
    (collection !== "mustKnow" || nade.mustKnow) &&
    (collection !== "favorites" || favorites.has(nade)) &&
    `${nade.displayName || nade.name} ${nade.desc || ""} ${nade.throwFromTitle || ""} ${nade.throwToTitle || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  function filter(key, value) {
    setExpandedId(undefined);
    setSearch(current => {
      const next = new URLSearchParams(current);
      if (!value || value === "all") next.delete(key); else next.set(key, value);
      next.delete("spot");
      next.delete("via");
      return next;
    }, { replace: key === "q" });
  }
  const calibration = inferRadarCalibration(map, mapNades);
  const side: RadarSide = search.get("position") === "from" ? "from" : "to";
  const groups = groupRadarNades(filtered, side, map, calibration);
  const selected = findRadarGroup(groups, search.get("spot"));
  const counterparts = selected ? groupRadarNades(selected.nades, side === "from" ? "to" : "from", map, calibration) : [];
  const expanded = findRadarGroup(counterparts, expandedId);
  const visible = expanded?.nades || selected?.nades || filtered;
  const href = nade => lineupPath(map, nade);
  function selectSpot(id?: string) {
    setExpandedId(undefined);
    setSearch(current => {
      const next = new URLSearchParams(current);
      if (id && next.get("spot") !== id) next.set("spot", id); else next.delete("spot");
      next.delete("via");
      return next;
    });
  }
  return <div className="playbook-page map-explorer-page">
    <div className="map-explorer-layout">
      <section className="map-explorer-stage" aria-label="Positionen auf der Karte">
        <RadarBrowser map={map} side={side} groups={groups} selected={selected} counterparts={counterparts} expanded={expanded} onSelect={group => selectSpot(group.id)} onExpand={group => setExpandedId(group.id)} onDismiss={() => selectSpot()} onCloseOptions={() => setExpandedId(undefined)} href={href} />
      </section>
      <aside className="map-explorer-sidebar" aria-label="Radarfilter und Lineup-Auswahl">
        <header className="map-explorer-heading"><h1>{map.name}</h1>{user?.role === "admin" && map.mapName && <Button asChild size="sm"><Link to={`${mapPath(map)}/lineups/new`}><Plus data-icon="inline-start" />Nade hinzufügen</Link></Button>}</header>
        <section className="explorer-control">
          <ToggleGroup type="single" variant="outline" value={side} onValueChange={value => { if (value) filter("position", value); }} aria-label="Positionen zuerst anzeigen" className="w-full">
            <ToggleGroupItem value="to" className="flex-1"><Target data-icon="inline-start" />Ziele</ToggleGroupItem>
            <ToggleGroupItem value="from" className="flex-1"><Crosshair data-icon="inline-start" />Starts</ToggleGroupItem>
          </ToggleGroup>
        </section>
        <section className="explorer-control">
          <h2>Granaten</h2>
          <ToggleGroup type="single" orientation="vertical" value={kind} onValueChange={value => filter("type", value || "all")} aria-label="Granatentyp" className="w-full">
            {kinds.map(item => <ToggleGroupItem key={item.value} value={item.value} className="justify-between"><span className="flex items-center gap-2"><GrenadeIcon type={item.value} />{item.label}</span><span className="tab-count">{mapNades.filter(nade => item.value === "all" || nade.type === item.value).length}</span></ToggleGroupItem>)}
          </ToggleGroup>
        </section>
        <section className="explorer-control">
          <h2>Seite</h2>
          <ToggleGroup type="single" variant="outline" value={team} onValueChange={value => filter("team", value || "all")} aria-label="Team filtern" className="grid w-full grid-cols-3">
            {[{ value: "all", label: "Alle" }, { value: "t", label: "T" }, { value: "ct", label: "CT" }].map(item => <ToggleGroupItem key={item.value} value={item.value}><TeamIcon team={item.value} />{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </section>
        <section className="explorer-control">
          <h2>Sammlung</h2>
          <ToggleGroup type="single" variant="outline" value={collection} onValueChange={value => filter("collection", value || "all")} aria-label="Sammlung" className="grid w-full grid-cols-2">
            {collections.map(item => <ToggleGroupItem key={item.value} value={item.value}><item.icon data-icon="inline-start" />{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </section>
        <Field htmlFor="nade-search" className="explorer-search"><FieldLabel>Lineups durchsuchen</FieldLabel><Input id="nade-search" placeholder="Name, Spot oder Beschreibung …" value={query} onChange={event => filter("q", event.target.value)} /></Field>
        <Collapsible id="map-lineup-list" className="map-lineup-disclosure">
          <CollapsibleTrigger className="map-lineup-list-trigger">
            <span>{selected ? "Lineups zur Auswahl" : "Alle passenden Lineups"}</span>
            <span className="result-count" role="status" aria-label={`${visible.length} ${visible.length === 1 ? "Lineup" : "Lineups"}`}>{visible.length}</span>
            <ChevronDown className="map-category-chevron" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="map-lineup-list-content">
            {visible.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Crosshair /></EmptyMedia><EmptyTitle>{collection === "favorites" ? "Keine passenden Favoriten" : "Keine passenden Lineups"}</EmptyTitle><EmptyDescription>{collection === "favorites" ? "Merke dir Lineups über den Stern. Deine Favoriten findest du anschließend hier." : mapNades.length ? "Passe die Filter an oder suche nach einem anderen Spot." : "Für diese Map wurden noch keine Nades aufgenommen."}</EmptyDescription></EmptyHeader></Empty> :
              <ol className="map-lineup-list">{visible.map(nade => <li key={lineupKey(nade)}>
                <Link className="map-lineup-row" to={href(nade)}>
                  <span className="map-lineup-kind" role="img" aria-label={nade.type === "Molly" ? "Molotov" : nade.type || "Nade"}><GrenadeIcon type={nade.type} /></span>
                  <div className="map-lineup-name"><strong>{nade.displayName || nade.name}</strong><span>{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Landeposition"}</span></div>
                  <span className="map-lineup-technique">{throwAttributeSummary(nade)}{typeof nade.flightDuration === "number" && ` · ${nade.flightDuration.toLocaleString("de-AT", { maximumFractionDigits: 2 })} s`}</span>
                  <div className="map-lineup-badges">{isLineupTeam(nade.team) && <Badge variant="outline"><TeamIcon team={nade.team} className="size-4" />{TEAM_LABELS[nade.team]}</Badge>}{nade.mustKnow && <Badge>Must Know</Badge>}{nade.official ? <Badge variant="success">Offiziell</Badge> : <Badge variant="outline">Aufnahme</Badge>}</div>
                </Link>
                <FavoriteButton nade={nade} compact />
              </li>)}</ol>}
          </CollapsibleContent>
        </Collapsible>
      </aside>
    </div>
  </div>;
}
