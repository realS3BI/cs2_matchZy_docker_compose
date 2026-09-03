#!/usr/bin/env bash
set -euo pipefail

steamappdir="/home/steam/cs2-dedicated"
settings_file="/config-runtime/settings.json"
runtime_pre_hook="$steamappdir/pre.sh"
runtime_post_hook="$steamappdir/post.sh"

read_setting() {
  jq -er "$1" "$settings_file"
}

wait_for_platform_configuration() {
  local announced=0
  while true; do
    if jq -e '
      type == "object" and
      (.schemaVersion == 1) and
      (.steamToken | type == "string" and length > 0) and
      (.rconPassword | type == "string" and length > 0)
    ' "$settings_file" >/dev/null 2>&1; then
      return 0
    fi
    if (( announced == 0 )); then
      echo "[entrypoint] Waiting for Steam token and RCON password from MatchZy Control"
      announced=1
    fi
    sleep 5
  done
}

configure_upstream_process() {
  # cm2network/cs2 consumes these process variables directly. They are derived
  # exclusively from the platform-owned JSON file and are not deployment inputs.
  export SRCDS_TOKEN="$(read_setting '.steamToken')"
  export CS2_SERVERNAME="$(read_setting '.serverName')"
  export CS2_RCONPW="$(read_setting '.rconPassword')"
  export CS2_PW="$(read_setting '.joinPassword')"
  export CS2_MAXPLAYERS="$(read_setting '.maxPlayers')"
  export CS2_STARTMAP="$(read_setting '.startMap')"
  export CS2_ADDITIONAL_ARGS="$(read_setting '.additionalArgs')"
  export CS2_PORT=27015
  export TV_PORT=27020
}

command -v jq >/dev/null 2>&1 || {
  echo "[entrypoint] jq is required to read platform settings" >&2
  exit 1
}

mkdir -p "$steamappdir"
wait_for_platform_configuration
configure_upstream_process

# Recover from broken state where pre.sh became a directory in the volume.
if [[ -d "$runtime_pre_hook" ]]; then
  rm -rf "$runtime_pre_hook"
fi

if [[ -f /etc/pre.sh ]]; then
  cp -f /etc/pre.sh "$runtime_pre_hook"
  chmod 0755 "$runtime_pre_hook" 2>/dev/null || true
fi

if [[ -f /etc/post.sh ]]; then
  cp -f /etc/post.sh "$runtime_post_hook"
  chmod 0755 "$runtime_post_hook" 2>/dev/null || true
fi

exec bash entry.sh "$@"
