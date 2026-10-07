import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Radio } from "lucide-react";
import type { Actor } from "../../../shared/authorization";
import type { StratSlot, TeamView } from "../../../shared/strats";
import type { MapDefinition } from "@/lib/maps";
import { MAP_CARD_ART } from "@/lib/map-card-art";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Feedback, useResource } from "./workspace-ui";
import { LiveLineupCard, type LiveLineup } from "./live-lineup";

type Props = { user: Actor; nades: LiveLineup[]; maps: MapDefinition[] };
function LiveEmpty({ title, description }: { title: string; description: string }) {
  return <div className="live-no-results" role="status"><Radio /><h2>{title}</h2><p>{description}</p></div>;
}
export function LiveStratsPage(props: Props) {
  const { teamId } = useParams();
  return teamId ? <LiveTask key={teamId} {...props} teamId={teamId} /> : <LiveEntry />;
}
function LiveEntry() {
  const teams = useResource<{ entries: TeamView[] }>("/api/teams");
  const active = teams.data?.entries.filter(team => team.live) || [];
  if (active.length === 1 && !teams.error) return <Navigate to={`/strats/live/${active[0].id}`} replace />;
  return <section className="live-player"><header className="live-console-toolbar"><Button asChild variant="ghost"><Link to="/strats"><ArrowLeft />Bibliothek</Link></Button><h1>Live</h1></header><main className="live-player-body">
    <Feedback error={teams.error} />
    {active.length ? <><h2>Wähle dein Team</h2><div className="live-team-grid">{active.map(team => <Link key={team.id} className="live-team-card" to={`/strats/live/${team.id}`}><Badge variant="success">Live</Badge><h2>{team.name}</h2><p>{team.active?.content.title || "Wartet auf Spielzug"}</p><span>Meine Aufgabe öffnen →</span></Link>)}</div></> : <LiveEmpty title={teams.loading ? "Live wird geladen …" : "Kein Team live"} description="Sobald dein Team live geht, findest du hier deine Aufgabe." />}
    {!teams.loading && <Button asChild variant="outline"><Link to="/strats/control">Live verwalten</Link></Button>}
  </main></section>;
}
function LiveTask({ teamId, user, nades, maps }: Props & { teamId: string }) {
  const live = useResource<{ team: TeamView }>(`/api/teams/${teamId}/live`);
  const team = live.data?.team;
  const active = team?.active;
  const own = active?.content.slots.filter(slot => slot.userId === user.identitySteam64) || [];
  const connected = !live.error && live.connection === "connected";
  const map = maps.find(map => map.mapName === active?.content.map);
  const art = active && MAP_CARD_ART[active.content.map];
  return <section className="live-player" aria-label="Meine Live-Aufgabe">
    <header className="live-console-toolbar"><Button asChild variant="ghost"><Link to="/strats"><ArrowLeft />Bibliothek</Link></Button><span className="live-console-heading">{team?.name || "Live"}</span><Badge variant={connected && team?.live ? "success" : "outline"}><span className="live-indicator" data-connected={connected && team?.live} />{!connected ? "Letzter Stand" : team?.live ? "Live" : "Offline"}</Badge><Button asChild variant="outline"><Link to="/strats/live">Teams</Link></Button>{team?.permissions["strats.activate"] && <Button asChild variant="outline"><Link to={`/strats/control/${teamId}`}>Verwalten</Link></Button>}</header>
    <main className="live-player-body"><Feedback error={live.error} />
      {!connected && team && <p role="status" className="live-notice">Verbindung unterbrochen. Du siehst den letzten bestätigten Spielzug. Änderungen werden nach dem Verbinden angezeigt.</p>}
      {!team ? <LiveEmpty title={live.loading ? "Deine Aufgabe wird geladen …" : "Team nicht verfügbar"} description="Wähle ein zugängliches Team unter Live." /> : !team.live ? <LiveEmpty title="Die Session ist beendet" description={`${team.name} ist gerade offline.`} /> : <>
        <header className="live-play-heading">{art?.logoUrl && <img src={art.logoUrl} alt="" />}<div><p className="control-kicker">{active ? `${map?.name || active.content.map} · ${active.content.side.toUpperCase()} · V${active.version}` : "Team bereit"}</p><h1>{active?.content.title || "Wartet auf Spielzug"}</h1>{active?.content.description && <p>{active.content.description}</p>}</div></header>
        {!active ? <LiveEmpty title="Gleich geht’s los" description="Sobald Captain oder Owner einen Spielzug auswählt, erscheint hier deine Aufgabe." /> : !own.length ? <LiveEmpty title="Dir ist kein Platz zugewiesen" description="Ein Owner oder Captain kann deinen Account im Spielzug einem Platz zuordnen." /> : <div key={active.activationId}>{own.map(slot => <LiveAssignment key={slot.id} slot={slot} nades={nades} maps={maps} />)}</div>}
      </>}
    </main>
  </section>;
}
function LiveAssignment({ slot, nades, maps }: { slot: StratSlot; nades: LiveLineup[]; maps: MapDefinition[] }) {
  const [index, setIndex] = useState(0);
  const step = slot.steps[index];
  const byId = new Map(nades.map(nade => [nade.id, nade]));
  return <section className="live-assignment" aria-label={`Deine Aufgabe: ${slot.label}`}>
    <aside className="live-step-list"><p className="control-kicker">Dein Platz</p><h2>{slot.label}</h2><nav aria-label="Aufgabenschritte">{slot.steps.map((item, number) => <button type="button" key={item.id} onClick={() => setIndex(number)} aria-current={number === index ? "step" : undefined}><span>{number < index ? <Check /> : String(number + 1).padStart(2, "0")}</span><span>{item.position || item.text || `Schritt ${number + 1}`}</span></button>)}</nav></aside>
    {step ? <div className="live-step-focus" aria-live="polite"><div className="live-step-eyebrow"><Badge variant="secondary">Schritt {index + 1} / {slot.steps.length}</Badge>{step.timing && <span>{step.timing}</span>}</div><h2>{step.text || "Lineup ausführen"}</h2>{step.position && <p className="live-step-position">Position · {step.position}</p>}
      {step.nadeIds.length > 0 && <div className="live-lineup-grid">{step.nadeIds.map(id => { const nade = byId.get(id); return nade ? <LiveLineupCard key={`${step.id}-${id}`} nade={nade} map={maps.find(map => map.mapName === nade.map)} /> : <p key={id} className="live-notice">Lineup nicht mehr verfügbar.</p>; })}</div>}
      <div className="live-step-navigation"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft />Zurück</Button><span>{index === slot.steps.length - 1 ? "Letzter Schritt · auf den nächsten Call warten" : "Bereit? Weiter zum nächsten Schritt."}</span><Button disabled={index === slot.steps.length - 1} onClick={() => setIndex(value => value + 1)}>Weiter<ArrowRight /></Button></div>
    </div> : <LiveEmpty title="Noch keine Schritte" description="Für deinen Platz sind noch keine Anweisungen hinterlegt." />}
  </section>;
}
