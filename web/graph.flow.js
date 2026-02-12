"use strict";

function flowClamp(v, minV, maxV) {
  var n = Number(v);
  if (!isFinite(n)) n = 0;
  if (n < minV) return minV;
  if (n > maxV) return maxV;
  return n;
}

function stopFlowParticles() {
  if (STATE.flowRaf) {
    window.cancelAnimationFrame(STATE.flowRaf);
  }
  STATE.flowRaf = null;
  STATE.flowStartTs = 0;
}

function hasShaderFlowCandidates() {
  if (!OVERLAY_EFFECTS_ENABLED) return false;
  if (!STATE.graph || !Array.isArray(STATE.activeEdges) || !STATE.activeEdges.length) return false;
  var speed = flowClamp(STATE.layerFlowSpeed, 0, 3);
  if (speed <= 0.001) return false;
  if (STATE.lastStyleHasFocus) return true;

  var flowMask = STATE.runtimeEdgeFlowMask;
  var visMask = STATE.runtimeEdgeVisibleMask;
  if (!flowMask || flowMask.length !== STATE.activeEdges.length) return true;

  for (var i = 0; i < flowMask.length; i += 1) {
    if (!flowMask[i]) continue;
    if (visMask && visMask.length === flowMask.length && !visMask[i]) continue;
    return true;
  }
  return false;
}

function drawFlowShaderFrames(ts) {
  if (!hasShaderFlowCandidates()) {
    stopFlowParticles();
    return;
  }
  if (!STATE.flowStartTs) STATE.flowStartTs = ts;
  if (STATE.graph && typeof STATE.graph.requestFrame === "function") {
    // Keep edge shader time uniforms moving even when layout is idle.
    STATE.graph.requestFrame();
  }
  STATE.flowRaf = window.requestAnimationFrame(drawFlowShaderFrames);
}

function ensureFlowCanvasSize() {
  // Canvas flow renderer removed; shader flow does not require canvas sizing.
}

function ensureFlowParticlesLoop() {
  if (!hasShaderFlowCandidates()) {
    stopFlowParticles();
    return;
  }
  if (!STATE.flowRaf) {
    STATE.flowStartTs = 0;
    STATE.flowRaf = window.requestAnimationFrame(drawFlowShaderFrames);
  }
}

(function registerFlowAdapterPorts() {
  var adapter = window && window.GraphAdapter;
  if (!adapter || typeof adapter.registerCityPort !== "function") return;
  adapter.registerCityPort("ensureFlowCanvasSize", ensureFlowCanvasSize);
  adapter.registerCityPort("ensureFlowParticlesLoop", ensureFlowParticlesLoop);
})();
