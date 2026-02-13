from __future__ import annotations

import json
from typing import Any

from aqt import mw
from aqt.operations import QueryOp
from aqt.utils import showInfo

from . import logger
from .graph_data import build_graph
from .graph_web_assets import render_graph_html


class GraphSyncMixin:
    def _load(self) -> None:
        if mw is None or not getattr(mw, "col", None):
            showInfo("No collection loaded.")
            return
        logger.dbg("load graph")

        def op(_col):
            return build_graph(_col)

        def on_success(result: dict[str, Any]) -> None:
            logger.dbg("graph build success", "nodes=", len(result.get("nodes", [])), "edges=", len(result.get("edges", [])))
            html = render_graph_html(result)
            self.web.stdHtml(html)
            payload_json = json.dumps(result, ensure_ascii=False).replace("</", "<\\/")
            logger.dbg("graph payload bytes", len(payload_json))
            init_js = (
                "(function(){"
                "const data=" + payload_json + ";"
                "const kick=()=>{"
                "if(window.ajpcGraphInit){"
                "window.ajpcGraphInit(data);"
                "if(window.pycmd){pycmd('log:graph init called');}"
                "}else{setTimeout(kick,50);}"
                "};"
                "kick();"
                "})();"
            )
            self.web.eval(init_js)
            self._graph_ready = True

        def on_failure(err: Exception) -> None:
            logger.dbg("graph build failed", repr(err))
            showInfo(f"Graph build failed: {err!r}")

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _refresh(self) -> None:
        if mw is None or not getattr(mw, "col", None):
            return
        if not self._graph_ready:
            self._load()
            return
        logger.dbg("refresh graph")

        def op(_col):
            return build_graph(_col)

        def on_success(result: dict[str, Any]) -> None:
            logger.dbg(
                "graph refresh success",
                "nodes=",
                len(result.get("nodes", [])),
                "edges=",
                len(result.get("edges", [])),
            )
            if self._pending_changed_nids:
                result.setdefault("meta", {})
                try:
                    result["meta"]["changed_nids"] = list(self._pending_changed_nids)
                except Exception:
                    pass
                self._pending_changed_nids.clear()
            payload_json = json.dumps(result, ensure_ascii=False).replace("</", "<\\/")
            update_js = (
                "(function(){"
                "const data=" + payload_json + ";"
                "if(window.ajpcGraphUpdate){"
                "window.ajpcGraphUpdate(data);"
                "if(window.pycmd){pycmd('log:graph update called');}"
                "}else if(window.ajpcGraphInit){"
                "window.ajpcGraphInit(data);"
                "if(window.pycmd){pycmd('log:graph init called');}"
                "}"
                "})();"
            )
            self.web.eval(update_js)

        def on_failure(err: Exception) -> None:
            logger.dbg("graph refresh failed", repr(err))

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _schedule_refresh(self, reason: str) -> None:
        logger.dbg("schedule refresh", reason)
        try:
            self._refresh_timer.stop()
        except Exception:
            pass
        self._refresh_timer.start(350)

    def _sync_embedded_editor_on_operation(self, changes, handler) -> None:
        editor = self._embedded_editor
        if editor is None:
            return
        if not getattr(changes, "note_text", False):
            return
        if handler is editor:
            return
        note = getattr(editor, "note", None)
        if note is None:
            return
        try:
            note.load()
        except Exception:
            return
        try:
            editor.set_note(note)
            self._theme_embedded_editor_web()
            try:
                self._trigger_embedded_editor_tag_wrap()
            except Exception:
                pass
            logger.dbg("embedded editor note sync", getattr(note, "id", 0))
        except Exception:
            pass

    def _on_operation_did_execute(self, changes, handler) -> None:
        try:
            self._sync_embedded_editor_on_operation(changes, handler)
            if not self._graph_ready:
                return
            if getattr(changes, "note", False) or getattr(changes, "note_text", False):
                nid = None
                try:
                    if handler is not None:
                        cand = getattr(handler, "note", None)
                        if cand is not None and getattr(cand, "id", None):
                            nid = int(cand.id)
                        elif getattr(handler, "note_id", None):
                            nid = int(getattr(handler, "note_id"))
                        elif getattr(handler, "nid", None):
                            nid = int(getattr(handler, "nid"))
                except Exception:
                    nid = None
                if nid:
                    self._pending_changed_nids.add(nid)
                self._schedule_refresh("note change")
                return
            if getattr(changes, "tag", False) or getattr(changes, "deck", False):
                self._schedule_refresh("tag/deck change")
                return
            if getattr(changes, "notetype", False):
                self._schedule_refresh("notetype change")
                return
        except Exception:
            pass
