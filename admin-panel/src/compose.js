import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class Compose {
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
    const args = ["ps", "-q"];
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
}
