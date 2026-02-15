from __future__ import annotations

import inspect
import os
import time
from typing import Any

ADDON_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(ADDON_DIR, "ajpc-tools-graph.log")

_LEVEL_SCORE = {
    "trace": 10,
    "debug": 20,
    "info": 30,
    "warn": 40,
    "warning": 40,
    "error": 50,
}

_SOURCE_ALIASES = {
    "graph_bridge_handlers": "graph_bridge",
}

_FORCE_LOGGING = True
_FORCE_LEVEL = "debug"
_FORCE_MODULE_LOGS: dict[str, bool] = {}
_FORCE_MODULE_LEVELS: dict[str, str] = {}

_HAS_API_CONFIG = False
_API_DEBUG_ENABLED = False
_API_LEVEL = "debug"
_API_MODULE_LOGS: dict[str, bool] = {}
_API_MODULE_LEVELS: dict[str, str] = {}


def set_enabled(flag: bool) -> None:
    # Backward compatible shim for old callsites.
    configure(debug_enabled=bool(flag), level=_API_LEVEL)


def _normalize_level(level: str | None) -> str:
    v = str(level or "debug").strip().lower()
    if v == "warning":
        v = "warn"
    return v if v in {"trace", "debug", "info", "warn", "error"} else "debug"


def _score(level: str | None) -> int:
    return int(_LEVEL_SCORE.get(_normalize_level(level), 20))


def _normalize_source_tag(raw: str | None) -> str:
    source = str(raw or "").strip().strip("_") or "core"
    return _SOURCE_ALIASES.get(source, source)


def _normalize_module_logs(value: Any) -> dict[str, bool]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, bool] = {}
    for key, enabled in value.items():
        src = _normalize_source_tag(str(key))
        if not src:
            continue
        out[src] = bool(enabled)
    return out


def _normalize_module_levels(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for key, raw_level in value.items():
        src = _normalize_source_tag(str(key))
        if not src:
            continue
        out[src] = _normalize_level(str(raw_level))
    return out


def configure(
    debug_enabled: Any = None,
    level: Any = None,
    module_logs: Any = None,
    module_levels: Any = None,
) -> None:
    global _HAS_API_CONFIG
    global _API_DEBUG_ENABLED
    global _API_LEVEL
    global _API_MODULE_LOGS
    global _API_MODULE_LEVELS
    if (
        debug_enabled is None
        and level is None
        and module_logs is None
        and module_levels is None
    ):
        _HAS_API_CONFIG = False
        _API_DEBUG_ENABLED = False
        _API_LEVEL = "debug"
        _API_MODULE_LOGS = {}
        _API_MODULE_LEVELS = {}
        return
    _HAS_API_CONFIG = True
    _API_DEBUG_ENABLED = bool(debug_enabled)
    _API_LEVEL = _normalize_level(level)
    _API_MODULE_LOGS = _normalize_module_logs(module_logs)
    _API_MODULE_LEVELS = _normalize_module_levels(module_levels)


def _active_logging_config() -> tuple[bool, str, dict[str, bool], dict[str, str]]:
    if _HAS_API_CONFIG:
        return (
            bool(_API_DEBUG_ENABLED),
            _normalize_level(_API_LEVEL),
            dict(_API_MODULE_LOGS),
            dict(_API_MODULE_LEVELS),
        )
    if _FORCE_LOGGING:
        return (
            True,
            _normalize_level(_FORCE_LEVEL),
            _normalize_module_logs(_FORCE_MODULE_LOGS),
            _normalize_module_levels(_FORCE_MODULE_LEVELS),
        )
    return (False, "debug", {}, {})


def _should_log(source: str, level: str) -> bool:
    enabled, global_level, module_logs, module_levels = _active_logging_config()
    if not enabled:
        return False
    if not bool(module_logs.get(source, True)):
        return False
    module_level = _normalize_level(module_levels.get(source, global_level))
    threshold = max(_score(global_level), _score(module_level))
    return _score(level) >= threshold


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
                if mod_leaf:
                    return _normalize_source_tag(mod_leaf)
                base = os.path.splitext(os.path.basename(fname))[0].strip("_")
                if base:
                    return _normalize_source_tag(base)
                break
            cur = cur.f_back
    except Exception:
        pass
    return "core"


def _emit(level: str, *args: Any, source: str | None = None) -> None:
    lvl = _normalize_level(level)
    src = _normalize_source_tag(source or _source_from_stack())
    if not _should_log(src, lvl):
        return
    try:
        ts = time.strftime("%H:%M:%S")
        line = " ".join(str(a) for a in args)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{src} {lvl.upper()} {ts}] {line}\n")
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
