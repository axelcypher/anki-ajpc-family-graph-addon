from __future__ import annotations

import json
import os
import re
from typing import Any

import aqt
import aqt.editor
import aqt.forms
from aqt import mw, gui_hooks
from aqt.operations import QueryOp
from aqt.qt import (
    QDialogButtonBox,
    QHBoxLayout,
    QKeySequence,
    QLabel,
    QMainWindow,
    QPushButton,
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
from PyQt6.QtWebEngineWidgets import QWebEngineView

from .graph_data import build_graph, _parse_family_field, _parse_link_targets
from . import logger
from .graph_config import (
    set_note_type_label_field,
    set_note_type_linked_field,
    set_note_type_tooltip_fields,
    set_note_type_visible,
    set_note_type_color,
    set_link_color,
    set_layer_enabled,
    set_family_same_prio_edges,
    set_family_same_prio_opacity,
    set_layer_style,
    set_layer_flow,
    set_layer_flow_speed,
    set_layer_flow_spacing_mul,
    set_layer_flow_radius_mul,
    set_trailing_hub_distance,
    set_link_strength,
    set_link_weight,
    set_link_distance,
    set_engine_value,
    set_solver_value,
    set_renderer_value,
    set_node_value,
    set_neighbor_scaling,
    set_soft_pin_radius,
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
    set_card_dot_suspended_color,
    set_card_dot_buried_color,
    set_card_dots_enabled,
    set_reference_damping,
    set_link_mst_enabled,
    set_hub_damping,
    set_kanji_tfidf_enabled,
    set_kanji_top_k_enabled,
    set_kanji_top_k,
    set_kanji_quantile_norm,
    load_graph_config,
)

ADDON_DIR = os.path.dirname(__file__)
WEB_DIR = os.path.join(ADDON_DIR, "web")


# --- Web assets + HTML template --------------------------------------------
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
    # Build the HTML shell and inject static asset paths.
    web_base = _web_base()
    def asset_url(name: str) -> str:
        if not web_base:
            return ""
        path = os.path.join(WEB_DIR, name)
        try:
            ver = int(os.path.getmtime(path))
            return f"{web_base}/{name}?v={ver}"
        except Exception:
            return f"{web_base}/{name}"

    graph_graphology_src = asset_url("libs/graphology.min.js")
    graph_layout_src = asset_url("libs/graphology-layout.bundle.js")
    graph_d3_dispatch_src = asset_url("libs/d3-dispatch.min.js")
    graph_d3_quadtree_src = asset_url("libs/d3-quadtree.min.js")
    graph_d3_timer_src = asset_url("libs/d3-timer.min.js")
    graph_d3_force_src = asset_url("libs/d3-force.min.js")
    graph_engine_src = asset_url("libs/sigma.min.js")
    graph_sigma_program_edge_curved_src = asset_url("sigma-programs/graph.sigma.program.edge.curved.js")
    graph_sigma_program_edge_dashed_src = asset_url("sigma-programs/graph.sigma.program.edge.dashed.js")
    graph_sigma_program_edge_dotted_src = asset_url("sigma-programs/graph.sigma.program.edge.dotted.js")
    graph_sigma_program_node_note_src = asset_url("sigma-programs/graph.sigma.program.node.note.js")
    graph_sigma_program_node_hub_src = asset_url("sigma-programs/graph.sigma.program.node.hub.js")
    graph_sigma_program_extra_carddots_src = asset_url("sigma-programs/graph.sigma.program.extra.carddots.js")
    graph_sigma_program_extra_nodefx_src = asset_url("sigma-programs/graph.sigma.program.extra.nodefx.js")
    graph_state_js_src = asset_url("graph.state.js")
    graph_bridge_js_src = asset_url("graph.bridge.js")
    graph_adapter_js_src = asset_url("graph.adapter.js")
    graph_utils_js_src = asset_url("graph.utils.js")
    graph_payload_js_src = asset_url("graph.payload.js")
    graph_flow_js_src = asset_url("graph.flow.js")
    graph_engine_js_src = asset_url("graph.engine.sigma.js")
    graph_data_js_src = asset_url("graph.data.graphology.js")
    graph_solver_js_src = asset_url("graph.solver.d3.js")
    graph_renderer_js_src = asset_url("graph.renderer.sigma.js")
    graph_ui_deptree_js_src = asset_url("ui/graph.ui.deptree.js")
    graph_ui_debug_js_src = asset_url("ui/graph.ui.debug.js")
    graph_ui_tooltip_js_src = asset_url("ui/graph.ui.tooltip.js")
    graph_ui_ctx_js_src = asset_url("ui/graph.ui.ctx.js")
    graph_ui_editor_js_src = asset_url("ui/graph.ui.editor.js")
    graph_ui_js_src = asset_url("graph.ui.js")
    graph_main_js_src = asset_url("graph.main.js")
    graph_css_src = asset_url("graph.css")
    logger.dbg("web base", web_base, "graph main js", graph_main_js_src)
    try:
        with open(os.path.join(WEB_DIR, "graph.html"), "r", encoding="utf-8") as handle:
            html = handle.read()
    except Exception as exc:
        logger.dbg("graph html load failed", str(exc))
        html = ""
    html = html.replace("{{", "{").replace("}}", "}")
    html = html.replace("__GRAPH_CSS__", graph_css_src)
    html = html.replace("__GRAPH_GRAPHOLOGY_SRC__", graph_graphology_src)
    html = html.replace("__GRAPH_LAYOUT_SRC__", graph_layout_src)
    html = html.replace("__GRAPH_D3_DISPATCH_SRC__", graph_d3_dispatch_src)
    html = html.replace("__GRAPH_D3_QUADTREE_SRC__", graph_d3_quadtree_src)
    html = html.replace("__GRAPH_D3_TIMER_SRC__", graph_d3_timer_src)
    html = html.replace("__GRAPH_D3_FORCE_SRC__", graph_d3_force_src)
    html = html.replace("__GRAPH_ENGINE_SRC__", graph_engine_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_EDGE_CURVED_JS__", graph_sigma_program_edge_curved_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_EDGE_DASHED_JS__", graph_sigma_program_edge_dashed_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_EDGE_DOTTED_JS__", graph_sigma_program_edge_dotted_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_NODE_NOTE_JS__", graph_sigma_program_node_note_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_NODE_HUB_JS__", graph_sigma_program_node_hub_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_EXTRA_CARDDOTS_JS__", graph_sigma_program_extra_carddots_src)
    html = html.replace("__GRAPH_SIGMA_PROGRAM_EXTRA_NODEFX_JS__", graph_sigma_program_extra_nodefx_src)
    html = html.replace("__GRAPH_STATE_JS__", graph_state_js_src)
    html = html.replace("__GRAPH_BRIDGE_JS__", graph_bridge_js_src)
    html = html.replace("__GRAPH_ADAPTER_JS__", graph_adapter_js_src)
    html = html.replace("__GRAPH_UTILS_JS__", graph_utils_js_src)
    html = html.replace("__GRAPH_PAYLOAD_JS__", graph_payload_js_src)
    html = html.replace("__GRAPH_FLOW_JS__", graph_flow_js_src)
    html = html.replace("__GRAPH_ENGINE_JS__", graph_engine_js_src)
    html = html.replace("__GRAPH_DATA_JS__", graph_data_js_src)
    html = html.replace("__GRAPH_SOLVER_JS__", graph_solver_js_src)
    html = html.replace("__GRAPH_RENDERER_JS__", graph_renderer_js_src)
    html = html.replace("__GRAPH_UI_DEPTREE_JS__", graph_ui_deptree_js_src)
    html = html.replace("__GRAPH_UI_DEBUG_JS__", graph_ui_debug_js_src)
    html = html.replace("__GRAPH_UI_TOOLTIP_JS__", graph_ui_tooltip_js_src)
    html = html.replace("__GRAPH_UI_CTX_JS__", graph_ui_ctx_js_src)
    html = html.replace("__GRAPH_UI_EDITOR_JS__", graph_ui_editor_js_src)
    html = html.replace("__GRAPH_UI_JS__", graph_ui_js_src)
    html = html.replace("__GRAPH_MAIN_JS__", graph_main_js_src)
    return html


# --- Main window: WebView + JS bridge + refresh pipeline --------------------
class FamilyGraphWindow(QWidget):
    def __init__(self) -> None:
        super().__init__()
        try:
            self.setWindowFlags(
                Qt.WindowType.Window
                | Qt.WindowType.WindowMinimizeButtonHint
                | Qt.WindowType.WindowMaximizeButtonHint
                | Qt.WindowType.WindowCloseButtonHint
            )
            
        except Exception:
            pass
        self.setWindowTitle("Anki - AJpC Family Graph")
        try:
            setWindowIcon(self)
        except Exception:
            pass
        self.layout = QVBoxLayout()
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.setLayout(self.layout)

        # Native embedded editor panel (left side).
        self._editor_panel = QWidget(self)
        self._editor_panel.setObjectName("ajpcEmbeddedEditorPanel")
        self._editor_panel.setMinimumWidth(360)
        self._editor_panel.setMaximumWidth(720)
        self._editor_panel.setVisible(False)
        self._editor_panel_open = False
        self._embedded_editor_nid = 0
        self._embedded_editor = None
        self._embedded_editor_form = None
        self._embedded_editor_root = None
        self._editor_panel_rect: dict[str, int | bool] = {"visible": False, "x": 0, "y": 0, "w": 0, "h": 0}

        editor_layout = QVBoxLayout(self._editor_panel)
        editor_layout.setContentsMargins(12, 12, 12, 12)
        editor_layout.setSpacing(8)

        editor_head = QWidget(self._editor_panel)
        editor_head_layout = QHBoxLayout(editor_head)
        editor_head_layout.setContentsMargins(0, 0, 0, 0)
        editor_head_layout.setSpacing(8)
        self._editor_title = QLabel("AJpC Note Editor", editor_head)
        self._editor_close_btn = QPushButton("Close", editor_head)
        self._editor_close_btn.clicked.connect(self._hide_embedded_editor_panel)
        editor_head_layout.addWidget(self._editor_title)
        editor_head_layout.addStretch(1)
        editor_head_layout.addWidget(self._editor_close_btn)

        self._editor_mount = QWidget(self._editor_panel)
        self._editor_mount_layout = QVBoxLayout(self._editor_mount)
        self._editor_mount_layout.setContentsMargins(0, 0, 0, 0)
        self._editor_mount_layout.setSpacing(6)
        self._editor_hint = QLabel("Select a note and press Editor to open the embedded Anki editor.", self._editor_mount)
        self._editor_hint.setWordWrap(True)
        self._editor_mount_layout.addWidget(self._editor_hint)

        editor_layout.addWidget(editor_head, 0)
        editor_layout.addWidget(self._editor_mount, 1)
        self._editor_panel.setParent(self)
        self._apply_embedded_editor_panel_style()

        # WebView hosts the graph UI; JS talks back via pycmd bridge.
        self.web = AnkiWebView(self, title="ajpc_family_graph")
        try:
            from PyQt6.QtWebEngineCore import QWebEngineSettings
            self.web.page().settings().setAttribute(
                QWebEngineSettings.WebAttribute.DeveloperExtrasEnabled, True
            )
        except Exception:
            try:
                self.web.setDeveloperExtrasEnabled(True)
            except Exception:
                pass
        self._devtools = None
        self.web.set_bridge_command(self._on_bridge_cmd, self)
        self.layout.addWidget(self.web, 1)
        self.setMinimumSize(900, 600)
        self._graph_ready = False
        # Coalesce rebuilds when many updates arrive in a short time.
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
        try:
            if getattr(self, "_devtools", None) is not None:
                self._devtools.close()
        except Exception:
            pass
        self._cleanup_embedded_editor()
        super().closeEvent(event)

    def _bind_note_add_hooks(self) -> None:
        # Hook add-note events to update the graph.
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
        # Cleanly detach add-note hooks on close.
        for hook, fn in self._note_add_hooks:
            try:
                hook.remove(fn)
            except Exception:
                pass
        self._note_add_hooks.clear()

    def _apply_embedded_editor_panel_style(self) -> None:
        try:
            self._editor_panel.setStyleSheet(
                """
                QWidget#ajpcEmbeddedEditorPanel {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 rgba(8,16,32,245),
                        stop:1 rgba(6,12,24,245));
                    border-right: 1px solid rgba(100,116,139,115);
                }
                QWidget#ajpcEmbeddedEditorPanel QLabel {
                    color: #e2e8f0;
                }
                QWidget#ajpcEmbeddedEditorPanel QPushButton {
                    color: #e2e8f0;
                    background-color: rgba(30,41,59,215);
                    border: 1px solid rgba(148,163,184,125);
                    border-radius: 8px;
                    padding: 6px 10px;
                }
                QWidget#ajpcEmbeddedEditorPanel QPushButton:hover {
                    background-color: rgba(51,65,85,230);
                }
                """
            )
        except Exception:
            pass

    def _update_embedded_editor_geometry(self) -> None:
        panel = self._editor_panel
        if panel is None:
            return
        rect = self._editor_panel_rect if isinstance(self._editor_panel_rect, dict) else {}
        visible = bool(rect.get("visible"))
        if not visible:
            panel.hide()
            return
        try:
            x = int(rect.get("x", 0) or 0)
            y = int(rect.get("y", 0) or 0)
            w = int(rect.get("w", 0) or 0)
            h = int(rect.get("h", 0) or 0)
        except Exception:
            x, y, w, h = 0, 0, 0, 0
        if w <= 0 or h <= 0:
            panel.hide()
            return
        host_w = max(1, int(self.width()))
        host_h = max(1, int(self.height()))
        if x < 0:
            w += x
            x = 0
        if y < 0:
            h += y
            y = 0
        if x + w > host_w:
            w = max(0, host_w - x)
        if y + h > host_h:
            h = max(0, host_h - y)
        if w <= 0 or h <= 0:
            panel.hide()
            return
        panel.setGeometry(x, y, w, h)
        panel.raise_()
        if self._editor_panel_open:
            panel.show()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._update_embedded_editor_geometry()

    def _ensure_embedded_editor(self) -> bool:
        if self._embedded_editor is not None:
            return True
        if mw is None or getattr(mw, "col", None) is None:
            return False
        try:
            # editcurrent.Ui_Dialog expects a MainWindow-like host (uses setCentralWidget).
            self._embedded_editor_root = QMainWindow(self._editor_mount)
            self._embedded_editor_form = aqt.forms.editcurrent.Ui_Dialog()
            self._embedded_editor_form.setupUi(self._embedded_editor_root)
            self._editor_mount_layout.addWidget(self._embedded_editor_root, 1)
            self._embedded_editor = aqt.editor.Editor(
                mw,
                self._embedded_editor_form.fieldsArea,
                self,
                editor_mode=aqt.editor.EditorMode.BROWSER,
            )
            close_button = self._embedded_editor_form.buttonBox.button(QDialogButtonBox.StandardButton.Close)
            if close_button is not None:
                try:
                    close_button.clicked.disconnect()
                except Exception:
                    pass
                close_button.clicked.connect(self._hide_embedded_editor_panel)
            self._editor_hint.setVisible(False)
            self._theme_embedded_editor_web()
            logger.dbg("embedded editor ready")
            return True
        except Exception as exc:
            logger.dbg("embedded editor init failed", repr(exc))
            return False

    def _theme_embedded_editor_web(self) -> None:
        editor = self._embedded_editor
        if editor is None:
            return
        js = (
            "(function(){"
            "try{"
            "var id='ajpc-graph-editor-theme';"
            "var css='"
            "html,body{background:#0b1220!important;color:#e2e8f0!important;}"
            " .field{background:#0f172a!important;border-color:#334155!important;color:#e2e8f0!important;}"
            " .field *{color:inherit!important;}"
            " .toolbar{background:#111827!important;border-color:#334155!important;}"
            "';"
            "var st=document.getElementById(id);"
            "if(!st){st=document.createElement(\"style\");st.id=id;document.head.appendChild(st);}st.textContent=css;"
            "}catch(_e){}"
            "})();"
        )
        webs = []
        try:
            webs.append(getattr(editor, "web", None))
        except Exception:
            pass
        try:
            webs.append(getattr(editor, "toolbarWeb", None))
        except Exception:
            pass
        for wv in webs:
            if wv is None:
                continue
            try:
                wv.eval(js)
            except Exception:
                continue

    def _show_embedded_editor_for_note(self, nid: int, *, focus_to: int = 0) -> bool:
        try:
            nid = int(nid)
        except Exception:
            nid = 0
        if nid <= 0:
            return False
        if mw is None or getattr(mw, "col", None) is None:
            return False
        if not self._ensure_embedded_editor():
            return False
        try:
            note = mw.col.get_note(nid)
        except Exception:
            note = None
        if note is None:
            return False
        try:
            self._embedded_editor.set_note(note, focusTo=focus_to)
            self._embedded_editor_nid = nid
            self._editor_panel_open = True
            if not bool(self._editor_panel_rect.get("visible")):
                host_w = max(1, int(self.width()))
                host_h = max(1, int(self.height()))
                fallback_w = max(360, min(720, int(host_w * 0.42)))
                self._editor_panel_rect = {"visible": True, "x": 0, "y": 0, "w": fallback_w, "h": host_h}
            try:
                self._editor_title.setText(f"AJpC Note Editor - {note.note_type()['name']}")
            except Exception:
                self._editor_title.setText("AJpC Note Editor")
            self._theme_embedded_editor_web()
            self._update_embedded_editor_geometry()
            self._editor_panel.setVisible(True)
            self._editor_panel.raise_()
            logger.dbg("embedded editor show", nid)
            return True
        except Exception as exc:
            logger.dbg("embedded editor show failed", nid, repr(exc))
            return False

    def _hide_embedded_editor_panel(self) -> None:
        self._editor_panel_open = False
        self._editor_panel.setVisible(False)
        logger.dbg("embedded editor hide")

    def _toggle_embedded_editor(self, nid: int) -> bool:
        if self._editor_panel_open:
            self._hide_embedded_editor_panel()
            return True
        if nid > 0:
            return self._show_embedded_editor_for_note(nid)
        if self._embedded_editor_nid > 0:
            return self._show_embedded_editor_for_note(self._embedded_editor_nid)
        return False

    def _cleanup_embedded_editor(self) -> None:
        if self._embedded_editor is not None:
            try:
                self._embedded_editor.cleanup()
            except Exception:
                pass
        self._embedded_editor = None
        self._embedded_editor_form = None
        self._embedded_editor_nid = 0

    def _open_devtools(self) -> None:
        try:
            if getattr(self, "_devtools", None) is not None:
                try:
                    self._devtools.raise_()
                    self._devtools.activateWindow()
                except Exception:
                    pass
                return
            devtools = QWebEngineView()
            devtools.setWindowTitle("AJpC Family Graph DevTools")
            try:
                setWindowIcon(devtools)
            except Exception:
                pass
            devtools.resize(1000, 700)
            devtools.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)
            self.web.page().setDevToolsPage(devtools.page())
            devtools.show()
            self._devtools = devtools
            try:
                devtools.destroyed.connect(self._on_devtools_destroyed)
            except Exception:
                pass
        except Exception:
            self._devtools = None

    def _on_devtools_destroyed(self) -> None:
        self._devtools = None

    def _on_note_added(self, note) -> None:
        # Queue single note refresh.
        try:
            nid = int(getattr(note, "id", 0) or 0)
        except Exception:
            nid = 0
        if nid:
            self._pending_changed_nids.add(nid)
            logger.dbg("note added", nid)
            self._schedule_refresh("note added")

    def _on_notes_added(self, notes) -> None:
        # Queue batch note refresh.
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
        # JS -> Python bridge: apply config changes and context actions.
        if message == "refresh":
            logger.dbg("bridge refresh")
            self._load()
        elif message.startswith("log:"):
            logger.dbg("js", message[4:])
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
                    }
                    self._update_embedded_editor_geometry()
                    logger.dbg("embed editor rect", self._editor_panel_rect)
                elif action == "open" or action == "select":
                    opened = self._show_embedded_editor_for_note(nid)
                    logger.dbg("embed editor open", nid, opened)
                elif action == "toggle":
                    opened = self._toggle_embedded_editor(nid)
                    logger.dbg("embed editor toggle", nid, opened)
                elif action == "close":
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx connect")
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx disconnect")
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx link")
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx link active")
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
                        self._pending_changed_nids.add(target_nid)
                        changed = True
                    if _append_link_to_note(source_nid, target_nid, target_label):
                        self._pending_changed_nids.add(source_nid)
                        changed = True
                    if changed:
                        self._schedule_refresh("ctx link both")
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx unlink")
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
                        self._pending_changed_nids.add(target_nid)
                        self._schedule_refresh("ctx unlink active")
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
                        self._pending_changed_nids.add(target_nid)
                        changed = True
                    if _remove_link_from_note(source_nid, target_nid):
                        self._pending_changed_nids.add(source_nid)
                        changed = True
                    if changed:
                        self._schedule_refresh("ctx unlink both")
                        logger.dbg("ctx unlink both", source_nid, target_nid)
                    else:
                        logger.dbg("ctx unlink both no-op", source_nid, target_nid)
                except Exception:
                    logger.dbg("ctx unlink both failed", payload)
        return None

    def _load(self) -> None:
        # Initial graph build (background op).
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
        # Incremental refresh (background op).
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
        # Debounced refresh trigger.
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
            logger.dbg("embedded editor note sync", getattr(note, "id", 0))
        except Exception:
            pass

    def _on_operation_did_execute(self, changes, handler) -> None:
        # Sync graph when collection changes (notes/tags/decks/notetypes).
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


# --- Editor / preview helpers (context menu actions) ------------------------
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


# --- Family gate config access ----------------------------------------------
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
    # Returns (family_field, separator, default_prio).
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


# --- Family field mutation ---------------------------------------------------
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


def _remove_family_from_note(nid: int, fid: str, field: str, sep: str, default_prio: int) -> bool:
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
    if not fams:
        return False
    kept: list[tuple[str, int]] = [(f, p) for f, p in fams if f != fid]
    if len(kept) == len(fams):
        return False
    joiner = sep
    if sep and (sep + " ") in raw:
        joiner = sep + " "
    elif sep == ";":
        joiner = "; "
    parts: list[str] = []
    for f, p in kept:
        if p == default_prio:
            parts.append(f)
        else:
            parts.append(f"{f}@{p}")
    note[field] = joiner.join(parts).strip()
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


# --- Linked notes mutation + parsing ----------------------------------------
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


_LINK_TAG_RE = re.compile(r"\[([^\]|]+)\|\s*([^\]]+?)\s*\]")


def _token_to_nid(token: str) -> int | None:
    # Parse nid/card id tokens from a link tag.
    token = (token or "").strip()
    if not token:
        return None
    m = re.search(r"(?:nid|noteid|note|cid|card|cardid)?\s*(\d+)", token, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    if token.isdigit():
        try:
            return int(token)
        except Exception:
            return None
    return None


def _remove_link_from_note(nid: int, target_nid: int) -> bool:
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
    if not raw:
        return False
    removed = False

    def _repl(match: re.Match) -> str:
        nonlocal removed
        token = match.group(2) or ""
        nid_val = _token_to_nid(token)
        if nid_val == target_nid:
            removed = True
            return ""
        return match.group(0)

    new_val = _LINK_TAG_RE.sub(_repl, raw)
    if not removed:
        return False
    new_val = re.sub(r"\s{2,}", " ", new_val).strip()
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


# --- Context menu actions: browser/preview/editor ---------------------------
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


def _call_editor_api_fn(fn: Any, nid: int) -> bool:
    attempts = [
        ((), {"nid": nid}),
        ((), {"note_id": nid}),
        ((), {"id": nid}),
        ((nid,), {}),
    ]
    for args, kwargs in attempts:
        try:
            fn(*args, **kwargs)
            return True
        except TypeError:
            continue
        except Exception:
            continue
    return False


def _call_dependency_tree_api_fn(fn: Any, nid: int) -> dict[str, Any]:
    attempts = [
        ((), {"nid": nid}),
        ((), {"note_id": nid}),
        ((), {"id": nid}),
        ((nid,), {}),
    ]
    for args, kwargs in attempts:
        try:
            out = fn(*args, **kwargs)
        except TypeError:
            continue
        except Exception:
            continue
        if isinstance(out, dict):
            return out
    return {}


def _get_dependency_tree_via_main_api(nid: int) -> dict[str, Any]:
    if mw is None:
        return {}
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return {}
    keys = (
        "get_dependency_tree",
        "get_prio_chain",
    )
    for key in keys:
        fn = api.get(key)
        if not callable(fn):
            continue
        out = _call_dependency_tree_api_fn(fn, nid)
        if out:
            logger.dbg("deptree via api", key, nid)
            return out
    return {}


def _open_editor_via_main_api(nid: int) -> bool:
    if mw is None:
        return False
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return False

    candidates: list[tuple[str, Any]] = []
    keys = (
        "open_note_editor",
        "open_editor_for_note",
        "open_editor",
        "edit_note",
        "show_note_editor",
    )
    for key in keys:
        fn = api.get(key)
        if callable(fn):
            candidates.append((key, fn))

    editor_api = api.get("editor")
    if isinstance(editor_api, dict):
        for key in keys:
            fn = editor_api.get(key)
            if callable(fn):
                candidates.append(("editor." + key, fn))

    for name, fn in candidates:
        if _call_editor_api_fn(fn, nid):
            logger.dbg("ctx editor via api", name, nid)
            return True

    return False


def _open_editor(nid: int, *, prefer_api: bool = False) -> None:
    if mw is None:
        return
    try:
        win = getattr(mw, "_ajpc_family_graph_win", None)
        if isinstance(win, FamilyGraphWindow) and win._show_embedded_editor_for_note(int(nid)):
            logger.dbg("ctx editor via embedded panel", nid)
            return
    except Exception:
        pass
    if prefer_api:
        if _open_editor_via_main_api(nid):
            return
        logger.dbg("ctx editor api unavailable, fallback local", nid)
    if not prefer_api and _open_editor_via_main_api(nid):
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


# --- Browser filter helper ---------------------------------------------------
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


# --- Entry point -------------------------------------------------------------
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
