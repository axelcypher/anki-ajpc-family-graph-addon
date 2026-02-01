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

from .graph_data import build_graph, _parse_family_field, _parse_link_targets
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
    set_show_unlinked,
    set_kanji_components_enabled,
    set_kanji_component_style,
    set_kanji_component_color,
    set_kanji_component_opacity,
    set_kanji_component_focus_only,
    set_kanji_component_flow,
    load_graph_config,
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
      border-bottom: 2px solid transparent; cursor: pointer;
      transition: color 0.15s ease;
    }
    #toolbar label.layer-toggle:hover { color: #f9fafb; }
    #toolbar label.layer-toggle input { display: none; }
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
    .search-input {
      position: relative;
      display: flex;
      flex-direction: column;
    }
    #search-suggest {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: #0b0f14;
      border: 1px solid #1f2530;
      border-radius: 6px;
      max-height: 220px;
      overflow: auto;
      display: none;
      z-index: 14;
    }
    #search-suggest.open { display: block; }
    #search-suggest .item {
      padding: 6px 8px; font-size: 12px; color: #cbd5e1; cursor: pointer;
    }
    #search-suggest .item:hover { background: #111827; }
    #settings-panel {
      position: fixed; top: 42px; right: 12px; width: 360px;
      max-height: 70%; overflow: hidden; background: #0b0f14;
      border: 1px solid #1f2530; border-radius: 8px; padding: 8px;
      display: none; z-index: 8;
    }
    #settings-panel.open { display: block; }
    #settings-tabs {
      display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: nowrap;
    }
    .settings-tab {
      background: #111827; border: 1px solid #1f2530; color: #cbd5e1;
      border-radius: 6px; padding: 4px 8px; font-size: 12px;
      cursor: pointer; user-select: none;
    }
    .settings-tab.active {
      background: #1a6985; border-color: #1a6985; color: #f9fafb;
    }
    .settings-pane { display: none; max-height: 55vh; overflow: auto; }
    .settings-pane.active { display: block; }
    #settings-panel h3 { margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb; }
    #settings-panel select,
    #settings-panel input[type=number],
    #settings-panel input[type=text] {
      background: #111827; color: #e5e7eb; border: 1px solid #1f2937;
      border-radius: 6px; padding: 2px 6px; font-size: 12px;
    }
    #settings-panel input[type=checkbox] {
      appearance: none; width: 14px; height: 14px; border-radius: 4px;
      border: 1px solid #1f2937; background: #111827; cursor: pointer;
    }
    #settings-panel input[type=checkbox]:checked {
      background: #1a6985; border-color: #1a6985;
      box-shadow: 0 0 0 1px rgba(26,105,133,0.4);
    }
    .dropdown-menu input[type=checkbox] {
      appearance: none; width: 14px; height: 14px; border-radius: 4px;
      border: 1px solid #1f2937; background: #111827; cursor: pointer;
    }
    .dropdown-menu input[type=checkbox]:checked {
      background: #1a6985; border-color: #1a6985;
      box-shadow: 0 0 0 1px rgba(26,105,133,0.4);
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
    #toast-container {
      position: fixed; left: 12px; bottom: 12px; z-index: 11;
      display: flex; flex-direction: column; gap: 6px; pointer-events: none;
      max-width: 320px;
    }
    .toast {
      background: #1f2937; border: 1px solid #374151; color: #f9fafb;
      font-size: 12px; padding: 8px 10px; border-radius: 6px;
      transform: translateX(-120%); opacity: 0;
      transition: transform 0.28s ease, opacity 0.28s ease;
    }
    .toast.show { transform: translateX(0); opacity: 1; }
    .toast.hide { transform: translateX(-120%); opacity: 0; }
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
        <label class="layer-toggle"><input type="checkbox" id="toggle-unlinked"> Show Unlinked</label>
    </div>
    <div id="toolbar-center">
      <div id="deck-controls">
        <div id="deck-dropdown" class="dropdown">
          <div id="deck-trigger" class="dropdown-trigger">Decks</div>
          <div id="deck-menu" class="dropdown-menu"></div>
        </div>
          <div class="search-wrap">
            <div class="search-input">
              <input id="note-search" type="text" placeholder="Search note..." />
              <div id="search-suggest"></div>
            </div>
            <button id="btn-search" class="btn-settings" type="button">Search</button>
          </div>
      </div>
    </div>
    <div id="toolbar-right">
      <button id="btn-settings" class="btn-settings" type="button">Settings</button>
      <button id="btn-rebuild" class="btn-rebuild" type="button" onclick="pycmd('refresh')">Rebuild</button>
    </div>
  </div>
  <div id="canvas-wrap">
    <div id="graph"></div>
  </div>
  <div id="fallback">Graph loading...</div>
  <div id="tooltip"></div>
  <div id="zoom-indicator">Zoom: 1.00x</div>
  <div id="toast-container"></div>
  <div id="settings-panel">
    <div id="settings-tabs">
      <div class="settings-tab active" data-tab="notes">Note Settings</div>
      <div class="settings-tab" data-tab="links">Link Settings</div>
      <div class="settings-tab" data-tab="physics">Physics</div>
    </div>
    <div id="settings-notes" class="settings-pane active">
      <div id="note-type-list"></div>
    </div>
    <div id="settings-links" class="settings-pane">
      <div id="layer-color-list"></div>
    </div>
    <div id="settings-physics" class="settings-pane">
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
        self._graph_ready = False
        self._refresh_timer = QTimer(self)
        self._refresh_timer.setSingleShot(True)
        self._refresh_timer.timeout.connect(self._refresh)
        self._pending_changed_nids: set[int] = set()
        self._note_add_hooks: list[tuple[Any, Any]] = []
        restoreGeom(self, "ajpc_family_graph", default_size=(1100, 720))
        if self.width() < 300 or self.height() < 200:
            self.resize(1100, 720)
        logger.dbg("window open")
        self._load()
        self.show()
        try:
            gui_hooks.operation_did_execute.append(self._on_operation_did_execute)
        except Exception:
            pass
        self._bind_note_add_hooks()

    def closeEvent(self, event) -> None:
        saveGeom(self, "ajpc_family_graph")
        try:
            gui_hooks.operation_did_execute.remove(self._on_operation_did_execute)
        except Exception:
            pass
        self._unbind_note_add_hooks()
        super().closeEvent(event)

    def _bind_note_add_hooks(self) -> None:
        hooks = []
        try:
            hooks.append(getattr(gui_hooks, "add_cards_did_add_note", None))
        except Exception:
            pass
        try:
            hooks.append(getattr(gui_hooks, "add_cards_did_add_notes", None))
        except Exception:
            pass
        for hook in hooks:
            if hook is None:
                continue
            try:
                if hook is getattr(gui_hooks, "add_cards_did_add_notes", None):
                    hook.append(self._on_notes_added)
                    self._note_add_hooks.append((hook, self._on_notes_added))
                else:
                    hook.append(self._on_note_added)
                    self._note_add_hooks.append((hook, self._on_note_added))
            except Exception:
                continue

    def _unbind_note_add_hooks(self) -> None:
        for hook, fn in self._note_add_hooks:
            try:
                hook.remove(fn)
            except Exception:
                pass
        self._note_add_hooks.clear()

    def _on_note_added(self, note) -> None:
        try:
            nid = int(getattr(note, "id", 0) or 0)
        except Exception:
            nid = 0
        if nid:
            self._pending_changed_nids.add(nid)
            logger.dbg("note added", nid)
            self._schedule_refresh("note added")

    def _on_notes_added(self, notes) -> None:
        count = 0
        for note in notes or []:
            try:
                nid = int(getattr(note, "id", 0) or 0)
            except Exception:
                nid = 0
            if nid:
                self._pending_changed_nids.add(nid)
                count += 1
        if count:
            logger.dbg("notes added", count)
            self._schedule_refresh("notes added")

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
                self._schedule_refresh("reference auto opacity")
            except Exception:
                logger.dbg("reference auto opacity parse failed", message)
        elif message.startswith("kcomp:"):
            try:
                _prefix, val = message.split(":", 1)
                set_kanji_components_enabled(val == "1")
                logger.dbg("kanji components enabled", val)
            except Exception:
                logger.dbg("kanji components parse failed", message)
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
            elif kind == "connect":
                try:
                    data = json.loads(unquote(payload)) if payload else {}
                    source = data.get("source")
                    target = data.get("target")
                    source_kind = str(data.get("source_kind") or "")
                    source_label = str(data.get("source_label") or "")
                    if not source or not target:
                        logger.dbg("ctx connect missing ids", payload)
                        return None
                    try:
                        target_nid = int(target)
                    except Exception:
                        logger.dbg("ctx connect bad target", target)
                        return None
                    family_field, sep, default_prio = _get_family_cfg()
                    fid = ""
                    prio = 0
                    if source_kind == "family" or str(source).startswith("family:"):
                        fid = source_label or str(source).replace("family:", "", 1)
                        prio = 0
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
                        fid, base_prio = min(fams, key=lambda pair: pair[1])
                        prio = int(base_prio) + 1
                    if not fid:
                        logger.dbg("ctx connect no fid", payload)
                        return None
                    if _append_family_to_note(target_nid, fid, prio, family_field, sep, default_prio):
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx connect")
                        logger.dbg("ctx connect", target_nid, fid, prio)
                    else:
                        logger.dbg("ctx connect no-op", target_nid, fid, prio)
                except Exception:
                    logger.dbg("ctx connect failed", payload)
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx link")
                        logger.dbg("ctx link", target_nid, source_nid)
                    else:
                        logger.dbg("ctx link no-op", target_nid, source_nid)
                except Exception:
                    logger.dbg("ctx link failed", payload)
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

    def _on_operation_did_execute(self, changes, handler) -> None:
        try:
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


def _get_family_cfg() -> tuple[str, str, int]:
    if mw is None:
        return "", ";", 0
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return "", ";", 0
    getter = api.get("get_config")
    if not callable(getter):
        return "", ";", 0
    try:
        cfg = getter(reload=True)
    except Exception:
        try:
            cfg = getter()
        except Exception:
            cfg = None
    if not isinstance(cfg, dict):
        return "", ";", 0
    fg = cfg.get("family_gate", {}) or {}
    field = str(fg.get("family_field") or "")
    sep = str(fg.get("separator") or ";")
    try:
        default_prio = int(fg.get("default_prio") or 0)
    except Exception:
        default_prio = 0
    return field, sep, default_prio


def _append_family_to_note(
    nid: int, fid: str, prio: int, field: str, sep: str, default_prio: int
) -> bool:
    if mw is None or mw.col is None:
        return False
    if not field:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None or field not in note:
        return False
    raw = str(note[field] or "")
    fams = _parse_family_field(raw, sep, default_prio)
    for existing_fid, _p in fams:
        if existing_fid == fid:
            return False
    entry = f"{fid}@{prio}"
    if not raw.strip():
        new_val = entry
    else:
        joiner = sep
        if sep and (sep + " ") in raw:
            joiner = sep + " "
        elif sep == ";":
            joiner = "; "
        new_val = raw.rstrip() + joiner + entry
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


def _append_link_to_note(nid: int, source_nid: int, label: str) -> bool:
    if mw is None or mw.col is None:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None:
        return False
    cfg = load_graph_config()
    linked_fields = cfg.get("note_type_linked_fields") or {}
    field = str(linked_fields.get(str(note.mid)) or "").strip()
    if not field or field not in note:
        return False
    raw = str(note[field] or "")
    existing, _invalid = _parse_link_targets(raw)
    for _lbl, nid_val in existing:
        if nid_val == source_nid:
            return False
    safe_label = (label or "").strip() or f"Note {source_nid}"
    safe_label = safe_label.replace("[", "").replace("]", "")
    tag = f"[{safe_label}|nid{source_nid}]"
    if raw.strip():
        new_val = raw.rstrip() + " " + tag
    else:
        new_val = tag
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


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
