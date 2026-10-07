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
# credentials.txt. The target is checked first (hostname sdxprairie, AT+CGMM
# T99W175, /WEBSERVER): anything else is refused.
#
# Everything that goes on the modem lives in deploy/, one folder per module;
# deploy/install-modem.sh is the modem side. deploy/diag_bridge/bin/diag_bridge
# is a gitignored symlink into a T99W175-diag-json-bridge checkout next to this
# repository (see deploy/diag_bridge/README.md); without it the install goes
# on and the modem keeps (or drops) the bridge it has.
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
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $arg (see --help)" ;;
    *) HOST="$arg" ;;
  esac
done
TARGET="root@$HOST"
REMOTE_DIR="/tmp/simpleadmin-install"

echo "${C_W}🚀 SimpleAdmin installer → $TARGET${C_0}"

# ---------------------------------------------------------------- payload
section "📦 Payload"
VERSION="$(sed -n 's/.*APP_VERSION = "\(.*\)".*/\1/p' deploy/www/js/app-version.js)"
ok "🌐 web UI $VERSION"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R deploy/. "$STAGE/"
# Documentation stays here; Tailscale is downloaded from GitHub by the UI
# (cgi-bin/tailscale-helper), not pushed.
rm -rf "$STAGE/tailscale"
find "$STAGE" -name '*.md' -delete
info "📚 documentation and the Tailscale payload left out"

BRIDGE_LINK=deploy/diag_bridge/bin/diag_bridge
rm -f "$STAGE/diag_bridge/bin/diag_bridge"
if [ -f "$BRIDGE_LINK" ]; then
  BRIDGE_REPO="$(dirname "$(readlink -f "$BRIDGE_LINK")")"
  BRIDGE_VERSION="$(git -C "$BRIDGE_REPO" describe --always --dirty --tags 2>/dev/null || echo unknown)"
  cp -L "$BRIDGE_LINK" "$STAGE/diag_bridge/bin/diag_bridge"
  printf '%s\n' "$BRIDGE_VERSION" > "$STAGE/diag_bridge/diag_bridge.version"
  ok "📡 diag_bridge $BRIDGE_VERSION from $BRIDGE_REPO"
else
  warn "📡 $BRIDGE_LINK is missing or a dangling link: no diag_bridge in this install"
  info "   clone T99W175-diag-json-bridge next to this repository and run its"
  info "   scripts/publish-to-simpleadmin.sh (deploy/diag_bridge/README.md)"
fi
for t in curl jq modem-config ttl crontab watchdog euicc persistent-mac; do
  [ -d "$STAGE/$t" ] || die "module deploy/$t is missing"
done
ok "🧩 modules: curl jq modem-config ttl crontab watchdog euicc persistent-mac"
[ -n "$SA_LOGIN" ] && ok "🔐 login will be set to $SA_LOGIN" || info "🔐 login setting kept"
[ -n "$SA_ESIM" ] && ok "📶 eSIM will be set to $SA_ESIM" || info "📶 eSIM setting kept"
info "📏 $(du -sh "$STAGE" | cut -f1) to transfer"

# ---------------------------------------------------------------- target
section "🔎 Target"
ID="$(ssh -o ConnectTimeout=10 "$TARGET" \
  'printf "%s|" "$(uname -n)"; [ -d /WEBSERVER ] && printf "web|" || printf "noweb|";
   atcli_smd8 "AT+CGMM" 2>/dev/null | tr -d "\r" | grep -x "T99W[0-9]*" | head -1' 2>/dev/null)" ||
  die "cannot reach $TARGET over SSH"
ok "🔌 SSH to $TARGET"
IFS='|' read -r ID_HOST ID_WEB ID_MODEL <<< "$ID"
[ "$ID_HOST" = "sdxprairie" ] && ok "🖥️  hostname $ID_HOST" ||
  die "hostname '${ID_HOST:-?}' is not sdxprairie: $HOST is not a T99W175"
[ "$ID_MODEL" = "T99W175" ] && ok "📟 AT+CGMM $ID_MODEL" ||
  die "AT+CGMM answered '${ID_MODEL:-nothing}', not T99W175"
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
