import { Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { ActionButton } from "./action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { desktop } from "../lib/playbook-desktop";
import { ReviewDesktopSetup } from "./review-desktop-setup";

// Reviewer-provided CS2 share code. Keep opaque: Valve changes the format.
export const REVIEW_CROSSHAIR_CODE = "CSKBTrLqOGX2ztECdjH7rsZaUPwtosk7jjPtSRje8xvSyF";
const photoMode = "cl_draw_only_deathnotices 1; r_drawviewmodel 0";
const normalMode = "cl_draw_only_deathnotices 0; r_drawviewmodel 1";

export function ReviewGameSetup() {
  if (desktop) return <ReviewDesktopSetup />;
  return <Card>
    <CardHeader><CardTitle>CS2 für die Fotos vorbereiten</CardTitle><CardDescription>Einmal vor dem Review einstellen. Nach dem Review wechselst du zu deinen gewohnten Einstellungen zurück.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <strong className="text-sm">Review-Fadenkreuz</strong>
        <p className="text-sm text-muted-foreground">Dieses Fadenkreuz für alle Review-Fotos verwenden. In CS2 unter Einstellungen → Spiel → Fadenkreuz → Teilen oder importieren einfügen.</p>
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-0 flex-1 basis-80 font-mono" aria-label="Review-Crosshair-Code" readOnly value={REVIEW_CROSSHAIR_CODE} onFocus={event => event.target.select()} />
          <ActionButton variant="secondary" icon={Copy} successLabel="Kopiert" onClick={() => copyText(REVIEW_CROSSHAIR_CODE)}>Crosshair-Code kopieren</ActionButton>
        </div>
        <p className="text-xs text-muted-foreground">Deinen persönlichen Code bewahrst du selbst auf. Importiere ihn nach dem Review wieder. Die Website prüft und speichert ihn nicht.</p>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Geldanzeige, HUD und Waffe ausblenden</summary>
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-sm text-muted-foreground">Im Training vor den Fotos in die CS2-Konsole kopieren. Das echte Fadenkreuz bleibt sichtbar. Der Fotomodus bleibt bis zum Zurückschalten aktiv, auch zwischen den Aufnahmen.</p>
          <code className="break-words text-xs">{photoMode}</code>
          <ActionButton variant="outline" icon={Copy} successLabel="Kopiert" onClick={() => copyText(photoMode)}>Fotomodus-Befehl kopieren</ActionButton>
          <p className="text-sm text-muted-foreground">Nach den Fotos oder vor dem Video HUD und Waffe wieder einschalten. Falls du diese beiden Optionen vorher anders eingestellt hattest, verwende dafür deine bisherigen Werte.</p>
          <code className="break-words text-xs">{normalMode}</code>
          <ActionButton variant="outline" icon={Copy} successLabel="Kopiert" onClick={() => copyText(normalMode)}>HUD und Waffe einschalten · Befehl kopieren</ActionButton>
          <p className="text-xs text-muted-foreground">FPS-, Netzwerk- und Steam-Anzeigen separat in den Spieleinstellungen bzw. Steam deaktivieren, wenn sie im Bild sichtbar sind.</p>
        </div>
      </details>
    </CardContent>
  </Card>;
}
