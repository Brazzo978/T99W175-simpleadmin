# atcmd → atcli (quick guide)

This guide makes the migration from the `socat-at-bridge` approach to `atcli`, so you can talk directly and faster to `/dev/smd7` and `/dev/smd11`.

---

## 1) Disable the socat bridge (smd7 + smd11) — runtime + boot

> **Note:** on this modem `/etc` is mounted *after* systemd starts i think, so using `mask` in
> `/etc/systemd/system` **does not prevent** the service from starting at boot.
> To permanently disable it, rename the unit files in `/lib/systemd/system`.

### Stop services (runtime)

```bash
systemctl stop \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service \
  || true
```

### Disable at boot (rename unit files)

```bash
mv /lib/systemd/system/socat-smd7.service /lib/systemd/system/socat-smd7.service.disabled
mv /lib/systemd/system/socat-smd7-to-ttyIN2.service /lib/systemd/system/socat-smd7-to-ttyIN2.service.disabled
mv /lib/systemd/system/socat-smd7-from-ttyIN2.service /lib/systemd/system/socat-smd7-from-ttyIN2.service.disabled

mv /lib/systemd/system/socat-smd11.service /lib/systemd/system/socat-smd11.service.disabled
mv /lib/systemd/system/socat-smd11-to-ttyIN.service /lib/systemd/system/socat-smd11-to-ttyIN.service.disabled
mv /lib/systemd/system/socat-smd11-from-ttyIN.service /lib/systemd/system/socat-smd11-from-ttyIN.service.disabled

systemctl daemon-reload
```

### Verify

```bash
systemctl is-active \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service

ls -l /lib/systemd/system/socat-smd7*.service* /lib/systemd/system/socat-smd11*.service*
ps | grep -E "socat|ttyIN|ttyOUT" | grep -v grep
```

**Expected:**

* `inactive`
* unit files with `.disabled` suffix
* no `socat` processes

---

## 2) Install `atcli` to `/usr/bin`

You can upload `atcli` via `scp`, `sftp`, or `adb`.


### adb

```bash
adb push atcli /usr/bin/atcli
adb push atcli_smd11 /usr/bin/atcli_smd11
adb shell chmod 755 /usr/bin/atcli
adb shell chmod 755 /usr/bin/atcli_smd11
```

If `/usr/bin` is read-only, remount root as RW first:

```bash
mount -o remount,rw /

```
or using adb

```bash
adb shell mount -o remount,rw /

```

---

## 3) Persistent permissions for `/dev/smd7` and `/dev/smd11` (udev)

Use udev rules to apply permissions **every time** the devices are created.
This avoids permissions reverting to `root:root 600` after reboot or modem reset.

```bash
cat >/etc/udev/rules.d/99-smd-perms.rules <<'EOF'
KERNEL=="smd7",  GROUP="radio", MODE="0660"
KERNEL=="smd11", GROUP="radio", MODE="0660"
EOF

udevadm control --reload-rules
udevadm trigger --action=add --name-match=smd7 --name-match=smd11
udevadm settle
```

### Verify

```bash
ls -l /dev/smd7 /dev/smd11
```

**Expected:** `crw-rw----` with group `radio`.

---


## 4) Testing `atcli` 

```bash
atcli ATI
atcli 'AT+QENG="servingcell"'
atcli AT+QCAINFO
```

---

## 5) Quick CGI test (from GUI)

Requires a valid session (login completed on webgui or login disabled in config).

```bash
sess=$(tail -n 1 /tmp/simpleadmin_sessions.txt | cut -d: -f1)
HTTP_COOKIE="simpleadmin_session=$sess" QUERY_STRING="atcmd=ATI" /usrdata/simpleadmin/www/cgi-bin/get_atcommand
```

---

If the previous command did work congratulations you are setup correctly , a reboot might be required.




## REVERT TO ATCMD





## Restore the socat bridge (smd7 + smd11)

```bash
# Restore unit files
mv /lib/systemd/system/socat-smd7.service.disabled /lib/systemd/system/socat-smd7.service
mv /lib/systemd/system/socat-smd7-to-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-to-ttyIN2.service
mv /lib/systemd/system/socat-smd7-from-ttyIN2.service.disabled /lib/systemd/system/socat-smd7-from-ttyIN2.service

mv /lib/systemd/system/socat-smd11.service.disabled /lib/systemd/system/socat-smd11.service
mv /lib/systemd/system/socat-smd11-to-ttyIN.service.disabled /lib/systemd/system/socat-smd11-to-ttyIN.service
mv /lib/systemd/system/socat-smd11-from-ttyIN.service.disabled /lib/systemd/system/socat-smd11-from-ttyIN.service

systemctl daemon-reload

# Enable + start
systemctl enable \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service

systemctl start \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

---

## Full rollback (keep `atcli`, restore original services)

If you want to go back to the original `simpleadmin` behavior while keeping
`/usr/bin/atcli` installed, restore services as follows:

```bash
# Same as section 6 (restore + enable + start)
# After that, verify:
systemctl is-active \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service

systemctl is-enabled \
  socat-smd7-to-ttyIN2.service socat-smd7-from-ttyIN2.service socat-smd7.service \
  socat-smd11-to-ttyIN.service socat-smd11-from-ttyIN.service socat-smd11.service
```

**Expected:** `active` and `enabled`.
