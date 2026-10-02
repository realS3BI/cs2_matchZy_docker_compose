import { THROW_ATTRIBUTE_FIELDS } from "./throw-attributes.js";

export function lineupPermissions(nade: { owner: string; official?: boolean }, user?: { identitySteam64: string; role: string }) {
  const own = Boolean(user && nade.owner !== "default" && nade.owner === user.identitySteam64);
  const ownDraft = own && !nade.official;
  const admin = user?.role === "admin";
  return { edit: ownDraft, position: own || admin, revoke: own || admin,
    delete: ownDraft || admin, submit: ownDraft, moderate: admin };
}

export const LINEUP_POSITION_FIELDS = ["radarFrom", "radarTo"] as const;

export const LINEUP_EDIT_FIELDS = [
  "displayName", "desc", "type", "team", "flightDuration", "throwFromTitle", "throwToTitle",
  "lineupPos", "lineupAng", "landingPos", "radarFrom", "radarTo",
  ...THROW_ATTRIBUTE_FIELDS,
] as const;
