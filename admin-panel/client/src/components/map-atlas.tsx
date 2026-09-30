import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, MapPinned } from "lucide-react";
import { mapMatchesNade, mapPath, mapSlug, type MapDefinition } from "../lib/maps";
import { Badge } from "./ui/badge";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

const groups = [
  { key: "active", title: "Active Duty", description: "Die Maps im aktuellen Wettkampf-Pool." },
  { key: "reserve", title: "Reserve-Pool", description: "Weitere Maps für deine nächste Runde." },
  { key: "inactive", title: "Inaktive Maps", description: "Lineups für Maps außerhalb der aktuellen Pools bleiben verfügbar." },
  { key: "other", title: "Weitere Maps", description: "Arms Race, Training und weitere Spielmodi." },
  { key: "workshop", title: "Workshop", description: "Die Workshop-Maps deiner Bibliothek." },
];
function groupFor(map: MapDefinition) {
  if (map.workshopId || map.category === "workshop") return "workshop";
  if (["community", "unavailable"].includes(map.category)) return "inactive";
  return map.category;
}

export function MapAtlas({ nades, maps }: { nades: any[]; maps: MapDefinition[] }) {
  const [search, setSearch] = useSearchParams();
  const query = search.get("q") || "";
  const visible = maps.filter(map => `${map.name} ${map.mapName} ${map.workshopId || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="playbook-page">
    <header className="playbook-heading"><div><p className="control-kicker">Map-Bibliothek</p><h1>All Maps</h1><p>Wähle deine Map und entdecke die Lineups.</p></div><div className="atlas-search"><Field htmlFor="atlas-search"><FieldLabel>Map finden</FieldLabel><Input id="atlas-search" value={query} onChange={event => setSearch(event.target.value ? { q: event.target.value } : {}, { replace: true })} placeholder="Name oder Workshop-ID …" /></Field></div></header>
    {visible.length === 0 && <Empty><EmptyHeader><EmptyTitle>Keine Map gefunden</EmptyTitle><EmptyDescription>Versuche einen anderen Namen oder eine Workshop-ID.</EmptyDescription></EmptyHeader></Empty>}
    {groups.map(group => {
      const entries = visible.filter(map => groupFor(map) === group.key);
      if (!entries.length && (query || group.key !== "workshop")) return null;
      return <section key={group.key} aria-labelledby={`maps-${group.key}`}>
        <div className="section-heading"><div><h2 id={`maps-${group.key}`}>{group.title}</h2><p className="mt-1 text-sm text-muted-foreground">{group.description}</p></div><Badge variant="outline">{entries.length}</Badge></div>
        <div className="map-catalog-grid">{entries.map(map => {
          const count = nades.filter(nade => mapMatchesNade(map, nade.map)).length;
          return <Link key={mapSlug(map)} to={mapPath(map)} className="map-postcard">
            <div className="map-postcard-image">{map.radarUrl ? <img src={map.radarUrl} alt="" loading="lazy" /> : <MapPinned aria-hidden="true" />}</div>
            <div className="map-catalog-label"><strong>{map.name}</strong><ArrowRight aria-hidden="true" /></div>
            <span>{count} {count === 1 ? "Lineup" : "Lineups"}</span>
          </Link>;
        })}</div>
        {!entries.length && <Empty className="border"><EmptyHeader><EmptyTitle>Noch keine Workshop-Maps</EmptyTitle><EmptyDescription>Maps aus dem Server-Workshop erscheinen hier, sobald sie hinzugefügt wurden.</EmptyDescription></EmptyHeader></Empty>}
      </section>;
    })}
  </div>;
}
