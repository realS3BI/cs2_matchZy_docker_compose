import { mapPath, type MapDefinition } from "./maps.js";

export type LineupReference = { id?: string; owner: string; map: string; name: string };

export function lineupKey(nade: LineupReference) {
  return JSON.stringify([nade.owner, nade.map, nade.name]);
}

export function lineupId(nade: LineupReference) {
  return /^[A-Za-z0-9]{7}$/.test(nade.id || "") ? nade.id! : legacyLineupId(nade);
}

export function legacyLineupId(nade: LineupReference) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(lineupKey(nade))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function lineupPath(map: MapDefinition, nade: LineupReference) {
  return `${mapPath(map)}/lineups/${lineupId(nade)}`;
}

export function findLineup<T extends LineupReference>(nades: T[], id?: string): T | undefined {
  if (!id) return undefined;
  return nades.find(nade => lineupId(nade) === id || legacyLineupId(nade) === id);
}
