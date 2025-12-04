# Simpleadmin for Foxconn T99W175

Static web interface (HTML/JS with Bash CGI helpers) to administer Foxconn T99W175 modem. This version is heavily inspired by the work at [iamromulan/quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit) has some heavy edits to make it work with the T99W175 and some changes that i thought would make it better for me.

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
