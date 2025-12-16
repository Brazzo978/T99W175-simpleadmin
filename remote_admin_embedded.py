#!/usr/bin/env python3
"""Self-contained launcher for the Simple Admin remote web UI."""
from __future__ import annotations

import argparse
import base64
import io
import os
import shutil
import sys
import tempfile
import threading
import zipfile
from contextlib import contextmanager
from datetime import datetime
from http.server import CGIHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterator, List, Optional, Tuple

SERVER_DESCRIPTION = "Simple Admin remote launcher"

ASSET_ARCHIVE_B64 = (

)


@contextmanager
def _prepare_assets() -> Iterator[Path]:
    """Extract embedded assets to a temporary directory."""
    with tempfile.TemporaryDirectory(prefix="simpleadmin-") as tmpdir:
        root = Path(tmpdir)
        archive_data = "".join(ASSET_ARCHIVE_B64).strip()

        extracted = False
        if archive_data:
            try:
                data = base64.b64decode(archive_data)
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    archive.extractall(root)
                extracted = True
            except Exception:
                print(
                    "Failed to unpack embedded assets, falling back to local files...",
                    file=sys.stderr,
                    flush=True,
                )

        if not extracted:
            local_assets = Path(__file__).resolve().parent / "simpleadmin_assets"
            if not local_assets.is_dir():
                raise RuntimeError("Embedded assets missing and local assets not found.")
            shutil.copytree(local_assets, root, dirs_exist_ok=True)

        cgi_root = root / "www" / "cgi-bin"
        if cgi_root.is_dir():
            for script in cgi_root.iterdir():
                if not script.is_file():
                    continue
                try:
                    current_mode = script.stat().st_mode
                    script.chmod(current_mode | 0o111)
                except OSError:
                    continue
        yield root


def _make_handler(www_root: Path):
    class EmbeddedCGIHandler(CGIHTTPRequestHandler):
        have_fork = False
        cgi_directories = ["/cgi-bin"]

        def __init__(self, *args, directory: Optional[str] = None, **kwargs) -> None:
            super().__init__(*args, directory=str(www_root), **kwargs)

        def is_python(self, path: str) -> bool:
            """Treat extensionless scripts with a python shebang as Python."""
            if super().is_python(path):
                return True

            scriptfile = path if os.path.isabs(path) else self.translate_path(path)
            try:
                with open(scriptfile, "rb") as candidate:
                    first_line = candidate.readline()
            except OSError:
                return False

            if not first_line.startswith(b"#!"):
                return False

            return b"python" in first_line.lower()

        def log_message(self, format: str, *args) -> None:  # noqa: A003 - match base signature
            if os.environ.get("REMOTE_ADMIN_QUIET"):
                return
            super().log_message(format, *args)

    return EmbeddedCGIHandler


def _enable_debug_logging() -> None:
    """Enable logging of executed remote commands to stdout."""

    try:
        from remote_admin_backend import ssh_client  # type: ignore
    except Exception as exc:  # pragma: no cover - import errors should not break runtime
        print(f"Failed to enable debug logging: {exc}", file=sys.stderr, flush=True)
        return

    original_execute = ssh_client.execute_remote

    def _format_command(command: object) -> str:
        serializer = getattr(ssh_client, "_serialize_command", None)
        if callable(serializer):
            try:
                return serializer(command)
            except Exception:
                pass

        if isinstance(command, (list, tuple)):
            return " ".join(str(part) for part in command)
        return str(command)

    def debug_execute(command, *, timeout: int = 30):  # type: ignore[override]
        command_repr = _format_command(command)
        print(f"[remote-admin] Executing command: {command_repr}", flush=True)
        try:
            stdout, stderr, exit_code = original_execute(command, timeout=timeout)
        except Exception as exc:
            print(f"[remote-admin] Command raised: {exc!r}", flush=True)
            raise

        print(f"[remote-admin] Exit status: {exit_code}", flush=True)
        if stdout:
            print("[remote-admin] STDOUT:", flush=True)
            print(stdout.rstrip("\n"), flush=True)
        if stderr:
            print("[remote-admin] STDERR:", flush=True)
            print(stderr.rstrip("\n"), flush=True)
        if not stdout and not stderr:
            print("[remote-admin] (no output)", flush=True)
        return stdout, stderr, exit_code

    ssh_client.execute_remote = debug_execute  # type: ignore[assignment]


_PATCH_LOG_LOCK = threading.RLock()


def _patch_at_command_handling() -> None:
    """Ensure AT commands are executed one-by-one on RouterOS targets."""

    try:
        from remote_admin_backend import ssh_client  # type: ignore
    except Exception:  # pragma: no cover - patching should not fail hard
        return

    if getattr(ssh_client, "_simpleadmin_at_patch", False):
        return

    log_lock = getattr(ssh_client, "_LOG_LOCK", _PATCH_LOG_LOCK)

    def _split_at_commands(command: str) -> List[str]:
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
        stripped = command.strip()
        if not stripped:
            return ""

        if stripped.upper().startswith("AT"):
            return stripped

        if stripped[0] in {"+", "^", "%", "&"}:
            return f"AT{stripped}"

        return f"AT {stripped}" if not stripped.startswith("AT ") else stripped

    def _escape_ros_value(value: str) -> str:
        return value.replace("\\", "\\\\").replace('"', '\\"')

    def _parse_at_response(stdout: str) -> Tuple[str, List[str]]:
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

    def _fallback_debug_log_path() -> Path:
        try:
            executable = Path(sys.argv[0]).resolve()
        except Exception:
            executable = Path(__file__).resolve()
        return executable.parent / "at_debug.log"

    def _fallback_log_interaction(
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
        timestamp = datetime.now().isoformat(timespec="seconds")
        stderr_clean = stderr.strip()

        lines = [
            f"[{timestamp}] Command {position}/{total}: {command}",
            f"Status: {status or 'N/A'} | Exit code: {exit_code}",
        ]

        if response:
            lines.append("Response:")
            lines.extend(f"  {line}" for line in response)
        else:
            lines.append("Response: <empty>")

        if stderr_clean:
            lines.append("Stderr:")
            lines.extend(f"  {line}" for line in stderr_clean.splitlines())

        lines.append("")

        with log_lock:
            try:
                log_path.parent.mkdir(parents=True, exist_ok=True)
                with log_path.open("a", encoding="utf-8") as fp:
                    fp.write("\n".join(lines) + "\n")
            except Exception:
                return

    debug_checker = getattr(ssh_client, "_is_debug_enabled", None)
    log_path_factory = getattr(ssh_client, "_debug_log_path", None)
    log_writer = getattr(ssh_client, "_log_at_interaction", None)
    open_client = getattr(ssh_client, "_open_client", None)
    exec_over_client = getattr(ssh_client, "_execute_over_client", None)

    def _run_at_command(at_command: str, *, timeout: int = 30):  # type: ignore[override]
        cfg = ssh_client._ensure_config()
        interface = cfg.get("interface", "").strip()
        if not interface:
            raise ssh_client.RemoteConnectionError(
                "Missing LTE interface name in the remote configuration."
            )

        escaped_interface = _escape_ros_value(interface)

        commands = _split_at_commands(at_command) or [at_command.strip()]
        normalized_commands = [
            normalized
            for normalized in (_ensure_at_prefix(command) for command in commands)
            if normalized
        ]

        debug_enabled = (
            debug_checker(cfg)
            if callable(debug_checker)
            else bool(cfg.get("debug") or os.environ.get("REMOTE_ADMIN_DEBUG"))
        )

        log_path: Optional[Path] = None
        if debug_enabled:
            if callable(log_path_factory):
                try:
                    log_path = log_path_factory()
                except Exception:
                    log_path = _fallback_debug_log_path()
            else:
                log_path = _fallback_debug_log_path()

        stdout_parts: List[str] = []
        stderr_parts: List[str] = []
        exit_code = 0
        total_commands = len(normalized_commands)

        client = open_client(timeout) if callable(open_client) else None

        try:
            for index, normalized in enumerate(normalized_commands, start=1):

                ros_command = [
                    "interface/lte/at-chat",
                    f'interface="{escaped_interface}"',
                    f'input="{_escape_ros_value(normalized)}"',
                ]

                if client and callable(exec_over_client):
                    stdout, stderr, exit_code = exec_over_client(
                        client, ros_command, timeout=timeout
                    )
                else:
                    stdout, stderr, exit_code = ssh_client.execute_remote(
                        ros_command, timeout=timeout
                    )

                status, response = _parse_at_response(stdout)
                joined_response = "\n".join(response).strip()

                if debug_enabled and log_path:
                    writer = log_writer if callable(log_writer) else _fallback_log_interaction
                    writer(
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
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

        combined_stdout = "\n\n".join(stdout_parts)
        combined_stderr = "\n\n".join(stderr_parts)

        return combined_stdout, combined_stderr, exit_code

    ssh_client._split_at_commands = _split_at_commands  # type: ignore[attr-defined]
    ssh_client._ensure_at_prefix = _ensure_at_prefix  # type: ignore[attr-defined]
    ssh_client.run_at_command = _run_at_command  # type: ignore[assignment]
    ssh_client._simpleadmin_at_patch = True  # type: ignore[attr-defined]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=SERVER_DESCRIPTION)
    parser.add_argument("--host", default="127.0.0.1", help="Host/IP to bind the local server to.")
    parser.add_argument("--port", type=int, default=8080, help="TCP port for the local server.")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress HTTP request logs.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Log executed remote commands and their responses to the console.",
    )
    return parser.parse_args()


def run_server(host: str, port: int, quiet: bool = False, debug: bool = False) -> Tuple[str, int]:
    if quiet:
        os.environ["REMOTE_ADMIN_QUIET"] = "1"
    if debug:
        os.environ["REMOTE_ADMIN_DEBUG"] = "1"

    with _prepare_assets() as asset_root:
        www_root = asset_root / "www"
        backend_root = asset_root

        sys.path.insert(0, str(backend_root))
        _patch_at_command_handling()
        if debug:
            _enable_debug_logging()

        config_path = asset_root / "remote_config.json"
        os.environ.setdefault("REMOTE_ADMIN_CONFIG", str(config_path))

        previous_cwd = Path.cwd()
        os.chdir(www_root)
        try:
            handler = _make_handler(www_root)
            with ThreadingHTTPServer((host, port), handler) as httpd:
                print(f"{SERVER_DESCRIPTION} running at http://{host}:{port}")
                print("Press CTRL+C to stop.")
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    print("\nStopping server...")
                return httpd.server_address
        finally:
            os.chdir(previous_cwd)


def main() -> None:
    args = parse_args()
    run_server(args.host, args.port, quiet=args.quiet, debug=args.debug)


if __name__ == "__main__":
    main()
