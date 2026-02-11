"use strict";

function getEngineSettings() {
  if (window.ajpcEngineSettings && typeof window.ajpcEngineSettings === "object") {
    return window.ajpcEngineSettings;
  }
  return {};
}

function getEngineSolverDefaults() {
  var settings = getEngineSettings();
  var solver = settings && settings.solver && typeof settings.solver === "object"
    ? settings.solver
    : null;
  if (solver && solver.defaults && typeof solver.defaults === "object") {
    return Object.assign({}, solver.defaults);
  }
  return {};
}

function getEngineSolverSpec() {
  var settings = getEngineSettings();
  var solver = settings && settings.solver && typeof settings.solver === "object"
    ? settings.solver
    : null;
  if (solver && Array.isArray(solver.spec)) {
    return solver.spec.slice();
  }
  return [];
}

function getEngineRuntimeDefaults() {
  var settings = getEngineSettings();
  var engine = settings && settings.engine && typeof settings.engine === "object"
    ? settings.engine
    : null;
  if (engine && engine.defaults && typeof engine.defaults === "object") {
    return Object.assign({}, engine.defaults);
  }
  return {};
}

function getEngineRuntimeSpec() {
  var settings = getEngineSettings();
  var engine = settings && settings.engine && typeof settings.engine === "object"
    ? settings.engine
    : null;
  if (engine && Array.isArray(engine.spec)) {
    return engine.spec.slice();
  }
  return [];
}

function getEngineRendererDefaults() {
  var settings = getEngineSettings();
  var renderer = settings && settings.renderer && typeof settings.renderer === "object"
    ? settings.renderer
    : null;
  if (renderer && renderer.defaults && typeof renderer.defaults === "object") {
    return Object.assign({}, renderer.defaults);
  }
  return {};
}

function getEngineRendererSpec() {
  var settings = getEngineSettings();
  var renderer = settings && settings.renderer && typeof settings.renderer === "object"
    ? settings.renderer
    : null;
  if (renderer && Array.isArray(renderer.spec)) {
    return renderer.spec.slice();
  }
  return [];
}

function collectEngineSettings(input, defaults) {
  var src = (input && typeof input === "object") ? input : {};
  var srcDefaults = defaults && typeof defaults === "object" ? defaults : {};
  var out = Object.assign({}, srcDefaults);

  Object.keys(srcDefaults).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) return;
    out[key] = src[key];
  });

  return out;
}

function collectSolverSettings(input) {
  return collectEngineSettings(input, getEngineSolverDefaults());
}

function collectEngineRuntimeSettings(input) {
  return collectEngineSettings(input, getEngineRuntimeDefaults());
}

function collectRendererSettings(input) {
  return collectEngineSettings(input, getEngineRendererDefaults());
}

var AJPC_NODE_SETTINGS_DEFAULTS = {
  node_degree_size_factor: 0.18
};

var AJPC_NODE_SETTINGS_SPEC = [
  {
    key: "node_degree_size_factor",
    label: "Degree Size Factor",
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    affectsEngine: true,
    hint: "Scales node size by degree: size = base * (1 + k * sqrt(degree))."
  }
];

window.ajpcNodeSettings = {
  defaults: Object.assign({}, AJPC_NODE_SETTINGS_DEFAULTS),
  spec: AJPC_NODE_SETTINGS_SPEC.slice()
};

function getNodeSettingsDefaults() {
  var src = window.ajpcNodeSettings && typeof window.ajpcNodeSettings === "object"
    ? window.ajpcNodeSettings
    : null;
  if (src && src.defaults && typeof src.defaults === "object") {
    return Object.assign({}, src.defaults);
  }
  return Object.assign({}, AJPC_NODE_SETTINGS_DEFAULTS);
}

function getNodeSettingsSpec() {
  var src = window.ajpcNodeSettings && typeof window.ajpcNodeSettings === "object"
    ? window.ajpcNodeSettings
    : null;
  if (src && Array.isArray(src.spec)) return src.spec.slice();
  return AJPC_NODE_SETTINGS_SPEC.slice();
}

function collectNodeSettings(input) {
  return collectEngineSettings(input, getNodeSettingsDefaults());
}

function normalizeLayerKey(layer, context) {
  var key = String(layer === undefined || layer === null ? "" : layer).trim().toLowerCase();
  if (!key) return "";
  key = key.replace(/[\s-]+/g, "_");
  if (key === "familyhub") key = "family_hub";
  if (key === "masslinker") key = "mass_linker";
  if (key === "notelinks" || key === "note_link") key = "note_links";
  if (key === "familygate") key = "family";
  if (key === "family_hub") return "families";
  if (key === "reference") return "note_links";
  if (key === "example") return "examples";
  if (key === "mass_linker") return "mass_links";
  if (key === "family") {
    if (context === "node") return "notes";
    return "priority";
  }
  return key;
}

function normalizeLayerList(layers, context) {
  var out = [];
  var seen = new Set();
  if (!Array.isArray(layers)) return out;
  layers.forEach(function (layer) {
    var key = normalizeLayerKey(layer, context);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

function normalizeLayerMap(map, context) {
  var src = map && typeof map === "object" ? map : {};
  var out = {};
  Object.keys(src).forEach(function (rawKey) {
    var key = normalizeLayerKey(rawKey, context);
    if (!key) return;
    out[key] = src[rawKey];
  });
  return out;
}

function normalizeNode(node) {
  var n = node && typeof node === "object" ? node : {};
  var id = String(n.id !== undefined && n.id !== null ? n.id : "");
  var layers = normalizeLayerList(n.layers, "node");
  return {
    id: id,
    label: String(n.label || id),
    kind: String(n.kind || "note"),
    note_type_id: (n.note_type_id !== undefined && n.note_type_id !== null) ? String(n.note_type_id) : "",
    note_type: String(n.note_type || ""),
    layers: layers,
    family_prios: n.family_prios && typeof n.family_prios === "object" ? n.family_prios : {},
    extra: Array.isArray(n.extra) ? n.extra : [],
    cards: Array.isArray(n.cards) ? n.cards : []
  };
}

function normalizeEdge(edge) {
  var e = edge && typeof edge === "object" ? edge : {};
  return {
    source: String(e.source !== undefined && e.source !== null ? e.source : ""),
    target: String(e.target !== undefined && e.target !== null ? e.target : ""),
    layer: normalizeLayerKey(e.layer, "edge"),
    meta: (e.meta && typeof e.meta === "object") ? e.meta : {}
  };
}

function mergeExtraEdgeSets(meta) {
  var out = [];
  var keys = [
    "family_edges_direct",
    "family_edges_chain",
    "family_hub_edges_direct",
    "family_hub_edges_chain"
  ];

  keys.forEach(function (k) {
    var expectedLayer = (k.indexOf("hub") >= 0) ? "families" : "priority";
    var arr = meta && Array.isArray(meta[k]) ? meta[k] : [];
    arr.forEach(function (edge) {
      var e = normalizeEdge(edge);
      // Meta edge buckets are authoritative for layer assignment.
      e.layer = expectedLayer;
      out.push(e);
    });
  });

  return out;
}

function dedupeEdges(edges) {
  var seen = new Set();
  var out = [];

  edges.forEach(function (edge) {
    if (!edge.source || !edge.target) return;
    var metaKey = "";
    try {
      metaKey = JSON.stringify(edge.meta || {});
    } catch (_e) {
      metaKey = "";
    }
    var key = edge.source + "|" + edge.target + "|" + edge.layer + "|" + metaKey;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(edge);
  });

  return out;
}

function preparePayload(payload) {
  var raw = payload && typeof payload === "object" ? payload : {};
  var meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};

  var baseNodes = Array.isArray(raw.nodes) ? raw.nodes.map(normalizeNode) : [];
  var baseEdges = Array.isArray(raw.edges) ? raw.edges.map(normalizeEdge) : [];
  var extraEdges = mergeExtraEdgeSets(meta);

  return {
    nodes: baseNodes,
    edges: dedupeEdges(baseEdges.concat(extraEdges)),
    meta: meta
  };
}

function collectLayers(data) {
  var set = new Set();
  if (data.meta && Array.isArray(data.meta.layers)) {
    data.meta.layers.forEach(function (layer) {
      var key = normalizeLayerKey(layer, "edge");
      if (key) set.add(key);
    });
  }
  data.nodes.forEach(function (node) {
    node.layers.forEach(function (layer) {
      var key = normalizeLayerKey(layer, "node");
      if (key) set.add(key);
    });
  });
  data.edges.forEach(function (edge) {
    var key = normalizeLayerKey(edge.layer, "edge");
    if (key) set.add(key);
  });
  return Array.from(set.values()).filter(Boolean);
}

function buildLayerStats(data) {
  var stats = {};
  Object.keys(STATE.layers).forEach(function (layer) {
    stats[layer] = { nodes: 0, edges: 0 };
  });

  data.nodes.forEach(function (node) {
    node.layers.forEach(function (layer) {
      if (!stats[layer]) stats[layer] = { nodes: 0, edges: 0 };
      stats[layer].nodes += 1;
    });
  });

  data.edges.forEach(function (edge) {
    if (!edge.layer) return;
    if (!stats[edge.layer]) stats[edge.layer] = { nodes: 0, edges: 0 };
    stats[edge.layer].edges += 1;
  });

  return stats;
}

function ensureRuntimeState() {
  var data = STATE.raw;
  var meta = data.meta || {};
  var metaLayerEnabled = normalizeLayerMap(meta.layer_enabled || {}, "edge");
  var metaLayerColors = normalizeLayerMap(meta.layer_colors || {}, "edge");
  var metaLayerStyles = normalizeLayerMap(meta.layer_styles || {}, "edge");
  var metaLayerFlow = normalizeLayerMap(meta.layer_flow || {}, "edge");
  var metaLinkStrengths = normalizeLayerMap(meta.link_strengths || {}, "edge");
  var metaLinkDistances = normalizeLayerMap(meta.link_distances || {}, "edge");
  if (!Object.prototype.hasOwnProperty.call(metaLayerEnabled, "notes")
      && Object.prototype.hasOwnProperty.call(metaLayerEnabled, "priority")) {
    metaLayerEnabled.notes = metaLayerEnabled.priority;
  }

  var allLayers = collectLayers(data);
  var nextLayers = {};
  var nextLayerColors = {};

  allLayers.forEach(function (layer) {
    var hasPrevious = Object.prototype.hasOwnProperty.call(STATE.layers, layer);
    var metaEnabled = Object.prototype.hasOwnProperty.call(metaLayerEnabled, layer)
      ? !!metaLayerEnabled[layer]
      : true;
    nextLayers[layer] = hasPrevious ? !!STATE.layers[layer] : metaEnabled;

    if (Object.prototype.hasOwnProperty.call(metaLayerColors, layer) && metaLayerColors[layer]) {
      nextLayerColors[layer] = String(metaLayerColors[layer]);
    } else if (STATE.layerColors[layer]) {
      nextLayerColors[layer] = STATE.layerColors[layer];
    } else {
      nextLayerColors[layer] = fallbackLayerColor(layer);
    }
  });

  STATE.layers = nextLayers;
  STATE.layerColors = nextLayerColors;
  STATE.layerStyles = Object.assign({}, metaLayerStyles, normalizeLayerMap(STATE.layerStyles || {}, "edge"));
  STATE.layerFlow = Object.assign({}, metaLayerFlow, normalizeLayerMap(STATE.layerFlow || {}, "edge"));
  STATE.linkStrengths = Object.assign({}, metaLinkStrengths, normalizeLayerMap(STATE.linkStrengths || {}, "edge"));
  STATE.linkDistances = Object.assign({}, metaLinkDistances, normalizeLayerMap(STATE.linkDistances || {}, "edge"));

  if (!Object.prototype.hasOwnProperty.call(STATE.layerColors, "notes")) {
    if (Object.prototype.hasOwnProperty.call(STATE.layerColors, "priority")) {
      STATE.layerColors.notes = STATE.layerColors.priority;
    }
  }
  STATE.engine = collectEngineRuntimeSettings(Object.assign({}, meta.engine || {}, STATE.engine || {}));
  STATE.solver = collectSolverSettings(Object.assign({}, meta.solver || {}, STATE.solver || {}));
  STATE.renderer = collectRendererSettings(Object.assign({}, meta.renderer || {}, STATE.renderer || {}));
  STATE.node = collectNodeSettings(Object.assign({}, meta.node || {}, STATE.node || {}));
  STATE.neighborScaling = normalizeNeighborScaling(meta.neighbor_scaling || STATE.neighborScaling || null);
  if (meta.layer_flow_speed !== undefined && meta.layer_flow_speed !== null) {
    STATE.layerFlowSpeed = Number(meta.layer_flow_speed) || STATE.layerFlowSpeed;
  }
  var debugEnabled = !!STATE.debugEnabled;
  if (Object.prototype.hasOwnProperty.call(meta, "debug_enabled")) {
    debugEnabled = !!meta.debug_enabled;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "debug_mode")) {
    var modeRaw = String(meta.debug_mode === undefined || meta.debug_mode === null ? "" : meta.debug_mode).trim().toLowerCase();
    if (modeRaw === "1" || modeRaw === "true" || modeRaw === "on" || modeRaw === "debug") debugEnabled = true;
    if (modeRaw === "0" || modeRaw === "false" || modeRaw === "off" || modeRaw === "none") debugEnabled = false;
    STATE.debugMode = modeRaw || (debugEnabled ? "on" : "off");
  } else {
    STATE.debugMode = debugEnabled ? "on" : "off";
  }
  STATE.debugEnabled = debugEnabled;
  if (STATE.debugEnabled && typeof log === "function") {
    try {
      log(
        "payload.debug.state:"
        + JSON.stringify({
          debugMode: String(STATE.debugMode || ""),
          layers: Object.keys(STATE.layers || {}).length,
          noteTypes: Object.keys(STATE.noteTypes || {}).length
        })
      );
    } catch (_e) { }
  }

  if (STATE.isFirstRender) {
    STATE.showUnlinked = !!meta.show_unlinked;
  }

  var noteTypesArray = Array.isArray(meta.note_types) ? meta.note_types : [];
  var nextNoteTypes = {};

  noteTypesArray.forEach(function (entry) {
    var id = String(entry.id || "");
    if (!id) return;
    var prev = STATE.noteTypes[id] || {};
    var fields = Array.isArray(entry.fields) ? entry.fields.map(String) : [];
    var tooltipFields = Array.isArray(entry.tooltip_fields) ? entry.tooltip_fields.map(String) : [];

    nextNoteTypes[id] = {
      id: id,
      name: String(entry.name || id),
      color: normalizeHexColor(String((prev.color !== undefined ? prev.color : entry.color) || ""), "#93c5fd"),
      fields: fields,
      visible: (prev.visible !== undefined) ? !!prev.visible : !!entry.visible,
      labelField: (prev.labelField !== undefined) ? String(prev.labelField) : String(entry.label_field || ""),
      linkedField: (prev.linkedField !== undefined) ? String(prev.linkedField) : String(entry.linked_field || ""),
      tooltipFields: (prev.tooltipFields !== undefined) ? prev.tooltipFields.slice() : tooltipFields
    };
  });

  STATE.noteTypes = nextNoteTypes;
  STATE.layerStats = buildLayerStats(data);
}

function normalizeNeighborScaling(input) {
  var src = input && typeof input === "object" ? input : {};
  var modeRaw = String(src.mode || "none").toLowerCase();
  var directedRaw = String(src.directed || "undirected").toLowerCase();
  var mode = "none";
  if (modeRaw === "jaccard") mode = "jaccard";
  else if (modeRaw === "overlap") mode = "overlap";
  else if (modeRaw === "ccm" || modeRaw === "clustering" || modeRaw === "cluster" || modeRaw === "clustering_coefficient") mode = "ccm";
  else if (modeRaw === "twohop" || modeRaw === "two_hop") mode = "twohop";
  else if (modeRaw === "common_neighbors" || modeRaw === "common_neighbours" || modeRaw === "common" || modeRaw === "cn") mode = "common_neighbors";

  var directed = "undirected";
  if (directedRaw === "out") directed = "out";
  else if (directedRaw === "in") directed = "in";

  var weights = {};
  if (src.weights && typeof src.weights === "object") {
    Object.keys(src.weights).forEach(function (k) {
      var n = Number(src.weights[k]);
      if (isFinite(n)) weights[String(k)] = n;
    });
  }

  return { mode: mode, directed: directed, weights: weights };
}

function isNodeOnlyLayer(layer) {
  return layer === "notes" || layer === "examples" || layer === "mass_links" || layer === "kanji";
}

function nodeHasNodeOnlyLayer(node) {
  if (!node || !Array.isArray(node.layers)) return false;
  for (var i = 0; i < node.layers.length; i += 1) {
    if (isNodeOnlyLayer(node.layers[i])) return true;
  }
  return false;
}

function nodeHasLayer(node, layer) {
  if (!node || !Array.isArray(node.layers) || !layer) return false;
  return node.layers.indexOf(String(layer)) >= 0;
}

function nodeAllowedByLayer(node) {
  if (!Array.isArray(node.layers) || node.layers.length === 0) return true;
  var layers = node.layers;
  var hasNodeLayer = false;
  for (var i = 0; i < layers.length; i += 1) {
    var layer = layers[i];
    if (!isNodeOnlyLayer(layer)) continue;
    hasNodeLayer = true;
    if (STATE.layers[layer]) return true;
  }
  if (hasNodeLayer) return false;
  return layers.some(function (layer) { return !!STATE.layers[layer]; });
}

function nodeAllowedByNoteType(node) {
  if (node.kind !== "note") return true;
  var ntid = String(node.note_type_id || "");
  if (!ntid) return true;
  var nt = STATE.noteTypes[ntid];
  if (!nt) return true;
  return nt.visible !== false;
}

function edgeAllowedByLayer(edge) {
  if (!edge.layer) return true;
  if (!Object.prototype.hasOwnProperty.call(STATE.layers, edge.layer)) return false;
  return !!STATE.layers[edge.layer];
}

function buildActiveData() {
  var nodes = STATE.raw.nodes;
  var edges = STATE.raw.edges;

  var filteredEdges = edges.filter(edgeAllowedByLayer);
  var touchedByLayer = new Set();

  filteredEdges.forEach(function (edge) {
    touchedByLayer.add(edge.source);
    touchedByLayer.add(edge.target);
  });

  var visibleNodes = nodes.filter(function (node) {
    if (!nodeAllowedByNoteType(node)) return false;
    var baseAllowed = nodeAllowedByLayer(node);
    var bridgedFromNotes = !baseAllowed && touchedByLayer.has(node.id) && nodeHasLayer(node, "notes");
    if (!baseAllowed && !bridgedFromNotes) return false;
    if (STATE.showUnlinked) return baseAllowed ? true : touchedByLayer.has(node.id);
    if (baseAllowed && nodeHasNodeOnlyLayer(node)) return true;
    return touchedByLayer.has(node.id);
  });

  var visibleSet = new Set(visibleNodes.map(function (n) { return n.id; }));
  var visibleEdges = filteredEdges.filter(function (edge) {
    return visibleSet.has(edge.source) && visibleSet.has(edge.target);
  });

  if (!STATE.showUnlinked) {
    var linked = new Set();
    visibleEdges.forEach(function (edge) {
      linked.add(edge.source);
      linked.add(edge.target);
    });
    visibleNodes = visibleNodes.filter(function (node) {
      if (linked.has(node.id)) return true;
      // Keep notes nodes that are referenced by active edge layers even when
      // opposite endpoints are hidden by other layer toggles (e.g. priority-only).
      return touchedByLayer.has(node.id) && nodeHasLayer(node, "notes");
    });
    visibleSet = new Set(visibleNodes.map(function (n) { return n.id; }));
    visibleEdges = visibleEdges.filter(function (edge) {
      return visibleSet.has(edge.source) && visibleSet.has(edge.target);
    });
  }

  return { nodes: visibleNodes, edges: visibleEdges };
}

function nodeColor(node) {
  var color = "";

  if (node.kind === "note") {
    var ntid = String(node.note_type_id || "");
    if (ntid && STATE.noteTypes[ntid] && STATE.noteTypes[ntid].color) {
      color = STATE.noteTypes[ntid].color;
    }
  }

  if (!color && node.layers && node.layers.length) {
    color = STATE.layerColors[node.layers[0]] || fallbackLayerColor(node.layers[0]);
  }

  if (!color) {
    if (node.kind === "family") {
      color = STATE.layerColors.families || fallbackLayerColor("families");
    } else {
      color = "#93c5fd";
    }
  }

  var parsed = parseColor(color, 1);
  parsed[3] = 1;
  return parsed;
}

function ajpcNodeBaseSize(node) {
  var base = 1.5;
  if (node.kind === "family") base = 1;
  else if (node.kind === "note_type_hub") base = 1;
  else if (node.kind === "kanji") base = 1.1;
  else if (node.kind === "note") base = 1.5;
  return base;
}

window.AjpcNodeBaseSize = ajpcNodeBaseSize;

function getNodeDegreeSizeFactor() {
  var cfg = STATE && STATE.node && typeof STATE.node === "object" ? STATE.node : null;
  var defaults = getNodeSettingsDefaults();
  var raw = cfg && Object.prototype.hasOwnProperty.call(cfg, "node_degree_size_factor")
    ? cfg.node_degree_size_factor
    : defaults.node_degree_size_factor;
  var out = Number(raw);
  if (!isFinite(out)) out = Number(defaults.node_degree_size_factor || 0.18);
  return clamp(out, 0, 2);
}

function buildNodeDegreeArray(nodeCount, edgeRecords, edgeVisibleMask) {
  var n = Number(nodeCount || 0) | 0;
  var out = new Float32Array(n > 0 ? n : 0);
  if (!n || !Array.isArray(edgeRecords) || !edgeRecords.length) return out;

  for (var i = 0; i < edgeRecords.length; i += 1) {
    if (edgeVisibleMask && edgeVisibleMask.length > i && !edgeVisibleMask[i]) continue;
    var rec = edgeRecords[i];
    if (!rec) continue;
    var s = Number(rec.sourceIndex);
    var t = Number(rec.targetIndex);
    if (!isFinite(s) || !isFinite(t)) continue;
    s = s | 0;
    t = t | 0;
    if (s < 0 || t < 0 || s >= n || t >= n || s === t) continue;
    out[s] += 1;
    out[t] += 1;
  }
  return out;
}

function nodeSize(node, degree) {
  var base = Number(ajpcNodeBaseSize(node));
  if (!isFinite(base) || base <= 0) base = 1;
  var d = Number(degree || 0);
  if (!isFinite(d) || d < 0) d = 0;
  var k = getNodeDegreeSizeFactor();
  return base * (1 + (k * Math.sqrt(d)));
}
function nodeRenderTypeCode(node) {
  if (node && node.kind === "note") return 0;
  return 1;
}

function buildExternalSeedMap(nodes) {
  var fn = window && typeof window.AjpcBuildSeedPositionMap === "function"
    ? window.AjpcBuildSeedPositionMap
    : null;
  if (!fn) return new Map();
  try {
    var out = fn(nodes);
    if (out && typeof out.get === "function") return out;
  } catch (_e) {}
  return new Map();
}

function linkColor(edge) {
  var color = STATE.layerColors[edge.layer] || fallbackLayerColor(edge.layer);
  return parseColor(color, 0.58);
}

function linkWidth(edge) {
  var style = String(STATE.layerStyles[edge.layer] || "");
  var strength = Number(STATE.linkStrengths[edge.layer]);
  if (!isFinite(strength)) strength = 1;
  var base = 1.8 * strength;
  if (style === "dotted") return base * 0.55;
  if (style === "dashed") return base * 0.82;
  return base;
}

function linkStyleCode(edge) {
  var style = String(STATE.layerStyles[edge.layer] || "solid").toLowerCase();
  if (style === "dashed") return 1;
  if (style === "dotted") return 2;
  return 0;
}

function linkStyleModifiers(style) {
  var s = String(style || "solid");
  if (s === "dotted") return { width: 0.55, alpha: 0.35 };
  if (s === "dashed") return { width: 0.82, alpha: 0.56 };
  return { width: 1.0, alpha: 1.0 };
}

function edgeHasFlow(edge) {
  if (!edge || !edge.layer) return false;
  return !!STATE.layerFlow[String(edge.layer)];
}

function edgeMeta(edge) {
  if (!edge || !edge.meta || typeof edge.meta !== "object") return {};
  return edge.meta;
}

function buildFamilyHubDirectSuppressMask(edges) {
  var len = Array.isArray(edges) ? edges.length : 0;
  var mask = new Uint8Array(len);
  if (!len) return mask;

  var chainFids = new Set();
  var minHubPrioByFid = Object.create(null);
  var i;

  for (i = 0; i < len; i += 1) {
    var edge = edges[i];
    if (!edge || String(edge.layer || "") !== "families") continue;
    var meta = edgeMeta(edge);
    if (String(meta.kind || "") !== "chain") continue;
    var fid = String(meta.fid !== undefined && meta.fid !== null ? meta.fid : "");
    if (!fid) continue;
    chainFids.add(fid);
  }

  if (!chainFids.size) return mask;

  for (i = 0; i < len; i += 1) {
    var edge2 = edges[i];
    if (!edge2 || String(edge2.layer || "") !== "families") continue;
    var meta2 = edgeMeta(edge2);
    if (String(meta2.kind || "") !== "hub") continue;
    var target = String(edge2.target || "");
    if (target.indexOf("family:") !== 0) continue;
    var fid2 = String(meta2.fid !== undefined && meta2.fid !== null ? meta2.fid : "");
    if (!fid2 || !chainFids.has(fid2)) continue;
    var p = Number(meta2.prio);
    if (!isFinite(p)) continue;
    if (!Object.prototype.hasOwnProperty.call(minHubPrioByFid, fid2) || p < minHubPrioByFid[fid2]) {
      minHubPrioByFid[fid2] = p;
    }
  }

  for (i = 0; i < len; i += 1) {
    var edge3 = edges[i];
    if (!edge3 || String(edge3.layer || "") !== "families") continue;
    var meta3 = edgeMeta(edge3);
    if (String(meta3.kind || "") !== "hub") continue;
    var target3 = String(edge3.target || "");
    if (target3.indexOf("family:") !== 0) continue;
    var fid3 = String(meta3.fid !== undefined && meta3.fid !== null ? meta3.fid : "");
    if (!fid3 || !chainFids.has(fid3)) continue;
    var minPrio = Number(minHubPrioByFid[fid3]);
    var prio = Number(meta3.prio);
    if (!isFinite(minPrio) || !isFinite(prio)) continue;
    if (prio > minPrio) mask[i] = 1;
  }

  return mask;
}

function edgeIsFlowOnly(edge) {
  return !!edgeMeta(edge).flow_only;
}

function cloneEdgeForRender(edge, forceBidirectional) {
  var meta = Object.assign({}, edgeMeta(edge));
  delete meta.flow_only;
  if (forceBidirectional) {
    meta.bidirectional = true;
  }
  return {
    source: String(edge && edge.source !== undefined && edge.source !== null ? edge.source : ""),
    target: String(edge && edge.target !== undefined && edge.target !== null ? edge.target : ""),
    layer: String(edge && edge.layer ? edge.layer : ""),
    meta: meta
  };
}

function collapseEdgesForRendering(edges) {
  var groups = new Map();
  var order = [];

  edges.forEach(function (edge) {
    if (!edge || !edge.source || !edge.target) return;
    var source = String(edge.source);
    var target = String(edge.target);
    var layer = String(edge.layer || "");
    var a = source < target ? source : target;
    var b = source < target ? target : source;
    var key = a + "|" + b + "|" + layer;
    var group = groups.get(key);
    if (!group) {
      group = { a: a, b: b, edges: [], hasAB: false, hasBA: false };
      groups.set(key, group);
      order.push(key);
    }
    group.edges.push(edge);
    if (source === a && target === b) {
      group.hasAB = true;
    } else if (source === b && target === a) {
      group.hasBA = true;
    }
  });

  var out = [];
  order.forEach(function (key) {
    var group = groups.get(key);
    if (!group || !group.edges.length) return;

    var hasBidirectionalMeta = group.edges.some(function (edge) {
      return !!edgeMeta(edge).bidirectional;
    });
    var shouldMerge = hasBidirectionalMeta || (group.hasAB && group.hasBA);

    if (shouldMerge) {
      var representative = group.edges.find(function (edge) { return !edgeIsFlowOnly(edge); }) || group.edges[0];
      if (!representative) return;
      out.push(cloneEdgeForRender(representative, true));
      return;
    }

    group.edges.forEach(function (edge) {
      if (edgeIsFlowOnly(edge)) return;
      out.push(cloneEdgeForRender(edge, false));
    });
  });

  return out;
}

var LINK_DISTANCE_MIN_SCALE = 0.45;
var LINK_DISTANCE_MAX_SCALE = 1.0;
var LINK_DISTANCE_METRIC_STRENGTH = 0.7;
var LINK_STRENGTH_MIN_SCALE = 1.0;
var LINK_STRENGTH_MAX_SCALE = 1.7;
var CLUSTER_COEFF_EXACT_PAIR_LIMIT = 2048;
var CLUSTER_COEFF_SAMPLE_PAIRS = 1024;

function edgeLayerKey(edge) {
  var layer = String(edge && edge.layer ? edge.layer : "");
  var meta = edgeMeta(edge);
  if (layer === "kanji" && meta.kind === "component") return "kanji_component";
  return layer;
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

function solverLinkDistanceFallback() {
  var runtime = STATE.solver && typeof STATE.solver === "object" ? STATE.solver : {};
  var defaults = getEngineSolverDefaults();
  var value = pickSolverLinkDistance(runtime);
  if (!isFinite(value) || value <= 0) value = pickSolverLinkDistance(defaults);
  if (!isFinite(value) || value <= 0) value = 30;
  return clamp(value, 1, 5000);
}

function resolveBaseLinkDistance(edge) {
  var layer = edgeLayerKey(edge);
  var layerDistance = Number(STATE.linkDistances[layer]);
  if (isFinite(layerDistance) && layerDistance > 0) {
    return clamp(layerDistance, 1, 5000);
  }
  return solverLinkDistanceFallback();
}

function resolveBaseLinkStrength(edge) {
  var layer = edgeLayerKey(edge);
  var base = Number(STATE.linkStrengths[layer]);
  if (!isFinite(base) || base <= 0) base = 1;
  return clamp(base, 0.01, 50);
}

function createAdjacencySets(nodeCount) {
  var out = new Array(nodeCount);
  for (var i = 0; i < nodeCount; i += 1) out[i] = new Set();
  return out;
}

function addAdjacencyEdge(sets, a, b) {
  if (!sets || a === b || a < 0 || b < 0 || a >= sets.length || b >= sets.length) return;
  sets[a].add(b);
}

function buildAdjacencyRecords(records, nodeCount) {
  var outAdj = createAdjacencySets(nodeCount);
  var inAdj = createAdjacencySets(nodeCount);
  var undirectedAdj = createAdjacencySets(nodeCount);

  records.forEach(function (rec) {
    if (!rec) return;
    var s = Number(rec.sourceIndex);
    var t = Number(rec.targetIndex);
    if (!isFinite(s) || !isFinite(t) || s === t) return;
    addAdjacencyEdge(outAdj, s, t);
    addAdjacencyEdge(inAdj, t, s);
    addAdjacencyEdge(undirectedAdj, s, t);
    addAdjacencyEdge(undirectedAdj, t, s);

    var meta = edgeMeta(rec.edge);
    if (meta.bidirectional) {
      addAdjacencyEdge(outAdj, t, s);
      addAdjacencyEdge(inAdj, s, t);
    }
  });

  return { outAdj: outAdj, inAdj: inAdj, undirectedAdj: undirectedAdj };
}

function selectNeighborSets(adjacency, directedMode) {
  if (!adjacency) return [];
  if (directedMode === "out") return adjacency.outAdj;
  if (directedMode === "in") return adjacency.inAdj;
  return adjacency.undirectedAdj;
}

function countCommonNeighbors(aSet, bSet) {
  if (!aSet || !bSet || !aSet.size || !bSet.size) return 0;
  var small = aSet.size <= bSet.size ? aSet : bSet;
  var large = aSet.size <= bSet.size ? bSet : aSet;
  var count = 0;
  small.forEach(function (value) {
    if (large.has(value)) count += 1;
  });
  return count;
}

function jaccardCoefficient(aSet, bSet) {
  var common = countCommonNeighbors(aSet, bSet);
  if (common <= 0) return 0;
  var unionSize = aSet.size + bSet.size - common;
  if (unionSize <= 0) return 0;
  return common / unionSize;
}

function overlapCoefficient(aSet, bSet) {
  var common = countCommonNeighbors(aSet, bSet);
  if (common <= 0) return 0;
  var denom = Math.min(aSet.size, bSet.size);
  if (denom <= 0) return 0;
  return common / denom;
}

function computeLocalClusteringCoefficients(neighborSets) {
  var out = new Float32Array(neighborSets.length);
  for (var idx = 0; idx < neighborSets.length; idx += 1) {
    var set = neighborSets[idx];
    if (!set || set.size < 2) {
      out[idx] = 0;
      continue;
    }
    var neighbors = Array.from(set.values());
    var k = neighbors.length;
    var pairCount = (k * (k - 1)) / 2;
    if (pairCount <= 0) {
      out[idx] = 0;
      continue;
    }

    var edgesAmongNeighbors = 0;
    if (pairCount <= CLUSTER_COEFF_EXACT_PAIR_LIMIT) {
      for (var i = 0; i < k; i += 1) {
        var ni = neighbors[i];
        var niSet = neighborSets[ni];
        if (!niSet) continue;
        for (var j = i + 1; j < k; j += 1) {
          if (niSet.has(neighbors[j])) edgesAmongNeighbors += 1;
        }
      }
      out[idx] = edgesAmongNeighbors / pairCount;
      continue;
    }

    var sampledHits = 0;
    var samplePairs = CLUSTER_COEFF_SAMPLE_PAIRS;
    for (var s = 0; s < samplePairs; s += 1) {
      var ai = (s * 97) % k;
      var bi = (ai + 1 + ((s * 193) % (k - 1))) % k;
      if (bi === ai) bi = (bi + 1) % k;
      if (ai > bi) {
        var swap = ai;
        ai = bi;
        bi = swap;
      }
      var aNode = neighbors[ai];
      var bNode = neighbors[bi];
      var aSet = neighborSets[aNode];
      if (aSet && aSet.has(bNode)) sampledHits += 1;
    }
    out[idx] = sampledHits / samplePairs;
  }
  return out;
}

function computeTwoHopMetrics(neighborSets, clusteringCoefficients) {
  var out = new Float32Array(neighborSets.length);
  for (var idx = 0; idx < neighborSets.length; idx += 1) {
    var set = neighborSets[idx];
    if (!set || !set.size) {
      out[idx] = 0;
      continue;
    }
    var sum = 0;
    var count = 0;
    set.forEach(function (nIdx) {
      sum += Number(clusteringCoefficients[nIdx] || 0);
      count += 1;
    });
    out[idx] = count > 0 ? (sum / count) : 0;
  }
  return out;
}

function distanceScaleFromMetric(metric) {
  var m = Number(metric);
  if (!isFinite(m)) m = 0;
  m = clamp(m, 0, 1);
  var scale = 1 - (LINK_DISTANCE_METRIC_STRENGTH * m);
  return clamp(scale, LINK_DISTANCE_MIN_SCALE, LINK_DISTANCE_MAX_SCALE);
}

function strengthScaleFromMetric(metric) {
  var m = Number(metric);
  if (!isFinite(m)) m = 0;
  m = clamp(m, 0, 1);
  var scale = 1 + (LINK_DISTANCE_METRIC_STRENGTH * m);
  return clamp(scale, LINK_STRENGTH_MIN_SCALE, LINK_STRENGTH_MAX_SCALE);
}

function computeAlgorithmicLinkMetrics(edgeRecords, nodeCount) {
  var metrics = new Float32Array(edgeRecords.length);
  if (!edgeRecords.length || nodeCount <= 0) return metrics;

  var cfg = normalizeNeighborScaling(STATE.neighborScaling || null);
  var mode = cfg.mode;
  if (mode === "none") return metrics;

  var adjacency = buildAdjacencyRecords(edgeRecords, nodeCount);
  var neighborSets = selectNeighborSets(adjacency, cfg.directed);
  var clustering = null;
  var twoHop = null;

  if (mode === "ccm" || mode === "twohop") {
    clustering = computeLocalClusteringCoefficients(neighborSets);
    if (mode === "twohop") {
      twoHop = computeTwoHopMetrics(neighborSets, clustering);
    }
  }

  var commonCounts = null;
  var maxCommon = 0;
  if (mode === "common_neighbors") {
    commonCounts = new Float32Array(edgeRecords.length);
    for (var cIdx = 0; cIdx < edgeRecords.length; cIdx += 1) {
      var cRec = edgeRecords[cIdx];
      if (!cRec) continue;
      var cSetS = neighborSets[cRec.sourceIndex];
      var cSetT = neighborSets[cRec.targetIndex];
      var cVal = countCommonNeighbors(cSetS, cSetT);
      commonCounts[cIdx] = cVal;
      if (cVal > maxCommon) maxCommon = cVal;
    }
  }

  for (var i = 0; i < edgeRecords.length; i += 1) {
    var rec = edgeRecords[i];
    if (!rec) continue;
    var sSet = neighborSets[rec.sourceIndex];
    var tSet = neighborSets[rec.targetIndex];
    var metric = 0;

    if (mode === "jaccard") {
      metric = jaccardCoefficient(sSet, tSet);
    } else if (mode === "overlap") {
      metric = overlapCoefficient(sSet, tSet);
    } else if (mode === "common_neighbors") {
      var raw = Number(commonCounts ? commonCounts[i] : 0);
      metric = maxCommon > 0 ? (raw / maxCommon) : 0;
    } else if (mode === "ccm") {
      var cs = Number(clustering ? clustering[rec.sourceIndex] : 0);
      var ct = Number(clustering ? clustering[rec.targetIndex] : 0);
      metric = (cs + ct) * 0.5;
    } else if (mode === "twohop") {
      var hs = Number(twoHop ? twoHop[rec.sourceIndex] : 0);
      var ht = Number(twoHop ? twoHop[rec.targetIndex] : 0);
      metric = (hs + ht) * 0.5;
    }

    metrics[i] = clamp(metric, 0, 1);
  }

  return metrics;
}

function buildAlgorithmicLinkScalars(edgeRecords, nodeCount, baseStrengths) {
  var len = edgeRecords.length;
  var distances = new Float32Array(len);
  var strengths = new Float32Array(len);
  if (!len || nodeCount <= 0) {
    return { linkDistance: distances, linkStrength: strengths };
  }
  var metrics = computeAlgorithmicLinkMetrics(edgeRecords, nodeCount);

  for (var i = 0; i < len; i += 1) {
    var rec = edgeRecords[i];
    if (!rec || !rec.edge) continue;
    var baseDistance = resolveBaseLinkDistance(rec.edge);
    var baseStrength = (baseStrengths && baseStrengths.length > i)
      ? Number(baseStrengths[i] || 0)
      : resolveBaseLinkStrength(rec.edge);
    if (!isFinite(baseStrength) || baseStrength < 0) baseStrength = 0;
    var metric = Number(metrics[i] || 0);
    distances[i] = clamp(baseDistance * distanceScaleFromMetric(metric), 1, 5000);
    strengths[i] = clamp(baseStrength * strengthScaleFromMetric(metric), 0, 50);
  }

  return { linkDistance: distances, linkStrength: strengths };
}

function buildAlgorithmicLinkDistances(edgeRecords, nodeCount) {
  return buildAlgorithmicLinkScalars(edgeRecords, nodeCount, null).linkDistance;
}

function inferNodeCountFromEdgeRecords(edgeRecords) {
  var maxIdx = -1;
  if (!Array.isArray(edgeRecords)) return 0;
  for (var i = 0; i < edgeRecords.length; i += 1) {
    var rec = edgeRecords[i];
    if (!rec) continue;
    var s = Number(rec.sourceIndex);
    var t = Number(rec.targetIndex);
    if (isFinite(s) && s > maxIdx) maxIdx = s;
    if (isFinite(t) && t > maxIdx) maxIdx = t;
  }
  return maxIdx + 1;
}

// Runtime builder interface:
// metric output affects both distance and strength.
var LINK_SCALAR_DISTANCE_SCALE = 1.0;
var LINK_SCALAR_STRENGTH_SCALE = 1.0;

function buildLinkScalarArrays(edgeRecords, baseStrengths) {
  var len = Array.isArray(edgeRecords) ? edgeRecords.length : 0;
  var distances = new Float32Array(len);
  var strengths = new Float32Array(len);
  if (!len) return { linkDistance: distances, linkStrength: strengths };
  var nodeCount = inferNodeCountFromEdgeRecords(edgeRecords);
  var metrics = computeAlgorithmicLinkMetrics(edgeRecords, nodeCount);

  for (var i = 0; i < len; i += 1) {
    var rec = edgeRecords[i];
    if (!rec || !rec.edge) continue;

    var baseDistance = resolveBaseLinkDistance(rec.edge);
    var baseStrength = (baseStrengths && baseStrengths.length > i)
      ? Number(baseStrengths[i] || 0)
      : resolveBaseLinkStrength(rec.edge);
    if (!isFinite(baseStrength) || baseStrength < 0) baseStrength = 0;
    var metric = Number(metrics[i] || 0);

    distances[i] = clamp(baseDistance * distanceScaleFromMetric(metric) * LINK_SCALAR_DISTANCE_SCALE, 1, 5000);
    strengths[i] = clamp(baseStrength * strengthScaleFromMetric(metric) * LINK_SCALAR_STRENGTH_SCALE, 0, 50);
  }

  return { linkDistance: distances, linkStrength: strengths };
}

function persistCurrentPositions() {
  if (!STATE.graph || STATE.activeNodes.length === 0) return;
  var pos = STATE.graph.getPointPositions();
  if (!Array.isArray(pos) || pos.length < STATE.activeNodes.length * 2) return;

  var i;
  for (i = 0; i < STATE.activeNodes.length; i += 1) {
    var node = STATE.activeNodes[i];
    STATE.positionCache.set(node.id, [pos[i * 2], pos[i * 2 + 1]]);
  }
}

function buildGraphArrays(active) {
  var nodes = active.nodes;
  var edges = collapseEdgesForRendering(active.edges || []);
  var suppressHubDirectMask = buildFamilyHubDirectSuppressMask(edges);
  var externalSeedMap = buildExternalSeedMap(nodes);

  var indexById = new Map();
  var idsByIndex = [];
  nodes.forEach(function (node, idx) {
    indexById.set(node.id, idx);
    idsByIndex[idx] = node.id;
  });

  var pointPositions = new Float32Array(nodes.length * 2);
  var pointColorsFlat = [];
  var pointSizes = new Float32Array(nodes.length);
  var pointTypeCodes = new Uint8Array(nodes.length);

  nodes.forEach(function (node, idx) {
    var cached = STATE.positionCache.get(node.id);
    var seeded = externalSeedMap.get(String(node.id)) || null;
    var pos = cached || seeded || seededPos(node.id);
    var px = Number(pos[0]);
    var py = Number(pos[1]);
    if (!isFinite(px) || !isFinite(py)) {
      var fallback = seededPos(node.id);
      px = Number(fallback[0]);
      py = Number(fallback[1]);
    }
    var col = nodeColor(node);

    pointPositions[idx * 2] = px;
    pointPositions[idx * 2 + 1] = py;

    pointColorsFlat.push(col[0], col[1], col[2], col[3]);
    pointSizes[idx] = 0;
    pointTypeCodes[idx] = nodeRenderTypeCode(node);
  });

  var flatLinks = [];
  var linkColorsFlat = [];
  var linkWidths = [];
  var linkStrengthFlat = [];
  var linkStyleCodes = [];
  var edgeRecords = [];
  var visibleEdges = [];

  edges.forEach(function (edge, edgeIdx) {
    var s = indexById.get(edge.source);
    var t = indexById.get(edge.target);
    if (s === undefined || t === undefined) return;

    var col = linkColor(edge);
    var suppressed = !!(suppressHubDirectMask && suppressHubDirectMask.length > edgeIdx && suppressHubDirectMask[edgeIdx]);
    var width = linkWidth(edge);
    var strength = clamp(Number(STATE.linkStrengths[edge.layer] || 1), 0.01, 50);
    if (suppressed) {
      width = 0;
      strength = 0;
      col[3] = 0;
    }
    flatLinks.push(s, t);
    linkColorsFlat.push(col[0], col[1], col[2], col[3]);
    linkWidths.push(width);
    linkStrengthFlat.push(strength);
    linkStyleCodes.push(linkStyleCode(edge));
    edgeRecords.push({ edge: edge, sourceIndex: s, targetIndex: t });
    visibleEdges.push(edge);
  });

  var degreeByNode = buildNodeDegreeArray(nodes.length, edgeRecords, null);
  for (var ni = 0; ni < nodes.length; ni += 1) {
    pointSizes[ni] = nodeSize(nodes[ni], degreeByNode[ni]);
  }

  var algoScalars = buildLinkScalarArrays(edgeRecords, linkStrengthFlat);

  return {
    nodes: nodes,
    edges: visibleEdges,
    indexById: indexById,
    idsByIndex: idsByIndex,
    pointPositions: pointPositions,
    pointColors: new Float32Array(pointColorsFlat),
    pointSizes: pointSizes,
    pointTypeCodes: pointTypeCodes,
    links: new Float32Array(flatLinks),
    linkColors: new Float32Array(linkColorsFlat),
    linkWidths: new Float32Array(linkWidths),
    linkStrength: algoScalars.linkStrength,
    linkDistance: algoScalars.linkDistance,
    linkStyleCodes: new Uint8Array(linkStyleCodes)
  };
}

function buildRuntimeEdgeRecords() {
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var indexById = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : new Map();
  var out = [];
  edges.forEach(function (edge) {
    if (!edge) return;
    var s = indexById.get(String(edge.source));
    var t = indexById.get(String(edge.target));
    if (s === undefined || t === undefined) return;
    out.push({ edge: edge, sourceIndex: s, targetIndex: t });
  });
  return out;
}

function buildRuntimeVisibilityMasks(nodes, edges, indexById) {
  var nodeBase = new Uint8Array(nodes.length);
  var nodeVisible = new Uint8Array(nodes.length);
  var edgeVisible = new Uint8Array(edges.length);
  var touchedByLayer = new Uint8Array(nodes.length);
  var touchedByVisibleEdge = new Uint8Array(nodes.length);
  var i;

  for (i = 0; i < nodes.length; i += 1) {
    var node = nodes[i];
    var allowed = nodeAllowedByLayer(node) && nodeAllowedByNoteType(node);
    nodeBase[i] = allowed ? 1 : 0;
  }

  for (i = 0; i < edges.length; i += 1) {
    var edge = edges[i];
    if (!edgeAllowedByLayer(edge)) continue;
    var s = indexById.get(String(edge && edge.source !== undefined ? edge.source : ""));
    var t = indexById.get(String(edge && edge.target !== undefined ? edge.target : ""));
    if (s === undefined || t === undefined) continue;
    s = Number(s);
    t = Number(t);
    if (s < 0 || t < 0 || s >= nodes.length || t >= nodes.length || s === t) continue;
    touchedByLayer[s] = 1;
    touchedByLayer[t] = 1;
    var sBase = !!nodeBase[s];
    var tBase = !!nodeBase[t];
    var sBridge = !sBase && nodeHasLayer(nodes[s], "notes") && nodeAllowedByNoteType(nodes[s]);
    var tBridge = !tBase && nodeHasLayer(nodes[t], "notes") && nodeAllowedByNoteType(nodes[t]);
    if ((!sBase && !sBridge) || (!tBase && !tBridge)) continue;
    edgeVisible[i] = 1;
    touchedByVisibleEdge[s] = 1;
    touchedByVisibleEdge[t] = 1;
  }

  for (i = 0; i < nodes.length; i += 1) {
    if (!nodeBase[i]) {
      // Allow notes-layer nodes to be shown when an active edge layer references them.
      if (touchedByLayer[i] && nodeHasLayer(nodes[i], "notes") && nodeAllowedByNoteType(nodes[i])) nodeVisible[i] = 1;
      continue;
    }
    var node = nodes[i];
    var hasNodeLayer = nodeHasNodeOnlyLayer(node);
    if (STATE.showUnlinked || touchedByVisibleEdge[i] || hasNodeLayer) nodeVisible[i] = 1;
  }

  for (i = 0; i < edges.length; i += 1) {
    if (!edgeVisible[i]) continue;
    var edge2 = edges[i];
    var s2 = indexById.get(String(edge2 && edge2.source !== undefined ? edge2.source : ""));
    var t2 = indexById.get(String(edge2 && edge2.target !== undefined ? edge2.target : ""));
    if (s2 === undefined || t2 === undefined) {
      edgeVisible[i] = 0;
      continue;
    }
    s2 = Number(s2);
    t2 = Number(t2);
    if (!nodeVisible[s2] || !nodeVisible[t2]) edgeVisible[i] = 0;
  }

  return { nodeVisible: nodeVisible, edgeVisible: edgeVisible };
}

function applyRuntimeUiSettings(reheatLayout) {
  if (!STATE.graph || !Array.isArray(STATE.activeNodes) || !STATE.activeNodes.length) return false;

  var nodes = STATE.activeNodes;
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var indexById = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : new Map();
  var masks = buildRuntimeVisibilityMasks(nodes, edges, indexById);
  var nodeVisible = masks.nodeVisible;
  var edgeVisible = masks.edgeVisible;
  var suppressHubDirectMask = buildFamilyHubDirectSuppressMask(edges);
  var edgeRendered = new Uint8Array(edges.length);

  var pointColorsFlat = [];
  var pointSizes = new Float32Array(nodes.length);
  var i;
  for (i = 0; i < nodes.length; i += 1) {
    var col = nodeColor(nodes[i]);
    var visibleNode = !!nodeVisible[i];
    pointColorsFlat.push(col[0], col[1], col[2], visibleNode ? col[3] : 0);
    pointSizes[i] = 0;
  }

  var linkColorsFlat = [];
  var linkWidths = new Float32Array(edges.length);
  var linkStrengthBase = new Float32Array(edges.length);
  var linkStyleCodes = new Uint8Array(edges.length);
  var edgeRecords = new Array(edges.length);
  for (i = 0; i < edges.length; i += 1) {
    var edge = edges[i];
    var visibleEdge = !!edgeVisible[i];
    var suppressed = !!(suppressHubDirectMask && suppressHubDirectMask.length > i && suppressHubDirectMask[i]);
    var renderEdge = visibleEdge && !suppressed;
    var lcol = linkColor(edge);
    var lstyle = linkStyleCode(edge);
    var lwidth = linkWidth(edge);
    var lstrength = resolveBaseLinkStrength(edge);
    if (!renderEdge) {
      lwidth = 0;
      lstrength = 0;
      lcol[3] = 0;
    } else {
      edgeRendered[i] = 1;
    }
    linkStyleCodes[i] = lstyle;
    linkColorsFlat.push(lcol[0], lcol[1], lcol[2], lcol[3]);
    linkWidths[i] = lwidth;
    linkStrengthBase[i] = lstrength;
    var s = indexById.get(String(edge && edge.source !== undefined ? edge.source : ""));
    var t = indexById.get(String(edge && edge.target !== undefined ? edge.target : ""));
    var sIdx = (s !== undefined) ? Number(s) : 0;
    var tIdx = (t !== undefined) ? Number(t) : 0;
    edgeRecords[i] = { edge: edge, sourceIndex: sIdx, targetIndex: tIdx };
  }

  var degreeVisible = buildNodeDegreeArray(nodes.length, edgeRecords, edgeVisible);
  for (i = 0; i < nodes.length; i += 1) {
    pointSizes[i] = nodeVisible[i] ? nodeSize(nodes[i], degreeVisible[i]) : 0;
  }

  var basePointColors = new Float32Array(pointColorsFlat);
  var baseLinkColors = new Float32Array(linkColorsFlat);
  var algoScalars = buildLinkScalarArrays(edgeRecords, linkStrengthBase);
  var linkDistance = algoScalars.linkDistance;
  var linkStrength = algoScalars.linkStrength;

  STATE.basePointColors = basePointColors;
  STATE.basePointSizes = pointSizes;
  STATE.baseLinkColors = baseLinkColors;
  STATE.runtimeNodeVisibleMask = nodeVisible;
  STATE.runtimeEdgeVisibleMask = edgeRendered;
  STATE.runtimeFlowEdgeMask = new Uint8Array(edgeRendered);
  STATE.pointStyleColors = basePointColors;
  STATE.pointStyleSizes = pointSizes;

  var visibleNodeCount = 0;
  var visibleEdgeCount = 0;
  for (i = 0; i < nodeVisible.length; i += 1) {
    if (nodeVisible[i]) visibleNodeCount += 1;
  }
  for (i = 0; i < edgeRendered.length; i += 1) {
    if (edgeRendered[i]) visibleEdgeCount += 1;
  }

  if (typeof STATE.graph.setPointColors === "function") STATE.graph.setPointColors(basePointColors);
  if (typeof STATE.graph.setPointSizes === "function") STATE.graph.setPointSizes(pointSizes);
  if (typeof STATE.graph.setLinkColors === "function") STATE.graph.setLinkColors(baseLinkColors);
  if (typeof STATE.graph.setLinkWidths === "function") STATE.graph.setLinkWidths(linkWidths);
  if (typeof STATE.graph.setLinkStrength === "function") STATE.graph.setLinkStrength(linkStrength);
  if (typeof STATE.graph.setLinkStyleCodes === "function") STATE.graph.setLinkStyleCodes(linkStyleCodes);
  if (typeof STATE.graph.setLinkDistance === "function") STATE.graph.setLinkDistance(linkDistance);

  if (typeof applyVisualStyles === "function") {
    applyVisualStyles(0.08);
  } else if (typeof STATE.graph.render === "function") {
    STATE.graph.render(0.08);
  }

  if (reheatLayout !== false && STATE.solver && STATE.solver.layout_enabled && typeof STATE.graph.start === "function") {
    STATE.graph.start(0.25);
  }
  if (DOM && DOM.graphEmpty) {
    DOM.graphEmpty.style.display = visibleNodeCount ? "none" : "block";
    if (!visibleNodeCount) DOM.graphEmpty.textContent = "No nodes visible with current filters.";
  }
  if (typeof buildSearchEntries === "function") buildSearchEntries();
  if (typeof updateStatus === "function") updateStatus();
  if (STATE.debugEnabled && typeof log === "function") {
    try {
      log(
        "payload.debug.visibility:"
        + JSON.stringify({
          nodesTotal: nodes.length,
          edgesTotal: edges.length,
          nodesVisible: visibleNodeCount,
          edgesVisible: visibleEdgeCount,
          reheat: reheatLayout !== false
        })
      );
    } catch (_e2) { }
  }
  return true;
}

function applyRuntimeLinkDistances(reheat) {
  if (!STATE.graph || !STATE.activeNodes || !STATE.activeNodes.length) return false;
  var edgeRecords = buildRuntimeEdgeRecords();
  var visibleMask = (STATE.runtimeEdgeVisibleMask && STATE.runtimeEdgeVisibleMask.length === edgeRecords.length)
    ? STATE.runtimeEdgeVisibleMask
    : null;
  var baseStrengths = new Float32Array(edgeRecords.length);
  for (var i = 0; i < edgeRecords.length; i += 1) {
    var rec = edgeRecords[i];
    var baseStrength = rec && rec.edge ? resolveBaseLinkStrength(rec.edge) : 0;
    if (visibleMask && !visibleMask[i]) baseStrength = 0;
    baseStrengths[i] = baseStrength;
  }
  var algoScalars = buildLinkScalarArrays(edgeRecords, baseStrengths);
  if (typeof STATE.graph.setLinkDistance === "function") {
    STATE.graph.setLinkDistance(algoScalars.linkDistance);
  }
  if (typeof STATE.graph.setLinkStrength === "function") {
    STATE.graph.setLinkStrength(algoScalars.linkStrength);
  }
  if (typeof STATE.graph.render === "function") {
    STATE.graph.render(0.08);
  }
  if (reheat !== false && STATE.solver && STATE.solver.layout_enabled && typeof STATE.graph.start === "function") {
    STATE.graph.start();
  }
  return true;
}

window.applyRuntimeLinkDistances = applyRuntimeLinkDistances;
window.applyRuntimeUiSettings = applyRuntimeUiSettings;
