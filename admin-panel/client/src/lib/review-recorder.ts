import { VIDEO_LIMIT } from "../../../shared/review-media";

export class ReviewRecorder {
  readonly video = document.createElement("video");
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resolveVideo: ((file: File) => void) | undefined;
  private rejectVideo: ((error: Error) => void) | undefined;
  private recording: Promise<File> | null = null;
  constructor(readonly stream: MediaStream) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
  }
  static async share() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Bildschirmaufnahme benötigt HTTPS und einen unterstützten Browser. Unter Windows bitte Chrome oder Edge verwenden.");
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const capture = new ReviewRecorder(stream);
    try { await capture.video.play(); return capture; }
    catch (error) { capture.dispose(); throw error; }
  }
  async photo(name: string) {
    if (this.stream.getVideoTracks()[0]?.readyState !== "live" || !this.video.videoWidth) throw new Error("Das Spielbild ist noch nicht bereit. Prüfe die Vorschau und versuche es erneut.");
    // A background tab may stop painting its video element. Read the track
    // directly in Chromium so an in-game trigger captures the current frame.
    const Capture = (window as any).ImageCapture;
    const frame: ImageBitmap | undefined = Capture ? await new Capture(this.stream.getVideoTracks()[0]).grabFrame() : undefined;
    const source = frame || this.video;
    const width = frame?.width || this.video.videoWidth;
    const height = frame?.height || this.video.videoHeight;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2560 / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    try { canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height); }
    finally { frame?.close(); }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Das Foto konnte nicht aufgenommen werden.")), "image/jpeg", 0.92));
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  }
  startVideo(onLimit: () => void): Promise<File> {
    if (this.recorder || this.stream.getVideoTracks()[0]?.readyState !== "live") throw new Error("Eine Aufnahme läuft bereits oder die Bildschirmfreigabe wurde beendet.");
    if (typeof MediaRecorder === "undefined") throw new Error("Dieser Browser unterstützt keine Videoaufnahme. Bitte eine Videodatei hochladen.");
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Kein unterstütztes Aufnahmeformat. Bitte eine MP4- oder WebM-Datei hochladen.");
    this.chunks = [];
    let size = 0;
    const recorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: 6_000_000 });
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
    if (this.recorder?.state === "recording") this.recorder.stop();
    return this.recording;
  }
  private cancelVideo(error: Error) {
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
