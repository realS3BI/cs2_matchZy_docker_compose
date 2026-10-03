import { type RadarLevel } from "../lib/radar-layout";

export function RadarLevelSwitch({ level, onChange }: { level: RadarLevel; onChange: (level: RadarLevel) => void }) {
  return <div className="radar-level-switch" role="group" aria-label="Kartenebene auswählen">
    {(["upper", "lower"] as const).map((value, index) => <button key={value} type="button"
      aria-label={value === "upper" ? "Ebene 1: Obere Ebene" : "Ebene 2: Untere Ebene"}
      title={value === "upper" ? "Obere Ebene · A / Outside" : "Untere Ebene · B"}
      aria-pressed={level === value} onClick={event => { event.stopPropagation(); onChange(value); }}>
      {index + 1}
    </button>)}
  </div>;
}
