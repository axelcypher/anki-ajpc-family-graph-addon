"use strict";

function edgeTouchesPoint(edge, pointIndex) {
  if (!edge || pointIndex === null || pointIndex === undefined) return false;
  var srcIdx = STATE.activeIndexById.get(String(edge.source || ""));
  var trgIdx = STATE.activeIndexById.get(String(edge.target || ""));
  return srcIdx === pointIndex || trgIdx === pointIndex;
}

function edgeTouchesSelectedSet(edge, selectedSet) {
  if (!edge || !selectedSet || selectedSet.size === 0) return false;
  var srcIdx = STATE.activeIndexById.get(String(edge.source || ""));
  var trgIdx = STATE.activeIndexById.get(String(edge.target || ""));
  return selectedSet.has(srcIdx) || selectedSet.has(trgIdx);
}

function edgeVisibleInRuntime(edge, edgeIndex) {
  if (!edge) return false;
  if (STATE.runtimeFlowEdgeMask && edgeIndex >= 0 && edgeIndex < STATE.runtimeFlowEdgeMask.length) {
    if (!STATE.runtimeFlowEdgeMask[edgeIndex]) return false;
  }
  if (STATE.runtimeEdgeVisibleMask && edgeIndex >= 0 && edgeIndex < STATE.runtimeEdgeVisibleMask.length) {
    if (!STATE.runtimeEdgeVisibleMask[edgeIndex]) return false;
  }
  if (!STATE.baseLinkColors || STATE.baseLinkColors.length < ((edgeIndex * 4) + 4)) return true;
  var alpha = Number(STATE.baseLinkColors[(edgeIndex * 4) + 3] || 0);
  if (!isFiniteNumber(alpha) || alpha <= 0.01) return false;
  var srcIdx = STATE.activeIndexById.get(String(edge.source || ""));
  var trgIdx = STATE.activeIndexById.get(String(edge.target || ""));
  if (srcIdx === undefined || trgIdx === undefined) return false;
  if (STATE.runtimeNodeVisibleMask) {
    if (srcIdx >= 0 && srcIdx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[srcIdx]) return false;
    if (trgIdx >= 0 && trgIdx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[trgIdx]) return false;
  }
  if (!STATE.basePointColors || STATE.basePointColors.length < ((Math.max(srcIdx, trgIdx) * 4) + 4)) return true;
  var sa = Number(STATE.basePointColors[(srcIdx * 4) + 3] || 0);
  var ta = Number(STATE.basePointColors[(trgIdx * 4) + 3] || 0);
  return sa > 0.01 && ta > 0.01;
}

function shouldAnimateEdge(edge, edgeIndex, selectedSet) {
  if (!edge) return false;
  if (!edgeVisibleInRuntime(edge, edgeIndex)) return false;
  if (edgeHasFlow(edge)) return true;
  if (STATE.focusEdgeMask && edgeIndex >= 0 && edgeIndex < STATE.focusEdgeMask.length) {
    if (STATE.focusEdgeMask[edgeIndex]) return true;
  }
  if (STATE.hoveredLinkIndex === edgeIndex) return true;
  if (edgeTouchesPoint(edge, STATE.hoveredPointIndex)) return true;
  if (edgeTouchesPoint(edge, STATE.selectedPointIndex)) return true;
  if (edgeTouchesSelectedSet(edge, selectedSet)) return true;
  return false;
}

function hasAnyFlowEdge() {
  var selectedIndices = null;
  var selectedSet = null;
  if (STATE.graph && typeof STATE.graph.getSelectedIndices === "function") {
    selectedIndices = STATE.graph.getSelectedIndices();
    if (selectedIndices && selectedIndices.length) {
      selectedSet = new Set(selectedIndices.map(function (x) { return Number(x); }));
    }
  }
  var i;
  for (i = 0; i < STATE.activeEdges.length; i += 1) {
    if (shouldAnimateEdge(STATE.activeEdges[i], i, selectedSet)) return true;
  }
  return false;
}

function rgbaCss(r, g, b, a) {
  var rr = Math.round(clamp(Number(r || 0), 0, 1) * 255);
  var gg = Math.round(clamp(Number(g || 0), 0, 1) * 255);
  var bb = Math.round(clamp(Number(b || 0), 0, 1) * 255);
  var aa = clamp(Number(a === undefined ? 1 : a), 0, 1);
  return "rgba(" + rr + "," + gg + "," + bb + "," + aa.toFixed(3) + ")";
}

function getCurvedControlPoint(ss, tt, curvature) {
  var dx = tt[0] - ss[0];
  var dy = tt[1] - ss[1];
  var len = Math.sqrt((dx * dx) + (dy * dy));
  if (!isFinite(len) || len < 1) {
    return [(ss[0] + tt[0]) * 0.5, (ss[1] + tt[1]) * 0.5];
  }
  var mx = (ss[0] + tt[0]) * 0.5;
  var my = (ss[1] + tt[1]) * 0.5;
  var nx = -dy / len;
  var ny = dx / len;
  var h = Number(curvature);
  if (!isFinite(h)) h = 0;
  return [mx + (nx * len * h), my + (ny * len * h)];
}

function sampleQuadraticCurve(ss, cc, tt, prog) {
  var t = clamp(prog, 0, 1);
  var omt = 1 - t;
  var omt2 = omt * omt;
  var t2 = t * t;
  var x = (omt2 * ss[0]) + (2 * omt * t * cc[0]) + (t2 * tt[0]);
  var y = (omt2 * ss[1]) + (2 * omt * t * cc[1]) + (t2 * tt[1]);
  return [x, y];
}

function estimateCurveLengthOnScreen(ss, cc, tt) {
  var steps = 8;
  var prev = STATE.graph.spaceToScreenPosition(ss);
  if (!Array.isArray(prev)) return 0;
  var total = 0;
  var i;
  for (i = 1; i <= steps; i += 1) {
    var p = sampleQuadraticCurve(ss, cc, tt, i / steps);
    var pp = STATE.graph.spaceToScreenPosition(p);
    if (!Array.isArray(pp)) continue;
    var dx = pp[0] - prev[0];
    var dy = pp[1] - prev[1];
    total += Math.sqrt((dx * dx) + (dy * dy));
    prev = pp;
  }
  return total;
}

function flowEdgeStyleCode(edgeIndex) {
  var styles = STATE.graph && STATE.graph.linkStyleCodes;
  if (!styles || edgeIndex < 0 || edgeIndex >= styles.length) return 0;
  var c = Number(styles[edgeIndex]) | 0;
  return (c === 1 || c === 2) ? c : 0;
}

function flowEdgeCurvature(edgeIndex) {
  var sc = flowEdgeStyleCode(edgeIndex);
  if (typeof edgeCurvByStyle === "function") {
    var cv = Number(edgeCurvByStyle(sc, edgeIndex));
    if (isFinite(cv)) return cv;
  }
  if (sc === 0) return (edgeIndex % 2 === 0) ? 0.2 : -0.2;
  return (edgeIndex % 2 === 0) ? 0.12 : -0.12;
}

function flowEdgeColor(edge, edgeIndex) {
  var arr = STATE.graph && STATE.graph.linkColors;
  if (arr && arr.length >= ((edgeIndex * 4) + 4)) {
    var r = Number(arr[edgeIndex * 4]);
    var g = Number(arr[(edgeIndex * 4) + 1]);
    var b = Number(arr[(edgeIndex * 4) + 2]);
    if (isFiniteNumber(r) && isFiniteNumber(g) && isFiniteNumber(b)) {
      return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
    }
  }
  return parseColor(STATE.layerColors[edge.layer] || fallbackLayerColor(edge.layer), 1);
}

function stopFlowParticles() {
  if (STATE.flowRaf) {
    window.cancelAnimationFrame(STATE.flowRaf);
  }
  STATE.flowRaf = null;
  STATE.flowStartTs = 0;
  if (DOM.flowCanvas && DOM.flowCtx) {
    clearOverlayCanvas(DOM.flowCanvas, DOM.flowCtx);
  }
}

function ensureCanvasSize(canvas, ctx) {
  var host = DOM.graph || DOM.graphPanel;
  if (!canvas || !ctx || !host) return;
  var w = Math.max(1, host.clientWidth);
  var h = Math.max(1, host.clientHeight);
  var dpr = window.devicePixelRatio || 1;
  var rw = Math.round(w * dpr);
  var rh = Math.round(h * dpr);
  if (canvas.width !== rw || canvas.height !== rh) {
    canvas.width = rw;
    canvas.height = rh;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function ensureFlowCanvasSize() {
  ensureCanvasSize(DOM.flowCanvas, DOM.flowCtx);
}

function clearOverlayCanvas(canvas, ctx) {
  if (!canvas || !ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawFlowParticles(ts) {
  if (!OVERLAY_EFFECTS_ENABLED) {
    stopFlowParticles();
    return;
  }
  if (!DOM.flowCtx || !STATE.graph || STATE.activeNodes.length === 0) {
    stopFlowParticles();
    return;
  }

  ensureFlowCanvasSize();
  if (!STATE.flowStartTs) STATE.flowStartTs = ts;
  var t = (ts - STATE.flowStartTs) / 1000;

  var pos = STATE.graph.getPointPositions();
  if (!Array.isArray(pos) || pos.length < STATE.activeNodes.length * 2) {
    if (DOM.flowCanvas && DOM.flowCtx) {
      clearOverlayCanvas(DOM.flowCanvas, DOM.flowCtx);
    }
    STATE.flowRaf = window.requestAnimationFrame(drawFlowParticles);
    return;
  }
  if (DOM.flowCanvas && DOM.flowCtx) {
    clearOverlayCanvas(DOM.flowCanvas, DOM.flowCtx);
    DOM.flowCtx.globalCompositeOperation = "source-over";
  }

  var speed = clamp(Number(STATE.layerFlowSpeed || 0), 0, 3);
  var canDrawFlow = speed > 0 && hasAnyFlowEdge();
  var selectedIndices = null;
  var selectedSet = null;
  if (STATE.graph && typeof STATE.graph.getSelectedIndices === "function") {
    selectedIndices = STATE.graph.getSelectedIndices();
    if (selectedIndices && selectedIndices.length) {
      selectedSet = new Set(selectedIndices.map(function (x) { return Number(x); }));
    }
  }

  if (canDrawFlow && DOM.flowCtx) {
    DOM.flowCtx.globalCompositeOperation = "source-over";

    var eligible = [];
    var i;
    for (i = 0; i < STATE.activeEdges.length; i += 1) {
      if (shouldAnimateEdge(STATE.activeEdges[i], i, selectedSet)) {
        eligible.push(i);
      }
    }

    var localFocus = (STATE.hoveredLinkIndex !== null)
      || (STATE.hoveredPointIndex !== null)
      || (STATE.selectedPointIndex !== null);
    var maxEdges = localFocus ? 6000 : 1800;
    var stride = Math.max(1, Math.ceil(eligible.length / maxEdges));

    for (i = 0; i < eligible.length; i += stride) {
      var edgeIndex = eligible[i];
      var edge = STATE.activeEdges[edgeIndex];

      var sIdx = STATE.activeIndexById.get(String(edge.source || ""));
      var tIdx = STATE.activeIndexById.get(String(edge.target || ""));
      if (sIdx === undefined || tIdx === undefined) continue;

      var sx = pos[sIdx * 2];
      var sy = pos[sIdx * 2 + 1];
      var tx = pos[tIdx * 2];
      var ty = pos[tIdx * 2 + 1];
      if (!isFiniteNumber(sx) || !isFiniteNumber(sy) || !isFiniteNumber(tx) || !isFiniteNumber(ty)) continue;

      var ss = [sx, sy];
      var tt = [tx, ty];
      var curvature = flowEdgeCurvature(edgeIndex);
      var cc = getCurvedControlPoint(ss, tt, curvature);
      var curveLength = estimateCurveLengthOnScreen(ss, cc, tt);
      if (!isFinite(curveLength) || curveLength < 6) continue;

      var flowColor = flowEdgeColor(edge, edgeIndex);
      var phase = (Math.abs(hashCode(edge.source + "|" + edge.target + "|" + edge.layer)) % 2048) / 2048;
      var count = Math.max(1, Math.min(4, Math.floor(curveLength / 115)));
      var p;
      for (p = 0; p < count; p += 1) {
        var localPhase = (phase + (p / count)) % 1;
        var speedScale = (0.38 + (speed * 1.7));
        var prog = ((t * speedScale) + localPhase) % 1;
        var ptSpace = sampleQuadraticCurve(ss, cc, tt, prog);
        var pt = STATE.graph.spaceToScreenPosition(ptSpace);
        if (!Array.isArray(pt)) continue;
        var alpha = 0.36 + (0.47 * (1 - Math.abs((prog * 2) - 1)));
        var linkW = Number(STATE.graph.linkWidths && STATE.graph.linkWidths.length > edgeIndex ? STATE.graph.linkWidths[edgeIndex] : 0);
        if (!isFiniteNumber(linkW) || linkW <= 0) linkW = 1;
        var linkScreenW = STATE.graph.spaceToScreenRadius(Math.max(0.3, linkW * 0.5)) * 2;
        if (!isFiniteNumber(linkScreenW) || linkScreenW <= 0) linkScreenW = 1;
        var radius = Math.max(2.2 + (1.6 * speed), (linkScreenW * 0.62) + 1.15);

        DOM.flowCtx.beginPath();
        DOM.flowCtx.fillStyle = rgbaCss(flowColor[0], flowColor[1], flowColor[2], clamp(alpha * 0.34, 0, 1));
        DOM.flowCtx.arc(pt[0], pt[1], radius, 0, Math.PI * 2);
        DOM.flowCtx.fill();

        DOM.flowCtx.beginPath();
        DOM.flowCtx.fillStyle = rgbaCss(flowColor[0], flowColor[1], flowColor[2], clamp(alpha * 0.98, 0, 1));
        DOM.flowCtx.arc(pt[0], pt[1], Math.max(1.0, radius * 0.56), 0, Math.PI * 2);
        DOM.flowCtx.fill();

        if (edgeMeta(edge).bidirectional) {
          var revProg = 1 - prog;
          var revPtSpace = sampleQuadraticCurve(ss, cc, tt, revProg);
          var revPt = STATE.graph.spaceToScreenPosition(revPtSpace);
          if (!Array.isArray(revPt)) continue;
          DOM.flowCtx.beginPath();
          DOM.flowCtx.fillStyle = rgbaCss(flowColor[0], flowColor[1], flowColor[2], clamp(alpha * 0.34, 0, 1));
          DOM.flowCtx.arc(revPt[0], revPt[1], radius, 0, Math.PI * 2);
          DOM.flowCtx.fill();

          DOM.flowCtx.beginPath();
          DOM.flowCtx.fillStyle = rgbaCss(flowColor[0], flowColor[1], flowColor[2], clamp(alpha * 0.98, 0, 1));
          DOM.flowCtx.arc(revPt[0], revPt[1], Math.max(1.0, radius * 0.56), 0, Math.PI * 2);
          DOM.flowCtx.fill();
        }
      }
    }

    DOM.flowCtx.globalCompositeOperation = "source-over";
  }

  if (
    STATE.graph &&
    typeof STATE.graph.requestFrame === "function" &&
    STATE.graph.solver &&
    STATE.graph.solver.simulation
  ) {
    // While layout is active, force one renderer frame so particles stay aligned to moving nodes.
    STATE.graph.requestFrame();
  }
  STATE.flowRaf = window.requestAnimationFrame(drawFlowParticles);
}

function ensureFlowParticlesLoop() {
  if (!OVERLAY_EFFECTS_ENABLED) {
    stopFlowParticles();
    return;
  }
  if (!STATE.graph || !STATE.activeNodes || STATE.activeNodes.length === 0) {
    stopFlowParticles();
    return;
  }
  if (!STATE.flowRaf) {
    STATE.flowStartTs = 0;
    STATE.flowRaf = window.requestAnimationFrame(drawFlowParticles);
  }
}

