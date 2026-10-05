import {
  parseEvents,
  parseGrenades,
  parseHeader,
  parseTicks,
} from "@laihoe/demoparser2";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANALYSIS_VERSION,
  type DemoRound,
  type DemoSummary,
  type RoundReplay,
  type GrenadePath,
} from "../shared/demos.js";

export const PARSER_VERSION = "0.42.0";
const TICK_RATE = 64;
const EVENT_NAMES = [
  "round_start",
  "round_freeze_end",
  "round_end",
  "player_death",
  "smokegrenade_detonate",
  "smokegrenade_expired",
  "inferno_startburn",
  "inferno_expire",
  "flashbang_detonate",
  "hegrenade_detonate",
  "bomb_planted",
  "bomb_defused",
  "bomb_exploded",
];
const finite = (value: any) =>
  typeof value === "number" && Number.isFinite(value);

// Rounds are tick intervals. Counters can advance inside the same tick as round_end.
export function demoRounds(events: any[]): {
  rounds: DemoRound[];
  warnings: string[];
} {
  const starts = [
    ...new Set<number>(
      events
        .filter(
          (event) => event.event_name === "round_start" && finite(event.tick),
        )
        .map((event) => event.tick),
    ),
  ].sort((a, b) => a - b);
  const rounds: DemoRound[] = [];
  const warnings = new Set<string>();
  for (let index = 0; index < starts.length; index++) {
    const section = events.filter(
      (event) =>
        event.tick >= starts[index] &&
        event.tick < (starts[index + 1] ?? Infinity),
    );
    const freeze = section.find(
      (event) =>
        event.event_name === "round_freeze_end" &&
        event.is_warmup_period === false,
    );
    const end = section.find(
      (event) =>
        event.event_name === "round_end" && event.is_warmup_period === false,
    );
    if (!freeze && !end) continue;
    if (!end) {
      warnings.add("Eine unvollständige Schlussrunde wurde ausgelassen.");
      continue;
    }
    const startTick = freeze?.tick ?? starts[index];
    if (!freeze)
      warnings.add(
        "Mindestens eine Runde endete während der Vorbereitung. Ihr Ausschnitt beginnt beim Rundenstart.",
      );
    const duration = (end.tick - startTick) / TICK_RATE;
    if (duration <= 0 || duration > 1800) {
      warnings.add("Eine Runde mit ungewöhnlicher Dauer wurde ausgelassen.");
      continue;
    }
    rounds.push({
      id: `r${rounds.length + 1}`,
      number: rounds.length + 1,
      startTick,
      endTick: end.tick,
      duration,
      winner: Number(end.winner) || 0,
    });
  }
  if (!rounds.length || rounds.length > 200)
    throw new Error("Keine unterstützten abgeschlossenen CS2-Runden gefunden.");
  return { rounds, warnings: [...warnings] };
}

export async function parseDemo(
  path: string,
  output: string,
): Promise<DemoSummary> {
  const header = parseHeader(path);
  if (
    !header ||
    typeof header.map_name !== "string" ||
    !/^[\w/-]{1,100}$/.test(header.map_name)
  )
    throw new Error("Die Demo enthält keinen gültigen Kartennamen.");
  const events = parseEvents(
    path,
    EVENT_NAMES,
    ["X", "Y", "Z"],
    ["is_warmup_period", "total_rounds_played"],
  ).sort((a, b) => a.tick - b.tick);
  if (!Array.isArray(events))
    throw new Error("Die Demo-Ereignisse konnten nicht gelesen werden.");
  const { rounds, warnings } = demoRounds(events);
  const wantedTicks: number[] = [];
  for (const round of rounds) {
    for (let tick = round.startTick; tick <= round.endTick; tick += 8)
      wantedTicks.push(tick);
    wantedTicks.push(round.endTick);
  }
  if (wantedTicks.length > 120_000)
    throw new Error("Die Demo überschreitet die unterstützte Matchdauer.");
  const ticks = parseTicks(
    path,
    ["X", "Y", "Z", "yaw", "health", "team_num", "active_weapon_name"],
    [...new Set(wantedTicks)],
  );
  if (
    !Array.isArray(ticks) ||
    !ticks.some(
      (row) =>
        finite(row.X) &&
        finite(row.Y) &&
        finite(row.Z) &&
        finite(row.team_num) &&
        finite(row.health),
    )
  )
    throw new Error("Spielerpositionen oder Teamdaten fehlen in dieser Demo.");
  const players = new Map<string, string>();
  const byTick = new Map<number, any[]>();
  for (const row of ticks) {
    if (
      typeof row.steamid !== "string" ||
      !/^[0-9]{1,20}$/.test(row.steamid) ||
      ![row.X, row.Y, row.Z, row.yaw, row.health].every(finite) ||
      ![2, 3].includes(row.team_num)
    )
      continue;
    players.set(row.steamid, String(row.name || row.steamid).slice(0, 100));
    let frame = byTick.get(row.tick);
    if (!frame) byTick.set(row.tick, (frame = []));
    frame.push({
      id: row.steamid,
      x: row.X,
      y: row.Y,
      z: row.Z,
      yaw: row.yaw,
      health: Math.max(0, row.health),
      side: row.team_num,
      weapon: String(row.active_weapon_name || "").slice(0, 80),
    });
  }
  const grenadeRows = parseGrenades(path, [], false);
  const grenadeByRound = new Map<string, GrenadePath[]>();
  for (const round of rounds) {
    const tracks = new Map<
      string,
      { path: GrenadePath; tick: number; sampled: number }
    >();
    const paths: GrenadePath[] = [];
    for (const row of grenadeRows) {
      if (
        row.tick < round.startTick ||
        row.tick > round.endTick ||
        ![row.x, row.y, row.z].every(finite)
      )
        continue;
      const key = `${row.grenade_entity_id}:${row.steamid}:${row.grenade_type}`;
      let track = tracks.get(key);
      if (!track || row.tick - track.tick > 64 || row.tick < track.tick) {
        const path: GrenadePath = {
          id: `${round.id}-${paths.length}`,
          kind: String(row.grenade_type),
          playerId: String(row.steamid || ""),
          points: [],
        };
        track = { path, tick: row.tick, sampled: -Infinity };
        tracks.set(key, track);
        paths.push(path);
      }
      track.tick = row.tick;
      if (row.tick - track.sampled >= 4) {
        track.path.points.push({
          time: (row.tick - round.startTick) / TICK_RATE,
          x: row.x,
          y: row.y,
          z: row.z,
        });
        track.sampled = row.tick;
      }
    }
    grenadeByRound.set(round.id, paths);
  }
  await mkdir(output, { recursive: true });
  for (const round of rounds) {
    const replay: RoundReplay = {
      round,
      frames: [...byTick]
        .filter(([tick]) => tick >= round.startTick && tick <= round.endTick)
        .sort(([a], [b]) => a - b)
        .map(([tick, players]) => ({
          time: (tick - round.startTick) / TICK_RATE,
          players,
        })),
      events: events
        .filter(
          (event) =>
            event.tick >= round.startTick &&
            event.tick <= round.endTick &&
            !event.event_name.startsWith("round_"),
        )
        .map((event) => ({
          time: (event.tick - round.startTick) / TICK_RATE,
          tick: event.tick,
          kind: event.event_name,
          playerId: String(
            (event.event_name === "player_death"
              ? event.attacker_steamid
              : event.user_steamid) || "",
          ),
          player: String(
            (event.event_name === "player_death"
              ? event.attacker_name
              : event.user_name) || "",
          ).slice(0, 100),
          ...(event.event_name === "player_death" && {
            target: String(event.user_name || ""),
            weapon: String(event.weapon || ""),
          }),
          ...([event.x, event.y, event.z].every(finite) && {
            x: event.x,
            y: event.y,
            z: event.z,
          }),
          ...(finite(event.entityid) && { entityId: event.entityid }),
        })),
      grenades: grenadeByRound.get(round.id) || [],
    };
    if (!replay.frames.length)
      throw new Error(`Spielerpositionen fehlen in Runde ${round.number}.`);
    await writeFile(join(output, `${round.id}.json`), JSON.stringify(replay));
  }
  const summary: DemoSummary = {
    version: ANALYSIS_VERSION,
    parserVersion: PARSER_VERSION,
    map: header.map_name,
    tickRate: TICK_RATE,
    players: [...players].map(([id, name]) => ({ id, name })),
    rounds,
    warnings,
  };
  await writeFile(join(output, "summary.json"), JSON.stringify(summary));
  return summary;
}
