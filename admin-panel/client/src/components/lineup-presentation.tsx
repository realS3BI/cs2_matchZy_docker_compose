import { useState } from "react";
import { ArrowUp, ChevronsDown, Crosshair, Footprints, MapPin, Mouse, MoveRight, PersonStanding, Target, Timer, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CLICK_LABELS, MOVEMENT_LABELS, movementType } from "../../../shared/throw-attributes";

export function CrosshairView({ nade, open, onOpenChange }) {
  const [zoom, setZoom] = useState(3);
  const image = nade?.reviewMedia?.aim;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="crosshair-dialog" onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>{nade?.displayName || nade?.name} · Ausrichtung</DialogTitle><DialogDescription>Der Zoom ist auf das Fadenkreuz in der Bildmitte ausgerichtet.</DialogDescription></DialogHeader>
      {image ? <>
        <div className="crosshair-viewport"><img src={image.url} alt={`Ausrichtung für ${nade.displayName || nade.name}`} style={{ transform: `scale(${zoom})` }} /></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setZoom(value => Math.max(1, value - 1))} disabled={zoom <= 1}><ZoomOut />Verkleinern</Button>
          <span className="text-sm tabular-nums" aria-live="polite">{zoom}×</span>
          <Button variant="secondary" size="sm" onClick={() => setZoom(value => Math.min(6, value + 1))} disabled={zoom >= 6}><ZoomIn />Vergrößern</Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>Ganzes Bild</Button>
        </div>
      </> : <p className="text-sm text-muted-foreground">Für dieses Lineup ist noch kein Ausrichtungsbild vorhanden.</p>}
    </DialogContent>
  </Dialog>;
}

export function ThrowGuide({ nade }) {
  const movement = movementType(nade);
  const attributesKnown = ["is_jumpthrow", "is_crouch", "is_walking", "is_running", "is_stepping"].some(key => typeof nade[key] === "boolean");
  const facts = [
    { Icon: nade.is_crouch ? ChevronsDown : PersonStanding, label: "Haltung", value: attributesKnown ? nade.is_crouch ? "Geduckt" : "Aufrecht" : "Nicht erfasst" },
    { Icon: movement === "stand" ? PersonStanding : Footprints, label: "Bewegung", value: attributesKnown ? MOVEMENT_LABELS[movement] : "Nicht erfasst" },
    { Icon: Mouse, label: "Maustaste", value: CLICK_LABELS[nade.click_type] || "Nicht erfasst" },
    { Icon: ArrowUp, label: "Abwurf", value: attributesKnown ? nade.is_jumpthrow ? "Jumpthrow" : "Ohne Sprung" : "Nicht erfasst" },
  ];
  return <section className="throw-guide" aria-label="Wurfanleitung">
    <h2>So wirfst du dieses Lineup</h2>
    <div className="throw-route"><span><MapPin />{nade.throwFromTitle || "Startposition"}</span><MoveRight aria-label="nach" /><span><Target />{nade.throwToTitle || "Zielposition"}</span></div>
    <dl className="throw-technique">{facts.map(({ Icon, label, value }) => <div key={label}><Icon aria-hidden="true" /><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <ol className="throw-steps">
      <li><MapPin aria-hidden="true" /><div><strong>Position einnehmen</strong><p>Stelle dich an {nade.throwFromTitle || "die gezeigte Startposition"}{nade.is_crouch ? " und ducke dich" : ""}. Nutze die Standposition als Referenz.</p></div></li>
      <li><Crosshair aria-hidden="true" /><div><strong>Fadenkreuz ausrichten</strong><p>Übernimm den Zielpunkt im Ausrichtungsbild. Mit dem Fadenkreuz-Zoom erkennst du das genaue Detail.</p></div></li>
      <li><Mouse aria-hidden="true" /><div><strong>Granate werfen</strong><p>{attributesKnown ? `${MOVEMENT_LABELS[movement]}${nade.is_jumpthrow ? " · Jumpthrow" : " · ohne Sprung"}` : "Bewegung wie im Video"} · {CLICK_LABELS[nade.click_type] || "Maustaste wie im Video"}. Übernimm das Timing aus dem Video.</p></div></li>
    </ol>
    {nade.desc && <p className="throw-description">{nade.desc}</p>}
    {typeof nade.flightDuration === "number" && <p className="throw-duration"><Timer aria-hidden="true" />{nade.flightDuration.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s bis zur Wirkung</p>}
  </section>;
}

export function OfficialLineupMedia({ nade }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const video = nade.reviewMedia?.video;
  const photos = [
    { slot: "position", title: "Standposition", Icon: MapPin },
    { slot: "aim", title: "Ausrichtung", Icon: Crosshair },
    { slot: "effect", title: "Wirkung am Ziel", Icon: Target },
    { slot: "front", title: "Vorderansicht", Icon: PersonStanding },
  ];
  return <div className="official-lineup-media">
    {video ? <video className="lineup-hero-video" src={video.url} poster={nade.reviewMedia?.aim?.url} controls playsInline preload="metadata" aria-label={`Wurfvideo: ${nade.displayName || nade.name}`} /> : <p className="text-sm text-muted-foreground">Für dieses Lineup ist noch kein Video vorhanden.</p>}
    <ThrowGuide nade={nade} />
    <section className="lineup-reference-images" aria-label="Bildanleitung">
      {photos.map(({ slot, title, Icon }) => {
        const image = nade.reviewMedia?.[slot];
        if (!image) return null;
        return <figure key={slot}>
          <figcaption><Icon aria-hidden="true" /><h3>{title}</h3>{slot === "aim" && <Button size="sm" variant="ghost" onClick={() => setZoomOpen(true)}><ZoomIn />Fadenkreuz-Zoom</Button>}</figcaption>
          {slot === "aim" ? <button className="lineup-aim-image" onClick={() => setZoomOpen(true)} aria-label="Ausrichtung mit Fadenkreuz-Zoom öffnen"><img src={image.url} alt={`Ausrichtung für ${nade.displayName || nade.name}`} loading="lazy" /></button> : <img src={image.url} alt={`${title}: ${nade.displayName || nade.name}`} loading="lazy" />}
        </figure>;
      })}
    </section>
    <CrosshairView nade={nade} open={zoomOpen} onOpenChange={setZoomOpen} />
  </div>;
}
