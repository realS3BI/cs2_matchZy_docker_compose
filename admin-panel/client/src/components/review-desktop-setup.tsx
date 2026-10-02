import { useEffect, useState } from "react";
import { Download, RotateCcw, Play } from "lucide-react";
import { desktop, type DesktopStatus } from "../lib/playbook-desktop";
import { ActionButton } from "./action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function ReviewDesktopSetup() {
  const [status, setStatus] = useState<DesktopStatus>();
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    const refresh = () => void desktop!.status().then(value => { if (!stopped) { setStatus(value); setError(""); } }, error => { if (!stopped) setError(error.message); });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  return <Card>
    <CardHeader><CardTitle>Review mit Playbook für Windows</CardTitle><CardDescription>CS2 starten, mit dem Trainingsserver verbinden und unten das Spielbild verbinden. Danach kannst du den Review direkt im Spiel bedienen.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Fotos ohne Fensterrahmen, HUD und Waffe. Playbook stellt das weiße statische Kreuz mit schwarzer halber Kontur direkt in CS2 ein: Länge 22, Stärke 3, Abstand 9, ohne Mittelpunkt und T-Stil. Deine bisherigen Werte kehren nach jeder Aufnahme zurück. Die Frontansicht bleibt ohne Fadenkreuz. Im Video ist die Waffe sichtbar; mit <kbd>F8</kbd> beendest du die Aufnahme und startest den Upload.</p>
      <div className="flex flex-wrap gap-3">
        <ActionButton icon={Play} disabled={status?.connected || status?.active} onClick={() => desktop!.launch()} successLabel="Start abgeschlossen">CS2 für Review ohne VAC starten</ActionButton>
        <ActionButton variant="outline" icon={RotateCcw} disabled={status?.active} onClick={() => desktop!.recover()} successLabel="Wiederhergestellt">Einstellungen wiederherstellen</ActionButton>
      </div>
      <p className="text-xs text-muted-foreground">Dieser Review-Start benötigt einen Trainingsserver ohne VAC. Für normales Matchmaking CS2 danach beenden und regulär über Steam starten. Falls CS2 bereits läuft, beende das Spiel einmal und starte es über diesen Button. Bestätige gegebenenfalls die Startabfrage in Steam. Playbook prüft die Verbindung bis zu einer Minute. Lass CS2 während der Aufnahme geöffnet. „Vollbild im Fenster“ vermeidet Aufnahmeprobleme; Steam-Overlays bei Bedarf schließen. Bei Problemen findest du unter „Playbook → CS2-Verbindung prüfen“ einen kopierbaren Diagnosebericht.</p>
      {status?.recovery && !status.active && <p role="status" className="text-sm text-muted-foreground">Deine ursprünglichen Spieleinstellungen sind noch gesichert. Playbook stellt sie wieder her, sobald CS2 erreichbar ist.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {status && <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <p className="flex-1 text-xs text-muted-foreground">Playbook {status.appVersion} · {status.update.message}</p>
        <ActionButton variant="outline" icon={Download} disabled={status.update.state === "checking" || status.update.state === "downloading" || status.update.state === "ready" && (status.connected || status.active || status.recovery)} onClick={() => status.update.state === "ready" ? desktop!.installUpdate() : desktop!.checkUpdate()}>{status.update.state === "ready" ? "Update installieren und neu starten" : "Nach Updates suchen"}</ActionButton>
      </div>}
    </CardContent>
  </Card>;
}
