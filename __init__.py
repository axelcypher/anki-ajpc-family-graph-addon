from __future__ import annotations

from aqt import gui_hooks, mw
from aqt.qt import QAction

from . import logger
from .graph_launcher import show_tools_graph, show_tools_graph_for_note
from .version import __version__  # noqa: F401


def _register_exports() -> None:
    if mw is None:
        return
    try:
        mw.addonManager.setWebExports(__name__, r"web/.*")
    except Exception:
        pass


# AJpC Menu
def _register_menu() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_tools_graph_registered", False):
        return
    api = getattr(mw, "_ajpc_menu_api", None)
    if isinstance(api, dict) and callable(api.get("register")):
        api["register"](
            kind="top",
            label="Show Graph",
            callback=show_tools_graph,
            order=30,
        )
        fallback = getattr(mw, "_ajpc_tools_graph_fallback_action", None)
        if fallback is not None:
            try:
                mw.form.menuTools.removeAction(fallback)
            except Exception:
                pass
            mw._ajpc_tools_graph_fallback_action = None
        mw._ajpc_tools_graph_registered = True
        return
    action = QAction("Show Graph", mw)
    action.triggered.connect(show_tools_graph)
    mw.form.menuTools.addAction(action)
    mw._ajpc_tools_graph_fallback_action = action

_register_menu()
_register_exports()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_menu())
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_exports())


# Browser Context Menu Link
def _selected_nid_from_browser(browser) -> int:
    try:
        nids = browser.selected_notes() if browser is not None else []
        if nids:
            return int(nids[0])
    except Exception:
        pass
    try:
        card = getattr(browser, "card", None)
        if card is not None and getattr(card, "nid", None):
            return int(card.nid)
        if card is not None and callable(getattr(card, "note", None)):
            note = card.note()
            if note is not None and getattr(note, "id", None):
                return int(note.id)
    except Exception:
        pass
    return 0


def _open_selected_note_in_graph(browser) -> None:
    nid = _selected_nid_from_browser(browser)
    if nid <= 0:
        logger.dbg("browser graph search skipped: no selected note")
        return
    try:
        show_tools_graph_for_note(nid)
        logger.dbg("browser graph search", nid)
    except Exception:
        logger.dbg("browser graph search failed", nid)


def _browser_context_menu(browser, menu, *_args) -> None:
    try:
        action = QAction("Show in AJpC Graph", menu)
        action.triggered.connect(lambda: _open_selected_note_in_graph(browser))
        menu.addAction(action)
    except Exception:
        logger.dbg("browser context menu inject failed")


def _register_browser_context_menu() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_tools_graph_browser_ctx_registered", False):
        return
    try:
        gui_hooks.browser_will_show_context_menu.append(_browser_context_menu)
        mw._ajpc_tools_graph_browser_ctx_registered = True
        logger.dbg("browser context menu hook registered")
    except Exception:
        logger.dbg("browser context menu hook registration failed")


_register_browser_context_menu()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_browser_context_menu())


# Browser Sidebar Link
def _register_sidebar_item() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_tools_graph_sidebar_registered", False):
        return
    try:
        from aqt.browser.sidebar.item import SidebarItem, SidebarItemType
        from aqt.browser.sidebar.tree import SidebarStage, SidebarTreeView
    except Exception:
        return

    def _on_search(self: SidebarTreeView, index) -> None:
        try:
            model = self.model()
            item = model.item_for_index(index) if model else None
        except Exception:
            item = None
        if item and item.item_type == SidebarItemType.CUSTOM and item.name == "Graph":
            show_tools_graph()
            return
        return _orig_on_search(self, index)

    try:
        _orig_on_search = SidebarTreeView._on_search  # type: ignore[attr-defined]
    except Exception:
        return
    if getattr(SidebarTreeView, "_ajpc_tools_graph_patched", False):
        pass
    else:
        SidebarTreeView._on_search = _on_search  # type: ignore[assignment]
        SidebarTreeView._ajpc_tools_graph_patched = True  # type: ignore[attr-defined]

    def _add_item(handled, root, stage, _browser):
        if stage != SidebarStage.ROOT:
            return handled
        for child in getattr(root, "children", []):
            try:
                if child.item_type == SidebarItemType.CUSTOM and child.name == "Graph":
                    return handled
            except Exception:
                continue
        item = SidebarItem(
            name="Graph",
            icon="",
            item_type=SidebarItemType.CUSTOM,
        )
        item.tooltip = "Open AJpC Tools Graph"
        root.add_child(item)
        return handled

    gui_hooks.browser_will_build_tree.append(_add_item)
    mw._ajpc_tools_graph_sidebar_registered = True

_register_sidebar_item()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_sidebar_item())


# Onigiri Sidebar Support
def _load_graph_icon_svg() -> str:
    try:
        import os
        svg_path = os.path.join(os.path.dirname(__file__), "web", "graph-icon.svg")
        with open(svg_path, "r", encoding="utf-8") as handle:
            svg = handle.read().strip()
    except Exception:
        return ""
    if svg.startswith("<?xml"):
        start = svg.find("<svg")
        if start != -1:
            svg = svg[start:]
    return svg

def _register_onigiri_sidebar_action() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_tools_graph_onigiri_registered", False):
        return
    try:
        import Onigiri
    except Exception:
        return
    icon_svg = _load_graph_icon_svg()
    try:
        Onigiri.register_sidebar_action(
            entry_id="ajpc_tools_graph.open_panel",
            label="Graph",
            command="ajpc_tools_graph_open",
            icon_svg=icon_svg,
        )
    except Exception:
        return
    mw._ajpc_tools_graph_onigiri_registered = True

def _on_webview_cmd(handled, message, context):
    if message == "ajpc_tools_graph_open":
        show_tools_graph()
        return (True, None)
    if isinstance(message, str) and message.startswith("embed_editor:"):
        win = getattr(mw, "_ajpc_tools_graph_win", None) if mw is not None else None
        if win is not None and hasattr(win, "_on_bridge_cmd"):
            try:
                win._on_bridge_cmd(message)
                return (True, None)
            except Exception:
                return handled
    return handled


gui_hooks.webview_did_receive_js_message.append(_on_webview_cmd)
_register_onigiri_sidebar_action()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_onigiri_sidebar_action())
