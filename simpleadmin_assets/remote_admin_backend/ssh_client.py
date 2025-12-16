"""Utilities to execute commands on the remote host via SSH."""
from __future__ import annotations

import os
import shlex
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Tuple, Union

try:
    import paramiko
except ImportError:  # pragma: no cover - dependency missing at runtime
    paramiko = None  # type: ignore

from .config import load_config


_LOG_LOCK = threading.RLock()


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


def _is_debug_enabled(config: dict) -> bool:
    """Return True when debug logging should be recorded."""

    return bool(config.get("debug")) or bool(os.environ.get("REMOTE_ADMIN_DEBUG"))


def _debug_log_path() -> Path:
    """Return the path to the AT debug log beside the Python executable."""

    try:
        executable = Path(sys.argv[0]).resolve()
    except Exception:
        executable = Path(__file__).resolve()
    return executable.parent / "at_debug.log"


def _log_at_interaction(
    log_path: Path,
    *,
    command: str,
    status: str,
    response: List[str],
    stderr: str,
    exit_code: int,
    position: int,
    total: int,
) -> None:
    """Append a formatted AT interaction to the debug log."""

    timestamp = datetime.now().isoformat(timespec="seconds")
    response_lines = response or []
    stderr_clean = stderr.strip()

    lines = [
        f"[{timestamp}] Command {position}/{total}: {command}",
        f"Status: {status or 'N/A'} | Exit code: {exit_code}",
    ]

    if response_lines:
        lines.append("Response:")
        lines.extend(f"  {line}" for line in response_lines)
    else:
        lines.append("Response: <empty>")

    if stderr_clean:
        lines.append("Stderr:")
        lines.extend(f"  {line}" for line in stderr_clean.splitlines())

    lines.append("")

    with _LOG_LOCK:
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with log_path.open("a", encoding="utf-8") as fp:
                fp.write("\n".join(lines) + "\n")
        except Exception:
            # Logging must never interfere with command execution.
            return


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


def _split_at_commands(command: str) -> List[str]:
    """Split user-provided AT command chains into discrete commands.

    Mikrotik routers accept only a single AT command per invocation of
    ``/interface/lte/at-chat``. Users, however, may chain commands with
    semicolons or newlines. This parser keeps quotes intact and honours
    backslash escapes so that payloads containing separators are not split
    incorrectly.
    """

    if not command:
        return []

    parts: List[str] = []
    current: List[str] = []
    in_quotes = False
    escaped = False

    for char in command:
        if escaped:
            current.append(char)
            escaped = False
            continue

        if char == "\\":
            current.append(char)
            escaped = True
            continue

        if char == '"':
            in_quotes = not in_quotes
            current.append(char)
            continue

        if not in_quotes and char in {";", "\n", "\r"}:
            segment = "".join(current).strip()
            if segment:
                parts.append(segment)
            current = []
            continue

        current.append(char)

    tail = "".join(current).strip()
    if tail:
        parts.append(tail)

    return parts


def _ensure_at_prefix(command: str) -> str:
    """Normalise a single AT command to always include the ``AT`` prefix."""

    stripped = command.strip()
    if not stripped:
        return ""

    if stripped.upper().startswith("AT"):
        return stripped

    if stripped[0] in {"+", "^", "%", "&"}:
        return f"AT{stripped}"

    return f"AT {stripped}" if not stripped.startswith("AT ") else stripped


def _escape_ros_value(value: str) -> str:
    """Escape a value for safe injection into RouterOS CLI arguments."""

    return value.replace("\\", "\\\\").replace('"', '\\"')


def _parse_at_response(stdout: str) -> Tuple[str, List[str]]:
    """Extract status and modem output from RouterOS ``at-chat`` output."""

    status = ""
    response_lines: List[str] = []
    collecting_response = False

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        lowered = line.lower()
        if lowered.startswith("status:"):
            status = line.split(":", 1)[1].strip()
            collecting_response = False
            continue

        if lowered.startswith("response:"):
            collecting_response = True
            remainder = line.split(":", 1)[1].strip()
            if remainder:
                response_lines.append(remainder)
            continue

        if collecting_response:
            response_lines.append(line)
            continue

        response_lines.append(line)

    return status, response_lines


def _response_is_successful(status: str, response: List[str], stderr: str, exit_code: int) -> bool:
    """Determine whether RouterOS reported a successful AT invocation."""

    if exit_code != 0:
        return False

    if stderr.strip():
        return False

    status_normalized = status.lower()
    if status_normalized.startswith("ok"):
        return True
    if status_normalized.startswith("error"):
        return False

    for line in response:
        upper = line.upper()
        if upper == "OK":
            return True
        if "ERROR" in upper:
            return False

    return bool(response)


def run_at_command(at_command: str, *, timeout: int = 30) -> Tuple[str, str, int]:
    """Execute an AT command on the remote host."""
    cfg = _ensure_config()
    interface = cfg.get("interface", "").strip()
    if not interface:
        raise RemoteConnectionError(
            "Missing LTE interface name in the remote configuration."
        )

    escaped_interface = _escape_ros_value(interface)

    commands = _split_at_commands(at_command) or [at_command.strip()]
    normalized_commands = [
        normalized
        for normalized in (_ensure_at_prefix(command) for command in commands)
        if normalized
    ]

    debug_enabled = _is_debug_enabled(cfg)
    log_path = _debug_log_path() if debug_enabled else None

    stdout_parts: List[str] = []
    stderr_parts: List[str] = []
    exit_code = 0

    total_commands = len(normalized_commands)

    for index, normalized in enumerate(normalized_commands, start=1):
        
        ros_command = [
            "interface/lte/at-chat",
            f'interface="{escaped_interface}"',
            f'input="{_escape_ros_value(normalized)}"',
        ]

        stdout, stderr, exit_code = execute_remote(ros_command, timeout=timeout)

        status, response = _parse_at_response(stdout)
        joined_response = "\n".join(response).strip()

        if debug_enabled and log_path:
            _log_at_interaction(
                log_path,
                command=normalized,
                status=status,
                response=response,
                stderr=stderr,
                exit_code=exit_code,
                position=index,
                total=total_commands or 1,
            )

        if joined_response:
            stdout_parts.append(joined_response)
        if stderr.strip():
            stderr_parts.append(stderr.strip())

        if not _response_is_successful(status, response, stderr, exit_code):
            stderr_parts.append(
                f'Aborting remaining commands after failure of "{normalized}".'
            )
            break

    combined_stdout = "\n\n".join(stdout_parts)
    combined_stderr = "\n\n".join(stderr_parts)

    return combined_stdout, combined_stderr, exit_code


def run_health_check() -> Tuple[str, str, int]:
    """Run a quick check command to validate the remote connection."""
    return execute_remote(["echo", "simpleadmin-ok"], timeout=10)
