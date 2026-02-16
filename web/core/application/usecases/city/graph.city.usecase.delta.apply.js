"use strict";

function cityUsecaseOpsCount(ops) {
  var src = ops && typeof ops === "object" ? ops : {};
  return {
    node_add: Array.isArray(src.node_add) ? src.node_add.length : 0,
    node_update: Array.isArray(src.node_update) ? src.node_update.length : 0,
    node_drop: Array.isArray(src.node_drop) ? src.node_drop.length : 0,
    edge_upsert: Array.isArray(src.edge_upsert) ? src.edge_upsert.length : 0,
    edge_drop: Array.isArray(src.edge_drop) ? src.edge_drop.length : 0
  };
}

function cityUsecaseCollectEdgeUpsertNodeIds(ops) {
  var src = ops && typeof ops === "object" ? ops : {};
  var out = new Set();

  var edgeUpsert = Array.isArray(src.edge_upsert) ? src.edge_upsert : [];
  edgeUpsert.forEach(function (entry) {
    if (!entry || typeof entry !== "object") return;
    var source = String(entry.source || "");
    var target = String(entry.target || "");
    if (source) out.add(source);
    if (target) out.add(target);
  });

  return Array.from(out.values());
}

function cityUsecaseCollectEdgeUpsertPairs(ops) {
  var src = ops && typeof ops === "object" ? ops : {};
  var out = [];
  var seen = new Set();
  var edgeUpsert = Array.isArray(src.edge_upsert) ? src.edge_upsert : [];

  edgeUpsert.forEach(function (entry) {
    if (!entry || typeof entry !== "object") return;
    var source = String(entry.source || "");
    var target = String(entry.target || "");
    if (!source || !target || source === target) return;
    var layer = String(entry.attrs && entry.attrs.layer ? entry.attrs.layer : "");
    var key = source + "|" + target + "|" + layer;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ source: source, target: target, layer: layer });
  });

  return out;
}

function cityUsecaseRemapSelectionAndHover() {
  var indexById = (STATE.activeIndexById && typeof STATE.activeIndexById.get === "function") ? STATE.activeIndexById : new Map();

  if (STATE.selectedNodeId !== null && STATE.selectedNodeId !== undefined) {
    var selectedIdx = indexById.get(String(STATE.selectedNodeId));
    if (selectedIdx === undefined) {
      STATE.selectedNodeId = null;
      STATE.selectedPointIndex = null;
    } else {
      STATE.selectedPointIndex = Number(selectedIdx);
    }
  } else {
    STATE.selectedPointIndex = null;
  }

  if (STATE.contextNodeId !== null && STATE.contextNodeId !== undefined) {
    var contextIdx = indexById.get(String(STATE.contextNodeId));
    if (contextIdx === undefined) {
      STATE.contextNodeId = null;
      STATE.contextPointIndex = null;
    } else {
      STATE.contextPointIndex = Number(contextIdx);
    }
  } else {
    STATE.contextPointIndex = null;
  }

  if (STATE.hoveredPointIndex !== null && STATE.hoveredPointIndex !== undefined) {
    var hp = Number(STATE.hoveredPointIndex);
    if (!isFinite(hp) || hp < 0 || hp >= STATE.activeNodes.length) STATE.hoveredPointIndex = null;
  }
  if (STATE.hoveredLinkIndex !== null && STATE.hoveredLinkIndex !== undefined) {
    var he = Number(STATE.hoveredLinkIndex);
    if (!isFinite(he) || he < 0 || he >= STATE.activeEdges.length) STATE.hoveredLinkIndex = null;
  }
}

function cityUsecaseRequestDeltaRecovery(reason) {
  var why = String(reason || "unknown");
  log("delta recovery reason=" + why);
  if (STATE.deltaRecoveryInProgress) return;
  STATE.deltaRecoveryInProgress = true;
  if (window.pycmd) {
    window.pycmd("log:delta recovery " + why);
    window.pycmd("refresh");
  } else {
    var applyFn = cityUsecaseResolveApplyGraphData();
    if (applyFn) applyFn(false);
  }
}

function cityUsecaseApplyDeltaPayload(payload) {
  if (!DOM.graph) wireDom();
  var incomingRev = Number(payload && payload.rev);
  if (!isFinite(incomingRev) || incomingRev <= 0) {
    log("delta dropped invalid rev");
    return;
  }

  var lastRev = Number(STATE.lastAppliedDeltaRev || 0);
  if (incomingRev <= lastRev) {
    log("delta dropped stale rev=" + String(incomingRev) + " last=" + String(lastRev));
    return;
  }
  if (lastRev > 0 && incomingRev > (lastRev + 1)) {
    cityUsecaseRequestDeltaRecovery("rev gap " + String(lastRev) + "->" + String(incomingRev));
    return;
  }

  var applyDeltaOpsFn = cityUsecaseResolveApplyGraphDeltaOps();
  if (!applyDeltaOpsFn) {
    cityUsecaseRequestDeltaRecovery("missing engine delta port");
    return;
  }

  try {
    if (typeof persistCurrentPositions === "function") persistCurrentPositions();
    var slice = prepareDeltaSlice(payload || {});
    var ops = buildDeltaOps(slice);
    var counts = cityUsecaseOpsCount(ops);
    log(
      "delta incoming rev=" + String(incomingRev)
      + " ops="
      + JSON.stringify(counts)
    );

    applyDeltaOpsToState(ops, slice);
    if (!STATE.raw.meta || typeof STATE.raw.meta !== "object") STATE.raw.meta = {};
    STATE.raw.meta.delta_rev = incomingRev;
    if (STATE.depTreeCache && typeof STATE.depTreeCache.clear === "function") STATE.depTreeCache.clear();
    STATE.depTreePendingNid = null;

    ensureRuntimeState();
    refreshUiOnly();

    var source = {
      nodes: Array.isArray(STATE.raw.nodes) ? STATE.raw.nodes : [],
      edges: Array.isArray(STATE.raw.edges) ? STATE.raw.edges : []
    };
    var arrays = buildGraphArrays(source);
    STATE.activeNodes = arrays.nodes;
    STATE.activeEdges = arrays.edges;
    STATE.activeIndexById = arrays.indexById;
    STATE.activeIdsByIndex = arrays.idsByIndex;
    STATE.focusAdjCache = null;
    cityUsecaseRemapSelectionAndHover();

    applyDeltaOpsFn(ops, arrays, { preserve_layout: true });
    applyRuntimeUiSettings(false);

    var applyStyles = cityUsecaseResolveApplyVisualStyles();
    if (applyStyles) applyStyles(0.08);
    var hasEdgeDelta = counts.edge_upsert > 0 || counts.edge_drop > 0;
    var hasEdgeUpsert = counts.edge_upsert > 0;
    if (hasEdgeUpsert) {
      var layoutEnabled = !!(STATE.solver && STATE.solver.layout_enabled);
      var subsetNodeIds = cityUsecaseCollectEdgeUpsertNodeIds(ops);
      var subsetBiasPairs = cityUsecaseCollectEdgeUpsertPairs(ops);
      var subsetBiasMode = "weighted_degree";
      var subsetBiasGain = 0.28;
      var subsetNodeSample = subsetNodeIds.slice(0, 8).join(",");
      var hasSubsetPullPort = cityUsecaseHasEnginePort("runSubsetNoDampingPull");
      if (hasSubsetPullPort && layoutEnabled && subsetNodeIds.length >= 2) {
        log(
          "delta subset pull trigger rev=" + String(incomingRev)
          + " nodes=" + String(subsetNodeIds.length)
          + " sample=" + subsetNodeSample
          + " edge_upsert=" + String(counts.edge_upsert)
          + " edge_drop=" + String(counts.edge_drop)
          + " bias_mode=" + subsetBiasMode
          + " bias_gain=" + String(subsetBiasGain)
          + " bias_pairs=" + String(subsetBiasPairs.length)
        );
        var subsetRes = cityUsecaseCallEngineMethod(
          "runSubsetNoDampingPull",
          subsetNodeIds,
          {
            include_links: true,
            ticks: 72,
            animate: true,
            ticks_per_frame: 1,
            alpha: 0.12,
            attract_strength: 22,
            bias_mode: subsetBiasMode,
            bias_gain: subsetBiasGain,
            bias_pairs: subsetBiasPairs
          }
        );
        var subsetOk = false;
        if (subsetRes === true) subsetOk = true;
        if (subsetRes && typeof subsetRes === "object" && subsetRes.ok === true) subsetOk = true;
        if (subsetOk) {
          var moved = subsetRes && typeof subsetRes === "object" ? Number(subsetRes.moved) : 0;
          var usedNodes = subsetRes && typeof subsetRes === "object" ? Number(subsetRes.nodes) : subsetNodeIds.length;
          var usedLinks = subsetRes && typeof subsetRes === "object" ? Number(subsetRes.links) : 0;
          var usedTicks = subsetRes && typeof subsetRes === "object" ? Number(subsetRes.ticks) : 0;
          log(
            "delta subset pull applied rev=" + String(incomingRev)
            + " moved=" + String(isFinite(moved) ? moved : 0)
            + " nodes=" + String(isFinite(usedNodes) ? usedNodes : subsetNodeIds.length)
            + " links=" + String(isFinite(usedLinks) ? usedLinks : 0)
            + " ticks=" + String(isFinite(usedTicks) ? usedTicks : 0)
            + " bias_mode=" + subsetBiasMode
            + " bias_gain=" + String(subsetBiasGain)
            + " bias_pairs=" + String(subsetBiasPairs.length)
          );
        } else {
          log(
            "delta subset pull failed rev=" + String(incomingRev)
            + " nodes=" + String(subsetNodeIds.length)
            + " bias_mode=" + subsetBiasMode
            + " bias_gain=" + String(subsetBiasGain)
            + " bias_pairs=" + String(subsetBiasPairs.length)
            + " result_type=" + String(typeof subsetRes)
          );
        }
      } else {
        log(
          "delta subset pull skipped rev=" + String(incomingRev)
          + " nodes=" + String(subsetNodeIds.length)
          + " sample=" + subsetNodeSample
          + " subset_port=" + String(hasSubsetPullPort)
          + " layout_enabled=" + String(layoutEnabled)
          + " bias_mode=" + subsetBiasMode
          + " bias_gain=" + String(subsetBiasGain)
          + " bias_pairs=" + String(subsetBiasPairs.length)
        );
      }
    } else if (hasEdgeDelta) {
      log(
        "delta subset pull skipped rev=" + String(incomingRev)
        + " reason=no_edge_upsert"
        + " edge_upsert=" + String(counts.edge_upsert)
        + " edge_drop=" + String(counts.edge_drop)
      );
    }

    STATE.lastAppliedDeltaRev = incomingRev;
    STATE.deltaRecoveryInProgress = false;
    log(
      "delta applied rev=" + String(incomingRev)
      + " applied_ops=" + JSON.stringify(counts)
      + " nodes=" + String(STATE.activeNodes.length)
      + " edges=" + String(STATE.activeEdges.length)
    );
  } catch (err) {
    log("delta failed " + String(err && err.message ? err.message : err));
    cityUsecaseRequestDeltaRecovery("delta exception");
  }
}
