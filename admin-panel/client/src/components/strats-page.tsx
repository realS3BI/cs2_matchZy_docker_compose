import { SceneExample } from "./demo-player";
import { StratExplanations } from "./live-session-pages";
import { ScenePicker } from "./scene-picker";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowDown, ArrowUp, Plus, Radio, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { lineupPath } from "@/lib/lineups";
import type { MapDefinition } from "@/lib/maps";
import type { Actor } from "../../../shared/authorization";
import {
  newStratContent,
  newWorkspaceId,
  type StratContent,
  type StratSlot,
  type StratView,
  type TeamView,
} from "../../../shared/strats";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Choice,
  ConfirmAction,
  Feedback,
  useResource,
  WorkspaceHeader,
} from "./workspace-ui";

type LibraryProps = { user: Actor; nades: any[]; maps: MapDefinition[] };
const mapOptions = (maps: MapDefinition[]) =>
  maps.map((map) => ({ value: map.mapName, label: map.name }));
const sideOptions = [
  { value: "t", label: "T" },
  { value: "ct", label: "CT" },
];
const titleOf = (strat: StratView) =>
  strat.published?.content.title || strat.content.title;

export function StratsPage({ maps }: LibraryProps) {
  const teams = useResource<{ entries: TeamView[] }>("/api/teams");
  const strats = useResource<{ entries: StratView[] }>("/api/strats");
  const [search, setSearch] = useSearchParams();
  const teamId = search.get("team") || "";
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("");
  const [side, setSide] = useState("");
  const [archived, setArchived] = useState(false);
  const editable =
    teams.data?.entries.filter((team) => team.permissions["strats.edit"]) || [];
  const entries = (strats.data?.entries || []).filter(
    (strat) =>
      (!teamId || strat.teamId === teamId) &&
      (!map || strat.content.map === map) &&
      (!side || strat.content.side === side) &&
      strat.archived === archived &&
      `${strat.content.title} ${strat.content.description}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <WorkspaceHeader
        title="Strats"
        description="Taktiken deiner Teams lesen, vorbereiten und gemeinsam spielen."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={teamId ? `/strats/live/${teamId}` : "/strats/live"}>
              <Radio />
              Live-Ansicht
            </Link>
          </Button>
          {editable.length > 0 && (
            <Button asChild>
              <Link
                to={`/strats/new?team=${editable.find((team) => team.id === teamId)?.id || editable[0].id}`}
              >
                <Plus />
                Neue Strat
              </Link>
            </Button>
          )}
        </div>
      </WorkspaceHeader>
      <Feedback error={teams.error || strats.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel>Suchen</FieldLabel>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name oder Beschreibung"
          />
        </Field>
        <Choice
          label="Team"
          value={teamId}
          onChange={(team) => setSearch(team ? { team } : {})}
          options={[
            { value: "", label: "Alle Teams" },
            ...(teams.data?.entries || []).map((team) => ({
              value: team.id,
              label: team.name,
            })),
          ]}
        />
        <Choice
          label="Map"
          value={map}
          onChange={setMap}
          options={[{ value: "", label: "Alle Maps" }, ...mapOptions(maps)]}
        />
        <Choice
          label="Seite"
          value={side}
          onChange={setSide}
          options={[{ value: "", label: "T und CT" }, ...sideOptions]}
        />
      </div>
      {editable.length > 0 && (
        <div className="mb-5 flex gap-2">
          <Button
            variant={!archived ? "secondary" : "ghost"}
            onClick={() => setArchived(false)}
          >
            Strats
          </Button>
          <Button
            variant={archived ? "secondary" : "ghost"}
            onClick={() => setArchived(true)}
          >
            Archiv
          </Button>
        </div>
      )}
      {strats.loading ? (
        <p role="status">Strats werden geladen …</p>
      ) : entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Keine Strats gefunden</CardTitle>
            <CardDescription>
              {teams.data?.entries.length
                ? "Passe die Filter an. Owner und Captains können hier Taktiken anlegen; Mitglieder sehen veröffentlichte Strats."
                : "Gründe zuerst ein Team oder tritt über eine Einladung bei."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/teams">Zum Team-Management</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((strat) => (
            <Card key={strat.id}>
              <CardHeader>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{strat.teamName}</Badge>
                  <Badge variant="secondary">
                    {maps.find((map) => map.mapName === strat.content.map)
                      ?.name || strat.content.map}{" "}
                    · {strat.content.side.toUpperCase()}
                  </Badge>
                </div>
                <CardTitle>
                  <Link to={`/strats/${strat.id}`} className="hover:underline">
                    {strat.content.title}
                  </Link>
                </CardTitle>
                <CardDescription className="line-clamp-3 whitespace-pre-wrap">
                  {strat.content.description || "Noch keine Beschreibung."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {strat.archived
                    ? "Archiviert"
                    : strat.published
                      ? `Veröffentlicht · Version ${strat.published.version}`
                      : "Entwurf"}
                </span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/strats/${strat.id}`}>Lesen</Link>
                  </Button>
                  {strat.canEdit && (
                    <Button asChild size="sm">
                      <Link to={`/strats/${strat.id}/edit`}>Bearbeiten</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function SlotTasks({
  slot,
  team,
  nades,
  maps,
}: {
  slot: StratSlot;
  team: TeamView;
  nades: any[];
  maps: MapDefinition[];
}) {
  const member = team.members.find((member) => member.userId === slot.userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{slot.label}</CardTitle>
        <CardDescription>
          {member?.name ||
            (slot.userId
              ? "Spieler nicht mehr im Team"
              : "Platz noch nicht besetzt")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {slot.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Für diese Rolle gibt es noch keine Schritte.
          </p>
        ) : (
          <ol className="flex flex-col gap-5">
            {slot.steps.map((step, index) => (
              <li className="flex gap-3" key={step.id}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {step.text}
                  </p>
                  {(step.position || step.timing) && (
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      {step.position && (
                        <div>
                          <dt className="font-medium">Position</dt>
                          <dd>{step.position}</dd>
                        </div>
                      )}
                      {step.timing && (
                        <div>
                          <dt className="font-medium">Timing</dt>
                          <dd>{step.timing}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {step.scene && <SceneExample scene={step.scene} maps={maps} />}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {step.nadeIds.map((id) => {
                      const nade = nades.find((nade) => nade.id === id);
                      const map = maps.find((map) => map.mapName === nade?.map);
                      return nade && map ? (
                        <Button asChild key={id} variant="outline" size="sm">
                          <Link
                            to={lineupPath(map, nade)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {nade.displayName || nade.name} ·{" "}
                            {nade.mustKnow
                              ? "Must Know"
                              : nade.official
                                ? "Offiziell"
                                : "Aufnahme"}{" "}
                            ↗
                          </Link>
                        </Button>
                      ) : (
                        <Badge key={id} variant="outline">
                          Nade nicht mehr verfügbar
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function StratTasks({
  content,
  team,
  user,
  nades,
  maps,
}: LibraryProps & { content: StratContent; team: TeamView }) {
  const own = content.slots.filter(
    (slot) => slot.userId === user.identitySteam64,
  );
  return (
    <>
      <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {content.description}
      </p>
      {content.scene && <SceneExample scene={content.scene} maps={maps} />}
      <Tabs defaultValue="mine">
        <TabsList className="mb-5">
          <TabsTrigger value="mine">Meine Aufgaben</TabsTrigger>
          <TabsTrigger value="team">Teamübersicht</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          {own.length ? (
            <div className="max-w-3xl">
              {own.map((slot) => (
                <SlotTasks
                  key={slot.id}
                  slot={slot}
                  team={team}
                  nades={nades}
                  maps={maps}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Du bist noch keinem Platz zugeordnet</CardTitle>
                <CardDescription>
                  Bitte einen Owner oder Captain, dich für diese Taktik
                  einzutragen. In der Teamübersicht kannst du alle Aufgaben
                  lesen.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="team">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {content.slots.map((slot) => (
              <SlotTasks
                key={slot.id}
                slot={slot}
                team={team}
                nades={nades}
                maps={maps}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function StratPage(props: LibraryProps) {
  const { stratId } = useParams();
  const resource = useResource<{ strat: StratView; team: TeamView }>(
    `/api/strats/${stratId}`,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const strat = resource.data?.strat;
  if (!strat)
    return (
      <>
        <WorkspaceHeader
          title="Strat"
          description="Aufgaben und Teamübersicht"
        />
        <Feedback
          error={resource.error}
          message={resource.loading ? "Strat wird geladen …" : ""}
        />
        <Button onClick={resource.reload}>Neu laden</Button>
      </>
    );
  const content = strat.published?.content || strat.content;
  async function action(name: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/strats/${stratId}/${name}`, {
        method: "POST",
        body: JSON.stringify({ revision: strat.revision }),
      });
      if (name === "activate") navigate(`/strats/live/${strat.teamId}`);
      else resource.reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceHeader
        title={content.title}
        description={`${strat.teamName} · ${content.map} · ${content.side.toUpperCase()} · ${strat.published ? `Version ${strat.published.version}` : "Entwurf"}`}
      >
        <div className="flex flex-wrap gap-2">
          {strat.canEdit && (
            <>
              <Button asChild variant="outline">
                <Link to={`/strats/${strat.id}/edit`}>Entwurf bearbeiten</Link>
              </Button>
              {strat.published && !strat.archived && (
                <Button disabled={busy} onClick={() => void action("activate")}>
                  <Radio />
                  Für Team aktivieren
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const copy = structuredClone(strat.content);
                    copy.title = `${copy.title.slice(0, 110)} (Kopie)`;
                    const result = await api("/api/strats", {
                      method: "POST",
                      body: JSON.stringify({
                        teamId: strat.teamId,
                        content: copy,
                      }),
                    });
                    navigate(`/strats/${result.strat.id}/edit`);
                  } catch (cause) {
                    setError(cause.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Duplizieren
              </Button>
            </>
          )}
        </div>
      </WorkspaceHeader>
      <Feedback error={error || resource.error} />
      {strat.archived && (
        <p className="mb-4 text-sm text-muted-foreground">
          Diese Strat ist archiviert.
        </p>
      )}
      <StratTasks
        key={`${strat.id}:${strat.published?.version || 0}`}
        {...props}
        content={content}
        team={resource.data.team}
      />
      <StratExplanations stratId={strat.id} />
    </>
  );
}

export function StratEditor(props: LibraryProps) {
  const { stratId } = useParams();
  const [params] = useSearchParams();
  const resource = useResource<{ strat: StratView; team: TeamView }>(
    stratId
      ? `/api/strats/${stratId}`
      : `/api/teams/${params.get("team") || "missing"}`,
  );
  return resource.data ? (
    <EditorForm
      key={`${stratId || "new"}:${resource.data.team.id}`}
      {...props}
      team={resource.data.team}
      initial={resource.data.strat}
    />
  ) : (
    <>
      <WorkspaceHeader
        title="Strat bearbeiten"
        description="Fünf Rollen, eindeutige Aufgaben und passende Nades."
      />
      <Feedback
        error={resource.error}
        message={resource.loading ? "Editor wird geladen …" : ""}
      />
      <Button asChild variant="outline">
        <Link to="/strats">Zur Bibliothek</Link>
      </Button>
    </>
  );
}

function EditorForm({
  initial,
  team,
  maps,
  nades,
}: LibraryProps & { initial?: StratView; team: TeamView }) {
  const [strat, setStrat] = useState(initial);
  const [content, setContent] = useState<StratContent>(() =>
    structuredClone(initial?.content || newStratContent()),
  );
  const [saved, setSaved] = useState(() => JSON.stringify(content));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(content) !== saved;
  useEffect(() => {
    if (!initial || initial.revision === strat?.revision) return;
    if (dirty) {
      setMessage(
        "Diese Strat wurde inzwischen geändert. Dein Entwurf bleibt erhalten; lade vor dem Speichern den aktuellen Stand.",
      );
      return;
    }
    setStrat(initial);
    setContent(structuredClone(initial.content));
    setSaved(JSON.stringify(initial.content));
  }, [initial]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(() => dirtyRef.current);
  const navigate = useNavigate();
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  if (!team.permissions["strats.edit"])
    return (
      <Feedback error="Nur Owner und Captains dürfen Strats bearbeiten." />
    );
  function patchSlot(index: number, change: Partial<StratSlot>) {
    setContent((current) => ({
      ...current,
      slots: current.slots.map((slot, at) =>
        at === index ? { ...slot, ...change } : slot,
      ),
    }));
  }
  async function save() {
    const result = await api(
      strat ? `/api/strats/${strat.id}` : "/api/strats",
      {
        method: strat ? "PUT" : "POST",
        body: JSON.stringify({
          teamId: team.id,
          revision: strat?.revision,
          content,
        }),
      },
    );
    setStrat(result.strat);
    setContent(result.strat.content);
    setSaved(JSON.stringify(result.strat.content));
    dirtyRef.current = false;
    return result.strat as StratView;
  }
  async function perform(action: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const current = dirty || !strat ? await save() : strat;
      if (action !== "save") {
        const result = await api(`/api/strats/${current.id}/${action}`, {
          method: "POST",
          body: JSON.stringify({ revision: current.revision }),
        });
        setStrat(result.strat);
      }
      if (!strat) navigate(`/strats/${current.id}/edit`, { replace: true });
      setMessage(
        action === "publish"
          ? "Veröffentlicht. Eine bereits aktive Taktik bleibt unverändert, bis du sie erneut aktivierst."
          : action === "archive"
            ? "Strat archiviert."
            : action === "restore"
              ? "Strat wiederhergestellt."
              : "Entwurf gespeichert.",
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceHeader
        title={strat ? "Strat bearbeiten" : "Neue Strat"}
        description={`${team.name} · ${dirty ? "Ungespeicherte Änderungen" : strat ? "Entwurf gespeichert" : "Noch nicht gespeichert"}`}
      >
        <Button asChild variant="outline">
          <Link to={strat ? `/strats/${strat.id}` : "/strats"}>
            Leseansicht
          </Link>
        </Button>
      </WorkspaceHeader>
      <Feedback error={error} message={message} />
      {error && (
        <p className="mb-4 text-sm text-muted-foreground">
          Dein Entwurf bleibt hier erhalten. Bei einem Konflikt kopiere deine
          Änderungen und lade die Seite neu.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform("save");
        }}
      >
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Überblick</CardTitle>
              <CardDescription>
                Die taktischen Rollen gelten für diese Strat. Sie ändern keine
                Teamrechte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Name der Strat</FieldLabel>
                  <Input
                    value={content.title}
                    required
                    maxLength={120}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Choice
                    label="Map"
                    value={content.map}
                    options={
                      mapOptions(maps).some((map) => map.value === content.map)
                        ? mapOptions(maps)
                        : [
                            ...mapOptions(maps),
                            { value: content.map, label: content.map },
                          ]
                    }
                    onChange={(map) =>
                      setContent((current) => ({ ...current, map }))
                    }
                  />
                  <Choice
                    label="Seite"
                    value={content.side}
                    options={sideOptions}
                    onChange={(side) =>
                      setContent((current) => ({
                        ...current,
                        side: side as "t" | "ct",
                      }))
                    }
                  />
                </div>
                <Field>
                  <FieldLabel>Plan für die Runde</FieldLabel>
                  <Textarea
                    value={content.description}
                    maxLength={5000}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Ziel, Voraussetzungen und gemeinsame Abläufe"
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <ScenePicker teamId={team.id} map={content.map} value={content.scene} onChange={scene => setContent(current => ({ ...current, scene }))} />
          {content.slots.map((slot, index) => (
            <Card key={slot.id}>
              <CardHeader>
                <CardTitle>
                  Platz {index + 1} · {slot.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Rollenname</FieldLabel>
                      <Input
                        required
                        value={slot.label}
                        maxLength={80}
                        onChange={(event) =>
                          patchSlot(index, { label: event.target.value })
                        }
                      />
                    </Field>
                    <Choice
                      label={`Spieler für Platz ${index + 1}`}
                      value={slot.userId}
                      onChange={(userId) => patchSlot(index, { userId })}
                      options={[
                        { value: "", label: "Noch nicht besetzt" },
                        ...team.members
                          .filter(
                            (member) =>
                              member.userId === slot.userId ||
                              !content.slots.some(
                                (other) => other.userId === member.userId,
                              ),
                          )
                          .map((member) => ({
                            value: member.userId,
                            label: member.name || member.userId,
                          })),
                        ...(slot.userId &&
                        !team.members.some(
                          (member) => member.userId === slot.userId,
                        )
                          ? [
                              {
                                value: slot.userId,
                                label:
                                  "Nicht mehr im Team · bitte neu besetzen",
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                  {slot.steps.map((step, stepIndex) => {
                    const update = (change: object) =>
                      patchSlot(index, {
                        steps: slot.steps.map((item) =>
                          item.id === step.id ? { ...item, ...change } : item,
                        ),
                      });
                    const move = (direction: number) => {
                      const steps = [...slot.steps];
                      [steps[stepIndex], steps[stepIndex + direction]] = [
                        steps[stepIndex + direction],
                        steps[stepIndex],
                      ];
                      patchSlot(index, { steps });
                    };
                    return (
                      <div
                        key={step.id}
                        className="rounded-lg border bg-muted/20 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-medium">
                            Schritt {stepIndex + 1}
                          </h3>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={stepIndex === 0}
                              aria-label={`Schritt ${stepIndex + 1} nach oben`}
                              onClick={() => move(-1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={stepIndex === slot.steps.length - 1}
                              aria-label={`Schritt ${stepIndex + 1} nach unten`}
                              onClick={() => move(1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Schritt ${stepIndex + 1} entfernen`}
                              onClick={() =>
                                patchSlot(index, {
                                  steps: slot.steps.filter(
                                    (item) => item.id !== step.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <FieldGroup>
                          <Field>
                            <FieldLabel>Aufgabe</FieldLabel>
                            <Textarea
                              required
                              maxLength={2000}
                              value={step.text}
                              onChange={(event) =>
                                update({ text: event.target.value })
                              }
                            />
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                              <FieldLabel>Position</FieldLabel>
                              <Input
                                maxLength={200}
                                value={step.position}
                                onChange={(event) =>
                                  update({ position: event.target.value })
                                }
                                placeholder="z. B. T-Ramp"
                              />
                            </Field>
                            <Field>
                              <FieldLabel>Timing</FieldLabel>
                              <Input
                                maxLength={200}
                                value={step.timing}
                                onChange={(event) =>
                                  update({ timing: event.target.value })
                                }
                                placeholder="z. B. Auf Call oder bei 1:45"
                              />
                            </Field>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {step.nadeIds.map((id) => {
                              const nade = nades.find((nade) => nade.id === id);
                              return (
                                <Button
                                  key={id}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    update({
                                      nadeIds: step.nadeIds.filter(
                                        (value) => value !== id,
                                      ),
                                    })
                                  }
                                >
                                  {nade?.displayName ||
                                    nade?.name ||
                                    "Nade fehlt"}
                                  {nade && nade.map !== content.map
                                    ? " · Andere Map"
                                    : ""}
                                  <span aria-label="Verknüpfung entfernen">
                                    ×
                                  </span>
                                </Button>
                              );
                            })}
                          </div>
                          <ScenePicker teamId={team.id} map={content.map} value={step.scene} onChange={scene => update({ scene })} />
                          <Choice
                            label="Nade verknüpfen"
                            value=""
                            disabled={step.nadeIds.length >= 10}
                            options={[
                              { value: "", label: "Nade dieser Map auswählen" },
                              ...nades
                                .filter(
                                  (nade) =>
                                    nade.map === content.map &&
                                    nade.id &&
                                    !step.nadeIds.includes(nade.id),
                                )
                                .map((nade) => ({
                                  value: nade.id,
                                  label: nade.displayName || nade.name,
                                })),
                            ]}
                            onChange={(id) => {
                              if (id)
                                update({ nadeIds: [...step.nadeIds, id] });
                            }}
                          />
                        </FieldGroup>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={slot.steps.length >= 40}
                    onClick={() =>
                      patchSlot(index, {
                        steps: [
                          ...slot.steps,
                          {
                            id: newWorkspaceId(),
                            text: "",
                            position: "",
                            timing: "",
                            nadeIds: [],
                          },
                        ],
                      })
                    }
                  >
                    <Plus />
                    Schritt hinzufügen
                  </Button>
                </FieldGroup>
              </CardContent>
            </Card>
          ))}
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-4 shadow-lg">
            <Button type="submit" disabled={!dirty && !!strat}>
              <Save />
              {busy ? "Wird gespeichert …" : "Entwurf speichern"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!!strat?.archived}
              onClick={() => void perform("publish")}
            >
              Speichern und veröffentlichen
            </Button>
            {strat && (
              <ConfirmAction
                disabled={busy}
                title={strat.archived ? "Wiederherstellen" : "Archivieren"}
                description={
                  strat.archived
                    ? "Die Strat wird wieder in der Bibliothek angezeigt."
                    : "Die Strat wird in der Bibliothek für Mitglieder ausgeblendet. Eine bereits aktive Fassung bleibt bis zum Beenden in der Live-Ansicht erhalten."
                }
                onConfirm={() =>
                  perform(strat.archived ? "restore" : "archive")
                }
              >
                {strat.archived ? "Wiederherstellen" : "Archivieren"}
              </ConfirmAction>
            )}
            <span className="text-xs text-muted-foreground">
              {strat?.published
                ? `Veröffentlichte Version ${strat.published.version}`
                : "Noch nicht veröffentlicht"}
            </span>
          </div>
        </fieldset>
      </form>
      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ungespeicherte Änderungen</DialogTitle>
            <DialogDescription>
              Deine Änderungen gehen beim Verlassen des Editors verloren.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => blocker.state === "blocked" && blocker.reset()}
            >
              Weiter bearbeiten
            </Button>
            <Button
              onClick={() => blocker.state === "blocked" && blocker.proceed()}
            >
              Änderungen verwerfen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LiveStratsPage(props: LibraryProps) {
  const { teamId } = useParams();
  const teams = useResource<{ entries: TeamView[] }>("/api/teams");
  const navigate = useNavigate();
  return (
    <>
      <WorkspaceHeader
        title="Live-Ansicht"
        description="Eine aktive Taktik für das ganze Team. Deine Aufgaben wechseln automatisch mit."
      />
      <div className="mb-6 max-w-sm">
        <Choice
          label="Team"
          value={teamId || ""}
          onChange={(id) =>
            navigate(id ? `/strats/live/${id}` : "/strats/live")
          }
          options={[
            { value: "", label: "Team auswählen" },
            ...(teams.data?.entries || []).map((team) => ({
              value: team.id,
              label: team.name,
            })),
          ]}
        />
      </div>
      <Feedback error={teams.error} />
      {teamId ? (
        <LiveTeam key={teamId} {...props} teamId={teamId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Für welches Team spielst du?</CardTitle>
            <CardDescription>
              Wähle oben ein Team, um seine aktive Taktik zu öffnen.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}

function LiveTeam({ teamId, ...props }: LibraryProps & { teamId: string }) {
  const live = useResource<{ team: TeamView }>(`/api/teams/${teamId}/live`);
  const strats = useResource<{ entries: StratView[] }>("/api/strats");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const team = live.data?.team;
  const active = team?.active;
  const choices = (strats.data?.entries || []).filter(
    (strat) => strat.teamId === teamId && strat.published && !strat.archived,
  );
  async function activate() {
    setBusy(true);
    setError("");
    try {
      const strat = choices.find((strat) => strat.id === selected);
      await api(`/api/strats/${selected}/activate`, {
        method: "POST",
        body: JSON.stringify({ revision: strat?.revision }),
      });
      live.reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Feedback error={error || live.error} />
      {live.error && team && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Verbindung unterbrochen. Angezeigt wird der letzte bestätigte Stand.
          Neuer Versuch erfolgt automatisch.
        </p>
      )}
      {!team ? (
        <p role="status">
          {live.loading
            ? "Teamstand wird geladen …"
            : "Kein zugänglicher Teamstand."}
        </p>
      ) : (
        <>
          {team.permissions["strats.activate"] && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Taktik auswählen</CardTitle>
                <CardDescription>
                  Die Aktivierung gilt für alle geöffneten Live-Ansichten von{" "}
                  {team.name}.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1">
                  <Choice
                    label="Veröffentlichte Strat"
                    value={selected}
                    onChange={setSelected}
                    options={[
                      { value: "", label: "Strat auswählen" },
                      ...choices.map((strat) => ({
                        value: strat.id,
                        label: `${titleOf(strat)} · V${strat.published.version}`,
                      })),
                    ]}
                  />
                </div>
                <Button
                  disabled={!selected || busy || !!live.error}
                  onClick={() => void activate()}
                >
                  <Radio />
                  Aktivieren
                </Button>
                {active && (
                  <ConfirmAction
                    title="Aktive Taktik beenden"
                    description="Alle Teammitglieder sehen danach, dass keine Taktik aktiv ist."
                    onConfirm={async () => {
                      await api(`/api/teams/${team.id}/live`, {
                        method: "DELETE",
                        body: JSON.stringify({ revision: team.revision }),
                      });
                      live.reload();
                    }}
                  >
                    Beenden
                  </ConfirmAction>
                )}
              </CardContent>
            </Card>
          )}
          {active ? (
            <>
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="control-title text-2xl">
                    {active.content.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {active.content.map} · {active.content.side.toUpperCase()} ·
                    Version {active.version}
                  </p>
                </div>
                <Badge variant="secondary">
                  {live.error
                    ? "Letzter Stand"
                    : live.connection === "connected"
                      ? "Live · verbunden"
                      : "Verbindung unterbrochen · wird wiederhergestellt"}
                </Badge>
              </div>
              <StratTasks
                key={active.activationId}
                {...props}
                content={active.content}
                team={team}
              />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Keine Taktik aktiv</CardTitle>
                <CardDescription>
                  Ein Owner oder Captain kann eine veröffentlichte Strat für{" "}
                  {team.name} aktivieren.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </>
      )}
    </>
  );
}
