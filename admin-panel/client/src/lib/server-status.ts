export type ServerStatus = {
  service?: {
    ok?: boolean;
    state?: string;
    raw?: { Health?: string | { Status?: string }; ExitCode?: number; OOMKilled?: boolean; Error?: string } | string;
  };
  nadesSync?: { state?: string };
  lastAction?: { type?: string; status?: string };
};

export type ServerOperation = { kind: "apply" | "restart"; phase: string } | null;
type Presentation = {
  tone: "success" | "warning" | "destructive" | "neutral";
  icon: "activity" | "loading" | "pause" | "offline" | "error" | "unknown";
  label: string;
  detail: string;
};

export function serverPresentation(status?: ServerStatus, operation?: ServerOperation, unavailable = false): Presentation {
  if (operation) return {
    tone: "warning", icon: "loading",
    label: operation.phase === "refreshing" ? "Status wird geprüft" : operation.kind === "apply" ? "Wird übernommen" : "Server startet neu",
    detail: operation.kind === "apply" ? "Einstellungen werden übernommen und der Server neu gestartet." : "Der Server wird neu gestartet. Spieler werden dabei getrennt.",
  };
  const service = status?.service;
  if (unavailable || service?.ok === false) return {
    tone: "warning", icon: "unknown", label: "Status nicht verfügbar",
    detail: "Der aktuelle Serverstatus ist nicht abrufbar. Die Verbindung wird automatisch erneut geprüft.",
  };
  const raw = typeof service?.raw === "object" ? service.raw : null;
  const health = typeof raw?.Health === "string" ? raw.Health : raw?.Health?.Status;
  if (health === "unhealthy" || raw?.OOMKilled || raw?.Error || service?.state === "dead" || (service?.state === "exited" && raw?.ExitCode)) return {
    tone: "destructive", icon: "error", label: "Serverproblem",
    detail: raw?.OOMKilled ? "Der Server wurde wegen Speichermangel beendet. Prüfe die Diagnose." : "Der Server meldet einen Fehler. Prüfe die Diagnose und die Logs.",
  };
  switch (service?.state) {
    case "running":
      if (health === "starting") return { tone: "warning", icon: "loading", label: "Server startet", detail: "Der Server läuft an. Die Zustandsprüfung ist noch nicht abgeschlossen." };
      return { tone: "success", icon: "activity", label: "Server läuft", detail: "Der Servercontainer läuft. Die Erreichbarkeit im Spiel wird hier nicht geprüft." };
    case "restarting":
      return { tone: "warning", icon: "loading", label: "Server startet neu", detail: "Der Server wird neu gestartet. Bei wiederholten Neustarts prüfe die Logs." };
    case "created":
      return { tone: "neutral", icon: "offline", label: "Noch nicht gestartet", detail: "Der Server wurde angelegt, aber noch nicht gestartet." };
    case "paused":
      return { tone: "warning", icon: "pause", label: "Server pausiert", detail: "Der Server ist pausiert und steht derzeit nicht zum Spielen bereit." };
    case "exited":
    case "stopped":
      return { tone: "neutral", icon: "offline", label: "Server gestoppt", detail: "Der Server läuft derzeit nicht." };
    case "removing":
      return { tone: "warning", icon: "loading", label: "Wird entfernt", detail: "Der Servercontainer wird gerade entfernt." };
    case "not-created":
      return { tone: "neutral", icon: "offline", label: "Nicht eingerichtet", detail: "Es wurde noch kein Servercontainer gefunden." };
    default:
      return { tone: "neutral", icon: "unknown", label: "Status unbekannt", detail: "Es liegt kein eindeutiger Serverstatus vor." };
  }
}
