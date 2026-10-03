import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUp, ChevronsDown, Copy, Crosshair, Film, Footprints, Link2, MapPin, Mouse, PersonStanding, Target, Timer, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Badge } from "./ui/badge";
import { ActionButton } from "./action-button";
import { FavoriteButton } from "./nade-favorites";
import { GrenadeIcon, TeamIcon } from "./nade-icons";
import { TEAM_LABELS, isLineupTeam } from "../../../shared/lineup-teams";
import { copyText } from "../lib/clipboard";
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

export function useHeldShift() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]")) return;
      setHeld(true);
    };
    const up = (event: KeyboardEvent) => { if (event.key === "Shift") setHeld(false); };
    const reset = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", reset); };
  }, []);
  return held;
}

export function ThrowFacts({ nade }) {
  const movement = movementType(nade);
  const attributesKnown = ["is_jumpthrow", "is_crouch", "is_walking", "is_running", "is_stepping"].some(key => typeof nade[key] === "boolean");
  const facts = [
    { Icon: null, label: "Team", value: isLineupTeam(nade.team) ? <><TeamIcon team={nade.team} />{TEAM_LABELS[nade.team]}</> : "Nicht hinterlegt" },
    { Icon: null, label: "Technik", value: <>{nade.is_jumpthrow && <ArrowUp aria-label="Jumpthrow" />}<Mouse aria-hidden="true" />{nade.is_jumpthrow ? "Jumpthrow + " : ""}{CLICK_LABELS[nade.click_type] || "Maustaste nicht erfasst"}</> },
    { Icon: nade.is_crouch ? ChevronsDown : PersonStanding, label: "Haltung", value: attributesKnown ? nade.is_crouch ? "Geduckt" : "Aufrecht" : "Nicht erfasst" },
    { Icon: movement === "stand" ? PersonStanding : Footprints, label: "Bewegung", value: attributesKnown ? MOVEMENT_LABELS[movement] : "Nicht erfasst" },
    { Icon: Timer, label: "Flugzeit", value: typeof nade.flightDuration === "number" ? `${nade.flightDuration.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : "Noch nicht erfasst" },
  ];
  return <dl className="official-throw-facts" aria-label="Wurfattribute">{facts.map(({ Icon, label, value }) => <div key={label}><dt>{label}</dt><dd>{Icon && <Icon aria-hidden="true" />}{value}</dd></div>)}</dl>;
}

export function OfficialLineupDetail({ nade, map, back, onBack, mapContent, management, children }) {
  const [view, setView] = useState(nade.reviewMedia?.video ? "video" : "lineup");
  const [photoSlot, setPhotoSlot] = useState("aim");
  const [zoomOpen, setZoomOpen] = useState(false);
  const shift = useHeldShift();
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeVideo = useRef(false);
  const activeView = shift && nade.reviewMedia?.aim && !zoomOpen ? "lineup" : view;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (activeView !== "video") { resumeVideo.current = !video.paused; video.pause(); }
    else if (resumeVideo.current) { resumeVideo.current = false; void video.play().catch(() => {}); }
  }, [activeView]);
  const photos = [
    { slot: "aim", title: "Ausrichtung", Icon: Crosshair },
    { slot: "position", title: "Standposition", Icon: MapPin },
    { slot: "front", title: "Vorderansicht", Icon: PersonStanding },
    { slot: "effect", title: "Wirkung am Ziel", Icon: Target },
  ].filter(photo => nade.reviewMedia?.[photo.slot]);
  const selectedPhoto = photos.find(photo => photo.slot === (shift ? "aim" : photoSlot)) || photos[0];
  return <article className="playbook-page lineup-page official-lineup-detail">
    <header className="official-lineup-heading"><Link to={back} onClick={onBack} aria-label={`Zurück zu ${map.name}`}><ArrowLeft /></Link><h1>{map.name} · {nade.type === "Molly" ? "Molotov" : nade.type}: {nade.displayName || nade.name}</h1></header>
    <div className="official-lineup-layout">
      <div className="official-lineup-main">
        <div className="official-media-stage">
          {nade.reviewMedia?.video && <video ref={videoRef} hidden={activeView !== "video"} className="lineup-hero-video" src={nade.reviewMedia.video.url} poster={nade.reviewMedia?.aim?.url} controls playsInline preload="metadata" aria-label={`Wurfvideo: ${nade.displayName || nade.name}`} />}
          {activeView === "video" && !nade.reviewMedia?.video && <p className="official-media-empty">Für dieses Lineup ist noch kein Video vorhanden.</p>}
          {activeView === "lineup" && (selectedPhoto ? <figure className="official-lineup-photo">
            <div className="official-photo-viewport"><img src={nade.reviewMedia[selectedPhoto.slot].url} alt={`${selectedPhoto.title}: ${nade.displayName || nade.name}`} style={{ transform: shift && selectedPhoto.slot === "aim" ? "scale(3)" : undefined }} /></div>
            <figcaption>{selectedPhoto.title}{shift && " · Fadenkreuz-Zoom"}</figcaption>
            {selectedPhoto.slot === "aim" && <Button className="official-photo-zoom" variant="secondary" size="sm" onClick={() => setZoomOpen(true)}><ZoomIn />Fadenkreuz-Zoom</Button>}
          </figure> : <p className="official-media-empty">Für dieses Lineup sind noch keine Bilder vorhanden.</p>)}
        </div>
        <div className="official-lineup-actions"><FavoriteButton nade={nade} /><ActionButton size="sm" variant="secondary" icon={Link2} onClick={() => copyText(window.location.href)} successLabel="Link kopiert">Link kopieren</ActionButton><ActionButton size="sm" variant="secondary" icon={Copy} onClick={() => copyText(`.loadnade ${nade.name}`)} successLabel="Kopiert">Ingame-Befehl kopieren</ActionButton></div>
        {activeView === "lineup" && photos.length > 0 && <div className="official-photo-picker" role="group" aria-label="Lineup-Bilder auswählen">{photos.map(({ slot, title, Icon }) => <button key={slot} aria-pressed={selectedPhoto?.slot === slot} onClick={() => setPhotoSlot(slot)}><img src={nade.reviewMedia[slot].url} alt="" loading="lazy" /><span><Icon aria-hidden="true" />{title}</span></button>)}</div>}
        {mapContent}
        {nade.lineupImages?.length > 0 && <section className="lineup-images" aria-label="Weitere Bilder zur Anleitung">{nade.lineupImages.map(image => <figure key={image.key || image.url}><img src={image.url} alt={image.name || `Ausrichtung für ${nade.displayName || nade.name}`} loading="lazy" /><figcaption>{image.name}</figcaption></figure>)}</section>}
      </div>
      <aside className="official-lineup-sidebar" aria-label="Ansicht und Wurfanleitung">
        <ToggleGroup type="single" variant="outline" value={activeView} onValueChange={value => { if (value) setView(value); }} className="official-view-switch" aria-label="Video oder Lineup anzeigen"><ToggleGroupItem value="video"><Film />Video</ToggleGroupItem><ToggleGroupItem value="lineup"><Crosshair />Lineup</ToggleGroupItem></ToggleGroup>
        <ThrowFacts nade={nade} />
        <div className="official-lineup-labels"><Badge variant="success">Offiziell</Badge>{nade.mustKnow && <Badge>Must Know</Badge>}</div>
        <section className="official-lineup-instructions" aria-label="Anleitung"><h2><GrenadeIcon type={nade.type} />So wirfst du dieses Lineup</h2><p className="official-lineup-route">{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Zielposition"}</p>{nade.desc && <p className="throw-description">{nade.desc}</p>}{nade.reviewMedia?.aim && <p className="official-shift-hint"><kbd>Shift</kbd> halten: Ausrichtung mit Fadenkreuz-Zoom</p>}</section>
        <details className="official-lineup-management"><summary>Verwalten und Wurfdaten</summary><div>{management}</div></details>
      </aside>
    </div>
    <CrosshairView nade={nade} open={zoomOpen} onOpenChange={setZoomOpen} />
    {children}
  </article>;
}
