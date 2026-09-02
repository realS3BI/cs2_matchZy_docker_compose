const VERSION_FIELDS = [
  ["METAMOD", "Metamod", "METAMOD_VERSION"],
  ["MATCHZY", "MatchZy", "MATCHZY_VERSION"],
  ["COUNTERSTRIKESHARP", "CounterStrikeSharp", "COUNTERSTRIKESHARP_VERSION"],
  ["FAKE_RCON", "Fake RCON", "FAKE_RCON_VERSION"],
  ["MULTIADDONMANAGER", "MultiAddonManager", "MULTIADDONMANAGER_VERSION"],
  ["RAYTRACE", "Ray-Trace", "RAYTRACE_VERSION"],
  ["FORTNITE_EMOTES", "Fortnite Emotes", "FORTNITE_EMOTES_VERSION"],
  ["EXECUTES", "Executes", "EXECUTES_VERSION"]
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

export function buildDiagnostics({ service, container, probe, logs = "", desired = {}, controlMode = "docker" }) {
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
    check(
      "matchzy",
      "MatchZy",
      matchZyRuntimeStatus,
      matchZyRuntimeStatus === "pass"
        ? "MatchZy reported a successful load."
        : matchZyRuntimeStatus === "fail"
          ? matchZyInstalled ? "MatchZy reported a load failure." : "MatchZy.dll is missing."
          : "MatchZy.dll exists, but no load confirmation is present in retained logs."
    )
  ];

  const findings = [];
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
  if (matchZyRuntimeStatus === "fail" && matchZyInstalled) {
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

  const hasCriticalFailure = checks.some((item) => item.status === "fail");
  const hasWarning = checks.some((item) => item.status === "warn") || findings.some((item) => item.severity === "warning");
  const overall = hasCriticalFailure ? "critical" : hasWarning ? "degraded" : "healthy";
  const firstProblem = checks.find((item) => item.status === "fail") || checks.find((item) => item.status === "warn");

  return {
    generatedAt: new Date().toISOString(),
    overall,
    summary: overall === "healthy"
      ? "The complete MatchZy load chain is healthy."
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
    findings,
    versions: VERSION_FIELDS.map(([key, label, envKey]) => ({
      key,
      label,
      installed: versions[key] || "not detected",
      wanted: desired[envKey] || "latest"
    })),
    repairAvailable: serviceRunning && overall !== "healthy",
    nades: {
      configPresent: Boolean(files.matchZyConfig),
      savedNadesPresent: Boolean(files.matchZySavedNades)
    }
  };
}

export { parseProbeOutput };
