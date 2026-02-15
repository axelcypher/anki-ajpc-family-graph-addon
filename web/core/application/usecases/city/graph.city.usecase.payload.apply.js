"use strict";

function cityUsecaseApplyPayload(payload, fitView) {
  STATE.raw = preparePayload(payload);
  if (!STATE.raw.meta || typeof STATE.raw.meta !== "object") STATE.raw.meta = {};
  if (STATE.depTreeCache && typeof STATE.depTreeCache.clear === "function") STATE.depTreeCache.clear();
  STATE.depTreePendingNid = null;
  var fullRev = Number(STATE.raw.meta.delta_rev);
  if (isFinite(fullRev) && fullRev > 0) STATE.lastAppliedDeltaRev = fullRev;
  else STATE.lastAppliedDeltaRev = 0;
  STATE.deltaRecoveryInProgress = false;
  ensureRuntimeState();
  refreshUiOnly();
  var applyFn = cityUsecaseResolveApplyGraphData();
  if (!applyFn) {
    throw new Error("applyGraphData is not defined");
  }
  applyFn(!!fitView);
  STATE.isFirstRender = false;
  log("engine render nodes=" + STATE.activeNodes.length + " edges=" + STATE.activeEdges.length);
}
