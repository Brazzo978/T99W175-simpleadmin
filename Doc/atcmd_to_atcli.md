# atcmd > atcli (guida rapida)

Questa guida rende ripetibile il passaggio dal bridge `socat-at-bridge` ad `atcli`
per usare direttamente `/dev/smd7`.

## 1) Disabilitare il bridge su smd7 (boot + runtime)

Nota: su questo modem `/etc` viene montato *dopo* l’avvio di systemd, quindi il
`mask` in `/etc/systemd/system` **non blocca** l’avvio al boot. Per disabilitare
in modo permanente bisogna rinominare i unit file in `/lib/systemd/system`.

```bash
systemctl stop socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service || true
mv /lib/systemd/system/socat-smd7.service /lib/systemd/system/socat-smd7.service.disabled
mv /lib/systemd/system/socat-smd7-to-ttyIN2.service /lib/systemd/system/socat-smd7-to-ttyIN2.service.disabled
mv /lib/systemd/system/socat-smd7-from-ttyIN2.service /lib/systemd/system/socat-smd7-from-ttyIN2.service.disabled
systemctl daemon-reload
```

Verifica:

```bash
systemctl is-active socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
ls -l /lib/systemd/system/socat-smd7*.service*
ps | grep -E "socat|ttyIN|ttyOUT" | grep -v grep
```

Atteso: `inactive`, file con suffisso `.disabled`, nessun processo socat.

## 1b) Disabilitare il bridge su smd11 (boot + runtime)

```bash
systemctl stop socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service || true
mv /lib/systemd/system/socat-smd11.service /lib/systemd/system/socat-smd11.service.disabled
mv /lib/systemd/system/socat-smd11-to-ttyIN.service /lib/systemd/system/socat-smd11-to-ttyIN.service.disabled
mv /lib/systemd/system/socat-smd11-from-ttyIN.service /lib/systemd/system/socat-smd11-from-ttyIN.service.disabled
systemctl daemon-reload
```

Verifica:

```bash
systemctl is-active socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
ls -l /lib/systemd/system/socat-smd11*.service*
ps | grep -E "socat|ttyIN|ttyOUT" | grep -v grep
```

Atteso: `inactive`, file con suffisso `.disabled`, nessun processo socat.

## 2) Installare `atcli` e `atcli_smd11` in `/usr/bin`

Puoi caricare `atcli` con `scp`, `sftp` oppure `adb` (se disponibile).


Esempio con `adb`:

```bash
adb push ./atcli /usr/bin/atcli
adb push ./atcli_smd11 /usr/bin/atcli
adb shell chmod 755 /usr/bin/atcli
adb shell chmod 755 /usr/bin/atcli_smd11
```

Se `/usr/bin` fosse in sola lettura, bisogna prima rimontarla RW:

```bash
adb shell mount -o remount,rw /
```

## 3) Permessi persistenti su /dev/smd7 e /dev/smd11 (udev)

Usa udev per applicare i permessi *ogni volta* che i device vengono creati.
Questo evita che al reboot o a reset modem i permessi tornino `root:root 600`.

```bash
cat >/etc/udev/rules.d/99-smd-perms.rules <<'EOF'
KERNEL=="smd7",  GROUP="radio", MODE="0660"
KERNEL=="smd11", GROUP="radio", MODE="0660"
EOF

udevadm control --reload-rules
udevadm trigger --action=add --name-match=smd7 --name-match=smd11
udevadm settle
```

Verifica:

```bash
ls -l /dev/smd7 /dev/smd11
```
Atteso: `crw-rw----` con gruppo `radio`.

## 4) Aggiungiamo www-data al gruppo radio 
```bash
sed -i 's/^radio:x:1001:mcm$/radio:x:1001:mcm,www-data/' /etc/group
```
 Controlliamo
```bash
grep '^radio:' /etc/group
```
 risultato atteso:
```bash
root@sdxprairie:~# grep '^radio:' /etc/group
radio:x:1001:mcm,www-data
```



## 5) Uso `atcli` (test rapido)

```bash
atcli ATI
```
E 
```bash
atcli_smd11 ATI
```
Se ritornano i comandi tutto dovrebbe andare bene 

## FATTO GLI STEP SUCCESSIVI SONO PER IL RITORNO A SIMPLEADMIN NON FARE







## 6) (Opzionale) Ripristino bridge

```bash
mv /lib/systemd/system/socat-smd7.service.disabled /lib/systemd/system/socat-smd7.service
mv /lib/systemd/system/socat-smd7-to-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-to-ttyIN2.service
mv /lib/systemd/system/socat-smd7-from-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-from-ttyIN2.service
systemctl daemon-reload
systemctl enable socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl start socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

```bash
mv /lib/systemd/system/socat-smd11.service.disabled /lib/systemd/system/socat-smd11.service
mv /lib/systemd/system/socat-smd11-to-ttyIN.service.disabled /lib/systemd/system/socat-smd11-to-ttyIN.service
mv /lib/systemd/system/socat-smd11-from-ttyIN.service.disabled /lib/systemd/system/socat-smd11-from-ttyIN.service
systemctl daemon-reload
systemctl enable socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl start socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

## 7) Rollback completo (mantieni `atcli`, ripristina servizi)

Se vuoi tornare al comportamento originale di `simpleadmin` mantenendo
`/usr/bin/atcli` installato, ripristina così:

```bash
mv /lib/systemd/system/socat-smd7.service.disabled /lib/systemd/system/socat-smd7.service
mv /lib/systemd/system/socat-smd7-to-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-to-ttyIN2.service
mv /lib/systemd/system/socat-smd7-from-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-from-ttyIN2.service
systemctl daemon-reload
systemctl enable socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl start socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

```bash
mv /lib/systemd/system/socat-smd11.service.disabled /lib/systemd/system/socat-smd11.service
mv /lib/systemd/system/socat-smd11-to-ttyIN.service.disabled /lib/systemd/system/socat-smd11-to-ttyIN.service
mv /lib/systemd/system/socat-smd11-from-ttyIN.service.disabled /lib/systemd/system/socat-smd11-from-ttyIN.service
systemctl daemon-reload
systemctl enable socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
systemctl start socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

Verifica:

```bash
systemctl is-active socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
systemctl is-enabled socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service
```

Atteso: `active` e `enabled`.
