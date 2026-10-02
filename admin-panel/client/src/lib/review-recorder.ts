import { VIDEO_LIMIT } from "../../../shared/review-media";
import { desktop } from "./playbook-desktop";

export type PhotoFrame = { width: number; height: number; top: number; right: number; bottom: number; left: number };

export function photoRectangle(frame: PhotoFrame, width: number, height: number) {
  if (frame.width !== width || frame.height !== height)
    throw new Error("Die Größe des Spielbilds hat sich geändert. Bitte den Aufnahmeausschnitt erneut bestätigen.");
  const { top, right, bottom, left } = frame;
  if (![top, right, bottom, left].every(value => Number.isInteger(value) && value >= 0) || width - left - right < 64 || height - top - bottom < 64)
    throw new Error("Der Aufnahmeausschnitt ist ungültig. Bitte die Ränder prüfen.");
  return { x: left, y: top, width: width - left - right, height: height - top - bottom };
}

export class ReviewRecorder {
  readonly video = document.createElement("video");
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resolveVideo: ((file: File) => void) | undefined;
  private rejectVideo: ((error: Error) => void) | undefined;
  private recording: Promise<File> | null = null;
  private photoFrame: PhotoFrame | null = null;
  private stopVideoFrame: (() => void) | undefined;
  private preparingVideo = false;
  private stopRequested = false;
  get frame() { return this.photoFrame && { ...this.photoFrame }; }
  clearPhotoFrame() { this.photoFrame = null; }
  setPhotoFrame(frame: PhotoFrame) {
    photoRectangle(frame, this.video.videoWidth, this.video.videoHeight);
    this.photoFrame = { ...frame };
  }
  checkPhotoFrame() {
    if (!this.photoFrame) throw new Error("Bitte zuerst den Aufnahmeausschnitt unter der Spielbild-Vorschau bestätigen.");
    return photoRectangle(this.photoFrame, this.video.videoWidth, this.video.videoHeight);
  }
  constructor(readonly stream: MediaStream) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
  }
  static async share() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Bildschirmaufnahme benötigt HTTPS und einen unterstützten Browser. Unter Windows bitte Chrome oder Edge verwenden.");
    if (desktop) await desktop.connect();
    let capture: ReviewRecorder | undefined;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, ...(desktop ? { width: { ideal: 16384 }, height: { ideal: 16384 } } : {}) }, audio: false });
      capture = new ReviewRecorder(stream);
      await capture.video.play();
      if (desktop) await capture.refreshDesktopFrame();
      return capture;
    }
    catch (error) {
      capture?.dispose();
      if (desktop) await desktop.disconnect().catch(() => {});
      throw error;
    }
  }
  async refreshDesktopFrame() {
    if (desktop) this.setPhotoFrame(await desktop.frame(this.video.videoWidth, this.video.videoHeight));
  }
  private async gameFrame(): Promise<ImageBitmap | undefined> {
    const Capture = (window as any).ImageCapture;
    if (!Capture) return undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const frame = new Capture(this.stream.getVideoTracks()[0]).grabFrame().then((bitmap: ImageBitmap) => {
      if (expired) { bitmap.close(); throw new Error("Spielbild kurz unterbrochen."); }
      return bitmap;
    });
    try {
      return await Promise.race([frame, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error("Spielbild kurz unterbrochen.")); }, 1200);
      })]);
    } finally { clearTimeout(timer!); }
  }
  async photo(name: string) {
    // A background tab may stop painting its video element. Read the track
    // directly in Chromium so an in-game trigger captures the current frame.
    let frame: ImageBitmap | undefined;
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        await this.refreshDesktopFrame();
        this.checkPhotoFrame();
        if (this.stream.getVideoTracks()[0]?.readyState !== "live" || this.stream.getVideoTracks()[0].muted || !this.video.videoWidth)
          throw new Error("Das Spielbild ist noch nicht bereit. Prüfe die Vorschau und versuche es erneut.");
        frame = await this.gameFrame();
        break;
      } catch (error) {
        if (this.stream.getVideoTracks()[0]?.readyState !== "live" || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    const source = frame || this.video;
    const width = frame?.width || this.video.videoWidth;
    const height = frame?.height || this.video.videoHeight;
    const canvas = document.createElement("canvas");
    try {
      const rect = photoRectangle(this.photoFrame!, width, height);
      const scale = Math.min(1, 2560 / rect.width);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      // Preserve the game's pixels, including its real crosshair. Never draw a
      // replacement at the centre of the window or the cropped image.
      canvas.getContext("2d")!.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    }
    finally { frame?.close(); }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Das Foto konnte nicht aufgenommen werden.")), "image/jpeg", 0.92));
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  }
  async prepareVideo(onLimit: () => void): Promise<{ recording: Promise<File> }> {
    this.preparingVideo = true;
    this.stopRequested = false;
    try {
      await this.refreshDesktopFrame();
      const initial = this.checkPhotoFrame();
      const canvas = document.createElement("canvas");
      canvas.width = initial.width; canvas.height = initial.height;
      const context = canvas.getContext("2d")!;
      const output = canvas.captureStream(30);
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      let geometryTimer: ReturnType<typeof setTimeout>;
      let geometryInterrupted = 0;
      let frameInterrupted = 0;
      this.stopVideoFrame = () => { stopped = true; clearTimeout(timer); clearTimeout(geometryTimer); output.getTracks().forEach(track => track.stop()); };
      const checkGeometry = async () => {
        try { await this.refreshDesktopFrame(); geometryInterrupted = 0; }
        catch (error) {
          geometryInterrupted ||= Date.now();
          if (!stopped && (this.stream.getVideoTracks()[0]?.readyState !== "live" || Date.now() - geometryInterrupted >= 5000))
            this.cancelVideo(error instanceof Error ? error : new Error("Spielbild unterbrochen."));
        }
        if (!stopped) geometryTimer = setTimeout(() => void checkGeometry(), geometryInterrupted ? 250 : 3000);
      };
      const paint = async () => {
        let frame: ImageBitmap | undefined;
        try {
          if (this.stream.getVideoTracks()[0]?.readyState !== "live" || this.stream.getVideoTracks()[0].muted)
            throw new Error("Spielbild unterbrochen.");
          frame = await this.gameFrame();
          if (stopped) return;
          const rect = photoRectangle(this.photoFrame!, frame?.width || this.video.videoWidth, frame?.height || this.video.videoHeight);
          if (rect.width !== initial.width || rect.height !== initial.height) throw new Error("Die Spielgröße hat sich während des Videos geändert. Bitte erneut aufnehmen.");
          context.drawImage(frame || this.video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
          frameInterrupted = 0;
        } catch (error) {
          frameInterrupted ||= Date.now();
          if (this.stream.getVideoTracks()[0]?.readyState !== "live" || Date.now() - frameInterrupted >= 5000)
            this.cancelVideo(error instanceof Error ? error : new Error("Spielbild unterbrochen."));
        }
        finally { frame?.close(); }
        if (!stopped) timer = setTimeout(() => void paint(), frameInterrupted ? 150 : 33);
      };
      context.drawImage(this.video, initial.x, initial.y, initial.width, initial.height, 0, 0, canvas.width, canvas.height);
      const result = this.startVideo(onLimit, output);
      this.preparingVideo = false;
      if (this.stopRequested) this.stopVideo();
      void paint();
      geometryTimer = setTimeout(() => void checkGeometry(), 3000);
      return { recording: result.finally(() => { this.stopVideoFrame?.(); this.stopVideoFrame = undefined; }) };
    } catch (error) { this.stopVideoFrame?.(); this.stopVideoFrame = undefined; throw error; }
    finally { this.preparingVideo = false; }
  }
  startVideo(onLimit: () => void, source = this.stream): Promise<File> {
    if (this.recorder || this.stream.getVideoTracks()[0]?.readyState !== "live") throw new Error("Eine Aufnahme läuft bereits oder die Bildschirmfreigabe wurde beendet.");
    if (typeof MediaRecorder === "undefined") throw new Error("Dieser Browser unterstützt keine Videoaufnahme. Bitte eine Videodatei hochladen.");
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Kein unterstütztes Aufnahmeformat. Bitte eine MP4- oder WebM-Datei hochladen.");
    this.chunks = [];
    let size = 0;
    const recorder = new MediaRecorder(source, { mimeType, videoBitsPerSecond: 6_000_000 });
    this.recorder = recorder;
    this.recording = new Promise<File>((resolve, reject) => { this.resolveVideo = resolve; this.rejectVideo = reject; });
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      size += event.data.size;
      if (size > VIDEO_LIMIT) { this.cancelVideo(new Error("Das Video ist größer als 128 MB. Bitte kürzer aufnehmen.")); return; }
      this.chunks.push(event.data);
    };
    recorder.onerror = () => this.cancelVideo(new Error("Die Videoaufnahme ist fehlgeschlagen."));
    recorder.onstop = () => {
      clearTimeout(this.timer);
      const type = mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
      this.resolveVideo?.(new File(this.chunks, `lineup.${type === "video/mp4" ? "mp4" : "webm"}`, { type }));
      this.chunks = [];
      this.recorder = null;
    };
    recorder.start(1000);
    this.timer = setTimeout(() => { onLimit(); this.stopVideo(); }, 120_000);
    return this.recording;
  }
  stopVideo() {
    if (this.preparingVideo) this.stopRequested = true;
    if (this.recorder?.state === "recording") this.recorder.stop();
    return this.recording;
  }
  private cancelVideo(error: Error) {
    this.stopVideoFrame?.();
    clearTimeout(this.timer);
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
    }
    this.recorder = null;
    this.chunks = [];
    this.rejectVideo?.(error);
  }
  dispose() {
    this.cancelVideo(new Error("Aufnahme beendet."));
    for (const track of this.stream.getTracks()) track.stop();
    this.video.srcObject = null;
  }
}
