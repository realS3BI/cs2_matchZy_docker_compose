import { useEffect, useState } from "react";
import { desktop } from "@/lib/playbook-desktop";
import { Button } from "./ui/button";
import { Field, FieldLabel, FieldDescription } from "./ui/field";
import { Progress } from "./ui/progress";
import { Checkbox } from "./ui/checkbox";
import { Choice, Feedback } from "./workspace-ui";

const key = "playbook-live-audio-devices";
type Settings = {
  gameDeviceId: string;
  voiceDeviceId: string;
  microphoneStrip: number;
};
function saved(): Settings {
  try {
    return (
      JSON.parse(localStorage.getItem(key) || "null") || {
        gameDeviceId: "",
        voiceDeviceId: "",
        microphoneStrip: 0,
      }
    );
  } catch {
    return { gameDeviceId: "", voiceDeviceId: "", microphoneStrip: 0 };
  }
}
export function LiveAudioDevices({
  sessionId,
  busy,
  status,
  work,
}: {
  sessionId: string;
  busy: boolean;
  status: any;
  work: (action: () => Promise<unknown>) => Promise<unknown>;
}) {
  const [settings, setSettings] = useState(saved);
  const [devices, setDevices] = useState<
    { id: string; name: string; level: number }[]
  >([]);
  const [control, setControl] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!desktop?.liveDevices || status?.recording) return;
    let alive = true,
      querying = false;
    const query = async () => {
      if (querying) return;
      querying = true;
      try {
        const result = await desktop.liveDevices();
        if (!alive) return;
        setDevices(result.devices);
        setControl(result.microphoneControl);
        setError("");
        setSettings((old) => ({
          ...old,
          gameDeviceId:
            old.gameDeviceId ||
            result.devices.find((d) => /Voicemeeter Out B1/i.test(d.name))
              ?.id ||
            "",
          voiceDeviceId:
            old.voiceDeviceId ||
            result.devices.find((d) => /Voicemeeter Out B2/i.test(d.name))
              ?.id ||
            "",
        }));
      } catch (cause) {
        if (alive) setError(cause.message);
      } finally {
        querying = false;
      }
    };
    void query();
    const timer = setInterval(() => void query(), 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [status?.recording]);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(settings));
  }, [settings]);
  const game = devices.find((d) => d.id === settings.gameDeviceId);
  const voice = devices.find((d) => d.id === settings.voiceDeviceId);
  const canControl =
    control && !!voice && /Out B2|Voicemeeter AUX/i.test(voice.name);
  const options = [
    { value: "", label: "Aufnahmegerät auswählen" },
    ...devices.map((d) => ({ value: d.id, label: d.name })),
  ];
  if (!desktop?.liveDevices)
    return (
      <p>
        Für die Geräteauswahl benötigst du die aktualisierte
        Windows-Desktop-App.
      </p>
    );
  return (
    <>
      {!status?.recording && (
        <>
          <Choice
            label="Spielquelle · empfohlen: Voicemeeter Out B1"
            value={settings.gameDeviceId}
            onChange={(value) =>
              setSettings((old) => ({ ...old, gameDeviceId: value }))
            }
            options={options}
          />
          <Choice
            label="Kommunikationsquelle · empfohlen: Voicemeeter Out B2"
            value={settings.voiceDeviceId}
            onChange={(value) =>
              setSettings((old) => ({ ...old, voiceDeviceId: value }))
            }
            options={options}
          />
          <Field>
            <FieldLabel>
              <Checkbox
                aria-label="Mikrofonzuleitung zu B2 steuern"
                checked={settings.microphoneStrip >= 0}
                disabled={!canControl}
                onCheckedChange={(value) =>
                  setSettings((old) => ({
                    ...old,
                    microphoneStrip: value ? 0 : -1,
                  }))
                }
              />{" "}
              Mikrofonzuleitung zu B2 steuern
            </FieldLabel>
            <FieldDescription>
              {canControl
                ? "B3 bleibt unverändert. Ohne Steuerung gilt dein vorhandenes Voicemeeter-Routing."
                : "Mikrofonsteuerung ist nicht verfügbar. Wähle B2 und öffne Voicemeeter Potato, oder ändere den Mikrofon-B2-Schalter manuell."}{" "}
              Discord-Mute und Push-to-Talk gelten nicht für diese Aufnahme.
            </FieldDescription>
          </Field>
          {canControl && settings.microphoneStrip >= 0 && (
            <Choice
              label="Mikrofonkanal in Voicemeeter"
              value={String(settings.microphoneStrip)}
              onChange={(value) =>
                setSettings((old) => ({
                  ...old,
                  microphoneStrip: Number(value),
                }))
              }
              options={Array.from({ length: 5 }, (_, i) => ({
                value: String(i),
                label: `Eingang ${i + 1}${i === 0 ? " · Headset" : ""}`,
              }))}
            />
          )}
        </>
      )}
      {(["game", "discord"] as const).map((source) => (
        <Field key={source}>
          <FieldLabel>
            {source === "game" ? "Spielpegel" : "Kommunikationspegel"}
          </FieldLabel>
          <Progress
            aria-label={
              source === "game" ? "Spielpegel" : "Kommunikationspegel"
            }
            value={
              100 *
              (status?.recording
                ? status.levels?.[source] || 0
                : (source === "game" ? game : voice)?.level || 0)
            }
          />
        </Field>
      ))}
      <Feedback error={error} />
      {!status?.recording ? (
        <Button
          disabled={busy || !game || !voice || game.id === voice.id || !!error}
          onClick={() =>
            void work(() =>
              desktop.liveStart(sessionId, {
                ...settings,
                microphoneStrip: canControl ? settings.microphoneStrip : -1,
              }),
            )
          }
        >
          Spiel und Kommunikation aufnehmen
        </Button>
      ) : (
        <>
          {status.microphoneControl && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void work(() => desktop.liveMute(!status.muted))}
            >
              {status.muted
                ? "Eigenes Mikrofon mit aufnehmen"
                : "Eigenes Mikrofon aus Aufnahme nehmen"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void work(() => desktop.liveStop())}
          >
            Tonaufnahme beenden
          </Button>
        </>
      )}
    </>
  );
}
