import type { StratContent, Team, Strat, StratView } from "../shared/strats.js";
import { authorize, type Actor } from "../shared/authorization.js";
import type { SceneReference } from "../shared/demos.js";

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,100}$/.test(id);
export function sceneReference(value: any): SceneReference {
  if (!value || !validId(value.demoId) || !validId(value.roundId) || value.version !== 1 ||
    !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start < 0 || value.end <= value.start || value.end > 1800 ||
    typeof value.focusId !== "string" || !/^(?:[0-9]{1,20})?$/.test(value.focusId))
    problem(400, "Ungültiger Demo-Ausschnitt.");
  return { demoId: value.demoId, roundId: value.roundId, version: value.version, start: value.start, end: value.end, focusId: value.focusId };
}


export function problem(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export function textField(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    problem(400, `${label} ist ungültig.`);
  const clean = value.trim();
  if (required && !clean) problem(400, `${label} fehlt.`);
  return clean;
}
export function validateContent(input: any, team: Team): StratContent {
  if (
    !input ||
    !Array.isArray(input.slots) ||
    input.slots.length !== 5 ||
    !["t", "ct"].includes(input.side)
  )
    problem(400, "Eine Strat benötigt fünf Rollen und die Seite T oder CT.");
  const map = textField(input.map, "Map", 100, true);
  if (!/^[a-zA-Z0-9_\/-]+$/.test(map))
    problem(400, "Ungültiger interner Mapname.");
  const ids = new Set<string>();
  const players = new Set<string>();
  function id(value: unknown) {
    const clean = textField(value, "ID", 100, true);
    if (!/^[\w-]+$/.test(clean) || ids.has(clean))
      problem(400, "Rollen und Schritte benötigen eindeutige IDs.");
    ids.add(clean);
    return clean;
  }
  return {
    title: textField(input.title, "Name", 120, true),
    map,
    side: input.side,
    description: textField(input.description ?? "", "Beschreibung", 5000),
    ...(input.scene && { scene: sceneReference(input.scene) }),
    slots: input.slots.map((slot) => {
      const userId = textField(slot.userId ?? "", "Spieler", 17);
      if (
        userId &&
        (!team.members.some((member) => member.userId === userId) ||
          players.has(userId))
      )
        problem(
          400,
          "Jeder besetzte Platz benötigt ein anderes Mitglied dieses Teams.",
        );
      if (userId) players.add(userId);
      if (!Array.isArray(slot.steps) || slot.steps.length > 40)
        problem(400, "Eine Rolle darf höchstens 40 Schritte enthalten.");
      return {
        id: id(slot.id),
        label: textField(slot.label, "Rollenname", 80, true),
        userId,
        steps: slot.steps.map((step) => {
          if (
            !Array.isArray(step.nadeIds) ||
            step.nadeIds.length > 10 ||
            step.nadeIds.some(
              (nade) =>
                typeof nade !== "string" || !/^[A-Za-z0-9]{7}$/.test(nade),
            )
          )
            problem(400, "Ungültige Lineup-Verknüpfung.");
          return {
            id: id(step.id),
            text: textField(step.text, "Schritt", 2000, true),
            position: textField(step.position ?? "", "Position", 200),
            timing: textField(step.timing ?? "", "Timing", 200),
            nadeIds: [...new Set(step.nadeIds)] as string[],
            ...(step.scene && { scene: sceneReference(step.scene) }),
          };
        }),
      };
    }),
  };
}

export function stratView(
  strat: Strat,
  team: Team,
  actor: Actor,
): StratView | null {
  if (!authorize(actor, "strats.read", team)) return null;
  const canEdit = authorize(actor, "strats.edit", team);
  if (!canEdit && (!strat.published || strat.archived)) return null;
  return {
    id: strat.id,
    teamId: team.id,
    teamName: team.name,
    canEdit,
    archived: strat.archived,
    revision: canEdit ? strat.revision : strat.published!.version,
    content: canEdit ? strat.draft : strat.published!.content,
    published: strat.published,
    updatedAt: canEdit ? strat.updatedAt : strat.published!.publishedAt,
  };
}
