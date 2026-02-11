"use strict";

function tooltipHtml(node) {
  var parts = [];
  parts.push('<div class="tip-title">' + escapeHtml(node.label || node.id) + "</div>");

  if (node.note_type) {
    parts.push('<div class="tip-muted">' + escapeHtml(node.note_type) + "</div>");
  } else if (node.kind) {
    parts.push('<div class="tip-muted">' + escapeHtml(node.kind) + "</div>");
  }

  if (Array.isArray(node.layers) && node.layers.length) {
    parts.push("<div>Layers: " + escapeHtml(node.layers.join(", ")) + "</div>");
  }

  if (Array.isArray(node.extra) && node.extra.length) {
    var ntid = String(node.note_type_id || "");
    var nt = STATE.noteTypes[ntid];
    var allowed = nt && Array.isArray(nt.tooltipFields) && nt.tooltipFields.length
      ? new Set(nt.tooltipFields)
      : null;
    var filtered = allowed
      ? node.extra.filter(function (entry) { return allowed.has(String(entry.name || "")); })
      : node.extra;
    var maxRows = 4;
    var rows = filtered.slice(0, maxRows).map(function (entry) {
      return "<div><strong>" + escapeHtml(entry.name || "") + ":</strong> " + escapeHtml(entry.value || "") + "</div>";
    });
    parts.push(rows.join(""));
    if (filtered.length > maxRows) {
      parts.push('<div class="tip-muted">+ ' + (filtered.length - maxRows) + " more fields</div>");
    }
  }

  return parts.join("");
}

function setHoverDebug(reason, details) {
  var d = details && typeof details === "object" ? details : {};
  function n(v) {
    var x = Number(v);
    return isFinite(x) ? x : NaN;
  }
  var idx = d.idx;
  if (idx === undefined || idx === null || idx === "") idx = STATE.hoveredPointIndex;
  STATE.hoverDebug = {
    reason: String(reason || ""),
    idx: (idx === undefined || idx === null || idx === "" || !isFinite(Number(idx))) ? null : Number(idx),
    nodeId: d.nodeId === undefined || d.nodeId === null ? "" : String(d.nodeId),
    noteType: d.noteType === undefined || d.noteType === null ? "" : String(d.noteType),
    hitRadius: n(d.hitRadius),
    dist: n(d.dist),
    dx: n(d.dx),
    dy: n(d.dy),
    nodeClientX: n(d.nodeClientX),
    nodeClientY: n(d.nodeClientY),
    pointerX: n(d.pointerX === undefined ? STATE.pointerClientX : d.pointerX),
    pointerY: n(d.pointerY === undefined ? STATE.pointerClientY : d.pointerY),
    ts: Date.now()
  };
}

function showTooltip(node, event) {
  if (!DOM.hoverTip || !node) return;
  DOM.hoverTip.innerHTML = tooltipHtml(node);
  DOM.hoverTip.style.display = "block";

  var cx = event && typeof event.clientX === "number" ? Number(event.clientX) : NaN;
  var cy = event && typeof event.clientY === "number" ? Number(event.clientY) : NaN;
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    cx = Number(STATE.pointerClientX);
    cy = Number(STATE.pointerClientY);
  }
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    var panelRect = DOM.graphPanel ? DOM.graphPanel.getBoundingClientRect() : null;
    if (panelRect) {
      cx = panelRect.left + (panelRect.width * 0.5);
      cy = panelRect.top + (panelRect.height * 0.5);
    }
  }
  if (isFiniteNumber(cx) && isFiniteNumber(cy)) {
    DOM.hoverTip.style.left = (cx + 14) + "px";
    DOM.hoverTip.style.top = (cy + 14) + "px";
  }
  setHoverDebug("tooltip-show", {
    nodeId: node.id,
    noteType: node.note_type || node.kind || "",
    pointerX: cx,
    pointerY: cy
  });
}

function hideTooltip() {
  if (!DOM.hoverTip) return;
  DOM.hoverTip.style.display = "none";
}

function clearHoverNodeState(reason, details) {
  var idx = STATE.hoveredPointIndex;
  setHoverDebug(reason || "hover-clear", Object.assign({ idx: idx }, details || {}));
  STATE.hoveredPointIndex = null;
  if (idx !== null && idx !== undefined && typeof applyVisualStyles === "function") {
    applyVisualStyles(0.08);
  }
  hideTooltip();
}

function resolvePointerToGraphViewport() {
  if (!DOM.graph) return null;
  if (!isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) return null;
  var rect = DOM.graph.getBoundingClientRect();
  if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) return null;
  var vx = Number(STATE.pointerClientX) - Number(rect.left);
  var vy = Number(STATE.pointerClientY) - Number(rect.top);
  if (!isFiniteNumber(vx) || !isFiniteNumber(vy)) return null;
  return { vx: vx, vy: vy, rect: rect };
}

function getNodeHoverScreenRadius(idx) {
  var i = Number(idx);
  if (!isFiniteNumber(i) || i < 0 || i >= STATE.activeNodes.length) return 8;

  var radiusPx = NaN;
  if (STATE.graph && typeof STATE.graph.getPointScreenRadiusByIndex === "function") {
    radiusPx = Number(STATE.graph.getPointScreenRadiusByIndex(i));
  }
  if (!isFiniteNumber(radiusPx) || radiusPx <= 0) {
    var baseSize = Number((STATE.pointStyleSizes && STATE.pointStyleSizes.length > i) ? STATE.pointStyleSizes[i] : 0);
    if (!isFiniteNumber(baseSize) || baseSize <= 0) baseSize = 1;
    // Sigma node size is radius-like in screen terms; no additional 0.5 shrink.
    radiusPx = STATE.graph.spaceToScreenRadius(baseSize);
  }
  if (!isFiniteNumber(radiusPx) || radiusPx <= 0) radiusPx = 8;

  var node = STATE.activeNodes && STATE.activeNodes.length > i ? STATE.activeNodes[i] : null;
  var kind = String(node && node.kind || "");
  var noteType = String(node && node.note_type || "");
  var isNoteLike = (kind === "note") || !!noteType;
  if (isNoteLike) {
    // Custom note shader draws core+gap+ring+pulse outside the core radius.
    radiusPx *= 1.75;
  }

  return Math.max(8, radiusPx + 6);
}

function findHoverCandidateAtPointer() {
  if (!STATE.graph || typeof STATE.graph.getPointPositions !== "function") return null;
  var vp = resolvePointerToGraphViewport();
  if (!vp) return null;
  var px = Number(vp.vx);
  var py = Number(vp.vy);
  if (!isFiniteNumber(px) || !isFiniteNumber(py)) return null;
  if (typeof STATE.graph.spaceToScreenPosition !== "function") return null;

  var pos = STATE.graph.getPointPositions();
  if (!Array.isArray(pos) || !pos.length) return null;

  var bestIdx = -1;
  var bestDist2 = Number.POSITIVE_INFINITY;
  var maxIdx = Math.min(STATE.activeNodes.length, Math.floor(pos.length / 2));
  for (var i = 0; i < maxIdx; i += 1) {
    if (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === STATE.activeNodes.length && !STATE.runtimeNodeVisibleMask[i]) continue;
    var nx = Number(pos[i * 2]);
    var ny = Number(pos[(i * 2) + 1]);
    if (!isFiniteNumber(nx) || !isFiniteNumber(ny)) continue;

    var sp = STATE.graph.spaceToScreenPosition([nx, ny]);
    if (!Array.isArray(sp) || sp.length < 2) continue;
    var sx = Number(sp[0]);
    var sy = Number(sp[1]);
    if (!isFiniteNumber(sx) || !isFiniteNumber(sy)) continue;

    var hitPx = getNodeHoverScreenRadius(i);
    var dx = px - sx;
    var dy = py - sy;
    var d2 = (dx * dx) + (dy * dy);
    if (d2 <= (hitPx * hitPx) && d2 < bestDist2) {
      bestDist2 = d2;
      bestIdx = i;
    }
  }

  return bestIdx >= 0 ? bestIdx : null;
}

function syncHoverTooltipToPointer() {
  if (STATE.hoveredPointIndex === null || STATE.hoveredPointIndex === undefined) {
    var acquired = findHoverCandidateAtPointer();
    if (acquired !== null && acquired !== undefined) {
      STATE.hoveredPointIndex = Number(acquired);
      if (typeof applyVisualStyles === "function") applyVisualStyles(0.08);
      setHoverDebug("hover-fallback-acquire", { idx: acquired });
    } else {
      if (!STATE.hoverDebug || STATE.hoverDebug.reason !== "hover-none") setHoverDebug("hover-none");
      hideTooltip();
      return;
    }
  }
  if (!STATE.pointerInsideGraph) {
    clearHoverNodeState("pointer-outside");
    return;
  }
  if (!STATE.graph || typeof STATE.graph.getPointPositions !== "function") {
    setHoverDebug("graph-unready");
    return;
  }
  if (!isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) {
    setHoverDebug("pointer-invalid");
    return;
  }

  var idx = Number(STATE.hoveredPointIndex);
  if (!isFinite(idx) || idx < 0 || idx >= STATE.activeNodes.length) {
    clearHoverNodeState("idx-invalid", { idx: idx });
    return;
  }

  var pos = STATE.graph.getPointPositions();
  if (!Array.isArray(pos) || pos.length < ((idx * 2) + 2)) {
    clearHoverNodeState("positions-missing", { idx: idx });
    return;
  }

  var sx = Number(pos[idx * 2]);
  var sy = Number(pos[(idx * 2) + 1]);
  if (!isFiniteNumber(sx) || !isFiniteNumber(sy)) {
    clearHoverNodeState("node-space-invalid", { idx: idx });
    return;
  }

  var screenPos = STATE.graph.spaceToScreenPosition([sx, sy]);
  if (!Array.isArray(screenPos) || screenPos.length < 2) {
    clearHoverNodeState("screenpos-invalid", { idx: idx });
    return;
  }
  var panelRect = DOM.graph ? DOM.graph.getBoundingClientRect() : null;
  var sxClient = Number(screenPos[0]);
  var syClient = Number(screenPos[1]);
  if (panelRect) {
    sxClient += Number(panelRect.left || 0);
    syClient += Number(panelRect.top || 0);
  }

  var hitRadius = getNodeHoverScreenRadius(idx);

  var dx = Number(STATE.pointerClientX) - sxClient;
  var dy = Number(STATE.pointerClientY) - syClient;
  var dist = Math.sqrt((dx * dx) + (dy * dy));
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy) || ((dx * dx) + (dy * dy)) > (hitRadius * hitRadius)) {
    var replacementIdx = findHoverCandidateAtPointer();
    if (replacementIdx !== null && replacementIdx !== undefined && Number(replacementIdx) !== idx) {
      STATE.hoveredPointIndex = Number(replacementIdx);
      if (typeof applyVisualStyles === "function") applyVisualStyles(0.08);
      setHoverDebug("hover-fallback-switch", {
        idx: replacementIdx,
        fromIdx: idx
      });
      idx = Number(replacementIdx);
      pos = STATE.graph.getPointPositions();
      if (!Array.isArray(pos) || pos.length < ((idx * 2) + 2)) {
        clearHoverNodeState("positions-missing", { idx: idx });
        return;
      }
      sx = Number(pos[idx * 2]);
      sy = Number(pos[(idx * 2) + 1]);
      if (!isFiniteNumber(sx) || !isFiniteNumber(sy)) {
        clearHoverNodeState("node-space-invalid", { idx: idx });
        return;
      }
      screenPos = STATE.graph.spaceToScreenPosition([sx, sy]);
      if (!Array.isArray(screenPos) || screenPos.length < 2) {
        clearHoverNodeState("screenpos-invalid", { idx: idx });
        return;
      }
      sxClient = Number(screenPos[0]);
      syClient = Number(screenPos[1]);
      if (panelRect) {
        sxClient += Number(panelRect.left || 0);
        syClient += Number(panelRect.top || 0);
      }
      if (STATE.graph && typeof STATE.graph.getPointScreenRadiusByIndex === "function") {
        hitRadius = getNodeHoverScreenRadius(idx);
      }
      dx = Number(STATE.pointerClientX) - sxClient;
      dy = Number(STATE.pointerClientY) - syClient;
      dist = Math.sqrt((dx * dx) + (dy * dy));
      if (!isFiniteNumber(dx) || !isFiniteNumber(dy) || ((dx * dx) + (dy * dy)) > (hitRadius * hitRadius)) {
        clearHoverNodeState("hit-miss", {
          idx: idx,
          hitRadius: hitRadius,
          dist: dist,
          dx: dx,
          dy: dy,
          nodeClientX: sxClient,
          nodeClientY: syClient
        });
        return;
      }
    } else {
      clearHoverNodeState("hit-miss", {
        idx: idx,
        hitRadius: hitRadius,
        dist: dist,
        dx: dx,
        dy: dy,
        nodeClientX: sxClient,
        nodeClientY: syClient
      });
      return;
    }
  }

  var node = STATE.activeNodes[idx];
  if (!node) {
    clearHoverNodeState("node-missing", { idx: idx });
    return;
  }
  setHoverDebug("hover-ok", {
    idx: idx,
    nodeId: node.id,
    noteType: node.note_type || node.kind || "",
    hitRadius: hitRadius,
    dist: dist,
    dx: dx,
    dy: dy,
    nodeClientX: sxClient,
    nodeClientY: syClient
  });
  showTooltip(node, { clientX: STATE.pointerClientX, clientY: STATE.pointerClientY });
}

function stopHoverMonitor() {
  if (STATE.hoverMonitorRaf) {
    window.cancelAnimationFrame(STATE.hoverMonitorRaf);
    STATE.hoverMonitorRaf = null;
  }
  STATE.hoverMonitorLastTs = 0;
}

function isLayoutRunningForHover() {
  return !!(
    STATE.graph &&
    STATE.graph.solver &&
    STATE.graph.solver.simulation
  );
}

function startHoverMonitor() {
  if (STATE.hoverMonitorRaf) return;
  function tick(ts) {
    var now = Number(ts || 0);
    var running = isLayoutRunningForHover();
    var hasHover = STATE.hoveredPointIndex !== null && STATE.hoveredPointIndex !== undefined;
    var wantsFallback = STATE.pointerInsideGraph && (running || hasHover);
    if (wantsFallback) {
      // Keep fallback hit-test cheap: ~30fps while layout runs, ~11fps otherwise.
      var minStep = running ? 34 : 90;
      if (!STATE.hoverMonitorLastTs || ((now - STATE.hoverMonitorLastTs) >= minStep)) {
        STATE.hoverMonitorLastTs = now;
        syncHoverTooltipToPointer();
      }
    }
    STATE.hoverMonitorRaf = window.requestAnimationFrame(tick);
  }
  STATE.hoverMonitorRaf = window.requestAnimationFrame(tick);
}

function applyUiSettingsNoRebuild(reheatLayout) {
  if (typeof applyRuntimeUiSettings === "function") {
    return !!applyRuntimeUiSettings(reheatLayout);
  }
  if (typeof applyGraphData === "function") {
    applyGraphData(false);
    return true;
  }
  return false;
}

function titleAttr(text) {
  var t = String(text || "").trim();
  if (!t) return "";
  return ' title="' + escapeHtml(t) + '"';
}

function layerToggleHint(layer) {
  return "";
}

function noteTypeSettingHint(kind) {
  return "";
}

function linkSettingHint(kind) {
  return "";
}

function engineSettingHint(spec) {
  var hinted = String(spec && spec.hint || "");
  var fallback = String(spec && spec.label || "");
  return hinted || fallback || "Engine setting";
}

var DEBUG_EXTRA_SPEC = [
  { key: "hov", a: "hoverReason", b: "hoverIdx" },
  { key: "node", a: "hoverNode", b: "hoverType" },
  { key: "hit", a: "hoverHit", b: "hoverDist" },
  { key: "dxy", a: "hoverDx", b: "hoverDy" },
  { key: "dep", a: "depTreeRps", b: "depTreeSkipCount" }
];

function ensureDebugExtraRows() {
  if (!DOM.debugExtra || DOM.debugExtraCells) return;
  DOM.debugExtraCells = {};
  var table = document.createElement("div");
  table.className = "coord-table";
  table.setAttribute("aria-label", "debug extra");
  DEBUG_EXTRA_SPEC.forEach(function (row) {
    var k = document.createElement("div");
    k.className = "coord-key";
    k.textContent = row.key;
    var a = document.createElement("div");
    a.className = "coord-val";
    a.textContent = "--";
    var b = document.createElement("div");
    b.className = "coord-val";
    b.textContent = "--";
    table.appendChild(k);
    table.appendChild(a);
    table.appendChild(b);
    DOM.debugExtraCells[row.a] = a;
    DOM.debugExtraCells[row.b] = b;
  });
  DOM.debugExtra.innerHTML = "";
  DOM.debugExtra.appendChild(table);
}

function setDebugCoordValues(v) {
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugCoordUse) return;
  DOM.debugCoordUse.textContent = String(x.use || "--");
  DOM.debugCoordVpX.textContent = String(x.vpX || "--");
  DOM.debugCoordVpY.textContent = String(x.vpY || "--");
  DOM.debugCoordClX.textContent = String(x.clX || "--");
  DOM.debugCoordClY.textContent = String(x.clY || "--");
  DOM.debugCoordCamX.textContent = String(x.camX || "--");
  DOM.debugCoordCamY.textContent = String(x.camY || "--");
  DOM.debugCoordRatio.textContent = String(x.camR || "--");
}

function setDebugExtraValues(v) {
  ensureDebugExtraRows();
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugExtraCells) return;
  DEBUG_EXTRA_SPEC.forEach(function (row) {
    if (DOM.debugExtraCells[row.a]) DOM.debugExtraCells[row.a].textContent = String(x[row.a] || "--");
    if (DOM.debugExtraCells[row.b]) DOM.debugExtraCells[row.b].textContent = String(x[row.b] || "--");
  });
}

function clearDebugValueTables() {
  setDebugCoordValues({
    use: "--",
    vpX: "--",
    vpY: "--",
    clX: "--",
    clY: "--",
    camX: "--",
    camY: "--",
    camR: "--"
  });
  setDebugExtraValues({
    hoverReason: "--",
    hoverIdx: "--",
    hoverNode: "--",
    hoverType: "--",
    hoverHit: "--",
    hoverDist: "--",
    hoverDx: "--",
    hoverDy: "--",
    depTreeRps: "--",
    depTreeSkipCount: "--"
  });
}

function pickSolverLinkDistance(obj) {
  if (!obj || typeof obj !== "object") return NaN;
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i += 1) {
    var key = String(keys[i] || "");
    if (!/link_distance$/i.test(key)) continue;
    var value = Number(obj[key]);
    if (isFinite(value) && value > 0) return value;
  }
  return NaN;
}

function defaultSolverLinkDistance() {
  var runtime = STATE && STATE.solver && typeof STATE.solver === "object" ? STATE.solver : {};
  var defaults = (typeof getEngineSolverDefaults === "function") ? getEngineSolverDefaults() : {};
  var value = pickSolverLinkDistance(runtime);
  if (!isFinite(value) || value <= 0) value = pickSolverLinkDistance(defaults);
  if (!isFinite(value) || value <= 0) value = 30;
  return Number(value);
}

function getVisibleGraphCounts() {
  var nodesTotal = Array.isArray(STATE.activeNodes) ? STATE.activeNodes.length : 0;
  var edgesTotal = Array.isArray(STATE.activeEdges) ? STATE.activeEdges.length : 0;
  var nodesVisible = nodesTotal;
  var edgesVisible = edgesTotal;
  var i;

  if (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === nodesTotal) {
    nodesVisible = 0;
    for (i = 0; i < STATE.runtimeNodeVisibleMask.length; i += 1) {
      if (STATE.runtimeNodeVisibleMask[i]) nodesVisible += 1;
    }
  }

  if (STATE.runtimeEdgeVisibleMask && STATE.runtimeEdgeVisibleMask.length === edgesTotal) {
    edgesVisible = 0;
    for (i = 0; i < STATE.runtimeEdgeVisibleMask.length; i += 1) {
      if (STATE.runtimeEdgeVisibleMask[i]) edgesVisible += 1;
    }
  }

  return { nodes: nodesVisible, edges: edgesVisible };
}

function selectedNodeForStatus() {
  var idx = NaN;
  if (STATE.graph && typeof STATE.graph.getSelectedIndices === "function") {
    var selected = STATE.graph.getSelectedIndices();
    if (Array.isArray(selected) && selected.length) idx = Number(selected[0]);
    else return null;
  } else {
    idx = Number(STATE.selectedPointIndex);
    if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) {
      if (STATE.activeIndexById && STATE.selectedNodeId !== null && STATE.selectedNodeId !== undefined) {
        var mapped = STATE.activeIndexById.get(String(STATE.selectedNodeId));
        if (mapped !== undefined) idx = Number(mapped);
      }
    }
  }
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return null;
  if (STATE.runtimeNodeVisibleMask && idx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[idx]) return null;
  var node = STATE.activeNodes[idx];
  if (!node) return null;
  return { index: idx, node: node };
}

function depTreeCacheMap() {
  if (!(STATE.depTreeCache instanceof Map)) STATE.depTreeCache = new Map();
  return STATE.depTreeCache;
}

function nodeNidForDepTree(node) {
  if (!node || String(node.kind || "") !== "note") return 0;
  var raw = String(node.id || "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  var nid = Number(raw);
  return (isFiniteNumber(nid) && nid > 0) ? Math.round(nid) : 0;
}

function normalizeDepTreePayload(payload) {
  var p = payload && typeof payload === "object" ? payload : {};
  var out = {
    current_nid: Number(p.current_nid || 0),
    nodes: Array.isArray(p.nodes) ? p.nodes : [],
    edges: Array.isArray(p.edges) ? p.edges : [],
    raw_edges: [],
    raw_labels: {},
    estimated_height: Number(p.estimated_height || 0)
  };
  if (Array.isArray(p.raw_edges)) {
    out.raw_edges = p.raw_edges
      .filter(function (e) { return Array.isArray(e) && e.length >= 2; })
      .map(function (e) { return [Number(e[0] || 0), Number(e[1] || 0)]; })
      .filter(function (e) { return isFiniteNumber(e[0]) && e[0] > 0 && isFiniteNumber(e[1]) && e[1] > 0; });
  }
  if (p.raw_labels && typeof p.raw_labels === "object") out.raw_labels = p.raw_labels;
  if (!isFiniteNumber(out.current_nid) || out.current_nid <= 0) out.current_nid = 0;
  if (!isFiniteNumber(out.estimated_height) || out.estimated_height < 0) out.estimated_height = 0;
  return out;
}

function formatDepTreeFallbackHtml(payload, extra) {
  var p = normalizeDepTreePayload(payload);
  var tail = extra ? " " + String(extra) : "";
  return "<div><h3>Dependency Tree:</h3> " + escapeHtml(String(p.nodes.length)) + " nodes | " + escapeHtml(String(p.edges.length)) + " edges" + escapeHtml(tail) + "</div>";
}

function requestDepTreeForNid(nid) {
  var target = Number(nid || 0);
  if (!isFiniteNumber(target) || target <= 0) return;
  var cache = depTreeCacheMap();
  if (cache.has(target)) return;
  if (Number(STATE.depTreePendingNid || 0) === target) return;
  STATE.depTreePendingNid = target;
  persistHook("deptree:" + String(target));
}

function depTreeCanvasHeight(payload) {
  var p = normalizeDepTreePayload(payload);
  var h = Number(p.estimated_height || 0);
  if (!isFiniteNumber(h) || h <= 0) h = 170;
  if (h < 120) h = 120;
  if (h > 340) h = 340;
  return Math.round(h);
}

function ensureDepTreePerfState() {
  if (!STATE.depTreePerf || typeof STATE.depTreePerf !== "object") {
    STATE.depTreePerf = {
      windowStart: 0,
      renderCount: 0,
      renderTotal: 0,
      skipCount: 0,
      skipTotal: 0,
      rps: 0,
      sps: 0
    };
  }
  return STATE.depTreePerf;
}

function recordDepTreeRender() {
  var p = ensureDepTreePerfState();
  p.renderCount = Number(p.renderCount || 0) + 1;
  p.renderTotal = Number(p.renderTotal || 0) + 1;
}

function recordDepTreeSkip() {
  var p = ensureDepTreePerfState();
  p.skipCount = Number(p.skipCount || 0) + 1;
  p.skipTotal = Number(p.skipTotal || 0) + 1;
}

function updateDepTreePerfWindow(nowMs) {
  var p = ensureDepTreePerfState();
  var now = Number(nowMs);
  if (!isFiniteNumber(now) || now <= 0) now = Date.now();
  if (!isFiniteNumber(Number(p.windowStart || 0)) || Number(p.windowStart || 0) <= 0) p.windowStart = now;
  var elapsed = now - Number(p.windowStart || 0);
  if (elapsed >= 1000) {
    p.rps = (Number(p.renderCount || 0) * 1000) / Math.max(1, elapsed);
    p.sps = (Number(p.skipCount || 0) * 1000) / Math.max(1, elapsed);
    p.renderCount = 0;
    p.skipCount = 0;
    p.windowStart = now;
  }
  return p;
}

function depTreeDebugStats(nowMs) {
  var p = updateDepTreePerfWindow(nowMs);
  return {
    depTreeRps: Number(Number(p.rps || 0)).toFixed(1) + "/s",
    depTreeSkipCount: "R:" + String(Math.max(0, Math.round(Number(p.renderTotal || 0)))) + " S:" + String(Math.max(0, Math.round(Number(p.skipTotal || 0))))
  };
}

function resetDepTreeRenderState() {
  STATE.depTreeLoadingNid = 0;
  STATE.depTreeRenderState = {
    nid: 0,
    payloadRef: null,
    payloadStamp: "",
    width: 0,
    height: 0
  };
}

function depTreePayloadStamp(payload) {
  var p = normalizeDepTreePayload(payload);
  var n = Array.isArray(p.nodes) ? p.nodes : [];
  var e = Array.isArray(p.edges) ? p.edges : [];
  var firstNode = n.length ? String((n[0] && n[0].id) || "") : "";
  var lastNode = n.length ? String((n[n.length - 1] && n[n.length - 1].id) || "") : "";
  var firstEdge = e.length ? (String((e[0] && e[0].source) || "") + ">" + String((e[0] && e[0].target) || "")) : "";
  var lastEdge = e.length ? (String((e[e.length - 1] && e[e.length - 1].source) || "") + ">" + String((e[e.length - 1] && e[e.length - 1].target) || "")) : "";
  return [
    String(Number(p.current_nid || 0)),
    String(n.length),
    String(e.length),
    String(Math.round(Number(p.estimated_height || 0))),
    firstNode,
    lastNode,
    firstEdge,
    lastEdge
  ].join("|");
}

function depTreeCurrentCanvasSize(payload) {
  var width = 320;
  if (DOM.statusActiveDepTreeCanvas && DOM.statusActiveDepTreeCanvas.parentNode === DOM.statusActiveDepTree) {
    width = Number(DOM.statusActiveDepTreeCanvas.clientWidth || 0);
  }
  if (!isFiniteNumber(width) || width <= 0) {
    width = Number((DOM.statusActiveDepTree && DOM.statusActiveDepTree.clientWidth) || 320);
  }
  if (!isFiniteNumber(width) || width <= 0) width = 320;
  var height = depTreeCanvasHeight(payload);
  return {
    width: Math.max(120, Math.floor(width)),
    height: Math.max(120, Math.floor(height))
  };
}

function shouldRenderDepTreeCanvas(nid, payload, force) {
  if (force) return true;
  var sig = (STATE.depTreeRenderState && typeof STATE.depTreeRenderState === "object")
    ? STATE.depTreeRenderState
    : { nid: 0, payloadRef: null, payloadStamp: "", width: 0, height: 0 };
  var size = depTreeCurrentCanvasSize(payload);
  var stamp = depTreePayloadStamp(payload);
  if (Number(sig.nid || 0) !== Number(nid || 0)) return true;
  if (String(sig.payloadStamp || "") !== stamp) return true;
  if (Math.abs(Number(sig.width || 0) - Number(size.width || 0)) > 1) return true;
  if (Math.abs(Number(sig.height || 0) - Number(size.height || 0)) > 1) return true;
  recordDepTreeSkip();
  return false;
}

function markDepTreeRendered(nid, payload) {
  var size = depTreeCurrentCanvasSize(payload);
  STATE.depTreeRenderState = {
    nid: Number(nid || 0),
    payloadRef: payload || null,
    payloadStamp: depTreePayloadStamp(payload),
    width: Number(size.width || 0),
    height: Number(size.height || 0)
  };
  STATE.depTreeLoadingNid = 0;
  recordDepTreeRender();
}

function ensureDepTreeCanvas(payload) {
  if (!DOM.statusActiveDepTree) return null;
  var canvas = DOM.statusActiveDepTreeCanvas;
  if (canvas && canvas.parentNode !== DOM.statusActiveDepTree) canvas = null;
  if (!canvas) {
    DOM.statusActiveDepTree.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "dep-tree-canvas";
    canvas.style.width = "100%";
    canvas.style.display = "block";
    canvas.style.background = "transparent";
    canvas.style.cursor = "pointer";
    canvas.addEventListener("click", function (evt) {
      var c = evt.currentTarget;
      if (!c || !c.__ajpcHitBoxes || !c.__ajpcHitBoxes.length) return;
      var rect = c.getBoundingClientRect();
      var px = Number(evt.clientX) - Number(rect.left || 0);
      var py = Number(evt.clientY) - Number(rect.top || 0);
      if (!isFiniteNumber(px) || !isFiniteNumber(py)) return;
      var hit = null;
      for (var i = c.__ajpcHitBoxes.length - 1; i >= 0; i -= 1) {
        var b = c.__ajpcHitBoxes[i];
        if (px >= b.x && px <= (b.x + b.w) && py >= b.y && py <= (b.y + b.h)) {
          hit = b;
          break;
        }
      }
      if (!hit) return;
      if (typeof focusNodeById === "function") focusNodeById(String(hit.id || ""), true);
    });
    canvas.addEventListener("dblclick", function (evt) {
      var c = evt.currentTarget;
      if (!c || !c.__ajpcHitBoxes || !c.__ajpcHitBoxes.length) return;
      var rect = c.getBoundingClientRect();
      var px = Number(evt.clientX) - Number(rect.left || 0);
      var py = Number(evt.clientY) - Number(rect.top || 0);
      if (!isFiniteNumber(px) || !isFiniteNumber(py)) return;
      for (var i = c.__ajpcHitBoxes.length - 1; i >= 0; i -= 1) {
        var b = c.__ajpcHitBoxes[i];
        if (px >= b.x && px <= (b.x + b.w) && py >= b.y && py <= (b.y + b.h)) {
          var nid = Number(b.nid || 0);
          if (isFiniteNumber(nid) && nid > 0) persistHook("ctx:editapi:" + String(Math.round(nid)));
          break;
        }
      }
    });
    DOM.statusActiveDepTree.appendChild(canvas);
    DOM.statusActiveDepTreeCanvas = canvas;
  }
  canvas.style.height = String(depTreeCanvasHeight(payload)) + "px";
  return canvas;
}

function depTreeWrapText(ctx, text, maxW, maxLines) {
  var chars = Array.from(String(text || "Node"));
  var lines = [];
  var cur = "";
  for (var i = 0; i < chars.length; i += 1) {
    var ch = chars[i];
    var next = cur + ch;
    if (ctx.measureText(next).width <= maxW || !cur.length) {
      cur = next;
    } else {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length >= maxLines && chars.length > 0) {
    var last = String(lines[maxLines - 1] || "");
    lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 3)) + "...";
  }
  return lines.length ? lines : ["Node"];
}

function depTreeRgbaStringFromParsedColor(parsed, fallback) {
  if (!Array.isArray(parsed) || parsed.length < 3) return String(fallback || "#3d95e7");
  var r = Number(parsed[0]);
  var g = Number(parsed[1]);
  var b = Number(parsed[2]);
  var a = parsed.length >= 4 ? Number(parsed[3]) : 1;
  if (!isFinite(r) || !isFinite(g) || !isFinite(b) || !isFinite(a)) return String(fallback || "#3d95e7");
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  b = Math.max(0, Math.min(1, b));
  a = Math.max(0, Math.min(1, a));
  return "rgba(" + Math.round(r * 255) + "," + Math.round(g * 255) + "," + Math.round(b * 255) + "," + a.toFixed(3) + ")";
}

function depTreeResolveActiveNodeId(depTreeNodeId) {
  var id = String(depTreeNodeId || "");
  if (!id) return "";
  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : null;
  if (!byId) return "";
  if (byId.has(id)) return id;
  if (/^n\d+$/.test(id)) {
    var raw = id.slice(1);
    if (byId.has(raw)) return raw;
  }
  if (/^\d+$/.test(id)) {
    var prefixed = "n" + id;
    if (byId.has(prefixed)) return prefixed;
  }
  return "";
}

function depTreeNodeColorFromGraph(depTreeNodeId, fallback) {
  var resolvedId = depTreeResolveActiveNodeId(depTreeNodeId);
  if (!resolvedId) return String(fallback || "#3d95e7");
  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : null;
  if (!byId) return String(fallback || "#3d95e7");
  var idx = Number(byId.get(resolvedId));
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return String(fallback || "#3d95e7");

  var node = STATE.activeNodes[idx];
  if (node && typeof nodeColor === "function") {
    var parsed = nodeColor(node);
    var fromNodeCfg = depTreeRgbaStringFromParsedColor(parsed, "");
    if (fromNodeCfg) return fromNodeCfg;
  }

  var flat = (STATE.basePointColors && STATE.basePointColors.length) ? STATE.basePointColors : null;
  if (flat && flat.length >= ((idx * 4) + 4)) {
    var r = Number(flat[idx * 4] || 0);
    var g = Number(flat[(idx * 4) + 1] || 0);
    var b = Number(flat[(idx * 4) + 2] || 0);
    var a = Number(flat[(idx * 4) + 3] || 1);
    return depTreeRgbaStringFromParsedColor([r, g, b, a], fallback || "#3d95e7");
  }

  return String(fallback || "#3d95e7");
}

function depTreeEdgeColorKey(sourceId, targetId) {
  return String(sourceId || "") + "->" + String(targetId || "");
}

function depTreeBuildPriorityEdgeColorMap() {
  var out = new Map();
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  for (var i = 0; i < edges.length; i += 1) {
    var edge = edges[i];
    if (!edge) continue;
    if (String(edge.layer || "") !== "priority") continue;
    var s = String(edge.source || "");
    var t = String(edge.target || "");
    if (!s || !t) continue;
    var parsed = null;
    if (typeof linkColor === "function") parsed = linkColor(edge);
    if (!parsed && typeof parseColor === "function") {
      var raw = (STATE.layerColors && STATE.layerColors.priority) ? STATE.layerColors.priority : "#3d95e7";
      parsed = parseColor(String(raw || "#3d95e7"), 1);
    }
    var color = depTreeRgbaStringFromParsedColor(parsed, "#3d95e7");
    var key = depTreeEdgeColorKey(s, t);
    if (!out.has(key)) out.set(key, color);
  }
  return out;
}

function depTreePriorityEdgeColorFromGraph(depSourceId, depTargetId, edgeColorMap, fallback) {
  var s = depTreeResolveActiveNodeId(depSourceId);
  var t = depTreeResolveActiveNodeId(depTargetId);
  if (s && t && edgeColorMap instanceof Map) {
    var direct = edgeColorMap.get(depTreeEdgeColorKey(s, t));
    if (direct) return String(direct);
    var reverse = edgeColorMap.get(depTreeEdgeColorKey(t, s));
    if (reverse) return String(reverse);
  }
  if (typeof parseColor === "function") {
    var raw = (STATE.layerColors && STATE.layerColors.priority) ? STATE.layerColors.priority : "#3d95e7";
    return depTreeRgbaStringFromParsedColor(parseColor(String(raw || "#3d95e7"), 1), fallback || "#3d95e7");
  }
  return String(fallback || "#3d95e7");
}

function depTreeBuildLayout(payload, ctx, width, height) {
  var p = normalizeDepTreePayload(payload);
  var nodes = (Array.isArray(p.nodes) ? p.nodes : []).map(function (n) {
    var nodeId = String((n && n.id) || "");
    var payloadColor = String((n && n.color) || "#3d95e7");
    var graphColor = depTreeNodeColorFromGraph(nodeId, payloadColor);
    return {
      id: nodeId,
      nid: Number((n && n.nid) || 0),
      label: String((n && n.label) || (nodeId || "")),
      color: graphColor,
      depth: 0
    };
  }).filter(function (n) { return !!n.id; });
  if (!nodes.length) return { p: p, boxes: new Map(), nodes: [], edges: [], rootId: "", neededHeight: 0 };

  var byId = new Map();
  nodes.forEach(function (n) { byId.set(n.id, n); });

  var edges = (Array.isArray(p.edges) ? p.edges : []).map(function (e) {
    return { source: String((e && e.source) || ""), target: String((e && e.target) || "") };
  }).filter(function (e) { return byId.has(e.source) && byId.has(e.target); });

  var rootId = "";
  var rootNid = Number(p.current_nid || 0);
  if (isFiniteNumber(rootNid) && rootNid > 0) {
    var k = "n" + String(Math.round(rootNid));
    if (byId.has(k)) rootId = k;
    if (!rootId) {
      for (var i = 0; i < nodes.length; i += 1) {
        if (Number(nodes[i].nid || 0) === Math.round(rootNid)) {
          rootId = nodes[i].id;
          break;
        }
      }
    }
  }
  if (!rootId) rootId = nodes[0].id;

  var preds = new Map();
  var outs = new Map();
  nodes.forEach(function (n) {
    preds.set(n.id, []);
    outs.set(n.id, []);
  });
  edges.forEach(function (e) {
    outs.get(e.source).push(e.target);
    preds.get(e.target).push(e.source);
  });

  var depth = new Map();
  depth.set(rootId, 0);
  var anc = [rootId];
  while (anc.length) {
    var aid = anc.shift();
    var ad = Number(depth.get(aid) || 0);
    var parents = preds.get(aid) || [];
    for (var pi = 0; pi < parents.length; pi += 1) {
      var parent = parents[pi];
      var pd = ad - 1;
      if (!depth.has(parent) || pd < Number(depth.get(parent) || 0)) {
        depth.set(parent, pd);
        anc.push(parent);
      }
    }
  }
  var dep = [rootId];
  while (dep.length) {
    var did = dep.shift();
    var dd = Number(depth.get(did) || 0);
    var children = outs.get(did) || [];
    for (var ci = 0; ci < children.length; ci += 1) {
      var child = children[ci];
      var cd = dd + 1;
      if (!depth.has(child) || cd > Number(depth.get(child) || 0)) {
        depth.set(child, cd);
        dep.push(child);
      }
    }
  }

  var levels = new Map();
  var minDepth = 0;
  var maxDepth = 0;
  nodes.forEach(function (n) {
    var d = depth.has(n.id) ? Number(depth.get(n.id) || 0) : 0;
    n.depth = d;
    minDepth = Math.min(minDepth, d);
    maxDepth = Math.max(maxDepth, d);
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d).push(n);
  });

  var depthKeys = Array.from(levels.keys()).sort(function (a, b) { return a - b; });
  var orderByLevel = new Map();
  function resetLevelOrder(depthKey) {
    var list = levels.get(depthKey) || [];
    list.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
    var om = new Map();
    for (var i = 0; i < list.length; i += 1) om.set(list[i].id, i);
    orderByLevel.set(depthKey, om);
  }
  depthKeys.forEach(function (d) { resetLevelOrder(d); });

  function neighborBary(nodeId, neighborDepth) {
    var ids = [];
    var pp = preds.get(nodeId) || [];
    var oo = outs.get(nodeId) || [];
    for (var i = 0; i < pp.length; i += 1) {
      if (Number(depth.get(pp[i]) || 0) === neighborDepth) ids.push(pp[i]);
    }
    for (var j = 0; j < oo.length; j += 1) {
      if (Number(depth.get(oo[j]) || 0) === neighborDepth) ids.push(oo[j]);
    }
    var om = orderByLevel.get(neighborDepth) || new Map();
    var vals = ids.map(function (id) { return om.has(id) ? om.get(id) : null; }).filter(function (v) { return v !== null; });
    if (!vals.length) return null;
    var sum = 0;
    for (var k = 0; k < vals.length; k += 1) sum += Number(vals[k] || 0);
    return sum / vals.length;
  }

  for (var pass = 0; pass < 6; pass += 1) {
    for (var fi = 1; fi < depthKeys.length; fi += 1) {
      var d1 = depthKeys[fi];
      var prev = depthKeys[fi - 1];
      var list1 = levels.get(d1) || [];
      var curOrder1 = orderByLevel.get(d1) || new Map();
      list1.sort(function (a, b) {
        var ba = neighborBary(a.id, prev);
        var bb = neighborBary(b.id, prev);
        var fa = (ba === null) ? Number(curOrder1.get(a.id) || 0) : ba;
        var fb = (bb === null) ? Number(curOrder1.get(b.id) || 0) : bb;
        if (fa !== fb) return fa - fb;
        return String(a.label).localeCompare(String(b.label));
      });
      var om1 = new Map();
      for (var f1 = 0; f1 < list1.length; f1 += 1) om1.set(list1[f1].id, f1);
      orderByLevel.set(d1, om1);
    }

    for (var bi = depthKeys.length - 2; bi >= 0; bi -= 1) {
      var d2 = depthKeys[bi];
      var next = depthKeys[bi + 1];
      var list2 = levels.get(d2) || [];
      var curOrder2 = orderByLevel.get(d2) || new Map();
      list2.sort(function (a, b) {
        var ba = neighborBary(a.id, next);
        var bb = neighborBary(b.id, next);
        var fa = (ba === null) ? Number(curOrder2.get(a.id) || 0) : ba;
        var fb = (bb === null) ? Number(curOrder2.get(b.id) || 0) : bb;
        if (fa !== fb) return fa - fb;
        return String(a.label).localeCompare(String(b.label));
      });
      var om2 = new Map();
      for (var b2 = 0; b2 < list2.length; b2 += 1) om2.set(list2[b2].id, b2);
      orderByLevel.set(d2, om2);
    }
  }

  var marginX = 36;
  var marginY = 44;
  var usableH = Math.max(10, height - (marginY * 2));
  var padX = 7;
  var padY = 5;
  var lineH = 12;
  var singleLineNodeH = Math.ceil(lineH + (padY * 2));
  var maxLines = 2;
  var offsetFactor = 0.20;
  var boxById = new Map();
  var rowLayouts = [];

  ctx.font = "11px sans-serif";
  function measureRawWidth(label) {
    var txt = String(label || "Node");
    return Math.max(48, Math.ceil(ctx.measureText(txt).width + (padX * 2)));
  }

  for (var row = 0; row < depthKeys.length; row += 1) {
    var dkey = depthKeys[row];
    var list = levels.get(dkey) || [];
    var nCount = list.length;
    var usableW = Math.max(10, width - (marginX * 2));
    var minGap = nCount > 1 ? singleLineNodeH : 0;
    var laneGapBase = singleLineNodeH;

    var measured = list.map(function (node) {
      return { node: node, rawW: measureRawWidth(node.label) };
    });

    function packGreedy(items) {
      var lanes = [];
      var lane = [];
      var laneContentW = 0;
      for (var i = 0; i < items.length; i += 1) {
        var it = items[i];
        var nextContentW = lane.length > 0 ? (laneContentW + minGap + it.rawW) : it.rawW;
        var nextWithOffset = Math.ceil(nextContentW * (1 + offsetFactor));
        if (lane.length > 0 && nextWithOffset > usableW) {
          lanes.push(lane);
          lane = [it];
          laneContentW = it.rawW;
        } else {
          lane.push(it);
          laneContentW = nextContentW;
        }
      }
      if (lane.length > 0) lanes.push(lane);
      return lanes;
    }

    var packed = packGreedy(measured);
    var cols = Math.max(1, packed.reduce(function (mx, ln) { return Math.max(mx, ln.length); }, 0));
    var colW = usableW / Math.max(1, cols);
    var maxLabelW = Math.max(24, Math.floor((colW * 0.84) - (padX * 2)));

    function buildLaneBoxes(items) {
      var out = [];
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var lines = depTreeWrapText(ctx, item.node.label, maxLabelW, maxLines);
        var textW = 0;
        for (var li = 0; li < lines.length; li += 1) {
          textW = Math.max(textW, ctx.measureText(lines[li]).width);
        }
        var capW = Math.max(48, Math.floor(colW * 0.95));
        var boxW = Math.max(48, Math.min(capW, Math.ceil(textW + (padX * 2))));
        var boxH = Math.max(22, Math.ceil(lines.length * lineH + (padY * 2)));
        out.push({ node: item.node, lines: lines, w: boxW, h: boxH });
      }
      return out;
    }

    var lanes = packed.map(function (ln) { return buildLaneBoxes(ln); });
    var laneGap = lanes.length > 1 ? Math.max(6, Math.floor(laneGapBase * 0.7)) : laneGapBase;
    var laneHeights = lanes.map(function (ln) {
      return ln.reduce(function (mh, b) { return Math.max(mh, b.h); }, 22);
    });
    var totalLaneH = laneHeights.reduce(function (acc, v) { return acc + v; }, 0) + (laneGap * Math.max(0, lanes.length - 1));

    rowLayouts.push({
      depth: dkey,
      lanes: lanes,
      laneHeights: laneHeights,
      totalLaneH: totalLaneH,
      usableW: usableW,
      minGap: minGap,
      laneGap: laneGap,
      cols: cols,
      colW: colW,
      offsetStep: colW * offsetFactor
    });
  }

  var rowCount = rowLayouts.length;
  if (rowCount <= 0) {
    return { p: p, boxes: boxById, nodes: nodes, edges: edges, rootId: rootId, neededHeight: 96 };
  }

  var minRowGap = singleLineNodeH;
  var totalRowsH = rowLayouts.reduce(function (acc, r) { return acc + Number(r.totalLaneH || 0); }, 0);
  var levelGapBonus = rowCount > 1 ? Math.max(2, Math.floor(minRowGap * 0.2)) : 0;
  var baseLevelGap = minRowGap + levelGapBonus;
  var requiredMin = totalRowsH + (baseLevelGap * Math.max(0, rowCount - 1)) + (marginY * 2);
  var neededHeight = Math.max(96, Math.ceil(requiredMin));

  var rowGap = baseLevelGap;
  if (rowCount > 1) {
    var compactMin = totalRowsH + (baseLevelGap * (rowCount - 1));
    if (compactMin <= usableH) {
      rowGap = baseLevelGap + ((usableH - compactMin) / (rowCount - 1));
    }
  }

  var totalPackedH = totalRowsH + (rowGap * Math.max(0, rowCount - 1));
  var yCursor = marginY;
  if (totalPackedH < usableH) yCursor = marginY + ((usableH - totalPackedH) * 0.5);

  for (var r = 0; r < rowLayouts.length; r += 1) {
    var rowLayout = rowLayouts[r];
    var yTop = yCursor;
    var lanes = rowLayout.lanes || [];
    var laneHeights = rowLayout.laneHeights || [];
    var laneGap = Number(rowLayout.laneGap || minRowGap);
    var rowUsableW = Number(rowLayout.usableW || Math.max(10, width - (marginX * 2)));
    var rowMinGap = Number(rowLayout.minGap || minRowGap);
    var cols = Math.max(1, Number(rowLayout.cols || 1));
    var colW = Number(rowLayout.colW || (rowUsableW / cols));

    for (var li = 0; li < lanes.length; li += 1) {
      var lane = lanes[li] || [];
      var m = lane.length;
      if (m <= 0) {
        yTop += Number(laneHeights[li] || 22) + laneGap;
        continue;
      }

      var laneH = Number(laneHeights[li] || 22);
      var laneY = yTop + (laneH * 0.5);
      var startCol = (cols - m) * 0.5;
      var baseCenters = [];
      var laneLeft = Number.POSITIVE_INFINITY;
      var laneRight = Number.NEGATIVE_INFINITY;
      for (var i = 0; i < m; i += 1) {
        var slot = startCol + i;
        var cxBase = marginX + ((slot + 0.5) * colW);
        baseCenters.push(cxBase);
        var bw0 = Number(lane[i].w || 48);
        laneLeft = Math.min(laneLeft, cxBase - (bw0 * 0.5));
        laneRight = Math.max(laneRight, cxBase + (bw0 * 0.5));
      }

      var laneShift = 0;
      if (lanes.length > 1) {
        var sign = (li % 2 === 0) ? 1 : -1;
        var mul = Math.floor(li / 2) + 1;
        laneShift = sign * mul * Number(rowLayout.offsetStep || (colW * offsetFactor));
        var minShift = marginX - laneLeft;
        var maxShift = (marginX + rowUsableW) - laneRight;
        if (laneShift < minShift) laneShift = minShift;
        if (laneShift > maxShift) laneShift = maxShift;
      }

      var prevRight = Number.NEGATIVE_INFINITY;
      for (var bi = 0; bi < m; bi += 1) {
        var b = lane[bi];
        var bw = Number(b.w || 48);
        var bh = Number(b.h || 22);
        var cx = baseCenters[bi] + laneShift;
        var bx = Math.round(cx - (bw * 0.5));
        if (bx < (prevRight + rowMinGap)) bx = Math.round(prevRight + rowMinGap);
        var minX = Math.round(marginX);
        var maxX = Math.round(marginX + rowUsableW - bw);
        if (bx < minX) bx = minX;
        if (bx > maxX) bx = maxX;
        var by = Math.round(laneY - (bh * 0.5));
        b.node.x = bx + (bw * 0.5);
        b.node.y = laneY;
        boxById.set(b.node.id, {
          id: b.node.id,
          nid: Number(b.node.nid || 0),
          label: String(b.node.label || b.node.id || ""),
          color: String(b.node.color || "#3d95e7"),
          x: bx,
          y: by,
          w: bw,
          h: bh,
          cx: bx + (bw * 0.5),
          cy: by + (bh * 0.5),
          lines: b.lines || [String(b.node.label || b.node.id || "")]
        });
        prevRight = bx + bw;
      }

      yTop += laneH + laneGap;
    }
    yCursor += Number(rowLayout.totalLaneH || 0) + rowGap;
  }

  return { p: p, boxes: boxById, nodes: nodes, edges: edges, rootId: rootId, neededHeight: neededHeight };
}

function depTreeEdgePoints(srcBox, dstBox) {
  if (!srcBox || !dstBox) return null;
  if ((srcBox.y + (srcBox.h * 0.5)) <= (dstBox.y + (dstBox.h * 0.5))) {
    return {
      x1: srcBox.x + (srcBox.w * 0.5),
      y1: srcBox.y + srcBox.h,
      x2: dstBox.x + (dstBox.w * 0.5),
      y2: dstBox.y
    };
  }
  return {
    x1: srcBox.x + (srcBox.w * 0.5),
    y1: srcBox.y,
    x2: dstBox.x + (dstBox.w * 0.5),
    y2: dstBox.y + dstBox.h
  };
}

function depTreeSegmentsIntersect(a, b, c, d) {
  function orient(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }
  function onSeg(p, q, r) {
    return Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x)
      && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
  }
  var o1 = orient(a, b, c);
  var o2 = orient(a, b, d);
  var o3 = orient(c, d, a);
  var o4 = orient(c, d, b);
  if ((o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d))) return true;
  return ((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0));
}

function depTreeSegmentIntersectsRect(x1, y1, x2, y2, box, pad) {
  var p = Math.max(0, Number(pad || 0));
  var r = {
    x: Number(box.x || 0) - p,
    y: Number(box.y || 0) - p,
    w: Number(box.w || 0) + (p * 2),
    h: Number(box.h || 0) + (p * 2)
  };
  function pointInRect(px, py, rr) {
    return px >= rr.x && px <= (rr.x + rr.w) && py >= rr.y && py <= (rr.y + rr.h);
  }
  if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true;
  var a = { x: x1, y: y1 };
  var b = { x: x2, y: y2 };
  var e1 = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }];
  var e2 = [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }];
  var e3 = [{ x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  var e4 = [{ x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];
  return depTreeSegmentsIntersect(a, b, e1[0], e1[1])
    || depTreeSegmentsIntersect(a, b, e2[0], e2[1])
    || depTreeSegmentsIntersect(a, b, e3[0], e3[1])
    || depTreeSegmentsIntersect(a, b, e4[0], e4[1]);
}

function depTreePathIntersectsAnyBox(points, sourceId, targetId, nodes, boxes) {
  if (!points || points.length < 2) return false;
  for (var i = 1; i < points.length; i += 1) {
    var a = points[i - 1];
    var b = points[i];
    for (var j = 0; j < nodes.length; j += 1) {
      var n = nodes[j];
      var nid = String((n && n.id) || "");
      if (!nid || nid === sourceId || nid === targetId) continue;
      var box = boxes.get(nid);
      if (!box) continue;
      if (depTreeSegmentIntersectsRect(a.x, a.y, b.x, b.y, box, 2)) return true;
    }
  }
  return false;
}

function depTreeDrawRoundedOrthPath(ctx, points, radius) {
  if (!points || points.length < 2) return;
  var rr = Math.max(0, Number(radius || 0));
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length - 1; i += 1) {
    var p0 = points[i - 1];
    var p1 = points[i];
    var p2 = points[i + 1];
    var v1x = p1.x - p0.x;
    var v1y = p1.y - p0.y;
    var v2x = p2.x - p1.x;
    var v2y = p2.y - p1.y;
    var l1 = Math.hypot(v1x, v1y);
    var l2 = Math.hypot(v2x, v2y);
    if (l1 < 1 || l2 < 1 || rr <= 0) {
      ctx.lineTo(p1.x, p1.y);
      continue;
    }
    var r = Math.min(rr, l1 * 0.45, l2 * 0.45);
    var ux1 = v1x / l1;
    var uy1 = v1y / l1;
    var ux2 = v2x / l2;
    var uy2 = v2y / l2;
    var ax = p1.x - (ux1 * r);
    var ay = p1.y - (uy1 * r);
    var bx = p1.x + (ux2 * r);
    var by = p1.y + (uy2 * r);
    ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(p1.x, p1.y, bx, by);
  }
  var last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function depTreeRoundRectPath(ctx, x, y, w, h, r) {
  var rr = Math.min(Number(r || 0), Number(w || 0) * 0.5, Number(h || 0) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function renderDepTreeCanvas(payload) {
  var p = normalizeDepTreePayload(payload);
  if (!DOM.statusActiveDepTree) return;
  var canvas = ensureDepTreeCanvas(p);
  if (!canvas) return;
  var cssW = Math.max(120, Math.floor(Number(canvas.clientWidth || DOM.statusActiveDepTree.clientWidth || 320)));
  var cssH = depTreeCanvasHeight(p);
  var dpr = Math.max(1, Number(window.devicePixelRatio || 1));
  canvas.width = Math.max(2, Math.floor(cssW * dpr));
  canvas.height = Math.max(2, Math.floor(cssH * dpr));
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  var layout = depTreeBuildLayout(p, ctx, cssW, cssH);

  if (layout.neededHeight && Math.abs(layout.neededHeight - cssH) > 24) {
    var targetH = Math.max(120, Math.min(420, Math.round(layout.neededHeight)));
    if (targetH !== cssH) {
      canvas.style.height = String(targetH) + "px";
      cssH = targetH;
      canvas.width = Math.max(2, Math.floor(cssW * dpr));
      canvas.height = Math.max(2, Math.floor(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      layout = depTreeBuildLayout(p, ctx, cssW, cssH);
    }
  }

  if (!layout.nodes.length) {
    ctx.fillStyle = "#9a9a9a";
    ctx.font = "12px sans-serif";
    ctx.fillText("No dependency data", 10, 20);
    canvas.__ajpcHitBoxes = [];
    return;
  }

  var boxes = layout.boxes;
  var nodes = layout.nodes;
  var edges = layout.edges;
  var outMap = new Map();
  for (var ei = 0; ei < edges.length; ei += 1) {
    var e = edges[ei];
    if (!outMap.has(e.source)) outMap.set(e.source, []);
    outMap.get(e.source).push(e);
  }
  outMap.forEach(function (arr) {
    arr.sort(function (a, b) {
      var ax = (boxes.get(a.target) || { x: 0 }).x;
      var bx = (boxes.get(b.target) || { x: 0 }).x;
      return ax - bx;
    });
  });

  var minBoxX = Number.POSITIVE_INFINITY;
  var maxBoxX = Number.NEGATIVE_INFINITY;
  for (var ni = 0; ni < nodes.length; ni += 1) {
    var nb = boxes.get(nodes[ni].id);
    if (!nb) continue;
    minBoxX = Math.min(minBoxX, Number(nb.x || 0));
    maxBoxX = Math.max(maxBoxX, Number(nb.x || 0) + Number(nb.w || 0));
  }
  if (!Number.isFinite(minBoxX) || !Number.isFinite(maxBoxX)) {
    minBoxX = 0;
    maxBoxX = cssW;
  }

  var detourRight = 0;
  var detourLeft = 0;
  var detourLaneByKey = new Map();
  var priorityEdgeColorMap = depTreeBuildPriorityEdgeColorMap();
  var sourceMeta = new Map();
  outMap.forEach(function (arr, sid) {
    var sBox = boxes.get(sid);
    if (!sBox) return;
    var sumTy = 0;
    var count = 0;
    for (var i = 0; i < arr.length; i += 1) {
      var tBox = boxes.get(arr[i].target);
      if (!tBox) continue;
      var tCy = Number(tBox.y || 0) + (Number(tBox.h || 0) * 0.5);
      sumTy += tCy;
      count += 1;
    }
    var sCy = Number(sBox.y || 0) + (Number(sBox.h || 0) * 0.5);
    var dir = count > 0 && (sumTy / count) < sCy ? -1 : 1;
    var sxRaw = Number(sBox.x || 0) + (Number(sBox.w || 0) * 0.5);
    var syRaw = dir > 0 ? (Number(sBox.y || 0) + Number(sBox.h || 0)) : Number(sBox.y || 0);
    var sx = Math.round(sxRaw) + 0.5;
    var sy = Math.round(syRaw) + 0.5;
    var stub = 12;
    var forkY = Math.round(sy + (dir * stub)) + 0.5;
    sourceMeta.set(sid, {
      sx: sx,
      sy: sy,
      dir: dir,
      stub: stub,
      forkY: forkY,
      outCount: Math.max(0, arr.length),
      color: String(sBox.color || "#3d95e7"),
      routeColor: ""
    });
  });

  var routes = [];
  function detourXFor(sourceId, side) {
    var key = String(sourceId || "") + ":" + (side > 0 ? "R" : "L");
    if (detourLaneByKey.has(key)) return Number(detourLaneByKey.get(key) || 0);
    var x = 0;
    if (side > 0) {
      x = maxBoxX + 16 + (detourRight * 10);
      detourRight += 1;
    } else {
      x = minBoxX - 16 - (detourLeft * 10);
      detourLeft += 1;
    }
    x = Math.round(x) + 0.5;
    detourLaneByKey.set(key, x);
    return x;
  }

  for (var r = 0; r < edges.length; r += 1) {
    var edge = edges[r];
    var sourceId = String(edge.source || "");
    var targetId = String(edge.target || "");
    var sBox = boxes.get(sourceId);
    var tBox = boxes.get(targetId);
    var pts = depTreeEdgePoints(sBox, tBox);
    if (!pts) continue;

    var meta = sourceMeta.get(sourceId);
    var sx = meta ? Number(meta.sx) : (Math.round(Number(pts.x1 || 0)) + 0.5);
    var sy = meta ? Number(meta.sy) : (Math.round(Number(pts.y1 || 0)) + 0.5);
    var dir = meta ? Number(meta.dir) : ((Number(pts.y2 || 0) >= Number(pts.y1 || 0)) ? 1 : -1);
    var stub = meta ? Number(meta.stub) : 12;
    var forkY = meta ? Number(meta.forkY) : (Math.round(sy + (dir * stub)) + 0.5);
    var tx = Math.round(Number(pts.x2 || 0)) + 0.5;
    var ty = Math.round(Number(pts.y2 || 0)) + 0.5;
    var targetPreY = Math.round(ty - (dir * stub)) + 0.5;
    var p0 = { x: sx, y: sy };
    var p1 = { x: sx, y: forkY };
    var p2 = { x: tx, y: forkY };
    var p3 = { x: tx, y: targetPreY };
    var p4 = { x: tx, y: ty };
    var path = [p0, p1, p2, p3, p4];

    if (depTreePathIntersectsAnyBox(path, sourceId, targetId, nodes, boxes)) {
      var centerX = (sx + tx) * 0.5;
      var graphCenterX = (minBoxX + maxBoxX) * 0.5;
      var side = centerX >= graphCenterX ? 1 : -1;
      var detourX = detourXFor(sourceId, side);
      var pA = { x: detourX, y: p1.y };
      var pB = { x: detourX, y: p3.y };
      var detourPath = [p0, p1, pA, pB, p3, p4];
      if (!depTreePathIntersectsAnyBox(detourPath, sourceId, targetId, nodes, boxes)) {
        path = detourPath;
      } else {
        side = -side;
        detourX = detourXFor(sourceId, side);
        path = [p0, p1, { x: detourX, y: p1.y }, { x: detourX, y: p3.y }, p3, p4];
      }
    }

    var fallbackColor = (meta && meta.color) ? String(meta.color) : ((sBox && sBox.color) ? String(sBox.color) : "#3d95e7");
    var routeColor = depTreePriorityEdgeColorFromGraph(sourceId, targetId, priorityEdgeColorMap, fallbackColor);
    if (meta && !meta.routeColor) meta.routeColor = routeColor;
    routes.push({ sourceId: sourceId, targetId: targetId, dir: dir, path: path, color: routeColor });
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.3;

  var trunkDrawn = new Set();
  for (var tdi = 0; tdi < routes.length; tdi += 1) {
    var route = routes[tdi];
    var sid = String(route.sourceId || "");
    if (!sid || trunkDrawn.has(sid)) continue;
    var full = route.path || [];
    if (full.length < 2) continue;
    var sm = sourceMeta.get(sid);
    if (sm && Number(sm.outCount || 0) > 1) {
      ctx.strokeStyle = String(sm.routeColor || route.color || sm.color || "#3d95e7");
      depTreeDrawRoundedOrthPath(ctx, [full[0], full[1]], 7);
      trunkDrawn.add(sid);
    }
  }

  for (var rdi = 0; rdi < routes.length; rdi += 1) {
    var rr = routes[rdi];
    var fullPath = rr.path || [];
    if (fullPath.length < 2) continue;
    var smeta = sourceMeta.get(String(rr.sourceId || ""));
    var shared = !!(smeta && Number(smeta.outCount || 0) > 1);
    var branch = (shared && fullPath.length > 2) ? fullPath.slice(1) : fullPath;
    var edgeColor = String((rr && rr.color) || (smeta && smeta.color) || "#3d95e7");
    ctx.strokeStyle = edgeColor;
    depTreeDrawRoundedOrthPath(ctx, branch, 7);

    var tail = branch[branch.length - 2];
    var head = branch[branch.length - 1];
    var ti = branch.length - 2;
    while (ti > 0 && Math.hypot(head.x - tail.x, head.y - tail.y) < 1) {
      ti -= 1;
      tail = branch[ti];
    }
    var dx = head.x - tail.x;
    var dy = head.y - tail.y;
    var len = Math.hypot(dx, dy);
    if (len < 1) continue;
    var ux = dx / len;
    var uy = dy / len;
    var headLen = 7;
    var headW = 4;
    var bx = head.x - (ux * headLen);
    var by = head.y - (uy * headLen);
    var lx = bx - (uy * headW);
    var ly = by + (ux * headW);
    var rx = bx + (uy * headW);
    var ry = by - (ux * headW);
    ctx.fillStyle = edgeColor;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();
  }

  var forkPoints = [];
  sourceMeta.forEach(function (meta) {
    if (Number(meta.outCount || 0) > 1) {
      forkPoints.push({
        x: Number(meta.sx || 0),
        y: Number(meta.forkY || 0),
        color: String(meta.routeColor || meta.color || "#3d95e7")
      });
    }
  });

  var joinR = Math.max(1.4, ctx.lineWidth * 0.8);
  for (var fi = 0; fi < forkPoints.length; fi += 1) {
    var fp = forkPoints[fi];
    ctx.fillStyle = String((fp && fp.color) || "#3d95e7");
    ctx.beginPath();
    ctx.arc(Number(fp.x || 0), Number(fp.y || 0), joinR, 0, Math.PI * 2);
    ctx.fill();
  }

  canvas.__ajpcHitBoxes = [];
  boxes.forEach(function (b) {
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = b.color || "#3d95e7";
    depTreeRoundRectPath(ctx, b.x, b.y, b.w, b.h, 7);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = b.color || "#3d95e7";
    ctx.lineWidth = 1.4;
    depTreeRoundRectPath(ctx, b.x, b.y, b.w, b.h, 7);
    ctx.stroke();

    if (String(b.id) === String(layout.rootId || "")) {
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = b.color || "#3d95e7";
      ctx.lineWidth = 1.8;
      depTreeRoundRectPath(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#f2f2f2";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var lines = Array.isArray(b.lines) && b.lines.length ? b.lines : [String(b.label || "")];
    for (var li = 0; li < lines.length; li += 1) {
      ctx.fillText(String(lines[li] || ""), b.x + 7, b.y + 5 + 10 + (li * 12));
    }
    canvas.__ajpcHitBoxes.push({ id: b.id, nid: b.nid, x: b.x, y: b.y, w: b.w, h: b.h });
  });
}

function renderActiveDepTree(node) {
  if (!DOM.statusActiveDepTree) return;
  var nid = nodeNidForDepTree(node);
  if (!nid) {
    DOM.statusActiveDepTree.innerHTML = "";
    DOM.statusActiveDepTreeCanvas = null;
    resetDepTreeRenderState();
    return;
  }
  var cache = depTreeCacheMap();
  if (cache.has(nid)) {
    var payload = cache.get(nid);
    if (!shouldRenderDepTreeCanvas(nid, payload, false)) return;
    renderDepTreeCanvas(payload);
    markDepTreeRendered(nid, payload);
    return;
  }
  if (Number(STATE.depTreeLoadingNid || 0) !== nid || !DOM.statusActiveDepTreeCanvas) {
    DOM.statusActiveDepTree.innerHTML = "<div><h3>Dependency Tree:</h3> loading...</div>";
    DOM.statusActiveDepTreeCanvas = null;
  }
  STATE.depTreeLoadingNid = nid;
  requestDepTreeForNid(nid);
};

window.setActiveDepTreeFromPy = function (payload) {
  var p = normalizeDepTreePayload(payload);
  var nid = Number(p.current_nid || 0);
  if (!isFiniteNumber(nid) || nid <= 0) return;
  depTreeCacheMap().set(nid, p);
  if (Number(STATE.depTreePendingNid || 0) === nid) STATE.depTreePendingNid = null;

  var sel = selectedNodeForStatus();
  if (!sel || !sel.node) return;
  if (nodeNidForDepTree(sel.node) !== nid) return;
  if (!shouldRenderDepTreeCanvas(nid, p, false)) return;
  renderDepTreeCanvas(p);
  markDepTreeRendered(nid, p);
};

function renderActiveDetails() {
  if (!DOM.statusActiveDetails) return;
  var activePanel = DOM.statusActive;
  var closeDelayMs = 230;
  var sel = selectedNodeForStatus();
  if (!sel) {
    if (activePanel) {
      if (activePanel.__ajpcHideTimer) {
        window.clearTimeout(activePanel.__ajpcHideTimer);
        activePanel.__ajpcHideTimer = null;
      }
      activePanel.classList.remove("is-open");
      activePanel.setAttribute("aria-hidden", "true");
      activePanel.__ajpcHideTimer = window.setTimeout(function () {
        if (activePanel.classList.contains("is-open")) return;
        if (DOM.statusActiveDetails) DOM.statusActiveDetails.innerHTML = "";
        if (DOM.statusActiveDepTree) DOM.statusActiveDepTree.innerHTML = "";
        DOM.statusActiveDepTreeCanvas = null;
        resetDepTreeRenderState();
        activePanel.__ajpcHideTimer = null;
      }, closeDelayMs);
    } else {
      DOM.statusActiveDetails.innerHTML = "";
      if (DOM.statusActiveDepTree) DOM.statusActiveDepTree.innerHTML = "";
      DOM.statusActiveDepTreeCanvas = null;
      resetDepTreeRenderState();
    }
    return;
  }

  var idx = sel.index;
  var node = sel.node;
  var label = String(node.label || node.id || "");
  var noteType = String(node.note_type || "");
  var famMap = (node.family_prios && typeof node.family_prios === "object") ? node.family_prios : {};
  var families = Object.keys(famMap).map(function (k) { return String(k); }).filter(Boolean);
  families.sort(function (a, b) {
    var pa = Number(famMap[a]);
    var pb = Number(famMap[b]);
    if (!isFinite(pa)) pa = 999999;
    if (!isFinite(pb)) pb = 999999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : new Map();
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var links = [];
  var byLayer = Object.create(null);
  for (var i = 0; i < edges.length; i += 1) {
    var edge = edges[i];
    if (!edge) continue;
    var s = byId.get(String(edge.source || ""));
    var t = byId.get(String(edge.target || ""));
    if (s === undefined || t === undefined) continue;
    s = Number(s);
    t = Number(t);
    if (s !== idx && t !== idx) continue;
    var other = (s === idx) ? t : s;
    var otherNode = (other >= 0 && other < STATE.activeNodes.length) ? STATE.activeNodes[other] : null;
    var layer = String(edge.layer || "");
    if (!byLayer[layer]) byLayer[layer] = 0;
    byLayer[layer] += 1;
    links.push({
      layer: layer || "unknown",
      target: String((otherNode && (otherNode.label || otherNode.id)) || (s === idx ? edge.target : edge.source) || "")
    });
  }

  links.sort(function (a, b) {
    if (a.layer !== b.layer) return a.layer.localeCompare(b.layer);
    return a.target.localeCompare(b.target);
  });


  var linkListLimit = 10;
  var linkList = links.slice(0, linkListLimit).map(function (x) {
    return x.layer + " -> " + x.target;
  });
  if (links.length > linkListLimit) linkList.push("... +" + String(links.length - linkListLimit));

  var line1 = "<div class='title'><h2>" + escapeHtml(label) + "</h2></div><div class='notetype'>" + (noteType ? noteType : "") + "</div>";
  var line2 = "<div class='title'><h3>Families: </h3></div><div class='active-family'>" + (families.length ? families.join("</div><div class='active-family'> ") : "none") + "</div>";
  if (activePanel && activePanel.__ajpcHideTimer) {
    window.clearTimeout(activePanel.__ajpcHideTimer);
    activePanel.__ajpcHideTimer = null;
  }
  DOM.statusActiveDetails.innerHTML = line1 + line2 ;
  renderActiveDepTree(node);
  if (activePanel) {
    activePanel.classList.add("is-open");
    activePanel.setAttribute("aria-hidden", "false");
  }
}

function updateStatus(extraText) {
  var counts = getVisibleGraphCounts();
  var summary = "Nodes: " + counts.nodes + " | Edges: " + counts.edges;
  if (DOM.statusExtraText) DOM.statusExtraText.textContent = extraText ? String(extraText) : "";

  if (DOM.statusSummary) DOM.statusSummary.textContent = summary;
  renderActiveDetails();

  if (STATE.graph && DOM.statusZoom) {
    var zoom = STATE.graph.getZoomLevel();
    DOM.statusZoom.textContent = "Zoom: " + Number(zoom || 1).toFixed(2) + "x";
  }
}

function stopPerfMonitor() {
  if (STATE.perfRaf) {
    window.cancelAnimationFrame(STATE.perfRaf);
    STATE.perfRaf = null;
  }
}

function syncDebugPanelVisibility() {
  if (!DOM.statusDebugPanel) return;
  var enabled = !!STATE.debugEnabled;
  DOM.statusDebugPanel.style.display = enabled ? "flex" : "none";
  DOM.statusDebugPanel.setAttribute("aria-hidden", enabled ? "false" : "true");
}

function updateCoordsStatus() {
  if (!DOM.statusCoords && !DOM.debugCoords) return;
  syncDebugPanelVisibility();
  function fnum(v, digits) {
    return isFiniteNumber(v) ? Number(v).toFixed(digits) : "--";
  }
  function setOff() {
    if (DOM.statusCoords) DOM.statusCoords.textContent = "Coords: --, --";
    if (DOM.debugCoords) {
      if (!!STATE.debugEnabled) {
        var hd0 = STATE.hoverDebug || {};
        var hReason0 = String(hd0.reason || "--");
        var hIdx0 = (hd0.idx === null || hd0.idx === undefined || !isFiniteNumber(hd0.idx)) ? "--" : String(Math.round(Number(hd0.idx)));
        var dep0 = depTreeDebugStats(Date.now());
        setDebugCoordValues({
          use: "--",
          vpX: "--",
          vpY: "--",
          clX: "--",
          clY: "--",
          camX: "--",
          camY: "--",
          camR: "--"
        });
        setDebugExtraValues({
          hoverReason: hReason0,
          hoverIdx: hIdx0,
          hoverNode: "--",
          hoverType: "--",
          hoverHit: "--",
          hoverDist: "--",
          hoverDx: "--",
          hoverDy: "--",
          depTreeRps: dep0.depTreeRps,
          depTreeSkipCount: dep0.depTreeSkipCount
        });
      } else {
        clearDebugValueTables();
      }
    }
  }
  if (!STATE.graph || !DOM.graph) {
    setOff();
    return;
  }
  if (!STATE.pointerInsideGraph || !isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) {
    setOff();
    return;
  }

  var rect = DOM.graph.getBoundingClientRect();
  if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) {
    setOff();
    return;
  }

  var vx = Number(STATE.pointerClientX) - Number(rect.left);
  var vy = Number(STATE.pointerClientY) - Number(rect.top);
  if (!isFiniteNumber(vx) || !isFiniteNumber(vy) || vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) {
    setOff();
    return;
  }

  if (typeof STATE.graph.screenToSpacePosition !== "function") {
    setOff();
    return;
  }

  function spaceScore(space) {
    if (!Array.isArray(space) || space.length < 2 || !isFiniteNumber(space[0]) || !isFiniteNumber(space[1])) return Number.POSITIVE_INFINITY;
    var x = Number(space[0]);
    var y = Number(space[1]);
    var sMin = 0;
    var sMax = (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE)) ? Number(SPACE_SIZE) : 4096;
    var ox = 0;
    var oy = 0;
    if (x < sMin) ox = sMin - x;
    else if (x > sMax) ox = x - sMax;
    if (y < sMin) oy = sMin - y;
    else if (y > sMax) oy = y - sMax;
    return (ox * ox) + (oy * oy);
  }

  var spaceViewport = STATE.graph.screenToSpacePosition([vx, vy]);
  var spaceClient = STATE.graph.screenToSpacePosition([Number(STATE.pointerClientX), Number(STATE.pointerClientY)]);
  var scoreViewport = spaceScore(spaceViewport);
  var scoreClient = spaceScore(spaceClient);
  var space = scoreViewport <= scoreClient ? spaceViewport : spaceClient;
  if (!Array.isArray(space) || space.length < 2 || !isFiniteNumber(space[0]) || !isFiniteNumber(space[1])) {
    setOff();
    return;
  }
  var sBase = (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE) && SPACE_SIZE > 0) ? Number(SPACE_SIZE) : 4096;
  var nx = (Number(space[0]) / sBase) * 100;
  var ny = (Number(space[1]) / sBase) * 100;
  var out = "Coords: " + nx.toFixed(1) + ", " + ny.toFixed(1);

  if (DOM.statusCoords) DOM.statusCoords.textContent = out;
  if (!!STATE.debugEnabled) {
    var vpX = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[0])) ? Number(spaceViewport[0]).toFixed(1) : "--";
    var vpY = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[1])) ? Number(spaceViewport[1]).toFixed(1) : "--";
    var clX = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[0])) ? Number(spaceClient[0]).toFixed(1) : "--";
    var clY = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[1])) ? Number(spaceClient[1]).toFixed(1) : "--";
    var useTag = scoreViewport <= scoreClient ? "vp" : "cl";
    var camX = "--";
    var camY = "--";
    var camR = "--";
    if (STATE.graph && typeof STATE.graph.getCameraState === "function") {
      var cam = STATE.graph.getCameraState();
      if (cam && isFiniteNumber(cam.x) && isFiniteNumber(cam.y) && isFiniteNumber(cam.ratio)) {
        camX = Number(cam.x).toFixed(3);
        camY = Number(cam.y).toFixed(3);
        camR = Number(cam.ratio).toFixed(4);
      }
    }
    var hd = STATE.hoverDebug || {};
    var hReason = String(hd.reason || "--");
    var hIdx = (hd.idx === null || hd.idx === undefined || !isFiniteNumber(hd.idx)) ? "--" : String(Math.round(Number(hd.idx)));
    var hNode = String(hd.nodeId || "--");
    var hType = String(hd.noteType || "--");
    var hHit = fnum(hd.hitRadius, 2);
    var hDist = fnum(hd.dist, 2);
    var hDx = fnum(hd.dx, 1);
    var hDy = fnum(hd.dy, 1);
    var dep = depTreeDebugStats(Date.now());
    setDebugCoordValues({
      use: useTag,
      vpX: vpX,
      vpY: vpY,
      clX: clX,
      clY: clY,
      camX: camX,
      camY: camY,
      camR: camR
    });
    setDebugExtraValues({
      hoverReason: hReason,
      hoverIdx: hIdx,
      hoverNode: hNode,
      hoverType: hType,
      hoverHit: hHit,
      hoverDist: hDist,
      hoverDx: hDx,
      hoverDy: hDy,
      depTreeRps: dep.depTreeRps,
      depTreeSkipCount: dep.depTreeSkipCount
    });
  } else if (DOM.debugCoords) {
    clearDebugValueTables();
  }
}

function startPerfMonitor() {
  if ((!DOM.statusFps && !DOM.statusCoords && !DOM.debugCoords) || STATE.perfRaf) return;
  if (DOM.statusFps) DOM.statusFps.textContent = "FPS: --";
  if (DOM.statusCoords) DOM.statusCoords.textContent = "Coords: --, --";
  if (DOM.debugCoords) clearDebugValueTables();
  STATE.perfWindowStart = 0;
  STATE.perfFrameCount = 0;

  function tick(ts) {
    if (!STATE.perfWindowStart) STATE.perfWindowStart = ts;
    STATE.perfFrameCount += 1;

    var elapsed = ts - STATE.perfWindowStart;
    if (elapsed >= 500) {
      var fps = (STATE.perfFrameCount * 1000) / elapsed;
      STATE.perfFps = fps;
      if (DOM.statusFps) DOM.statusFps.textContent = "FPS: " + fps.toFixed(1);
      STATE.perfFrameCount = 0;
      STATE.perfWindowStart = ts;
    }
    updateCoordsStatus();

    STATE.perfRaf = window.requestAnimationFrame(tick);
  }

  STATE.perfRaf = window.requestAnimationFrame(tick);
}

function appendSearchValue(parts, value, seen, budget) {
  if (budget.left <= 0) return;
  if (value === undefined || value === null) return;
  var t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    var txt = String(value).trim();
    if (!txt) return;
    if (txt.length > budget.left) txt = txt.slice(0, budget.left);
    parts.push(txt);
    budget.left -= txt.length;
    return;
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      appendSearchValue(parts, value[i], seen, budget);
      if (budget.left <= 0) return;
    }
    return;
  }
  if (t !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  var keys = Object.keys(value);
  for (var k = 0; k < keys.length; k += 1) {
    var key = String(keys[k] || "").trim();
    if (key) {
      if (key.length > budget.left) key = key.slice(0, budget.left);
      parts.push(key);
      budget.left -= key.length;
      if (budget.left <= 0) return;
    }
    appendSearchValue(parts, value[keys[k]], seen, budget);
    if (budget.left <= 0) return;
  }
}

function buildNodeSearchText(node) {
  var parts = [];
  var budget = { left: 6000 };
  appendSearchValue(parts, node, new WeakSet(), budget);
  return parts.join(" ").toLowerCase();
}

function buildNodeSuggestionMeta(node) {
  var parts = [];
  var nt = String((node && (node.note_type || node.kind)) || "").trim();
  if (nt) parts.push(nt);

  var extras = (node && Array.isArray(node.extra)) ? node.extra : [];
  for (var i = 0; i < extras.length; i += 1) {
    var entry = extras[i] && typeof extras[i] === "object" ? extras[i] : null;
    if (!entry) continue;
    var name = String(entry.name === undefined || entry.name === null ? "" : entry.name).trim();
    var value = String(entry.value === undefined || entry.value === null ? "" : entry.value).trim();
    if (!name && !value) continue;
    if (name && value) parts.push(name + ": " + value);
    else parts.push(name || value);
    if (parts.length >= 6) break;
  }

  var out = parts.join(" | ");
  if (out.length > 220) out = out.slice(0, 217) + "...";
  return out;
}

function buildSearchEntries() {
  var mask = STATE.runtimeNodeVisibleMask;
  var useMask = !!(mask && mask.length === STATE.activeNodes.length);
  var entries = STATE.activeNodes.filter(function (_node, idx) {
    if (!useMask) return true;
    return !!mask[idx];
  }).map(function (node) {
    var text = buildNodeSearchText(node);
    return {
      id: node.id,
      label: node.label || node.id,
      noteType: node.note_type || node.kind || "",
      metaLine: buildNodeSuggestionMeta(node),
      text: text
    };
  });
  STATE.allSearchEntries = entries;
}

function applySuggestionSelection(idx) {
  var clamped = clamp(idx, -1, STATE.suggestedIds.length - 1);
  STATE.selectedSuggestIdx = clamped;

  var nodes = DOM.searchSuggest ? DOM.searchSuggest.querySelectorAll(".suggest-item") : [];
  var i;
  for (i = 0; i < nodes.length; i += 1) {
    nodes[i].classList.toggle("active", i === clamped);
  }
}

function hideSuggest() {
  if (!DOM.searchSuggest) return;
  DOM.searchSuggest.style.display = "none";
  DOM.searchSuggest.innerHTML = "";
  STATE.suggestedIds = [];
  STATE.selectedSuggestIdx = -1;
}

function renderSuggestions(query) {
  if (!DOM.searchSuggest) return;
  var q = String(query || "").trim().toLowerCase();
  if (!q) {
    hideSuggest();
    return;
  }

  var matches = STATE.allSearchEntries.filter(function (entry) {
    return entry.text.indexOf(q) >= 0;
  }).slice(0, 10);

  STATE.suggestedIds = matches.map(function (x) { return x.id; });
  STATE.selectedSuggestIdx = -1;

  if (matches.length === 0) {
    DOM.searchSuggest.style.display = "none";
    DOM.searchSuggest.innerHTML = "";
    return;
  }

  DOM.searchSuggest.innerHTML = matches.map(function (entry, idx) {
    return ""
      + '<div class="suggest-item" data-idx="' + idx + '" data-id="' + escapeHtml(entry.id) + '">'
      + escapeHtml(entry.label)
      + '<span class="suggest-meta">' + escapeHtml(entry.metaLine || entry.noteType || "") + "</span>"
      + "</div>";
  }).join("");

  DOM.searchSuggest.style.display = "block";

  var items = DOM.searchSuggest.querySelectorAll(".suggest-item");
  items.forEach(function (item) {
    item.addEventListener("mousedown", function (evt) {
      evt.preventDefault();
    });
    item.addEventListener("click", function () {
      var id = item.getAttribute("data-id") || "";
      focusNodeById(id, true);
    });
  });
}

function getNodeFamilyMapForCtx(node) {
  if (!node) return null;
  return (node.family_prios && typeof node.family_prios === "object") ? node.family_prios : null;
}

function getNodeFamiliesForCtx(node) {
  if (!node) return [];
  if (Array.isArray(node.families) && node.families.length) return node.families.slice(0);
  var map = getNodeFamilyMapForCtx(node);
  return map ? Object.keys(map) : [];
}

function hasPositiveFamilyPrioForCtx(node) {
  var map = getNodeFamilyMapForCtx(node);
  if (!map) return false;
  return Object.keys(map).some(function (k) {
    var v = map[k];
    return typeof v === "number" && isFinite(v) && v > 0;
  });
}

function edgeIdsForCtx(edge) {
  var s = edge && edge.source && typeof edge.source === "object" ? edge.source.id : (edge ? edge.source : "");
  var t = edge && edge.target && typeof edge.target === "object" ? edge.target.id : (edge ? edge.target : "");
  return { s: String(s), t: String(t) };
}

function contextNodeColor(node) {
  if (!node) return "";
  if (String(node.kind || "") === "family") return fallbackLayerColor("families");
  var ntid = String(node.note_type_id || "");
  if (ntid && STATE.noteTypes && STATE.noteTypes[ntid] && STATE.noteTypes[ntid].color) {
    return normalizeHexColor(STATE.noteTypes[ntid].color, fallbackLayerColor("notes"));
  }
  return fallbackLayerColor("notes");
}

function isNodePinnedForCtx(node) {
  if (!node) return false;
  return node.fx != null || node.fy != null;
}

function buildNoteTypeLinkedFieldMapForCtx() {
  var out = {};
  var src = STATE.noteTypes && typeof STATE.noteTypes === "object" ? STATE.noteTypes : {};
  Object.keys(src).forEach(function (id) {
    out[String(id)] = String(src[id] && src[id].linkedField || "");
  });
  return out;
}

function showCtxMessage(text) {
  updateStatus(String(text || ""));
}

function showFamilyPickerForCtx(title, families, onApply) {
  if (!families || !families.length) return;
  var overlay = byId("ctx-picker");
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);

  overlay = document.createElement("div");
  overlay.id = "ctx-picker";
  var dialog = document.createElement("div");
  dialog.className = "dialog";
  var heading = document.createElement("div");
  heading.className = "title";
  heading.textContent = String(title || "Select families");
  var list = document.createElement("div");
  list.className = "list";

  families.forEach(function (fid) {
    var row = document.createElement("label");
    row.className = "row";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(fid);
    var span = document.createElement("span");
    span.textContent = String(fid);
    row.appendChild(cb);
    row.appendChild(span);
    list.appendChild(row);
  });

  var btnRow = document.createElement("div");
  btnRow.className = "btn-row";
  var cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  var okBtn = document.createElement("button");
  okBtn.className = "btn primary";
  okBtn.type = "button";
  okBtn.textContent = "Apply";
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);

  dialog.appendChild(heading);
  dialog.appendChild(list);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  cancelBtn.addEventListener("click", function () {
    close();
  });

  okBtn.addEventListener("click", function () {
    var selected = [];
    list.querySelectorAll("input[type=checkbox]:checked").forEach(function (el) {
      selected.push(String(el.value || ""));
    });
    close();
    if (typeof onApply === "function") onApply(selected);
  });

  overlay.addEventListener("click", function (evt) {
    if (evt.target === overlay) close();
  });
}

function manualLinkInfoForCtx(aId, bId) {
  var info = { ab: false, ba: false };
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  edges.forEach(function (edge) {
    if (!edge) return;
    var layer = String(edge.layer || "");
    if (layer !== "note_links" && layer !== "reference") return;
    var meta = edge.meta && typeof edge.meta === "object" ? edge.meta : {};
    if (!meta.manual) return;
    var ids = edgeIdsForCtx(edge);
    if (ids.s === aId && ids.t === bId) info.ab = true;
    if (ids.s === bId && ids.t === aId) info.ba = true;
    if (meta.bidirectional && ((ids.s === aId && ids.t === bId) || (ids.s === bId && ids.t === aId))) {
      info.ab = true;
      info.ba = true;
    }
  });
  return info;
}

function buildContextMenuGroupsForCtx(ctx) {
  ctx = ctx || {};
  var node = ctx.node;
  if (!node) return [];
  var selectedNode = ctx.selectedNode || null;
  var selectedKind = ctx.selectedKind || (selectedNode ? (selectedNode.kind || "") : "");
  var menuSelectedId = ctx.menuSelectedId || (selectedNode ? String(selectedNode.id) : "");
  var noteTypeLinkedField = ctx.noteTypeLinkedField || {};
  var showToast = ctx.showToast || function () {};
  var pycmd = ctx.pycmd || null;
  var showFamilyPicker = ctx.showFamilyPicker || null;
  function openEditorViaApi(nodeId) {
    if (!pycmd) return;
    pycmd("ctx:editapi:" + String(nodeId));
  }

  function getPrimaryFamily(n) {
    if (!n) return "";
    if (n.kind === "family") return n.label || String(n.id || "").replace("family:", "");
    var fams = getNodeFamiliesForCtx(n);
    return fams.length ? String(fams[0]) : "";
  }

  function getSharedFamilies(a, b) {
    if (!a || !b) return [];
    var famA = getNodeFamiliesForCtx(a);
    var famB = getNodeFamiliesForCtx(b);
    if (!famA.length || !famB.length) return [];
    var set = Object.create(null);
    famA.forEach(function (f) { set[String(f)] = true; });
    var out = [];
    famB.forEach(function (f) { if (set[String(f)]) out.push(String(f)); });
    return out;
  }

  var groups = [];
  var openGroup = [];
  var isNodeNoteTypeHub = node && node.kind === "note_type_hub";
  if (node.kind === "note") {
    openGroup.push({
      label: "Open Preview",
      cb: function () { showToast("Open preview"); if (pycmd) pycmd("ctx:preview:" + node.id); }
    });
    openGroup.push({
      label: "Open Editor",
      cb: function () { showToast("Open editor"); openEditorViaApi(node.id); }
    });
    openGroup.push({
      label: "Open Browser",
      cb: function () { showToast("Open browser"); if (pycmd) pycmd("ctx:browser:" + node.id); }
    });
  } else if (isNodeNoteTypeHub) {
    openGroup.push({
      label: "Open Browser by Mass Linker Tag",
      cb: function () {
        var tag = "";
        var rawId = String(node.id || "");
        if (rawId.indexOf("autolink:") === 0) tag = rawId.slice("autolink:".length);
        tag = String(tag || "").trim();
        if (!tag) { showToast("Missing Mass Linker tag"); return; }
        showToast("Open browser");
        if (pycmd) pycmd("ctx:browsertag:" + encodeURIComponent(tag));
      }
    });
  }
  groups.push(openGroup);

  var isSelectedNote = selectedNode && selectedKind === "note";
  var isSelectedFamily = selectedNode && selectedKind === "family";
  var isNodeNote = node && node.kind === "note";
  var isNodeFamily = node && node.kind === "family";
  var isDifferent = selectedNode && String(node.id) !== String(menuSelectedId);
  var isSame = selectedNode && String(node.id) === String(menuSelectedId);

  var connectGroup = [];
  if (selectedNode && isDifferent && isNodeNote) {
    var canConnect = selectedKind === "family" || (selectedKind === "note" && getNodeFamiliesForCtx(selectedNode).length);
    if (selectedKind === "kanji" || selectedKind === "kanji_hub") canConnect = false;
    if (canConnect) {
      function doConnectWithMode(title, mode) {
        return function () {
          function doConnect(families) {
            if (Array.isArray(families) && families.length === 0) { showToast("Select at least one family"); return; }
            showToast("Connect family");
            var payload = {
              source: String(menuSelectedId),
              target: String(node.id),
              source_kind: selectedKind,
              source_label: selectedNode.label || "",
              prio_mode: mode || ""
            };
            if (families) payload.families = families;
            if (pycmd) pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
          }
          var selectedFamilies = getNodeFamiliesForCtx(selectedNode);
          if (selectedKind === "note" && selectedFamilies.length > 1) {
            if (showFamilyPicker) showFamilyPicker(title, selectedFamilies, doConnect);
            else doConnect(selectedFamilies || []);
          } else if (selectedKind === "family") {
            var fid = selectedNode.label || String(selectedNode.id).replace("family:", "");
            doConnect([fid]);
          } else if (selectedKind === "note") {
            doConnect(selectedFamilies || []);
          } else {
            doConnect([]);
          }
        };
      }
      if (selectedKind === "family") {
        connectGroup.push({ label: "Connect selected to Family", cb: doConnectWithMode("Select hub families", "hub_zero") });
      } else if (selectedKind === "note") {
        connectGroup.push({ label: "Connect selected: to active Family@+1", cb: doConnectWithMode("Select families to connect", "") });
        connectGroup.push({ label: "Connect selected to: active Family", cb: doConnectWithMode("Select families to connect", "same") });
        if (hasPositiveFamilyPrioForCtx(selectedNode)) {
          connectGroup.push({ label: "Connect selected: to active Family@-1", cb: doConnectWithMode("Select families to connect", "minus1") });
        }
        connectGroup.push({
          label: "Connect active to: selected Family",
          cb: function () {
            var families = getNodeFamiliesForCtx(node);
            if (!families.length) { showToast("No family on selected"); return; }
            function doConnectFromSelected(fams) {
              if (Array.isArray(fams) && fams.length === 0) { showToast("Select at least one family"); return; }
              showToast("Connect family");
              var payload = {
                source: String(node.id),
                target: String(menuSelectedId),
                source_kind: "note",
                source_label: node.label || "",
                prio_mode: "hub_zero"
              };
              if (Array.isArray(fams)) payload.families = fams;
              if (pycmd) pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
            }
            if (families.length > 1 && showFamilyPicker) showFamilyPicker("Select families to connect", families, doConnectFromSelected);
            else doConnectFromSelected(families);
          }
        });
      }
    }
  }
  groups.push(connectGroup);

  var linkInfo = { ab: false, ba: false };
  if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
    linkInfo = manualLinkInfoForCtx(String(menuSelectedId), String(node.id));
  }

  var disconnectGroup = [];
  if (
    selectedNode &&
    (isDifferent || isSame) &&
    (isSelectedNote || isSelectedFamily) &&
    (isNodeNote || isNodeFamily) &&
    !(isSelectedFamily && isNodeFamily)
  ) {
    var activeFamily = getPrimaryFamily(selectedNode);
    var sharedFamilies = [];
    if (isSelectedFamily) {
      sharedFamilies = activeFamily ? [activeFamily] : [];
    } else if (isNodeFamily) {
      var hubFid = node.label || String(node.id).replace("family:", "");
      var activeFamilies2 = getNodeFamiliesForCtx(selectedNode).map(function (f) { return String(f); });
      if (hubFid && activeFamilies2.indexOf(String(hubFid)) >= 0) sharedFamilies = [hubFid];
    } else {
      sharedFamilies = isSame ? getNodeFamiliesForCtx(node).slice(0) : getSharedFamilies(selectedNode, node);
    }
    if (sharedFamilies.length) {
      disconnectGroup.push({
        label: isSame
          ? "Disconnect from Family"
          : (isNodeFamily && isSelectedNote)
            ? "Disconnect from Family"
            : isSelectedFamily
              ? "Disconnect selected from Family"
              : "Disconnect selected: from active Family",
        cb: function () {
          function doDisconnect(families) {
            showToast("Disconnect family");
            var payload = {
              source: String(menuSelectedId),
              target: String(node.id),
              source_kind: selectedKind,
              source_label: selectedNode.label || ""
            };
            if (isNodeFamily && isSelectedNote) {
              var hubFid3 = node.label || String(node.id).replace("family:", "");
              payload.source = String(node.id);
              payload.target = String(menuSelectedId);
              payload.source_kind = "family";
              payload.source_label = hubFid3;
            }
            if (families && families.length) payload.families = families;
            if (pycmd) pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
          }
          if (sharedFamilies.length > 1 && isSelectedNote) {
            if (showFamilyPicker) showFamilyPicker("Select families to disconnect", sharedFamilies, doDisconnect);
            else doDisconnect(sharedFamilies);
          } else {
            doDisconnect(sharedFamilies);
          }
        }
      });
    }
  }

  var appendItems = [];
  if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
    var targetNt = node.note_type_id ? String(node.note_type_id) : "";
    var targetLinked = targetNt ? noteTypeLinkedField[targetNt] : "";
    var activeNt = selectedNode.note_type_id ? String(selectedNode.note_type_id) : "";
    var activeLinked = activeNt ? noteTypeLinkedField[activeNt] : "";
    if (targetLinked && !linkInfo.ba) {
      appendItems.push({
        label: "Append Link on selected: to active",
        cb: function () {
          showToast("Append link");
          var payload = { source: String(menuSelectedId), target: String(node.id), label: selectedNode.label || "" };
          if (pycmd) pycmd("ctx:link:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (activeLinked && !linkInfo.ab) {
      appendItems.push({
        label: "Append Link on active: to selected",
        cb: function () {
          showToast("Append link");
          var payload = { source: String(node.id), target: String(menuSelectedId), label: node.label || "" };
          if (pycmd) pycmd("ctx:link_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (targetLinked && activeLinked && !linkInfo.ab && !linkInfo.ba) {
      appendItems.push({
        label: "Append Link on both: to each other",
        cb: function () {
          showToast("Append links");
          var payload = {
            source: String(menuSelectedId),
            target: String(node.id),
            source_label: selectedNode.label || "",
            target_label: node.label || ""
          };
          if (pycmd) pycmd("ctx:link_both:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
  }

  var removeGroup = [];
  if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
    var nodeNt = node.note_type_id ? String(node.note_type_id) : "";
    var nodeLinked = nodeNt ? noteTypeLinkedField[nodeNt] : "";
    var selNt = selectedNode.note_type_id ? String(selectedNode.note_type_id) : "";
    var selLinked = selNt ? noteTypeLinkedField[selNt] : "";
    if (linkInfo.ba && nodeLinked) {
      removeGroup.push({
        label: "Remove Link on selected: to active",
        cb: function () {
          showToast("Remove link");
          var payload = { source: String(menuSelectedId), target: String(node.id) };
          if (pycmd) pycmd("ctx:unlink:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && selLinked) {
      removeGroup.push({
        label: "Remove Link on active: to selected",
        cb: function () {
          showToast("Remove link");
          var payload = { source: String(node.id), target: String(menuSelectedId) };
          if (pycmd) pycmd("ctx:unlink_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && linkInfo.ba && nodeLinked && selLinked) {
      removeGroup.push({
        label: "Remove Link on both: to each other",
        cb: function () {
          showToast("Remove links");
          var payload = { source: String(menuSelectedId), target: String(node.id) };
          if (pycmd) pycmd("ctx:unlink_both:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
  }

  var filterGroup = [];
  var families = [];
  if (isNodeFamily) families = [node.label || String(node.id).replace("family:", "")];
  else families = getNodeFamiliesForCtx(node).slice(0, 20);
  families.forEach(function (fid) {
    filterGroup.push({
      label: "Filter Family: " + fid,
      cb: function () {
        showToast("Filter family");
        if (pycmd) pycmd("ctx:filter:" + encodeURIComponent(fid));
      }
    });
  });

  groups.push(disconnectGroup);
  groups.push(appendItems);
  groups.push(removeGroup);
  groups.push(filterGroup);

  return groups;
}

function hideContextMenu() {
  if (!DOM.ctxMenu) return;
  DOM.ctxMenu.style.display = "none";
}

function showContextMenu(node, evt) {
  var menu = DOM.ctxMenu;
  if (!menu || !node) return;

  var menuSelectedId = STATE.selectedNodeId ? String(STATE.selectedNodeId) : "";
  var selectedNode = null;
  if (menuSelectedId && STATE.activeIndexById && STATE.activeIndexById.has(menuSelectedId)) {
    var si = Number(STATE.activeIndexById.get(menuSelectedId));
    if (isFinite(si) && si >= 0 && si < STATE.activeNodes.length) selectedNode = STATE.activeNodes[si];
  }
  if (!selectedNode && node.kind === "note") {
    selectedNode = node;
    menuSelectedId = String(node.id || "");
  }
  var selectedKind = selectedNode ? String(selectedNode.kind || "") : "";
  var activeColor = contextNodeColor(node);
  var noteTypeLinkedField = buildNoteTypeLinkedFieldMapForCtx();

  var groups = buildContextMenuGroupsForCtx({
    node: node,
    selectedNode: selectedNode,
    selectedKind: selectedKind,
    menuSelectedId: menuSelectedId,
    noteTypeLinkedField: noteTypeLinkedField,
    showToast: showCtxMessage,
    pycmd: window.pycmd,
    showFamilyPicker: showFamilyPickerForCtx
  });

  function addItem(label, cb) {
    var div = document.createElement("div");
    div.className = "item";
    var tokens = String(label || "").split(/(selected|active)/g);
    tokens.forEach(function (tok) {
      if (!tok) return;
      if (tok === "selected") {
        div.appendChild(document.createTextNode("selected"));
        var dot = document.createElement("span");
        dot.className = "ctx-selected-dot";
        div.appendChild(dot);
        return;
      }
      if (tok === "active") {
        div.appendChild(document.createTextNode("active"));
        var ad = document.createElement("span");
        ad.className = "ctx-active-dot";
        if (activeColor) ad.style.background = activeColor;
        div.appendChild(ad);
        return;
      }
      div.appendChild(document.createTextNode(tok));
    });
    div.addEventListener("click", function () {
      try {
        cb();
      } finally {
        hideContextMenu();
      }
    });
    menu.appendChild(div);
  }

  function addDivider() {
    if (!menu.lastElementChild) return;
    if (menu.lastElementChild.className === "divider") return;
    var div = document.createElement("div");
    div.className = "divider";
    menu.appendChild(div);
  }

  function appendGroup(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (menu.childElementCount) addDivider();
    items.forEach(function (entry) {
      if (!entry || typeof entry.cb !== "function") return;
      addItem(entry.label, entry.cb);
    });
  }

  menu.innerHTML = "";
  groups.forEach(appendGroup);
  if (isNodePinnedForCtx(node)) {
    if (menu.childElementCount) {
      var d = document.createElement("div");
      d.className = "divider";
      menu.appendChild(d);
    }
    addItem("Unpin Node", function () {
      node.fx = null;
      node.fy = null;
      if (STATE.graph && typeof STATE.graph.start === "function") STATE.graph.start();
      showCtxMessage("Node unpinned");
    });
  }

  var e = evt || window.event;
  var x = e && isFiniteNumber(Number(e.clientX)) ? Number(e.clientX) : 0;
  var y = e && isFiniteNumber(Number(e.clientY)) ? Number(e.clientY) : 0;
  menu.style.display = "block";
  var vw = window.innerWidth || 1;
  var vh = window.innerHeight || 1;
  var mw = menu.offsetWidth || 220;
  var mh = menu.offsetHeight || 120;
  menu.style.left = Math.max(8, Math.min(vw - mw - 8, x)) + "px";
  menu.style.top = Math.max(8, Math.min(vh - mh - 8, y)) + "px";
}

window.hideContextMenu = hideContextMenu;
function renderLayerControls() {
  if (!DOM.layerPills || !DOM.layerList) return;
  DOM.layerPills.innerHTML = "";
  DOM.layerList.innerHTML = "";

  Object.keys(STATE.layers).sort().forEach(function (layer) {
    var color = normalizeHexColor(STATE.layerColors[layer] || fallbackLayerColor(layer), fallbackLayerColor(layer));
    var enabled = !!STATE.layers[layer];
    var stat = STATE.layerStats[layer] || { nodes: 0, edges: 0 };

    var hint = layerToggleHint(layer);
    var pill = document.createElement("label");
    pill.className = "layer-pill";
    pill.innerHTML = ""
      + '<input type="checkbox" ' + (enabled ? "checked" : "") + ' data-layer="' + escapeHtml(layer) + '"' + titleAttr(hint) + ">"
      + '<span class="swatch" style="background:' + escapeHtml(color) + ';"></span>'
      + "<span" + titleAttr(hint) + ">" + escapeHtml(humanizeLayer(layer)) + "</span>";
    pill.title = hint;

    var row = document.createElement("label");
    row.className = "line-item";
    row.innerHTML = ""
      + '<input type="checkbox" ' + (enabled ? "checked" : "") + ' data-layer="' + escapeHtml(layer) + '"' + titleAttr(hint) + ">"
      + '<span class="swatch" style="background:' + escapeHtml(color) + ';"></span>'
      + "<span" + titleAttr(hint) + ">" + escapeHtml(humanizeLayer(layer)) + " (" + stat.nodes + "n / " + stat.edges + "e)</span>";
    row.title = hint;

    function bindToggle(el) {
      var input = el.querySelector("input[data-layer]");
      input.addEventListener("change", function () {
        var key = String(input.getAttribute("data-layer") || "");
        STATE.layers[key] = !!input.checked;
        renderLayerControls();
        applyUiSettingsNoRebuild(true);
        persistHook("lenabled:" + key + ":" + (input.checked ? "1" : "0"));
      });
    }

    bindToggle(pill);
    bindToggle(row);

    DOM.layerPills.appendChild(pill);
    DOM.layerList.appendChild(row);
  });
}

function mkOption(value, label, selected) {
  return '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
}

function renderNoteTypeControls() {
  if (!DOM.noteTypeList) return;
  DOM.noteTypeList.innerHTML = "";

  var ids = Object.keys(STATE.noteTypes);
  ids.sort(function (a, b) {
    var an = STATE.noteTypes[a].name.toLowerCase();
    var bn = STATE.noteTypes[b].name.toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  ids.forEach(function (id) {
    var nt = STATE.noteTypes[id];
    var card = document.createElement("div");
    card.className = "note-type-card";

    var options = [mkOption("", "(none)", !nt.labelField)];
    nt.fields.forEach(function (field) {
      options.push(mkOption(field, field, nt.labelField === field));
    });
    var labelOptions = options.join("");

    options = [mkOption("", "(none)", !nt.linkedField)];
    nt.fields.forEach(function (field) {
      options.push(mkOption(field, field, nt.linkedField === field));
    });
    var linkedOptions = options.join("");

    var tooltipOptions = nt.fields.map(function (field) {
      var selected = Array.isArray(nt.tooltipFields) && nt.tooltipFields.indexOf(field) >= 0;
      return mkOption(field, field, selected);
    }).join("");

    card.innerHTML = ""
      + '<div class="note-type-head">'
      + '<div class="note-type-name">' + escapeHtml(nt.name) + "</div>"
      + '<label class="line-item"' + titleAttr(noteTypeSettingHint("visible")) + '><input type="checkbox" class="nt-visible" data-ntid="' + escapeHtml(id) + '" ' + (nt.visible ? "checked" : "") + titleAttr(noteTypeSettingHint("visible")) + '><span' + titleAttr(noteTypeSettingHint("visible")) + '>Visible</span></label>'
      + "</div>"
      + '<div class="field-grid">'
      + '<label' + titleAttr(noteTypeSettingHint("color")) + '>Node Color<input type="color" class="nt-color" data-ntid="' + escapeHtml(id) + '" value="' + escapeHtml(normalizeHexColor(nt.color, "#93c5fd")) + '"' + titleAttr(noteTypeSettingHint("color")) + "></label>"
      + '<label' + titleAttr(noteTypeSettingHint("label")) + '>Label Field<select class="nt-label" data-ntid="' + escapeHtml(id) + '"' + titleAttr(noteTypeSettingHint("label")) + ">" + labelOptions + "</select></label>"
      + '<label' + titleAttr(noteTypeSettingHint("linked")) + '>Linked Field<select class="nt-linked" data-ntid="' + escapeHtml(id) + '"' + titleAttr(noteTypeSettingHint("linked")) + ">" + linkedOptions + "</select></label>"
      + '<label' + titleAttr(noteTypeSettingHint("tooltip")) + '>Tooltip Fields<select class="nt-tooltip" data-ntid="' + escapeHtml(id) + '" multiple' + titleAttr(noteTypeSettingHint("tooltip")) + ">" + tooltipOptions + "</select></label>"
      + "</div>";

    DOM.noteTypeList.appendChild(card);
  });

  DOM.noteTypeList.querySelectorAll(".nt-visible").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      STATE.noteTypes[id].visible = !!el.checked;
      applyUiSettingsNoRebuild(false);
      persistHook("ntvis:" + id + ":" + (el.checked ? "1" : "0"));
    });
  });

  DOM.noteTypeList.querySelectorAll(".nt-color").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      var color = normalizeHexColor(el.value, "#93c5fd");
      STATE.noteTypes[id].color = color;
      applyUiSettingsNoRebuild(false);
      persistHook("color:" + id + ":" + encodeURIComponent(color));
    });
  });

  DOM.noteTypeList.querySelectorAll(".nt-label").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      STATE.noteTypes[id].labelField = String(el.value || "");
      persistHook("label:" + id + ":" + encodeURIComponent(STATE.noteTypes[id].labelField));
    });
  });

  DOM.noteTypeList.querySelectorAll(".nt-linked").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      STATE.noteTypes[id].linkedField = String(el.value || "");
      persistHook("lnfield:" + id + ":" + encodeURIComponent(STATE.noteTypes[id].linkedField));
    });
  });

  DOM.noteTypeList.querySelectorAll(".nt-tooltip").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      var selected = Array.prototype.slice.call(el.selectedOptions || []).map(function (opt) {
        return String(opt.value || "");
      }).filter(Boolean);
      STATE.noteTypes[id].tooltipFields = selected;
      persistHook("nttip:" + id + ":" + encodeURIComponent(JSON.stringify(selected)));
    });
  });
}

function renderLinkSettings() {
  if (!DOM.linkLayerList || !DOM.flowSpeedControl) return;
  DOM.linkLayerList.innerHTML = "";
  DOM.flowSpeedControl.innerHTML = "";
  var nscale = (typeof normalizeNeighborScaling === "function")
    ? normalizeNeighborScaling(STATE.neighborScaling || null)
    : { mode: "none", directed: "undirected", weights: {} };
  STATE.neighborScaling = nscale;

  var layers = Object.keys(STATE.layers).sort();
  layers.forEach(function (layer) {
    var rawColor = String(STATE.layerColors[layer] || fallbackLayerColor(layer) || "");
    var parsedColor = parseColor(rawColor, 0.58);
    var color = normalizeHexColor(rawColor, fallbackLayerColor(layer));
    var alpha = clamp(Number(parsedColor[3]), 0, 1);
    if (!isFiniteNumber(alpha)) alpha = 0.58;
    var style = String(STATE.layerStyles[layer] || "solid");
    var strength = Number(STATE.linkStrengths[layer] || 1);

    var row = document.createElement("div");
    row.className = "control-row";
    row.innerHTML = ""
      + "<div>"
      + "<strong>" + escapeHtml(humanizeLayer(layer)) + "</strong>"
      + '<div class="inline-pair">'
      + '<label' + titleAttr(linkSettingHint("color")) + '>Color<div class="ln-color-alpha"><input type="color" class="ln-color" data-layer="' + escapeHtml(layer) + '" value="' + escapeHtml(color) + '"' + titleAttr(linkSettingHint("color")) + '><input type="number" step="0.01" min="0" max="1" class="ln-alpha" data-layer="' + escapeHtml(layer) + '" value="' + alpha.toFixed(2) + '"' + titleAttr(linkSettingHint("color")) + "></div></label>"
      + '<label' + titleAttr(linkSettingHint("style")) + '>Style<select class="ln-style" data-layer="' + escapeHtml(layer) + '"' + titleAttr(linkSettingHint("style")) + ">"
      + mkOption("solid", "Solid", style === "solid")
      + mkOption("dashed", "Dashed", style === "dashed")
      + mkOption("dotted", "Dotted", style === "dotted")
      + "</select></label>"
      + '<label' + titleAttr(linkSettingHint("strength")) + '>Strength<input type="number" step="0.05" min="0.1" max="8" class="ln-strength" data-layer="' + escapeHtml(layer) + '" value="' + strength.toFixed(2) + '"' + titleAttr(linkSettingHint("strength")) + "></label>"
      + "</div>"
      + "</div>";
    DOM.linkLayerList.appendChild(row);
  });

  var flowRow = document.createElement("div");
  flowRow.className = "control-row";
  flowRow.innerHTML = ""
    + "<div" + titleAttr(linkSettingHint("flow_speed")) + ">Flow Speed</div>"
    + '<input id="ln-flow-speed" type="number" min="0" max="3" step="0.01" value="' + Number(STATE.layerFlowSpeed || 0.35).toFixed(2) + '"' + titleAttr(linkSettingHint("flow_speed")) + ">";
  DOM.flowSpeedControl.appendChild(flowRow);

  var metricRow = document.createElement("div");
  metricRow.className = "control-row";
  metricRow.innerHTML = ""
    + "<div>Link Metric</div>"
    + '<div class="inline-pair">'
    + '<label>Mode<select id="ln-metric-mode">'
    + mkOption("none", "None", String(nscale.mode || "none") === "none")
    + mkOption("jaccard", "Jaccard", String(nscale.mode || "none") === "jaccard")
    + mkOption("overlap", "Overlap", String(nscale.mode || "none") === "overlap")
    + mkOption("common_neighbors", "Common Neighbors", String(nscale.mode || "none") === "common_neighbors")
    + mkOption("ccm", "Clustering Coeff", String(nscale.mode || "none") === "ccm")
    + mkOption("twohop", "2-Hop", String(nscale.mode || "none") === "twohop")
    + "</select></label>"
    + '<label>Direction<select id="ln-metric-directed">'
    + mkOption("undirected", "Undirected", String(nscale.directed || "undirected") === "undirected")
    + mkOption("out", "Outgoing", String(nscale.directed || "undirected") === "out")
    + mkOption("in", "Incoming", String(nscale.directed || "undirected") === "in")
    + "</select></label>"
    + "</div>";
  DOM.flowSpeedControl.appendChild(metricRow);

  function layerRgbaFromInputs(layer, colorInput, alphaInput) {
    var hex = normalizeHexColor(colorInput ? colorInput.value : "", fallbackLayerColor(layer));
    var alpha = clamp(Number(alphaInput ? alphaInput.value : 0.58), 0, 1);
    if (!isFiniteNumber(alpha)) alpha = 0.58;
    if (alphaInput) alphaInput.value = alpha.toFixed(2);
    var parsed = parseColor(hex, 1);
    var r = clamp(Math.round(Number(parsed[0] || 0) * 255), 0, 255);
    var g = clamp(Math.round(Number(parsed[1] || 0) * 255), 0, 255);
    var b = clamp(Math.round(Number(parsed[2] || 0) * 255), 0, 255);
    return "rgba(" + r + "," + g + "," + b + "," + alpha.toFixed(3) + ")";
  }

  function applyLayerColorChange(layer, colorInput, alphaInput) {
    if (!layer) return;
    var rgba = layerRgbaFromInputs(layer, colorInput, alphaInput);
    STATE.layerColors[layer] = rgba;
    renderLayerControls();
    applyUiSettingsNoRebuild(false);
    persistHook("lcol:" + layer + ":" + encodeURIComponent(rgba));
  }

  DOM.linkLayerList.querySelectorAll(".ln-color").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var alphaInput = DOM.linkLayerList.querySelector('.ln-alpha[data-layer="' + layer + '"]');
      applyLayerColorChange(layer, el, alphaInput);
    });
  });

  DOM.linkLayerList.querySelectorAll(".ln-alpha").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var colorInput = DOM.linkLayerList.querySelector('.ln-color[data-layer="' + layer + '"]');
      applyLayerColorChange(layer, colorInput, el);
    });
  });

  DOM.linkLayerList.querySelectorAll(".ln-style").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      STATE.layerStyles[layer] = String(el.value || "solid");
      applyUiSettingsNoRebuild(false);
      persistHook("lstyle:" + layer + ":" + encodeURIComponent(STATE.layerStyles[layer]));
    });
  });

  DOM.linkLayerList.querySelectorAll(".ln-strength").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = clamp(Number(el.value || 1), 0.1, 8);
      STATE.linkStrengths[layer] = value;
      el.value = value.toFixed(2);
      applyUiSettingsNoRebuild(true);
      persistHook("lstrength:" + layer + ":" + value.toFixed(2));
    });
  });

  var flowInput = byId("ln-flow-speed");
  if (flowInput) {
    flowInput.addEventListener("change", function () {
      var value = clamp(Number(flowInput.value || 0.35), 0, 3);
      STATE.layerFlowSpeed = value;
      flowInput.value = value.toFixed(2);
      applyVisualStyles();
      persistHook("lflowspeed:" + value.toFixed(2));
    });
  }

  function applyNeighborScalingRuntime(reheat) {
    var cfg = (typeof normalizeNeighborScaling === "function")
      ? normalizeNeighborScaling(STATE.neighborScaling || null)
      : { mode: "none", directed: "undirected", weights: {} };
    STATE.neighborScaling = cfg;
    var updated = false;
    if (typeof applyRuntimeLinkDistances === "function") {
      updated = !!applyRuntimeLinkDistances(reheat !== false);
    }
    if (!updated) applyUiSettingsNoRebuild(reheat !== false);
    persistHook("neighborscale:" + encodeURIComponent(JSON.stringify(cfg)));
  }

  var metricModeInput = byId("ln-metric-mode");
  if (metricModeInput) {
    metricModeInput.addEventListener("change", function () {
      var mode = String(metricModeInput.value || "none");
      if (!STATE.neighborScaling || typeof STATE.neighborScaling !== "object") {
        STATE.neighborScaling = { mode: "none", directed: "undirected", weights: {} };
      }
      STATE.neighborScaling.mode = mode;
      applyNeighborScalingRuntime(true);
    });
  }

  var metricDirInput = byId("ln-metric-directed");
  if (metricDirInput) {
    metricDirInput.addEventListener("change", function () {
      var directed = String(metricDirInput.value || "undirected");
      if (!STATE.neighborScaling || typeof STATE.neighborScaling !== "object") {
        STATE.neighborScaling = { mode: "none", directed: "undirected", weights: {} };
      }
      STATE.neighborScaling.directed = directed;
      applyNeighborScalingRuntime(true);
    });
  }
}

function solverSpec() {
  return getEngineSolverSpec();
}

function engineSpec() {
  return getEngineRuntimeSpec();
}

function rendererSpec() {
  return getEngineRendererSpec();
}

function nodeSpec() {
  if (typeof getNodeSettingsSpec === "function") return getNodeSettingsSpec();
  return [];
}

function buildConfigFromSpec(specList, values) {
  var cfg = {};
  var src = values && typeof values === "object" ? values : {};
  (Array.isArray(specList) ? specList : []).forEach(function (spec) {
    var key = String(spec.key || "");
    if (!key) return;
    if (spec.type === "bool") cfg[key] = !!src[key];
    else cfg[key] = Number(src[key]);
  });
  return cfg;
}

function applyEngineSettingsToGraph() {
  if (!STATE.graph) return;

  var engineValues = collectEngineRuntimeSettings(STATE.engine || {});
  var solverValues = collectSolverSettings(STATE.solver || {});
  var rendererValues = collectRendererSettings(STATE.renderer || {});
  STATE.engine = engineValues;
  STATE.solver = solverValues;
  STATE.renderer = rendererValues;

  var engineCfg = buildConfigFromSpec(engineSpec(), engineValues);
  var solverCfg = buildConfigFromSpec(solverSpec(), solverValues);
  var rendererCfg = buildConfigFromSpec(rendererSpec(), rendererValues);
  STATE.graph.setConfig({ engine: engineCfg, solver: solverCfg, renderer: rendererCfg });

  if (Object.prototype.hasOwnProperty.call(solverCfg, "layout_enabled")
      && !solverCfg.layout_enabled
      && typeof STATE.graph.stop === "function") {
    STATE.graph.stop();
  }
}

function renderSettingsList(container, groupKey, specList, defaultsGetter) {
  if (!container) return;

  container.innerHTML = "";
  var list = Array.isArray(specList) ? specList : [];
  if (!list.length) return;

  var defaults = defaultsGetter && typeof defaultsGetter === "function" ? defaultsGetter() : {};
  if (groupKey === "engine") STATE.engine = collectEngineRuntimeSettings(STATE.engine || {});
  else if (groupKey === "solver") STATE.solver = collectSolverSettings(STATE.solver || {});
  else if (groupKey === "renderer") STATE.renderer = collectRendererSettings(STATE.renderer || {});
  else if (groupKey === "node" && typeof collectNodeSettings === "function") STATE.node = collectNodeSettings(STATE.node || {});

  var stateValues;
  if (groupKey === "engine") stateValues = STATE.engine || {};
  else if (groupKey === "solver") stateValues = STATE.solver || {};
  else if (groupKey === "renderer") stateValues = STATE.renderer || {};
  else if (groupKey === "node") stateValues = STATE.node || {};
  else stateValues = {};

  list.forEach(function (spec) {
    var row = document.createElement("div");
    row.className = "control-row";
    var hint = engineSettingHint(spec);

    if (spec.type === "bool") {
      var checked = !!stateValues[spec.key];
      row.innerHTML = ""
        + "<div" + titleAttr(hint) + ">" + escapeHtml(spec.label) + "</div>"
        + '<label class="line-item"' + titleAttr(hint) + '><input type="checkbox" data-pkey="' + escapeHtml(spec.key) + '" data-pgroup="' + escapeHtml(groupKey) + '" ' + (checked ? "checked" : "") + titleAttr(hint) + '><span' + titleAttr(hint) + ">Enabled</span></label>";
    } else {
      var current = Number(stateValues[spec.key]);
      if (!isFinite(current)) current = 0;
      var attrs = 'type="number" data-pkey="' + escapeHtml(spec.key) + '" data-pgroup="' + escapeHtml(groupKey) + '"';
      if (spec.step !== undefined) attrs += ' step="' + spec.step + '"';
      if (spec.min !== undefined) attrs += ' min="' + spec.min + '"';
      if (spec.max !== undefined) attrs += ' max="' + spec.max + '"';
      row.innerHTML = ""
        + "<div" + titleAttr(hint) + ">" + escapeHtml(spec.label) + "</div>"
        + "<input " + attrs + ' value="' + current + '"' + titleAttr(hint) + ">";
    }
    container.appendChild(row);
  });

  container.querySelectorAll("input[data-pkey]").forEach(function (el) {
    el.addEventListener("change", function () {
      var key = String(el.getAttribute("data-pkey") || "");
      var group = String(el.getAttribute("data-pgroup") || groupKey);
      var spec = list.find(function (s) { return s.key === key; });
      if (!spec) return;

      var value;
      if (spec.type === "bool") {
        value = !!el.checked;
      } else {
        value = Number(el.value || 0);
        if (!isFinite(value)) {
          value = Number((defaults && defaults[key] !== undefined) ? defaults[key] : 0);
        }
        el.value = String(value);
      }

      if (group === "engine") STATE.engine[key] = value;
      else if (group === "solver") STATE.solver[key] = value;
      else if (group === "renderer") STATE.renderer[key] = value;
      else if (group === "node") {
        if (!STATE.node || typeof STATE.node !== "object") STATE.node = {};
        STATE.node[key] = value;
      }

      if (spec.affectsEngine) {
        if (group === "node") {
          applyUiSettingsNoRebuild(true);
        } else {
          applyEngineSettingsToGraph();
          if (STATE.graph && typeof STATE.graph.start === "function" && STATE.solver && STATE.solver.layout_enabled) {
            STATE.graph.start(0.4);
          }
          if (STATE.graph) STATE.graph.render(0.08);
        }
      }

      persistHook(group + ":" + key + ":" + (spec.type === "bool" ? (value ? "1" : "0") : value));
    });
  });
}

function renderEngineSettings() {
  renderSettingsList(DOM.engineList, "engine", engineSpec(), getEngineRuntimeDefaults);
  if (typeof getNodeSettingsDefaults === "function") {
    renderSettingsList(DOM.nodeSettings, "node", nodeSpec(), getNodeSettingsDefaults);
  }
  renderSettingsList(DOM.solverList, "solver", solverSpec(), getEngineSolverDefaults);
  renderSettingsList(DOM.rendererList, "renderer", rendererSpec(), getEngineRendererDefaults);
}

function updateSettingsVisibility(open) {
  if (!DOM.settingsPanel) return;
  var isOpen = !!open;
  DOM.settingsPanel.classList.toggle("closed", !isOpen);
  DOM.statusOverlayBottomRight.classList.toggle("sidepanel", isOpen);
  DOM.settingsPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  scheduleGraphViewportSync();
}

function scheduleGraphViewportSync() {
  function runSync() {
    if (typeof ensureFlowCanvasSize === "function") {
      ensureFlowCanvasSize();
    }
    if (STATE.graph && typeof STATE.graph.resize === "function") {
      STATE.graph.resize();
    } else if (STATE.graph && typeof STATE.graph.render === "function") {
      STATE.graph.render(0.08);
    }
  }

  window.requestAnimationFrame(runSync);

  if (STATE.uiViewportSyncTimer) {
    window.clearTimeout(STATE.uiViewportSyncTimer);
  }
  STATE.uiViewportSyncTimer = window.setTimeout(function () {
    window.requestAnimationFrame(runSync);
    STATE.uiViewportSyncTimer = null;
  }, 220);
}

function switchSettingsTab(tabName) {
  var name = String(tabName || "notes");
  if (!DOM.settingsTabs || !DOM.settingsPanes) return;
  DOM.settingsTabs.forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === name);
  });
  DOM.settingsPanes.forEach(function (pane) {
    pane.classList.toggle("active", pane.id === ("tab-" + name));
  });
}
function wireDom() {
  DOM.layerPills = byId("layer-pills");
  DOM.layerList = byId("layer-list");
  DOM.noteTypeList = byId("note-type-list");
  DOM.searchInput = byId("search-input");
  DOM.searchGo = byId("search-go");
  DOM.searchSuggest = byId("search-suggest");
  DOM.searchWrap = byId("search-wrap");
  DOM.statusSummary = byId("status-summary");
  DOM.statusZoom = byId("status-zoom");
  DOM.statusFps = byId("status-fps");
  DOM.statusCoords = byId("status-coords");
  DOM.debugCoords = byId("debug-coords");
  DOM.debugExtra = byId("debug-extra");
  DOM.statusExtraText = byId("status-extra-text");
  DOM.debugCoordUse = byId("debug-coord-use");
  DOM.debugCoordVpX = byId("debug-coord-vp-x");
  DOM.debugCoordVpY = byId("debug-coord-vp-y");
  DOM.debugCoordClX = byId("debug-coord-cl-x");
  DOM.debugCoordClY = byId("debug-coord-cl-y");
  DOM.debugCoordCamX = byId("debug-coord-cam-x");
  DOM.debugCoordCamY = byId("debug-coord-cam-y");
  DOM.debugCoordRatio = byId("debug-coord-ratio");
  DOM.statusActive = byId("status-active");
  DOM.statusActiveDetails = byId("status-active-details");
  DOM.statusActiveDepTree = byId("status-active-deptree");
  DOM.statusDebugPanel = byId("status-debug-panel");
  DOM.statusbar = byId("statusbar");
  DOM.statusOverlayBottomRight = byId("status-overlay-bottom-right");
  DOM.settingsPanel = byId("settings-panel");
  DOM.settingsTabs = Array.prototype.slice.call(document.querySelectorAll("#settings-tabs .settings-tab"));
  DOM.settingsPanes = Array.prototype.slice.call(document.querySelectorAll("#settings-panel .tab-pane"));
  DOM.btnSettings = byId("btn-settings");
  DOM.btnCloseSettings = byId("btn-close-settings");
  DOM.btnRefresh = byId("btn-refresh");
  DOM.btnDevTools = byId("btn-dev-tools");
  DOM.btnFit = byId("btn-fit");
  DOM.toggleUnlinked = byId("toggle-unlinked");
  DOM.linkLayerList = byId("link-layer-list");
  DOM.flowSpeedControl = byId("flow-speed-control");
  DOM.engineList = byId("engine-list");
  DOM.nodeSettings = byId("node-settings");
  DOM.solverList = byId("solver-list");
  DOM.rendererList = byId("renderer-list");
  DOM.graph = byId("graph");
  DOM.graphPanel = byId("graph-panel");
  DOM.ctxMenu = byId("ctx-menu");
  DOM.flowCanvas = null;
  DOM.flowCtx = null;
  DOM.graphEmpty = byId("graph-empty");
  DOM.hoverTip = byId("hover-tip");
  syncDebugPanelVisibility();

  if (DOM.btnSettings) {
    DOM.btnSettings.addEventListener("click", function () {
      var nowClosed = DOM.settingsPanel.classList.contains("closed");
      updateSettingsVisibility(nowClosed);
    });
  }

  if (DOM.graph) {
    DOM.graph.addEventListener("mouseleave", function (evt) {
      var toEl = evt && evt.relatedTarget ? evt.relatedTarget : null;
      if (DOM.graphPanel && toEl && DOM.graphPanel.contains(toEl)) return;
      if (STATE.hoveredPointIndex !== null) clearHoverNodeState("graph-mouseleave");
      STATE.pointerInsideGraph = false;
      STATE.hoveredLinkIndex = null;
      ensureFlowParticlesLoop();
    });
  }

  if (DOM.graphPanel) {
    DOM.graphPanel.addEventListener("mouseenter", function () {
      STATE.pointerInsideGraph = true;
    });
    DOM.graphPanel.addEventListener("mousemove", function (evt) {
      STATE.pointerInsideGraph = true;
      STATE.pointerClientX = Number(evt.clientX);
      STATE.pointerClientY = Number(evt.clientY);
      syncHoverTooltipToPointer();
      updateCoordsStatus();
    });
    DOM.graphPanel.addEventListener("mouseleave", function (evt) {
      var toEl = evt && evt.relatedTarget ? evt.relatedTarget : null;
      if (toEl && DOM.graphPanel && DOM.graphPanel.contains(toEl)) return;
      STATE.pointerInsideGraph = false;
      clearHoverNodeState("panel-mouseleave");
      updateCoordsStatus();
    });
    DOM.graphPanel.addEventListener("contextmenu", function (evt) {
      evt.preventDefault();
      STATE.pointerInsideGraph = true;
      STATE.pointerClientX = Number(evt.clientX);
      STATE.pointerClientY = Number(evt.clientY);

      var idx = findHoverCandidateAtPointer();
      if (idx === null || idx === undefined || !isFiniteNumber(Number(idx))) {
        STATE.contextNodeId = null;
        STATE.contextPointIndex = null;
        hideContextMenu();
        applyVisualStyles();
        return;
      }

      idx = Number(idx);
      if (idx < 0 || idx >= STATE.activeNodes.length) {
        STATE.contextNodeId = null;
        STATE.contextPointIndex = null;
        hideContextMenu();
        applyVisualStyles();
        return;
      }

      var node = STATE.activeNodes[idx];
      if (!node) {
        hideContextMenu();
        return;
      }

      STATE.contextPointIndex = idx;
      STATE.contextNodeId = String(node.id || "");
      applyVisualStyles();
      showContextMenu(node, evt);
    });
  }

  if (DOM.btnCloseSettings) {
    DOM.btnCloseSettings.addEventListener("click", function () {
      updateSettingsVisibility(false);
    });
  }

  if (DOM.settingsTabs && DOM.settingsTabs.length) {
    DOM.settingsTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchSettingsTab(btn.getAttribute("data-tab") || "notes");
      });
    });
  }

  if (DOM.btnRefresh) {
    DOM.btnRefresh.addEventListener("click", function () {
      if (window.pycmd) {
        window.pycmd("refresh");
      } else {
        applyGraphData(true);
      }
    });
  }

  if (DOM.btnDevTools) {
    DOM.btnDevTools.addEventListener("click", function () {
      if (window.pycmd) {
        window.pycmd("devtools");
      } else {
        applyGraphData(true);
      }
    });
  }

  if (DOM.btnFit) {
    DOM.btnFit.addEventListener("click", function () {
      if (STATE.graph) {
        STATE.graph.fitView(380, 0.14);
      }
    });
  }

  if (DOM.toggleUnlinked) {
    DOM.toggleUnlinked.addEventListener("change", function () {
      STATE.showUnlinked = !!DOM.toggleUnlinked.checked;
      applyUiSettingsNoRebuild(false);
      persistHook("showunlinked:" + (STATE.showUnlinked ? "1" : "0"));
    });
  }

  if (DOM.searchInput) {
    DOM.searchInput.addEventListener("input", function () {
      renderSuggestions(DOM.searchInput.value || "");
    });

    DOM.searchInput.addEventListener("keydown", function (evt) {
      if (evt.key === "ArrowDown") {
        evt.preventDefault();
        applySuggestionSelection(STATE.selectedSuggestIdx + 1);
        return;
      }
      if (evt.key === "ArrowUp") {
        evt.preventDefault();
        applySuggestionSelection(STATE.selectedSuggestIdx - 1);
        return;
      }
      if (evt.key === "Enter") {
        evt.preventDefault();
        var pickedId = null;
        if (STATE.selectedSuggestIdx >= 0 && STATE.selectedSuggestIdx < STATE.suggestedIds.length) {
          pickedId = STATE.suggestedIds[STATE.selectedSuggestIdx];
        } else if (STATE.suggestedIds.length > 0) {
          pickedId = STATE.suggestedIds[0];
        }
        if (pickedId) focusNodeById(pickedId, true);
        return;
      }
      if (evt.key === "Escape") {
        hideSuggest();
      }
    });
  }

  if (DOM.searchGo) {
    DOM.searchGo.addEventListener("click", function () {
      var id = STATE.suggestedIds.length ? STATE.suggestedIds[0] : null;
      if (id) focusNodeById(id, true);
    });
  }

  document.addEventListener("click", function (evt) {
    var inSearch = DOM.searchWrap && DOM.searchWrap.contains(evt.target);
    var inCtx = DOM.ctxMenu && DOM.ctxMenu.contains(evt.target);
    if (!inSearch && DOM.searchSuggest && evt.target !== DOM.searchInput) {
      hideSuggest();
    }
    if (!inCtx) {
      hideContextMenu();
    }
  });

  startPerfMonitor();
  startHoverMonitor();
  ensureDebugExtraRows();
  switchSettingsTab("notes");
  window.addEventListener("resize", scheduleGraphViewportSync);
}

function refreshUiOnly() {
  if (DOM.toggleUnlinked) DOM.toggleUnlinked.checked = !!STATE.showUnlinked;
  renderLayerControls();
  renderNoteTypeControls();
  renderLinkSettings();
  renderEngineSettings();
}
