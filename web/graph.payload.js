"use strict";

// === Node Settings Contracts =================================================
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

// === Card Settings Contracts =================================================
var AJPC_CARD_SETTINGS_DEFAULTS = {
  card_dots_enabled: true,
  card_dot_suspended_color: "#ef4444",
  card_dot_buried_color: "#f59e0b"
};

var AJPC_CARD_SETTINGS_SPEC = [
  {
    key: "card_dots_enabled",
    label: "Enable Card Dots",
    type: "bool",
    affectsEngine: false,
    hint: "Persisted UI setting for card-dot visibility."
  },
  {
    key: "card_dot_suspended_color",
    label: "Suspended Color",
    type: "color",
    affectsEngine: false,
    hint: "Persisted color for suspended-card dots."
  },
  {
    key: "card_dot_buried_color",
    label: "Buried Color",
    type: "color",
    affectsEngine: false,
    hint: "Persisted color for buried-card dots."
  }
];

window.ajpcCardSettings = {
  defaults: Object.assign({}, AJPC_CARD_SETTINGS_DEFAULTS),
  spec: AJPC_CARD_SETTINGS_SPEC.slice()
};

function getCardSettingsDefaults() {
  var src = window.ajpcCardSettings && typeof window.ajpcCardSettings === "object"
    ? window.ajpcCardSettings
    : null;
  if (src && src.defaults && typeof src.defaults === "object") {
    return Object.assign({}, src.defaults);
  }
  return Object.assign({}, AJPC_CARD_SETTINGS_DEFAULTS);
}

function getCardSettingsSpec() {
  var src = window.ajpcCardSettings && typeof window.ajpcCardSettings === "object"
    ? window.ajpcCardSettings
    : null;
  if (src && Array.isArray(src.spec)) return src.spec.slice();
  return AJPC_CARD_SETTINGS_SPEC.slice();
}

function cardSettingsSpec() {
  return getCardSettingsSpec();
}

function collectCardSettings(input) {
  var src = (input && typeof input === "object") ? input : {};
  var defaults = getCardSettingsDefaults();
  var out = Object.assign({}, defaults);

  var dotsEnabled = src.card_dots_enabled;
  if (typeof dotsEnabled === "string") {
    var raw = dotsEnabled.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") dotsEnabled = true;
    else if (raw === "0" || raw === "false" || raw === "no" || raw === "off") dotsEnabled = false;
  }
  out.card_dots_enabled = (dotsEnabled === undefined) ? !!defaults.card_dots_enabled : !!dotsEnabled;
  out.card_dot_suspended_color = String(src.card_dot_suspended_color || defaults.card_dot_suspended_color || "").trim() || defaults.card_dot_suspended_color;
  out.card_dot_buried_color = String(src.card_dot_buried_color || defaults.card_dot_buried_color || "").trim() || defaults.card_dot_buried_color;
  return out;
}

function cardSettingsFromMeta() {
  var meta = (STATE && STATE.raw && STATE.raw.meta && typeof STATE.raw.meta === "object")
    ? STATE.raw.meta
    : {};
  var colors = (meta.card_dot_colors && typeof meta.card_dot_colors === "object")
    ? meta.card_dot_colors
    : {};

  return {
    card_dots_enabled: meta.card_dots_enabled,
    card_dot_suspended_color: meta.card_dot_suspended_color !== undefined ? meta.card_dot_suspended_color : colors.suspended,
    card_dot_buried_color: meta.card_dot_buried_color !== undefined ? meta.card_dot_buried_color : colors.buried
  };
}

function syncCardSettingsFromMeta() {
  var merged = Object.assign({}, cardSettingsFromMeta(), STATE.cards || {});
  STATE.cards = collectCardSettings(merged);
}

// === Link Settings Contracts =================================================
var AJPC_LINK_SETTINGS_DEFAULTS = {
  layer_flow_speed: 0.35,
  layer_flow_spacing_mul: 18.0,
  layer_flow_radius_mul: 3.6,
  trailing_hub_distance: 18.0,
  notes_swatch_color: "#3d95e7"
};

var AJPC_LINK_SETTINGS_SPEC = [
  {
    key: "layer_flow_speed",
    label: "Particle Flow Speed",
    type: "number",
    min: 0.01,
    max: 3,
    step: 0.01,
    affectsEngine: false,
    hint: "Global particle flow speed for edge shader animation."
  },
  {
    key: "layer_flow_spacing_mul",
    label: "Particle Flow Spacing",
    type: "number",
    min: 0.1,
    max: 80,
    step: 0.1,
    affectsEngine: false,
    hint: "Spacing multiplier for flow photons along edges."
  },
  {
    key: "layer_flow_radius_mul",
    label: "Particle Flow Width",
    type: "number",
    min: 0.1,
    max: 12,
    step: 0.1,
    affectsEngine: false,
    hint: "Radius multiplier for flow photons."
  },
  {
    key: "trailing_hub_distance",
    label: "Trailing Hub Distance",
    type: "number",
    min: 0,
    max: 5000,
    step: 1,
    affectsEngine: false,
    hint: "Target link distance for family hub edges when a hub has only one connected node."
  },
  {
    key: "notes_swatch_color",
    label: "Notes Swatch Color",
    type: "color",
    affectsEngine: false,
    hint: "Toolbar swatch color for Notes layer."
  }
];

window.ajpcLinkSettings = {
  defaults: Object.assign({}, AJPC_LINK_SETTINGS_DEFAULTS),
  spec: AJPC_LINK_SETTINGS_SPEC.slice()
};

function getLinkSettingsDefaults() {
  var src = window.ajpcLinkSettings && typeof window.ajpcLinkSettings === "object"
    ? window.ajpcLinkSettings
    : null;
  if (src && src.defaults && typeof src.defaults === "object") {
    return Object.assign({}, src.defaults);
  }
  return Object.assign({}, AJPC_LINK_SETTINGS_DEFAULTS);
}

function getLinkSettingsSpec() {
  var src = window.ajpcLinkSettings && typeof window.ajpcLinkSettings === "object"
    ? window.ajpcLinkSettings
    : null;
  if (src && Array.isArray(src.spec)) return src.spec.slice();
  return AJPC_LINK_SETTINGS_SPEC.slice();
}

function linkSettingsSpec() {
  return getLinkSettingsSpec();
}

function collectLinkSettings(input) {
  var src = (input && typeof input === "object") ? input : {};
  var defaults = getLinkSettingsDefaults();
  var out = Object.assign({}, defaults);

  var flowSpeed = Number(src.layer_flow_speed);
  if (!isFinite(flowSpeed)) flowSpeed = Number(defaults.layer_flow_speed);
  out.layer_flow_speed = clamp(flowSpeed, 0.01, 3);

  var flowSpacing = Number(src.layer_flow_spacing_mul);
  if (!isFinite(flowSpacing)) flowSpacing = Number(defaults.layer_flow_spacing_mul);
  out.layer_flow_spacing_mul = clamp(flowSpacing, 0.1, 80);

  var flowRadius = Number(src.layer_flow_radius_mul);
  if (!isFinite(flowRadius)) flowRadius = Number(defaults.layer_flow_radius_mul);
  out.layer_flow_radius_mul = clamp(flowRadius, 0.1, 12);

  var trailingHubDistance = Number(src.trailing_hub_distance);
  if (!isFinite(trailingHubDistance)) trailingHubDistance = Number(defaults.trailing_hub_distance);
  out.trailing_hub_distance = clamp(trailingHubDistance, 0, 5000);

  out.notes_swatch_color = normalizeHexColor(
    String(src.notes_swatch_color || defaults.notes_swatch_color || "#3d95e7"),
    "#3d95e7"
  );

  return out;
}

function linkSettingsFromMeta() {
  var meta = (STATE && STATE.raw && STATE.raw.meta && typeof STATE.raw.meta === "object")
    ? STATE.raw.meta
    : {};
  var metaLink = (meta.link_settings && typeof meta.link_settings === "object")
    ? meta.link_settings
    : {};

  return {
    layer_flow_speed: (metaLink.layer_flow_speed !== undefined) ? metaLink.layer_flow_speed : meta.layer_flow_speed,
    layer_flow_spacing_mul: (metaLink.layer_flow_spacing_mul !== undefined) ? metaLink.layer_flow_spacing_mul : meta.layer_flow_spacing_mul,
    layer_flow_radius_mul: (metaLink.layer_flow_radius_mul !== undefined) ? metaLink.layer_flow_radius_mul : meta.layer_flow_radius_mul,
    trailing_hub_distance: (metaLink.trailing_hub_distance !== undefined) ? metaLink.trailing_hub_distance : meta.trailing_hub_distance,
    notes_swatch_color: (metaLink.notes_swatch_color !== undefined)
      ? metaLink.notes_swatch_color
      : ((meta.link_colors && meta.link_colors.notes !== undefined) ? meta.link_colors.notes : undefined)
  };
}

function syncLinkSettingsFromMeta() {
  var fromMeta = linkSettingsFromMeta();
  var fromState = {
    layer_flow_speed: STATE.layerFlowSpeed,
    layer_flow_spacing_mul: STATE.layerFlowSpacingMul,
    layer_flow_radius_mul: STATE.layerFlowRadiusMul,
    trailing_hub_distance: STATE.trailingHubDistance,
    notes_swatch_color: (STATE.linkColors && STATE.linkColors.notes) ? STATE.linkColors.notes : undefined
  };
  var local = STATE.linkSettings || {};
  var merged;
  if (STATE && STATE.isFirstRender) {
    // On initial payload load, persisted backend settings must win over local defaults.
    merged = Object.assign({}, fromState, local, fromMeta);
  } else {
    // During runtime interaction, local UI state may be newer than stale payload meta.
    merged = Object.assign({}, fromMeta, fromState, local);
  }
  var collected = collectLinkSettings(merged);
  STATE.linkSettings = collected;
  STATE.layerFlowSpeed = Number(collected.layer_flow_speed);
  STATE.layerFlowSpacingMul = Number(collected.layer_flow_spacing_mul);
  STATE.layerFlowRadiusMul = Number(collected.layer_flow_radius_mul);
  STATE.trailingHubDistance = Number(collected.trailing_hub_distance);
  if (!STATE.linkColors || typeof STATE.linkColors !== "object") STATE.linkColors = {};
  STATE.linkColors.notes = normalizeHexColor(String(collected.notes_swatch_color || "#3d95e7"), "#3d95e7");
}

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
  if (key === "masslinker") key = "provider_mass_linker";
  if (key === "notelinks" || key === "note_link") key = "note_links";
  if (key === "familygate") key = "family";
  if (key === "family_hub") return "families";
  if (key === "reference") return "note_links";
  if (key === "example") return "examples";
  if (key === "mass_linker") return "provider_mass_linker";
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

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(function (card) {
    var c = card && typeof card === "object" ? card : {};
    var id = Number(c.id);
    var ord = Number(c.ord);
    var stability = (c.stability === undefined || c.stability === null) ? null : Number(c.stability);
    return {
      id: isFinite(id) ? id : 0,
      ord: isFinite(ord) ? ord : 0,
      name: String(c.name || c.card_name || c.template || ""),
      status: String(c.status || ""),
      stability: isFinite(stability) ? stability : null
    };
  });
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
    cards: normalizeCards(n.cards)
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
    var key = stableEdgeKey(edge);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(edge);
  });

  return out;
}

function stableEdgeMetaSerialize(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i += 1) {
      arr.push(stableEdgeMetaSerialize(value[i]));
    }
    return "[" + arr.join(",") + "]";
  }
  if (typeof value === "object") {
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      parts.push(JSON.stringify(String(key)) + ":" + stableEdgeMetaSerialize(value[key]));
    }
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

function stableEdgeKey(edge) {
  var e = edge && typeof edge === "object" ? edge : {};
  var source = String(e.source !== undefined && e.source !== null ? e.source : "");
  var target = String(e.target !== undefined && e.target !== null ? e.target : "");
  var layer = String(e.layer || "");
  var metaSig = stableEdgeMetaSerialize(e.meta || {});
  return "ed:" + source + "|" + target + "|" + layer + "|" + metaSig;
}

function coalesceNoteLinkBidirectional(edges) {
  var seen = new Set();
  var linkGroups = new Map();
  var passthrough = [];

  edges.forEach(function (edge) {
    if (!edge || !edge.source || !edge.target) return;
    if (String(edge.layer || "") !== "note_links") {
      passthrough.push(edge);
      return;
    }
    var source = String(edge.source || "");
    var target = String(edge.target || "");
    var a = source < target ? source : target;
    var b = source < target ? target : source;
    var meta = edge.meta && typeof edge.meta === "object" ? edge.meta : {};
    var manual = !!meta.manual;
    var bucketKey = a + "|" + b + "|" + (manual ? "1" : "0");
    var bucket = linkGroups.get(bucketKey);
    if (!bucket) {
      bucket = { a: a, b: b, manual: manual, ab: [], ba: [] };
      linkGroups.set(bucketKey, bucket);
    }
    if (source === a && target === b) bucket.ab.push(edge);
    else bucket.ba.push(edge);
  });

  var out = [];
  passthrough.forEach(function (edge) {
    var key = stableEdgeKey(edge);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(edge);
  });

  function pickVisible(list) {
    if (!Array.isArray(list) || !list.length) return null;
    for (var i = 0; i < list.length; i += 1) {
      var candidate = list[i];
      var meta = candidate && candidate.meta && typeof candidate.meta === "object" ? candidate.meta : {};
      if (!meta.flow_only) return candidate;
    }
    return list[0];
  }

  linkGroups.forEach(function (group) {
    var visAB = pickVisible(group.ab);
    var visBA = pickVisible(group.ba);
    var representative = visAB || visBA;
    if (!representative) return;

    var baseMeta = Object.assign({}, representative.meta && typeof representative.meta === "object" ? representative.meta : {});
    delete baseMeta.flow_only;
    baseMeta.manual = !!group.manual;
    if (visAB && visBA) baseMeta.bidirectional = true;
    if (!(visAB && visBA)) delete baseMeta.bidirectional;

    var visibleEdge = {
      source: String(representative.source || ""),
      target: String(representative.target || ""),
      layer: "note_links",
      meta: baseMeta
    };
    var visibleKey = stableEdgeKey(visibleEdge);
    if (visibleKey && !seen.has(visibleKey)) {
      seen.add(visibleKey);
      out.push(visibleEdge);
    }

    if (visAB && visBA) {
      var reverseMeta = Object.assign({}, baseMeta, { flow_only: true, bidirectional: true });
      var reverseEdge = {
        source: String(visibleEdge.target || ""),
        target: String(visibleEdge.source || ""),
        layer: "note_links",
        meta: reverseMeta
      };
      var reverseKey = stableEdgeKey(reverseEdge);
      if (reverseKey && !seen.has(reverseKey)) {
        seen.add(reverseKey);
        out.push(reverseEdge);
      }
    }
  });

  return out;
}

function applyNodeMods(data, _cfg, _runtimeCtx) {
  var src = Array.isArray(data && data.nodes_raw) ? data.nodes_raw : (Array.isArray(data && data.nodes) ? data.nodes : []);
  var nodes = src.map(normalizeNode);
  return Object.assign({}, data || {}, { nodes: nodes });
}

function applyLayerProviderMods(data, _cfg, _runtimeCtx) {
  var srcMeta = (data && data.meta && typeof data.meta === "object") ? data.meta : {};
  var meta = Object.assign({}, srcMeta);
  var fromLayerLabels = normalizeLayerMap(meta.layer_labels || {}, "edge");
  var fromProviderLabels = normalizeLayerMap(meta.provider_layer_labels || {}, "edge");
  var fromProviderLayers = normalizeLayerMap(meta.provider_layers || {}, "edge");
  if (!Object.keys(fromProviderLabels).length && Object.keys(fromLayerLabels).length) {
    meta.provider_layer_labels = Object.assign({}, fromLayerLabels);
  } else {
    meta.provider_layer_labels = Object.assign({}, fromProviderLabels);
  }
  if (!Object.keys(fromLayerLabels).length && Object.keys(fromProviderLabels).length) {
    meta.layer_labels = Object.assign({}, fromProviderLabels);
  } else {
    meta.layer_labels = Object.assign({}, fromLayerLabels);
  }
  meta.provider_layers = Object.assign({}, fromProviderLayers);
  return Object.assign({}, data || {}, { meta: meta });
}

function applyHubGroupingMods(data, _cfg, _runtimeCtx) {
  var nodes = Array.isArray(data && data.nodes) ? data.nodes.slice() : [];
  var edges = Array.isArray(data && data.edges) ? data.edges.slice() : [];
  var byId = new Map();
  nodes.forEach(function (node) {
    if (!node || !node.id) return;
    byId.set(String(node.id), node);
  });
  edges.forEach(function (edge) {
    if (!edge || String(edge.layer || "") !== "families") return;
    var source = String(edge.source || "");
    var target = String(edge.target || "");
    if (source && byId.has(source)) {
      var sourceNode = byId.get(source);
      if (sourceNode && Array.isArray(sourceNode.layers) && sourceNode.layers.indexOf("families") < 0) {
        sourceNode.layers.push("families");
      }
    }
    if (target && byId.has(target)) {
      var targetNode = byId.get(target);
      if (targetNode && Array.isArray(targetNode.layers) && targetNode.layers.indexOf("families") < 0) {
        targetNode.layers.push("families");
      }
    }
  });
  return Object.assign({}, data || {}, { nodes: nodes, edges: edges });
}

function applyEdgeMods(data, _cfg, _runtimeCtx) {
  var src = Array.isArray(data && data.edges_raw) ? data.edges_raw : (Array.isArray(data && data.edges) ? data.edges : []);
  var edges = src.map(normalizeEdge);
  edges = dedupeEdges(edges);
  edges = coalesceNoteLinkBidirectional(edges);
  return Object.assign({}, data || {}, { edges: edges });
}

function applyDerivedVisualMods(data, _cfg, _runtimeCtx) {
  var nodes = Array.isArray(data && data.nodes) ? data.nodes.slice() : [];
  var edges = Array.isArray(data && data.edges) ? data.edges.slice() : [];
  return Object.assign({}, data || {}, { nodes: nodes, edges: edges });
}

function runGraphMods(data, cfg, runtimeCtx) {
  var step1 = applyNodeMods(data, cfg, runtimeCtx);
  var step2 = applyLayerProviderMods(step1, cfg, runtimeCtx);
  var step3 = applyEdgeMods(step2, cfg, runtimeCtx);
  var step4 = applyHubGroupingMods(step3, cfg, runtimeCtx);
  return applyDerivedVisualMods(step4, cfg, runtimeCtx);
}

function preparePayload(payload) {
  var raw = payload && typeof payload === "object" ? payload : {};
  var meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  var baseNodes = Array.isArray(raw.nodes) ? raw.nodes.slice() : [];
  var baseEdges = Array.isArray(raw.edges) ? raw.edges.slice() : [];
  var extraEdges = mergeExtraEdgeSets(meta);
  var modded = runGraphMods({
    nodes_raw: baseNodes,
    edges_raw: baseEdges.concat(extraEdges),
    meta: meta
  }, {}, { mode: "full" });

  return {
    nodes: Array.isArray(modded.nodes) ? modded.nodes : [],
    edges: dedupeEdges(Array.isArray(modded.edges) ? modded.edges : []),
    meta: (modded.meta && typeof modded.meta === "object") ? modded.meta : {}
  };
}

function normalizeNidList(values) {
  if (!Array.isArray(values)) return [];
  var out = [];
  var seen = new Set();
  values.forEach(function (raw) {
    var id = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function prepareDeltaSlice(payload) {
  var raw = payload && typeof payload === "object" ? payload : {};
  var rawMeta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  var nodesRaw = Array.isArray(raw.nodes_raw) ? raw.nodes_raw.slice() : [];
  var edgesRaw = Array.isArray(raw.edges_raw) ? raw.edges_raw.slice() : [];
  var modded = runGraphMods({
    nodes_raw: nodesRaw,
    edges_raw: edgesRaw,
    meta: rawMeta
  }, {}, { mode: "delta" });
  var changed = normalizeNidList(raw.changed_nids);
  var expanded = normalizeNidList(raw.expanded_nids);
  var touched = new Set(changed.concat(expanded));
  var edges = dedupeEdges(Array.isArray(modded.edges) ? modded.edges : []);
  edges.forEach(function (edge) {
    if (!edge) return;
    if (edge.source !== undefined && edge.source !== null) touched.add(String(edge.source));
    if (edge.target !== undefined && edge.target !== null) touched.add(String(edge.target));
  });
  return {
    rev: Number(raw.rev) || 0,
    reason: String(raw.reason || ""),
    changed_nids: changed,
    expanded_nids: expanded,
    touched_ids: Array.from(touched.values()),
    nodes: Array.isArray(modded.nodes) ? modded.nodes : [],
    edges: edges,
    meta: (modded.meta && typeof modded.meta === "object") ? modded.meta : {}
  };
}

function indexNodesById(nodes) {
  var out = new Map();
  (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
    if (!node || node.id === undefined || node.id === null) return;
    out.set(String(node.id), node);
  });
  return out;
}

function indexEdgesByKey(edges) {
  var out = new Map();
  (Array.isArray(edges) ? edges : []).forEach(function (edge) {
    if (!edge) return;
    var key = stableEdgeKey(edge);
    if (!key) return;
    out.set(key, edge);
  });
  return out;
}

function valueSignature(value) {
  return stableEdgeMetaSerialize(value);
}

function diffNodeAttrs(prevNode, nextNode) {
  var prev = prevNode && typeof prevNode === "object" ? prevNode : {};
  var next = nextNode && typeof nextNode === "object" ? nextNode : {};
  var keys = new Set(Object.keys(prev).concat(Object.keys(next)));
  var changed = {};
  keys.forEach(function (key) {
    if (key === "id") return;
    var hasPrev = Object.prototype.hasOwnProperty.call(prev, key);
    var hasNext = Object.prototype.hasOwnProperty.call(next, key);
    if (!hasNext && hasPrev) {
      changed[key] = null;
      return;
    }
    if (!hasNext) return;
    var prevSig = hasPrev ? valueSignature(prev[key]) : "__missing__";
    var nextSig = valueSignature(next[key]);
    if (prevSig !== nextSig) changed[key] = next[key];
  });
  return changed;
}

function edgeRecordEquals(prevEdge, nextEdge) {
  var prev = prevEdge && typeof prevEdge === "object" ? prevEdge : {};
  var next = nextEdge && typeof nextEdge === "object" ? nextEdge : {};
  if (String(prev.source || "") !== String(next.source || "")) return false;
  if (String(prev.target || "") !== String(next.target || "")) return false;
  if (String(prev.layer || "") !== String(next.layer || "")) return false;
  return valueSignature(prev.meta || {}) === valueSignature(next.meta || {});
}

function buildDeltaOps(slice) {
  var data = slice && typeof slice === "object" ? slice : {};
  var touched = new Set(normalizeNidList(data.touched_ids));
  normalizeNidList(data.changed_nids).forEach(function (id) { touched.add(id); });
  normalizeNidList(data.expanded_nids).forEach(function (id) { touched.add(id); });

  var currentNodes = indexNodesById((STATE && STATE.raw && Array.isArray(STATE.raw.nodes)) ? STATE.raw.nodes : []);
  var currentEdges = indexEdgesByKey((STATE && STATE.raw && Array.isArray(STATE.raw.edges)) ? STATE.raw.edges : []);
  var nextNodes = indexNodesById(Array.isArray(data.nodes) ? data.nodes : []);
  var nextEdges = indexEdgesByKey(Array.isArray(data.edges) ? data.edges : []);

  var ops = {
    rev: Number(data.rev) || 0,
    node_add: [],
    node_update: [],
    node_drop: [],
    edge_upsert: [],
    edge_drop: []
  };

  touched.forEach(function (id) {
    var prev = currentNodes.get(String(id));
    var next = nextNodes.get(String(id));
    if (!prev && next) {
      ops.node_add.push({ id: String(id), attrs: next });
      return;
    }
    if (prev && !next) {
      ops.node_drop.push(String(id));
      return;
    }
    if (!prev || !next) return;
    var changedAttrs = diffNodeAttrs(prev, next);
    if (Object.keys(changedAttrs).length) {
      ops.node_update.push({ id: String(id), changed_attrs: changedAttrs });
    }
  });

  var touchedEdgeKeys = new Set();
  currentEdges.forEach(function (edge, key) {
    if (!edge) return;
    var src = String(edge.source || "");
    var dst = String(edge.target || "");
    if (touched.has(src) || touched.has(dst)) touchedEdgeKeys.add(key);
  });
  nextEdges.forEach(function (edge, key) {
    if (!edge) return;
    var src = String(edge.source || "");
    var dst = String(edge.target || "");
    if (touched.has(src) || touched.has(dst)) touchedEdgeKeys.add(key);
  });

  touchedEdgeKeys.forEach(function (key) {
    var prev = currentEdges.get(key);
    var next = nextEdges.get(key);
    if (!prev && next) {
      ops.edge_upsert.push({
        key: key,
        source: String(next.source || ""),
        target: String(next.target || ""),
        attrs: { layer: String(next.layer || ""), meta: next.meta && typeof next.meta === "object" ? next.meta : {} }
      });
      return;
    }
    if (prev && !next) {
      ops.edge_drop.push(String(key));
      return;
    }
    if (!prev || !next) return;
    if (!edgeRecordEquals(prev, next)) {
      ops.edge_upsert.push({
        key: key,
        source: String(next.source || ""),
        target: String(next.target || ""),
        attrs: { layer: String(next.layer || ""), meta: next.meta && typeof next.meta === "object" ? next.meta : {} }
      });
    }
  });

  return ops;
}

function applyDeltaOpsToState(ops, slice) {
  var raw = (STATE && STATE.raw && typeof STATE.raw === "object") ? STATE.raw : { nodes: [], edges: [], meta: {} };
  if (!Array.isArray(raw.nodes)) raw.nodes = [];
  if (!Array.isArray(raw.edges)) raw.edges = [];
  if (!raw.meta || typeof raw.meta !== "object") raw.meta = {};

  var data = slice && typeof slice === "object" ? slice : {};
  var meta = data.meta && typeof data.meta === "object" ? data.meta : {};
  if (meta.provider_layers && typeof meta.provider_layers === "object") {
    var existingProviders = (raw.meta.provider_layers && typeof raw.meta.provider_layers === "object") ? raw.meta.provider_layers : {};
    raw.meta.provider_layers = Object.assign({}, existingProviders, meta.provider_layers);
  }
  if (meta.provider_layer_labels && typeof meta.provider_layer_labels === "object") {
    var existingProviderLabels = (raw.meta.provider_layer_labels && typeof raw.meta.provider_layer_labels === "object")
      ? raw.meta.provider_layer_labels
      : {};
    raw.meta.provider_layer_labels = Object.assign({}, existingProviderLabels, meta.provider_layer_labels);
  }
  if (meta.layer_labels && typeof meta.layer_labels === "object") {
    var existingLayerLabels = (raw.meta.layer_labels && typeof raw.meta.layer_labels === "object") ? raw.meta.layer_labels : {};
    raw.meta.layer_labels = Object.assign({}, existingLayerLabels, meta.layer_labels);
  }
  if (Object.prototype.hasOwnProperty.call(meta, "delta_rev")) raw.meta.delta_rev = Number(meta.delta_rev) || 0;

  var nodeMap = indexNodesById(raw.nodes);
  var edgeMap = indexEdgesByKey(raw.edges);
  var droppedNodes = new Set();

  (Array.isArray(ops && ops.node_drop) ? ops.node_drop : []).forEach(function (id) {
    var key = String(id || "");
    if (!key) return;
    droppedNodes.add(key);
    nodeMap.delete(key);
  });

  (Array.isArray(ops && ops.node_add) ? ops.node_add : []).forEach(function (entry) {
    if (!entry || entry.id === undefined || entry.id === null) return;
    var key = String(entry.id);
    var attrs = entry.attrs && typeof entry.attrs === "object" ? entry.attrs : {};
    nodeMap.set(key, Object.assign({}, attrs, { id: key }));
  });

  (Array.isArray(ops && ops.node_update) ? ops.node_update : []).forEach(function (entry) {
    if (!entry || entry.id === undefined || entry.id === null) return;
    var key = String(entry.id);
    var base = nodeMap.get(key);
    if (!base) return;
    var changed = entry.changed_attrs && typeof entry.changed_attrs === "object" ? entry.changed_attrs : {};
    var next = Object.assign({}, base);
    Object.keys(changed).forEach(function (attr) {
      if (changed[attr] === null) delete next[attr];
      else next[attr] = changed[attr];
    });
    next.id = key;
    nodeMap.set(key, next);
  });

  if (droppedNodes.size) {
    edgeMap.forEach(function (edge, key) {
      if (!edge) return;
      var src = String(edge.source || "");
      var dst = String(edge.target || "");
      if (droppedNodes.has(src) || droppedNodes.has(dst)) edgeMap.delete(key);
    });
  }

  (Array.isArray(ops && ops.edge_drop) ? ops.edge_drop : []).forEach(function (key) {
    edgeMap.delete(String(key || ""));
  });

  (Array.isArray(ops && ops.edge_upsert) ? ops.edge_upsert : []).forEach(function (entry) {
    if (!entry) return;
    var source = String(entry.source || "");
    var target = String(entry.target || "");
    if (!source || !target) return;
    var attrs = entry.attrs && typeof entry.attrs === "object" ? entry.attrs : {};
    var edge = {
      source: source,
      target: target,
      layer: normalizeLayerKey(attrs.layer, "edge"),
      meta: attrs.meta && typeof attrs.meta === "object" ? attrs.meta : {}
    };
    edgeMap.set(String(entry.key || stableEdgeKey(edge)), edge);
  });

  raw.nodes = Array.from(nodeMap.values());
  raw.edges = Array.from(edgeMap.values());
  STATE.raw = raw;
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
  return orderedLayerKeys(Array.from(set.values()).filter(Boolean));
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
  var metaProviderLayerLabels = normalizeLayerMap(meta.provider_layer_labels || {}, "edge");
  var metaLayerColors = normalizeLayerMap(meta.layer_colors || {}, "edge");
  var metaLinkColors = normalizeLayerMap(meta.link_colors || {}, "edge");
  var metaLayerStyles = normalizeLayerMap(meta.layer_styles || {}, "edge");
  var metaLayerFlow = normalizeLayerMap(meta.layer_flow || {}, "edge");
  var metaLinkStrengths = normalizeLayerMap(meta.link_strengths || {}, "edge");
  var metaLinkDistances = normalizeLayerMap(meta.link_distances || {}, "edge");
  var metaLinkWeights = normalizeLayerMap(meta.link_weights || {}, "edge");
  var metaLinkWeightModes = normalizeLayerMap(meta.link_weight_modes || {}, "edge");
  if (!Object.prototype.hasOwnProperty.call(metaLayerEnabled, "notes")
      && Object.prototype.hasOwnProperty.call(metaLayerEnabled, "priority")) {
    metaLayerEnabled.notes = metaLayerEnabled.priority;
  }

  var allLayers = collectLayers(data);
  var nextLayers = {};
  var nextLayerColors = {};
  var nextLinkColors = {};

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

    if (Object.prototype.hasOwnProperty.call(metaLinkColors, layer) && metaLinkColors[layer]) {
      nextLinkColors[layer] = String(metaLinkColors[layer]);
    } else if (STATE.linkColors && STATE.linkColors[layer]) {
      nextLinkColors[layer] = STATE.linkColors[layer];
    } else if (Object.prototype.hasOwnProperty.call(nextLayerColors, layer) && nextLayerColors[layer]) {
      nextLinkColors[layer] = String(nextLayerColors[layer]);
    } else {
      nextLinkColors[layer] = fallbackLayerColor(layer);
    }
  });

  STATE.layers = nextLayers;
  STATE.providerLayerLabels = metaProviderLayerLabels;
  var massLinkerGroupsAvailable = Array.isArray(meta.mass_linker_groups_available)
    ? meta.mass_linker_groups_available.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
    : (Array.isArray(STATE.massLinkerGroupsAvailable) ? STATE.massLinkerGroupsAvailable.slice() : []);
  var massLinkerGroupHubs = Array.isArray(meta.mass_linker_group_hubs)
    ? meta.mass_linker_group_hubs.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
    : (Array.isArray(STATE.massLinkerGroupHubs) ? STATE.massLinkerGroupHubs.slice() : []);
  STATE.massLinkerGroupsAvailable = massLinkerGroupsAvailable;
  STATE.massLinkerGroupHubs = massLinkerGroupHubs;
  STATE.layerColors = nextLayerColors;
  STATE.linkColors = nextLinkColors;
  STATE.layerStyles = Object.assign({}, metaLayerStyles, normalizeLayerMap(STATE.layerStyles || {}, "edge"));
  STATE.layerFlow = Object.assign({}, metaLayerFlow, normalizeLayerMap(STATE.layerFlow || {}, "edge"));
  STATE.linkStrengths = Object.assign({}, metaLinkStrengths, normalizeLayerMap(STATE.linkStrengths || {}, "edge"));
  STATE.linkDistances = Object.assign({}, metaLinkDistances, normalizeLayerMap(STATE.linkDistances || {}, "edge"));
  STATE.linkWeights = Object.assign({}, metaLinkWeights, normalizeLayerMap(STATE.linkWeights || {}, "edge"));
  STATE.linkWeightModes = Object.assign({}, metaLinkWeightModes, normalizeLayerMap(STATE.linkWeightModes || {}, "edge"));

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
  syncLinkSettingsFromMeta();
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
  return layer === "notes" || layer === "examples" || layer === "kanji";
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
  var color = (STATE.linkColors && STATE.linkColors[edge.layer]) || fallbackLayerColor(edge.layer);
  return parseColor(color, 0.58);
}

function linkWidth(edge) {
  var style = String(STATE.layerStyles[edge.layer] || "");
  var lineStrength = Number(STATE.linkStrengths[edge.layer]);
  if (!isFinite(lineStrength) || lineStrength < 0) lineStrength = 1;
  var base = 1.8 * lineStrength;
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

function resolveBaseLinkWeight(edge) {
  var layer = edgeLayerKey(edge);
  var weight = Number(STATE.linkWeights[layer]);
  if (!isFinite(weight) || weight < 0) weight = 1;
  return clamp(weight, 0, 50);
}

function resolveBaseLinkStrength(edge) {
  return 1;
}

function resolveTrailingHubDistance() {
  var value = NaN;
  if (STATE.linkSettings && typeof STATE.linkSettings === "object") {
    value = Number(STATE.linkSettings.trailing_hub_distance);
  }
  if (!isFinite(value)) value = Number(STATE.trailingHubDistance);
  if (!isFinite(value)) {
    var defaults = getLinkSettingsDefaults();
    value = Number(defaults.trailing_hub_distance);
  }
  if (!isFinite(value)) return 0;
  return clamp(value, 0, 5000);
}

function trailingHubIdForEdge(edge) {
  if (!edge || String(edge.layer || "") !== "families") return "";
  var meta = edgeMeta(edge);
  if (String(meta.kind || "") !== "hub") return "";
  var source = String(edge.source || "");
  var target = String(edge.target || "");
  if (source.indexOf("family:") === 0) return source;
  if (target.indexOf("family:") === 0) return target;
  return "";
}

function buildTrailingHubDegreeMap(edgeRecords, baseStrengths) {
  var map = new Map();
  if (!Array.isArray(edgeRecords) || !edgeRecords.length) return map;

  for (var i = 0; i < edgeRecords.length; i += 1) {
    var rec = edgeRecords[i];
    if (!rec || !rec.edge) continue;
    if (baseStrengths && baseStrengths.length > i) {
      var activeStrength = Number(baseStrengths[i]);
      if (!isFinite(activeStrength) || activeStrength <= 0) continue;
    }
    var hubId = trailingHubIdForEdge(rec.edge);
    if (!hubId) continue;
    map.set(hubId, (Number(map.get(hubId) || 0) + 1));
  }

  return map;
}

function applyTrailingHubDistances(edgeRecords, distances, baseStrengths) {
  if (!Array.isArray(edgeRecords) || !distances || !distances.length) return;
  var trailingDistance = resolveTrailingHubDistance();
  if (!isFinite(trailingDistance) || trailingDistance <= 0) return;

  var degreeMap = buildTrailingHubDegreeMap(edgeRecords, baseStrengths);
  if (!degreeMap.size) return;

  for (var i = 0; i < edgeRecords.length; i += 1) {
    var rec = edgeRecords[i];
    if (!rec || !rec.edge) continue;
    if (baseStrengths && baseStrengths.length > i) {
      var activeStrength = Number(baseStrengths[i]);
      if (!isFinite(activeStrength) || activeStrength <= 0) continue;
    }
    var hubId = trailingHubIdForEdge(rec.edge);
    if (!hubId) continue;
    if (Number(degreeMap.get(hubId) || 0) !== 1) continue;
    distances[i] = trailingDistance;
  }
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
    var lengthWeight = resolveBaseLinkWeight(rec.edge);
    var activeStrength = (baseStrengths && baseStrengths.length > i)
      ? Number(baseStrengths[i] || 0)
      : resolveBaseLinkStrength(rec.edge);
    if (!isFinite(activeStrength) || activeStrength < 0) activeStrength = 0;
    var metric = Number(metrics[i] || 0);
    var metricScale = strengthScaleFromMetric(metric);
    distances[i] = clamp(baseDistance * lengthWeight * distanceScaleFromMetric(metric), 1, 5000);
    strengths[i] = clamp((activeStrength > 0 ? metricScale : 0), 0, 50);
  }

  applyTrailingHubDistances(edgeRecords, distances, baseStrengths);
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
    var lengthWeight = resolveBaseLinkWeight(rec.edge);
    var activeStrength = (baseStrengths && baseStrengths.length > i)
      ? Number(baseStrengths[i] || 0)
      : resolveBaseLinkStrength(rec.edge);
    if (!isFinite(activeStrength) || activeStrength < 0) activeStrength = 0;
    var metric = Number(metrics[i] || 0);
    var metricScale = strengthScaleFromMetric(metric);

    distances[i] = clamp(baseDistance * lengthWeight * distanceScaleFromMetric(metric) * LINK_SCALAR_DISTANCE_SCALE, 1, 5000);
    strengths[i] = clamp((activeStrength > 0 ? metricScale : 0) * LINK_SCALAR_STRENGTH_SCALE, 0, 50);
  }

  applyTrailingHubDistances(edgeRecords, distances, baseStrengths);
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
  var linkFlowMask = [];
  var linkBidirMask = [];
  var edgeRecords = [];
  var visibleEdges = [];

  edges.forEach(function (edge, edgeIdx) {
    var s = indexById.get(edge.source);
    var t = indexById.get(edge.target);
    if (s === undefined || t === undefined) return;

    var col = linkColor(edge);
    var suppressed = !!(suppressHubDirectMask && suppressHubDirectMask.length > edgeIdx && suppressHubDirectMask[edgeIdx]);
    var width = linkWidth(edge);
    var strength = resolveBaseLinkStrength(edge);
    if (suppressed) {
      width = 0;
      strength = 0;
      col[3] = 0;
    }
    var hasFlow = 0;
    var hasBidir = edgeMeta(edge).bidirectional ? 1 : 0;
    flatLinks.push(s, t);
    linkColorsFlat.push(col[0], col[1], col[2], col[3]);
    linkWidths.push(width);
    linkStrengthFlat.push(strength);
    linkStyleCodes.push(linkStyleCode(edge));
    linkFlowMask.push(hasFlow);
    linkBidirMask.push(hasBidir);
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
    linkStyleCodes: new Uint8Array(linkStyleCodes),
    linkFlowMask: new Uint8Array(linkFlowMask),
    linkBidirMask: new Uint8Array(linkBidirMask)
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
  var edgeFlowMask = new Uint8Array(edges.length);
  var edgeBidirMask = new Uint8Array(edges.length);
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
    edgeBidirMask[i] = edgeMeta(edge).bidirectional ? 1 : 0;
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
  var basePointSizes = new Float32Array(pointSizes);
  var baseLinkColors = new Float32Array(linkColorsFlat);
  var stylePointColors = new Float32Array(basePointColors);
  var stylePointSizes = new Float32Array(basePointSizes);
  var styleLinkColors = new Float32Array(baseLinkColors);
  var algoScalars = buildLinkScalarArrays(edgeRecords, linkStrengthBase);
  var linkDistance = algoScalars.linkDistance;
  var linkStrength = algoScalars.linkStrength;

  STATE.basePointColors = basePointColors;
  STATE.basePointSizes = basePointSizes;
  STATE.baseLinkColors = baseLinkColors;
  STATE.runtimeNodeVisibleMask = nodeVisible;
  STATE.runtimeEdgeVisibleMask = edgeRendered;
  STATE.runtimeEdgeFlowMask = edgeFlowMask;
  STATE.runtimeFlowActiveEdgeIndices = [];
  STATE.runtimeFlowEdgeMask = new Uint8Array(edgeRendered);
  STATE.pointStyleColors = stylePointColors;
  STATE.pointStyleSizes = stylePointSizes;

  var visibleNodeCount = 0;
  var visibleNoteCount = 0;
  var visibleFamilyCount = 0;
  var visibleEdgeCount = 0;
  for (i = 0; i < nodeVisible.length; i += 1) {
    if (!nodeVisible[i]) continue;
    visibleNodeCount += 1;
    if (nodes[i] && nodes[i].kind === "family") visibleFamilyCount += 1;
    else visibleNoteCount += 1;
  }
  for (i = 0; i < edgeRendered.length; i += 1) {
    if (edgeRendered[i]) visibleEdgeCount += 1;
  }
  STATE.visibleGraphCounts = {
    notes: visibleNoteCount,
    families: visibleFamilyCount,
    edges: visibleEdgeCount
  };

  if (typeof STATE.graph.setPointColors === "function") STATE.graph.setPointColors(stylePointColors);
  if (typeof STATE.graph.setPointSizes === "function") STATE.graph.setPointSizes(stylePointSizes);
  if (typeof STATE.graph.setLinkColors === "function") STATE.graph.setLinkColors(styleLinkColors);
  if (typeof STATE.graph.setLinkWidths === "function") STATE.graph.setLinkWidths(linkWidths);
  if (typeof STATE.graph.setLinkStrength === "function") STATE.graph.setLinkStrength(linkStrength);
  if (typeof STATE.graph.setLinkStyleCodes === "function") STATE.graph.setLinkStyleCodes(linkStyleCodes);
  if (typeof STATE.graph.setLinkFlowMask === "function") STATE.graph.setLinkFlowMask(edgeFlowMask);
  if (typeof STATE.graph.setLinkBidirMask === "function") STATE.graph.setLinkBidirMask(edgeBidirMask);
  if (typeof STATE.graph.setLinkDistance === "function") STATE.graph.setLinkDistance(linkDistance);

  var adapter = window && window.GraphAdapter;
  var handledByEngineAdapter = false;
  if (adapter && typeof adapter.callEngine === "function") {
    var res = adapter.callEngine("applyVisualStyles", 0.08);
    handledByEngineAdapter = (res !== undefined);
  }
  if (!handledByEngineAdapter && typeof STATE.graph.render === "function") {
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

(function registerPayloadAdapterPorts() {
  var adapter = window && window.GraphAdapter;
  if (!adapter || typeof adapter.registerCityPort !== "function") return;

  adapter.registerCityPort("getEngineSolverDefaults", getEngineSolverDefaults);
  adapter.registerCityPort("getEngineRuntimeDefaults", getEngineRuntimeDefaults);
  adapter.registerCityPort("getEngineRendererDefaults", getEngineRendererDefaults);
  adapter.registerCityPort("getEngineSolverSpec", getEngineSolverSpec);
  adapter.registerCityPort("getEngineRuntimeSpec", getEngineRuntimeSpec);
  adapter.registerCityPort("getEngineRendererSpec", getEngineRendererSpec);
  adapter.registerCityPort("collectSolverSettings", collectSolverSettings);
  adapter.registerCityPort("collectEngineRuntimeSettings", collectEngineRuntimeSettings);
  adapter.registerCityPort("collectRendererSettings", collectRendererSettings);
  adapter.registerCityPort("getNodeSettingsDefaults", getNodeSettingsDefaults);
  adapter.registerCityPort("getNodeSettingsSpec", getNodeSettingsSpec);
  adapter.registerCityPort("collectNodeSettings", collectNodeSettings);
  adapter.registerCityPort("getCardSettingsDefaults", getCardSettingsDefaults);
  adapter.registerCityPort("getCardSettingsSpec", getCardSettingsSpec);
  adapter.registerCityPort("collectCardSettings", collectCardSettings);
  adapter.registerCityPort("cardSettingsFromMeta", cardSettingsFromMeta);
  adapter.registerCityPort("syncCardSettingsFromMeta", syncCardSettingsFromMeta);
  adapter.registerCityPort("getLinkSettingsDefaults", getLinkSettingsDefaults);
  adapter.registerCityPort("getLinkSettingsSpec", getLinkSettingsSpec);
  adapter.registerCityPort("collectLinkSettings", collectLinkSettings);
  adapter.registerCityPort("linkSettingsFromMeta", linkSettingsFromMeta);
  adapter.registerCityPort("syncLinkSettingsFromMeta", syncLinkSettingsFromMeta);
  adapter.registerCityPort("stableEdgeKey", stableEdgeKey);
  adapter.registerCityPort("applyNodeMods", applyNodeMods);
  adapter.registerCityPort("applyEdgeMods", applyEdgeMods);
  adapter.registerCityPort("applyLayerProviderMods", applyLayerProviderMods);
  adapter.registerCityPort("applyHubGroupingMods", applyHubGroupingMods);
  adapter.registerCityPort("applyDerivedVisualMods", applyDerivedVisualMods);
  adapter.registerCityPort("prepareDeltaSlice", prepareDeltaSlice);
  adapter.registerCityPort("buildDeltaOps", buildDeltaOps);
  adapter.registerCityPort("applyDeltaOpsToState", applyDeltaOpsToState);
  adapter.registerCityPort("AjpcNodeBaseSize", ajpcNodeBaseSize);
  adapter.registerCityPort("buildGraphArrays", buildGraphArrays);
  adapter.registerCityPort("applyRuntimeUiSettings", applyRuntimeUiSettings);
  adapter.registerCityPort("applyRuntimeLinkDistances", applyRuntimeLinkDistances);
})();
