import { economyOptions, type StratContent, type StratEconomy } from "../../../shared/strats";
import { Badge } from "./ui/badge";
import { FieldDescription, FieldLegend, FieldSet } from "./ui/field";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export function EconomySelection({ label, value, onChange, disabled, compact = false }: {
  label: string;
  value: StratEconomy[];
  onChange: (value: StratEconomy[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <FieldSet>
      <FieldLegend>{label}</FieldLegend>
      <ToggleGroup
        type="multiple"
        variant="outline"
        value={value}
        onValueChange={(selected) => onChange(economyOptions.filter((option) => selected.includes(option.value)).map((option) => option.value))}
        aria-label={label}
        disabled={disabled}
        className="flex-wrap"
      >
        {economyOptions.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!compact && <FieldDescription>
        {value.length ? "Mehrfachauswahl möglich." : "Alle Kaufsituationen. Mehrfachauswahl möglich."}
      </FieldDescription>}
    </FieldSet>
  );
}

export function StratEconomySummary({ content }: { content: StratContent }) {
  const label = (values: StratEconomy[] | undefined) => values?.length
    ? economyOptions.filter((option) => values.includes(option.value)).map((option) => option.label).join(" / ")
    : "Alle Kaufsituationen";
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">Wir: {label(content.ownEconomy)}</Badge>
      <Badge variant="outline">Gegner: {label(content.opponentEconomy)}</Badge>
    </div>
  );
}
