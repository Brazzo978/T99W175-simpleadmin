# Enable RootFS RW at Boot (502) - Reference from T99

Questa guida spiega come abilitare il remount della root (`/`) in `rw` ad ogni boot sul 502.
Include anche cosa fa il T99, per confronto.

## Cosa fa il T99 (verificato)

Sul T99 non emerge un servizio custom che esegue esplicitamente `mount -o remount,rw /`.

Meccanismo osservato:

- root gia' montata `rw` al boot (`ubi0:rootfs on / ... (rw,...)`)
- presenza di mount unit systemd:
  - `/lib/systemd/system/systemrw.mount`
  - `/lib/systemd/system/systemrw-ubi.mount`
- varie unit `systemrw-*.service` che bind-mountano file/dir da `/systemrw` verso `/etc/...`

Quindi: sul T99 la persistenza RW viene gestita da systemd + layout UBI, non da uno script init.d singolo.

## Obiettivo sul 502

Sul 502 la root puo' tornare `ro` al boot. Per allineare il comportamento operativo, creiamo una unit systemd che forza:

```bash
mount -o remount,rw /
```

## 1) Crea la unit (path consigliato: /lib/systemd/system)

Nota: su questi modem le modifiche in `/etc/systemd/system` possono non essere affidabili al boot molto early.
Usare `/lib/systemd/system` e symlink in `multi-user.target.wants` e' il metodo piu' stabile.

File: `/lib/systemd/system/rootfs-rw.service`

```ini
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
```

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

