"use strict";

// ============================================================
// UI.js Index
// 1) Tooltip + Hover
// 2) UI helpers + runtime apply
// 3) Debug panel (graph.ui.debug.js) + Status panels
// 4) Dependency tree (graph.ui.deptree.js)
// 5) Search UI
// 6) Context menu
// 7) Settings UI renderers
// 8) DOM wiring + event handlers
// ============================================================

// === Tooltip + Hover =========================================================
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
  var nodeId = String(node.id || "");
  if (String(DOM.hoverTip.__nodeId || "") !== nodeId) {
    DOM.hoverTip.innerHTML = tooltipHtml(node);
    DOM.hoverTip.__nodeId = nodeId;
  }
  DOM.hoverTip.classList.add("is-visible");

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

function moveTooltip(clientX, clientY) {
  if (!DOM.hoverTip) return;
  if (!DOM.hoverTip.classList.contains("is-visible")) return;
  var cx = Number(clientX);
  var cy = Number(clientY);
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) return;
  DOM.hoverTip.style.left = (cx + 14) + "px";
  DOM.hoverTip.style.top = (cy + 14) + "px";
}

function hideTooltip() {
  if (!DOM.hoverTip) return;
  DOM.hoverTip.classList.remove("is-visible");
  DOM.hoverTip.__nodeId = "";
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

// === Hover hit testing =======================================================
function isClientPointInsideGraphPanel(clientX, clientY) {
  if (!DOM.graphPanel) return false;
  var x = Number(clientX);
  var y = Number(clientY);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  var rect = DOM.graphPanel.getBoundingClientRect();
  if (!rect) return false;
  return x >= Number(rect.left || 0)
    && x <= Number(rect.right || 0)
    && y >= Number(rect.top || 0)
    && y <= Number(rect.bottom || 0);
}

function clearHoverIfPointerOutside(reason) {
  if (STATE.hoveredPointIndex === null || STATE.hoveredPointIndex === undefined) return;
  if (isClientPointInsideGraphPanel(STATE.pointerClientX, STATE.pointerClientY)) return;
  STATE.pointerInsideGraph = false;
  clearHoverNodeState(reason || "pointer-outside-fallback");
}

function findHoverCandidateAtPointer() {
  if (!STATE.graph || typeof STATE.graph.getPointPositions !== "function") return null;
  if (!DOM.graph) return null;
  if (!isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) return null;
  var rect = DOM.graph.getBoundingClientRect();
  if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) return null;
  var px = Number(STATE.pointerClientX) - Number(rect.left);
  var py = Number(STATE.pointerClientY) - Number(rect.top);
  if (!isFiniteNumber(px) || !isFiniteNumber(py)) return null;
  if (typeof STATE.graph.spaceToScreenPosition !== "function") return null;

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
      radiusPx = STATE.graph.spaceToScreenRadius(baseSize);
    }
    if (!isFiniteNumber(radiusPx) || radiusPx <= 0) radiusPx = 8;
    var node = STATE.activeNodes && STATE.activeNodes.length > i ? STATE.activeNodes[i] : null;
    var kind = String(node && node.kind || "");
    var noteType = String(node && node.note_type || "");
    var isNoteLike = (kind === "note") || !!noteType;
    if (isNoteLike) radiusPx *= 1.75;
    return Math.max(8, radiusPx + 6);
  }

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

// === UI helpers ==============================================================
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

// === Status panel ============================================================
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

// === Status + Perf ===========================================================
function updateStatus(extraText) {
  var counts = getVisibleGraphCounts();
  var summary = "Nodes: " + counts.nodes + " | Edges: " + counts.edges;
  //if (DOM.statusExtraText) DOM.statusExtraText.textContent = extraText ? String(extraText) : "";

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
    if (STATE.debugEnabled) updateCoordsStatus();

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

// === Search UI ===============================================================
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
  DOM.searchSuggest.classList.remove("is-visible");
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
    DOM.searchSuggest.classList.remove("is-visible");
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

  DOM.searchSuggest.classList.add("is-visible");

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

// === Context menu ============================================================
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
  DOM.ctxMenu.classList.remove("is-visible");
  DOM.ctxMenu.setAttribute("aria-hidden", "true");
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
  menu.classList.add("is-visible");
  menu.setAttribute("aria-hidden", "false");
  var vw = window.innerWidth || 1;
  var vh = window.innerHeight || 1;
  var mw = menu.offsetWidth || 220;
  var mh = menu.offsetHeight || 120;
  menu.style.left = Math.max(8, Math.min(vw - mw - 8, x)) + "px";
  menu.style.top = Math.max(8, Math.min(vh - mh - 8, y)) + "px";
}

window.hideContextMenu = hideContextMenu;

// === Settings UI =============================================================
function renderLayerControls() {
  if (!DOM.layerPills) return;
  DOM.layerPills.innerHTML = "";

  orderedLayerKeys(Object.keys(STATE.layers)).forEach(function (layer) {
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

    DOM.layerPills.appendChild(pill);
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
    card.className = "note-type-card" + (nt.visible ? "" : " is-collapsed");

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
      + '<div class="note-type-body"><div class="note-type-body-inner"><div class="field-grid note-field-grid">'
      + '<div class="note-fields-left"><label' + titleAttr(noteTypeSettingHint("color")) + '>Node Color<div class="color-picker"><input type="color" class="nt-color" data-ntid="' + escapeHtml(id) + '" value="' + escapeHtml(normalizeHexColor(nt.color, "#93c5fd")) + '"' + titleAttr(noteTypeSettingHint("color")) + "></div></label></div>"
      + '<div class="note-fields-right"><label' + titleAttr(noteTypeSettingHint("label")) + '>Label Field<div class="select"><select class="nt-label" data-ntid="' + escapeHtml(id) + '"' + titleAttr(noteTypeSettingHint("label")) + ">" + labelOptions + '</select><span class="focus"></span></div></label>'
      + '<label' + titleAttr(noteTypeSettingHint("linked")) + '>Linked Field<div class="select"><select class="nt-linked" data-ntid="' + escapeHtml(id) + '"' + titleAttr(noteTypeSettingHint("linked")) + ">" + linkedOptions + '</select><span class="focus"></span></div></label></div>'
      + '<div class="note-fields-bottom"><label' + titleAttr(noteTypeSettingHint("tooltip")) + '>Tooltip Fields<div class="select select--multiple"><select class="nt-tooltip" data-ntid="' + escapeHtml(id) + '" multiple' + titleAttr(noteTypeSettingHint("tooltip")) + ">" + tooltipOptions + '</select><span class="focus"></span></div></label></div>'
      + "</div></div></div>";

    DOM.noteTypeList.appendChild(card);
  });

  DOM.noteTypeList.querySelectorAll(".nt-visible").forEach(function (el) {
    el.addEventListener("change", function () {
      var id = String(el.getAttribute("data-ntid") || "");
      if (!STATE.noteTypes[id]) return;
      STATE.noteTypes[id].visible = !!el.checked;
      var card = el.closest ? el.closest(".note-type-card") : null;
      if (card) card.classList.toggle("is-collapsed", !el.checked);
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
  if (!DOM.linkLayerList || !DOM.linkSettings) return;
  DOM.linkLayerList.innerHTML = "";
  DOM.linkSettings.innerHTML = "";
  var nscale = (typeof normalizeNeighborScaling === "function")
    ? normalizeNeighborScaling(STATE.neighborScaling || null)
    : { mode: "none", directed: "undirected", weights: {} };
  STATE.neighborScaling = nscale;

  var layers = orderedLayerKeys(Object.keys(STATE.layers)).filter(function (layer) {
    return String(layer || "") !== "notes";
  });
  layers.forEach(function (layer) {
    var rawColor = String((STATE.linkColors && STATE.linkColors[layer]) || fallbackLayerColor(layer) || "");
    var parsedColor = parseColor(rawColor, 0.58);
    var color = normalizeHexColor(rawColor, fallbackLayerColor(layer));
    var alpha = clamp(Number(parsedColor[3]), 0, 1);
    if (!isFiniteNumber(alpha)) alpha = 0.58;
    var visible = !!STATE.layers[layer];
    var style = String(STATE.layerStyles[layer] || "solid");
    var weightValue = Number(STATE.linkWeights && STATE.linkWeights[layer]);
    if (!isFiniteNumber(weightValue)) weightValue = 1;
    var weightModeRaw = String((STATE.linkWeightModes && STATE.linkWeightModes[layer]) || "manual").toLowerCase();
    var weightMode = (weightModeRaw === "metric") ? "metric" : "manual";

    var row = document.createElement("div");
    row.className = "link-type-card" + (visible ? "" : " is-collapsed");
    row.innerHTML = ""
      + '<div class="link-type-head">'
      + '<div class="link-type-name">' + escapeHtml(humanizeLayer(layer)) + "</div>"
      + '<label class="line-item"' + titleAttr(linkSettingHint("visible")) + '><input type="checkbox" class="ln-visible" data-layer="' + escapeHtml(layer) + '" ' + (visible ? "checked" : "") + titleAttr(linkSettingHint("visible")) + '><span' + titleAttr(linkSettingHint("visible")) + '>Visible</span></label>'
      + "</div>"
      + '<div class="link-type-body"><div class="link-type-body-inner"><div class="field-grid link-field-grid">'
      + '<div class="link-fields-left">'
      + '<label' + titleAttr(linkSettingHint("color")) + '>Color<div class="ln-color-alpha"><div class="color-picker"><input type="color" class="ln-color" data-layer="' + escapeHtml(layer) + '" value="' + escapeHtml(color) + '"' + titleAttr(linkSettingHint("color")) + "></div></div></label>"
      + '<label' + titleAttr(linkSettingHint("alpha")) + '>Alpha<div class="color-picker-alpha"><input type="number" step="0.01" min="0" max="1" class="ln-alpha" data-layer="' + escapeHtml(layer) + '" value="' + alpha.toFixed(2) + '"' + titleAttr(linkSettingHint("alpha")) + "></div></label>"
      + "</div>"
      + '<div class="link-fields-right"><label' + titleAttr(linkSettingHint("style")) + '>Style<div class="select"><select class="ln-style" data-layer="' + escapeHtml(layer) + '"' + titleAttr(linkSettingHint("style")) + ">"
      + mkOption("solid", "Solid", style === "solid")
      + mkOption("dashed", "Dashed", style === "dashed")
      + mkOption("dotted", "Dotted", style === "dotted")
      + '</select><span class="focus"></span></div></label>'
      + '<label' + titleAttr(linkSettingHint("weight_mode")) + '>Weight Mode<div class="select"><select class="ln-weight-mode" data-layer="' + escapeHtml(layer) + '"' + titleAttr(linkSettingHint("weight_mode")) + ">"
      + mkOption("manual", "Manual", weightMode === "manual")
      + mkOption("metric", "Metric", weightMode === "metric")
      + '</select><span class="focus"></span></div></label></div>'
      + '<div class="link-fields-bottom"><label' + titleAttr(linkSettingHint("weight")) + '>Weight<input type="number" step="0.05" min="0" max="10" class="ln-weight" data-layer="' + escapeHtml(layer) + '" value="' + weightValue.toFixed(2) + '"' + titleAttr(linkSettingHint("weight")) + "></label></div>"
      + "</div>"
      + "</div></div>"
      + "</div>";
    DOM.linkLayerList.appendChild(row);
  });

  var flowRow = document.createElement("div");
  flowRow.className = "control-row";
  flowRow.innerHTML = ""
    + "<div" + titleAttr(linkSettingHint("flow_speed")) + ">Particle Flow Speed</div>"
    + '<input id="ln-flow-speed" type="number" min="0.01" max="1" step="0.01" value="' + Number(STATE.layerFlowSpeed || 0.35).toFixed(2) + '"' + titleAttr(linkSettingHint("flow_speed")) + ">";
  DOM.linkSettings.appendChild(flowRow);

  var metricRow = document.createElement("div");
  metricRow.className = "control-row";
  metricRow.innerHTML = ""
    + "<div>Link Metric</div>"
    + '<div class="inline-pair">'
    + '<label>Mode<div class="select"><select id="ln-metric-mode">'
    + mkOption("none", "None", String(nscale.mode || "none") === "none")
    + mkOption("jaccard", "Jaccard", String(nscale.mode || "none") === "jaccard")
    + mkOption("overlap", "Overlap", String(nscale.mode || "none") === "overlap")
    + mkOption("common_neighbors", "Common Neighbors", String(nscale.mode || "none") === "common_neighbors")
    + mkOption("ccm", "Clustering Coeff", String(nscale.mode || "none") === "ccm")
    + mkOption("twohop", "2-Hop", String(nscale.mode || "none") === "twohop")
    + '</select><span class="focus"></span></div></label>'
    + '<label>Direction<div class="select"><select id="ln-metric-directed">'
    + mkOption("undirected", "Undirected", String(nscale.directed || "undirected") === "undirected")
    + mkOption("out", "Outgoing", String(nscale.directed || "undirected") === "out")
    + mkOption("in", "Incoming", String(nscale.directed || "undirected") === "in")
    + '</select><span class="focus"></span></div></label>'
    + "</div>";
  DOM.linkSettings.appendChild(metricRow);

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
    if (!STATE.linkColors || typeof STATE.linkColors !== "object") STATE.linkColors = {};
    STATE.linkColors[layer] = rgba;
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

  DOM.linkLayerList.querySelectorAll(".ln-visible").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var checked = !!el.checked;
      STATE.layers[layer] = checked;
      var card = el.closest ? el.closest(".link-type-card") : null;
      if (card) card.classList.toggle("is-collapsed", !checked);
      renderLayerControls();
      applyUiSettingsNoRebuild(true);
      persistHook("lenabled:" + layer + ":" + (checked ? "1" : "0"));
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

  DOM.linkLayerList.querySelectorAll(".ln-weight-mode").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = String(el.value || "manual").toLowerCase();
      if (value !== "metric") value = "manual";
      if (!STATE.linkWeightModes || typeof STATE.linkWeightModes !== "object") STATE.linkWeightModes = {};
      STATE.linkWeightModes[layer] = value;
      persistHook("lweightmode:" + layer + ":" + encodeURIComponent(value));
    });
  });

  DOM.linkLayerList.querySelectorAll(".ln-weight").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = clamp(Number(el.value || 1), 0, 10);
      if (!STATE.linkWeights || typeof STATE.linkWeights !== "object") STATE.linkWeights = {};
      STATE.linkWeights[layer] = value;
      el.value = value.toFixed(2);
      persistHook("lweight:" + layer + ":" + value.toFixed(2));
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

// === Engine/solver spec helpers =============================================
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
  var tabs = (DOM.settingsTabs && DOM.settingsTabs.length)
    ? DOM.settingsTabs
    : Array.prototype.slice.call(document.querySelectorAll("#settings-tabs .settings-tab"));
  var panes = (DOM.settingsPanes && DOM.settingsPanes.length)
    ? DOM.settingsPanes
    : Array.prototype.slice.call(document.querySelectorAll("#settings-panel .tab-pane"));
  if (!tabs.length || !panes.length) return;
  DOM.settingsTabs = tabs;
  DOM.settingsPanes = panes;
  tabs.forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === name);
  });
  panes.forEach(function (pane) {
    pane.classList.toggle("active", pane.id === ("tab-" + name));
  });
}

function reloadGraphStylesheet() {
  var links = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]'));
  if (!links.length) return;
  var target = null;
  for (var i = 0; i < links.length; i += 1) {
    var href = String(links[i].getAttribute("href") || "");
    if (href.indexOf("graph.css") >= 0) {
      target = links[i];
      break;
    }
  }
  if (!target) target = links[0];
  var hrefRaw = String(target.getAttribute("href") || "");
  if (!hrefRaw) return;
  var stamp = String(Date.now());
  var next = hrefRaw;
  if (hrefRaw.indexOf("?") >= 0) {
    if (/([?&])v=\d+/.test(hrefRaw)) {
      next = hrefRaw.replace(/([?&])v=\d+/, "$1v=" + stamp);
    } else {
      next = hrefRaw + "&v=" + stamp;
    }
  } else {
    next = hrefRaw + "?v=" + stamp;
  }
  target.setAttribute("href", next);
}
// === DOM wiring + event handlers =============================================
function wireDom() {
  DOM.layerPills = byId("layer-pills");
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
  DOM.btnReloadCss = byId("btn-reload-css");
  DOM.btnFit = byId("btn-fit");
  DOM.toggleUnlinked = byId("toggle-unlinked");
  DOM.linkLayerList = byId("link-layer-list");
  DOM.linkSettings = byId("link-settings");
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
  if (DOM.btnReloadCss) {
    DOM.btnReloadCss.addEventListener("click", function () {
      reloadGraphStylesheet();
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
      if (STATE.hoveredPointIndex !== null && STATE.hoveredPointIndex !== undefined) {
        moveTooltip(STATE.pointerClientX, STATE.pointerClientY);
      }
      if (STATE.debugEnabled) updateCoordsStatus();
    });
    DOM.graphPanel.addEventListener("mouseleave", function (evt) {
      var toEl = evt && evt.relatedTarget ? evt.relatedTarget : null;
      if (toEl && DOM.graphPanel && DOM.graphPanel.contains(toEl)) return;
      STATE.pointerInsideGraph = false;
      clearHoverNodeState("panel-mouseleave");
      if (STATE.debugEnabled) updateCoordsStatus();
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
  ensureDebugExtraRows();
  switchSettingsTab("notes");
  window.addEventListener("resize", scheduleGraphViewportSync);
  window.addEventListener("mousemove", function (evt) {
    STATE.pointerClientX = Number(evt.clientX);
    STATE.pointerClientY = Number(evt.clientY);
    clearHoverIfPointerOutside("window-mousemove-outside");
  }, { passive: true });
  window.addEventListener("mouseout", function (evt) {
    var related = evt && (evt.relatedTarget || evt.toElement);
    if (related) return;
    STATE.pointerInsideGraph = false;
    clearHoverNodeState("window-mouseout");
  });
  window.addEventListener("blur", function () {
    STATE.pointerInsideGraph = false;
    clearHoverNodeState("window-blur");
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      STATE.pointerInsideGraph = false;
      clearHoverNodeState("document-hidden");
    }
  });
}

function refreshUiOnly() {
  if (DOM.toggleUnlinked) DOM.toggleUnlinked.checked = !!STATE.showUnlinked;
  renderLayerControls();
  renderNoteTypeControls();
  renderLinkSettings();
  renderEngineSettings();
}
