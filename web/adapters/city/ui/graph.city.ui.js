"use strict";

// ============================================================
// UI.js Index
// 1) Tooltip + Hover
// 2) UI helpers + runtime apply

// 5) Search UI
// 6) Context menu
// 7) Settings UI renderers
// 8) DOM wiring + event handlers
// ============================================================

// === Tooltip + Hover =========================================================

// === Card Formatting =========================================================
function normalizeCardStatusLabel(status) {
  var key = String(status || "").toLowerCase();
  if (key === "suspended") return "Suspended";
  if (key === "buried") return "Buried";
  if (key === "normal") return "Normal";
  return key ? (key.charAt(0).toUpperCase() + key.slice(1)) : "Unknown";
}

function formatCardStability(stability) {
  var v = Number(stability);
  if (!isFiniteNumber(v)) return "--";
  return v.toFixed(2);
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
    nodeClientX: n(d.nodeClientX),
    nodeClientY: n(d.nodeClientY),
    pointerX: n(d.pointerX === undefined ? STATE.pointerClientX : d.pointerX),
    pointerY: n(d.pointerY === undefined ? STATE.pointerClientY : d.pointerY),
    ts: Date.now()
  };
}

function clearHoverNodeState(reason, details) {
  var idx = STATE.hoveredPointIndex;
  setHoverDebug(reason || "hover-clear", Object.assign({ idx: idx }, details || {}));
  STATE.hoveredPointIndex = null;
  if (idx !== null && idx !== undefined) {
    callEngineApplyVisualStyles(0.08);
  }
  hideTooltip();
}

function uiGateway() {
  var gw = window && window.AjpcCityGateway;
  return (gw && typeof gw === "object") ? gw : null;
}

function uiCityPortContract(name) {
  var contracts = window && window.AjpcGraphContracts;
  if (!contracts || typeof contracts.getCityPortContract !== "function") return null;
  return contracts.getCityPortContract(name);
}

function adapterCallCity(name) {
  var gw = uiGateway();
  if (!gw || typeof gw.callCity !== "function") return undefined;
  return gw.callCity.apply(gw, arguments);
}

function adapterCallEngine(name) {
  var gw = uiGateway();
  if (!gw || typeof gw.callEngine !== "function") return undefined;
  return gw.callEngine.apply(gw, arguments);
}

function hasEnginePort(name) {
  var gw = uiGateway();
  return !!(gw && typeof gw.hasEnginePort === "function" && gw.hasEnginePort(name));
}

function callEngineApplyVisualStyles(renderAlpha) {
  return adapterCallEngine("applyVisualStyles", renderAlpha);
}

function callEngineApplyGraphData(fitView) {
  return adapterCallEngine("applyGraphData", fitView);
}

function callEngineFocusNodeById(nodeId, fromSearch) {
  return adapterCallEngine("focusNodeById", nodeId, fromSearch);
}

function callEngineGraph(methodName) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift(methodName);
  return adapterCallEngine.apply(null, args);
}

function callCityApplyRuntimeUiSettings(solverRestartLayout) {
  return adapterCallCity("applyRuntimeUiSettings", solverRestartLayout);
}

function callCityApplyRuntimeLinkDistances(solverRestart) {
  return adapterCallCity("applyRuntimeLinkDistances", solverRestart);
}

function callCityGetCardSettingsDefaults() {
  var out = adapterCallCity("getCardSettingsDefaults");
  return (out && typeof out === "object") ? out : {};
}

function callCityGetCardSettingsSpec() {
  var out = adapterCallCity("getCardSettingsSpec");
  return Array.isArray(out) ? out : [];
}

function callCityCollectCardSettings(input) {
  var out = adapterCallCity("collectCardSettings", input);
  return (out && typeof out === "object") ? out : {};
}

function callCitySyncCardSettingsFromMeta() {
  return adapterCallCity("syncCardSettingsFromMeta");
}

function callCityGetLinkSettingsDefaults() {
  var out = adapterCallCity("getLinkSettingsDefaults");
  return (out && typeof out === "object") ? out : {};
}

function callCityGetLinkSettingsSpec() {
  var out = adapterCallCity("getLinkSettingsSpec");
  return Array.isArray(out) ? out : [];
}

function callCityCollectLinkSettings(input) {
  var out = adapterCallCity("collectLinkSettings", input);
  return (out && typeof out === "object") ? out : {};
}

function callCitySyncLinkSettingsFromMeta() {
  return adapterCallCity("syncLinkSettingsFromMeta");
}

function openEmbeddedEditorForNodeIdPort(nodeId) {
  var nodeKey = String(nodeId === undefined || nodeId === null ? "" : nodeId);
  if (!nodeKey) return false;
  if (!STATE || !Array.isArray(STATE.activeNodes) || !STATE.activeNodes.length) return false;
  if (!STATE.activeIndexById || typeof STATE.activeIndexById.get !== "function") return false;

  var mapped = STATE.activeIndexById.get(nodeKey);
  var idx = Number(mapped);
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return false;

  var node = STATE.activeNodes[idx];
  if (!node || String(node.kind || "") !== "note") return false;

  STATE.selectedNodeId = node.id;
  STATE.selectedPointIndex = idx;
  STATE.focusedIndex = idx;
  callEngineApplyVisualStyles(0.08);

  updateEditorVisibility(true);
  if (typeof window.openEmbeddedEditorForNodeId !== "function") return false;
  var opened = !!window.openEmbeddedEditorForNodeId(String(node.id || ""));
  if (!opened) {
    updateEditorVisibility(false);
    return false;
  }
  if (typeof syncEmbeddedEditorRect === "function") syncEmbeddedEditorRect();
  return true;
}

function openFamilyIdEditForNodeIdPort(nodeId) {
  var nodeKey = String(nodeId === undefined || nodeId === null ? "" : nodeId);
  if (!nodeKey) return false;
  if (!STATE || !Array.isArray(STATE.activeNodes) || !STATE.activeNodes.length) return false;
  if (!STATE.activeIndexById || typeof STATE.activeIndexById.get !== "function") return false;

  var mapped = STATE.activeIndexById.get(nodeKey);
  var idx = Number(mapped);
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return false;

  var node = STATE.activeNodes[idx];
  if (!node || String(node.kind || "") !== "family") return false;

  STATE.selectedNodeId = node.id;
  STATE.selectedPointIndex = idx;
  STATE.focusedIndex = idx;
  callEngineApplyVisualStyles(0.08);

  if (typeof window.openFamilyIdEditDialogForNodeId !== "function") return false;
  return !!window.openFamilyIdEditDialogForNodeId(String(node.id || ""));
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
  if (!DOM.graph) return null;
  if (!isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) return null;
  var rect = DOM.graph.getBoundingClientRect();
  if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) return null;
  var px = Number(STATE.pointerClientX) - Number(rect.left);
  var py = Number(STATE.pointerClientY) - Number(rect.top);
  if (!isFiniteNumber(px) || !isFiniteNumber(py)) return null;
  var spaceProbe = callEngineGraph("spaceToScreenPosition", [0, 0]);
  if (!Array.isArray(spaceProbe) || spaceProbe.length < 2) return null;

  function getNodeHoverScreenRadius(idx) {
    var i = Number(idx);
    if (!isFiniteNumber(i) || i < 0 || i >= STATE.activeNodes.length) return 8;
    var radiusPx = NaN;
    radiusPx = Number(callEngineGraph("getPointScreenRadiusByIndex", i));
    if (!isFiniteNumber(radiusPx) || radiusPx <= 0) {
      var baseSize = Number((STATE.pointStyleSizes && STATE.pointStyleSizes.length > i) ? STATE.pointStyleSizes[i] : 0);
      if (!isFiniteNumber(baseSize) || baseSize <= 0) baseSize = 1;
      radiusPx = Number(callEngineGraph("spaceToScreenRadius", baseSize));
    }
    if (!isFiniteNumber(radiusPx) || radiusPx <= 0) radiusPx = 8;
    var node = STATE.activeNodes && STATE.activeNodes.length > i ? STATE.activeNodes[i] : null;
    var kind = String(node && node.kind || "");
    var noteType = String(node && node.note_type || "");
    var isNoteLike = (kind === "note") || !!noteType;
    if (isNoteLike) radiusPx *= 1.75;
    return Math.max(8, radiusPx + 6);
  }

  var pos = callEngineGraph("getPointPositions");
  if (!Array.isArray(pos) || !pos.length) return null;

  var bestIdx = -1;
  var bestDist2 = Number.POSITIVE_INFINITY;
  var maxIdx = Math.min(STATE.activeNodes.length, Math.floor(pos.length / 2));
  for (var i = 0; i < maxIdx; i += 1) {
    if (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === STATE.activeNodes.length && !STATE.runtimeNodeVisibleMask[i]) continue;
    var nx = Number(pos[i * 2]);
    var ny = Number(pos[(i * 2) + 1]);
    if (!isFiniteNumber(nx) || !isFiniteNumber(ny)) continue;

    var sp = callEngineGraph("spaceToScreenPosition", [nx, ny]);
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
function applyUiSettingsNoRebuild(solverRestartLayout) {
  var runtimeApplied = callCityApplyRuntimeUiSettings(solverRestartLayout);
  if (runtimeApplied !== undefined) {
    return !!runtimeApplied;
  }
  if (callEngineApplyGraphData(false) !== undefined) {
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

function refreshUiOnly() {
  syncAiControlVisibility();
  if (DOM.toggleUnlinked) DOM.toggleUnlinked.checked = !!STATE.showUnlinked;
  renderLayerControls();
  renderNoteTypeControls();
  renderLinkSettings();
  renderCardsSettings();
  renderEngineSettings();
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

// === Card Settings ==============================================================

function persistCardSetting(key, value) {
  var k = String(key || "");
  if (k === "card_dots_enabled") {
    persistHook("cdotenabled:" + (value ? "1" : "0"));
    return;
  }
  if (k === "card_dot_suspended_color") {
    persistHook("cdot:suspended:" + encodeURIComponent(String(value || "")));
    return;
  }
  if (k === "card_dot_buried_color") {
    persistHook("cdot:buried:" + encodeURIComponent(String(value || "")));
  }
}


// === Status panel ============================================================
function selectedNodeForStatus() {
  var selectedNodeId = (STATE.selectedNodeId === null || STATE.selectedNodeId === undefined)
    ? ""
    : String(STATE.selectedNodeId);
  if (!selectedNodeId) return null;

  var idx = NaN;

  if (STATE.activeIndexById && typeof STATE.activeIndexById.get === "function") {
    var mapped = STATE.activeIndexById.get(selectedNodeId);
    if (mapped !== undefined) idx = Number(mapped);
  }
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) {
    idx = Number(STATE.selectedPointIndex);
  }
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) {
    var selected = callEngineGraph("getSelectedIndices");
    if (Array.isArray(selected) && selected.length) idx = Number(selected[0]);
  }
  if (isFiniteNumber(idx) && idx >= 0 && idx < STATE.activeNodes.length) {
    var selectedNode = STATE.activeNodes[idx];
    if (!selectedNode || String(selectedNode.id || "") !== selectedNodeId) {
      idx = NaN;
    }
  }
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return null;
  if (STATE.runtimeNodeVisibleMask && idx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[idx]) return null;
  var node = STATE.activeNodes[idx];
  if (!node) return null;
  return { index: idx, node: node };
}

// === Active Status Cards Panel ===============================================
// Card details are rendered ahead of the dependency tree for active selection.
function renderActiveCards(node) {
  if (!DOM.statusActiveCards) return;
  var cards = node && Array.isArray(node.cards) ? node.cards : [];
  
  if (!cards.length) {
    DOM.statusActiveCards.innerHTML = renderHtmlTemplate(
      `<div class="title"><h3>{{title}}</h3></div>
      <div class="active-cards-empty">{{message}}</div>`,
      { title: "Cards", message: "No cards" }
    );
    return;
  }

  var rows = cards.map(function (card) {
    
    var c = card && typeof card === "object" ? card : {};
    var cid = Number(c.id);
    var cardId = (isFiniteNumber(cid) && cid > 0) ? String(Math.floor(cid)) : "";
    var ord = Number(c.ord);
    var cardName = String(c.name || c.card_name || c.template || "").trim();
    if (!cardName) cardName = isFiniteNumber(ord) ? ("Card " + String(ord + 1)) : "Card";
    var cardNameHtml = renderHtmlTemplate(
      cardId
        ? `<a href="#" class="active-card-open" data-card-id="{{cid}}">{{name}}</a>`
        : `<span class="active-card-open-disabled">{{name}}</span>`,
      { cid: cardId, name: cardName }
    );
    var statusText = normalizeCardStatusLabel(c.status);
    var stabilityText = formatCardStability(c.stability);
    return renderHtmlTemplate(
      `<div class="active-card-row">
        <span class="active-card-cell active-card-ord">{{{name_html}}}</span>
        <span class="active-card-cell active-card-status">{{status}}</span>
        <span class="active-card-cell active-card-stability">{{stability}} days</span>
      </div>`,
      { name_html: cardNameHtml, status: statusText, stability: stabilityText }
    );
  }).join("");

  DOM.statusActiveCards.innerHTML = renderHtmlTemplate(
    `<div class="title"><h3>{{title}}</h3></div>
    <div class="active-cards-table">
      <div class="active-cards-head">
        <span class="active-card-col active-card-col-name">Card</span>
        <span class="active-card-col active-card-col-status">Status</span>
        <span class="active-card-col active-card-col-stability">Stability</span>
      </div>
      <div class="active-cards-list">{{{rows}}}</div>
    </div>`,
    { title: "Cards", rows: rows }
  );
  var openButtons = DOM.statusActiveCards.querySelectorAll(".active-card-open[data-card-id]");
  for (var i = 0; i < openButtons.length; i += 1) {
    openButtons[i].addEventListener("click", function (evt) {
      if (evt) {
        evt.preventDefault();
        evt.stopPropagation();
      }
      var rawId = String(this.getAttribute("data-card-id") || "");
      var cardIdNum = Number(rawId);
      if (!isFiniteNumber(cardIdNum) || cardIdNum <= 0) return;
      if (window.pycmd) window.pycmd("ctx:previewcard:" + String(Math.floor(cardIdNum)));
    });
  }
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
        if (DOM.statusActiveCards) DOM.statusActiveCards.innerHTML = "";
        if (DOM.statusActiveDepTree) DOM.statusActiveDepTree.innerHTML = "";
        DOM.statusActiveDepTreeCanvas = null;
        resetDepTreeRenderState();
        activePanel.__ajpcHideTimer = null;
      }, closeDelayMs);
    } else {
      DOM.statusActiveDetails.innerHTML = "";
      if (DOM.statusActiveCards) DOM.statusActiveCards.innerHTML = "";
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

  var familiesHtml = families.length
    ? families.map(function (family) {
      return renderHtmlTemplate(
        `<div class="active-family">{{name}}</div>`,
        { name: family }
      );
    }).join("")
    : renderHtmlTemplate(
      `<div class="active-family">{{name}}</div>`,
      { name: "none" }
    );
  if (activePanel && activePanel.__ajpcHideTimer) {
    window.clearTimeout(activePanel.__ajpcHideTimer);
    activePanel.__ajpcHideTimer = null;
  }
  DOM.statusActiveDetails.innerHTML = renderHtmlTemplate(
    `<div class="title"><h2>{{label}}</h2></div>
    <div class="notetype">{{noteType}}</div>
    <div class="title"><h3>Families: </h3></div>
    {{{familiesHtml}}}`,
    { label: label, noteType: (noteType ? noteType : ""), familiesHtml: familiesHtml }
  );
  renderActiveCards(node);
  renderActiveDepTree(node);
  if (activePanel) {
    activePanel.classList.add("is-open");
    activePanel.setAttribute("aria-hidden", "false");
  }
}

// === Status + Perf ===========================================================
function updateStatus(extraText) {
  var counts = (STATE && STATE.visibleGraphCounts && typeof STATE.visibleGraphCounts === "object")
    ? STATE.visibleGraphCounts
    : { notes: 0, families: 0, edges: 0 };
  var notes = Number(counts.notes);
  var families = Number(counts.families);
  var edges = Number(counts.edges);
  if (!isFinite(notes) || notes < 0) notes = 0;
  if (!isFinite(families) || families < 0) families = 0;
  if (!isFinite(edges) || edges < 0) edges = 0;
  var summary = "Notes: " + notes + " | Families: " + families + " | Links: " + edges;
  if (STATE && typeof STATE === "object") {
    if (!Object.prototype.hasOwnProperty.call(STATE, "statusOverrideText")) STATE.statusOverrideText = "";
    if (arguments.length === 0) {
      STATE.statusOverrideText = "";
    } else {
      var next = (extraText === null || extraText === undefined) ? "" : String(extraText);
      STATE.statusOverrideText = next ? next : "";
    }
  }
  var overrideText = (STATE && typeof STATE.statusOverrideText === "string") ? STATE.statusOverrideText : "";
  var statusText = overrideText || summary;

  if (DOM.statusSummary) DOM.statusSummary.textContent = statusText;
  if (DOM.statusExtraText) DOM.statusExtraText.textContent = "";
  renderActiveDetails();

  if (DOM.statusZoom) {
    var zoom = callEngineGraph("getZoomLevel");
    DOM.statusZoom.textContent = "Zoom: " + Number(zoom || 1).toFixed(2) + "x";
  }
  if (typeof syncDebugPerfMonitor === "function") syncDebugPerfMonitor();
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

function firstSearchMatchId(query) {
  var q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  var entries = Array.isArray(STATE.allSearchEntries) ? STATE.allSearchEntries : [];
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    if (!entry || typeof entry !== "object") continue;
    var text = String(entry.text || "").toLowerCase();
    if (text.indexOf(q) >= 0) return entry.id || null;
  }
  return null;
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
    return renderHtmlTemplate(
      `<div class="suggest-item" data-idx="{{idx}}" data-id="{{id}}">
        {{label}}
        <span class="suggest-meta">{{meta}}</span>
      </div>`,
      {
        idx: idx,
        id: entry.id,
        label: entry.label,
        meta: (entry.metaLine || entry.noteType || "")
      }
    );
  }).join("");

  DOM.searchSuggest.classList.add("is-visible");

  var items = DOM.searchSuggest.querySelectorAll(".suggest-item");
  items.forEach(function (item) {
    item.addEventListener("mousedown", function (evt) {
      evt.preventDefault();
    });
    item.addEventListener("click", function () {
      var id = item.getAttribute("data-id") || "";
      callEngineFocusNodeById(id, true);
    });
  });
}

// === Settings UI =============================================================
function renderLayerControls() {
  if (!DOM.layerPills) return;
  DOM.layerPills.innerHTML = "";

  orderedLayerKeys(Object.keys(STATE.layers)).forEach(function (layer) {
    var rawSwatch = (STATE.linkColors && STATE.linkColors[layer])
      ? STATE.linkColors[layer]
      : (STATE.layerColors[layer] || fallbackLayerColor(layer));
    var color = normalizeHexColor(rawSwatch, fallbackLayerColor(layer));
    var enabled = !!STATE.layers[layer];
    var stat = STATE.layerStats[layer] || { nodes: 0, edges: 0 };

    var hint = layerToggleHint(layer);
    var pill = document.createElement("label");
    pill.className = "layer-pill";
    pill.innerHTML = renderHtmlTemplate(
      `<input type="checkbox"{{{checkedAttr}}} data-layer="{{layer}}"{{{hintAttr}}}>
      <span class="swatch" style="background:{{color}};"></span>
      <span{{{hintAttr}}}>{{label}}</span>`,
      {
        checkedAttr: enabled ? " checked" : "",
        layer: layer,
        hintAttr: titleAttr(hint),
        color: color,
        label: humanizeLayer(layer)
      }
    );
    pill.title = hint;

    function bindToggle(el) {
      var input = el.querySelector("input[data-layer]");
      input.addEventListener("change", function () {
        var key = String(input.getAttribute("data-layer") || "");
        STATE.layers[key] = !!input.checked;
        renderLayerControls();
        renderLinkSettings();
        applyUiSettingsNoRebuild(true);
        persistHook("lenabled:" + key + ":" + (input.checked ? "1" : "0"));
      });
    }

    bindToggle(pill);

    DOM.layerPills.appendChild(pill);
  });
}

function mkOption(value, label, selected) {
  return renderHtmlTemplate(
    `<option value="{{value}}"{{{selectedAttr}}}>{{label}}</option>`,
    {
      value: value,
      selectedAttr: selected ? " selected" : "",
      label: label
    }
  );
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

    card.innerHTML = renderHtmlTemplate(
      `<div class="note-type-head">
        <div class="note-type-name">{{name}}</div>
        <label class="line-item"{{{visibleHintAttr}}}>
          <input type="checkbox" class="nt-visible" data-ntid="{{id}}"{{{visibleAttr}}}{{{visibleHintAttr}}}>
          <span{{{visibleHintAttr}}}>Visible</span>
        </label>
      </div>
      
      <div class="note-type-body">
        <div class="note-type-body-inner">
          <div class="field-grid note-field-grid">

            <div class="note-fields-left">
              <label{{{colorHintAttr}}}>
                Node Color
                <div class="color-picker">
                  <input type="color" class="nt-color" data-ntid="{{id}}" value="{{colorValue}}"{{{colorHintAttr}}}>
                </div>
              </label>
            </div>

            <div class="note-fields-right">
              <label{{{labelHintAttr}}}>
                Label Field
                <div class="select">
                  <select class="nt-label" data-ntid="{{id}}"{{{labelHintAttr}}}>
                    {{{labelOptions}}}
                  </select>
                  <span class="focus"></span>
                </div>
              </label>
              <label{{{linkedHintAttr}}}>
                Linked Field
                <div class="select">
                  <select class="nt-linked" data-ntid="{{id}}"{{{linkedHintAttr}}}>
                    {{{linkedOptions}}}
                  </select>
                  <span class="focus"></span>
                </div>
              </label>
            </div>

            <div class="note-fields-bottom">
              <label{{{tooltipHintAttr}}}>
                Tooltip Fields
                <div class="select select--multiple">
                  <select class="nt-tooltip" data-ntid="{{id}}" multiple{{{tooltipHintAttr}}}>
                    {{{tooltipOptions}}}
                  </select>
                  <span class="focus"></span>
                </div>
              </label>
            </div>

          </div>
        </div>
      </div>`,
      {
        id: id,
        name: nt.name,
        visibleAttr: nt.visible ? " checked" : "",
        visibleHintAttr: titleAttr(noteTypeSettingHint("visible")),
        colorHintAttr: titleAttr(noteTypeSettingHint("color")),
        colorValue: normalizeHexColor(nt.color, "#93c5fd"),
        labelHintAttr: titleAttr(noteTypeSettingHint("label")),
        linkedHintAttr: titleAttr(noteTypeSettingHint("linked")),
        tooltipHintAttr: titleAttr(noteTypeSettingHint("tooltip")),
        labelOptions: labelOptions,
        linkedOptions: linkedOptions,
        tooltipOptions: tooltipOptions
      }
    );

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
  callCitySyncLinkSettingsFromMeta();
  STATE.linkSettings = callCityCollectLinkSettings(STATE.linkSettings || {});
  STATE.layerFlowSpeed = Number(STATE.linkSettings.layer_flow_speed || STATE.layerFlowSpeed || 0.35);
  STATE.layerFlowSpacingMul = Number(STATE.linkSettings.layer_flow_spacing_mul || STATE.layerFlowSpacingMul || 18);
  STATE.layerFlowRadiusMul = Number(STATE.linkSettings.layer_flow_radius_mul || STATE.layerFlowRadiusMul || 3.6);
  STATE.trailingHubDistance = Number(STATE.linkSettings.trailing_hub_distance || STATE.trailingHubDistance || 18);
  if (!STATE.linkColors || typeof STATE.linkColors !== "object") STATE.linkColors = {};
  STATE.linkColors.notes = normalizeHexColor(
    String(STATE.linkSettings.notes_swatch_color || STATE.linkColors.notes || fallbackLayerColor("notes")),
    fallbackLayerColor("notes")
  );

  var layers = orderedLayerKeys(Object.keys(STATE.layers)).filter(function (layer) {
    return String(layer || "") !== "notes";
  });
  if (!STATE.linkLayerExpanded || typeof STATE.linkLayerExpanded !== "object") {
    STATE.linkLayerExpanded = {};
  }
  var availableMassLinkerGroups = Array.isArray(STATE.massLinkerGroupsAvailable)
    ? STATE.massLinkerGroupsAvailable.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
    : [];
  var selectedMassLinkerGroups = Array.isArray(STATE.massLinkerGroupHubs)
    ? STATE.massLinkerGroupHubs.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
    : [];
  var selectedMassLinkerSet = {};
  selectedMassLinkerGroups.forEach(function (group) {
    selectedMassLinkerSet[String(group).toLowerCase()] = true;
  });

  layers.forEach(function (layer) {
    var rawColor = String((STATE.linkColors && STATE.linkColors[layer]) || fallbackLayerColor(layer) || "");
    var parsedColor = parseColor(rawColor, 0.58);
    var color = normalizeHexColor(rawColor, fallbackLayerColor(layer));
    var alpha = clamp(Number(parsedColor[3]), 0, 1);
    if (!isFiniteNumber(alpha)) alpha = 0.58;
    var visible = !!STATE.layers[layer];
    var expanded = Object.prototype.hasOwnProperty.call(STATE.linkLayerExpanded, layer)
      ? !!STATE.linkLayerExpanded[layer]
      : visible;
    var style = String(STATE.layerStyles[layer] || "solid");
    var weightValue = Number(STATE.linkWeights && STATE.linkWeights[layer]);
    if (!isFiniteNumber(weightValue)) weightValue = 1;
    var lineStrengthValue = Number(STATE.linkStrengths && STATE.linkStrengths[layer]);
    if (!isFiniteNumber(lineStrengthValue) || lineStrengthValue < 0) lineStrengthValue = 1;
    var extraSettingsHtml = "";
    if (String(layer) === "provider_mass_linker" && availableMassLinkerGroups.length) {
      var groupRows = availableMassLinkerGroups.map(function (groupName) {
        var key = String(groupName || "").trim();
        if (!key) return "";
        return renderHtmlTemplate(
          `<label class="line-item ln-ml-group-row">
            <input type="checkbox" class="ml-group-hub" data-group="{{group}}"{{{checkedAttr}}}>
            <span>{{group}}</span>
          </label>`,
          {
            group: key,
            checkedAttr: selectedMassLinkerSet[key.toLowerCase()] ? " checked" : ""
          }
        );
      }).join("");
      extraSettingsHtml = renderHtmlTemplate(
        `<div class="link-fields-bottom ln-ml-group-hubs">
          <label>Group Hubs</label>
          <div class="stack ln-ml-group-list">{{{rows}}}</div>
        </div>`,
        { rows: groupRows }
      );
    }

    var row = document.createElement("div");
    row.className = "link-type-card" + (expanded ? "" : " is-collapsed");
    row.innerHTML = renderHtmlTemplate(
      `<div class="link-type-head">
        <div class="link-type-name" data-layer-toggle="{{layer}}">{{label}}</div>
        <div class="link-type-head-right">
          <span class="ln-collapse-indicator" data-layer-toggle="{{layer}}" aria-expanded="{{expandedAria}}"{{{collapseHintAttr}}}></span>
          <label class="line-item"{{{visibleHintAttr}}}>
            <input type="checkbox" class="ln-visible" data-layer="{{layer}}"{{{visibleAttr}}}{{{visibleHintAttr}}}>
            <span{{{visibleHintAttr}}}>Visible</span>
          </label>
        </div>
      </div>
      <div class="link-type-body"><div class="link-type-body-inner"><div class="field-grid link-field-grid">
        <div class="link-fields-left">
          <label{{{colorHintAttr}}}>Color<div class="ln-color-alpha"><div class="color-picker"><input type="color" class="ln-color" data-layer="{{layer}}" value="{{color}}"{{{colorHintAttr}}}></div></div></label>
          <label{{{alphaHintAttr}}}>Alpha<div class="color-picker-alpha"><input type="number" step="0.01" min="0" max="1" class="ln-alpha" data-layer="{{layer}}" value="{{alpha}}"{{{alphaHintAttr}}}></div></label>
        </div>
        <div class="link-fields-right">
          <label{{{styleHintAttr}}}>Style<div class="select"><select class="ln-style" data-layer="{{layer}}"{{{styleHintAttr}}}>{{{styleOptions}}}</select><span class="focus"></span></div></label>
          <label{{{lineStrengthHintAttr}}}>Line Strength<input type="number" step="0.05" min="0" max="10" class="ln-line-strength" data-layer="{{layer}}" value="{{lineStrength}}"{{{lineStrengthHintAttr}}}></label>
        </div>
        <div class="link-fields-bottom"><label{{{weightHintAttr}}}>Weight Factor<input type="number" step="0.05" min="0" max="10" class="ln-weight" data-layer="{{layer}}" value="{{weight}}"{{{weightHintAttr}}}></label></div>
        {{{extraSettingsHtml}}}
      </div>
      </div></div>`,
      {
        label: humanizeLayer(layer),
        layer: layer,
        expandedAria: expanded ? "true" : "false",
        collapseHintAttr: titleAttr("Expand/collapse layer settings"),
        visibleAttr: visible ? " checked" : "",
        visibleHintAttr: titleAttr(linkSettingHint("visible")),
        colorHintAttr: titleAttr(linkSettingHint("color")),
        alphaHintAttr: titleAttr(linkSettingHint("alpha")),
        styleHintAttr: titleAttr(linkSettingHint("style")),
        lineStrengthHintAttr: titleAttr(linkSettingHint("line_strength")),
        weightHintAttr: titleAttr(linkSettingHint("weight")),
        color: color,
        alpha: alpha.toFixed(2),
        lineStrength: lineStrengthValue.toFixed(2),
        styleOptions: [
          mkOption("solid", "Solid", style === "solid"),
          mkOption("dashed", "Dashed", style === "dashed"),
          mkOption("dotted", "Dotted", style === "dotted")
        ].join(""),
        weight: weightValue.toFixed(2),
        extraSettingsHtml: extraSettingsHtml
      }
    );
    DOM.linkLayerList.appendChild(row);
  });

  var flowSpeedRow = document.createElement("div");
  flowSpeedRow.className = "control-row";
  flowSpeedRow.innerHTML = renderHtmlTemplate(
    `<div{{{hintAttr}}}>Particle Flow Speed</div>
    <input id="ln-flow-speed" type="number" min="0.01" max="3" step="0.01" value="{{flowSpeed}}"{{{hintAttr}}}>`,
    {
      hintAttr: titleAttr(linkSettingHint("flow_speed")),
      flowSpeed: Number(STATE.layerFlowSpeed || 0.35).toFixed(2)
    }
  );
  DOM.linkSettings.appendChild(flowSpeedRow);

  var flowSpacingRow = document.createElement("div");
  flowSpacingRow.className = "control-row";
  flowSpacingRow.innerHTML = renderHtmlTemplate(
    `<div{{{hintAttr}}}>Particle Flow Spacing</div>
    <input id="ln-flow-spacing" type="number" min="0.1" max="80" step="0.1" value="{{flowSpacing}}"{{{hintAttr}}}>`,
    {
      hintAttr: titleAttr(linkSettingHint("flow_spacing")),
      flowSpacing: Number(STATE.layerFlowSpacingMul || 18).toFixed(1)
    }
  );
  DOM.linkSettings.appendChild(flowSpacingRow);

  var flowWidthRow = document.createElement("div");
  flowWidthRow.className = "control-row";
  flowWidthRow.innerHTML = renderHtmlTemplate(
    `<div{{{hintAttr}}}>Particle Flow Width</div>
    <input id="ln-flow-width" type="number" min="0.1" max="12" step="0.1" value="{{flowWidth}}"{{{hintAttr}}}>`,
    {
      hintAttr: titleAttr(linkSettingHint("flow_width")),
      flowWidth: Number(STATE.layerFlowRadiusMul || 3.6).toFixed(1)
    }
  );
  DOM.linkSettings.appendChild(flowWidthRow);

  var trailingHubDistanceRow = document.createElement("div");
  trailingHubDistanceRow.className = "control-row";
  trailingHubDistanceRow.innerHTML = renderHtmlTemplate(
    `<div{{{hintAttr}}}>Trailing Hub Distance</div>
    <input id="ln-trailing-hub-distance" type="number" min="0" max="5000" step="1" value="{{trailingHubDistance}}"{{{hintAttr}}}>`,
    {
      hintAttr: titleAttr(linkSettingHint("trailing_hub_distance")),
      trailingHubDistance: Number(STATE.trailingHubDistance || 18).toFixed(0)
    }
  );
  DOM.linkSettings.appendChild(trailingHubDistanceRow);

  var notesSwatchRow = document.createElement("div");
  notesSwatchRow.className = "control-row";
  notesSwatchRow.innerHTML = renderHtmlTemplate(
    `<div{{{hintAttr}}}>Notes Swatch Color</div>
    <div class="ln-color-alpha"><div class="color-picker"><input id="ln-notes-swatch-color" type="color" value="{{value}}"{{{hintAttr}}}></div></div>`,
    {
      hintAttr: titleAttr(linkSettingHint("notes_swatch_color")),
      value: normalizeHexColor(
        String((STATE.linkSettings && STATE.linkSettings.notes_swatch_color) || (STATE.linkColors && STATE.linkColors.notes) || fallbackLayerColor("notes")),
        fallbackLayerColor("notes")
      )
    }
  );
  DOM.linkSettings.appendChild(notesSwatchRow);

  var metricRow = document.createElement("div");
  metricRow.className = "control-row";
  metricRow.innerHTML = renderHtmlTemplate(
    `<div>Link Metric</div>
    <div class="inline-pair">
      <label>Mode<div class="select"><select id="ln-metric-mode">{{{modeOptions}}}</select><span class="focus"></span></div></label>
      <label>Direction<div class="select"><select id="ln-metric-directed">{{{directionOptions}}}</select><span class="focus"></span></div></label>
    </div>`,
    {
      modeOptions: [
        mkOption("none", "None", String(nscale.mode || "none") === "none"),
        mkOption("jaccard", "Jaccard", String(nscale.mode || "none") === "jaccard"),
        mkOption("overlap", "Overlap", String(nscale.mode || "none") === "overlap"),
        mkOption("common_neighbors", "Common Neighbors", String(nscale.mode || "none") === "common_neighbors"),
        mkOption("ccm", "Clustering Coeff", String(nscale.mode || "none") === "ccm"),
        mkOption("twohop", "2-Hop", String(nscale.mode || "none") === "twohop")
      ].join(""),
      directionOptions: [
        mkOption("undirected", "Undirected", String(nscale.directed || "undirected") === "undirected"),
        mkOption("out", "Outgoing", String(nscale.directed || "undirected") === "out"),
        mkOption("in", "Incoming", String(nscale.directed || "undirected") === "in")
      ].join("")
    }
  );
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
      renderLayerControls();
      applyUiSettingsNoRebuild(true);
      persistHook("lenabled:" + layer + ":" + (checked ? "1" : "0"));
    });
  });

  DOM.linkLayerList.querySelectorAll("[data-layer-toggle]").forEach(function (el) {
    el.addEventListener("click", function (evt) {
      if (!evt) return;
      var target = evt.target && evt.target.closest ? evt.target.closest("input, label.line-item") : null;
      if (target) return;
      var layer = String(el.getAttribute("data-layer-toggle") || "");
      if (!layer) return;
      var card = el.closest ? el.closest(".link-type-card") : null;
      if (!card) return;
      var currentlyCollapsed = card.classList.contains("is-collapsed");
      var nextExpanded = currentlyCollapsed;
      STATE.linkLayerExpanded[layer] = !!nextExpanded;
      card.classList.toggle("is-collapsed", !nextExpanded);
      var indicator = card.querySelector(".ln-collapse-indicator");
      if (indicator) indicator.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
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

  DOM.linkLayerList.querySelectorAll(".ln-line-strength").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = clamp(Number(el.value || 1), 0, 10);
      if (!STATE.linkStrengths || typeof STATE.linkStrengths !== "object") STATE.linkStrengths = {};
      STATE.linkStrengths[layer] = value;
      el.value = value.toFixed(2);
      applyUiSettingsNoRebuild(false);
      persistHook("lstrength:" + layer + ":" + value.toFixed(2));
    });
  });

  DOM.linkLayerList.querySelectorAll(".ln-weight").forEach(function (el) {
    el.addEventListener("change", function () {
      var layer = String(el.getAttribute("data-layer") || "");
      var value = clamp(Number(el.value || 1), 0, 10);
      if (!STATE.linkWeights || typeof STATE.linkWeights !== "object") STATE.linkWeights = {};
      STATE.linkWeights[layer] = value;
      el.value = value.toFixed(2);
      var updated = !!callCityApplyRuntimeLinkDistances(true);
      if (!updated) applyUiSettingsNoRebuild(true);
      persistHook("lweight:" + layer + ":" + value.toFixed(2));
    });
  });

  function applyLinkSettingsRuntimePatch() {
    STATE.linkSettings = callCityCollectLinkSettings(Object.assign({}, STATE.linkSettings || {}, {
      layer_flow_speed: STATE.layerFlowSpeed,
      layer_flow_spacing_mul: STATE.layerFlowSpacingMul,
      layer_flow_radius_mul: STATE.layerFlowRadiusMul,
      trailing_hub_distance: STATE.trailingHubDistance,
      notes_swatch_color: (STATE.linkColors && STATE.linkColors.notes) ? STATE.linkColors.notes : undefined
    }));
    callEngineApplyVisualStyles();
  }

  var flowInput = byId("ln-flow-speed");
  if (flowInput) {
    flowInput.addEventListener("change", function () {
      var value = clamp(Number(flowInput.value || 0.35), 0.01, 3);
      STATE.layerFlowSpeed = value;
      flowInput.value = value.toFixed(2);
      applyLinkSettingsRuntimePatch();
      persistHook("lflowspeed:" + value.toFixed(2));
    });
  }

  var flowSpacingInput = byId("ln-flow-spacing");
  if (flowSpacingInput) {
    flowSpacingInput.addEventListener("change", function () {
      var value = clamp(Number(flowSpacingInput.value || 18), 0.1, 80);
      STATE.layerFlowSpacingMul = value;
      flowSpacingInput.value = value.toFixed(1);
      applyLinkSettingsRuntimePatch();
      persistHook("lflowspacing:" + value.toFixed(1));
    });
  }

  var flowWidthInput = byId("ln-flow-width");
  if (flowWidthInput) {
    flowWidthInput.addEventListener("change", function () {
      var value = clamp(Number(flowWidthInput.value || 3.6), 0.1, 12);
      STATE.layerFlowRadiusMul = value;
      flowWidthInput.value = value.toFixed(1);
      applyLinkSettingsRuntimePatch();
      persistHook("lflowwidth:" + value.toFixed(1));
    });
  }

  var trailingHubDistanceInput = byId("ln-trailing-hub-distance");
  if (trailingHubDistanceInput) {
    trailingHubDistanceInput.addEventListener("change", function () {
      var value = clamp(Number(trailingHubDistanceInput.value || 18), 0, 5000);
      STATE.trailingHubDistance = value;
      trailingHubDistanceInput.value = value.toFixed(0);
      STATE.linkSettings = callCityCollectLinkSettings(Object.assign({}, STATE.linkSettings || {}, {
        trailing_hub_distance: value
      }));
      var updated = !!callCityApplyRuntimeLinkDistances(true);
      if (!updated) applyUiSettingsNoRebuild(true);
      persistHook("ltrailinghubdist:" + value.toFixed(0));
    });
  }

  var notesSwatchInput = byId("ln-notes-swatch-color");
  if (notesSwatchInput) {
    notesSwatchInput.addEventListener("change", function () {
      var value = normalizeHexColor(String(notesSwatchInput.value || ""), fallbackLayerColor("notes"));
      notesSwatchInput.value = value;
      if (!STATE.linkColors || typeof STATE.linkColors !== "object") STATE.linkColors = {};
      STATE.linkColors.notes = value;
      renderLayerControls();
      applyLinkSettingsRuntimePatch();
      persistHook("lcol:notes:" + encodeURIComponent(value));
    });
  }

  DOM.linkLayerList.querySelectorAll(".ml-group-hub").forEach(function (el) {
    el.addEventListener("change", function () {
      var selected = [];
      DOM.linkLayerList.querySelectorAll(".ml-group-hub").forEach(function (cb) {
        if (!cb.checked) return;
        var group = String(cb.getAttribute("data-group") || "").trim();
        if (!group) return;
        selected.push(group);
      });
      STATE.massLinkerGroupHubs = selected;
      persistHook("mlghubs:" + encodeURIComponent(JSON.stringify(selected)));
    });
  });

  function applyNeighborScalingRuntime(solverRestart) {
    var cfg = (typeof normalizeNeighborScaling === "function")
      ? normalizeNeighborScaling(STATE.neighborScaling || null)
      : { mode: "none", directed: "undirected", weights: {} };
    STATE.neighborScaling = cfg;
    var updated = false;
    updated = !!callCityApplyRuntimeLinkDistances(solverRestart !== false);
    if (!updated) applyUiSettingsNoRebuild(solverRestart !== false);
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
  if (!hasEnginePort("setConfig")) return;

  var engineValues = collectEngineRuntimeSettings(STATE.engine || {});
  var solverValues = collectSolverSettings(STATE.solver || {});
  var rendererValues = collectRendererSettings(STATE.renderer || {});
  STATE.engine = engineValues;
  STATE.solver = solverValues;
  STATE.renderer = rendererValues;

  var engineCfg = buildConfigFromSpec(engineSpec(), engineValues);
  var solverCfg = buildConfigFromSpec(solverSpec(), solverValues);
  var rendererCfg = buildConfigFromSpec(rendererSpec(), rendererValues);
  callEngineGraph("setConfig", { engine: engineCfg, solver: solverCfg, renderer: rendererCfg });

  if (Object.prototype.hasOwnProperty.call(solverCfg, "layout_enabled")
      && !solverCfg.layout_enabled) callEngineGraph("stop");
}

function ensureCardsSettingsUi() {
  var tabsHost = byId("settings-tabs");
  var panel = byId("settings-panel");
  var scrollHost = panel ? panel.querySelector(".settings-scroll") : null;
  if (!tabsHost || !scrollHost) return;

  var noteTab = tabsHost.querySelector('[data-tab="notes"]');
  var cardsTab = tabsHost.querySelector('[data-tab="cards"]');
  if (!cardsTab) {
    cardsTab = document.createElement("button");
    cardsTab.className = "settings-tab";
    cardsTab.type = "button";
    cardsTab.setAttribute("data-tab", "cards");
    cardsTab.textContent = "Cards";
    if (noteTab && noteTab.nextSibling) tabsHost.insertBefore(cardsTab, noteTab.nextSibling);
    else tabsHost.appendChild(cardsTab);
  }

  var cardsPane = byId("tab-cards");
  if (!cardsPane) {
    cardsPane = document.createElement("section");
    cardsPane.id = "tab-cards";
    cardsPane.className = "tab-pane";
    cardsPane.innerHTML = renderHtmlTemplate(
      `<section class="settings-block">
        <h3>Cards</h3>
        <p class="hint">Persisted card settings (UI only for now).</p>
        <div id="cards-settings" class="stack"></div>
      </section>`,
      {}
    );
    var notesPane = byId("tab-notes");
    if (notesPane && notesPane.nextSibling) scrollHost.insertBefore(cardsPane, notesPane.nextSibling);
    else scrollHost.appendChild(cardsPane);
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
  else if (groupKey === "cards") STATE.cards = callCityCollectCardSettings(STATE.cards || {});

  var stateValues;
  if (groupKey === "engine") stateValues = STATE.engine || {};
  else if (groupKey === "solver") stateValues = STATE.solver || {};
  else if (groupKey === "renderer") stateValues = STATE.renderer || {};
  else if (groupKey === "node") stateValues = STATE.node || {};
  else if (groupKey === "cards") stateValues = STATE.cards || {};
  else stateValues = {};

  list.forEach(function (spec) {
    var row = document.createElement("div");
    row.className = "control-row";
    var hint = engineSettingHint(spec);

    if (spec.type === "bool") {
      var checked = !!stateValues[spec.key];
      row.innerHTML = renderHtmlTemplate(
        `<div{{{hintAttr}}}>{{label}}</div>
        <label class="line-item"{{{hintAttr}}}>
          <input type="checkbox" data-pkey="{{key}}" data-pgroup="{{groupKey}}"{{{checkedAttr}}}{{{hintAttr}}}>
          <span{{{hintAttr}}}>Enabled</span>
        </label>`,
        {
          hintAttr: titleAttr(hint),
          label: spec.label,
          key: spec.key,
          groupKey: groupKey,
          checkedAttr: checked ? " checked" : ""
        }
      );
    } else if (spec.type === "color") {
      var colorCurrent = normalizeHexColor(String(stateValues[spec.key] || defaults[spec.key] || "#94a3b8"), "#94a3b8");
      row.innerHTML = renderHtmlTemplate(
        `<div{{{hintAttr}}}>{{label}}</div>
        <input type="color" data-pkey="{{key}}" data-pgroup="{{groupKey}}" value="{{value}}"{{{hintAttr}}}>`,
        {
          hintAttr: titleAttr(hint),
          label: spec.label,
          key: spec.key,
          groupKey: groupKey,
          value: colorCurrent
        }
      );
    } else {
      var current = Number(stateValues[spec.key]);
      if (!isFinite(current)) current = 0;
      row.innerHTML = renderHtmlTemplate(
        `<div{{{hintAttr}}}>{{label}}</div>
        <input type="number" data-pkey="{{key}}" data-pgroup="{{groupKey}}"{{{stepAttr}}}{{{minAttr}}}{{{maxAttr}}} value="{{value}}"{{{hintAttr}}}>`,
        {
          hintAttr: titleAttr(hint),
          label: spec.label,
          key: spec.key,
          groupKey: groupKey,
          stepAttr: spec.step !== undefined ? (' step="' + String(spec.step) + '"') : "",
          minAttr: spec.min !== undefined ? (' min="' + String(spec.min) + '"') : "",
          maxAttr: spec.max !== undefined ? (' max="' + String(spec.max) + '"') : "",
          value: current
        }
      );
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
      } else if (spec.type === "color") {
        value = normalizeHexColor(String(el.value || defaults[key] || "#94a3b8"), "#94a3b8");
        el.value = value;
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
      } else if (group === "cards") {
        if (!STATE.cards || typeof STATE.cards !== "object") STATE.cards = {};
        STATE.cards[key] = value;
      }

      if (spec.affectsEngine) {
        if (group === "node") {
          applyUiSettingsNoRebuild(true);
        } else {
          applyEngineSettingsToGraph();
          if (STATE.solver && STATE.solver.layout_enabled) callEngineGraph("start", 0.4);
          callEngineGraph("render", 0.08);
        }
      }

      if (group === "cards") {
        persistCardSetting(key, value);
      } else {
        persistHook(group + ":" + key + ":" + (spec.type === "bool" ? (value ? "1" : "0") : value));
      }
    });
  });
}

function renderCardsSettings() {
  callCitySyncCardSettingsFromMeta();
  renderSettingsList(DOM.cardsSettings, "cards", callCityGetCardSettingsSpec(), callCityGetCardSettingsDefaults);
}

function syncEngineSectionVisibility() {
  if (!DOM.engineList) return;
  var section = (DOM.engineList.closest && DOM.engineList.closest(".settings-block")) || null;
  if (!section) return;
  var hasItems = !!(DOM.engineList.children && DOM.engineList.children.length > 0);
  section.classList.toggle("hidden", !hasItems);
  section.setAttribute("aria-hidden", hasItems ? "false" : "true");
}

function renderEngineSettings() {
  renderSettingsList(DOM.engineList, "engine", engineSpec(), getEngineRuntimeDefaults);
  syncEngineSectionVisibility();
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

function updateEditorVisibility(open) {
  if (!DOM.editorPanel) return;
  var isOpen = !!open;
  DOM.editorPanel.classList.toggle("closed", !isOpen);
  DOM.statusOverlayTopLeft.classList.toggle("sidepanel", isOpen);
  DOM.editorPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (typeof syncEmbeddedEditorRect === "function") syncEmbeddedEditorRect();
  scheduleGraphViewportSync();
}

function setAiDialogVisibility(dialogEl, open) {
  if (!dialogEl) return;
  var isOpen = !!open;
  dialogEl.classList.toggle("is-hidden", !isOpen);
  dialogEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function updateCreateDialogVisibility(open) {
  setAiDialogVisibility(DOM.aiCreateDialog, open);
}

function updateEnrichDialogVisibility(open) {
  setAiDialogVisibility(DOM.aiEnrichDialog, open);
}

var GRAPH_AI = {
  createResults: [],
  createIndex: 0,
  duplicatePreview: null,
  mnemonicRejectMode: "",
  enrichPatch: null,
  enrichNid: 0
};

function graphAiPycmd(command, payloadObj) {
  if (!window.pycmd || typeof window.pycmd !== "function") return false;
  if (!command) return false;
  if (payloadObj && typeof payloadObj === "object") {
    window.pycmd("ai:" + String(command) + ":" + encodeURIComponent(JSON.stringify(payloadObj)));
    return true;
  }
  window.pycmd("ai:" + String(command));
  return true;
}

function graphAiSetPerfText(targetEl, text) {
  if (!targetEl) return;
  targetEl.textContent = String(text || "");
}

function syncAiControlVisibility() {
  var available = !!(STATE && STATE.aiToolsAvailable);
  if (DOM.btnAiCreate) {
    DOM.btnAiCreate.style.display = available ? "" : "none";
  }
  if (!available) {
    updateCreateDialogVisibility(false);
    updateEnrichDialogVisibility(false);
    setAiDialogVisibility(DOM.aiDuplicateDialog, false);
    setAiDialogVisibility(DOM.aiMnemonicRejectDialog, false);
    setAiDialogVisibility(DOM.aiEnrichFieldsDialog, false);
  }
}

function graphAiNormalizeCreateRequestFromDom() {
  var kind = DOM.aiCreateKind ? String(DOM.aiCreateKind.value || "word").trim().toLowerCase() : "word";
  if (kind !== "word" && kind !== "sentence" && kind !== "text" && kind !== "list") kind = "word";
  var text = DOM.aiCreateText ? String(DOM.aiCreateText.value || "") : "";
  return {
    source: { kind: kind, text: text },
    selected_prereq_ids: [],
    options: { strict_format: true, include_prereq: true }
  };
}

function graphAiSetCreateJsonPreview(content) {
  if (!DOM.aiCreatePreviewJsonPre) return;
  DOM.aiCreatePreviewJsonPre.textContent = String(content || "{}");
}

function graphAiSetEnrichJsonPreview(content) {
  if (!DOM.aiEnrichPreviewJsonPre) return;
  DOM.aiEnrichPreviewJsonPre.textContent = String(content || "{}");
}

function graphAiToggleCreatePreviewMode() {
  var mode = DOM.aiCreatePreviewMode ? String(DOM.aiCreatePreviewMode.value || "json") : "json";
  if (DOM.aiCreatePreviewJson) DOM.aiCreatePreviewJson.classList.toggle("is-hidden", mode !== "json");
  if (DOM.aiCreatePreviewFields) DOM.aiCreatePreviewFields.classList.toggle("is-hidden", mode !== "fields");
  if (DOM.aiCreatePreviewTemplate) DOM.aiCreatePreviewTemplate.classList.toggle("is-hidden", mode !== "template");
}

function graphAiToggleEnrichPreviewMode() {
  var mode = DOM.aiEnrichPreviewMode ? String(DOM.aiEnrichPreviewMode.value || "json") : "json";
  if (DOM.aiEnrichPreviewJson) DOM.aiEnrichPreviewJson.classList.toggle("is-hidden", mode !== "json");
  if (DOM.aiEnrichPreviewTemplate) DOM.aiEnrichPreviewTemplate.classList.toggle("is-hidden", mode !== "template");
}

function graphAiCurrentCreatePreview() {
  if (!Array.isArray(GRAPH_AI.createResults) || !GRAPH_AI.createResults.length) return null;
  var idx = Number(GRAPH_AI.createIndex);
  if (!isFiniteNumber(idx) || idx < 0 || idx >= GRAPH_AI.createResults.length) idx = 0;
  GRAPH_AI.createIndex = idx;
  return GRAPH_AI.createResults[idx] || null;
}

function graphAiRenderCreateFields(preview) {
  if (!DOM.aiCreatePreviewFieldsBody) return;
  DOM.aiCreatePreviewFieldsBody.innerHTML = "";
  var fields = preview && preview.note_fields && typeof preview.note_fields === "object" ? preview.note_fields : {};
  Object.keys(fields).forEach(function (key) {
    var tr = document.createElement("tr");
    var tdKey = document.createElement("td");
    tdKey.textContent = String(key || "");
    var tdVal = document.createElement("td");
    var ta = document.createElement("textarea");
    ta.value = String(fields[key] === undefined || fields[key] === null ? "" : fields[key]);
    ta.addEventListener("input", function () {
      if (!preview.note_fields || typeof preview.note_fields !== "object") preview.note_fields = {};
      preview.note_fields[String(key)] = String(ta.value || "");
    });
    tdVal.appendChild(ta);
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    DOM.aiCreatePreviewFieldsBody.appendChild(tr);
  });
}

function graphAiRenderCreateTemplate(preview) {
  if (!DOM.aiCreateTemplateCanvas) return;
  var fields = preview && preview.note_fields && typeof preview.note_fields === "object" ? preview.note_fields : {};
  DOM.aiCreateTemplateCanvas.innerHTML = "<pre>" + escapeHtml(JSON.stringify(fields, null, 2)) + "</pre>";
}

function graphAiRenderCreatePrereqs(preview) {
  if (!DOM.aiCreatePrereqList) return;
  DOM.aiCreatePrereqList.innerHTML = "";
  var tree = preview && preview.prereq_tree && typeof preview.prereq_tree === "object" ? preview.prereq_tree : {};
  var nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
  nodes.forEach(function (row) {
    var li = document.createElement("li");
    var reading = String(row && row.furigana || row && row.id || "");
    var meaning = String(row && row.meaning_de || "");
    var exists = !!(row && row.exists);
    li.textContent = (exists ? "[EXISTS] " : "[NEW] ") + reading + (meaning ? " - " + meaning : "");
    DOM.aiCreatePrereqList.appendChild(li);
  });
}

function graphAiRenderCreateResultsList() {
  if (!DOM.aiCreateResultsList) return;
  DOM.aiCreateResultsList.innerHTML = "";
  var list = Array.isArray(GRAPH_AI.createResults) ? GRAPH_AI.createResults : [];
  list.forEach(function (item, idx) {
    var li = document.createElement("li");
    li.className = (idx === GRAPH_AI.createIndex) ? "is-active" : "";
    var req = item && item.request && item.request.source && typeof item.request.source === "object" ? item.request.source : {};
    var vocab = item && item.card && item.card.vocab && typeof item.card.vocab === "object" ? item.card.vocab : {};
    var label = String(req.text || vocab.furigana || vocab.reading || ("Result " + (idx + 1)));
    li.textContent = label;
    li.addEventListener("click", function () {
      GRAPH_AI.createIndex = idx;
      graphAiRenderCreatePreviewState();
    });
    DOM.aiCreateResultsList.appendChild(li);
  });
}

function graphAiRenderCreatePreviewState() {
  var preview = graphAiCurrentCreatePreview();
  if (!preview) {
    graphAiSetCreateJsonPreview("{}");
    if (DOM.aiCreateResultStatus) DOM.aiCreateResultStatus.textContent = "Result: -";
    return;
  }
  var total = GRAPH_AI.createResults.length;
  if (DOM.aiCreateResultStatus) DOM.aiCreateResultStatus.textContent = "Result: " + String(GRAPH_AI.createIndex + 1) + "/" + String(total);
  graphAiSetCreateJsonPreview(JSON.stringify(preview, null, 2));
  graphAiRenderCreateFields(preview);
  graphAiRenderCreateTemplate(preview);
  graphAiRenderCreatePrereqs(preview);
  graphAiRenderCreateResultsList();
}

function graphAiRenderEnrichTemplate(patch) {
  if (!DOM.aiEnrichTemplateCanvas) return;
  var src = patch && typeof patch === "object" ? patch : {};
  DOM.aiEnrichTemplateCanvas.innerHTML = "<pre>" + escapeHtml(JSON.stringify(src, null, 2)) + "</pre>";
}

function graphAiSendCreatePreview() {
  if (!STATE.aiToolsAvailable) {
    updateStatus("AI addon inactive");
    return;
  }
  var req = graphAiNormalizeCreateRequestFromDom();
  graphAiSetPerfText(DOM.aiCreatePerf, "Perf: create preview running...");
  graphAiSetCreateJsonPreview('{"ok":false,"error":"running"}');
  graphAiPycmd("create_preview", req);
}

function graphAiOpenDuplicateDialog(preview) {
  GRAPH_AI.duplicatePreview = preview && typeof preview === "object" ? preview : null;
  if (!DOM.aiDuplicateDialog) return;
  if (!GRAPH_AI.duplicatePreview) return;
  var dupes = Array.isArray(GRAPH_AI.duplicatePreview.duplicates) ? GRAPH_AI.duplicatePreview.duplicates : [];
  var existing = dupes.length ? dupes[0] : {};
  if (DOM.aiDuplicateExistingPre) DOM.aiDuplicateExistingPre.textContent = JSON.stringify(existing, null, 2);
  if (DOM.aiDuplicateGeneratedPre) DOM.aiDuplicateGeneratedPre.textContent = JSON.stringify(GRAPH_AI.duplicatePreview.note_fields || {}, null, 2);
  setAiDialogVisibility(DOM.aiDuplicateDialog, true);
}

function graphAiCloseDuplicateDialog() {
  setAiDialogVisibility(DOM.aiDuplicateDialog, false);
}

function graphAiSendCreateApply(action, existingNid) {
  var preview = graphAiCurrentCreatePreview();
  if (!preview) {
    updateStatus("No create preview available");
    return;
  }
  var actionPayload = { action: String(action || "create_new") };
  if (existingNid) actionPayload.existing_nid = Number(existingNid);
  graphAiSetPerfText(DOM.aiCreatePerf, "Perf: apply running...");
  graphAiPycmd("create_apply", { preview: preview, action: actionPayload });
}

function graphAiOpenMnemonicReject(mode) {
  GRAPH_AI.mnemonicRejectMode = String(mode || "");
  if (DOM.aiMnemonicRejectReason) DOM.aiMnemonicRejectReason.value = "";
  setAiDialogVisibility(DOM.aiMnemonicRejectDialog, true);
}

function graphAiCloseMnemonicReject() {
  setAiDialogVisibility(DOM.aiMnemonicRejectDialog, false);
  GRAPH_AI.mnemonicRejectMode = "";
}

function graphAiApplyCreateMnemonicToPreview(mnemonic) {
  var preview = graphAiCurrentCreatePreview();
  if (!preview) return;
  if (!preview.card || typeof preview.card !== "object") preview.card = {};
  if (!preview.card.meta || typeof preview.card.meta !== "object") preview.card.meta = {};
  preview.card.meta.mnemonic = String(mnemonic || "");
  if (!preview.note_fields || typeof preview.note_fields !== "object") preview.note_fields = {};
  Object.keys(preview.note_fields).forEach(function (key) {
    if (String(key || "").toLowerCase().indexOf("mnemonic") >= 0) {
      preview.note_fields[key] = String(mnemonic || "");
    }
  });
}

function graphAiOpenEnrichForNodeId(nodeId) {
  if (!STATE || !STATE.aiToolsAvailable) return false;
  var nodeKey = String(nodeId === undefined || nodeId === null ? "" : nodeId);
  if (!nodeKey) return false;
  var idx = STATE.activeIndexById && typeof STATE.activeIndexById.get === "function"
    ? Number(STATE.activeIndexById.get(nodeKey))
    : NaN;
  if (!isFiniteNumber(idx) || idx < 0 || idx >= STATE.activeNodes.length) return false;
  var node = STATE.activeNodes[idx];
  if (!node || String(node.kind || "") !== "note") return false;
  if (DOM.aiEnrichNid) DOM.aiEnrichNid.value = String(node.id || "");
  updateEnrichDialogVisibility(true);
  return true;
}

function graphAiSendEnrichPreview() {
  if (!STATE.aiToolsAvailable) {
    updateStatus("AI addon inactive");
    return;
  }
  var nid = DOM.aiEnrichNid ? Number(DOM.aiEnrichNid.value || 0) : 0;
  var mode = DOM.aiEnrichMode ? String(DOM.aiEnrichMode.value || "correct_all") : "correct_all";
  if (!isFiniteNumber(nid) || nid <= 0) {
    updateStatus("Invalid NID");
    return;
  }
  graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich preview running...");
  graphAiSetEnrichJsonPreview('{"ok":false,"error":"running"}');
  graphAiPycmd("enrich_preview", { nid: nid, mode: mode });
}

function graphAiOpenEnrichFieldsDialog() {
  if (!DOM.aiEnrichFieldsDialog || !DOM.aiEnrichFieldsList) return;
  var patch = GRAPH_AI.enrichPatch && typeof GRAPH_AI.enrichPatch === "object" ? GRAPH_AI.enrichPatch : {};
  var keys = Object.keys(patch);
  DOM.aiEnrichFieldsList.innerHTML = "";
  keys.forEach(function (key) {
    var li = document.createElement("li");
    var label = document.createElement("label");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.setAttribute("data-ai-field", String(key || ""));
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + String(key || "")));
    li.appendChild(label);
    DOM.aiEnrichFieldsList.appendChild(li);
  });
  setAiDialogVisibility(DOM.aiEnrichFieldsDialog, true);
}

function graphAiCloseEnrichFieldsDialog() {
  setAiDialogVisibility(DOM.aiEnrichFieldsDialog, false);
}

function graphAiSendEnrichApplySelected() {
  var nid = Number(GRAPH_AI.enrichNid || 0);
  if (!isFiniteNumber(nid) || nid <= 0) {
    updateStatus("Invalid NID");
    return;
  }
  var patch = GRAPH_AI.enrichPatch && typeof GRAPH_AI.enrichPatch === "object" ? GRAPH_AI.enrichPatch : {};
  var fields = [];
  if (DOM.aiEnrichFieldsList) {
    DOM.aiEnrichFieldsList.querySelectorAll("input[data-ai-field]").forEach(function (el) {
      if (!el || !el.checked) return;
      fields.push(String(el.getAttribute("data-ai-field") || "").trim());
    });
  }
  graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich apply running...");
  graphAiPycmd("enrich_apply", { nid: nid, patch: patch, fields: fields });
}

function graphAiSendMnemonicReject() {
  var reason = DOM.aiMnemonicRejectReason ? String(DOM.aiMnemonicRejectReason.value || "") : "";
  if (GRAPH_AI.mnemonicRejectMode === "create") {
    var preview = graphAiCurrentCreatePreview();
    if (!preview) {
      updateStatus("No create preview available");
      return;
    }
    graphAiSetPerfText(DOM.aiCreatePerf, "Perf: mnemonic retry running...");
    graphAiPycmd("create_regen_mnemonic", { preview: preview, reason: reason });
    graphAiCloseMnemonicReject();
    return;
  }
  if (GRAPH_AI.mnemonicRejectMode === "enrich") {
    var nid = Number(GRAPH_AI.enrichNid || 0);
    if (!isFiniteNumber(nid) || nid <= 0 || !GRAPH_AI.enrichPatch) {
      updateStatus("No enrich patch available");
      return;
    }
    graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: mnemonic retry running...");
    graphAiPycmd("enrich_regen_mnemonic", { nid: nid, patch: GRAPH_AI.enrichPatch, reason: reason });
    graphAiCloseMnemonicReject();
    return;
  }
  graphAiCloseMnemonicReject();
}

function graphAiWireGlobalCallbacks() {
  window.onGraphAiStatus = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (Object.prototype.hasOwnProperty.call(out, "available")) {
      STATE.aiToolsAvailable = !!out.available;
      syncAiControlVisibility();
    }
  };

  window.onGraphAiCreatePreviewResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiCreatePerf, "Perf: create preview failed");
      graphAiSetCreateJsonPreview(JSON.stringify(out, null, 2));
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    GRAPH_AI.createResults = Array.isArray(result.results) ? result.results : [];
    GRAPH_AI.createIndex = 0;
    graphAiRenderCreatePreviewState();
    graphAiSetPerfText(DOM.aiCreatePerf, "Perf: create preview " + String(out.elapsed_ms || 0) + " ms");
  };

  window.onGraphAiCreateApplyResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiCreatePerf, "Perf: create apply failed");
      updateStatus("AI create apply failed");
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    graphAiSetPerfText(DOM.aiCreatePerf, "Perf: create apply " + String(out.elapsed_ms || 0) + " ms");
    updateStatus("AI create apply: " + String(result.action || "done"));
    graphAiCloseDuplicateDialog();
  };

  window.onGraphAiCreateMnemonicResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiCreatePerf, "Perf: mnemonic retry failed");
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    var mnemonic = String(result.mnemonic || "");
    if (mnemonic) {
      graphAiApplyCreateMnemonicToPreview(mnemonic);
      graphAiRenderCreatePreviewState();
      updateStatus("AI mnemonic updated");
    }
    graphAiSetPerfText(DOM.aiCreatePerf, "Perf: mnemonic retry " + String(out.elapsed_ms || 0) + " ms");
  };

  window.onGraphAiEnrichPreviewResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich preview failed");
      graphAiSetEnrichJsonPreview(JSON.stringify(out, null, 2));
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    GRAPH_AI.enrichPatch = result.patch && typeof result.patch === "object" ? result.patch : {};
    GRAPH_AI.enrichNid = Number(result.nid || 0);
    graphAiSetEnrichJsonPreview(JSON.stringify(GRAPH_AI.enrichPatch, null, 2));
    graphAiRenderEnrichTemplate(GRAPH_AI.enrichPatch);
    if (DOM.aiEnrichStatus) DOM.aiEnrichStatus.textContent = "Patch: " + String(Object.keys(GRAPH_AI.enrichPatch).length) + " fields";
    graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich preview " + String(out.elapsed_ms || 0) + " ms");
  };

  window.onGraphAiEnrichApplyResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich apply failed");
      updateStatus("AI enrich apply failed");
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: enrich apply " + String(out.elapsed_ms || 0) + " ms");
    updateStatus("AI enrich applied: " + String((result.changed_fields || []).length) + " fields");
    graphAiCloseEnrichFieldsDialog();
  };

  window.onGraphAiEnrichMnemonicResult = function (payload) {
    var out = payload && typeof payload === "object" ? payload : {};
    if (!out.ok) {
      graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: mnemonic retry failed");
      return;
    }
    var result = out.result && typeof out.result === "object" ? out.result : {};
    var mnemonic = String(result.mnemonic || "");
    if (mnemonic) {
      if (!GRAPH_AI.enrichPatch || typeof GRAPH_AI.enrichPatch !== "object") GRAPH_AI.enrichPatch = {};
      GRAPH_AI.enrichPatch.Mnemonic = mnemonic;
      graphAiSetEnrichJsonPreview(JSON.stringify(GRAPH_AI.enrichPatch, null, 2));
      graphAiRenderEnrichTemplate(GRAPH_AI.enrichPatch);
      updateStatus("AI enrich mnemonic updated");
    }
    graphAiSetPerfText(DOM.aiEnrichPerf, "Perf: mnemonic retry " + String(out.elapsed_ms || 0) + " ms");
  };
}

function scheduleGraphViewportSync() {
  function runSync() {
    if (typeof ensureFlowCanvasSize === "function") {
      ensureFlowCanvasSize();
    }
    var resized = callEngineGraph("resize");
    if (resized === undefined) callEngineGraph("render", 0.08);
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


// === DOM wiring + event handlers =============================================
function wireDom() {
  ensureCardsSettingsUi();

  DOM.layerPills = byId("layer-pills");
  DOM.noteTypeList = byId("note-type-list");
  DOM.searchInput = byId("search-input");
  DOM.searchGo = byId("search-go");
  DOM.searchSuggest = byId("search-suggest");
  DOM.searchWrap = byId("search-wrap");
  DOM.statusSummary = byId("status-summary");
  DOM.statusZoom = byId("status-zoom");
  DOM.statusExtraText = byId("status-extra-text");
  DOM.statusActive = byId("status-active");
  DOM.statusActiveDetails = byId("status-active-details");
  DOM.statusActiveCards = byId("status-active-cards");
  DOM.statusActiveDepTree = byId("status-active-deptree");

  DOM.statusbar = byId("statusbar");
  DOM.statusOverlayBottomRight = byId("status-overlay-bottom-right");
  DOM.statusOverlayTopLeft = byId("status-overlay-top-left");

  DOM.editorPanel = byId("editor-panel");
  DOM.btnEditor = byId("btn-editor");

  DOM.settingsPanel = byId("settings-panel");
  DOM.settingsTabs = Array.prototype.slice.call(document.querySelectorAll("#settings-tabs .settings-tab"));
  DOM.settingsPanes = Array.prototype.slice.call(document.querySelectorAll("#settings-panel .tab-pane"));
  DOM.btnSettings = byId("btn-settings");
  DOM.btnCloseSettings = byId("btn-close-settings");

  DOM.btnRefresh = byId("btn-refresh");
  DOM.btnAiCreate = byId("btn-ai-create");
  
  DOM.btnFit = byId("btn-fit");
  DOM.toggleUnlinked = byId("toggle-unlinked");
  DOM.linkLayerList = byId("link-layer-list");
  DOM.linkSettings = byId("link-settings");
  DOM.cardsSettings = byId("cards-settings");
  DOM.engineList = byId("engine-list");
  DOM.nodeSettings = byId("node-settings");
  DOM.solverList = byId("solver-list");
  DOM.rendererList = byId("renderer-list");
  DOM.graph = byId("graph");
  DOM.graphPanel = byId("graph-panel");
  DOM.ctxMenu = byId("ctx-menu");
  DOM.aiCreateDialog = byId("graph-ai-create-dialog");
  DOM.aiCreateClose = byId("graph-ai-create-close");
  DOM.aiEnrichDialog = byId("graph-ai-enrich-dialog");
  DOM.aiEnrichClose = byId("graph-ai-enrich-close");
  DOM.aiCreateKind = byId("graph-ai-create-kind");
  DOM.aiCreateText = byId("graph-ai-create-text");
  DOM.aiCreatePrereqBtn = byId("graph-ai-create-prereq");
  DOM.aiCreatePreviewBtn = byId("graph-ai-create-preview");
  DOM.aiCreateRejectMnemonicBtn = byId("graph-ai-create-reject-mnemonic");
  DOM.aiCreateApplyBtn = byId("graph-ai-create-apply");
  DOM.aiCreatePrevBtn = byId("graph-ai-create-prev");
  DOM.aiCreateNextBtn = byId("graph-ai-create-next");
  DOM.aiCreateResultStatus = byId("graph-ai-create-result-status");
  DOM.aiCreatePreviewMode = byId("graph-ai-create-preview-mode");
  DOM.aiCreatePerf = byId("graph-ai-create-perf");
  DOM.aiCreatePrereqList = byId("graph-ai-create-prereq-list");
  DOM.aiCreatePreviewJson = byId("graph-ai-create-preview-json");
  DOM.aiCreatePreviewJsonPre = DOM.aiCreatePreviewJson ? DOM.aiCreatePreviewJson.querySelector("pre") : null;
  DOM.aiCreatePreviewFields = byId("graph-ai-create-preview-fields");
  DOM.aiCreatePreviewFieldsBody = DOM.aiCreatePreviewFields ? DOM.aiCreatePreviewFields.querySelector("tbody") : null;
  DOM.aiCreatePreviewTemplate = byId("graph-ai-create-preview-template");
  DOM.aiCreateTemplateCanvas = DOM.aiCreatePreviewTemplate ? DOM.aiCreatePreviewTemplate.querySelector(".graph-ai-template-canvas") : null;
  DOM.aiCreateResultsList = byId("graph-ai-create-results-list");
  DOM.aiEnrichNid = byId("graph-ai-enrich-nid");
  DOM.aiEnrichMode = byId("graph-ai-enrich-mode");
  DOM.aiEnrichPreviewBtn = byId("graph-ai-enrich-preview");
  DOM.aiEnrichApplyBtn = byId("graph-ai-enrich-apply");
  DOM.aiEnrichRejectMnemonicBtn = byId("graph-ai-enrich-reject-mnemonic");
  DOM.aiEnrichStatus = byId("graph-ai-enrich-status");
  DOM.aiEnrichPreviewMode = byId("graph-ai-enrich-preview-mode");
  DOM.aiEnrichPerf = byId("graph-ai-enrich-perf");
  DOM.aiEnrichPreviewJson = byId("graph-ai-enrich-preview-json");
  DOM.aiEnrichPreviewJsonPre = DOM.aiEnrichPreviewJson ? DOM.aiEnrichPreviewJson.querySelector("pre") : null;
  DOM.aiEnrichPreviewTemplate = byId("graph-ai-enrich-preview-template");
  DOM.aiEnrichTemplateCanvas = DOM.aiEnrichPreviewTemplate ? DOM.aiEnrichPreviewTemplate.querySelector(".graph-ai-template-canvas") : null;
  DOM.aiDuplicateDialog = byId("graph-ai-duplicate-dialog");
  DOM.aiDuplicateCancelBtn = byId("graph-ai-duplicate-cancel");
  DOM.aiDuplicateEnrichBtn = byId("graph-ai-duplicate-enrich");
  DOM.aiDuplicateCreateBtn = byId("graph-ai-duplicate-create");
  DOM.aiDuplicateExistingPre = DOM.aiDuplicateDialog ? DOM.aiDuplicateDialog.querySelector(".graph-ai-compare .graph-ai-preview-box:first-child pre") : null;
  DOM.aiDuplicateGeneratedPre = DOM.aiDuplicateDialog ? DOM.aiDuplicateDialog.querySelector(".graph-ai-compare .graph-ai-preview-box:last-child pre") : null;
  DOM.aiMnemonicRejectDialog = byId("graph-ai-mnemonic-reject-dialog");
  DOM.aiMnemonicRejectReason = byId("graph-ai-mnemonic-reject-reason");
  DOM.aiMnemonicRejectCancelBtn = byId("graph-ai-mnemonic-reject-cancel");
  DOM.aiMnemonicRejectApplyBtn = byId("graph-ai-mnemonic-reject-apply");
  DOM.aiEnrichFieldsDialog = byId("graph-ai-enrich-fields-dialog");
  DOM.aiEnrichFieldsList = byId("graph-ai-enrich-fields-list");
  DOM.aiEnrichFieldsCancelBtn = byId("graph-ai-enrich-fields-cancel");
  DOM.aiEnrichFieldsApplyBtn = byId("graph-ai-enrich-fields-apply");
  DOM.flowCanvas = null;
  DOM.flowCtx = null;
  DOM.graphEmpty = byId("graph-empty");
  DOM.hoverTip = byId("hover-tip");

  syncDebugPanelVisibility();

  


  if (DOM.btnEditor) {
    DOM.btnEditor.addEventListener("click", function () {
      var selectedId = STATE && STATE.selectedNodeId !== undefined && STATE.selectedNodeId !== null
        ? String(STATE.selectedNodeId)
        : "";
      var selectedNode = null;
      if (selectedId && STATE && STATE.activeIndexById && typeof STATE.activeIndexById.get === "function") {
        var mapped = STATE.activeIndexById.get(selectedId);
        var idx = Number(mapped);
        if (isFiniteNumber(idx) && idx >= 0 && idx < STATE.activeNodes.length) selectedNode = STATE.activeNodes[idx];
      }

      if (selectedNode && String(selectedNode.kind || "") === "family") {
        updateEditorVisibility(false);
        var openedFamily = openFamilyIdEditForNodeIdPort(String(selectedNode.id || ""));
        if (!openedFamily && typeof updateStatus === "function") updateStatus("Select a family hub first");
        return;
      }

      updateEditorVisibility(true);
      if (typeof openEmbeddedEditorForSelectedNote === "function") {
        var opened = !!openEmbeddedEditorForSelectedNote();
        if (!opened) {
          updateEditorVisibility(false);
          if (typeof updateStatus === "function") updateStatus("Select a note node first");
          return;
        }
      }
      if (typeof syncEmbeddedEditorRect === "function") syncEmbeddedEditorRect();
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
        callEngineApplyVisualStyles();
        return;
      }

      idx = Number(idx);
      if (idx < 0 || idx >= STATE.activeNodes.length) {
        STATE.contextNodeId = null;
        STATE.contextPointIndex = null;
        hideContextMenu();
        callEngineApplyVisualStyles();
        return;
      }

      var node = STATE.activeNodes[idx];
      if (!node) {
        hideContextMenu();
        return;
      }

      STATE.contextPointIndex = idx;
      STATE.contextNodeId = String(node.id || "");
      callEngineApplyVisualStyles();
      showContextMenu(node, evt);
    });
  }

  if (DOM.btnSettings) {
    DOM.btnSettings.addEventListener("click", function () {
      var nowClosed = DOM.settingsPanel.classList.contains("closed");
      updateSettingsVisibility(nowClosed);
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
      if (typeof closeEmbeddedEditorPanel === "function") closeEmbeddedEditorPanel();
      updateEditorVisibility(false);
      if (window.pycmd) {
        window.pycmd("refresh");
      } else {
        callEngineApplyGraphData(true);
      }
    });
  }

  if (DOM.btnAiCreate) {
    DOM.btnAiCreate.addEventListener("click", function () {
      if (!STATE.aiToolsAvailable) {
        updateStatus("AI addon inactive");
        return;
      }
      updateCreateDialogVisibility(true);
    });
  }
  if (DOM.aiCreatePreviewMode) {
    DOM.aiCreatePreviewMode.addEventListener("change", graphAiToggleCreatePreviewMode);
  }
  if (DOM.aiEnrichPreviewMode) {
    DOM.aiEnrichPreviewMode.addEventListener("change", graphAiToggleEnrichPreviewMode);
  }
  if (DOM.aiCreatePreviewBtn) {
    DOM.aiCreatePreviewBtn.addEventListener("click", function () {
      graphAiSendCreatePreview();
    });
  }
  if (DOM.aiCreatePrereqBtn) {
    DOM.aiCreatePrereqBtn.addEventListener("click", function () {
      graphAiSendCreatePreview();
    });
  }
  if (DOM.aiCreateApplyBtn) {
    DOM.aiCreateApplyBtn.addEventListener("click", function () {
      var preview = graphAiCurrentCreatePreview();
      if (!preview) {
        updateStatus("No create preview available");
        return;
      }
      var duplicates = Array.isArray(preview.duplicates) ? preview.duplicates : [];
      if (duplicates.length > 0) {
        graphAiOpenDuplicateDialog(preview);
        return;
      }
      graphAiSendCreateApply("create_new");
    });
  }
  if (DOM.aiCreateRejectMnemonicBtn) {
    DOM.aiCreateRejectMnemonicBtn.addEventListener("click", function () {
      var preview = graphAiCurrentCreatePreview();
      var mnemonic = preview && preview.card && preview.card.meta
        ? String(preview.card.meta.mnemonic || "")
        : "";
      if (!mnemonic) {
        updateStatus("No mnemonic to reject");
        return;
      }
      graphAiOpenMnemonicReject("create");
    });
  }
  if (DOM.aiCreatePrevBtn) {
    DOM.aiCreatePrevBtn.addEventListener("click", function () {
      if (!Array.isArray(GRAPH_AI.createResults) || !GRAPH_AI.createResults.length) return;
      GRAPH_AI.createIndex = (GRAPH_AI.createIndex - 1 + GRAPH_AI.createResults.length) % GRAPH_AI.createResults.length;
      graphAiRenderCreatePreviewState();
    });
  }
  if (DOM.aiCreateNextBtn) {
    DOM.aiCreateNextBtn.addEventListener("click", function () {
      if (!Array.isArray(GRAPH_AI.createResults) || !GRAPH_AI.createResults.length) return;
      GRAPH_AI.createIndex = (GRAPH_AI.createIndex + 1) % GRAPH_AI.createResults.length;
      graphAiRenderCreatePreviewState();
    });
  }
  if (DOM.aiEnrichPreviewBtn) {
    DOM.aiEnrichPreviewBtn.addEventListener("click", function () {
      graphAiSendEnrichPreview();
    });
  }
  if (DOM.aiEnrichApplyBtn) {
    DOM.aiEnrichApplyBtn.addEventListener("click", function () {
      if (!GRAPH_AI.enrichPatch || typeof GRAPH_AI.enrichPatch !== "object" || !Object.keys(GRAPH_AI.enrichPatch).length) {
        updateStatus("No enrich patch available");
        return;
      }
      graphAiOpenEnrichFieldsDialog();
    });
  }
  if (DOM.aiEnrichRejectMnemonicBtn) {
    DOM.aiEnrichRejectMnemonicBtn.addEventListener("click", function () {
      var mnemonic = GRAPH_AI.enrichPatch && typeof GRAPH_AI.enrichPatch === "object"
        ? String(GRAPH_AI.enrichPatch.Mnemonic || "")
        : "";
      if (!mnemonic) {
        updateStatus("No mnemonic to reject");
        return;
      }
      graphAiOpenMnemonicReject("enrich");
    });
  }
  if (DOM.aiDuplicateCancelBtn) {
    DOM.aiDuplicateCancelBtn.addEventListener("click", function () {
      graphAiCloseDuplicateDialog();
    });
  }
  if (DOM.aiDuplicateEnrichBtn) {
    DOM.aiDuplicateEnrichBtn.addEventListener("click", function () {
      var preview = GRAPH_AI.duplicatePreview && typeof GRAPH_AI.duplicatePreview === "object"
        ? GRAPH_AI.duplicatePreview
        : graphAiCurrentCreatePreview();
      var duplicates = Array.isArray(preview && preview.duplicates) ? preview.duplicates : [];
      if (!preview || !duplicates.length) {
        graphAiCloseDuplicateDialog();
        return;
      }
      var existingNid = Number(duplicates[0] && duplicates[0].nid || 0);
      if (!isFiniteNumber(existingNid) || existingNid <= 0) {
        graphAiCloseDuplicateDialog();
        return;
      }
      graphAiSendCreateApply("enrich_existing", existingNid);
    });
  }
  if (DOM.aiDuplicateCreateBtn) {
    DOM.aiDuplicateCreateBtn.addEventListener("click", function () {
      graphAiSendCreateApply("create_new");
    });
  }
  if (DOM.aiMnemonicRejectCancelBtn) {
    DOM.aiMnemonicRejectCancelBtn.addEventListener("click", function () {
      graphAiCloseMnemonicReject();
    });
  }
  if (DOM.aiMnemonicRejectApplyBtn) {
    DOM.aiMnemonicRejectApplyBtn.addEventListener("click", function () {
      graphAiSendMnemonicReject();
    });
  }
  if (DOM.aiEnrichFieldsCancelBtn) {
    DOM.aiEnrichFieldsCancelBtn.addEventListener("click", function () {
      graphAiCloseEnrichFieldsDialog();
    });
  }
  if (DOM.aiEnrichFieldsApplyBtn) {
    DOM.aiEnrichFieldsApplyBtn.addEventListener("click", function () {
      graphAiSendEnrichApplySelected();
    });
  }
  if (DOM.aiCreateClose) {
    DOM.aiCreateClose.addEventListener("click", function () {
      updateCreateDialogVisibility(false);
    });
  }
  if (DOM.aiCreateDialog) {
    DOM.aiCreateDialog.addEventListener("click", function (evt) {
      var target = evt && evt.target ? evt.target : null;
      if (!target || !target.classList) return;
      if (!target.classList.contains("graph-ai-dialog__backdrop")) return;
      updateCreateDialogVisibility(false);
    });
  }
  if (DOM.aiEnrichClose) {
    DOM.aiEnrichClose.addEventListener("click", function () {
      updateEnrichDialogVisibility(false);
    });
  }
  if (DOM.aiEnrichDialog) {
    DOM.aiEnrichDialog.addEventListener("click", function (evt) {
      var target = evt && evt.target ? evt.target : null;
      if (!target || !target.classList) return;
      if (!target.classList.contains("graph-ai-dialog__backdrop")) return;
      updateEnrichDialogVisibility(false);
    });
  }
  if (DOM.aiDuplicateDialog) {
    DOM.aiDuplicateDialog.addEventListener("click", function (evt) {
      var target = evt && evt.target ? evt.target : null;
      if (!target || !target.classList) return;
      if (!target.classList.contains("graph-ai-dialog__backdrop")) return;
      graphAiCloseDuplicateDialog();
    });
  }
  if (DOM.aiMnemonicRejectDialog) {
    DOM.aiMnemonicRejectDialog.addEventListener("click", function (evt) {
      var target = evt && evt.target ? evt.target : null;
      if (!target || !target.classList) return;
      if (!target.classList.contains("graph-ai-dialog__backdrop")) return;
      graphAiCloseMnemonicReject();
    });
  }
  if (DOM.aiEnrichFieldsDialog) {
    DOM.aiEnrichFieldsDialog.addEventListener("click", function (evt) {
      var target = evt && evt.target ? evt.target : null;
      if (!target || !target.classList) return;
      if (!target.classList.contains("graph-ai-dialog__backdrop")) return;
      graphAiCloseEnrichFieldsDialog();
    });
  }

  if (DOM.btnFit) {
    DOM.btnFit.addEventListener("click", function () {
      callEngineGraph("fitView", 380, 0.14);
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
        } else {
          pickedId = firstSearchMatchId(DOM.searchInput.value || "");
        }
        if (pickedId) callEngineFocusNodeById(pickedId, true);
        return;
      }
      if (evt.key === "Escape") {
        hideSuggest();
      }
    });
  }

  if (DOM.searchGo) {
    DOM.searchGo.addEventListener("click", function () {
      var id = STATE.suggestedIds.length
        ? STATE.suggestedIds[0]
        : firstSearchMatchId(DOM.searchInput ? (DOM.searchInput.value || "") : "");
      if (id) callEngineFocusNodeById(id, true);
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

  if (typeof syncDebugPerfMonitor === "function") syncDebugPerfMonitor();
  graphAiWireGlobalCallbacks();
  graphAiToggleCreatePreviewMode();
  graphAiToggleEnrichPreviewMode();
  syncAiControlVisibility();
  graphAiPycmd("status");
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
  window.addEventListener("keydown", function (evt) {
    if (!evt || evt.key !== "Escape") return;
    var createOpen = !!(DOM.aiCreateDialog && !DOM.aiCreateDialog.classList.contains("is-hidden"));
    var enrichOpen = !!(DOM.aiEnrichDialog && !DOM.aiEnrichDialog.classList.contains("is-hidden"));
    var dupOpen = !!(DOM.aiDuplicateDialog && !DOM.aiDuplicateDialog.classList.contains("is-hidden"));
    var rejectOpen = !!(DOM.aiMnemonicRejectDialog && !DOM.aiMnemonicRejectDialog.classList.contains("is-hidden"));
    var fieldsOpen = !!(DOM.aiEnrichFieldsDialog && !DOM.aiEnrichFieldsDialog.classList.contains("is-hidden"));
    if (!createOpen && !enrichOpen && !dupOpen && !rejectOpen && !fieldsOpen) return;
    evt.preventDefault();
    if (createOpen) updateCreateDialogVisibility(false);
    if (enrichOpen) updateEnrichDialogVisibility(false);
    if (dupOpen) graphAiCloseDuplicateDialog();
    if (rejectOpen) graphAiCloseMnemonicReject();
    if (fieldsOpen) graphAiCloseEnrichFieldsDialog();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      STATE.pointerInsideGraph = false;
      clearHoverNodeState("document-hidden");
    }
  });
}

(function registerUiAdapterPorts() {
  var gw = uiGateway();
  if (!gw || typeof gw.registerCityPortWithContract !== "function") return;

  function reg(name, fn) {
    gw.registerCityPortWithContract(name, fn, uiCityPortContract(name));
  }

  reg("updateStatus", updateStatus);
  reg("showTooltip", showTooltip);
  reg("moveTooltip", moveTooltip);
  reg("setHoverDebug", setHoverDebug);
  reg("clearHoverNodeState", clearHoverNodeState);
  reg("hideTooltip", hideTooltip);
  reg("hideContextMenu", hideContextMenu);
  reg("buildSearchEntries", buildSearchEntries);
  reg("hideSuggest", hideSuggest);
  reg("openEmbeddedEditorForNodeId", openEmbeddedEditorForNodeIdPort);
  reg("openFamilyIdEditForNodeId", openFamilyIdEditForNodeIdPort);
})();

window.openAiEnrichDialogForNodeId = graphAiOpenEnrichForNodeId;



