export type MatchPlayer = { id: string; steamId?: string; name: string };
export type MatchEntry = {
  id: string;
  ownerId: string;
  teamId: string | null;
  source: "faceit" | "premier";
  externalId: string;
  title: string;
  playedAt: string | null;
  map: string;
  players: MatchPlayer[];
  sides: { id: string; name: string; roster: string[]; score: number | null }[];
  competition: string;
  competitionId: string;
  demoId: string | null;
  demoStatus:
    | "unavailable"
    | "access_required"
    | "available"
    | "queued"
    | "imported"
    | "failed";
  error?: string;
  createdAt: string;
};
export type MatchConnection = {
  id: string;
  ownerId: string;
  teamId: string | null;
  source: "faceit" | "premier";
  label: string;
  playerId: string;
  enabled: boolean;
  autoDownload: boolean;
  lastSyncAt: string | null;
  lastError?: string;
  hasHistoryAccess?: boolean;
};
export type Prematch = {
  id: string;
  teamId: string;
  title: string;
  opponent: string;
  roster: string[];
  matchIds: string[];
  days: number;
  competition: string;
  competitionSource?: string;
  notes: string;
  stratIds: string[];
  revision: number;
  published: boolean;
  createdBy: string;
  updatedAt: string;
};
