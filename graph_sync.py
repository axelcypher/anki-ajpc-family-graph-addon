from __future__ import annotations

import json
from typing import Any

from aqt import mw
from aqt.operations import QueryOp
from aqt.utils import showInfo

from . import logger
from .graph_data import build_graph, build_note_delta
from .graph_web_assets import render_graph_html


class GraphSyncMixin:
    def _schedule_note_delta_push(self, reason: str) -> None:
        logger.dbg("schedule note delta", reason, "nids=", len(self._pending_changed_nids))
        try:
            self._delta_timer.stop()
        except Exception:
            pass
        self._delta_timer.start(220)

    def _push_note_delta(self) -> None:
        logger.dbg(
            "push note delta enter",
            "ready=",
            bool(self._graph_ready),
            "pending=",
            len(self._pending_changed_nids),
        )
        if mw is None or not getattr(mw, "col", None):
            logger.dbg("push note delta skip", "reason=no collection")
            return
        if not self._graph_ready:
            logger.dbg("push note delta skip", "reason=graph not ready", "action=load")
            self._load()
            return
        if not self._pending_changed_nids:
            logger.dbg("push note delta skip", "reason=no pending nids")
            return
        changed_nids = sorted(int(x) for x in self._pending_changed_nids if int(x) > 0)
        if not changed_nids:
            logger.dbg("push note delta skip", "reason=normalized nids empty", "action=clear pending")
            self._pending_changed_nids.clear()
            return
        logger.dbg("push note delta", "nids=", len(changed_nids))

        def op(_col):
            return build_note_delta(_col, changed_nids)

        def on_success(result: dict[str, Any]) -> None:
            nodes_count = len(result.get("nodes", []) or []) if isinstance(result, dict) else 0
            edges_count = len(result.get("edges", []) or []) if isinstance(result, dict) else 0
            logger.dbg(
                "note delta success",
                "changed=",
                len(changed_nids),
                "nodes=",
                nodes_count,
                "edges=",
                edges_count,
            )
            try:
                for nid in changed_nids:
                    self._pending_changed_nids.discard(int(nid))
            except Exception:
                self._pending_changed_nids.clear()
            payload_json = json.dumps(result or {}, ensure_ascii=False).replace("</", "<\\/")
            logger.dbg("note delta dispatch", "bytes=", len(payload_json))
            delta_js = (
                "(function(){"
                "const data=" + payload_json + ";"
                "if(window.ajpcGraphDelta){"
                "window.ajpcGraphDelta(data);"
                "if(window.pycmd){pycmd('log:graph delta called');}"
                "}else if(window.ajpcGraphUpdate){"
                "window.ajpcGraphUpdate(data);"
                "if(window.pycmd){pycmd('log:graph update fallback called');}"
                "}else{"
                "if(window.pycmd){pycmd('log:graph delta no handler');}"
                "}"
                "})();"
            )
            self.web.eval(delta_js)
            self._flush_pending_focus_in_graph()

        def on_failure(err: Exception) -> None:
            logger.dbg("note delta push failed", repr(err))
            self._schedule_refresh("note delta fallback")

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _request_focus_note_in_graph(self, nid: int) -> None:
        try:
            target_nid = int(nid or 0)
        except Exception:
            target_nid = 0
        if target_nid <= 0:
            return
        self._pending_focus_nid = target_nid
        logger.dbg("graph focus requested", target_nid, "ready=", bool(getattr(self, "_graph_ready", False)))
        self._flush_pending_focus_in_graph()

    def _flush_pending_focus_in_graph(self) -> None:
        if not getattr(self, "_graph_ready", False):
            return
        try:
            target_nid = int(getattr(self, "_pending_focus_nid", 0) or 0)
        except Exception:
            target_nid = 0
        if target_nid <= 0:
            return
        js = (
            "(function(){"
            "var nid=" + str(target_nid) + ";"
            "var attempts=0;"
            "var maxAttempts=80;"
            "function tryFocus(){"
            "attempts+=1;"
            "var adapter=(window&&window.GraphAdapter)||null;"
            "if(adapter&&typeof adapter.callEngine==='function'){"
            "adapter.callEngine('focusNodeById', String(nid), true);"
            "if(window.pycmd){window.pycmd('log:graph focus nid '+String(nid));}"
            "return;"
            "}"
            "if(attempts<maxAttempts){setTimeout(tryFocus,50);}"
            "}"
            "tryFocus();"
            "})();"
        )
        try:
            self.web.eval(js)
            self._pending_focus_nid = 0
            logger.dbg("graph focus dispatched", target_nid)
        except Exception:
            logger.dbg("graph focus dispatch failed", target_nid)

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
            self._flush_pending_focus_in_graph()
            try:
                meta = result.get("meta") if isinstance(result, dict) else {}
                if isinstance(meta, dict) and str(meta.get("error") or "") == "missing_tools_config":
                    logger.dbg("graph api missing on first load, scheduling retry refresh")
                    self._schedule_refresh("await main graph api")
            except Exception:
                pass

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
            self._flush_pending_focus_in_graph()

        def on_failure(err: Exception) -> None:
            logger.dbg("graph refresh failed", repr(err))

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _schedule_refresh(self, reason: str) -> None:
        logger.dbg("schedule refresh", reason)
        try:
            self._delta_timer.stop()
        except Exception:
            pass
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
                    self._schedule_note_delta_push("note change")
                else:
                    self._schedule_refresh("note change (unknown nid)")
                return
            if getattr(changes, "tag", False) or getattr(changes, "deck", False):
                self._schedule_refresh("tag/deck change")
                return
            if getattr(changes, "notetype", False):
                self._schedule_refresh("notetype change")
                return
        except Exception:
            pass
