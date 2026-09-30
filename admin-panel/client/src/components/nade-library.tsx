import { useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { NadeFlightMap } from "./map-radar";
import { mapsForInventory } from "../lib/maps";
import { inferRadarCalibration } from "../lib/nade-radar";

export function NadeLibrary({ nades, settings, status, role }) {
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("all");
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const maps = useMemo(() => mapsForInventory(settings, status?.mapInventory), [settings, status]);
  const mapNames = [...new Set([...nades.map(nade => nade.map), ...(role === "match_admin" ? maps.map(map => map.mapName) : [])])].sort() as string[];
  const visible = nades.filter(nade => (map === "all" || nade.map === map) && (kind === "all" || nade.type === kind) && `${nade.displayName || nade.name} ${nade.desc} ${nade.map}`.toLowerCase().includes(query.toLowerCase()));
  const selectedMap = maps.find(map => map.mapName === selected?.map);
  return <div className="flex flex-col gap-5">
    <header><p className="font-mono text-xs text-muted-foreground">MATCHZY / LINEUPS</p><h1 className="control-title mt-2 text-3xl">{role === "player" ? "Offizielle Nades" : "Maps & Nades"}</h1><p className="mt-2 text-muted-foreground">{role === "player" ? "Lerne die freigegebenen Lineups für deine nächste Runde." : "Alle Aufnahmen und offiziellen Lineups. Nades und Map-Daten sind schreibgeschützt."}</p></header>
    <FieldGroup className="sm:flex-row"><Field><FieldLabel><label htmlFor="nade-search">Suchen</label></FieldLabel><Input id="nade-search" placeholder="Name, Beschreibung oder Map" value={query} onChange={event => setQuery(event.target.value)} /></Field><Field><FieldLabel>Map</FieldLabel><Select value={map} onValueChange={setMap}><SelectTrigger aria-label="Map filtern"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Alle Maps</SelectItem>{mapNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>Granate</FieldLabel><Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Granatentyp filtern"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Alle Typen</SelectItem>{["Smoke", "Flash", "HE", "Molly", "Decoy"].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup>
    <p className="text-sm text-muted-foreground">{visible.length} Lineups{map !== "all" ? ` auf ${map}` : ""}</p>
    {visible.length === 0 && <Card><CardHeader><CardTitle>Keine Lineups gefunden</CardTitle><CardDescription>{nades.length ? "Wähle eine andere Map oder passe deine Suche an." : "Hier erscheinen Nades, sobald passende Aufnahmen verfügbar sind."}</CardDescription></CardHeader></Card>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(nade => {
      const image = nade.lineupImages?.[0]?.url || maps.find(map => map.mapName === nade.map)?.radarUrl;
      return <Card key={`${nade.owner}/${nade.map}/${nade.name}`} className="overflow-hidden"><CardHeader><div className="flex flex-wrap gap-2"><Badge variant="secondary">{nade.map}</Badge><Badge variant="outline">{nade.type || "Nade"}</Badge>{nade.mustKnow ? <Badge>Must Know</Badge> : nade.official ? <Badge variant="success">Offiziell</Badge> : <Badge variant="outline">Aufnahme</Badge>}</div><CardTitle>{nade.displayName || nade.name}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">{image && <img src={image} alt={`Lineup auf ${nade.map}`} loading="lazy" className="h-40 w-full rounded-md bg-console object-contain" />}<p className="line-clamp-2 text-sm text-muted-foreground">{nade.desc || "Noch keine Beschreibung."}</p><Button variant="secondary" onClick={() => setSelected(nade)}>Lineup ansehen</Button></CardContent></Card>;
    })}</div>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{selected?.displayName || selected?.name}</DialogTitle><DialogDescription>{selected?.map} · {selected?.type}</DialogDescription></DialogHeader>{selected && <div className="flex flex-col gap-4"><p className="whitespace-pre-wrap">{selected.desc}</p>{selectedMap && <NadeFlightMap map={selectedMap} nades={[selected]} calibration={inferRadarCalibration(selectedMap, nades.filter(nade => nade.map === selected.map))} />}<p className="text-sm text-muted-foreground">{selected.throwTechnique}</p>{selected.lineupImages?.map(image => <img key={image.key} src={image.url} alt={image.name} className="w-full rounded-lg" />)}</div>}</DialogContent></Dialog>
  </div>;
}
