# T99W175-simpleadmin

"Simple Admin" web interface for the T99W175 modem/router, composed of static HTML/JS pages and CGI scripts that interact with the device's networking services. For a detailed description of each file and the available features, see [DOCUMENTAZIONE.md](DOCUMENTAZIONE.md).

## Remote launcher

This branch ships with a cross-platform launcher that exposes the web interface locally and proxies modem commands through SSH. The launcher targets scenarios where the modem is reachable through the network rather than a local serial device.

### Requirements

- Python 3.9 or newer
- The `paramiko` package (install with `pip install -r requirements.txt`)
- SSH access (username/password) to the target modem/router

### Usage

```bash
python remote_admin.py --host 127.0.0.1 --port 8080
```

Open a browser and navigate to the printed URL. Use the **Remote Connection** button in the top navigation bar to configure the remote modem address, SSH credentials, the preferred AT interface, and the command wrapper. Once saved, the home dashboard, band-locking page, and AT terminal will execute the required commands on the remote device via SSH.
