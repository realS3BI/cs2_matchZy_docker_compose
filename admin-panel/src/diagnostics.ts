import { normalizeSettings } from "./policy.js";

const VERSION_FIELDS = [
  ["METAMOD", "Metamod", "metamodVersion"],
  ["MATCHZY", "MatchZy", "matchZyVersion"],
  ["COUNTERSTRIKESHARP", "CounterStrikeSharp", "counterStrikeSharpVersion"],
  ["FAKE_RCON", "Fake RCON", "fakeRconVersion"],
  ["WEAPONPAINTS", "WeaponPaints", "weaponPaintsVersion"],
  ["PLAYERSETTINGS", "PlayerSettings", "playerSettingsVersion"],
  ["ANYBASELIB", "AnyBaseLib", "anyBaseLibVersion"],
  ["MENUMANAGER", "MenuManager", "menuManagerVersion"],
  ["SIMPLEADMIN", "SimpleAdmin", "simpleAdminVersion"],
  ["MULTIADDONMANAGER", "MultiAddonManager", "multiAddonManagerVersion"],
  ["RAYTRACE", "Ray-Trace", "rayTraceVersion"],
  ["FORTNITE_EMOTES", "Fortnite Emotes", "fortniteEmotesVersion"],
  ["EXECUTES", "Executes", "executesVersion"]
];

const OPTIONAL_PLUGIN_FILES = [
  { id: "fake-rcon", label: "Fake RCON", enabled: (settings) => settings.fakeRconEnabled, files: ["fakeRcon"] },
  { id: "weaponpaints", label: "WeaponPaints", enabled: (settings) => settings.weaponPaintsEnabled, files: ["weaponPaints", "playerSettings", "anyBaseLib", "menuManager"] },
  { id: "simpleadmin", label: "SimpleAdmin", enabled: (settings) => settings.simpleAdminEnabled, files: ["simpleAdmin", "playerSettings", "anyBaseLib", "menuManager"] },
  { id: "fortnite-emotes", label: "Fortnite Emotes", enabled: (settings) => settings.fortniteEmotesEnabled, files: ["fortniteEmotes", "multiAddonManager", "rayTrace"] }
];

function parseProbeOutput(output = "") {
  const files: Record<string, boolean> = {};
  const versions: Record<string, string> = {};
  const runtime: Record<string, any> = {};

  for (const line of String(output).split(/\r?\n/)) {
    const [kind, key, value = ""] = line.split("\t");
    if (kind === "FILE" && key) files[key] = value === "1";
    if (kind === "VERSION" && key) versions[key] = value;
    if (kind === "RUNTIME" && key === "matchZyNades") {
      try {
        const data = JSON.parse(value);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          runtime[key] = {
            state: data.state, version: data.version, loadedAt: data.loadedAt,
            updatedAt: data.updatedAt, practice: data.practice, map: data.map
          };
        }
      } catch { /* A missing or invalid heartbeat is unconfirmed, never healthy. */ }
    }
  }

  return { files, versions, runtime };
}

function nadesMenuStatus({ files, runtime, settings, service, container, probe, cssReady, logs }) {
  const expected = ["matchzy", "nades"].includes(settings.serverMode);
  const installed = Boolean(files.matchZyNades);
  const bundled = Boolean(files.matchZyNadesBundled);
  const heartbeat = runtime.matchZyNades;
  const updated = Date.parse(heartbeat?.updatedAt);
  const loaded = Date.parse(heartbeat?.loadedAt);
  const started = Date.parse(container?.startedAt);
  const age = Date.now() - updated;
  const current = Number.isFinite(started) && loaded >= started && updated >= loaded;
  const fresh = current && age >= -5000 && age <= 30000 &&
    typeof heartbeat?.practice === "boolean" && typeof heartbeat?.version === "string";
  const loadFailure = lastPluginLog(logs, "failed to load plugin|could not load plugin", "matchzynades");
  const loadSuccess = Math.max(lastPluginLog(logs, "finished loading plugin", "matchzynades"),
    lastIndexOfAny(logs, ["nade training menu loaded"]), lastPluginLog(logs, "matchzy nades \\S+", "loaded"));
  let state: string;
  let status: string;
  let detail: string;
  if (service?.state !== "running") {
    state = "stopped"; status = "warn"; detail = "The CS2 container is not running. Start it before checking the in-game menu.";
  } else if (!probe?.ok) {
    state = "unavailable"; status = "warn"; detail = "The container could not be inspected. Open Diagnostics to check Docker access.";
  } else if (!installed) {
    state = expected ? "missing" : "inactive"; status = expected ? "fail" : "pass";
    detail = !expected ? "Automatically installed with MatchZy and Nades modes. Select one of these modes and Apply & restart."
      : bundled ? "MatchZyNades.dll is missing from the plugin folder. Apply & restart to install the bundled menu."
      : "This CS2 image does not contain the menu plugin. Rebuild and redeploy the stack; a container restart alone cannot add it.";
  } else if (!cssReady) {
    state = "blocked"; status = "fail"; detail = "The plugin is installed, but CounterStrikeSharp cannot start. Check the framework errors in Diagnostics.";
  } else if (fresh && heartbeat?.state === "loaded") {
    state = "loaded"; status = "pass";
    detail = heartbeat.practice === true ? "The running plugin confirms practice is active. Join a team, spawn and type .nades."
      : "The running plugin is loaded. Start practice with .prac, then open .nades.";
  } else if (current && heartbeat?.state === "unloaded") {
    state = "unloaded"; status = "fail"; detail = "The plugin reported that it was unloaded. Apply & restart, then check Diagnostics.";
  } else if (loadFailure > loadSuccess) {
    state = "failed"; status = "fail"; detail = "CounterStrikeSharp reported a MatchZyNades load failure. Check Docker logs for the plugin error and verify CounterStrikeSharp API 373 or newer is installed.";
  } else {
    state = "unconfirmed"; status = "warn";
    detail = "The DLL is installed, but there is no recent confirmation from this server start. Check the load logs in Diagnostics; rebuild the stack if it still uses plugin 1.0.0.";
  }
  return {
    expected, installed, bundled, state, status, detail,
    version: current && typeof heartbeat?.version === "string" ? heartbeat.version : "",
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : "",
    practice: state === "loaded" ? heartbeat.practice === true : null
  };
}

function lastIndexOfAny(text, needles) {
  return Math.max(-1, ...needles.map((needle) => text.lastIndexOf(needle)));
}

function lastPluginLog(text, verbs, name) {
  // A word boundary prevents MatchZyNades from matching MatchZy.
  const matches = [...text.matchAll(new RegExp(`(?:${verbs})\\s+["']?${name}\\b`, "gi"))];
  return matches.at(-1)?.index ?? -1;
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

function isVersionRelevant(key, settings) {
  if (key === "MATCHZY") return ["matchzy", "nades"].includes(settings.serverMode);
  if (key === "EXECUTES") return settings.serverMode === "executes";
  if (key === "FAKE_RCON") return settings.fakeRconEnabled;
  if (key === "WEAPONPAINTS") return settings.weaponPaintsEnabled;
  if (["PLAYERSETTINGS", "ANYBASELIB", "MENUMANAGER"].includes(key)) return settings.weaponPaintsEnabled || settings.simpleAdminEnabled;
  if (key === "SIMPLEADMIN") return settings.simpleAdminEnabled;
  if (key === "MULTIADDONMANAGER") return settings.fortniteEmotesEnabled || settings.workshopMapsEnabled;
  if (["RAYTRACE", "FORTNITE_EMOTES"].includes(key)) return settings.fortniteEmotesEnabled;
  return true;
}

export function buildDiagnostics({ service, container, probe, logs = "", desired = {}, controlMode = "docker" }) {
  const settings = normalizeSettings(desired);
  const { files, versions, runtime } = parseProbeOutput(probe?.stdout);
  const normalizedLogs = String(logs).toLowerCase();
  const bootstrapSuccess = normalizedLogs.lastIndexOf("[pre.sh] mod bootstrap complete");
  const bootstrapFailure = normalizedLogs.lastIndexOf("[pre.sh] hook failed");
  const bootstrapActivity = lastIndexOfAny(normalizedLogs, [
    "[pre.sh] resolving ",
    "[pre.sh] installing or updating ",
    "[pre.sh] downloading "
  ]);
  const matchZyLoaded = Math.max(lastPluginLog(normalizedLogs, "finished loading plugin", "matchzy"), lastIndexOfAny(normalizedLogs, [
    "[matchzy 0.8.15 loaded]",
    "matchzy by wd-"
  ]));
  const matchZyFailed = lastPluginLog(normalizedLogs, "failed to load plugin|could not load plugin", "matchzy");
  const cssExecutableStackFailure = lastIndexOfAny(normalizedLogs, [
    "cannot enable executable stack as shared object requires",
    "requires executable stack"
  ]);
  const metamodTooOld = normalizedLogs.lastIndexOf("plugin requires newer metamod version");
  const metamodTooNew = normalizedLogs.lastIndexOf("plugin uses old sourcehook metamod build");
  const metamodInterfaceFailure = Math.max(metamodTooOld, metamodTooNew);

  const serviceRunning = service?.state === "running";
  const bootstrapStatus = bootstrapFailure > bootstrapSuccess
    ? "fail"
    : bootstrapSuccess >= 0
      ? "pass"
      : bootstrapActivity >= 0 || files.installerState
        ? "warn"
        : "fail";
  const metamodReady = Boolean(files.metamod && files.gameinfoMetamod) && metamodInterfaceFailure < 0;
  const cssFilesReady = Boolean(files.counterStrikeSharpNative && files.counterStrikeSharpApi);
  const cssReady = cssFilesReady && cssExecutableStackFailure < 0 && metamodInterfaceFailure < 0;
  const nadeMenu = nadesMenuStatus({ files, runtime, settings, service, container, probe, cssReady, logs: normalizedLogs });
  const matchZyInstalled = Boolean(files.matchZy);
  const matchZyRuntimeStatus = metamodInterfaceFailure >= 0
    ? "fail"
    : matchZyFailed > matchZyLoaded
    ? "fail"
    : matchZyLoaded >= 0
      ? "pass"
      : matchZyInstalled
        ? "warn"
        : "fail";

  const modeCheck = ["matchzy", "nades"].includes(settings.serverMode)
    ? check(
      settings.serverMode,
      settings.serverMode === "nades" ? "Nades" : "MatchZy",
      matchZyRuntimeStatus,
      matchZyRuntimeStatus === "pass"
        ? "MatchZy reported a successful load."
        : matchZyRuntimeStatus === "fail"
          ? metamodInterfaceFailure >= 0 ? "MatchZy cannot load because Metamod rejected CounterStrikeSharp." : matchZyInstalled ? "MatchZy reported a load failure." : "MatchZy.dll is missing."
          : "MatchZy.dll exists, but no load confirmation is present in retained logs."
    )
    : settings.serverMode === "warmup"
      ? check("warmup", "Warmup / Aim Botz", "pass", "CS2 starts Workshop map 3070244462 in Custom mode.")
      : settings.serverMode === "executes"
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
      metamodReady
        ? "Plugin file and gameinfo search path are present."
        : metamodTooOld >= 0 && metamodTooOld >= metamodTooNew
          ? "CounterStrikeSharp requires Metamod plugin interface 18, but the installed build provides interface 17."
          : metamodTooNew >= 0
            ? "The installed Metamod build requires plugin interface 18, but CounterStrikeSharp provides interface 17."
          : "Plugin file or gameinfo search path is missing."
    ),
    check(
      "counterstrikesharp",
      "CounterStrikeSharp",
      cssReady ? "pass" : "fail",
      cssReady
        ? "Native loader and API assembly are present."
        : metamodInterfaceFailure >= 0
          ? "Metamod rejected the CounterStrikeSharp native plugin because their interfaces differ."
          : cssExecutableStackFailure >= 0
          ? "The host rejected CounterStrikeSharp because its native module requested an executable stack. Rebuild the CS2 image to apply the compatibility patch."
          : "Native loader or API assembly is missing."
    ),
    ...(nadeMenu.expected ? [check("matchzy-nades", "MatchZy Nades menu", nadeMenu.status, nadeMenu.detail)] : []),
    modeCheck
  ];

  const findings = [];
  const plugins = OPTIONAL_PLUGIN_FILES.filter((plugin) => plugin.enabled(settings)).map((plugin) => {
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
  if (cssExecutableStackFailure >= 0) {
    findings.push({
      severity: "error",
      title: "CounterStrikeSharp was blocked by the host",
      detail: "The native loader requested an executable stack. Rebuild and redeploy the CS2 image; the bootstrap now clears that unsafe ELF flag automatically."
    });
  }
  if (metamodInterfaceFailure >= 0) {
    findings.push({
      severity: "error",
      title: "Metamod and CounterStrikeSharp are incompatible",
      detail: metamodTooOld >= 0 && metamodTooOld >= metamodTooNew
        ? "CounterStrikeSharp requires Metamod interface 18. Set the Metamod version to latest, then redeploy and restart to install build 1467 or newer."
        : "This CounterStrikeSharp release uses interface 17. Pin Metamod to compatible (build 1411), or update CounterStrikeSharp and Metamod together."
    });
  }
  if (["matchzy", "nades"].includes(settings.serverMode) && matchZyRuntimeStatus === "fail" && matchZyInstalled) {
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
    mode: { id: settings.serverMode, name: modeCheck.label },
    overall,
    summary: overall === "healthy"
      ? `The complete ${settings.serverMode === "vanilla" ? "framework" : modeCheck.label} load chain is healthy.`
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
    versions: VERSION_FIELDS.map(([key, label, settingKey]) => ({
      key,
      label,
      installed: versions[key] || "not detected",
      wanted: settings[settingKey] || "latest",
      relevant: isVersionRelevant(key, settings)
    })),
    repairAvailable: serviceRunning && overall !== "healthy",
    nades: {
      menu: nadeMenu,
      relevant: ["matchzy", "nades"].includes(settings.serverMode),
      configPresent: Boolean(files.matchZyConfig),
      savedNadesPresent: Boolean(files.matchZySavedNades)
    }
  };
}

export { parseProbeOutput };
