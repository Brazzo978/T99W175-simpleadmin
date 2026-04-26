# Tailscale Integration

## Overview

This repository includes a complete Tailscale integration for the Foxconn T99W175 modem.

The implementation does not use the stock upstream package directly on the modem. Instead, it uses:

- a custom embedded Tailscale build for `linux/arm`
- a deploy script stored in the repository
- a Web UI integration exposed through Bash CGI helpers

This approach was chosen because the official Tailscale ARM package is too large for the persistent writable space available on this modem.

## What is used

The current Tailscale integration is built from these repository files:

- `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`
- `Tailscale/VERSION.md`
- `Tailscale/install_tailscale_modem.sh`
- `Tailscale/build_tailscale_modem.sh`
- `www/cgi-bin/tailscale`
- `www/cgi-bin/tailscale-helper`
- `www/advanced.html`
- `www/js/advanced.js`

## Why a custom build is used

The modem has very limited writable persistent storage. The official Tailscale package was not suitable as-is for this target.

The deployed binary is:

- built for `linux/arm` with `GOARM=7`
- produced as a combined `tailscaled` + CLI binary
- built with a reduced feature set for embedded use
- UPX-compressed to fit inside the modem writable partition

The integration is designed only for the required use case:

- remote access to the modem through the tailnet
- no auto-update logic inside the binary
- no Web client UI requirement
- no Tailscale SSH requirement
- no route acceptance by default
- no exit-node usage by default

## Repository layout

### `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`

Custom modem-compatible Tailscale binary published in the repository and downloaded by the installer.

### `Tailscale/VERSION.md`

Version metadata used by the installer to determine whether an update is needed.

Expected format:

```md
- Current-Version: `1.94.2-modem.2`
```

### `Tailscale/install_tailscale_modem.sh`

Main installer, updater, and removal script used both manually and by the Web UI helper.

Supported modes:

- install: default mode
- update: `-U`
- remove: `-R`

### `Tailscale/build_tailscale_modem.sh`

Build helper that:

- discovers the latest stable upstream version
- clones the official Tailscale source
- applies the modem local API patch
- builds the ARMv7 modem binary
- compresses it with UPX
- writes `Tailscale/VERSION.md`

### `www/cgi-bin/tailscale`

Authenticated CGI endpoint used by the Web UI.

It exposes these actions:

- `status`
- `install`
- `remove`
- `update`
- `login`
- `up`
- `down`

### `www/cgi-bin/tailscale-helper`

Thin helper used by the CGI endpoint to:

- fetch the installer from GitHub
- execute install/update/remove
- rewrite the local config when a new auth key is applied
- start or stop the systemd service

### `www/advanced.html` and `www/js/advanced.js`

Frontend integration for the Tailscale card in the Advanced page.

The GUI currently supports:

- install with auth key
- apply a new auth key
- refresh status
- update
- start
- stop
- remove
- full `tailscale status` output display

## How the installation works

The installation flow is:

1. The user interacts with the Tailscale card in the Web UI.
2. The page calls `/cgi-bin/tailscale`.
3. The CGI script validates the session and selected action.
4. The CGI script calls `www/cgi-bin/tailscale-helper`.
5. The helper downloads `Tailscale/install_tailscale_modem.sh` from the repository.
6. The installer downloads the published Tailscale binary and version metadata from the repository.
7. The installer writes the local config, installs the binary, creates the service, and starts Tailscale.

This means the Web UI does not embed the installer itself. It always pulls the current installer and binary from the repository.

## Files deployed on the modem

The installer writes the following runtime files:

- binary: `/data/tailscale/tailscaled`
- local CLI symlink: `/data/tailscale/tailscale`
- public CLI symlink: `/usr/bin/tailscale`
- daemon symlink: `/usr/bin/tailscaled`
- config: `/data/tailscale/config.json`
- state: `/data/tailscale/tailscaled.state`
- version metadata: `/data/tailscale/VERSION.md`
- systemd unit: `/lib/systemd/system/tailscaled.service`
- socket: `/var/run/tailscale/tailscaled.sock`

## Service behavior

The systemd unit starts Tailscale with:

- config file from `/data/tailscale/config.json`
- state file from `/data/tailscale/tailscaled.state`
- standard socket path `/var/run/tailscale/tailscaled.sock`

This makes the modem behave like a more standard Tailscale installation and allows `tailscale status` to work locally on the patched build.

## Configuration used

The installer writes a minimal config file with these defaults:

- `Enabled: true`
- `AcceptDNS: false`
- `AcceptRoutes: false`
- `RunSSHServer: false`
- `RunWebClient: false`

An auth key is required for first install unless a valid config already exists on the modem.

## Manual usage

The installer can also be used manually on the modem.

Install:

```sh
sh install_tailscale_modem.sh -k 'tskey-auth-...'
```

Update:

```sh
sh install_tailscale_modem.sh -U
```

Remove:

```sh
sh install_tailscale_modem.sh -R
```

## Building a new modem binary

To build a fresh modem-compatible Tailscale binary from upstream source:

```sh
cd Tailscale
./build_tailscale_modem.sh
```

To build a specific upstream release:

```sh
./build_tailscale_modem.sh --version 1.94.2 --revision 2
```

To print the latest stable version detected from upstream:

```sh
./build_tailscale_modem.sh --print-latest
```

Detailed build notes are in `Tailscale/BUILD.md`.

## Web UI usage

From the Advanced page Tailscale card:

- `Install` performs a fresh installation using the provided auth key
- `Apply Key` updates the local config with a new auth key and restarts the service
- `Refresh` reads modem status
- `Update` checks repository version metadata and updates only when needed
- `Start` starts `tailscaled.service`
- `Stop` stops `tailscaled.service`
- `Remove` uninstalls the Tailscale deployment from the modem

The status area shows:

- a compact summary line
- the full raw output of `tailscale status`

## Update logic

Updates are controlled by `Tailscale/VERSION.md`.

The installer:

1. downloads the remote version file
2. extracts `Current-Version`
3. compares it with `/data/tailscale/VERSION.md`
4. skips the update if both versions match

Changing the version string in `VERSION.md` is enough to trigger a new modem update path when the binary has been replaced.

## Verified behavior

The following has been tested successfully on the target modem:

- clean install from repository
- clean removal
- reinstall after removal
- service creation and boot-time style behavior through systemd
- local `tailscale status`
- status reporting in the Web UI
- start and stop actions from the Web UI
- update action from the Web UI
- successful join to the tailnet using an auth key

## Operational notes

- Reinstalling multiple times may result in Tailscale assigning a suffixed hostname such as `sdxprairie-1`.
- Auth keys used for testing should be treated as exposed and rotated afterwards.
- The implementation is intentionally minimal and focused on remote modem access, not on advanced Tailscale features.
