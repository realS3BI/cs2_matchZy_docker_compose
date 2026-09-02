import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";

const execFileAsync = promisify(execFile);

const DIAGNOSTIC_PROBE = String.raw`
root=/home/steam/cs2-dedicated/game/csgo
state=/home/steam/cs2-dedicated/.mod-installer/state.env

probe_file() {
  if [ -f "$2" ]; then
    printf 'FILE\t%s\t1\n' "$1"
  else
    printf 'FILE\t%s\t0\n' "$1"
  fi
}

probe_file preHook /home/steam/cs2-dedicated/pre.sh
probe_file installerState "$state"
probe_file metamod "$root/addons/metamod/bin/linuxsteamrt64/server.so"
probe_file counterStrikeSharpNative "$root/addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so"
probe_file counterStrikeSharpApi "$root/addons/counterstrikesharp/api/CounterStrikeSharp.API.dll"
probe_file matchZy "$root/addons/counterstrikesharp/plugins/MatchZy/MatchZy.dll"
probe_file matchZyConfig "$root/cfg/MatchZy/config.cfg"
probe_file matchZySavedNades "$root/cfg/MatchZy/savednades.json"

if [ -f "$root/gameinfo.gi" ] && grep -Eq '^[[:space:]]*Game[[:space:]]+csgo/addons/metamod[[:space:]]*$' "$root/gameinfo.gi"; then
  printf 'FILE\tgameinfoMetamod\t1\n'
else
  printf 'FILE\tgameinfoMetamod\t0\n'
fi

if [ -f "$state" ]; then
  for key in METAMOD MATCHZY COUNTERSTRIKESHARP FAKE_RCON WEAPONPAINTS PLAYERSETTINGS ANYBASELIB MENUMANAGER SIMPLEADMIN MULTIADDONMANAGER RAYTRACE FORTNITE_EMOTES EXECUTES; do
    value="$(grep "^$key"_TAG= "$state" 2>/dev/null | head -n 1 | cut -d= -f2-)"
    if [ -n "$value" ]; then
      printf 'VERSION\t%s\t%s\n' "$key" "$value"
    fi
  done
fi
`;

export class Compose {
  config: any;

  constructor(config) {
    this.config = config;
  }

  args(...args) {
    return ["compose", "-f", this.config.composeFile, ...args];
  }

  async run(args, options = {}) {
    try {
      const result = await execFileAsync("docker", args, {
        cwd: this.config.projectDir || process.cwd(),
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024,
        ...options
      });
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      return {
        ok: false,
        stdout: error.stdout || "",
        stderr: error.stderr || error.message,
        code: error.code
      };
    }
  }

  firstId(output) {
    return output.trim().split(/\r?\n/).filter(Boolean)[0] || "";
  }

  async containerExists(ref) {
    if (!ref) return false;
    const result = await this.run(["inspect", "--type", "container", ref], { timeout: 30 * 1000 });
    return result.ok;
  }

  async findContainerByFilters(filters) {
    const args = ["ps", "-aq"];
    for (const filter of filters) {
      args.push("--filter", filter);
    }
    const result = await this.run(args, { timeout: 30 * 1000 });
    return this.firstId(result.stdout);
  }

  async findServiceContainer() {
    if (await this.containerExists(this.config.containerName)) {
      return this.config.containerName;
    }

    const candidates = [];

    if (this.config.composeProjectName) {
      candidates.push([
        `label=com.docker.compose.project=${this.config.composeProjectName}`,
        `label=com.docker.compose.service=${this.config.serviceName}`
      ]);
      candidates.push([`name=${this.config.composeProjectName}-${this.config.serviceName}`]);
      candidates.push([`name=${this.config.composeProjectName}_${this.config.serviceName}`]);
    }

    if (this.config.containerName) {
      candidates.push([`name=${this.config.containerName}-${this.config.serviceName}`]);
      candidates.push([`name=${this.config.containerName}_${this.config.serviceName}`]);
      candidates.push([`name=${this.config.containerName}`]);
    }

    candidates.push([`label=com.docker.compose.service=${this.config.serviceName}`]);
    candidates.push([`name=${this.config.serviceName}`]);

    for (const filters of candidates) {
      const containerId = await this.findContainerByFilters(filters);
      if (containerId) return containerId;
    }

    return "";
  }

  async recreateService() {
    if (this.config.controlMode === "compose" && this.config.projectDir) {
      return this.run(this.args("up", "-d", "--build", "--force-recreate", this.config.serviceName));
    }
    return this.restartService();
  }

  async composeRecreateService() {
    return this.run(this.args("up", "-d", "--build", "--force-recreate", this.config.serviceName));
  }

  async restartService() {
    if (this.config.controlMode === "compose" && this.config.projectDir) {
      return this.run(this.args("restart", this.config.serviceName));
    }
    const containerId = await this.findServiceContainer();
    if (!containerId) {
      return { ok: false, stdout: "", stderr: `Could not find container for service '${this.config.serviceName}'` };
    }
    return this.run(["restart", containerId]);
  }

  async composeRestartService() {
    return this.run(this.args("restart", this.config.serviceName));
  }

  async serviceStatus() {
    if (this.config.controlMode !== "compose" || !this.config.projectDir) {
      const containerId = await this.findServiceContainer();
      if (!containerId) return { ok: true, state: "not-created", raw: null };
      const result = await this.run(["inspect", "--format", "{{json .State}}", containerId], { timeout: 30 * 1000 });
      if (!result.ok) return { ok: false, state: "unknown", message: result.stderr };
      try {
        const state = JSON.parse(result.stdout.trim());
        return { ok: true, state: state.Status || "unknown", raw: state };
      } catch {
        return { ok: true, state: "unknown", raw: result.stdout.trim() };
      }
    }

    const result = await this.run(this.args("ps", "--format", "json", this.config.serviceName));
    if (!result.ok) {
      return { ok: false, state: "unknown", message: result.stderr };
    }
    const text = result.stdout.trim();
    if (!text) return { ok: true, state: "not-created", raw: null };
    try {
      const lines = text.split(/\r?\n/).filter(Boolean);
      const service = JSON.parse(lines[0]);
      return {
        ok: true,
        state: service.State || service.Status || "unknown",
        raw: service
      };
    } catch {
      return { ok: true, state: "unknown", raw: text };
    }
  }

  async serviceLogs({ tail = 300 } = {}) {
    const safeTail = Math.min(Math.max(Number(tail) || 300, 50), 2000);

    if (this.config.controlMode === "compose" && this.config.projectDir) {
      return this.run(this.args("logs", "--no-color", "--timestamps", "--tail", String(safeTail), this.config.serviceName), {
        timeout: 30 * 1000,
        maxBuffer: 4 * 1024 * 1024
      });
    }

    const containerId = await this.findServiceContainer();
    if (!containerId) {
      return { ok: false, stdout: "", stderr: `Could not find container for service '${this.config.serviceName}'` };
    }

    return this.run(["logs", "--timestamps", "--tail", String(safeTail), containerId], {
      timeout: 30 * 1000,
      maxBuffer: 4 * 1024 * 1024
    });
  }

  async serviceDiagnostics() {
    const service = await this.serviceStatus();
    const containerId = await this.findServiceContainer();
    if (!containerId) {
      return { service, container: null, probe: null, logs: "" };
    }

    const inspect = await this.run([
      "inspect",
      "--format",
      "{{.Id}}\t{{.Name}}\t{{.State.Status}}\t{{.State.StartedAt}}\t{{.RestartCount}}",
      containerId
    ], { timeout: 30 * 1000 });

    let container = null;
    if (inspect.ok) {
      const [id, rawName, state, startedAt, restartCount] = inspect.stdout.trim().split("\t");
      container = {
        id,
        name: String(rawName || "").replace(/^\//, ""),
        state,
        startedAt,
        restartCount: Number(restartCount || 0)
      };
    }

    const [probe, logs] = await Promise.all([
      service.state === "running"
        ? this.run(["exec", containerId, "sh", "-lc", DIAGNOSTIC_PROBE], {
            timeout: 30 * 1000,
            maxBuffer: 1024 * 1024
          })
        : Promise.resolve(null),
      this.run([
        "logs",
        "--timestamps",
        "--since",
        container?.startedAt || "24h",
        "--tail",
        "5000",
        containerId
      ], {
        timeout: 30 * 1000,
        maxBuffer: 8 * 1024 * 1024
      })
    ]);

    return {
      service,
      container,
      probe,
      logs: `${logs.stdout || ""}${logs.stderr ? `\n${logs.stderr}` : ""}`
    };
  }

  async waitForServiceLog(needles, since, timeoutMs = 10 * 60 * 1000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const containerId = await this.findServiceContainer();
      if (containerId) {
        const result = await this.run([
          "logs",
          "--since",
          since,
          "--tail",
          "5000",
          containerId
        ], {
          timeout: 30 * 1000,
          maxBuffer: 8 * 1024 * 1024
        });
        const output = `${result.stdout || ""}\n${result.stderr || ""}`;
        if (needles.some((needle) => output.includes(needle))) return true;
      }
      await wait(2000);
    }
    return false;
  }
}
