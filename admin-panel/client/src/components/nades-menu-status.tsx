import { useResource } from "./workspace-ui";
import { NavLink } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const STATES = {
  loaded: ["Geladen", "success"], missing: ["Nicht installiert", "destructive"],
  unconfirmed: ["Installiert · nicht bestätigt", "warning"], blocked: ["Framework blockiert", "destructive"],
  failed: ["Laden fehlgeschlagen", "destructive"],
  unloaded: ["Entladen", "destructive"], inactive: ["In diesem Modus nicht enthalten", "outline"],
  unavailable: ["Status nicht verfügbar", "warning"], stopped: ["Server gestoppt", "warning"]
} as const;

export function NadesMenuStatus({ selectedMode }: { selectedMode: string }) {
  const { data: report, loading, error, reload: refresh } = useResource<any>("/api/server/diagnostics");

  const menu = report?.nades?.menu;
  const [label, variant] = STATES[error ? "unavailable" : menu?.state] || STATES.unavailable;
  const included = ["matchzy", "nades"].includes(selectedMode);
  const modeChanged = report?.mode?.id && selectedMode !== report.mode.id;

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>Playbook · Ingame-Panel</CardTitle>
            <CardDescription>Lineups im Spiel mit .nades auswählen und zur Wurfposition zurückkehren.</CardDescription>
          </div>
          <Badge variant={!report && loading ? "outline" : variant}>{!report && loading ? "Server wird geprüft …" : label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {included ? "Im Nades-Modus läuft Playbook eigenständig. Im MatchZy-Modus ergänzt es das Practice-Training."
            : "Wähle MatchZy oder Nades und anschließend „Übernehmen & neu starten“, um das Panel zu installieren."}
          {modeChanged ? " Deine Modusauswahl wurde noch nicht übernommen. Der Status beschreibt den aktuell laufenden Server." : ""}
        </p>
        <div className="grid gap-2 rounded-lg border border-border bg-muted/25 p-4" role="status" aria-live="polite">
          <p className="text-sm">{error || menu?.detail || (loading ? "Plugin-Installation und Bestätigung aus dem Spiel werden geprüft …" : "Panel-Status nicht verfügbar. Prüfe die Installation in der Diagnose.")}</p>
          {!error && menu?.state === "loaded" ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant={menu.practice ? "success" : "warning"}>{menu.practice ? "Training aktiv" : "Training inaktiv"}</Badge>
              {menu.version ? <Badge variant="outline">v{menu.version}</Badge> : null}
            </div>
          ) : null}
        </div>
        <details className="disclosure-panel"><summary>Ingame-Panel verwenden</summary><div className="grid gap-2 p-4 text-sm">
          <p>Der Nades-Modus startet das eigene Training automatisch. Im MatchZy-Modus aktiviert <code>.prac</code> das Training.</p>
          <p>Playbook verwendet ein kompaktes HUD mit neun Listenplätzen und festen Tasten. Die kompilierten HUD-Dateien müssen auf dem Client installiert sein.</p>
          <p><code>css_training</code> öffnet das Panel. Wähle deine Tasten in den Einstellungen und übernimm die angezeigten Client-Binds. <code>css_training_binds</code> zeigt deine gespeicherten Tastenbelegungen.</p>
          <p><code>.nades last</code> lädt dein letztes Lineup. Verwende <code>.nades 1</code>–<code>.nades 9</code> für die nummerierte Auswahl.</p>
        </div></details>
        {menu?.state === "missing" && !menu.bundled ? <Alert variant="warning"><AlertDescription>Baue das CS2-Image in Coolify oder Docker Compose neu. „Übernehmen & neu starten“ verwendet das vorhandene Image und installiert keinen fehlenden Playbook-Code.</AlertDescription></Alert> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} />{loading ? "Wird geprüft …" : "Status aktualisieren"}</Button>
          <NavLink className="text-sm font-medium underline underline-offset-4" to="/operations#diagnose">Diagnose öffnen</NavLink>
          {!error && report?.generatedAt ? <span className="text-xs text-muted-foreground">Geprüft um {new Date(report.generatedAt).toLocaleTimeString()} · Live-Updates</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
