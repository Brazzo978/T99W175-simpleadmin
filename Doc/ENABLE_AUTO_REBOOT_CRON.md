# Enable Auto Reboot (Cron) on QCPort Modem

Questa guida abilita la feature "Automatic reboot" in stile T99W175.
Obiettivo: far funzionare `/cgi-bin/reboot_schedule`, che salva la schedule in `/persist/cron/root`.

## Prerequisiti

- Accesso SSH root al modem
- File locali disponibili nel repo:
  - `T99W175-simpleadmin-Quectel-Test/scripts/init.d/crontab`
  - `T99W175-simpleadmin-Quectel-Test/scripts/systemd/crontab.service`
  - `www/cgi-bin/reboot_schedule` (versione aggiornata per ambiente `www-data`)

Esempio host:

```bash
MODEM_IP="100.94.198.63"
MODEM_USER="root"
MODEM_PASS="simpleadmin"
```

## 1) Copia file sul modem

```bash
sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  T99W175-simpleadmin-Quectel-Test/scripts/init.d/crontab \
  "$MODEM_USER@$MODEM_IP:/tmp/crontab.init.new"

sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  T99W175-simpleadmin-Quectel-Test/scripts/systemd/crontab.service \
  "$MODEM_USER@$MODEM_IP:/tmp/crontab.service.new"

sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  www/cgi-bin/reboot_schedule \
  "$MODEM_USER@$MODEM_IP:/usrdata/simpleadmin/www/cgi-bin/reboot_schedule"
```

## 2) Rimonta root in RW (come guida atcmd -> atcli)

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
mount -o remount,rw /
mount | grep " on / "
'
```

## 3) Installa script init + unit systemd (path T99)

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
set -e

TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /tmp/simpleadmin_backup_$TS

[ -f /etc/init.d/crontab ] && cp -a /etc/init.d/crontab /tmp/simpleadmin_backup_$TS/crontab.init.bak
[ -f /lib/systemd/system/crontab.service ] && cp -a /lib/systemd/system/crontab.service /tmp/simpleadmin_backup_$TS/crontab.service.bak

install -m 755 /tmp/crontab.init.new /etc/init.d/crontab
install -m 644 /tmp/crontab.service.new /lib/systemd/system/crontab.service
chmod 755 /usrdata/simpleadmin/www/cgi-bin/reboot_schedule

mkdir -p /lib/systemd/system/multi-user.target.wants
ln -sfn /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service

systemctl daemon-reload
systemctl start crontab

echo "Backup salvato in: /tmp/simpleadmin_backup_$TS"
'
```

## 4) Verifica funzionamento

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
systemctl status crontab --no-pager | sed -n "1,40p"
systemctl list-dependencies multi-user.target --no-pager | grep -i crontab || true
ps w | grep -E "[c]rond"
ls -ld /persist/cron
ls -l /persist/cron
grep -nE "server\\.username|server\\.groupname" /usrdata/simpleadmin/lighttpd.conf
'
```

Atteso:

- servizio `crontab.service` in stato `active (exited)`
- `crontab.service` presente tra le dipendenze di `multi-user.target`
- processo `crond` avviato con:
  - `-c /persist/cron`
  - log `-L /var/log/crontab.log`
- directory `/persist/cron` presente
- file `/persist/cron/root` presente e scrivibile dall'utente web (`server.username`/`server.groupname` di `lighttpd.conf`)

## 5) Cleanup file temporanei

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
rm -f /tmp/crontab.init.new /tmp/crontab.service.new
'
```

## 6) Test feature Auto Reboot da GUI

Prerequisiti GUI:

- `settings.html` con card "Automatic reboot" visibile (non `d-none`)
- endpoint `/cgi-bin/reboot_schedule` presente

Flusso:

1. Apri `System Settings`
2. Abilita `Automatic reboot`
3. Salva una schedule (es. ogni 24h)
4. Verifica che `/persist/cron/root` venga creato con riga cron

Verifica rapida:

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
[ -f /persist/cron/root ] && sed -n "1,20p" /persist/cron/root || echo "Nessuna schedule salvata"
'
```

## Rollback

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
systemctl stop crontab || true
rm -f /lib/systemd/system/multi-user.target.wants/crontab.service
rm -f /lib/systemd/system/crontab.service
rm -f /etc/init.d/crontab
systemctl daemon-reload
rm -rf /persist/cron
'
```

Se vuoi ripristinare versioni precedenti, usa i backup creati in `/tmp/simpleadmin_backup_<timestamp>/`.
