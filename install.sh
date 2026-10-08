#!/bin/bash
# Install SimpleAdmin on a Foxconn T99W175 over SSH: web UI, diag_bridge,
# curl, jq, modem_config, the system scripts/units and the persistent MAC
# fix, in one go.
# Safe to run again: every step is idempotent.
#
#   ./install.sh [HOST] [--www-alpine|--www-nextjs] [--onlywww]
#                [--nologin|--login] [--noesim|--esim]
#
#   HOST          modem address (default 192.168.225.1), reached as root
#   --www-nextjs  web front-end: deploy/www-nextjs, built by frontend/build.sh
#                 (the default)
#   --www-alpine  web front-end: the classic Alpine.js pages of deploy/www-alpine
#   --onlywww     install the web UI only (front-end, CGIs, configuration):
#                 no binaries, scripts, units or services
#   --nologin     set SIMPLEADMIN_ENABLE_LOGIN=0   (--login sets it to 1)
#   --noesim      set SIMPLEADMIN_ENABLE_ESIM=0    (--esim sets it to 1)
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
SA_UI=""
SA_ONLY_WWW=0
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
    --www-nextjs) set_flag SA_UI nextjs ;;
    --www-alpine) set_flag SA_UI alpine ;;
    --onlywww) SA_ONLY_WWW=1 ;;
    -h|--help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $arg (see --help)" ;;
    *) HOST="$arg" ;;
  esac
done
SA_UI="${SA_UI:-nextjs}"
# --esim/--noesim also start or stop the euicc service, outside the web UI.
if [ "$SA_ONLY_WWW" = 1 ] && [ -n "$SA_ESIM" ]; then
  die "--esim/--noesim also switch the euicc service: run them without --onlywww"
fi
TARGET="root@$HOST"
REMOTE_DIR="/tmp/simpleadmin-install"

echo "${C_W}🚀 SimpleAdmin installer → $TARGET${C_0}"

# ---------------------------------------------------------------- payload
section "📦 Payload"
VERSION="$(sed -n 's/^- Current-Version: `\(.*\)`.*/\1/p' VERSION.md)"
ok "🌐 web UI $VERSION"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
if [ "$SA_ONLY_WWW" = 1 ]; then
  mkdir -p "$STAGE"
  cp -R deploy/www deploy/www-alpine deploy/www-nextjs "$STAGE/"
  cp deploy/install-modem.sh "$STAGE/"
  ok "🌐 web UI only (--onlywww)"
else
  cp -R deploy/. "$STAGE/"
  # Documentation stays here; Tailscale is downloaded from GitHub by the UI
  # (cgi-bin/tailscale-helper), not pushed.
  rm -rf "$STAGE/tailscale"
  find "$STAGE" -name '*.md' -delete
  info "📚 documentation and the Tailscale payload left out"
fi
printf '%s\n' "$VERSION" > "$STAGE/www/VERSION"
# The web root is deploy/www (CGIs, configuration, GUI lock page) plus one
# front-end: deploy/www-nextjs, built from frontend/ by frontend/build.sh and
# versioned, or the classic Alpine.js pages of deploy/www-alpine.
if [ "$SA_UI" = nextjs ]; then
  [ -f deploy/www-nextjs/BUILD ] ||
    die "deploy/www-nextjs is missing: run frontend/build.sh (or use --www-alpine)"
  cp -R "$STAGE/www-nextjs/." "$STAGE/www/"
  rm -f "$STAGE/www/BUILD"
  if [ -n "$(find frontend/app frontend/components frontend/hooks frontend/lib \
      frontend/locales frontend/types -newer deploy/www-nextjs/BUILD -type f | head -1)" ]; then
    warn "🖥️  frontend sources are newer than deploy/www-nextjs: run frontend/build.sh"
  fi
  ok "🖥️  front-end: Next.js $(cat deploy/www-nextjs/BUILD)"
else
  cp -R "$STAGE/www-alpine/." "$STAGE/www/"
  ok "🖥️  front-end: classic Alpine.js pages"
fi
rm -rf "$STAGE/www-nextjs" "$STAGE/www-alpine"
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

if [ "$SA_ONLY_WWW" = 0 ]; then
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
  # system_bridge and ra-guard are built here (deploy/<name>/build.sh); the
  # binaries are versioned, the sources stay on the workstation.
  for d in system_bridge ra-guard; do
    rm -rf "$STAGE/$d/src" "$STAGE/$d/build.sh"
    sb="deploy/$d/bin/$d"
    if [ -f "$sb" ]; then
      version="$(git describe --always --dirty --tags 2>/dev/null || echo unknown)"
      printf '%s\n' "$version" > "$STAGE/$d/$d.version"
      if [ -n "$(find "deploy/$d/src" -newer "$sb" -type f | head -1)" ]; then
        warn "📡 $d sources are newer than the binary: run deploy/$d/build.sh"
      else
        ok "📡 $d $version"
      fi
    else
      warn "📡 $sb is missing: run deploy/$d/build.sh"
    fi
  done
  for t in curl jq modem-config ttl crontab watchdog euicc persistent-mac dhcp-guard; do
    [ -d "$STAGE/$t" ] || die "module deploy/$t is missing"
  done
  ok "🧩 modules: curl jq modem-config ttl crontab watchdog euicc persistent-mac dhcp-guard"
fi
[ -n "$SA_LOGIN" ] && ok "🔐 login will be set to $SA_LOGIN" || info "🔐 login setting kept"
[ "$SA_ONLY_WWW" = 1 ] || { [ -n "$SA_ESIM" ] && ok "📶 eSIM will be set to $SA_ESIM" || info "📶 eSIM setting kept"; }
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
  SA_ONLY_WWW='$SA_ONLY_WWW' SA_UI='$SA_UI' \
  sh $REMOTE_DIR/install-modem.sh; rc=\$?; rm -rf $REMOTE_DIR; exit \$rc" || rc=$?
echo
if [ "$rc" = 0 ]; then
  echo "${C_G}${C_W}✨ Done: http://$HOST/${C_0}"
else
  echo "${C_R}${C_W}💥 The modem side stopped with an error (exit $rc): see above${C_0}"
  exit "$rc"
fi
