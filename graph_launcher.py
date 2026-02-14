from __future__ import annotations

from aqt import mw

from . import logger


def _show_or_create_window():
    if mw is None:
        return None
    from .graph_view import FamilyGraphWindow

    win = getattr(mw, "_ajpc_family_graph_win", None)
    if win is None or not isinstance(win, FamilyGraphWindow):
        win = FamilyGraphWindow()
        mw._ajpc_family_graph_win = win
    else:
        win.show()
        win.raise_()
        win.activateWindow()
    return win


def show_family_graph() -> None:
    _show_or_create_window()


def show_family_graph_for_note(nid: int) -> None:
    win = _show_or_create_window()
    if win is None:
        return
    try:
        target_nid = int(nid or 0)
    except Exception:
        target_nid = 0
    if target_nid <= 0:
        return
    try:
        win._request_focus_note_in_graph(target_nid)
        logger.dbg("graph launcher focus note", target_nid)
    except Exception:
        logger.dbg("graph launcher focus note failed", target_nid)
