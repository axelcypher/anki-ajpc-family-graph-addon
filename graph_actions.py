from __future__ import annotations

import aqt
from aqt import mw

from . import logger
from .graph_editor_window import GraphNoteEditor
from .graph_note_ops import _get_family_field


def _open_browser_for_note(nid: int):
    if mw is None or mw.col is None:
        return None
    try:
        card_id = mw.col.db.scalar("select id from cards where nid = ?", nid)
    except Exception:
        card_id = None
    try:
        browser = aqt.dialogs.open("Browser", mw, card=card_id)
    except Exception:
        browser = aqt.dialogs.open("Browser", mw)
    try:
        browser.search_for(f"nid:{nid}")
        if card_id:
            browser.table.select_single_card(card_id)
    except Exception:
        pass
    return browser


def _open_browser_for_notetype(mid: int):
    if mw is None or mw.col is None:
        return None
    name = ""
    try:
        model = mw.col.models.get(mid)
        if model and isinstance(model, dict):
            name = str(model.get("name", ""))
    except Exception:
        name = ""
    try:
        browser = aqt.dialogs.open("Browser", mw)
    except Exception:
        return None
    try:
        if name:
            if " " in name:
                query = f'note:"{name}"'
            else:
                query = f"note:{name}"
            browser.search_for(query)
        else:
            browser.search_for(f"mid:{mid}")
    except Exception:
        pass
    return browser


def _open_browser_for_tag(tag: str):
    if mw is None or mw.col is None:
        return None
    tag = str(tag or "").strip()
    if not tag:
        return None
    try:
        browser = aqt.dialogs.open("Browser", mw)
    except Exception:
        return None
    try:
        if " " in tag:
            query = f'tag:"{tag}"'
        else:
            query = f"tag:{tag}"
        browser.search_for(query)
    except Exception:
        pass
    return browser


def _open_editor(nid: int, *, prefer_api: bool = False) -> None:
    if mw is None:
        return
    if prefer_api:
        logger.dbg("ctx editapi mapped to local editor", nid)
    try:
        win = getattr(mw, "_ajpc_tools_graph_win", None)
        show_embedded = getattr(win, "_show_embedded_editor_for_note", None)
        if callable(show_embedded) and show_embedded(int(nid)):
            logger.dbg("ctx editor via embedded panel", nid)
            return
    except Exception:
        pass
    editors = getattr(mw, "_ajpc_tools_graph_editors", None)
    if not isinstance(editors, dict):
        editors = {}
        mw._ajpc_tools_graph_editors = editors
    if nid in editors:
        win = editors[nid]
        try:
            win.show()
            win.raise_()
            win.activateWindow()
        except Exception:
            pass
        return
    try:
        win = GraphNoteEditor(nid)
        editors[nid] = win
    except Exception:
        pass


def _filter_family(fid: str) -> None:
    if mw is None:
        return
    field = _get_family_field()
    if not field:
        query = fid
    else:
        if " " in field:
            field = f'"{field}"'
        try:
            import re

            pattern = ".*" + re.escape(fid) + ".*"
            query = f"{field}:re:{pattern}"
        except Exception:
            if " " in fid or ";" in fid:
                query = f'"{field}:{fid}"'
            else:
                query = f"{field}:{fid}"
    try:
        browser = aqt.dialogs.open("Browser", mw)
        browser.search_for(query)
    except Exception:
        pass
