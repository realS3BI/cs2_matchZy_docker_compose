import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "./components/ui/breadcrumb";
import { UserManagement } from "./components/user-management";
import { RconChat } from "./components/rcon-chat";
import { MapAtlas } from "./components/map-atlas";
import { LineupPage } from "./components/lineup-page";
import { NadeFavoritesProvider } from "./components/nade-favorites";
import { findLineup } from "./lib/lineups";
import { mapPath, mapSlug, mapsForLibrary } from "./lib/maps";
import { NadeLibrary, LegacyLibraryRedirect } from "./components/nade-library";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, matchPath, useLocation, useNavigate } from "react-router-dom";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "./components/ui/switch";
import { parseSetpos, parseSetposSetang } from "./lib/nades";
import { inferRadarCalibration } from "./lib/nade-radar";
import {
  mapsForInventory,
  BUILT_IN_MAPS,
  addWorkshopMap,
  mapMatchesNade,
  removeWorkshopMap,
  workshopMapsFromSettings,
  type MapDefinition
} from "./lib/maps";
import { NadePlacementEditor } from "./components/map-radar";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";
import { Diagnostics } from "./diagnostics";
import { NadesMenuStatus } from "./components/nades-menu-status";
import { ServerControls } from "./components/server-controls";

const routePaths = {
  login: "/login",
  overview: "/overview",
  server: "/server",
  plugins: "/plugins",
  access: "/access",
  maintenance: "/maintenance",
  maps: "/maps",
  nades: "/nades",
  diagnostics: "/diagnostics",
  logs: "/logs",
  console: "/console",
  links: "/links"
};

const tabs = [
  { id: "nades", path: routePaths.nades, label: "Nades", icon: Crosshair, group: "Training" },
  { id: "maps", path: routePaths.maps, label: "Maps", icon: MapPinned, group: "Training" },
  { id: "overview", path: routePaths.overview, label: "Übersicht", icon: LayoutDashboard, group: "Server" },
  { id: "server", path: routePaths.server, label: "Einstellungen", icon: Server, group: "Server" },
  { id: "plugins", path: routePaths.plugins, label: "Modi & Plugins", icon: Boxes, group: "Server" },
  { id: "console", path: routePaths.console, label: "Konsole", icon: Terminal, group: "Server" },
  { id: "access", path: routePaths.access, label: "Benutzer", icon: Shield, group: "Server" },
  { id: "diagnostics", path: routePaths.diagnostics, label: "Diagnose", icon: Activity, group: "Server" },
  { id: "logs", path: routePaths.logs, label: "Logs", icon: Terminal, group: "Server" },
  { id: "maintenance", path: routePaths.maintenance, label: "Wartung", icon: CalendarClock, group: "Server" },
  { id: "links", path: routePaths.links, label: "Dokumentation", icon: BookOpen, group: "Server" }
];

const defaultRoute = routePaths.maps;
function isMapRoute(pathname) {
  return Boolean(matchPath("/maps/:mapSlug", pathname) || matchPath("/maps/:mapSlug/lineups/:lineupId", pathname));
}
function allowedTabs(role) { return tabs.filter(tab => role === "admin" || tab.group === "Training" || (role === "match_admin" && ["overview", "plugins", "console"].includes(tab.id))); }

function routeFromLoginSearch(search) {
  const requestedRoute = new URLSearchParams(search).get("redirect");
  if (!requestedRoute) return defaultRoute;
  const pathname = requestedRoute.split("?")[0];
  return (tabs.some(item => item.path === pathname) || isMapRoute(pathname)) ? requestedRoute : defaultRoute;
}

function Message({ message = "", error = "" }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return (
    <Alert className="mb-4" variant={error ? "destructive" : "success"}>
      <AlertTitle>{error ? "Aktion fehlgeschlagen" : "Aktualisiert"}</AlertTitle>
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

function Login({ error }) {
  const failed = new URLSearchParams(window.location.search).has("error");
  return <main className="login-shell login-grid grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-lg"><CardHeader><div className="mb-4 flex items-center gap-3"><span className="control-brand-mark"><Crosshair /></span><span className="font-mono text-sm">MATCHZY CONTROL</span></div><CardTitle className="control-title text-3xl">Deine Maps. Deine Nades.</CardTitle><CardDescription>Entdecke Lineups, lerne Wurfwege und bereite deine nächste Runde vor. Melde dich mit Steam an.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><Message error={failed ? "Steam-Anmeldung abgebrochen oder abgelaufen. Bitte erneut anmelden." : error} /><Button asChild><a href="/api/auth/steam">Mit Steam anmelden</a></Button><p className="text-sm text-muted-foreground">Neue Spieler erhalten die Rolle Player. Dein Steam-Passwort gibst du ausschließlich bei Steam ein.</p></CardContent></Card>
  </main>;
}

function Shell({ user, children, tab, onNavigate, message, error, onLogout, dirty, busy, operation, onSave, onApply, serviceState, selectedMap, selectedNade }) {
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];
  const currentPage = selectedNade?.displayName || selectedNade?.name || selectedMap?.name || (tab === "maps" ? "All Maps" : activeTab.label);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <a className="skip-link" href="#main-content">Zum Inhalt</a>
        <AppSidebar user={user} serverItems={allowedTabs(user.role).filter(item => item.group === "Server")} onNavigate={onNavigate} onLogout={onLogout} dirty={dirty} serviceState={serviceState} />
        <SidebarInset className="workspace-inset min-w-0">
          <header className="control-topbar sticky top-0 z-30 md:rounded-t-xl">
            <div className="control-content topbar-inner">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4 self-center" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild><NavLink to={activeTab.group === "Training" ? routePaths.maps : routePaths.overview}>{activeTab.group === "Training" ? "Maps" : "Server"}</NavLink></BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  {selectedNade && selectedMap && <><BreadcrumbItem><BreadcrumbLink asChild><NavLink to={mapPath(selectedMap)}>{selectedMap.name}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /></>}
                  <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate max-w-48 sm:max-w-80">{currentPage}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="topbar-status"><span className="topbar-caption">COUNTER-STRIKE 2</span></div>
            </div>
          </header>
        <div id="main-content" className="control-content control-main min-w-0" tabIndex={-1}>
          <Message message={message} error={error} />
          <NadeFavoritesProvider key={user.identitySteam64}>{children}</NadeFavoritesProvider>
          {user.role !== "player" && ["overview", "server", "plugins", "maintenance"].includes(tab) && <section className="server-save-panel" aria-label="Servereinstellungen speichern">
            <div><h2>Servereinstellungen übernehmen</h2><p>{dirty ? "Du hast ungespeicherte Änderungen." : "Der aktuelle Entwurf ist gespeichert."} Ein Neustart trennt verbundene Spieler.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onSave} disabled={!dirty || busy}><Save data-icon="inline-start" />Entwurf speichern</Button>
              <Button onClick={onApply} disabled={busy}>{operation?.kind === "apply" ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}Übernehmen & neu starten</Button>
            </div>
          </section>}
        </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
        <h1 className="control-title mt-2 text-2xl sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions}
    </header>
  );
}

function Overview({ settings, setSettings, admins, nades, status, policy, onRefresh, onRestart, onApply, busy }) {
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
    { label: "Benutzer", value: admins.length, detail: "Registrierte Steam-Konten", icon: Shield },
    { label: "Nade library", value: nades.length, detail: nades.length === 1 ? "Saved lineup" : "Saved lineups", icon: Crosshair }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Serververwaltung"
        title={settings.serverName || "CS2 server"}
        description="Verwalte deinen CS2-Server, wechsle den Modus und bereite die nächste Session vor."
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={onRefresh} disabled={busy}><RefreshCw data-icon="inline-start" className={cn(busy && "animate-spin")} /> Refresh</Button><Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Restart now</Button></div>}
      />
      {setupRequired ? (
        <Alert className="mb-4" variant="warning">
          <AlertTitle>Initial server setup required</AlertTitle>
          <AlertDescription>Open Server, enter the Steam Game Server Login Token and an RCON password, then choose Apply &amp; restart. The CS2 process waits until both values exist.</AlertDescription>
        </Alert>
      ) : null}
      <section className="overview-metrics mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Server at a glance">
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
      <ServerControls settings={settings} setSettings={setSettings} policy={policy} busy={busy} running={service?.state === "running"} onApply={onApply} />
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
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Selected mode</dt><dd className="text-sm font-medium">{activeMode?.name || settings.serverMode || "Not set"}</dd></div>
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
            <Button variant="secondary" asChild><NavLink to={routePaths.maintenance}><CalendarClock data-icon="inline-start" />View maintenance</NavLink></Button>
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
      <nav className="quick-links mt-5" aria-label="Common destinations">
        <p className="control-kicker">Explore workspace</p>
        <div className="quick-links-grid">
          <NavLink to={routePaths.maps}><MapPinned aria-hidden="true" /><span>Map atlas</span><ChevronRight aria-hidden="true" /></NavLink>
          <NavLink to={routePaths.nades}><Crosshair aria-hidden="true" /><span>Nade library</span><ChevronRight aria-hidden="true" /></NavLink>
          <NavLink to={routePaths.diagnostics}><Activity aria-hidden="true" /><span>Diagnostics</span><ChevronRight aria-hidden="true" /></NavLink>
          <NavLink to={routePaths.logs}><Terminal aria-hidden="true" /><span>Server logs</span><ChevronRight aria-hidden="true" /></NavLink>
        </div>
      </nav>
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restart the CS2 server now?</DialogTitle><DialogDescription>Connected players will be disconnected. The last saved settings will be applied; unsaved edits will not.</DialogDescription></DialogHeader>
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
      <PageHeader eyebrow="Configuration" title="Servereinstellungen" description="Verbindung, Spielbetrieb und Zugangsdaten für deinen CS2-Server." />
      <div className="grid gap-4">
        {(policy?.settingsGroups || []).filter((group) => group.id !== "workshop" && (group.id !== "matchzy" || ["matchzy", "nades"].includes(settings.serverMode))).map((group) => (
          <Card key={group.id}>
            <CardHeader><CardTitle>{group.title}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.filter((field) => !["matchZySaveNadesGlobally", "startMap"].includes(field.key)).map((field) => <SettingField key={field.key} field={field} value={settings[field.key] ?? ""} onChange={(value) => setValue(field.key, value)} />)}
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
        <Switch aria-label={field.label} checked={value === true} onCheckedChange={onChange} />
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

const usefulLinks = [
  {
    title: "MatchZy documentation",
    description: "Setup, configuration, match commands and API reference.",
    href: "https://shobhit-pathak.github.io/MatchZy/",
    category: "Documentation"
  },
  {
    title: "MatchZy on GitHub",
    description: "Source code, releases and issue tracker for the match plugin.",
    href: "https://github.com/shobhit-pathak/MatchZy",
    category: "Game mode"
  },
  {
    title: "Fortnite Emotes & Dances",
    description: "Source code, commands and releases for the optional emote plugin.",
    href: "https://github.com/Cruze03/FortniteEmotesNDances",
    category: "Plugin"
  },
  {
    title: "CounterStrikeSharp documentation",
    description: "Framework installation, configuration and API documentation.",
    href: "https://docs.cssharp.dev/",
    category: "Framework"
  }
];

function Links() {
  return (
    <>
      <PageHeader
        eyebrow="Reference shelf"
        title="Links"
        description="Documentation, repositories and release pages used to run this server."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {usefulLinks.map((link) => {
          const hostname = new URL(link.href).hostname;
          return (
            <a
              key={link.href}
              className="resource-link group"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              <span className="resource-link-icon"><ExternalLink aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="mb-2 flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold text-foreground">{link.title}</strong>
                  <Badge variant="outline">{link.category}</Badge>
                </span>
                <span className="block text-sm leading-relaxed text-muted-foreground">{link.description}</span>
                <span className="mt-3 block truncate font-mono text-[11px] text-muted-foreground">{hostname}</span>
              </span>
              <ChevronRight className="resource-link-arrow" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </>
  );
}

function Plugins({ settings, setSettings, policy, showDiagnostics = true }) {
  const mode = settings.serverMode || "matchzy";
  return (
    <>
      <PageHeader eyebrow="Compatibility policy" title="Game modes & plugins" description="Choose one game mode and control the optional components installed with it." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Server mode</CardTitle><CardDescription>Choose the game flow for the next server start.</CardDescription></CardHeader>
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
      {showDiagnostics && <NadesMenuStatus selectedMode={mode} />}
      <Card>
        <CardHeader><CardTitle>Plugin stack</CardTitle><CardDescription>Core dependencies are locked. Optional components default to off on new installations.</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          {(policy?.plugins || []).filter((plugin) => !["matchzy", "nades"].includes(plugin.id)).map((plugin) => {
            const enabled = plugin.locked || settings[plugin.settingKey] === true;
            return (
              <div key={plugin.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto] md:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{plugin.name}</h3>{plugin.locked ? <Badge variant="outline">core</Badge> : null}{enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="outline">off</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{plugin.detail}</p><p className="mt-2 text-xs text-muted-foreground">Requires: {plugin.dependencies.length ? plugin.dependencies.join(" · ") : "none"}</p>{plugin.url ? <a className="plugin-reference-link" href={plugin.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Project &amp; documentation</a> : null}{plugin.warning && enabled ? <Alert className="mt-3" variant="warning"><AlertDescription>{plugin.warning}</AlertDescription></Alert> : null}</div>
                {plugin.locked ? <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required</span> : <Switch aria-label={`Enable ${plugin.name}`} checked={enabled} onCheckedChange={(next) => setSettings((current) => ({ ...current, [plugin.settingKey]: next }))} />}
              </div>
            );
          })}
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
            <Field className="flex grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 p-4"><span><FieldLabel>Automatic restart</FieldLabel><FieldDescription className="mt-1 block">Disconnects active players at the chosen local time.</FieldDescription></span><Switch aria-label="Automatic restart" checked={enabled} onCheckedChange={(next) => setSettings((current) => ({ ...current, automaticRestartEnabled: next }))} /></Field>
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
    displayName: "",
    mustKnow: false,
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

function NadeReviewFields({ nade, onChange }) {
  return <div className="col-span-full grid gap-3 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={nade.official ? "success" : nade.reviewStatus === "pending" ? "warning" : "secondary"}>{nade.official ? "Offiziell" : nade.reviewStatus === "pending" ? "Review angefragt" : nade.reviewStatus === "rejected" ? "Review abgelehnt" : "Ungeprüfte Aufnahme"}</Badge>
      <span className="text-xs text-muted-foreground">Für alle unter „Alle“ sichtbar. Freigaben werden mit „Nades speichern“ gespeichert.</span>
    </div>
    <Field><FieldLabel>Offiziell freigeben</FieldLabel><Switch aria-label={`Offiziell: ${nade.displayName || nade.name || "Neue Granate"}`} checked={nade.official === true} onCheckedChange={(official) => onChange({ official, reviewStatus: official ? "approved" : "", ...(!official ? { mustKnow: false } : {}) })} /><FieldDescription>Nur als Plattform-Admin nach Prüfung von Abwurfpunkt, Beschreibung und Wirkung freigeben. Der Ersteller kann offizielle Granaten nicht mehr ändern.</FieldDescription></Field>
    <Field><FieldLabel>Must Know</FieldLabel><Switch aria-label={`Must Know: ${nade.displayName || nade.name || "Neue Granate"}`} checked={nade.mustKnow === true} onCheckedChange={(mustKnow) => onChange({ mustKnow, ...(mustKnow ? { official: true, reviewStatus: "approved" } : {}) })} /><FieldDescription>Markiert ein geprüftes Grundlagen-Lineup und zeigt es im Must-Know-Shortcut auf Home. Aktivieren gibt die Granate zugleich offiziell frei.</FieldDescription></Field>
    {nade.reviewStatus === "pending" && !nade.official ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => onChange({ official: true, reviewStatus: "approved" })}>Review freigeben</Button><Button variant="outline" onClick={() => onChange({ official: false, mustKnow: false, reviewStatus: "rejected" })}>Review ablehnen</Button></div> : null}
  </div>;
}

function NadeDialog({ settings, nades = [], initialMap = "", initialNade = null, open, onOpenChange, onAdd }) {
  const [draft, setDraft] = useState(() => ({ ...createNade(settings, initialMap), ...(initialNade || {}) }));
  const [setposText, setSetposText] = useState("");
  const [landingSetposText, setLandingSetposText] = useState("");
  const [dialogError, setDialogError] = useState("");
  const availableMaps = useMemo(() => [...BUILT_IN_MAPS, ...workshopMapsFromSettings(settings)], [settings.workshopMaps, settings.workshopMapCatalog]);
  const draftMap = availableMaps.find((map) => mapMatchesNade(map, draft.map));
  const calibration = draftMap ? inferRadarCalibration(draftMap, nades) : null;

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
          <DialogDescription>Set a readable title. Save with .savenade or load through .nades, then throw to capture the target automatically.</DialogDescription>
        </DialogHeader>
        {dialogError ? <Message error={dialogError} /> : null}
        <div className="nade-dialog-layout">
          <FieldGroup className="grid content-start gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Display name</FieldLabel>
              <Input id="nade-display-name" maxLength={120} value={draft.displayName || ""} placeholder="Window smoke from T spawn" onChange={(event) => updateDraft({ displayName: event.target.value })} />
              <FieldDescription>Shown on the website and in the .nades menu. Empty uses the technical name.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Technical name</FieldLabel>
              <Input id="nade-technical-name" readOnly={Boolean(initialNade)} value={draft.name || ""} placeholder="window_smoke" onChange={(event) => updateDraft({ name: event.target.value })} />
              <FieldDescription>Stable key for .loadnade; changing the display name keeps this and the ID intact.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Map</FieldLabel>
              <Select value={draft.map || undefined} onValueChange={(value) => updateDraft({ map: value, radarFrom: null, radarTo: null })}>
                <SelectTrigger aria-label="Nade map"><SelectValue placeholder="Choose a map" /></SelectTrigger>
                <SelectContent>
                  {!availableMaps.some((map) => mapMatchesNade(map, draft.map)) && draft.map ? <SelectItem value={draft.map}>{draft.map}</SelectItem> : null}
                  {availableMaps.map((map) => <SelectItem key={map.key} value={map.mapName}>{map.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={draft.type || "__none__"} onValueChange={(value) => updateDraft({ type: value === "__none__" ? "" : value })}>
                <SelectTrigger aria-label="Nade type"><SelectValue /></SelectTrigger>
                <SelectContent>{nadeTypes.map((type) => <SelectItem key={type || "empty"} value={type || "__none__"}>{type || "No type"}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Owner</FieldLabel>
              <Input value={draft.owner || ""} onChange={(event) => updateDraft({ owner: event.target.value })} />
              <FieldDescription>Ersteller-ID bleibt für Bearbeitungsrechte erhalten. Alle Aufnahmen sind im Panel sichtbar.</FieldDescription>
            </Field>
            <NadeReviewFields nade={draft} onChange={updateDraft} />
            <Field className="md:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <Input value={draft.desc || ""} placeholder="Jumpthrow from T spawn" onChange={(event) => updateDraft({ desc: event.target.value })} />
            </Field>

            <div className="nade-position-section md:col-span-2">
              <div className="nade-position-heading">
                <span className="nade-position-number">01</span>
                <div><strong>Throw position</strong><span>Captured by <code>.savenade</code>. You can also paste <code>getpos</code> manually.</span></div>
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
                <div><strong>Effect position</strong><span>Smoke, flash, HE and decoy targets are captured on the next throw after saving or loading a lineup. Refresh the library afterwards.</span></div>
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
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{calibration
                ? "Automatic placement uses saved reference points on this map. Manual markers override it. Points outside the image stay unplaced."
                : draftMap?.mapName === "de_nuke"
                  ? "This radar combines multiple floors. World positions are captured, but markers need manual placement on the correct floor."
                  : "One-time map calibration: save at least two accurate manual markers with world positions, separated across both map axes. Future lineups are placed automatically. Inconsistent references must be corrected."}</p>
            </div>
            <NadePlacementEditor map={draftMap} value={draft} calibration={calibration} onChange={updateDraft} />
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

function DeleteNadeButton({ nade, onDelete, disabled = false }) {
  const [open, setOpen] = useState(false);
  const name = nade.displayName || nade.name || "Untitled lineup";
  return <>
    <Button variant="secondary" size="sm" disabled={disabled} aria-label={`Delete ${name}`} onClick={() => setOpen(true)}><Trash2 data-icon="inline-start" />Delete</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete lineup?</DialogTitle><DialogDescription>Remove “{name}” from {nade.map}? The deletion takes effect on the server when you save your lineups.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={disabled} onClick={() => { onDelete(); setOpen(false); }}>Delete lineup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function ServerMapSettings({ settings, setSettings, status, busy }) {
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const maps = mapsForInventory(settings, status?.mapInventory);
  const workshops = workshopMapsFromSettings(settings);
  return <Card className="mt-5">
    <CardHeader><CardTitle>Maps auf dem Server</CardTitle><CardDescription>Lege die Startmap fest und verwalte installierte Workshop-Maps. Übernimm die Änderungen anschließend mit einem Serverneustart.</CardDescription></CardHeader>
    <CardContent>
      <FieldGroup>
        <Field htmlFor="server-start-map"><FieldLabel>Startmap</FieldLabel><Select value={settings.startMap || "__none__"} onValueChange={startMap => setSettings(current => ({ ...current, startMap }))}>
          <SelectTrigger id="server-start-map"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            {!settings.startMap && <SelectItem value="__none__" disabled>Map auswählen</SelectItem>}
            {settings.startMap && !maps.some(map => map.mapName === settings.startMap) && <SelectItem value={settings.startMap}>{settings.startMap}</SelectItem>}
            {maps.filter(map => map.mapName).map(map => <SelectItem key={map.key} value={map.mapName} disabled={map.available !== true}>{map.name}{map.available !== true ? " · Verfügbarkeit nicht bestätigt" : ""}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select></Field>
        <Field className="flex items-center justify-between"><span><FieldLabel>Workshop-Maps laden</FieldLabel><FieldDescription>Aktivierte Workshop-Maps werden beim Serverstart heruntergeladen und eingebunden.</FieldDescription></span><Switch aria-label="Workshop-Maps laden" checked={settings.workshopMapsEnabled === true} onCheckedChange={workshopMapsEnabled => setSettings(current => ({ ...current, workshopMapsEnabled }))} /></Field>
      </FieldGroup>
      <details className="disclosure-panel mt-5">
        <summary>Erweiterte Map-Einstellungen</summary>
        <FieldGroup className="p-4">
          <Field htmlFor="manual-start-map"><FieldLabel>Interner Name der Startmap</FieldLabel><Input id="manual-start-map" value={settings.startMap || ""} onChange={event => setSettings(current => ({ ...current, startMap: event.target.value }))} /><FieldDescription>Für Maps, die noch nicht im Serverbestand erscheinen.</FieldDescription></Field>
          <Field htmlFor="workshop-ids"><FieldLabel>Workshop-IDs oder Links</FieldLabel><Textarea id="workshop-ids" value={settings.workshopMaps || ""} onChange={event => setSettings(current => ({ ...current, workshopMaps: event.target.value }))} /></Field>
          <Field><FieldLabel>Downloads bei jedem Map-Wechsel prüfen</FieldLabel><Switch aria-label="Downloads bei jedem Map-Wechsel prüfen" checked={settings.workshopForceDownload === true} onCheckedChange={workshopForceDownload => setSettings(current => ({ ...current, workshopForceDownload }))} /></Field>
        </FieldGroup>
      </details>
      <div className="mt-5 flex flex-col gap-2">{workshops.map(map => <div key={map.key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-medium">{map.name}</p><p className="font-mono text-xs text-muted-foreground">{map.mapName || map.workshopId}</p></div><Button variant="secondary" size="icon" aria-label={`${map.name} entfernen`} disabled={busy} onClick={() => setSettings(current => ({ ...current, ...removeWorkshopMap(current, map.workshopId) }))}><Trash2 /></Button></div>)}</div>
    </CardContent>
    <CardFooter><Button variant="secondary" disabled={busy} onClick={() => setWorkshopOpen(true)}><PackagePlus data-icon="inline-start" />Workshop-Map hinzufügen</Button></CardFooter>
    <WorkshopMapDialog open={workshopOpen} onOpenChange={setWorkshopOpen} onAdd={input => setSettings(current => ({ ...current, ...addWorkshopMap(current, input), workshopMapsEnabled: true }))} />
  </Card>;
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

function Nades({ settings, setSettings, nades, setNades, status, busy, nadesDirty, onApply, onRefresh, onReload, onSave, viewNav }) {
  const [mapFilter, setMapFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingNade, setEditingNade] = useState<any>(null);
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
  const syncPresentation = nadesSyncPresentation(statusError ? { state: "error" } : liveStatus.sync);
  const matchZyModeActive = ["matchzy", "nades"].includes(settings.serverMode);
  const loadedLibraryVersion = status?.nadesLibrary?.updatedAt || null;
  const observedLibraryVersion = liveStatus.library?.updatedAt || null;
  const libraryChanged = Boolean(observedLibraryVersion && observedLibraryVersion !== loadedLibraryVersion);
  const filteredNades = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return nades.filter((nade) => {
      if (mapFilter && nade.map !== mapFilter) return false;
      if (typeFilter && nade.type !== typeFilter) return false;
      if (reviewFilter === "pending" && nade.reviewStatus !== "pending") return false;
      if (reviewFilter === "official" && !nade.official) return false;
      if (reviewFilter === "mustKnow" && !nade.mustKnow) return false;
      if (!normalizedQuery) return true;
      return `${nade.displayName || ""} ${nade.name} ${nade.desc}`.toLowerCase().includes(normalizedQuery);
    });
  }, [nades, mapFilter, typeFilter, query, reviewFilter]);
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
        title="Bibliothek verwalten"
        description="Prüfe Aufnahmen und verwalte den Import und Export deiner Lineups."
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
              Nades speichern
            </Button>
          </div>
        )}
      />
      {viewNav}
      <NadeDialog
        settings={settings}
        open={addOpen || Boolean(editingNade)}
        initialNade={editingNade}
        nades={nades}
        onOpenChange={open => { setAddOpen(open); if (!open) setEditingNade(null); }}
        onAdd={entry => setNades(current => editingNade ? current.map(nade => nade.id === editingNade.id ? entry : nade) : [...current, entry])}
      />
      {localError ? <Message error={localError} /> : null}
      <details className="disclosure-panel mb-4">
        <summary><ArrowLeftRight className="size-4" aria-hidden="true" /><span>Sharing &amp; synchronization</span><Badge variant={syncPresentation.variant}>{syncPresentation.label}</Badge><ChevronRight className="disclosure-chevron ml-auto size-4" aria-hidden="true" /></summary>
        <div className="p-3 sm:p-4">
          <NadesMenuStatus selectedMode={settings.serverMode || "matchzy"} />
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="grid gap-1.5">
                <CardTitle>Aufnahmen und Review</CardTitle>
                <CardDescription>Alle Aufnahmen sind für alle Spieler sichtbar. Der Ersteller bearbeitet seine ungeprüften Aufnahmen; Plattform-Admins vergeben Offiziell und Must Know.</CardDescription>
              </div>

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

              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Sync status</dt><dd><Badge variant={syncPresentation.variant}><span className="server-status-dot" />{syncPresentation.label}</Badge></dd></div>
                <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Last confirmed</dt><dd className="text-sm font-medium">{formatDate(liveStatus.sync?.lastConfirmedAt)}</dd></div>
                <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Last transfer</dt><dd className="text-sm font-medium">{syncDirectionLabel(liveStatus.sync?.lastDirection)}</dd></div>
                <div className="grid gap-1 rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Visibility</dt><dd className="flex flex-wrap gap-2"><Badge variant="success">{nades.length} für alle sichtbar</Badge></dd></div>
              </dl>

              {statusError || liveStatus.sync?.lastError ? <Alert variant="destructive"><AlertTitle>Nade sync cannot confirm the connection</AlertTitle><AlertDescription>{statusError || liveStatus.sync.lastError}</AlertDescription></Alert> : null}
              {!matchZyModeActive ? <Alert variant="warning"><AlertTitle>MatchZy is not the active server mode</AlertTitle><AlertDescription>The files can stay synchronized, but players cannot use MatchZy's nade commands until MatchZy or Nades mode is active.</AlertDescription></Alert> : null}


            </CardContent>
          </Card>
        </div>
      </details>
      {libraryChanged ? <Alert className="mb-4" variant="warning"><AlertTitle>The shared library changed</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>New lineups are available from MatchZy.</span><Button variant="secondary" disabled={busy} onClick={onRefresh}>{nadesDirty ? "Discard edits & load latest" : "Load latest"}</Button></AlertDescription></Alert> : null}
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
          <FieldGroup className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3 md:grid-cols-[1fr_180px_180px_180px]">
            <Field>
              <FieldLabel className="sr-only">Search lineups</FieldLabel>
              <Input value={query} placeholder="Search name or description" onChange={(event) => setQuery(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel className="sr-only">Map</FieldLabel>
              <Select value={mapFilter || "__all__"} onValueChange={(value) => setMapFilter(value === "__all__" ? "" : value)}>
                <SelectTrigger aria-label="Filter by map"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All maps</SelectItem>{maps.map((map) => <SelectItem key={map} value={map}>{map}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel className="sr-only">Nade type</FieldLabel>
              <Select value={typeFilter || "__all__"} onValueChange={(value) => setTypeFilter(value === "__all__" ? "" : value)}>
                <SelectTrigger aria-label="Filter by nade type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All types</SelectItem>{nadeTypes.filter(Boolean).map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field><FieldLabel className="sr-only">Review-Status</FieldLabel><Select value={reviewFilter} onValueChange={setReviewFilter}><SelectTrigger aria-label="Review-Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Aufnahmen</SelectItem><SelectItem value="pending">Review angefragt</SelectItem><SelectItem value="official">Offiziell</SelectItem><SelectItem value="mustKnow">Must Know</SelectItem></SelectContent></Select></Field>
          </FieldGroup>
          {nades.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No nades configured. Add the first lineup to this library.</div> : null}
          {nades.length > 0 && filteredNades.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No lineups match the current filters.</div> : null}
          {groupedNades.map(([map, mapNades]) => (
            <section key={map} className="grid gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{map} <Badge>{mapNades.length}</Badge></h3>
              <div className="lineup-editor-grid">
                {mapNades.map((nade) => (
                  <div key={nade.id} className="lineup-editor-card">
                    <div className="lineup-editor-header">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{nade.displayName || nade.name || "Untitled lineup"}</p>
                        <p className="font-mono text-xs text-muted-foreground">{nade.map || "No map"}</p>
                      </div>
                      <Badge variant={String(nade.owner || "default") === "default" ? "success" : "warning"} title={`Ersteller: ${nade.owner}`}>
                        {nade.official ? "Offiziell" : nade.reviewStatus === "pending" ? "Review" : "Aufnahme"}
                      </Badge>
                    </div>
                    <div className="lineup-editor-fields">
                      <Field><FieldLabel>Display name</FieldLabel><Input id={`display-${nade.id}`} maxLength={120} value={nade.displayName || ""} placeholder={nade.name} onChange={(event) => updateNade(nade.id, { displayName: event.target.value })} /><FieldDescription>Technical name: <code>{nade.name}</code></FieldDescription></Field>
                      <Field><FieldLabel>Map</FieldLabel><Input value={nade.map || ""} onChange={(event) => updateNade(nade.id, { map: event.target.value })} /></Field>
                      <Field><FieldLabel>Type</FieldLabel><Select value={nade.type || "__none__"} onValueChange={(value) => updateNade(nade.id, { type: value === "__none__" ? "" : value })}>
                        <SelectTrigger aria-label={`Type for ${nade.name || "lineup"}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{nadeTypes.map((type) => <SelectItem key={type || "empty"} value={type || "__none__"}>{type || "No type"}</SelectItem>)}</SelectContent>
                      </Select></Field>
                      <Field><FieldLabel>Description</FieldLabel><Input value={nade.desc || ""} onChange={(event) => updateNade(nade.id, { desc: event.target.value })} /></Field>
                      <NadeReviewFields nade={nade} onChange={(patch) => updateNade(nade.id, patch)} />
                      <Field><FieldLabel>Lineup position</FieldLabel><Input value={nade.lineupPos || ""} onChange={(event) => updateNade(nade.id, { lineupPos: event.target.value })} /></Field>
                      <Field><FieldLabel>Lineup angle</FieldLabel><Input value={nade.lineupAng || ""} onChange={(event) => updateNade(nade.id, { lineupAng: event.target.value })} /></Field>
                    </div>
                    <div className="lineup-editor-footer">
                      {(nade.lineupImages || []).length > 0 ? (
                        <a className="lineup-editor-image" href={nade.lineupImages[0].url} target="_blank" rel="noreferrer" title={`${nade.lineupImages.length} image(s)`}>
                          <img src={nade.lineupImages[0].url} alt={nade.lineupImages[0].name || "Lineup"} />
                          <span>{nade.lineupImages.length} image{nade.lineupImages.length === 1 ? "" : "s"}</span>
                        </a>
                      ) : <span className="text-xs text-muted-foreground">No image attached</span>}
                      <Button variant="secondary" size="sm" onClick={() => setEditingNade(nade)}><MapPinned data-icon="inline-start" />Wurfweg & Bilder</Button>
                      <DeleteNadeButton nade={nade} disabled={busy} onDelete={() => setNades((current) => current.filter((item) => item.id !== nade.id))} />
                    </div>
                  </div>
                ))}
              </div>
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
            <Select value={String(tail)} onValueChange={(value) => setTail(Number(value))}>
              <SelectTrigger className="w-28" aria-label="Number of log lines"><SelectValue /></SelectTrigger>
              <SelectContent>{[100, 300, 800, 1500].map((count) => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectContent>
            </Select>
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
  const location = useLocation();
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [admins, setAdmins] = useState([]);
  const [nades, setNades] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [status, setStatus] = useState(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [savedNadesSignature, setSavedNadesSignature] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(null);

  async function loadAll({ preserveSettings = false, preserveNades = false } = {}) {
    const control = await api("/api/control");
    setAuthenticated(true);
    setUser(control.user);
    if (!preserveSettings) setSettings(control.settings || {});
    setAdmins(control.admins || []);
    if (!preserveNades) setNades(control.nades || []);
    setPolicy(control.policy || null);
    setStatus(control.status || null);
    if (!preserveSettings) setSavedSignature(JSON.stringify({ settings: control.settings || {} }));
    if (!preserveNades) setSavedNadesSignature(JSON.stringify(control.nades || []));
  }

  async function runAction(action, operationKind = null, scope = "server") {
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
      await loadAll({ preserveSettings: scope === "library" && dirty, preserveNades: scope === "server" && nadesDirty });
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

  const activeTab = tabs.find((item) => item.path === location.pathname.replace(/\/+$/, "")) || tabs[1];
  const libraryMaps = useMemo(() => mapsForLibrary(settings, status?.mapInventory, nades), [settings, status?.mapInventory, nades]);
  const mapRoute = matchPath("/maps/:mapSlug/*", location.pathname);
  const lineupRoute = matchPath("/maps/:mapSlug/lineups/:lineupId", location.pathname);
  const selectedMap = libraryMaps.find(map => mapSlug(map) === mapRoute?.params.mapSlug);
  const selectedNade = findLineup(nades, lineupRoute?.params.lineupId);

  useEffect(() => {
    document.title = authenticated === false
      ? "Anmelden | MatchZy"
      : `${selectedNade?.displayName || selectedNade?.name || selectedMap?.name || activeTab.label} | MatchZy`;
  }, [activeTab.label, authenticated, selectedMap?.name, selectedNade]);

  useEffect(() => {
    setMessage("");
    setError("");
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const dirty = savedSignature !== "" && savedSignature !== JSON.stringify({ settings });
  const nadesDirty = savedNadesSignature !== "" && savedNadesSignature !== JSON.stringify(nades);

  function refreshLibrary() {
    return runAction(async () => ({ message: "Nades aktualisiert." }), null, "library");
  }

  function saveNades() {
    return runAction(async () => {
      const result = await api("/api/nades", { method: "PUT", body: JSON.stringify({ entries: nades }) });
      setNades(result.entries);
      return { message: "Nades gespeichert." };
    }, null, "library");
  }

  function applyControl() {
    return runAction(() => api("/api/control/apply", { method: "POST", body: JSON.stringify({ settings }) }), "apply");
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

  if (authenticated === null) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Playbook wird geladen">
        <Spinner className="size-6" />
      </main>
    );
  }

  if (!authenticated) {
    if (location.pathname !== routePaths.login) {
      const requestedRoute = (isMapRoute(location.pathname) || tabs.some((item) => item.path === location.pathname)) ? `${location.pathname}${location.search}` : defaultRoute;
      return <Navigate to={`${routePaths.login}?redirect=${encodeURIComponent(requestedRoute)}`} replace />;
    }

    return <Login error={error} />;
  }

  const roleHome = defaultRoute;
  if (location.pathname !== "/" && location.pathname !== routePaths.login && !isMapRoute(location.pathname) && !allowedTabs(user.role).some(tab => tab.path === location.pathname))
    return <Navigate to={roleHome} replace />;


  return (
    <Shell
      user={user}
      tab={activeTab.id}
      selectedMap={selectedMap}
      selectedNade={selectedNade}
      onNavigate={() => {
        setMessage("");
        setError("");
      }}
      message={message}
      error={error}
      dirty={dirty}
      busy={busy}
      operation={operation}
      serviceState={status?.service?.state}
      onSave={() => runAction(async () => {
        await api("/api/control", { method: "PUT", body: JSON.stringify({ settings }) });
        return { message: "Serverentwurf gespeichert. Du kannst ihn in der Serververwaltung übernehmen." };
      })}
      onApply={applyControl}
      onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
        navigate(routePaths.login, { replace: true });
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to={roleHome} replace />} />
        <Route
          path={routePaths.overview}
          element={(
            user.role === "match_admin" ? <><PageHeader eyebrow="Match Admin" title="Serversteuerung" description="Modus wechseln, Plugins steuern und Workshop-Maps hinzufügen." /><ServerControls settings={settings} setSettings={setSettings} policy={policy} busy={busy} running onApply={applyControl} /><div className="my-5"><Button variant="secondary" onClick={() => setWorkshopOpen(true)}><PackagePlus data-icon="inline-start" />Workshop-Map hinzufügen</Button></div><Field className="mb-5"><FieldLabel>Colored Smokes</FieldLabel><Switch checked={settings.matchZySmokeColor === true} onCheckedChange={value => setSettings(current => ({ ...current, matchZySmokeColor: value }))} /></Field></> : <Overview
              settings={settings}
              setSettings={setSettings}
              onApply={applyControl}
              admins={admins}
              nades={nades}
              status={status}
              policy={policy}
              busy={busy}
              onRefresh={() => runAction(async () => {
                return { message: "Serverstatus aktualisiert." };
              })}
              onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "restart")}
            />
          )}
        />
        <Route
          path={routePaths.diagnostics}
          element={(
            <>
              <PageHeader eyebrow="Health trace" title="Diagnostics" description="Follow the container, installer, framework and selected game mode through one load path." />
              <Diagnostics active onOpenLogs={() => navigate(routePaths.logs)} />
            </>
          )}
        />
        <Route path={routePaths.server} element={<>
          <Settings settings={settings} setSettings={setSettings} policy={policy} />
          <ServerMapSettings settings={settings} setSettings={setSettings} status={status} busy={busy} />
        </>} />
        <Route path={routePaths.plugins} element={<><Plugins settings={settings} setSettings={setSettings} policy={policy} showDiagnostics={user.role === "admin"} /></>} />
        <Route
          path={routePaths.access}
          element={<UserManagement currentSteamId={user.identitySteam64} />}
        />
        <Route
          path={routePaths.maintenance}
          element={<Maintenance settings={settings} setSettings={setSettings} status={status} busy={busy} onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "restart")} />}
        />
        <Route path={routePaths.maps} element={new URLSearchParams(location.search).has("map") || new URLSearchParams(location.search).get("view") === "library"
          ? <LegacyLibraryRedirect maps={libraryMaps} />
          : <MapAtlas nades={nades} maps={libraryMaps} />} />
        <Route path="/maps/:mapSlug" element={<NadeLibrary nades={nades} maps={libraryMaps} role={user.role} onRefresh={refreshLibrary} busy={busy} nadesDirty={nadesDirty} renderGuide={map => <AnnotationGuide map={map} />} />} />
        <Route path="/maps/:mapSlug/lineups/:lineupId" element={<LineupPage maps={libraryMaps} nades={nades} />} />
        <Route path={routePaths.nades} element={user.role === "admin" && new URLSearchParams(location.search).get("view") === "manage"
          ? <Nades settings={settings} setSettings={setSettings} nades={nades} setNades={setNades} status={status} busy={busy} nadesDirty={nadesDirty} onApply={applyControl} onRefresh={refreshLibrary} onReload={() => loadAll({ preserveSettings: true })} onSave={saveNades} viewNav={<Button className="mb-5" variant="secondary" asChild><NavLink to={routePaths.maps}>Zurück zu den Maps</NavLink></Button>} />
          : <LegacyLibraryRedirect maps={libraryMaps} />} />
        <Route path={routePaths.console} element={<RconChat />} />
        <Route path={routePaths.logs} element={<DockerLogs active />} />
        <Route path={routePaths.links} element={<Links />} />
        <Route path={routePaths.login} element={<Navigate to={routeFromLoginSearch(location.search)} replace />} />
        <Route path="*" element={<Navigate to={roleHome} replace />} />
      </Routes>
      <WorkshopMapDialog open={workshopOpen} onOpenChange={setWorkshopOpen} onAdd={input => { const patch = addWorkshopMap(settings, input); setSettings(current => ({ ...current, ...patch, workshopMapsEnabled: true })); }} />
      <OperationDialog operation={operation} />
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
