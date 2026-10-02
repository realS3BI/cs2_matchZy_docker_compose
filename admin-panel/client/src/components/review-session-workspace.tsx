import { useEffect, useRef, useState } from "react";
import { MonitorUp, Play, Square } from "lucide-react";
import { REVIEW_STEPS } from "../../../shared/review-media";
import { useReviewCapture } from "../hooks/use-review-capture";
import { useReviewUpload } from "../hooks/use-review-upload";
import { api } from "../lib/api";
import { lineupKey } from "../lib/lineups";
import { desktop } from "../lib/playbook-desktop";
import { ActionButton } from "./action-button";
import { LineupReview } from "./lineup-review";
import { ReviewGameSetup } from "./review-game-setup";
import { ReviewPhotoFrame } from "./review-photo-frame";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function ReviewSessionWorkspace({ nades, user, onEntriesChange }) {
  const [selected, setSelected] = useState<any>(null);
  const [step, setStep] = useState("overview");
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLVideoElement>(null);
  const nade = selected && (nades.find(entry => lineupKey(entry) === lineupKey(selected)) || selected);
  const uploader = useReviewUpload({ nade, user, disabled: busy, onEntriesChange });
  const capture = useReviewCapture({
    nade, admin: true, followPanel: true, upload: uploader.upload, disabled: busy, onError: uploader.setError,
    onStep: slot => setStep(slot),
    onSelection: selection => {
      setSelected(selection.nade); setStep(selection.step);
      const key = lineupKey(selection.nade);
      onEntriesChange(nades.some(entry => lineupKey(entry) === key) ? nades.map(entry => lineupKey(entry) === key ? selection.nade : entry) : [...nades, selection.nade]);
    },
  });
  const locked = busy || uploader.uploading || capture.preparing || capture.connecting;
  useEffect(() => { if (preview.current) preview.current.srcObject = capture.capture?.stream || null; }, [capture.capture]);
  async function run(action) {
    uploader.setError("");
    try { await action(); } catch (error) { uploader.setError(error.message); }
  }
  async function mutate(action, extra = {}) {
    setBusy(true);
    try {
      const { owner, map, name, updatedAt } = nade;
      const result = await api("/api/nades/entry", { method: "POST", body: JSON.stringify({ owner, map, name, revision: updatedAt || "", action, ...extra }) });
      onEntriesChange(result.entries);
    } finally { setBusy(false); }
  }
  return <section className="grid min-w-0 gap-5" aria-label="Review aus dem Ingame-Panel">
    <Card className="min-w-0">
      <CardHeader><CardTitle>Review im Spiel steuern</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <p className="text-sm text-muted-foreground">CS2 starten und das Spielbild einmal freigeben. Danach im Ingame-Panel ein Medien-Review öffnen: Lineup, Fotos, Video und aktueller Schritt erscheinen hier automatisch.</p>
        <div className="flex flex-wrap gap-2">
          {desktop ? <ActionButton icon={Play} disabled={locked || !!capture.capture} onClick={() => desktop.launch()} successLabel="CS2 gestartet">CS2 für Review ohne VAC starten</ActionButton> : <Button asChild variant="secondary"><a href="steam://rungameid/730"><Play data-icon="inline-start" />CS2 starten</a></Button>}
          {capture.capture ? <Button variant="outline" disabled={locked || capture.recording} onClick={capture.disconnect}>Spielbild-Freigabe beenden</Button> : <Button disabled={!uploader.enabled || locked} onClick={() => run(capture.connect)}><MonitorUp data-icon="inline-start" />{capture.connecting ? "Verbindet …" : "Spielbild freigeben"}</Button>}
          {capture.recording && <Button disabled={locked} onClick={() => run(capture.stopVideo)}><Square data-icon="inline-start" />Video stoppen und hochladen</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Verbundenes Steam-Konto: <span className="font-mono">{user.identitySteam64}</span>. Das Ingame-Panel muss mit diesem Konto bedient werden.</p>
        {capture.notice && <p role="status" className="text-sm text-muted-foreground">{capture.notice}</p>}
        {capture.capture && <video ref={preview} autoPlay muted playsInline className="review-live-preview" aria-label="Vorschau des freigegebenen Spielbilds" />}
        {capture.capture && !desktop && <ReviewPhotoFrame capture={capture.capture} disabled={locked || capture.recording} />}
        <details className="min-w-0"><summary className="cursor-pointer text-sm font-medium">CS2-Einstellungen und Aufnahme-Hilfe</summary><div className="pt-4"><ReviewGameSetup /></div></details>
        {uploader.enabled === false && <p role="status" className="text-sm text-muted-foreground">Uploads sind noch nicht eingerichtet. Hinterlege UPLOADTHING_TOKEN in der Serverumgebung.</p>}
        {!nade && uploader.error && <Alert variant="destructive"><AlertTitle>Review-Verbindung unterbrochen</AlertTitle><AlertDescription>{uploader.error}</AlertDescription></Alert>}
      </CardContent>
    </Card>
    {nade ? <div className="grid min-w-0 gap-4">
      <header aria-live="polite"><p className="control-kicker">{nade.map} · Ingame-Review</p><h2 className="mt-2 break-words text-xl font-semibold">{nade.displayName || nade.name}</h2><p className="mt-1 text-sm text-muted-foreground">Aktueller Schritt: {step === "overview" ? "Review-Übersicht" : step === "finish" ? "Prüfung und Freigabe" : step === "details" ? "Angaben vervollständigen" : REVIEW_STEPS.find(item => item.id === step)?.title}</p></header>
      <LineupReview {...{ nade, user, mutate, onEntriesChange }} disabled={busy} externalCapture={capture} externalUpload={uploader} syncedStep={step} />
    </div> : <p role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{capture.capture ? "Warte auf deine Auswahl im Ingame-Panel. Öffne bei einer Granate den Medien-Review." : "Nach der Spielbild-Freigabe erscheint dein Ingame-Review hier."}</p>}
  </section>;
}
