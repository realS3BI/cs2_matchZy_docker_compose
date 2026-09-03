import { normalizeServerSettings } from "./policy.js";

const VERSION_FIELDS = [
  ["METAMOD", "Metamod", "METAMOD_VERSION"],
  ["MATCHZY", "MatchZy", "MATCHZY_VERSION"],
  ["COUNTERSTRIKESHARP", "CounterStrikeSharp", "COUNTERSTRIKESHARP_VERSION"],
  ["FAKE_RCON", "Fake RCON", "FAKE_RCON_VERSION"],
  ["WEAPONPAINTS", "WeaponPaints", "WEAPONPAINTS_VERSION"],
  ["PLAYERSETTINGS", "PlayerSettings", "PLAYERSETTINGS_VERSION"],
  ["ANYBASELIB", "AnyBaseLib", "ANYBASELIB_VERSION"],
  ["MENUMANAGER", "MenuManager", "MENUMANAGER_VERSION"],
  ["SIMPLEADMIN", "SimpleAdmin", "SIMPLEADMIN_VERSION"],
  ["MULTIADDONMANAGER", "MultiAddonManager", "MULTIADDONMANAGER_VERSION"],
  ["RAYTRACE", "Ray-Trace", "RAYTRACE_VERSION"],
  ["FORTNITE_EMOTES", "Fortnite Emotes", "FORTNITE_EMOTES_VERSION"],
  ["EXECUTES", "Executes", "EXECUTES_VERSION"]
];

const OPTIONAL_PLUGIN_FILES = [
  { id: "fake-rcon", label: "Fake RCON", enabled: (env) => env.FAKE_RCON_ENABLED === "1", files: ["fakeRcon"] },
  { id: "weaponpaints", label: "WeaponPaints", enabled: (env) => env.WEAPONPAINTS_ENABLED === "1", files: ["weaponPaints", "playerSettings", "anyBaseLib", "menuManager"] },
  { id: "simpleadmin", label: "SimpleAdmin", enabled: (env) => env.SIMPLEADMIN_ENABLED === "1", files: ["simpleAdmin", "playerSettings", "anyBaseLib", "menuManager"] },
  { id: "fortnite-emotes", label: "Fortnite Emotes", enabled: (env) => env.FORTNITE_EMOTES_ENABLED === "1", files: ["fortniteEmotes", "multiAddonManager", "rayTrace"] }
];

function parseProbeOutput(output = "") {
  const files: Record<string, boolean> = {};
  const versions: Record<string, string> = {};

  for (const line of String(output).split(/\r?\n/)) {
    const [kind, key, value = ""] = line.split("\t");
    if (kind === "FILE" && key) files[key] = value === "1";
    if (kind === "VERSION" && key) versions[key] = value;
  }

  return { files, versions };
}

function lastIndexOfAny(text, needles) {
  return Math.max(-1, ...needles.map((needle) => text.lastIndexOf(needle)));
}

function findAssetFailures(logs) {
  const components = new Set();
  for (const line of logs.split(/\r?\n/)) {
    if (!/could not resolve .*asset/i.test(line)) continue;
    const match = line.match(/could not resolve (.+?)(?: linux)? asset(?: from|$)/i);
    if (match?.[1]) components.add(match[1].trim());
  }
  return [...components];
}

function check(id, label, status, detail) {
  return { id, label, status, detail };
}

function isVersionRelevant(key, env) {
  if (key === "MATCHZY") return env.SERVER_MODE === "matchzy";
  if (key === "EXECUTES") return env.SERVER_MODE === "executes";
  if (key === "FAKE_RCON") return env.FAKE_RCON_ENABLED === "1";
  if (key === "WEAPONPAINTS") return env.WEAPONPAINTS_ENABLED === "1";
  if (["PLAYERSETTINGS", "ANYBASELIB", "MENUMANAGER"].includes(key)) return env.WEAPONPAINTS_ENABLED === "1" || env.SIMPLEADMIN_ENABLED === "1";
  if (key === "SIMPLEADMIN") return env.SIMPLEADMIN_ENABLED === "1";
  if (key === "MULTIADDONMANAGER") return env.FORTNITE_EMOTES_ENABLED === "1" || env.CS2_WORKSHOP_MAPS_ENABLED === "1";
  if (["RAYTRACE", "FORTNITE_EMOTES"].includes(key)) return env.FORTNITE_EMOTES_ENABLED === "1";
  return true;
}

export function buildDiagnostics({ service, container, probe, logs = "", desired = {}, controlMode = "docker" }) {
  const env = normalizeServerSettings(desired);
  const { files, versions } = parseProbeOutput(probe?.stdout);
  const normalizedLogs = String(logs).toLowerCase();
  const bootstrapSuccess = normalizedLogs.lastIndexOf("[pre.sh] mod bootstrap complete");
  const bootstrapFailure = normalizedLogs.lastIndexOf("[pre.sh] hook failed");
  const bootstrapActivity = lastIndexOfAny(normalizedLogs, [
    "[pre.sh] resolving ",
    "[pre.sh] installing or updating ",
    "[pre.sh] downloading "
  ]);
  const matchZyLoaded = lastIndexOfAny(normalizedLogs, [
    "finished loading plugin matchzy",
    "[matchzy 0.8.15 loaded]",
    "matchzy by wd-"
  ]);
  const matchZyFailed = lastIndexOfAny(normalizedLogs, [
    "failed to load plugin matchzy",
    "could not load plugin matchzy",
    "failed to load plugin \"matchzy.dll\""
  ]);

  const serviceRunning = service?.state === "running";
  const bootstrapStatus = bootstrapFailure > bootstrapSuccess
    ? "fail"
    : bootstrapSuccess >= 0
      ? "pass"
      : bootstrapActivity >= 0 || files.installerState
        ? "warn"
        : "fail";
  const metamodReady = Boolean(files.metamod && files.gameinfoMetamod);
  const cssReady = Boolean(files.counterStrikeSharpNative && files.counterStrikeSharpApi);
  const matchZyInstalled = Boolean(files.matchZy);
  const matchZyRuntimeStatus = matchZyFailed > matchZyLoaded
    ? "fail"
    : matchZyLoaded >= 0
      ? "pass"
      : matchZyInstalled
        ? "warn"
        : "fail";

  const modeCheck = env.SERVER_MODE === "matchzy"
    ? check(
      "matchzy",
      "MatchZy",
      matchZyRuntimeStatus,
      matchZyRuntimeStatus === "pass"
        ? "MatchZy reported a successful load."
        : matchZyRuntimeStatus === "fail"
          ? matchZyInstalled ? "MatchZy reported a load failure." : "MatchZy.dll is missing."
          : "MatchZy.dll exists, but no load confirmation is present in retained logs."
    )
    : env.SERVER_MODE === "executes"
      ? check(
        "executes",
        "Executes",
        files.executes ? "pass" : "fail",
        files.executes ? "The selected Executes mode plugin is installed." : "ExecutesPlugin.dll is missing."
      )
      : check("vanilla", "Vanilla mode", "pass", "No match mode plugin is selected.");

  const checks = [
    check(
      "container",
      "CS2 container",
      serviceRunning ? "pass" : "fail",
      serviceRunning ? "Container is running." : `Container state is ${service?.state || "unknown"}.`
    ),
    check(
      "bootstrap",
      "Mod bootstrap",
      bootstrapStatus,
      bootstrapStatus === "pass"
        ? "The current logs contain a completed mod bootstrap."
        : bootstrapStatus === "fail"
          ? "The bootstrap failed or never stored an installer state."
          : bootstrapActivity >= 0 && bootstrapFailure < bootstrapActivity
            ? "The installer is still working or has not emitted its completion line yet."
            : "Installer state exists, but the completion line is outside the retained logs."
    ),
    check(
      "metamod",
      "Metamod",
      metamodReady ? "pass" : "fail",
      metamodReady ? "Plugin file and gameinfo search path are present." : "Plugin file or gameinfo search path is missing."
    ),
    check(
      "counterstrikesharp",
      "CounterStrikeSharp",
      cssReady ? "pass" : "fail",
      cssReady ? "Native loader and API assembly are present." : "Native loader or API assembly is missing."
    ),
    modeCheck
  ];

  const findings = [];
  const plugins = OPTIONAL_PLUGIN_FILES.filter((plugin) => plugin.enabled(env)).map((plugin) => {
    const missingFiles = plugin.files.filter((file) => !files[file]);
    return { id: plugin.id, label: plugin.label, status: missingFiles.length === 0 ? "pass" : "fail", missingFiles };
  });
  for (const plugin of plugins.filter((item) => item.status === "fail")) {
    findings.push({
      severity: "error",
      title: `${plugin.label} is enabled but incomplete`,
      detail: `Missing runtime markers: ${plugin.missingFiles.join(", ")}. Run the one-shot repair and inspect the bootstrap log if it remains incomplete.`
    });
  }
  const assetFailures = findAssetFailures(String(logs));
  if (assetFailures.length > 0) {
    findings.push({
      severity: "error",
      title: "Release asset could not be resolved",
      detail: `The installer could not find a release file for ${assetFailures.join(", ")}. The bootstrap stopped before all mods were installed.`
    });
  }
  if (probe && !probe.ok) {
    findings.push({
      severity: "error",
      title: "Container probe failed",
      detail: "The panel found the CS2 container but could not inspect its plugin files. Check Docker socket access."
    });
  }
  if (bootstrapFailure > bootstrapSuccess && assetFailures.length === 0) {
    findings.push({
      severity: "error",
      title: "Mod bootstrap failed",
      detail: "Open Docker Logs and inspect the first [pre.sh] ERROR from the latest container start."
    });
  }
  if (env.SERVER_MODE === "matchzy" && matchZyRuntimeStatus === "fail" && matchZyInstalled) {
    findings.push({
      severity: "error",
      title: "MatchZy did not enter the loaded state",
      detail: "The plugin file exists. CounterStrikeSharp or one of MatchZy's runtime dependencies rejected it during startup."
    });
  }
  if (!files.preHook && serviceRunning) {
    findings.push({
      severity: "warning",
      title: "Runtime pre.sh is missing",
      detail: "A restart cannot install or update plugins until the runtime hook is restored."
    });
  }

  const hasCriticalFailure = checks.some((item) => item.status === "fail") || findings.some((item) => item.severity === "error");
  const hasWarning = checks.some((item) => item.status === "warn") || findings.some((item) => item.severity === "warning");
  const overall = hasCriticalFailure ? "critical" : hasWarning ? "degraded" : "healthy";
  const firstProblem = checks.find((item) => item.status === "fail") || checks.find((item) => item.status === "warn");

  return {
    generatedAt: new Date().toISOString(),
    mode: { id: env.SERVER_MODE, name: modeCheck.label },
    overall,
    summary: overall === "healthy"
      ? `The complete ${env.SERVER_MODE === "vanilla" ? "framework" : modeCheck.label} load chain is healthy.`
      : firstProblem?.detail || "Diagnostics need attention.",
    service: {
      state: service?.state || "unknown",
      controlMode,
      containerId: container?.id ? container.id.slice(0, 12) : "",
      containerName: container?.name || "",
      startedAt: container?.startedAt || "",
      restartCount: Number(container?.restartCount || 0)
    },
    checks,
    plugins,
    findings,
    versions: VERSION_FIELDS.map(([key, label, envKey]) => ({
      key,
      label,
      installed: versions[key] || "not detected",
      wanted: env[envKey] || "latest",
      relevant: isVersionRelevant(key, env)
    })),
    repairAvailable: serviceRunning && overall !== "healthy",
    nades: {
      relevant: env.SERVER_MODE === "matchzy",
      configPresent: Boolean(files.matchZyConfig),
      savedNadesPresent: Boolean(files.matchZySavedNades)
    }
  };
}

export { parseProbeOutput };
