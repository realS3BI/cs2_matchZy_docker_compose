import { useLiveResource } from "./hooks/use-live-resource";
import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleDashed,
  Clipboard,
  RefreshCw,
  Terminal,
  Wrench,
  X
} from "lucide-react";
import { api } from "./lib/api";
import { copyText } from "./lib/clipboard";
import { fetchDiagnostics } from "./lib/admin-data";
import { cn } from "./lib/utils";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog";

const STATUS_META = {
  pass: { label: "Bereit", badge: "success", icon: Check },
  warn: { label: "Nicht bestätigt", badge: "warning", icon: CircleDashed },
  fail: { label: "Blockiert", badge: "destructive", icon: X }
} as const;

function formatDate(value) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unbekannt" : date.toLocaleString();
}

function overallLabel(overall) {
  if (overall === "healthy") return "In Ordnung";
  if (overall === "degraded") return "Prüfung nötig";
  return "Handlungsbedarf";
}

function overallVariant(overall) {
  if (overall === "healthy") return "success";
  if (overall === "degraded") return "warning";
  return "destructive";
}

function LoadChain({ checks, label }) {
  return (
    <ol className="diagnostic-rail" aria-label={`${label} Startprüfung`}>
      {checks.map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.warn;
        const Icon = meta.icon;
        return (
          <li key={item.id} className={cn("diagnostic-step", `diagnostic-step-${item.status}`)}>
            <span className={cn("diagnostic-node", `diagnostic-node-${item.status}`)}>
              <Icon aria-hidden="true" />
            </span>
            <div className="diagnostic-step-body">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <Badge variant={meta.badge}>{meta.label}</Badge>
              <span className="text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DiagnosticsHero({ diagnostics, actions = null }) {
  return (
    <Card className="diagnostic-hero">
      <CardHeader className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="diagnostic-kicker">Aktueller Serverstand</p>
            <CardTitle className="diagnostic-title">{diagnostics.mode?.name || "Server"} · Startprüfung</CardTitle>
            <CardDescription>{diagnostics.summary}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={overallVariant(diagnostics.overall)}>{overallLabel(diagnostics.overall)}</Badge>
            {actions}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <LoadChain checks={diagnostics.checks} label={diagnostics.mode?.name || "Server"} />
      </CardContent>
    </Card>
  );
}

function DiagnosticsFindings({ findings }) {
  return findings.map((finding, index) => (
    <Alert
      key={`${finding.title}-${index}`}
      role="status"
      variant={finding.severity === "error" ? "destructive" : "warning"}
    >
      <AlertTitle>{finding.title}</AlertTitle>
      <AlertDescription>{finding.detail}</AlertDescription>
    </Alert>
  ));
}

function DiagnosticsReport({ diagnostics }) {
  const relevantVersions = diagnostics.versions.filter((item) => item.relevant);
  const detectedVersions = relevantVersions.filter((item) => item.installed !== "not detected");

  return (
    <div className="grid gap-4">
      <DiagnosticsHero diagnostics={diagnostics} />
      <DiagnosticsFindings findings={diagnostics.findings} />

      {diagnostics.plugins?.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Plugin-Status</CardTitle><CardDescription>Aktivierte Plugins und ihre benötigten Komponenten.</CardDescription></CardHeader>
          <CardContent className="divide-y divide-border">
            {diagnostics.plugins.map((plugin) => (
              <div key={plugin.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm font-semibold">{plugin.label}</span><Badge variant={plugin.status === "pass" ? "success" : "destructive"}>{plugin.status === "pass" ? "Vollständig" : `${plugin.missingFiles.length} fehlen`}</Badge></div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <details className="disclosure-panel"><summary>Versionen und Containerdetails</summary><div className="p-4">      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Installierte Versionen</CardTitle>
            <CardDescription>Versionen aus dem Installationsstand des Servers.</CardDescription>
          </CardHeader>
          <CardContent>
            {detectedVersions.length > 0 ? (
              <dl className="divide-y divide-border">
                {relevantVersions.map((item) => (
                  <div key={item.key} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.3fr_1fr_1fr] sm:items-center">
                    <dt className="text-sm font-semibold">{item.label}</dt>
                    <dd className="font-mono text-xs text-foreground">{item.installed}</dd>
                    <dd className="text-xs text-muted-foreground">Gewünscht: {item.wanted}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Kein Installationsstand erkannt.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Container</CardTitle>
            <CardDescription>Zustand und letzte Startzeit des Servercontainers.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Container</dt>
                <dd className="truncate font-mono text-xs">{diagnostics.service.containerName || "Nicht gefunden"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{diagnostics.service.containerId || "Keine"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Gestartet</dt>
                <dd className="text-right text-xs">{formatDate(diagnostics.service.startedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Neustarts</dt>
                <dd><Badge variant="outline">{diagnostics.service.restartCount}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Steuerung</dt>
                <dd><Badge variant="outline">{diagnostics.service.controlMode}</Badge></dd>
              </div>
              {diagnostics.mode?.id === "matchzy" ? <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">MatchZy-Konfiguration</dt>
                <dd><Badge variant={diagnostics.nades.configPresent ? "success" : "warning"}>{diagnostics.nades.configPresent ? "Vorhanden" : "Fehlt"}</Badge></dd>
              </div> : null}
              {diagnostics.nades.relevant ? <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Gespeicherte Nades</dt>
                <dd><Badge variant={diagnostics.nades.savedNadesPresent ? "success" : "warning"}>{diagnostics.nades.savedNadesPresent ? "Vorhanden" : "Fehlt"}</Badge></dd>
              </div> : null}
            </dl>
          </CardContent>
        </Card>
      </section></div></details>
    </div>
  );
}

export function Diagnostics({ active, onOpenLogs }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);
  const reportVersion = useRef(0);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const version = reportVersion.current;
      const data = await fetchDiagnostics();
      if (version === reportVersion.current) setDiagnostics(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    loadDiagnostics();

  }, [active, loadDiagnostics]);
  useLiveResource(active ? "/api/server/diagnostics" : null, data => { reportVersion.current++; setDiagnostics(data); setError(""); }, error => { setError(error.message); if ([401, 403].includes(error.status)) setDiagnostics(null); });

  const reportText = useMemo(() => diagnostics ? JSON.stringify(diagnostics, null, 2) : "", [diagnostics]);

  async function copyReport() {
    if (!reportText) return;
    await copyText(reportText);
    setMessage("Diagnosebericht kopiert.");
  }

  async function repair() {
    setRepairOpen(false);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/server/repair", { method: "POST", body: "{}" });
      setMessage(result.message);
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      await loadDiagnostics();
    } catch (repairError) {
      setError(repairError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:p-3">
          <Button variant="secondary" onClick={loadDiagnostics} disabled={loading}>
            <RefreshCw data-icon="inline-start" className={cn(loading && "animate-spin")} />
            Diagnose starten
          </Button>
          <Button variant="secondary" onClick={copyReport} disabled={!diagnostics}>
            <Clipboard data-icon="inline-start" />
            Bericht kopieren
          </Button>
          <Button variant="secondary" onClick={onOpenLogs}>
            <Terminal data-icon="inline-start" />
            Server-Logs öffnen
          </Button>
          <Button onClick={() => setRepairOpen(true)} disabled={!diagnostics?.repairAvailable || loading}>
            <Wrench data-icon="inline-start" />
            Plugins reparieren
          </Button>
          {diagnostics?.generatedAt ? (
            <span className="ml-auto text-xs text-muted-foreground">Geprüft am {formatDate(diagnostics.generatedAt)}</span>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Diagnose fehlgeschlagen</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="success" className="mb-4">
          <AlertTitle>Aktion abgeschlossen</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {diagnostics ? <DiagnosticsReport diagnostics={diagnostics} /> : (
        <Card>
          <CardHeader>
            <CardTitle>{loading ? "CS2-Container wird geprüft" : "Noch kein Diagnosebericht"}</CardTitle>
            <CardDescription>{loading ? "Startprotokoll und Plugin-Installation werden geprüft." : "Diagnose der Serverkomponenten starten."}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plugin-Installation reparieren?</DialogTitle>
            <DialogDescription>
              Die Plugins werden einmal repariert und der CS2-Container wird neu gestartet. Verbundene Spieler werden getrennt.
            </DialogDescription>
          </DialogHeader>
          <Alert role="status" variant="warning">
            <AlertTitle>Einmalige Reparatur</AlertTitle>
            <AlertDescription>Nach dem Installationsversuch wird die Reparaturoption automatisch zurückgesetzt.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRepairOpen(false)}>Abbrechen</Button>
            <Button onClick={repair}>
              <Wrench data-icon="inline-start" />
              Reparieren & neu starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Overview copy of the Betrieb report: same start check, without toolbar and details. */
export function DiagnosticsSummary({ actions = null }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState("");
  const reportVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const version = reportVersion.current;
    fetchDiagnostics()
      .then((data) => { if (!cancelled && version === reportVersion.current) setDiagnostics(data); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, []);
  useLiveResource("/api/server/diagnostics", data => { reportVersion.current++; setDiagnostics(data); setError(""); }, loadError => setError(loadError.message));

  if (!diagnostics) return (
    <Card className="diagnostic-hero">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="diagnostic-kicker">Aktueller Serverstand</p>
            <CardTitle>{error ? "Diagnose fehlgeschlagen" : "Diagnose wird geladen …"}</CardTitle>
            {error && <CardDescription role="alert" className="text-destructive">{error}</CardDescription>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        </div>
      </CardHeader>
    </Card>
  );
  return (
    <div className="grid gap-4">
      <DiagnosticsHero diagnostics={diagnostics} actions={actions} />
      <DiagnosticsFindings findings={diagnostics.findings} />
    </div>
  );
}
