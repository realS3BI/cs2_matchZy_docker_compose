import { Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { ActionButton } from "./action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { desktop } from "../lib/playbook-desktop";
import { ReviewDesktopSetup } from "./review-desktop-setup";

// Current CS2 pixel settings. CS2 records the current resolution when sizes change.
export const REVIEW_CROSSHAIR_COMMANDS = "cl_crosshairstyle 4; cl_crosshair_length 22; cl_crosshair_thickness 3; cl_crosshair_gap 9; cl_crosshaircolor_r 255; cl_crosshaircolor_g 255; cl_crosshaircolor_b 255; cl_crosshaircolor_a 255; cl_crosshair_drawoutline 2; cl_crosshairoutline_r 0; cl_crosshairoutline_g 0; cl_crosshairoutline_b 0; cl_crosshairoutline_a 255; cl_crosshairdot 0; cl_crosshair_t 0; cl_crosshair_recoil 0; cl_ironsight_usecrosshaircolor 0; cl_ironsight_dot_scale 1";
const photoMode = "cl_draw_only_deathnotices 1; r_drawviewmodel 0";
export const REVIEW_FRONT_COMMANDS = "c_minyaw -180; c_maxyaw 180; cam_idealyaw 180; cam_idealpitch 0; cam_collision 1; thirdperson";
const normalMode = "cl_draw_only_deathnotices 0; r_drawviewmodel 1";

export function ReviewGameSetup() {
  if (desktop) return <ReviewDesktopSetup />;
  return <Card>
    <CardHeader><CardTitle>CS2 für die Fotos vorbereiten</CardTitle><CardDescription>Einmal vor dem Review einstellen. Nach dem Review wechselst du zu deinen gewohnten Einstellungen zurück.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <strong className="text-sm">Review-Fadenkreuz</strong>
        <p className="text-sm text-muted-foreground">Weißes statisches Kreuz mit schwarzer halber Kontur: Länge 22, Stärke 3, Abstand 9. Ohne Mittelpunkt, T-Stil und Rückstoßbewegung. Die Befehle vor den Fotos in die lokale CS2-Konsole einfügen.</p>
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-0 flex-1 basis-80 font-mono" aria-label="Review-Fadenkreuz-Befehle" readOnly value={REVIEW_CROSSHAIR_COMMANDS} onFocus={event => event.target.select()} />
          <ActionButton variant="secondary" icon={Copy} successLabel="Kopiert" onClick={() => copyText(REVIEW_CROSSHAIR_COMMANDS)}>Fadenkreuz-Befehle kopieren</ActionButton>
        </div>
        <p className="text-xs text-muted-foreground">Sichere vorab deinen persönlichen Code unter Einstellungen → Fadenkreuz/Zielfernrohre → Teilen oder importieren und importiere ihn nach dem Review wieder. Die Website prüft und speichert ihn nicht.</p>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Vorderansicht mit der echten Third-Person-Kamera</summary>
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-sm text-muted-foreground">Vor der Vorderansicht in die lokale CS2-Konsole einfügen. Der Trainingsserver muss Third Person erlauben. Sichere vorher deine Kamera-Werte. Für die anderen Schritte mit firstperson zurückwechseln und nach dem Review deine Werte wieder einstellen.</p>
          <ActionButton variant="secondary" icon={Copy} successLabel="Kopiert" onClick={() => copyText(REVIEW_FRONT_COMMANDS)}>Vorderansicht-Befehle kopieren</ActionButton>
          <p className="text-sm text-muted-foreground">Dein Spielerblick bleibt erhalten. Für eine waagrechte Kamera cam_idealpitch auf den negativen Spieler-Pitch setzen, zum Beispiel 44.8 bei Spieler-Pitch −44,8°. Für negative Kamera-Werte zuerst c_minpitch -89 und c_maxpitch 89 setzen. Die Windows-App berechnet und setzt den Wert bei Server-Fotos automatisch.</p>
          <ActionButton variant="secondary" icon={Copy} successLabel="Kopiert" onClick={() => copyText("firstperson")}>Zur Ego-Ansicht wechseln</ActionButton>
        </div>
      </details>
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
