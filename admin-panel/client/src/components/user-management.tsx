import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";

const roles = [{ id: "admin", name: "Admin" }, { id: "match_admin", name: "Match Admin" }, { id: "player", name: "Player" }];
function UserRow({ user, currentSteamId, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [steamId, setSteamId] = useState(user.identitySteam64 || "");
  const [role, setRole] = useState(user.role || "player");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function save(event) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      await api(`/api/users/${steamId}`, { method: "PUT", body: JSON.stringify({ name, role }) });
      setFeedback("Gespeichert. Die Rolle gilt auf der Website sofort und im Spiel innerhalb weniger Sekunden.");
      await onSaved();
      if (!user.identitySteam64) { setName(""); setSteamId(""); setRole("player"); }
    } catch (error) { setFeedback(error.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="rounded-lg border p-4">
    <FieldGroup className="md:flex-row md:items-end">
      <Field><FieldLabel><label htmlFor={`name-${user.identitySteam64 || "new"}`}>Name</label></FieldLabel><Input id={`name-${user.identitySteam64 || "new"}`} value={name} maxLength={100} onChange={event => setName(event.target.value)} /></Field>
      <Field><FieldLabel><label htmlFor={`steam-${user.identitySteam64 || "new"}`}>Steam64-ID</label></FieldLabel><Input id={`steam-${user.identitySteam64 || "new"}`} value={steamId} required pattern="[0-9]{17}" disabled={Boolean(user.identitySteam64)} onChange={event => setSteamId(event.target.value)} placeholder="7656119…" /></Field>
      <Field><FieldLabel>Rolle</FieldLabel><Select value={role} disabled={steamId === currentSteamId} onValueChange={setRole}><SelectTrigger aria-label={`Rolle für ${name || steamId || "neuen Benutzer"}`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Button disabled={busy}>{busy ? "Speichert…" : user.identitySteam64 ? "Speichern" : "Hinzufügen"}</Button>
    </FieldGroup>
    {feedback && <p role="status" className="mt-3 text-sm">{feedback}</p>}
  </form>;
}
export function UserManagement({ currentSteamId }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  async function load() { const result = await api("/api/users"); setUsers(result.entries); }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  return <div className="flex flex-col gap-5">
    <div><h1 className="control-title text-3xl">Benutzerverwaltung</h1><p className="mt-2 text-muted-foreground">Neue Steam-Logins erhalten die Rolle Player. Weise hier Admin oder Match Admin zu. Mit Player entziehst du die Verwaltungsrechte.</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>Benutzer hinzufügen</CardTitle><CardDescription>Eine Steam64-ID kann bereits vor der ersten Anmeldung freigeschaltet werden.</CardDescription></CardHeader><CardContent><UserRow user={{}} currentSteamId={currentSteamId} onSaved={load} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Registrierte Benutzer · {users.length}</CardTitle><CardDescription>Rollen gelten für Website und Spielserver. Die eigene Admin-Rolle bleibt geschützt.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{users.map(user => <UserRow key={user.identitySteam64} user={user} currentSteamId={currentSteamId} onSaved={load} />)}</CardContent></Card>
  </div>;
}
