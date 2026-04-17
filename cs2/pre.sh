#!/usr/bin/env bash
# Mod bootstrap hook for cm2network/cs2 (alias joedwards32/cs2).
# The base image `source`s this file from entry.sh. Therefore the whole script
# body MUST run in a subshell so that `set -e`, traps, and exit codes do not
# leak into the parent entry.sh and abort the container start.

_matchzy_bootstrap_main() (
  set -euo pipefail

  log() {
    printf '[pre.sh] %s\n' "$*"
  }

  fail() {
    printf '[pre.sh] ERROR: %s\n' "$*" >&2
    exit 1
  }

  need_cmd() {
    command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
  }

  is_enabled() {
    case "${1,,}" in
      1|true|yes|on)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  }

  http_get() {
    local url="$1"
    local out="$2"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$url" -o "$out"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$out" "$url"
    else
      fail "Neither curl nor wget is available"
    fi
  }

  http_get_text() {
    local url="$1"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$url"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO- "$url"
    else
      fail "Neither curl nor wget is available"
    fi
  }

  extract_tag_name() {
    local json="$1"
    printf '%s' "$json" \
      | tr -d '\r\n' \
      | grep -Eo '"tag_name":[[:space:]]*"[^"]+"' \
      | head -n1 \
      | sed -E 's/.*"([^"]+)"/\1/'
  }

  extract_asset_url() {
    local json="$1"
    local pattern="$2"
    printf '%s' "$json" \
      | tr -d '\r\n' \
      | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
      | sed -E 's/.*"([^"]+)"/\1/' \
      | grep -Ei "$pattern" \
      | head -n1
  }

  read_state_value() {
    local key="$1"
    [[ -f "$STATE_FILE" ]] || return 0
    grep -E "^${key}=" "$STATE_FILE" | head -n1 | cut -d= -f2- || true
  }

  trim_whitespace() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
  }

  sanitize_admin_id() {
    local value="$1"
    value="$(trim_whitespace "$value")"

    if [[ "$value" == '"'*'"' ]]; then
      value="${value#\"}"
      value="${value%\"}"
    fi

    if [[ "$value" == "'"*"'" ]]; then
      value="${value#\'}"
      value="${value%\'}"
    fi

    value="$(trim_whitespace "$value")"
    printf '%s' "$value"
  }

  extract_archive() {
    local archive="$1"
    local destination="$2"

    case "$archive" in
      *.tar.gz|*.tgz)
        tar -xzf "$archive" -C "$destination"
        ;;
      *.zip)
        if command -v unzip >/dev/null 2>&1; then
          unzip -oq "$archive" -d "$destination"
        elif command -v bsdtar >/dev/null 2>&1; then
          bsdtar -xf "$archive" -C "$destination"
        elif command -v python3 >/dev/null 2>&1; then
          python3 -m zipfile -e "$archive" "$destination"
        else
          fail "Cannot extract zip: unzip/bsdtar/python3 not found"
        fi
        ;;
      *)
        fail "Unsupported archive format: $archive"
        ;;
    esac
  }

  read_css_api_version() {
    local dll_path="$1"
    [[ -f "$dll_path" ]] || return 0
    grep -aom1 -E '1\.0\.[0-9]{3}' "$dll_path" 2>/dev/null || true
  }

  normalize_csgo_layout() {
    # Defensive: if a release ever ships with a nested csgo/ root, flatten it.
    local destination="$1"
    local nested="$destination/csgo"
    if [[ -d "$nested" ]]; then
      log "Normalizing nested csgo archive layout from $nested"
      cp -a "$nested/." "$destination/"
      rm -rf "$nested"
    fi
  }

  get_release_json() {
    local repo="$1"
    local wanted="$2"
    local url=""
    local json=""

    if [[ "$wanted" == "latest" ]]; then
      url="https://api.github.com/repos/$repo/releases/latest"
      http_get_text "$url"
      return 0
    fi

    for tag in "$wanted" "v$wanted"; do
      url="https://api.github.com/repos/$repo/releases/tags/$tag"
      if json="$(http_get_text "$url" 2>/dev/null)"; then
        printf '%s' "$json"
        return 0
      fi
    done

    return 1
  }

  resolve_github_release_asset() {
    local repo="$1"
    local wanted="$2"
    local pattern="$3"
    local component="$4"
    local json=""
    local tag=""
    local url=""

    json="$(get_release_json "$repo" "$wanted")" \
      || fail "Unable to resolve ${component} release for '$wanted' from $repo"
    tag="$(extract_tag_name "$json")"
    url="$(extract_asset_url "$json" "$pattern")"

    [[ -n "$tag" && -n "$url" ]] \
      || fail "Could not resolve ${component} asset from $repo matching pattern '$pattern'"

    printf '%s\n%s\n' "$tag" "$url"
  }

  resolve_metamod_release() {
    local wanted="$1"
    local build=""
    local page=""
    local tag=""
    local url=""

    case "$wanted" in
      latest|2.0-dev|dev)
        page="$(http_get_text 'https://www.metamodsource.net/downloads.php/?branch=2.0-dev')" \
          || fail "Unable to resolve Metamod 2.0-dev downloads page"
        url="$(printf '%s' "$page" \
          | tr -d '\r\n' \
          | grep -Eo 'https://github\.com/alliedmodders/metamod-source/releases/download/2\.0\.0\.[0-9]+/mmsource-2\.0\.0-git[0-9]+-linux\.tar\.gz' \
          | head -n1)"
        tag="$(printf '%s' "$url" \
          | sed -E 's#.*/mmsource-(2\.0\.0-git[0-9]+)-linux\.tar\.gz#\1#')"
        ;;
      *)
        if [[ "$wanted" =~ ^[0-9]+$ ]]; then
          build="$wanted"
        elif [[ "$wanted" =~ git([0-9]+)$ ]]; then
          build="${BASH_REMATCH[1]}"
        elif [[ "$wanted" =~ dev\+([0-9]+)$ ]]; then
          build="${BASH_REMATCH[1]}"
        fi
        ;;
    esac

    if [[ -z "$tag" || -z "$url" ]]; then
      [[ -n "$build" ]] || fail "Could not resolve Metamod build for '$wanted'. Use 'latest' or a 2.0 build number like '1395'."
      tag="2.0.0-git${build}"
      url="https://github.com/alliedmodders/metamod-source/releases/download/2.0.0.${build}/mmsource-${tag}-linux.tar.gz"
    fi

    printf '%s\n%s\n' "$tag" "$url"
  }

  install_archive_component() {
    local name="$1"
    local url="$2"
    local destination="$3"
    local marker="${4:-}"
    local normalize_mode="${5:-none}"
    local archive=""

    mkdir -p "$destination"

    archive="$TMP_DIR/${name}-$(basename "${url%%\?*}")"
    log "Downloading $name asset"
    http_get "$url" "$archive"

    log "Extracting $name into $destination"
    extract_archive "$archive" "$destination"

    case "$normalize_mode" in
      csgo)
        normalize_csgo_layout "$destination"
        ;;
    esac

    if [[ -n "$marker" ]]; then
      [[ -e "$marker" ]] || fail "$name installation marker not found at $marker"
    fi
  }

  stage_archive_component() {
    local name="$1"
    local url="$2"
    local stage_dir=""
    local archive=""

    stage_dir="$TMP_DIR/stage-$name"
    archive="$TMP_DIR/${name}-$(basename "${url%%\?*}")"

    rm -rf "$stage_dir"
    mkdir -p "$stage_dir"

    printf '[pre.sh] %s\n' "Downloading $name asset" >&2
    http_get "$url" "$archive"

    printf '[pre.sh] %s\n' "Extracting $name into staging directory $stage_dir" >&2
    extract_archive "$archive" "$stage_dir"

    printf '%s\n' "$stage_dir"
  }

  ensure_multiaddonmanager_addon() {
    local cfg_file="$1"
    local addon_id="$2"

    mkdir -p "$(dirname "$cfg_file")"

    if [[ ! -f "$cfg_file" ]]; then
      printf 'mm_extra_addons "%s"\n' "$addon_id" > "$cfg_file"
      log "Created MultiAddonManager config with addon $addon_id"
      return 0
    fi

    if grep -Eq '^[[:space:]]*mm_extra_addons[[:space:]]+"[^"]*'"$addon_id"'[^"]*"' "$cfg_file"; then
      log "MultiAddonManager already configured with addon $addon_id"
      return 0
    fi

    if grep -Eq '^[[:space:]]*mm_extra_addons[[:space:]]+"' "$cfg_file"; then
      sed -Ei 's#^([[:space:]]*mm_extra_addons[[:space:]]+")([^"]*)(".*)$#\1\2,'"${addon_id}"'\3#' "$cfg_file"
      sed -Ei 's#mm_extra_addons[[:space:]]+",#mm_extra_addons "#' "$cfg_file"
    else
      printf '\nmm_extra_addons "%s"\n' "$addon_id" >> "$cfg_file"
    fi

    log "Ensured MultiAddonManager addon $addon_id is configured"
  }

  patch_css_core_follow_guidelines() {
    local core_file="$1"

    [[ -f "$core_file" ]] || {
      log "CounterStrikeSharp core config not found at $core_file; skipping WeaponPaints core patch"
      return 0
    }

    if grep -Eq '"FollowCS2ServerGuidelines"[[:space:]]*:[[:space:]]*false' "$core_file"; then
      log "CounterStrikeSharp core config already allows WeaponPaints"
      return 0
    fi

    if grep -Eq '"FollowCS2ServerGuidelines"[[:space:]]*:[[:space:]]*true' "$core_file"; then
      sed -Ei '0,/"FollowCS2ServerGuidelines"[[:space:]]*:[[:space:]]*true/s//"FollowCS2ServerGuidelines": false/' "$core_file"
      log "Patched CounterStrikeSharp core config: FollowCS2ServerGuidelines=false"
      return 0
    fi

    log "CounterStrikeSharp core config does not contain FollowCS2ServerGuidelines; leaving file unchanged"
  }

  install_fortnite_emotes_component() {
    local url="$1"
    local marker="$2"
    local stage_dir=""
    local root_dir=""
    local config_src=""
    local config_dst=""

    stage_dir="$(stage_archive_component "fortnite-emotes" "$url")"
    root_dir="$stage_dir/FortniteEmotesNDances"
    [[ -d "$root_dir" ]] || fail "FortniteEmotesNDances archive layout unexpected"

    mkdir -p \
      "$CSS_DIR/plugins" \
      "$CSS_DIR/shared" \
      "$CSS_DIR/configs/plugins" \
      "$CSS_DIR/gamedata"

    rm -rf \
      "$CSS_DIR/plugins/FortniteEmotesNDances" \
      "$CSS_DIR/shared/FortniteEmotesNDancesAPI" \
      "$CSS_DIR/shared/KitsuneMenu" \
      "$CSS_DIR/shared/RayTraceApi"

    cp -a "$root_dir/plugins/FortniteEmotesNDances" "$CSS_DIR/plugins/"
    cp -a "$root_dir/shared/." "$CSS_DIR/shared/"
    cp -f "$root_dir/gamedata/fortnite_emotes.json" "$CSS_DIR/gamedata/fortnite_emotes.json"

    config_src="$root_dir/configs/plugins/FortniteEmotesNDances"
    config_dst="$CSS_DIR/configs/plugins/FortniteEmotesNDances"
    if [[ ! -d "$config_dst" ]]; then
      cp -a "$config_src" "$config_dst"
      log "Installed default FortniteEmotesNDances config"
    else
      log "Keeping existing FortniteEmotesNDances config at $config_dst"
    fi

    [[ -f "$marker" ]] || fail "FortniteEmotesNDances installation marker not found at $marker"
  }

  remove_obsolete_plugins() {
    rm -rf \
      "$ADDONS_DIR/addons/counterstrikesharp" \
      "$ADDONS_DIR/Skin" \
      "$ADDONS_DIR/metamod/Skin.vdf" \
      "$CSS_DIR/plugins/RollTheDice" \
      "$CSS_DIR/configs/plugins/RollTheDice" \
      "$CSS_DIR/plugins/ColoredSmokeTeam" \
      "$CSS_DIR/configs/plugins/ColoredSmokeTeam" \
      "$CSS_DIR/gamedata/coloredsmoketeam.json"
  }

  remove_fake_rcon_component() {
    rm -rf \
      "$ADDONS_DIR/fake_rcon" \
      "$ADDONS_DIR/configs/fake_rcon"
  }

  remove_weaponpaints_component() {
    rm -rf \
      "$CSS_DIR/plugins/WeaponPaints" \
      "$CSS_DIR/configs/plugins/WeaponPaints" \
      "$CSS_DIR/gamedata/weaponpaints.json"
  }

  remove_menu_stack_components() {
    rm -rf \
      "$CSS_DIR/plugins/MenuManagerCore" \
      "$CSS_DIR/plugins/PlayerSettings" \
      "$CSS_DIR/shared/AnyBaseLib" \
      "$CSS_DIR/shared/MenuManagerApi" \
      "$CSS_DIR/shared/PlayerSettingsApi" \
      "$CSS_DIR/configs/plugins/MenuManagerCore" \
      "$CSS_DIR/configs/plugins/PlayerSettings"
  }

  remove_simpleadmin_component() {
    rm -rf \
      "$CSS_DIR/plugins/CS2-SimpleAdmin" \
      "$CSS_DIR/plugins/CS2-SimpleAdmin_FunCommands" \
      "$CSS_DIR/plugins/CS2-SimpleAdmin_StealthModule" \
      "$CSS_DIR/shared/CS2-SimpleAdminApi" \
      "$CSS_DIR/configs/plugins/CS2-SimpleAdmin" \
      "$ADDONS_DIR/StatusBlocker" \
      "$ADDONS_DIR/StatusBlocker.vdf"
  }

  remove_fortnite_emotes_component() {
    rm -rf \
      "$CSS_DIR/plugins/FortniteEmotesNDances" \
      "$CSS_DIR/shared/FortniteEmotesNDancesAPI" \
      "$CSS_DIR/shared/KitsuneMenu" \
      "$CSS_DIR/shared/RayTraceApi" \
      "$CSS_DIR/configs/plugins/FortniteEmotesNDances" \
      "$CSS_DIR/gamedata/fortnite_emotes.json" \
      "$ADDONS_DIR/multiaddonmanager" \
      "$ADDONS_DIR/RayTrace" \
      "$GAME_DIR/cfg/multiaddonmanager"
  }

  remove_executes_component() {
    rm -rf \
      "$CSS_DIR/plugins/ExecutesPlugin" \
      "$CSS_DIR/configs/plugins/ExecutesPlugin"
  }

  patch_gameinfo_for_metamod() {
    local gameinfo="$1"
    local tmp_file=""

    [[ -f "$gameinfo" ]] || fail "gameinfo.gi not found at $gameinfo"

    if grep -Eq '^[[:space:]]*Game[[:space:]]+csgo/addons/metamod[[:space:]]*$' "$gameinfo"; then
      log "gameinfo.gi already contains Metamod search path"
      return 0
    fi

    tmp_file="$(mktemp)"

    if ! awk '
      BEGIN {
        inserted = 0
        wait_brace = 0
      }
      {
        if (!inserted && $0 ~ /^[[:space:]]*SearchPaths[[:space:]]*$/) {
          print $0
          wait_brace = 1
          next
        }
        if (!inserted && $0 ~ /^[[:space:]]*SearchPaths[[:space:]]*\{[[:space:]]*$/) {
          print $0
          print "        Game    csgo/addons/metamod"
          inserted = 1
          next
        }
        if (wait_brace && !inserted && $0 ~ /^[[:space:]]*\{[[:space:]]*$/) {
          print $0
          print "        Game    csgo/addons/metamod"
          inserted = 1
          wait_brace = 0
          next
        }
        print $0
      }
      END {
        if (!inserted) {
          exit 42
        }
      }
    ' "$gameinfo" > "$tmp_file"; then
      rm -f "$tmp_file"
      fail "Could not patch gameinfo.gi SearchPaths block"
    fi

    mv "$tmp_file" "$gameinfo"
    log "Patched gameinfo.gi with Metamod search path"
  }

  collect_admin_ids() {
    local admins_raw="$1"
    local output_file="$2"
    local entry=""
    local admin_id=""
    local -a admin_entries=()
    local -A seen_ids=()

    : > "$output_file"

    IFS=',' read -r -a admin_entries <<< "${admins_raw//$'\n'/,}"
    for entry in "${admin_entries[@]}"; do
      admin_id="$(sanitize_admin_id "$entry")"
      [[ -n "$admin_id" ]] || continue
      [[ "$admin_id" =~ ^[0-9]+$ ]] || fail "ADMINS contains invalid SteamID64 '$admin_id'"
      [[ -n "${seen_ids[$admin_id]:-}" ]] && continue
      seen_ids["$admin_id"]=1
      printf '%s\n' "$admin_id" >> "$output_file"
    done
  }

  write_matchzy_admins_file() {
    local admins_raw="$1"
    local admins_file="$2"
    local admins_dir=""
    local tmp_file=""
    local ids_file=""
    local index=0
    local -a admin_ids=()

    admins_dir="$(dirname "$admins_file")"
    mkdir -p "$admins_dir"

    ids_file="$(mktemp)"
    collect_admin_ids "$admins_raw" "$ids_file"
    mapfile -t admin_ids < "$ids_file"
    rm -f "$ids_file"

    tmp_file="$(mktemp)"
    {
      printf '{'
      if ((${#admin_ids[@]} > 0)); then
        printf '\n'
        for index in "${!admin_ids[@]}"; do
          printf '  "%s": ""' "${admin_ids[$index]}"
          if (( index < ${#admin_ids[@]} - 1 )); then
            printf ','
          fi
          printf '\n'
        done
      fi
      printf '}\n'
    } > "$tmp_file"

    mv "$tmp_file" "$admins_file"
    log "Wrote MatchZy admins file with ${#admin_ids[@]} admin(s) from ADMINS"
  }

  write_matchzy_config_file() {
    local smoke_color_raw="$1"
    local config_file="$2"
    local config_dir=""
    local smoke_color_value="false"
    local tmp_file=""

    config_dir="$(dirname "$config_file")"
    mkdir -p "$config_dir"

    if is_enabled "$smoke_color_raw"; then
      smoke_color_value="true"
    fi

    tmp_file="$(mktemp)"
    {
      printf 'matchzy_smoke_color_enabled %s\n' "$smoke_color_value"
      printf 'matchzy_chat_prefix "{Green}Sebi CS2{Default}"\n'
    } > "$tmp_file"

    mv "$tmp_file" "$config_file"
    log "Wrote MatchZy config.cfg with smoke color set to '$smoke_color_value'"
  }

  write_css_admins_file() {
    local admins_raw="$1"
    local admins_file="$2"
    local admins_dir=""
    local tmp_file=""
    local ids_file=""
    local index=0
    local -a admin_ids=()

    admins_dir="$(dirname "$admins_file")"
    mkdir -p "$admins_dir"

    ids_file="$(mktemp)"
    collect_admin_ids "$admins_raw" "$ids_file"
    mapfile -t admin_ids < "$ids_file"
    rm -f "$ids_file"

    tmp_file="$(mktemp)"
    {
      printf '{'
      if ((${#admin_ids[@]} > 0)); then
        printf '\n'
        for index in "${!admin_ids[@]}"; do
          printf '  "%s": {\n' "${admin_ids[$index]}"
          printf '    "identity": "%s",\n' "${admin_ids[$index]}"
          printf '    "flags": [\n'
          printf '      "@css/root"\n'
          printf '    ]\n'
          printf '  }'
          if (( index < ${#admin_ids[@]} - 1 )); then
            printf ','
          fi
          printf '\n'
        done
      fi
      printf '}\n'
    } > "$tmp_file"

    mv "$tmp_file" "$admins_file"
    log "Wrote CounterStrikeSharp admins file with ${#admin_ids[@]} admin(s) from ADMINS"
  }

  need_cmd awk
  need_cmd grep
  need_cmd sed
  need_cmd tar
  need_cmd mktemp
  need_cmd cut

  local STEAMAPPDIR="${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
  local GAME_DIR="$STEAMAPPDIR/game/csgo"
  local ADDONS_DIR="$GAME_DIR/addons"
  local CSS_DIR="$ADDONS_DIR/counterstrikesharp"
  local GAMEINFO_FILE="$GAME_DIR/gameinfo.gi"

  local METAMOD_VERSION="${METAMOD_VERSION:-latest}"
  local MATCHZY_VERSION="${MATCHZY_VERSION:-latest}"
  local COUNTERSTRIKESHARP_VERSION="${COUNTERSTRIKESHARP_VERSION:-latest}"
  local MOD_REINSTALL="${MOD_REINSTALL:-0}"
  local FAKE_RCON_ENABLED="${FAKE_RCON_ENABLED:-1}"
  local FAKE_RCON_VERSION="${FAKE_RCON_VERSION:-latest}"
  local WEAPONPAINTS_ENABLED="${WEAPONPAINTS_ENABLED:-1}"
  local WEAPONPAINTS_VERSION="${WEAPONPAINTS_VERSION:-latest}"
  local FORTNITE_EMOTES_ENABLED="${FORTNITE_EMOTES_ENABLED:-1}"
  local FORTNITE_EMOTES_VERSION="${FORTNITE_EMOTES_VERSION:-latest}"
  local FORTNITE_EMOTES_WORKSHOP_ADDON_ID="${FORTNITE_EMOTES_WORKSHOP_ADDON_ID:-3328582199}"
  local MULTIADDONMANAGER_VERSION="${MULTIADDONMANAGER_VERSION:-latest}"
  local RAYTRACE_VERSION="${RAYTRACE_VERSION:-latest}"
  local EXECUTES_ENABLED="${EXECUTES_ENABLED:-1}"
  local EXECUTES_VERSION="${EXECUTES_VERSION:-latest}"
  local SIMPLEADMIN_ENABLED="${SIMPLEADMIN_ENABLED:-1}"
  local SIMPLEADMIN_VERSION="${SIMPLEADMIN_VERSION:-latest}"
  local PLAYERSETTINGS_VERSION="${PLAYERSETTINGS_VERSION:-latest}"
  local ANYBASELIB_VERSION="${ANYBASELIB_VERSION:-latest}"
  local MENUMANAGER_VERSION="${MENUMANAGER_VERSION:-latest}"
  local MATCHZY_SMOKE_COLOR="${MATCHZY_SMOKE_COLOR:-0}"
  local ADMINS="${ADMINS:-}"
  local NEED_MENU_STACK=0
  if is_enabled "$SIMPLEADMIN_ENABLED" || is_enabled "$WEAPONPAINTS_ENABLED"; then
    NEED_MENU_STACK=1
  fi

  local STATE_DIR="$STEAMAPPDIR/.mod-installer"
  local STATE_FILE="$STATE_DIR/state.env"
  local TMP_DIR=""
  mkdir -p "$STATE_DIR"

  [[ -d "$GAME_DIR" ]] || fail "Game directory not found: $GAME_DIR"

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  remove_obsolete_plugins

  if ! is_enabled "$FAKE_RCON_ENABLED"; then
    log "cs2-fake-rcon disabled; removing installed files"
    remove_fake_rcon_component
  fi

  if ! is_enabled "$WEAPONPAINTS_ENABLED"; then
    log "WeaponPaints disabled; removing installed files"
    remove_weaponpaints_component
  fi

  if (( NEED_MENU_STACK != 1 )); then
    log "Shared CounterStrikeSharp menu dependencies not required; removing installed files"
    remove_menu_stack_components
  fi

  if ! is_enabled "$SIMPLEADMIN_ENABLED"; then
    log "CS2-SimpleAdmin disabled; removing installed files"
    remove_simpleadmin_component
  fi

  if ! is_enabled "$FORTNITE_EMOTES_ENABLED"; then
    log "FortniteEmotesNDances disabled; removing installed files"
    remove_fortnite_emotes_component
  fi

  if ! is_enabled "$EXECUTES_ENABLED"; then
    log "cs2-executes disabled; removing installed files"
    remove_executes_component
  fi

  log "Resolving Metamod release: $METAMOD_VERSION"
  local METAMOD_TAG METAMOD_URL
  mapfile -t _metamod_release < <(resolve_metamod_release "$METAMOD_VERSION")
  METAMOD_TAG="${_metamod_release[0]:-}"
  METAMOD_URL="${_metamod_release[1]:-}"
  unset _metamod_release
  [[ -n "${METAMOD_TAG:-}" && -n "${METAMOD_URL:-}" ]] || fail "Could not resolve Metamod linux asset"
  log "Metamod resolved to tag '$METAMOD_TAG'"

  log "Resolving MatchZy release: $MATCHZY_VERSION"
  local matchzy_json
  matchzy_json="$(get_release_json shobhit-pathak/MatchZy "$MATCHZY_VERSION")" \
    || fail "Unable to resolve MatchZy release for '$MATCHZY_VERSION'"
  local MATCHZY_TAG MATCHZY_URL
  MATCHZY_TAG="$(extract_tag_name "$matchzy_json")"
  MATCHZY_URL="$(extract_asset_url "$matchzy_json" 'with-cssharp.*linux.*\.(zip|tar\.gz)$')"
  if [[ -z "${MATCHZY_URL:-}" ]]; then
    MATCHZY_URL="$(extract_asset_url "$matchzy_json" 'linux.*\.(zip|tar\.gz)$')"
  fi
  [[ -n "${MATCHZY_TAG:-}" && -n "${MATCHZY_URL:-}" ]] \
    || fail "Could not resolve MatchZy linux asset"
  log "MatchZy resolved to tag '$MATCHZY_TAG'"

  local COUNTERSTRIKESHARP_TAG=""
  local COUNTERSTRIKESHARP_URL=""
  log "Resolving CounterStrikeSharp release: $COUNTERSTRIKESHARP_VERSION"
  mapfile -t _counterstrikesharp_release < <(
    resolve_github_release_asset \
      "roflmuffin/CounterStrikeSharp" \
      "$COUNTERSTRIKESHARP_VERSION" \
      'counterstrikesharp-with-runtime-linux-.*\.zip$' \
      'CounterStrikeSharp'
  )
  COUNTERSTRIKESHARP_TAG="${_counterstrikesharp_release[0]:-}"
  COUNTERSTRIKESHARP_URL="${_counterstrikesharp_release[1]:-}"
  unset _counterstrikesharp_release
  [[ -n "${COUNTERSTRIKESHARP_TAG:-}" && -n "${COUNTERSTRIKESHARP_URL:-}" ]] \
    || fail "Could not resolve CounterStrikeSharp linux asset"
  log "CounterStrikeSharp resolved to tag '$COUNTERSTRIKESHARP_TAG'"

  local FAKE_RCON_TAG=""
  local FAKE_RCON_URL=""
  if is_enabled "$FAKE_RCON_ENABLED"; then
    log "Resolving cs2-fake-rcon release: $FAKE_RCON_VERSION"
    mapfile -t _fake_rcon_release < <(
      resolve_github_release_asset \
        "Salvatore-Als/cs2-fake-rcon" \
        "$FAKE_RCON_VERSION" \
        'linux\.tar\.gz$' \
        'cs2-fake-rcon'
    )
    FAKE_RCON_TAG="${_fake_rcon_release[0]:-}"
    FAKE_RCON_URL="${_fake_rcon_release[1]:-}"
    unset _fake_rcon_release
    [[ -n "${FAKE_RCON_TAG:-}" && -n "${FAKE_RCON_URL:-}" ]] \
      || fail "Could not resolve cs2-fake-rcon linux asset"
    log "cs2-fake-rcon resolved to tag '$FAKE_RCON_TAG'"
  else
    log "cs2-fake-rcon installation disabled"
  fi

  local WEAPONPAINTS_TAG=""
  local WEAPONPAINTS_URL=""
  if is_enabled "$WEAPONPAINTS_ENABLED"; then
    log "Resolving WeaponPaints release: $WEAPONPAINTS_VERSION"
    mapfile -t _weaponpaints_release < <(
      resolve_github_release_asset \
        "Nereziel/cs2-WeaponPaints" \
        "$WEAPONPAINTS_VERSION" \
        'WeaponPaints\.zip$' \
        'WeaponPaints'
    )
    WEAPONPAINTS_TAG="${_weaponpaints_release[0]:-}"
    WEAPONPAINTS_URL="${_weaponpaints_release[1]:-}"
    unset _weaponpaints_release
    [[ -n "${WEAPONPAINTS_TAG:-}" && -n "${WEAPONPAINTS_URL:-}" ]] \
      || fail "Could not resolve WeaponPaints asset"
    log "WeaponPaints resolved to tag '$WEAPONPAINTS_TAG'"
  else
    log "WeaponPaints installation disabled"
  fi

  local PLAYERSETTINGS_TAG=""
  local PLAYERSETTINGS_URL=""
  local ANYBASELIB_TAG=""
  local ANYBASELIB_URL=""
  local MENUMANAGER_TAG=""
  local MENUMANAGER_URL=""
  local SIMPLEADMIN_TAG=""
  local SIMPLEADMIN_URL=""
  if (( NEED_MENU_STACK == 1 )); then
    log "Resolving shared CounterStrikeSharp menu dependencies"
    mapfile -t _playersettings_release < <(
      resolve_github_release_asset \
        "NickFox007/PlayerSettingsCS2" \
        "$PLAYERSETTINGS_VERSION" \
        'PlayerSettings\.zip$' \
        'PlayerSettingsCS2'
    )
    PLAYERSETTINGS_TAG="${_playersettings_release[0]:-}"
    PLAYERSETTINGS_URL="${_playersettings_release[1]:-}"
    unset _playersettings_release
    [[ -n "${PLAYERSETTINGS_TAG:-}" && -n "${PLAYERSETTINGS_URL:-}" ]] \
      || fail "Could not resolve PlayerSettingsCS2 asset"

    mapfile -t _anybaselib_release < <(
      resolve_github_release_asset \
        "NickFox007/AnyBaseLibCS2" \
        "$ANYBASELIB_VERSION" \
        'AnyBaseLib\.zip$' \
        'AnyBaseLibCS2'
    )
    ANYBASELIB_TAG="${_anybaselib_release[0]:-}"
    ANYBASELIB_URL="${_anybaselib_release[1]:-}"
    unset _anybaselib_release
    [[ -n "${ANYBASELIB_TAG:-}" && -n "${ANYBASELIB_URL:-}" ]] \
      || fail "Could not resolve AnyBaseLibCS2 asset"

    mapfile -t _menumanager_release < <(
      resolve_github_release_asset \
        "NickFox007/MenuManagerCS2" \
        "$MENUMANAGER_VERSION" \
        'MenuManager\.zip$' \
        'MenuManagerCS2'
    )
    MENUMANAGER_TAG="${_menumanager_release[0]:-}"
    MENUMANAGER_URL="${_menumanager_release[1]:-}"
    unset _menumanager_release
    [[ -n "${MENUMANAGER_TAG:-}" && -n "${MENUMANAGER_URL:-}" ]] \
      || fail "Could not resolve MenuManagerCS2 asset"
  else
    log "Shared CounterStrikeSharp menu dependencies not needed"
  fi

  if is_enabled "$SIMPLEADMIN_ENABLED"; then
    log "Resolving CS2-SimpleAdmin release: $SIMPLEADMIN_VERSION"
    mapfile -t _simpleadmin_release < <(
      resolve_github_release_asset \
        "daffyyyy/CS2-SimpleAdmin" \
        "$SIMPLEADMIN_VERSION" \
        'CS2-SimpleAdmin-.*\.zip$' \
        'CS2-SimpleAdmin'
    )
    SIMPLEADMIN_TAG="${_simpleadmin_release[0]:-}"
    SIMPLEADMIN_URL="${_simpleadmin_release[1]:-}"
    unset _simpleadmin_release
    [[ -n "${SIMPLEADMIN_TAG:-}" && -n "${SIMPLEADMIN_URL:-}" ]] \
      || fail "Could not resolve CS2-SimpleAdmin asset"
    log "CS2-SimpleAdmin resolved to tag '$SIMPLEADMIN_TAG'"
  else
    log "CS2-SimpleAdmin installation disabled"
  fi

  local MULTIADDONMANAGER_TAG=""
  local MULTIADDONMANAGER_URL=""
  local RAYTRACE_TAG=""
  local RAYTRACE_URL=""
  local FORTNITE_EMOTES_TAG=""
  local FORTNITE_EMOTES_URL=""
  if is_enabled "$FORTNITE_EMOTES_ENABLED"; then
    log "Resolving FortniteEmotesNDances dependencies"
    mapfile -t _multiaddonmanager_release < <(
      resolve_github_release_asset \
        "Source2ZE/MultiAddonManager" \
        "$MULTIADDONMANAGER_VERSION" \
        'linux\.tar\.gz$' \
        'MultiAddonManager'
    )
    MULTIADDONMANAGER_TAG="${_multiaddonmanager_release[0]:-}"
    MULTIADDONMANAGER_URL="${_multiaddonmanager_release[1]:-}"
    unset _multiaddonmanager_release
    [[ -n "${MULTIADDONMANAGER_TAG:-}" && -n "${MULTIADDONMANAGER_URL:-}" ]] \
      || fail "Could not resolve MultiAddonManager linux asset"

    mapfile -t _raytrace_release < <(
      resolve_github_release_asset \
        "FUNPLAY-pro-CS2/Ray-Trace" \
        "$RAYTRACE_VERSION" \
        'RayTrace-MM-.*linux\.tar\.gz$' \
        'Ray-Trace Metamod'
    )
    RAYTRACE_TAG="${_raytrace_release[0]:-}"
    RAYTRACE_URL="${_raytrace_release[1]:-}"
    unset _raytrace_release
    [[ -n "${RAYTRACE_TAG:-}" && -n "${RAYTRACE_URL:-}" ]] \
      || fail "Could not resolve Ray-Trace Metamod linux asset"

    log "Resolving FortniteEmotesNDances release: $FORTNITE_EMOTES_VERSION"
    mapfile -t _fortnite_release < <(
      resolve_github_release_asset \
        "Cruze03/FortniteEmotesNDances" \
        "$FORTNITE_EMOTES_VERSION" \
        'FortniteEmotesNDances_.*\.zip$' \
        'FortniteEmotesNDances'
    )
    FORTNITE_EMOTES_TAG="${_fortnite_release[0]:-}"
    FORTNITE_EMOTES_URL="${_fortnite_release[1]:-}"
    unset _fortnite_release
    [[ -n "${FORTNITE_EMOTES_TAG:-}" && -n "${FORTNITE_EMOTES_URL:-}" ]] \
      || fail "Could not resolve FortniteEmotesNDances asset"
    log "FortniteEmotesNDances resolved to tag '$FORTNITE_EMOTES_TAG'"
  else
    log "FortniteEmotesNDances installation disabled"
  fi

  local EXECUTES_TAG=""
  local EXECUTES_URL=""
  if is_enabled "$EXECUTES_ENABLED"; then
    log "Resolving cs2-executes release: $EXECUTES_VERSION"
    mapfile -t _executes_release < <(
      resolve_github_release_asset \
        "zwolof/cs2-executes" \
        "$EXECUTES_VERSION" \
        'cs2-executes-.*\.zip$' \
        'cs2-executes'
    )
    EXECUTES_TAG="${_executes_release[0]:-}"
    EXECUTES_URL="${_executes_release[1]:-}"
    unset _executes_release
    [[ -n "${EXECUTES_TAG:-}" && -n "${EXECUTES_URL:-}" ]] \
      || fail "Could not resolve cs2-executes asset"
    log "cs2-executes resolved to tag '$EXECUTES_TAG'"
  else
    log "cs2-executes installation disabled"
  fi

  local INSTALLED_METAMOD_TAG
  local INSTALLED_MATCHZY_TAG
  local INSTALLED_COUNTERSTRIKESHARP_TAG
  local INSTALLED_FAKE_RCON_TAG
  local INSTALLED_WEAPONPAINTS_TAG
  local INSTALLED_PLAYERSETTINGS_TAG
  local INSTALLED_ANYBASELIB_TAG
  local INSTALLED_MENUMANAGER_TAG
  local INSTALLED_SIMPLEADMIN_TAG
  local INSTALLED_MULTIADDONMANAGER_TAG
  local INSTALLED_RAYTRACE_TAG
  local INSTALLED_FORTNITE_EMOTES_TAG
  local INSTALLED_EXECUTES_TAG

  INSTALLED_METAMOD_TAG="$(read_state_value METAMOD_TAG)"
  INSTALLED_MATCHZY_TAG="$(read_state_value MATCHZY_TAG)"
  INSTALLED_COUNTERSTRIKESHARP_TAG="$(read_state_value COUNTERSTRIKESHARP_TAG)"
  INSTALLED_FAKE_RCON_TAG="$(read_state_value FAKE_RCON_TAG)"
  INSTALLED_WEAPONPAINTS_TAG="$(read_state_value WEAPONPAINTS_TAG)"
  INSTALLED_PLAYERSETTINGS_TAG="$(read_state_value PLAYERSETTINGS_TAG)"
  INSTALLED_ANYBASELIB_TAG="$(read_state_value ANYBASELIB_TAG)"
  INSTALLED_MENUMANAGER_TAG="$(read_state_value MENUMANAGER_TAG)"
  INSTALLED_SIMPLEADMIN_TAG="$(read_state_value SIMPLEADMIN_TAG)"
  INSTALLED_MULTIADDONMANAGER_TAG="$(read_state_value MULTIADDONMANAGER_TAG)"
  INSTALLED_RAYTRACE_TAG="$(read_state_value RAYTRACE_TAG)"
  INSTALLED_FORTNITE_EMOTES_TAG="$(read_state_value FORTNITE_EMOTES_TAG)"
  INSTALLED_EXECUTES_TAG="$(read_state_value EXECUTES_TAG)"

  local metamod_marker="$GAME_DIR/addons/metamod"
  local matchzy_marker="$CSS_DIR/plugins/MatchZy"
  local css_marker="$CSS_DIR/api/CounterStrikeSharp.API.dll"
  local installed_css_api_version=""
  local expected_css_api_version="${COUNTERSTRIKESHARP_TAG#v}"
  local fake_rcon_marker="$ADDONS_DIR/fake_rcon/bin/linuxsteamrt64/fake_rcon.so"
  local weaponpaints_marker="$CSS_DIR/plugins/WeaponPaints/WeaponPaints.dll"
  local weaponpaints_gamedata_src="$CSS_DIR/plugins/WeaponPaints/gamedata/weaponpaints.json"
  local weaponpaints_gamedata_dst="$CSS_DIR/gamedata/weaponpaints.json"
  local playersettings_marker="$CSS_DIR/plugins/PlayerSettings/PlayerSettings.dll"
  local anybaselib_marker="$CSS_DIR/shared/AnyBaseLib/AnyBaseLib.dll"
  local menumanager_marker="$CSS_DIR/plugins/MenuManagerCore/MenuManagerCore.dll"
  local simpleadmin_marker="$CSS_DIR/plugins/CS2-SimpleAdmin/CS2-SimpleAdmin.dll"
  local multiaddonmanager_marker="$ADDONS_DIR/multiaddonmanager/bin/multiaddonmanager.so"
  local multiaddonmanager_cfg="$GAME_DIR/cfg/multiaddonmanager/multiaddonmanager.cfg"
  local raytrace_marker="$ADDONS_DIR/RayTrace/bin/linuxsteamrt64/RayTrace.so"
  local fortnite_emotes_marker="$CSS_DIR/plugins/FortniteEmotesNDances/FortniteEmotesNDances.dll"
  local executes_marker="$CSS_DIR/plugins/ExecutesPlugin/ExecutesPlugin.dll"
  local css_core_config="$CSS_DIR/configs/core.json"
  local matchzy_admins_file="$GAME_DIR/cfg/MatchZy/admins.json"
  local matchzy_config_file="$GAME_DIR/cfg/MatchZy/config.cfg"
  local css_admins_file="$CSS_DIR/configs/admins.json"

  if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_METAMOD_TAG" != "$METAMOD_TAG" || ! -d "$metamod_marker" ]]; then
    log "Installing or updating Metamod"
    install_archive_component "metamod" "$METAMOD_URL" "$GAME_DIR" "$metamod_marker"
  else
    log "Metamod already current; skipping"
  fi

  if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_MATCHZY_TAG" != "$MATCHZY_TAG" || ! -d "$matchzy_marker" ]]; then
    log "Installing or updating MatchZy"
    install_archive_component "matchzy" "$MATCHZY_URL" "$GAME_DIR" "$matchzy_marker" "csgo"
  else
    log "MatchZy already current; skipping"
  fi

  installed_css_api_version="$(read_css_api_version "$css_marker")"
  if [[ "$MOD_REINSTALL" == "1" \
    || "$INSTALLED_COUNTERSTRIKESHARP_TAG" != "$COUNTERSTRIKESHARP_TAG" \
    || ! -f "$css_marker" \
    || -d "$ADDONS_DIR/addons/counterstrikesharp" \
    || "$installed_css_api_version" != "$expected_css_api_version" ]]; then
    log "Installing or updating CounterStrikeSharp"
    install_archive_component "counterstrikesharp" "$COUNTERSTRIKESHARP_URL" "$GAME_DIR" "$css_marker"
  else
    log "CounterStrikeSharp already current; skipping"
  fi

  patch_gameinfo_for_metamod "$GAMEINFO_FILE"

  write_matchzy_admins_file "$ADMINS" "$matchzy_admins_file"
  write_matchzy_config_file "$MATCHZY_SMOKE_COLOR" "$matchzy_config_file"
  write_css_admins_file "$ADMINS" "$css_admins_file"

  if is_enabled "$FAKE_RCON_ENABLED"; then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_FAKE_RCON_TAG" != "$FAKE_RCON_TAG" || ! -f "$fake_rcon_marker" ]]; then
      log "Installing or updating cs2-fake-rcon"
      install_archive_component "fake-rcon" "$FAKE_RCON_URL" "$GAME_DIR" "$fake_rcon_marker"
    else
      log "cs2-fake-rcon already current; skipping"
    fi
  fi

  if (( NEED_MENU_STACK == 1 )); then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_ANYBASELIB_TAG" != "$ANYBASELIB_TAG" || ! -f "$anybaselib_marker" ]]; then
      log "Installing or updating AnyBaseLibCS2"
      install_archive_component "anybaselib" "$ANYBASELIB_URL" "$GAME_DIR" "$anybaselib_marker"
    else
      log "AnyBaseLibCS2 already current; skipping"
    fi

    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_PLAYERSETTINGS_TAG" != "$PLAYERSETTINGS_TAG" || ! -f "$playersettings_marker" ]]; then
      log "Installing or updating PlayerSettingsCS2"
      install_archive_component "playersettings" "$PLAYERSETTINGS_URL" "$GAME_DIR" "$playersettings_marker"
    else
      log "PlayerSettingsCS2 already current; skipping"
    fi

    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_MENUMANAGER_TAG" != "$MENUMANAGER_TAG" || ! -f "$menumanager_marker" ]]; then
      log "Installing or updating MenuManagerCS2"
      install_archive_component "menumanager" "$MENUMANAGER_URL" "$GAME_DIR" "$menumanager_marker"
    else
      log "MenuManagerCS2 already current; skipping"
    fi
  fi

  if is_enabled "$WEAPONPAINTS_ENABLED"; then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_WEAPONPAINTS_TAG" != "$WEAPONPAINTS_TAG" || ! -f "$weaponpaints_marker" ]]; then
      log "Installing or updating WeaponPaints"
      install_archive_component "weaponpaints" "$WEAPONPAINTS_URL" "$CSS_DIR/plugins" "$weaponpaints_marker"
    else
      log "WeaponPaints already current; skipping"
    fi

    mkdir -p "$CSS_DIR/gamedata"
    if [[ -f "$weaponpaints_gamedata_src" ]]; then
      cp -f "$weaponpaints_gamedata_src" "$weaponpaints_gamedata_dst"
      log "Installed WeaponPaints gamedata"
    else
      fail "WeaponPaints gamedata file not found at $weaponpaints_gamedata_src"
    fi
    patch_css_core_follow_guidelines "$css_core_config"
  fi

  if is_enabled "$SIMPLEADMIN_ENABLED"; then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_SIMPLEADMIN_TAG" != "$SIMPLEADMIN_TAG" || ! -f "$simpleadmin_marker" ]]; then
      log "Installing or updating CS2-SimpleAdmin"
      install_archive_component "simpleadmin" "$SIMPLEADMIN_URL" "$ADDONS_DIR" "$simpleadmin_marker"
    else
      log "CS2-SimpleAdmin already current; skipping"
    fi
  fi

  if is_enabled "$FORTNITE_EMOTES_ENABLED"; then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_MULTIADDONMANAGER_TAG" != "$MULTIADDONMANAGER_TAG" || ! -f "$multiaddonmanager_marker" ]]; then
      log "Installing or updating MultiAddonManager"
      install_archive_component "multiaddonmanager" "$MULTIADDONMANAGER_URL" "$GAME_DIR" "$multiaddonmanager_marker"
    else
      log "MultiAddonManager already current; skipping"
    fi

    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_RAYTRACE_TAG" != "$RAYTRACE_TAG" || ! -f "$raytrace_marker" ]]; then
      log "Installing or updating Ray-Trace"
      install_archive_component "raytrace" "$RAYTRACE_URL" "$ADDONS_DIR" "$raytrace_marker"
    else
      log "Ray-Trace already current; skipping"
    fi

    ensure_multiaddonmanager_addon "$multiaddonmanager_cfg" "$FORTNITE_EMOTES_WORKSHOP_ADDON_ID"

    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_FORTNITE_EMOTES_TAG" != "$FORTNITE_EMOTES_TAG" || ! -f "$fortnite_emotes_marker" ]]; then
      log "Installing or updating FortniteEmotesNDances"
      install_fortnite_emotes_component "$FORTNITE_EMOTES_URL" "$fortnite_emotes_marker"
    else
      log "FortniteEmotesNDances already current; skipping"
    fi
  fi

  if is_enabled "$EXECUTES_ENABLED"; then
    if [[ "$MOD_REINSTALL" == "1" || "$INSTALLED_EXECUTES_TAG" != "$EXECUTES_TAG" || ! -f "$executes_marker" ]]; then
      log "Installing or updating cs2-executes"
      install_archive_component "executes" "$EXECUTES_URL" "$CSS_DIR/plugins" "$executes_marker"
    else
      log "cs2-executes already current; skipping"
    fi
  fi

  cat > "$STATE_FILE" <<EOF
METAMOD_TAG=$METAMOD_TAG
MATCHZY_TAG=$MATCHZY_TAG
COUNTERSTRIKESHARP_TAG=$COUNTERSTRIKESHARP_TAG
FAKE_RCON_TAG=$FAKE_RCON_TAG
WEAPONPAINTS_TAG=$WEAPONPAINTS_TAG
PLAYERSETTINGS_TAG=$PLAYERSETTINGS_TAG
ANYBASELIB_TAG=$ANYBASELIB_TAG
MENUMANAGER_TAG=$MENUMANAGER_TAG
SIMPLEADMIN_TAG=$SIMPLEADMIN_TAG
MULTIADDONMANAGER_TAG=$MULTIADDONMANAGER_TAG
RAYTRACE_TAG=$RAYTRACE_TAG
FORTNITE_EMOTES_TAG=$FORTNITE_EMOTES_TAG
EXECUTES_TAG=$EXECUTES_TAG
EOF
  log "Stored install state in $STATE_FILE"
  log "Mod bootstrap complete"
)

if _matchzy_bootstrap_main; then
  printf '[pre.sh] %s\n' "Hook finished successfully"
else
  _rc=$?
  printf '[pre.sh] %s\n' "Hook failed with exit code $_rc; continuing container startup" >&2
  unset _rc
fi

unset -f _matchzy_bootstrap_main
