from __future__ import annotations

import json
from typing import Any

from aqt import mw
from aqt.operations import QueryOp
from aqt.utils import showInfo

from . import logger
from .graph_data import build_graph, build_note_delta_slice
from .graph_web_assets import render_graph_html


class GraphSyncMixin:
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
        logger.info("graph load start")

        def op(_col):
            return build_graph(_col)

        def on_success(result: dict[str, Any]) -> None:
            logger.info(
                "graph load done",
                "nodes=",
                len(result.get("nodes", [])),
                "edges=",
                len(result.get("edges", [])),
            )
            if isinstance(result, dict):
                meta = result.get("meta")
                if not isinstance(meta, dict):
                    meta = {}
                    result["meta"] = meta
                meta["delta_rev"] = int(getattr(self, "_delta_rev", 0) or 0)
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
                "if(window.pycmd){pycmd('log:info:graph init called');}"
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
                    logger.warn("graph api missing on first load, scheduling retry refresh")
                    self._schedule_refresh("await main graph api")
            except Exception:
                pass

        def on_failure(err: Exception) -> None:
            logger.error("graph build failed", repr(err))
            showInfo(f"Graph build failed: {err!r}")

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _refresh(self) -> None:
        if mw is None or not getattr(mw, "col", None):
            return
        if not self._graph_ready:
            self._load()
            return
        logger.info("graph refresh start")

        def op(_col):
            return build_graph(_col)

        def on_success(result: dict[str, Any]) -> None:
            logger.info(
                "graph refresh done",
                "nodes=",
                len(result.get("nodes", [])),
                "edges=",
                len(result.get("edges", [])),
            )
            if isinstance(result, dict):
                meta = result.get("meta")
                if not isinstance(meta, dict):
                    meta = {}
                    result["meta"] = meta
                meta["delta_rev"] = int(getattr(self, "_delta_rev", 0) or 0)
            payload_json = json.dumps(result, ensure_ascii=False).replace("</", "<\\/")
            update_js = (
                "(function(){"
                "const data=" + payload_json + ";"
                "if(window.ajpcGraphUpdate){"
                "window.ajpcGraphUpdate(data);"
                "if(window.pycmd){pycmd('log:info:graph update called');}"
                "}else if(window.ajpcGraphInit){"
                "window.ajpcGraphInit(data);"
                "if(window.pycmd){pycmd('log:info:graph init called');}"
                "}"
                "})();"
            )
            self.web.eval(update_js)
            self._flush_pending_focus_in_graph()

        def on_failure(err: Exception) -> None:
            logger.error("graph refresh failed", repr(err))

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _schedule_refresh(self, reason: str) -> None:
        logger.dbg("schedule refresh", reason)
        try:
            self._refresh_timer.stop()
        except Exception:
            pass
        self._refresh_timer.start(350)

    def _next_delta_rev(self) -> int:
        try:
            current = int(getattr(self, "_delta_rev", 0) or 0)
        except Exception:
            current = 0
        current += 1
        self._delta_rev = current
        return current

    def _enqueue_note_delta(self, nids: list[int], reason: str) -> None:
        pending = getattr(self, "_pending_delta_nids", None)
        if not isinstance(pending, set):
            pending = set()
            self._pending_delta_nids = pending
        for raw in nids or []:
            try:
                nid = int(raw or 0)
            except Exception:
                nid = 0
            if nid > 0:
                pending.add(nid)
        if not pending:
            return
        self._pending_delta_reason = str(reason or "note change")
        logger.dbg("queue delta", "reason=", self._pending_delta_reason, "nids=", sorted(pending))
        if not getattr(self, "_graph_ready", False):
            self._schedule_refresh("delta queued before graph ready")
            return
        if bool(getattr(self, "_delta_inflight", False)):
            return
        try:
            self._delta_timer.stop()
        except Exception:
            pass
        self._delta_timer.start(120)

    def _dispatch_note_delta(self) -> None:
        if not getattr(self, "_graph_ready", False):
            return
        if bool(getattr(self, "_delta_inflight", False)):
            return
        pending = getattr(self, "_pending_delta_nids", None)
        if not isinstance(pending, set) or not pending:
            return
        changed = sorted(int(x) for x in pending if int(x) > 0)
        if not changed:
            self._pending_delta_nids = set()
            return
        self._pending_delta_nids = set()
        reason = str(getattr(self, "_pending_delta_reason", "note change") or "note change")
        rev = self._next_delta_rev()
        self._delta_inflight = True
        logger.info("dispatch delta", "rev=", rev, "reason=", reason, "changed=", changed)

        def op(_col):
            return build_note_delta_slice(
                _col,
                changed_nids=changed,
                reason=reason,
                rev=rev,
            )

        def on_success(result: dict[str, Any]) -> None:
            self._delta_inflight = False
            try:
                meta = (result or {}).get("meta") if isinstance(result, dict) else {}
            except Exception:
                meta = {}
            if isinstance(meta, dict) and str(meta.get("error") or "") == "missing_tools_config":
                logger.warn("delta skipped: missing tools config, scheduling refresh")
                self._schedule_refresh("await main graph api")
                return
            try:
                payload_json = json.dumps(result or {}, ensure_ascii=False).replace("</", "<\\/")
            except Exception:
                payload_json = "{}"
            try:
                js = (
                    "(function(){"
                    "const data=" + payload_json + ";"
                    "if(window.ajpcGraphDelta){"
                    "window.ajpcGraphDelta(data);"
                    "}else if(window.pycmd){"
                    "window.pycmd('refresh');"
                    "}"
                    "})();"
                )
                self.web.eval(js)
                logger.info(
                    "delta sent",
                    "rev=",
                    int((result or {}).get("rev") or rev),
                    "nodes=",
                    len((result or {}).get("nodes_raw") or []),
                    "edges=",
                    len((result or {}).get("edges_raw") or []),
                )
            except Exception as exc:
                logger.error("delta dispatch eval failed", repr(exc))
                self._schedule_refresh("delta eval failed")
            if getattr(self, "_pending_delta_nids", None):
                try:
                    self._delta_timer.stop()
                except Exception:
                    pass
                self._delta_timer.start(90)

        def on_failure(err: Exception) -> None:
            self._delta_inflight = False
            logger.error("delta build failed", repr(err))
            self._schedule_refresh("delta build failed")

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

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

                note_ids: list[int] = []
                try:
                    if handler is not None:
                        cand = getattr(handler, "note", None)
                        if cand is not None and getattr(cand, "id", None):
                            note_ids.append(int(cand.id))
                        elif getattr(handler, "note_id", None):
                            note_ids.append(int(getattr(handler, "note_id")))
                        elif getattr(handler, "nid", None):
                            note_ids.append(int(getattr(handler, "nid")))
                except Exception:
                    pass
                if note_ids:
                    self._enqueue_note_delta(note_ids, "note change")
                else:
                    self._schedule_refresh("note change unknown nid")
                return
            if getattr(changes, "tag", False) or getattr(changes, "deck", False):
                self._schedule_refresh("tag/deck change")
                return
            if getattr(changes, "notetype", False):
                self._schedule_refresh("notetype change")
                return
        except Exception:
            pass
