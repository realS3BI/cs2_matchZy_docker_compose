import { useState } from "react";
import { Film, X } from "lucide-react";
import type { Demo, DemoReview, SceneReference } from "../../../shared/demos";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Choice, Feedback, useResource } from "./workspace-ui";
import { demoTime } from "./demo-player";

export function ScenePicker({
  teamId,
  map,
  value,
  onChange,
}: {
  teamId: string;
  map: string;
  value?: SceneReference;
  onChange: (scene?: SceneReference) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Film />
        {value
          ? `Beispielszene · ${demoTime(value.start)}–${demoTime(value.end)}`
          : "Beispielszene verknüpfen"}
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Beispielszene entfernen"
          onClick={() => onChange(undefined)}
        >
          <X />
        </Button>
      )}
      {open && (
        <Picker
          teamId={teamId}
          map={map}
          onClose={() => setOpen(false)}
          onSelect={(scene) => {
            onChange(scene);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function Picker({
  teamId,
  map,
  onClose,
  onSelect,
}: {
  teamId: string;
  map: string;
  onClose: () => void;
  onSelect: (scene: SceneReference) => void;
}) {
  const reviews = useResource<{ entries: DemoReview[] }>(
    "/api/analysis/reviews",
  );
  const demos = useResource<{ entries: Demo[] }>("/api/analysis/demos");
  const [selected, setSelected] = useState("");
  const [focus, setFocus] = useState("");
  const matches =
    demos.data?.entries.filter(
      (demo) =>
        demo.teamId === teamId &&
        demo.summary?.map === map &&
        demo.status === "ready",
    ) || [];
  const choices = (reviews.data?.entries || [])
    .filter((review) => review.teamId === teamId)
    .flatMap((review) =>
      review.scenes
        .filter((scene) => matches.some((demo) => demo.id === scene.demoId))
        .map((scene) => ({
          value: `${review.id}:${scene.id}`,
          label: `${review.title} · ${scene.title}`,
          scene,
        })),
    );
  const scene = choices.find((choice) => choice.value === selected)?.scene;
  const demo = matches.find((demo) => demo.id === scene?.demoId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aus dem Review lernen</DialogTitle>
          <DialogDescription>
            Wähle eine vorbereitete Szene dieses Teams auf derselben Map. Der
            Fokusspieler kann als Vorbild für diese Aufgabe dienen.
          </DialogDescription>
        </DialogHeader>
        <Feedback error={reviews.error || demos.error} />
        <Choice
          label="Vorbereitete Szene"
          value={selected}
          onChange={(id) => {
            setSelected(id);
            setFocus(
              choices.find((choice) => choice.value === id)?.scene.focusId ||
                "",
            );
          }}
          options={[{ value: "", label: "Szene auswählen" }, ...choices]}
        />
        {demo && (
          <Choice
            label="Spieler im Beispiel"
            value={focus}
            onChange={setFocus}
            options={[
              { value: "", label: "Teamübersicht" },
              ...demo.summary.players.map((player) => ({
                value: player.id,
                label: player.name,
              })),
            ]}
          />
        )}
        {!choices.length && !reviews.loading && !demos.loading && (
          <p className="text-sm text-muted-foreground">
            Noch keine passende Szene vorhanden. Speichere zuerst einen
            Ausschnitt aus einem Team-Match in einem Review.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={!scene}
            onClick={() => {
              if (scene)
                onSelect({
                  demoId: scene.demoId,
                  roundId: scene.roundId,
                  version: scene.version,
                  start: scene.start,
                  end: scene.end,
                  focusId: focus,
                });
            }}
          >
            Szene verknüpfen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
