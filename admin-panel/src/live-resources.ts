import type { Actor } from "../shared/authorization.js";
import { routeAllowed } from "./authorization.js";

// Emitted after a database commit, also by background jobs and game imports.
export class Changes {
  version = 0;
  private listeners = new Set<(paths?: string[]) => void>();
  publish(paths?: string[]) {
    if (!paths) this.version++;
    for (const listener of this.listeners) listener(paths);
  }
  subscribe(listener: (paths?: string[]) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

type Context = {
  user: Actor;
  params: Record<string, string>;
  query: Record<string, string>;
};
type Resource = {
  path: string;
  pattern: RegExp;
  names: string[];
  read: (context: Context) => Promise<any>;
  interval: number;
  shared: boolean;
  command?: (context: Context & { body: any; connectionId: string }) => Promise<any>;
};
export const liveError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

// HTTP and WebSocket use the same readers and permission checks.
export class LiveResources {
  private resources: Resource[] = [];
  private pending = new Map<string, Promise<any>>();
  private disconnectListeners = new Set<(connectionId: string) => void>();
  constructor(readonly changes: Changes) {}

  get(
    router,
    path: string,
    read: Resource["read"],
    interval = 0,
    shared = false,
  ) {
    const fullPath = path.startsWith("/api/") ? path : `/api${path}`;
    const names: string[] = [];
    const pattern = new RegExp(
      `^${fullPath.replace(/:[a-zA-Z]+/g, (name) => {
        names.push(name.slice(1));
        return "([\\w-]{1,100})";
      })}$`,
    );
    this.resources.push({ path: fullPath, pattern, names, read, interval, shared });
    router.get(path, async (req, res, next) => {
      try {
        res.json(await this.read(req.originalUrl, res.locals.user));
      } catch (error) {
        next(error);
      }
    });
  }

  onCommand(path: string, command: Resource["command"]) {
    const resource = this.resources.find(resource => resource.path === path);
    if (!resource) throw new Error(`Unknown command resource: ${path}`);
    resource.command = command;
  }
  onDisconnect(listener: (connectionId: string) => void) { this.disconnectListeners.add(listener); }
  disconnect(connectionId: string) { for (const listener of this.disconnectListeners) listener(connectionId); }
  async command(path: string, user: Actor, body: any, connectionId: string) {
    if (!user) throw liveError(401, "Bitte erneut anmelden.");
    const { resource, params, query } = this.resolve(path);
    if (!resource.command) throw liveError(400, "Diese Ansicht unterstützt keine Live-Befehle.");
    return resource.command({ user, params, query, body, connectionId });
  }

  resolve(path: string) {
    if (
      typeof path !== "string" ||
      path.length > 300 ||
      !path.startsWith("/api/") ||
      /[%#\\]/.test(path)
    )
      throw liveError(400, "Ungültige Live-Ansicht.");
    const url = new URL(path, "http://localhost");
    if (url.pathname + url.search !== path)
      throw liveError(400, "Ungültige Live-Ansicht.");
    const resource = this.resources.find((candidate) =>
      candidate.pattern.test(url.pathname),
    );
    if (!resource) throw liveError(404, "Live-Ansicht nicht gefunden.");
    if (
      [...url.searchParams].some(
        ([key]) => key !== "tail" || url.pathname !== "/api/server/logs",
      ) ||
      (url.searchParams.has("tail") &&
        (!/^\d{1,4}$/.test(url.searchParams.get("tail")!) ||
          url.searchParams.getAll("tail").length !== 1))
    )
      throw liveError(400, "Ungültige Live-Parameter.");
    const match = resource.pattern.exec(url.pathname)!;
    return {
      resource,
      pathname: url.pathname,
      params: Object.fromEntries(
        resource.names.map((name, index) => [name, match[index + 1]]),
      ),
      query: Object.fromEntries(url.searchParams),
    };
  }

  async read(path: string, user: Actor) {
    const { resource, pathname, params, query } = this.resolve(path);
    if (!user) throw liveError(401, "Bitte erneut anmelden.");
    // Workspace readers check membership and publication themselves, just like HTTP.
    if (
      pathname !== "/api/auth/me" &&
      !/^\/api\/(teams|strats|analysis)(\/|$)/.test(pathname) &&
      !routeAllowed(user, "GET", pathname.slice(4))
    )
      throw liveError(403, "Für diese Ansicht fehlt dir die Berechtigung.");
    const key = `${this.changes.version}:${path}:${resource.shared ? "shared" : JSON.stringify(user)}`;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() =>
        resource.read({ user, params, query }),
      );
      this.pending.set(key, pending);
      void pending
        .finally(() => {
          this.pending.delete(key);
        })
        .catch(() => {});
    }
    return pending;
  }
}
