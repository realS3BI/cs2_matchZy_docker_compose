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

  need_cmd awk
  need_cmd grep
  need_cmd sed
  need_cmd tar
  need_cmd mktemp

  local STEAMAPPDIR="${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
  local GAME_DIR="$STEAMAPPDIR/game/csgo"
  local GAMEINFO_FILE="$GAME_DIR/gameinfo.gi"

  local METAMOD_VERSION="${METAMOD_VERSION:-latest}"
  local MATCHZY_VERSION="${MATCHZY_VERSION:-latest}"
  local MOD_REINSTALL="${MOD_REINSTALL:-0}"

  local STATE_DIR="$STEAMAPPDIR/.mod-installer"
  local STATE_FILE="$STATE_DIR/state.env"
  mkdir -p "$STATE_DIR"

  [[ -d "$GAME_DIR" ]] || fail "Game directory not found: $GAME_DIR"

  log "Resolving Metamod release: $METAMOD_VERSION"
  local metamod_json
  metamod_json="$(get_release_json alliedmodders/metamod-source "$METAMOD_VERSION")" \
    || fail "Unable to resolve Metamod release for '$METAMOD_VERSION'"
  local METAMOD_TAG METAMOD_URL
  METAMOD_TAG="$(extract_tag_name "$metamod_json")"
  METAMOD_URL="$(extract_asset_url "$metamod_json" 'linux\.tar\.gz$')"
  [[ -n "${METAMOD_TAG:-}" && -n "${METAMOD_URL:-}" ]] \
    || fail "Could not resolve Metamod linux asset"
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

  local INSTALLED_METAMOD_TAG=""
  local INSTALLED_MATCHZY_TAG=""
  if [[ -f "$STATE_FILE" ]]; then
    INSTALLED_METAMOD_TAG="$(grep -E '^METAMOD_TAG=' "$STATE_FILE" | head -n1 | cut -d= -f2- || true)"
    INSTALLED_MATCHZY_TAG="$(grep -E '^MATCHZY_TAG=' "$STATE_FILE" | head -n1 | cut -d= -f2- || true)"
  fi

  local metamod_marker="$GAME_DIR/addons/metamod"
  local matchzy_marker="$GAME_DIR/addons/counterstrikesharp/plugins/MatchZy"

  local reinstall_reason=""
  if [[ "$MOD_REINSTALL" == "1" ]]; then
    reinstall_reason="MOD_REINSTALL=1"
  elif [[ "$INSTALLED_METAMOD_TAG" != "$METAMOD_TAG" ]]; then
    reinstall_reason="Metamod version changed ($INSTALLED_METAMOD_TAG -> $METAMOD_TAG)"
  elif [[ "$INSTALLED_MATCHZY_TAG" != "$MATCHZY_TAG" ]]; then
    reinstall_reason="MatchZy version changed ($INSTALLED_MATCHZY_TAG -> $MATCHZY_TAG)"
  elif [[ ! -d "$metamod_marker" || ! -d "$matchzy_marker" ]]; then
    reinstall_reason="Mod files missing on disk"
  fi

  if [[ -n "$reinstall_reason" ]]; then
    log "Installing or updating mods: $reinstall_reason"

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    local metamod_archive matchzy_archive
    metamod_archive="$tmp_dir/$(basename "${METAMOD_URL%%\?*}")"
    matchzy_archive="$tmp_dir/$(basename "${MATCHZY_URL%%\?*}")"

    log "Downloading Metamod asset"
    http_get "$METAMOD_URL" "$metamod_archive"
    log "Extracting Metamod into $GAME_DIR"
    extract_archive "$metamod_archive" "$GAME_DIR"
    normalize_csgo_layout "$GAME_DIR"

    log "Downloading MatchZy asset"
    http_get "$MATCHZY_URL" "$matchzy_archive"
    log "Extracting MatchZy into $GAME_DIR"
    extract_archive "$matchzy_archive" "$GAME_DIR"
    normalize_csgo_layout "$GAME_DIR"

    cat > "$STATE_FILE" <<EOF
METAMOD_TAG=$METAMOD_TAG
MATCHZY_TAG=$MATCHZY_TAG
EOF
    log "Stored install state in $STATE_FILE"
  else
    log "Installed versions already current; skipping archive extraction"
  fi

  patch_gameinfo_for_metamod "$GAMEINFO_FILE"
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
