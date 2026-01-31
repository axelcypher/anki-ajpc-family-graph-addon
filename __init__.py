from __future__ import annotations

from aqt import gui_hooks, mw
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
