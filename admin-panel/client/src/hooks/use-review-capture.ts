import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ReviewRecorder } from "../lib/review-recorder";
import { type ReviewSlot } from "../../../shared/review-media";

export function useReviewCapture({ nade, admin, upload, onStep, onError, disabled }) {
  const [capture, setCapture] = useState<ReviewRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const session = useRef<string>(undefined);
  const currentCapture = useRef<ReviewRecorder>(undefined);
  const videoUpload = useRef<Promise<void>>(undefined);
  const takingPhoto = useRef(false);
  const mounted = useRef(true);
  const current = useRef({ nade, upload, onStep, onError, disabled });
  current.current = { nade, upload, onStep, onError, disabled };

  function disconnect() {
    const id = session.current;
    session.current = undefined;
    currentCapture.current?.dispose();
    currentCapture.current = undefined;
    if (id) void fetch("/api/nades/review/capture/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id }), keepalive: true }).catch(() => {});
    if (mounted.current) { setCapture(null); setRecording(false); }
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; disconnect(); };
  }, []);
  useEffect(() => { if (disabled) disconnect(); }, [disabled]);

  async function connect() {
    if (connecting || currentCapture.current) return;
    setConnecting(true);
    try {
      const next = await ReviewRecorder.share();
      if (!mounted.current) { next.dispose(); return; }
      currentCapture.current = next;
      if (admin) {
        const { owner, map, name } = current.current.nade;
        const data = await api("/api/nades/review/capture/start", { method: "POST", body: JSON.stringify({ owner, map, name }) });
        session.current = data.session.id;
      }
      if (!mounted.current) { disconnect(); return; }
      next.stream.getVideoTracks()[0].addEventListener("ended", disconnect, { once: true });
      setCapture(next);
      setNotice(admin ? "Verbunden. Öffne im Spiel dieses Lineup und wähle Medien-Review." : "Spielbild verbunden. Du kannst jetzt Fotos und ein Video aufnehmen.");
    } catch (error) { disconnect(); current.current.onError(error.message); }
    finally { if (mounted.current) setConnecting(false); }
  }
  async function photo(slot: ReviewSlot, countdown = false) {
    if (!currentCapture.current || slot === "video") throw new Error("Bitte zuerst das Spielbild verbinden.");
    if (takingPhoto.current || videoUpload.current) throw new Error("Eine Aufnahme läuft bereits.");
    takingPhoto.current = true;
    try {
      current.current.onStep(slot);
      const source = currentCapture.current;
      if (countdown) {
        setNotice("Foto in drei Sekunden. Wechsle jetzt zu CS2 und halte den Bildausschnitt ruhig.");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      if (!mounted.current || currentCapture.current !== source) return;
      const file = await source.photo(slot);
      await current.current.upload(slot, file);
      if (mounted.current) setNotice("Foto gespeichert. Du kannst die nächste Perspektive aufnehmen.");
    } finally { takingPhoto.current = false; }
  }
  function startVideo() {
    if (!currentCapture.current || videoUpload.current || takingPhoto.current) throw new Error("Bitte zuerst das Spielbild verbinden oder die laufende Aufnahme beenden.");
    current.current.onStep("video");
    const result = currentCapture.current.startVideo(() => setNotice("Zwei Minuten erreicht. Das Video wird gespeichert."));
    setRecording(true);
    videoUpload.current = result.then(async file => {
      if (!mounted.current) return;
      setRecording(false);
      await current.current.upload("video", file);
    }).finally(() => { videoUpload.current = undefined; if (mounted.current) setRecording(false); });
    // The stop command also awaits this promise so the game receives upload failures.
    void videoUpload.current.catch(error => { if (mounted.current && currentCapture.current) current.current.onError(error.message); });
  }
  async function stopVideo() {
    if (!videoUpload.current) throw new Error("Es läuft keine Videoaufnahme.");
    currentCapture.current?.stopVideo();
    await videoUpload.current;
  }
  const operations = useRef({ photo, startVideo, stopVideo });
  operations.current = { photo, startVideo, stopVideo };
  useEffect(() => {
    if (!capture || !admin) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastCommand = "";
    let processing = false;
    async function processCommand(command, id) {
      processing = true;
      lastCommand = command.id;
      let ok = false;
      try {
        if (current.current.disabled) throw new Error("Bitte Änderungen zuerst speichern.");
        if (command.action === "photo") await operations.current.photo(command.slot);
        else if (command.action === "video-start") operations.current.startVideo();
        else await operations.current.stopVideo();
        ok = true;
      } catch (error) { if (!stopped) current.current.onError(error.message); }
      try {
        if (!stopped && session.current === id) await api("/api/nades/review/capture/ack", { method: "POST", body: JSON.stringify({ sessionId: id, commandId: command.id, ok }) });
      } catch (error) { if (!stopped) current.current.onError(error.message); }
      finally { processing = false; }
    }
    async function poll() {
      const id = session.current;
      if (stopped || !id) return;
      try {
        const { command } = await api("/api/nades/review/capture/poll", { method: "POST", body: JSON.stringify({ sessionId: id }) });
        if (stopped || session.current !== id) return;
        // Keep renewing the lease while a large video uploads.
        if (command && command.id !== lastCommand && !processing) void processCommand(command, id);
      } catch (error) {
        if (!stopped) { current.current.onError(error.message); disconnect(); }
      } finally { if (!stopped && session.current === id) timer = setTimeout(poll, 1000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [capture, admin]);
  return { capture, recording, connecting, notice, connect, disconnect, photo, startVideo, stopVideo };
}
