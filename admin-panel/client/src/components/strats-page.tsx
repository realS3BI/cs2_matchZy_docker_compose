import { WorkspaceNavigation } from "./workspace-navigation";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "./ui/empty";
import { SceneExample } from "./demo-player";
import { StratExplanations } from "./live-session-pages";
import { ScenePicker } from "./scene-picker";
import { EconomySelection, StratEconomySummary } from "./strat-economy";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Radio,
  Save,
  Trash2,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { lineupPath } from "@/lib/lineups";
import type { MapDefinition } from "@/lib/maps";
import type { Actor } from "../../../shared/authorization";
import {
  newStratContent,
  newWorkspaceId,
  matchesEconomy,
  type StratEconomy,
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

export function StratsPage({ maps }: LibraryProps) {
  const teams = useResource<{ entries: TeamView[] }>("/api/teams");
  const strats = useResource<{ entries: StratView[] }>("/api/strats");
  const [search, setSearch] = useSearchParams();
  const teamId = search.get("team") || "";
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("");
  const [side, setSide] = useState("");
  const [ownEconomy, setOwnEconomy] = useState<StratEconomy[]>([]);
  const [opponentEconomy, setOpponentEconomy] = useState<StratEconomy[]>([]);
  const [archived, setArchived] = useState(false);
  const editable =
    teams.data?.entries.filter((team) => team.permissions["strats.edit"]) || [];
  const available = (strats.data?.entries || []).filter(
    (strat) =>
      (!teamId || strat.teamId === teamId) && strat.archived === archived,
  );
  const entries = available.filter(
    (strat) =>
      (!map || strat.content.map === map) &&
      (!side || strat.content.side === side) &&
      matchesEconomy(strat.content.ownEconomy, ownEconomy) &&
      matchesEconomy(strat.content.opponentEconomy, opponentEconomy) &&
      `${strat.content.title} ${strat.content.description}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const filtered = Boolean(
    query || map || side || ownEconomy.length || opponentEconomy.length,
  );
  const createPath = `/strats/new?team=${editable.find((team) => team.id === teamId)?.id || editable[0]?.id || ""}`;
  function resetFilters() {
    setQuery("");
    setMap("");
    setSide("");
    setOwnEconomy([]);
    setOpponentEconomy([]);
  }
  return (
    <>
      <WorkspaceHeader
        title="Strat-Bibliothek"
        description="Der Spielplan deiner Teams. Finde eine Taktik, lies die Aufgaben und bereite die nächste Runde vor."
      >
        {editable.length > 0 && (
          <Button asChild>
            <Link to={createPath}>
              <Plus data-icon="inline-start" />
              Neue Strat
            </Link>
          </Button>
        )}
      </WorkspaceHeader>
      <WorkspaceNavigation
        label="Strats-Navigation"
        items={[
          {
            label: "Bibliothek",
            path: teamId ? `/strats?team=${teamId}` : "/strats",
            active: true,
          },
          {
            label: "Live verwalten",
            path: teamId ? `/strats/control/${teamId}` : "/strats/control",
          },
        ]}
      />
      <Feedback error={teams.error || strats.error} />
      <Card className="mb-5">
        <CardContent className="pt-5">
          <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_0.8fr]">
            <Field htmlFor="strat-search">
              <FieldLabel>Suchen</FieldLabel>
              <Input
                id="strat-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name oder Beschreibung"
              />
            </Field>
            <Choice
              label="Team"
              value={teamId}
              onChange={(team) =>
                setSearch((current) => {
                  const next = new URLSearchParams(current);
                  if (team) next.set("team", team);
                  else next.delete("team");
                  return next;
                })
              }
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
          </FieldGroup>
          <details className="mt-5 border-t pt-4">
            <summary className="w-fit cursor-pointer text-sm text-muted-foreground">
              Kaufsituation filtern
              {ownEconomy.length + opponentEconomy.length > 0
                ? ` · ${ownEconomy.length + opponentEconomy.length} ausgewählt`
                : ""}
            </summary>
            <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
              <EconomySelection
                label="Unsere Kaufsituation"
                value={ownEconomy}
                onChange={setOwnEconomy}
              />
              <EconomySelection
                label="Kaufsituation der Gegner"
                value={opponentEconomy}
                onChange={setOpponentEconomy}
              />
            </FieldGroup>
          </details>
        </CardContent>
      </Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          className="workspace-tabs"
          value={archived ? "archive" : "library"}
          onValueChange={(value) => setArchived(value === "archive")}
        >
          <TabsList variant="line">
            <TabsTrigger value="library">Aktuelle Strats</TabsTrigger>
            {editable.length > 0 && (
              <TabsTrigger value="archive">Archiv</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <span role="status" className="text-xs text-muted-foreground">
            {entries.length} von {available.length} Strats
          </span>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>
      {strats.loading || teams.loading ? (
        <p role="status">Strats werden geladen …</p>
      ) : strats.error || teams.error ? (
        <Button
          variant="outline"
          onClick={() => {
            strats.reload();
            teams.reload();
          }}
        >
          Erneut laden
        </Button>
      ) : entries.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>
              {filtered
                ? "Keine passende Strat"
                : archived
                  ? "Das Archiv ist leer"
                  : "Dein Spielplan beginnt hier"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Passe die Suche oder die Filter an, um weitere Taktiken zu sehen."
                : teams.data?.entries.length
                  ? "Owner und Captains legen Taktiken an und veröffentlichen sie für das Team."
                  : "Gründe ein Team oder tritt über einen Einladungslink bei. Danach findest du hier eure Strats."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button variant="outline" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            ) : editable.length && !archived ? (
              <Button asChild>
                <Link to={createPath}>Erste Strat anlegen</Link>
              </Button>
            ) : !teams.data?.entries.length ? (
              <Button asChild variant="outline">
                <Link to="/teams">Zu meinen Teams</Link>
              </Button>
            ) : null}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((strat) => {
            const mapInfo = maps.find(
              (map) => map.mapName === strat.content.map,
            );
            const assigned = strat.content.slots.filter(
              (slot) => slot.userId,
            ).length;
            return (
              <Card key={strat.id} className="strat-library-card">
                <div className="strat-map-strip">
                  {mapInfo?.radarUrl && (
                    <img src={mapInfo.radarUrl} alt="" loading="lazy" />
                  )}
                  <span>{mapInfo?.name || strat.content.map}</span>
                  <Badge variant="secondary">
                    {strat.content.side.toUpperCase()}
                  </Badge>
                </div>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardDescription>{strat.teamName}</CardDescription>
                    <Badge
                      variant={
                        strat.archived
                          ? "outline"
                          : strat.published
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {strat.archived
                        ? "Archiviert"
                        : strat.published
                          ? `Veröffentlicht · V${strat.published.version}`
                          : "Entwurf"}
                    </Badge>
                  </div>
                  <CardTitle>
                    <Link
                      to={`/strats/${strat.id}`}
                      className="hover:underline"
                    >
                      {strat.content.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2 whitespace-pre-wrap">
                    {strat.content.description || "Noch keine Beschreibung."}
                  </CardDescription>
                  <StratEconomySummary content={strat.content} />
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    {assigned} von {strat.content.slots.length} Rollen besetzt ·{" "}
                    {strat.content.slots.reduce(
                      (count, slot) => count + slot.steps.length,
                      0,
                    )}{" "}
                    {strat.content.slots.reduce(
                      (count, slot) => count + slot.steps.length,
                      0,
                    ) === 1
                      ? "Schritt"
                      : "Schritte"}
                  </p>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/strats/${strat.id}`}>Strat öffnen</Link>
                    </Button>
                    {strat.canEdit && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/strats/${strat.id}/edit`}>Bearbeiten</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
                  {step.scene && (
                    <SceneExample scene={step.scene} maps={maps} />
                  )}
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
              {!resource.data?.team.live && (
                <Button asChild variant="outline">
                  <Link to={`/strats/control/${strat.teamId}`}>
                    Team live schalten
                  </Link>
                </Button>
              )}
              {strat.published && !strat.archived && (
                <Button
                  disabled={busy || !resource.data?.team.live}
                  onClick={() => void action("activate")}
                >
                  <Radio />
                  Spielzug auswählen
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
      <div className="mb-6">
        <StratEconomySummary content={content} />
      </div>
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
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <EconomySelection
                    label="Unsere Kaufsituation"
                    value={content.ownEconomy || []}
                    disabled={busy}
                    onChange={(ownEconomy) =>
                      setContent((current) => ({ ...current, ownEconomy }))
                    }
                  />
                  <EconomySelection
                    label="Kaufsituation der Gegner"
                    value={content.opponentEconomy || []}
                    disabled={busy}
                    onChange={(opponentEconomy) =>
                      setContent((current) => ({ ...current, opponentEconomy }))
                    }
                  />
                </FieldGroup>
              </FieldGroup>
            </CardContent>
          </Card>
          <ScenePicker
            teamId={team.id}
            map={content.map}
            value={content.scene}
            onChange={(scene) =>
              setContent((current) => ({ ...current, scene }))
            }
          />
          {content.slots.map((slot, index) => (
            <details
              key={slot.id}
              className="disclosure-panel"
              onInvalid={(event) => {
                event.currentTarget.open = true;
              }}
            >
              <summary className="flex flex-wrap items-center gap-3">
                <ChevronRight
                  className="disclosure-chevron size-4"
                  aria-hidden="true"
                />
                <span className="flex-1">
                  Platz {index + 1} · {slot.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {team.members.find((member) => member.userId === slot.userId)
                    ?.name || "Noch nicht besetzt"}{" "}
                  · {slot.steps.length}{" "}
                  {slot.steps.length === 1 ? "Schritt" : "Schritte"}
                </span>
              </summary>
              <Card>
                <CardHeader>
                  <CardTitle>Rolle und Aufgaben</CardTitle>
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
                                const nade = nades.find(
                                  (nade) => nade.id === id,
                                );
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
                            <ScenePicker
                              teamId={team.id}
                              map={content.map}
                              value={step.scene}
                              onChange={(scene) => update({ scene })}
                            />
                            <Choice
                              label="Nade verknüpfen"
                              value=""
                              disabled={step.nadeIds.length >= 10}
                              options={[
                                {
                                  value: "",
                                  label: "Nade dieser Map auswählen",
                                },
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
            </details>
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

export { LiveStratSettingsPage } from "./live-strat-control";
