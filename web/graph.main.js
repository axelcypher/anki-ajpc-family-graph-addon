"use strict";

log("graph.main.js modular");

function resolveApplyGraphData() {
  if (window && window.GraphAdapter && typeof window.GraphAdapter.callEngine === "function") {
    if (typeof window.GraphAdapter.hasEnginePort === "function" && !window.GraphAdapter.hasEnginePort("applyGraphData")) {
      return null;
    }
    return function (fitView) {
      return window.GraphAdapter.callEngine("applyGraphData", fitView);
    };
  }
  return null;
}

function applyPayload(payload, fitView) {
  STATE.raw = preparePayload(payload);
  if (STATE.depTreeCache && typeof STATE.depTreeCache.clear === "function") STATE.depTreeCache.clear();
  STATE.depTreePendingNid = null;
  ensureRuntimeState();
  refreshUiOnly();
  var applyFn = resolveApplyGraphData();
  if (!applyFn) {
    throw new Error("applyGraphData is not defined");
  }
  applyFn(!!fitView);
  STATE.isFirstRender = false;
  log("engine render nodes=" + STATE.activeNodes.length + " edges=" + STATE.activeEdges.length);
}

function applyDeltaPayload(delta) {
  var patch = (delta && typeof delta === "object") ? delta : {};
  var changedList = Array.isArray(patch.changed_nids) ? patch.changed_nids : [];
  var changed = new Set();
  changedList.forEach(function (nid) {
    var key = String(nid || "").trim();
    if (key) changed.add(key);
  });

  var raw = (STATE.raw && typeof STATE.raw === "object") ? STATE.raw : { nodes: [], edges: [], meta: {} };
  if (!Array.isArray(raw.nodes)) raw.nodes = [];
  if (!Array.isArray(raw.edges)) raw.edges = [];
  if (!raw.meta || typeof raw.meta !== "object") raw.meta = {};

  var nextEdges = raw.edges.filter(function (edge) {
    if (!edge || typeof edge !== "object") return false;
    if (!changed.size) return true;
    var src = String(edge.source || "");
    return !changed.has(src);
  });
  var patchEdges = Array.isArray(patch.edges) ? patch.edges.map(normalizeEdge) : [];
  raw.edges = dedupeEdges(nextEdges.concat(patchEdges));

  var nodeById = new Map();
  raw.nodes.forEach(function (node) {
    if (!node || typeof node !== "object") return;
    var id = String(node.id || "");
    if (!id) return;
    nodeById.set(id, normalizeNode(node));
  });
  if (changed.size) {
    changed.forEach(function (id) {
      nodeById.delete(String(id));
    });
  }
  var patchNodes = Array.isArray(patch.nodes) ? patch.nodes.map(normalizeNode) : [];
  patchNodes.forEach(function (node) {
    var id = String(node.id || "");
    if (!id) return;
    nodeById.set(id, node);
  });
  raw.nodes = Array.from(nodeById.values());

  if (patch.meta && typeof patch.meta === "object") {
    raw.meta = Object.assign({}, raw.meta, patch.meta);
    if (Array.isArray(raw.meta.layers)) {
      var layerSet = new Set();
      raw.meta.layers.forEach(function (layer) {
        var key = normalizeLayerKey(layer, "edge");
        if (key) layerSet.add(key);
      });
      raw.edges.forEach(function (edge) {
        var key = normalizeLayerKey(edge.layer, "edge");
        if (key) layerSet.add(key);
      });
      raw.meta.layers = orderedLayerKeys(Array.from(layerSet.values()));
    }
  }

  STATE.raw = raw;
  if (STATE.depTreeCache && typeof STATE.depTreeCache.clear === "function") STATE.depTreeCache.clear();
  STATE.depTreePendingNid = null;
  ensureRuntimeState();
  refreshUiOnly();
  var applyFn = resolveApplyGraphData();
  if (!applyFn) {
    throw new Error("applyGraphData is not defined");
  }
  applyFn(false);
  STATE.isFirstRender = false;
  log("engine delta nodes=" + STATE.activeNodes.length + " edges=" + STATE.activeEdges.length);
}

function boot(payload) {
  if (!DOM.graph) wireDom();
  try {
    applyPayload(payload, STATE.isFirstRender);
  } catch (err) {
    if (DOM.graphEmpty) {
      DOM.graphEmpty.textContent = "Graph init failed: " + String(err && err.message ? err.message : err);
    }
    log("engine init failed " + String(err));
  }
}

window.ajpcGraphInit = function (data) {
  boot(data || {});
};

window.ajpcGraphUpdate = function (data) {
  boot(data || {});
};

window.ajpcGraphDelta = function (delta) {
  if (!DOM.graph) wireDom();
  try {
    applyDeltaPayload(delta || {});
  } catch (err) {
    log("engine delta failed " + String(err && err.message ? err.message : err));
    boot(delta || {});
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    wireDom();
    wireDebugDom();
    updateSettingsVisibility(false);
  });
} else {
  wireDom();
  wireDebugDom();
  updateSettingsVisibility(false);
}
