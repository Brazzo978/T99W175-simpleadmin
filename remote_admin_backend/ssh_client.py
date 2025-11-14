"""Utilities to execute commands on the remote host via SSH."""
from __future__ import annotations

import shlex
from typing import Iterable, List, Tuple, Union

try:
    import paramiko
except ImportError:  # pragma: no cover - dependency missing at runtime
    paramiko = None  # type: ignore

from .config import load_config


class RemoteCommandError(Exception):
    """Raised when the remote command fails."""

    def __init__(self, message: str, *, exit_code: int = None) -> None:
        super().__init__(message)
        self.exit_code = exit_code


class RemoteConnectionError(Exception):
    """Raised when the SSH connection cannot be established."""


def _ensure_config() -> dict:
    config = load_config()
    required = ["host", "username"]
    for key in required:
        if not config.get(key):
            raise RemoteConnectionError(
                f"Missing remote configuration value: {key}. Configure the remote connection first."
            )
    if not config.get("password"):
        raise RemoteConnectionError("Missing SSH password in the remote configuration.")
    config.setdefault("ssh_port", 22)
    return config


def _serialize_command(command: Union[str, Iterable[str]]) -> str:
    if isinstance(command, str):
        return command
    parts: List[str] = []
    for token in command:
        parts.append(shlex.quote(str(token)))
    return " ".join(parts)


def execute_remote(command: Union[str, Iterable[str]], *, timeout: int = 30) -> Tuple[str, str, int]:
    """Execute *command* on the remote host and return stdout, stderr and exit code."""
    if paramiko is None:
        raise RemoteConnectionError(
            "Missing dependency 'paramiko'. Install it with 'pip install -r requirements.txt'."
        )
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

        command_str = _serialize_command(command)
        stdin, stdout, stderr = client.exec_command(command_str, timeout=timeout)
        stdout_data = stdout.read().decode("utf-8", errors="replace")
        stderr_data = stderr.read().decode("utf-8", errors="replace")
        exit_status = stdout.channel.recv_exit_status()
        return stdout_data, stderr_data, exit_status
    except paramiko.AuthenticationException as exc:
        raise RemoteConnectionError("Authentication failed while connecting to the remote host.") from exc
    except paramiko.SSHException as exc:
        raise RemoteConnectionError(f"Unable to execute the remote command: {exc}") from exc
    finally:
        client.close()


def run_at_command(at_command: str, *, timeout: int = 30) -> Tuple[str, str, int]:
    """Execute an AT command on the remote host."""
    cfg = _ensure_config()
    tool = cfg.get("at_command_tool") or "atcli_smd8"
    args = cfg.get("at_command_args", "")
    interface = cfg.get("interface", "").strip()

    command_tokens: List[str] = []
    command_tokens.extend(shlex.split(tool))
    if args:
        command_tokens.extend(shlex.split(args))
    if interface:
        command_tokens.extend(["-p", interface])
    command_tokens.append(at_command)

    return execute_remote(command_tokens, timeout=timeout)


def run_health_check() -> Tuple[str, str, int]:
    """Run a quick check command to validate the remote connection."""
    return execute_remote(["echo", "simpleadmin-ok"], timeout=10)
