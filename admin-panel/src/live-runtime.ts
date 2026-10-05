import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import type { Changes } from "./live-resources.js";

// Docker emits lifecycle events and log lines. The plugin still communicates via
// its existing files; watching those files forwards changes to browser clients.
export function watchLiveRuntime({
  config,
  compose,
  changes,
}: {
  config: any;
  compose: any;
  changes: Changes;
}) {
  let stopped = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const paths = new Set<string>();
  function notify(...next: string[]) {
    next.forEach((path) => paths.add(path));
    if (!pending)
      pending = setTimeout(() => {
        pending = undefined;
        changes.publish([...paths]);
        paths.clear();
      }, 100);
  }
  const children = new Set<ReturnType<typeof spawn>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function retry(run: () => void) {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, 5000);
    timer.unref();
    timers.add(timer);
  }
  function stream(args: string[], onData: () => void, restart: () => void) {
    if (stopped) return;
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    child.stdout.on("data", onData);
    // Docker writes container stderr here as well; no output is forwarded without RBAC.
    child.stderr.on("data", onData);
    child.on("error", () => {});
    child.on("close", () => {
      children.delete(child);
      retry(restart);
    });
  }
  function events() {
    stream(
      [
        "events",
        "--filter",
        "type=container",
        "--filter",
        `label=com.docker.compose.service=${config.serviceName || "cs2"}`,
        "--format",
        "{{json .}}",
      ],
      () => notify("/api/server/", "/api/control"),
      events,
    );
  }
  async function logs() {
    try {
      const container = await compose.findServiceContainer();
      if (!container) {
        retry(() => void logs());
        return;
      }
      stream(
        ["logs", "--follow", "--tail", "0", container],
        () =>
          notify(
            "/api/server/logs",
            "/api/server/game",
            "/api/server/diagnostics",
          ),
        () => void logs(),
      );
    } catch {
      retry(() => void logs());
    }
  }
  const watchers = new Set<ReturnType<typeof watch>>();
  function watchDirectory(
    directory: string,
    changed: (filename: string) => void,
  ) {
    if (stopped) return;
    try {
      const watcher = watch(directory, (_event, filename) =>
        changed(String(filename || "")),
      );
      watchers.add(watcher);
      watcher.on("error", () => {
        watcher.close();
        watchers.delete(watcher);
        retry(() => watchDirectory(directory, changed));
      });
    } catch {
      retry(() => watchDirectory(directory, changed));
    }
  }
  // Development has no Docker socket; readers report the unavailable game server.
  if (process.env.NODE_ENV !== "development") {
    events();
    void logs();
  }
  if (config.liveNadesFile) {
    const directory = dirname(config.liveNadesFile);
    watchDirectory(directory, (name) => {
      if (name === "permissions-applied.json") notify("/api/access");
      if (name === "savednades.maps.json")
        notify("/api/control", "/api/server/game");
    });
    watchDirectory(
      join(
        directory,
        "../../addons/counterstrikesharp/plugins/Playbook/data",
      ),
      (name) => {
        if (name === "status.json")
          notify("/api/server/diagnostics", "/api/server/game");
      },
    );
  }
  return () => {
    stopped = true;
    clearTimeout(pending);
    timers.forEach(clearTimeout);
    watchers.forEach((watcher) => watcher.close());
    children.forEach((child) => child.kill());
  };
}
