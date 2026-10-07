# Installing Init Scripts + systemd Services (Auto-Reboot, TTL Fix, eSIM Server, Connection Watchdog)

`./install.sh` installs everything over SSH from the host PC;
the manual steps below are kept as a reference.

This repository provides the scripts and service units required to enable:

* **Auto-reboot service** (via cron / crontab)
* **TTL override / TTL fix**
* **eSIM (euicc) server**
* **Connection watchdog**

All required files are inside the repository `deploy/` directory, one folder per module.

---

## Install with install.sh

```bash
./install.sh [HOST]
```

Together with the web UI and the binaries, it copies the files over SSH
(default host `192.168.225.1`) and, on the modem:

* installs `/opt/scripts/ttl/ttl-override`,
  `/opt/scripts/watchdog/connection-watchdog` and `/etc/init.d/crontab`
* installs `/opt/scripts/Watchdog` (watchdog configuration) only when it is
  missing, so the settings saved from the UI are kept
* installs `crontab`, `ttl-override`, `connection-watchdog` and `euicc` units
  in `/lib/systemd/system`, then `systemctl daemon-reload`
* enables and restarts `crontab` (cron jobs in `/persist/cron`) and
  `ttl-override` (re-applies `/persist/ttlvalue`)
* enables and starts `connection-watchdog` only when `WD_ENABLED=1`, as the
  UI does
* enables and starts `euicc` only when `SIMPLEADMIN_ENABLE_ESIM=1` **and**
  `/home/root/euicc-sd-client` exists; otherwise it leaves it off

The eSIM service needs the `euicc-client` LPA server, which is not part of
this repository: copy it to `/home/root/euicc-sd-client` (executable) with
its `/home/root/client.yaml` before enabling eSIM. Without it the UI refuses
to enable the eSIM manager (`cgi-bin/toggle_esim` answers `client_missing`),
the installer keeps `euicc` off, and `euicc.service` skips its start
(`ConditionPathExists`) instead of restarting forever.

### Verify

```bash
ssh root@192.168.225.1 'systemctl status crontab.service ttl-override.service connection-watchdog.service --no-pager'
ssh root@192.168.225.1 'tail -n 30 /tmp/connection-watchdog.log'
```

---

## Manual install fallback

## Files involved

From `deploy/`:

* `deploy/crontab/init.d/crontab`
* `deploy/crontab/systemd/crontab.service`
* `deploy/euicc/systemd/euicc.service`
* `deploy/ttl/systemd/ttl-override.service`
* `deploy/watchdog/systemd/connection-watchdog.service`
* `deploy/ttl/scripts/ttl-override`
* `deploy/watchdog/scripts/connection-watchdog`

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
chmod 644 /lib/systemd/system/crontab.service
chmod 644 /lib/systemd/system/euicc.service
chmod 644 /lib/systemd/system/ttl-override.service
chmod 644 /lib/systemd/system/connection-watchdog.service
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
