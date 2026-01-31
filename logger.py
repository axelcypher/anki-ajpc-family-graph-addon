from __future__ import annotations

import os
import time
from typing import Any

ADDON_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(ADDON_DIR, "ajpc-family-graph.log")

_ENABLED = True


def set_enabled(flag: bool) -> None:
    global _ENABLED
    _ENABLED = bool(flag)


def dbg(*args: Any) -> None:
    if not _ENABLED:
        return
    try:
        ts = time.strftime("%H:%M:%S")
        line = " ".join(str(a) for a in args)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[FamilyGraph {ts}] {line}\n")
    except Exception:
        pass

