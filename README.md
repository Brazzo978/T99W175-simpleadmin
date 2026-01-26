# Simpleadmin for Foxconn T99W175

Static web interface (HTML/JS with Bash CGI helpers) to administer Foxconn T99W175 modem. This version is heavily inspired by the work at [iamromulan/quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit) has some heavy edits to make it work with the T99W175 and some changes that i thought would make it better for us.

## Credits and thanks
- Original project: [iamromulan](https://github.com/iamromulan) – repo: [quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit).
- Core contributors for scripts, testing, and troubleshooting:
  - [1alessandro1](https://github.com/1alessandro1)
  - [stich86](https://github.com/stich86)


## Quick overview
- Responsive HTML pages (Bootstrap 5 + Alpine.js) served from the modem web partition.
- Bash CGI scripts in `www/cgi-bin/` that drive AT commands, Watchcat, TTL override, and utility actions.
- Front-end settings via `www/config/simpleadmin.conf`, here you can enable or disable the login page and the esim configuration page,by default login is on , and esim is off
```
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
Check [DOCUMENTAZIONE.md](DOCUMENTAZIONE.md) for file-by-file behavior, request flows, and how each page uses the CGI helpers.

## 🛠 Installation

Simpleadmin is designed to run directly on the Foxconn T99W175 inside the modem’s web partition.
Follow these steps to deploy it safely.


1 Download or clone the repository

2 Extract the ZIP and locate the www folder

3 Connect via SSH to the modem (default IP: 192.168.225.1, default user: root)

4 Locate the webserver folder and inside it find the current www directory

5 Delete or rename the existing www folder

6 Upload the freshly downloaded www folder from the repository

7 Give the www folder recursive 777 permissions:

```bash
chmod -R 777 /www
```

8 Either reboot the modem or restart the webserver:

```bash
systemctl restart qcmap_httpd.service
```

Browse to the GUI and use Simpleadmin


## 💬 Questions, Support & Requests

For any questions, feature requests or support, feel free to reach out on Telegram:

👉 [Telegram Group](https://t.me/ltesperimentazioni)


## Troubleshooting
Ssh password not known : connect the modem via usb and install needed driver if windows doesnt automatically , then connect to adb using adb shell and run passwd , then you can change root password , and you can use that to access ssh.

