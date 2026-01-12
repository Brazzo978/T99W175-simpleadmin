# Installing Init Scripts + systemd Services (Auto-Reboot, TTL Fix, eSIM Server)

This repository provides the scripts and service units required to enable:

* **Auto-reboot service** (via cron / crontab)
* **TTL override / TTL fix**
* **eSIM (euicc) server**

All required files are inside the repository `scripts/` directory.

---

## Files included in `scripts/`

From the current repo package, the `scripts/` folder contains:

* `scripts/init.d/crontab`
* `scripts/systemd/crontab.service`
* `scripts/systemd/euicc.service`
* `scripts/systemd/ttl-override.service`
* `scripts/ttl/ttl-override`
* `scripts/ttl/ttlvalue`

---

## 1) Install init.d script

Copy the init script into `/etc/init.d/`

Set permissions:

```bash
chmod 755 /etc/init.d/crontab
```

---

## 2) Install systemd service files

Copy the 3 `.service` files into `/lib/systemd/system/`:

```bash
Set permissions:
chmod 755 /lib/systemd/system/crontab.service
chmod 755 /lib/systemd/system/euicc.service
chmod 755 /lib/systemd/system/ttl-override.service
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

Set permissions:

```bash
chmod 755 /opt/scripts/ttl/ttl-override
chmod 755 /opt/scripts/ttl/ttlvalue
```

---

## 4) REQUIRED: create multi-user.target symlinks

This step is **required** in this setup.

Create the symlinks to ensure the services are pulled in by `multi-user.target`:

```bash
ln -s /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service
ln -s /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service
```

---

## 5) Enable and start services

Start services now:

```bash
systemctl start crontab
```

---

## 6) Reboot + Verify everything

Check service status:

```bash
systemctl status crontab 
crontab -c /persist/cron -l
```
