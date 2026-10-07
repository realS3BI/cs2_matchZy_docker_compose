import type { PhotoFrame } from "./review-recorder";
import type { ReviewSlot } from "../../../shared/review-media";

export type DesktopStatus = {
  appVersion: string;
  update: { state: string; message: string };
  connected: boolean;
  recovery: boolean;
  active: boolean;
};
export type DemoFolderState = {
  error?: string;
  completed?: boolean;
  folder: string;
  running: boolean;
  current: string;
  results: { name: string; status: "uploaded" | "skipped" | "failed"; demoId?: string; message: string }[];
};
export type PlaybookDesktop = {
  version: 1;
  status(): Promise<DesktopStatus>;
  launch(): Promise<void>;
  connect(): Promise<void>;
  frame(width: number, height: number): Promise<PhotoFrame>;
  begin(slot: ReviewSlot, cameraPitch?: number): Promise<string>;
  end(token: string): Promise<void>;
  disconnect(): Promise<void>;
  recover(): Promise<void>;
  checkUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onStopVideo(callback: () => void): () => void;
  liveStatus?(): Promise<{
    recording: boolean;
    sessionId: string;
    muted: boolean;
    pending: number;
    error?: string;
    microphoneControl?: boolean;
    levels?: { game: number; discord: number };
  }>;
  liveDevices?(): Promise<{
    devices: { id: string; name: string; level: number }[];
    microphoneControl: boolean;
  }>;
  liveStart?(
    sessionId: string,
    options: {
      gameDeviceId: string;
      voiceDeviceId: string;
      microphoneStrip: number;
    },
  ): Promise<void>;
  liveStop?(): Promise<void>;
  liveMute?(muted: boolean): Promise<void>;
  liveRetry?(): Promise<void>;
  demoFolderStatus?(): Promise<DemoFolderState>;
  demoFolderSet?(folder: string): Promise<DemoFolderState>;
  demoFolderChoose?(): Promise<DemoFolderState>;
  demoFolderImport?(options: { teamId: string | null; source: "faceit" | "premier" | "other" }): Promise<DemoFolderState>;
  demoFolderCancel?(): Promise<DemoFolderState>;
};
declare global {
  interface Window {
    playbookDesktop?: PlaybookDesktop;
  }
}
export const desktop =
  window.playbookDesktop?.version === 1 ? window.playbookDesktop : undefined;
