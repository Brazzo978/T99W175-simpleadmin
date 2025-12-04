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
- Front-end settings via `www/config/simpleadmin.conf`.

Check [DOCUMENTAZIONE.md](DOCUMENTAZIONE.md) for file-by-file behavior, request flows, and how each page uses the CGI helpers.

## 🛠 Installation

Simpleadmin is designed to run directly on the Foxconn T99W175 inside the modem’s web partition.
Follow these steps to deploy it safely.
1 Download or clone the repository
2 Extract the zip and locate the www folder 
3 Connect via ssh to the modem , the default ip is 192.168.225.1 and the default user is root 
4 locate the WEBSERVER folder and inside find the www folder 
5 delete or rename the current www folder 
6 upload the freshly downloaded one from the repo 
7 give the www folder 777 permission recursivly (chmod -R 777 /www)
8 either reboot the modem or launch from ssh systemctl restart qcmap_httpd.service
9 browse to the gui and enjoy


## 💬 Questions, Support & Requests

For any questions, feature requests or support, feel free to reach out on Telegram:

👉 [Telegram Group](https://t.me/ltesperimentazioni)
