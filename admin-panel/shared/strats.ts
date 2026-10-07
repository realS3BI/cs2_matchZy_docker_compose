import type { TeamRole } from "./authorization.js";
import type { SceneReference } from "./demos.js";

export const economyOptions = [
  { value: "fullbuy", label: "Fullbuy" },
  { value: "semi-buy", label: "Semi-Buy" },
  { value: "eco", label: "Eco" },
  { value: "pistol", label: "Pistol" },
] as const;
export type StratEconomy = (typeof economyOptions)[number]["value"];

// Missing or empty selections apply to every economy, including older strats.
export function matchesEconomy(
  applicable: StratEconomy[] | undefined,
  selected: StratEconomy[],
): boolean {
  return !selected.length || !applicable?.length || selected.some((value) => applicable.includes(value));
}

export type TeamMember = {
  userId: string;
  role: TeamRole;
  joinedAt: string;
  name?: string;
};
export type StratStep = {
  id: string;
  text: string;
  position: string;
  timing: string;
  nadeIds: string[];
  scene?: SceneReference;
};
export type StratSlot = {
  id: string;
  label: string;
  userId: string;
  steps: StratStep[];
};
export type StratContent = {
  title: string;
  map: string;
  side: "t" | "ct";
  description: string;
  ownEconomy?: StratEconomy[];
  opponentEconomy?: StratEconomy[];
  slots: StratSlot[];
  scene?: SceneReference;
};
export type PublishedStrat = {
  version: number;
  publishedAt: string;
  content: StratContent;
};
export type Strat = {
  id: string;
  teamId: string;
  revision: number;
  draft: StratContent;
  published: PublishedStrat | null;
  archived: boolean;
  createdBy: string;
  updatedAt: string;
};
export type ActiveStrat = {
  stratId: string;
  version: number;
  activationId: string;
  activatedAt: string;
  activatedBy: string;
  content: StratContent;
};
export type Invitation = {
  id: string;
  hash: string;
  createdBy: string;
  expiresAt: string;
};
export type Team = {
  id: string;
  name: string;
  revision: number;
  members: TeamMember[];
  invitations: Invitation[];
  live?: boolean;
  active: ActiveStrat | null;
  createdAt: string;
};
export type TeamView = Omit<Team, "invitations"> & {
  invitations: Omit<Invitation, "hash">[];
  live: boolean;
  permissions: Record<string, boolean>;
};
export type StratView = {
  id: string;
  teamId: string;
  teamName: string;
  revision: number;
  content: StratContent;
  published: PublishedStrat | null;
  archived: boolean;
  canEdit: boolean;
  updatedAt: string;
};

export const newWorkspaceId = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
export function newStratContent(map = "de_mirage"): StratContent {
  return {
    title: "",
    map,
    side: "t",
    description: "",
    ownEconomy: [],
    opponentEconomy: [],
    slots: ["Entry", "Support A", "Support B", "Lurker", "AWP"].map(
      (label) => ({ id: newWorkspaceId(), label, userId: "", steps: [] }),
    ),
  };
}
