export const LINEUP_TEAMS = ["t", "ct", "both"] as const;
export type LineupTeam = typeof LINEUP_TEAMS[number];
export const TEAM_LABELS: Record<LineupTeam, string> = { t: "T", ct: "CT", both: "Beide" };

export function isLineupTeam(value: unknown): value is LineupTeam {
  return LINEUP_TEAMS.includes(value as LineupTeam);
}

// Unassigned legacy recordings stay visible under All, without guessing a team.
export function matchesLineupTeam(nade: { team?: string }, filter: string) {
  return filter === "all" || nade.team === filter || ((filter === "t" || filter === "ct") && nade.team === "both");
}
