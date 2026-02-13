from __future__ import annotations

from aqt import mw


def show_family_graph() -> None:
    if mw is None:
        return
    from .graph_view import FamilyGraphWindow

    win = getattr(mw, "_ajpc_family_graph_win", None)
    if win is None or not isinstance(win, FamilyGraphWindow):
        win = FamilyGraphWindow()
        mw._ajpc_family_graph_win = win
    else:
        win.show()
        win.raise_()
        win.activateWindow()
