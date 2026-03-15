# Modem Tailscale Deploy

For a full repository-level explanation of the modem Tailscale integration, see:

- `Doc/Tailscale.md`
- `Tailscale/BUILD.md`

## Binary to publish

Upload this file into the repo `tailscale/` directory or as a GitHub Release asset:

- `/home/Admin/tailscale/tailscaled-armv7-sdxprairie-latest.upx`
- `/home/Admin/tailscale/VERSION.md`

Suggested raw path in the repo:

- `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`
- `Tailscale/VERSION.md`

## Installer

- `/home/Admin/tailscale/install_tailscale_modem.sh`

Usage:

```sh
sh install_tailscale_modem.sh -k 'tskey-auth-...'
```

Update only if remote metadata is newer:

```sh
sh install_tailscale_modem.sh -U
```

Remove:

```sh
sh install_tailscale_modem.sh -R
```

## Version metadata

The installer reads:

- `Tailscale/VERSION.md`

Expected line format:

```md
- Current-Version: `1.94.2-modem.2`
```

The script stores the fetched metadata on the modem in:

- `/data/tailscale/VERSION.md`

## Important build note

The deployed binary is a custom embedded build for this modem family:

- `linux/arm`
- combined `tailscaled` + CLI
- extra-small feature set
- UPX-compressed

Current known behavior:

- the daemon authenticates and reaches `Running`
- config-file boot with auth key works
- local CLI `tailscale status` now works with the patched modem build

## Build script

To build a fresh modem-compatible binary from upstream source, use:

```sh
cd Tailscale
./build_tailscale_modem.sh
```

To print the latest stable version detected from upstream without building:

```sh
./build_tailscale_modem.sh --print-latest
```
