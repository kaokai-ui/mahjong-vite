"""Optional atomic save helpers for the native scene."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Dict, Optional

from .engine import deserialize_state, serialize_state


def default_save_path() -> Path:
    return Path.home() / ".mahjong-retropie-2p" / "state.json"


def save_state(state: Dict[str, object], path: Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=".mahjong-", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(serialize_state(state))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, str(target))
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def load_state(path: Path) -> Optional[Dict[str, object]]:
    target = Path(path)
    try:
        return deserialize_state(target.read_text(encoding="utf-8"), fallback=None)
    except (OSError, UnicodeError, ValueError):
        return None
