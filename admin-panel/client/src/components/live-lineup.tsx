import { useState } from "react";
import { Link } from "react-router-dom";
import { Expand, ImageOff, Play } from "lucide-react";
import type { ReviewMedia, ReviewSlot } from "../../../shared/review-media";
import { throwAttributeSummary } from "../../../shared/throw-attributes";
import { lineupPath, type LineupReference } from "@/lib/lineups";
import type { MapDefinition } from "@/lib/maps";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { CrosshairView } from "./lineup-presentation";

export type LiveLineup = LineupReference & {
  displayName?: string; type?: string; desc?: string; throwFromTitle?: string; throwToTitle?: string;
  reviewMedia?: ReviewMedia; lineupImages?: { key?: string; url: string; name?: string }[];
  is_jumpthrow?: boolean; is_crouch?: boolean; is_walking?: boolean; is_running?: boolean; is_stepping?: boolean; click_type?: string;
};
const slots: { id: ReviewSlot; title: string }[] = [
  { id: "position", title: "Position" }, { id: "aim", title: "Ausrichtung" },
  { id: "video", title: "Video" }, { id: "effect", title: "Wirkung" }, { id: "front", title: "Vorderansicht" },
];

function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="live-media-missing"><ImageOff />Bild nicht verfügbar</span> : <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function LiveLineupCard({ nade, map }: { nade: LiveLineup; map?: MapDefinition }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const title = nade.displayName || nade.name;
  const preview = nade.reviewMedia?.position || nade.reviewMedia?.aim || nade.reviewMedia?.effect || nade.lineupImages?.[0];
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setZoom(false); }}>
    <DialogTrigger asChild><button type="button" className="live-lineup-card">
      <span className="live-lineup-preview">{preview ? <MediaImage key={preview.url} src={preview.url} alt={`Vorschau: ${title}`} /> : <span className="live-media-missing">{nade.reviewMedia?.video ? <Play /> : <ImageOff />}{nade.reviewMedia?.video ? "Video ansehen" : "Anleitung öffnen"}</span>}<span className="live-lineup-open"><Expand />Ansehen</span></span>
      <span className="live-lineup-caption"><strong>{title}</strong><span>{nade.throwFromTitle || "Lineup"}{nade.throwToTitle ? ` → ${nade.throwToTitle}` : ""}</span><span>{throwAttributeSummary(nade)}</span></span>
    </button></DialogTrigger>
    <DialogContent className="live-lineup-dialog">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{nade.throwFromTitle}{nade.throwToTitle ? ` → ${nade.throwToTitle}` : ""} · {throwAttributeSummary(nade)}</DialogDescription></DialogHeader>
      {open && <LineupMedia key={nade.id || nade.name} nade={nade} onZoom={() => setZoom(true)} />}
      {nade.desc && <p className="live-lineup-description">{nade.desc}</p>}
      {map && <Button asChild variant="outline"><Link to={lineupPath(map, nade)} target="_blank" rel="noopener noreferrer">Vollständiges Lineup öffnen ↗</Link></Button>}
      <CrosshairView className="live-crosshair-dialog" nade={nade} open={zoom} onOpenChange={setZoom} />
    </DialogContent>
  </Dialog>;
}

function LineupMedia({ nade, onZoom }: { nade: LiveLineup; onZoom: () => void }) {
  const available = slots.filter(slot => nade.reviewMedia?.[slot.id]);
  const [selected, setSelected] = useState<ReviewSlot | "legacy">(available[0]?.id || "legacy");
  const [videoFailed, setVideoFailed] = useState(false);
  const media = selected === "legacy" ? nade.lineupImages?.[0] : nade.reviewMedia?.[selected];
  return <>
    <div className="live-media-tabs" role="group" aria-label="Lineup-Medien">
      {available.map(slot => <Button key={slot.id} variant={selected === slot.id ? "secondary" : "outline"} aria-pressed={selected === slot.id} onClick={() => setSelected(slot.id)}>{slot.title}</Button>)}
      {!!nade.lineupImages?.length && <Button variant={selected === "legacy" ? "secondary" : "outline"} aria-pressed={selected === "legacy"} onClick={() => setSelected("legacy")}>Weitere Bilder</Button>}
    </div>
    <div className="live-media-stage">
      {selected === "video" && media ? videoFailed ? <span className="live-media-missing"><ImageOff />Video nicht verfügbar</span> : <video src={media.url} poster={nade.reviewMedia?.aim?.url} controls playsInline preload="none" onError={() => setVideoFailed(true)} /> : selected === "legacy" && nade.lineupImages?.length ? <div className="live-legacy-images">{nade.lineupImages.map(image => <MediaImage key={image.url} src={image.url} alt={image.name || nade.displayName || nade.name} />)}</div> : media ? <MediaImage key={media.url} src={media.url} alt={`${slots.find(slot => slot.id === selected)?.title}: ${nade.displayName || nade.name}`} /> : <span className="live-media-missing"><ImageOff />Für dieses Lineup sind noch keine Medien vorhanden.</span>}
    </div>
    {selected === "aim" && media && <Button variant="outline" onClick={onZoom}><Expand />Ausrichtung vergrößern</Button>}
  </>;
}
