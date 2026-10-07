# diag_bridge lives in another repository

`diag_bridge` is not stored in this repository. It is built in
[T99W175-diag-json-bridge](https://git.hobi.one/gionag/T99W175-diag-json-bridge),
and `bin/diag_bridge` in this folder is a local symbolic link (ignored by git) to the
binary in a checkout of that repository next to this one:

```
deploy/diag_bridge/bin/diag_bridge -> ../../../../T99W175-diag-json-bridge/diag_bridge
```

To set it up, clone both repositories side by side and either create the link
by hand or run, from the bridge repository:

```bash
scripts/publish-to-simpleadmin.sh [SIMPLEADMIN_DIR]
```

which builds the binary, copies its systemd unit to
`deploy/diag_bridge/systemd/diag_bridge.service` and creates the link if it is missing.

`./install.sh` follows the link, installs the binary on the
modem and records the bridge's `git describe` in
`/data/simpleadmin/diag_bridge.version`.
