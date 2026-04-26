# Building the Modem Tailscale Binary

## Purpose

This document explains how to build the custom Tailscale binary used by the modem integration.

The modem does not use the stock upstream package as-is. It requires:

- an ARMv7 build
- a reduced feature set
- a combined daemon + CLI binary
- a local API access patch so `tailscale status` works on this firmware
- UPX compression so the binary fits in persistent storage

## Official references

The build approach is based on:

- Tailscale embedded guide: <https://tailscale.com/docs/how-to/set-up-small-tailscale>
- Tailscale stable package index: <https://pkgs.tailscale.com/stable/>

## Repository files

The build workflow in this repository uses:

- `Tailscale/build_tailscale_modem.sh`
- `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`
- `Tailscale/VERSION.md`

## Requirements

The build host needs:

- `git`
- `go`
- `perl`
- `curl`
- `upx` or `upx-ucl`

## What the script does

`Tailscale/build_tailscale_modem.sh` performs these steps:

1. Detects the latest stable Tailscale version from `pkgs.tailscale.com`, unless a version is explicitly provided.
2. Clones the official `tailscale/tailscale` source at the requested tag.
3. Applies the modem local API patch in `ipn/ipnserver/server.go`.
4. Builds a combined ARMv7 `tailscaled` + CLI binary with a small feature set.
5. Compresses the binary with UPX.
6. Writes the modem metadata file `VERSION.md`.

## Why the local API patch is required

Without the patch, the modem firmware build was able to run `tailscaled`, join the tailnet, and authenticate correctly, but the local CLI access path still returned:

```text
Access denied: status access denied
```

The fix used for this repository is:

- build with `ts_omit_unixsocketidentity`
- patch `ipn/ipnserver/server.go` so `PermitRead` and `PermitWrite` are forced after the `actor` branch when handling `/localapi/`

This is part of the modem build and must be preserved when generating future binaries.

## Recommended build

Run:

```sh
cd Tailscale
./build_tailscale_modem.sh
```

By default this:

- builds the latest stable upstream version
- writes the compressed binary to `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`
- writes metadata to `Tailscale/VERSION.md`

## Useful options

Build a specific Tailscale version:

```sh
./build_tailscale_modem.sh --version 1.94.2
```

Change the modem metadata revision:

```sh
./build_tailscale_modem.sh --version 1.94.2 --revision 2
```

Print the latest stable version without building:

```sh
./build_tailscale_modem.sh --print-latest
```

Keep the working directory for inspection:

```sh
./build_tailscale_modem.sh --keep-workdir
```

## Generated metadata

The script writes `Tailscale/VERSION.md` in this format:

```md
- Current-Version: `1.94.2-modem.1`
- Source-Tag: `v1.94.2`
- Build-Flavor: `modem`
```

The installer only needs the `Current-Version` line, but the extra fields make the artifact easier to audit later.

## Output naming

The compressed artifact is always written as:

- `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`

This keeps the modem installer simple because it always downloads the same filename.

## Publishing flow

After a successful build:

1. Replace `Tailscale/tailscaled-armv7-sdxprairie-latest.upx`
2. Commit the updated `Tailscale/VERSION.md`
3. Push the repository
4. The modem installer and GUI will start seeing the new version metadata

## Notes

- If `UPX` is not available, the script can produce an uncompressed build with `--no-upx`, but that output is not suitable for the persistent storage constraints of this modem.
- The script is meant to produce the exact class of build used by the current modem deployment, not a generic upstream Tailscale package.

