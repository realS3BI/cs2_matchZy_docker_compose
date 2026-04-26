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

  async findServiceContainer() {
    if (this.config.containerName) {
      return this.config.containerName;
    }

    const filters = ["ps", "-q", "--filter", `label=com.docker.compose.service=${this.config.serviceName}`];
    if (this.config.composeProjectName) {
      filters.push("--filter", `label=com.docker.compose.project=${this.config.composeProjectName}`);
    }

    const result = await this.run(filters, { timeout: 30 * 1000 });
    const containerId = result.stdout.trim().split(/\r?\n/).filter(Boolean)[0];
    if (containerId) return containerId;

    const fallback = await this.run(["ps", "-q", "--filter", `label=com.docker.compose.service=${this.config.serviceName}`], { timeout: 30 * 1000 });
    return fallback.stdout.trim().split(/\r?\n/).filter(Boolean)[0] || "";
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
