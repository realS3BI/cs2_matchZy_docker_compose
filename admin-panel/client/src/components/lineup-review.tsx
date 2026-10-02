import { useEffect, useRef, useState } from "react";
import { genUploader } from "uploadthing/client";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Circle, Crosshair, Film, MonitorUp, Play, Send, ShieldCheck, Square, Upload } from "lucide-react";
import type { ReviewFileRouter } from "../../../src/uploadthing";
import { REVIEW_STEPS, canUploadReviewMedia, missingReviewMedia, reviewFileError, type ReviewSlot } from "../../../shared/review-media";
import { lineupPermissions } from "../../../shared/lineup-policy";
import { THROW_ATTRIBUTE_FIELDS } from "../../../shared/throw-attributes";
import { useReviewCapture } from "../hooks/use-review-capture";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { ActionButton } from "./action-button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { ReviewPhotoFrame } from "./review-photo-frame";
import { ReviewGameSetup } from "./review-game-setup";
import { desktop } from "../lib/playbook-desktop";

const { uploadFiles } = genUploader<ReviewFileRouter>({ url: "/api/uploadthing" });
const steps = [...REVIEW_STEPS, { id: "finish", title: "Alles bereit für den Review", short: "Prüfung", description: "Prüfe die Aufnahmen und die Wurfdaten. Die offizielle Freigabe übernimmt ein Plattform-Admin." }] as const;

export function LineupReview({ nade, user, disabled, mutate, onEntriesChange }) {
  const [index, setIndex] = useState(() => Math.max(0, REVIEW_STEPS.findIndex(step => !nade.reviewMedia?.[step.id])));
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [retry, setRetry] = useState<{ slot: ReviewSlot; file: File } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const running = useRef(false);
  const currentNade = useRef(nade);
  currentNade.current = nade;
  const permissions = lineupPermissions(nade, user);
  const editable = canUploadReviewMedia(nade, user);
  const missing = missingReviewMedia(nade);
  const step = steps[index];
  const media = nade.reviewMedia?.[step.id];
  const locked = disabled || uploading;
  useEffect(() => {
    let active = true;
    api("/api/nades/review/config").then(data => { if (active) setEnabled(data.uploadEnabled); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);

  async function upload(slot: ReviewSlot, file: File) {
    if (running.current || disabled) throw new Error("Bitte die laufende Aktion beenden und Änderungen zuerst speichern.");
    if (!enabled || !editable) throw new Error("Uploads sind für dieses Lineup gerade nicht verfügbar.");
    const validation = reviewFileError(slot, file);
    if (validation) throw new Error(validation);
    running.current = true;
    setUploading(true); setProgress(0); setError(""); setRetry({ slot, file });
    try {
      const previous = currentNade.current;
      const { owner, map, name } = previous;
      // Playing the lineup records a new flight measurement and revision while
      // this page is open. Refresh before every attempt, retaining the File.
      const latest = await api("/api/nades");
      const entry = latest.entries.find(n => n.owner === owner && n.map === map && n.name === name);
      if (!entry) throw new Error("Dieses Lineup ist nicht mehr verfügbar.");
      currentNade.current = entry;
      onEntriesChange(latest.entries);
      if (!canUploadReviewMedia(entry, user)) throw new Error("Für dieses Lineup sind keine weiteren Uploads erlaubt. Es wurde möglicherweise bereits freigegeben.");
      if (["lineupPos", "lineupAng", "type", "throwTechnique", ...THROW_ATTRIBUTE_FIELDS].some(key => previous[key] !== entry[key]))
        throw new Error("Die Wurfdaten wurden geändert und sind jetzt aktualisiert. Prüfe, ob die Aufnahme noch passt, bevor du den Upload erneut versuchst.");
      const options = { files: [file], input: { owner, map, name, revision: entry.updatedAt, slot }, onUploadProgress: ({ totalProgress }) => setProgress(totalProgress) };
      const result = await uploadFiles(slot === "video" ? "reviewVideo" : "reviewPhoto", options);
      if (!result?.[0]?.serverData?.saved) throw new Error("Die Datei wurde nicht bestätigt. Bitte erneut versuchen.");
      const data = await api("/api/nades");
      currentNade.current = data.entries.find(n => n.owner === owner && n.map === map && n.name === name) || currentNade.current;
      onEntriesChange(data.entries);
      setRetry(null);
    } catch (error) { setError(error.message || "Upload fehlgeschlagen. Die Aufnahme kann erneut hochgeladen werden."); throw error; }
    finally { running.current = false; setUploading(false); }
  }
  const capture = useReviewCapture({ nade, admin: permissions.moderate, upload, onStep: (slot: ReviewSlot) => setIndex(REVIEW_STEPS.findIndex(step => step.id === slot)), onError: setError, disabled: disabled || !editable });
  useEffect(() => {
    if (preview.current) preview.current.srcObject = capture.capture?.stream || null;
  }, [capture.capture]);
  async function run(action: () => unknown) {
    setError("");
    try { await action(); } catch (error) { setError(error.message || "Die Aufnahme konnte nicht gespeichert werden."); }
  }
  const completed = REVIEW_STEPS.length - missing.length;
  const stepComplete = (id: string) => id === "finish" ? nade.official : !!nade.reviewMedia?.[id];
  return <section id="lineup-review" className="review-workspace" aria-labelledby="review-title">
    <header className="review-heading">
      <div><p className="review-eyebrow">{nade.official ? "Geprüfte Anleitung" : "Lineup dokumentieren"}</p><h2 id="review-title">Ein Wurf. Alle Perspektiven.</h2></div>
      <Badge variant={nade.official ? "success" : "outline"}>{nade.official ? "Offiziell freigegeben" : `${completed} / 5 Aufnahmen`}</Badge>
    </header>
    <nav aria-label="Review-Schritte" className="review-stepper">
      <ol>{steps.map((item, i) => <li key={item.id}>
        <button type="button" className={cn("review-step", i === index && "review-step-current")} aria-current={i === index ? "step" : undefined} onClick={() => setIndex(i)}>
          <span className="review-step-number">{stepComplete(item.id) ? <Check aria-label="Vollständig" /> : i + 1}</span><span>{item.short}</span>
        </button>
      </li>)}</ol>
    </nav>

    {editable && <ReviewGameSetup />}
    {editable && <div className="review-capture-bar">
      <div className="review-capture-copy"><MonitorUp aria-hidden="true" /><div><strong>{capture.capture ? "Spielbild verbunden" : "Direkt aus CS2 aufnehmen"}</strong><p>{capture.capture ? "Fotos und Video werden nach der Aufnahme direkt hochgeladen. Video ohne Ton, maximal zwei Minuten." : desktop ? "Playbook erkennt dein CS2-Fenster automatisch. Die App bleibt während des Reviews geöffnet." : "In Chrome oder Edge dein CS2-Fenster freigeben. Die Review-Seite bleibt während des Spiels offen."}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {capture.recording && <Button disabled={uploading} onClick={() => run(capture.stopVideo)}><Square data-icon="inline-start" />Video stoppen und hochladen</Button>}
        {capture.capture ? <Button variant="outline" disabled={uploading || capture.recording} onClick={capture.disconnect}>Freigabe beenden</Button> : <Button variant="outline" disabled={!enabled || locked || capture.connecting} onClick={() => run(capture.connect)}><MonitorUp data-icon="inline-start" />{capture.connecting ? "Verbindet …" : "Spielbild verbinden"}</Button>}
      </div>
      {capture.capture && <video ref={preview} autoPlay muted playsInline className="review-live-preview" aria-label="Vorschau des freigegebenen Spielbilds" />}
      {capture.notice && <p className="review-capture-notice" role="status">{capture.notice}</p>}
      {capture.capture && !desktop && <ReviewPhotoFrame capture={capture.capture} disabled={locked || capture.recording} />}
      {capture.capture && desktop && <p className="review-capture-notice">Der Fensterrand wird bei Fotos und Videos automatisch entfernt.</p>}
    </div>}
    {enabled === false && editable && <Alert><AlertTitle>Uploads noch nicht eingerichtet</AlertTitle><AlertDescription>{permissions.moderate ? "Hinterlege UPLOADTHING_TOKEN in der Serverumgebung und starte das Webpanel neu. Danach sind Datei-Uploads und die Browser-Aufnahme verfügbar." : "Ein Plattform-Admin muss den Upload-Dienst noch einrichten."}</AlertDescription></Alert>}
    {disabled && editable && <Alert><AlertTitle>Änderungen zuerst speichern</AlertTitle><AlertDescription>Speichere deine Wurfdaten, bevor du Medien ergänzt oder den Review abschließt.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertTitle>Aufnahme nicht abgeschlossen</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {retry && !uploading && <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">{retry.file.name} bleibt zum erneuten Upload bereit.</span><Button variant="secondary" disabled={locked} onClick={() => run(() => upload(retry.slot, retry.file))}>Upload erneut versuchen</Button></div>}

    {step.id !== "finish" ? <div className="review-step-layout">
      <div className={cn("review-media-stage", dragging && "review-media-dragging")}
        onDragOver={event => { if (editable && !locked && enabled) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (editable && !locked && enabled && event.dataTransfer.files[0]) void run(() => upload(step.id as ReviewSlot, event.dataTransfer.files[0])); }}>
        {media ? step.id === "video" ? <video key={media.url} src={media.url} controls preload="metadata" aria-label="Video des gesamten Lineups" /> : <img src={media.url} alt={`${step.title}: ${nade.displayName || nade.name}`} /> : <div className="review-media-empty">
          {step.id === "video" ? <Film aria-hidden="true" /> : <Crosshair aria-hidden="true" />}<strong>{step.title}</strong><span>{editable ? "Deine Aufnahme erscheint hier." : "Noch keine Aufnahme vorhanden."}</span>
          {editable && <Button variant="secondary" disabled={!enabled || locked || capture.recording} onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" />{step.id === "video" ? "Video auswählen" : "Foto auswählen"}</Button>}
        </div>}
        {uploading && <div className="review-upload-status" role="status"><span>Aufnahme wird hochgeladen · {progress} %</span><Progress value={progress} aria-label="Upload-Fortschritt" /></div>}
      </div>
      <Card className="review-instructions">
        <CardHeader><p className="review-eyebrow">Schritt {index + 1} von 6</p><CardTitle>{step.title}</CardTitle><CardDescription>{step.description}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="review-position"><span>{nade.throwFromTitle || "Startposition"}</span><ArrowRight aria-hidden="true" /><span>{nade.throwToTitle || "Zielposition"}</span></div>
          {step.id === "front" && editable && <p className="text-sm text-muted-foreground">{permissions.moderate ? "Der Spielserver lädt den Startpunkt und stellt eine feste Vorderansicht ohne Fadenkreuz ein. Nach dem Foto kehren Kamera, HUD und Panel zurück." : "Zeige die Spielfigur von vorne in Third Person. Für die automatische Kamera ist ein Plattform-Admin im Spiel nötig."}</p>}
          {step.id !== "video" && editable && permissions.moderate && <p className="text-sm text-muted-foreground">{desktop ? "Playbook stellt das Fadenkreuz direkt in CS2 ein und entfernt den Fensterrand automatisch. Deine bisherigen Einstellungen kehren nach dem Foto zurück." : "Die Ego-Fotos verwenden dein echtes CS2-Fadenkreuz. Bestätige vor dem ersten Foto den Fotoausschnitt, damit kein Fensterrand mit aufgenommen wird."}</p>}
          {step.id === "video" && <ol className="review-video-sequence"><li>Zum Startpunkt laufen</li><li>Auf den Lineup-Punkt zielen</li><li>Granate abwerfen</li><li>Mit Noclip zum Ziel fliegen</li><li>Die Wirkung zeigen</li></ol>}
          {step.id === "video" && editable && (desktop ? <p className="text-sm text-muted-foreground">Mit <kbd>F8</kbd> stoppst du das Video direkt im Spiel. Playbook lädt es anschließend hoch.</p> : permissions.moderate && <p className="text-sm text-muted-foreground">Einmal in der CS2-Konsole eingeben: <code>bind "F8" "css_training_review_stop"</code>. Danach stoppt F8 die Aufnahme auch bei geschlossenem Panel und startet den Upload.</p>)}
          {editable && <>
            <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} aria-label={step.id === "video" ? "Video-Datei" : "Foto-Datei"} accept={step.id === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp"} disabled={!enabled || locked || capture.recording} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => upload(step.id as ReviewSlot, file)); }} />
            <div className="flex flex-col gap-2">
              {capture.capture && (step.id === "video" ? <Button disabled={locked} onClick={() => run(capture.recording ? capture.stopVideo : capture.startVideo)}>{capture.recording ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}{capture.recording ? "Video stoppen und hochladen" : "Video starten"}</Button> : <Button disabled={locked || capture.recording} onClick={() => run(() => capture.photo(step.id as ReviewSlot, true))}><Camera data-icon="inline-start" />{permissions.moderate ? "Foto mit Spielserver aufnehmen" : "Foto in 3 Sekunden aufnehmen"}</Button>)}
              <Button variant="outline" disabled={!enabled || locked || capture.recording} onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" />{media ? "Datei ersetzen" : "Datei hochladen"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{step.id === "video" ? "MP4 oder WebM · bis 128 MB" : "JPEG, PNG oder WebP · bis 8 MB"}. Auch per Drag-and-drop.</p>
          </>}
          {media && <p className="review-saved"><CheckCircle2 />Gespeichert</p>}
        </CardContent>
      </Card>
    </div> : <Card>
      <CardHeader><CardTitle>{nade.official ? "Dieses Lineup ist freigegeben" : "Aufnahmen prüfen und abschließen"}</CardTitle><CardDescription>{nade.official ? "Die Anleitung wurde von einem Plattform-Admin freigegeben." : missing.length ? "Ergänze die fehlenden Perspektiven vor der offiziellen Freigabe. Du kannst den Review bereits anfragen, damit ein Admin die Aufnahmen vervollständigt." : "Alle Perspektiven sind vorhanden. Prüfe, ob sie zu den gespeicherten Wurfdaten passen."}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5"><div className="review-checklist">{REVIEW_STEPS.map((item, i) => <button key={item.id} type="button" onClick={() => setIndex(i)}>{nade.reviewMedia?.[item.id] ? <CheckCircle2 /> : <Circle />}<span>{item.title}</span><span>{nade.reviewMedia?.[item.id] ? "Ansehen" : "Fehlt"}</span></button>)}</div>
        <div className="flex flex-wrap gap-2">
          {permissions.submit && <ActionButton icon={Send} disabled={locked || capture.recording || nade.reviewStatus === "pending"} onClick={() => mutate("submit")} pendingLabel="Reicht ein …" successLabel="Eingereicht">{nade.reviewStatus === "pending" ? "Review angefragt" : "Zum Review einreichen"}</ActionButton>}
          {permissions.moderate && (nade.official ? <><ActionButton variant="secondary" disabled={locked} onClick={() => mutate("mustKnow", { value: !nade.mustKnow })}>{nade.mustKnow ? "Must Know entfernen" : "Als Must Know markieren"}</ActionButton><ActionButton variant="ghost" disabled={locked} onClick={() => mutate("revoke")}>Freigabe zurücknehmen</ActionButton></> : <><ActionButton icon={ShieldCheck} disabled={locked || capture.recording || missing.length > 0} onClick={() => mutate("approve")} successLabel="Freigegeben">Offiziell freigeben</ActionButton>{nade.reviewStatus === "pending" && <ActionButton variant="ghost" disabled={locked || capture.recording} onClick={() => mutate("reject")}>Überarbeitung anfragen</ActionButton>}</>)}
        </div>
      </CardContent>
    </Card>}
    <footer className="review-navigation"><Button variant="ghost" disabled={index === 0} onClick={() => setIndex(i => i - 1)}><ArrowLeft data-icon="inline-start" />Zurück</Button><span>{index + 1} / {steps.length}</span><Button variant="secondary" disabled={index === steps.length - 1} onClick={() => setIndex(i => i + 1)}>{index === steps.length - 2 ? "Zur Prüfung" : "Weiter"}<ArrowRight data-icon="inline-end" /></Button></footer>
  </section>;
}
