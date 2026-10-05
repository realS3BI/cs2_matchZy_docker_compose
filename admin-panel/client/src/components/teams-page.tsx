import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, UsersRound, ArrowRight, Copy, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { authorize, teamRole, type Actor } from "../../../shared/authorization";
import type { TeamView } from "../../../shared/strats";
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
import { Badge } from "./ui/badge";
import {
  Choice,
  ConfirmAction,
  Feedback,
  useResource,
  WorkspaceHeader,
} from "./workspace-ui";

export const teamRoleLabel = (role: string) =>
  ({ owner: "Owner", captain: "Captain", member: "Mitglied" })[role] || role;
export function TeamsPage({ user }: { user: Actor }) {
  const { data, error, loading, reload } = useResource<{ entries: TeamView[] }>(
    "/api/teams",
  );
  const [name, setName] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <WorkspaceHeader
        title="Team-Management"
        description="Deine Teams, Mitglieder und Einladungen. Du kannst in mehreren Teams mitspielen."
      />
      <Feedback error={failure || error} />
      {authorize(user, "teams.create") && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ein Team gründen</CardTitle>
            <CardDescription>
              Als Owner verwaltest du Mitglieder und Teamrechte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setFailure("");
                try {
                  const result = await api("/api/teams", {
                    method: "POST",
                    body: JSON.stringify({ name }),
                  });
                  navigate(`/teams/${result.team.id}`);
                } catch (cause) {
                  setFailure(cause.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field className="min-w-48 flex-1">
                <FieldLabel>Teamname</FieldLabel>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                />
              </Field>
              <Button disabled={busy}>
                <Plus />
                Team gründen
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {loading ? (
        <p role="status">Teams werden geladen …</p>
      ) : !data?.entries.length ? (
        <Card>
          <CardHeader>
            <UsersRound className="size-8 text-muted-foreground" />
            <CardTitle>Noch kein Team</CardTitle>
            <CardDescription>
              Gründe dein Team oder öffne einen Einladungslink deines Owners.
            </CardDescription>
          </CardHeader>
          {error && (
            <CardContent>
              <Button onClick={reload}>Erneut laden</Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.entries.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{team.name}</CardTitle>
                  <Badge variant="secondary">
                    {teamRoleLabel(teamRole(user, team))}
                  </Badge>
                </div>
                <CardDescription>
                  {team.members.length} Mitglieder
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link to={`/teams/${team.id}`}>
                    Team öffnen
                    <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function TeamPage({ user }: { user: Actor }) {
  const { teamId } = useParams();
  const resource = useResource<{ team: TeamView }>(`/api/teams/${teamId}`);
  const team = resource.data?.team;
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (team) setName(team.name);
  }, [team?.id, team?.name]);
  useEffect(() => {
    setLink("");
    setError("");
  }, [teamId]);
  async function change(action: string, values = {}) {
    const result = await api(`/api/teams/${team.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, revision: team.revision, ...values }),
    });
    if (!result.team) navigate("/teams");
    else resource.setData(result);
    if (action === "transfer" || action === "revokeInvite") setLink("");
  }
  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  if (!team)
    return (
      <>
        <WorkspaceHeader title="Team" description="Mitglieder und Teamrechte" />
        <Feedback
          error={resource.error}
          message={resource.loading ? "Team wird geladen …" : ""}
        />
        <Button onClick={resource.reload}>Neu laden</Button>
      </>
    );
  const owner = team.permissions["teams.manage"];
  return (
    <>
      <WorkspaceHeader
        title={team.name}
        description={`${team.members.length} ${team.members.length === 1 ? "Mitglied" : "Mitglieder"} · Deine Rolle: ${teamRoleLabel(teamRole(user, team))}`}
      >
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/strats?team=${team.id}`}>Strats</Link>
          </Button>
          <Button asChild>
            <Link to={`/strats/live/${team.id}`}>Live-Ansicht</Link>
          </Button>
        </div>
      </WorkspaceHeader>
      <Feedback error={error || resource.error} message={message} />
      {error && (
        <Button
          className="mb-4"
          variant="outline"
          onClick={() => {
            setError("");
            resource.reload();
          }}
        >
          Aktuellen Stand laden
        </Button>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mitglieder</CardTitle>
            <CardDescription>
              Nur der Owner vergibt Teamrollen. Captain und Owner bearbeiten die
              Strats.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {team.members.map((member) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
                key={member.userId}
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {member.name}
                    {member.userId === user.identitySteam64 ? " · Du" : ""}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {member.userId}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {teamRoleLabel(member.role)}
                  </Badge>
                </div>
                {owner && member.role !== "owner" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Choice
                      label={`Rolle für ${member.name}`}
                      value={member.role}
                      disabled={busy}
                      options={[
                        { value: "member", label: "Mitglied" },
                        { value: "captain", label: "Captain" },
                      ]}
                      onChange={(role) =>
                        void run(() =>
                          change("role", { userId: member.userId, role }),
                        )
                      }
                    />
                    <ConfirmAction
                      title="Mitglied entfernen"
                      description={`${member.name} verliert den Zugriff auf dieses Team und seine Strats.`}
                      onConfirm={() =>
                        change("remove", { userId: member.userId })
                      }
                    >
                      Entfernen
                    </ConfirmAction>
                    <ConfirmAction
                      title="Eigentum übertragen"
                      description={`${member.name} wird Owner. Du wirst Mitglied und verlierst die Verwaltung dieses Teams. Alle bisherigen Einladungen werden widerrufen.`}
                      onConfirm={() =>
                        change("transfer", { userId: member.userId })
                      }
                    >
                      Zum Owner machen
                    </ConfirmAction>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {owner ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Team bearbeiten</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(() => change("rename", { name }));
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Teamname</FieldLabel>
                        <Input
                          required
                          maxLength={80}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                      </Field>
                      <Button disabled={busy || name === team.name}>
                        Namen speichern
                      </Button>
                    </FieldGroup>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Einladungen</CardTitle>
                  <CardDescription>
                    Links sind sieben Tage gültig. Neue Mitglieder erhalten die
                    Rolle Mitglied.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await api(
                          `/api/teams/${team.id}/invitations`,
                          {
                            method: "POST",
                            body: JSON.stringify({ revision: team.revision }),
                          },
                        );
                        resource.setData({ team: result.team });
                        setLink(result.url);
                      })
                    }
                  >
                    <Link2 />
                    Einladungslink erstellen
                  </Button>
                  {link && (
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Neuer Einladungslink</FieldLabel>
                        <Input
                          id="team-invitation-link"
                          readOnly
                          value={link}
                          onFocus={(event) => event.target.select()}
                        />
                      </Field>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void run(async () => {
                            if (navigator.clipboard) {
                              await navigator.clipboard.writeText(link);
                              setMessage("Einladungslink kopiert.");
                            } else {
                              (
                                document.getElementById(
                                  "team-invitation-link",
                                ) as HTMLInputElement
                              )?.select();
                              setMessage(
                                "Der Link ist markiert. Kopiere ihn mit Strg+C oder ⌘C.",
                              );
                            }
                          })
                        }
                      >
                        <Copy />
                        Link kopieren
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Der vollständige Link wird nur jetzt angezeigt.
                      </p>
                    </FieldGroup>
                  )}
                  {team.invitations.map((invite) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2"
                      key={invite.id}
                    >
                      <p className="text-sm">
                        Gültig bis{" "}
                        {new Date(invite.expiresAt).toLocaleDateString("de-AT")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            change("revokeInvite", { invitationId: invite.id }),
                          )
                        }
                      >
                        Widerrufen
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Mitgliedschaft</CardTitle>
                <CardDescription>
                  Mit dem Austritt verlierst du den Zugriff auf die Strats
                  dieses Teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfirmAction
                  title="Team verlassen"
                  description={`Möchtest du ${team.name} verlassen? Für einen erneuten Beitritt brauchst du eine Einladung.`}
                  onConfirm={() => change("leave")}
                >
                  Team verlassen
                </ConfirmAction>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export function JoinTeamPage() {
  const { token } = useParams();
  const [invite, setInvite] = useState<{
    name: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    setInvite(null);
    setError("");
    api(`/api/team-invitations/${token}`, { method: "POST", body: "{}" })
      .then((result) => {
        if (!cancelled) setInvite(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <>
      <WorkspaceHeader
        title="Teameinladung"
        description="Tritt mit deinem Steam-Konto bei. Deine anderen Mitgliedschaften bleiben bestehen."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{invite?.name || "Einladung prüfen"}</CardTitle>
          <CardDescription>
            {invite
              ? `Gültig bis ${new Date(invite.expiresAt).toLocaleString("de-AT")}`
              : "Der Link muss gültig sein und vom aktuellen Owner stammen."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Feedback error={error} />
          {invite && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api(`/api/team-invitations/${token}`, {
                    method: "POST",
                    body: JSON.stringify({ accept: true }),
                  });
                  navigate(`/teams/${result.team.id}`, { replace: true });
                } catch (cause) {
                  setError(cause.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Team beitreten
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
