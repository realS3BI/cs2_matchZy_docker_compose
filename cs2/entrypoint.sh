#!/usr/bin/env bash
set -euo pipefail

steamappdir="${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
runtime_pre_hook="$steamappdir/pre.sh"
runtime_post_hook="$steamappdir/post.sh"

mkdir -p "$steamappdir"

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
