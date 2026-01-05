#!/bin/bash

# Deployment script to copy www directory and update remote server
# Usage: ./deploy-www.sh [HOST] [OPTIONS]
#   HOST      : Remote host IP/address (default: 192.168.225.1)
#   Options:
#     --nologin  : Set SIMPLEADMIN_ENABLE_LOGIN=0 in config
#     --noesim   : Set SIMPLEADMIN_ENABLE_ESIM=0 in config

set -e  # Exit on error

REMOTE_USER="root"
SOURCE_DIR="./www"
REMOTE_TMP="/tmp"
REMOTE_WEB_DIR="/WEBSERVER"

# Parse command line arguments
# First argument can be the host (if not starting with --)
REMOTE_HOST="192.168.225.1"  # Default
DISABLE_LOGIN=0
DISABLE_ESIM=0

if [ $# -gt 0 ] && [[ ! "$1" =~ ^-- ]]; then
    REMOTE_HOST="$1"
    shift  # Remove first argument from $@
fi

for arg in "$@"; do
    case $arg in
        --nologin)
            DISABLE_LOGIN=1
            ;;
        --noesim)
            DISABLE_ESIM=1
            ;;
        *)
            # Unknown option
            ;;
    esac
done

echo "Starting deployment to ${REMOTE_USER}@${REMOTE_HOST}..."
if [ $DISABLE_LOGIN -eq 1 ]; then
    echo "  - Will disable login (SIMPLEADMIN_ENABLE_LOGIN=0)"
fi
if [ $DISABLE_ESIM -eq 1 ]; then
    echo "  - Will disable eSIM (SIMPLEADMIN_ENABLE_ESIM=0)"
fi

# Step 1: Copy www directory to remote /tmp
echo "Copying ${SOURCE_DIR} to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP}..."
scp -rO "${SOURCE_DIR}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP}"

# Step 2: Execute remote commands via SSH
echo "Executing remote commands..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" << EOF
    echo "Stopping qcmap_httpd.service..."
    systemctl stop qcmap_httpd.service
    
    echo "Removing old /WEBSERVER/www directory..."
    rm -rfv /WEBSERVER/www
    
    echo "Moving /tmp/www to /WEBSERVER..."
    mv /tmp/www /WEBSERVER
    
    echo "Setting permissions on /WEBSERVER/www..."
    chmod -R 755 /WEBSERVER/www
    
    # Modify config file if options are set
    CONFIG_FILE="/WEBSERVER/www/config/simpleadmin.conf"
    if [ -f "\$CONFIG_FILE" ]; then
        if [ $DISABLE_LOGIN -eq 1 ]; then
            echo "Disabling login in config..."
            sed -i 's/^SIMPLEADMIN_ENABLE_LOGIN=.*/SIMPLEADMIN_ENABLE_LOGIN=0/' "\$CONFIG_FILE"
        fi
        if [ $DISABLE_ESIM -eq 1 ]; then
            echo "Disabling eSIM in config..."
            sed -i 's/^SIMPLEADMIN_ENABLE_ESIM=.*/SIMPLEADMIN_ENABLE_ESIM=0/' "\$CONFIG_FILE"
        fi
    else
        echo "Warning: Config file \$CONFIG_FILE not found!"
    fi
    
    echo "Starting qcmap_httpd.service..."
    systemctl start qcmap_httpd.service
    
    echo "Deployment completed successfully!"
EOF

echo "Deployment finished!"
