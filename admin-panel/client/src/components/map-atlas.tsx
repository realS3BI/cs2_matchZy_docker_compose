import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, MapPinned } from "lucide-react";
import { mapPath, mapSlug, type MapDefinition } from "../lib/maps";
import { MAP_CARD_ART } from "../lib/map-card-art";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

const groups = [
  { key: "active", title: "Active Duty" },
  { key: "reserve", title: "Reserve-Pool" },
  { key: "inactive", title: "Inaktive Maps" },
  { key: "other", title: "Weitere Maps" },
  { key: "workshop", title: "Workshop" },
];
function groupFor(map: MapDefinition) {
  if (map.workshopId || map.category === "workshop") return "workshop";
  if (["community", "unavailable"].includes(map.category)) return "inactive";
  return map.category;
}

function MapCard({ map }: { map: MapDefinition }) {
  const art = map.workshopId ? undefined : MAP_CARD_ART[map.mapName];
  const [imageFailed, setImageFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  return <Link to={mapPath(map)} className="map-atlas-card">
    {art?.imageUrl && !imageFailed && <img className="map-atlas-card-background" src={art.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />}
    <div className="map-atlas-card-emblem" aria-hidden="true">
      {art?.logoUrl && !logoFailed
        ? <img src={art.logoUrl} alt="" loading="lazy" onError={() => setLogoFailed(true)} />
        : <MapPinned className="map-atlas-card-placeholder" />}
    </div>
    <strong className="map-atlas-card-name">{map.name}</strong>
  </Link>;
}

export function MapAtlas({ maps }: { maps: MapDefinition[] }) {
  return <div className="playbook-page map-atlas-page">
    <header className="playbook-heading"><h1>Alle Maps</h1></header>
    {maps.length === 0 && <Empty><EmptyHeader><EmptyTitle>Noch keine Maps</EmptyTitle><EmptyDescription>Verfügbare Maps erscheinen hier.</EmptyDescription></EmptyHeader></Empty>}
    {groups.map(group => {
      const entries = maps.filter(map => groupFor(map) === group.key);
      if (!entries.length && group.key !== "workshop") return null;
      const content = <>
        <div className="map-catalog-grid">{entries.map(map => <MapCard key={mapSlug(map)} map={map} />)}</div>
        {!entries.length && <Empty className="border"><EmptyHeader><EmptyTitle>Noch keine Workshop-Maps</EmptyTitle><EmptyDescription>Maps aus dem Server-Workshop erscheinen hier, sobald sie hinzugefügt wurden.</EmptyDescription></EmptyHeader></Empty>}
      </>;
      if (group.key === "active") return <section key={group.key} aria-labelledby={`maps-${group.key}`}>
        <div className="section-heading"><h2 id={`maps-${group.key}`}>{group.title}</h2></div>
        {content}
      </section>;
      return <Collapsible key={group.key} asChild>
        <section aria-labelledby={`maps-${group.key}`}>
          <h2 id={`maps-${group.key}`}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                {group.title}<ChevronDown data-icon="inline-end" aria-hidden="true" className="map-category-chevron" />
              </Button>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="pt-4">{content}</CollapsibleContent>
        </section>
      </Collapsible>;
    })}
  </div>;
}
