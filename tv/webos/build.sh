#!/usr/bin/env bash
# Builds Lilin's LG (webOS) TV app, and with --install puts it on a TV in Developer Mode and starts it.
#   LILIN_URL=http://192.168.1.10:8080 bash tv/webos/build.sh                    # just tv/webos/dist/Lilin.ipk
#   LILIN_URL=... TV=192.168.1.40 bash tv/webos/build.sh --install               # build, pair, install, start
#
# Settings (environment, or tv/webos/.env):
#   LILIN_URL     where the TV reaches Lilin (required), e.g. http://192.168.1.10:8080 or https://lilin.example.com/c/tv
#   TV            the TV's address (for --install)
#   WEBOS_DEVICE  the name the webOS CLI keeps the TV under (default: lilin-tv)
#
# Needs the webOS CLI (npm install -g @webos-tools/cli). The first install asks for the passphrase the TV's
# Developer Mode app shows (Key Server on).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
install=0
[ "${1:-}" = "--install" ] && install=1
if [ -f "$here/.env" ]; then set -a; . "$here/.env"; set +a; fi

: "${LILIN_URL:?Set LILIN_URL to where the TV reaches Lilin, e.g. http://192.168.1.10:8080}"
server="${LILIN_URL%/}"
case "$server" in http://*|https://*) ;; *) echo "LILIN_URL must start with http:// or https://" >&2; exit 2 ;; esac
for c in ares-package ares-install ares-launch ares-setup-device ares-novacom; do
  command -v "$c" >/dev/null || { echo "webOS CLI not found. Install it: npm install -g @webos-tools/cli" >&2; exit 1; }
done

version="$(sed -n 's/.*"version": *"\([0-9.]*\)".*/\1/p' "$here/../../package.json" | head -1)"
build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT
mkdir "$build/app" "$build/out"
sed -e "s#@VERSION@#${version:-1.0.0}#" "$here/appinfo.json.in" > "$build/app/appinfo.json"
cp "$here/index.html" "$here/shell.js" "$build/app/"
icon="$here/../../public/maskable-512.png"
if command -v magick >/dev/null; then
  magick "$icon" -resize 80x80 "$build/app/icon.png"
  magick "$icon" -resize 130x130 "$build/app/largeIcon.png"
else
  cp "$icon" "$build/app/icon.png"
  cp "$icon" "$build/app/largeIcon.png"
fi
printf 'window.LILIN_SERVER = %s;\n' "\"${server//\"/}\"" > "$build/app/config.js"

ares-package --no-minify -o "$build/out" "$build/app" >/dev/null
mkdir -p "$here/dist"
mv "$build"/out/*.ipk "$here/dist/Lilin.ipk"
echo "Built $here/dist/Lilin.ipk for $server"

if [ "$install" = 1 ]; then
  : "${TV:?Set TV to the address of the TV to install}"
  device="${WEBOS_DEVICE:-lilin-tv}"
  ares-setup-device --remove "$device" >/dev/null 2>&1 || true
  ares-setup-device --add "$device" --info "{'host':'$TV','port':'9922','username':'prisoner'}" >/dev/null
  # The key from the TV's Key Server; it asks for the passphrase the Developer Mode app shows.
  ares-novacom --device "$device" --getkey
  ares-install --device "$device" "$here/dist/Lilin.ipk"
  ares-launch --device "$device" app.lilin.tv
fi
