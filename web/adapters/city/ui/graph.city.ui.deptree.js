"use strict";

// Dep-tree UI module (extracted from graph.city.ui.js)

function depTreeCallEngine(name) {
  var gw = window && window.AjpcCityGateway;
  if (!gw || typeof gw.callEngine !== "function") return undefined;
  return gw.callEngine.apply(gw, arguments);
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
  return renderHtmlTemplate(
    `<div>
      <h3>Dependency Tree:</h3> {{nodes}} nodes | {{edges}} edges{{tail}}
    </div>`,
    {
      nodes: String(p.nodes.length),
      edges: String(p.edges.length),
      tail: tail
    }
  );
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

function depTreeHasData(payload) {
  var p = normalizeDepTreePayload(payload);
  return (p.nodes.length > 0) || (p.edges.length > 0);
}

function depTreeSetEmptyState(isEmpty) {
  if (!DOM.statusActiveDepTree || !DOM.statusActiveDepTree.classList) return;
  DOM.statusActiveDepTree.classList.toggle("is-empty", !!isEmpty);
}

function depTreeRenderEmptyState(payload, text) {
  if (!DOM.statusActiveDepTree) return;
  depTreeSetEmptyState(true);
  DOM.statusActiveDepTree.innerHTML = renderHtmlTemplate(
    `<div class="dep-tree-empty">
      <p>{{message}}</p>
    </div>`,
    { message: String(text || "No dependency data") }
  );
  DOM.statusActiveDepTreeCanvas = null;
}

function depTreeCanvasHeight(payload) {
  var p = normalizeDepTreePayload(payload);
  if (!depTreeHasData(p)) return 32;
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
  depTreeSetEmptyState(false);
  var canvas = DOM.statusActiveDepTreeCanvas;
  if (canvas && canvas.parentNode !== DOM.statusActiveDepTree) canvas = null;
  if (!canvas) {
    DOM.statusActiveDepTree.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "dep-tree-canvas";
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
      var focusId = depTreeResolveActiveNodeIdFromHit(hit);
      if (!focusId) return;
      depTreeCallEngine("focusNodeById", focusId, true);
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

function depTreeResolveActiveNodeIdFromHit(hit) {
  var h = hit && typeof hit === "object" ? hit : {};
  var fromId = depTreeResolveActiveNodeId(String(h.id || ""));
  if (fromId) return fromId;

  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : null;
  if (!byId) return "";

  var nid = Number(h.nid || 0);
  if (!isFiniteNumber(nid) || nid <= 0) return "";
  nid = Math.round(nid);

  var raw = String(nid);
  if (byId.has(raw)) return raw;
  var prefixed = "n" + raw;
  if (byId.has(prefixed)) return prefixed;
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
      var raw = (STATE.linkColors && STATE.linkColors.priority)
        ? STATE.linkColors.priority
        : ((STATE.layerColors && STATE.layerColors.priority) ? STATE.layerColors.priority : "#3d95e7");
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
    var raw = (STATE.linkColors && STATE.linkColors.priority)
      ? STATE.linkColors.priority
      : ((STATE.layerColors && STATE.layerColors.priority) ? STATE.layerColors.priority : "#3d95e7");
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
  if (!depTreeHasData(p)) {
    depTreeRenderEmptyState(p, "No dependency data");
    return;
  }
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
    depTreeRenderEmptyState(p, "No dependency data");
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
    depTreeSetEmptyState(false);
    DOM.statusActiveDepTree.innerHTML = "";
    DOM.statusActiveDepTreeCanvas = null;
    resetDepTreeRenderState();
    return;
  }
  var cache = depTreeCacheMap();
  if (cache.has(nid)) {
    var payload = cache.get(nid);
    if (!depTreeHasData(payload)) {
      depTreeRenderEmptyState(payload, "No dependency data");
      markDepTreeRendered(nid, payload);
      return;
    }
    if (!shouldRenderDepTreeCanvas(nid, payload, false)) return;
    renderDepTreeCanvas(payload);
    markDepTreeRendered(nid, payload);
    return;
  }
  if (Number(STATE.depTreeLoadingNid || 0) !== nid || !DOM.statusActiveDepTreeCanvas) {
    depTreeSetEmptyState(false);
    DOM.statusActiveDepTree.innerHTML = renderHtmlTemplate(
      `<div>
        <h3>Dependency Tree:</h3> {{status}}
      </div>`,
      { status: "loading..." }
    );
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
  if (!depTreeHasData(p)) {
    depTreeRenderEmptyState(p, "No dependency data");
    markDepTreeRendered(nid, p);
    return;
  }
  if (!shouldRenderDepTreeCanvas(nid, p, false)) return;
  renderDepTreeCanvas(p);
  markDepTreeRendered(nid, p);
};


