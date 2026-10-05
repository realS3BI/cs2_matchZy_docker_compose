import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { authenticatedUser } from "./auth.js";
import { LiveResources } from "./live-resources.js";

export function installLiveServer(
  server: Server,
  {
    config,
    store,
    resources,
  }: { config: any; store: any; resources: LiveResources },
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
  });
  const connections = new Set<{ userId: string; close: () => void }>();
  let stopped = false;
  const upgrade = async (req, socket, head) => {
    const reject = (status: number) => {
      socket.end(
        `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    socket.on("error", () => {});
    if (req.url !== "/api/live") return reject(404);
    if (req.headers.origin !== config.publicUrl) return reject(403);
    if (stopped || connections.size >= 128) return reject(503);
    const timeout = setTimeout(() => socket.destroy(), 10_000);
    try {
      cookieParser()(req, {} as any, () => {});
      const user = await authenticatedUser(req, config, store);
      if (!user) return reject(401);
      if (connections.size >= 128) return reject(503);
      if (
        Array.from(connections).filter(
          (client) => client.userId === user.identitySteam64,
        ).length >= 8
      )
        return reject(429);
      if (stopped || socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) =>
        connect(ws, req, user.identitySteam64),
      );
    } catch {
      reject(503);
    } finally {
      clearTimeout(timeout);
    }
  };

  function connect(ws: WebSocket, req, userId: string) {
    const connectionId = randomUUID();
    let commandQueue = Promise.resolve();
    let queuedCommands = 0;
    const commandResults = new Map<string, { signature: string; result: Promise<any> }>();
    type Subscription = {
      signature?: string;
      running: boolean;
      dirty: boolean;
      next: number;
      interval: number;
    };
    const subscriptions = new Map<string, Subscription>();
    let alive = true;
    let messages = 0;
    let windowStart = Date.now();
    let heartbeatPending = false;
    const client = { userId, close: () => ws.terminate() };
    connections.add(client);
    const send = (message) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 4 * 1024 * 1024) {
        ws.terminate();
        return;
      }
      ws.send(JSON.stringify(message));
    };
    async function refresh(path: string, sub: Subscription) {
      sub.dirty = true;
      if (sub.running) return;
      sub.running = true;
      try {
        while (
          sub.dirty &&
          subscriptions.get(path) === sub &&
          ws.readyState === WebSocket.OPEN
        ) {
          sub.dirty = false;
          const version = resources.changes.version;
          let message;
          try {
            const actor = await authenticatedUser(req, config, store);
            if (!actor) {
              ws.close(4401, "Bitte erneut anmelden.");
              return;
            }
            const data = await resources.read(path, actor);
            const current = await authenticatedUser(req, config, store);
            if (!current) {
              ws.close(4401, "Bitte erneut anmelden.");
              return;
            }
            if (JSON.stringify(current) !== JSON.stringify(actor)) {
              sub.dirty = true;
              continue;
            }
            message = { type: "snapshot", path, data };
          } catch (error) {
            message = {
              type: "error",
              path,
              status: error.status || 503,
              error:
                error.message || "Live-Ansicht vorübergehend nicht verfügbar.",
            };
          }
          // A commit during a read can change membership or return an older snapshot.
          if (version !== resources.changes.version) {
            sub.dirty = true;
            continue;
          }
          if (subscriptions.get(path) !== sub) return;
          const signature = JSON.stringify(message);
          if (signature !== sub.signature) {
            send(message);
            sub.signature = signature;
          }
          sub.next = Date.now() + sub.interval;
        }
      } finally {
        sub.running = false;
      }
    }
    const unsubscribe = resources.changes.subscribe((paths) => {
      for (const [path, sub] of subscriptions)
        if (!paths || paths.some((prefix) => path.startsWith(prefix)))
          void refresh(path, sub);
    });
    const tick = setInterval(() => {
      for (const [path, sub] of subscriptions)
        if (sub.interval && sub.next <= Date.now() && !sub.running)
          void refresh(path, sub);
    }, 500);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
      send({ type: "heartbeat" });
      if (!heartbeatPending) {
        heartbeatPending = true;
        void authenticatedUser(req, config, store)
          .then((user) => {
            if (!user) ws.close(4401, "Bitte erneut anmelden.");
          })
          .catch(() => ws.close(1011))
          .finally(() => {
            heartbeatPending = false;
          });
      }
    }, 25_000);
    tick.unref();
    heartbeat.unref();
    ws.on("pong", () => {
      alive = true;
    });
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      unsubscribe();
      subscriptions.clear();
      connections.delete(client);
      resources.disconnect(connectionId);
    });
    ws.on("message", (raw, binary) => {
      if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now();
        messages = 0;
      }
      if (++messages > 600 || binary) {
        ws.close(1008, "Zu viele oder ungültige Nachrichten.");
        return;
      }
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "clock" && Number.isFinite(message.clientTime)) {
          send({ type: "clock", clientTime: message.clientTime, serverTime: Date.now() });
          return;
        }
        if (message.type === "command") {
          if (typeof message.requestId !== "string" || !/^[\w-]{1,100}$/.test(message.requestId) || queuedCommands >= 32) throw new Error();
          resources.resolve(message.path);
          const signature = JSON.stringify([message.path, message.body]);
          const cached = commandResults.get(message.requestId);
          if (cached && cached.signature !== signature) throw new Error();
          let result = cached?.result;
          if (!result) {
            queuedCommands++;
            result = commandQueue.then(async () => {
              try {
                if (ws.readyState !== WebSocket.OPEN) return;
                const user = await authenticatedUser(req, config, store);
                if (!user) throw Object.assign(new Error("Bitte erneut anmelden."), { status: 401 });
                return { type: "result", requestId: message.requestId, data: await resources.command(message.path, user, message.body, connectionId) };
              } catch (error) {
                return { type: "result", requestId: message.requestId, status: error.status || 500, error: error.status ? error.message : "Der Live-Befehl konnte nicht ausgeführt werden." };
              } finally {
                queuedCommands--;
                if (ws.readyState !== WebSocket.OPEN) resources.disconnect(connectionId);
              }
            });
            commandQueue = result.then(() => {});
            commandResults.set(message.requestId, { signature, result });
            if (commandResults.size > 128) commandResults.delete(commandResults.keys().next().value!);
          }
          void result.then(result => { if (result) send(result); });
          return;
        }
        if (
          message.type !== "subscribe" ||
          !Array.isArray(message.paths) ||
          message.paths.length > 24
        )
          throw new Error();
        const paths = [...new Set<string>(message.paths)];
        for (const path of paths) resources.resolve(path);
        for (const path of subscriptions.keys())
          if (!paths.includes(path)) subscriptions.delete(path);
        for (const path of paths) {
          if (subscriptions.has(path)) continue;
          const sub: Subscription = {
            running: false,
            dirty: false,
            next: 0,
            interval: resources.resolve(path).resource.interval,
          };
          subscriptions.set(path, sub);
          void refresh(path, sub);
        }
      } catch {
        ws.close(1008, "Ungültiges Abonnement.");
      }
    });
    send({ type: "ready" });
  }
  server.on("upgrade", upgrade);
  return {
    close() {
      stopped = true;
      server.off("upgrade", upgrade);
      for (const connection of connections) connection.close();
      wss.close();
    },
  };
}
