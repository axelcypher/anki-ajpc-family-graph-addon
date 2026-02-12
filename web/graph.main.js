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
