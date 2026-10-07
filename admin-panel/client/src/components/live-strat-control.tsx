import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Radio, Search } from "lucide-react";
import type { Actor } from "../../../shared/authorization";
import type { StratView, TeamView } from "../../../shared/strats";
import { api } from "@/lib/api";
import { MAP_CARD_ART } from "@/lib/map-card-art";
import { filterLiveStrats, playableStrats, type LiveFilters } from "@/lib/live-strats";
import type { MapDefinition } from "@/lib/maps";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Choice, ConfirmAction, Feedback, useResource, WorkspaceHeader } from "./workspace-ui";
import { EconomySelection, StratEconomySummary } from "./strat-economy";

const emptyFilters: LiveFilters = { map: "", side: "", ownEconomy: [], opponentEconomy: [], query: "" };

type Props = { user: Actor; nades: any[]; maps: MapDefinition[] };
export function LiveStratSettingsPage({ maps }: Props) {
  const { teamId } = useParams();
  const teams = useResource<{ entries: TeamView[] }>("/api/teams");
  if (teamId) return <LiveControl key={teamId} teamId={teamId} maps={maps} teams={teams.data?.entries || []} teamsError={teams.error} />;
  return <>
    <WorkspaceHeader title="Live verwalten" description="Öffne dein Team, gehe live und rufe den nächsten Spielzug mit einem Tap auf." />
    <Feedback error={teams.error} />
    {teams.loading ? <p role="status">Teams werden geladen …</p> : teams.error ? <Button variant="outline" onClick={teams.reload}>Erneut laden</Button> :
      teams.data?.entries.length ? <div className="live-team-grid">{teams.data.entries.map(team => <Link className="live-team-card" key={team.id} to={`/strats/control/${team.id}`}>
        <Badge variant={team.live ? "success" : "outline"}>{team.live ? "Live" : "Offline"}</Badge>
        <h2>{team.name}</h2><p>{team.active?.content.title || `${team.members.length} Mitglieder`}</p><span>Session öffnen →</span>
      </Link>)}</div> : <p>Gründe zuerst ein <Link className="underline" to="/teams">Team</Link> oder nimm eine Einladung an.</p>}
  </>;
}

function LiveControl({ teamId, teams, maps, teamsError }: { teamId: string; teams: TeamView[]; maps: MapDefinition[]; teamsError: string }) {
  const navigate = useNavigate();
  const live = useResource<{ team: TeamView }>(`/api/teams/${teamId}/live`);
  const strats = useResource<{ entries: StratView[] }>("/api/strats");
  const [filters, setFilters] = useState<LiveFilters>(emptyFilters);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const team = live.data?.team;
  const active = team?.active;
  const connected = live.connection === "connected" && !live.error;
  const permitted = !!team?.permissions["strats.activate"];
  const available = playableStrats(strats.data?.entries || [], teamId);
  const visible = filterLiveStrats(available, filters);
  const disabled = !!pending || !connected || !permitted;
  const hasFilters = filters.map || filters.side || filters.query || filters.ownEconomy.length || filters.opponentEconomy.length;
  const mapName = (name: string) => maps.find(map => map.mapName === name)?.name || name;
  function filter<K extends keyof LiveFilters>(key: K, value: LiveFilters[K]) { setFilters(current => ({ ...current, [key]: value })); }
  async function mutate(path: string, method: string, revision: number, label: string) {
    if (lock.current) return;
    lock.current = true; setPending(label); setError("");
    try {
      const result = await api(path, { method, body: JSON.stringify({ revision }) });
      // The live subscription is authoritative; mutations also return the confirmed team.
      if (result.team) live.setData(current => !current || result.team.revision >= current.team.revision ? { team: result.team } : current);
    } catch (cause) { setError(cause.message); throw cause; }
    finally { lock.current = false; setPending(""); }
  }
  return <section className="live-console" aria-label="Live verwalten">
    <header className="live-console-toolbar">
      <Button asChild variant="ghost"><Link to={`/strats?team=${teamId}`}><ArrowLeft />Bibliothek</Link></Button>
      <div className="live-console-heading"><h1>Live verwalten</h1><span>{team?.name || "Team wird geladen …"}</span></div>
      <Badge variant={team?.live && connected ? "success" : "outline"}><span className="live-indicator" data-connected={team?.live && connected} />{!connected ? "Verbindung wird aufgebaut …" : team?.live ? "Team ist live" : "Offline"}</Badge>
      {team && (team.live ? <Button asChild variant="outline"><Link to={`/strats/live/${teamId}`}>Meine Live-Ansicht</Link></Button> :
        permitted && <Button disabled={disabled} onClick={() => void mutate(`/api/teams/${teamId}/live`, "POST", team.revision, "start").catch(() => {})}><Radio />{pending === "start" ? "Startet …" : "Live starten"}</Button>)}
    </header>
    <div className="live-console-layout">
      <main className="live-console-strats">
        <Feedback error={error || live.error || strats.error || teamsError} />
        {!connected && team && <p role="status" className="live-notice">Letzter bestätigter Stand. Spielzüge lassen sich nach dem Verbinden wieder auswählen.</p>}
        <section className="live-current" aria-label="Aktueller Spielzug" aria-live="polite">
          <span className="control-kicker">{team?.live ? "Für das ganze Team" : "Session vorbereiten"}</span>
          <h2>{active?.content.title || (team?.live ? "Bereit für den nächsten Spielzug" : "Starte eure Live-Session")}</h2>
          <p>{active ? `${mapName(active.content.map)} · ${active.content.side.toUpperCase()} · Version ${active.version}` : team?.live ? "Tippe eine Strat an. Alle sehen sofort ihre Aufgabe unter Live." : "Filtere eure Strats und gehe mit dem Team live, um einen Spielzug aufzurufen."}</p>
          {!permitted && team && <p>Ein Owner oder Captain steuert die Spielzüge.</p>}
        </section>
        <div className="live-results-heading"><h2>Spielzüge <span>{visible.length}</span></h2><div className="live-search"><Search aria-hidden="true" /><Input aria-label="Spielzüge suchen" placeholder="Spielzug suchen …" value={filters.query} onChange={event => filter("query", event.target.value)} /></div></div>
        {strats.loading || live.loading ? <p role="status">Spielzüge werden geladen …</p> : visible.length ? <div className="live-strat-grid">{visible.map(strat => {
          const content = strat.published.content;
          const selected = active?.stratId === strat.id && active.version === strat.published.version;
          const art = MAP_CARD_ART[content.map];
          const nades = new Set(content.slots.flatMap(slot => slot.steps.flatMap(step => step.nadeIds)));
          return <button type="button" className="live-strat-card" key={strat.id} data-active={selected} aria-pressed={selected} disabled={disabled || !team?.live || !!strats.error || selected} onClick={() => void mutate(`/api/strats/${strat.id}/activate`, "POST", strat.revision, strat.id).catch(() => {})}>
            <span className="live-strat-art">{art?.imageUrl && <img src={art.imageUrl} alt="" loading="lazy" />}<span>{mapName(content.map)} · {content.side.toUpperCase()}</span><Badge variant={selected ? "success" : "secondary"}>{selected ? <><Check />Aktiv</> : `V${strat.published.version}`}</Badge></span>
            <div className="live-strat-body"><strong>{content.title}</strong><span className="live-strat-description">{content.description || "Euer Spielzug für die nächste Runde."}</span><StratEconomySummary content={content} /><span className="live-strat-footer"><span>{nades.size} {nades.size === 1 ? "Lineup" : "Lineups"} · {content.slots.filter(slot => slot.userId).length}/5 besetzt</span><span>{pending === strat.id ? "Wird aufgerufen …" : selected ? "Für alle aktiv" : !team?.live ? "Nach Sessionstart auswählbar" : "Aufrufen →"}</span></span></div>
          </button>;
        })}</div> : <div className="live-no-results"><h3>{available.length ? "Kein passender Spielzug" : "Noch keine veröffentlichten Strats"}</h3><p>{available.length ? "Passe die Filter an, um weitere Spielzüge zu sehen." : "Veröffentliche einen Spielzug in der Bibliothek. Entwürfe sind hier noch nicht verfügbar."}</p>{hasFilters ? <Button variant="outline" onClick={() => setFilters(emptyFilters)}>Filter zurücksetzen</Button> : <Button asChild variant="outline"><Link to={`/strats?team=${teamId}`}>Zur Bibliothek</Link></Button>}</div>}
      </main>
      <aside className="live-console-filters" aria-label="Spielzüge filtern">
        <div className="live-filter-heading"><h2>Rundensituation</h2>{!!hasFilters && <Button variant="ghost" onClick={() => setFilters(emptyFilters)}>Zurücksetzen</Button>}</div>
        <Choice label="Team" value={teamId} onChange={id => navigate(`/strats/control/${id}`)} options={(teams.length ? teams : team ? [team] : []).map(item => ({ value: item.id, label: item.name }))} />
        <Choice label="Map" value={filters.map} onChange={value => filter("map", value)} options={[{ value: "", label: "Alle Maps" }, ...maps.filter(map => available.some(strat => strat.published.content.map === map.mapName)).map(map => ({ value: map.mapName, label: map.name }))]} />
        <Choice label="Seite" value={filters.side} onChange={value => filter("side", value)} options={[{ value: "", label: "T und CT" }, { value: "t", label: "T · Angriff" }, { value: "ct", label: "CT · Verteidigung" }]} />
        <EconomySelection compact label="Unser Buy" value={filters.ownEconomy} onChange={value => filter("ownEconomy", value)} />
        <EconomySelection compact label="Gegnerischer Buy" value={filters.opponentEconomy} onChange={value => filter("opponentEconomy", value)} />
        {team?.live && permitted && <div className="live-session-actions">
          {active && <ConfirmAction title="Spielzug abwählen" description="Das Team bleibt live und wartet auf den nächsten Spielzug." disabled={disabled} onConfirm={() => mutate(`/api/teams/${teamId}/live/strat`, "DELETE", team.revision, "clear")}>Spielzug abwählen</ConfirmAction>}
          <ConfirmAction title="Session beenden" description="Das Team geht offline. Der aktuelle Spielzug wird für alle entfernt." disabled={disabled} onConfirm={() => mutate(`/api/teams/${teamId}/live`, "DELETE", team.revision, "stop")}>Session beenden</ConfirmAction>
        </div>}
      </aside>
    </div>
  </section>;
}
