export function lineupPermissions(nade: { owner: string; official?: boolean }, user?: { identitySteam64: string; role: string }) {
  const ownDraft = Boolean(user && nade.owner !== "default" && nade.owner === user.identitySteam64 && !nade.official);
  return { edit: ownDraft, delete: ownDraft, submit: ownDraft, moderate: user?.role === "admin" };
}

export const LINEUP_EDIT_FIELDS = [
  "displayName", "desc", "type", "team", "throwTechnique", "throwFromTitle", "throwToTitle",
  "lineupPos", "lineupAng", "landingPos", "radarFrom", "radarTo",
] as const;
