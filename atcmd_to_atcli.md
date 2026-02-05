# atcmd > atcli (guida rapida)

Questa guida rende ripetibile il passaggio dal bridge `socat-at-bridge` ad `atcli`
per usare direttamente `/dev/smd7`.

## 1) Disabilitare il bridge su smd7 (boot + runtime)

```bash
systemctl stop socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service || true
systemctl disable socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service || true
systemctl mask socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service || true
```

Verifica:

```bash
systemctl is-active socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl is-enabled socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

Atteso: `inactive` e `masked`.

## 1b) Disabilitare il bridge su smd11 (boot + runtime)

```bash
systemctl stop socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service || true
systemctl disable socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service || true
systemctl mask socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service || true
```

Verifica:

```bash
systemctl is-active socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl is-enabled socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

Atteso: `inactive` e `masked`.

## 2) Installare `atcli` in `/usr/bin`

Puoi caricare `atcli` con `scp`, `sftp` oppure `adb` (se disponibile).

```bash
scp ./atcli root@<modem>:/usr/bin/atcli
ssh root@<modem> "chmod 755 /usr/bin/atcli"
```

Esempio con `sftp`:

```bash
sftp root@<modem>
put ./atcli /usr/bin/atcli
chmod 755 /usr/bin/atcli
bye
```

Esempio con `adb`:

```bash
adb push ./atcli /usr/bin/atcli
adb shell chmod 755 /usr/bin/atcli
```

Se `/usr/bin` fosse in sola lettura, rimonta prima la root in RW:

```bash
mount -o remount,rw /
```

## 2b) Installare `atcli_smd11` (GUI principale su /dev/smd11)

```bash
scp ./atcli_smd11 root@<modem>:/usrdata/simpleadmin/atcli_smd11
ssh root@<modem> "chmod 755 /usrdata/simpleadmin/atcli_smd11"
```

## 3) Permessi persistenti su /dev/smd7 e /dev/smd11

Creare servizio systemd per i permessi:

```bash
cat > /etc/systemd/system/atcli-perms.service <<'EOF'
[Unit]
Description=Fix permissions for /dev/smd7 and /dev/smd11 for atcli
After=dev-smd7.device dev-smd11.device
Before=lighttpd.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'for i in 1 2 3 4 5 6 7 8 9 10; do [ -e /dev/smd7 ] && [ -e /dev/smd11 ] && break; sleep 1; done; if [ -e /dev/smd7 ]; then chgrp radio /dev/smd7; chmod 660 /dev/smd7; fi; if [ -e /dev/smd11 ]; then chgrp radio /dev/smd11; chmod 660 /dev/smd11; fi'

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable atcli-perms.service
systemctl start atcli-perms.service
```

Verifica:

```bash
ls -l /dev/smd7 /dev/smd11
```

Atteso: `crw-rw----` con gruppo `radio`.

## 4) Configurazione uso porte (consigliata)

Per evitare contesa:

- **GUI (get_atcommand)** → `smd11` usando `/usrdata/simpleadmin/atcli_smd11`
- **Terminale GUI (user_atcommand)** → `smd7` usando `/usr/bin/atcli`

## 5) Uso `atcli` (test rapido)

```bash
/usr/bin/atcli ATI
/usr/bin/atcli 'AT+QENG="servingcell"'
/usr/bin/atcli AT+QCAINFO
```

## 6) (Opzionale) Ripristino bridge

```bash
systemctl unmask socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl enable socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl start socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

```bash
systemctl unmask socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl enable socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl start socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

## 7) Rollback completo (mantieni `atcli`, ripristina servizi)

Se vuoi tornare al comportamento originale di `simpleadmin` mantenendo
`/usr/bin/atcli` installato, ripristina così:

```bash
systemctl unmask socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl enable socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl start socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

```bash
systemctl unmask socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl enable socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl start socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

Verifica:

```bash
systemctl is-active socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl is-enabled socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

Atteso: `active` e `enabled`.
