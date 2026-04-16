#!/bin/sh
set -eu

if [ -z "${G5V_API_URL:-}" ]; then
  echo "[g5v] G5V_API_URL not set; keeping bundled /api fallback"
  exit 0
fi

escaped_url=$(printf '%s' "$G5V_API_URL" | sed 's/[#\/&]/\\&/g')
patched=0

for file in /usr/share/nginx/html/js/*.js; do
  [ -f "$file" ] || continue

  if grep -Fq 'VUE_APP_G5V_API_URL||"/api"' "$file"; then
    sed -i "s#VUE_APP_G5V_API_URL||\"/api\"#VUE_APP_G5V_API_URL||\"$escaped_url\"#g" "$file"
    patched=1
  fi
done

if [ "$patched" -eq 1 ]; then
  echo "[g5v] Patched frontend API URL fallback to $G5V_API_URL"
else
  echo "[g5v] WARNING: No frontend bundle pattern matched; API URL fallback unchanged"
fi
