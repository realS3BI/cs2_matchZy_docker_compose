import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "./ui/empty";
import { NadeFlightMap } from "./map-radar";
import { FavoriteButton } from "./nade-favorites";
import { mapMatchesNade, mapPath, mapSlug } from "../lib/maps";
import { findLineup, lineupKey } from "../lib/lineups";
import { inferRadarCalibration } from "../lib/nade-radar";

export function LineupPage({ maps, nades }) {
  const { mapSlug: slug, lineupId } = useParams();
  const [search] = useSearchParams();
  const map = maps.find(map => mapSlug(map) === slug);
  const nade = findLineup<any>(nades, lineupId);
  if (!map || !nade || !mapMatchesNade(map, nade.map)) return <Empty><EmptyHeader><EmptyTitle>Lineup nicht gefunden</EmptyTitle><EmptyDescription>Diese Aufnahme wurde entfernt oder der Link ist ungültig.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="secondary"><Link to={map ? mapPath(map) : "/maps"}>Zurück zu den Maps</Link></Button></EmptyContent></Empty>;
  const back = `${mapPath(map)}${search.size ? `?${search}` : ""}`;
  return <article className="playbook-page lineup-page">
    <div><Button asChild variant="ghost" size="sm"><Link to={back}><ArrowLeft data-icon="inline-start" />Alle Lineups auf {map.name}</Link></Button></div>
    <header className="playbook-heading"><div><p className="control-kicker">{map.name} · {nade.type || "Nade"}</p><h1>{nade.displayName || nade.name}</h1><p>{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Landeposition"}</p></div><FavoriteButton nade={nade} /></header>
    <LineupContent key={lineupKey(nade)} nade={nade} map={map} nades={nades} />
  </article>;
}

function formatThrowTrace(value) {
  try {
    const samples = JSON.parse(String(value || ""));
    if (!Array.isArray(samples)) return "";
    return samples.map(sample => `${Number(sample.time).toFixed(2)}s · ${sample.buttons || "keine Taste"} · Position ${sample.position || "?"} · Geschwindigkeit ${sample.velocity || "?"} · Blickwinkel ${sample.view || "?"}`).join("\n");
  } catch { return ""; }
}

function LineupContent({ nade, map, nades }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  return <div className="lineup-detail-content">
      {nade && <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{nade.type || "Nade"}</Badge>{nade.official && <Badge variant="success">Offiziell</Badge>}{nade.mustKnow && <Badge>Must Know</Badge>}</div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{nade.desc || "Zu diesem Lineup gibt es noch keine Beschreibung."}</p>
        {map && <NadeFlightMap map={map} nades={[nade]} calibration={inferRadarCalibration(map, nades.filter(item => mapMatchesNade(map, item.map)))} />}
        <dl className="lineup-detail-facts">
          <div><dt>Wurfweg</dt><dd>{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Landeposition"}</dd></div>
          <div><dt>Wurftechnik</dt><dd>{nade.throwTechnique || "Nicht angegeben"}</dd></div>
          {nade.lineupPos && <div><dt>Position</dt><dd className="font-mono">{nade.lineupPos}</dd></div>}
          {nade.landingPos && <div><dt>Landeposition</dt><dd className="font-mono">{nade.landingPos}</dd></div>}
          {nade.lineupAng && <div><dt>Blickwinkel</dt><dd className="font-mono">{nade.lineupAng}</dd></div>}
        </dl>
        {nade.throwTrace && <details className="disclosure-panel"><summary>Aufgezeichnete Tasten und Bewegung</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap p-4 text-xs text-muted-foreground">{formatThrowTrace(nade.throwTrace) || "Keine lesbaren Wurfdaten vorhanden."}</pre></details>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(`.loadnade ${nade.name}`); setCopied(true); setCopyError(""); }
            catch { setCopyError("Kopieren nicht möglich. Markiere den Befehl und kopiere ihn manuell."); }
          }}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? "Kopiert" : "Ingame-Befehl kopieren"}</Button>
          <code className="break-all text-xs text-muted-foreground">.loadnade {nade.name}</code>
        </div>
        {copyError && <p role="status" className="text-sm text-muted-foreground">{copyError}</p>}
        {nade.lineupImages?.map(image => <figure key={image.key || image.url}><img src={image.url} alt={image.name || `Ausrichtung für ${nade.displayName || nade.name}`} className="w-full rounded-lg" /><figcaption className="mt-2 text-xs text-muted-foreground">{image.name}</figcaption></figure>)}
      </div>}
    </div>;
}

