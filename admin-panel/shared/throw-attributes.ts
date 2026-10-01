export const THROW_FLAGS = ["is_jumpthrow", "is_crouch", "is_walking", "is_running", "is_stepping"] as const;
export const THROW_FLAG_LABELS = {
  is_jumpthrow: "Jumpthrow", is_crouch: "Geduckt", is_walking: "Gehen", is_running: "Laufen", is_stepping: "Schrittwurf",
} as const;
export const CLICK_TYPES = ["left", "right", "both"] as const;
export const CLICK_LABELS = { left: "Linksklick", right: "Rechtsklick", both: "Beide Maustasten" } as const;
export const THROW_ATTRIBUTE_FIELDS = [...THROW_FLAGS, "click_type"] as const;
