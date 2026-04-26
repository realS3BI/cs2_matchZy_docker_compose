#!/usr/bin/env bash
set -euo pipefail

steamappdir="${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
runtime_pre_hook="$steamappdir/pre.sh"
runtime_post_hook="$steamappdir/post.sh"
runtime_env_file="${CS2_RUNTIME_ENV_FILE:-/config-runtime/settings.env}"

load_runtime_env_file() {
  local file="$1"
  local line=""
  local key=""
  local value=""

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -n "$line" ]] || continue
    [[ "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    if [[ "$value" == '"'*'"' ]]; then
      value="${value#\"}"
      value="${value%\"}"
      value="${value//\\\"/\"}"
      value="${value//\\\\/\\}"
    elif [[ "$value" == "'"*"'" ]]; then
      value="${value#\'}"
      value="${value%\'}"
    fi

    export "$key=$value"
  done < "$file"
}

mkdir -p "$steamappdir"
load_runtime_env_file "$runtime_env_file"

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
