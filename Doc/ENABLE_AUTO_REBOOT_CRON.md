# Enable Auto Reboot (Cron)

---

## File necessari

- `scripts/init.d/crontab`
- `scripts/systemd/crontab.service`

---

## 1) Push file via ADB (dal PC)

### Init script
```bash
adb push scripts/init.d/crontab /etc/init.d/crontab
```

### systemd unit
```bash
adb push scripts/systemd/crontab.service /lib/systemd/system/crontab.service
```


---

## 2) Permessi (da shell sul modem)

### Init script (`/etc/init.d/crontab`) -> eseguibile
```sh
chmod 755 /etc/init.d/crontab
chown root:root /etc/init.d/crontab
ls -l /etc/init.d/crontab
```

Atteso:
- `-rwxr-xr-x`
- `root root`

### systemd unit (`/lib/systemd/system/crontab.service`) -> non eseguibile
```sh
chmod 644 /lib/systemd/system/crontab.service
chown root:root /lib/systemd/system/crontab.service
ls -l /lib/systemd/system/crontab.service
```

Atteso:
- `-rw-r--r--`
- `root root`


---

## 3) Ricarica systemd e avvia `crontab`

```sh
systemctl daemon-reload
systemctl start crontab
```

---

## 4) Abilitazione al boot (symlink manuale)

> In questo setup embedded si usa il symlink manuale invece di `systemctl enable`.

```sh
mkdir -p /lib/systemd/system/multi-user.target.wants
ln -sfn /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service
```

---

## 5) Verifica runtime (fondamentale)

```sh
systemctl status crontab --no-pager | sed -n '1,40p'
ps w | grep -E '[c]rond'
ls -ld /persist/cron
ls -l /persist/cron
```

### Atteso
- `crontab.service` in stato `active (exited)`
- `ExecStart=/etc/init.d/crontab start` con `status=0/SUCCESS`
- `crond` in esecuzione con:
  - `-L /var/log/crontab.log`
  - `-c /persist/cron`

Esempio:
```txt
● crontab.service - Crond wrapper
   Loaded: loaded (/lib/systemd/system/crontab.service; disabled; vendor preset: enabled)
   Active: active (exited)
  Process: ... ExecStart=/etc/init.d/crontab start (code=exited, status=0/SUCCESS)

... /bin/busybox.nosuid /usr/sbin/crond -L /var/log/crontab.log -c /persist/cron
```

---
## 6) Reboot + Verify everything

Check service status:

```bash
systemctl status crontab 
crontab -c /persist/cron -l
```
