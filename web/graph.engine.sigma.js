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
  d3_alpha: 1,
  d3_alpha_min: 0.001,
  d3_alpha_decay: 0.03,
  d3_alpha_target: 0,
  d3_velocity_decay: 0.35,
  d3_center_x: 0,
  d3_center_y: 0,
  d3_center_strength: 0.02,
  d3_manybody_strength: -90,
  d3_manybody_theta: 0.9,
  d3_manybody_distance_min: 1,
  d3_manybody_distance_max: 0,
  d3_link_distance: 30,
  d3_link_strength: 0.08,
  d3_link_iterations: 1,
  d3_warmup_ticks: 0,
  d3_cooldown_ticks: 0,
  d3_cooldown_time_ms: 0
};

var DEF_RENDERER = {
  sigma_draw_labels: true,
  sigma_draw_hover_nodes: false,
  sigma_note_node_aa: true,
  sigma_label_threshold: 8,
  sigma_label_zoom_min: 1,
  sigma_hide_edges_on_move: false,
  sigma_batch_edges_drawing: true,
  sigma_mouse_wheel_enabled: true,
  sigma_double_click_enabled: false,
  sigma_min_camera_ratio: 0.01,
  sigma_max_camera_ratio: 6,
  sigma_side_margin: 0,
  sigma_animations_time: 180,
  sigma_enable_edge_hovering: false
};

var DEF_ENGINE = {};

var SPEC_SOLVER = [
  { key: "layout_enabled", label: "Layout Enabled", type: "bool", affectsEngine: true, hint: "Start or stop the D3 force simulation." },
  { key: "d3_alpha", label: "Alpha", type: "number", min: 0, max: 2, step: 0.001, affectsEngine: true, hint: "Initial simulation energy when (re)starting." },
  { key: "d3_alpha_min", label: "Alpha Min", type: "number", min: 0, max: 0.5, step: 0.0001, affectsEngine: true, hint: "Simulation stops when alpha falls below this threshold." },
  { key: "d3_alpha_decay", label: "Alpha Decay", type: "number", min: 0, max: 1, step: 0.0001, affectsEngine: true, hint: "How fast simulation energy cools down each tick." },
  { key: "d3_alpha_target", label: "Alpha Target", type: "number", min: 0, max: 1, step: 0.0001, affectsEngine: true, hint: "Target alpha while running (0 means cool to rest)." },
  { key: "d3_velocity_decay", label: "Velocity Decay", type: "number", min: 0, max: 1, step: 0.001, affectsEngine: true, hint: "Friction factor applied to node velocity per tick." },
  { key: "d3_center_x", label: "Center X", type: "number", min: -20000, max: 20000, step: 1, affectsEngine: true, hint: "X coordinate used by the center x-force." },
  { key: "d3_center_y", label: "Center Y", type: "number", min: -20000, max: 20000, step: 1, affectsEngine: true, hint: "Y coordinate used by the center y-force." },
  { key: "d3_center_strength", label: "Center Strength", type: "number", min: 0, max: 1, step: 0.001, affectsEngine: true, hint: "Strength of x/y forces pulling nodes toward center." },
  { key: "d3_manybody_strength", label: "ManyBody Strength", type: "number", min: -5000, max: 5000, step: 1, affectsEngine: true, hint: "Repulsion (<0) or attraction (>0) between all nodes." },
  { key: "d3_manybody_theta", label: "ManyBody Theta", type: "number", min: 0.1, max: 2, step: 0.01, affectsEngine: true, hint: "Barnes-Hut approximation precision/speed tradeoff." },
  { key: "d3_manybody_distance_min", label: "ManyBody Distance Min", type: "number", min: 0, max: 10000, step: 1, affectsEngine: true, hint: "Minimum many-body interaction distance." },
  { key: "d3_manybody_distance_max", label: "ManyBody Distance Max", type: "number", min: 0, max: 10000, step: 1, affectsEngine: true, hint: "Maximum many-body interaction distance (0 = no limit)." },
  { key: "d3_link_distance", label: "Link Distance", type: "number", min: 1, max: 5000, step: 1, affectsEngine: true, hint: "Base link rest length before per-edge runtime scaling." },
  { key: "d3_link_strength", label: "Link Strength", type: "number", min: 0, max: 2, step: 0.001, affectsEngine: true, hint: "Base spring strength before per-edge runtime scaling." },
  { key: "d3_link_iterations", label: "Link Iterations", type: "number", min: 1, max: 16, step: 1, affectsEngine: true, hint: "Constraint iterations of the link force per simulation tick." },
  { key: "d3_warmup_ticks", label: "Warmup Ticks", type: "number", min: 0, max: 5000, step: 1, affectsEngine: true, hint: "Manual pre-run ticks before realtime rendering starts." },
  { key: "d3_cooldown_ticks", label: "Cooldown Ticks", type: "number", min: 0, max: 50000, step: 1, affectsEngine: true, hint: "Auto-stop simulation after this many realtime ticks (0 disables)." },
  { key: "d3_cooldown_time_ms", label: "Cooldown Time (ms)", type: "number", min: 0, max: 600000, step: 10, affectsEngine: true, hint: "Auto-stop simulation after this runtime duration in ms (0 disables)." }
];

var SPEC_RENDERER = [
  { key: "sigma_draw_labels", label: "Draw Labels", type: "bool", affectsEngine: true },
  { key: "sigma_draw_hover_nodes", label: "Draw Hover Labels", type: "bool", affectsEngine: true },
  { key: "sigma_note_node_aa", label: "Node AA", type: "bool", affectsEngine: true },
  { key: "sigma_label_threshold", label: "Label Threshold", type: "number", min: 0, max: 64, step: 1, affectsEngine: true },
  { key: "sigma_label_zoom_min", label: "Label Zoom Min", type: "number", min: 0, max: 64, step: 0.01, affectsEngine: true },
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

function adapterCallCity(name) {
  var adapter = window && window.GraphAdapter;
  if (!adapter || typeof adapter.callCity !== "function") return undefined;
  return adapter.callCity.apply(adapter, arguments);
}

function cityEnsureFlowParticlesLoop() {
  return adapterCallCity("ensureFlowParticlesLoop");
}

function cityUpdateStatus(extraText) {
  return adapterCallCity("updateStatus", extraText);
}

function cityHideSuggest() {
  return adapterCallCity("hideSuggest");
}

function cityMoveTooltip(x, y) {
  return adapterCallCity("moveTooltip", x, y);
}

function citySetHoverDebug(reason, details) {
  return adapterCallCity("setHoverDebug", reason, details);
}

function cityShowTooltip(node, eventPos) {
  return adapterCallCity("showTooltip", node, eventPos);
}

function cityClearHoverNodeState(reason) {
  return adapterCallCity("clearHoverNodeState", reason);
}

function cityHideTooltip() {
  return adapterCallCity("hideTooltip");
}

function cityHideContextMenu() {
  return adapterCallCity("hideContextMenu");
}

function cityBuildSearchEntries() {
  return adapterCallCity("buildSearchEntries");
}

function cityCollectEngineRuntimeSettings(input) {
  var res = adapterCallCity("collectEngineRuntimeSettings", input);
  if (res !== undefined) return res;
  return (input && typeof input === "object") ? input : {};
}

function cityCollectSolverSettings(input) {
  var res = adapterCallCity("collectSolverSettings", input);
  if (res !== undefined) return res;
  return (input && typeof input === "object") ? input : {};
}

function cityCollectRendererSettings(input) {
  var res = adapterCallCity("collectRendererSettings", input);
  if (res !== undefined) return res;
  return (input && typeof input === "object") ? input : {};
}

function cityBuildGraphArrays(source) {
  var res = adapterCallCity("buildGraphArrays", source);
  if (res !== undefined) return res;
  return { nodes: [], edges: [], indexById: new Map(), idsByIndex: [] };
}

function cityApplyRuntimeUiSettings(reheatLayout) {
  var res = adapterCallCity("applyRuntimeUiSettings", reheatLayout);
  if (res !== undefined) return !!res;
  return false;
}

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

function rgbaParts(r, g, b, a) {
  return "rgba(" + Math.round(cl(Number(r || 0), 0, 1) * 255)
    + "," + Math.round(cl(Number(g || 0), 0, 1) * 255)
    + "," + Math.round(cl(Number(b || 0), 0, 1) * 255)
    + "," + cl(Number(a === undefined ? 1 : a), 0, 1).toFixed(3) + ")";
}

function nid(payload) { if (!payload) return null; return payload.node === undefined || payload.node === null ? null : String(payload.node); }
function eid(payload) { if (!payload) return null; return payload.edge === undefined || payload.edge === null ? null : String(payload.edge); }

function hev(payload) {
  var e = payload && payload.event ? payload.event : null;
  var o = e && e.original ? e.original : null;
  if (o && typeof o.clientX === "number" && typeof o.clientY === "number") {
    return { clientX: Number(o.clientX), clientY: Number(o.clientY) };
  }
  // Avoid sigma-local coordinates here (e.x/e.y): tooltip hit-tests run in client space.
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
    d3_alpha: num(m.d3_alpha, DEF_SOLVER.d3_alpha, 0, 2),
    d3_alpha_min: num(m.d3_alpha_min, DEF_SOLVER.d3_alpha_min, 0, 0.5),
    d3_alpha_decay: num(m.d3_alpha_decay, DEF_SOLVER.d3_alpha_decay, 0, 1),
    d3_alpha_target: num(m.d3_alpha_target, DEF_SOLVER.d3_alpha_target, 0, 1),
    d3_velocity_decay: num(m.d3_velocity_decay, DEF_SOLVER.d3_velocity_decay, 0, 1),
    d3_center_x: num(m.d3_center_x, DEF_SOLVER.d3_center_x, -20000, 20000),
    d3_center_y: num(m.d3_center_y, DEF_SOLVER.d3_center_y, -20000, 20000),
    d3_center_strength: num(m.d3_center_strength, DEF_SOLVER.d3_center_strength, 0, 1),
    d3_manybody_strength: num(m.d3_manybody_strength, DEF_SOLVER.d3_manybody_strength, -5000, 5000),
    d3_manybody_theta: num(m.d3_manybody_theta, DEF_SOLVER.d3_manybody_theta, 0.1, 2),
    d3_manybody_distance_min: num(m.d3_manybody_distance_min, DEF_SOLVER.d3_manybody_distance_min, 0, 10000),
    d3_manybody_distance_max: num(m.d3_manybody_distance_max, DEF_SOLVER.d3_manybody_distance_max, 0, 10000),
    d3_link_distance: num(m.d3_link_distance, DEF_SOLVER.d3_link_distance, 1, 5000),
    d3_link_strength: num(m.d3_link_strength, DEF_SOLVER.d3_link_strength, 0, 2),
    d3_link_iterations: it(m.d3_link_iterations, DEF_SOLVER.d3_link_iterations, 1, 16),
    d3_warmup_ticks: it(m.d3_warmup_ticks, DEF_SOLVER.d3_warmup_ticks, 0, 5000),
    d3_cooldown_ticks: it(m.d3_cooldown_ticks, DEF_SOLVER.d3_cooldown_ticks, 0, 50000),
    d3_cooldown_time_ms: it(m.d3_cooldown_time_ms, DEF_SOLVER.d3_cooldown_time_ms, 0, 600000)
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
    sigma_note_node_aa: bol(m.sigma_note_node_aa, DEF_RENDERER.sigma_note_node_aa),
    sigma_label_threshold: num(m.sigma_label_threshold, DEF_RENDERER.sigma_label_threshold, 0, 64),
    sigma_label_zoom_min: num(m.sigma_label_zoom_min, DEF_RENDERER.sigma_label_zoom_min, 0, 64),
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
  this.solver = new AjpcGraphSolverD3(this);

  this.renderer.init();
  this.instance = this.renderer.instance;
}

function bool01(v) { return v ? 1 : 0; }

function ensureStyleDebugState() {
  if (!STATE || typeof STATE !== "object") return null;
  var cur = STATE.styleDebug;
  if (!cur || typeof cur !== "object") {
    cur = {
      lastMode: "--",
      fullCount: 0,
      hoverPatchCount: 0,
      focusPatchCount: 0,
      ts: 0
    };
    STATE.styleDebug = cur;
  }
  return cur;
}

function markStyleDebugMode(mode) {
  var s = ensureStyleDebugState();
  if (!s) return;
  var m = String(mode || "");
  if (m === "full") s.fullCount = Number(s.fullCount || 0) + 1;
  else if (m === "hover-patch") s.hoverPatchCount = Number(s.hoverPatchCount || 0) + 1;
  else if (m === "focus-patch") s.focusPatchCount = Number(s.focusPatchCount || 0) + 1;
  s.lastMode = m || "--";
  s.ts = Date.now();
}

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

function cardStatusBitMasks(node) {
  var cards = node && Array.isArray(node.cards) ? node.cards : [];
  var maxSlots = 12;
  var limit = Math.min(cards.length, maxSlots);
  var normalMask = 0;
  var suspendedMask = 0;
  var buriedMask = 0;

  for (var i = 0; i < limit; i += 1) {
    var status = String(cards[i] && cards[i].status || "").toLowerCase();
    var bit = (1 << i);
    if (status === "suspended") suspendedMask += bit;
    else if (status === "buried") buriedMask += bit;
    else normalMask += bit;
  }

  return {
    card_count: cards.length,
    cards_mask_normal: normalMask,
    cards_mask_suspended: suspendedMask,
    cards_mask_buried: buriedMask
  };
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
  var cardMasks = cardStatusBitMasks(n);

  return {
    label: String(n.label || n.id || ""),
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
    grp_family_prio_count: prioKeys.length,
    card_count: Number(cardMasks.card_count || 0),
    cards_mask_normal: Number(cardMasks.cards_mask_normal || 0),
    cards_mask_suspended: Number(cardMasks.cards_mask_suspended || 0),
    cards_mask_buried: Number(cardMasks.cards_mask_buried || 0)
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

SigmaGraphCompat.prototype.setPointIds = function (ids) {
  var list = Array.isArray(ids) ? ids : [];
  var n = list.length;
  this.idByIndex = new Array(n);
  this.indexById = new Map();
  for (var i = 0; i < n; i += 1) {
    var raw = list[i];
    var id = String((raw !== undefined && raw !== null && raw !== "") ? raw : ("n:" + i));
    this.idByIndex[i] = id;
    this.indexById.set(id, i);
  }
  if (this.selectedIndices.length) {
    this.selectedIndices = this.selectedIndices.filter(function (x) { return x >= 0 && x < n; });
  }
  this.dataDirty = true;
};

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
SigmaGraphCompat.prototype.patchPointStylesBatch = function (patches, syncArrays) {
  var list = Array.isArray(patches) ? patches : [];
  if (!this.graph || !list.length) return false;
  var sync = !!syncArrays;

  var changed = false;
  for (var i = 0; i < list.length; i += 1) {
    var patch = list[i];
    if (!patch || typeof patch !== "object") continue;

    var idx = Number(patch.index);
    if (!isFinite(idx) || idx < 0 || idx >= this.idByIndex.length) continue;
    idx = Math.floor(idx);

    var nodeId = this.idByIndex[idx];
    if (!nodeId || !this.graph.hasNode(nodeId)) continue;

    var ni = idx * 4;
    var color = patch.color;
    var r = (this.pointColors && this.pointColors.length >= (ni + 1)) ? Number(this.pointColors[ni] || 0) : 0;
    var g = (this.pointColors && this.pointColors.length >= (ni + 2)) ? Number(this.pointColors[ni + 1] || 0) : 0;
    var b = (this.pointColors && this.pointColors.length >= (ni + 3)) ? Number(this.pointColors[ni + 2] || 0) : 0;
    var a = (this.pointColors && this.pointColors.length >= (ni + 4)) ? Number(this.pointColors[ni + 3] || 1) : 1;
    if (Array.isArray(color) && color.length >= 4) {
      r = Number(color[0]);
      g = Number(color[1]);
      b = Number(color[2]);
      a = Number(color[3]);
    }
    r = cl(r, 0, 1);
    g = cl(g, 0, 1);
    b = cl(b, 0, 1);
    a = cl(a, 0, 1);
    if (sync && this.pointColors && this.pointColors.length >= (ni + 4)) {
      this.pointColors[ni] = r;
      this.pointColors[ni + 1] = g;
      this.pointColors[ni + 2] = b;
      this.pointColors[ni + 3] = a;
    }

    var size = Number(patch.size);
    if (!fin(size) && this.pointSizes && this.pointSizes.length > idx) size = Number(this.pointSizes[idx] || 0);
    if (!fin(size)) size = DNS;
    if (sync && this.pointSizes && this.pointSizes.length > idx) this.pointSizes[idx] = size;
    var hidden = !fin(size) || size <= 0 || !fin(a) || a <= 0.001;
    var drawSize = size;
    if (!fin(drawSize) || drawSize <= 0) drawSize = DNS;

    this.graph.mergeNodeAttributes(nodeId, {
      size: drawSize,
      color: rgbaParts(r, g, b, a),
      hidden: hidden
    });
    changed = true;
  }

  if (changed && this.renderer) this.renderer.requestFrame();
  return changed;
};

SigmaGraphCompat.prototype.patchLinkStylesBatch = function (patches, syncArrays) {
  var list = Array.isArray(patches) ? patches : [];
  if (!this.graph || !list.length) return false;
  var sync = !!syncArrays;

  var changed = false;
  for (var i = 0; i < list.length; i += 1) {
    var patch = list[i];
    if (!patch || typeof patch !== "object") continue;

    var idx = Number(patch.index);
    if (!isFinite(idx) || idx < 0 || idx >= this.edgeIdByIndex.length) continue;
    idx = Math.floor(idx);

    var edgeId = this.edgeIdByIndex[idx];
    if (!edgeId || !this.graph.hasEdge(edgeId)) continue;

    var ei = idx * 4;
    var color = patch.color;
    var r = (this.linkColors && this.linkColors.length >= (ei + 1)) ? Number(this.linkColors[ei] || 0) : 0;
    var g = (this.linkColors && this.linkColors.length >= (ei + 2)) ? Number(this.linkColors[ei + 1] || 0) : 0;
    var b = (this.linkColors && this.linkColors.length >= (ei + 3)) ? Number(this.linkColors[ei + 2] || 0) : 0;
    var a = (this.linkColors && this.linkColors.length >= (ei + 4)) ? Number(this.linkColors[ei + 3] || 1) : 1;
    if (Array.isArray(color) && color.length >= 4) {
      r = Number(color[0]);
      g = Number(color[1]);
      b = Number(color[2]);
      a = Number(color[3]);
    }
    r = cl(r, 0, 1);
    g = cl(g, 0, 1);
    b = cl(b, 0, 1);
    a = cl(a, 0, 1);

    if (sync && this.linkColors && this.linkColors.length >= (ei + 4)) {
      this.linkColors[ei] = r;
      this.linkColors[ei + 1] = g;
      this.linkColors[ei + 2] = b;
      this.linkColors[ei + 3] = a;
    }

    var hidden = !!patch.hidden;
    this.graph.mergeEdgeAttributes(edgeId, {
      color: rgbaParts(r, g, b, a),
      hidden: hidden
    });
    changed = true;
  }

  if (changed && this.renderer) this.renderer.requestFrame();
  return changed;
};

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

  lg("debug", "config layout=" + String(this.runtimeSolver.layout_enabled) + " charge=" + String(this.runtimeSolver.d3_manybody_strength) + " linkDist=" + String(this.runtimeSolver.d3_link_distance));
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
  // Global panel darkening also dims selected nodes. Keep focus visuals node/edge-local only.
  DOM.graphPanel.classList.remove("focus-mode");
}

function luma(r, g, b) { return (0.2126 * r) + (0.7152 * g) + (0.0722 * b); }

function stopPointSizeAnimation() {
  if (STATE.pointSizeAnimRaf) {
    window.cancelAnimationFrame(STATE.pointSizeAnimRaf);
    STATE.pointSizeAnimRaf = null;
  }
  STATE.pointSizeAnimTarget = null;
}

function sizesEqualWithin(a, b, eps) {
  if (!a || !b || a.length !== b.length) return false;
  var e = Number(eps || 0);
  for (var i = 0; i < a.length; i += 1) {
    if (Math.abs(Number(a[i] || 0) - Number(b[i] || 0)) > e) return false;
  }
  return true;
}

function applyPointSizesAnimated(targetSizes, durationMs) {
  if (!STATE.graph || typeof STATE.graph.setPointSizes !== "function") return;
  var target = (targetSizes && targetSizes.length) ? new Float32Array(targetSizes) : new Float32Array(0);

  if (!target.length) {
    stopPointSizeAnimation();
    STATE.pointStyleSizes = target;
    STATE.graph.setPointSizes(target);
    return;
  }

  var current = (STATE.pointStyleSizes && STATE.pointStyleSizes.length === target.length)
    ? STATE.pointStyleSizes
    : new Float32Array(target);

  if (sizesEqualWithin(current, target, 0.0005)) {
    stopPointSizeAnimation();
    STATE.pointStyleSizes = target;
    STATE.graph.setPointSizes(target);
    return;
  }

  if (STATE.pointSizeAnimRaf && STATE.pointSizeAnimTarget && sizesEqualWithin(STATE.pointSizeAnimTarget, target, 0.0005)) {
    return;
  }

  stopPointSizeAnimation();
  var from = new Float32Array(current);
  var to = new Float32Array(target);
  var work = new Float32Array(from.length);
  var dur = Math.max(60, Number(durationMs || 170));
  var start = (window.performance && typeof window.performance.now === "function") ? window.performance.now() : Date.now();

  STATE.pointSizeAnimTarget = to;

  function easeInOut(t) {
    var x = t < 0 ? 0 : (t > 1 ? 1 : t);
    return x < 0.5 ? (2 * x * x) : (1 - (Math.pow(-2 * x + 2, 2) / 2));
  }

  function tick(ts) {
    if (!STATE.graph || typeof STATE.graph.setPointSizes !== "function") {
      stopPointSizeAnimation();
      return;
    }
    var now = Number(ts || 0);
    if (!isFinite(now) || now <= 0) now = (window.performance && typeof window.performance.now === "function") ? window.performance.now() : Date.now();
    var p = (now - start) / dur;
    if (!isFinite(p)) p = 1;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    var k = easeInOut(p);

    for (var i = 0; i < work.length; i += 1) {
      work[i] = Number(from[i] || 0) + ((Number(to[i] || 0) - Number(from[i] || 0)) * k);
    }

    STATE.pointStyleSizes = work;
    STATE.graph.setPointSizes(work);
    if (typeof STATE.graph.render === "function") STATE.graph.render(0.08);

    if (p < 1) {
      STATE.pointSizeAnimRaf = window.requestAnimationFrame(tick);
      return;
    }

    STATE.pointStyleSizes = to;
    STATE.graph.setPointSizes(to);
    STATE.pointSizeAnimRaf = null;
    STATE.pointSizeAnimTarget = null;
  }

  STATE.pointSizeAnimRaf = window.requestAnimationFrame(tick);
}

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

function contextIndexFromState() {
  var rawIdx = STATE.contextPointIndex;
  if (rawIdx !== null && rawIdx !== undefined && rawIdx !== "") {
    var idx = Number(rawIdx);
    if (isFinite(idx) && idx >= 0 && idx < STATE.activeNodes.length) return idx;
  }
  if (STATE.activeIndexById && STATE.contextNodeId !== null && STATE.contextNodeId !== undefined) {
    var mapped = STATE.activeIndexById.get(String(STATE.contextNodeId));
    if (mapped !== undefined) {
      STATE.contextPointIndex = Number(mapped);
      return Number(mapped);
    }
  }
  return -1;
}

function hoveredIndexFromState() {
  var rawIdx = STATE.hoveredPointIndex;
  if (rawIdx === null || rawIdx === undefined || rawIdx === "") return -1;
  var idx = Number(rawIdx);
  if (!isFinite(idx) || idx < 0 || idx >= STATE.activeNodes.length) return -1;
  if (STATE.runtimeNodeVisibleMask && idx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[idx]) return -1;
  return idx;
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

function ensureFocusAdjCache() {
  var nodes = Array.isArray(STATE.activeNodes) ? STATE.activeNodes : [];
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var byId = STATE.activeIndexById instanceof Map ? STATE.activeIndexById : new Map();
  var cached = STATE.focusAdjCache;
  if (
    cached &&
    cached.nodesRef === nodes &&
    cached.edgesRef === edges &&
    cached.byIdRef === byId &&
    cached.nodeCount === nodes.length &&
    cached.edgeCount === edges.length
  ) {
    return cached;
  }

  var touchEdgesByNode = new Array(nodes.length);
  var familyOutEdgesByNode = new Array(nodes.length);
  var edgeSourceIndex = new Int32Array(edges.length);
  var edgeTargetIndex = new Int32Array(edges.length);
  var familyFidByEdge = new Array(edges.length);
  var i;

  for (i = 0; i < nodes.length; i += 1) {
    touchEdgesByNode[i] = [];
    familyOutEdgesByNode[i] = [];
  }
  edgeSourceIndex.fill(-1);
  edgeTargetIndex.fill(-1);

  for (i = 0; i < edges.length; i += 1) {
    var edge = edges[i];
    if (!edge) continue;
    var s = byId.get(String(edge.source || ""));
    var t = byId.get(String(edge.target || ""));
    if (s === undefined || t === undefined) continue;
    s = Number(s);
    t = Number(t);
    if (!isFinite(s) || !isFinite(t) || s < 0 || t < 0 || s >= nodes.length || t >= nodes.length) continue;

    edgeSourceIndex[i] = s;
    edgeTargetIndex[i] = t;
    touchEdgesByNode[s].push(i);
    touchEdgesByNode[t].push(i);

    if (isFamilyEdgeLayer(String(edge.layer || ""))) {
      var meta = edgeMeta(edge);
      var fid = String(meta && meta.fid !== undefined && meta.fid !== null ? meta.fid : "");
      familyFidByEdge[i] = fid;
      familyOutEdgesByNode[s].push(i);
      if (meta && meta.bidirectional) familyOutEdgesByNode[t].push(i);
    }
  }

  cached = {
    nodesRef: nodes,
    edgesRef: edges,
    byIdRef: byId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    touchEdgesByNode: touchEdgesByNode,
    familyOutEdgesByNode: familyOutEdgesByNode,
    edgeSourceIndex: edgeSourceIndex,
    edgeTargetIndex: edgeTargetIndex,
    familyFidByEdge: familyFidByEdge
  };
  STATE.focusAdjCache = cached;
  return cached;
}

function buildSelectionFocusMasks(selectedIndices) {
  var nodes = Array.isArray(STATE.activeNodes) ? STATE.activeNodes : [];
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  var cache = ensureFocusAdjCache();
  var touchEdgesByNode = cache.touchEdgesByNode || [];
  var familyOutEdgesByNode = cache.familyOutEdgesByNode || [];
  var edgeSourceIndex = cache.edgeSourceIndex || [];
  var edgeTargetIndex = cache.edgeTargetIndex || [];
  var familyFidByEdge = cache.familyFidByEdge || [];
  var nodeMask = new Uint8Array(nodes.length);
  var edgeMask = new Uint8Array(edges.length);
  var focusedNodeIndices = [];
  var focusedEdgeIndices = [];
  var focusedNodeCount = 0, focusedEdgeCount = 0;
  var seeds = Array.isArray(selectedIndices) ? selectedIndices.slice() : [selectedIndices];
  var uniqueSeeds = [];
  var seenSeed = Object.create(null);
  for (var si = 0; si < seeds.length; si += 1) {
    var seed = Number(seeds[si]);
    if (!isFinite(seed) || seed < 0 || seed >= nodes.length) continue;
    var key = String(seed);
    if (seenSeed[key]) continue;
    seenSeed[key] = true;
    uniqueSeeds.push(seed);
  }
  if (!uniqueSeeds.length) return { nodeMask: nodeMask, edgeMask: edgeMask, hasFocus: false, focusedNodeIndices: focusedNodeIndices, focusedEdgeIndices: focusedEdgeIndices };

  function markNode(i) {
    if (i < 0 || i >= nodes.length) return;
    if (nodeMask[i]) return;
    nodeMask[i] = 1;
    focusedNodeIndices.push(i);
    focusedNodeCount += 1;
  }
  function markEdge(i) {
    if (i < 0 || i >= edges.length) return;
    if (edgeMask[i]) return;
    edgeMask[i] = 1;
    focusedEdgeIndices.push(i);
    focusedEdgeCount += 1;
  }
  function edgeFamilyMatches(edgeIndex, selectedPrioKeys) {
    if (edgeIndex < 0 || edgeIndex >= edges.length) return false;
    var edge = edges[edgeIndex];
    if (!edge || !isFamilyEdgeLayer(String(edge.layer || ""))) return false;
    if (!selectedPrioKeys.size) return true;
    var fid = String(familyFidByEdge[edgeIndex] || "");
    if (!fid) return true;
    return selectedPrioKeys.has(fid);
  }

  function expandFromSeed(selectedIndex) {
    var selectedNode = nodes[selectedIndex];
    if (!selectedNode) return;
    var selectedPrioKeys = new Set(collectFamilyPrioKeys(selectedNode));

    markNode(selectedIndex);

    // 1) Always keep direct neighbors of seed node.
    var around = touchEdgesByNode[selectedIndex] || [];
    for (var ai = 0; ai < around.length; ai += 1) {
      var eIdx = Number(around[ai]);
      if (!isFinite(eIdx) || eIdx < 0 || eIdx >= edges.length) continue;
      var s = Number(edgeSourceIndex[eIdx]);
      var t = Number(edgeTargetIndex[eIdx]);
      if (!isFinite(s) || !isFinite(t) || s < 0 || t < 0) continue;
      markEdge(eIdx);
      markNode(s);
      markNode(t);
    }

    // 2) Expand seed node's own family chain towards dependencies/hub.
    var queue = [selectedIndex];
    var qHead = 0;
    var seen = new Set([selectedIndex]);
    while (qHead < queue.length) {
      var cur = Number(queue[qHead]);
      qHead += 1;
      if (!isFinite(cur) || cur < 0 || cur >= nodes.length) continue;
      var outgoing = familyOutEdgesByNode[cur] || [];
      for (var oi = 0; oi < outgoing.length; oi += 1) {
        var e2 = Number(outgoing[oi]);
        if (!isFinite(e2) || e2 < 0 || e2 >= edges.length) continue;
        if (!edgeFamilyMatches(e2, selectedPrioKeys)) continue;
        var s2 = Number(edgeSourceIndex[e2]);
        var t2 = Number(edgeTargetIndex[e2]);
        if (!isFinite(s2) || !isFinite(t2) || s2 < 0 || t2 < 0) continue;

        var next = -1;
        if (s2 === cur) next = t2;
        else if (t2 === cur) next = s2;
        else continue;

        markEdge(e2);
        markNode(s2);
        markNode(t2);

        if (next >= 0 && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  uniqueSeeds.forEach(expandFromSeed);

  return {
    nodeMask: nodeMask,
    edgeMask: edgeMask,
    hasFocus: focusedNodeCount > 0,
    focusedNodeIndices: focusedNodeIndices,
    focusedEdgeIndices: focusedEdgeIndices
  };
}

function createNodeStyleContext(baseNodeColors, baseNodeSizes, runtimeNodeMask, focusNodeMask, focusHas, selectedIndex, contextIndex, hoverIndex) {
  return {
    baseNodeColors: baseNodeColors,
    baseNodeSizes: baseNodeSizes,
    runtimeNodeMask: runtimeNodeMask,
    focusNodeMask: focusNodeMask,
    focusHas: !!focusHas,
    selectedIndex: Number(selectedIndex),
    contextIndex: Number(contextIndex),
    hoverIndex: Number(hoverIndex)
  };
}

// Shared node style solver for hover + selected + context focus paths.
function computeNodeStyleForIndex(idx, ctx) {
  var i = Number(idx);
  if (!isFinite(i) || i < 0 || i >= STATE.activeNodes.length) return null;
  if (!ctx || !ctx.baseNodeColors || !ctx.baseNodeSizes) return null;

  var ni = i * 4;
  if (ctx.baseNodeColors.length < (ni + 4) || ctx.baseNodeSizes.length <= i) return null;

  var nr = Number(ctx.baseNodeColors[ni] || 0);
  var ng = Number(ctx.baseNodeColors[ni + 1] || 0);
  var nb = Number(ctx.baseNodeColors[ni + 2] || 0);
  var na = Number(ctx.baseNodeColors[ni + 3] || 1);
  var size = Number(ctx.baseNodeSizes[i] || 1);
  if (!fin(size) || size <= 0) size = 1;

  if (ctx.runtimeNodeMask && !ctx.runtimeNodeMask[i]) {
    return { index: i, size: 0, color: [nr, ng, nb, 0] };
  }

  var inFocusMask = !!(ctx.focusNodeMask && ctx.focusNodeMask[i]);
  var isHovered = (i === ctx.hoverIndex);
  var outR = nr, outG = ng, outB = nb, outA = na, outSize = size;

  if (inFocusMask || (!ctx.focusHas && isHovered)) {
    outSize = size * 1.2;
    if (i === ctx.selectedIndex) {
      outR = cl(nr * 1.08, 0, 1);
      outG = cl(ng * 1.08, 0, 1);
      outB = cl(nb * 1.08, 0, 1);
    } else if (i === ctx.contextIndex) {
      outR = cl(nr * 1.04, 0, 1);
      outG = cl(ng * 1.04, 0, 1);
      outB = cl(nb * 1.04, 0, 1);
    } else if (isHovered) {
      outR = cl(nr * 1.06, 0, 1);
      outG = cl(ng * 1.06, 0, 1);
      outB = cl(nb * 1.06, 0, 1);
    }
    outA = cl(Math.max(na, 0.96), 0, 1);
  } else if (ctx.focusHas) {
    var grey = (luma(nr, ng, nb) * 0.58) + 0.07;
    outR = cl(grey, 0, 1);
    outG = cl(grey, 0, 1);
    outB = cl(grey, 0, 1);
    outA = cl(na * 0.16, 0.05, 0.24);
    outSize = size * 0.94;
  }

  return { index: i, size: outSize, color: [outR, outG, outB, outA] };
}

function createEdgeStyleContext(baseEdgeColors, runtimeEdgeMask, focusEdgeMask, focusHas) {
  return {
    baseEdgeColors: baseEdgeColors,
    runtimeEdgeMask: runtimeEdgeMask,
    focusEdgeMask: focusEdgeMask,
    focusHas: !!focusHas
  };
}

// Shared edge style solver for focus and dim states.
function computeEdgeStyleForIndex(edgeIndex, ctx) {
  var e = Number(edgeIndex);
  if (!isFinite(e) || e < 0) return null;
  if (!ctx || !ctx.baseEdgeColors) return null;
  var edgeCount = Math.floor(ctx.baseEdgeColors.length / 4);
  if (e >= edgeCount) return null;

  var ei = e * 4;
  var er = Number(ctx.baseEdgeColors[ei] || 0);
  var eg = Number(ctx.baseEdgeColors[ei + 1] || 0);
  var eb = Number(ctx.baseEdgeColors[ei + 2] || 0);
  var ea = Number(ctx.baseEdgeColors[ei + 3] || 1);
  var flow = ctx.runtimeEdgeMask ? (ctx.runtimeEdgeMask[e] ? 1 : 0) : (ea > 0.01 ? 1 : 0);

  if (ctx.runtimeEdgeMask && !ctx.runtimeEdgeMask[e]) {
    return { index: e, color: [er, eg, eb, 0], hidden: true, flow: 0 };
  }

  if (ctx.focusHas && ctx.focusEdgeMask && ctx.focusEdgeMask[e]) {
    var fa = cl(Math.max(ea, 0.45), 0, 1);
    return { index: e, color: [er, eg, eb, fa], hidden: fa <= 0.001, flow: flow };
  }

  if (ctx.focusHas) {
    var g = luma(er, eg, eb) * 0.45;
    var da = cl(ea * 0.08, 0.01, 0.08);
    return { index: e, color: [cl(g, 0, 1), cl(g, 0, 1), cl(g, 0, 1), da], hidden: da <= 0.001, flow: 0 };
  }

  return { index: e, color: [er, eg, eb, ea], hidden: ea <= 0.001, flow: flow };
}

function baseNodeStylePatchByIndex(idx) {
  var baseNodeColors = (STATE.basePointColors && STATE.basePointColors.length) ? STATE.basePointColors : null;
  var baseNodeSizes = (STATE.basePointSizes && STATE.basePointSizes.length) ? STATE.basePointSizes : null;
  if (!baseNodeColors || !baseNodeSizes) return null;
  var runtimeNodeMask = (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === baseNodeSizes.length) ? STATE.runtimeNodeVisibleMask : null;
  var ctx = createNodeStyleContext(baseNodeColors, baseNodeSizes, runtimeNodeMask, null, false, -1, -1, -1);
  return computeNodeStyleForIndex(idx, ctx);
}

function hoverNodeStylePatchByIndex(idx) {
  var baseNodeColors = (STATE.basePointColors && STATE.basePointColors.length) ? STATE.basePointColors : null;
  var baseNodeSizes = (STATE.basePointSizes && STATE.basePointSizes.length) ? STATE.basePointSizes : null;
  if (!baseNodeColors || !baseNodeSizes) return null;
  var runtimeNodeMask = (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === baseNodeSizes.length) ? STATE.runtimeNodeVisibleMask : null;
  var i = Number(idx);
  var ctx = createNodeStyleContext(baseNodeColors, baseNodeSizes, runtimeNodeMask, null, false, -1, -1, i);
  return computeNodeStyleForIndex(i, ctx);
}

function clearAppliedFocusPatchState() {
  STATE.appliedFocusNodeMask = new Uint8Array(0);
  STATE.appliedFocusEdgeMask = new Uint8Array(0);
  STATE.appliedFocusNodeIndices = [];
  STATE.appliedFocusEdgeIndices = [];
  STATE.appliedSelectedIndex = -1;
  STATE.appliedContextIndex = -1;
  STATE.appliedHoverIndex = -1;
}

function storeAppliedFocusPatchState(focus, selectedIndex, contextIndex, hoverIndex) {
  STATE.appliedFocusNodeMask = focus && focus.nodeMask ? new Uint8Array(focus.nodeMask) : new Uint8Array(0);
  STATE.appliedFocusEdgeMask = focus && focus.edgeMask ? new Uint8Array(focus.edgeMask) : new Uint8Array(0);
  STATE.appliedFocusNodeIndices = focus && Array.isArray(focus.focusedNodeIndices) ? focus.focusedNodeIndices.slice() : [];
  STATE.appliedFocusEdgeIndices = focus && Array.isArray(focus.focusedEdgeIndices) ? focus.focusedEdgeIndices.slice() : [];
  STATE.appliedSelectedIndex = Number(isFinite(selectedIndex) ? selectedIndex : -1);
  STATE.appliedContextIndex = Number(isFinite(contextIndex) ? contextIndex : -1);
  STATE.appliedHoverIndex = Number(isFinite(hoverIndex) ? hoverIndex : -1);
}

function markIndex(setObj, list, idx, max) {
  var i = Number(idx);
  if (!isFinite(i) || i < 0 || i >= max) return;
  var key = String(i);
  if (setObj[key]) return;
  setObj[key] = 1;
  list.push(i);
}

// Delta patch path: only update nodes/edges that changed between two focus states.
function tryApplyFocusStylePatch(nodeCtx, edgeCtx, focus, selectedIndex, contextIndex, hoverIndex) {
  if (!focus || !focus.hasFocus) return false;
  if (!STATE.lastStyleHasFocus) return false;
  if (!STATE.graph) return false;
  if (typeof STATE.graph.patchPointStylesBatch !== "function") return false;
  if (typeof STATE.graph.patchLinkStylesBatch !== "function") return false;

  var prevNodeMask = STATE.appliedFocusNodeMask;
  var prevEdgeMask = STATE.appliedFocusEdgeMask;
  if (!(prevNodeMask && prevNodeMask.length === STATE.activeNodes.length)) return false;
  if (!(prevEdgeMask && prevEdgeMask.length === STATE.activeEdges.length)) return false;

  var prevFocusNodes = Array.isArray(STATE.appliedFocusNodeIndices) ? STATE.appliedFocusNodeIndices : [];
  var prevFocusEdges = Array.isArray(STATE.appliedFocusEdgeIndices) ? STATE.appliedFocusEdgeIndices : [];
  var curFocusNodes = Array.isArray(focus.focusedNodeIndices) ? focus.focusedNodeIndices : [];
  var curFocusEdges = Array.isArray(focus.focusedEdgeIndices) ? focus.focusedEdgeIndices : [];

  var nodeSet = Object.create(null);
  var edgeSet = Object.create(null);
  var nodeIndices = [];
  var edgeIndices = [];
  var ni, ei;

  for (ni = 0; ni < prevFocusNodes.length; ni += 1) {
    var pn = Number(prevFocusNodes[ni]);
    if (!isFinite(pn) || pn < 0 || pn >= STATE.activeNodes.length) continue;
    if (!focus.nodeMask[pn]) markIndex(nodeSet, nodeIndices, pn, STATE.activeNodes.length);
  }
  for (ni = 0; ni < curFocusNodes.length; ni += 1) {
    var cn = Number(curFocusNodes[ni]);
    if (!isFinite(cn) || cn < 0 || cn >= STATE.activeNodes.length) continue;
    if (!prevNodeMask[cn]) markIndex(nodeSet, nodeIndices, cn, STATE.activeNodes.length);
  }

  markIndex(nodeSet, nodeIndices, STATE.appliedSelectedIndex, STATE.activeNodes.length);
  markIndex(nodeSet, nodeIndices, STATE.appliedContextIndex, STATE.activeNodes.length);
  markIndex(nodeSet, nodeIndices, STATE.appliedHoverIndex, STATE.activeNodes.length);
  markIndex(nodeSet, nodeIndices, selectedIndex, STATE.activeNodes.length);
  markIndex(nodeSet, nodeIndices, contextIndex, STATE.activeNodes.length);
  markIndex(nodeSet, nodeIndices, hoverIndex, STATE.activeNodes.length);

  for (ei = 0; ei < prevFocusEdges.length; ei += 1) {
    var pe = Number(prevFocusEdges[ei]);
    if (!isFinite(pe) || pe < 0 || pe >= STATE.activeEdges.length) continue;
    if (!focus.edgeMask[pe]) markIndex(edgeSet, edgeIndices, pe, STATE.activeEdges.length);
  }
  for (ei = 0; ei < curFocusEdges.length; ei += 1) {
    var ce = Number(curFocusEdges[ei]);
    if (!isFinite(ce) || ce < 0 || ce >= STATE.activeEdges.length) continue;
    if (!prevEdgeMask[ce]) markIndex(edgeSet, edgeIndices, ce, STATE.activeEdges.length);
  }

  var nodePatches = [];
  var edgePatches = [];

  for (ni = 0; ni < nodeIndices.length; ni += 1) {
    var np = computeNodeStyleForIndex(nodeIndices[ni], nodeCtx);
    if (np) nodePatches.push(np);
  }
  for (ei = 0; ei < edgeIndices.length; ei += 1) {
    var ep = computeEdgeStyleForIndex(edgeIndices[ei], edgeCtx);
    if (ep) edgePatches.push(ep);
  }

  stopPointSizeAnimation();
  if (nodePatches.length && !STATE.graph.patchPointStylesBatch(nodePatches, true)) return false;
  if (edgePatches.length && !STATE.graph.patchLinkStylesBatch(edgePatches, true)) return false;

  if (!STATE.runtimeFlowEdgeMask || STATE.runtimeFlowEdgeMask.length !== STATE.activeEdges.length) {
    STATE.runtimeFlowEdgeMask = new Uint8Array(STATE.activeEdges.length);
  }
  for (ei = 0; ei < edgePatches.length; ei += 1) {
    var flowPatch = edgePatches[ei];
    var fe = Number(flowPatch.index);
    if (!isFinite(fe) || fe < 0 || fe >= STATE.runtimeFlowEdgeMask.length) continue;
    STATE.runtimeFlowEdgeMask[fe] = flowPatch.flow ? 1 : 0;
  }

  if (STATE.graph.pointColors) STATE.pointStyleColors = STATE.graph.pointColors;
  if (STATE.graph.pointSizes) STATE.pointStyleSizes = STATE.graph.pointSizes;

  setGraphPanelFocusClass(true);
  STATE.lastStyleHasFocus = true;
  STATE.hoverPatchedPointIndex = null;
  storeAppliedFocusPatchState(focus, selectedIndex, contextIndex, hoverIndex);
  markStyleDebugMode("focus-patch");
  return true;
}

function patchedHoverIndexFromState() {
  var raw = STATE.hoverPatchedPointIndex;
  if (raw === null || raw === undefined || raw === "") return -1;
  var idx = Number(raw);
  if (!isFinite(idx) || idx < 0 || idx >= STATE.activeNodes.length) return -1;
  return idx;
}

function tryApplyHoverOnlyStylePatch() {
  if (!STATE.graph || typeof STATE.graph.patchPointStylesBatch !== "function") return false;

  var selectedIndex = selectedIndexFromState();
  var contextIndex = contextIndexFromState();
  if (selectedIndex >= 0 || contextIndex >= 0 || !!STATE.lastStyleHasFocus) {
    STATE.hoverPatchedPointIndex = null;
    return false;
  }

  var hoverIndex = hoveredIndexFromState();
  var prevHoverIndex = patchedHoverIndexFromState();
  var patches = [];

  if (prevHoverIndex >= 0 && prevHoverIndex !== hoverIndex) {
    var prevPatch = baseNodeStylePatchByIndex(prevHoverIndex);
    if (prevPatch) patches.push(prevPatch);
  }
  if (hoverIndex >= 0) {
    var hoverPatch = hoverNodeStylePatchByIndex(hoverIndex);
    if (hoverPatch) patches.push(hoverPatch);
  }

  if (!patches.length) return false;
  if (!STATE.graph.patchPointStylesBatch(patches)) return false;

  STATE.hoverPatchedPointIndex = hoverIndex >= 0 ? hoverIndex : null;
  STATE.lastStyleHasFocus = false;
  setGraphPanelFocusClass(hoverIndex >= 0);
  markStyleDebugMode("hover-patch");
  return true;
}

function applySelectionFocusStyles() {
  if (!STATE.graph) return;
  var baseNodeColors = (STATE.basePointColors && STATE.basePointColors.length) ? STATE.basePointColors : null;
  var baseNodeSizes = (STATE.basePointSizes && STATE.basePointSizes.length) ? STATE.basePointSizes : null;
  var baseEdgeColors = (STATE.baseLinkColors && STATE.baseLinkColors.length) ? STATE.baseLinkColors : null;
  if (!baseNodeColors || !baseEdgeColors || !baseNodeSizes) {
    setGraphPanelFocusClass(false);
    STATE.lastStyleHasFocus = false;
    STATE.hoverPatchedPointIndex = null;
    clearAppliedFocusPatchState();
    return;
  }

  var runtimeNodeMask = (STATE.runtimeNodeVisibleMask && STATE.runtimeNodeVisibleMask.length === baseNodeSizes.length) ? STATE.runtimeNodeVisibleMask : null;
  var runtimeEdgeMask = (STATE.runtimeEdgeVisibleMask && STATE.runtimeEdgeVisibleMask.length === Math.floor(baseEdgeColors.length / 4)) ? STATE.runtimeEdgeVisibleMask : null;
  var edgeCountAll = Math.floor(baseEdgeColors.length / 4);
  var flowMask = new Uint8Array(edgeCountAll);
  for (var fm = 0; fm < edgeCountAll; fm += 1) {
    if (runtimeEdgeMask) {
      flowMask[fm] = runtimeEdgeMask[fm] ? 1 : 0;
    } else {
      var baseAlpha = Number(baseEdgeColors[(fm * 4) + 3] || 0);
      flowMask[fm] = baseAlpha > 0.01 ? 1 : 0;
    }
  }

  var selectedIndex = selectedIndexFromState();
  var contextIndex = contextIndexFromState();
  var hoverIndex = hoveredIndexFromState();
  var seeds = [];
  if (selectedIndex >= 0) seeds.push(selectedIndex);
  if (contextIndex >= 0 && contextIndex !== selectedIndex) seeds.push(contextIndex);
  var focus = buildSelectionFocusMasks(seeds);
  STATE.focusNodeMask = focus.nodeMask;
  STATE.focusEdgeMask = focus.edgeMask;

  if (!focus.hasFocus && hoverIndex < 0) {
    setGraphPanelFocusClass(false);
    STATE.graph.setPointColors(baseNodeColors);
    applyPointSizesAnimated(baseNodeSizes, 170);
    STATE.graph.setLinkColors(baseEdgeColors);
    STATE.pointStyleColors = baseNodeColors;
    STATE.runtimeFlowEdgeMask = flowMask;
    STATE.lastStyleHasFocus = false;
    STATE.hoverPatchedPointIndex = null;
    clearAppliedFocusPatchState();
    markStyleDebugMode("full");
    return;
  }

  var nodeCtx = createNodeStyleContext(
    baseNodeColors,
    baseNodeSizes,
    runtimeNodeMask,
    focus.nodeMask,
    focus.hasFocus,
    selectedIndex,
    contextIndex,
    hoverIndex
  );
  var edgeCtx = createEdgeStyleContext(baseEdgeColors, runtimeEdgeMask, focus.edgeMask, focus.hasFocus);

  if (tryApplyFocusStylePatch(nodeCtx, edgeCtx, focus, selectedIndex, contextIndex, hoverIndex)) return;

  var outNodeColors = new Float32Array(baseNodeColors.length);
  var outNodeSizes = new Float32Array(baseNodeSizes.length);
  var outEdgeColors = new Float32Array(baseEdgeColors.length);
  outNodeColors.set(baseNodeColors);
  outNodeSizes.set(baseNodeSizes);
  outEdgeColors.set(baseEdgeColors);

  for (var i = 0; i < outNodeSizes.length; i += 1) {
    var nodeStyle = computeNodeStyleForIndex(i, nodeCtx);
    if (!nodeStyle) continue;
    var ni = i * 4;
    outNodeSizes[i] = Number(nodeStyle.size || 0);
    outNodeColors[ni] = Number(nodeStyle.color[0] || 0);
    outNodeColors[ni + 1] = Number(nodeStyle.color[1] || 0);
    outNodeColors[ni + 2] = Number(nodeStyle.color[2] || 0);
    outNodeColors[ni + 3] = Number(nodeStyle.color[3] || 0);
  }

  var edgeCount = Math.floor(outEdgeColors.length / 4);
  for (var e = 0; e < edgeCount; e += 1) {
    var edgeStyle = computeEdgeStyleForIndex(e, edgeCtx);
    if (!edgeStyle) continue;
    var ei = e * 4;
    outEdgeColors[ei] = Number(edgeStyle.color[0] || 0);
    outEdgeColors[ei + 1] = Number(edgeStyle.color[1] || 0);
    outEdgeColors[ei + 2] = Number(edgeStyle.color[2] || 0);
    outEdgeColors[ei + 3] = Number(edgeStyle.color[3] || 0);
    flowMask[e] = edgeStyle.flow ? 1 : 0;
  }

  setGraphPanelFocusClass(focus.hasFocus || hoverIndex >= 0);

  STATE.graph.setPointColors(outNodeColors);
  applyPointSizesAnimated(outNodeSizes, 170);
  STATE.graph.setLinkColors(outEdgeColors);
  STATE.pointStyleColors = outNodeColors;
  STATE.runtimeFlowEdgeMask = flowMask;
  STATE.lastStyleHasFocus = !!focus.hasFocus;
  if (focus.hasFocus) {
    STATE.hoverPatchedPointIndex = null;
    storeAppliedFocusPatchState(focus, selectedIndex, contextIndex, hoverIndex);
  } else {
    STATE.hoverPatchedPointIndex = (hoverIndex >= 0) ? hoverIndex : null;
    clearAppliedFocusPatchState();
  }
  markStyleDebugMode("full");
}

function applyVisualStyles(renderAlpha) {
  if (!STATE.graph) return;
  if (tryApplyHoverOnlyStylePatch()) {
    cityEnsureFlowParticlesLoop();
    return;
  }
  applySelectionFocusStyles();
  if (renderAlpha === undefined || renderAlpha === null) STATE.graph.render(); else STATE.graph.render(renderAlpha);
  
  cityEnsureFlowParticlesLoop();
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
  cityUpdateStatus(statusLabel);
  return true;
}

function focusNodeById(nodeId, fromSearch) {
  if (!STATE.graph) return;
  var idx = STATE.activeIndexById.get(String(nodeId));
  if (idx === undefined) { cityUpdateStatus("Search miss: node hidden by filters"); return; }
  if (STATE.runtimeNodeVisibleMask && idx >= 0 && idx < STATE.runtimeNodeVisibleMask.length && !STATE.runtimeNodeVisibleMask[idx]) {
    cityUpdateStatus("Search miss: node hidden by filters");
    return;
  }
  STATE.graph.zoomToPointByIndex(idx, 220, 3.5, true);
  selectNodeByIndex(idx, fromSearch ? ("Selected: " + (STATE.activeNodes[idx] ? STATE.activeNodes[idx].label : nodeId)) : null);
  cityHideSuggest();
}

function applyPhysicsToGraph() {
  if (!STATE.graph) return;
  var engineCfg = cityCollectEngineRuntimeSettings(STATE.engine || {});
  var solverCfg = cityCollectSolverSettings(STATE.solver || {});
  var rendererCfg = cityCollectRendererSettings(STATE.renderer || {});
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
      STATE.pointerInsideGraph = true;
      if (evt && isFinite(evt.clientX) && isFinite(evt.clientY)) {
        STATE.pointerClientX = Number(evt.clientX);
        STATE.pointerClientY = Number(evt.clientY);
      }
      if (Number(STATE.hoveredPointIndex) === Number(index)) {
        cityMoveTooltip(STATE.pointerClientX, STATE.pointerClientY);
        return;
      }
      STATE.hoveredPointIndex = index;
      applyVisualStyles(0.08);
      citySetHoverDebug("enter-node", {
        idx: index,
        nodeId: node.id,
        noteType: node.note_type || node.kind || "",
        pointerX: STATE.pointerClientX,
        pointerY: STATE.pointerClientY
      });
      cityShowTooltip(node, { clientX: STATE.pointerClientX, clientY: STATE.pointerClientY });
    },
    onPointMouseOut: function () {
      citySetHoverDebug("leave-node-event", {
        idx: STATE.hoveredPointIndex
      });
      cityClearHoverNodeState("leave-node-event");
    },
    onLinkMouseOver: function (linkIndex) { STATE.hoveredLinkIndex = linkIndex; },
    onLinkMouseOut: function () { STATE.hoveredLinkIndex = null; },
    onBackgroundClick: function () {
      STATE.selectedNodeId = null;
      STATE.selectedPointIndex = null;
      STATE.contextNodeId = null;
      STATE.contextPointIndex = null;
      STATE.hoveredPointIndex = null;
      STATE.hoveredLinkIndex = null;
      STATE.focusedIndex = undefined;
      if (STATE.graph && typeof STATE.graph.unselectPoints === "function") { STATE.graph.unselectPoints(); }
      cityHideTooltip();
      cityHideContextMenu();
      applyVisualStyles();
      cityUpdateStatus();
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
  var arrays = cityBuildGraphArrays(source);
  STATE.activeNodes = arrays.nodes;
  STATE.activeEdges = arrays.edges;
  STATE.activeIndexById = arrays.indexById;
  STATE.activeIdsByIndex = arrays.idsByIndex;
  STATE.focusAdjCache = null;
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
    STATE.runtimeFlowEdgeMask = new Uint8Array(0);
    stopPointSizeAnimation();
    STATE.pointStyleSizes = new Float32Array(0);
    STATE.visibleGraphCounts = { notes: 0, families: 0, edges: 0 };
    STATE.lastStyleHasFocus = false;
    STATE.hoverPatchedPointIndex = null;
    clearAppliedFocusPatchState();
    STATE.contextNodeId = null;
    STATE.contextPointIndex = null;
    cityBuildSearchEntries();
    cityUpdateStatus();
    return;
  }

  STATE.basePointColors = arrays.pointColors ? new Float32Array(arrays.pointColors) : new Float32Array(0);
  STATE.basePointSizes = arrays.pointSizes ? new Float32Array(arrays.pointSizes) : new Float32Array(0);
  STATE.baseLinkColors = arrays.linkColors ? new Float32Array(arrays.linkColors) : new Float32Array(0);
  STATE.pointStyleColors = STATE.basePointColors;
  stopPointSizeAnimation();
  STATE.pointStyleSizes = new Float32Array(STATE.basePointSizes);
  STATE.lastStyleHasFocus = false;
  STATE.hoverPatchedPointIndex = null;
  clearAppliedFocusPatchState();

  if (typeof STATE.graph.setPointIds === "function") STATE.graph.setPointIds(arrays.idsByIndex);
  STATE.graph.setPointPositions(arrays.pointPositions);
  STATE.graph.setLinks(arrays.links);
  STATE.graph.setLinkStrength(arrays.linkStrength);
  STATE.graph.setLinkDistance(arrays.linkDistance);
  STATE.graph.setLinkStyleCodes(arrays.linkStyleCodes);
  STATE.graph.setPointColors(STATE.basePointColors);
  STATE.graph.setPointSizes(STATE.pointStyleSizes);
  if (typeof STATE.graph.setPointTypeCodes === "function") STATE.graph.setPointTypeCodes(arrays.pointTypeCodes);
  STATE.graph.setLinkColors(STATE.baseLinkColors);
  STATE.graph.setLinkWidths(arrays.linkWidths);

  var shouldFit = !!fitView;
  if (!shouldFit) shouldFit = false;
  STATE.lastEdgeCount = STATE.activeEdges.length;
  STATE.lastNodeCount = STATE.activeNodes.length;

  cityApplyRuntimeUiSettings(false);
  if (STATE.graph && typeof STATE.graph.resize === "function") {
    STATE.graph.resize();
  }
  if (shouldFit && STATE.graph && typeof STATE.graph.fitView === "function") {
    STATE.graph.fitView(0, 0.1);
  }
  if (STATE.solver && STATE.solver.layout_enabled && typeof STATE.graph.start === "function") STATE.graph.start();
  cityEnsureFlowParticlesLoop();
}

window.applyGraphData = applyGraphData;
window.applyVisualStyles = applyVisualStyles;
window.applyPhysicsToGraph = applyPhysicsToGraph;

(function registerEngineAdapterPorts() {
  var adapter = window && window.GraphAdapter;
  if (!adapter || typeof adapter.registerEnginePort !== "function") return;
  adapter.registerEnginePort("applyGraphData", applyGraphData);
  adapter.registerEnginePort("applyVisualStyles", applyVisualStyles);
  adapter.registerEnginePort("applyPhysicsToGraph", applyPhysicsToGraph);
  adapter.registerEnginePort("createGraphEngineSigma", createGraphEngineSigma);
  adapter.registerEnginePort("focusNodeById", focusNodeById);
  adapter.registerEnginePort("edgeCurvByStyle", edgeCurvByStyle);
})();
