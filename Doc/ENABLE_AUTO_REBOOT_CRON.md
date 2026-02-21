# Enable Auto Reboot (Cron) on Quectel rm502q  WIP WIP WIP 



## 1) Copia file sul modem
T99W175-simpleadmin-Quectel-Test/scripts/init.d/crontab 
T99W175-simpleadmin-Quectel-Test/scripts/systemd/crontab.service \





## 2) Rimonta root in RW (come guida atcmd -> atcli)

```bash
mount -o remount,rw /
verifica: 
mount | grep " on / "
'
```

## 3) Installa script init + unit systemd (path T99)


mkdir -p /lib/systemd/system/multi-user.target.wants
ln -sfn /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service

systemctl daemon-reload
systemctl start crontab


'
```

## 4) Verifica funzionamento

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
