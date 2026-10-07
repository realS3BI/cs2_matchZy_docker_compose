import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bomb,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Shield,
  ShieldCheck,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { api } from "@/lib/api";
import { serverNow } from "@/lib/live";
import { inferRadarCalibration, worldToRadar } from "@/lib/nade-radar";
import { radarPointVisible, type RadarLevel } from "@/lib/radar-layout";
import type { MapDefinition } from "@/lib/maps";
import {
  loadoutSummary,
  playbackTime,
  roundClock,
  roundEnd,
  roundStart,
  type DemoEvent,
  type PlayerLoadout,
  type RoundPhase,
  type Demo,
  type Playback,
  type RoundReplay,
  type SceneReference,
  type PlayerFrame,
} from "../../../shared/demos";
import { Button } from "./ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";
import { RadarBackground } from "./radar-background";
import { RadarLevelSwitch } from "./radar-level-switch";
import { Choice, Feedback } from "./workspace-ui";
import { GrenadeIcon } from "./nade-icons";
import { economyOptions } from "../../../shared/strats";

export const demoTime = (seconds: number) => {
  const value = Math.abs(seconds);
  return `${seconds < 0 ? "−" : ""}${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};
// Countdowns round up like the in-game clock.
const countdown = (seconds: number) => demoTime(Math.ceil(Math.max(0, seconds) - 0.001));
export const phaseLabels: Record<RoundPhase, string> = {
  buy: "Kaufphase",
  live: "Runde",
  planted: "Bombe gelegt",
  over: "Rundenende",
};
export const buyLabel = (value?: string) =>
  economyOptions.find((option) => option.value === value)?.label;
const money = (value: number) => `$${value.toLocaleString("de-AT")}`;
const kindLabel = (kind: string) =>
  ({
    player_death: "Kill",
    smokegrenade_detonate: "Smoke",
    smokegrenade_expired: "Smoke endet",
    inferno_startburn: "Molotov",
    inferno_expire: "Feuer endet",
    flashbang_detonate: "Flash",
    hegrenade_detonate: "HE",
    bomb_planted: "Bombe gelegt",
    bomb_defused: "Bombe entschärft",
    bomb_exploded: "Bombe explodiert",
    bomb_dropped: "Bombe fallen gelassen",
    bomb_pickup: "Bombe aufgenommen",
  })[kind] || kind;

const eventTone = (kind: string) =>
  kind === "player_death" ? "kill" : kind.startsWith("bomb_") ? "bomb" : "utility";

function loadoutsById(replay: RoundReplay) {
  const result = new Map<string, PlayerLoadout[]>();
  for (const loadout of replay.loadouts || []) {
    const list = result.get(loadout.id) || [];
    list.push(loadout);
    result.set(loadout.id, list);
  }
  return result;
}

function loadoutAt(list: PlayerLoadout[] | undefined, time: number) {
  let found: PlayerLoadout | undefined;
  for (const entry of list || []) {
    if (entry.time > time) break;
    found = entry;
  }
  return found;
}

type BombState =
  | { kind: "carried"; playerId: string }
  | { kind: "dropped" | "planted" | "defused" | "exploded"; x: number; y: number; z: number };

function bombAt(
  replay: RoundReplay,
  time: number,
  players: PlayerFrame[],
  carrier: string | undefined,
): BombState | null {
  const positionOf = (event: DemoEvent) => {
    if (event.x !== undefined && event.y !== undefined && event.z !== undefined)
      return { x: event.x, y: event.y, z: event.z };
    const player = frameAt(replay, event.time).find((entry) => entry.id === event.playerId);
    return player ? { x: player.x, y: player.y, z: player.z } : null;
  };
  const past = replay.events.filter((event) => event.kind.startsWith("bomb_") && event.time <= time);
  const plant = [...past].reverse().find((event) => event.kind === "bomb_planted");
  if (plant) {
    const position = positionOf(plant);
    const outcome = [...past].reverse().find((event) => event.kind === "bomb_defused" || event.kind === "bomb_exploded");
    return position && {
      kind: outcome?.kind === "bomb_defused" ? "defused" : outcome ? "exploded" : "planted",
      ...position,
    };
  }
  if (carrier && players.some((player) => player.id === carrier && player.health > 0))
    return { kind: "carried", playerId: carrier };
  const last = [...past].reverse().find((event) => event.kind === "bomb_dropped" || event.kind === "bomb_pickup");
  if (last?.kind !== "bomb_dropped") return null;
  const position = positionOf(last);
  return position && { kind: "dropped", ...position };
}

function frameAt(replay: RoundReplay, time: number): PlayerFrame[] {
  let low = 0,
    high = replay.frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (replay.frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  const a = replay.frames[low],
    b = replay.frames[low + 1];
  if (!a || a.time > time + 0.5) return [];
  if (!b || b.time - a.time > 0.5) return a.players;
  const fraction = Math.max(
    0,
    Math.min(1, (time - a.time) / (b.time - a.time)),
  );
  return a.players.map((player) => {
    const next = b.players.find((candidate) => candidate.id === player.id);
    if (
      !next ||
      next.side !== player.side ||
      player.health <= 0 ||
      next.health <= 0 ||
      Math.hypot(next.x - player.x, next.y - player.y) > 100
    )
      return player;
    return {
      ...player,
      x: player.x + (next.x - player.x) * fraction,
      y: player.y + (next.y - player.y) * fraction,
      z: player.z + (next.z - player.z) * fraction,
    };
  });
}

export function DemoPlayer({
  scene,
  maps,
  playback,
  onPlayback,
  onReady,
  onPosition,
  pointer,
  onPoint,
  disabled = false,
  compact = false,
  range,
}: {
  scene: SceneReference;
  maps: MapDefinition[];
  playback?: Playback;
  onPlayback?: (
    value: Pick<Playback, "time" | "playing" | "speed" | "focusId">,
  ) => void;
  onReady?: (ready: boolean) => void;
  onPosition?: (time: number, focusId: string) => void;
  pointer?: { x: number; y: number; level: string; at: number } | null;
  onPoint?: (point: { x: number; y: number; level: string }) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Marked section shown on the timeline, e.g. the scene being prepared. */
  range?: { start: number; end: number } | null;
}) {
  const [data, setData] = useState<{ demo: Demo; replay: RoundReplay } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [local, setLocal] = useState<Playback>({
    sceneIndex: 0,
    time: scene.start,
    anchoredAt: serverNow(),
    playing: false,
    speed: 1,
    focusId: scene.focusId,
  });
  const [now, setNow] = useState(serverNow());
  const [scrub, setScrub] = useState<number | null>(null);
  const [level, setLevel] = useState<RadarLevel>("upper");
  const callbacks = useRef({ onReady, onPosition });
  callbacks.current = { onReady, onPosition };
  const state = playback || local;
  const time = scrub ?? playbackTime(state, scene, now);
  useEffect(() => {
    let animation: number;
    let last = 0;
    const tick = (clock: number) => {
      if (clock - last >= 32) {
        setNow(serverNow());
        last = clock;
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, []);
  useEffect(() => {
    callbacks.current.onPosition?.(time, state.focusId);
  }, [time, state.focusId]);
  useEffect(() => {
    setLocal({
      sceneIndex: 0,
      time: scene.start,
      anchoredAt: serverNow(),
      playing: false,
      speed: 1,
      focusId: scene.focusId,
    });
    setScrub(null);
  }, [scene.demoId, scene.roundId, scene.start, scene.end, scene.focusId]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    callbacks.current.onReady?.(false);
    Promise.all([
      api(`/api/analysis/demos/${scene.demoId}`, { signal: controller.signal }),
      api(`/api/analysis/demos/${scene.demoId}/rounds/${scene.roundId}`, {
        signal: controller.signal,
      }),
    ])
      .then(([demo, replay]) => {
        if (controller.signal.aborted) return;
        if (
          demo.demo.summary.version !== scene.version ||
          scene.start < roundStart(replay.round) - 0.001 ||
          scene.end > roundEnd(replay.round) + 0.001
        )
          throw new Error(
            "Der gespeicherte Ausschnitt passt nicht zu dieser Analyse.",
          );
        setData({ demo: demo.demo, replay });
        callbacks.current.onReady?.(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => {
      controller.abort();
      callbacks.current.onReady?.(false);
    };
  }, [scene.demoId, scene.roundId, scene.version]);
  const map = maps.find((map) => map.mapName === data?.demo.summary?.map);
  const calibration = useMemo(
    () => (map ? inferRadarCalibration(map, []) : null),
    [map],
  );
  const players = useMemo(
    () => (data ? frameAt(data.replay, time) : []),
    [data, time],
  );
  const loadouts = useMemo(
    () => (data ? loadoutsById(data.replay) : new Map<string, PlayerLoadout[]>()),
    [data],
  );
  const [hover, setHover] = useState<number | null>(null);
  const focused = players.find((player) => player.id === state.focusId);
  useEffect(() => {
    const position =
      focused &&
      worldToRadar(`${focused.x} ${focused.y} ${focused.z}`, calibration);
    if (position?.level) setLevel(position.level);
  }, [focused?.id, focused?.z, calibration]);
  function change(patch: Partial<Playback>) {
    const next = {
      time,
      playing: state.playing && time < scene.end,
      speed: state.speed,
      focusId: state.focusId,
      ...patch,
    };
    if (onPlayback) onPlayback(next);
    else setLocal({ ...state, ...next, anchoredAt: serverNow() });
  }
  if (error) return <Feedback error={error} />;
  if (!data)
    return (
      <div className="demo-player demo-scope" aria-label="Runde wird geladen">
        <Skeleton className="h-96 w-full rounded-none" />
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Runde wird geladen …
        </p>
      </div>
    );
  const width = map?.radarWidth || 1024,
    height = map?.radarHeight || 1024;
  const point = (value: { x: number; y: number; z: number }) =>
    worldToRadar(`${value.x} ${value.y} ${value.z}`, calibration);
  const effects = data.replay.events.filter((event) => {
    if (
      !["smokegrenade_detonate", "inferno_startburn"].includes(event.kind) ||
      event.time > time ||
      event.x === undefined
    )
      return false;
    const endKind =
      event.kind === "smokegrenade_detonate"
        ? "smokegrenade_expired"
        : "inferno_expire";
    const end = data.replay.events.find(
      (candidate) =>
        candidate.kind === endKind &&
        candidate.entityId === event.entityId &&
        candidate.time >= event.time,
    );
    return (
      time <
      (end?.time ??
        Math.min(
          roundEnd(data.replay.round),
          event.time + (event.kind === "smokegrenade_detonate" ? 20 : 7),
        ))
    );
  });
  const sceneLength = Math.max(0.001, scene.end - scene.start);
  const percent = (value: number) =>
    `${(100 * (value - scene.start)) / sceneLength}%`;
  const playing = state.playing && time < scene.end;
  const sceneEvents = data.replay.events.filter(
    (event) => event.time >= scene.start && event.time <= scene.end,
  );
  const byId = (id: string) =>
    data.demo.summary.players.find((entry) => entry.id === id)?.name || id;
  const round = data.replay.round;
  const plantTime = data.replay.events.find((event) => event.kind === "bomb_planted")?.time;
  const clock = roundClock(round, time, plantTime);
  const clockLabel = (value: number) => {
    const at = roundClock(round, value, plantTime);
    return at.phase === "buy"
      ? `Kauf ${countdown(at.remaining)}`
      : at.phase === "over"
        ? `Ende +${demoTime(value - round.duration)}`
        : `${at.phase === "planted" ? "C4 " : ""}${countdown(at.remaining)}`;
  };
  const loadout = new Map(
    players.map((player) => {
      const entry = loadoutAt(loadouts.get(player.id), time);
      return [player.id, entry && { ...entry, ...loadoutSummary(entry.items) }] as const;
    }),
  );
  const carrier = players.find(
    (player) => player.health > 0 && loadout.get(player.id)?.bomb,
  )?.id;
  const bomb = bombAt(data.replay, time, players, carrier);
  const sideOf = (id?: string) => players.find((player) => player.id === id)?.side;
  const killfeed = data.replay.events
    .filter(
      (event) =>
        event.kind === "player_death" && event.time <= time && event.time > time - 6,
    )
    .slice(-5);
  const phases = (
    [
      ["buy", roundStart(round), 0],
      ["live", 0, plantTime ?? round.duration],
      ["planted", plantTime ?? round.duration, round.duration],
      ["over", round.duration, roundEnd(round)],
    ] as [RoundPhase, number, number][]
  )
    .map(([phase, from, to]) => ({
      phase,
      from: Math.max(scene.start, from),
      to: Math.min(scene.end, to),
    }))
    .filter((phase) => phase.to > phase.from);
  // At most about ten labels so they never overlap, even on short scenes.
  const gridStep =
    [1, 2, 5, 10, 15, 30, 60].find((step) => sceneLength / step <= 10) || 60;
  const grid: number[] = [];
  for (
    let mark = Math.ceil(scene.start / gridStep) * gridStep;
    mark <= scene.end + 0.001;
    mark += gridStep
  )
    grid.push(mark);
  const sides = [
    { side: 2, key: "t", label: "T" },
    { side: 3, key: "ct", label: "CT" },
  ].map((entry) => ({
    ...entry,
    members: players.filter((player) => player.side === entry.side),
  }));
  return (
    <section className="demo-player demo-scope" aria-label="Demo-Wiedergabe">
      {map?.radarUrl && calibration ? (
        <div
          className={compact ? "demo-stage demo-stage-compact" : "demo-stage"}
          data-pointable={!!onPoint}
        >
          <div className="demo-hud demo-hud-top-left">
            <span className="demo-chip">
              <strong>{map.name}</strong>
              <span>Runde {data.replay.round.number}</span>
            </span>
          </div>
          <div className="demo-hud demo-hud-top-right">
            <span
              className="demo-chip demo-clock"
              data-phase={clock.phase}
              aria-live="off"
              title={`Wiedergabe ${demoTime(time)} / ${demoTime(scene.end)}`}
            >
              <small>{phaseLabels[clock.phase]}</small>
              {clock.phase === "planted" && <Bomb aria-hidden="true" />}
              {countdown(clock.remaining)}
            </span>
            {killfeed.length > 0 && (
              <ol className="demo-killfeed" aria-label="Letzte Kills">
                {killfeed.map((event, index) => (
                  <li key={`${event.tick}-${index}`}>
                    <span data-side={sideOf(event.playerId) === 2 ? "t" : sideOf(event.playerId) === 3 ? "ct" : undefined}>
                      {event.player || "Welt"}
                    </span>
                    <small>{event.weapon}</small>
                    <span data-side={sideOf(event.targetId) === 2 ? "t" : sideOf(event.targetId) === 3 ? "ct" : undefined}>
                      {event.target}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {map.radarLowerUrl && (
            <div className="demo-hud demo-hud-bottom-right">
              <RadarLevelSwitch level={level} onChange={setLevel} />
            </div>
          )}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${map.name}, Runde ${data.replay.round.number}, ${demoTime(time)}`}
            onClick={(event) => {
              if (!onPoint) return;
              const matrix = event.currentTarget.getScreenCTM();
              if (!matrix) return;
              const p = new DOMPoint(
                event.clientX,
                event.clientY,
              ).matrixTransform(matrix.inverse());
              if (p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height)
                onPoint({ x: p.x / width, y: p.y / height, level });
            }}
          >
            <RadarBackground map={map} level={level} />
            {effects.map((effect, index) => {
              const p = point(effect as any);
              return p && radarPointVisible(map, p, level) ? (
                <circle
                  key={`effect-${index}`}
                  cx={p.x * width}
                  cy={p.y * height}
                  r={width * 0.035}
                  className={
                    effect.kind === "inferno_startburn"
                      ? "demo-fire"
                      : "demo-smoke"
                  }
                >
                  <title>
                    {kindLabel(effect.kind)} · schematischer Wirkungsbereich
                  </title>
                </circle>
              ) : null;
            })}
            {data.replay.grenades.map((grenade) => {
              const end = grenade.points.at(-1);
              if (
                !end ||
                time < grenade.points[0].time ||
                time > end.time + 0.5
              )
                return null;
              const points = grenade.points
                .filter((p) => p.time <= time && p.time >= time - 2)
                .map(point)
                .filter((p) => p && radarPointVisible(map, p, level));
              if (!points.length) return null;
              return (
                <g key={grenade.id} className="demo-grenade">
                  <polyline
                    points={points
                      .map((p) => `${p!.x * width},${p!.y * height}`)
                      .join(" ")}
                  />
                  <circle
                    cx={points.at(-1)!.x * width}
                    cy={points.at(-1)!.y * height}
                    r={6}
                  >
                    <title>{grenade.kind}</title>
                  </circle>
                </g>
              );
            })}
            {bomb && bomb.kind !== "carried" && (() => {
              const p = point(bomb);
              return p && radarPointVisible(map, p, level) ? (
                <g
                  className="demo-bomb"
                  data-state={bomb.kind}
                  transform={`translate(${p.x * width},${p.y * height})`}
                >
                  <title>
                    {{ dropped: "Bombe liegt", planted: "Bombe gelegt", defused: "Bombe entschärft", exploded: "Bombe explodiert" }[bomb.kind]}
                  </title>
                  {bomb.kind === "planted" && <circle r={width * 0.022} className="demo-bomb-pulse" />}
                  <rect x={-width * 0.009} y={-width * 0.007} width={width * 0.018} height={width * 0.014} rx={3} />
                </g>
              ) : null;
            })()}
            {players.map((player) => {
              const p = point(player);
              if (!p || !radarPointVisible(map, p, level)) return null;
              const index = data.demo.summary.players.findIndex(
                (entry) => entry.id === player.id,
              );
              const name = data.demo.summary.players[index]?.name || player.id;
              const size = width * 0.012;
              const focus = player.id === state.focusId;
              return (
                <g
                  key={player.id}
                  transform={`translate(${p.x * width},${p.y * height})`}
                  className={
                    player.side === 2 ? "demo-player-t" : "demo-player-ct"
                  }
                  opacity={player.health > 0 ? 1 : 0.4}
                >
                  <title>
                    {name} · {player.health} HP · {player.weapon}
                  </title>
                  {player.health > 0 ? (
                    <>
                      {focus && (
                        <circle
                          r={size * 1.9}
                          className="demo-player-focus-ring"
                        />
                      )}
                      <line
                        x2={Math.cos((player.yaw * Math.PI) / 180) * size * 2.3}
                        y2={
                          -Math.sin((player.yaw * Math.PI) / 180) * size * 2.3
                        }
                        strokeWidth={5}
                      />
                      <circle r={size} strokeWidth={focus ? 4 : 2} />
                      <text textAnchor="middle" dy="0.35em" fontSize={size}>
                        {index + 1}
                      </text>
                      {bomb?.kind === "carried" && bomb.playerId === player.id && (
                        <rect
                          className="demo-bomb-carrier"
                          x={size * 0.55}
                          y={-size * 1.55}
                          width={size * 1.1}
                          height={size * 0.8}
                          rx={2}
                        >
                          <title>trägt die Bombe</title>
                        </rect>
                      )}
                    </>
                  ) : (
                    <path
                      d={`M-${size},-${size} L${size},${size} M-${size},${size} L${size},-${size}`}
                      strokeWidth={4}
                    />
                  )}
                  {focus && (
                    <text
                      y={-size * 2.6}
                      textAnchor="middle"
                      className="demo-player-name"
                      fontSize={size * 1.05}
                    >
                      {name}
                    </text>
                  )}
                </g>
              );
            })}
            {pointer && pointer.level === level && now - pointer.at < 5000 && (
              <g
                className="demo-pointer"
                transform={`translate(${pointer.x * width},${pointer.y * height})`}
              >
                <circle r={width * 0.025} />
                <path d="M-25,0 H25 M0,-25 V25" />
              </g>
            )}
          </svg>
        </div>
      ) : (
        <div className="demo-stage demo-stage-empty">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Keine kalibrierte Karte verfügbar</EmptyTitle>
              <EmptyDescription>
                Die Ereignisse sind lesbar. Für {data.demo.summary.map} fehlt
                eine passende Radarprojektion.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      <div className="demo-timeline">
        <div
          className="demo-timeline-track"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
            setHover(scene.start + fraction * sceneLength);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div className="demo-phase-track" aria-hidden="true">
            {phases.map((phase) => (
              <span
                key={phase.phase}
                data-phase={phase.phase}
                style={{ left: percent(phase.from), width: `${(100 * (phase.to - phase.from)) / sceneLength}%` }}
              >
                {(phase.to - phase.from) / sceneLength > 0.1 && phaseLabels[phase.phase]}
              </span>
            ))}
          </div>
          {hover !== null && (
            <span className="demo-timeline-hover" style={{ left: percent(hover) }} aria-hidden="true">
              {clockLabel(hover)}
            </span>
          )}
          {range && range.end > range.start && (
            <div
              className="demo-timeline-range"
              style={{
                left: percent(Math.max(scene.start, range.start)),
                right: `calc(100% - ${percent(Math.min(scene.end, range.end))})`,
              }}
              aria-hidden="true"
            />
          )}
          <input
            aria-label="Zeitpunkt in der Szene"
            type="range"
            min={scene.start}
            max={scene.end}
            step={0.05}
            value={time}
            disabled={disabled}
            onChange={(event) => setScrub(Number(event.target.value))}
            onPointerUp={(event) => {
              change({ time: Number(event.currentTarget.value) });
              setScrub(null);
            }}
            onKeyUp={(event) => {
              change({ time: Number(event.currentTarget.value) });
              setScrub(null);
            }}
          />
        </div>
        <div className="demo-event-track" aria-label="Ereignisse in der Szene">
          {sceneEvents
            .filter(
              (event) =>
                !event.kind.endsWith("expire") &&
                !event.kind.endsWith("expired") &&
                event.kind !== "bomb_dropped" &&
                event.kind !== "bomb_pickup",
            )
            .map((event, index) => (
              <button
                type="button"
                key={index}
                disabled={disabled}
                className={`demo-event-${eventTone(event.kind)}`}
                style={{ left: percent(event.time) }}
                aria-label={`${clockLabel(event.time)}: ${kindLabel(event.kind)} ${event.player}`}
                title={`${clockLabel(event.time)} · ${kindLabel(event.kind)} · ${event.player}${event.target ? ` → ${event.target}` : ""}`}
                onClick={() =>
                  change({
                    time: Math.max(scene.start, event.time - 3),
                    playing: false,
                  })
                }
              />
            ))}
        </div>
        <div className="demo-timeline-scale" aria-hidden="true">
          {grid.map((mark) => (
            <span
              key={mark}
              style={{ left: percent(mark) }}
              data-edge={
                mark - scene.start < sceneLength * 0.04
                  ? "start"
                  : scene.end - mark < sceneLength * 0.04
                    ? "end"
                    : undefined
              }
            >
              {clockLabel(mark)}
            </span>
          ))}
        </div>
      </div>
      <div className="demo-transport">
        <div className="demo-transport-buttons">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zum Szenenanfang"
            disabled={disabled}
            onClick={() => change({ time: scene.start, playing: false })}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fünf Sekunden zurück"
            disabled={disabled}
            onClick={() => change({ time: Math.max(scene.start, time - 5) })}
          >
            <SkipBack />
          </Button>
          <Button
            className="demo-transport-play"
            aria-label={playing ? "Pausieren" : "Abspielen"}
            disabled={disabled}
            onClick={() =>
              change({
                playing: !state.playing || time >= scene.end,
                time: time >= scene.end ? scene.start : time,
              })
            }
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fünf Sekunden vor"
            disabled={disabled}
            onClick={() => change({ time: Math.min(scene.end, time + 5) })}
          >
            <SkipForward />
          </Button>
        </div>
        <div className="demo-transport-settings">
          <div
            className="demo-speed"
            role="group"
            aria-label="Wiedergabetempo"
          >
            {[0.25, 0.5, 1, 2, 4].map((value) => (
              <button
                type="button"
                key={value}
                disabled={disabled}
                aria-pressed={state.speed === value}
                onClick={() => change({ speed: value })}
              >
                {value}×
              </button>
            ))}
          </div>
          <Choice
            label="Fokus"
            value={state.focusId}
            disabled={disabled}
            options={[
              { value: "", label: "Teamübersicht" },
              ...data.demo.summary.players.map((player, index) => ({
                value: player.id,
                label: `${index + 1}. ${player.name}`,
              })),
            ]}
            onChange={(focusId) => change({ focusId })}
          />
        </div>
      </div>
      {!compact && players.length > 0 && (
        <div className="demo-roster">
          {sides.map((group) => (
            <div
              className="demo-roster-side"
              data-side={group.key}
              key={group.key}
            >
              <header>
                <span>
                  {group.label}
                  {round.economy?.[group.key as "t" | "ct"] && (
                    <span
                      className="demo-roster-buy"
                      title={`Ausrüstungswert nach dem Kauf: ${money(round.economy[group.key as "t" | "ct"]!.equipment)}`}
                    >
                      {buyLabel(round.economy[group.key as "t" | "ct"]!.buy)}
                      <small>{money(round.economy[group.key as "t" | "ct"]!.equipment)}</small>
                    </span>
                  )}
                </span>
                <small>
                  {group.members.filter((player) => player.health > 0).length}{" "}
                  / {group.members.length} am Leben
                </small>
              </header>
              {group.members.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  disabled={disabled}
                  aria-pressed={state.focusId === player.id}
                  data-dead={player.health <= 0}
                  onClick={() => change({ focusId: player.id })}
                >
                  <span className="demo-roster-index">
                    {data.demo.summary.players.findIndex(
                      (entry) => entry.id === player.id,
                    ) + 1}
                  </span>
                  <span className="demo-roster-name">{byId(player.id)}</span>
                  <span className="demo-roster-hp">
                    {player.health > 0 ? `${player.health} HP` : "—"}
                  </span>
                  {(() => {
                    const gear = loadout.get(player.id);
                    if (!gear || player.health <= 0)
                      return player.health > 0 && player.weapon ? (
                        <span className="demo-roster-loadout">
                          <span className="demo-roster-weapon"><strong>{player.weapon}</strong></span>
                        </span>
                      ) : null;
                    return (
                      <span className="demo-roster-loadout">
                        <span className="demo-roster-weapon">
                          <strong title="Aktive Waffe">{player.weapon || "—"}</strong>
                          {gear.primary && gear.primary !== player.weapon && <span>{gear.primary}</span>}
                        </span>
                        <span className="demo-roster-gear">
                          {gear.grenades.map((grenade, at) =>
                            grenade === "Decoy" ? (
                              <span key={at} className="demo-roster-decoy" title="Decoy">D</span>
                            ) : (
                              <span key={at} title={grenade === "Molly" ? "Molotov / Brandgranate" : grenade}>
                                <GrenadeIcon type={grenade} className="size-4" />
                              </span>
                            ),
                          )}
                          {gear.bomb && <Bomb className="demo-roster-bomb" aria-label="Bombe" />}
                          {gear.defuser && <Scissors aria-label="Entschärfungskit" />}
                          {gear.armor > 0 &&
                            (gear.helmet ? (
                              <ShieldCheck aria-label={`Kevlar und Helm, ${gear.armor}`} />
                            ) : (
                              <Shield aria-label={`Kevlar, ${gear.armor}`} />
                            ))}
                        </span>
                        <span className="demo-roster-money">{money(gear.money)}</span>
                      </span>
                    );
                  })()}
                  <span className="demo-roster-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(100, player.health))}%`,
                      }}
                    />
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <details className="demo-log">
        <summary>
          Ereignisprotokoll · {sceneEvents.length}{" "}
          {sceneEvents.length === 1 ? "Ereignis" : "Ereignisse"}
        </summary>
        <ol>
          {sceneEvents.map((event, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  change({
                    time: Math.max(scene.start, event.time - 3),
                    playing: false,
                  })
                }
              >
                <time title={`Wiedergabe ${demoTime(event.time)}`}>{clockLabel(event.time)}</time>
                <span className="demo-log-kind" data-kind={eventTone(event.kind)}>
                  {kindLabel(event.kind)}
                </span>
                <span className="demo-log-text">
                  {event.player}
                  {event.target ? <span> → {event.target}</span> : null}
                  {event.weapon && event.kind === "player_death" ? (
                    <span> · {event.weapon}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p>
          Smoke und Feuer werden schematisch angezeigt. Die Radaransicht
          verwendet den verfügbaren Kartenstand. Zeitbasis: 64 Ticks/s.
        </p>
      </details>
    </section>
  );
}

export function SceneExample({
  scene,
  maps,
}: {
  scene: SceneReference;
  maps: MapDefinition[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
        >
          <Play data-icon="inline-start" />
          {open ? "Beispiel schließen" : "Beispielszene ansehen"}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link
            to={`/analysis/demos/${scene.demoId}?round=${scene.roundId}&start=${scene.start}&end=${scene.end}&focus=${scene.focusId}`}
          >
            Im Match öffnen
          </Link>
        </Button>
      </div>
      {open && <DemoPlayer scene={scene} maps={maps} compact />}
    </div>
  );
}
