from __future__ import annotations

import aqt
from aqt import mw
from aqt.browser.previewer import Previewer
from anki.cards import Card


class GraphPreviewer(Previewer):
    def __init__(self, mw: aqt.AnkiQt, card_id: int, on_close) -> None:
        self._card_id = card_id
        self._last_card_id = 0
        super().__init__(parent=None, mw=mw, on_close=on_close)

    def card(self) -> Card | None:
        if mw is None or mw.col is None:
            return None
        try:
            return mw.col.get_card(self._card_id)
        except Exception:
            return None

    def card_changed(self) -> bool:
        c = self.card()
        if not c:
            return True
        changed = c.id != self._last_card_id
        self._last_card_id = c.id
        return changed


def _open_preview(nid: int) -> None:
    if mw is None or mw.col is None:
        return
    try:
        card_id = mw.col.db.scalar(
            "select id from cards where nid = ? order by ord limit 1", nid
        )
    except Exception:
        card_id = None
    if not card_id:
        return
    previewers = getattr(mw, "_ajpc_tools_graph_previewers", None)
    if not isinstance(previewers, dict):
        previewers = {}
        mw._ajpc_tools_graph_previewers = previewers
    if card_id in previewers:
        win = previewers[card_id]
        try:
            win.show()
            win.raise_()
            win.activateWindow()
            win.render_card()
        except Exception:
            pass
        return

    def _on_close() -> None:
        try:
            previewers.pop(card_id, None)
        except Exception:
            pass

    try:
        win = GraphPreviewer(mw, card_id, _on_close)
        previewers[card_id] = win
        win.open()
    except Exception:
        pass


def _open_preview_card(card_id: int) -> None:
    if mw is None or mw.col is None:
        return
    if not card_id:
        return
    try:
        card = mw.col.get_card(card_id)
    except Exception:
        card = None
    if card is None:
        return
    previewers = getattr(mw, "_ajpc_tools_graph_previewers", None)
    if not isinstance(previewers, dict):
        previewers = {}
        mw._ajpc_tools_graph_previewers = previewers
    if card_id in previewers:
        win = previewers[card_id]
        try:
            win.show()
            win.raise_()
            win.activateWindow()
            win.render_card()
        except Exception:
            pass
        return

    def _on_close() -> None:
        try:
            previewers.pop(card_id, None)
        except Exception:
            pass

    try:
        win = GraphPreviewer(mw, card_id, _on_close)
        previewers[card_id] = win
        win.open()
    except Exception:
        pass
