"use strict";

log("core.city.usecase.bootstrap.js modular");

function cityUsecaseBoot(payload) {
  if (!DOM.graph) wireDom();
  try {
    cityUsecaseApplyPayload(payload, STATE.isFirstRender);
  } catch (err) {
    if (DOM.graphEmpty) {
      DOM.graphEmpty.textContent = "Graph init failed: " + String(err && err.message ? err.message : err);
    }
    log("engine init failed " + String(err));
  }
}

window.ajpcGraphInit = function (data) {
  cityUsecaseBoot(data || {});
};

window.ajpcGraphUpdate = function (data) {
  cityUsecaseBoot(data || {});
};

window.ajpcGraphDelta = function (data) {
  cityUsecaseApplyDeltaPayload(data || {});
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
