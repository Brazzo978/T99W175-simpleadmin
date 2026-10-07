#!/bin/bash

# Deploy the binaries SimpleAdmin depends on to the modem.
# Usage: ./deploy-sw-deps.sh [HOST] [COMPONENT...]
#   HOST       : Remote host IP/address (default: 192.168.225.1)
#   COMPONENT  : any of diag_bridge, curl, jq, tailscale (default: all)
#
# Where things go on the modem:
#   diag_bridge -> /usr/bin/diag_bridge + /lib/systemd/system/diag_bridge.service
#   curl, jq    -> /opt/simpleadmin/{bin,lib}, with /usr/bin wrappers that set
#                  LD_LIBRARY_PATH; the firmware's own /usr/lib/libcurl.so.4
#                  (4.5.0) is left untouched
#   tailscale   -> /opt/simpleadmin/Tailscale (same layout as the upgrade payload)
#
# The web UI itself is deployed separately with ./deploy-www.sh.
# usr/bin/diag_bridge comes from the T99W175-diag-json-bridge repo through its
# scripts/publish-to-simpleadmin.sh.

set -e  # Exit on error

REMOTE_USER="root"
REMOTE_TMP="/tmp/simpleadmin-sw-deps"
ALL_COMPONENTS="diag_bridge curl jq tailscale"

cd "$(dirname "$0")"

REMOTE_HOST="192.168.225.1"
if [ $# -gt 0 ] && [[ "$1" =~ ^[0-9a-zA-Z.:-]+$ ]] && \
   ! [[ " $ALL_COMPONENTS " == *" $1 "* ]]; then
    REMOTE_HOST="$1"
    shift
fi

COMPONENTS="${*:-$ALL_COMPONENTS}"
for c in $COMPONENTS; do
    if ! [[ " $ALL_COMPONENTS " == *" $c "* ]]; then
        echo "❌ Unknown component: $c (valid: $ALL_COMPONENTS)"
        exit 1
    fi
done

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

stage_file() {
    local src="$1"
    if [ ! -f "$src" ]; then
        echo "❌ Missing $src"
        exit 1
    fi
    mkdir -p "$STAGE/$(dirname "$src")"
    cp -p "$src" "$STAGE/$src"
}

echo "📦 Staging components: $COMPONENTS"
for c in $COMPONENTS; do
    case "$c" in
        diag_bridge)
            stage_file usr/bin/diag_bridge
            stage_file scripts/systemd/diag_bridge.service
            [ -f usr/bin/diag_bridge.version ] && stage_file usr/bin/diag_bridge.version
            echo "  - diag_bridge $(cat usr/bin/diag_bridge.version 2>/dev/null || echo '(unknown version)')"
            ;;
        curl)
            stage_file usr/bin/curl
            stage_file usr/lib/libcurl.so.4.7.0
            echo "  - curl"
            ;;
        jq)
            stage_file usr/bin/jq
            stage_file usr/lib/libjq.so.1.0.4
            echo "  - jq"
            ;;
        tailscale)
            mkdir -p "$STAGE/Tailscale"
            cp -p Tailscale/* "$STAGE/Tailscale/"
            echo "  - tailscale payload"
            ;;
    esac
done

echo "🚚 Copying to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP}..."
tar -C "$STAGE" -cf - . | ssh "${REMOTE_USER}@${REMOTE_HOST}" \
    "rm -rf ${REMOTE_TMP} && mkdir -p ${REMOTE_TMP} && tar -C ${REMOTE_TMP} -xf -"

echo "🔧 Installing on the modem..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "COMPONENTS='$COMPONENTS' SRC='$REMOTE_TMP' sh -s" << 'EOF'
set -e
OPT=/opt/simpleadmin
UNIT_DIR=/lib/systemd/system

# Wrapper so the bundled binary finds its own libraries first without
# replacing the firmware's copies in /usr/lib.
write_wrapper() {
    name="$1"
    cat > "/usr/bin/$name" <<WRAP
#!/bin/sh
LD_LIBRARY_PATH="$OPT/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" exec "$OPT/bin/$name" "\$@"
WRAP
    chmod 755 "/usr/bin/$name"
}

for c in $COMPONENTS; do
    case "$c" in
        diag_bridge)
            echo "⏹️  Stopping diag_bridge"
            systemctl stop diag_bridge 2>/dev/null || true
            cp "$SRC/usr/bin/diag_bridge" /usr/bin/diag_bridge
            chmod 755 /usr/bin/diag_bridge
            mkdir -p "$OPT"
            if [ -f "$SRC/usr/bin/diag_bridge.version" ]; then
                cp "$SRC/usr/bin/diag_bridge.version" "$OPT/diag_bridge.version"
            fi
            cp "$SRC/scripts/systemd/diag_bridge.service" "$UNIT_DIR/diag_bridge.service"
            chmod 644 "$UNIT_DIR/diag_bridge.service"
            # Older installs put the unit in /etc, which would shadow this one.
            rm -f /etc/systemd/system/diag_bridge.service
            systemctl daemon-reload
            systemctl enable diag_bridge >/dev/null 2>&1 || true
            systemctl restart diag_bridge
            sleep 2
            if systemctl is-active diag_bridge >/dev/null 2>&1; then
                echo "✅ diag_bridge running ($(cat "$OPT/diag_bridge.version" 2>/dev/null || echo 'unknown version'))"
            else
                echo "❌ diag_bridge failed to start"
                systemctl status diag_bridge --no-pager 2>&1 | tail -5
                exit 1
            fi
            ;;
        curl)
            mkdir -p "$OPT/bin" "$OPT/lib"
            cp "$SRC/usr/bin/curl" "$OPT/bin/curl"
            cp "$SRC/usr/lib/libcurl.so.4.7.0" "$OPT/lib/libcurl.so.4.7.0"
            ln -sf libcurl.so.4.7.0 "$OPT/lib/libcurl.so.4"
            chmod 755 "$OPT/bin/curl" "$OPT/lib/libcurl.so.4.7.0"
            write_wrapper curl
            if /usr/bin/curl --version >/dev/null 2>&1; then
                echo "✅ $(/usr/bin/curl --version | head -1)"
            else
                echo "❌ curl does not run"; exit 1
            fi
            ;;
        jq)
            mkdir -p "$OPT/bin" "$OPT/lib"
            cp "$SRC/usr/bin/jq" "$OPT/bin/jq"
            cp "$SRC/usr/lib/libjq.so.1.0.4" "$OPT/lib/libjq.so.1.0.4"
            ln -sf libjq.so.1.0.4 "$OPT/lib/libjq.so.1"
            chmod 755 "$OPT/bin/jq" "$OPT/lib/libjq.so.1.0.4"
            write_wrapper jq
            if echo '{"ok":true}' | /usr/bin/jq -e .ok >/dev/null 2>&1; then
                echo "✅ $(/usr/bin/jq --version)"
            else
                echo "❌ jq does not run"; exit 1
            fi
            ;;
        tailscale)
            rm -rf "$OPT/Tailscale"
            mkdir -p "$OPT"
            cp -R "$SRC/Tailscale" "$OPT/Tailscale"
            chmod -R 755 "$OPT/Tailscale"
            echo "✅ Tailscale payload staged in $OPT/Tailscale"
            ;;
    esac
done

rm -rf "$SRC"
echo "✅ Dependencies installed: $COMPONENTS"
EOF

echo "✅ Deployment finished!"
