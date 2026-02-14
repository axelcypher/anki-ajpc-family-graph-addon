from __future__ import annotations

import inspect
import os
import time
from typing import Any

ADDON_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(ADDON_DIR, "ajpc-tools-graph.log")

_ENABLED = False
_FORCE_LOGGING = True  # TEMP: bypass debug switch while debugging


def set_enabled(flag: bool) -> None:
    global _ENABLED
    _ENABLED = bool(flag)


def _source_from_stack() -> str:
    try:
        frame = inspect.currentframe()
        if frame is None:
            return "core"
        cur = frame.f_back
        this_file = os.path.abspath(__file__)
        while cur is not None:
            fname = os.path.abspath(str(cur.f_code.co_filename or ""))
            if fname != this_file:
                module_name = str(cur.f_globals.get("__name__", "") or "")
                mod_leaf = module_name.split(".")[-1].strip("_") if module_name else ""
                fn_name = str(cur.f_code.co_name or "").strip("_")
                if mod_leaf and fn_name:
                    return f"{mod_leaf}.{fn_name}"
                if mod_leaf:
                    return mod_leaf
                base = os.path.splitext(os.path.basename(fname))[0].strip("_")
                if base and fn_name:
                    return f"{base}.{fn_name}"
                if base:
                    return base
                break
            cur = cur.f_back
    except Exception:
        pass
    return "core"


def _emit(level: str, *args: Any, source: str | None = None) -> None:
    if not (_ENABLED or _FORCE_LOGGING):
        return
    try:
        ts = time.strftime("%H:%M:%S")
        lvl = str(level or "DEBUG").strip().upper() or "DEBUG"
        src = str(source or _source_from_stack()).strip() or "core"
        line = " ".join(str(a) for a in args)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{src} {lvl} {ts}] {line}\n")
    except Exception:
        pass


def trace(*args: Any, source: str | None = None) -> None:
    _emit("TRACE", *args, source=source)


def debug(*args: Any, source: str | None = None) -> None:
    _emit("DEBUG", *args, source=source)


def info(*args: Any, source: str | None = None) -> None:
    _emit("INFO", *args, source=source)


def warn(*args: Any, source: str | None = None) -> None:
    _emit("WARN", *args, source=source)


def error(*args: Any, source: str | None = None) -> None:
    _emit("ERROR", *args, source=source)


def dbg(*args: Any, source: str | None = None) -> None:
    debug(*args, source=source)
