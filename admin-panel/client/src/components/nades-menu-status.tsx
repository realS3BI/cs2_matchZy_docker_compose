import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const STATES = {
  loaded: ["Loaded", "success"], missing: ["Not installed", "destructive"],
  unconfirmed: ["Installed · unconfirmed", "warning"], blocked: ["Framework blocked", "destructive"],
  failed: ["Load failed", "destructive"],
  unloaded: ["Unloaded", "destructive"], inactive: ["Not included in this mode", "outline"],
  unavailable: ["Status unavailable", "warning"], stopped: ["Server stopped", "warning"]
} as const;

export function NadesMenuStatus({ selectedMode }: { selectedMode: string }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const next = await api("/api/server/diagnostics");
      if (mounted.current) { setReport(next); setError(""); }
    } catch (failure) {
      if (mounted.current) setError(failure.message || "Could not check the server.");
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [refresh]);

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
            <CardDescription>Browse map lineups with .nades, choose a grenade and return to its throw position.</CardDescription>
          </div>
          <Badge variant={!report && loading ? "outline" : variant}>{!report && loading ? "Checking server…" : label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {included ? "Im Nades-Modus läuft Playbook eigenständig. Im MatchZy-Modus ergänzt es das Practice-Training."
            : "To install the menu, select MatchZy or Nades and Apply & restart."}
          {modeChanged ? " Your mode selection has not been saved yet; the status below describes the server currently running." : ""}
        </p>
        <div className="grid gap-2 rounded-lg border border-border bg-muted/25 p-4" role="status" aria-live="polite">
          <p className="text-sm">{error || menu?.detail || (loading ? "Reading the plugin installation and its runtime confirmation…" : "Menu status is not available. Rebuild and redeploy both the dashboard and CS2 images.")}</p>
          {!error && menu?.state === "loaded" ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant={menu.practice ? "success" : "warning"}>{menu.practice ? "Practice active" : "Training inaktiv"}</Badge>
              {menu.version ? <Badge variant="outline">v{menu.version}</Badge> : null}
            </div>
          ) : null}
        </div>
        <div className="grid gap-1 text-sm">
          <p>Der Nades-Modus startet das eigene Training automatisch. Im MatchZy-Modus aktiviert <code>.prac</code> das Training.</p>
          <p>Playbook verwendet ein kompaktes HUD mit neun Listenplätzen und festen Tasten. Die kompilierten HUD-Dateien müssen auf dem Client installiert sein.</p>
          <p><code>css_training</code> opens the panel. Choose your keys in Settings, then apply the displayed client binds. <code>css_training_binds</code> prints your saved configuration.</p>
          <p><code>.nades last</code> reloads your last lineup. Type <code>.nades 1</code>–<code>.nades 9</code> for numbered selection.</p>
        </div>
        {menu?.state === "missing" && !menu.bundled ? <Alert variant="warning"><AlertDescription>Rebuild and redeploy the CS2 image in Coolify or Docker Compose. Apply & restart uses the existing image and cannot add missing bundled code.</AlertDescription></Alert> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} />{loading ? "Checking…" : "Refresh status"}</Button>
          <NavLink className="text-sm font-medium underline underline-offset-4" to="/diagnostics">Open diagnostics</NavLink>
          {!error && report?.generatedAt ? <span className="text-xs text-muted-foreground">Checked {new Date(report.generatedAt).toLocaleTimeString()} · refreshes every 30 s</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
