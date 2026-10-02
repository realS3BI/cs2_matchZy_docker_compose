import type { PhotoFrame } from "./review-recorder";
import type { ReviewSlot } from "../../../shared/review-media";

export type DesktopStatus = {
  appVersion: string;
  update: { state: string; message: string };
  connected: boolean;
  recovery: boolean;
  active: boolean;
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
};
declare global { interface Window { playbookDesktop?: PlaybookDesktop } }
export const desktop = window.playbookDesktop?.version === 1 ? window.playbookDesktop : undefined;
