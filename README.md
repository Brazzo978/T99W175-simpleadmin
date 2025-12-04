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
1. Download the project

Download the ZIP archive from GitHub or clone the repository:

git clone https://github.com/<your-username>/simpleadmin-t99w175

2. Extract the ZIP

Inside the extracted directory you will find the www folder.

3. Access the modem via SSH

Default connection parameters:

IP: 192.168.225.1  
User: root

ssh root@192.168.225.1

4. Locate the modem webserver directory

Identify the folder containing the active www directory
(e.g. /www, /var/www, or depending on firmware, the web partition path).

5. Remove or rename the existing www directory
mv /www /www_backup

6. Upload the new www directory

From your computer:

scp -r ./www root@192.168.225.1:/


Or copy it manually if already inside the modem.

7. Set recursive permissions on the www folder
chmod -R 777 /www

8. Restart the webserver (or reboot the modem)

Restart only the webserver:

systemctl restart qcmap_httpd.service


Or reboot the device:

reboot

9. Access the interface

Open a browser and go to:

http://192.168.225.1



## 💬 Questions, Support & Requests

For any questions, feature requests or support, feel free to reach out on Telegram:

👉 [Telegram Group](https://t.me/ltesperimentazioni)
