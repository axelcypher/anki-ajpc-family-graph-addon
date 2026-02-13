from __future__ import annotations

from typing import Any

from aqt import mw

from . import logger


def _call_editor_api_fn(fn: Any, nid: int) -> bool:
    attempts = [
        ((), {"nid": nid}),
        ((), {"note_id": nid}),
        ((), {"id": nid}),
        ((nid,), {}),
    ]
    for args, kwargs in attempts:
        try:
            fn(*args, **kwargs)
            return True
        except TypeError:
            continue
        except Exception:
            continue
    return False


def _call_dependency_tree_api_fn(fn: Any, nid: int) -> dict[str, Any]:
    attempts = [
        ((), {"nid": nid}),
        ((), {"note_id": nid}),
        ((), {"id": nid}),
        ((nid,), {}),
    ]
    for args, kwargs in attempts:
        try:
            out = fn(*args, **kwargs)
        except TypeError:
            continue
        except Exception:
            continue
        if isinstance(out, dict):
            return out
    return {}


def _get_dependency_tree_via_main_api(nid: int) -> dict[str, Any]:
    if mw is None:
        return {}
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return {}
    keys = (
        "get_dependency_tree",
        "get_prio_chain",
    )
    for key in keys:
        fn = api.get(key)
        if not callable(fn):
            continue
        out = _call_dependency_tree_api_fn(fn, nid)
        if out:
            logger.dbg("deptree via api", key, nid)
            return out
    return {}


def _open_editor_via_main_api(nid: int) -> bool:
    if mw is None:
        return False
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return False

    candidates: list[tuple[str, Any]] = []
    keys = (
        "open_note_editor",
        "open_editor_for_note",
        "open_editor",
        "edit_note",
        "show_note_editor",
    )
    for key in keys:
        fn = api.get(key)
        if callable(fn):
            candidates.append((key, fn))

    editor_api = api.get("editor")
    if isinstance(editor_api, dict):
        for key in keys:
            fn = editor_api.get(key)
            if callable(fn):
                candidates.append(("editor." + key, fn))

    for name, fn in candidates:
        if _call_editor_api_fn(fn, nid):
            logger.dbg("ctx editor via api", name, nid)
            return True

    return False
