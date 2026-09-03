import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Boxes,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Crosshair,
  Download,
  FileInput,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPinned,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "./components/ui/switch";
import { parseSetposSetang } from "./lib/nades";
import { UploadButton } from "./lib/uploadthing";
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

function Shell({ children, tab, setTab, message, error, onLogout, dirty, busy, onSave, onApply, serviceState }) {
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
                <UploadCloud data-icon="inline-start" />
                Apply & restart
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

function Overview({ env, admins, nades, status, policy, onRefresh, onRestart, busy }) {
  const service = status?.service;
  const last = status?.lastAction;
  const maintenance = status?.maintenance;
  const [restartOpen, setRestartOpen] = useState(false);
  const activeMode = (policy?.modes || []).find((mode) => mode.id === env.SERVER_MODE) || policy?.mode;
  const enabledPlugins = (policy?.plugins || []).filter((plugin) => plugin.locked || (plugin.envKey ? env[plugin.envKey] === "1" : plugin.enabled)).length;
  const metrics = [
    { label: "Player slots", value: env.CS2_MAXPLAYERS || "Not set", detail: "Configured capacity", icon: UsersRound },
    { label: "Plugins", value: enabledPlugins, detail: "Enabled components", icon: Boxes },
    { label: "Server access", value: admins.length, detail: admins.length === 1 ? "Authorized person" : "Authorized people", icon: Shield },
    { label: "Nade library", value: nades.length, detail: nades.length === 1 ? "Saved lineup" : "Saved lineups", icon: Crosshair }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Live operations"
        title={env.CS2_SERVERNAME || "CS2 server"}
        description="The server's current lifecycle, selected game mode and next maintenance window."
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={onRefresh} disabled={busy}><RefreshCw data-icon="inline-start" className={cn(busy && "animate-spin")} /> Refresh</Button><Button variant="destructive" onClick={() => setRestartOpen(true)} disabled={busy}><RotateCcw data-icon="inline-start" /> Restart now</Button></div>}
      />
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
            <Badge variant={service?.state === "running" ? "success" : "destructive"}>
              <span className="server-status-dot" />
              {service?.state || "unknown"}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-6">
            <dl className="grid gap-4 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-3">
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Game mode</dt><dd className="text-sm font-medium">{activeMode?.name || env.SERVER_MODE || "Not set"}</dd></div>
              <div className="grid gap-1"><dt className="text-xs text-muted-foreground">Start map</dt><dd className="flex items-center gap-2 font-mono text-xs"><MapPinned className="size-4 text-muted-foreground" aria-hidden="true" />{env.CS2_STARTMAP || "Not set"}</dd></div>
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
              <p className="text-xs text-muted-foreground">{maintenance?.timezone || env.AUTO_RESTART_TIMEZONE}</p>
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

function Settings({ env, setEnv, policy }) {
  function setValue(key, value) {
    setEnv((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Server settings" description="Edit the supported runtime settings used by the Coolify deployment." />
      <div className="grid gap-4">
        {(policy?.settingsGroups || []).filter((group) => group.id !== "matchzy" || env.SERVER_MODE === "matchzy").map((group) => (
          <Card key={group.id}>
            <CardHeader><CardTitle>{group.title}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.map((field) => <SettingField key={field.key} field={field} value={env[field.key] ?? ""} onChange={(value) => setValue(field.key, value)} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function SettingField({ field, value, onChange }) {
  if (field.type === "boolean") {
    const checked = ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
    return (
      <Field className="flex min-h-16 grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span><FieldLabel>{field.label}</FieldLabel>{field.description ? <FieldDescription className="mt-1 block">{field.description}</FieldDescription> : null}</span>
        <Switch checked={checked} onCheckedChange={(next) => onChange(next ? "1" : "0")} />
      </Field>
    );
  }
  const Control = field.type === "textarea" ? Textarea : Input;
  return (
    <Field className={field.type === "textarea" ? "md:col-span-2 xl:col-span-3" : ""}>
      <FieldLabel>{field.label}</FieldLabel>
      <Control placeholder={field.placeholder} type={field.type === "password" ? "password" : field.type} value={value} onChange={(event) => onChange(event.target.value)} />
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function Plugins({ env, setEnv, policy }) {
  const mode = env.SERVER_MODE || "matchzy";
  return (
    <>
      <PageHeader eyebrow="Compatibility policy" title="Game modes & plugins" description="Choose one game mode and control the optional components installed with it." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Server mode</CardTitle><CardDescription>MatchZy and Executes solve different game flows and cannot run together.</CardDescription></CardHeader>
        <CardContent>
          <RadioGroup
            className="lg:grid-cols-3"
            value={mode}
            onValueChange={(nextMode) => setEnv((current) => ({ ...current, SERVER_MODE: nextMode, MATCHZY_ENABLED: nextMode === "matchzy" ? "1" : "0", EXECUTES_ENABLED: nextMode === "executes" ? "1" : "0" }))}
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
          {(policy?.plugins || []).filter((plugin) => !["matchzy", "executes"].includes(plugin.id)).map((plugin) => {
            const enabled = plugin.locked || env[plugin.envKey] === "1";
            return (
              <div key={plugin.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto] md:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{plugin.name}</h3>{plugin.locked ? <Badge variant="outline">core</Badge> : null}{enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="outline">off</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{plugin.detail}</p><p className="mt-2 text-xs text-muted-foreground">Requires: {plugin.dependencies.length ? plugin.dependencies.join(" · ") : "none"}</p>{plugin.warning && enabled ? <Alert className="mt-3" variant="warning"><AlertDescription>{plugin.warning}</AlertDescription></Alert> : null}</div>
                {plugin.locked ? <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required</span> : <Switch aria-label={`Enable ${plugin.name}`} checked={enabled} onCheckedChange={(next) => setEnv((current) => ({ ...current, [plugin.envKey]: next ? "1" : "0" }))} />}
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
      <Alert className="mb-4"><AlertTitle>Single source of truth</AlertTitle><AlertDescription>MatchZy's legacy admins.json stays empty. Roles below generate CounterStrikeSharp permissions only.</AlertDescription></Alert>
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

function Maintenance({ env, setEnv, status, onRestart, busy }) {
  const enabled = env.AUTO_RESTART_ENABLED === "1";
  const [restartOpen, setRestartOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Uptime policy" title="Maintenance" description="Schedule a daily process restart without redeploying the Coolify resource." />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>Daily server recycle</CardTitle><CardDescription>The panel claims one restart slot in MongoDB, so duplicate panel instances cannot restart the server twice.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <Field className="flex grid-cols-[1fr_auto] items-center rounded-lg border border-border bg-muted/30 p-4"><span><FieldLabel>Automatic restart</FieldLabel><FieldDescription className="mt-1 block">Disconnects active players at the chosen local time.</FieldDescription></span><Switch checked={enabled} onCheckedChange={(next) => setEnv((current) => ({ ...current, AUTO_RESTART_ENABLED: next ? "1" : "0" }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>Local time</FieldLabel><Input type="time" value={env.AUTO_RESTART_TIME || "05:00"} disabled={!enabled} onChange={(event) => setEnv((current) => ({ ...current, AUTO_RESTART_TIME: event.target.value }))} /></Field>
              <Field><FieldLabel>IANA timezone</FieldLabel><Input value={env.AUTO_RESTART_TIMEZONE || "Europe/Vienna"} disabled={!enabled} onChange={(event) => setEnv((current) => ({ ...current, AUTO_RESTART_TIMEZONE: event.target.value }))} /><FieldDescription>Example: Europe/Vienna; daylight-saving changes are handled automatically.</FieldDescription></Field>
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

function createNade(env) {
  return {
    id: window.crypto?.randomUUID?.() || String(Date.now()),
    name: "",
    map: env.CS2_STARTMAP || "",
    type: "Smoke",
    desc: "",
    lineupPos: "0 0 0",
    lineupAng: "0 0 0",
    lineupImages: [],
    owner: "default"
  };
}

function NadeDialog({ env, open, onOpenChange, onAdd }) {
  const [draft, setDraft] = useState(() => createNade(env));
  const [setposText, setSetposText] = useState("");
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(createNade(env));
    setSetposText("");
    setDialogError("");
  }, [open, env]);

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
    onAdd({
      ...draft,
      id: window.crypto?.randomUUID?.() || String(Date.now()),
      lineupImages: draft.lineupImages || []
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add nade</DialogTitle>
          <DialogDescription>Add a lineup and attach up to ten reference images.</DialogDescription>
        </DialogHeader>
        {dialogError ? <Message error={dialogError} /> : null}
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={draft.name || ""} onChange={(event) => updateDraft({ name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Map</FieldLabel>
            <Input value={draft.map || ""} onChange={(event) => updateDraft({ map: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <NativeSelect
              value={draft.type || ""}
              onChange={(event) => updateDraft({ type: event.target.value })}
            >
              {nadeTypes.map((type) => <option key={type || "empty"} value={type}>{type || "No type"}</option>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Owner</FieldLabel>
            <Input value={draft.owner || ""} onChange={(event) => updateDraft({ owner: event.target.value })} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <Input value={draft.desc || ""} onChange={(event) => updateDraft({ desc: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Lineup position</FieldLabel>
            <Input value={draft.lineupPos || ""} onChange={(event) => updateDraft({ lineupPos: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Lineup angle</FieldLabel>
            <Input value={draft.lineupAng || ""} onChange={(event) => updateDraft({ lineupAng: event.target.value })} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>setpos/setang</FieldLabel>
            <Textarea
              value={setposText}
              onChange={(event) => setSetposText(event.target.value)}
              placeholder="setpos 1422.968750 34.830574 -103.968750;setang -24.193808 -166.485611 0.000000"
            />
          </Field>
        </FieldGroup>
        <div className="grid gap-3">
          <UploadButton
            endpoint="lineupImageUploader"
            onClientUploadComplete={(files) => {
              for (const file of files || []) addImage(file);
            }}
            onUploadError={(error) => setDialogError(error.message)}
            appearance={{
              button: "bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md h-10 px-4 text-sm font-semibold",
              allowedContent: "text-xs text-muted-foreground"
            }}
          />
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
          <Button variant="secondary" onClick={applyPosition}>Apply position</Button>
          <Button onClick={submit}>Add nade</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Nades({ env, nades, setNades, onSave }) {
  const [mapFilter, setMapFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [exportJson, setExportJson] = useState("");
  const [localError, setLocalError] = useState("");

  const maps = useMemo<string[]>(() => [...new Set<string>(nades.map((nade) => String(nade.map || "")).filter(Boolean))].sort(), [nades]);
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
        description="MongoDB and MatchZy's savednades.json stay synchronized while MatchZy mode is active."
        actions={(
          <div className="flex flex-wrap gap-2">
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
            <Button onClick={onSave}>
              <Save data-icon="inline-start" />
              Save nades
            </Button>
          </div>
        )}
      />
      <NadeDialog
        env={env}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(entry) => setNades((current) => [...current, entry])}
      />
      {localError ? <Message error={localError} /> : null}
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
            <Badge variant="secondary">{filteredNades.length} shown</Badge>
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
                <div key={nade.id} className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 xl:grid-cols-[1fr_1fr_130px_1.2fr_1fr_1fr_90px_44px]">
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
  const [env, setEnv] = useState({});
  const [admins, setAdmins] = useState([]);
  const [nades, setNades] = useState([]);
  const [flagPresets, setFlagPresets] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [status, setStatus] = useState(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const control = await api("/api/control");
    setAuthenticated(true);
    setEnv(control.env || {});
    setAdmins(control.admins || []);
    setNades(control.nades || []);
    setFlagPresets(control.flagPresets || []);
    setPolicy(control.policy || null);
    setStatus(control.status || null);
    setSavedSignature(JSON.stringify({ env: control.env || {}, admins: control.admins || [] }));
  }

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      await loadAll();
      setMessage(result?.message || "Done.");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => setAuthenticated(false));
  }, []);

  const dirty = savedSignature !== "" && savedSignature !== JSON.stringify({ env, admins });

  useEffect(() => {
    function warnBeforeLeave(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

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
      serviceState={status?.service?.state}
      onSave={() => runAction(async () => {
        await api("/api/control", { method: "PUT", body: JSON.stringify({ env, admins }) });
        return { message: "Draft saved. Apply it when you are ready to restart CS2." };
      })}
      onApply={() => runAction(() => api("/api/control/apply", { method: "POST", body: JSON.stringify({ env, admins }) }))}
      onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
      }}
    >
      {tab === "overview" ? (
        <Overview
          env={env}
          admins={admins}
          nades={nades}
          status={status}
          policy={policy}
          busy={busy}
          onRefresh={() => runAction(async () => {
            await loadAll();
            return { message: "Refreshed." };
          })}
          onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }))}
        />
      ) : null}
      {tab === "diagnostics" ? (
        <><PageHeader eyebrow="Health trace" title="Diagnostics" description="Follow the container, installer, framework and selected game mode through one load path." /><Diagnostics active={tab === "diagnostics"} onOpenLogs={() => setTab("logs")} /></>
      ) : null}
      {tab === "server" ? (
        <Settings
          env={env}
          setEnv={setEnv}
          policy={policy}
        />
      ) : null}
      {tab === "plugins" ? <Plugins env={env} setEnv={setEnv} policy={policy} /> : null}
      {tab === "access" ? (
        <Admins
          admins={admins}
          setAdmins={setAdmins}
          flagPresets={flagPresets}
          roles={policy?.adminRoles || []}
        />
      ) : null}
      {tab === "maintenance" ? <Maintenance env={env} setEnv={setEnv} status={status} busy={busy} onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }))} /> : null}
      {tab === "nades" ? (
        <Nades
          env={env}
          nades={nades}
          setNades={setNades}
          onSave={() => runAction(async () => {
            const result = await api("/api/nades", { method: "PUT", body: JSON.stringify({ entries: nades }) });
            setNades(result.entries);
            return { message: "Nades saved." };
          })}
        />
      ) : null}
      {tab === "logs" ? <DockerLogs active={tab === "logs"} /> : null}
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(<App />);
