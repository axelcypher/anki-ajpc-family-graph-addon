from __future__ import annotations

import ctypes
import sys
from typing import Any

from aqt import gui_hooks, mw
from aqt.qt import QEvent, QVBoxLayout, QWidget, Qt, QTimer
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
        self._native_style_applied = False
        try:
            flags = (
                Qt.WindowType.Window
                | Qt.WindowType.WindowTitleHint
                | Qt.WindowType.WindowSystemMenuHint
                | Qt.WindowType.WindowMinimizeButtonHint
                | Qt.WindowType.WindowMaximizeButtonHint
                | Qt.WindowType.WindowCloseButtonHint
            )
            for forbidden in (
                Qt.WindowType.Tool,
                Qt.WindowType.Popup,
                Qt.WindowType.Dialog,
                Qt.WindowType.SubWindow,
            ):
                flags &= ~forbidden
            self.setWindowFlags(flags)
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
        self._delta_timer = QTimer(self)
        self._delta_timer.setSingleShot(True)
        self._delta_timer.timeout.connect(self._dispatch_note_delta)
        self._delta_inflight = False
        self._delta_rev = 0
        self._pending_delta_nids: set[int] = set()
        self._pending_delta_reason = ""
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

    def _force_appwindow_style(self, hwnd: int, *, reason: str = "") -> None:
        if sys.platform != "win32":
            return
        try:
            user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            g_wl_exstyle = -20
            ws_ex_toolwindow = 0x00000080
            ws_ex_appwindow = 0x00040000
            ws_ex_noactivate = 0x08000000
            swp_nosize = 0x0001
            swp_nomove = 0x0002
            swp_nozorder = 0x0004
            swp_noactivate = 0x0010
            swp_framechanged = 0x0020

            long_ptr_t = (
                ctypes.c_longlong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
            )
            get_window_long_ptr = user32.GetWindowLongPtrW
            set_window_long_ptr = user32.SetWindowLongPtrW
            set_window_pos = user32.SetWindowPos
            get_window_long_ptr.argtypes = [ctypes.c_void_p, ctypes.c_int]
            get_window_long_ptr.restype = long_ptr_t
            set_window_long_ptr.argtypes = [ctypes.c_void_p, ctypes.c_int, long_ptr_t]
            set_window_long_ptr.restype = long_ptr_t
            set_window_pos.argtypes = [
                ctypes.c_void_p,
                ctypes.c_void_p,
                ctypes.c_int,
                ctypes.c_int,
                ctypes.c_int,
                ctypes.c_int,
                ctypes.c_uint,
            ]
            set_window_pos.restype = ctypes.c_int

            old_exstyle = int(get_window_long_ptr(hwnd, g_wl_exstyle))
            new_exstyle = (old_exstyle | ws_ex_appwindow) & ~ws_ex_toolwindow & ~ws_ex_noactivate
            if new_exstyle == old_exstyle:
                logger.debug(
                    "window style already normalized",
                    f"reason={reason or 'n/a'}",
                    f"hwnd=0x{int(hwnd):X}",
                    f"exstyle=0x{old_exstyle & 0xFFFFFFFF:08X}",
                )
                return

            set_window_long_ptr(hwnd, g_wl_exstyle, long_ptr_t(new_exstyle))
            set_window_pos(
                hwnd,
                0,
                0,
                0,
                0,
                0,
                swp_nomove | swp_nosize | swp_nozorder | swp_noactivate | swp_framechanged,
            )
            logger.info(
                "window style normalized",
                f"reason={reason or 'n/a'}",
                f"hwnd=0x{int(hwnd):X}",
                f"old_exstyle=0x{old_exstyle & 0xFFFFFFFF:08X}",
                f"new_exstyle=0x{new_exstyle & 0xFFFFFFFF:08X}",
            )
        except Exception as exc:
            logger.warn("window style normalize failed", f"reason={reason or 'n/a'}", exc)

    def _apply_native_window_style(self, *, reason: str = "") -> None:
        if sys.platform != "win32":
            return
        try:
            hwnd = int(self.winId() or 0)
        except Exception:
            hwnd = 0
        if hwnd <= 0:
            return
        self._force_appwindow_style(hwnd, reason=reason)

    def showEvent(self, event) -> None:
        super().showEvent(event)
        if not self._native_style_applied:
            self._apply_native_window_style(reason="show")
            self._native_style_applied = True

    def changeEvent(self, event) -> None:
        super().changeEvent(event)
        try:
            if event and event.type() == QEvent.Type.WindowStateChange:
                self._apply_native_window_style(reason="window-state-change")
        except Exception:
            pass

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
            self._delta_timer.stop()
        except Exception:
            pass
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
            logger.dbg("note added", nid)
            self._request_focus_note_in_graph(nid)
            self._enqueue_note_delta([nid], "note added")

    def _on_notes_added(self, notes) -> None:
        count = 0
        last_nid = 0
        for note in notes or []:
            try:
                nid = int(getattr(note, "id", 0) or 0)
            except Exception:
                nid = 0
            if nid:
                count += 1
                last_nid = nid
        if count:
            logger.dbg("notes added", count)
            if last_nid:
                self._request_focus_note_in_graph(last_nid)
            nids: list[int] = []
            for note in notes or []:
                try:
                    nid = int(getattr(note, "id", 0) or 0)
                except Exception:
                    nid = 0
                if nid > 0:
                    nids.append(nid)
            self._enqueue_note_delta(nids, "notes added")


def show_tools_graph() -> None:
    from .graph_launcher import show_tools_graph as _show_tools_graph

    _show_tools_graph()
