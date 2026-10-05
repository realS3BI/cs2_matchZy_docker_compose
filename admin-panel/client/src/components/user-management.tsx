import { useLiveResource } from "../hooks/use-live-resource";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { fetchUsers } from "../lib/admin-data";
import { ROLE_CATALOG, accessOf } from "../../../shared/authorization";
import { Choice } from "./workspace-ui";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";


function UserRow({ user, currentSteamId, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [steamId, setSteamId] = useState(user.identitySteam64 || "");
  const [access, setAccess] = useState(accessOf(user));
  const [baseline, setBaseline] = useState(user);
  const dirty = name !== (baseline.name || "") || JSON.stringify(access) !== JSON.stringify(accessOf(baseline));
  useEffect(() => {
    if (!dirty) { setAccess(accessOf(user)); setName(user.name || ""); setBaseline(user); }
  }, [user]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function save(event) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      const result = await api(`/api/users/${steamId}`, { method: "PUT", body: JSON.stringify({ name, access, accessRevision: baseline.accessRevision }) });
      setBaseline(result.user);
      setFeedback("Gespeichert. Die Rolle gilt auf der Website sofort und im Spiel innerhalb weniger Sekunden.");
      await onSaved();
      if (!user.identitySteam64) { setBaseline({}); setName(""); setSteamId(""); setAccess({ platform: "user", server: "none" }); }
    } catch (error) { setFeedback(error.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="rounded-lg border p-4">
    <FieldGroup className="md:flex-row md:items-end">
      <Field><FieldLabel>Name</FieldLabel><Input id={`name-${user.identitySteam64 || "new"}`} value={name} maxLength={100} onChange={event => setName(event.target.value)} /></Field>
      <Field><FieldLabel>Steam64-ID</FieldLabel><Input id={`steam-${user.identitySteam64 || "new"}`} value={steamId} required pattern="[0-9]{17}" disabled={Boolean(user.identitySteam64)} onChange={event => setSteamId(event.target.value)} placeholder="7656119…" /></Field>
      <Choice label="Plattformrolle" value={access.platform} disabled={steamId === currentSteamId} options={ROLE_CATALOG.filter(role => role.scope === "platform").map(role => ({ value: role.id, label: role.name }))} onChange={value => setAccess(current => ({ ...current, platform: value as typeof current.platform }))} />
      <Choice label="Serverrolle" value={access.server} options={ROLE_CATALOG.filter(role => role.scope === "server").map(role => ({ value: role.id, label: role.name }))} onChange={value => setAccess(current => ({ ...current, server: value as typeof current.server }))} />
      <Button disabled={busy}>{busy ? "Speichert…" : user.identitySteam64 ? "Speichern" : "Hinzufügen"}</Button>
    </FieldGroup>
    {user.teams?.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Teams: {user.teams.map(team => `${team.name} · ${ROLE_CATALOG.find(role => role.scope === "team" && role.id === team.role)?.name || team.role}`).join(" | ")}</p>}
    {feedback && <p role="status" className="mt-3 text-sm">{feedback}</p>}
  </form>;
}
export function UserManagement({ currentSteamId }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const version = useRef(0);
  async function load() { const before = version.current; const users = await fetchUsers(); if (before === version.current) { setUsers(users); setError(""); } }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  useLiveResource("/api/users", data => { version.current++; setUsers(data.entries); setError(""); }, error => { setError(error.message); if ([401, 403].includes(error.status)) setUsers([]); });
  return <div className="flex flex-col gap-5">
    <div><h1 className="control-title text-3xl">Benutzerverwaltung</h1><p className="mt-2 text-muted-foreground">Ein Steam-Konto für Plattform, Server und Teams. Neue Benutzer können Teams gründen und Einladungen annehmen, erhalten aber keine Serverrechte. Match Admin und Server-Admin erlauben uneingeschränkte RCON-Befehle.</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="secondary" size="sm" onClick={() => load().catch(error => setError(error.message))}>Erneut laden</Button></AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>Benutzer hinzufügen</CardTitle><CardDescription>Eine Steam64-ID kann bereits vor der ersten Anmeldung freigeschaltet werden.</CardDescription></CardHeader><CardContent><UserRow user={{}} currentSteamId={currentSteamId} onSaved={load} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Registrierte Benutzer · {users.length}</CardTitle><CardDescription>Plattform und Server werden getrennt vergeben. Teamrollen verwaltet ausschließlich der jeweilige Owner. Die eigene Plattform-Admin-Rolle bleibt geschützt.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{users.map(user => <UserRow key={user.identitySteam64} user={user} currentSteamId={currentSteamId} onSaved={load} />)}</CardContent></Card>
  </div>;
}
