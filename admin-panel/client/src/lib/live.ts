import { newWorkspaceId } from "../../../shared/strats";
export type LiveMessage =
  | { type: "snapshot"; path: string; data: any }
  | { type: "error"; path: string; status: number; error: string };
export type LiveState = "connecting" | "connected" | "reconnecting" | "offline";
type Listener = (message: LiveMessage) => void;

const listeners = new Map<string, Set<Listener>>();
const stateListeners = new Set<() => void>();
let socket: WebSocket | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let expired = false;
let state: LiveState = "offline";
let scheduled = false;
let clockOffset = 0;
let bestRoundTrip = Infinity;
const commands = new Map<string, { resolve: (data: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export const serverNow = () => Date.now() + clockOffset;
function rejectCommands() {
  for (const command of commands.values()) {
    clearTimeout(command.timer);
    command.reject(new Error("Die Verbindung wurde unterbrochen. Prüfe den aktuellen Stand vor einem neuen Befehl."));
  }
  commands.clear();
}
export function liveCommand(path: string, body: any): Promise<any> {
  if (socket?.readyState !== WebSocket.OPEN || state !== "connected") return Promise.reject(new Error("Warte auf die Live-Verbindung."));
  const requestId = newWorkspaceId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { commands.delete(requestId); reject(new Error("Keine Bestätigung erhalten. Prüfe den aktuellen Stand.")); }, 10_000);
    commands.set(requestId, { resolve, reject, timer });
    socket!.send(JSON.stringify({ type: "command", requestId, path, body }));
  });
}

function setState(next: LiveState) {
  state = next;
  for (const listener of stateListeners) listener();
}
function sessionExpired() {
  expired = true;
  setState("offline");
  for (const [path, callbacks] of listeners)
    for (const callback of callbacks)
      callback({
        type: "error",
        path,
        status: 401,
        error: "Bitte erneut anmelden.",
      });
}
export const liveState = () => state;
export function subscribeLiveState(listener: () => void) {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function subscriptions() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({ type: "subscribe", paths: [...listeners.keys()] }),
      );
  });
}
function connect() {
  if (!listeners.size || socket || expired) return;
  clearTimeout(retry);
  setState(attempts ? "reconnecting" : "connecting");
  const url = new URL("/api/live", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = (socket = new WebSocket(url));
  const armWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => ws.close(), 45_000);
  };
  armWatchdog();
  ws.onopen = () => {
    if (socket === ws) subscriptions();
  };
  ws.onmessage = (event) => {
    if (socket !== ws) return;
    armWatchdog();
    try {
      const message = JSON.parse(event.data);
      if (message.type === "ready") {
        attempts = 0;
        bestRoundTrip = Infinity;
        ws.send(JSON.stringify({ type: "clock", clientTime: Date.now() }));
        setState("connected");
      } else if (message.type === "heartbeat") {
        ws.send(JSON.stringify({ type: "clock", clientTime: Date.now() }));
      } else if (message.type === "clock") {
        const roundTrip = Date.now() - message.clientTime;
        if (roundTrip >= 0 && roundTrip <= bestRoundTrip) {
          bestRoundTrip = roundTrip;
          clockOffset = message.serverTime - message.clientTime - roundTrip / 2;
        }
      } else if (message.type === "result") {
        const command = commands.get(message.requestId);
        if (command) {
          clearTimeout(command.timer);
          commands.delete(message.requestId);
          if (message.error) command.reject(Object.assign(new Error(message.error), { status: message.status }));
          else command.resolve(message.data);
        }
      } else if (message.type === "snapshot" || message.type === "error") {
        for (const listener of listeners.get(message.path) || [])
          listener(message);
      }
    } catch {
      ws.close();
    }
  };
  ws.onerror = () => ws.close();
  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = undefined;
    rejectCommands();
    clearTimeout(watchdog);
    if (event.code === 4401) {
      sessionExpired();
      return;
    }
    if (!listeners.size) {
      setState("offline");
      return;
    }
    setState("reconnecting");
    retry = setTimeout(
      async () => {
        // Browsers hide a rejected upgrade's HTTP status. Check the session once
        // when reconnecting, so an expired cookie cannot leave stale views open.
        try {
          const response = await fetch("/api/auth/me", {
            signal: AbortSignal.timeout(5000),
          });
          if (response.status === 401 && listeners.size) {
            sessionExpired();
            return;
          }
        } catch {
          /* The API may be restarting along with the socket. */
        }
        connect();
      },
      Math.min(15_000, 500 * 2 ** Math.min(attempts++, 5)) +
        Math.random() * 300,
    );
  };
}

export function subscribeLive(path: string, listener: Listener) {
  if (!listeners.size) expired = false;
  let callbacks = listeners.get(path);
  if (!callbacks) {
    callbacks = new Set();
    listeners.set(path, callbacks);
  }
  callbacks.add(listener);
  connect();
  subscriptions();
  return () => {
    callbacks!.delete(listener);
    if (!callbacks!.size) listeners.delete(path);
    if (!listeners.size) {
      clearTimeout(retry);
      clearTimeout(watchdog);
      const previous = socket;
      socket = undefined;
      previous?.close();
      rejectCommands();
      attempts = 0;
      setState("offline");
    } else subscriptions();
  };
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(retry);
    clearTimeout(watchdog);
    socket?.close();
    socket = undefined;
    listeners.clear();
    rejectCommands();
  });
