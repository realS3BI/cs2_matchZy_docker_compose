export const SERVER_ID = "primary";
export type PlatformRole = "user" | "platform_admin";
export type ServerRole =
  "none" | "training_player" | "match_admin" | "server_admin";
export type TeamRole = "member" | "captain" | "owner";
export type Access = { platform: PlatformRole; server: ServerRole };
export type Actor = {
  identitySteam64: string;
  role?: string;
  access?: Access;
  authKind?: "steam" | "test";
  name?: string;
};
export type TeamAccess = {
  id: string;
  members: { userId: string; role: TeamRole }[];
};

export const ACTIONS = {
  "users.manage": "Benutzer und Plattform-/Serverrollen verwalten",
  "lineups.read": "Alle Nades lesen",
  "lineups.create": "Nades erstellen und aufnehmen",
  "lineups.moderate": "Nades freigeben und alle Aufnahmen löschen",
  "training.use": "Trainingspanel und Trainingswerkzeuge verwenden",
  "server.match": "Matches, Maps und erlaubte Serveroptionen steuern",
  "server.rcon": "Uneingeschränkte Serverkonsole verwenden",
  "server.manage": "Alle Servereinstellungen und Wartung verwalten",
  "teams.create": "Ein Team gründen und Einladungen annehmen",
  "teams.read": "Mitglieder des eigenen Teams ansehen",
  "teams.manage": "Mitglieder, Einladungen und Teamrechte verwalten",
  "strats.read": "Veröffentlichte Strats und Live-Ansicht lesen",
  "strats.edit": "Strats erstellen, bearbeiten und besetzen",
  "strats.publish": "Strats veröffentlichen und archivieren",
  "strats.activate": "Eine Strat für das Team aktivieren",
  "demos.personal": "Eigene private Demos hochladen und analysieren",
  "analysis.read": "Demos und Reviews des eigenen Teams ansehen",
  "analysis.upload": "Demos für das eigene Team hochladen",
  "analysis.prepare": "Team-Reviews und Szenen vorbereiten",
  "analysis.control": "Gemeinsame Demo-Wiedergabe moderieren",
  "analysis.note": "Erkenntnisse im Team-Review festhalten",
  "analysis.record": "Zugewiesene Live-Tonaufnahme durchführen",
  "analysis.import": "Matchquellen für das Team verbinden",
  "analysis.scout": "Gegnerberichte und Matchpläne vorbereiten",
} as const;
export type Action = keyof typeof ACTIONS;
const base: Action[] = ["lineups.read", "teams.create", "demos.personal"];
const training: Action[] = ["training.use"];
const match: Action[] = [...training, "server.match", "server.rcon"];
const member: Action[] = ["teams.read", "strats.read", "analysis.read", "analysis.upload", "analysis.note", "analysis.record"];
const captain: Action[] = [
  ...member,
  "strats.edit",
  "strats.publish",
  "strats.activate",
  "analysis.prepare",
  "analysis.control",
  "analysis.import",
  "analysis.scout",
];
export const ROLE_CATALOG: {
  id: string;
  name: string;
  scope: "platform" | "server" | "team";
  permissions: Action[];
}[] = [
  { id: "user", name: "Benutzer", scope: "platform", permissions: base },
  {
    id: "platform_admin",
    name: "Plattform-Admin",
    scope: "platform",
    permissions: [
      ...base,
      "users.manage",
      "lineups.create",
      "lineups.moderate",
    ],
  },
  { id: "none", name: "Kein Serverzugriff", scope: "server", permissions: [] },
  {
    id: "training_player",
    name: "Trainingsspieler",
    scope: "server",
    permissions: training,
  },
  {
    id: "match_admin",
    name: "Match Admin",
    scope: "server",
    permissions: match,
  },
  {
    id: "server_admin",
    name: "Server-Admin",
    scope: "server",
    permissions: [...match, "server.manage"],
  },
  { id: "member", name: "Mitglied", scope: "team", permissions: member },
  { id: "captain", name: "Captain", scope: "team", permissions: captain },
  {
    id: "owner",
    name: "Owner",
    scope: "team",
    permissions: [...captain, "teams.manage"],
  },
];

export function legacyAccess(role?: string): Access {
  if (role === "admin")
    return { platform: "platform_admin", server: "server_admin" };
  return {
    platform: "user",
    server:
      role === "match_admin" || role === "training_player" ? role : "none",
  };
}

export function validAccess(value: unknown): value is Access {
  const input = value as Access;
  return (
    !!input &&
    ["user", "platform_admin"].includes(input.platform) &&
    ["none", "training_player", "match_admin", "server_admin"].includes(
      input.server,
    )
  );
}

export function accessOf(user?: Partial<Actor> | null): Access {
  if (
    !user ||
    user.authKind === "test" ||
    user.identitySteam64 === "00000000000000001"
  )
    return { platform: "user", server: "none" };
  // Legacy input is supported only at the migration/test seam. Explicit access always wins.
  if (user.access !== undefined)
    return validAccess(user.access)
      ? user.access
      : { platform: "user", server: "none" };
  return legacyAccess(user.role);
}

export function teamRole(
  user: Partial<Actor> | null | undefined,
  team?: TeamAccess | null,
): TeamRole | null {
  if (!user?.identitySteam64 || user.authKind === "test") return null;
  return (
    team?.members.find((member) => member.userId === user.identitySteam64)
      ?.role || null
  );
}

export function authorize(
  user: Partial<Actor> | null | undefined,
  action: Action,
  resource?: TeamAccess | { serverId: string } | null,
): boolean {
  if (!user?.identitySteam64 || !Object.hasOwn(ACTIONS, action)) return false;
  const access = accessOf(user);
  if (
    action.startsWith("strats.") ||
    action.startsWith("analysis.") ||
    (action.startsWith("teams.") && action !== "teams.create")
  ) {
    const role = teamRole(
      user,
      resource && "members" in resource ? resource : null,
    );
    return (
      !!role &&
      !!ROLE_CATALOG.find(
        (item) => item.scope === "team" && item.id === role,
      )?.permissions.includes(action)
    );
  }
  if (
    ["teams.create", "demos.personal"].includes(action) &&
    (user.authKind === "test" || user.identitySteam64 === "00000000000000001")
  )
    return false;
  if (
    (action.startsWith("server.") || action === "training.use") &&
    resource &&
    "serverId" in resource &&
    resource.serverId !== SERVER_ID
  )
    return false;
  return ROLE_CATALOG.some(
    (role) =>
      ((role.scope === "platform" && role.id === access.platform) ||
        (role.scope === "server" && role.id === access.server)) &&
      role.permissions.includes(action),
  );
}

export const isPlatformAdmin = (user?: Partial<Actor> | null) =>
  authorize(user, "lineups.moderate");
export const isServerAdmin = (user?: Partial<Actor> | null) =>
  authorize(user, "server.manage");
export function capabilities(user: Partial<Actor>, team?: TeamAccess) {
  return Object.fromEntries(
    Object.keys(ACTIONS).map((action) => [
      action,
      authorize(user, action as Action, team),
    ]),
  ) as Record<Action, boolean>;
}

export function cssFlags(user: Partial<Actor>): string[] {
  const server = accessOf(user).server;
  if (server === "server_admin") return ["@css/root"];
  return server === "match_admin"
    ? [
        "@css/config",
        "@custom/prac",
        "@css/map",
        "@css/chat",
        "@css/rcon",
        "@matchzy/control",
      ]
    : [];
}

export function gamePermissions(user: Partial<Actor>): string[] {
  return [
    authorize(user, "training.use") && "training.use",
    authorize(user, "server.match") && "commands.control",
    authorize(user, "lineups.create") && "lineups.capture",
  ].filter(Boolean) as string[];
}

// Compatibility display only. This value must never override explicit access.
export function legacyRole(access: Access): string {
  return access.platform === "platform_admin"
    ? "admin"
    : access.server === "match_admin" || access.server === "training_player"
      ? access.server
      : "player";
}
