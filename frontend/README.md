# SimpleAdmin web interface

Next.js (static export) + React + shadcn/ui interface for the Foxconn
T99W175, forked from the [QManager](https://github.com/dr-dolomite/QManager-RM520N)
frontend by DrDolomite at upstream commit `7a7007c`.

## License

The code taken from QManager is under the MIT License with the Commons
Clause condition (`LICENSE`): it may be used, modified and shared, and may
not be sold, nor offered as a paid product or service. That notice ships
with every copy. `DESIGN.md` is QManager's design system, kept as the
reference for the visual rules (its font is replaced here by Geist).

## Layout

| Path | What |
|---|---|
| `app/` | routes: `/dashboard`, `/login`, `/about-device`, `/reboot` |
| `components/` | QManager components; `nav-group.tsx` drives the sidebar, `classic: true` entries open the classic HTML pages |
| `lib/bridge/` | WebSocket store for diag_bridge (9001) and system_bridge (9002), DIAG/QMI selection, `ModemStatus` adapter |
| `hooks/` | data hooks; `use-modem-status`, `use-signal-history`, `use-about-device` read the bridges |
| `lib/modem-actions.ts` | user-triggered AT commands through `cgi-bin/user_atcommand` |
| `locales/` | en and it strings, bundled into the JS (namespaces not used yet stay out of the bundle) |

## Build

```bash
./build.sh
```

Publishes the export to `../deploy/www-app/`, which `../install.sh` merges
into the web root. There is no dev server setup: the bridges only accept
WebSockets whose Origin matches the host, so test the build on the modem,
or serve it locally with `/cgi-bin` proxied to the modem and ports
9001/9002 forwarded.
