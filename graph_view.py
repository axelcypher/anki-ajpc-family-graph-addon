from __future__ import annotations

from typing import Any

from aqt import gui_hooks, mw
from aqt.qt import QVBoxLayout, QWidget, Qt, QTimer
from aqt.utils import restoreGeom, saveGeom, setWindowIcon
from aqt.webview import AnkiWebView
from PyQt6.QtWebEngineWidgets import QWebEngineView

from . import logger
from .graph_bridge_handlers import GraphBridgeHandlersMixin
from .graph_editor_embedded import EmbeddedEditorMixin
from .graph_sync import GraphSyncMixin


class FamilyGraphWindow(GraphBridgeHandlersMixin, GraphSyncMixin, EmbeddedEditorMixin, QWidget):
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
        self.setWindowTitle("Anki - AJpC Tools Graph")
        try:
            setWindowIcon(self)
        except Exception:
            pass

        self.layout = QVBoxLayout()
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.setLayout(self.layout)

        self._init_embedded_editor_panel()

        self.web = AnkiWebView(self, title="ajpc_tools_graph")
        try:
            from PyQt6.QtWebEngineCore import QWebEngineSettings

            self.web.page().settings().setAttribute(
                QWebEngineSettings.WebAttribute.DeveloperExtrasEnabled,
                True,
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
        self._refresh_timer = QTimer(self)
        self._refresh_timer.setSingleShot(True)
        self._refresh_timer.timeout.connect(self._refresh)
        self._pending_changed_nids: set[int] = set()
        self._note_add_hooks: list[tuple[Any, Any]] = []

        restoreGeom(self, "ajpc_tools_graph", default_size=(1100, 720))
        if self.width() < 300 or self.height() < 200:
            self.resize(1100, 720)

        logger.dbg("window open")
        self._load()
        self.show()
        QTimer.singleShot(160, self._preload_embedded_editor_webview)
        try:
            gui_hooks.operation_did_execute.append(self._on_operation_did_execute)
        except Exception:
            pass
        self._bind_note_add_hooks()

    def closeEvent(self, event) -> None:
        saveGeom(self, "ajpc_tools_graph")
        try:
            self._sync_web_editor_panel_visibility(False)
        except Exception:
            pass
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
        try:
            if getattr(self, "_embedded_editor_devtools", None) is not None:
                self._embedded_editor_devtools.close()
        except Exception:
            pass
        self._cleanup_embedded_editor()
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
            devtools.setWindowTitle("AJpC Tools Graph DevTools")
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


def show_tools_graph() -> None:
    from .graph_launcher import show_tools_graph as _show_tools_graph

    _show_tools_graph()
