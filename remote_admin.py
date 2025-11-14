#!/usr/bin/env python3
"""Launcher for the remote Simple Admin web UI."""
from __future__ import annotations

import argparse
import os
from http.server import ThreadingHTTPServer, CGIHTTPRequestHandler
from pathlib import Path
from typing import Optional, Tuple

SERVER_DESCRIPTION = "Simple Admin remote launcher"


class RemoteAdminCGIHandler(CGIHTTPRequestHandler):
    cgi_directories = ["/cgi-bin"]

    def __init__(self, *args, directory: Optional[str] = None, **kwargs) -> None:
        www_dir = directory or str(Path(__file__).resolve().parent / "www")
        super().__init__(*args, directory=www_dir, **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - matches base signature
        if os.environ.get("REMOTE_ADMIN_QUIET"):
            return
        super().log_message(format, *args)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=SERVER_DESCRIPTION)
    parser.add_argument("--host", default="127.0.0.1", help="Host/IP to bind the local server to.")
    parser.add_argument("--port", type=int, default=8080, help="TCP port for the local server.")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress HTTP request logs.",
    )
    return parser.parse_args()


def run_server(host: str, port: int, quiet: bool = False) -> Tuple[str, int]:
    if quiet:
        os.environ["REMOTE_ADMIN_QUIET"] = "1"

    handler = RemoteAdminCGIHandler
    www_dir = Path(__file__).resolve().parent / "www"
    os.chdir(www_dir)

    with ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"{SERVER_DESCRIPTION} running at http://{host}:{port}")
        print("Press CTRL+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")
        return httpd.server_address


def main() -> None:
    args = parse_args()
    run_server(args.host, args.port, quiet=args.quiet)


if __name__ == "__main__":
    main()
