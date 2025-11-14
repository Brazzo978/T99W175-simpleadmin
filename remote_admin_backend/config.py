"""Configuration helpers for the remote Simple Admin launcher."""
from __future__ import annotations

from pathlib import Path
import json
import os
import threading
from typing import Any, Dict

_DEFAULT_CONFIG = {
    "host": "",
    "ssh_port": 22,
    "username": "",
    "password": "",
    "interface": "",
    "at_command_tool": "atcli_smd8",
    "at_command_args": "",
}

_LOCK = threading.RLock()


def _default_config_path() -> Path:
    """Return the path to the configuration JSON file."""
    env_path = os.environ.get("REMOTE_ADMIN_CONFIG")
    if env_path:
        return Path(env_path).expanduser().resolve()

    root_dir = Path(__file__).resolve().parents[1]
    return root_dir / "remote_config.json"


CONFIG_PATH = _default_config_path()


def load_config() -> Dict[str, Any]:
    """Load the remote connection configuration."""
    with _LOCK:
        if not CONFIG_PATH.exists():
            return dict(_DEFAULT_CONFIG)

        try:
            with CONFIG_PATH.open("r", encoding="utf-8") as fp:
                data = json.load(fp)
        except (OSError, json.JSONDecodeError):
            return dict(_DEFAULT_CONFIG)

        merged = dict(_DEFAULT_CONFIG)
        merged.update({k: v for k, v in data.items() if k in _DEFAULT_CONFIG})
        return merged


def save_config(config: Dict[str, Any]) -> None:
    """Persist the provided configuration to disk."""
    with _LOCK:
        merged = dict(_DEFAULT_CONFIG)
        merged.update({k: v for k, v in config.items() if k in _DEFAULT_CONFIG})

        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CONFIG_PATH.open("w", encoding="utf-8") as fp:
            json.dump(merged, fp, indent=2, sort_keys=True)


def update_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update the stored configuration and return the new value."""
    with _LOCK:
        current = load_config()
        current.update({k: v for k, v in updates.items() if k in _DEFAULT_CONFIG})
        save_config(current)
        return current


def redact_sensitive(config: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of *config* without sensitive data."""
    safe = dict(config)
    if safe.get("password"):
        safe["password"] = "***"
    return safe
