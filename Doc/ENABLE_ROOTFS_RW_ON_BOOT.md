## Obiettivo 

Sul 502 la root tornara `ro` al boot. Per forzare rw, creiamo una unit systemd che forza:

```bash
mount -o remount,rw /
```

## 1) Crea la unit (path consigliato: /lib/systemd/system)

Nota: su questi modem le modifiche in `/etc/systemd/system` possono non essere affidabili al boot molto early.
Usare `/lib/systemd/system` e symlink in `multi-user.target.wants` e' il metodo piu' stabile.

## 2) Installazione e attivazione

```bash
mount -o remount,rw /

cat >/lib/systemd/system/rootfs-rw.service <<'EOF'
[Unit]
Description=Remount root filesystem as read-write
DefaultDependencies=no
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/mount -o remount,rw /
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

chmod 644 /lib/systemd/system/rootfs-rw.service
mkdir -p /lib/systemd/system/multi-user.target.wants
ln -sfn /lib/systemd/system/rootfs-rw.service /lib/systemd/system/multi-user.target.wants/rootfs-rw.service

systemctl daemon-reload
systemctl start rootfs-rw.service
```

## 3) Verifica runtime

```bash
systemctl status rootfs-rw.service --no-pager
mount | grep " on / "
```

Atteso:

- `rootfs-rw.service` in stato `active (exited)`
- mount root con flag `rw`

## 4) Verifica persistenza dopo reboot

```bash
reboot
```

Dopo reboot:

```bash
systemctl status rootfs-rw.service --no-pager | sed -n '1,20p'
mount | grep " on / "
```

## 5) Rollback

```bash
systemctl stop rootfs-rw.service || true
rm -f /lib/systemd/system/multi-user.target.wants/rootfs-rw.service
rm -f /lib/systemd/system/rootfs-rw.service
systemctl daemon-reload
```

