from __future__ import annotations

from aqt import gui_hooks, mw
from aqt.deckbrowser import DeckBrowser
from aqt.qt import QAction

from .graph_view import show_family_graph
from .version import __version__  # noqa: F401


def _register_exports() -> None:
    if mw is None:
        return
    try:
        mw.addonManager.setWebExports(__name__, r"web/.*")
    except Exception:
        pass


def _register_menu() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_family_graph_registered", False):
        return
    api = getattr(mw, "_ajpc_menu_api", None)
    if isinstance(api, dict) and callable(api.get("register")):
        api["register"](
            kind="top",
            label="Show Graph",
            callback=show_family_graph,
            order=30,
        )
        fallback = getattr(mw, "_ajpc_family_graph_fallback_action", None)
        if fallback is not None:
            try:
                mw.form.menuTools.removeAction(fallback)
            except Exception:
                pass
            mw._ajpc_family_graph_fallback_action = None
        mw._ajpc_family_graph_registered = True
        return
    action = QAction("Show Graph", mw)
    action.triggered.connect(show_family_graph)
    mw.form.menuTools.addAction(action)
    mw._ajpc_family_graph_fallback_action = action


_register_menu()
_register_exports()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_menu())
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_exports())


def _register_sidebar_item() -> None:
    if mw is None:
        return
    if getattr(mw, "_ajpc_family_graph_sidebar_registered", False):
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
        if item and item.item_type == SidebarItemType.CUSTOM and item.name == "AJpC Graph":
            show_family_graph()
            return
        return _orig_on_search(self, index)

    try:
        _orig_on_search = SidebarTreeView._on_search  # type: ignore[attr-defined]
    except Exception:
        return
    if getattr(SidebarTreeView, "_ajpc_family_graph_patched", False):
        pass
    else:
        SidebarTreeView._on_search = _on_search  # type: ignore[assignment]
        SidebarTreeView._ajpc_family_graph_patched = True  # type: ignore[attr-defined]

    def _add_item(handled, root, stage, _browser):
        if stage != SidebarStage.ROOT:
            return handled
        for child in getattr(root, "children", []):
            try:
                if child.item_type == SidebarItemType.CUSTOM and child.name == "AJpC Graph":
                    return handled
            except Exception:
                continue
        item = SidebarItem(
            name="AJpC Graph",
            icon="",
            item_type=SidebarItemType.CUSTOM,
        )
        item.tooltip = "Open AJpC Family Graph"
        root.add_child(item)
        return handled

    gui_hooks.browser_will_build_tree.append(_add_item)
    mw._ajpc_family_graph_sidebar_registered = True


_register_sidebar_item()
gui_hooks.profile_did_open.append(lambda *_args, **_kw: _register_sidebar_item())


def _inject_onigiri_sidebar(web_content, context) -> None:
    if mw is None:
        return
    if not isinstance(context, DeckBrowser):
        return
    addon_pkg = mw.addonManager.addonFromModule(__name__)
    web_content.js.append(f"/_addons/{addon_pkg}/web/onigiri_sidebar.js")
    web_content.css.append(f"/_addons/{addon_pkg}/web/onigiri_sidebar.css")


def _on_webview_cmd(handled, message, context):
    if message == "ajpc_family_graph_open":
        show_family_graph()
        return (True, None)
    return handled


gui_hooks.webview_will_set_content.append(_inject_onigiri_sidebar)
gui_hooks.webview_did_receive_js_message.append(_on_webview_cmd)
