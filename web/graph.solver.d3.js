"use strict";

function AjpcGraphSolverD3(owner) {
  this.owner = owner;
  this.simulation = null;
  this.nodes = [];
  this.links = [];
  this._tickBound = null;
  this._tickCount = 0;
  this._startTs = 0;
  this._cooldownTicks = 0;
  this._cooldownTimeMs = 0;
}

function solverAdapterCallCity(name) {
  var adapter = window && window.GraphAdapter;
  if (!adapter || typeof adapter.callCity !== "function") return undefined;
  return adapter.callCity.apply(adapter, arguments);
}

function solverSeededPos(id) {
  var out = solverAdapterCallCity("seededPos", id);
  if (Array.isArray(out) && out.length >= 2) return out;
  return [0, 0];
}

AjpcGraphSolverD3.prototype._d3 = function () {
  if (window && window.d3 && typeof window.d3.forceSimulation === "function") return window.d3;
  return null;
};

AjpcGraphSolverD3.prototype._settings = function () {
  var p = this.owner && this.owner.runtimeSolver ? this.owner.runtimeSolver : DEF_SOLVER;
  return {
    layout_enabled: bol(p.layout_enabled, DEF_SOLVER.layout_enabled),
    d3_alpha: num(p.d3_alpha, DEF_SOLVER.d3_alpha, 0, 2),
    d3_alpha_min: num(p.d3_alpha_min, DEF_SOLVER.d3_alpha_min, 0, 0.5),
    d3_alpha_decay: num(p.d3_alpha_decay, DEF_SOLVER.d3_alpha_decay, 0, 1),
    d3_alpha_target: num(p.d3_alpha_target, DEF_SOLVER.d3_alpha_target, 0, 1),
    d3_velocity_decay: num(p.d3_velocity_decay, DEF_SOLVER.d3_velocity_decay, 0, 1),
    d3_center_x: num(p.d3_center_x, DEF_SOLVER.d3_center_x, -20000, 20000),
    d3_center_y: num(p.d3_center_y, DEF_SOLVER.d3_center_y, -20000, 20000),
    d3_center_strength: num(p.d3_center_strength, DEF_SOLVER.d3_center_strength, 0, 1),
    d3_manybody_strength: num(p.d3_manybody_strength, DEF_SOLVER.d3_manybody_strength, -5000, 5000),
    d3_manybody_theta: num(p.d3_manybody_theta, DEF_SOLVER.d3_manybody_theta, 0.1, 2),
    d3_manybody_distance_min: num(p.d3_manybody_distance_min, DEF_SOLVER.d3_manybody_distance_min, 0, 10000),
    d3_manybody_distance_max: num(p.d3_manybody_distance_max, DEF_SOLVER.d3_manybody_distance_max, 0, 10000),
    //d3_link_distance: num(p.d3_link_distance, DEF_SOLVER.d3_link_distance, 1, 5000),
    d3_link_strength: num(p.d3_link_strength, DEF_SOLVER.d3_link_strength, 0, 2),
    d3_link_iterations: it(p.d3_link_iterations, DEF_SOLVER.d3_link_iterations, 1, 16),
    d3_warmup_ticks: it(p.d3_warmup_ticks, DEF_SOLVER.d3_warmup_ticks, 0, 5000),
    d3_cooldown_ticks: it(p.d3_cooldown_ticks, DEF_SOLVER.d3_cooldown_ticks, 0, 50000),
    d3_cooldown_time_ms: it(p.d3_cooldown_time_ms, DEF_SOLVER.d3_cooldown_time_ms, 0, 600000)
  };
};

AjpcGraphSolverD3.prototype._buildModel = function () {
  var owner = this.owner || {};
  var graph = owner.graph || null;
  var ids = Array.isArray(owner.idByIndex) ? owner.idByIndex : [];
  var d3nodes = [];
  var byId = new Map();
  var i;

  if (!graph || !ids.length) return { nodes: d3nodes, links: [] };

  for (i = 0; i < ids.length; i += 1) {
    var id = ids[i];
    if (!id || !graph.hasNode(id)) continue;
    var attrs = graph.getNodeAttributes(id);
    if (!attrs || attrs.hidden) continue;
    var x = Number(attrs.x);
    var y = Number(attrs.y);
    if (!isFinite(x) || !isFinite(y)) {
      var seed = solverSeededPos(id);
      x = Number(seed[0] || 0) - off();
      y = Number(seed[1] || 0) - off();
    }
    var node = {
      id: String(id),
      x: x,
      y: y,
      vx: Number(attrs.vx || 0),
      vy: Number(attrs.vy || 0)
    };
    d3nodes.push(node);
    byId.set(node.id, node);
  }

  var d3links = [];
  var edgeIds = Array.isArray(owner.edgeIdByIndex) ? owner.edgeIdByIndex : [];
  for (i = 0; i < edgeIds.length; i += 1) {
    var edgeId = edgeIds[i];
    if (!edgeId || !graph.hasEdge(edgeId)) continue;
    var edgeAttrs = graph.getEdgeAttributes(edgeId);
    if (edgeAttrs && edgeAttrs.hidden) continue;
    var sid = String(graph.source(edgeId) || "");
    var tid = String(graph.target(edgeId) || "");
    var s = byId.get(sid);
    var t = byId.get(tid);
    if (!s || !t || s === t) continue;
    d3links.push({
      source: s,
      target: t,
      id: String(edgeId),
      edgeIndex: owner.edgeIndexById && typeof owner.edgeIndexById.get === "function"
        ? Number(owner.edgeIndexById.get(String(edgeId)))
        : i
    });
  }

  return { nodes: d3nodes, links: d3links };
};

AjpcGraphSolverD3.prototype._edgeDistance = function (link, cfg) {
  var owner = this.owner || {};
  var idx = Number(link && link.edgeIndex);
  if (isFinite(idx) && idx >= 0 && owner.linkDistance && owner.linkDistance.length > idx) {
    var dyn = Number(owner.linkDistance[idx]);
    if (isFinite(dyn) && dyn > 0) return dyn;
  }
  return cfg.d3_link_distance;
};

AjpcGraphSolverD3.prototype._edgeStrength = function (link, cfg) {
  var owner = this.owner || {};
  var idx = Number(link && link.edgeIndex);
  var dyn = 1;
  if (isFinite(idx) && idx >= 0 && owner.linkStrength && owner.linkStrength.length > idx) {
    dyn = Number(owner.linkStrength[idx]);
    if (!isFinite(dyn) || dyn < 0) dyn = 0;
  }
  return cl(cfg.d3_link_strength * dyn, 0, 2);
};

AjpcGraphSolverD3.prototype._applyTick = function () {
  if (!this.simulation) return;
  var owner = this.owner || {};
  var graph = owner.graph || null;
  if (!graph) return;
  this._tickCount += 1;

  var moved = 0;
  for (var i = 0; i < this.nodes.length; i += 1) {
    var n = this.nodes[i];
    if (!n || !graph.hasNode(n.id)) continue;
    var x = Number(n.x);
    var y = Number(n.y);
    if (!isFinite(x) || !isFinite(y)) continue;
    graph.mergeNodeAttributes(n.id, { x: x, y: y, vx: Number(n.vx || 0), vy: Number(n.vy || 0) });
    moved += 1;
  }

  if (!moved) return;
  if (owner && typeof owner.requestFrame === "function") owner.requestFrame();
  else if (owner && owner.renderer && typeof owner.renderer.requestFrame === "function") owner.renderer.requestFrame();

  if (this._cooldownTicks > 0 && this._tickCount >= this._cooldownTicks) {
    this.stop(false);
    return;
  }
  if (this._cooldownTimeMs > 0) {
    var now = Date.now();
    if ((now - this._startTs) >= this._cooldownTimeMs) {
      this.stop(false);
    }
  }
};

AjpcGraphSolverD3.prototype._buildSimulation = function () {
  var d3 = this._d3();
  if (!d3) return false;

  var cfg = this._settings();
  var model = this._buildModel();
  this.nodes = model.nodes;
  this.links = model.links;

  if (!this.nodes.length) return false;

  var self = this;
  var charge = d3.forceManyBody()
    .strength(function () { return cfg.d3_manybody_strength; })
    .theta(cfg.d3_manybody_theta);
  charge.distanceMin(cfg.d3_manybody_distance_min);
  if (cfg.d3_manybody_distance_max > 0) charge.distanceMax(cfg.d3_manybody_distance_max);

  var linkForce = d3.forceLink(this.links)
    .id(function (n) { return n.id; })
    .distance(function (l) { return self._edgeDistance(l, cfg); })
    .strength(function (l) { return self._edgeStrength(l, cfg); })
    .iterations(cfg.d3_link_iterations);

  var sim = d3.forceSimulation(this.nodes)
    .alpha(cfg.d3_alpha)
    .alphaMin(cfg.d3_alpha_min)
    .alphaDecay(cfg.d3_alpha_decay)
    .alphaTarget(cfg.d3_alpha_target)
    .velocityDecay(cfg.d3_velocity_decay)
    .force("charge", charge)
    .force("link", linkForce)
    .force("x", d3.forceX(cfg.d3_center_x).strength(cfg.d3_center_strength))
    .force("y", d3.forceY(cfg.d3_center_y).strength(cfg.d3_center_strength));

  this._tickBound = function () { self._applyTick(); };
  sim.on("tick", this._tickBound);
  this.simulation = sim;
  this._tickCount = 0;
  this._startTs = Date.now();
  this._cooldownTicks = cfg.d3_cooldown_ticks;
  this._cooldownTimeMs = cfg.d3_cooldown_time_ms;

  if (cfg.d3_warmup_ticks > 0) {
    sim.stop();
    sim.tick(cfg.d3_warmup_ticks);
    this._applyTick();
  }

  lg("info", "d3 solver init nodes=" + String(this.nodes.length) + " edges=" + String(this.links.length));
  return true;
};

AjpcGraphSolverD3.prototype.start = function (alpha) {
  var cfg = this._settings();
  if (!cfg.layout_enabled) return;

  var d3 = this._d3();
  if (!d3) {
    lg("warn", "D3 force bundle missing, layout disabled");
    return;
  }

  this.stop(true);
  if (!this._buildSimulation()) return;

  if (!this.simulation) return;
  var a = Number(alpha);
  if (isFinite(a) && a >= 0) this.simulation.alpha(Math.max(a, cfg.d3_alpha_min));
  else this.simulation.alpha(cfg.d3_alpha);
  this.simulation.alphaTarget(cfg.d3_alpha_target);
  this._startTs = Date.now();
  this._tickCount = 0;
  this.simulation.restart();
};

AjpcGraphSolverD3.prototype.stop = function (destroySimulation) {
  if (!this.simulation) return;
  try { this.simulation.stop(); } catch (_e) {}
  if (destroySimulation) {
    try { this.simulation.on("tick", null); } catch (_e2) {}
    this.simulation = null;
    this.nodes = [];
    this.links = [];
    this._tickBound = null;
    this._tickCount = 0;
    this._startTs = 0;
    this._cooldownTicks = 0;
    this._cooldownTimeMs = 0;
  }
};

AjpcGraphSolverD3.prototype.dispose = function () {
  this.stop(true);
};
