# Enable Clean TTL Flow on 502 (T99-style CGI + stock firewall backend)

Questa procedura porta il TTL del 502 a una versione pulita:

- CGI `set_ttl` e `get_ttl_status` con session/auth (`session_utils.sh`)
- parsing input sicuro (niente `eval`)
- backend `ttl-override` senza regole duplicate
- persistenza valore TTL in `/usrdata/simplefirewall/ttlvalue`

## File usati dal repo

- `www/cgi-bin/set_ttl`
- `www/cgi-bin/get_ttl_status`
- `scripts/502/simplefirewall/ttl-override`
- `scripts/502/simplefirewall/ttl-override.service`

## 1) Backup sul modem

```bash
MODEM_IP="100.94.198.63"
MODEM_USER="root"
MODEM_PASS="simpleadmin"

sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
set -e
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /tmp/simpleadmin_backup_$TS
cp -a /usrdata/simpleadmin/www/cgi-bin/set_ttl /tmp/simpleadmin_backup_$TS/set_ttl.bak
cp -a /usrdata/simpleadmin/www/cgi-bin/get_ttl_status /tmp/simpleadmin_backup_$TS/get_ttl_status.bak
cp -a /usrdata/simplefirewall/ttl-override /tmp/simpleadmin_backup_$TS/ttl-override.bak
cp -a /lib/systemd/system/ttl-override.service /tmp/simpleadmin_backup_$TS/ttl-override.service.bak
echo "Backup: /tmp/simpleadmin_backup_$TS"
'
```

## 2) Copia file aggiornati

```bash
sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  www/cgi-bin/set_ttl "$MODEM_USER@$MODEM_IP:/usrdata/simpleadmin/www/cgi-bin/set_ttl"

sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  www/cgi-bin/get_ttl_status "$MODEM_USER@$MODEM_IP:/usrdata/simpleadmin/www/cgi-bin/get_ttl_status"

sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  scripts/502/simplefirewall/ttl-override "$MODEM_USER@$MODEM_IP:/usrdata/simplefirewall/ttl-override"

sshpass -p "$MODEM_PASS" scp -o StrictHostKeyChecking=accept-new \
  scripts/502/simplefirewall/ttl-override.service "$MODEM_USER@$MODEM_IP:/tmp/ttl-override.service.new"
```

## 3) Permessi + restart servizi

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
set -e
mount -o remount,rw /

chmod 755 /usrdata/simpleadmin/www/cgi-bin/set_ttl
chmod 755 /usrdata/simpleadmin/www/cgi-bin/get_ttl_status
chmod 755 /usrdata/simplefirewall/ttl-override
install -m 644 /tmp/ttl-override.service.new /lib/systemd/system/ttl-override.service
chmod 644 /lib/systemd/system/ttl-override.service

mkdir -p /lib/systemd/system/multi-user.target.wants
ln -sfn /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service

systemctl daemon-reload
systemctl restart ttl-override
rm -f /tmp/ttl-override.service.new
'
```

## 4) Verifica rapida

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
echo "== service =="
systemctl status ttl-override --no-pager | sed -n "1,20p"

echo "== ttl file =="
ls -l /usrdata/simplefirewall/ttlvalue || true
cat /usrdata/simplefirewall/ttlvalue 2>/dev/null || true

echo "== rules =="
/usr/sbin/iptables -w 5 -t mangle -S | grep TTL || true
/usr/sbin/ip6tables -w 5 -t mangle -S | grep HL || true
'
```

Atteso per una unit `Type=oneshot`: stato `inactive (dead)` con ultimo `ExecStart` riuscito.

## 5) Test CGI

Con login attivo serve cookie sessione admin.
Con login disattivo (`SIMPLEADMIN_ENABLE_LOGIN=0`) i test sotto funzionano direttamente.

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
echo "== set ttl 65 =="
QUERY_STRING="ttlvalue=65" REQUEST_METHOD=GET /usrdata/simpleadmin/www/cgi-bin/set_ttl

echo
echo "== get ttl status =="
REQUEST_METHOD=GET /usrdata/simpleadmin/www/cgi-bin/get_ttl_status

echo
echo "== disable ttl =="
QUERY_STRING="ttlvalue=0" REQUEST_METHOD=GET /usrdata/simpleadmin/www/cgi-bin/set_ttl
'
```

## 6) Rollback

Ripristina i file dal backup creato in `/tmp/simpleadmin_backup_<timestamp>/`.

Esempio:

```bash
sshpass -p "$MODEM_PASS" ssh -o StrictHostKeyChecking=accept-new "$MODEM_USER@$MODEM_IP" '
set -e
BK=/tmp/simpleadmin_backup_<timestamp>
cp -a "$BK/set_ttl.bak" /usrdata/simpleadmin/www/cgi-bin/set_ttl
cp -a "$BK/get_ttl_status.bak" /usrdata/simpleadmin/www/cgi-bin/get_ttl_status
cp -a "$BK/ttl-override.bak" /usrdata/simplefirewall/ttl-override
cp -a "$BK/ttl-override.service.bak" /lib/systemd/system/ttl-override.service
chmod 755 /usrdata/simpleadmin/www/cgi-bin/set_ttl /usrdata/simpleadmin/www/cgi-bin/get_ttl_status /usrdata/simplefirewall/ttl-override
chmod 644 /lib/systemd/system/ttl-override.service
systemctl daemon-reload
systemctl restart ttl-override
'
```
