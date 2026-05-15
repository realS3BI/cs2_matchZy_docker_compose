import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Copy,
  Crosshair,
  Download,
  FileInput,
  LogOut,
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
  UploadCloud
} from "lucide-react";
import { api } from "./lib/api";
import { cn } from "./lib/utils";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import "./index.css";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: Server },
  { id: "settings", label: "Settings", icon: Save },
  { id: "admins", label: "Admins", icon: Shield },
  { id: "nades", label: "Nades", icon: Crosshair },
  { id: "logs", label: "Docker Logs", icon: Terminal }
];

function Message({ message, error }) {
  if (!message && !error) return null;
  return (
    <div
      className={cn(
        "mb-4 rounded-md border px-4 py-3 text-sm whitespace-pre-wrap",
        error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-[#f7f3df] text-[#8a5d0e]"
      )}
    >
      {error || message}
    </div>
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
    <main className="mx-auto mt-[12vh] w-[min(420px,calc(100vw-32px))]">
      <Card className="shadow-[0_18px_60px_rgba(32,35,31,0.12)]">
        <CardHeader>
          <CardTitle className="text-2xl">CS2 Admin Panel</CardTitle>
          <p className="text-sm text-muted-foreground">Enter the configured panel password.</p>
        </CardHeader>
        <CardContent>
          <Message error={error} />
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-2 text-sm font-semibold text-muted-foreground">
              Password
              <Input
                autoFocus
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button disabled={busy}>{busy ? "Logging in..." : "Login"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Shell({ children, tab, setTab, message, error, onLogout }) {
  return (
    <main className="mx-auto mb-12 mt-6 w-[min(1220px,calc(100vw-24px))]">
      <header className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">CS2 MatchZy Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Service settings, admins, and restart control.</p>
        </div>
        <Button variant="secondary" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </header>
      <nav className="mb-5 flex gap-2 overflow-x-auto border-b border-border pb-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={tab === item.id ? "default" : "ghost"}
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>
      <Message message={message} error={error} />
      {children}
    </main>
  );
}

function Dashboard({ env, admins, nades, status, onRefresh, onApply, onRestart, busy }) {
  const service = status?.service;
  const last = status?.lastAction;
  const globalNadesEnabled = ["1", "true", "yes", "on"].includes(String(env.MATCHZY_SAVE_NADES_AS_GLOBAL ?? "1").toLowerCase());

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onRefresh} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Button onClick={onApply} disabled={busy}>
          <UploadCloud className="h-4 w-4" />
          Apply & Restart CS2
        </Button>
        <Button variant="destructive" onClick={onRestart} disabled={busy}>
          <RotateCcw className="h-4 w-4" />
          Restart CS2
        </Button>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Server</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <span>State: <Badge>{service?.state || "unknown"}</Badge></span>
            <span>Service: <code className="text-primary">cs2</code></span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last action</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <span>Type: <Badge>{last?.type || "none"}</Badge></span>
            <span>Status: <Badge variant={last?.status === "failed" ? "destructive" : "default"}>{last?.status || "none"}</Badge></span>
            <span className="line-clamp-3">{last?.message || ""}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active config</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <span>Name: <code className="text-primary">{env.CS2_SERVERNAME || ""}</code></span>
            <span>Map: <code className="text-primary">{env.CS2_STARTMAP || ""}</code></span>
            <span>Admins: <Badge>{admins.length}</Badge></span>
            <span>Nades: <Badge>{nades.length}</Badge></span>
            <span>Global nades: <Badge>{globalNadesEnabled ? "on" : "off"}</Badge></span>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Settings({ env, setEnv, curatedFields, onSave }) {
  const rawRows = useMemo(() => Object.keys(env).sort(), [env]);

  function setValue(key, value) {
    setEnv((current) => ({ ...current, [key]: value }));
  }

  function renameKey(oldKey, newKey) {
    setEnv((current) => {
      const next = { ...current };
      const value = next[oldKey];
      delete next[oldKey];
      if (newKey.trim()) next[newKey.trim()] = value;
      return next;
    });
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={onSave}>
          <Save className="h-4 w-4" />
          Save settings
        </Button>
        <Button variant="secondary" onClick={() => setValue("NEW_KEY", "")}>
          <Plus className="h-4 w-4" />
          Add ENV
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {curatedFields.map((field) => (
            <SettingField key={field.key} field={field} value={env[field.key] ?? ""} onChange={(value) => setValue(field.key, value)} />
          ))}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Raw ENV</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {rawRows.map((key) => (
            <div key={key} className="grid gap-2 md:grid-cols-[220px_1fr_44px]">
              <Input defaultValue={key} onBlur={(event) => renameKey(key, event.target.value)} />
              <Input value={env[key] ?? ""} onChange={(event) => setValue(key, event.target.value)} />
              <Button
                variant="secondary"
                size="icon"
                title="Remove"
                onClick={() => setEnv((current) => {
                  const next = { ...current };
                  delete next[key];
                  return next;
                })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SettingField({ field, value, onChange }) {
  if (field.type === "boolean") {
    const checked = ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
    return (
      <label className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
        {field.label}
        <input className="h-5 w-5 accent-primary" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked ? "1" : "0")} />
      </label>
    );
  }
  const Control = field.type === "textarea" ? Textarea : Input;
  return (
    <label className="grid gap-2 text-sm font-semibold text-muted-foreground">
      {field.label}
      <Control type={field.type === "password" ? "password" : field.type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Admins({ admins, setAdmins, flagPresets, onSave }) {
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
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={onSave}>
          <Save className="h-4 w-4" />
          Save admins
        </Button>
        <Button variant="secondary" onClick={() => setAdmins((current) => [...current, { name: "", identitySteam64: "", flags: ["@css/root"] }])}>
          <Plus className="h-4 w-4" />
          Add admin
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>CounterStrikeSharp Admins</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {admins.length === 0 ? <p className="text-sm text-muted-foreground">No admins configured.</p> : null}
          {admins.map((admin, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-border bg-background p-3 xl:grid-cols-[1fr_1.2fr_1.6fr_44px]">
              <Input value={admin.name || ""} placeholder="Name" onChange={(event) => updateAdmin(index, { name: event.target.value })} />
              <Input value={admin.identitySteam64 || ""} placeholder="Steam64 ID" onChange={(event) => updateAdmin(index, { identitySteam64: event.target.value })} />
              <div className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-2">
                {flagPresets.map((flag) => (
                  <label key={flag} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <input
                      className="h-4 w-4 accent-primary"
                      type="checkbox"
                      checked={(admin.flags || []).includes(flag)}
                      onChange={(event) => toggleFlag(index, flag, event.target.checked)}
                    />
                    {flag}
                  </label>
                ))}
              </div>
              <Button variant="secondary" size="icon" title="Remove" onClick={() => setAdmins((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
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
    owner: "default"
  };
}

function Nades({ env, nades, setNades, onSave }) {
  const [mapFilter, setMapFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [exportJson, setExportJson] = useState("");
  const [localError, setLocalError] = useState("");

  const maps = useMemo(() => [...new Set(nades.map((nade) => nade.map).filter(Boolean))].sort(), [nades]);
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
      const result = await api("/api/nades/import", {
        method: "POST",
        body: JSON.stringify({
          matchzyConfig: importJson,
          map: env.CS2_STARTMAP || "",
          type: "Smoke",
          mode: "replace"
        })
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
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={onSave}>
          <Save className="h-4 w-4" />
          Save nades
        </Button>
        <Button variant="secondary" onClick={() => setNades((current) => [...current, createNade(env)])}>
          <Plus className="h-4 w-4" />
          Add nade
        </Button>
        <Button variant="secondary" onClick={() => setImportOpen((current) => !current)}>
          <FileInput className="h-4 w-4" />
          Import
        </Button>
        <Button variant="secondary" onClick={exportNades}>
          <Download className="h-4 w-4" />
          Export JSON
        </Button>
      </div>
      {localError ? <Message error={localError} /> : null}
      {importOpen ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Import MatchZy nades</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea value={importJson} onChange={(event) => setImportJson(event.target.value)} placeholder='{"default":{}} or setpos 1422.968750 34.830574 -103.968750;setang -24.193808 -166.485611 0.000000' />
            <div className="flex flex-wrap gap-2">
              <Button onClick={importNades}>
                <FileInput className="h-4 w-4" />
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
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button variant="secondary" onClick={downloadExport}>
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Nades</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-[1fr_180px_180px]">
            <Input value={query} placeholder="Search name or description" onChange={(event) => setQuery(event.target.value)} />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={mapFilter}
              onChange={(event) => setMapFilter(event.target.value)}
            >
              <option value="">All maps</option>
              {maps.map((map) => <option key={map} value={map}>{map}</option>)}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              {nadeTypes.filter(Boolean).map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          {nades.length === 0 ? <p className="text-sm text-muted-foreground">No nades configured.</p> : null}
          {groupedNades.map(([map, mapNades]) => (
            <section key={map} className="grid gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{map} <Badge>{mapNades.length}</Badge></h3>
              {mapNades.map((nade) => (
                <div key={nade.id} className="grid gap-2 rounded-md border border-border bg-background p-3 xl:grid-cols-[1fr_1fr_130px_1.2fr_1fr_1fr_44px]">
                  <Input value={nade.name || ""} placeholder="Name" onChange={(event) => updateNade(nade.id, { name: event.target.value })} />
                  <Input value={nade.map || ""} placeholder="Map" onChange={(event) => updateNade(nade.id, { map: event.target.value })} />
                  <select
                    className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={nade.type || ""}
                    onChange={(event) => updateNade(nade.id, { type: event.target.value })}
                  >
                    {nadeTypes.map((type) => <option key={type || "empty"} value={type}>{type || "No type"}</option>)}
                  </select>
                  <Input value={nade.desc || ""} placeholder="Description" onChange={(event) => updateNade(nade.id, { desc: event.target.value })} />
                  <Input value={nade.lineupPos || ""} placeholder="LineupPos" onChange={(event) => updateNade(nade.id, { lineupPos: event.target.value })} />
                  <Input value={nade.lineupAng || ""} placeholder="LineupAng" onChange={(event) => updateNade(nade.id, { lineupAng: event.target.value })} />
                  <Button variant="secondary" size="icon" title="Remove" onClick={() => setNades((current) => current.filter((item) => item.id !== nade.id))}>
                    <Trash2 className="h-4 w-4" />
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
          Refresh
        </Button>
        <Button variant={autoRefresh ? "default" : "secondary"} onClick={() => setAutoRefresh((current) => !current)}>
          {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
        </Button>
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Lines
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={tail}
            onChange={(event) => setTail(Number(event.target.value))}
          >
            <option value={100}>100</option>
            <option value={300}>300</option>
            <option value={800}>800</option>
            <option value={1500}>1500</option>
          </select>
        </label>
        <span className="text-sm text-muted-foreground">{updatedAt ? `Updated ${updatedAt}` : ""}</span>
      </div>
      {logError ? <Message error={logError} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>CS2 Docker Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <pre
            ref={logRef}
            className="h-[62vh] overflow-auto rounded-md border border-border bg-[#10130f] p-4 font-mono text-xs leading-relaxed text-[#dce8d4] whitespace-pre-wrap"
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
  const [tab, setTab] = useState("dashboard");
  const [env, setEnv] = useState({});
  const [curatedFields, setCuratedFields] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [nades, setNades] = useState([]);
  const [flagPresets, setFlagPresets] = useState([]);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [settings, adminData, nadesData, statusData] = await Promise.all([
      api("/api/settings"),
      api("/api/admins"),
      api("/api/nades"),
      api("/api/server/status")
    ]);
    setAuthenticated(true);
    setEnv(settings.env || {});
    setCuratedFields(settings.curatedFields || []);
    setAdmins(adminData.entries || []);
    setNades(nadesData.entries || []);
    setFlagPresets(adminData.flagPresets || []);
    setStatus(statusData);
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
      onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
      }}
    >
      {tab === "dashboard" ? (
        <Dashboard
          env={env}
          admins={admins}
          nades={nades}
          status={status}
          busy={busy}
          onRefresh={() => runAction(async () => {
            await loadAll();
            return { message: "Refreshed." };
          })}
          onApply={() => runAction(() => api("/api/server/apply", { method: "POST", body: "{}" }))}
          onRestart={() => runAction(() => api("/api/server/restart", { method: "POST", body: "{}" }))}
        />
      ) : null}
      {tab === "settings" ? (
        <Settings
          env={env}
          setEnv={setEnv}
          curatedFields={curatedFields}
          onSave={() => runAction(async () => {
            const result = await api("/api/settings", { method: "PUT", body: JSON.stringify({ env }) });
            setEnv(result.env);
            return { message: "Settings saved." };
          })}
        />
      ) : null}
      {tab === "admins" ? (
        <Admins
          admins={admins}
          setAdmins={setAdmins}
          flagPresets={flagPresets}
          onSave={() => runAction(async () => {
            const result = await api("/api/admins", { method: "PUT", body: JSON.stringify({ entries: admins }) });
            setAdmins(result.entries);
            return { message: "Admins saved." };
          })}
        />
      ) : null}
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
