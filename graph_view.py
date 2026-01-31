from __future__ import annotations

import json
import os
from typing import Any

import aqt
import aqt.editor
import aqt.forms
from aqt import mw, gui_hooks
from aqt.operations import QueryOp
from aqt.qt import (
    QDialogButtonBox,
    QKeySequence,
    QMainWindow,
    QVBoxLayout,
    QWidget,
    Qt,
    QTimer,
)
from aqt.browser.previewer import Previewer
from anki.cards import Card
from aqt.utils import add_close_shortcut, showInfo, restoreGeom, saveGeom, setWindowIcon
from urllib.parse import unquote
from aqt.webview import AnkiWebView

from .graph_data import build_graph
from . import logger
from .graph_config import (
    set_note_type_label_field,
    set_note_type_linked_field,
    set_note_type_tooltip_fields,
    set_note_type_visible,
    set_note_type_color,
    set_layer_color,
    set_family_same_prio_edges,
    set_family_same_prio_opacity,
    set_layer_style,
    set_layer_flow,
    set_layer_flow_speed,
    set_family_chain_edges,
    set_selected_decks,
    set_reference_auto_opacity,
)

ADDON_DIR = os.path.dirname(__file__)
WEB_DIR = os.path.join(ADDON_DIR, "web")


def _web_base() -> str:
    if mw is None or not getattr(mw, "addonManager", None):
        return ""
    try:
        addon_id = mw.addonManager.addonFromModule(__name__)
    except Exception:
        addon_id = ""
    if not addon_id:
        try:
            addon_id = os.path.basename(ADDON_DIR)
        except Exception:
            addon_id = ""
    if not addon_id:
        return ""
    return f"/_addons/{addon_id}/web"


def _html(payload: dict[str, Any]) -> str:
    web_base = _web_base()
    force_graph_src = f"{web_base}/force-graph.min.js" if web_base else ""
    graph_js_src = f"{web_base}/graph.js" if web_base else ""
    logger.dbg("web base", web_base, "graph js", graph_js_src)
    html = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0f1216; color: #e6e6e6; font-family: "Segoe UI", Arial, sans-serif;
    }
    #toolbar {
      display: flex; gap: 12px; align-items: center;
      padding: 8px 12px; background: #141820; border-bottom: 1px solid #1f2530;
      position: fixed; top: 0; left: 0; right: 0; z-index: 5;
    }
    #toolbar-left, #toolbar-center, #toolbar-right {
      display: flex; gap: 10px; align-items: center; flex-wrap: nowrap;
    }
    #toolbar-left { flex: 1; }
    #toolbar-center { flex: 0; }
    #toolbar-right { flex: 1; justify-content: flex-end; }
    #toolbar label.layer-toggle {
      font-size: 12px; color: #c8ced8; padding-bottom: 2px;
      border-bottom: 2px solid transparent;
    }
    #toolbar label.layer-toggle.active { color: #e5e7eb; }
    #toolbar button {
      background: #1a6985; border: none; color: white; padding: 6px 10px;
      border-radius: 6px; cursor: pointer; font-size: 12px;
    }
    #toolbar button.btn-rebuild { background: #2596be; }
    #toolbar button.btn-settings { background: #1a6985; }
    #deck-controls {
      display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;
    }
    #deck-controls input[type=text] {
      background: #111827; color: #e5e7eb; border: 1px solid #1f2937;
      border-radius: 6px; padding: 4px 6px; font-size: 12px; width: 200px;
    }
    #deck-controls input[type=text]::placeholder { color: #6b7280; }
    .dropdown {
      position: relative; min-width: 160px;
    }
    .dropdown-trigger {
      background: #111827; border: 1px solid #1f2937; color: #e5e7eb;
      border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer;
      white-space: nowrap;
    }
    .dropdown-menu {
      position: absolute; top: calc(100% + 6px); left: 0; min-width: 220px;
      max-height: 260px; overflow: auto; background: #0b0f14;
      border: 1px solid #1f2530; border-radius: 8px; padding: 6px;
      display: none; z-index: 12;
    }
    .dropdown.open .dropdown-menu { display: block; }
    .dropdown-item {
      display: flex; gap: 6px; align-items: center; margin-bottom: 4px;
      font-size: 12px; color: #cbd5e1;
    }
    .search-wrap {
      display: flex; gap: 6px; align-items: center;
    }
    #note-type-panel {
      position: fixed; top: 42px; right: 12px; width: 340px;
      max-height: 70%; overflow: auto; background: #0b0f14;
      border: 1px solid #1f2530; border-radius: 8px; padding: 8px;
      display: none; z-index: 8;
    }
    #note-type-panel.open { display: block; }
    #note-type-panel h3 {
      margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb;
    }
    .nt-row {
      display: flex; gap: 6px; align-items: center; margin-bottom: 4px;
      font-size: 12px; color: #cbd5e1;
    }
    .nt-group {
      border: 1px solid #1f2530; border-radius: 6px; padding: 6px;
      margin-bottom: 8px; background: #0d1117;
    }
    .nt-title {
      font-size: 12px; color: #e5e7eb; margin-bottom: 6px;
    }
    .nt-field {
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }
    .nt-field label {
      font-size: 11px; color: #9ca3af; min-width: 90px;
    }
    .nt-row select {
      flex: 1; background: #111827; color: #e5e7eb; border: 1px solid #1f2937;
      border-radius: 6px; padding: 2px 4px; font-size: 12px;
    }
    #physics-panel {
      position: fixed; top: 42px; left: 12px; width: 300px;
      max-height: 70%; overflow: auto; background: #0b0f14;
      border: 1px solid #1f2530; border-radius: 8px; padding: 8px;
      display: none; z-index: 8;
    }
    #physics-panel.open { display: block; }
    #physics-panel h3 { margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb; }
    .phys-row {
      display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
      font-size: 12px; color: #cbd5e1;
    }
    .phys-row input[type=range] { flex: 1; }
    .phys-row input[type=number] {
      width: 64px; background: #111827; color: #e5e7eb;
      border: 1px solid #1f2937; border-radius: 6px; padding: 2px 4px;
    }
    #ctx-menu {
      position: fixed; background: #0b0f14; border: 1px solid #1f2530;
      border-radius: 6px; padding: 4px; display: none; z-index: 20;
      min-width: 180px; font-size: 12px; color: #e5e7eb;
    }
    #ctx-menu .item {
      padding: 6px 8px; cursor: pointer; border-radius: 4px;
    }
    #ctx-menu .item:hover { background: #111827; }
    #layer-panel {
      position: fixed; top: 42px; right: 12px; width: 300px;
      max-height: 70%; overflow: auto; background: #0b0f14;
      border: 1px solid #1f2530; border-radius: 8px; padding: 8px;
      display: none; z-index: 8;
    }
    #layer-panel.open { display: block; }
    #layer-panel h3 { margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb; }
    .layer-row, .layer-row-toggle {
      display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
      font-size: 12px; color: #cbd5e1;
    }
    #canvas-wrap { position: absolute; top: 42px; left: 0; right: 0; bottom: 0; }
    #graph { width: 100%; height: 100%; }
    #tooltip {
      position: fixed; pointer-events: none; background: rgba(0,0,0,0.85);
      color: #f4f4f4; padding: 6px 8px; border-radius: 6px; font-size: 12px;
      max-width: 340px; display: none; z-index: 10;
    }
    #zoom-indicator {
      position: fixed; right: 12px; bottom: 12px; z-index: 9;
      background: rgba(15,18,22,0.85); border: 1px solid #1f2530;
      color: #cbd5e1; padding: 4px 8px; border-radius: 6px; font-size: 12px;
    }
    #fallback {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      color: #cbd5e1; font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <div id="toolbar-left">
      <label class="layer-toggle" data-layer="family_hub"><input type="checkbox" id="layer-family-hub" checked> Family Hubs</label>
      <label class="layer-toggle" data-layer="family"><input type="checkbox" id="layer-family" checked> Family Gate</label>
      <label class="layer-toggle" data-layer="reference"><input type="checkbox" id="layer-reference"> Linked Notes</label>
      <label class="layer-toggle" data-layer="example"><input type="checkbox" id="layer-example"> Example Gate</label>
      <label class="layer-toggle" data-layer="kanji"><input type="checkbox" id="layer-kanji"> Kanji Gate</label>
      <label><input type="checkbox" id="mode-3d" disabled> 3D (soon)</label>
    </div>
    <div id="toolbar-center">
      <div id="deck-controls">
        <div id="deck-dropdown" class="dropdown">
          <div id="deck-trigger" class="dropdown-trigger">Decks</div>
          <div id="deck-menu" class="dropdown-menu"></div>
        </div>
        <div class="search-wrap">
          <input id="note-search" type="text" placeholder="Search note..." />
          <button id="btn-search" class="btn-settings" type="button">Search</button>
        </div>
      </div>
    </div>
    <div id="toolbar-right">
      <button id="btn-layers" class="btn-settings" type="button">Link Settings</button>
      <button id="btn-note-types" class="btn-settings" type="button">Note Settings</button>
      <button id="btn-physics" class="btn-settings" type="button">Physic Settings</button>
      <button id="btn-rebuild" class="btn-rebuild" type="button" onclick="pycmd('refresh')">Rebuild</button>
    </div>
  </div>
  <div id="canvas-wrap">
    <div id="graph"></div>
  </div>
  <div id="fallback">Graph loading...</div>
  <div id="tooltip"></div>
  <div id="zoom-indicator">Zoom: 1.00x</div>
  <div id="note-type-panel">
    <h3>Note Settings</h3>
    <div id="note-type-list"></div>
  </div>
  <div id="physics-panel">
    <h3>Physics</h3>
    <div class="phys-row"><span title="Repulsion between nodes. More negative = further apart.">Charge (Repulsion)</span><input id="phys-charge" type="range" min="-200" max="0" step="1"><input id="phys-charge-num" type="number" min="-200" max="0" step="1"></div>
    <div class="phys-row"><span title="Target distance between linked nodes. Smaller = tighter clusters.">Link Distance</span><input id="phys-link-distance" type="range" min="5" max="200" step="1"><input id="phys-link-distance-num" type="number" min="5" max="200" step="1"></div>
    <div class="phys-row"><span title="How strongly links pull nodes together. Higher = tighter.">Link Strength</span><input id="phys-link-strength" type="range" min="0" max="2" step="0.05"><input id="phys-link-strength-num" type="number" min="0" max="2" step="0.05"></div>
    <div class="phys-row"><span title="Damping of movement per tick. Higher = less bounce.">Velocity Decay</span><input id="phys-vel-decay" type="range" min="0.01" max="1" step="0.01"><input id="phys-vel-decay-num" type="number" min="0.01" max="1" step="0.01"></div>
    <div class="phys-row"><span title="How fast the simulation cools down. Higher = settles sooner.">Alpha Decay</span><input id="phys-alpha-decay" type="range" min="0.001" max="0.2" step="0.001"><input id="phys-alpha-decay-num" type="number" min="0.001" max="0.2" step="0.001"></div>
    <div class="phys-row"><span title="Max range where repulsion affects other nodes.">Repulsion Range</span><input id="phys-max-radius" type="range" min="300" max="5000" step="50"><input id="phys-max-radius-num" type="number" min="300" max="5000" step="50"></div>
    <div class="phys-row"><span title="Max ticks before simulation stops. Lower = stops earlier.">Cooldown Ticks</span><input id="phys-cooldown" type="range" min="0" max="300" step="1"><input id="phys-cooldown-num" type="number" min="0" max="300" step="1"></div>
    <div class="phys-row"><span title="Extra ticks at start to stabilize layout.">Warmup Ticks</span><input id="phys-warmup" type="range" min="0" max="200" step="1"><input id="phys-warmup-num" type="number" min="0" max="200" step="1"></div>
    <div class="phys-row"><button id="phys-reset" type="button">Reset</button></div>
  </div>
  <div id="layer-panel">
    <h3>Link Settings</h3>
    <div id="layer-color-list"></div>
  </div>
  <div id="ctx-menu"></div>
  <script src="__FORCE_GRAPH_SRC__"></script>
  <script src="__GRAPH_JS__"></script>
</body>
</html>
"""
    html = html.replace("{{", "{").replace("}}", "}")
    html = html.replace("__FORCE_GRAPH_SRC__", force_graph_src)
    html = html.replace("__GRAPH_JS__", graph_js_src)
    return html


class FamilyGraphWindow(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Anki - AJpC Family Graph")
        try:
            setWindowIcon(self)
        except Exception:
            pass
        self.layout = QVBoxLayout()
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.setLayout(self.layout)
        self.web = AnkiWebView(self, title="ajpc_family_graph")
        self.web.set_bridge_command(self._on_bridge_cmd, self)
        self.layout.addWidget(self.web)
        self.setMinimumSize(900, 600)
        restoreGeom(self, "ajpc_family_graph", default_size=(1100, 720))
        if self.width() < 300 or self.height() < 200:
            self.resize(1100, 720)
        logger.dbg("window open")
        self._load()
        self.show()

    def closeEvent(self, event) -> None:
        saveGeom(self, "ajpc_family_graph")
        super().closeEvent(event)

    def _on_bridge_cmd(self, message: str) -> Any:
        if message == "refresh":
            logger.dbg("bridge refresh")
            self._load()
        elif message.startswith("log:"):
            logger.dbg("js", message[4:])
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
                self._load()
            except Exception:
                logger.dbg("note type label parse failed", message)
        elif message.startswith("lnfield:"):
            try:
                _prefix, rest = message.split(":", 1)
                mid, enc = rest.split(":", 1)
                field = unquote(enc)
                set_note_type_linked_field(mid, field)
                logger.dbg("note type linked field", mid, field)
                self._load()
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
                self._load()
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
                set_layer_color(layer, color)
                logger.dbg("layer color", layer, color)
            except Exception:
                logger.dbg("layer color parse failed", message)
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
        elif message.startswith("lflowspeed:"):
            try:
                _prefix, val = message.split(":", 1)
                set_layer_flow_speed(float(val))
                logger.dbg("layer flow speed", val)
            except Exception:
                logger.dbg("layer flow speed parse failed", message)
        elif message.startswith("refauto:"):
            try:
                _prefix, val = message.split(":", 1)
                set_reference_auto_opacity(float(val))
                logger.dbg("reference auto opacity", val)
                self._load()
            except Exception:
                logger.dbg("reference auto opacity parse failed", message)
        elif message.startswith("decks:"):
            try:
                _prefix, enc = message.split(":", 1)
                raw = unquote(enc)
                decks = json.loads(raw) if raw else []
                if not isinstance(decks, list):
                    decks = []
                set_selected_decks(decks)
                logger.dbg("selected decks", len(decks))
                self._load()
            except Exception:
                logger.dbg("deck selection parse failed", message)
        elif message.startswith("fprio:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_family_same_prio_edges(enabled)
                logger.dbg("family same prio edges", enabled)
                self._load()
            except Exception:
                logger.dbg("family same prio parse failed", message)
        elif message.startswith("fprioop:"):
            try:
                _prefix, val = message.split(":", 1)
                set_family_same_prio_opacity(float(val))
                logger.dbg("family same prio opacity", val)
                self._load()
            except Exception:
                logger.dbg("family same prio opacity parse failed", message)
        elif message.startswith("fchain:"):
            try:
                _prefix, val = message.split(":", 1)
                enabled = val == "1"
                set_family_chain_edges(enabled)
                logger.dbg("family chain edges", enabled)
                self._load()
            except Exception:
                logger.dbg("family chain parse failed", message)
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
            elif kind == "edit":
                try:
                    _open_editor(int(payload))
                    logger.dbg("ctx edit", payload)
                except Exception:
                    logger.dbg("ctx edit failed", payload)
            elif kind == "filter":
                try:
                    fid = unquote(payload)
                    _filter_family(fid)
                    logger.dbg("ctx filter", fid)
                except Exception:
                    logger.dbg("ctx filter failed", payload)
        return None

    def _load(self) -> None:
        if mw is None or not getattr(mw, "col", None):
            showInfo("No collection loaded.")
            return
        logger.dbg("load graph")

        def op(_col):
            return build_graph(_col)

        def on_success(result: dict[str, Any]) -> None:
            logger.dbg("graph build success", "nodes=", len(result.get("nodes", [])), "edges=", len(result.get("edges", [])))
            html = _html(result)
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

        def on_failure(err: Exception) -> None:
            logger.dbg("graph build failed", repr(err))
            showInfo(f"Graph build failed: {err!r}")

        QueryOp(parent=self, op=op, success=on_success).failure(on_failure).run_in_background()


class GraphNoteEditor(QMainWindow):
    def __init__(self, nid: int) -> None:
        super().__init__(None, Qt.WindowType.Window)
        assert mw is not None and mw.col is not None
        self.mw = mw
        self.nid = nid
        self.form = aqt.forms.editcurrent.Ui_Dialog()
        self.form.setupUi(self)
        self.setWindowTitle("AJpC Note Editor")
        self.editor = aqt.editor.Editor(
            self.mw,
            self.form.fieldsArea,
            self,
            editor_mode=aqt.editor.EditorMode.BROWSER,
        )
        note = self.mw.col.get_note(nid)
        self.editor.set_note(note, focusTo=0)
        restoreGeom(self, "ajpc_family_graph_editor", default_size=(900, 700))
        close_button = self.form.buttonBox.button(QDialogButtonBox.StandardButton.Close)
        if close_button is not None:
            close_button.setShortcut(QKeySequence("Ctrl+Return"))
        add_close_shortcut(self)
        gui_hooks.operation_did_execute.append(self.on_operation_did_execute)
        self.show()

    def on_operation_did_execute(self, changes, handler) -> None:
        if not changes.note_text or handler is self.editor:
            return
        note = self.editor.note
        if note is None:
            return
        try:
            note.load()
        except Exception:
            self.cleanup()
            self.close()
            return
        self.editor.set_note(note)

    def cleanup(self) -> None:
        try:
            gui_hooks.operation_did_execute.remove(self.on_operation_did_execute)
        except Exception:
            pass
        try:
            self.editor.cleanup()
        except Exception:
            pass
        saveGeom(self, "ajpc_family_graph_editor")


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


def _get_family_field() -> str:
    if mw is None:
        return ""
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return ""
    getter = api.get("get_config")
    if not callable(getter):
        return ""
    try:
        cfg = getter(reload=True)
    except Exception:
        try:
            cfg = getter()
        except Exception:
            cfg = None
    if not isinstance(cfg, dict):
        return ""
    fg = cfg.get("family_gate", {}) or {}
    return str(fg.get("family_field") or "")


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
    previewers = getattr(mw, "_ajpc_family_graph_previewers", None)
    if not isinstance(previewers, dict):
        previewers = {}
        mw._ajpc_family_graph_previewers = previewers
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


def _open_editor(nid: int) -> None:
    if mw is None:
        return
    editors = getattr(mw, "_ajpc_family_graph_editors", None)
    if not isinstance(editors, dict):
        editors = {}
        mw._ajpc_family_graph_editors = editors
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


def show_family_graph() -> None:
    if mw is None:
        return
    win = getattr(mw, "_ajpc_family_graph_win", None)
    if win is None or not isinstance(win, FamilyGraphWindow):
        win = FamilyGraphWindow()
        mw._ajpc_family_graph_win = win
    else:
        win.show()
        win.raise_()
        win.activateWindow()
