import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { WorkspaceHeader } from "./workspace-ui";
import { useLiveResource } from "../hooks/use-live-resource";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { fetchUsers } from "../lib/admin-data";
import { ROLE_CATALOG, accessOf } from "../../../shared/authorization";
import { Choice } from "./workspace-ui";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";

function UserRow({ user, currentSteamId, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [steamId, setSteamId] = useState(user.identitySteam64 || "");
  const [access, setAccess] = useState(accessOf(user));
  const [baseline, setBaseline] = useState(user);
  const dirty =
    name !== (baseline.name || "") ||
    JSON.stringify(access) !== JSON.stringify(accessOf(baseline));
  useEffect(() => {
    if (!dirty) {
      setAccess(accessOf(user));
      setName(user.name || "");
      setBaseline(user);
    }
  }, [user]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const result = await api(`/api/users/${steamId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          access,
          accessRevision: baseline.accessRevision,
        }),
      });
      setBaseline(result.user);
      setFeedback(
        "Gespeichert. Die Rolle gilt auf der Website sofort und im Spiel innerhalb weniger Sekunden.",
      );
      await onSaved();
      if (!user.identitySteam64) {
        setBaseline({});
        setName("");
        setSteamId("");
        setAccess({ platform: "user", server: "none" });
      }
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }
  const form = (
    <form onSubmit={save} className="p-4">
      <p className="mb-4 text-xs text-muted-foreground">
        Plattform und Server gelten unabhängig voneinander. Teamrollen vergibt
        der jeweilige Owner im Team.
      </p>
      <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            id={`name-${user.identitySteam64 || "new"}`}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Steam64-ID</FieldLabel>
          <Input
            id={`steam-${user.identitySteam64 || "new"}`}
            value={steamId}
            required
            pattern="[0-9]{17}"
            disabled={Boolean(user.identitySteam64)}
            onChange={(event) => setSteamId(event.target.value)}
            placeholder="7656119…"
          />
        </Field>
        <Choice
          label="Plattformrolle"
          value={access.platform}
          disabled={steamId === currentSteamId}
          options={ROLE_CATALOG.filter((role) => role.scope === "platform").map(
            (role) => ({ value: role.id, label: role.name }),
          )}
          onChange={(value) =>
            setAccess((current) => ({
              ...current,
              platform: value as typeof current.platform,
            }))
          }
        />
        <Choice
          label="Serverrolle"
          value={access.server}
          options={ROLE_CATALOG.filter((role) => role.scope === "server").map(
            (role) => ({ value: role.id, label: role.name }),
          )}
          onChange={(value) =>
            setAccess((current) => ({
              ...current,
              server: value as typeof current.server,
            }))
          }
        />
        <Button
          className="sm:col-span-2 sm:justify-self-end xl:col-span-4"
          disabled={busy || (Boolean(user.identitySteam64) && !dirty)}
        >
          {busy
            ? "Speichert…"
            : user.identitySteam64
              ? "Speichern"
              : "Hinzufügen"}
        </Button>
      </FieldGroup>
      {user.teams?.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Teams:{" "}
          {user.teams
            .map(
              (team) =>
                `${team.name} · ${ROLE_CATALOG.find((role) => role.scope === "team" && role.id === team.role)?.name || team.role}`,
            )
            .join(" | ")}
        </p>
      )}
      {feedback && (
        <p role="status" className="mt-3 text-sm">
          {feedback}
        </p>
      )}
    </form>
  );
  return user.identitySteam64 ? (
    <details className="user-access-row rounded-lg border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">
            {user.name || "Unbenannter Benutzer"}
            {steamId === currentSteamId ? " · Du" : ""}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {steamId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {
              ROLE_CATALOG.find(
                (role) =>
                  role.scope === "platform" &&
                  role.id === accessOf(user).platform,
              )?.name
            }
          </Badge>
          <Badge variant="outline">
            {
              ROLE_CATALOG.find(
                (role) =>
                  role.scope === "server" && role.id === accessOf(user).server,
              )?.name
            }
          </Badge>
        </div>
        <span className="user-access-edit text-xs text-muted-foreground">
          Bearbeiten
        </span>
      </summary>
      {form}
    </details>
  ) : (
    form
  );
}
export function UserManagement({ currentSteamId }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  async function load() {
    const before = version.current;
    const users = await fetchUsers();
    if (before === version.current) {
      setUsers(users);
      setError("");
      setLoaded(true);
    }
  }
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  useLiveResource(
    "/api/users",
    (data) => {
      version.current++;
      setUsers(data.entries);
      setError("");
      setLoaded(true);
    },
    (error) => {
      setError(error.message);
      if ([401, 403].includes(error.status)) setUsers([]);
    },
  );
  const entries = users.filter((user) =>
    `${user.name || ""} ${user.identitySteam64}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader
        title="Benutzer"
        description="Verwalte den Zugriff auf Plattform und Server. Die Rollen innerhalb eines Teams vergibt dessen Owner."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          Benutzer hinzufügen
        </Button>
      </WorkspaceHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => load().catch((error) => setError(error.message))}
            >
              Erneut laden
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Benutzer hinzufügen</DialogTitle>
            <DialogDescription>
              Du kannst eine Steam64-ID bereits vor der ersten Anmeldung
              freischalten.
            </DialogDescription>
          </DialogHeader>
          <UserRow
            user={{}}
            currentSteamId={currentSteamId}
            onSaved={async () => {
              await load();
              setCreateOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Registrierte Benutzer</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/roles">Rollen und Rechte ansehen</Link>
            </Button>
          </div>
          <CardDescription>
            Öffne einen Benutzer, um seine Rollen zu bearbeiten. Deine eigene
            Plattform-Admin-Rolle ist geschützt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field htmlFor="user-search">
            <FieldLabel>Benutzer suchen</FieldLabel>
            <Input
              id="user-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name oder Steam64-ID"
            />
          </Field>
          <p role="status" className="text-xs text-muted-foreground">
            {entries.length} von {users.length} Benutzern
          </p>
          {!loaded && !error ? (
            <p role="status" className="text-sm text-muted-foreground">
              Benutzer werden geladen …
            </p>
          ) : loaded && !entries.length && !error ? (
            <p className="text-sm text-muted-foreground">
              {query
                ? "Keine Benutzer zu dieser Suche gefunden."
                : "Noch keine Benutzer registriert."}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            {entries.map((user) => (
              <UserRow
                key={user.identitySteam64}
                user={user}
                currentSteamId={currentSteamId}
                onSaved={load}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
