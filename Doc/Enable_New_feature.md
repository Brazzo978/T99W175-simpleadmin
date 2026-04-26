# Installing Init Scripts + systemd Services (Auto-Reboot, TTL Fix, eSIM Server, Connection Watchdog)

Starting from **Simple T99-1.0.5**, the recommended upgrade path is the
modem-side payload updater. The host PC only copies the payload and starts the
upgrade script; all checks, file installs, permissions, service symlinks and
service restarts are handled inside the modem.

The older manual steps are still documented below as a fallback/reference.

This repository provides the scripts and service units required to enable:

* **Auto-reboot service** (via cron / crontab)
* **TTL override / TTL fix**
* **eSIM (euicc) server**
* **Connection watchdog**
  

All required files are inside the repository `scripts/` directory.

---

## Recommended: upgrade with the 1.0.5 payload

Build the payload on the host PC:

```bash
./tools/build-upgrade-payload.sh
```

This creates:

```text
dist/simpleadmin-1.0.5-payload
```

### ADB deploy

Run only these commands from the host PC:

```bash
adb push dist/simpleadmin-1.0.5-payload /tmp/simpleadmin-1.0.5-payload
adb shell sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh
```

If a previous payload copy exists on the modem, clean it first:

```bash
adb shell rm -rf /tmp/simpleadmin-1.0.5-payload
adb push dist/simpleadmin-1.0.5-payload /tmp/simpleadmin-1.0.5-payload
adb shell sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh
```

### SSH deploy

Run only these commands from the host PC:

```bash
scp -r dist/simpleadmin-1.0.5-payload root@192.168.225.1:/tmp/simpleadmin-1.0.5-payload
ssh root@192.168.225.1 'sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh'
```

If a previous payload copy exists on the modem, clean it first:

```bash
ssh root@192.168.225.1 'rm -rf /tmp/simpleadmin-1.0.5-payload'
scp -r dist/simpleadmin-1.0.5-payload root@192.168.225.1:/tmp/simpleadmin-1.0.5-payload
ssh root@192.168.225.1 'sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh'
```

### What the updater does inside the modem

The updater:

* updates `/WEBSERVER/www`
* preserves existing `www/config/simpleadmin.conf`
* preserves existing `www/cgi-bin/credentials.txt`
* installs/repairs watchdog files in `/opt/scripts`
* installs/repairs TTL override files and resets invalid `/persist/ttlvalue` to `0`
* installs/repairs crontab init script
* installs/repairs systemd service files
* creates required `multi-user.target.wants` symlinks
* runs `systemctl daemon-reload`
* enables and starts required services
* restarts `qcmap_httpd.service`
* verifies that `Simple T99-1.0.5` is installed

### Verify after upgrade

```bash
adb shell 'grep "Simple T99-1.0.5" /WEBSERVER/www/js/app-version.js'
adb shell 'systemctl status crontab.service ttl-override.service connection-watchdog.service qcmap_httpd.service --no-pager'
adb shell 'tail -n 30 /tmp/connection-watchdog.log'
```

Or with SSH:

```bash
ssh root@192.168.225.1 'grep "Simple T99-1.0.5" /WEBSERVER/www/js/app-version.js'
ssh root@192.168.225.1 'systemctl status crontab.service ttl-override.service connection-watchdog.service qcmap_httpd.service --no-pager'
ssh root@192.168.225.1 'tail -n 30 /tmp/connection-watchdog.log'
```

---

## Manual install fallback

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
Copy the files

Set permissions:

```bash
chmod 755 /opt/scripts/ttl/ttl-override
chmod 755 /opt/scripts/ttl/ttlvalue
```

---

## 4) Install Connection watchdog runtime script

The watchdog service executes this file:

* `/opt/scripts/watchdog/connection-watchdog`

Create the target directory:

```bash
mkdir -p /opt/scripts/watchdog
```
Copy the file
Set permissions:
```bash
chmod 755 /opt/scripts/watchdog/connection-watchdog
```

---



## 5) REQUIRED: create multi-user.target symlinks

This step is **required** in this setup.

Create the symlinks to ensure the services are pulled in by `multi-user.target`:

```bash
ln -s /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service
ln -s /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service
ln -s /lib/systemd/system/connection-watchdog.service /lib/systemd/system/multi-user.target.wants/connection-watchdog.service
```

---

## 6) Enable and start services

Start services now:

```bash
systemctl daemon-reload
systemctl enable connection-watchdog.service
systemctl start connection-watchdog.service
systemctl start crontab
```

---

## 7) Reboot + Verify everything

Check service status:

```bash
systemctl status crontab 
systemctl status connection-watchdog.service
journalctl -u connection-watchdog.service -n 50 --no-pager
crontab -c /persist/cron -l
```
