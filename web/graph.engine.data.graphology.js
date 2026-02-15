"use strict";

var AJPC_CIRCLEPACK_SEED_HIERARCHY = [
  "grp_family_cluster",
  "grp_layer_primary",
  "grp_note_type_id"
  
];

function adapterCallCityPort(name) {
  var gw = window && window.AjpcEngineGateway;
  if (!gw || typeof gw.callCity !== "function") return undefined;
  return gw.callCity.apply(gw, arguments);
}

function adapterSeededPos(id) {
  var out = adapterCallCityPort("seededPos", id);
  if (Array.isArray(out) && out.length >= 2) return out;
  return [0, 0];
}

function adapterNodeBaseSize(node) {
  var out = adapterCallCityPort("AjpcNodeBaseSize", node);
  var n = Number(out);
  if (isFinite(n) && n > 0) return n;
  return 1;
}

function adapterEdgeCurvByStyle(code, idx) {
  var gw = window && window.AjpcEngineGateway;
  if (!gw || typeof gw.callEngine !== "function") return 0;
  var out = Number(gw.callEngine("edgeCurvByStyle", code, idx));
  return isFinite(out) ? out : 0;
}

function stableMetaSerialize(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i += 1) arr.push(stableMetaSerialize(value[i]));
    return "[" + arr.join(",") + "]";
  }
  if (typeof value === "object") {
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      parts.push(JSON.stringify(key) + ":" + stableMetaSerialize(value[key]));
    }
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

function stableEdgeIdFromRecord(edge) {
  var e = edge && typeof edge === "object" ? edge : {};
  var src = String(e.source !== undefined && e.source !== null ? e.source : "");
  var dst = String(e.target !== undefined && e.target !== null ? e.target : "");
  var layer = String(e.layer || "");
  var metaSig = stableMetaSerialize(e.meta || {});
  return "ed:" + src + "|" + dst + "|" + layer + "|" + metaSig;
}

function ajpcCreateSeedGraph() {
  var api = window && window.graphology ? window.graphology : null;
  if (!api) return null;
  try {
    if (typeof api === "function") {
      return new api({ type: "undirected", multi: false, allowSelfLoops: false });
    }
  } catch (_e) {}
  try {
    if (api.Graph && typeof api.Graph === "function") {
      return new api.Graph({ type: "undirected", multi: false, allowSelfLoops: false });
    }
  } catch (_e2) {}
  return null;
}

function ajpcHasLayer(node, key) {
  if (!node || !Array.isArray(node.layers)) return false;
  var k = String(key || "");
  if (!k) return false;
  for (var i = 0; i < node.layers.length; i += 1) {
    if (String(node.layers[i] || "") === k) return true;
  }
  return false;
}

function ajpcSeedNodeSize(node) {
  return adapterNodeBaseSize(node);
}

function ajpcPrimaryFamilyId(node) {
  var n = node && typeof node === "object" ? node : {};
  var kind = String(n.kind || "");
  var id = String(n.id || "");

  if (kind === "family" && id.indexOf("family:") === 0) {
    var hubFid = id.slice(7);
    if (hubFid) return hubFid;
  }

  var famMap = n.family_prios && typeof n.family_prios === "object" ? n.family_prios : {};
  var keys = Object.keys(famMap).map(function (k) { return String(k || ""); }).filter(Boolean);
  if (!keys.length) return "";
  keys.sort(function (a, b) {
    var ap = Number(famMap[a]);
    var bp = Number(famMap[b]);
    if (!isFinite(ap)) ap = 999999;
    if (!isFinite(bp)) bp = 999999;
    if (ap !== bp) return ap - bp;
    return a.localeCompare(b);
  });
  return keys[0] || "";
}

function ajpcBuildSeedPositionMap(nodes) {
  var out = new Map();
  if (!Array.isArray(nodes) || !nodes.length) return out;

  var circlePack = window && typeof window.GraphologyLayoutCirclePack === "function"
    ? window.GraphologyLayoutCirclePack
    : null;
  if (!circlePack) return out;

  var graph = ajpcCreateSeedGraph();
  if (!graph) return out;

  nodes.forEach(function (node) {
    var id = String(node && node.id !== undefined && node.id !== null ? node.id : "");
    if (!id) return;

    var layers = Array.isArray(node && node.layers) ? node.layers : [];
    var primaryLayer = layers.length ? String(layers[0] || "") : "";
    var noteTypeId = String(node && node.note_type_id !== undefined && node.note_type_id !== null ? node.note_type_id : "");
    var primaryFamily = ajpcPrimaryFamilyId(node);
    var hasFamilies = ajpcHasLayer(node, "families") ? 1 : 0;
    var familyCluster = primaryFamily
      ? ("family:" + primaryFamily)
      : ("nofamily:" + (noteTypeId || "unknown"));

    try {
      graph.addNode(id, {
        size: ajpcSeedNodeSize(node),
        grp_family_cluster: familyCluster,
        grp_note_type_id: noteTypeId,
        grp_has_families: hasFamilies,
        grp_layer_primary: primaryLayer
      });
    } catch (_e3) {}
  });

  var positions = null;
  try {
    positions = circlePack(graph, {
      hierarchyAttributes: AJPC_CIRCLEPACK_SEED_HIERARCHY.slice(),
      attributes: { x: "x", y: "y" },
      center: 0,
      scale: 1
    });
  } catch (_e4) {
    return out;
  }
  if (!positions || typeof positions !== "object") return out;

  var minX = Infinity;
  var maxX = -Infinity;
  var minY = Infinity;
  var maxY = -Infinity;
  var valid = 0;

  nodes.forEach(function (node) {
    var id = String(node && node.id !== undefined && node.id !== null ? node.id : "");
    if (!id) return;
    var pos = positions[id];
    if (!pos || typeof pos !== "object") return;
    var x = Number(pos.x);
    var y = Number(pos.y);
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    valid += 1;
  });
  if (!valid) return out;

  var srcW = Math.max(maxX - minX, 1e-9);
  var srcH = Math.max(maxY - minY, 1e-9);
  var targetMin = Number(SPACE_MARGIN);
  var targetMax = Number(SPACE_SIZE) - Number(SPACE_MARGIN);
  var targetW = Math.max(targetMax - targetMin, 1);
  var targetH = targetW;
  var scale = Math.min(targetW / srcW, targetH / srcH);
  if (!isFinite(scale) || scale <= 0) scale = 1;

  var srcCx = (minX + maxX) * 0.5;
  var srcCy = (minY + maxY) * 0.5;
  var dstCx = Number(SPACE_SIZE) * 0.5;
  var dstCy = Number(SPACE_SIZE) * 0.5;

  nodes.forEach(function (node) {
    var id = String(node && node.id !== undefined && node.id !== null ? node.id : "");
    if (!id) return;
    var pos = positions[id];
    if (!pos || typeof pos !== "object") return;
    var x = Number(pos.x);
    var y = Number(pos.y);
    if (!isFinite(x) || !isFinite(y)) return;
    var nx = ((x - srcCx) * scale) + dstCx;
    var ny = ((y - srcCy) * scale) + dstCy;
    out.set(id, [nx, ny]);
  });

  return out;
}

window.AjpcBuildSeedPositionMap = ajpcBuildSeedPositionMap;

function AjpcGraphDataGraphology(owner) {
  this.owner = owner;
  this.graph = mkGraph();
  if (!this.graph) {
    lg("error", "Graphology API missing");
    throw new Error("Graphology API not found");
  }
}

AjpcGraphDataGraphology.prototype.getGraph = function () {
  return this.graph;
};

AjpcGraphDataGraphology.prototype.buildGraph = function () {
  var owner = this.owner;
  var graph = this.graph;

  graph.clear();
  owner.edgeIdByIndex = [];
  owner.edgeIndexById = new Map();

  var hiddenNodeCount = 0;
  var hiddenEdgeCount = 0;
  var edgeTypeCounts = {};
  var nodeTypeCounts = {};

  var o = off();
  var nodeCount = owner.idByIndex.length;

  for (var i = 0; i < nodeCount; i += 1) {
    var id = owner.idByIndex[i];
    if (!id) continue;

    var x = Number(owner.pointPositions[i * 2]);
    var y = Number(owner.pointPositions[(i * 2) + 1]);
    if (!fin(x) || !fin(y)) {
      var seed = adapterSeededPos(id);
      x = Number(seed[0]);
      y = Number(seed[1]);
      owner.pointPositions[i * 2] = x;
      owner.pointPositions[(i * 2) + 1] = y;
    }

    var size = Number(owner.pointSizes[i]);
    var alpha = Number(owner.pointColors[(i * 4) + 3] || 0);
    var type = owner._useCustomNodeTypes ? nodeTypeByCode(owner.pointTypeCodes, i) : "circle";
    var hidden = !fin(size) || size <= 0 || !fin(alpha) || alpha <= 0.001;

    if (!fin(size) || size <= 0) size = DNS;
    if (hidden) hiddenNodeCount += 1;
    nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;

    var extraAttrs = owner.nodeLayoutAttrsById && typeof owner.nodeLayoutAttrsById.get === "function"
      ? owner.nodeLayoutAttrsById.get(String(id))
      : null;
    var nodeAttrs = {
      x: x - o,
      y: y - o,
      size: size,
      color: rgba(owner.pointColors, i, DNC),
      type: type,
      label: null,
      hidden: hidden,
      forceLabel: false,
      zIndex: i
    };
    if (extraAttrs && typeof extraAttrs === "object") {
      Object.keys(extraAttrs).forEach(function (k) {
        nodeAttrs[k] = extraAttrs[k];
      });
    }

    graph.addNode(id, nodeAttrs);
  }

  var edgeCount = Math.floor(owner.linksFlat.length / 2);
  for (var e = 0; e < edgeCount; e += 1) {
    var s = Number(owner.linksFlat[e * 2]) | 0;
    var t = Number(owner.linksFlat[(e * 2) + 1]) | 0;
    if (s < 0 || s >= nodeCount || t < 0 || t >= nodeCount || s === t) continue;

    var sid = owner.idByIndex[s];
    var tid = owner.idByIndex[t];
    if (!sid || !tid) continue;

    var edgeRecord = (owner.edgeDataByIndex && owner.edgeDataByIndex.length > e) ? owner.edgeDataByIndex[e] : null;
    var edgeId = edgeRecord ? stableEdgeIdFromRecord(edgeRecord) : ("e:" + e);
    var width = Number(owner.linkWidths[e]);
    if (!fin(width) || width <= 0) width = DES;

    var styleCodeValue = styleCode(owner.linkStyleCodes, e);
    var edgeType = edgeTypeByStyle(styleCodeValue);
    var curvature = adapterEdgeCurvByStyle(styleCodeValue, e);
    var alphaMultiplier = alphaMul(styleCodeValue);

    var weight = Number(owner.linkStrength[e]);
    if (!fin(weight) || weight <= 0) weight = 1;

    var edgeAlpha = Number(owner.linkColors[(e * 4) + 3] || 0);
    var hiddenEdge = !fin(width) || width <= 0 || !fin(edgeAlpha) || edgeAlpha <= 0.001;
    var flow = (owner.linkFlowMask && owner.linkFlowMask.length > e && owner.linkFlowMask[e]) ? 1 : 0;
    var bidir = (owner.linkBidirMask && owner.linkBidirMask.length > e && owner.linkBidirMask[e]) ? 1 : 0;

    if (hiddenEdge) hiddenEdgeCount += 1;
    edgeTypeCounts[edgeType] = (edgeTypeCounts[edgeType] || 0) + 1;

    try {
      graph.addDirectedEdgeWithKey(edgeId, sid, tid, {
        size: width,
        weight: weight,
        color: rgbaM(owner.linkColors, e, DEC, alphaMultiplier),
        type: edgeType,
        curvature: curvature,
        label: null,
        hidden: hiddenEdge,
        ajpc_flow: flow,
        ajpc_bidir: bidir,
        forceLabel: false,
        zIndex: e
      });
      owner.edgeIdByIndex[e] = edgeId;
      owner.edgeIndexById.set(edgeId, e);
    } catch (_e) {}
  }

  dbg("build", {
    nodes: nodeCount,
    edges: edgeCount,
    hiddenNodes: hiddenNodeCount,
    hiddenEdges: hiddenEdgeCount,
    nodeTypes: nodeTypeCounts,
    edgeTypes: edgeTypeCounts
  });
};

AjpcGraphDataGraphology.prototype.styleGraph = function () {
  var owner = this.owner;
  var graph = this.graph;
  if (!graph) return;

  for (var i = 0; i < owner.idByIndex.length; i += 1) {
    var nodeId = owner.idByIndex[i];
    if (!nodeId || !graph.hasNode(nodeId)) continue;

    var size = Number(owner.pointSizes[i]);
    var alpha = Number(owner.pointColors[(i * 4) + 3] || 0);
    var type = owner._useCustomNodeTypes ? nodeTypeByCode(owner.pointTypeCodes, i) : "circle";
    var hidden = !fin(size) || size <= 0 || !fin(alpha) || alpha <= 0.001;
    if (!fin(size) || size <= 0) size = DNS;

    graph.mergeNodeAttributes(nodeId, {
      size: size,
      color: rgba(owner.pointColors, i, DNC),
      type: type,
      hidden: hidden
    });
  }

  var edgeCount = Math.floor(owner.linksFlat.length / 2);
  for (var e = 0; e < edgeCount; e += 1) {
    var edgeId = owner.edgeIdByIndex[e];
    if (!edgeId || !graph.hasEdge(edgeId)) continue;

    var width = Number(owner.linkWidths[e]);
    if (!fin(width) || width <= 0) width = DES;

    var styleCodeValue = styleCode(owner.linkStyleCodes, e);
    var edgeType = edgeTypeByStyle(styleCodeValue);
    var curvature = adapterEdgeCurvByStyle(styleCodeValue, e);
    var alphaMultiplier = alphaMul(styleCodeValue);

    var weight = Number(owner.linkStrength[e]);
    if (!fin(weight) || weight <= 0) weight = 1;

    var edgeAlpha = Number(owner.linkColors[(e * 4) + 3] || 0);
    var hidden = !fin(width) || width <= 0 || !fin(edgeAlpha) || edgeAlpha <= 0.001;
    var flow = (owner.linkFlowMask && owner.linkFlowMask.length > e && owner.linkFlowMask[e]) ? 1 : 0;
    var bidir = (owner.linkBidirMask && owner.linkBidirMask.length > e && owner.linkBidirMask[e]) ? 1 : 0;

    graph.mergeEdgeAttributes(edgeId, {
      size: width,
      weight: weight,
      color: rgbaM(owner.linkColors, e, DEC, alphaMultiplier),
      type: edgeType,
      curvature: curvature,
      hidden: hidden,
      ajpc_flow: flow,
      ajpc_bidir: bidir
    });
  }
};
