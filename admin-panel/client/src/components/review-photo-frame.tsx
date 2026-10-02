import { useEffect, useRef, useState } from "react";
import { photoRectangle, type PhotoFrame, type ReviewRecorder } from "../lib/review-recorder";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

const edges = [["top", "Oben"], ["right", "Rechts"], ["bottom", "Unten"], ["left", "Links"]] as const;

export function ReviewPhotoFrame({ capture, disabled }: { capture: ReviewRecorder; disabled: boolean }) {
  const [frame, setFrame] = useState<PhotoFrame>(() => capture.frame || {
    width: capture.video.videoWidth, height: capture.video.videoHeight, top: 0, right: 0, bottom: 0, left: 0,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const canvas = preview.current;
      if (!canvas) return;
      try {
        const rect = photoRectangle(frame, capture.video.videoWidth, capture.video.videoHeight);
        canvas.width = rect.width; canvas.height = rect.height;
        canvas.getContext("2d")!.drawImage(capture.video, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      } catch (error) { setError(error.message); setConfirmed(false); }
    };
    draw();
    const timer = setInterval(draw, 250);
    return () => clearInterval(timer);
  }, [capture, frame]);
  function update(next: PhotoFrame) { capture.clearPhotoFrame(); setFrame(next); setConfirmed(false); setError(""); }
  return <details className="basis-full" open={!confirmed}>
    <summary className="cursor-pointer text-sm font-medium">{confirmed ? "Aufnahmeausschnitt gespeichert · Anpassen" : "Aufnahmeausschnitt festlegen"}</summary>
    <div className="flex flex-col gap-4 pt-4">
      <p className="text-sm text-muted-foreground">Entferne nur den Fensterrand. Gib die Breite der Ränder in Pixeln an und prüfe die Vorschau. Das echte Fadenkreuz bleibt Teil des Spielbilds. Bei randlosem CS2 können alle Werte 0 bleiben.</p>
      <canvas ref={preview} className="w-full max-w-3xl rounded-md border" aria-label="Vorschau des Aufnahmeausschnitts" />
      <FieldGroup className="sm:flex-row">{edges.map(([edge, label]) => <Field key={edge}>
        <FieldLabel>{label} · Pixel</FieldLabel>
        <Input type="number" min="0" step="1" value={Number.isFinite(frame[edge]) ? frame[edge] : ""} disabled={disabled} aria-invalid={!!error} onChange={event => update({ ...frame, [edge]: event.target.valueAsNumber })} />
      </Field>)}</FieldGroup>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={() => {
          try { capture.setPhotoFrame(frame); setConfirmed(true); setError(""); }
          catch (error) { setError(error.message); }
        }}>Aufnahmeausschnitt bestätigen</Button>
        <Button variant="outline" disabled={disabled} onClick={() => update({ width: capture.video.videoWidth, height: capture.video.videoHeight, top: 0, right: 0, bottom: 0, left: 0 })}>Ganzes Spielbild</Button>
      </div>
      <p className="text-xs text-muted-foreground">Gilt für Fotos und Videos dieser Freigabe. Nach einer Größenänderung den Aufnahmeausschnitt erneut einstellen.</p>
    </div>
  </details>;
}
