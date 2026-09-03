import { useCallback, useEffect, useMemo, useState } from "react";
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
  pass: { label: "ready", badge: "success", icon: Check },
  warn: { label: "unconfirmed", badge: "warning", icon: CircleDashed },
  fail: { label: "blocked", badge: "destructive", icon: X }
} as const;

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

function overallLabel(overall) {
  if (overall === "healthy") return "Healthy";
  if (overall === "degraded") return "Needs review";
  return "Action required";
}

function overallVariant(overall) {
  if (overall === "healthy") return "success";
  if (overall === "degraded") return "warning";
  return "destructive";
}

function LoadChain({ checks, label }) {
  return (
    <ol className="diagnostic-rail" aria-label={`${label} load chain`}>
      {checks.map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.warn;
        const Icon = meta.icon;
        return (
          <li key={item.id} className="diagnostic-step">
            <span className={cn("diagnostic-node", `diagnostic-node-${item.status}`)}>
              <Icon aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
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

function DiagnosticsReport({ diagnostics }) {
  const relevantVersions = diagnostics.versions.filter((item) => item.relevant);
  const detectedVersions = relevantVersions.filter((item) => item.installed !== "not detected");

  return (
    <div className="grid gap-4">
      <Card className="diagnostic-hero">
        <CardHeader className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              <p className="diagnostic-kicker">Live load path</p>
              <CardTitle className="diagnostic-title">{diagnostics.mode?.name || "Server"} startup trace</CardTitle>
              <CardDescription>{diagnostics.summary}</CardDescription>
            </div>
            <Badge variant={overallVariant(diagnostics.overall)}>{overallLabel(diagnostics.overall)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <LoadChain checks={diagnostics.checks} label={diagnostics.mode?.name || "Server"} />
        </CardContent>
      </Card>

      {diagnostics.findings.map((finding, index) => (
        <Alert
          key={`${finding.title}-${index}`}
          role="status"
          variant={finding.severity === "error" ? "destructive" : "warning"}
        >
          <AlertTitle>{finding.title}</AlertTitle>
          <AlertDescription>{finding.detail}</AlertDescription>
        </Alert>
      ))}

      {diagnostics.plugins?.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Configured plugin health</CardTitle><CardDescription>Enabled optional plugins and the dependency markers expected inside the container.</CardDescription></CardHeader>
          <CardContent className="divide-y divide-border">
            {diagnostics.plugins.map((plugin) => (
              <div key={plugin.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm font-semibold">{plugin.label}</span><Badge variant={plugin.status === "pass" ? "success" : "destructive"}>{plugin.status === "pass" ? "complete" : `${plugin.missingFiles.length} missing`}</Badge></div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Installed versions</CardTitle>
            <CardDescription>Read from the installer state inside the CS2 volume.</CardDescription>
          </CardHeader>
          <CardContent>
            {detectedVersions.length > 0 ? (
              <dl className="divide-y divide-border">
                {relevantVersions.map((item) => (
                  <div key={item.key} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.3fr_1fr_1fr] sm:items-center">
                    <dt className="text-sm font-semibold">{item.label}</dt>
                    <dd className="font-mono text-xs text-foreground">{item.installed}</dd>
                    <dd className="text-xs text-muted-foreground">wanted: {item.wanted}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No installer state was detected.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>Safe Docker metadata, without environment values.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Container</dt>
                <dd className="truncate font-mono text-xs">{diagnostics.service.containerName || "not found"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{diagnostics.service.containerId || "none"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Started</dt>
                <dd className="text-right text-xs">{formatDate(diagnostics.service.startedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Restarts</dt>
                <dd><Badge variant="outline">{diagnostics.service.restartCount}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Control</dt>
                <dd><Badge variant="outline">{diagnostics.service.controlMode}</Badge></dd>
              </div>
              {diagnostics.nades.relevant ? <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">MatchZy config</dt>
                <dd><Badge variant={diagnostics.nades.configPresent ? "success" : "warning"}>{diagnostics.nades.configPresent ? "present" : "missing"}</Badge></dd>
              </div> : null}
              {diagnostics.nades.relevant ? <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Saved nades</dt>
                <dd><Badge variant={diagnostics.nades.savedNadesPresent ? "success" : "warning"}>{diagnostics.nades.savedNadesPresent ? "present" : "missing"}</Badge></dd>
              </div> : null}
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function Diagnostics({ active, onOpenLogs }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDiagnostics(await api("/api/server/diagnostics"));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    loadDiagnostics();
    const timer = window.setInterval(loadDiagnostics, 30000);
    return () => window.clearInterval(timer);
  }, [active, loadDiagnostics]);

  const reportText = useMemo(() => diagnostics ? JSON.stringify(diagnostics, null, 2) : "", [diagnostics]);

  async function copyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setMessage("Diagnostic report copied.");
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
            Run diagnostics
          </Button>
          <Button variant="secondary" onClick={copyReport} disabled={!diagnostics}>
            <Clipboard data-icon="inline-start" />
            Copy report
          </Button>
          <Button variant="secondary" onClick={onOpenLogs}>
            <Terminal data-icon="inline-start" />
            Open Docker logs
          </Button>
          <Button onClick={() => setRepairOpen(true)} disabled={!diagnostics?.repairAvailable || loading}>
            <Wrench data-icon="inline-start" />
            Repair mods once
          </Button>
          {diagnostics?.generatedAt ? (
            <span className="ml-auto text-xs text-muted-foreground">Checked {formatDate(diagnostics.generatedAt)}</span>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Diagnostics failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="success" className="mb-4">
          <AlertTitle>Action completed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {diagnostics ? <DiagnosticsReport diagnostics={diagnostics} /> : (
        <Card>
          <CardHeader>
            <CardTitle>{loading ? "Inspecting the CS2 container" : "No diagnostic report yet"}</CardTitle>
            <CardDescription>{loading ? "Reading startup logs and plugin markers." : "Run diagnostics to inspect the MatchZy load chain."}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repair the mod installation?</DialogTitle>
            <DialogDescription>
              This sets MOD_REINSTALL for one start and restarts the CS2 container. Connected players will be disconnected.
            </DialogDescription>
          </DialogHeader>
          <Alert role="status" variant="warning">
            <AlertTitle>One restart</AlertTitle>
            <AlertDescription>The panel resets MOD_REINSTALL after the bootstrap hook finishes, including a failed hook.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRepairOpen(false)}>Cancel</Button>
            <Button onClick={repair}>
              <Wrench data-icon="inline-start" />
              Repair and restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
