export const THROW_FLAGS = ["is_jumpthrow", "is_crouch", "is_walking", "is_running", "is_stepping"] as const;
export const THROW_FLAG_LABELS = {
  is_jumpthrow: "Jumpthrow", is_crouch: "Geduckt", is_walking: "Gehen", is_running: "Laufen", is_stepping: "Schrittwurf",
} as const;
export const CLICK_TYPES = ["left", "right", "both"] as const;
export const CLICK_LABELS = { left: "Linksklick", right: "Rechtsklick", both: "Beide Maustasten" } as const;
export const THROW_ATTRIBUTE_FIELDS = [...THROW_FLAGS, "click_type"] as const;
export const BOOLEAN_THROW_FLAGS = ["is_jumpthrow", "is_crouch"] as const;
export const MOVEMENT_FLAGS = ["is_walking", "is_running", "is_stepping"] as const;
export const MOVEMENT_TYPES = ["stand", "walk", "run", "step"] as const;
export const MOVEMENT_LABELS = { stand: "Stand", walk: "Gehen", run: "Laufen", step: "Schrittwurf" } as const;
export type MovementType = typeof MOVEMENT_TYPES[number];

// Older recordings could mark a short step as walking or running as well.
export function movementType(value): MovementType {
  return value.is_stepping === true ? "step" : value.is_walking === true ? "walk" : value.is_running === true ? "run" : "stand";
}

export function movementPatch(mode: MovementType) {
  return { is_walking: mode === "walk", is_running: mode === "run", is_stepping: mode === "step" };
}

export function throwAttributeSummary(value) {
  if (!THROW_ATTRIBUTE_FIELDS.some(key => value[key] !== undefined)) return "Wurfattribute offen";
  return [...BOOLEAN_THROW_FLAGS.filter(key => value[key] === true).map(key => THROW_FLAG_LABELS[key]),
    MOVEMENT_LABELS[movementType(value)], CLICK_LABELS[value.click_type] || "Linksklick"].join(" · ");
}
