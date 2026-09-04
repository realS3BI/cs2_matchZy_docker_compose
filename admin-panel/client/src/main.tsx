import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  Boxes,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  FileInput,
  FileJson,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPinned,
  PackagePlus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Shield,
  Terminal,
  Trash2,
  UploadCloud,
  UsersRound
} from "lucide-react";
import { api } from "./lib/api";
import { cn } from "./lib/utils";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./components/ui/field";
import { NativeSelect } from "./components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "./components/ui/switch";
import { parseSetpos, parseSetposSetang } from "./lib/nades";
import {
  ACTIVE_DUTY_MAPS,
  BUILT_IN_MAPS,
  CSNADES_REFERENCE_MAPS,
  addWorkshopMap,
  isRadarPoint,
  mapMatchesNade,
  removeWorkshopMap,
  workshopMapsFromSettings,
  type MapDefinition
} from "./lib/maps";
import { NadeFlightMap, NadePlacementEditor } from "./components/map-radar";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";
import { Diagnostics } from "./diagnostics";

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "server", label: "Server", icon: Server, group: "Workspace" },
  { id: "plugins", label: "Plugins", icon: Boxes, group: "Workspace" },
  { id: "access", label: "Access", icon: Shield, group: "Workspace" },
  { id: "maintenance", label: "Maintenance", icon: CalendarClock, group: "Operations" },
  { id: "maps", label: "Maps", icon: MapPinned, group: "Operations" },
  { id: "nades", label: "Nades", icon: Crosshair, group: "Operations" },
  { id: "diagnostics", label: "Diagnostics", icon: Activity, group: "Operations" },
  { id: "logs", label: "Logs", icon: Terminal, group: "Operations" }
];

function Message({ message = "", error = "" }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return (
    <Alert className="mb-4" variant={error ? "destructive" : "success"}>
      <AlertTitle>{error ? "Action failed" : "Control room updated"}</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap">{error || message}</AlertDescription>
    </Alert>
  );
}

const operationCopy = {
  apply: {
    title: "Applying changes",
    working: "Saving the platform settings and restarting the CS2 container.",
    refreshing: "The restart finished. Loading the new server status.",
    workingStep: "Apply settings and restart CS2"
  },
  restart: {
    title: "Restarting CS2",
    working: "Waiting for Docker to stop and start the CS2 container.",
    refreshing: "The restart finished. Loading the new server status.",
    workingStep: "Restart the CS2 container"
  }
};

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function OperationDialog({ operation }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!operation) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [operation?.startedAt]);

  if (!operation) return null;

  const copy = operationCopy[operation.kind];
  const refreshing = operation.phase === "refreshing";
  const elapsed = Math.max(0, Math.floor((now - operation.startedAt) / 1000));

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="pr-0">
          <div className="mb-2 flex items-center gap-3">
            <span className="metric-icon"><Spinner aria-hidden="true" /></span>
            <Badge variant="warning">Server action running</Badge>
          </div>
          <DialogTitle className="control-title text-xl">{copy.title}</DialogTitle>
          <DialogDescription>{refreshing ? copy.refreshing : copy.working}</DialogDescription>
          <span className="sr-only" aria-live="polite">{refreshing ? "Refreshing server status" : copy.workingStep}</span>
        </DialogHeader>
        <div className="grid gap-4">
          <Progress
            value={refreshing ? 92 : 58}
            aria-label={refreshing ? "Refreshing server status" : copy.workingStep}
          />
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <dt className="text-xs text-muted-foreground">Current step</dt>
              <dd className="text-sm font-medium">{refreshing ? "Refresh dashboard status" : copy.workingStep}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs text-muted-foreground">Elapsed time</dt>
              <dd className="font-mono text-sm font-medium">{formatElapsed(elapsed)}</dd>
            </div>
          </dl>
          <Alert>
            <AlertTitle>Keep this tab open</AlertTitle>
            <AlertDescription>The panel is still working. This window closes as soon as the updated status is available.</AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Login({ error, onLogin }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell login-grid grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden flex-col justify-between border-r border-sidebar-border p-12 text-sidebar-accent-foreground lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <span className="control-brand-mark"><Crosshair aria-hidden="true" /></span>
          <div>
            <p className="font-semibold">MatchZy Control</p>
            <p className="font-mono text-[11px] text-sidebar-foreground/45">CS2 / COOLIFY</p>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-sidebar-foreground/45">Private operations</p>
          <h1 className="control-title text-5xl leading-[1.02] xl:text-6xl">One place to run your match server.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-sidebar-foreground/60">Configure game modes, manage access and follow the container from a focused desktop workspace.</p>
        </div>
        <p className="font-mono text-xs text-sidebar-foreground/35">MATCHZY ADMIN PANEL</p>
      </section>
      <section className="grid min-h-screen place-items-center p-4 sm:p-8">
        <Card className="w-full max-w-[430px] shadow-2xl">
          <CardHeader className="gap-4">
            <span className="metric-icon"><LockKeyhole aria-hidden="true" /></span>
            <div className="grid gap-1.5">
              <CardTitle className="control-title text-2xl">Sign in</CardTitle>
              <CardDescription>Use the admin password for this Coolify deployment.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Message error={error} />
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Password</FieldLabel>
                  <Input
                    autoFocus
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Button className="w-full" disabled={busy}>{busy ? "Logging in..." : "Open control room"}</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Shell({ children, tab, setTab, message, error, onLogout, dirty, busy, operation, onSave, onApply, serviceState }) {
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];
  const tabGroups = ["Workspace", "Operations"];

  return (
    <div className="control-shell">
      <aside className="control-sidebar flex min-w-0 flex-col border-b border-sidebar-border lg:border-b-0 lg:border-r">
        <header className="flex items-center justify-between gap-3 border-b border-sidebar-border p-4 lg:px-5 lg:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="control-brand-mark"><Crosshair aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">MatchZy Control</p>
              <p className="font-mono text-[10px] tracking-[0.12em] text-sidebar-foreground/40">CS2 / COOLIFY</p>
            </div>
          </div>
          <Button className="lg:hidden" variant="sidebar" size="icon" title="Log out" onClick={onLogout}>
            <LogOut aria-hidden="true" />
          </Button>
        </header>
        <nav className="flex min-w-0 gap-1 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-1 lg:flex-col lg:gap-6 lg:overflow-y-auto lg:p-4" aria-label="Control room sections">
          {tabGroups.map((group) => (
            <div key={group} className="contents lg:flex lg:flex-col lg:gap-1">
              <p className="control-nav-label mb-1 hidden lg:block">{group}</p>
              {tabs.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} type="button" className={cn("control-nav-item", tab === item.id && "control-nav-item-active")} onClick={() => setTab(item.id)}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    <ChevronRight className="ml-auto hidden lg:block" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <footer className="hidden border-t border-sidebar-border p-4 lg:block">
          <div className="mb-3 flex items-center gap-2 px-2 text-xs text-sidebar-foreground/50">
            <span className="server-status-dot text-success" />
            Private admin session
          </div>
          <Button className="w-full justify-start" variant="sidebar" onClick={onLogout}>
            <LogOut data-icon="inline-start" />
            Log out
          </Button>
        </footer>
      </aside>
      <div className="min-w-0">
        <header className="control-topbar sticky top-0 z-30">
          <div className="control-content flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 xl:px-10">
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-muted-foreground">Control room</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">{activeTab.label}</span>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <Badge variant={serviceState === "running" ? "success" : "outline"}>
                <span className="server-status-dot" />
                {serviceState || "unknown"}
              </Badge>
              <Badge className="hidden md:inline-flex" variant={dirty ? "warning" : "outline"}>{dirty ? "Unsaved changes" : "Draft saved"}</Badge>
            </div>
            <div className="ml-auto flex gap-2 sm:ml-0">
              <Button variant="secondary" onClick={onSave} disabled={!dirty || busy}>
                <Save data-icon="inline-start" />
                Save draft
              </Button>
              <Button onClick={onApply} disabled={busy}>
                {operation?.kind === "apply" ? <Spinner data-icon="inline-start" /> : <UploadCloud data-icon="inline-start" />}
                {operation?.kind === "apply" ? "Applying..." : "Apply & restart"}
              </Button>
            </div>
          </div>
        </header>
        <main className="control-content min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          <Message message={message} error={error} />
          {children}
        </main>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="max-w-3xl">
        <p className="control-kicker">{eyebrow}</p>
        <h2 className="control-title mt-2 text-2xl sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions}
    </header>
  );
}

function Overview({ settings, admins, nades, status, policy, onRefresh, onRestart, busy }) {
  const service = status?.service;
  const last = status?.lastAction;
  const maintenance = status?.maintenance;
  const [restartOpen, setRestartOpen] = useState(false);
  const setupRequired = !String(settings.steamToken || "").trim() || !String(settings.rconPassword || "").trim();
  const activeMode = (policy?.modes || []).find((mode) => mode.id === settings.serverMode) || policy?.mode;
  const enabledPlugins = (policy?.plugins || []).filter((plugin) => plugin.locked || (plugin.settingKey ? settings[plugin.settingKey] : plugin.enabled)).length;
  const metrics = [
    { label: "Player slots", value: settings.maxPlayers || "Not set", detail: "Configured capacity", icon: UsersRound },
    { label: "Plugins", value: enabledPlugins, detail: "Enabled components", icon: Boxes },
    { label: "Server access", value: admins.length, detail: admins.length === 1 ? "Authorized person" : "Authorized people", icon: Shield },
    { label: "Nade library", value: nades.length, detail: nades.length === 1 ? "Saved lineup" : "Saved lineups", icon: Crosshair }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Live operations"
        title={settings.serverName || "CS2 server"}
        description="The server's current lifecycle, selected game mode and next maintenance window."
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={onRefresh} disabled={busy}><RefreshCw data-icon="inline-start" className={cn(busy && "animate-spin")} /> Refresh</Button><Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Restart now</Button></div>}
      />
      {setupRequired ? (
        <Alert className="mb-4" variant="warning">
          <AlertTitle>Initial server setup required</AlertTitle>
          <AlertDescription>Open Server, enter the Steam Game Server Login Token and an RCON password, then choose Apply &amp; restart. The CS2 process waits until both values exist.</AlertDescription>
        </Alert>
      ) : null}
      <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="metric-card">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                <div className="grid gap-1">
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                </div>
                <span className="metric-icon"><Icon aria-hidden="true" /></span>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">{metric.detail}</p></CardContent>
            </Card>
          );
        })}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.55fr_0.75fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle>Server overview</CardTitle>
              <CardDescription>{activeMode?.description || "Current runtime configuration."}</CardDescription>
            </div>
            <Badge variant={setupRequired ? "warning" : service?.state === "running" ? "success" : "destructive"}>
              <span className="server-status-dot" />
              {setupRequired ? "waiting for setup" : service?.state || "unknown"}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-6">
            <dl className="grid gap-4 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-3">
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Game mode</dt><dd className="text-sm font-medium">{activeMode?.name || settings.serverMode || "Not set"}</dd></div>
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Start map</dt><dd className="flex items-center gap-2 font-mono text-xs"><MapPinned className="size-4 text-muted-foreground" aria-hidden="true" />{settings.startMap || "Not set"}</dd></div>
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Container</dt><dd className="font-mono text-xs">{service?.containerName || "Not detected"}</dd></div>
            </dl>
            <div>
              <p className="mb-4 text-sm font-medium">Lifecycle</p>
              <ol className="lifecycle-rail">
                {["Coolify image", "Bootstrap", "Game process", "Daily recycle"].map((label, index) => (
                  <li key={label}><span className={cn("lifecycle-node", index < 3 && service?.state === "running" && "lifecycle-node-active")}>{index < 3 && service?.state === "running" ? <Check /> : <CircleDot />}</span><span>{label}</span></li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Operations</CardTitle><CardDescription>Maintenance and the latest panel action.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">Next maintenance</p>
              <p className="text-2xl font-semibold tracking-tight">{maintenance?.enabled ? maintenance.time : "Disabled"}</p>
              <p className="text-xs text-muted-foreground">{maintenance?.timezone || settings.restartTimezone}</p>
            </div>
            <Separator />
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">Next run</p>
              <p className="text-sm font-medium">{formatDate(maintenance?.nextRunAt)}</p>
            </div>
            <Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}>
              <RotateCcw data-icon="inline-start" />
              Restart server
            </Button>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Latest control action</CardTitle><CardDescription>The newest saved operation from this control panel.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-[160px_130px_1fr] sm:items-start">
            <span className="text-sm">{last?.type || "No action"}</span>
            <Badge className="w-fit" variant={last?.status === "failed" ? "destructive" : "success"}>{last?.status || "idle"}</Badge>
            <span className="line-clamp-2 text-sm text-muted-foreground">{last?.message || "The server has not recorded a control action yet."}</span>
          </CardContent>
        </Card>
      </section>
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restart the CS2 server now?</DialogTitle><DialogDescription>Connected players will be disconnected. Saved draft changes are not applied by this action.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="secondary" onClick={() => setRestartOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => { setRestartOpen(false); onRestart(); }}><RotateCcw data-icon="inline-start" /> Restart server</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Settings({ settings, setSettings, policy }) {
  function setValue(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Server settings" description="Edit the supported runtime settings used by the Coolify deployment." />
      <div className="grid gap-4">
        {(policy?.settingsGroups || []).filter((group) => group.id !== "matchzy" || ["matchzy", "nades"].includes(settings.serverMode)).map((group) => (
          <Card key={group.id}>
            <CardHeader><CardTitle>{group.title}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.filter((field) => field.key !== "matchZySaveNadesGlobally").map((field) => <SettingField key={field.key} field={field} value={settings[field.key] ?? ""} onChange={(value) => setValue(field.key, value)} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function SettingField({ field, value, onChange }) {
  if (field.type === "boolean") {
    return (
      <Field className="flex min-h-16 grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span><FieldLabel>{field.label}</FieldLabel>{field.description ? <FieldDescription className="mt-1 block">{field.description}</FieldDescription> : null}</span>
        <Switch checked={value === true} onCheckedChange={onChange} />
      </Field>
    );
  }
  const Control = field.type === "textarea" ? Textarea : Input;
  return (
    <Field className={field.type === "textarea" ? "md:col-span-2 xl:col-span-3" : ""}>
      <FieldLabel>{field.label}</FieldLabel>
      <Control placeholder={field.placeholder} type={field.type === "password" ? "password" : field.type} value={value} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} />
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function Plugins({ settings, setSettings, policy }) {
  const mode = settings.serverMode || "matchzy";
  return (
    <>
      <PageHeader eyebrow="Compatibility policy" title="Game modes & plugins" description="Choose one game mode and control the optional components installed with it." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Server mode</CardTitle><CardDescription>MatchZy and Executes solve different game flows and cannot run together.</CardDescription></CardHeader>
        <CardContent>
          <RadioGroup
            className="lg:grid-cols-3"
            value={mode}
            onValueChange={(nextMode) => setSettings((current) => ({ ...current, serverMode: nextMode }))}
          >
            {(policy?.modes || []).map((item) => (
              <label key={item.id} className={cn("mode-choice", mode === item.id && "mode-choice-active")}>
                <span className="flex items-center justify-between"><strong>{item.name}</strong><RadioGroupItem value={item.id} aria-label={item.name} /></span>
                <span className="text-sm leading-relaxed text-muted-foreground">{item.description}</span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Plugin stack</CardTitle><CardDescription>Core dependencies are locked. Optional components default to off on new installations.</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          {(policy?.plugins || []).filter((plugin) => !["matchzy", "nades", "executes"].includes(plugin.id)).map((plugin) => {
            const enabled = plugin.locked || settings[plugin.settingKey] === true;
            return (
              <div key={plugin.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto] md:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{plugin.name}</h3>{plugin.locked ? <Badge variant="outline">core</Badge> : null}{enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="outline">off</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{plugin.detail}</p><p className="mt-2 text-xs text-muted-foreground">Requires: {plugin.dependencies.length ? plugin.dependencies.join(" · ") : "none"}</p>{plugin.warning && enabled ? <Alert className="mt-3" variant="warning"><AlertDescription>{plugin.warning}</AlertDescription></Alert> : null}</div>
                {plugin.locked ? <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required</span> : <Switch aria-label={`Enable ${plugin.name}`} checked={enabled} onCheckedChange={(next) => setSettings((current) => ({ ...current, [plugin.settingKey]: next }))} />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function Admins({ admins, setAdmins, flagPresets, roles }) {
  function updateAdmin(index, patch) {
    setAdmins((current) => current.map((admin, itemIndex) => (itemIndex === index ? { ...admin, ...patch } : admin)));
  }

  function toggleFlag(index, flag, checked) {
    const currentFlags = admins[index].flags || [];
    const flags = checked ? [...new Set([...currentFlags, flag])] : currentFlags.filter((item) => item !== flag);
    updateAdmin(index, { flags });
  }

  return (
    <>
      <PageHeader eyebrow="One permission system" title="Access" description="Every person gets one role. CounterStrikeSharp enforces it for the server and MatchZy." actions={<Button variant="secondary" onClick={() => setAdmins((current) => [...current, { name: "", identitySteam64: "", role: "match_operator", flags: [] }])}><Plus data-icon="inline-start" /> Add person</Button>} />
      <Alert className="mb-4"><AlertTitle>Single source of truth</AlertTitle><AlertDescription>MatchZy's own admins.json stays empty. Roles below generate CounterStrikeSharp permissions only.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle>People with server access</CardTitle><CardDescription>Use Custom only when the predefined roles are not precise enough.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          {admins.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No one has panel-managed in-game permissions. Add a person to assign a role.</div> : null}
          {admins.map((admin, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border bg-muted/25 p-4 xl:grid-cols-[1fr_1.2fr_220px_44px]">
              <Field><FieldLabel>Name</FieldLabel><Input value={admin.name || ""} placeholder="Display name" onChange={(event) => updateAdmin(index, { name: event.target.value })} /></Field>
              <Field><FieldLabel>Steam64 ID</FieldLabel><Input value={admin.identitySteam64 || ""} placeholder="7656119…" onChange={(event) => updateAdmin(index, { identitySteam64: event.target.value })} /></Field>
              <Field><FieldLabel>Role</FieldLabel><NativeSelect value={admin.role || "owner"} onChange={(event) => updateAdmin(index, { role: event.target.value })}>{(roles || []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect></Field>
              <Button className="self-end" variant="secondary" size="icon" title="Remove" onClick={() => setAdmins((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>
              {admin.role === "custom" ? <FieldGroup className="flex-row flex-wrap gap-3 rounded-md border border-border bg-card p-3 xl:col-span-4">
                {flagPresets.map((flag) => (
                  <Field key={flag} className="flex grid-cols-[auto_1fr] items-center gap-2">
                    <Checkbox
                      checked={(admin.flags || []).includes(flag)}
                      onCheckedChange={(checked) => toggleFlag(index, flag, checked === true)}
                    />
                    <FieldLabel className="font-mono text-xs text-muted-foreground">{flag}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup> : <p className="text-xs text-muted-foreground xl:col-span-4">{(roles || []).find((role) => role.id === (admin.role || "owner"))?.description}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Maintenance({ settings, setSettings, status, onRestart, busy }) {
  const enabled = settings.automaticRestartEnabled === true;
  const [restartOpen, setRestartOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Uptime policy" title="Maintenance" description="Schedule a daily process restart without redeploying the Coolify resource." />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>Daily server recycle</CardTitle><CardDescription>The panel claims one restart slot in MongoDB, so duplicate panel instances cannot restart the server twice.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <Field className="flex grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 p-4"><span><FieldLabel>Automatic restart</FieldLabel><FieldDescription className="mt-1 block">Disconnects active players at the chosen local time.</FieldDescription></span><Switch checked={enabled} onCheckedChange={(next) => setSettings((current) => ({ ...current, automaticRestartEnabled: next }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>Local time</FieldLabel><Input type="time" value={settings.restartTime || "05:00"} disabled={!enabled} onChange={(event) => setSettings((current) => ({ ...current, restartTime: event.target.value }))} /></Field>
              <Field><FieldLabel>IANA timezone</FieldLabel><Input value={settings.restartTimezone || "Europe/Vienna"} disabled={!enabled} onChange={(event) => setSettings((current) => ({ ...current, restartTimezone: event.target.value }))} /><FieldDescription>Example: Europe/Vienna; daylight-saving changes are handled automatically.</FieldDescription></Field>
            </div>
            <Alert variant="warning"><AlertTitle>Operational mitigation</AlertTitle><AlertDescription>This restart limits problems that accumulate over uptime. It does not claim a confirmed engine tick-counter overflow.</AlertDescription></Alert>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Schedule state</CardTitle><CardDescription>Reported by the running scheduler.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-4"><span className="text-muted-foreground">Next run</span><p className="mt-1 font-semibold">{formatDate(status?.maintenance?.nextRunAt)}</p></div>
            <div className="rounded-lg border border-border bg-muted/30 p-4"><span className="text-muted-foreground">Last run</span><p className="mt-1 font-semibold">{formatDate(status?.maintenance?.lastRun?.lastRunAt)}</p></div>
            <Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Restart now</Button>
          </CardContent>
        </Card>
      </div>
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}><DialogContent><DialogHeader><DialogTitle>Restart the CS2 server now?</DialogTitle><DialogDescription>Connected players will be disconnected. This does not apply unsaved draft changes.</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRestartOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => { setRestartOpen(false); onRestart(); }}><RotateCcw data-icon="inline-start" /> Restart server</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}

const nadeTypes = ["", "Smoke", "Flash", "HE", "Molly", "Decoy"];

function LineupImageUpload({ onUploaded, onError, label = "Upload lineup images", multiple = true }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function upload(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    onError("");
    try {
      for (const file of files) {
        const image = await api("/api/uploads/lineup-image", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name)
          },
          body: file
        });
        onUploaded(image);
      }
    } catch (error) {
      onError(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={multiple}
        onChange={upload}
      />
      <Button type="button" variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
        <UploadCloud data-icon="inline-start" />
        {uploading ? "Uploading..." : label}
      </Button>
      <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · 4 MB each</span>
    </div>
  );
}

function createNade(settings, initialMap = "") {
  return {
    id: window.crypto?.randomUUID?.() || String(Date.now()),
    name: "",
    map: initialMap || settings.startMap || "",
    type: "Smoke",
    desc: "",
    lineupPos: "0 0 0",
    lineupAng: "0 0 0",
    landingPos: "",
    throwFromTitle: "",
    throwToTitle: "",
    radarFrom: null,
    radarTo: null,
    lineupImages: [],
    owner: "default"
  };
}

function NadeDialog({ settings, initialMap = "", initialNade = null, open, onOpenChange, onAdd }) {
  const [draft, setDraft] = useState(() => ({ ...createNade(settings, initialMap), ...(initialNade || {}) }));
  const [setposText, setSetposText] = useState("");
  const [landingSetposText, setLandingSetposText] = useState("");
  const [dialogError, setDialogError] = useState("");
  const availableMaps = useMemo(() => [...BUILT_IN_MAPS, ...workshopMapsFromSettings(settings)], [settings.workshopMaps, settings.workshopMapCatalog]);
  const draftMap = availableMaps.find((map) => mapMatchesNade(map, draft.map));

  useEffect(() => {
    if (!open) return;
    setDraft({ ...createNade(settings, initialMap), ...(initialNade || {}) });
    setSetposText("");
    setLandingSetposText("");
    setDialogError("");
  }, [open, settings, initialMap, initialNade]);

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function applyPosition() {
    setDialogError("");
    const parsed = parseSetposSetang(setposText);
    if (!parsed) {
      setDialogError("setpos/setang format is invalid.");
      return;
    }
    updateDraft(parsed);
  }

  function applyLandingPosition() {
    setDialogError("");
    const parsed = parseSetpos(landingSetposText);
    if (!parsed) {
      setDialogError("Landing setpos format is invalid.");
      return;
    }
    updateDraft({ landingPos: parsed });
  }

  function addImage(image) {
    const serverData = image.serverData || {};
    const nextImage = {
      key: String(serverData.key || image.key || ""),
      url: String(serverData.url || image.url || ""),
      name: String(serverData.name || image.name || "lineup-image"),
      size: Number(serverData.size ?? image.size ?? 0),
      uploadedAt: String(serverData.uploadedAt || new Date().toISOString())
    };
    if (!nextImage.key || !nextImage.url) return;
    setDraft((current) => ({
      ...current,
      lineupImages: [...(current.lineupImages || []), nextImage].slice(0, 10)
    }));
  }

  function removeImage(key) {
    setDraft((current) => ({
      ...current,
      lineupImages: (current.lineupImages || []).filter((image) => image.key !== key)
    }));
  }

  function submit() {
    setDialogError("");
    if (!String(draft.name || "").trim()) {
      setDialogError("Name is required.");
      return;
    }
    if (!String(draft.map || "").trim()) {
      setDialogError("Map is required.");
      return;
    }
    if (draftMap?.radarUrl && (!isRadarPoint(draft.radarFrom) || !isRadarPoint(draft.radarTo))) {
      setDialogError("Place both the start and target on the radar.");
      return;
    }
    onAdd({
      ...draft,
      id: draft.id || window.crypto?.randomUUID?.() || String(Date.now()),
      lineupImages: draft.lineupImages || []
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1120px,calc(100vw-24px))]">
        <DialogHeader>
          <DialogTitle>{initialNade ? "Edit nade route" : "Add nade"}</DialogTitle>
          <DialogDescription>Import the in-game positions, then mark where the nade starts and lands on the radar.</DialogDescription>
        </DialogHeader>
        {dialogError ? <Message error={dialogError} /> : null}
        <div className="nade-dialog-layout">
          <FieldGroup className="grid content-start gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={draft.name || ""} placeholder="Window smoke" onChange={(event) => updateDraft({ name: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Map</FieldLabel>
              <NativeSelect
                value={draft.map || ""}
                onChange={(event) => updateDraft({ map: event.target.value, radarFrom: null, radarTo: null })}
              >
                {!availableMaps.some((map) => mapMatchesNade(map, draft.map)) && draft.map ? <option value={draft.map}>{draft.map}</option> : null}
                {availableMaps.map((map) => <option key={map.key} value={map.mapName}>{map.name}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <NativeSelect value={draft.type || ""} onChange={(event) => updateDraft({ type: event.target.value })}>
                {nadeTypes.map((type) => <option key={type || "empty"} value={type}>{type || "No type"}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Owner</FieldLabel>
              <Input value={draft.owner || ""} onChange={(event) => updateDraft({ owner: event.target.value })} />
              <FieldDescription>Use default to share it with every player.</FieldDescription>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <Input value={draft.desc || ""} placeholder="Jumpthrow from T spawn" onChange={(event) => updateDraft({ desc: event.target.value })} />
            </Field>

            <div className="nade-position-section md:col-span-2">
              <div className="nade-position-heading">
                <span className="nade-position-number">01</span>
                <div><strong>Throw position</strong><span>Stand at the lineup, enter <code>getpos</code>, then paste the output.</span></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>Start label</FieldLabel>
                  <Input value={draft.throwFromTitle || ""} placeholder="T Spawn" onChange={(event) => updateDraft({ throwFromTitle: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Lineup position</FieldLabel>
                  <Input value={draft.lineupPos || ""} onChange={(event) => updateDraft({ lineupPos: event.target.value })} />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Lineup angle</FieldLabel>
                  <Input value={draft.lineupAng || ""} onChange={(event) => updateDraft({ lineupAng: event.target.value })} />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>getpos output</FieldLabel>
                  <Textarea value={setposText} onChange={(event) => setSetposText(event.target.value)} placeholder="setpos 1422.968750 34.830574 -103.968750;setang -24.193808 -166.485611 0.000000" />
                  <Button type="button" size="sm" variant="secondary" onClick={applyPosition}>Apply start position</Button>
                </Field>
              </div>
            </div>

            <div className="nade-position-section md:col-span-2">
              <div className="nade-position-heading">
                <span className="nade-position-number">02</span>
                <div><strong>Landing position</strong><span>Move to the landing spot with noclip and copy <code>getpos</code> again.</span></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>Target label</FieldLabel>
                  <Input value={draft.throwToTitle || ""} placeholder="Window" onChange={(event) => updateDraft({ throwToTitle: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Landing position</FieldLabel>
                  <Input value={draft.landingPos || ""} placeholder="Optional until captured in-game" onChange={(event) => updateDraft({ landingPos: event.target.value })} />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Landing getpos output</FieldLabel>
                  <Textarea value={landingSetposText} onChange={(event) => setLandingSetposText(event.target.value)} placeholder="setpos -1175.20 -48.14 -167.97;setang 0 0 0" />
                  <Button type="button" size="sm" variant="secondary" onClick={applyLandingPosition}>Apply landing position</Button>
                </Field>
              </div>
            </div>
          </FieldGroup>

          <div className="nade-radar-editor">
            <div>
              <p className="control-kicker">Route placement</p>
              <h3 className="mt-1 font-semibold">{draftMap?.name || "Unknown map"}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The radar frame is the fixed map boundary. Place the start circle and landing diamond directly on it.</p>
            </div>
            <NadePlacementEditor map={draftMap} value={draft} onChange={updateDraft} />
          </div>
        </div>
        <div className="grid gap-3">
          <LineupImageUpload onUploaded={addImage} onError={setDialogError} />
          {(draft.lineupImages || []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {(draft.lineupImages || []).map((image) => (
                <div key={image.key} className="grid grid-cols-[72px_1fr_40px] items-center gap-3 rounded-md border border-border bg-background p-2">
                  <img className="h-14 w-[72px] rounded-sm object-cover" src={image.url} alt={image.name} />
                  <a className="truncate text-sm font-semibold text-primary hover:underline" href={image.url} target="_blank" rel="noreferrer">
                    {image.name}
                  </a>
                  <Button variant="secondary" size="icon" title="Remove image" onClick={() => removeImage(image.key)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{initialNade ? "Save route" : "Add nade"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyCommand({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="command-block">
      <code>{value}</code>
      <Button type="button" variant="secondary" size="sm" onClick={copy}>
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}

function MapChoice({ map, nades, selected, onSelect }) {
  return (
    <button
      type="button"
      className={cn("map-choice", selected && "map-choice-selected")}
      aria-pressed={selected}
      onClick={() => onSelect(map.key)}
    >
      {map.radarUrl ? (
        <div className="map-choice-radar"><img src={map.radarUrl} alt={`${map.name} radar`} loading="lazy" /></div>
      ) : (
        <NadeFlightMap map={map} nades={nades} compact />
      )}
      <span className="flex items-start justify-between gap-3 px-3 pb-3 pt-2.5">
        <span className="min-w-0 text-left">
          <strong className="block truncate text-sm">{map.name}</strong>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{map.mapName || map.workshopId}</span>
        </span>
        <Badge variant={nades.length > 0 ? "secondary" : "outline"}>{nades.length}</Badge>
      </span>
    </button>
  );
}

function WorkshopMapDialog({ open, onOpenChange, onAdd }) {
  const [draft, setDraft] = useState({ title: "", mapName: "", workshopId: "", radarUrl: "" });
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({ title: "", mapName: "", workshopId: "", radarUrl: "" });
    setDialogError("");
    setSubmitting(false);
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    setDialogError("");
    setSubmitting(true);
    try {
      let radarSize = {};
      if (draft.radarUrl) {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => reject(new Error("Radar image could not be loaded."));
          image.src = draft.radarUrl;
        });
        radarSize = { radarWidth: dimensions.width, radarHeight: dimensions.height };
      }
      onAdd({ ...draft, ...radarSize });
      onOpenChange(false);
    } catch (error) {
      setDialogError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function useRadarUpload(image) {
    const serverData = image.serverData || {};
    const url = String(serverData.url || image.url || "");
    if (url) setDraft((current) => ({ ...current, radarUrl: url }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Workshop map</DialogTitle>
          <DialogDescription>Store the Workshop addon, its internal map name and an optional radar for route placement.</DialogDescription>
        </DialogHeader>
        {dialogError ? <Message error={dialogError} /> : null}
        <form className="grid gap-5" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Display name</FieldLabel>
              <Input value={draft.title} placeholder="Recoil Master" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </Field>
            <Field>
              <FieldLabel>Game map name</FieldLabel>
              <Input value={draft.mapName} placeholder="recoil_master" onChange={(event) => setDraft((current) => ({ ...current, mapName: event.target.value }))} />
              <FieldDescription>The BSP name used with changelevel and inside savednades.json.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Workshop ID or item URL</FieldLabel>
              <Input value={draft.workshopId} placeholder="3070244462" onChange={(event) => setDraft((current) => ({ ...current, workshopId: event.target.value }))} />
            </Field>
            <Field>
              <FieldLabel>Radar image URL</FieldLabel>
              <Input value={draft.radarUrl} placeholder="Optional https://…/radar.webp" onChange={(event) => setDraft((current) => ({ ...current, radarUrl: event.target.value }))} />
              <FieldDescription>The complete radar frame becomes this map's placement boundary.</FieldDescription>
            </Field>
            <LineupImageUpload label="Upload radar image" multiple={false} onUploaded={useRadarUpload} onError={setDialogError} />
            {draft.radarUrl ? <img className="max-h-56 w-full rounded-lg border border-border bg-sidebar object-contain" src={draft.radarUrl} alt="Workshop radar preview" /> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}><PackagePlus data-icon="inline-start" />{submitting ? "Adding…" : "Add map"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnnotationGuide({ map }: { map: MapDefinition }) {
  const fileName = `matchzy_${map.key.replace(/[^a-z0-9_]/gi, "_")}_01`;
  const practiceCommands = `map ${map.mapName}\nsv_cheats 1\nsv_allow_annotations_access_level 2\nsv_infinite_ammo 1\nammo_grenade_limit_total 6\nmp_warmup_end`;
  return (
    <Card id="annotation-guide">
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <CardTitle className="flex items-center gap-2"><BookOpen className="size-4 text-primary" aria-hidden="true" />Build the {map.name} map guide</CardTitle>
            <CardDescription>Create the landing point in CS2, save the guide locally, then publish it to the Workshop if other players should use it.</CardDescription>
          </div>
          <Badge variant="secondary">{map.mapName}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5 sm:pt-6">
        <Alert variant="warning">
          <AlertTitle>MatchZy lineups and Valve map guides are two formats</AlertTitle>
          <AlertDescription>MatchZy stores the standing position and view angle on the server. A grenade annotation also needs the grenade's landing point, which CS2 records after your throw. The panel can keep both workflows together, but it cannot safely convert savednades.json into a complete guide file.</AlertDescription>
        </Alert>
        <ol className="annotation-steps">
          <li>
            <span className="annotation-step-number">1</span>
            <div className="grid gap-2">
              <h4 className="font-semibold">Open a local practice match</h4>
              <p>In CS2 choose Play, Practice, Casual and {map.name}. Enable the developer console, then paste this setup.</p>
              <CopyCommand value={practiceCommands} label="Copy setup" />
            </div>
          </li>
          <li>
            <span className="annotation-step-number">2</span>
            <div className="grid gap-2">
              <h4 className="font-semibold">Throw the nade, then capture it</h4>
              <p>Stand on the lineup, aim and throw. Run the matching command only after the grenade lands. CS2 creates the standing, aim and destination nodes as one set.</p>
              <div className="grid gap-2 lg:grid-cols-2">
                <CopyCommand value={'annotation_create grenade smoke "Window smoke"'} />
                <CopyCommand value={'annotation_create grenade flash "A site pop flash"'} />
                <CopyCommand value={'annotation_create grenade he "Default HE"'} />
                <CopyCommand value={'annotation_create grenade molotov "Close corner molly"'} />
              </div>
            </div>
          </li>
          <li>
            <span className="annotation-step-number">3</span>
            <div className="grid gap-2">
              <h4 className="font-semibold">Save after every useful lineup</h4>
              <p>The current format stores the guide in its own folder under <code>game/csgo/annotations/local</code>.</p>
              <CopyCommand value={`annotation_save ${fileName}`} label="Copy save command" />
              <p className="font-mono text-xs text-muted-foreground">...\Counter-Strike Global Offensive\game\csgo\annotations\local\{fileName}\{fileName}.txt</p>
            </div>
          </li>
          <li>
            <span className="annotation-step-number">4</span>
            <div className="grid gap-2">
              <h4 className="font-semibold">Edit, reload and split large guides</h4>
              <p>Edit labels, instructions, colors or text offsets in the KV3 file. Reload the open file after saving. Use append when a second file should remain loaded beside the first.</p>
              <div className="grid gap-2 lg:grid-cols-3">
                <CopyCommand value="annotation_reload" />
                <CopyCommand value={`annotation_load ${fileName}`} />
                <CopyCommand value={`annotation_append ${fileName.replace(/_01$/, "_02")}`} />
              </div>
              <p>Undo the last created set with <code>annotation_delete_previous_node_set</code>. Clear everything in memory with <code>annotation_clear</code>.</p>
            </div>
          </li>
          <li>
            <span className="annotation-step-number">5</span>
            <div className="grid gap-2">
              <h4 className="font-semibold">Publish the guide</h4>
              <p>Save once so CS2 creates the guide folder and preview. Submit a new Workshop item without an ID. For an update, pass the item ID from its Workshop URL.</p>
              <div className="grid gap-2 lg:grid-cols-2">
                <CopyCommand value="workshop_annotation_submit" />
                <CopyCommand value="workshop_annotation_submit 1234567890" />
              </div>
            </div>
          </li>
        </ol>
        <Alert>
          <AlertTitle>Limits in current CS2 builds</AlertTitle>
          <AlertDescription>Local and offline sessions can load up to 300 nodes. Competitive and Retakes allow up to 30 nodes during the first five rounds of each half by default. In a live match, players choose a subscribed guide from the pause menu.</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex-wrap border-t border-border pt-5 sm:pt-6">
        <Button variant="secondary" asChild>
          <a href="https://www.counter-strike.net/newsentry/532126482488623353" target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Valve map guide update</a>
        </Button>
        <Button variant="secondary" asChild>
          <a href="https://csnades.gg/maps" target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />CSNADES map index</a>
        </Button>
        <Button variant="secondary" asChild>
          <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3367125162" target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Annotation file reference</a>
        </Button>
      </CardFooter>
    </Card>
  );
}

function Maps({ settings, setSettings, nades, setNades, nadesDirty, busy, onSaveNades, onApply }) {
  const workshopMaps = useMemo(() => workshopMapsFromSettings(settings), [settings.workshopMaps, settings.workshopMapCatalog]);
  const allMaps = useMemo(() => [...ACTIVE_DUTY_MAPS, ...CSNADES_REFERENCE_MAPS, ...workshopMaps], [workshopMaps]);
  const initialMap = allMaps.find((map) => mapMatchesNade(map, settings.startMap)) || ACTIVE_DUTY_MAPS[0];
  const [selectedKey, setSelectedKey] = useState(initialMap.key);
  const [addNadeOpen, setAddNadeOpen] = useState(false);
  const [editingNade, setEditingNade] = useState<any>(null);
  const [addWorkshopOpen, setAddWorkshopOpen] = useState(false);

  useEffect(() => {
    if (!allMaps.some((map) => map.key === selectedKey)) setSelectedKey(ACTIVE_DUTY_MAPS[0].key);
  }, [allMaps, selectedKey]);

  const selectedMap = allMaps.find((map) => map.key === selectedKey) || ACTIVE_DUTY_MAPS[0];
  const nadesForMap = useCallback((map) => nades.filter((nade) => mapMatchesNade(map, nade.map)), [nades]);
  const selectedNades = nadesForMap(selectedMap);
  const placedNades = selectedNades.filter((nade) => isRadarPoint(nade.radarFrom) && isRadarPoint(nade.radarTo));
  const typeCounts = selectedNades.reduce((counts, nade) => {
    const type = nade.type || "Other";
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  const canStartMap = Boolean(selectedMap.mapName) && selectedMap.category !== "community";
  const isStartMap = mapMatchesNade(selectedMap, settings.startMap);

  function selectMap(key) {
    setSelectedKey(key);
    window.requestAnimationFrame(() => document.getElementById("selected-map")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Tactical atlas"
        title="Maps & map guides"
        description="Pick a map to see every saved lineup, prepare the game server and build a Valve annotation guide for the same map."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setEditingNade(null); setAddNadeOpen(true); }}><Plus data-icon="inline-start" />Add {selectedMap.name} nade</Button>
            <Button onClick={onSaveNades} disabled={busy || !nadesDirty}><Save data-icon="inline-start" />Save lineups</Button>
          </div>
        )}
      />
      <NadeDialog
        settings={settings}
        initialMap={selectedMap.mapName}
        initialNade={editingNade}
        open={addNadeOpen || Boolean(editingNade)}
        onOpenChange={(nextOpen) => {
          setAddNadeOpen(nextOpen);
          if (!nextOpen) setEditingNade(null);
        }}
        onAdd={(entry) => setNades((current) => editingNade
          ? current.map((nade) => nade.id === editingNade.id ? entry : nade)
          : [...current, entry])}
      />
      <WorkshopMapDialog
        open={addWorkshopOpen}
        onOpenChange={setAddWorkshopOpen}
        onAdd={(input) => setSettings((current) => ({ ...current, ...addWorkshopMap(current, input), workshopMapsEnabled: true }))}
      />

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border">
          <div className="grid gap-1.5">
            <CardTitle>Active Duty</CardTitle>
            <CardDescription>Valve Season Five pool, updated 8 July 2026. Cache replaced Overpass.</CardDescription>
          </div>
          <Badge variant="secondary">7 maps</Badge>
        </CardHeader>
        <CardContent className="pt-5 sm:pt-6">
          <div className="map-choice-grid">
            {ACTIVE_DUTY_MAPS.map((map) => <MapChoice key={map.key} map={map} nades={nadesForMap(map)} selected={selectedMap.key === map.key} onSelect={selectMap} />)}
          </div>
        </CardContent>
        <CardFooter className="border-t border-border pt-5 text-xs text-muted-foreground sm:pt-6">
          The current pool follows Valve. CSNADES still lists Overpass under Active Duty and Cache under Reserve.
        </CardFooter>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>More maps on CSNADES</CardTitle>
          <CardDescription>Reserve and community maps from the CSNADES map index. They stay available here for older and custom lineup libraries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="map-choice-grid">
            {CSNADES_REFERENCE_MAPS.map((map) => <MapChoice key={map.key} map={map} nades={nadesForMap(map)} selected={selectedMap.key === map.key} onSelect={selectMap} />)}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <CardTitle>Workshop maps</CardTitle>
            <CardDescription>Maps added here also update the MultiAddonManager list used by the CS2 container.</CardDescription>
          </div>
          <Button variant="secondary" onClick={() => setAddWorkshopOpen(true)}><PackagePlus data-icon="inline-start" />Add map</Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field className="flex min-h-20 grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-background px-4 py-3">
            <span>
              <FieldLabel>Load Workshop maps on the server</FieldLabel>
              <FieldDescription className="mt-1 block">Enables MultiAddonManager and mounts every Workshop ID in this list.</FieldDescription>
            </span>
            <Switch aria-label="Load Workshop maps on the server" checked={settings.workshopMapsEnabled === true} onCheckedChange={(checked) => setSettings((current) => ({ ...current, workshopMapsEnabled: checked }))} />
          </Field>
          {workshopMaps.length > 0 ? (
            <div className="map-choice-grid">
              {workshopMaps.map((map) => (
                <div key={map.key} className="workshop-map-choice">
                  <MapChoice map={map} nades={nadesForMap(map)} selected={selectedMap.key === map.key} onSelect={selectMap} />
                  <Button
                    className="workshop-map-remove"
                    type="button"
                    variant="secondary"
                    size="icon"
                    title={`Remove ${map.name}`}
                    onClick={() => setSettings((current) => ({ ...current, ...removeWorkshopMap(current, map.workshopId) }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertTitle>No Workshop maps pinned</AlertTitle>
              <AlertDescription>Add a Workshop item ID, a display name and its internal map name. It will appear beside the fixed CS2 maps.</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button onClick={onApply} disabled={busy}><UploadCloud data-icon="inline-start" />Apply maps & restart</Button>
          <span className="text-xs text-muted-foreground">A restart downloads and mounts newly added Workshop addons.</span>
        </CardFooter>
      </Card>

      <Card className="map-atlas-detail mb-4 scroll-mt-24" id="selected-map">
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedMap.category === "active" ? "success" : "secondary"}>{selectedMap.category === "active" ? "Active Duty" : selectedMap.category === "workshop" ? "Workshop" : selectedMap.category}</Badge>
                {isStartMap ? <Badge variant="outline"><span className="server-status-dot" />Server start map</Badge> : null}
              </div>
              <CardTitle className="control-title text-2xl">{selectedMap.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{selectedMap.mapName || `Workshop ${selectedMap.workshopId}`}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedMap.sourceUrl ? (
                <Button variant="secondary" asChild><a href={selectedMap.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />CSNADES</a></Button>
              ) : null}
              {selectedMap.workshopId ? (
                <Button variant="secondary" asChild><a href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedMap.workshopId}`} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Workshop</a></Button>
              ) : null}
              <Button variant="secondary" disabled={!canStartMap || isStartMap} onClick={() => setSettings((current) => ({ ...current, startMap: selectedMap.mapName }))}><MapPinned data-icon="inline-start" />{isStartMap ? "Start map selected" : "Set as start map"}</Button>
              <Button onClick={() => { setEditingNade(null); setAddNadeOpen(true); }}><Plus data-icon="inline-start" />Add lineup</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="map-atlas-layout grid gap-6 pt-5 sm:pt-6">
          <div className="map-stage">
            <NadeFlightMap map={selectedMap} nades={selectedNades} emptyMessage="No start-to-target routes placed yet" onSelectNade={setEditingNade} />
            <div className="map-stage-legend">
              <span><i className="radar-status-dot radar-status-dot-ready" />Start position</span>
              <span><i className="radar-status-diamond radar-status-dot-ready" />Landing position</span>
              <span>{placedNades.length}/{selectedNades.length} routes placed · curves show direction, not vertical trajectory</span>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div>
              <p className="control-kicker">Library coverage</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">{selectedNades.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">lineups synchronized with MatchZy</p>
            </div>
            <Separator />
            <dl className="grid grid-cols-2 gap-3">
              {Object.keys(typeCounts).length > 0 ? Object.entries(typeCounts).map(([type, count]) => (
                <div key={type} className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">{type}</dt><dd className="mt-1 font-mono text-lg font-medium">{String(count)}</dd></div>
              )) : <div className="col-span-2 text-sm text-muted-foreground">No utility saved for this map yet.</div>}
            </dl>
            <CopyCommand value={`rcon changelevel ${selectedMap.mapName}`} label="Copy map command" />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border">
          <div className="grid gap-1.5">
            <CardTitle>{selectedMap.name} lineups</CardTitle>
            <CardDescription>Everything saved for this map in the shared MatchZy library.</CardDescription>
          </div>
          <Badge variant="secondary">{selectedNades.length}</Badge>
        </CardHeader>
        <CardContent className="pt-5 sm:pt-6">
          {selectedNades.length > 0 ? (
            <div className="lineup-card-grid">
              {selectedNades.map((nade) => (
                <Card key={nade.id} className="lineup-gallery-card overflow-hidden">
                  {(nade.lineupImages || []).length > 0 ? (
                    <a className="lineup-gallery-image" href={nade.lineupImages[0].url} target="_blank" rel="noreferrer">
                      <img src={nade.lineupImages[0].url} alt={nade.lineupImages[0].name || nade.name} />
                      {nade.lineupImages.length > 1 ? <Badge variant="secondary">+{nade.lineupImages.length - 1} images</Badge> : null}
                    </a>
                  ) : <div className="lineup-gallery-sketch"><NadeFlightMap map={selectedMap} nades={[nade]} compact /></div>}
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><CardTitle className="truncate">{nade.name}</CardTitle><CardDescription className="mt-1 line-clamp-2">{nade.desc || "No description"}</CardDescription></div>
                      <Badge variant="outline">{nade.type || "Nade"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-xs">
                    <div className="grid gap-1"><span className="text-muted-foreground">Route</span><strong>{nade.throwFromTitle || "Start"} → {nade.throwToTitle || "Target"}</strong></div>
                    <div className="grid gap-1"><span className="text-muted-foreground">Position</span><code className="truncate">{nade.lineupPos}</code></div>
                    <div className="grid gap-1"><span className="text-muted-foreground">Angle</span><code className="truncate">{nade.lineupAng}</code></div>
                    {nade.landingPos ? <div className="grid gap-1"><span className="text-muted-foreground">Landing</span><code className="truncate">{nade.landingPos}</code></div> : null}
                  </CardContent>
                  <CardFooter className="justify-between border-t border-border pt-4">
                    <Badge variant={String(nade.owner || "default") === "default" ? "success" : "warning"}>{String(nade.owner || "default") === "default" ? "Shared" : "Private"}</Badge>
                    <div className="flex flex-1 flex-wrap justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditingNade(nade)}><MapPinned data-icon="inline-start" />Edit route</Button>
                      <CopyCommand value={`.loadnade ${nade.name}`} label="Copy load" />
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertTitle>No {selectedMap.name} lineups yet</AlertTitle>
              <AlertDescription>Add one in the panel or save it in-game with MatchZy. The sync service will place it here automatically.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <AnnotationGuide map={selectedMap} />
    </>
  );
}

function nadesSyncPresentation(sync) {
  if (sync?.state === "healthy") return { label: "Sync healthy", variant: "success" as const };
  if (sync?.state === "error") return { label: "Sync error", variant: "destructive" as const };
  if (sync?.state === "waiting") return { label: "Waiting for files", variant: "warning" as const };
  if (sync?.state === "stopped") return { label: "Sync stopped", variant: "destructive" as const };
  return { label: "Sync disabled", variant: "outline" as const };
}

function syncDirectionLabel(direction) {
  if (direction === "matchzy-to-panel") return "MatchZy → Dashboard";
  if (direction === "panel-to-matchzy") return "Dashboard → MatchZy";
  return "No transfer yet";
}

function Nades({ settings, setSettings, nades, setNades, status, busy, nadesDirty, onApply, onRefresh, onReload, onSave }) {
  const [mapFilter, setMapFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [exportJson, setExportJson] = useState("");
  const [localError, setLocalError] = useState("");
  const [liveStatus, setLiveStatus] = useState({
    sync: status?.nadesSync || { enabled: false, state: "disabled" },
    library: status?.nadesLibrary || { count: nades.length, updatedAt: null }
  });
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    setLiveStatus({
      sync: status?.nadesSync || { enabled: false, state: "disabled" },
      library: status?.nadesLibrary || { count: nades.length, updatedAt: null }
    });
  }, [status?.nadesSync, status?.nadesLibrary, nades.length]);

  useEffect(() => {
    let cancelled = false;
    async function refreshSyncStatus() {
      try {
        const result = await api("/api/nades/status");
        if (cancelled) return;
        setLiveStatus(result);
        setStatusError("");
      } catch (error) {
        if (!cancelled) setStatusError(error.message);
      }
    }
    void refreshSyncStatus();
    const timer = window.setInterval(refreshSyncStatus, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const maps = useMemo<string[]>(() => [...new Set<string>(nades.map((nade) => String(nade.map || "")).filter(Boolean))].sort(), [nades]);
  const sharedNades = nades.filter((nade) => String(nade.owner || "default") === "default").length;
  const privateNades = nades.length - sharedNades;
  const syncPresentation = nadesSyncPresentation(statusError ? { state: "error" } : liveStatus.sync);
  const desiredGlobalSaves = settings.matchZySaveNadesGlobally === true;
  const appliedGlobalSaves = liveStatus.sync?.globalSavesEnabled;
  const sharingNeedsApply = appliedGlobalSaves === null || appliedGlobalSaves === undefined || appliedGlobalSaves !== desiredGlobalSaves;
  const matchZyModeActive = ["matchzy", "nades"].includes(settings.serverMode);
  const loadedLibraryVersion = status?.nadesLibrary?.updatedAt || null;
  const observedLibraryVersion = liveStatus.library?.updatedAt || null;
  const libraryChanged = Boolean(observedLibraryVersion && observedLibraryVersion !== loadedLibraryVersion);
  const filteredNades = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return nades.filter((nade) => {
      if (mapFilter && nade.map !== mapFilter) return false;
      if (typeFilter && nade.type !== typeFilter) return false;
      if (!normalizedQuery) return true;
      return `${nade.name} ${nade.desc}`.toLowerCase().includes(normalizedQuery);
    });
  }, [nades, mapFilter, typeFilter, query]);
  const groupedNades = useMemo(() => {
    const groups = new Map();
    for (const nade of filteredNades) {
      const map = nade.map || "(no map)";
      if (!groups.has(map)) groups.set(map, []);
      groups.get(map).push(nade);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredNades]);

  function updateNade(id, patch) {
    setNades((current) => current.map((nade) => (nade.id === id ? { ...nade, ...patch } : nade)));
  }

  async function importNades() {
    setLocalError("");
    try {
      const matchzyConfig = JSON.parse(importJson);
      const result = await api("/api/nades/import", {
        method: "POST",
        body: JSON.stringify({ matchzyConfig, mode: "replace" })
      });
      setNades(result.entries || []);
      await onReload();
      setImportOpen(false);
      setImportJson("");
    } catch (error) {
      setLocalError(error.message);
    }
  }

  async function exportNades() {
    setLocalError("");
    try {
      const result = await api("/api/nades/export");
      setExportJson(JSON.stringify(result, null, 2));
    } catch (error) {
      setLocalError(error.message);
    }
  }

  async function copyExport() {
    if (!exportJson) return;
    await navigator.clipboard?.writeText(exportJson);
  }

  function downloadExport() {
    if (!exportJson) return;
    const blob = new Blob([`${exportJson}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "matchzy-savednades.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="Match library"
        title="Nade lineups"
        description="One library for every saved lineup. MatchZy and the dashboard keep the same savednades.json content."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onRefresh} disabled={busy || nadesDirty} title={nadesDirty ? "Save or discard your local edits before refreshing" : "Load the latest library from MongoDB"}>
              <RefreshCw data-icon="inline-start" />
              Refresh library
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen((current) => !current)}>
              <FileInput data-icon="inline-start" />
              Import
            </Button>
            <Button variant="secondary" onClick={exportNades}>
              <Download data-icon="inline-start" />
              Export
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" />
              Add nade
            </Button>
            <Button onClick={onSave} disabled={busy}>
              <Save data-icon="inline-start" />
              Save nades
            </Button>
          </div>
        )}
      />
      <NadeDialog
        settings={settings}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(entry) => setNades((current) => [...current, entry])}
      />
      {localError ? <Message error={localError} /> : null}
      <Card className="mb-4 overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <CardTitle>Shared MatchZy library</CardTitle>
            <CardDescription>New in-game lineups can be stored under MatchZy's default owner so every player can list and load them.</CardDescription>
          </div>
          <Badge variant={desiredGlobalSaves && !sharingNeedsApply ? "success" : sharingNeedsApply ? "warning" : "outline"}>
            <span className="server-status-dot" />
            {sharingNeedsApply ? "Restart required" : desiredGlobalSaves ? "Shared saves applied" : "Private saves applied"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid items-center gap-3 rounded-lg border border-border bg-muted/25 p-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-3">
              <span className="metric-icon"><Database aria-hidden="true" /></span>
              <span><strong className="block text-sm">Dashboard library</strong><span className="text-xs text-muted-foreground">{liveStatus.library?.count ?? nades.length} lineups in MongoDB</span></span>
            </div>
            <div className="flex items-center justify-center gap-2 font-mono text-xs text-muted-foreground">
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              {Math.round((liveStatus.sync?.intervalMs || 2000) / 1000)}s
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <span className="metric-icon"><FileJson aria-hidden="true" /></span>
              <span><strong className="block text-sm">MatchZy savednades.json</strong><span className="text-xs text-muted-foreground">{liveStatus.sync?.liveFilePresent ? "File reachable" : "File not found"}</span></span>
            </div>
          </div>

          <Field className="flex min-h-20 grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-background px-4 py-3">
            <span>
              <FieldLabel className="flex items-center gap-2"><Globe2 className="size-4 text-primary" aria-hidden="true" /> Save new in-game lineups for everyone</FieldLabel>
              <FieldDescription className="mt-1 block">When enabled, MatchZy writes every player's .savenade entry to the shared default library.</FieldDescription>
            </span>
            <Switch
              aria-label="Save new in-game lineups for everyone"
              checked={desiredGlobalSaves}
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, matchZySaveNadesGlobally: checked }))}
            />
          </Field>

          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Sync status</dt><dd><Badge variant={syncPresentation.variant}><span className="server-status-dot" />{syncPresentation.label}</Badge></dd></div>
            <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Last confirmed</dt><dd className="text-sm font-medium">{formatDate(liveStatus.sync?.lastConfirmedAt)}</dd></div>
            <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Last transfer</dt><dd className="text-sm font-medium">{syncDirectionLabel(liveStatus.sync?.lastDirection)}</dd></div>
            <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Visibility</dt><dd className="flex flex-wrap gap-2"><Badge variant="success">{sharedNades} shared</Badge>{privateNades > 0 ? <Badge variant="warning">{privateNades} private</Badge> : null}</dd></div>
          </dl>

          {statusError || liveStatus.sync?.lastError ? <Alert variant="destructive"><AlertTitle>Nade sync cannot confirm the connection</AlertTitle><AlertDescription>{statusError || liveStatus.sync.lastError}</AlertDescription></Alert> : null}
          {!matchZyModeActive ? <Alert variant="warning"><AlertTitle>MatchZy is not the active server mode</AlertTitle><AlertDescription>The files can stay synchronized, but players cannot use MatchZy's nade commands until MatchZy or Nades mode is active.</AlertDescription></Alert> : null}
          {libraryChanged ? <Alert variant="warning"><AlertTitle>The shared library changed</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>MatchZy imported a newer library at {formatDate(observedLibraryVersion)}.</span><Button variant="secondary" onClick={onRefresh}>{nadesDirty ? "Discard edits & load latest" : "Load latest"}</Button></AlertDescription></Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onApply} disabled={busy || !sharingNeedsApply}>
              <UploadCloud data-icon="inline-start" />
              Apply sharing & restart
            </Button>
            <span className="text-xs text-muted-foreground">Players save with .savenade and browse with .listnades.</span>
          </div>
        </CardContent>
      </Card>
      {importOpen ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Import MatchZy savednades.json</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea value={importJson} onChange={(event) => setImportJson(event.target.value)} placeholder='{"default":{}}' />
            <div className="flex flex-wrap gap-2">
              <Button onClick={importNades}>
                <FileInput data-icon="inline-start" />
                Replace nades
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {exportJson ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Export</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea readOnly value={exportJson} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={copyExport}>
                <Copy data-icon="inline-start" />
                Copy
              </Button>
              <Button variant="secondary" onClick={downloadExport}>
                <Download data-icon="inline-start" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle>Saved lineups</CardTitle>
              <CardDescription>Filter and edit the lineups that MatchZy can load.</CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">{nadesDirty ? <Badge variant="warning">Unsaved edits</Badge> : null}<Badge variant="secondary">{filteredNades.length} shown</Badge></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FieldGroup className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3 md:grid-cols-[1fr_180px_180px]">
            <Field>
              <FieldLabel className="sr-only">Search lineups</FieldLabel>
              <Input value={query} placeholder="Search name or description" onChange={(event) => setQuery(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel className="sr-only">Map</FieldLabel>
              <NativeSelect value={mapFilter} onChange={(event) => setMapFilter(event.target.value)}>
                <option value="">All maps</option>
                {maps.map((map) => <option key={map} value={map}>{map}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel className="sr-only">Nade type</FieldLabel>
              <NativeSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">All types</option>
                {nadeTypes.filter(Boolean).map((type) => <option key={type} value={type}>{type}</option>)}
              </NativeSelect>
            </Field>
          </FieldGroup>
          {nades.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No nades configured. Add the first lineup to this library.</div> : null}
          {nades.length > 0 && filteredNades.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No lineups match the current filters.</div> : null}
          {groupedNades.map(([map, mapNades]) => (
            <section key={map} className="grid gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{map} <Badge>{mapNades.length}</Badge></h3>
              {mapNades.map((nade) => (
                <div key={nade.id} className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 xl:grid-cols-[1fr_1fr_130px_1.2fr_1fr_1fr_90px_90px_44px]">
                  <Input value={nade.name || ""} placeholder="Name" onChange={(event) => updateNade(nade.id, { name: event.target.value })} />
                  <Input value={nade.map || ""} placeholder="Map" onChange={(event) => updateNade(nade.id, { map: event.target.value })} />
                  <NativeSelect
                    value={nade.type || ""}
                    onChange={(event) => updateNade(nade.id, { type: event.target.value })}
                  >
                    {nadeTypes.map((type) => <option key={type || "empty"} value={type}>{type || "No type"}</option>)}
                  </NativeSelect>
                  <Input value={nade.desc || ""} placeholder="Description" onChange={(event) => updateNade(nade.id, { desc: event.target.value })} />
                  <Input value={nade.lineupPos || ""} placeholder="LineupPos" onChange={(event) => updateNade(nade.id, { lineupPos: event.target.value })} />
                  <Input value={nade.lineupAng || ""} placeholder="LineupAng" onChange={(event) => updateNade(nade.id, { lineupAng: event.target.value })} />
                  {(nade.lineupImages || []).length > 0 ? (
                    <a className="block h-9 w-[86px] overflow-hidden rounded-md border border-border bg-card" href={nade.lineupImages[0].url} target="_blank" rel="noreferrer" title={`${nade.lineupImages.length} image(s)`}>
                      <img className="h-full w-full object-cover" src={nade.lineupImages[0].url} alt={nade.lineupImages[0].name || "Lineup"} />
                    </a>
                  ) : (
                    <span className="flex h-9 items-center rounded-md border border-border bg-card px-2 text-xs text-muted-foreground">No image</span>
                  )}
                  <Badge className="w-fit self-center" variant={String(nade.owner || "default") === "default" ? "success" : "warning"} title={String(nade.owner || "default") === "default" ? "Available to every player" : `Private owner: ${nade.owner}`}>
                    {String(nade.owner || "default") === "default" ? "Shared" : "Private"}
                  </Badge>
                  <Button variant="secondary" size="icon" title="Remove" onClick={() => setNades((current) => current.filter((item) => item.id !== nade.id))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function DockerLogs({ active }) {
  const [logs, setLogs] = useState("");
  const [tail, setTail] = useState(300);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const logRef = useRef(null);

  const loadLogs = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setLogError("");
    try {
      const result = await api(`/api/server/logs?tail=${tail}`);
      setLogs(result.logs || "");
      setUpdatedAt(new Date().toLocaleTimeString());
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
    } catch (error) {
      setLogError(error.message);
    } finally {
      setLoading(false);
    }
  }, [active, tail]);

  useEffect(() => {
    if (!active) return undefined;
    loadLogs();
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(loadLogs, 5000);
    return () => window.clearInterval(timer);
  }, [active, autoRefresh, loadLogs]);

  return (
    <>
      <PageHeader eyebrow="Runtime output" title="Docker logs" description="Live output from the CS2 container, newest lines at the bottom." />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:p-3">
          <Button variant="secondary" onClick={loadLogs} disabled={loading}>
            <RefreshCw data-icon="inline-start" className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant={autoRefresh ? "default" : "secondary"} onClick={() => setAutoRefresh((current) => !current)}>
            {autoRefresh ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
          <Field className="ml-auto flex grid-cols-[auto_100px] items-center gap-2">
            <FieldLabel className="text-muted-foreground">Lines</FieldLabel>
            <NativeSelect value={tail} onChange={(event) => setTail(Number(event.target.value))}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={800}>800</option>
              <option value={1500}>1500</option>
            </NativeSelect>
          </Field>
          <span className="text-xs text-muted-foreground">{updatedAt ? `Updated ${updatedAt}` : ""}</span>
        </CardContent>
      </Card>
      {logError ? <Message error={logError} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>CS2 Docker Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <pre
            ref={logRef}
            className="log-console h-[62vh] overflow-auto whitespace-pre-wrap rounded-lg border border-sidebar-border p-4 font-mono text-xs leading-relaxed"
          >
            {logs || (loading ? "Loading logs..." : "No logs available.")}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState("overview");
  const [settings, setSettings] = useState({});
  const [admins, setAdmins] = useState([]);
  const [nades, setNades] = useState([]);
  const [flagPresets, setFlagPresets] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [status, setStatus] = useState(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [savedNadesSignature, setSavedNadesSignature] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(null);

  async function loadAll() {
    const control = await api("/api/control");
    setAuthenticated(true);
    setSettings(control.settings || {});
    setAdmins(control.admins || []);
    setNades(control.nades || []);
    setFlagPresets(control.flagPresets || []);
    setPolicy(control.policy || null);
    setStatus(control.status || null);
    setSavedSignature(JSON.stringify({ settings: control.settings || {}, admins: control.admins || [] }));
    setSavedNadesSignature(JSON.stringify(control.nades || []));
  }

  async function runAction(action, operationKind = null) {
    setBusy(true);
    setMessage("");
    setError("");
    if (operationKind) {
      setOperation({ kind: operationKind, phase: "working", startedAt: Date.now() });
    }
    try {
      const result = await action();
      if (operationKind) {
        setOperation((current) => current ? { ...current, phase: "refreshing" } : current);
      }
      await loadAll();
      setMessage(result?.message || "Done.");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setOperation(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => setAuthenticated(false));
  }, []);

  const dirty = savedSignature !== "" && savedSignature !== JSON.stringify({ settings, admins });
  const nadesDirty = savedNadesSignature !== "" && savedNadesSignature !== JSON.stringify(nades);

  function applyControl() {
    return runAction(() => api("/api/control/apply", { method: "POST", body: JSON.stringify({ settings, admins }) }), "apply");
  }

  useEffect(() => {
    function warnBeforeLeave(event) {
      if (!dirty && !nadesDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty, nadesDirty]);

  if (!authenticated) {
    return (
      <Login
        error={error}
        onLogin={async (password) => {
          try {
            await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
            setError("");
            await loadAll();
          } catch (loginError) {
            setError(loginError.message);
          }
        }}
      />
    );
  }

  return (
    <Shell
      tab={tab}
      setTab={(nextTab) => {
        setMessage("");
        setError("");
        setTab(nextTab);
      }}
      message={message}
      error={error}
      dirty={dirty}
      busy={busy}
      operation={operation}
      serviceState={status?.service?.state}
      onSave={() => runAction(async () => {
        await api("/api/control", { method: "PUT", body: JSON.stringify({ settings, admins }) });
        return { message: "Draft saved. Apply it when you are ready to restart CS2." };
      })}
      onApply={applyControl}
      onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
      }}
    >
      {tab === "overview" ? (
        <Overview
          settings={settings}
          admins={admins}
          nades={nades}
          status={status}
          policy={policy}
          busy={busy}
          onRefresh={() => runAction(async () => {
            await loadAll();
            return { message: "Refreshed." };
          })}
          onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "restart")}
        />
      ) : null}
      {tab === "diagnostics" ? (
        <><PageHeader eyebrow="Health trace" title="Diagnostics" description="Follow the container, installer, framework and selected game mode through one load path." /><Diagnostics active={tab === "diagnostics"} onOpenLogs={() => setTab("logs")} /></>
      ) : null}
      {tab === "server" ? (
        <Settings
          settings={settings}
          setSettings={setSettings}
          policy={policy}
        />
      ) : null}
      {tab === "plugins" ? <Plugins settings={settings} setSettings={setSettings} policy={policy} /> : null}
      {tab === "access" ? (
        <Admins
          admins={admins}
          setAdmins={setAdmins}
          flagPresets={flagPresets}
          roles={policy?.adminRoles || []}
        />
      ) : null}
      {tab === "maintenance" ? <Maintenance settings={settings} setSettings={setSettings} status={status} busy={busy} onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "restart")} /> : null}
      {tab === "maps" ? (
        <Maps
          settings={settings}
          setSettings={setSettings}
          nades={nades}
          setNades={setNades}
          nadesDirty={nadesDirty}
          busy={busy}
          onApply={applyControl}
          onSaveNades={() => runAction(async () => {
            const result = await api("/api/nades", { method: "PUT", body: JSON.stringify({ entries: nades }) });
            setNades(result.entries);
            return { message: "Nades saved." };
          })}
        />
      ) : null}
      {tab === "nades" ? (
        <Nades
          settings={settings}
          setSettings={setSettings}
          nades={nades}
          setNades={setNades}
          status={status}
          busy={busy}
          nadesDirty={nadesDirty}
          onApply={applyControl}
          onRefresh={() => runAction(async () => ({ message: "Nade library refreshed." }))}
          onReload={loadAll}
          onSave={() => runAction(async () => {
            const result = await api("/api/nades", { method: "PUT", body: JSON.stringify({ entries: nades }) });
            setNades(result.entries);
            return { message: "Nades saved." };
          })}
        />
      ) : null}
      {tab === "logs" ? <DockerLogs active={tab === "logs"} /> : null}
      <OperationDialog operation={operation} />
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(<App />);
