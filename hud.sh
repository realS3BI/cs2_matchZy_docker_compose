#!/usr/bin/env bash
set -euo pipefail

mode="${1:-update}"
if [[ $# -gt 0 ]]; then shift; fi
case "$mode" in
  update|release|live|status) ;;
  -h|--help)
    printf '%s\n' 'Auf Windows in Git Bash: ./hud.sh [update|release|live|status]' \
      'Ohne Argument: Git aktualisieren, Panorama-Panel installieren sowie Playbook bauen und öffnen.'
    exit 0
    ;;
  *) printf 'Unbekannter Modus: %s\n' "$mode" >&2; exit 2 ;;
esac

case "$(uname -s)" in
  MINGW*|MSYS*) ;;
  *)
    printf '%s\n' 'Dieses Skript läuft auf Windows in Git Bash. Auf dem Mac entwickeln, auf Windows im Projektordner starten.' >&2
    exit 1
    ;;
esac

if pwsh_path="$(command -v pwsh.exe || command -v pwsh)"; then
  :
elif [[ -f '/c/Program Files/PowerShell/7/pwsh.exe' ]]; then
  pwsh_path='/c/Program Files/PowerShell/7/pwsh.exe'
else
  printf '%s\n' 'PowerShell 7 fehlt. In Windows PowerShell: winget install --id Microsoft.PowerShell --source winget' \
    'Danach Git Bash neu öffnen und das Skript erneut starten.' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
script_path="$(cygpath -w "$script_dir/training-hud/update-local.ps1")"
export MSYS_NO_PATHCONV=1
# Mintty needs a Windows console for SteamCMD's interactive login.
if [[ -t 0 && -t 1 ]] && command -v winpty >/dev/null 2>&1; then
  exec winpty "$(cygpath -w "$pwsh_path")" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$script_path" -Mode "$mode" "$@"
fi
exec "$pwsh_path" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$script_path" -Mode "$mode" "$@"
