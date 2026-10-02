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
      echo "[entrypoint] Waiting for Steam token and RCON password from Playbook"
      announced=1
    fi
    sleep 5
  done
}

configure_upstream_process() {
  # cm2network/cs2 consumes these process variables directly. They are derived
  # exclusively from the platform-owned JSON file and are not deployment inputs.
  export SRCDS_TOKEN="$(read_setting '.steamToken')"
  export PLAYBOOK_SERVER_MODE="$(read_setting '.serverMode')"
  export PLAYBOOK_CHAT_PREFIX="$(read_setting '.matchZyChatPrefix')"
  export CS2_SERVERNAME="$(read_setting '.serverName')"
  export CS2_RCONPW="$(read_setting '.rconPassword')"
  export CS2_PW="$(read_setting '.joinPassword')"
  export CS2_MAXPLAYERS="$(read_setting '.maxPlayers')"
  export CS2_STARTMAP="$(read_setting '.startMap')"
  # VAC is a process-start setting. Keep legacy runtimes compatible, but never
  # let additional arguments override an explicitly configured VAC mode.
  local vac_enabled
  vac_enabled="$(read_setting '
    if has("vacEnabled") then
      if (.vacEnabled | type) == "boolean" then (.vacEnabled | tostring)
      else error("vacEnabled muss ein boolean-Wert sein") end
    else
      ((.additionalArgs // "") | test("(^|[[:space:]])(-insecure|\u0022-insecure\u0022|\u0027-insecure\u0027)(?=[[:space:]]|$)"; "i") | not | tostring)
    end
  ')" || return 1
  CS2_ADDITIONAL_ARGS="$(read_setting '
    (.additionalArgs // "") |
    gsub("(^|[[:space:]])(-(insecure|secure)|\u0022-(insecure|secure)\u0022|\u0027-(insecure|secure)\u0027)(?=[[:space:]]|$)"; " "; "i") |
    sub("^[[:space:]]+"; "") | sub("[[:space:]]+$"; "")
  ')" || return 1
  if [[ "$vac_enabled" == "false" ]]; then
    export CS2_ADDITIONAL_ARGS="${CS2_ADDITIONAL_ARGS:+$CS2_ADDITIONAL_ARGS }-insecure"
    echo '[entrypoint] VAC deaktiviert; Clients mit und ohne -insecure können beitreten.'
  else
    export CS2_ADDITIONAL_ARGS
    echo '[entrypoint] VAC aktiviert; Clients mit -insecure können nicht beitreten.'
  fi
  # New panel settings take precedence over legacy deployment variables.
  # Keep the old environment only until a panel-managed runtime is applied.
  if jq -e 'has("trainingHudEnabled")' "$settings_file" >/dev/null; then
    export MATCHZY_TRAINING_HUD_READY="$(read_setting 'if .trainingHudEnabled == true then "1" else "0" end')"
    export MATCHZY_TRAINING_HUD_ADDON_ID="$(read_setting 'if .trainingHudEnabled == true and .trainingHudWorkshopEnabled == true then (.trainingHudWorkshopId // "") else "" end')"
    if [[ "$MATCHZY_TRAINING_HUD_READY" == "1" && "$(read_setting '.trainingHudWorkshopEnabled | tostring')" == "true" && ! "$MATCHZY_TRAINING_HUD_ADDON_ID" =~ ^[1-9][0-9]{0,19}$ ]]; then
      echo '[entrypoint] Invalid or missing training HUD Workshop ID' >&2
      return 1
    fi
  fi
  if [[ "$(read_setting '.serverMode')" == "warmup" ]]; then
    export CS2_GAMEALIAS="custom"
    export CS2_GAMETYPE=3
    export CS2_GAMEMODE=0
    export CS2_HOST_WORKSHOP_MAP="3070244462"
  else
    export CS2_GAMEALIAS="competitive"
    export CS2_GAMETYPE=0
    export CS2_GAMEMODE=1
    export CS2_HOST_WORKSHOP_MAP=""
  fi
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
