import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { serverNow } from "@/lib/live";
import { inferRadarCalibration, worldToRadar } from "@/lib/nade-radar";
import { radarPointVisible, type RadarLevel } from "@/lib/radar-layout";
import type { MapDefinition } from "@/lib/maps";
import {
  playbackTime,
  type Demo,
  type Playback,
  type RoundReplay,
  type SceneReference,
  type PlayerFrame,
} from "../../../shared/demos";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";
import { RadarBackground } from "./radar-background";
import { RadarLevelSwitch } from "./radar-level-switch";
import { Choice, Feedback } from "./workspace-ui";

export const demoTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
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
  })[kind] || kind;

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
          scene.end > replay.round.duration + 0.001
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
      <div className="flex flex-col gap-3" aria-label="Runde wird geladen">
        <Skeleton className="h-96 w-full" />
        <p className="text-sm text-muted-foreground">Runde wird geladen …</p>
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
          data.replay.round.duration,
          event.time + (event.kind === "smokegrenade_detonate" ? 20 : 7),
        ))
    );
  });
  return (
    <section className="demo-player" aria-label="Demo-Wiedergabe">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{map?.name || data.demo.summary.map}</Badge>
          <Badge variant="secondary">Runde {data.replay.round.number}</Badge>
          <span className="font-mono text-sm">
            {demoTime(time)} / {demoTime(scene.end)}
          </span>
        </div>
        {map?.radarLowerUrl && (
          <RadarLevelSwitch level={level} onChange={setLevel} />
        )}
      </div>
      {map?.radarUrl && calibration ? (
        <div className={compact ? "demo-map demo-map-compact" : "demo-map"}>
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
            {players.map((player) => {
              const p = point(player);
              if (!p || !radarPointVisible(map, p, level)) return null;
              const index = data.demo.summary.players.findIndex(
                (entry) => entry.id === player.id,
              );
              const name = data.demo.summary.players[index]?.name || player.id;
              const size = width * 0.012;
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
                      <line
                        x2={Math.cos((player.yaw * Math.PI) / 180) * size * 2.3}
                        y2={
                          -Math.sin((player.yaw * Math.PI) / 180) * size * 2.3
                        }
                        strokeWidth={5}
                      />
                      <circle
                        r={size}
                        strokeWidth={player.id === state.focusId ? 5 : 2}
                      />
                      <text textAnchor="middle" dy="0.35em" fontSize={size}>
                        {index + 1}
                      </text>
                    </>
                  ) : (
                    <path
                      d={`M-${size},-${size} L${size},${size} M-${size},${size} L${size},-${size}`}
                      strokeWidth={4}
                    />
                  )}
                  {player.id === state.focusId && (
                    <text
                      y={-size * 2.5}
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
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Keine kalibrierte Karte verfügbar</EmptyTitle>
            <EmptyDescription>
              Die Ereignisse sind lesbar. Für {data.demo.summary.map} fehlt eine
              passende Radarprojektion.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="demo-timeline">
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
        <div className="demo-event-track" aria-label="Ereignisse in der Szene">
          {data.replay.events
            .filter(
              (event) =>
                event.time >= scene.start &&
                event.time <= scene.end &&
                !event.kind.endsWith("expire") &&
                !event.kind.endsWith("expired"),
            )
            .map((event, index) => (
              <button
                type="button"
                key={index}
                disabled={disabled}
                className={
                  event.kind === "player_death"
                    ? "demo-event-kill"
                    : "demo-event-utility"
                }
                style={{
                  left: `${(100 * (event.time - scene.start)) / (scene.end - scene.start)}%`,
                }}
                aria-label={`${demoTime(event.time)}: ${kindLabel(event.kind)} ${event.player}`}
                title={`${demoTime(event.time)} · ${kindLabel(event.kind)} · ${event.player}`}
                onClick={() =>
                  change({
                    time: Math.max(scene.start, event.time - 3),
                    playing: false,
                  })
                }
              />
            ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 py-3">
        <div className="flex gap-1">
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
            variant="outline"
            size="icon"
            aria-label="Fünf Sekunden zurück"
            disabled={disabled}
            onClick={() => change({ time: Math.max(scene.start, time - 5) })}
          >
            <SkipBack />
          </Button>
          <Button
            aria-label={
              state.playing && time < scene.end ? "Pausieren" : "Abspielen"
            }
            disabled={disabled}
            onClick={() =>
              change({
                playing: !state.playing || time >= scene.end,
                time: time >= scene.end ? scene.start : time,
              })
            }
          >
            {state.playing && time < scene.end ? (
              <Pause data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {state.playing && time < scene.end ? "Pause" : "Abspielen"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Fünf Sekunden vor"
            disabled={disabled}
            onClick={() => change({ time: Math.min(scene.end, time + 5) })}
          >
            <SkipForward />
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Choice
            label="Tempo"
            value={String(state.speed)}
            disabled={disabled}
            options={[0.25, 0.5, 1, 2, 4].map((value) => ({
              value: String(value),
              label: `${value}×`,
            }))}
            onChange={(speed) => change({ speed: Number(speed) })}
          />
          <Choice
            label="Fokusspieler"
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
      {!compact && (
        <div className="demo-player-roster">
          {players.map((player) => (
            <button
              type="button"
              key={player.id}
              disabled={disabled}
              aria-pressed={state.focusId === player.id}
              onClick={() => change({ focusId: player.id })}
            >
              <span
                className={player.side === 2 ? "demo-side-t" : "demo-side-ct"}
              >
                {player.side === 2 ? "T" : "CT"}
              </span>
              <span className="truncate">
                {
                  data.demo.summary.players.find(
                    (entry) => entry.id === player.id,
                  )?.name
                }
              </span>
              <span className="font-mono">{player.health} HP</span>
            </button>
          ))}
        </div>
      )}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary>Ereignisse und Darstellungsdetails</summary>
        <p className="my-2">
          Smoke und Feuer werden schematisch angezeigt. Die Radaransicht
          verwendet den verfügbaren Kartenstand. Zeitbasis: 64 Ticks/s.
        </p>
        <ol className="flex max-h-60 flex-col gap-1 overflow-auto">
          {data.replay.events
            .filter(
              (event) => event.time >= scene.start && event.time <= scene.end,
            )
            .map((event, index) => (
              <li key={index}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    change({
                      time: Math.max(scene.start, event.time - 3),
                      playing: false,
                    })
                  }
                >
                  {demoTime(event.time)} · {kindLabel(event.kind)} ·{" "}
                  {event.player}
                  {event.target ? ` → ${event.target}` : ""}
                </Button>
              </li>
            ))}
        </ol>
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
