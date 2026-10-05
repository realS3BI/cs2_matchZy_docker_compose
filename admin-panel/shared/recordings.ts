import type { Playback, SceneReference } from "./demos.js";
import type { StratContent } from "./strats.js";

export const AUDIO_UPLOAD_LIMIT = 512 * 1024 * 1024;
export const AUDIO_SEGMENT_LIMIT = 16 * 1024 * 1024;
export type Presentation =
  | { kind: "notes" }
  | { kind: "strat"; snapshotId: string }
  | { kind: "demo"; scene: SceneReference; playback: Playback };
export type StratSnapshot = {
  id: string;
  stratId: string;
  version: number;
  content: StratContent;
};
export type SessionEvent = {
  id: string;
  sequence: number;
  at: number;
  authorId: string;
  type:
    "start" | "stop" | "present" | "playback" | "note" | "point" | "takeover";
  presentation?: Presentation;
  text?: string;
  point?: { x: number; y: number; level: string };
};
export type LiveSession = {
  id: string;
  teamId: string;
  title: string;
  mode: "match" | "review";
  moderatorId: string;
  recorderId: string;
  createdBy: string;
  revision: number;
  status: "prepared" | "recording" | "finished";
  createdAt: string;
  updatedAt: string;
  startedAt: number | null;
  duration: number;
  clockAt?: number;
  presentation: Presentation;
  snapshots: StratSnapshot[];
  eventCount: number;
  demoId: string | null;
  pinned: boolean;
  expiresAt: string | null;
};
export type AudioAnchor = { audio: number; demoTick: number };
export type AudioTrack = {
  id: string;
  sessionId: string;
  teamId: string;
  ownerId: string;
  source: "microphone" | "discord" | "game" | "file";
  name: string;
  mime: string;
  status: "uploading" | "ready" | "failed";
  start: number;
  duration: number;
  bytes: number;
  segments: number;
  anchors: AudioAnchor[];
  createdAt: string;
  error?: string;
};
export type RecordingRoom = {
  session: LiveSession;
  tracks: AudioTrack[];
  canControl: boolean;
  canRecord: boolean;
  serverTime: number;
};
export type LearningExplanation = {
  id: string;
  teamId: string;
  stratId: string;
  slotId: string | null;
  scene?: SceneReference;
  sessionId: string;
  title: string;
  start: number;
  end: number;
  createdBy: string;
};

export function sessionTime(session: LiveSession, now: number): number {
  return session.status === "recording" && session.startedAt !== null
    ? session.clockAt !== undefined
      ? Math.max(0, session.duration + (now - session.clockAt) / 1000)
      : Math.max(0, (now - session.startedAt) / 1000)
    : session.duration;
}
export function presentationAt(
  events: SessionEvent[],
  at: number,
): Presentation {
  let presentation: Presentation = { kind: "notes" };
  let eventTime = 0;
  for (const event of events) {
    if (event.at > at) break;
    if (event.presentation) {
      presentation = event.presentation;
      eventTime = event.at;
    }
  }
  if (presentation.kind !== "demo") return presentation;
  const { scene, playback } = presentation;
  return {
    ...presentation,
    playback: {
      ...playback,
      time: Math.min(
        scene.end,
        playback.time +
          (playback.playing ? Math.max(0, at - eventTime) * playback.speed : 0),
      ),
      playing: false,
    },
  };
}
export function audioTimeAtTick(
  anchors: AudioAnchor[],
  tick: number,
): number | null {
  if (anchors.length < 2) return null;
  const pairs = [...anchors].sort((a, b) => a.demoTick - b.demoTick);
  const index = Math.max(
    0,
    Math.min(pairs.length - 2, pairs.findIndex((a) => a.demoTick >= tick) - 1),
  );
  const a = pairs[tick > pairs.at(-1)!.demoTick ? pairs.length - 2 : index],
    b = pairs[pairs.indexOf(a) + 1];
  return (
    a.audio +
    ((tick - a.demoTick) * (b.audio - a.audio)) / (b.demoTick - a.demoTick)
  );
}
