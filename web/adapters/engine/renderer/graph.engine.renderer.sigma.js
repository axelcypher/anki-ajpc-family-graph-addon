"use strict";

function AjpcGraphRendererSigma(owner) {
  this.owner = owner;
  this.instance = null;
  this.camCb = null;
  this.useShaderCardDots = false;
  this.useShaderNodeFx = false;
  this.nodeFxAnimRaf = null;
  this.nodeFxAnimUntilMs = 0;
  this.nodeFxPersistent = false;
  this._nodeFxTickBound = null;
}

function setNoteNodeAAFlag(enabled) {
  var root = window;
  if (!root) return;
  if (!root.AJPCSigmaRuntime || typeof root.AJPCSigmaRuntime !== "object") root.AJPCSigmaRuntime = {};
  root.AJPCSigmaRuntime.noteNodeAAEnabled = !!enabled;
}

function requestFlowCanvasSizeSync() {
  var gw = window && window.AjpcEngineGateway;
  if (!gw || typeof gw.callCity !== "function") return;
  gw.callCity("ensureFlowCanvasSize");
}

AjpcGraphRendererSigma.prototype._settings = function () {
  var self = this;
  var owner = this.owner;
  var p = owner.runtimeRenderer || DEF_RENDERER;
  var d = it(p.sigma_animations_time, DEF_RENDERER.sigma_animations_time, 0, 5000);
  setNoteNodeAAFlag(!!p.sigma_note_node_aa);

  var cp = edgeProgByName("curved");
  var dp = edgeProgByName("dashed") || cp;
  var dotp = edgeProgByName("dotted") || cp;
  var lp = null;
  var npNote = nodeProgByName("note");
  var npCardDots = nodeProgByName("card_dots");
  var npNodeFx = nodeProgByName("node_fx");
  var npCircle = nodeProgByName("hub");
  var npNoteWithCardDots = npNote;
  var npCircleWithFx = npCircle;
  var edgePrograms = {};
  var nodePrograms = {};
  var mkNodeCompound = null;

  if (SigmaApi && SigmaApi.rendering) {
    if (typeof SigmaApi.rendering.EdgeLineProgram === "function") lp = SigmaApi.rendering.EdgeLineProgram;
    else if (typeof SigmaApi.rendering.EdgeRectangleProgram === "function") lp = SigmaApi.rendering.EdgeRectangleProgram;

    if (typeof npCircle !== "function") {
      if (typeof SigmaApi.rendering.NodeCircleProgram === "function") npCircle = SigmaApi.rendering.NodeCircleProgram;
      else if (typeof SigmaApi.rendering.NodePointProgram === "function") npCircle = SigmaApi.rendering.NodePointProgram;
    }
    if (typeof SigmaApi.rendering.createNodeCompoundProgram === "function") mkNodeCompound = SigmaApi.rendering.createNodeCompoundProgram;
  }

  this.useShaderCardDots = false;
  this.useShaderNodeFx = false;
  if (typeof mkNodeCompound === "function") {
    if (typeof npNote === "function") {
      var noteParts = [npNote];
      if (typeof npCardDots === "function") {
        noteParts.push(npCardDots);
        this.useShaderCardDots = true;
      }
      if (typeof npNodeFx === "function") {
        noteParts.push(npNodeFx);
        this.useShaderNodeFx = true;
      }
      if (noteParts.length > 1) {
        try {
          npNoteWithCardDots = mkNodeCompound(noteParts);
        } catch (_e0) {
          npNoteWithCardDots = npNote;
          this.useShaderCardDots = false;
          this.useShaderNodeFx = false;
        }
      }
    }
    if (typeof npCircle === "function" && typeof npNodeFx === "function") {
      try {
        npCircleWithFx = mkNodeCompound([npCircle, npNodeFx]);
        this.useShaderNodeFx = true;
      } catch (_e1) {
        npCircleWithFx = npCircle;
      }
    }
  }

  owner._useCustomNodeTypes = typeof npNoteWithCardDots === "function" && typeof npCircleWithFx === "function";

  if (cp) edgePrograms[EDGE_TYPE_CURVED] = cp;
  if (dp) edgePrograms[EDGE_TYPE_DASHED] = dp;
  if (dotp) edgePrograms[EDGE_TYPE_DOTTED] = dotp;
  if (lp) edgePrograms.line = lp;

  if (owner._useCustomNodeTypes) {
    nodePrograms.circle = npCircleWithFx;
    nodePrograms[NODE_TYPE_NOTE] = npNoteWithCardDots;
  }

  dbg("programs", {
    edgeCurved: !!cp,
    edgeDashed: !!dp,
    edgeDotted: !!dotp,
    edgeLine: !!lp,
    nodeCircle: !!npCircle,
    nodeNote: !!npNote,
    nodeCardDots: !!npCardDots,
    nodeFx: !!npNodeFx,
    nodeCompound: !!mkNodeCompound,
    useShaderCardDots: !!this.useShaderCardDots,
    useShaderNodeFx: !!this.useShaderNodeFx,
    useCustomNodes: !!owner._useCustomNodeTypes
  });

  function cl01(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function smooth01(v) {
    var t = cl01(v);
    return t * t * (3 - (2 * t));
  }

  function drawAjpcNodeLabel(ctx, node, settings) {
    if (!node || node.hidden) return;
    var label = String(node.label || "");
    if (!label) return;

    var cam = self._cam();
    var ratio = Number(cam && cam.ratio);
    if (!isFinite(ratio) || ratio <= 0) ratio = 1;
    var zoom = 1 / ratio;

    var zoomMin = num(p.sigma_label_zoom_min, DEF_RENDERER.sigma_label_zoom_min, 0, 64);
    var fadeBand = Math.max(0.0001, zoomMin * 0.08);
    var fadeStart = zoomMin - fadeBand;
    var fadeEnd = zoomMin + fadeBand;
    var fadeT = (zoom - fadeStart) / (fadeEnd - fadeStart);
    var alpha = smooth01(fadeT);
    if (alpha <= 0.01) return;

    // Dim irrelevant labels while a node/context focus selection is active.
    var st = window && window.STATE ? window.STATE : null;
    var focusMask = st && st.focusNodeMask ? st.focusNodeMask : null;
    var hasSelectionFocus = !!(st && (st.selectedNodeId || st.contextNodeId));
    var nodeId = String(node.key !== undefined ? node.key : (node.id !== undefined ? node.id : ""));
    var idx = (owner && owner.indexById && nodeId) ? owner.indexById.get(nodeId) : undefined;
    var inFocus = idx !== undefined && focusMask && focusMask.length > idx ? !!focusMask[idx] : true;
    if (hasSelectionFocus && !inFocus) alpha *= 0.18;
    if (alpha <= 0.01) return;

    // Scale only between ~1x and ~2x zoom, then keep size capped.
    var z0 = Math.max(zoomMin, 0.0001);
    var z1 = z0 * 2.0;
    var z = zoom;
    if (z < z0) z = z0;
    if (z > z1) z = z1;
    var zT = (z - z0) / Math.max(z1 - z0, 0.0001);
    var fontSize = 9.5 + (zT * 2.8);

    var x = Number(node.x || 0);
    var y = Number(node.y || 0);
    var r = Number(node.size || 0);
    if (!isFinite(x) || !isFinite(y)) return;
    if (!isFinite(r) || r < 0) r = 0;
    var yTop = y - r - 7;

    ctx.save();
    ctx.font = "500 " + String(fontSize.toFixed(2)) + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = "rgba(2, 6, 23, " + String((0.80 * alpha).toFixed(3)) + ")";
    ctx.lineWidth = Math.max(1, fontSize * 0.18);
    if (hasSelectionFocus && !inFocus) {
      ctx.fillStyle = "rgba(160, 168, 184, " + String(alpha.toFixed(3)) + ")";
    } else {
      ctx.fillStyle = "rgba(229, 231, 235, " + String(alpha.toFixed(3)) + ")";
    }
    ctx.strokeText(label, x, yTop);
    ctx.fillText(label, x, yTop);
    ctx.restore();
  }

  var out = {
    renderLabels: !!p.sigma_draw_labels,
    renderEdgeLabels: false,
    labelColor: { color: "#e5e7eb" },
    labelSize: 13,
    labelWeight: "500",
    enableEdgeEvents: !!p.sigma_enable_edge_hovering,
    hideEdgesOnMove: !!p.sigma_hide_edges_on_move,
    autoRescale: false,
    autoCenter: false,
    defaultNodeColor: DNC,
    defaultEdgeColor: DEC,
    defaultNodeType: "circle",
    defaultEdgeType: cp ? EDGE_TYPE_CURVED : "line",
    itemSizesReference: "screen",
    zoomToSizeRatioFunction: function (ratio) { return Number(ratio); },
    minEdgeThickness: 0,
    labelRenderedSizeThreshold: num(p.sigma_label_threshold, DEF_RENDERER.sigma_label_threshold, 0, 64),
    minCameraRatio: num(p.sigma_min_camera_ratio, DEF_RENDERER.sigma_min_camera_ratio, 0.0001, 100),
    maxCameraRatio: num(p.sigma_max_camera_ratio, DEF_RENDERER.sigma_max_camera_ratio, 0.0001, 100),
    stagePadding: num(p.sigma_side_margin, DEF_RENDERER.sigma_side_margin, 0, 512),
    zoomDuration: d,
    doubleClickZoomingDuration: d,
    doubleClickZoomingRatio: p.sigma_double_click_enabled ? 2.2 : 1,
    enableCameraZooming: !!p.sigma_mouse_wheel_enabled,
    zIndex: true,
    allowInvalidContainer: true,
    defaultDrawNodeHover: function () {},
    defaultDrawNodeLabel: drawAjpcNodeLabel
  };

  if (Object.keys(edgePrograms).length) out.edgeProgramClasses = edgePrograms;
  if (owner._useCustomNodeTypes && Object.keys(nodePrograms).length) out.nodeProgramClasses = nodePrograms;

  return out;
};

AjpcGraphRendererSigma.prototype._cam = function () {
  if (!this.instance || typeof this.instance.getCamera !== "function") return null;
  try {
    return this.instance.getCamera();
  } catch (_e) {
    return null;
  }
};

AjpcGraphRendererSigma.prototype._setupOverlayLayers = function () {
  if (!this.instance || !DOM) return;

  var canvases = {};
  if (typeof this.instance.getCanvases === "function") {
    try {
      canvases = this.instance.getCanvases() || {};
    } catch (_e) {
      canvases = {};
    }
  }

  var flow = canvases["ajpc-flow"] || null;
  var flowOpts = { style: { pointerEvents: "none" } };

  if (Object.prototype.hasOwnProperty.call(canvases, "nodes")) flowOpts.beforeLayer = "nodes";
  else if (Object.prototype.hasOwnProperty.call(canvases, "nodeLabels")) flowOpts.beforeLayer = "nodeLabels";
  else if (Object.prototype.hasOwnProperty.call(canvases, "labels")) flowOpts.beforeLayer = "labels";
  else if (Object.prototype.hasOwnProperty.call(canvases, "hovers")) flowOpts.beforeLayer = "hovers";
  else if (Object.prototype.hasOwnProperty.call(canvases, "mouse")) flowOpts.beforeLayer = "mouse";
  else if (Object.prototype.hasOwnProperty.call(canvases, "edges")) flowOpts.afterLayer = "edges";
  else if (Object.prototype.hasOwnProperty.call(canvases, "scene")) flowOpts.afterLayer = "scene";

  dbg("flow-layer", {
    canvasKeys: Object.keys(canvases),
    beforeLayer: Object.prototype.hasOwnProperty.call(flowOpts, "beforeLayer") ? flowOpts.beforeLayer : null,
    afterLayer: Object.prototype.hasOwnProperty.call(flowOpts, "afterLayer") ? flowOpts.afterLayer : null
  });

  try {
    if (!flow && typeof this.instance.createCanvas === "function") flow = this.instance.createCanvas("ajpc-flow", flowOpts);
  } catch (err) {
    lg("warn", "overlay layer init failed: " + String(err && err.message ? err.message : err));
    flow = null;
  }

  if (flow) {
    flow.style.pointerEvents = "none";
    DOM.flowCanvas = flow;
    DOM.flowCtx = flow.getContext("2d");
    requestFlowCanvasSizeSync();
  } else {
    DOM.flowCanvas = null;
    DOM.flowCtx = null;
  }
};

AjpcGraphRendererSigma.prototype._bind = function () {
  if (!this.instance) return;

  var owner = this.owner;

  this.instance.on("clickNode", function (payload) {
    var nodeId = nid(payload);
    var idx = nodeId !== null ? owner.indexById.get(nodeId) : undefined;
    if (idx !== undefined && typeof owner.config.onPointClick === "function") owner.config.onPointClick(idx);
  });

  this.instance.on("doubleClickNode", function (payload) {
    var nodeId = nid(payload);
    var idx = nodeId !== null ? owner.indexById.get(nodeId) : undefined;
    if (idx !== undefined && typeof owner.config.onPointDoubleClick === "function") owner.config.onPointDoubleClick(idx);
  });

  this.instance.on("enterNode", function (payload) {
    var nodeId = nid(payload);
    var idx = nodeId !== null ? owner.indexById.get(nodeId) : undefined;
    if (idx === undefined) return;

    if (typeof owner.config.onPointMouseOver === "function") {
      var pointPos = null;
      var o = off();
      if (owner.graph && owner.graph.hasNode(nodeId)) {
        var attrs = owner.graph.getNodeAttributes(nodeId);
        pointPos = [Number(attrs.x || 0) + o, Number(attrs.y || 0) + o];
      }
      owner.config.onPointMouseOver(idx, pointPos, hev(payload));
    }
  });

  this.instance.on("leaveNode", function () {
    if (typeof owner.config.onPointMouseOut === "function") owner.config.onPointMouseOut();
  });

  this.instance.on("enterEdge", function (payload) {
    var edgeId = eid(payload);
    var idx = edgeId !== null ? owner.edgeIndexById.get(edgeId) : undefined;
    if (idx !== undefined && typeof owner.config.onLinkMouseOver === "function") owner.config.onLinkMouseOver(idx);
  });

  this.instance.on("leaveEdge", function () {
    if (typeof owner.config.onLinkMouseOut === "function") owner.config.onLinkMouseOut();
  });

  this.instance.on("clickStage", function () {
    if (typeof owner.config.onBackgroundClick === "function") owner.config.onBackgroundClick();
  });

  var cam = this._cam();
  if (cam && typeof cam.on === "function") {
    this.camCb = function () {
      if (typeof owner.config.onZoom === "function") owner.config.onZoom();
    };
    cam.on("updated", this.camCb);
  }
};

AjpcGraphRendererSigma.prototype.init = function () {
  var owner = this.owner;

  if (!SigmaApi) {
    lg("error", "Sigma v3 API missing");
    throw new Error("Sigma API not found");
  }
  if (!owner.graph) {
    lg("error", "Graphology graph missing");
    throw new Error("Graphology API not found");
  }

  this.instance = new SigmaApi(owner.graph, owner.container, this._settings());
  this._setupOverlayLayers();
  this._bind();
  this.instance.refresh();

  lg("info", "graph initialized (sigma v3)");
  dbg("init", { hasSigma: !!SigmaApi, hasGraphology: !!GraphologyApi, container: !!owner.container });
};

AjpcGraphRendererSigma.prototype.applySettings = function () {
  if (!this.instance) return;
  var st = this._settings();
  this.instance.setSettings(st);
  var cam = this._cam();
  if (cam) {
    cam.minRatio = st.minCameraRatio;
    cam.maxRatio = st.maxCameraRatio;
    cam.enabledZooming = !!st.enableCameraZooming;
  }
};

AjpcGraphRendererSigma.prototype.refresh = function () {
  if (this.instance) this.instance.refresh();
};

AjpcGraphRendererSigma.prototype.requestFrame = function () {
  if (!this.instance) return;
  if (typeof this.instance.scheduleRender === "function") this.instance.scheduleRender();
  else this.instance.refresh();
};

AjpcGraphRendererSigma.prototype._stopNodeFxLoop = function () {
  if (this.nodeFxAnimRaf) {
    window.cancelAnimationFrame(this.nodeFxAnimRaf);
    this.nodeFxAnimRaf = null;
  }
};

AjpcGraphRendererSigma.prototype._startNodeFxLoop = function () {
  if (this.nodeFxAnimRaf || !this.instance) return;
  var self = this;
  if (!this._nodeFxTickBound) {
    this._nodeFxTickBound = function () {
      if (!self.instance) {
        self._stopNodeFxLoop();
        return;
      }
      self.requestFrame();
      var now = performance.now();
      if (self.nodeFxPersistent || now < self.nodeFxAnimUntilMs) {
        self.nodeFxAnimRaf = window.requestAnimationFrame(self._nodeFxTickBound);
        return;
      }
      self._stopNodeFxLoop();
    };
  }
  this.nodeFxAnimRaf = window.requestAnimationFrame(this._nodeFxTickBound);
};

AjpcGraphRendererSigma.prototype.setNodeFxAnimationState = function (persistent, untilMs) {
  this.nodeFxPersistent = !!persistent;
  var until = Number(untilMs);
  if (isFinite(until)) {
    if (until <= 0) this.nodeFxAnimUntilMs = 0;
    else if (until > this.nodeFxAnimUntilMs) this.nodeFxAnimUntilMs = until;
  }
  var now = performance.now();
  if (!this.nodeFxPersistent && this.nodeFxAnimUntilMs <= now) {
    this.nodeFxAnimUntilMs = 0;
    this._stopNodeFxLoop();
    return;
  }
  this._startNodeFxLoop();
};

AjpcGraphRendererSigma.prototype.resize = function () {
  if (!this.instance) return;
  try {
    if (typeof this.instance.resize === "function") this.instance.resize(true);
    this.instance.refresh();
  } catch (_e) {}
};

AjpcGraphRendererSigma.prototype.getZoomLevel = function () {
  var cam = this._cam();
  if (!cam) return 1;
  var ratio = Number(cam.ratio);
  if (!fin(ratio) || ratio <= 0) return 1;
  return 1 / ratio;
};

AjpcGraphRendererSigma.prototype.getCameraState = function () {
  var cam = this._cam();
  if (!cam) return null;

  try {
    if (typeof cam.getState === "function") {
      var state = cam.getState();
      if (state && fin(Number(state.x)) && fin(Number(state.y)) && fin(Number(state.ratio))) {
        return { x: Number(state.x), y: Number(state.y), ratio: Number(state.ratio) };
      }
    }
  } catch (_e) {}

  var x = Number(cam.x);
  var y = Number(cam.y);
  var ratio = Number(cam.ratio);
  if (!fin(x) || !fin(y) || !fin(ratio)) return null;
  return { x: x, y: y, ratio: ratio };
};

AjpcGraphRendererSigma.prototype.graphToViewport = function (x, y) {
  if (!this.instance || typeof this.instance.graphToViewport !== "function") return null;
  try {
    var p = this.instance.graphToViewport({ x: Number(x || 0), y: Number(y || 0) });
    if (!p || !fin(Number(p.x)) || !fin(Number(p.y))) return null;
    return { x: Number(p.x), y: Number(p.y) };
  } catch (_e) {
    return null;
  }
};

AjpcGraphRendererSigma.prototype.viewportToGraph = function (x, y) {
  if (!this.instance || typeof this.instance.viewportToGraph !== "function") return null;
  try {
    var p = this.instance.viewportToGraph({ x: Number(x || 0), y: Number(y || 0) });
    if (!p || !fin(Number(p.x)) || !fin(Number(p.y))) return null;
    return { x: Number(p.x), y: Number(p.y) };
  } catch (_e) {
    return null;
  }
};

AjpcGraphRendererSigma.prototype.viewportToFramedGraph = function (x, y) {
  if (!this.instance || typeof this.instance.viewportToFramedGraph !== "function") return null;
  try {
    var p = this.instance.viewportToFramedGraph({ x: Number(x || 0), y: Number(y || 0) });
    if (!p || !fin(Number(p.x)) || !fin(Number(p.y))) return null;
    return { x: Number(p.x), y: Number(p.y) };
  } catch (_e) {
    return null;
  }
};

AjpcGraphRendererSigma.prototype.fitView = function (duration, padding) {
  var owner = this.owner;
  if (!owner.graph || !this.instance) return;

  this.resize();

  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  var count = 0;
  var mask = (typeof STATE !== "undefined" && STATE && STATE.runtimeNodeVisibleMask) ? STATE.runtimeNodeVisibleMask : null;
  var o = off();

  for (var i = 0; i < owner.idByIndex.length; i += 1) {
    var id = owner.idByIndex[i];
    if (!id || !owner.graph.hasNode(id)) continue;
    if (mask && i >= 0 && i < mask.length && !mask[i]) continue;

    var size = Number(owner.pointSizes[i]);
    if (fin(size) && size <= 0) continue;

    var attrs = owner.graph.getNodeAttributes(id);
    if (!attrs || attrs.hidden) continue;

    var px = Number(owner.pointPositions[i * 2]);
    var py = Number(owner.pointPositions[(i * 2) + 1]);
    var x = fin(px) ? (px - o) : Number(attrs.x || 0);
    var y = fin(py) ? (py - o) : Number(attrs.y || 0);
    if (!fin(x) || !fin(y)) continue;

    var r = fin(size) && size > 0 ? Math.min(96, Math.max(0, size * 2.2)) : 0;
    var lx = x - r;
    var rx = x + r;
    var ty = y - r;
    var by = y + r;

    if (lx < minX) minX = lx;
    if (ty < minY) minY = ty;
    if (rx > maxX) maxX = rx;
    if (by > maxY) maxY = by;
    count += 1;
  }

  if (!count) return;

  var centerX = (minX + maxX) * 0.5;
  var centerY = (minY + maxY) * 0.5;
  var boxW = Math.max(1, maxX - minX);
  var boxH = Math.max(1, maxY - minY);
  var pad = num(padding, 0.1, 0, 4);
  var viewport = this.instance.getDimensions ? this.instance.getDimensions() : { width: owner.container.clientWidth || 1, height: owner.container.clientHeight || 1 };
  var vw = Math.max(1, Number(viewport.width || 1));
  var vh = Math.max(1, Number(viewport.height || 1));
  var sx = boxW / Math.max(1, vw * (1 - pad));
  var sy = boxH / Math.max(1, vh * (1 - pad));
  var scale = Math.max(sx, sy);
  var targetRatio = Math.max(0.0001, scale);

  var cam = this._cam();
  if (!cam || typeof cam.setState !== "function") return;

  var framedCenter = null;
  var vp = this.graphToViewport(centerX, centerY);
  if (vp) framedCenter = this.viewportToFramedGraph(vp.x, vp.y);

  if (framedCenter && fin(framedCenter.x) && fin(framedCenter.y)) {
    cam.setState({ x: framedCenter.x, y: framedCenter.y, ratio: targetRatio });
  } else {
    cam.setState({ ratio: targetRatio });
  }

  this.instance.refresh();
};

AjpcGraphRendererSigma.prototype.zoomToPointByIndex = function (idx, duration, zoom) {
  var owner = this.owner;
  if (!this.instance || !owner.graph) return;

  var i = Number(idx);
  if (!isFinite(i) || i < 0 || i >= owner.idByIndex.length) return;

  var id = owner.idByIndex[i];
  if (!id || !owner.graph.hasNode(id)) return;

  var attrs = owner.graph.getNodeAttributes(id);
  var targetRatio = 0.2;
  if (zoom !== undefined && zoom !== null) {
    var z = Number(zoom);
    if (fin(z) && z > 0) targetRatio = 1 / z;
  }

  if (!fin(targetRatio) || targetRatio <= 0) targetRatio = 0.2;

  var cam = this._cam();
  if (!cam || typeof cam.setState !== "function") return;

  var fx = Number(attrs.x || 0);
  var fy = Number(attrs.y || 0);
  var framed = null;
  var vp = this.graphToViewport(fx, fy);
  if (vp) framed = this.viewportToFramedGraph(vp.x, vp.y);

  if (framed && fin(framed.x) && fin(framed.y)) cam.setState({ x: framed.x, y: framed.y, ratio: targetRatio });
  else cam.setState({ ratio: targetRatio });

  this.instance.refresh();
};

AjpcGraphRendererSigma.prototype.getPointScreenRadiusByIndex = function (idx) {
  var owner = this.owner;
  var i = Number(idx);
  if (!isFinite(i) || i < 0 || i >= owner.idByIndex.length) return 0;

  var id = owner.idByIndex[i];
  if (!id) return 0;

  if (this.instance && typeof this.instance.getNodeDisplayData === "function") {
    try {
      var dd = this.instance.getNodeDisplayData(id);
      var ds = Number(dd && dd.size);
      if (fin(ds) && ds > 0) {
        if (typeof this.instance.scaleSize === "function") {
          var scaled = Number(this.instance.scaleSize(ds));
          if (fin(scaled) && scaled > 0) return scaled;
        }
        return ds;
      }
    } catch (_e) {}
  }

  var ps = Number(owner.pointSizes && owner.pointSizes.length > i ? owner.pointSizes[i] : 0);
  if (fin(ps) && ps > 0) {
    if (this.instance && typeof this.instance.scaleSize === "function") {
      var fallbackScaled = Number(this.instance.scaleSize(ps));
      if (fin(fallbackScaled) && fallbackScaled > 0) return fallbackScaled;
    }
    return ps;
  }
  return 0;
};

AjpcGraphRendererSigma.prototype.kill = function () {
  if (!this.instance) return;
  this._stopNodeFxLoop();
  this.nodeFxPersistent = false;
  this.nodeFxAnimUntilMs = 0;

  var cam = this._cam();
  if (cam && this.camCb && typeof cam.off === "function") {
    try { cam.off("updated", this.camCb); } catch (_e) {}
  }

  try { this.instance.kill(); } catch (_e2) {}
  this.instance = null;

  if (DOM) {
    DOM.flowCanvas = null;
    DOM.flowCtx = null;
  }
};
