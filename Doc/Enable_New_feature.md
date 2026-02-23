# Installing Init Scripts + systemd Services (Auto-Reboot, TTL Fix, eSIM Server, Connection Watchdog)

This repository provides the scripts and service units required to enable:

* **Auto-reboot service** (via cron / crontab)
* **TTL override / TTL fix**
* **eSIM (euicc) server**
* **Connection watchdog** (ICMP checks + CFUN/reboot recovery)

All required files are inside the repository `scripts/` directory.

---

## Files included in `scripts/`

From the current repo package, the `scripts/` folder contains:

* `scripts/init.d/crontab`
* `scripts/systemd/crontab.service`
* `scripts/systemd/euicc.service`
* `scripts/systemd/ttl-override.service`
* `scripts/systemd/connection-watchdog.service`
* `scripts/ttl/ttl-override`
* `scripts/ttl/ttlvalue`
* `scripts/watchdog/connection-watchdog`

---

## 1) Install init.d script

Copy the init script into `/etc/init.d/`

Set permissions:

```bash
chmod 755 /etc/init.d/crontab
```

---

## 2) Install systemd service files

Copy the `.service` files into `/lib/systemd/system/`:

```bash
cp scripts/systemd/crontab.service /lib/systemd/system/
cp scripts/systemd/euicc.service /lib/systemd/system/
cp scripts/systemd/ttl-override.service /lib/systemd/system/
cp scripts/systemd/connection-watchdog.service /lib/systemd/system/

# Set permissions
chmod 755 /lib/systemd/system/crontab.service
chmod 755 /lib/systemd/system/euicc.service
chmod 755 /lib/systemd/system/ttl-override.service
chmod 755 /lib/systemd/system/connection-watchdog.service
```

---

## 3) Install TTL scripts into /opt

The TTL scripts must live in:

* `/opt/scripts/ttl/`

Create the target directory if needed:

```bash
mkdir -p /opt/scripts/ttl
```

Copy the TTL scripts:

```bash
cp scripts/ttl/ttl-override /opt/scripts/ttl/
cp scripts/ttl/ttlvalue /opt/scripts/ttl/
```

Set permissions:

```bash
chmod 755 /opt/scripts/ttl/ttl-override
chmod 755 /opt/scripts/ttl/ttlvalue
```

---

## 4) Install Connection watchdog runtime script

The watchdog service executes this file:

* `/opt/scripts/watchdog/connection-watchdog`

Create the target directory and copy the script:

```bash
mkdir -p /opt/scripts/watchdog
cp scripts/watchdog/connection-watchdog /opt/scripts/watchdog/
chmod 755 /opt/scripts/watchdog/connection-watchdog
```

---

## 5) OPTIONAL: pre-create watchdog config file

The GUI endpoint `/cgi-bin/connection_watchdog` creates and updates:

* `/opt/scripts/Watchdog`

You can pre-create it manually (optional):

```bash
cat > /opt/scripts/Watchdog <<'EOF'
WD_ENABLED="1"
WD_TARGETS="1.1.1.1,8.8.8.8"
WD_FAIL_COUNT="3"
WD_CHECK_INTERVAL="10"
WD_PING_TIMEOUT_MS="5000"
WD_ACTION="cfun"
WD_CFUN_DELAY="5"
WD_BOOT_GRACE="600"
EOF
chmod 600 /opt/scripts/Watchdog
```

`WD_PING_TIMEOUT_MS=5000` sets the per-target ping probe timeout in milliseconds (example: `1500`).

`WD_BOOT_GRACE=600` means no CFUN/reboot action is executed while uptime is lower than 10 minutes.

---

## 6) REQUIRED: create multi-user.target symlinks

This step is **required** in this setup.

Create the symlinks to ensure the services are pulled in by `multi-user.target`:

```bash
ln -s /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service
ln -s /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service
ln -s /lib/systemd/system/connection-watchdog.service /lib/systemd/system/multi-user.target.wants/connection-watchdog.service
```

---

## 7) Enable and start services

Start services now:

```bash
systemctl daemon-reload
systemctl enable connection-watchdog.service
systemctl start connection-watchdog.service
systemctl start crontab
```

---

## 8) Reboot + Verify everything

Check service status:

```bash
systemctl status crontab 
systemctl status connection-watchdog.service
journalctl -u connection-watchdog.service -n 50 --no-pager
crontab -c /persist/cron -l
```
