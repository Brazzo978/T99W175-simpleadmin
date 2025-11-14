"""Utilities to build CGI responses."""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, Iterable, Tuple
from urllib.parse import parse_qs, unquote_plus


def send_json(payload: Dict[str, Any], status: int = 200) -> None:
    """Emit a JSON response."""
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print()
    json.dump(payload, sys.stdout)


def send_text(text: str, status: int = 200) -> None:
    """Emit a plain text response."""
    print(f"Status: {status}")
    print("Content-Type: text/plain; charset=utf-8")
    print()
    sys.stdout.write(text)


def parse_query(environ: Dict[str, str]) -> Dict[str, str]:
    """Parse the CGI query string."""
    query = environ.get("QUERY_STRING", "")
    parsed = parse_qs(query, keep_blank_values=True)
    return {key: values[0] if values else "" for key, values in parsed.items()}


def decode_param(value: str) -> str:
    """Decode a percent-encoded parameter value."""
    return unquote_plus(value or "")


def read_body(environ: Dict[str, str]) -> bytes:
    length = int(environ.get("CONTENT_LENGTH") or 0)
    if length <= 0:
        return b""
    return sys.stdin.buffer.read(length)


def read_json_body(environ: Dict[str, str]) -> Dict[str, Any]:
    raw = read_body(environ)
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {}


class HTTPError(Exception):
    """Raised when a CGI handler must abort with an error."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def handle_error(error: HTTPError) -> None:
    send_json({"success": False, "message": error.message}, status=error.status)


def ensure_method(environ: Dict[str, str], allowed: Iterable[str]) -> None:
    method = environ.get("REQUEST_METHOD", "GET").upper()
    allowed_upper = {m.upper() for m in allowed}
    if method not in allowed_upper:
        raise HTTPError(f"Method {method} is not allowed.", status=405)


def success_response(message: str = "", **extra: Any) -> Dict[str, Any]:
    payload = {"success": True, "message": message}
    payload.update(extra)
    return payload
