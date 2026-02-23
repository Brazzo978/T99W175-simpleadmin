# Installing Init Scripts + systemd Services (Auto-Reboot, TTL Fix, eSIM Server, Connection Watchdog)

Beta: there is a cmd file to run in the same folder as the script folder , that tryes to deploy everything via adb autoomatically **use it with care** : deploy-new-feauture-adb.cmd

This repository provides the scripts and service units required to enable:

* **Auto-reboot service** (via cron / crontab)
* **TTL override / TTL fix**
* **eSIM (euicc) server**
* **Connection watchdog**
  

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
