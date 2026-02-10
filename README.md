# Simple RM/RG502 — SimpleT99 flavor port

Static web interface (HTML/JS + Bash CGI helpers) to administer **Quectel RM/RG502** modems.

> **WIP WIP WIP** — this is an Alpha 

---

## ✅ What’s working

* **Home page** with signal reporting is completely ported ✅

  * SIM unlock ✅
  * temperature ✅
  * ping check ✅
* **Device information** panel is fully working with all the data ✅
* **Dark / Light theme** fully ok ✅
* **Advanced signal details** fully working ✅ *(antenna map may be inaccurate)*
* **Radio settings** page fully working ✅

  * band lock for **4G / 5G NSA / 5G SA** works in real time like T99
* **APN settings** work ✅ *(a bit buggy but works)*
* **Preferred network** works *(I think)*
* **Cell locking** works as intended ✅ *(4G and 5G SA)*
* **System settings** work as intended ✅
* **Advanced page** works *(mostly)*
* **SMS page** works *(at least I think)*

---

## ❌ What is not working / not present / not working as intended

* All the **beta features from T99 beta** are **not ported** and will not be until stable release for T99.
* **TTL patch** and **auto-reboot** are on the way, but for now are **disabled**.
* This module **at-chat is slower**: filling in complex areas of the GUI might require more time.

  * Example: radio settings populates differently from T99 version; here there is priority since it’s really slower:

    * **Band > APN > preferred network > cell locking**
  * As a result, sometimes cell lock could stay as **unknown** for some seconds after the first load of the page.
    Don’t worry, it will eventually populate the data.
* **IMEI repair is not working** right now (even if enabled because I am too lazy to disable it).

  * ⚠️ **DO NOT TRY IT** — it could do damage to **EFS**.
* **Cell scanner is not implemented yet**.

  * This modem has more AT commands to scan nearby cells and will later get a dedicated page to scan nearby cells with the possibility to lock on those.

---



## 🎥 START_GUIDE.MP4



## Quick overview

* Responsive HTML pages (Bootstrap 5 + Alpine.js) served from the modem web partition.
* Bash CGI scripts in `www/cgi-bin/` that drive AT commands, Watchcat, TTL override, and utility actions.
* Front-end settings via `www/config/simpleadmin.conf`.

---

## Configuration

File: `www/config/simpleadmin.conf`

```bash
# SimpleAdmin configuration
# Set to 0 to completely disable login and allow open access.
# Set to 1 (default) to require user login.
SIMPLEADMIN_ENABLE_LOGIN=1

# eSIM management page (requires the intermediate euicc-client server)
# Set to 1 to show and enable the eSIM management UI, 0 to hide it.
SIMPLEADMIN_ENABLE_ESIM=0

# Base URL for the eSIM intermediate server (default: local euicc-client API)
SIMPLEADMIN_ESIM_BASE_URL="http://localhost:8080/api/v1"
```

Check `DOCUMENTAZIONE.md` for file-by-file behavior, request flows, and how each page uses the CGI helpers.

---

## 🛠 Installation

Simpleadmin is designed to run directly on the modem inside the modem’s web partition.

### Steps

1. Download or clone the repository
2. Extract the ZIP and locate the `www` folder
3. Connect via SSH to the modem (default IP: `192.168.225.1`, default user: `root`)
4. Locate the webserver folder and find the current `www` directory

   * In iamromulan firmware: `/usrdata/simpleadmin/` contains the `www` folder
5. Delete or rename the existing `www` folder
6. Upload the freshly downloaded `www` folder from the repository
7. Give the `www` folder recursive 777 permissions:

```bash
chmod -R 777 /www
```

8. Either reboot the modem or restart the webserver
9. Switch the AT method: follow [`atcmd_to_atcli.md`](atcmd_to_atcli.md) to switch from iamromulan method to the faster atcli

```bash
systemctl restart idktheservicenameyet
```

Browse to the GUI and use Simpleadmin.

---

## AT backend change (important)

Removed iamromulan complex structure to use **atcmd** to talk to modem AT (smd7 + smd11 in this modem).

On stock iamromulan firmware it uses:

* `socat` to make a virtual TTY interface
* a shell binary to talk to the tty called `atcmd`
* then simpleadmin calls `atcmd` to talk to AT
* `atcmd` talks to `socat` on the corresponding tty port
* and some systemd service talks with `cat` to the smdX

Since we found a faster method, I made detailed instructions to switch from its method to ours in [`atcmd_to_atcli.md`](atcmd_to_atcli.md)

We use a binary pulled from an x55 modem that talks directly to the smdX device with no overhead:

* **`atcli_smdX`**

---

## Credits and thanks

* Original project: [iamromulan](https://github.com/iamromulan) — repo: [quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit)
* Core contributors for scripts, testing, and troubleshooting:

  * [1alessandro1](https://github.com/1alessandro1)
  * [stich86](https://github.com/stich86)
  * [gionag](https://github.com/gionag)

---

## 💬 Questions, Support & Requests

Telegram group: [https://t.me/ltesperimentazioni](https://t.me/ltesperimentazioni)
