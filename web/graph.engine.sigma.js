"use strict";

var SigmaApi = window.Sigma || null;
var GraphologyApi = window.graphology || null;

var DNC = "#60a5fa";
var DEC = "#334155";
var DNS = 1.4;
var DES = 0.6;

var EDGE_TYPE_CURVED = "ajpc_edge_curved";
var EDGE_TYPE_DASHED = "ajpc_edge_dashed";
var EDGE_TYPE_DOTTED = "ajpc_edge_dotted";
var NODE_TYPE_NOTE = "ajpc_note";

var DEF_SOLVER = {
  layout_enabled: true,
  fa2_lin_log_mode: false,
  fa2_outbound_attraction_distribution: false,
  fa2_adjust_sizes: false,
  fa2_edge_weight_influence: 1,
  fa2_scaling_ratio: 4.2,
  fa2_strong_gravity_mode: false,
  fa2_gravity: 0.4,
  fa2_slow_down: 8,
  fa2_barnes_hut_optimize: true,
  fa2_barnes_hut_theta: 0.5
};

var DEF_RENDERER = {
  sigma_draw_labels: false,
  sigma_draw_hover_nodes: false,
  sigma_label_threshold: 8,
  sigma_hide_edges_on_move: false,
  sigma_batch_edges_drawing: true,
  sigma_mouse_wheel_enabled: true,
  sigma_double_click_enabled: false,
  sigma_min_camera_ratio: 0.01,
  sigma_max_camera_ratio: 6,
  sigma_side_margin: 0,
  sigma_animations_time: 0,
  sigma_enable_edge_hovering: false
};

var DEF_ENGINE = {};

var SPEC_SOLVER = [
  { key: "layout_enabled", label: "Layout Enabled", type: "bool", affectsEngine: true, hint: "Start or stop the ForceAtlas2 worker layout." },
  { key: "fa2_lin_log_mode", label: "LinLog Mode", type: "bool", affectsEngine: true, hint: "Use LinLog attraction model to emphasize cluster separation." },
  { key: "fa2_outbound_attraction_distribution", label: "Outbound Attraction Distribution", type: "bool", affectsEngine: true, hint: "Normalize attraction by source node degree (directed-graph variant)." },
  { key: "fa2_adjust_sizes", label: "Adjust Sizes", type: "bool", affectsEngine: true, hint: "Enable anti-collision using node sizes during force computation." },
  { key: "fa2_edge_weight_influence", label: "Edge Weight Influence", type: "number", min: 0, max: 4, step: 0.01, affectsEngine: true, hint: "How strongly edge weight affects attraction force." },
  { key: "fa2_scaling_ratio", label: "Scaling Ratio", type: "number", min: 0.01, max: 200, step: 0.01, affectsEngine: true, hint: "Global repulsion coefficient (higher pushes nodes farther apart)." },
  { key: "fa2_strong_gravity_mode", label: "Strong Gravity Mode", type: "bool", affectsEngine: true, hint: "Apply linear strong gravity instead of distance-scaled gravity." },
  { key: "fa2_gravity", label: "Gravity", type: "number", min: 0, max: 10, step: 0.001, affectsEngine: true, hint: "Centering force pulling nodes toward graph origin." },
  { key: "fa2_slow_down", label: "Slow Down", type: "number", min: 0.1, max: 200, step: 0.1, affectsEngine: true, hint: "Global speed divisor; higher values make layout move slower." },
  { key: "fa2_barnes_hut_optimize", label: "Barnes-Hut Optimize", type: "bool", affectsEngine: true, hint: "Use Barnes-Hut approximation for faster repulsion on large graphs." },
  { key: "fa2_barnes_hut_theta", label: "Barnes-Hut Theta", type: "number", min: 0.1, max: 2, step: 0.01, affectsEngine: true, hint: "Barnes-Hut precision/speed tradeoff (lower is more accurate)." }
];

var SPEC_RENDERER = [
  { key: "sigma_draw_labels", label: "Draw Labels", type: "bool", affectsEngine: true },
  { key: "sigma_draw_hover_nodes", label: "Draw Hover Labels", type: "bool", affectsEngine: true },
  { key: "sigma_label_threshold", label: "Label Threshold", type: "number", min: 0, max: 64, step: 1, affectsEngine: true },
  { key: "sigma_hide_edges_on_move", label: "Hide Edges On Move", type: "bool", affectsEngine: true },
  { key: "sigma_mouse_wheel_enabled", label: "Mouse Wheel Enabled", type: "bool", affectsEngine: true },
  { key: "sigma_double_click_enabled", label: "Double Click Enabled", type: "bool", affectsEngine: true },
  { key: "sigma_min_camera_ratio", label: "Min Camera Ratio", type: "number", min: 0.0001, max: 100, step: 0.0001, affectsEngine: true },
  { key: "sigma_max_camera_ratio", label: "Max Camera Ratio", type: "number", min: 0.0001, max: 100, step: 0.0001, affectsEngine: true },
  { key: "sigma_side_margin", label: "Side Margin", type: "number", min: 0, max: 512, step: 1, affectsEngine: true },
  { key: "sigma_animations_time", label: "Animations Time", type: "number", min: 0, max: 5000, step: 1, affectsEngine: true },
  { key: "sigma_enable_edge_hovering", label: "Enable Edge Hovering", type: "bool", affectsEngine: true }
];

var SPEC_ENGINE = [];

window.ajpcEngineSettings = {
  id: "sigma_v3",
  engine: { defaults: Object.assign({}, DEF_ENGINE), spec: SPEC_ENGINE.slice() },
  solver: { defaults: Object.assign({}, DEF_SOLVER), spec: SPEC_SOLVER.slice() },
  renderer: { defaults: Object.assign({}, DEF_RENDERER), spec: SPEC_RENDERER.slice() }
};

function lg(level, msg) {
  if (typeof log === "function") log("sigma.engine." + String(level || "debug") + ": " + String(msg || ""));
}

function dbgOn() {
  try { return !!(window && window.STATE && window.STATE.debugEnabled); } catch (_e) {}
  return false;
}

function dbg(tag, payload) {
  if (!dbgOn()) return;
  if (payload === undefined || payload === null) { lg("debug", String(tag || "")); return; }
  if (typeof payload === "string") { lg("debug", String(tag || "") + ": " + payload); return; }
  try { lg("debug", String(tag || "") + ": " + JSON.stringify(payload)); } catch (_e2) { lg("debug", String(tag || "") + ": [unserializable]"); }
}

function fin(v) { return typeof v === "number" && isFinite(v); }
function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
function num(v, fallback, minV, maxV) {
  var n = Number(v);
  if (!fin(n)) n = Number(fallback);
  if (!fin(n)) n = 0;
  if (minV !== undefined) n = Math.max(Number(minV), n);
  if (maxV !== undefined) n = Math.min(Number(maxV), n);
  return n;
}
function it(v, fallback, minV, maxV) { return Math.round(num(v, fallback, minV, maxV)); }
function bol(v, fallback) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    var s = v.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  }
  return !!fallback;
}
function off() { return (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE)) ? (SPACE_SIZE * 0.5) : 2048; }

function rgba(flat, i, fallback) {
  if (!flat || flat.length < ((i * 4) + 4)) return String(fallback || "#94a3b8");
  var r = cl(Number(flat[i * 4] || 0), 0, 1);
  var g = cl(Number(flat[(i * 4) + 1] || 0), 0, 1);
  var b = cl(Number(flat[(i * 4) + 2] || 0), 0, 1);
  var a = cl(Number(flat[(i * 4) + 3] || 1), 0, 1);
  return "rgba(" + Math.round(r * 255) + "," + Math.round(g * 255) + "," + Math.round(b * 255) + "," + a.toFixed(3) + ")";
}

function rgbaM(flat, i, fallback, mul) {
  if (!flat || flat.length < ((i * 4) + 4)) return String(fallback || "#94a3b8");
  var r = cl(Number(flat[i * 4] || 0), 0, 1);
  var g = cl(Number(flat[(i * 4) + 1] || 0), 0, 1);
  var b = cl(Number(flat[(i * 4) + 2] || 0), 0, 1);
  var a = cl(Number(flat[(i * 4) + 3] || 1), 0, 1);
  a = cl(a * Number(mul === undefined ? 1 : mul), 0, 1);
  return "rgba(" + Math.round(r * 255) + "," + Math.round(g * 255) + "," + Math.round(b * 255) + "," + a.toFixed(3) + ")";
}

function nid(payload) { if (!payload) return null; return payload.node === undefined || payload.node === null ? null : String(payload.node); }
function eid(payload) { if (!payload) return null; return payload.edge === undefined || payload.edge === null ? null : String(payload.edge); }

function hev(payload) {
  var e = payload && payload.event ? payload.event : null;
  var o = e && e.original ? e.original : null;
  if (o && typeof o.clientX === "number" && typeof o.clientY === "number") return { clientX: Number(o.clientX), clientY: Number(o.clientY) };
  if (e && typeof e.x === "number" && typeof e.y === "number") return { clientX: Number(e.x), clientY: Number(e.y) };
  return null;
}

function mkGraph() {
  if (!GraphologyApi) return null;
  if (typeof GraphologyApi === "function") return new GraphologyApi({ type: "directed", multi: true, allowSelfLoops: true });
  if (GraphologyApi.Graph && typeof GraphologyApi.Graph === "function") return new GraphologyApi.Graph({ type: "directed", multi: true, allowSelfLoops: true });
  return null;
}

function edgeProgByName(name) {
  var key = String(name || "").toLowerCase();
  var registry = window && window.AJPCSigmaPrograms ? window.AJPCSigmaPrograms : null;
  if (registry && registry.edge && typeof registry.edge[key] === "function") return registry.edge[key];
  if (key === "curved") {
    var rendering = (SigmaApi && SigmaApi.rendering) ? SigmaApi.rendering : null;
    if (!rendering && window && window.Sigma && window.Sigma.rendering) rendering = window.Sigma.rendering;
    if (rendering && typeof rendering.EdgeCurveProgram === "function") return rendering.EdgeCurveProgram;
  }
  return null;
}

function nodeProgByName(name) {
  var key = String(name || "").toLowerCase();
  var registry = window && window.AJPCSigmaPrograms ? window.AJPCSigmaPrograms : null;
  if (registry && registry.node && typeof registry.node[key] === "function") return registry.node[key];
  return null;
}

function edgeTypeCurve() {
  return edgeProgByName("curved") ? EDGE_TYPE_CURVED : "line";
}

function styleCode(arr, idx) {
  var code = (arr && arr.length > idx) ? (Number(arr[idx]) | 0) : 0;
  return (code === 1 || code === 2) ? code : 0;
}

function nodeTypeByCode(arr, idx) {
  var code = (arr && arr.length > idx) ? (Number(arr[idx]) | 0) : 1;
  if (code === 0) return NODE_TYPE_NOTE;
  return "circle";
}

function alphaMul(_styleCode) { return 1; }

function edgeTypeByStyle(code) {
  if (code === 1) return edgeProgByName("curved") ? EDGE_TYPE_DASHED : "line";
  if (code === 2) return edgeProgByName("curved") ? EDGE_TYPE_DOTTED : "line";
  return edgeTypeCurve();
}

function edgeCurvByStyle(code, idx) {
  if (code === 0 && edgeTypeCurve() === EDGE_TYPE_CURVED) return ((idx % 2) === 0 ? 0.2 : -0.2);
  if (edgeTypeCurve() === EDGE_TYPE_CURVED) return ((idx % 2) === 0 ? 0.12 : -0.12);
  return 0;
}

function trSolver(raw, prev) {
  var p = prev && typeof prev === "object" ? prev : {};
  var s = raw && typeof raw === "object" ? raw : {};
  var m = Object.assign({}, DEF_SOLVER, p, s);
  return {
    layout_enabled: bol(m.layout_enabled, DEF_SOLVER.layout_enabled),
    fa2_lin_log_mode: bol(m.fa2_lin_log_mode, DEF_SOLVER.fa2_lin_log_mode),
    fa2_outbound_attraction_distribution: bol(m.fa2_outbound_attraction_distribution, DEF_SOLVER.fa2_outbound_attraction_distribution),
    fa2_adjust_sizes: bol(m.fa2_adjust_sizes, DEF_SOLVER.fa2_adjust_sizes),
    fa2_edge_weight_influence: num(m.fa2_edge_weight_influence, DEF_SOLVER.fa2_edge_weight_influence, 0, 4),
    fa2_scaling_ratio: num(m.fa2_scaling_ratio, DEF_SOLVER.fa2_scaling_ratio, 0.01, 200),
    fa2_strong_gravity_mode: bol(m.fa2_strong_gravity_mode, DEF_SOLVER.fa2_strong_gravity_mode),
    fa2_gravity: num(m.fa2_gravity, DEF_SOLVER.fa2_gravity, 0, 10),
    fa2_slow_down: num(m.fa2_slow_down, DEF_SOLVER.fa2_slow_down, 0.1, 200),
    fa2_barnes_hut_optimize: bol(m.fa2_barnes_hut_optimize, DEF_SOLVER.fa2_barnes_hut_optimize),
    fa2_barnes_hut_theta: num(m.fa2_barnes_hut_theta, DEF_SOLVER.fa2_barnes_hut_theta, 0.1, 2)
  };
}

function trEngine(raw, prev) {
  var p = prev && typeof prev === "object" ? prev : {};
  var s = raw && typeof raw === "object" ? raw : {};
  return Object.assign({}, DEF_ENGINE, p, s);
}

function trRenderer(raw, prev) {
  var p = prev && typeof prev === "object" ? prev : {};
  var s = raw && typeof raw === "object" ? raw : {};
  var m = Object.assign({}, DEF_RENDERER, p, s);
  return {
    sigma_draw_labels: bol(m.sigma_draw_labels, DEF_RENDERER.sigma_draw_labels),
    sigma_draw_hover_nodes: bol(m.sigma_draw_hover_nodes, DEF_RENDERER.sigma_draw_hover_nodes),
    sigma_label_threshold: num(m.sigma_label_threshold, DEF_RENDERER.sigma_label_threshold, 0, 64),
    sigma_hide_edges_on_move: bol(m.sigma_hide_edges_on_move, DEF_RENDERER.sigma_hide_edges_on_move),
    sigma_batch_edges_drawing: bol(m.sigma_batch_edges_drawing, DEF_RENDERER.sigma_batch_edges_drawing),
    sigma_mouse_wheel_enabled: bol(m.sigma_mouse_wheel_enabled, DEF_RENDERER.sigma_mouse_wheel_enabled),
    sigma_double_click_enabled: bol(m.sigma_double_click_enabled, DEF_RENDERER.sigma_double_click_enabled),
    sigma_min_camera_ratio: num(m.sigma_min_camera_ratio, DEF_RENDERER.sigma_min_camera_ratio, 0.0001, 100),
    sigma_max_camera_ratio: num(m.sigma_max_camera_ratio, DEF_RENDERER.sigma_max_camera_ratio, 0.0001, 100),
    sigma_side_margin: num(m.sigma_side_margin, DEF_RENDERER.sigma_side_margin, 0, 512),
    sigma_animations_time: it(m.sigma_animations_time, DEF_RENDERER.sigma_animations_time, 0, 5000),
    sigma_enable_edge_hovering: bol(m.sigma_enable_edge_hovering, DEF_RENDERER.sigma_enable_edge_hovering)
  };
}

function extractSolverConfig(cfg) {
  var src = cfg && typeof cfg === "object" ? cfg : {};
  if (src.solver && typeof src.solver === "object") return src.solver;

  var out = {};
  Object.keys(DEF_SOLVER).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  });
  return out;
}

function extractEngineConfig(cfg) {
  var src = cfg && typeof cfg === "object" ? cfg : {};
  if (src.engine && typeof src.engine === "object") return src.engine;

  var out = {};
  Object.keys(DEF_ENGINE).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  });
  return out;
}

function extractRendererConfig(cfg) {
  var src = cfg && typeof cfg === "object" ? cfg : {};
  if (src.renderer && typeof src.renderer === "object") return src.renderer;

  var out = {};
  Object.keys(DEF_RENDERER).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  });
  return out;
}

function SigmaGraphCompat(container, config) {
  this.container = container;
  this.config = Object.assign({}, config || {});

  this.instance = null;
  this.graph = null;

  this.runtimeSolver = trSolver(null, null);
  this.runtimeEngine = trEngine(null, null);
  this.runtimeRenderer = trRenderer(null, null);

  this.pointPositions = [];
  this.pointColors = new Float32Array(0);
  this.pointSizes = new Float32Array(0);
  this.pointTypeCodes = new Uint8Array(0);

  this.linksFlat = new Float32Array(0);
  this.linkColors = new Float32Array(0);
  this.linkWidths = new Float32Array(0);
  this.linkStrength = new Float32Array(0);
  this.linkDistance = new Float32Array(0);
  this.linkStyleCodes = new Uint8Array(0);
  this.linkArrows = new Float32Array(0);

  this.idByIndex = [];
  this.indexById = new Map();
  this.edgeIdByIndex = [];
  this.edgeIndexById = new Map();
  this.nodeLayoutAttrsById = new Map();
  this.selectedIndices = [];

  this.dataDirty = true;
  this.styleDirty = false;
  this._useCustomNodeTypes = false;

  this.dataModel = new AjpcGraphDataGraphology(this);
  this.graph = this.dataModel.getGraph();

  this.renderer = new AjpcGraphRendererSigma(this);
  this.solver = new AjpcGraphSolverFa2(this);

  this.renderer.init();
  this.instance = this.renderer.instance;
}

function bool01(v) { return v ? 1 : 0; }

function nodeLayersList(node) {
  var layers = node && Array.isArray(node.layers) ? node.layers : [];
  return layers.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
}

function nodeHasLayer(node, layerKey) {
  var key = String(layerKey || "");
  if (!key) return false;
  var layers = nodeLayersList(node);
  for (var i = 0; i < layers.length; i += 1) if (layers[i] === key) return true;
  return false;
}

function primaryFamilyIdFromNode(node) {
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

function buildNodeLayoutAttrs(node) {
  var n = node && typeof node === "object" ? node : {};
  var layers = nodeLayersList(n);
  var familyPrios = n.family_prios && typeof n.family_prios === "object" ? n.family_prios : {};
  var prioKeys = Object.keys(familyPrios).map(function (k) { return String(k || ""); }).filter(Boolean);
  var primaryFamily = primaryFamilyIdFromNode(n);
  var noteTypeId = (n.note_type_id !== undefined && n.note_type_id !== null) ? String(n.note_type_id) : "";
  var noteType = String(n.note_type || "");
  var kind = String(n.kind || "note");
  var familyCluster = primaryFamily
    ? ("family:" + primaryFamily)
    : ("nofamily:" + (noteTypeId || "unknown"));

  return {
    grp_kind: kind,
    grp_note_type_id: noteTypeId,
    grp_note_type: noteType || noteTypeId || "",
    grp_family_cluster: familyCluster,
    grp_layer_primary: layers.length ? layers[0] : "",
    grp_layers_count: layers.length,
    grp_has_priority: bool01(nodeHasLayer(n, "priority")),
    grp_has_note_links: bool01(nodeHasLayer(n, "note_links")),
    grp_has_mass_links: bool01(nodeHasLayer(n, "mass_links")),
    grp_has_families: bool01(nodeHasLayer(n, "families")),
    grp_has_examples: bool01(nodeHasLayer(n, "examples")),
    grp_has_kanji: bool01(nodeHasLayer(n, "kanji")),
    grp_family_prio_count: prioKeys.length
  };
}

SigmaGraphCompat.prototype.setNodeLayoutAttributes = function (nodes) {
  var list = Array.isArray(nodes) ? nodes : [];
  var out = new Map();
  for (var i = 0; i < list.length; i += 1) {
    var node = list[i];
    if (!node || node.id === undefined || node.id === null) continue;
    out.set(String(node.id), buildNodeLayoutAttrs(node));
  }
  this.nodeLayoutAttrsById = out;
  this.dataDirty = true;
};

SigmaGraphCompat.prototype._sync = function () {
  if (!this.renderer || !this.graph) return;
  if (!this.dataDirty && !this.styleDirty) return;

  dbg("sync", {
    dataDirty: !!this.dataDirty,
    styleDirty: !!this.styleDirty,
    nodeCount: this.idByIndex.length,
    edgeCount: Math.floor(this.linksFlat.length / 2)
  });

  if (this.dataDirty) {
    this.solver.stop(false);
    this.dataModel.buildGraph();
    this.dataDirty = false;
    this.styleDirty = false;
    this.renderer.refresh();
    if (this.runtimeSolver.layout_enabled) this.solver.start();
    return;
  }

  this.dataModel.styleGraph();
  this.styleDirty = false;
  this.renderer.refresh();
};

SigmaGraphCompat.prototype.render = function () { this._sync(); };
SigmaGraphCompat.prototype.requestFrame = function () { if (this.renderer) this.renderer.requestFrame(); };
SigmaGraphCompat.prototype.resize = function () { if (this.renderer) this.renderer.resize(); };

SigmaGraphCompat.prototype.setPointPositions = function (arr) {
  var flat = Array.prototype.slice.call(arr || []);
  this.pointPositions = flat;
  var n = Math.floor(flat.length / 2);
  if (this.idByIndex.length !== n) {
    this.idByIndex = [];
    this.indexById = new Map();
    for (var i = 0; i < n; i += 1) {
      var id = "n:" + i;
      this.idByIndex[i] = id;
      this.indexById.set(id, i);
    }
    if (this.selectedIndices.length) {
      this.selectedIndices = this.selectedIndices.filter(function (x) { return x >= 0 && x < n; });
    }
  }
  this.dataDirty = true;
};

SigmaGraphCompat.prototype.setLinks = function (arr) { this.linksFlat = (arr && arr.length) ? arr : new Float32Array(0); this.dataDirty = true; };
SigmaGraphCompat.prototype.setLinkStrength = function (arr) { this.linkStrength = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setLinkDistance = function (arr) { this.linkDistance = (arr && arr.length) ? arr : new Float32Array(0); };
SigmaGraphCompat.prototype.setLinkStyleCodes = function (arr) { this.linkStyleCodes = (arr && arr.length) ? arr : new Uint8Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setPointColors = function (arr) { this.pointColors = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setPointSizes = function (arr) { this.pointSizes = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setPointTypeCodes = function (arr) { this.pointTypeCodes = (arr && arr.length) ? arr : new Uint8Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setLinkColors = function (arr) { this.linkColors = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setLinkWidths = function (arr) { this.linkWidths = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };
SigmaGraphCompat.prototype.setLinkArrows = function (arr) { this.linkArrows = (arr && arr.length) ? arr : new Float32Array(0); this.styleDirty = true; };

SigmaGraphCompat.prototype.getPointPositions = function () {
  var out = this.pointPositions.slice();
  var o = off();
  if (!this.graph) return out;

  for (var i = 0; i < this.idByIndex.length; i += 1) {
    var id = this.idByIndex[i];
    if (!id || !this.graph.hasNode(id)) continue;
    var n = this.graph.getNodeAttributes(id);
    out[i * 2] = Number(n.x || 0) + o;
    out[(i * 2) + 1] = Number(n.y || 0) + o;
  }

  this.pointPositions = out.slice();
  return out;
};

SigmaGraphCompat.prototype.getPointScreenRadiusByIndex = function (idx) {
  return this.renderer ? this.renderer.getPointScreenRadiusByIndex(idx) : 0;
};

SigmaGraphCompat.prototype.setConfig = function (cfg) {
  if (!cfg || typeof cfg !== "object") return;

  this.config = Object.assign({}, this.config, cfg);
  var solverPatch = extractSolverConfig(cfg);
  var enginePatch = extractEngineConfig(cfg);
  var rendererPatch = extractRendererConfig(cfg);

  this.runtimeSolver = trSolver(solverPatch, this.runtimeSolver);
  this.runtimeEngine = trEngine(enginePatch, this.runtimeEngine);
  this.runtimeRenderer = trRenderer(rendererPatch, this.runtimeRenderer);

  if (this.renderer) this.renderer.applySettings();

  if (!this.runtimeSolver.layout_enabled) {
    this.solver.stop(true);
  } else {
    this.solver.stop(true);
    this.solver.start();
  }

  lg("debug", "config layout=" + String(this.runtimeSolver.layout_enabled) + " scaling=" + String(this.runtimeSolver.fa2_scaling_ratio) + " gravity=" + String(this.runtimeSolver.fa2_gravity));
};

SigmaGraphCompat.prototype.stop = function (destroySupervisor) { if (this.solver) this.solver.stop(!!destroySupervisor); };
SigmaGraphCompat.prototype.start = function (alpha) { if (this.solver) this.solver.start(alpha); };

SigmaGraphCompat.prototype.selectPointByIndex = function (idx) {
  var i = Number(idx);
  if (!isFinite(i) || i < 0 || i >= this.idByIndex.length) return;
  this.selectedIndices = [i];
};

SigmaGraphCompat.prototype.unselectPoints = function () { this.selectedIndices = []; };
SigmaGraphCompat.prototype.getSelectedIndices = function () { return this.selectedIndices ? this.selectedIndices.slice() : null; };

SigmaGraphCompat.prototype.zoomToPointByIndex = function (idx, duration, zoom) {
  if (this.renderer) this.renderer.zoomToPointByIndex(idx, duration, zoom);
};

SigmaGraphCompat.prototype.getZoomLevel = function () {
  return this.renderer ? this.renderer.getZoomLevel() : 1;
};

SigmaGraphCompat.prototype.getCameraState = function () {
  return this.renderer ? this.renderer.getCameraState() : null;
};

SigmaGraphCompat.prototype.screenToSpacePosition = function (point) {
  if (!Array.isArray(point)) return [0, 0];
  var p = this.renderer ? this.renderer.viewportToGraph(Number(point[0] || 0), Number(point[1] || 0)) : null;
  if (p) return [p.x + off(), p.y + off()];
  return [Number(point[0] || 0), Number(point[1] || 0)];
};

SigmaGraphCompat.prototype.spaceToScreenPosition = function (point) {
  if (!Array.isArray(point)) return [0, 0];
  var p = this.renderer ? this.renderer.graphToViewport(Number(point[0] || 0) - off(), Number(point[1] || 0) - off()) : null;
  if (p) return [p.x, p.y];
  return [Number(point[0] || 0), Number(point[1] || 0)];
};

SigmaGraphCompat.prototype.spaceToScreenRadius = function (radius) {
  var r = Number(radius || 0);
  if (!fin(r) || r <= 0) return 0;
  var a = this.spaceToScreenPosition([0, 0]);
  var b = this.spaceToScreenPosition([r, 0]);
  var dx = Number(b[0] || 0) - Number(a[0] || 0);
  var dy = Number(b[1] || 0) - Number(a[1] || 0);
  var len = Math.sqrt((dx * dx) + (dy * dy));
  return (!fin(len) || len <= 0) ? r : len;
};

SigmaGraphCompat.prototype.fitView = function (duration, padding) {
  if (this.renderer) this.renderer.fitView(duration, padding);
};

SigmaGraphCompat.prototype.kill = function () {
  if (this.solver) this.solver.dispose();
  if (this.renderer) this.renderer.kill();
  this.instance = null;
  this.graph = null;
};

function createGraphEngineSigma(container, config) { return new SigmaGraphCompat(container, config); }
function setGraphPanelFocusClass(enabled) {
  if (!DOM || !DOM.graphPanel || !DOM.graphPanel.classList) return;
  DOM.graphPanel.classList.toggle("focus-mode", !!enabled);
}

function luma(r, g, b) { return (0.2126 * r) + (0.7152 * g) + (0.0722 * b); }

function selectedIndexFromState() {
  var rawIdx = STATE.selectedPointIndex;
  if (rawIdx !== null && rawIdx !== undefined && rawIdx !== "") {
    var idx = Number(rawIdx);
    if (isFinite(idx) && idx >= 0 && idx < STATE.activeNodes.length) return idx;
  }
  if (STATE.activeIndexById && STATE.selectedNodeId !== null && STATE.selectedNodeId !== undefined) {
    var mapped = STATE.activeIndexById.get(String(STATE.selectedNodeId));
    if (mapped !== undefined) {
      STATE.selectedPointIndex = Number(mapped);
      return Number(mapped);
    }
  }
  return -1;
}

function collectFamilyPrioKeys(node) {
  var pr = node && node.family_prios && typeof node.family_prios === "object" ? node.family_prios : {};
  return Object.keys(pr).map(function (k) { return String(k); });
}

function hasSharedPrioKey(selectedKeys, node) {
  if (!selectedKeys || !selectedKeys.size || !node) return false;
  var pr = node.family_prios && typeof node.family_prios === "object" ? node.family_prios : {};
  var keys = Object.keys(pr);
  for (var i = 0; i < keys.length; i += 1) { if (selectedKeys.has(String(keys[i]))) return true; }
  return false;
}

function isFamilyEdgeLayer(layer) {
  return layer === "priority" || layer === "families";
}

function buildSelectionFocusMasks(selectedIndex) {
  var nodes = Array.isArray(STATE.activeNodes) ? STATE.activeNodes : [];
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : new Map();
  var nodeMask = new Uint8Array(nodes.length);
  var edgeMask = new Uint8Array(edges.length);
  var focusedNodeCount = 0, focusedEdgeCount = 0;
  if (selectedIndex < 0 || selectedIndex >= nodes.length) return { nodeMask: nodeMask, edgeMask: edgeMask, hasFocus: false };
  var selectedNode = nodes[selectedIndex];
  if (!selectedNode) return { nodeMask: nodeMask, edgeMask: edgeMask, hasFocus: false };
  var selectedId = String(selectedNode.id || "");
  var selectedPrioKeys = new Set(collectFamilyPrioKeys(selectedNode));
  var familyNodeSet = new Set();
  var prioNodeSet = new Set();
  function markNode(i) { if (i < 0 || i >= nodes.length) return; if (nodeMask[i]) return; nodeMask[i] = 1; focusedNodeCount += 1; }
  function markEdge(i) { if (i < 0 || i >= edges.length) return; if (edgeMask[i]) return; edgeMask[i] = 1; focusedEdgeCount += 1; }

  markNode(selectedIndex);
  selectedPrioKeys.forEach(function (k) {
    var idx = byId.get(String(k));
    if (idx !== undefined) { prioNodeSet.add(Number(idx)); }
  });

  for (var i = 0; i < nodes.length; i += 1) {
    if (i === selectedIndex) continue;
    var n = nodes[i];
    if (hasSharedPrioKey(selectedPrioKeys, n)) { prioNodeSet.add(i); }
  }

  for (var eIdx = 0; eIdx < edges.length; eIdx += 1) {
    var e = edges[eIdx];
    if (!e) continue;
    var s = byId.get(String(e.source || ""));
    var t = byId.get(String(e.target || ""));
    if (s === undefined || t === undefined) continue;
    s = Number(s); t = Number(t);
    var touchesSelected = (s === selectedIndex || t === selectedIndex);
    if (touchesSelected) {
      markEdge(eIdx);
      markNode(s); markNode(t);
      var other = (s === selectedIndex) ? t : s;
      var otherNode = nodes[other];
      var layer = String(e.layer || "");
      var meta = edgeMeta(e);
      if (isFamilyEdgeLayer(layer)) {
        var mfid = String(meta && meta.fid !== undefined && meta.fid !== null ? meta.fid : "");
        if (!selectedPrioKeys.size || !mfid || selectedPrioKeys.has(mfid)) familyNodeSet.add(other);
      }
    }
  }

  prioNodeSet.forEach(function (idx) { markNode(Number(idx)); });
  familyNodeSet.forEach(function (idx) { markNode(Number(idx)); });

  for (var e2 = 0; e2 < edges.length; e2 += 1) {
    var ed = edges[e2];
    if (!ed) continue;
    var s2 = byId.get(String(ed.source || ""));
    var t2 = byId.get(String(ed.target || ""));
    if (s2 === undefined || t2 === undefined) continue;
    s2 = Number(s2); t2 = Number(t2);
    var touchesFamily = familyNodeSet.has(s2) || familyNodeSet.has(t2);
    var touchesPrio = prioNodeSet.has(s2) || prioNodeSet.has(t2);
    if (touchesFamily || touchesPrio) {
      var l2 = String(ed.layer || "");
      if (!isFamilyEdgeLayer(l2)) continue;
      var m2 = edgeMeta(ed), fid2 = String(m2 && m2.fid !== undefined && m2.fid !== null ? m2.fid : "");
      if (selectedPrioKeys.size && fid2 && !selectedPrioKeys.has(fid2)) continue;
      markEdge(e2);
      markNode(s2);
      markNode(t2);
    }
  }

  // Explicitly keep family-prio links (priority/families layers) visible via shared family id.
  if (selectedPrioKeys.size) {
    for (var ef = 0; ef < edges.length; ef += 1) {
      var fedge = edges[ef];
      if (!fedge) continue;
      if (!isFamilyEdgeLayer(String(fedge.layer || ""))) continue;
      var fmeta = edgeMeta(fedge);
      var fid = String(fmeta && fmeta.fid !== undefined && fmeta.fid !== null ? fmeta.fid : "");
      if (!fid || !selectedPrioKeys.has(fid)) continue;
      var fs = byId.get(String(fedge.source || ""));
      var ft = byId.get(String(fedge.target || ""));
      if (fs === undefined || ft === undefined) continue;
      fs = Number(fs); ft = Number(ft);
      markEdge(ef);
      markNode(fs);
      markNode(ft);
    }
  }

  for (var e3 = 0; e3 < edges.length; e3 += 1) {
    var ee = edges[e3];
    if (!ee) continue;
    var s3 = byId.get(String(ee.source || ""));
    var t3 = byId.get(String(ee.target || ""));
    if (s3 === undefined || t3 === undefined) continue;
    s3 = Number(s3); t3 = Number(t3);
    if (nodeMask[s3] && nodeMask[t3]) markEdge(e3);
  }

  return {
    nodeMask: nodeMask,
    edgeMask: edgeMask,
    hasFocus: focusedNodeCount > 0
  };
}

function applySelectionFocusStyles() {
  if (!STATE.graph) return;
  var baseNodeColors = (STATE.basePointColors && STATE.basePointColors.length) ? STATE.basePointColors : null;
  var baseNodeSizes = (STATE.basePointSizes && STATE.basePointSizes.length) ? STATE.basePointSizes : null;
  var baseEdgeColors = (STATE.baseLinkColors && STATE.baseLinkColors.length) ? STATE.baseLinkColors : null;
  if (!baseNodeColors || !baseEdgeColors || !baseNodeSizes) {
    setGraphPanelFocusClass(false);
    return;
  }
  var runtimeNodeMask = (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === baseNodeSizes.length) ? STATE.runtimeNodeVisibleMask : null;
  var runtimeEdgeMask = (STATE.runtimeEdgeVisibleMask && STATE.runtimeEdgeVisibleMask.length === Math.floor(baseEdgeColors.length / 4)) ? STATE.runtimeEdgeVisibleMask : null;

  var selectedIndex = selectedIndexFromState();
  var focus = buildSelectionFocusMasks(selectedIndex);
  STATE.focusNodeMask = focus.nodeMask;
  STATE.focusEdgeMask = focus.edgeMask;

  var outNodeColors = new Float32Array(baseNodeColors.length);
  var outNodeSizes = new Float32Array(baseNodeSizes.length);
  var outEdgeColors = new Float32Array(baseEdgeColors.length);
  outNodeColors.set(baseNodeColors);
  outNodeSizes.set(baseNodeSizes);
  outEdgeColors.set(baseEdgeColors);

  if (focus.hasFocus) {
    for (var i = 0; i < outNodeSizes.length; i += 1) {
      if (runtimeNodeMask && !runtimeNodeMask[i]) {
        outNodeSizes[i] = 0;
        outNodeColors[(i * 4) + 3] = 0;
        continue;
      }
      var ni = i * 4;
      var nr = Number(baseNodeColors[ni] || 0), ng = Number(baseNodeColors[ni + 1] || 0), nb = Number(baseNodeColors[ni + 2] || 0), na = Number(baseNodeColors[ni + 3] || 1);
      if (focus.nodeMask[i]) {
        if (i === selectedIndex) {
          outNodeColors[ni] = cl(nr * 1.08, 0, 1);
          outNodeColors[ni + 1] = cl(ng * 1.08, 0, 1);
          outNodeColors[ni + 2] = cl(nb * 1.08, 0, 1);
          outNodeSizes[i] = Number(baseNodeSizes[i] || 1) * 1.16;
        }
        outNodeColors[ni + 3] = cl(Math.max(na, 0.96), 0, 1);
      } else {
        var g = luma(nr, ng, nb);
        var dim = (g * 0.58) + 0.07;
        outNodeColors[ni] = cl(dim, 0, 1);
        outNodeColors[ni + 1] = cl(dim, 0, 1);
        outNodeColors[ni + 2] = cl(dim, 0, 1);
        outNodeColors[ni + 3] = cl(na * 0.16, 0.05, 0.24);
        outNodeSizes[i] = Number(baseNodeSizes[i] || 1) * 0.94;
      }
    }

    var edgeCount = Math.floor(outEdgeColors.length / 4);
    for (var e = 0; e < edgeCount; e += 1) {
      if (runtimeEdgeMask && !runtimeEdgeMask[e]) {
        outEdgeColors[(e * 4) + 3] = 0;
        continue;
      }
      var ei = e * 4;
      var er = Number(baseEdgeColors[ei] || 0), eg = Number(baseEdgeColors[ei + 1] || 0), eb = Number(baseEdgeColors[ei + 2] || 0), ea = Number(baseEdgeColors[ei + 3] || 1);
      if (focus.edgeMask[e]) {
        outEdgeColors[ei] = er;
        outEdgeColors[ei + 1] = eg;
        outEdgeColors[ei + 2] = eb;
        outEdgeColors[ei + 3] = cl(Math.max(ea, 0.45), 0, 1);
      } else {
        var egrey = luma(er, eg, eb) * 0.45;
        outEdgeColors[ei] = cl(egrey, 0, 1);
        outEdgeColors[ei + 1] = cl(egrey, 0, 1);
        outEdgeColors[ei + 2] = cl(egrey, 0, 1);
        outEdgeColors[ei + 3] = cl(ea * 0.08, 0.01, 0.08);
      }
    }
    setGraphPanelFocusClass(true);
  } else {
    setGraphPanelFocusClass(false);
  }

  STATE.graph.setPointColors(outNodeColors);
  STATE.graph.setPointSizes(outNodeSizes);
  STATE.graph.setLinkColors(outEdgeColors);
  STATE.pointStyleColors = outNodeColors;
  STATE.pointStyleSizes = outNodeSizes;
}

function applyVisualStyles(renderAlpha) {
  if (!STATE.graph) return;
  applySelectionFocusStyles();
  if (renderAlpha === undefined || renderAlpha === null) STATE.graph.render(); else STATE.graph.render(renderAlpha);
  
  if (typeof ensureFlowParticlesLoop === "function") ensureFlowParticlesLoop();
}

function selectNodeByIndex(index, statusLabel) {
  var idx = Number(index);
  if (!isFinite(idx) || idx < 0 || idx >= STATE.activeNodes.length) return false;
  var node = STATE.activeNodes[idx];
  if (!node) return false;
  STATE.selectedNodeId = node.id;
  STATE.selectedPointIndex = idx;
  STATE.focusedIndex = idx;
  if (STATE.graph && typeof STATE.graph.selectPointByIndex === "function") { STATE.graph.selectPointByIndex(idx); }
  applyVisualStyles();
  updateStatus(statusLabel || ("Selected: " + node.label));
  return true;
}

function focusNodeById(nodeId, fromSearch) {
  if (!STATE.graph) return;
  var idx = STATE.activeIndexById.get(String(nodeId));
  if (idx === undefined) { updateStatus("Search miss: node hidden by filters"); return; }
  if (STATE.runtimeNodeVisibleMask && idx >= 0 && idx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[idx]) {
    updateStatus("Search miss: node hidden by filters");
    return;
  }
  STATE.graph.zoomToPointByIndex(idx, 0, 3.5, true);
  selectNodeByIndex(idx, fromSearch ? ("Selected: " + (STATE.activeNodes[idx] ? STATE.activeNodes[idx].label : nodeId)) : null);
  hideSuggest();
}

function applyPhysicsToGraph() {
  if (!STATE.graph) return;
  var engineCfg = collectEngineRuntimeSettings(STATE.engine || {});
  var solverCfg = collectSolverSettings(STATE.solver || {});
  var rendererCfg = collectRendererSettings(STATE.renderer || {});
  STATE.engine = engineCfg;
  STATE.solver = solverCfg;
  STATE.renderer = rendererCfg;
  STATE.graph.setConfig({ engine: engineCfg, solver: solverCfg, renderer: rendererCfg });
}

function ensureGraphInstance() {
  if (!SigmaApi) { if (DOM.graphEmpty) DOM.graphEmpty.textContent = "Sigma failed to load."; throw new Error("Sigma API not found"); }
  if (!GraphologyApi) { if (DOM.graphEmpty) DOM.graphEmpty.textContent = "Graphology failed to load."; throw new Error("Graphology API not found"); }
  if (typeof createGraphEngineSigma !== "function") { if (DOM.graphEmpty) DOM.graphEmpty.textContent = "Graph engine failed to load."; throw new Error("Graph engine API not found"); }
  if (STATE.graph) return;
  STATE.graph = createGraphEngineSigma(DOM.graph, {
    onPointClick: function (index) { selectNodeByIndex(index); },
    onPointMouseOver: function (index, _pointPos, evt) {
      var node = STATE.activeNodes[index];
      if (!node) return;
      if (evt && isFinite(evt.clientX) && isFinite(evt.clientY)) {
        STATE.pointerClientX = Number(evt.clientX);
        STATE.pointerClientY = Number(evt.clientY);
      }
      STATE.hoveredPointIndex = index;
      if (typeof setHoverDebug === "function") {
        setHoverDebug("enter-node", {
          idx: index,
          nodeId: node.id,
          noteType: node.note_type || node.kind || "",
          pointerX: STATE.pointerClientX,
          pointerY: STATE.pointerClientY
        });
      }
      showTooltip(node, evt);
    },
    onPointMouseOut: function () {
      // Do not clear immediately here. Sigma's leaveNode can fire transiently on tiny nodes
      // while moving/zooming. The hover monitor performs the actual hit-test-based clear.
      if (typeof setHoverDebug === "function") {
        setHoverDebug("leave-node-event", {
          idx: STATE.hoveredPointIndex
        });
      }
    },
    onLinkMouseOver: function (linkIndex) { STATE.hoveredLinkIndex = linkIndex; },
    onLinkMouseOut: function () { STATE.hoveredLinkIndex = null; },
    onBackgroundClick: function () {
      STATE.selectedNodeId = null;
      STATE.selectedPointIndex = null;
      STATE.hoveredPointIndex = null;
      STATE.hoveredLinkIndex = null;
      STATE.focusedIndex = undefined;
      if (STATE.graph && typeof STATE.graph.unselectPoints === "function") { STATE.graph.unselectPoints(); }
      hideTooltip();
      applyVisualStyles();
      updateStatus();
    },
    onZoom: function () {
      if (DOM.statusZoom && STATE.graph && typeof STATE.graph.getZoomLevel === "function") DOM.statusZoom.textContent = "Zoom: " + Number(STATE.graph.getZoomLevel() || 1).toFixed(2) + "x";
      
    }
  });
  applyPhysicsToGraph();
}

function applyGraphData(fitView) {
  ensureGraphInstance();
  applyPhysicsToGraph();
  var source = {
    nodes: Array.isArray(STATE.raw.nodes) ? STATE.raw.nodes : [],
    edges: Array.isArray(STATE.raw.edges) ? STATE.raw.edges : []
  };
  var arrays = buildGraphArrays(source);
  STATE.activeNodes = arrays.nodes;
  STATE.activeEdges = arrays.edges;
  STATE.activeIndexById = arrays.indexById;
  STATE.activeIdsByIndex = arrays.idsByIndex;
  if (STATE.graph && typeof STATE.graph.setNodeLayoutAttributes === "function") {
    STATE.graph.setNodeLayoutAttributes(STATE.activeNodes);
  }
  if (!STATE.activeNodes.length) {
    if (DOM.graphEmpty) {
      DOM.graphEmpty.style.display = "block";
      DOM.graphEmpty.textContent = "No nodes available.";
    }
    STATE.runtimeNodeVisibleMask = new Uint8Array(0);
    STATE.runtimeEdgeVisibleMask = new Uint8Array(0);
    buildSearchEntries();
    updateStatus();
    return;
  }

  STATE.basePointColors = arrays.pointColors ? new Float32Array(arrays.pointColors) : new Float32Array(0);
  STATE.basePointSizes = arrays.pointSizes ? new Float32Array(arrays.pointSizes) : new Float32Array(0);
  STATE.baseLinkColors = arrays.linkColors ? new Float32Array(arrays.linkColors) : new Float32Array(0);
  STATE.pointStyleColors = STATE.basePointColors;
  STATE.pointStyleSizes = STATE.basePointSizes;

  STATE.graph.setPointPositions(arrays.pointPositions);
  STATE.graph.setLinks(arrays.links);
  STATE.graph.setLinkStrength(arrays.linkStrength);
  STATE.graph.setLinkDistance(arrays.linkDistance);
  STATE.graph.setLinkStyleCodes(arrays.linkStyleCodes);
  STATE.graph.setPointColors(STATE.basePointColors);
  STATE.graph.setPointSizes(STATE.basePointSizes);
  if (typeof STATE.graph.setPointTypeCodes === "function") STATE.graph.setPointTypeCodes(arrays.pointTypeCodes);
  STATE.graph.setLinkColors(STATE.baseLinkColors);
  STATE.graph.setLinkWidths(arrays.linkWidths);

  var shouldFit = !!fitView;
  if (!shouldFit) shouldFit = false;
  STATE.lastEdgeCount = STATE.activeEdges.length;
  STATE.lastNodeCount = STATE.activeNodes.length;

  applyRuntimeUiSettings(false);
  if (STATE.graph && typeof STATE.graph.resize === "function") {
    STATE.graph.resize();
  }
  if (shouldFit && STATE.graph && typeof STATE.graph.fitView === "function") {
    STATE.graph.fitView(0, 0.1);
  }
  if (STATE.solver && STATE.solver.layout_enabled && typeof STATE.graph.start === "function") STATE.graph.start();
  if (typeof ensureFlowParticlesLoop === "function") ensureFlowParticlesLoop();
}

window.applyGraphData = applyGraphData;
window.applyVisualStyles = applyVisualStyles;
window.applyPhysicsToGraph = applyPhysicsToGraph;

