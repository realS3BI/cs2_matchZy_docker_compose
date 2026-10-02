import { NadesMenuStatus } from "./components/nades-menu-status";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "./components/ui/breadcrumb";
import { UserManagement } from "./components/user-management";
import { RconChat } from "./components/rcon-chat";
import { MapAtlas } from "./components/map-atlas";
import { LineupPage, NewLineupPage } from "./components/lineup-page";
import { NadeFavoritesProvider } from "./components/nade-favorites";
import { findLineup } from "./lib/lineups";
import { mapPath, mapSlug, mapsForLibrary } from "./lib/maps";
import { NadeLibrary, LegacyLibraryRedirect } from "./components/nade-library";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BookOpen,
  Boxes,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Crosshair,
  ExternalLink,
  LayoutDashboard,
  MapPinned,
  PackagePlus,
  Pause,
  Play,
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
import type { ServerOperation } from "./lib/server-status";
import { cn } from "./lib/utils";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ActionButton } from "./components/action-button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "./components/ui/switch";
import {
  mapsForInventory,
  addWorkshopMap,
  removeWorkshopMap,
  workshopMapsFromSettings
} from "./lib/maps";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";
import { Diagnostics } from "./diagnostics";
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

function Message({ error = "" }: { error?: string }) {
  return error ? <p role="alert" className="text-sm whitespace-pre-wrap text-destructive">{error}</p> : null;
}

function Login() {
  const failed = new URLSearchParams(window.location.search).has("error");
  return <main className="login-shell login-grid grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-lg"><CardHeader><div className="mb-4 flex items-center gap-3"><span className="control-brand-mark"><Crosshair /></span><span className="font-mono text-sm">PLAYBOOK</span></div><CardTitle className="control-title text-3xl">Deine Maps. Deine Nades.</CardTitle><CardDescription>Entdecke Lineups, lerne Wurfwege und bereite deine nächste Runde vor. Melde dich mit Steam an.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><Message error={failed ? "Steam-Anmeldung abgebrochen oder abgelaufen. Bitte erneut anmelden." : ""} /><Button asChild><a href="/api/auth/steam">Mit Steam anmelden</a></Button><p className="text-sm text-muted-foreground">Neue Spieler erhalten die Rolle Player. Dein Steam-Passwort gibst du ausschließlich bei Steam ein.</p></CardContent></Card>
  </main>;
}

function TestLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await api("/api/auth/test", { method: "POST", body: JSON.stringify({ username, password }) });
      window.location.replace("/maps");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anmeldung fehlgeschlagen.");
      setPending(false);
    }
  }

  return <main className="login-shell login-grid grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="mb-4 flex items-center gap-3"><span className="control-brand-mark"><Crosshair /></span><span className="font-mono text-sm">PLAYBOOK</span></div>
        <CardTitle>Als Spieler testen</CardTitle>
        <CardDescription>Melde dich mit dem Testkonto an, um Maps und Lineups mit der Rolle Spieler zu nutzen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field htmlFor="test-username">
              <FieldLabel>Benutzername</FieldLabel>
              <Input id="test-username" name="username" autoComplete="username" required maxLength={100} value={username} onChange={event => setUsername(event.target.value)} disabled={pending} />
            </Field>
            <Field htmlFor="test-password">
              <FieldLabel>Passwort</FieldLabel>
              <Input id="test-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
            </Field>
            <Message error={error} />
            <Button type="submit" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{pending ? "Anmeldung läuft …" : "Als Spieler anmelden"}</Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter><Button asChild variant="ghost"><NavLink to="/login">Zur Steam-Anmeldung</NavLink></Button></CardFooter>
    </Card>
  </main>;
}

function Shell({ user, children, tab, onLogout, dirty, busy, onSave, onApply, operation, status, statusUnavailable, selectedMap, selectedNade }) {
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];
  const currentPage = selectedNade?.displayName || selectedNade?.name || selectedMap?.name || (tab === "maps" ? "Alle Maps" : activeTab.label);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <a className="skip-link" href="#main-content">Zum Inhalt</a>
        <AppSidebar user={user} serverItems={allowedTabs(user.role).filter(item => item.group === "Server")} onNavigate={() => {}} onLogout={onLogout} dirty={dirty} status={status} operation={operation} unavailable={statusUnavailable} />
        <SidebarInset className="workspace-inset min-w-0">
          <header className="control-topbar sticky top-0 z-30">
            <div className="topbar-inner">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4 data-vertical:self-center" />
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
          <NadeFavoritesProvider key={user.identitySteam64}>{children}</NadeFavoritesProvider>
          {user.role !== "player" && ["overview", "server", "plugins", "maintenance"].includes(tab) && <section className="server-save-panel" aria-label="Servereinstellungen speichern">
            <div><h2>Servereinstellungen übernehmen</h2><p>{dirty ? "Du hast ungespeicherte Änderungen." : "Der aktuelle Entwurf ist gespeichert."} Ein Neustart trennt verbundene Spieler.</p></div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={onSave} disabled={!dirty || busy} icon={Save} pendingLabel="Wird gespeichert …" successLabel="Gespeichert">Entwurf speichern</ActionButton>
              <ActionButton onClick={onApply} disabled={busy} icon={RotateCcw} pendingLabel="Wird übernommen …" successLabel="Übernommen">Übernehmen & neu starten</ActionButton>
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
        actions={<div className="flex gap-2"><ActionButton variant="secondary" onClick={onRefresh} disabled={busy} icon={RefreshCw} pendingLabel="Wird aktualisiert …" successLabel="Aktualisiert">Aktualisieren</ActionButton><Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Restart now</Button></div>}
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
              <p className="text-2xl font-semibold tracking-tight">{maintenance?.enabled ? "Alle 2 Stunden" : "Deaktiviert"}</p>
              <p className="text-xs text-muted-foreground">Bei Spielern: neuer Versuch in 1 Stunde</p>
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
          <DialogFooter><Button variant="secondary" onClick={() => setRestartOpen(false)}>Cancel</Button><ActionButton variant="destructive" onClick={async () => { await onRestart(); setRestartOpen(false); }} disabled={busy} icon={RotateCcw} pendingLabel="Server startet neu …" successLabel="Neu gestartet">Server neu starten</ActionButton></DialogFooter>
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
        {(policy?.settingsGroups || []).filter((group) => group.id !== "workshop" && (group.id !== "matchzy" || settings.serverMode === "matchzy")).map((group) => (
          <Card key={group.id}>
            <CardHeader><CardTitle>{group.title}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.filter((field) => !["matchZySaveNadesGlobally", "startMap"].includes(field.key) && (field.key !== "matchZyVersion" || settings.serverMode === "matchzy")).map((field) => <SettingField key={field.key} field={field} value={settings[field.key] ?? ""} onChange={(value) => setValue(field.key, value)} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function SettingField({ field, value, onChange }) {
  if (field.type === "boolean") {
    const isVac = field.key === "vacEnabled";
    return (
      <Field htmlFor={`setting-${field.key}`} className={cn("flex min-h-16 grid-cols-[1fr_auto] items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3", isVac && "justify-between md:col-span-2 xl:col-span-3")}>
        <span className="min-w-0"><FieldLabel>{field.label}</FieldLabel>
          {isVac ? <FieldDescription id={`setting-${field.key}-description`} className="mt-1 block" aria-live="polite">
            {value === true ? "VAC aktiviert · Zugang mit -insecure nicht möglich." : "VAC deaktiviert · Zugang mit und ohne -insecure möglich. Automatische Playbook-Reviews sind möglich."}
            {value !== true && <span className="mt-1 block">Auf diesem Server besteht kein VAC-Schutz. Das ändert nicht die VAC-Einstellung deines lokal gestarteten Spiels.</span>}
          </FieldDescription> : field.description ? <FieldDescription id={`setting-${field.key}-description`} className="mt-1 block">{field.description}</FieldDescription> : null}
        </span>
        <Switch id={`setting-${field.key}`} aria-label={field.label} aria-describedby={isVac || field.description ? `setting-${field.key}-description` : undefined} checked={value === true} onCheckedChange={onChange} />
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
      <PageHeader eyebrow="Serverbetrieb" title="Wartung" description="Automatischer Neustart alle zwei Stunden, sobald keine Spieler verbunden sind." />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>Automatischer Serverneustart</CardTitle><CardDescription>Nach einem automatischen Neustart wartet das Panel zwei Stunden. Sind noch Spieler verbunden, versucht es den Neustart eine Stunde später erneut.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <Field className="flex grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 p-4"><span><FieldLabel>Automatischer Neustart</FieldLabel><FieldDescription className="mt-1 block">Nur bei leerem Server. Bots zählen nicht als Spieler.</FieldDescription></span><Switch aria-label="Automatischer Neustart" checked={enabled} onCheckedChange={(next) => setSettings((current) => ({ ...current, automaticRestartEnabled: next }))} /></Field>
            <Alert><AlertTitle>Spielerprüfung vor jedem Neustart</AlertTitle><AlertDescription>Kann die Spielerzahl nicht geprüft werden, wartet das Panel ebenfalls eine Stunde. Der nächste Versuch bleibt auch nach einem Panel-Neustart gespeichert.</AlertDescription></Alert>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Zeitplan</CardTitle><CardDescription>Aktueller Stand des automatischen Neustarts.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-4"><span className="text-muted-foreground">Nächster Versuch</span><p className="mt-1 font-semibold">{formatDate(status?.maintenance?.nextRunAt)}</p></div>
            <div className="rounded-lg border border-border bg-muted/30 p-4"><span className="text-muted-foreground">Letzter Versuch</span><p className="mt-1 font-semibold">{formatDate(status?.maintenance?.lastRun?.lastRunAt)}</p></div>
            {status?.maintenance?.lastRun?.lastMessage && <p className="text-muted-foreground">{status.maintenance.lastRun.lastMessage}</p>}
            <Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Jetzt neu starten</Button>
          </CardContent>
        </Card>
      </div>
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}><DialogContent><DialogHeader><DialogTitle>Restart the CS2 server now?</DialogTitle><DialogDescription>Connected players will be disconnected. This does not apply unsaved draft changes.</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRestartOpen(false)}>Cancel</Button><ActionButton variant="destructive" onClick={async () => { await onRestart(); setRestartOpen(false); }} disabled={busy} icon={RotateCcw} pendingLabel="Server startet neu …" successLabel="Neu gestartet">Server neu starten</ActionButton></DialogFooter></DialogContent></Dialog>
    </>
  );
}

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
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [operation, setOperation] = useState<ServerOperation>(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll({ preserveSettings = false } = {}) {
    const control = await api("/api/control");
    setAuthenticated(true);
    setUser(control.user);
    if (!preserveSettings) setSettings(control.settings || {});
    setAdmins(control.admins || []);
    setNades(control.nades || []);
    setPolicy(control.policy || null);
    setStatus(control.status || null);
    setStatusUnavailable(false);
    if (!preserveSettings) setSavedSignature(JSON.stringify({ settings: control.settings || {} }));
  }

  async function runAction(action, scope = "server", kind?: "apply" | "restart") {
    setBusy(true);
    if (kind) setOperation({ kind, phase: "requesting" });
    try {
      await action();
      if (kind) setOperation({ kind, phase: "refreshing" });
      await loadAll({ preserveSettings: scope === "library" && dirty });
    } finally {
      if (kind) setOperation(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated || user?.role !== "admin" || busy) return;
    let cancelled = false;
    let timer: number;
    const controller = new AbortController();
    async function refreshStatus() {
      try {
        const next = await api("/api/server/status", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        if (!next?.service || typeof next.service.state !== "string") throw new Error("Unvollständiger Serverstatus");
        if (!cancelled) {
          setStatus(current => ({ ...current, ...next }));
          setStatusUnavailable(false);
        }
      } catch {
        if (!cancelled) setStatusUnavailable(true);
      } finally {
        if (!cancelled) timer = window.setTimeout(refreshStatus, 15000);
      }
    }
    void refreshStatus();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [authenticated, user?.role, busy]);

  const activeTab = tabs.find((item) => item.path === location.pathname.replace(/\/+$/, "")) || tabs[1];
  const libraryMaps = useMemo(() => mapsForLibrary(settings, status?.mapInventory, nades), [settings, status?.mapInventory, nades]);
  const mapRoute = matchPath("/maps/:mapSlug/*", location.pathname);
  const lineupRoute = matchPath("/maps/:mapSlug/lineups/:lineupId", location.pathname);
  const selectedMap = libraryMaps.find(map => mapSlug(map) === mapRoute?.params.mapSlug);
  const selectedNade = findLineup(nades, lineupRoute?.params.lineupId);

  useEffect(() => {
    document.title = authenticated === false
      ? "Anmelden | Playbook"
      : `${selectedNade?.displayName || selectedNade?.name || selectedMap?.name || activeTab.label} | Playbook`;
  }, [activeTab.label, authenticated, selectedMap?.name, selectedNade]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const dirty = savedSignature !== "" && savedSignature !== JSON.stringify({ settings });

  function refreshLibrary() {
    return runAction(async () => {}, "library");
  }

  function applyControl() {
    return runAction(() => api("/api/control/apply", { method: "POST", body: JSON.stringify({ settings }) }), "server", "apply");
  }

  useEffect(() => {
    function warnBeforeLeave(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  if (authenticated === null) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Playbook wird geladen">
        <Spinner className="size-6" />
      </main>
    );
  }

  if (location.pathname === "/login/test") return <TestLogin />;

  if (!authenticated) {
    if (location.pathname !== routePaths.login) {
      const requestedRoute = (isMapRoute(location.pathname) || tabs.some((item) => item.path === location.pathname)) ? `${location.pathname}${location.search}` : defaultRoute;
      return <Navigate to={`${routePaths.login}?redirect=${encodeURIComponent(requestedRoute)}`} replace />;
    }

    return <Login />;
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
      dirty={dirty}
      busy={busy}
      operation={operation}
      status={status}
      statusUnavailable={statusUnavailable}
      onSave={() => runAction(async () => {
        await api("/api/control", { method: "PUT", body: JSON.stringify({ settings }) });
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
            user.role === "match_admin" ? <><PageHeader eyebrow="Match Admin" title="Serversteuerung" description="Modus wechseln, Plugins steuern und Workshop-Maps hinzufügen." /><ServerControls settings={settings} setSettings={setSettings} policy={policy} busy={busy} running onApply={applyControl} /><div className="my-5"><Button variant="secondary" onClick={() => setWorkshopOpen(true)}><PackagePlus data-icon="inline-start" />Workshop-Map hinzufügen</Button></div>{settings.serverMode === "matchzy" && <Field className="mb-5"><FieldLabel>Colored Smokes</FieldLabel><Switch checked={settings.matchZySmokeColor === true} onCheckedChange={value => setSettings(current => ({ ...current, matchZySmokeColor: value }))} /></Field>}</> : <Overview
              settings={settings}
              setSettings={setSettings}
              onApply={applyControl}
              admins={admins}
              nades={nades}
              status={status}
              policy={policy}
              busy={busy}
              onRefresh={() => runAction(async () => {})}
              onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "server", "restart")}
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
          element={<Maintenance settings={settings} setSettings={setSettings} status={status} busy={busy} onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }), "server", "restart")} />}
        />
        <Route path={routePaths.maps} element={new URLSearchParams(location.search).has("map") || new URLSearchParams(location.search).get("view") === "library"
          ? <LegacyLibraryRedirect maps={libraryMaps} />
          : <MapAtlas maps={libraryMaps} />} />
        <Route path="/maps/:mapSlug" element={<NadeLibrary nades={nades} maps={libraryMaps} user={user} />} />
        <Route path="/maps/:mapSlug/lineups/new" element={<NewLineupPage maps={libraryMaps} nades={nades} user={user} onEntriesChange={setNades} onRefresh={refreshLibrary} />} />
        <Route path="/maps/:mapSlug/lineups/:lineupId" element={<LineupPage maps={libraryMaps} nades={nades} user={user} onEntriesChange={setNades} onRefresh={refreshLibrary} />} />
        <Route path={routePaths.nades} element={<LegacyLibraryRedirect maps={libraryMaps} />} />
        <Route path={routePaths.console} element={<RconChat />} />
        <Route path={routePaths.logs} element={<DockerLogs active />} />
        <Route path={routePaths.links} element={<Links />} />
        <Route path={routePaths.login} element={<Navigate to={routeFromLoginSearch(location.search)} replace />} />
        <Route path="*" element={<Navigate to={roleHome} replace />} />
      </Routes>
      <WorkshopMapDialog open={workshopOpen} onOpenChange={setWorkshopOpen} onAdd={input => { const patch = addWorkshopMap(settings, input); setSettings(current => ({ ...current, ...patch, workshopMapsEnabled: true })); }} />
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
