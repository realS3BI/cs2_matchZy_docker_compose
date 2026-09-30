import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crosshair, RefreshCw, Settings2, Star, X, Zap } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "./ui/empty";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { FavoriteButton, useNadeFavorites } from "./nade-favorites";
import { NadeFlightMap } from "./map-radar";
import { mapMatchesNade, mapPath, mapSlug } from "../lib/maps";
import { lineupKey, lineupPath } from "../lib/lineups";
import { inferRadarCalibration } from "../lib/nade-radar";
import { cn } from "../lib/utils";

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

export function NadeLibrary({ nades, maps, role, onRefresh, busy, nadesDirty, renderGuide }) {
  const { mapSlug: slug } = useParams();
  const [search, setSearch] = useSearchParams();
  const favorites = useNadeFavorites();
  const map = maps.find(map => mapSlug(map) === slug);
  const query = search.get("q") || "";
  const kind = kinds.some(kind => kind.value === search.get("type")) ? search.get("type") : "all";
  const collection = collections.some(item => item.value === search.get("collection")) ? search.get("collection") : "all";
  if (!map) return <Empty><EmptyHeader><EmptyTitle>Map nicht gefunden</EmptyTitle><EmptyDescription>Diese Map ist nicht in der Bibliothek. Wähle eine Map aus der Übersicht.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="secondary"><Link to="/maps">All Maps</Link></Button></EmptyContent></Empty>;
  const mapNades = nades.filter(nade => mapMatchesNade(map, nade.map));
  const filtered = mapNades.filter(nade =>
    (kind === "all" || nade.type === kind) &&
    (collection !== "official" || nade.official) &&
    (collection !== "mustKnow" || nade.mustKnow) &&
    (collection !== "favorites" || favorites.has(nade)) &&
    `${nade.displayName || nade.name} ${nade.desc || ""} ${nade.throwFromTitle || ""} ${nade.throwToTitle || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  function filter(key, value) {
    setSearch(current => {
      const next = new URLSearchParams(current);
      if (!value || value === "all") next.delete(key); else next.set(key, value);
      return next;
    }, { replace: key === "q" });
  }
  const hasFilters = Boolean(query || kind !== "all" || collection !== "all");
  const calibration = inferRadarCalibration(map, mapNades);
  return <div className="playbook-page">
    <header className="playbook-heading map-page-heading">
      <div><p className="control-kicker">Lineup-Bibliothek</p><h1>{map.name}</h1><p>{mapNades.length} {mapNades.length === 1 ? "Lineup" : "Lineups"}. Wähle deine Granate und finde den passenden Wurf.</p></div>
      <div className="library-tools">
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={busy || nadesDirty} title={nadesDirty ? "Speichere zuerst die Änderungen in der Bibliotheksverwaltung." : "Aufnahmen aktualisieren"}><RefreshCw data-icon="inline-start" className={cn(busy && "animate-spin")} />Aktualisieren</Button>
        {role === "admin" && <Button variant="ghost" size="sm" asChild><Link to="/nades?view=manage"><Settings2 data-icon="inline-start" />Verwalten{nadesDirty && <span aria-label="Ungespeicherte Änderungen">•</span>}</Link></Button>}
      </div>
    </header>
    <Tabs value={kind} onValueChange={value => filter("type", value)} className="min-w-0 gap-6">
      <div className="nade-type-tabs"><TabsList variant="line" aria-label="Granatentyp">
        {kinds.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}<span className="tab-count" aria-hidden="true">{mapNades.filter(nade => item.value === "all" || nade.type === item.value).length}</span></TabsTrigger>)}
      </TabsList></div>
      <div className="map-lineup-filters">
        <ToggleGroup type="single" variant="outline" value={collection} onValueChange={value => filter("collection", value || "all")} aria-label="Sammlung" className="flex-wrap">
          {collections.map(item => <ToggleGroupItem key={item.value} value={item.value}><item.icon data-icon="inline-start" />{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <Field htmlFor="nade-search"><FieldLabel className="sr-only">Lineups durchsuchen</FieldLabel><Input id="nade-search" placeholder="Name, Spot oder Beschreibung …" value={query} onChange={event => filter("q", event.target.value)} /></Field>
      </div>
      <TabsContent value={kind}>
        <div className="section-heading"><span className="result-count" role="status">{collection === "favorites" && favorites.pending ? "Favoriten werden geladen …" : `${filtered.length} ${filtered.length === 1 ? "Lineup" : "Lineups"}`}</span>{hasFilters && <Button variant="ghost" size="sm" onClick={() => setSearch({})}><X data-icon="inline-start" />Filter zurücksetzen</Button>}</div>
        {filtered.length === 0 && <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Crosshair /></EmptyMedia><EmptyTitle>{collection === "favorites" ? "Keine passenden Favoriten" : "Keine passenden Lineups"}</EmptyTitle><EmptyDescription>{collection === "favorites" ? "Merke dir Lineups über den Stern. Deine Favoriten findest du anschließend hier." : mapNades.length ? "Passe die Filter an oder suche nach einem anderen Spot." : "Für diese Map wurden noch keine Nades aufgenommen."}</EmptyDescription></EmptyHeader>{hasFilters && <EmptyContent><Button variant="secondary" onClick={() => setSearch({})}>Alle Lineups anzeigen</Button></EmptyContent>}</Empty>}
        <div className="nade-card-grid">{filtered.map(nade => {
          const image = nade.lineupImages?.[0]?.url;
          const name = nade.displayName || nade.name;
          const href = `${lineupPath(map, nade)}${search.size ? `?${search}` : ""}`;
          return <Card key={lineupKey(nade)} className="nade-card">
            <Link className="nade-card-preview" to={href} aria-label={`${name} ansehen`}>
              {image ? <img src={image} alt="" loading="lazy" /> : <NadeFlightMap map={map} nades={[nade]} calibration={calibration} compact />}
              <span className="nade-preview-label">{nade.type || "Nade"}</span><span className="nade-preview-open"><ArrowRight aria-hidden="true" /></span>
            </Link>
            <CardHeader><div className="flex flex-wrap gap-2">{nade.mustKnow && <Badge>Must Know</Badge>}{nade.official ? <Badge variant="success">Offiziell</Badge> : <Badge variant="outline">Aufnahme</Badge>}</div><CardTitle><Link className="nade-title-button" to={href}>{name}</Link></CardTitle><CardDescription className="line-clamp-2">{nade.desc || "Öffne das Lineup für Wurfweg und Ausrichtung."}</CardDescription></CardHeader>
            <CardContent><p className="nade-route"><span>{nade.throwFromTitle || "Startposition"}</span><ArrowRight aria-hidden="true" /><span>{nade.throwToTitle || "Landeposition"}</span></p></CardContent>
            <CardFooter><FavoriteButton nade={nade} compact /><Button variant="ghost" size="sm" asChild><Link to={href}>Lineup ansehen<ArrowRight data-icon="inline-end" /></Link></Button></CardFooter>
          </Card>;
        })}</div>
      </TabsContent>
    </Tabs>
    <details className="disclosure-panel"><summary>Map-Guide erstellen</summary><div className="p-4">{renderGuide(map)}</div></details>
  </div>;
}
