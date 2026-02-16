from __future__ import annotations

from typing import Any

from aqt import mw

from . import logger


def _ensure_graph_api_bound() -> None:
    if mw is None:
        return
    api = getattr(mw, "_ajpc_graph_api", None)
    if isinstance(api, dict) and callable(api.get("get_config")):
        return
    try:
        import sys

        for _mod_name, _mod in list(sys.modules.items()):
            if not _mod:
                continue
            installer = getattr(_mod, "install_graph_api", None)
            getter = getattr(_mod, "get_graph_config", None)
            if not callable(installer) or not callable(getter):
                continue
            try:
                installer()
            except Exception:
                continue
            api = getattr(mw, "_ajpc_graph_api", None)
            if isinstance(api, dict) and callable(api.get("get_config")):
                return
    except Exception:
        return


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


def _call_provider_edges_api_fn(fn: Any, note_ids: list[int], include_family: bool) -> dict[str, Any]:
    attempts = [
        ((), {"note_ids": note_ids, "include_family": include_family}),
        ((), {"nids": note_ids, "include_family": include_family}),
        ((note_ids,), {"include_family": include_family}),
        ((note_ids,), {}),
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
    _ensure_graph_api_bound()
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


def _get_provider_link_edges_via_main_api(
    note_ids: list[int],
    *,
    include_family: bool = False,
) -> dict[str, Any]:
    if mw is None:
        return {}
    _ensure_graph_api_bound()
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return {}
    keys = (
        "get_link_provider_edges",
        "get_provider_link_edges",
    )
    for key in keys:
        fn = api.get(key)
        if not callable(fn):
            continue
        out = _call_provider_edges_api_fn(fn, note_ids, include_family)
        if out:
            logger.dbg("provider edges via api", key, "nids=", len(note_ids))
            return out
    return {}
