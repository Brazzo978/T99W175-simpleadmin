#!/bin/bash
# Install SimpleAdmin on a Foxconn T99W175 over SSH: web UI, diag_bridge,
# curl, jq, modem_config, the system scripts/units and the persistent MAC
# fix, in one go.
# Safe to run again: every step is idempotent.
#
#   ./install.sh [HOST] [--nologin] [--noesim] [--login] [--esim]
#
#   HOST        modem address (default 192.168.225.1), reached as root
#   --nologin   set SIMPLEADMIN_ENABLE_LOGIN=0   (--login sets it to 1)
#   --noesim    set SIMPLEADMIN_ENABLE_ESIM=0    (--esim sets it to 1)
#
# Without flags the modem keeps its current simpleadmin.conf values and
# credentials.txt. The target is checked first, without touching the AT
# channel (hostname sdxprairie, SDX55 SoC, Foxconn firmware tools,
# /WEBSERVER): anything else is refused.
#
# Everything that goes on the modem lives in deploy/, one folder per module;
# deploy/install-modem.sh is the modem side. deploy/diag_bridge/bin/diag_bridge
# is a gitignored symlink into a T99W175-diag-json-bridge checkout next to this
# repository (see deploy/diag_bridge/README.md); without it the install goes
# on and the modem keeps (or drops) the bridge it has. system_bridge is built
# here by deploy/system_bridge/build.sh.
set -euo pipefail

cd "$(dirname "$0")"

# ---------------------------------------------------------------- output
if [ -t 1 ]; then
  C_0=$'\033[0m' C_B=$'\033[1;36m' C_G=$'\033[32m' C_Y=$'\033[1;33m'
  C_R=$'\033[1;31m' C_D=$'\033[2m' C_W=$'\033[1m'
  SA_COLOR=1
else
  C_0='' C_B='' C_G='' C_Y='' C_R='' C_D='' C_W=''
  SA_COLOR=0
fi
section() { echo; echo "${C_B}━━━ $* ━━━${C_0}"; }
ok() { echo "  ${C_G}✅ $*${C_0}"; }
info() { echo "  ${C_D}·  $*${C_0}"; }
warn() { echo "  ${C_Y}⚠️  $*${C_0}"; }
die() { echo "  ${C_R}❌ $*${C_0}"; echo "${C_R}💥 Nothing was installed${C_0}"; exit 1; }

HOST="192.168.225.1"
SA_LOGIN=""
SA_ESIM=""
# Sets a flag once: --login with --nologin (or --esim with --noesim) is an
# error, not "last one wins".
set_flag() {
  local name="$1" value="$2" current="${!1}"
  if [ -n "$current" ] && [ "$current" != "$value" ]; then
    die "conflicting options for ${name#SA_}"
  fi
  printf -v "$name" '%s' "$value"
}
for arg in "$@"; do
  case "$arg" in
    --nologin|--nonlogin) set_flag SA_LOGIN 0 ;;
    --login) set_flag SA_LOGIN 1 ;;
    --noesim) set_flag SA_ESIM 0 ;;
    --esim) set_flag SA_ESIM 1 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $arg (see --help)" ;;
    *) HOST="$arg" ;;
  esac
done
TARGET="root@$HOST"
REMOTE_DIR="/tmp/simpleadmin-install"

echo "${C_W}🚀 SimpleAdmin installer → $TARGET${C_0}"

# ---------------------------------------------------------------- payload
section "📦 Payload"
VERSION="$(sed -n 's/^- Current-Version: `\(.*\)`.*/\1/p' VERSION.md)"
ok "🌐 web UI $VERSION"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R deploy/. "$STAGE/"
printf '%s\n' "$VERSION" > "$STAGE/www/VERSION"
# Documentation stays here; Tailscale is downloaded from GitHub by the UI
# (cgi-bin/tailscale-helper), not pushed.
rm -rf "$STAGE/tailscale"
find "$STAGE" -name '*.md' -delete
info "📚 documentation and the Tailscale payload left out"
# The web UI is built from frontend/ (frontend/build.sh) into the versioned
# deploy/www-app; it joins the classic pages and the CGIs of deploy/www.
if [ -f deploy/www-app/BUILD ]; then
  cp -R "$STAGE/www-app/." "$STAGE/www/"
  rm -f "$STAGE/www/BUILD"
  if [ -n "$(find frontend/app frontend/components frontend/hooks frontend/lib \
      frontend/locales frontend/types -newer deploy/www-app/BUILD -type f | head -1)" ]; then
    warn "🖥️  frontend sources are newer than deploy/www-app: run frontend/build.sh"
  else
    ok "🖥️  web app $(cat deploy/www-app/BUILD)"
  fi
else
  warn "🖥️  deploy/www-app is missing: run frontend/build.sh (classic pages only)"
fi
rm -rf "$STAGE/www-app"
# busybox httpd serves file.gz to browsers that accept gzip: a third of the
# bytes on every page load, less work for the modem's single core.
gz_before=$(find "$STAGE/www" -type f -not -path '*/cgi-bin/*' -not -path '*/config/*' \
  \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.svg' -o -name '*.json' \
     -o -name '*.txt' \) \
  -size +1k -printf '%s\n' | awk '{s+=$1} END {print s+0}')
find "$STAGE/www" -type f -not -path '*/cgi-bin/*' -not -path '*/config/*' \
  \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.svg' -o -name '*.json' \
     -o -name '*.txt' \) \
  -size +1k -exec gzip -9 -n -k {} +
gz_after=$(find "$STAGE/www" -type f -name '*.gz' -printf '%s\n' | awk '{s+=$1} END {print s+0}')
ok "🗜️  text assets precompressed: $((gz_before / 1024)) KB → $((gz_after / 1024)) KB served"

# diag_bridge is a symlink into the T99W175-diag-json-bridge checkout.
link=deploy/diag_bridge/bin/diag_bridge
rm -f "$STAGE/diag_bridge/bin/diag_bridge"
if [ -f "$link" ]; then
  repo="$(cd "$(dirname "$(readlink -f "$link")")" && git rev-parse --show-toplevel 2>/dev/null || dirname "$(readlink -f "$link")")"
  version="$(git -C "$repo" describe --always --dirty --tags 2>/dev/null || echo unknown)"
  cp -L "$link" "$STAGE/diag_bridge/bin/diag_bridge"
  printf '%s\n' "$version" > "$STAGE/diag_bridge/diag_bridge.version"
  ok "📡 diag_bridge $version from $repo"
else
  warn "📡 $link is missing or a dangling link: no diag_bridge in this install"
  info "   clone T99W175-diag-json-bridge next to this repository and run its"
  info "   scripts/publish-to-simpleadmin.sh (deploy/diag_bridge/README.md)"
fi
# system_bridge is built here (deploy/system_bridge/build.sh); the binary is
# versioned, the sources stay on the workstation.
rm -rf "$STAGE/system_bridge/src" "$STAGE/system_bridge/build.sh"
sb=deploy/system_bridge/bin/system_bridge
if [ -f "$sb" ]; then
  version="$(git describe --always --dirty --tags 2>/dev/null || echo unknown)"
  printf '%s\n' "$version" > "$STAGE/system_bridge/system_bridge.version"
  if [ -n "$(find deploy/system_bridge/src -newer "$sb" -type f | head -1)" ]; then
    warn "📡 system_bridge sources are newer than the binary: run deploy/system_bridge/build.sh"
  else
    ok "📡 system_bridge $version"
  fi
else
  warn "📡 $sb is missing: run deploy/system_bridge/build.sh"
fi
for t in curl jq modem-config ttl crontab watchdog euicc persistent-mac dhcp-guard; do
  [ -d "$STAGE/$t" ] || die "module deploy/$t is missing"
done
ok "🧩 modules: curl jq modem-config ttl crontab watchdog euicc persistent-mac dhcp-guard"
[ -n "$SA_LOGIN" ] && ok "🔐 login will be set to $SA_LOGIN" || info "🔐 login setting kept"
[ -n "$SA_ESIM" ] && ok "📶 eSIM will be set to $SA_ESIM" || info "📶 eSIM setting kept"
info "📏 $(du -sh "$STAGE" | cut -f1) to transfer"

# ---------------------------------------------------------------- target
section "🔎 Target"
# Identified without the AT channel, which can be slow or out of step: the
# hostname and SoC of the SDX55, Foxconn's firmware tools and the QCMAP web
# root. The model name itself is only reachable through AT.
ID="$(ssh -o ConnectTimeout=10 "$TARGET" \
  'printf "%s|" "$(uname -n)";
   printf "%s|" "$(cat /sys/devices/soc0/machine 2>/dev/null)";
   [ -x /usr/bin/fxdiag ] && printf "foxconn|" || printf "other|";
   [ -d /WEBSERVER ] && printf "web" || printf "noweb"' 2>/dev/null)" ||
  die "cannot reach $TARGET over SSH"
ok "🔌 SSH to $TARGET"
IFS='|' read -r ID_HOST ID_SOC ID_VENDOR ID_WEB <<< "$ID"
[ "$ID_HOST" = "sdxprairie" ] && ok "🖥️  hostname $ID_HOST" ||
  die "hostname '${ID_HOST:-?}' is not sdxprairie: $HOST is not a T99W175"
[ "$ID_SOC" = "SDXPRAIRIE" ] && ok "🧠 SoC $ID_SOC (SDX55)" ||
  die "SoC '${ID_SOC:-?}' is not SDXPRAIRIE (SDX55)"
[ "$ID_VENDOR" = "foxconn" ] && ok "🏭 Foxconn firmware (fxdiag)" ||
  die "no Foxconn firmware tools (/usr/bin/fxdiag): not a T99W175"
[ "$ID_WEB" = "web" ] && ok "📁 /WEBSERVER present" ||
  die "/WEBSERVER is missing: not a SimpleAdmin-capable firmware"

# ---------------------------------------------------------------- copy
section "🚚 Copy"
tar -C "$STAGE" -cf - . | ssh "$TARGET" \
  "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && tar -C $REMOTE_DIR -xf -" ||
  die "copy to $TARGET:$REMOTE_DIR failed"
ok "📤 payload in $TARGET:$REMOTE_DIR"

# ---------------------------------------------------------------- install
rc=0
ssh "$TARGET" "SA_LOGIN='$SA_LOGIN' SA_ESIM='$SA_ESIM' SA_COLOR='$SA_COLOR' \
  sh $REMOTE_DIR/install-modem.sh; rc=\$?; rm -rf $REMOTE_DIR; exit \$rc" || rc=$?
echo
if [ "$rc" = 0 ]; then
  echo "${C_G}${C_W}✨ Done: http://$HOST/${C_0}"
else
  echo "${C_R}${C_W}💥 The modem side stopped with an error (exit $rc): see above${C_0}"
  exit "$rc"
fi
