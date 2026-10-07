#!/bin/sh
# Runs on the modem from the payload that ../install.sh copies over SSH:
#   sh <payload>/install-modem.sh
# The payload is the repository's deploy/ directory: one folder per module.
# Environment (set by install.sh):
#   SA_LOGIN  0/1 to force SIMPLEADMIN_ENABLE_LOGIN, empty to keep it
#   SA_ESIM   0/1 to force SIMPLEADMIN_ENABLE_ESIM, empty to keep it
#   SA_COLOR  1 for ANSI colours (the caller's terminal), 0 for plain text
#
# Idempotent: every run converges to the same state, whatever an older
# install (deploy-*.sh, the 1.0.5 payload, the ADB .bat, by hand) left behind.
#
# Layout on the modem:
#   /WEBSERVER/www                   web UI; simpleadmin.conf values and
#                                    cgi-bin/credentials.txt survive updates
#   /data/simpleadmin/{bin,lib}      diag_bridge, system_bridge, curl, jq, modem_config (UBIFS
#                                    usrfs, the root filesystem has only a few
#                                    MB free), reached through /usr/bin
#   /opt/scripts, /etc/init.d        TTL, watchdog and crontab scripts
#   /lib/systemd/system              units, enabled through /etc/systemd
#   /etc/udev, /sbin/ifconfig        persistent eth0/bridge0 MAC
#                                    (deploy/persistent-mac/README.md)
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
SA_LOGIN="${SA_LOGIN:-}"
SA_ESIM="${SA_ESIM:-}"
WEB=/WEBSERVER/www
BASE=/data/simpleadmin
UNIT_DIR=/lib/systemd/system
UNITS="crontab ttl-override connection-watchdog euicc diag_bridge system_bridge"
WARNINGS=0
REMOVED=0

# ---------------------------------------------------------------- output
if [ "${SA_COLOR:-0}" = 1 ]; then
  C_0='\033[0m' C_B='\033[1;36m' C_G='\033[32m' C_Y='\033[1;33m'
  C_R='\033[1;31m' C_D='\033[2m' C_W='\033[1m'
else
  C_0='' C_B='' C_G='' C_Y='' C_R='' C_D='' C_W=''
fi
say() { printf '%b\n' "$*"; }
section() { say ""; say "${C_B}━━━ $* ━━━${C_0}"; }
ok() { say "  ${C_G}✅ $*${C_0}"; }
info() { say "  ${C_D}·  $*${C_0}"; }
warn() { WARNINGS=$((WARNINGS + 1)); say "  ${C_Y}⚠️  $*${C_0}"; }
err() { WARNINGS=$((WARNINGS + 1)); say "  ${C_R}❌ $*${C_0}"; }
fail() { say "  ${C_R}❌ $*${C_0}"; say "${C_R}💥 Installation aborted${C_0}"; exit 1; }

# Copies a file next to its destination, then renames it into place; says
# whether anything changed.
install_file() {
  if [ -f "$3" ] && [ ! -L "$3" ] && cmp -s "$1" "$3" && \
     [ "$(stat -c %a "$3")" = "$2" ]; then
    info "📄 $3 unchanged"
    return
  fi
  cp "$1" "$3.new"
  chmod "$2" "$3.new"
  mv -f "$3.new" "$3"
  ok "📄 $3 installed (mode $2)"
}

# Points a symlink at a target, reporting what it replaced.
link() {
  if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then
    info "🔗 $2 → $1 unchanged"
    return
  fi
  [ -e "$2" ] || [ -L "$2" ] && was=" (replaced a $( [ -L "$2" ] && echo link || echo file))" || was=""
  ln -sfn "$1" "$2"
  ok "🔗 $2 → $1$was"
}

# Removes leftovers, one line per path that was actually there.
remove() {
  for p in "$@"; do
    if [ -e "$p" ] || [ -L "$p" ]; then
      rm -rf "$p"
      REMOVED=$((REMOVED + 1))
      ok "🗑️  removed $p"
    fi
  done
}

# Rewrites KEY=... in a config file.
set_key() {
  sed -i "s|^$2=.*|$2=$3|" "$1"
}

conf_value() {
  sed -n "s/^$2=//p" "$1"
}

# SHA-512 crypt, exactly as cgi-bin/session_utils.sh does it, so the UI
# verifies what we write.
crypt_sha512() {
  if command -v openssl >/dev/null 2>&1; then
    printf '%s\n' "$1" | openssl passwd -6 -salt "$2" -stdin
  elif command -v cryptpw >/dev/null 2>&1; then
    printf '%s' "$1" | cryptpw -m sha512 -S "$2"
  else
    return 1
  fi
}

new_salt() {
  salt="$(openssl rand -base64 24 2>/dev/null | tr -dc 'A-Za-z0-9./' | cut -c1-16)"
  [ "${#salt}" -ge 16 ] || salt="$(hexdump -n 8 -v -e '/1 "%02x"' /dev/urandom)"
  printf '%s' "$salt"
}

# Hashes the passwords credentials.txt (username:role:password) still holds
# in plaintext; the UI would only do it at each account's next login. Every
# hash is checked against its own salt before the file is replaced, and no
# password is ever printed.
hash_credentials() {
  file="$1"
  plain=0
  : > "$file.tmp"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) printf '%s\n' "$line" >> "$file.tmp"; continue ;;
    esac
    user="${line%%:*}"
    rest="${line#*:}"
    role="${rest%%:*}"
    pw="${rest#*:}"
    case "$pw" in
      '$6$'*) printf '%s\n' "$line" >> "$file.tmp"; continue ;;
    esac
    salt="$(new_salt)"
    hashed="$(crypt_sha512 "$pw" "$salt" 2>/dev/null || true)"
    case "$hashed" in
      '$6$'*) ;;
      *) rm -f "$file.tmp"; warn "🔑 cannot hash passwords here: left as they are (hashed at next login)"; return 0 ;;
    esac
    if [ "$(crypt_sha512 "$pw" "$salt")" != "$hashed" ]; then
      rm -f "$file.tmp"
      warn "🔑 password hash check failed: credentials.txt left as it is"
      return 0
    fi
    printf '%s:%s:%s\n' "$user" "$role" "$hashed" >> "$file.tmp"
    plain=$((plain + 1))
    info "🔑 $user: plaintext password hashed"
  done < "$file"
  if [ "$plain" = 0 ]; then
    rm -f "$file.tmp"
    info "🔑 all passwords already hashed"
    return 0
  fi
  chmod "$(stat -c %a "$file")" "$file.tmp"
  mv -f "$file.tmp" "$file"
  ok "🔑 $plain plaintext password(s) converted to SHA-512 crypt"
}

# Enables or disables a unit and checks that it took: a unit that is not
# enabled silently stops at the next reboot.
unit_state() {
  if [ "$2" = on ]; then
    systemctl enable "$1" >/dev/null 2>&1 || true
    [ "$(systemctl is-enabled "$1" 2>/dev/null)" = enabled ] || fail "cannot enable $1"
    ok "🔌 $1 enabled at boot"
  else
    systemctl disable "$1" >/dev/null 2>&1 || true
    systemctl stop "$1" 2>/dev/null || true
    [ "$(systemctl is-enabled "$1" 2>/dev/null)" != enabled ] || fail "cannot disable $1"
    info "⏸️  $1 disabled and stopped"
  fi
}

# Restarts a unit and reports the state it settles in.
restart() {
  systemctl restart "$1" 2>/dev/null || true
  state="$(systemctl is-active "$1" 2>/dev/null || true)"
  if [ "$state" = active ]; then
    ok "▶️  $1 running"
  else
    systemctl status "$1" --no-pager 2>&1 | tail -5 | sed 's/^/       /'
    fail "$1 is $state"
  fi
}

say "${C_W}🛠️  SimpleAdmin installer on $(uname -n), payload $SRC${C_0}"

# ---------------------------------------------------------------- legacy
section "🧹 Leftovers of older installs"
# Binaries and the Tailscale payload, now in /data or downloaded on demand;
# qdiagmon-dci from a 1.0.6 beta; the TTL value lives in /persist/ttlvalue;
# a bridge unit in /etc would shadow the one in /lib.
remove /opt/simpleadmin /opt/scripts/diag /opt/scripts/ttl/ttlvalue \
  /etc/systemd/system/diag_bridge.service
# Hand-made wants links: "systemctl disable" (used by the UI for the
# watchdog and eSIM) only removes the ones in /etc, so these would keep a
# disabled unit starting at boot. unit_state() recreates the right ones.
for u in $UNITS; do
  remove "$UNIT_DIR/multi-user.target.wants/$u.service"
done
# Systemd version of the MAC fix, superseded by the ifconfig wrapper.
if [ -e /etc/systemd/system/set-bridge0-mac.service ]; then
  systemctl disable set-bridge0-mac.service 2>/dev/null || true
fi
remove /etc/systemd/system/set-bridge0-mac.service \
  /etc/systemd/system/multi-user.target.wants/set-bridge0-mac.service \
  /etc/udev/scripts/set-bridge0-mac.sh
# A swap interrupted by an earlier run.
remove "$WEB.new" "$WEB.old"
[ "$REMOVED" = 0 ] && ok "nothing left behind"

# ---------------------------------------------------------------- web UI
section "🌐 Web UI"
cp -R "$SRC/www" "$WEB.new"
info "📦 new tree staged in $WEB.new"
conf="$WEB.new/config/simpleadmin.conf"
if [ -f "$WEB/config/simpleadmin.conf" ]; then
  # Keep the values already set on this modem for every key the new file
  # still has; new keys get the shipped default. Values go through ENVIRON:
  # awk -v would decode backslash escapes in them.
  kept=0
  for line in $(grep -E '^[A-Z_]+=' "$WEB/config/simpleadmin.conf" | sed 's/=.*//'); do
    key="$line"
    if grep -q "^$key=" "$conf"; then
      K="$key" V="$(sed -n "s/^$key=//p" "$WEB/config/simpleadmin.conf" | head -1)" awk \
        'index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["K"] "=" ENVIRON["V"]; next } { print }' \
        "$conf" > "$conf.tmp"
      mv -f "$conf.tmp" "$conf"
      kept=$((kept + 1))
    else
      info "⚙️  $key dropped (no longer in simpleadmin.conf)"
    fi
  done
  ok "⚙️  kept $kept existing simpleadmin.conf values"
else
  info "⚙️  no previous simpleadmin.conf: shipped defaults"
fi
if [ -n "$SA_LOGIN" ]; then
  set_key "$conf" SIMPLEADMIN_ENABLE_LOGIN "$SA_LOGIN"
  ok "🔐 login forced to $SA_LOGIN"
fi
if [ -n "$SA_ESIM" ]; then
  set_key "$conf" SIMPLEADMIN_ENABLE_ESIM "$SA_ESIM"
  ok "📶 eSIM forced to $SA_ESIM"
fi
chmod -R 755 "$WEB.new"
# After the chmod: the existing file keeps its own mode.
if [ -f "$WEB/cgi-bin/credentials.txt" ]; then
  cp -p "$WEB/cgi-bin/credentials.txt" "$WEB.new/cgi-bin/credentials.txt"
  ok "🔑 kept the existing credentials.txt"
else
  info "🔑 no previous credentials.txt: shipped default"
fi
hash_credentials "$WEB.new/cgi-bin/credentials.txt"

# Swap with the old tree kept aside until the server is back: whatever
# happens, the modem is left serving a complete UI.
trap 'systemctl start qcmap_httpd.service 2>/dev/null' EXIT
info "⏹️  stopping qcmap_httpd"
systemctl stop qcmap_httpd.service
[ -d "$WEB" ] && mv "$WEB" "$WEB.old"
if ! mv "$WEB.new" "$WEB" || ! systemctl start qcmap_httpd.service; then
  systemctl stop qcmap_httpd.service 2>/dev/null || true
  if [ -d "$WEB.old" ]; then
    rm -rf "$WEB"
    mv "$WEB.old" "$WEB"
  fi
  systemctl start qcmap_httpd.service 2>/dev/null || true
  fail "web UI swap failed, previous UI restored"
fi
trap - EXIT
rm -rf "$WEB.old"
systemctl is-active qcmap_httpd.service >/dev/null || fail "qcmap_httpd is not running"
conf="$WEB/config/simpleadmin.conf"
ok "▶️  qcmap_httpd running"
ok "🌐 $(sed -n 's/.*APP_VERSION = "\(.*\)".*/\1/p' "$WEB/js/app-version.js") in $WEB" \
  "(login $(conf_value "$conf" SIMPLEADMIN_ENABLE_LOGIN), eSIM $(conf_value "$conf" SIMPLEADMIN_ENABLE_ESIM))"

# ---------------------------------------------------------------- binaries
section "📦 Tools in $BASE"
mkdir -p "$BASE/bin" "$BASE/lib"

# Wrapper so a bundled binary finds its own libraries first without
# replacing the firmware's copies in /usr/lib (libcurl.so.4 4.5.0).
write_wrapper() {
  cat > "/usr/bin/$1.new" <<WRAP
#!/bin/sh
LD_LIBRARY_PATH="$BASE/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" exec "$BASE/bin/$1" "\$@"
WRAP
  chmod 755 "/usr/bin/$1.new"
  if cmp -s "/usr/bin/$1.new" "/usr/bin/$1"; then
    rm -f "/usr/bin/$1.new"
    info "🔗 /usr/bin/$1 wrapper unchanged"
  else
    mv -f "/usr/bin/$1.new" "/usr/bin/$1"
    ok "🔗 /usr/bin/$1 wrapper installed"
  fi
}

install_file "$SRC/curl/bin/curl" 755 "$BASE/bin/curl"
install_file "$SRC/curl/lib/libcurl.so.4.7.0" 755 "$BASE/lib/libcurl.so.4.7.0"
link libcurl.so.4.7.0 "$BASE/lib/libcurl.so.4"
write_wrapper curl
/usr/bin/curl --version >/dev/null 2>&1 || fail "curl does not run"
ok "🧪 $(/usr/bin/curl --version | head -1 | cut -d' ' -f1-2) runs"

install_file "$SRC/jq/bin/jq" 755 "$BASE/bin/jq"
install_file "$SRC/jq/lib/libjq.so.1.0.4" 755 "$BASE/lib/libjq.so.1.0.4"
link libjq.so.1.0.4 "$BASE/lib/libjq.so.1"
write_wrapper jq
echo '{"ok":true}' | /usr/bin/jq -e .ok >/dev/null 2>&1 || fail "jq does not run"
ok "🧪 $(/usr/bin/jq --version) runs"

# Interactive configuration CLI (stich86), run by name from a console. The
# copy the firmware image put in /usr/sbin becomes a link too, so nothing
# older shadows it in PATH.
install_file "$SRC/modem-config/scripts/modem_config" 755 "$BASE/bin/modem_config"
link "$BASE/bin/modem_config" /usr/bin/modem_config
link "$BASE/bin/modem_config" /usr/sbin/modem_config

# ---------------------------------------------------------------- scripts
section "🧩 System scripts and units"
mkdir -p /opt/scripts/ttl /opt/scripts/watchdog /etc/init.d
install_file "$SRC/ttl/scripts/ttl-override" 755 /opt/scripts/ttl/ttl-override
install_file "$SRC/watchdog/scripts/connection-watchdog" 755 /opt/scripts/watchdog/connection-watchdog
install_file "$SRC/crontab/init.d/crontab" 755 /etc/init.d/crontab
# The UI writes the watchdog configuration: only install the default once.
if [ -f /opt/scripts/Watchdog ]; then
  info "⚙️  /opt/scripts/Watchdog kept (written by the UI)"
else
  install_file "$SRC/watchdog/config/Watchdog" 644 /opt/scripts/Watchdog
fi
install_file "$SRC/crontab/systemd/crontab.service" 644 "$UNIT_DIR/crontab.service"
install_file "$SRC/ttl/systemd/ttl-override.service" 644 "$UNIT_DIR/ttl-override.service"
install_file "$SRC/watchdog/systemd/connection-watchdog.service" 644 \
  "$UNIT_DIR/connection-watchdog.service"
install_file "$SRC/euicc/systemd/euicc.service" 644 "$UNIT_DIR/euicc.service"

# ---------------------------------------------------------------- MAC
# eth0 and bridge0 get <EarlyEthMACAddr> instead of a random MAC per boot:
# a udev rule pins eth0, a /sbin/ifconfig wrapper rewrites QCMAP's
# "ifconfig bridge0 hw ether <random>". Applies at the next boot.
section "🔒 Persistent MAC (eth0, bridge0)"
M="$SRC/persistent-mac"
mkdir -p /etc/udev/rules.d /etc/udev/scripts
install_file "$M/udev/98-eth0-fixed-mac.rules" 644 /etc/udev/rules.d/98-eth0-fixed-mac.rules
install_file "$M/scripts/set-eth0-mac.sh" 755 /etc/udev/scripts/set-eth0-mac.sh
# Keep the firmware's ifconfig once, and never save our own wrapper as it.
if [ -e /sbin/ifconfig.real ] || [ -L /sbin/ifconfig.real ]; then
  info "💾 /sbin/ifconfig.real already holds the firmware's ifconfig"
elif grep -q 'ifconfig-wrapper' /sbin/ifconfig 2>/dev/null; then
  warn "/sbin/ifconfig is our wrapper but /sbin/ifconfig.real is missing"
else
  cp -a /sbin/ifconfig /sbin/ifconfig.real
  ok "💾 firmware ifconfig saved as /sbin/ifconfig.real"
fi
install_file "$M/scripts/ifconfig-wrapper.sh" 755 /sbin/ifconfig
/sbin/ifconfig lo >/dev/null 2>&1 || fail "the /sbin/ifconfig wrapper does not run"
ok "🧪 /sbin/ifconfig wrapper runs"
mac="$(sed -n 's/.*<EarlyEthMACAddr>\([0-9a-fA-F:]*\)<.*/\1/p' /etc/data/mobileap_cfg.xml)"
now="$(cat /sys/class/net/eth0/address)"
if [ "$(echo "$mac" | tr A-F a-f)" = "$now" ]; then
  ok "🏷️  eth0 already on $mac"
else
  info "🏷️  eth0 is $now, becomes $mac at the next reboot"
fi

# ---------------------------------------------------------------- bridges
# diag_bridge (radio metrics from /dev/diag, port 9001) and system_bridge
# (QMI modem data, system status, connectivity, port 9002). Each is
# installed only with a binary that runs on this modem: the new one from the
# payload or, without it, the one already here. Otherwise its unit goes too,
# rather than a service failing and restarting forever. Not fatal.
install_daemon() {
  d="$1"
  section "📡 $d"
  how=""
  new="$SRC/$d/bin/$d"
  if [ -f "$new" ]; then
    if "$new" -h >/dev/null 2>&1; then
      how=new
      info "🧪 payload binary runs ($(cat "$SRC/$d/$d.version" 2>/dev/null || echo unknown))"
    else
      err "the $d in the payload does not run on this modem"
    fi
  else
    err "no $d in the payload (link not resolved on the workstation)"
  fi
  if [ -z "$how" ] && [ -x "$BASE/bin/$d" ] && "$BASE/bin/$d" -h >/dev/null 2>&1; then
    how=installed
    warn "keeping the $d already installed ($(cat "$BASE/$d.version" 2>/dev/null || echo unknown))"
  fi
  if [ -n "$how" ]; then
    install_file "$SRC/$d/systemd/$d.service" 644 "$UNIT_DIR/$d.service"
    systemctl daemon-reload
    if [ "$how" = new ]; then
      systemctl stop "$d" 2>/dev/null || true
      install_file "$new" 755 "$BASE/bin/$d"
      install_file "$SRC/$d/$d.version" 644 "$BASE/$d.version"
    fi
    link "$BASE/bin/$d" "/usr/bin/$d"
    unit_state "$d" on
    restart "$d"
  else
    err "$d not installed: the UI data it feeds will stay empty"
    if [ -e "$UNIT_DIR/$d.service" ]; then
      systemctl disable "$d" >/dev/null 2>&1 || true
      systemctl stop "$d" 2>/dev/null || true
    fi
    remove "$UNIT_DIR/$d.service" "/usr/bin/$d" "$BASE/bin/$d" "$BASE/$d.version"
  fi
}
install_daemon diag_bridge
install_daemon system_bridge

# ---------------------------------------------------------------- services
section "▶️  Services"
systemctl daemon-reload
info "🔄 systemd reloaded"
unit_state crontab on
restart crontab
unit_state ttl-override on
# Oneshot: re-applies the TTL rules from /persist/ttlvalue.
ttl="$(cat /persist/ttlvalue 2>/dev/null || echo 0)"
/opt/scripts/ttl/ttl-override restart >/dev/null
if [ "$ttl" = 0 ]; then
  info "⏱️  TTL override off (/persist/ttlvalue = 0)"
else
  ok "⏱️  TTL override applied: $ttl"
fi

# Same rules as the UI (cgi-bin/connection_watchdog, cgi-bin/toggle_esim):
# each optional service runs exactly when its configuration enables it.
if grep -q '^WD_ENABLED="\{0,1\}1"\{0,1\}$' /opt/scripts/Watchdog; then
  info "🐕 watchdog enabled in /opt/scripts/Watchdog"
  unit_state connection-watchdog on
  restart connection-watchdog
else
  info "🐕 watchdog disabled in /opt/scripts/Watchdog"
  unit_state connection-watchdog off
fi
if [ "$(conf_value "$conf" SIMPLEADMIN_ENABLE_ESIM)" = 1 ]; then
  info "📶 eSIM enabled in simpleadmin.conf"
  [ -x /home/root/euicc-sd-client ] || \
    warn "/home/root/euicc-sd-client is missing (docs/Enable_New_feature.md)"
  unit_state euicc on
  systemctl restart euicc 2>/dev/null || true
  info "▶️  euicc $(systemctl is-active euicc 2>/dev/null || true)"
else
  info "📶 eSIM disabled in simpleadmin.conf"
  unit_state euicc off
fi

# ---------------------------------------------------------------- summary
section "📋 Summary"
# Flush to flash: the files are on disk before we say so, and UBIFS reports
# the real free space only after write-back.
sync
for u in qcmap_httpd crontab ttl-override connection-watchdog euicc diag_bridge system_bridge; do
  en="$(systemctl is-enabled "$u" 2>/dev/null || true)"
  say "  $(printf '%-22s' "$u") $(printf '%-9s' "${en:--}") $(systemctl is-active "$u" 2>/dev/null || true)"
done
say "  $(printf '%-22s' "rootfs free") $(df -k / | awk 'NR==2 {printf "%.1f MB", $4/1024}')"
say "  $(printf '%-22s' "/data free") $(df -k /data | awk 'NR==2 {printf "%.1f MB", $4/1024}')"
say ""
if [ "$WARNINGS" = 0 ]; then
  say "${C_G}🎉 SimpleAdmin installed${C_0}"
else
  say "${C_Y}🎉 SimpleAdmin installed with $WARNINGS warning(s): see above${C_0}"
fi
