"use strict";

function AjpcGraphSolverFa2(owner) {
  this.owner = owner;
  this.supervisor = null;
  this.settingsKey = "";
}

AjpcGraphSolverFa2.prototype._ctor = function () {
  if (window && typeof window.GraphologyLayoutForceAtlas2Worker === "function") {
    return window.GraphologyLayoutForceAtlas2Worker;
  }
  return null;
};

AjpcGraphSolverFa2.prototype._settings = function () {
  var p = this.owner.runtimeSolver || DEF_SOLVER;

  return {
    linLogMode: bol(p.fa2_lin_log_mode, DEF_SOLVER.fa2_lin_log_mode),
    outboundAttractionDistribution: bol(p.fa2_outbound_attraction_distribution, DEF_SOLVER.fa2_outbound_attraction_distribution),
    adjustSizes: bol(p.fa2_adjust_sizes, DEF_SOLVER.fa2_adjust_sizes),
    edgeWeightInfluence: num(p.fa2_edge_weight_influence, DEF_SOLVER.fa2_edge_weight_influence, 0, 4),
    scalingRatio: num(p.fa2_scaling_ratio, DEF_SOLVER.fa2_scaling_ratio, 0.01, 200),
    strongGravityMode: bol(p.fa2_strong_gravity_mode, DEF_SOLVER.fa2_strong_gravity_mode),
    gravity: num(p.fa2_gravity, DEF_SOLVER.fa2_gravity, 0, 10),
    slowDown: num(p.fa2_slow_down, DEF_SOLVER.fa2_slow_down, 0.1, 200),
    barnesHutOptimize: bol(p.fa2_barnes_hut_optimize, DEF_SOLVER.fa2_barnes_hut_optimize),
    barnesHutTheta: num(p.fa2_barnes_hut_theta, DEF_SOLVER.fa2_barnes_hut_theta, 0.1, 2)
  };
};

AjpcGraphSolverFa2.prototype._ensureSupervisor = function (forceRespawn) {
  var Ctor = this._ctor();
  if (!Ctor || !this.owner.graph) return false;

  var settings = this._settings();
  var key = "";
  try {
    key = JSON.stringify(settings);
  } catch (_e) {
    key = "";
  }

  if (!forceRespawn && this.supervisor && this.settingsKey === key) return true;

  if (this.supervisor && typeof this.supervisor.kill === "function") {
    try { this.supervisor.kill(); } catch (_e2) {}
  }

  this.supervisor = null;

  try {
    this.supervisor = new Ctor(this.owner.graph, { settings: settings, getEdgeWeight: "weight" });
    this.settingsKey = key;
    return true;
  } catch (err) {
    lg("warn", "fa2 supervisor init failed: " + String(err && err.message ? err.message : err));
    this.supervisor = null;
    return false;
  }
};

AjpcGraphSolverFa2.prototype.start = function (alpha) {
  var cfg = this.owner.runtimeSolver || DEF_SOLVER;
  if (!cfg.layout_enabled) return;

  var forceRestart = alpha !== undefined && alpha !== null;
  if (forceRestart) this.stop(true);

  var Ctor = this._ctor();
  if (!Ctor) {
    lg("warn", "FA2 worker bundle missing, layout disabled");
    return;
  }

  if (!this._ensureSupervisor(forceRestart)) return;

  try {
    if (!this.supervisor.isRunning || !this.supervisor.isRunning()) this.supervisor.start();
  } catch (err) {
    lg("warn", "fa2 start failed: " + String(err && err.message ? err.message : err));
  }
};

AjpcGraphSolverFa2.prototype.stop = function (destroySupervisor) {
  if (this.supervisor && typeof this.supervisor.stop === "function") {
    try { this.supervisor.stop(); } catch (_e) {}
  }

  if (destroySupervisor && this.supervisor && typeof this.supervisor.kill === "function") {
    try { this.supervisor.kill(); } catch (_e2) {}
    this.supervisor = null;
    this.settingsKey = "";
  }
};

AjpcGraphSolverFa2.prototype.dispose = function () {
  this.stop(true);
};
