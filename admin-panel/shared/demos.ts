export const ANALYSIS_VERSION = 1;
export const DEMO_UPLOAD_LIMIT = 1024 * 1024 * 1024;
export const DEMO_EXPANDED_LIMIT = 2 * DEMO_UPLOAD_LIMIT;

export type DemoPlayer = { id: string; name: string };
export type DemoRound = {
  id: string;
  number: number;
  startTick: number;
  endTick: number;
  duration: number;
  winner: number;
};
export type DemoSummary = {
  version: number;
  parserVersion: string;
  map: string;
  tickRate: number;
  players: DemoPlayer[];
  rounds: DemoRound[];
  warnings: string[];
};
export type Demo = {
  id: string;
  ownerId: string;
  teamId: string | null;
  title: string;
  source: "faceit" | "premier" | "other";
  filename: string;
  status:
    | "uploading"
    | "receiving"
    | "queued"
    | "processing"
    | "ready"
    | "failed";
  createdAt: string;
  updatedAt: string;
  bytes?: number;
  hash?: string;
  error?: string;
  summary?: DemoSummary;
  canEdit?: boolean;
};
export type PlayerFrame = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  side: number;
  weapon: string;
};
export type DemoFrame = { time: number; players: PlayerFrame[] };
export type DemoEvent = {
  time: number;
  tick: number;
  kind: string;
  playerId: string;
  player: string;
  target?: string;
  weapon?: string;
  x?: number;
  y?: number;
  z?: number;
  entityId?: number;
};
export type GrenadePath = {
  id: string;
  kind: string;
  playerId: string;
  points: { time: number; x: number; y: number; z: number }[];
};
export type RoundReplay = {
  round: DemoRound;
  frames: DemoFrame[];
  events: DemoEvent[];
  grenades: GrenadePath[];
};
export type SceneReference = {
  demoId: string;
  roundId: string;
  version: number;
  start: number;
  end: number;
  focusId: string;
};
export type DemoScene = SceneReference & {
  id: string;
  title: string;
  note: string;
};
export type ReviewNote = {
  id: string;
  authorId: string;
  authorName: string;
  sceneId: string;
  text: string;
  createdAt: string;
};
export type Playback = {
  sceneIndex: number;
  time: number;
  playing: boolean;
  speed: number;
  anchoredAt: number;
  focusId: string;
};
export type ReviewSession = {
  id: string;
  moderatorId: string;
  scenes: DemoScene[];
  playback: Playback;
};
export type DemoReview = {
  id: string;
  teamId: string;
  title: string;
  revision: number;
  scenes: DemoScene[];
  notes: ReviewNote[];
  session: ReviewSession | null;
  createdBy: string;
  updatedAt: string;
};
export type ReviewParticipant = {
  id: string;
  name: string;
  ready: boolean;
  following: boolean;
};
export type ReviewRoom = {
  review: DemoReview;
  canEdit: boolean;
  participants: ReviewParticipant[];
  pointer: { x: number; y: number; level: string; at: number } | null;
};

export function playbackTime(
  playback: Playback,
  scene: SceneReference,
  now: number,
) {
  return Math.max(
    scene.start,
    Math.min(
      scene.end,
      playback.time +
        (playback.playing
          ? (Math.max(0, now - playback.anchoredAt) / 1000) * playback.speed
          : 0),
    ),
  );
}
export function sceneUrl(scene: SceneReference) {
  return `/analysis/demos/${scene.demoId}?round=${encodeURIComponent(scene.roundId)}&start=${scene.start}&end=${scene.end}&focus=${encodeURIComponent(scene.focusId)}`;
}
