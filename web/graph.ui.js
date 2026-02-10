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
}

function startHoverMonitor() {
  if (STATE.hoverMonitorRaf) return;
  function tick() {
    syncHoverTooltipToPointer();
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
  { key: "dxy", a: "hoverDx", b: "hoverDy" }
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
    hoverDy: "--"
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

function updateStatus(extraText) {
  var counts = getVisibleGraphCounts();
  var summary = "Nodes: " + counts.nodes + " | Edges: " + counts.edges;
  if (extraText) summary += " | " + extraText;
  if (DOM.statusSummary) DOM.statusSummary.textContent = summary;

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

function updateCoordsStatus() {
  if (!DOM.statusCoords && !DOM.debugCoords) return;
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
          hoverDy: "--"
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
      hoverDy: hDy
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

function buildSearchEntries() {
  var mask = STATE.runtimeNodeVisibleMask;
  var useMask = !!(mask && mask.length === STATE.activeNodes.length);
  var entries = STATE.activeNodes.filter(function (_node, idx) {
    if (!useMask) return true;
    return !!mask[idx];
  }).map(function (node) {
    var text = [node.label, node.id, node.note_type, node.kind].join(" ").toLowerCase();
    return {
      id: node.id,
      label: node.label || node.id,
      noteType: node.note_type || node.kind || "",
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
      + '<span class="suggest-meta">' + escapeHtml(entry.noteType) + "</span>"
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
    var color = normalizeHexColor(STATE.layerColors[layer] || fallbackLayerColor(layer), fallbackLayerColor(layer));
    var style = String(STATE.layerStyles[layer] || "solid");
    var flow = !!STATE.layerFlow[layer];
    var strength = Number(STATE.linkStrengths[layer] || 1);
    var distance = Number(
      STATE.linkDistances[layer]
      || defaultSolverLinkDistance()
      || 30
    );

    var row = document.createElement("div");
    row.className = "control-row";
    row.innerHTML = ""
      + "<div>"
      + "<strong>" + escapeHtml(humanizeLayer(layer)) + "</strong>"
      + '<div class="inline-pair">'
      + '<label' + titleAttr(linkSettingHint("color")) + '>Color<input type="color" class="ln-color" data-layer="' + escapeHtml(layer) + '" value="' + escapeHtml(color) + '"' + titleAttr(linkSettingHint("color")) + "></label>"
      + '<label' + titleAttr(linkSettingHint("style")) + '>Style<select class="ln-style" data-layer="' + escapeHtml(layer) + '"' + titleAttr(linkSettingHint("style")) + ">"
      + mkOption("solid", "Solid", style === "solid")
      + mkOption("dashed", "Dashed", style === "dashed")
      + mkOption("dotted", "Dotted", style === "dotted")
      + "</select></label>"
      + "</div>"
      + '<div class="inline-pair">'
      + '<label' + titleAttr(linkSettingHint("strength")) + '>Strength<input type="number" step="0.05" min="0.1" max="8" class="ln-strength" data-layer="' + escapeHtml(layer) + '" value="' + strength.toFixed(2) + '"' + titleAttr(linkSettingHint("strength")) + "></label>"
      + '<label' + titleAttr(linkSettingHint("distance")) + '>Distance<input type="number" step="1" min="1" max="5000" class="ln-distance" data-layer="' + escapeHtml(layer) + '" value="' + distance.toFixed(0) + '"' + titleAttr(linkSettingHint("distance")) + "></label>"
      + "</div>"
      + "</div>"
      + '<label class="line-item"' + titleAttr(linkSettingHint("flow")) + '><input type="checkbox" class="ln-flow" data-layer="' + escapeHtml(layer) + '" ' + (flow ? "checked" : "") + titleAttr(linkSettingHint("flow")) + '><span' + titleAttr(linkSettingHint("flow")) + '>Flow</span></label>';
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

  DOM.linkLayerList.querySelectorAll(".ln-color").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var color = normalizeHexColor(el.value, fallbackLayerColor(layer));
      STATE.layerColors[layer] = color;
      renderLayerControls();
      applyUiSettingsNoRebuild(false);
      persistHook("lcol:" + layer + ":" + encodeURIComponent(color));
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

  DOM.linkLayerList.querySelectorAll(".ln-flow").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      STATE.layerFlow[layer] = !!el.checked;
      applyVisualStyles();
      persistHook("lflow:" + layer + ":" + (el.checked ? "1" : "0"));
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

  DOM.linkLayerList.querySelectorAll(".ln-distance").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = clamp(Number(el.value || 30), 1, 5000);
      STATE.linkDistances[layer] = value;
      el.value = value.toFixed(0);
      var updated = false;
      if (typeof applyRuntimeLinkDistances === "function") {
        updated = !!applyRuntimeLinkDistances(true);
      }
      if (!updated) applyUiSettingsNoRebuild(true);
      persistHook("ldistance:" + layer + ":" + value.toFixed(0));
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
  DOM.debugCoordUse = byId("debug-coord-use");
  DOM.debugCoordVpX = byId("debug-coord-vp-x");
  DOM.debugCoordVpY = byId("debug-coord-vp-y");
  DOM.debugCoordClX = byId("debug-coord-cl-x");
  DOM.debugCoordClY = byId("debug-coord-cl-y");
  DOM.debugCoordCamX = byId("debug-coord-cam-x");
  DOM.debugCoordCamY = byId("debug-coord-cam-y");
  DOM.debugCoordRatio = byId("debug-coord-ratio");
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
  DOM.flowCanvas = null;
  DOM.flowCtx = null;
  DOM.graphEmpty = byId("graph-empty");
  DOM.hoverTip = byId("hover-tip");

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
    if (!inSearch && DOM.searchSuggest && evt.target !== DOM.searchInput) {
      hideSuggest();
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
