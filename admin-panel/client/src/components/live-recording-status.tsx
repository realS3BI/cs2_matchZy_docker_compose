import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { browserAudio } from "@/lib/session-audio";
import { desktop } from "@/lib/playbook-desktop";
import { Button } from "./ui/button";

export function LiveRecordingStatus({ userId }: { userId: string }) {
  const [, update] = useState(0),
    [native, setNative] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(
    () => browserAudio.subscribe(() => update((value) => value + 1)),
    [],
  );
  useEffect(() => {
    if (!desktop?.liveStatus) return;
    const poll = () =>
      void desktop
        .liveStatus()
        .then(setNative)
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const retry = () => void browserAudio.retry(userId);
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [userId]);
  const recording = !!browserAudio.recorder || native?.recording;
  const pending = browserAudio.pending + (native?.pending || 0);
  const sessionId = native?.recording
    ? native.sessionId
    : browserAudio.sessionId;
  if (!recording && !pending && !error) return null;
  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3"
    >
      <Radio className="size-4 text-primary" aria-hidden="true" />
      <span className="text-sm">
        {recording
          ? "Tonaufnahme läuft"
          : `${pending} Audiosegmente warten auf den Upload`}
      </span>
      {sessionId && (
        <Button asChild size="sm" variant="outline">
          <Link to={`/analysis/live/${sessionId}`}>Zur Aufnahme</Link>
        </Button>
      )}
      {recording && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            setError("");
            try {
              if (native?.recording) await desktop.liveStop();
              if (browserAudio.recorder) await browserAudio.stop();
            } catch (cause) {
              setError(cause.message);
            }
          }}
        >
          Tonaufnahme beenden
        </Button>
      )}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
