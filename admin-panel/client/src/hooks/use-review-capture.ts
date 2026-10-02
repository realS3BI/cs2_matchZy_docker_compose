import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ReviewRecorder } from "../lib/review-recorder";
import { desktop } from "../lib/playbook-desktop";
import { type ReviewSlot } from "../../../shared/review-media";

export function useReviewCapture({ nade, admin, upload, onStep, onError, disabled, followPanel = false, onSelection = (_selection: any) => {} }) {
  const [capture, setCapture] = useState<ReviewRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState("");
  const session = useRef<string>(undefined);
  const currentCapture = useRef<ReviewRecorder>(undefined);
  const videoUpload = useRef<Promise<void>>(undefined);
  const takingPhoto = useRef(false);
  const preparingVideo = useRef(false);
  const requestedCapture = useRef<{ id: string; expiresAt: number } | undefined>(undefined);
  const videoStopCommand = useRef<{ id: string } | undefined>(undefined);
  const pendingRelease = useRef<{ sessionId: string; commandId: string } | undefined>(undefined);
  const pendingAcknowledgement = useRef<{ sessionId: string; commandId: string; ok: boolean } | undefined>(undefined);
  const mounted = useRef(true);
  const current = useRef({ nade, upload, onStep, onError, disabled, recording, onSelection });
  current.current = { nade, upload, onStep, onError, disabled, recording, onSelection };

  function disconnect() {
    const id = session.current;
    const source = currentCapture.current;
    session.current = undefined;
    requestedCapture.current = undefined;
    pendingRelease.current = pendingAcknowledgement.current = undefined;
    currentCapture.current = undefined;
    source?.dispose();
    if (source && desktop) void desktop.disconnect().catch(error => { if (mounted.current) current.current.onError(error.message); });
    if (id) void fetch("/api/nades/review/capture/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id }), keepalive: true }).catch(() => {});
    if (mounted.current) { setCapture(null); setRecording(false); setPreparing(false); }
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; disconnect(); };
  }, []);

  async function releaseGame(sessionId: string, commandId: string) {
    const signal = { sessionId, commandId };
    pendingRelease.current = signal;
    try {
      await api("/api/nades/review/capture/captured", { method: "POST", body: JSON.stringify(signal) });
      if (pendingRelease.current === signal) pendingRelease.current = undefined;
    } catch {
      // Retain the captured File and retry the release while polling. An upload
      // acknowledgement also releases the server's camera if this signal is lost.
      if (mounted.current) setNotice("Aufnahme erstellt. Die Rückmeldung an das Spiel wird erneut gesendet.");
    }
  }

  async function connect() {
    if (connecting || currentCapture.current) return;
    setConnecting(true);
    try {
      const next = await ReviewRecorder.share();
      if (!mounted.current) { next.dispose(); if (desktop) await desktop.disconnect().catch(() => {}); return; }
      currentCapture.current = next;
      if (admin) {
        const reference = followPanel ? { followPanel: true } : current.current.nade;
        const data = await api("/api/nades/review/capture/start", { method: "POST", body: JSON.stringify(reference) });
        session.current = data.session.id;
      }
      if (!mounted.current) { disconnect(); return; }
      next.stream.getVideoTracks()[0].addEventListener("ended", disconnect, { once: true });
      setCapture(next);
      setNotice(admin ? followPanel ? "Verbunden. Wähle im Ingame-Panel ein Medien-Review. Lineup, Bilder und Schritt erscheinen hier automatisch." : "Verbunden. Öffne im Spiel dieses Lineup und wähle Medien-Review." : "Spielbild verbunden. Du kannst jetzt Fotos und ein Video aufnehmen.");
    } catch (error) { disconnect(); current.current.onError(error.message); }
    finally { if (mounted.current) setConnecting(false); }
  }
  async function photo(slot: ReviewSlot, countdown = false, command?: { id: string; presentation?: string; nade?: any }) {
    if (!currentCapture.current || slot === "video") throw new Error("Bitte zuerst das Spielbild verbinden.");
    if (takingPhoto.current || preparingVideo.current || videoUpload.current || countdown && requestedCapture.current) throw new Error("Eine Aufnahme läuft bereits.");
    currentCapture.current.checkPhotoFrame();
    if (admin && countdown) {
      setPreparing(true);
      try {
        const data = await api("/api/nades/review/capture/photo", { method: "POST", body: JSON.stringify({ sessionId: session.current, slot }) });
        requestedCapture.current = data.request;
      } catch (error) { setPreparing(false); throw error; }
      setNotice("CS2 bereitet HUD und Kamera vor. Wechsle zum Spiel und halte den Bildausschnitt ruhig.");
      return;
    }
    if (admin && command?.presentation !== "review-v2") throw new Error("Bitte das Server-Plugin aktualisieren. Die ältere Version blendet das echte Fadenkreuz noch aus.");
    takingPhoto.current = true;
    const reference = command?.nade || current.current.nade;
    setPreparing(true);
    try {
      current.current.onStep(slot);
      const source = currentCapture.current;
      if (countdown) {
        setNotice("Foto in drei Sekunden. Wechsle jetzt zu CS2 und halte den Bildausschnitt ruhig.");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      if (!mounted.current || currentCapture.current !== source) return;
      let file: File;
      let token: string | undefined;
      try {
        if (desktop) {
          token = await desktop.begin(slot);
          // Let CS2 render the verified local settings before grabbing pixels.
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        if (currentCapture.current !== source) throw new Error("Die Aufnahme wurde beendet.");
        file = await source.photo(slot);
      }
      finally {
        // Release the game's camera/HUD immediately after grabbing the frame,
        // before the potentially slow upload. Errors also release the game.
        try { if (token) await desktop!.end(token); }
        finally {
          if (command && session.current) await releaseGame(session.current, command.id);
        }
      }
      await current.current.upload(slot, file, reference);
      if (mounted.current) setNotice("Foto gespeichert. Du kannst die nächste Perspektive aufnehmen.");
    } catch (error) {
      if (mounted.current) setNotice("Foto-Aufnahme beendet. Bitte die Fehlermeldung unten prüfen.");
      throw error;
    } finally { takingPhoto.current = false; if (mounted.current) setPreparing(false); }
  }
  async function startVideo(countdown = false, command?: { id: string; nade?: any }) {
    if (!currentCapture.current || videoUpload.current || takingPhoto.current || preparingVideo.current) throw new Error("Bitte zuerst das Spielbild verbinden oder die laufende Aufnahme beenden.");
    currentCapture.current.checkPhotoFrame();
    if (admin && countdown) {
      if (requestedCapture.current) throw new Error("Eine Aufnahme wird bereits vorbereitet.");
      setPreparing(true);
      try {
        const data = await api("/api/nades/review/capture/video", { method: "POST", body: JSON.stringify({ sessionId: session.current, action: "video-start" }) });
        requestedCapture.current = data.request;
        setNotice("CS2 blendet das Panel aus. Wechsle zum Spiel und warte auf die Aufnahmebestätigung.");
      } catch (error) { setPreparing(false); throw error; }
      return;
    }
    preparingVideo.current = true;
    setPreparing(true);
    videoStopCommand.current = undefined;
    const source = currentCapture.current;
    const videoSession = session.current;
    const reference = command?.nade || current.current.nade;
    let token: string | undefined;
    try {
      if (desktop) {
        token = await desktop.begin("video");
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (currentCapture.current !== source) throw new Error("Die Aufnahme wurde beendet.");
      current.current.onStep("video");
      const onLimit = () => setNotice("Zwei Minuten erreicht. Das Video wird gespeichert.");
      const result = (await source.prepareVideo(onLimit)).recording;
      setRecording(true);
      videoUpload.current = result.finally(async () => {
        try { if (token) await desktop!.end(token); }
        finally {
          const released = videoStopCommand.current || command;
          if (released && videoSession && session.current === videoSession) await releaseGame(videoSession, released.id);
        }
      }).then(async file => {
        if (!mounted.current) return;
        setRecording(false);
        await current.current.upload("video", file, reference);
      }).finally(() => { videoUpload.current = undefined; if (mounted.current) setRecording(false); });
      // The stop command also awaits this promise so the game receives upload failures.
      void videoUpload.current.catch(error => { if (mounted.current && currentCapture.current) current.current.onError(error.message); });
    } catch (error) { if (token) await desktop!.end(token); throw error; }
    finally { preparingVideo.current = false; if (mounted.current) setPreparing(false); }
  }
  async function stopVideo(countdown = false, command?: { id: string }) {
    if (!videoUpload.current) throw new Error("Es läuft keine Videoaufnahme.");
    if (admin && countdown) {
      if (requestedCapture.current) return;
      setPreparing(true);
      try {
        const data = await api("/api/nades/review/capture/video", { method: "POST", body: JSON.stringify({ sessionId: session.current, action: "video-stop" }) });
        requestedCapture.current = data.request;
        setNotice("CS2 beendet die Aufnahme. Deine Einstellungen und das Panel kehren vor dem Upload zurück.");
      } catch (error) {
        // A failed server request must still stop recording and restore local settings.
        currentCapture.current?.stopVideo();
        setPreparing(false);
        throw error;
      }
      return;
    }
    videoStopCommand.current = command;
    currentCapture.current?.stopVideo();
    try { await videoUpload.current; }
    finally { if (mounted.current) setPreparing(false); }
  }
  const operations = useRef({ photo, startVideo, stopVideo });
  operations.current = { photo, startVideo, stopVideo };
  useEffect(() => desktop?.onStopVideo(() => {
    if (videoUpload.current) void operations.current.stopVideo(true).catch(error => current.current.onError(error.message));
  }), []);
  useEffect(() => {
    if (!capture || !admin) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastCommand = "";
    let lastSelection = "";
    let pollFailed = false;
    let processing = false;
    async function processCommand(command, id) {
      processing = true;
      lastCommand = command.id;
      if (requestedCapture.current?.id === command.id) requestedCapture.current = undefined;
      if (command.action === "error") {
        current.current.onError(command.message);
        setNotice("Aufnahme-Vorbereitung beendet. Bitte die Fehlermeldung unten prüfen.");
        setPreparing(false);
        if (videoUpload.current) currentCapture.current?.stopVideo();
        processing = false;
        return;
      }
      let ok = false;
      try {
        if (current.current.disabled) throw new Error("Bitte Änderungen zuerst speichern.");
        if (command.nade) current.current.onSelection({ id: command.id, nade: command.nade, step: command.slot });
        if (command.action === "photo") await operations.current.photo(command.slot, false, command);
        else if (command.action === "video-start") await operations.current.startVideo(false, command);
        else await operations.current.stopVideo(false, command);
        ok = true;
      } catch (error) { if (!stopped) current.current.onError(error.message); }
      try {
        if (!stopped && session.current === id) {
          const signal = { sessionId: id, commandId: command.id, ok };
          pendingAcknowledgement.current = signal;
          await api("/api/nades/review/capture/ack", { method: "POST", body: JSON.stringify(signal) });
          if (pendingAcknowledgement.current === signal) pendingAcknowledgement.current = undefined;
        }
      } catch { if (!stopped) setNotice("Aufnahme verarbeitet. Die Bestätigung an das Spiel wird erneut gesendet."); }
      finally { processing = false; }
    }
    async function poll() {
      const id = session.current;
      if (stopped || !id) return;
      try {
        const { command, selection } = await api("/api/nades/review/capture/poll", { method: "POST", body: JSON.stringify({ sessionId: id, recording: current.current.recording }) });
        if (stopped || session.current !== id) return;
        for (const [path, pending] of [["captured", pendingRelease], ["ack", pendingAcknowledgement]] as const) {
          const signal = pending.current;
          if (!signal) continue;
          if (signal.sessionId !== id) { pending.current = undefined; continue; }
          try {
            await api(`/api/nades/review/capture/${path}`, { method: "POST", body: JSON.stringify(signal) });
            if (pending.current === signal) pending.current = undefined;
          } catch (error) {
            if (error.status === 409) pending.current = undefined;
            else throw error;
          }
        }
        if (pollFailed) { pollFailed = false; setNotice("Ingame-Verbindung wiederhergestellt. Das Spielbild bleibt verbunden."); }
        const selectionStamp = selection && `${selection.id}:${selection.nade?.updatedAt}:${selection.nade?.official}`;
        if (followPanel && selection && selectionStamp !== lastSelection) {
          lastSelection = selectionStamp;
          current.current.onSelection(selection);
        }
        if (requestedCapture.current && requestedCapture.current.expiresAt <= Date.now()) {
          requestedCapture.current = undefined;
          setPreparing(false);
          if (videoUpload.current) currentCapture.current?.stopVideo();
          current.current.onError("CS2 hat die Aufnahme-Anfrage nicht bestätigt. Prüfe, ob du mit demselben Steam-Konto im Training bist und das neue Plugin läuft.");
          setNotice("Keine Aufnahmebestätigung vom Spielserver erhalten.");
        }
        // Keep renewing the lease while a large video uploads.
        if (command && command.id !== lastCommand && !processing) void processCommand(command, id);
      } catch (error) {
        if (!stopped) {
          if (error.status === 401 || error.status === 403) { current.current.onError(error.message); disconnect(); }
          else {
            pollFailed = true;
            setNotice("Ingame-Verbindung kurz unterbrochen. Das Spielbild bleibt verbunden; Playbook versucht es erneut.");
            if (error.status === 409 && !processing && !takingPhoto.current && !videoUpload.current && !preparingVideo.current) {
              try {
                const reference = followPanel ? { followPanel: true } : current.current.nade;
                const data = await api("/api/nades/review/capture/start", { method: "POST", body: JSON.stringify(reference) });
                if (!stopped && session.current === id) { session.current = data.session.id; lastCommand = ""; lastSelection = ""; }
              } catch { /* Keep the shared game image while the server recovers. */ }
            }
          }
        }
      } finally { if (!stopped && session.current) timer = setTimeout(poll, pollFailed ? 2000 : 1000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [capture, admin, followPanel]);
  return { capture, recording, connecting, preparing, notice, connect, disconnect, photo, startVideo: () => startVideo(true), stopVideo: () => stopVideo(true) };
}
