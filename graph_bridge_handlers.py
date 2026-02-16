from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import unquote

from aqt import mw
from aqt.operations import QueryOp

from . import logger
from .graph_actions import (
    _filter_family,
    _open_browser_for_note,
    _open_browser_for_notetype,
    _open_browser_for_tag,
    _open_editor,
)
from .graph_api_adapter import _get_dependency_tree_via_main_api
from .graph_config import (
    set_card_dot_buried_color,
    set_card_dot_suspended_color,
    set_card_dots_enabled,
    set_engine_value,
    set_family_chain_edges,
    set_family_same_prio_edges,
    set_family_same_prio_opacity,
    set_hub_damping,
    set_kanji_component_color,
    set_kanji_component_flow,
    set_kanji_component_focus_only,
    set_kanji_component_opacity,
    set_kanji_component_style,
    set_kanji_components_enabled,
    set_kanji_quantile_norm,
    set_kanji_tfidf_enabled,
    set_kanji_top_k,
    set_kanji_top_k_enabled,
    set_layer_enabled,
    set_layer_flow,
    set_layer_flow_radius_mul,
    set_layer_flow_spacing_mul,
    set_layer_flow_speed,
    set_layer_style,
    set_link_color,
    set_link_distance,
    set_link_mst_enabled,
    set_link_strength,
    set_link_weight,
    set_neighbor_scaling,
    set_node_value,
    set_mass_linker_group_hubs,
    set_note_type_color,
    set_note_type_label_field,
    set_note_type_linked_field,
    set_note_type_tooltip_fields,
    set_note_type_visible,
    set_reference_auto_opacity,
    set_reference_damping,
    set_renderer_value,
    set_selected_decks,
    set_show_unlinked,
    set_soft_pin_radius,
    set_solver_value,
    set_trailing_hub_distance,
)
from .graph_data import _parse_family_field
from .graph_note_ops import (
    _apply_family_id_rename_global,
    _append_family_to_note,
    _append_link_to_note,
    _get_family_cfg,
    _get_family_note_type_ids,
    _normalize_family_id,
    _preview_family_id_rename,
    _remove_family_from_note,
    _remove_link_from_note,
    _validate_target_family_id,
)
from .graph_previewer import _open_preview, _open_preview_card


class GraphBridgeHandlersMixin:
    def _emit_ctx_family_edit_callback(self, callback_name: str, payload: dict[str, Any]) -> None:
        try:
            payload_json = json.dumps(payload or {}, ensure_ascii=False).replace("</", "<\\/")
            js = (
                "(function(){"
                "if(window." + str(callback_name) + "){"
                "window." + str(callback_name) + "(" + payload_json + ");"
                "}"
                "})();"
            )
            self.web.eval(js)
        except Exception:
            logger.dbg("ctx family edit callback failed", callback_name)

    def _ctx_family_edit_request(self, payload: str) -> dict[str, Any]:
        result: dict[str, Any] = {
            "ok": False,
            "old_fid": "",
            "new_fid": "",
            "affected_notes": 0,
            "scanned_notes": 0,
            "collisions": 0,
            "changed_notes": 0,
            "error": "",
        }
        try:
            data = json.loads(unquote(payload)) if payload else {}
            if not isinstance(data, dict):
                data = {}
        except Exception:
            result["error"] = "Invalid payload"
            return {"ok": False, "result": result}

        old_fid = _normalize_family_id(str(data.get("old_fid") or ""))
        new_fid = _normalize_family_id(str(data.get("new_fid") or ""))
        result["old_fid"] = old_fid
        result["new_fid"] = new_fid

        family_field, sep, default_prio = _get_family_cfg()
        note_type_ids = _get_family_note_type_ids()
        if not family_field:
            result["error"] = "Family field is not configured"
            return {"ok": False, "result": result}
        if not note_type_ids:
            result["error"] = "Family note types are not configured"
            return {"ok": False, "result": result}
        if not old_fid:
            result["error"] = "Old Family ID is required"
            return {"ok": False, "result": result}
        if not new_fid:
            result["error"] = "New Family ID is required"
            return {"ok": False, "result": result}
        if old_fid == new_fid:
            result["error"] = "Old and new Family IDs must be different"
            return {"ok": False, "result": result}
        ok_new, msg = _validate_target_family_id(new_fid, sep)
        if not ok_new:
            result["error"] = msg or "Invalid Family ID"
            return {"ok": False, "result": result}

        return {
            "ok": True,
            "result": result,
            "old_fid": old_fid,
            "new_fid": new_fid,
            "family_field": family_field,
            "sep": sep,
            "default_prio": default_prio,
            "note_type_ids": note_type_ids,
        }

    def _ctx_family_edit_preview(self, payload: str) -> None:
        req = self._ctx_family_edit_request(payload)
        if not bool(req.get("ok")):
            self._emit_ctx_family_edit_callback("onCtxFamilyEditPreviewResult", req.get("result") or {})
            logger.dbg("ctx family edit preview rejected", (req.get("result") or {}).get("error", ""))
            return
        logger.dbg("ctx family edit preview start", "old=", req["old_fid"], "new=", req["new_fid"])
        out = _preview_family_id_rename(
            old_fid=str(req["old_fid"]),
            new_fid=str(req["new_fid"]),
            field=str(req["family_field"]),
            sep=str(req["sep"]),
            default_prio=int(req["default_prio"]),
            note_type_ids=set(req["note_type_ids"]),
        )
        out["ok"] = bool(out.get("ok", True))
        out["changed_notes"] = 0
        self._emit_ctx_family_edit_callback("onCtxFamilyEditPreviewResult", out)
        logger.dbg(
            "ctx family edit preview done",
            "old=",
            out.get("old_fid", ""),
            "new=",
            out.get("new_fid", ""),
            "affected=",
            out.get("affected_notes", 0),
            "scanned=",
            out.get("scanned_notes", 0),
            "collisions=",
            out.get("collisions", 0),
        )

    def _ctx_family_edit_apply(self, payload: str) -> None:
        req = self._ctx_family_edit_request(payload)
        if not bool(req.get("ok")):
            self._emit_ctx_family_edit_callback("onCtxFamilyEditApplyResult", req.get("result") or {})
            logger.dbg("ctx family edit apply rejected", (req.get("result") or {}).get("error", ""))
            return

        started = time.perf_counter()
        logger.info("ctx family edit apply start", "old=", req["old_fid"], "new=", req["new_fid"])

        def op(_col):
            return _apply_family_id_rename_global(
                old_fid=str(req["old_fid"]),
                new_fid=str(req["new_fid"]),
                field=str(req["family_field"]),
                sep=str(req["sep"]),
                default_prio=int(req["default_prio"]),
                note_type_ids=set(req["note_type_ids"]),
            )

        def on_success(result: dict[str, Any]) -> None:
            out = dict(result or {})
            changed_nids_raw = out.pop("changed_nids", []) or []
            changed_nids: list[int] = []
            for raw in changed_nids_raw:
                try:
                    nid = int(raw)
                except Exception:
                    nid = 0
                if nid > 0:
                    changed_nids.append(nid)

            changed_notes = int(out.get("changed_notes") or len(changed_nids))
            if changed_notes > 0:
                if changed_notes <= 250:
                    self._enqueue_note_delta(changed_nids, "ctx family id rename")
                    logger.info("ctx family edit refresh strategy", "mode=delta", "changed=", changed_notes)
                else:
                    self._schedule_refresh("ctx family id rename bulk")
                    logger.info("ctx family edit refresh strategy", "mode=full_refresh", "changed=", changed_notes)

            elapsed_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "ctx family edit apply done",
                "old=",
                out.get("old_fid", ""),
                "new=",
                out.get("new_fid", ""),
                "changed=",
                changed_notes,
                "scanned=",
                int(out.get("scanned_notes") or 0),
                "collisions=",
                int(out.get("collisions") or 0),
                "elapsed_ms=",
                elapsed_ms,
            )
            self._emit_ctx_family_edit_callback("onCtxFamilyEditApplyResult", out)

        def on_failure(err: Exception) -> None:
            out = dict(req.get("result") or {})
            out["ok"] = False
            out["error"] = f"Apply failed: {err!r}"
            self._emit_ctx_family_edit_callback("onCtxFamilyEditApplyResult", out)
            logger.error("ctx family edit apply failed", repr(err))

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()

    def _on_bridge_cmd(self, message: str) -> Any:
        # JS -> Python bridge: apply config changes and context actions.
        if message == "refresh":
            logger.info("bridge refresh")
            try:
                self._hide_embedded_editor_panel()
            except Exception:
                pass
            self._load()
        elif message.startswith("log:"):
            payload = str(message[4:] or "")
            level_raw, sep, rest = payload.partition(":")
            level = str(level_raw or "").strip().lower()
            text = rest if sep else payload
            if level == "trace":
                logger.trace("js", text, source="graph_bridge")
            elif level == "info":
                logger.info("js", text, source="graph_bridge")
            elif level in {"warn", "warning"}:
                logger.warn("js", text, source="graph_bridge")
            elif level == "error":
                logger.error("js", text, source="graph_bridge")
            else:
                logger.debug("js", payload, source="graph_bridge")
        elif message.startswith("embed_editor:"):
            try:
                _prefix, rest = message.split(":", 1)
                parts = rest.split(":", 1)
                action = str(parts[0] if parts else "").strip().lower()
                payload = str(parts[1] if len(parts) > 1 else "").strip()
                nid = 0
                if payload:
                    try:
                        nid = int(payload)
                    except Exception:
                        nid = 0
                if action == "rect":
                    try:
                        raw = unquote(payload) if payload else "{}"
                        data = json.loads(raw) if raw else {}
                        if not isinstance(data, dict):
                            data = {}
                    except Exception:
                        data = {}
                    self._editor_panel_rect = {
                        "visible": bool(data.get("visible", False)),
                        "x": int(data.get("x", 0) or 0),
                        "y": int(data.get("y", 0) or 0),
                        "w": int(data.get("w", 0) or 0),
                        "h": int(data.get("h", 0) or 0),
                        "vw": int(data.get("vw", 0) or 0),
                        "vh": int(data.get("vh", 0) or 0),
                    }
                    try:
                        self._editor_panel_transition_ms = max(1, int(data.get("tms", self._editor_panel_transition_ms) or self._editor_panel_transition_ms))
                    except Exception:
                        self._editor_panel_transition_ms = 180
                    self._update_embedded_editor_geometry()
                    logger.dbg("embed editor rect", self._editor_panel_rect)
                elif action == "open" or action == "select":
                    try:
                        self._hard_set_embedded_editor_transparent_background()
                    except Exception:
                        pass
                    opened = self._show_embedded_editor_for_note(nid)
                    logger.dbg("embed editor open", nid, opened)
                elif action == "toggle":
                    try:
                        self._hard_set_embedded_editor_transparent_background()
                    except Exception:
                        pass
                    opened = self._toggle_embedded_editor(nid)
                    logger.dbg("embed editor toggle", nid, opened)
                elif action == "devtools":
                    self._open_embedded_editor_devtools()
                    logger.dbg("embed editor devtools")
                elif action == "cssreload":
                    self._reload_embedded_editor_css()
                    logger.dbg("embed editor css reload")
                elif action == "close":
                    try:
                        self._hard_set_embedded_editor_transparent_background()
                    except Exception:
                        pass
                    self._hide_embedded_editor_panel()
                    logger.dbg("embed editor close")
                else:
                    logger.dbg("embed editor unknown action", action, payload)
            except Exception:
                logger.dbg("embed editor parse failed", message)
        elif message.startswith("ntvis:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, val = rest.split(":", 1)
                set_note_type_visible(mid, val == "1")
                logger.dbg("note type visible", mid, val)
            except Exception:
                logger.dbg("note type visible parse failed", message)
        elif message.startswith("label:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, enc = rest.split(":", 1)
                field = unquote(enc)
                set_note_type_label_field(mid, field)
                logger.dbg("note type label", mid, field)
                self._schedule_refresh("note type label")
            except Exception:
                logger.dbg("note type label parse failed", message)
        elif message.startswith("lnfield:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, enc = rest.split(":", 1)
                field = unquote(enc)
                set_note_type_linked_field(mid, field)
                logger.dbg("note type linked field", mid, field)
                self._schedule_refresh("note type linked")
            except Exception:
                logger.dbg("note type linked parse failed", message)
        elif message.startswith("nttip:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, enc = rest.split(":", 1)
                raw = unquote(enc)
                fields = json.loads(raw) if raw else []
                if not isinstance(fields, list):
                    fields = []
                set_note_type_tooltip_fields(mid, fields)
                logger.dbg("note type tooltip fields", mid, len(fields))
                self._schedule_refresh("note type tooltip")
            except Exception:
                logger.dbg("note type tooltip parse failed", message)
        elif message.startswith("color:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, enc = rest.split(":", 1)
                color = unquote(enc)
                set_note_type_color(mid, color)
                logger.dbg("note type color", mid, color)
            except Exception:
                logger.dbg("note type color parse failed", message)
        elif message.startswith("lcol:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, enc = rest.split(":", 1)
                color = unquote(enc)
                set_link_color(layer, color)
                logger.dbg("link color", layer, color)
            except Exception:
                logger.dbg("link color parse failed", message)
        elif message.startswith("lenabled:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, val = rest.split(":", 1)
                set_layer_enabled(layer, val == "1")
                logger.dbg("layer enabled", layer, val)
            except Exception:
                logger.dbg("layer enabled parse failed", message)
        elif message.startswith("lstyle:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, enc = rest.split(":", 1)
                style = unquote(enc)
                set_layer_style(layer, style)
                logger.dbg("layer style", layer, style)
            except Exception:
                logger.dbg("layer style parse failed", message)
        elif message.startswith("lflow:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, val = rest.split(":", 1)
                set_layer_flow(layer, val == "1")
                logger.dbg("layer flow", layer, val)
            except Exception:
                logger.dbg("layer flow parse failed", message)
        elif message.startswith("lstrength:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, val = rest.split(":", 1)
                set_link_strength(layer, float(val))
                logger.dbg("link strength", layer, val)
            except Exception:
                logger.dbg("link strength parse failed", message)
        elif message.startswith("lweight:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, val = rest.split(":", 1)
                set_link_weight(layer, float(val))
                logger.dbg("link weight", layer, val)
            except Exception:
                logger.dbg("link weight parse failed", message)
        elif message.startswith("ldistance:"):
            try:
                _prefix, rest = message.split(":", 1)
                layer, val = rest.split(":", 1)
                set_link_distance(layer, float(val))
                logger.dbg("link distance", layer, val)
            except Exception:
                logger.dbg("link distance parse failed", message)
        elif message.startswith("lflowspeed:"):
            try:
                _prefix, val = message.split(":", 1)
                set_layer_flow_speed(float(val))
                logger.dbg("layer flow speed", val)
            except Exception:
                logger.dbg("layer flow speed parse failed", message)
        elif message.startswith("lflowspacing:"):
            try:
                _prefix, val = message.split(":", 1)
                set_layer_flow_spacing_mul(float(val))
                logger.dbg("layer flow spacing", val)
            except Exception:
                logger.dbg("layer flow spacing parse failed", message)
        elif message.startswith("lflowwidth:"):
            try:
                _prefix, val = message.split(":", 1)
                set_layer_flow_radius_mul(float(val))
                logger.dbg("layer flow width", val)
            except Exception:
                logger.dbg("layer flow width parse failed", message)
        elif message.startswith("ltrailinghubdist:"):
            try:
                _prefix, val = message.split(":", 1)
                set_trailing_hub_distance(float(val))
                logger.dbg("trailing hub distance", val)
            except Exception:
                logger.dbg("trailing hub distance parse failed", message)
        elif message == "devtools":
            logger.dbg("devtools open")
            try:
                self._open_devtools()
            except Exception:
                pass
        elif message.startswith("solver:"):
            try:
                _prefix, rest = message.split(":", 1)
                key, val = rest.split(":", 1)
                set_solver_value(key, val)
                logger.dbg("solver", key, val)
            except Exception:
                logger.dbg("solver parse failed", message)
        elif message.startswith("renderer:"):
            try:
                _prefix, rest = message.split(":", 1)
                key, val = rest.split(":", 1)
                set_renderer_value(key, val)
                logger.dbg("renderer", key, val)
            except Exception:
                logger.dbg("renderer parse failed", message)
        elif message.startswith("engine:"):
            try:
                _prefix, rest = message.split(":", 1)
                key, val = rest.split(":", 1)
                set_engine_value(key, val)
                logger.dbg("engine", key, val)
            except Exception:
                logger.dbg("engine parse failed", message)
        elif message.startswith("node:"):
            try:
                _prefix, rest = message.split(":", 1)
                key, val = rest.split(":", 1)
                set_node_value(key, val)
                logger.dbg("node", key, val)
            except Exception:
                logger.dbg("node parse failed", message)
        elif message.startswith("neighborscale:"):
            try:
                _prefix, enc = message.split(":", 1)
                raw = unquote(enc)
                cfg = json.loads(raw) if raw else {}
                if not isinstance(cfg, dict):
                    cfg = {}
                set_neighbor_scaling(cfg)
                logger.dbg("neighbor scaling", "ok")
            except Exception:
                logger.dbg("neighbor scaling parse failed", message)
        elif message.startswith("softpin:"):
            try:
                _prefix, val = message.split(":", 1)
                set_soft_pin_radius(float(val))
                logger.dbg("soft pin radius", val)
            except Exception:
                logger.dbg("soft pin radius parse failed", message)
        elif message.startswith("refauto:"):
            try:
                _prefix, val = message.split(":", 1)
                set_reference_auto_opacity(float(val))
                logger.dbg("reference auto opacity", val)
                self._schedule_refresh("reference auto opacity")
            except Exception:
                logger.dbg("reference auto opacity parse failed", message)
        elif message.startswith("refdamp:"):
            try:
                _prefix, val = message.split(":", 1)
                set_reference_damping(val == "1")
                logger.dbg("reference damping", val)
            except Exception:
                logger.dbg("reference damping parse failed", message)
        elif message.startswith("linkmst:"):
            try:
                _prefix, val = message.split(":", 1)
                set_link_mst_enabled(val == "1")
                logger.dbg("link mst enabled", val)
            except Exception:
                logger.dbg("link mst parse failed", message)
        elif message.startswith("hubdamp:"):
            try:
                _prefix, val = message.split(":", 1)
                set_hub_damping(val == "1")
                logger.dbg("hub damping", val)
            except Exception:
                logger.dbg("hub damping parse failed", message)
        elif message.startswith("kcomp:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_components_enabled(val == "1")
                logger.dbg("kanji components enabled", val)
            except Exception:
                logger.dbg("kanji components parse failed", message)
        elif message.startswith("kanjitfidf:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_tfidf_enabled(val == "1")
                logger.dbg("kanji tfidf enabled", val)
            except Exception:
                logger.dbg("kanji tfidf parse failed", message)
        elif message.startswith("kanjitopkenabled:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_top_k_enabled(val == "1")
                logger.dbg("kanji top-k enabled", val)
            except Exception:
                logger.dbg("kanji top-k enabled parse failed", message)
        elif message.startswith("kanjitopk:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_top_k(float(val))
                logger.dbg("kanji top-k", val)
            except Exception:
                logger.dbg("kanji top-k parse failed", message)
        elif message.startswith("kanjinorm:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_quantile_norm(val == "1")
                logger.dbg("kanji quantile norm", val)
            except Exception:
                logger.dbg("kanji quantile norm parse failed", message)
        elif message.startswith("kcompstyle:"):
            try:
                _prefix, enc = message.split(":", 1)
                style = unquote(enc)
                set_kanji_component_style(style)
                logger.dbg("kanji component style", style)
            except Exception:
                logger.dbg("kanji component style parse failed", message)
        elif message.startswith("kcompcol:"):
            try:
                _prefix, enc = message.split(":", 1)
                color = unquote(enc)
                set_kanji_component_color(color)
                logger.dbg("kanji component color", color)
            except Exception:
                logger.dbg("kanji component color parse failed", message)
        elif message.startswith("kcompop:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_component_opacity(float(val))
                logger.dbg("kanji component opacity", val)
            except Exception:
                logger.dbg("kanji component opacity parse failed", message)
        elif message.startswith("kcompfocus:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_component_focus_only(val == "1")
                logger.dbg("kanji component focus only", val)
            except Exception:
                logger.dbg("kanji component focus parse failed", message)
        elif message.startswith("kcompflow:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_component_flow(val == "1")
                logger.dbg("kanji component flow", val)
            except Exception:
                logger.dbg("kanji component flow parse failed", message)
        elif message.startswith("cdot:"):
            try:
                _prefix, rest = message.split(":", 1)
                kind, enc = rest.split(":", 1)
                color = unquote(enc)
                if kind == "suspended":
                    set_card_dot_suspended_color(color)
                    logger.dbg("card dot suspended color", color)
                elif kind == "buried":
                    set_card_dot_buried_color(color)
                    logger.dbg("card dot buried color", color)
            except Exception:
                logger.dbg("card dot color parse failed", message)
        elif message.startswith("cdotenabled:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_card_dots_enabled(enabled)
                logger.dbg("card dots enabled", enabled)
            except Exception:
                logger.dbg("card dots enabled parse failed", message)
        elif message.startswith("decks:"):
            try:
                _prefix, enc = message.split(":", 1)
                raw = unquote(enc)
                decks = json.loads(raw) if raw else []
                if not isinstance(decks, list):
                    decks = []
                set_selected_decks(decks)
                logger.dbg("selected decks", len(decks))
                self._schedule_refresh("selected decks")
            except Exception:
                logger.dbg("deck selection parse failed", message)
        elif message.startswith("showunlinked:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_show_unlinked(enabled)
                logger.dbg("show unlinked", enabled)
                self._schedule_refresh("show unlinked")
            except Exception:
                logger.dbg("show unlinked parse failed", message)
        elif message.startswith("mlghubs:"):
            try:
                _prefix, enc = message.split(":", 1)
                raw = unquote(enc)
                groups = json.loads(raw) if raw else []
                if not isinstance(groups, list):
                    groups = []
                set_mass_linker_group_hubs(groups)
                logger.dbg("mass linker group hubs", len(groups))
                self._schedule_refresh("mass linker group hubs")
            except Exception:
                logger.dbg("mass linker group hubs parse failed", message)
        elif message.startswith("fprio:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_family_same_prio_edges(enabled)
                logger.dbg("family same prio edges", enabled)
                self._schedule_refresh("family same prio edges")
            except Exception:
                logger.dbg("family same prio parse failed", message)
        elif message.startswith("fprioop:"):
            try:
                _prefix, val = message.split(":", 1)
                set_family_same_prio_opacity(float(val))
                logger.dbg("family same prio opacity", val)
                self._schedule_refresh("family same prio opacity")
            except Exception:
                logger.dbg("family same prio opacity parse failed", message)
        elif message.startswith("fchain:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_family_chain_edges(enabled)
                logger.dbg("family chain edges", enabled)
                self._schedule_refresh("family chain edges")
            except Exception:
                logger.dbg("family chain parse failed", message)
        elif message.startswith("deptree:"):
            try:
                _prefix, raw_nid = message.split(":", 1)
                nid = int(raw_nid or "0")
            except Exception:
                nid = 0
            try:
                data = _get_dependency_tree_via_main_api(nid) if nid > 0 else {}
                if not isinstance(data, dict):
                    data = {}
                if nid > 0 and not data.get("current_nid"):
                    data["current_nid"] = int(nid)
                payload_json = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
                js = (
                    "(function(){"
                    "if(window.setActiveDepTreeFromPy){"
                    "window.setActiveDepTreeFromPy(" + payload_json + ");"
                    "}"
                    "})();"
                )
                self.web.eval(js)
                logger.dbg("deptree", nid, "nodes=", len(data.get("nodes", []) or []), "edges=", len(data.get("edges", []) or []))
            except Exception:
                logger.dbg("deptree failed", message)
        elif message.startswith("ctx:"):
            try:
                _prefix, rest = message.split(":", 1)
                kind, payload = rest.split(":", 1)
            except Exception:
                logger.dbg("ctx parse failed", message)
                return None
            if kind == "preview":
                try:
                    _open_preview(int(payload))
                    logger.dbg("ctx preview", payload)
                except Exception:
                    logger.dbg("ctx preview failed", payload)
            elif kind == "previewcard":
                try:
                    _open_preview_card(int(payload))
                    logger.dbg("ctx preview card", payload)
                except Exception:
                    logger.dbg("ctx preview card failed", payload)
            elif kind == "edit":
                try:
                    _open_editor(int(payload))
                    logger.dbg("ctx edit", payload)
                except Exception:
                    logger.dbg("ctx edit failed", payload)
            elif kind == "editapi":
                try:
                    _open_editor(int(payload), prefer_api=True)
                    logger.dbg("ctx editapi", payload)
                except Exception:
                    logger.dbg("ctx editapi failed", payload)
            elif kind == "browser":
                try:
                    _open_browser_for_note(int(payload))
                    logger.dbg("ctx browser", payload)
                except Exception:
                    logger.dbg("ctx browser failed", payload)
            elif kind == "browsernt":
                try:
                    _open_browser_for_notetype(int(payload))
                    logger.dbg("ctx browsernt", payload)
                except Exception:
                    logger.dbg("ctx browsernt failed", payload)
            elif kind == "browsertag":
                try:
                    tag = unquote(payload)
                    _open_browser_for_tag(tag)
                    logger.dbg("ctx browsertag", tag)
                except Exception:
                    logger.dbg("ctx browsertag failed", payload)
            elif kind == "filter":
                try:
                    fid = unquote(payload)
                    _filter_family(fid)
                    logger.dbg("ctx filter", fid)
                except Exception:
                    logger.dbg("ctx filter failed", payload)
            elif kind == "famedit_preview":
                try:
                    self._ctx_family_edit_preview(payload)
                except Exception:
                    logger.dbg("ctx famedit preview failed", payload)
            elif kind == "famedit_apply":
                try:
                    self._ctx_family_edit_apply(payload)
                except Exception:
                    logger.dbg("ctx famedit apply failed", payload)
            elif kind == "connect":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    source_kind = str(data.get("source_kind") or "")
                    source_label = str(data.get("source_label") or "")
                    families = data.get("families")
                    prio_mode = str(data.get("prio_mode") or "")
                    if not source or not target:
                        logger.dbg("ctx connect missing ids", payload)
                        return None
                    try:
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx connect bad target", target)
                        return None
                    family_field, sep, default_prio = _get_family_cfg()
                    fids: list[str] = []
                    prio_map: dict[str, int] = {}
                    if source_kind == "family" or str(source).startswith("family:"):
                        fid = source_label or str(source).replace("family:", "", 1)
                        if fid:
                            prio_map[fid] = 0
                        if not prio_mode:
                            prio_mode = "hub_zero"
                        if isinstance(families, list) and families:
                            fids = [str(f).strip() for f in families if str(f).strip()]
                        elif fid:
                            fids = [fid]
                    else:
                        try:
                            source_nid = int(source)
                        except Exception:
                            logger.dbg("ctx connect bad source", source)
                            return None
                        if not family_field:
                            logger.dbg("ctx connect missing family field")
                            return None
                        note = mw.col.get_note(source_nid) if mw and mw.col else None
                        if note is None or family_field not in note:
                            logger.dbg("ctx connect source missing field", source_nid)
                            return None
                        fams = _parse_family_field(str(note[family_field] or ""), sep, default_prio)
                        if not fams:
                            logger.dbg("ctx connect source no families", source_nid)
                            return None
                        for fid_val, base_prio in fams:
                            if fid_val not in prio_map:
                                prio_map[fid_val] = int(base_prio)
                        if isinstance(families, list) and families:
                            fids = [str(f).strip() for f in families if str(f).strip() and str(f).strip() in prio_map]
                        else:
                            fid, base_prio = min(fams, key=lambda pair: pair[1])
                            fids = [fid]
                    if not fids:
                        logger.dbg("ctx connect no fid", payload)
                        return None
                    changed = False
                    for fid in fids:
                        base = prio_map.get(fid, 0)
                        prio = int(base) + 1
                        if prio_mode == "same":
                            prio = int(base)
                        elif prio_mode == "minus1":
                            prio = int(base) - 1
                        elif prio_mode == "hub_plus1":
                            prio = 1
                        elif prio_mode == "hub_zero":
                            prio = 0
                        if prio < 0:
                            prio = 0
                        if _append_family_to_note(target_nid, fid, prio, family_field, sep, default_prio):
                            changed = True
                    if changed:
                        self._enqueue_note_delta([target_nid], "ctx connect")
                        logger.dbg("ctx connect", target_nid, fids)
                    else:
                        logger.dbg("ctx connect no-op", target_nid, fids)
                except Exception:
                    logger.dbg("ctx connect failed", payload)
            elif kind == "disconnect":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    source_kind = str(data.get("source_kind") or "")
                    source_label = str(data.get("source_label") or "")
                    families = data.get("families")
                    if not source or not target:
                        logger.dbg("ctx disconnect missing ids", payload)
                        return None
                    try:
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx disconnect bad target", target)
                        return None
                    family_field, sep, default_prio = _get_family_cfg()
                    fids: list[str] = []
                    if source_kind == "family" or str(source).startswith("family:"):
                        fid = source_label or str(source).replace("family:", "", 1)
                        if isinstance(families, list) and families:
                            fids = [str(f).strip() for f in families if str(f).strip()]
                        elif fid:
                            fids = [fid]
                    else:
                        try:
                            source_nid = int(source)
                        except Exception:
                            logger.dbg("ctx disconnect bad source", source)
                            return None
                        if not family_field:
                            logger.dbg("ctx disconnect missing family field")
                            return None
                        note = mw.col.get_note(source_nid) if mw and mw.col else None
                        if note is None or family_field not in note:
                            logger.dbg("ctx disconnect source missing field", source_nid)
                            return None
                        fams = _parse_family_field(str(note[family_field] or ""), sep, default_prio)
                        if not fams:
                            logger.dbg("ctx disconnect source no families", source_nid)
                            return None
                        if isinstance(families, list) and families:
                            fids = [str(f).strip() for f in families if str(f).strip()]
                        else:
                            fid, _prio = min(fams, key=lambda pair: pair[1])
                            fids = [fid]
                    if not fids:
                        logger.dbg("ctx disconnect no fid", payload)
                        return None
                    changed = False
                    for fid in fids:
                        if _remove_family_from_note(target_nid, fid, family_field, sep, default_prio):
                            changed = True
                    if changed:
                        self._enqueue_note_delta([target_nid], "ctx disconnect")
                        logger.dbg("ctx disconnect", target_nid, fids)
                    else:
                        logger.dbg("ctx disconnect no-op", target_nid, fids)
                except Exception:
                    logger.dbg("ctx disconnect failed", payload)
            elif kind == "link":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    label = str(data.get("label") or "")
                    if not source or not target:
                        logger.dbg("ctx link missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx link bad ids", payload)
                        return None
                    if _append_link_to_note(target_nid, source_nid, label):
                        self._enqueue_note_delta([target_nid], "ctx link")
                        logger.dbg("ctx link", target_nid, source_nid)
                    else:
                        logger.dbg("ctx link no-op", target_nid, source_nid)
                except Exception:
                    logger.dbg("ctx link failed", payload)
            elif kind == "link_active":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    label = str(data.get("label") or "")
                    if not source or not target:
                        logger.dbg("ctx link_active missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx link_active bad ids", payload)
                        return None
                    if _append_link_to_note(target_nid, source_nid, label):
                        self._enqueue_note_delta([target_nid], "ctx link active")
                        logger.dbg("ctx link active", target_nid, source_nid)
                    else:
                        logger.dbg("ctx link active no-op", target_nid, source_nid)
                except Exception:
                    logger.dbg("ctx link active failed", payload)
            elif kind == "link_both":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    source_label = str(data.get("source_label") or "")
                    target_label = str(data.get("target_label") or "")
                    if not source or not target:
                        logger.dbg("ctx link both missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx link both bad ids", payload)
                        return None
                    changed = False
                    if _append_link_to_note(target_nid, source_nid, source_label):
                        changed = True
                    if _append_link_to_note(source_nid, target_nid, target_label):
                        changed = True
                    if changed:
                        self._enqueue_note_delta([source_nid, target_nid], "ctx link both")
                        logger.dbg("ctx link both", source_nid, target_nid)
                    else:
                        logger.dbg("ctx link both no-op", source_nid, target_nid)
                except Exception:
                    logger.dbg("ctx link both failed", payload)
            elif kind == "unlink":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    if not source or not target:
                        logger.dbg("ctx unlink missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx unlink bad ids", payload)
                        return None
                    if _remove_link_from_note(target_nid, source_nid):
                        self._enqueue_note_delta([target_nid], "ctx unlink")
                        logger.dbg("ctx unlink", target_nid, source_nid)
                    else:
                        logger.dbg("ctx unlink no-op", target_nid, source_nid)
                except Exception:
                    logger.dbg("ctx unlink failed", payload)
            elif kind == "unlink_active":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    if not source or not target:
                        logger.dbg("ctx unlink active missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx unlink active bad ids", payload)
                        return None
                    if _remove_link_from_note(target_nid, source_nid):
                        self._enqueue_note_delta([target_nid], "ctx unlink active")
                        logger.dbg("ctx unlink active", target_nid, source_nid)
                    else:
                        logger.dbg("ctx unlink active no-op", target_nid, source_nid)
                except Exception:
                    logger.dbg("ctx unlink active failed", payload)
            elif kind == "unlink_both":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    if not source or not target:
                        logger.dbg("ctx unlink both missing ids", payload)
                        return None
                    try:
                        source_nid = int(source)
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx unlink both bad ids", payload)
                        return None
                    changed = False
                    if _remove_link_from_note(target_nid, source_nid):
                        changed = True
                    if _remove_link_from_note(source_nid, target_nid):
                        changed = True
                    if changed:
                        self._enqueue_note_delta([source_nid, target_nid], "ctx unlink both")
                        logger.dbg("ctx unlink both", source_nid, target_nid)
                    else:
                        logger.dbg("ctx unlink both no-op", source_nid, target_nid)
                except Exception:
                    logger.dbg("ctx unlink both failed", payload)
        return None

