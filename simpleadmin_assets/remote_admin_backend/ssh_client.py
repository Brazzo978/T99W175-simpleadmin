from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Tuple

import paramiko


class RemoteConnectionError(Exception):
    """Raised when the remote SSH connection or configuration fails."""


def _config_path() -> Path:
    env_path = os.environ.get("REMOTE_ADMIN_CONFIG")
    if env_path:
        return Path(env_path)

    return Path(__file__).resolve().parent / "remote_config.json"


def load_config() -> Dict[str, object]:
    path = _config_path()
    if not path.is_file():
        return {}

    try:
        with path.open("r", encoding="utf-8") as fp:
            return json.load(fp)
    except Exception:
        return {}


def save_config(data: Dict[str, object]) -> Dict[str, object]:
    existing = load_config()
    updated = existing.copy()

    for key in ("host", "ssh_port", "username", "interface"):
        if data.get(key) not in (None, ""):
            updated[key] = data[key]

    if "password" in data:
        password = data.get("password")
        if password == "***":
            pass
        elif password:
            updated["password"] = password
        else:
            updated.pop("password", None)

    try:
        updated["ssh_port"] = int(updated.get("ssh_port", 22))
    except (TypeError, ValueError):
        updated["ssh_port"] = 22

    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(updated, fp, indent=2)

    return updated


def _ensure_config() -> Dict[str, object]:
    cfg = load_config()
    host = str(cfg.get("host") or "").strip()
    username = str(cfg.get("username") or "").strip()
    password = str(cfg.get("password") or "").strip()
    interface = str(cfg.get("interface") or "").strip()

    try:
        port = int(cfg.get("ssh_port", 22))
    except (TypeError, ValueError):
        port = 22

    if not host:
        raise RemoteConnectionError("Missing SSH host in the configuration.")
    if not username:
        raise RemoteConnectionError("Missing SSH username in the configuration.")
    if not password:
        raise RemoteConnectionError("Missing SSH password in the configuration.")
    if not interface:
        raise RemoteConnectionError("Missing LTE interface name in the configuration.")

    return {
        "host": host,
        "username": username,
        "password": password,
        "ssh_port": port,
        "interface": interface,
        "debug": bool(cfg.get("debug")),
    }


def _serialize_command(command: object) -> str:
    if isinstance(command, (list, tuple)):
        return " ".join(str(part) for part in command)
    return str(command)


def _debug_log_path() -> Path:
    return _config_path().with_name("at_debug.log")


def _is_debug_enabled(cfg: Dict[str, object]) -> bool:
    return bool(cfg.get("debug") or os.environ.get("REMOTE_ADMIN_DEBUG"))


def _open_client(timeout: int = 30) -> paramiko.SSHClient:
    cfg = _ensure_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=cfg["host"],
            port=int(cfg.get("ssh_port", 22)),
            username=cfg["username"],
            password=cfg["password"],
            look_for_keys=False,
            allow_agent=False,
            timeout=timeout,
        )
    except Exception as exc:
        client.close()
        raise RemoteConnectionError(f"Unable to connect to {cfg['host']}: {exc}") from exc

    return client


def _execute_over_client(
    client: paramiko.SSHClient, command: object, timeout: int = 30
) -> Tuple[str, str, int]:
    command_line = _serialize_command(command)
    try:
        stdin, stdout, stderr = client.exec_command(command_line, timeout=timeout)
    except Exception as exc:
        raise RemoteConnectionError(f"Failed to execute command: {exc}") from exc

    stdout_data = stdout.read().decode("utf-8", errors="ignore")
    stderr_data = stderr.read().decode("utf-8", errors="ignore")
    exit_code = stdout.channel.recv_exit_status()
    stdin.close()

    return stdout_data, stderr_data, exit_code


def execute_remote(command: object, *, timeout: int = 30) -> Tuple[str, str, int]:
    client = _open_client(timeout)
    try:
        return _execute_over_client(client, command, timeout=timeout)
    finally:
        client.close()


def run_at_command(at_command: str, *, timeout: int = 30) -> Tuple[str, str, int]:
    cfg = _ensure_config()
    escaped_command = at_command.replace("\"", "\\\"")
    ros_command = [
        "interface/lte/at-chat",
        f'interface="{cfg["interface"]}"',
        f'input="{escaped_command}"',
    ]
    return execute_remote(ros_command, timeout=timeout)

