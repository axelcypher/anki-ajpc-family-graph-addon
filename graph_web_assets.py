from __future__ import annotations

import os
from typing import Any

from aqt import mw

from . import logger

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


def render_graph_html(_payload: dict[str, Any]) -> str:
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

    replacements = {
        "__GRAPH_CSS__": asset_url("graph.css"),
        "__GRAPH_GRAPHOLOGY_SRC__": asset_url("libs/graphology.min.js"),
        "__GRAPH_LAYOUT_SRC__": asset_url("libs/graphology-layout.bundle.js"),
        "__GRAPH_D3_DISPATCH_SRC__": asset_url("libs/d3-dispatch.min.js"),
        "__GRAPH_D3_QUADTREE_SRC__": asset_url("libs/d3-quadtree.min.js"),
        "__GRAPH_D3_TIMER_SRC__": asset_url("libs/d3-timer.min.js"),
        "__GRAPH_D3_FORCE_SRC__": asset_url("libs/d3-force.min.js"),
        "__GRAPH_ENGINE_SRC__": asset_url("libs/sigma.min.js"),
        "__GRAPH_SIGMA_PROGRAM_EDGE_CURVED_JS__": asset_url("sigma-programs/graph.engine.sigma.program.edge.curved.js"),
        "__GRAPH_SIGMA_PROGRAM_EDGE_DASHED_JS__": asset_url("sigma-programs/graph.engine.sigma.program.edge.dashed.js"),
        "__GRAPH_SIGMA_PROGRAM_EDGE_DOTTED_JS__": asset_url("sigma-programs/graph.engine.sigma.program.edge.dotted.js"),
        "__GRAPH_SIGMA_PROGRAM_NODE_NOTE_JS__": asset_url("sigma-programs/graph.engine.sigma.program.node.note.js"),
        "__GRAPH_SIGMA_PROGRAM_NODE_HUB_JS__": asset_url("sigma-programs/graph.engine.sigma.program.node.hub.js"),
        "__GRAPH_SIGMA_PROGRAM_EXTRA_CARDDOTS_JS__": asset_url("sigma-programs/graph.engine.sigma.program.extra.carddots.js"),
        "__GRAPH_SIGMA_PROGRAM_EXTRA_NODEFX_JS__": asset_url("sigma-programs/graph.engine.sigma.program.extra.nodefx.js"),
        "__GRAPH_STATE_JS__": asset_url("graph.city.state.js"),
        "__GRAPH_BRIDGE_JS__": asset_url("graph.city.bridge.js"),
        "__GRAPH_ADAPTER_JS__": asset_url("graph.adapter.js"),
        "__GRAPH_CITY_GATEWAY_JS__": asset_url("graph.city.gateway.js"),
        "__GRAPH_UTILS_JS__": asset_url("graph.city.utils.js"),
        "__GRAPH_PAYLOAD_JS__": asset_url("graph.city.payload.js"),
        "__GRAPH_FLOW_JS__": asset_url("graph.city.flow.js"),
        "__GRAPH_ENGINE_GATEWAY_JS__": asset_url("graph.engine.gateway.js"),
        "__GRAPH_ENGINE_JS__": asset_url("graph.engine.main.js"),
        "__GRAPH_DATA_JS__": asset_url("graph.engine.data.graphology.js"),
        "__GRAPH_SOLVER_JS__": asset_url("graph.engine.solver.d3.js"),
        "__GRAPH_RENDERER_JS__": asset_url("graph.engine.renderer.sigma.js"),
        "__GRAPH_UI_DEPTREE_JS__": asset_url("ui/graph.city.ui.deptree.js"),
        "__GRAPH_UI_DEBUG_JS__": asset_url("ui/graph.city.ui.debug.js"),
        "__GRAPH_UI_TOOLTIP_JS__": asset_url("ui/graph.city.ui.tooltip.js"),
        "__GRAPH_UI_CTX_JS__": asset_url("ui/graph.city.ui.ctx.js"),
        "__GRAPH_UI_EDITOR_JS__": asset_url("ui/graph.city.ui.editor.js"),
        "__GRAPH_UI_JS__": asset_url("graph.city.ui.js"),
        "__GRAPH_MAIN_JS__": asset_url("graph.city.main.js"),
    }
    logger.dbg("web base", web_base, "graph main js", replacements.get("__GRAPH_MAIN_JS__", ""))

    try:
        with open(os.path.join(WEB_DIR, "graph.html"), "r", encoding="utf-8") as handle:
            html = handle.read()
    except Exception as exc:
        logger.dbg("graph html load failed", str(exc))
        html = ""

    html = html.replace("{{", "{").replace("}}", "}")
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html

