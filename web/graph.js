(function () {
  function log(msg) {
    try {
      if (window.pycmd) {
        pycmd("log:" + msg);
      }
    } catch (_e) {}
  }

  function nowMs() {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  function showToast(text, ttl) {
    var container = document.getElementById("toast-container");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "toast";
    msg.textContent = text;
    container.appendChild(msg);
    requestAnimationFrame(function () {
      msg.classList.add("show");
    });
    var delay = typeof ttl === "number" ? ttl : 2400;
    setTimeout(function () {
      msg.classList.remove("show");
      msg.classList.add("hide");
      setTimeout(function () {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 300);
    }, delay);
  }

  function showMsg(text) {
    showToast(text);
  }

  window.onerror = function (msg, _src, line, col) {
    showMsg("JS error: " + msg + " @ " + line + ":" + col);
    log("js error: " + msg + " @ " + line + ":" + col);
  };

  function prioColor(prio) {
    if (prio === undefined || prio === null) return "#4da3ff";
    var p = Math.max(0, Math.min(10, prio));
    var t = p / 10;
    var r = Math.round(80 + (180 - 80) * t);
    var g = Math.round(120 + (200 - 120) * t);
    var b = Math.round(210 + (230 - 210) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function layerColor(layer, colors) {
    if (colors && colors[layer]) return colors[layer];
    if (layer === "family") return "#6ee7b7";
    if (layer === "family_hub") return "#34d399";
    if (layer === "reference") return "#f59e0b";
    if (layer === "example") return "#a78bfa";
    if (layer === "kanji") return "#f87171";
    return "#9ca3af";
  }

  function nodeColor(node, noteTypeColors, layerColors) {
    if (!node) return "#4da3ff";
    if (node.kind === "family") return layerColor("family_hub", layerColors);
    var ntid =
      node.note_type_id || node.note_type_id === 0
        ? String(node.note_type_id)
        : "";
    if (ntid && noteTypeColors && noteTypeColors[ntid]) {
      return noteTypeColors[ntid];
    }
    return prioColor(node.prio);
  }

  function colorWithAlpha(color, alpha) {
    if (!color) return color;
    if (color.startsWith("rgba")) return color;
    if (color.startsWith("rgb(")) {
      return color.replace("rgb(", "rgba(").replace(")", "," + alpha + ")");
    }
    if (color[0] === "#" && color.length === 7) {
      var r = parseInt(color.slice(1, 3), 16);
      var g = parseInt(color.slice(3, 5), 16);
      var b = parseInt(color.slice(5, 7), 16);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    return color;
  }

  function parseColor(color) {
    if (!color) return null;
    if (color[0] === "#" && color.length === 7) {
      var r = parseInt(color.slice(1, 3), 16);
      var g = parseInt(color.slice(3, 5), 16);
      var b = parseInt(color.slice(5, 7), 16);
      return { r: r, g: g, b: b };
    }
    if (color.startsWith("rgb")) {
      try {
        var parts = color.replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",");
        return {
          r: parseInt(parts[0].trim(), 10),
          g: parseInt(parts[1].trim(), 10),
          b: parseInt(parts[2].trim(), 10),
        };
      } catch (_e) {
        return null;
      }
    }
    return null;
  }

  function mixWithWhite(color, amount) {
    var rgb = parseColor(color);
    if (!rgb) return color;
    var t = Math.max(0, Math.min(1, amount));
    var r = Math.round(rgb.r + (255 - rgb.r) * t);
    var g = Math.round(rgb.g + (255 - rgb.g) * t);
    var b = Math.round(rgb.b + (255 - rgb.b) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function initGraph(data) {
    log("initGraph start nodes=" + (data.nodes || []).length + " edges=" + (data.edges || []).length);
    var fallback = document.getElementById("fallback");
    if (fallback) fallback.remove();

    if (typeof ForceGraph !== "function") {
      showMsg("force-graph failed to load");
      log("force-graph failed to load");
      return;
    }

    var graphEl = document.getElementById("graph");
    if (!graphEl) {
      showMsg("graph container missing");
      log("graph container missing");
      return;
    }
    graphEl.innerHTML = "";

    var layerState = {
      family: document.getElementById("layer-family"),
      family_hub: document.getElementById("layer-family-hub"),
      reference: document.getElementById("layer-reference"),
      example: document.getElementById("layer-example"),
      kanji: document.getElementById("layer-kanji"),
    };

    var physicsDefaults = {
      charge: -80,
      link_distance: 30,
      link_strength: 1,
      velocity_decay: 0.35,
      alpha_decay: 0.02,
      cooldown_ticks: 80,
      warmup_ticks: 180,
      max_radius: 1400,
    };
    var physics = {};

    var noteTypeMeta = (data.meta && data.meta.note_types) || [];
    function buildNoteTypeHubMembers(raw) {
      var map = {};
      (raw || []).forEach(function (entry) {
        if (!entry || !entry.hub_id) return;
        var nodesList = entry.nodes || [];
        nodesList.forEach(function (n) {
          if (!n) return;
          if (!n.kind) n.kind = "note";
          n.__hub_parent = String(entry.hub_id);
        });
        map[String(entry.hub_id)] = {
          nodes: nodesList,
          edges: entry.edges || [],
        };
      });
      return map;
    }
    var noteTypeHubMembers = buildNoteTypeHubMembers(
      (data.meta && data.meta.note_type_hub_members) || []
    );
    var expandedHubs = new Set();
    var visibleNoteTypes = {};
    var noteTypeColors = {};
    var noteTypeLinkedField = {};
    var noteTypeTemplates = {};
    var cardDotColors = (data.meta && data.meta.card_dot_colors) || {};
    if (!cardDotColors.suspended) cardDotColors.suspended = "#ef4444";
    if (!cardDotColors.buried) cardDotColors.buried = "#f59e0b";
    var cardDotsEnabled =
      data.meta && data.meta.card_dots_enabled !== undefined
        ? !!data.meta.card_dots_enabled
        : true;
    var cardDotsMinZoom = 2.5;

    var layerColors = (data.meta && data.meta.layer_colors) || {};
    var layerEnabled = (data.meta && data.meta.layer_enabled) || {};
    var layerStyles = (data.meta && data.meta.layer_styles) || {};
    var layerFlow = (data.meta && data.meta.layer_flow) || {};
    var linkStrengths = (data.meta && data.meta.link_strengths) || {};
    var flowSpeed = (data.meta && data.meta.layer_flow_speed) || 0.02;
    var autoRefOpacity =
      data.meta && data.meta.reference_auto_opacity !== undefined
        ? data.meta.reference_auto_opacity
        : 1.0;
      var showUnlinked =
      data.meta && data.meta.show_unlinked !== undefined
        ? !!data.meta.show_unlinked
        : false;
      var kanjiComponentsEnabled =
      data.meta && data.meta.kanji_components_enabled !== undefined
        ? !!data.meta.kanji_components_enabled
        : true;
    var kanjiComponentStyle =
      (data.meta && data.meta.kanji_component_style) || "solid";
    var kanjiComponentColor =
      (data.meta && data.meta.kanji_component_color) || "";
    var kanjiComponentOpacity =
      data.meta && data.meta.kanji_component_opacity !== undefined
        ? data.meta.kanji_component_opacity
        : 0.6;
    var kanjiComponentFocusOnly =
      data.meta && data.meta.kanji_component_focus_only !== undefined
        ? !!data.meta.kanji_component_focus_only
        : false;
    var kanjiComponentFlow =
      data.meta && data.meta.kanji_component_flow !== undefined
        ? !!data.meta.kanji_component_flow
        : false;
    var samePrioEdges =
      data.meta && data.meta.family_same_prio_edges ? true : false;
    var familyChainEdges =
      data.meta && data.meta.family_chain_edges ? true : false;
    var samePrioOpacity =
      data.meta && data.meta.family_same_prio_opacity
        ? data.meta.family_same_prio_opacity
        : 0.6;
    var deckList = (data.meta && data.meta.decks) || [];
    var selectedDecks = (data.meta && data.meta.selected_decks) || [];
    if (!Array.isArray(deckList)) deckList = [];
    if (!Array.isArray(selectedDecks)) selectedDecks = [];
    noteTypeMeta.forEach(function (nt) {
      visibleNoteTypes[String(nt.id)] = nt.visible !== false;
      if (nt.color) {
        noteTypeColors[String(nt.id)] = nt.color;
      }
      if (nt.linked_field) {
        noteTypeLinkedField[String(nt.id)] = nt.linked_field;
      }
      if (Array.isArray(nt.templates)) {
        noteTypeTemplates[String(nt.id)] = nt.templates.slice();
      }
    });

    var nodes = (data.nodes || []).map(function (n) {
      var copy = {};
      for (var k in n) copy[k] = n[k];
      copy.x = copy.x || Math.random() * 800;
      copy.y = copy.y || Math.random() * 600;
      return copy;
    });
    var links = (data.edges || []).map(function (e) {
      var copy = {};
      for (var k in e) copy[k] = e[k];
      return copy;
    });
    (function logLinkStats() {
      var refAuto = 0;
      var refManual = 0;
      links.forEach(function (l) {
        if (l.layer !== "reference") return;
        if (l.meta && l.meta.manual) refManual += 1;
        else refAuto += 1;
      });
      log(
        "links reference auto=" +
          refAuto +
          " manual=" +
          refManual +
          " total=" +
          links.length
      );
    })();

    var nodeById = {};
    nodes.forEach(function (n) {
      nodeById[String(n.id)] = n;
    });
    function addHubMembersToNodeMap() {
      Object.keys(noteTypeHubMembers).forEach(function (hid) {
        var entry = noteTypeHubMembers[hid];
        if (!entry || !entry.nodes) return;
        entry.nodes.forEach(function (n) {
          if (!n || n.id === undefined || n.id === null) return;
          nodeById[String(n.id)] = n;
        });
      });
    }
    addHubMembersToNodeMap();

    var selectedId = null;
    var ctxMenuId = null;
    var ctxDot = null;
    var componentFocusSet = null;
    var neighborMap = {};
    var activeNodes = [];
    var activeLinks = [];
    var frozenLayout = false;
    var dragActive = false;
    var dragNodeId = null;
    var pendingFlowUpdate = false;
    var lastActiveNoteIds = new Set();
    var softPinRadius = 140;
    if (data.meta && data.meta.soft_pin_radius !== undefined) {
      var sp = parseFloat(data.meta.soft_pin_radius);
      if (!isNaN(sp)) softPinRadius = sp;
    }
    var releaseTimer = null;
    var graphReady = true;
    var debugEnabled = !!(data.meta && data.meta.debug_enabled);
    var debugLinkDistEl = null;
    var debugLinkLabels = {
      enabled: debugEnabled,
      mode: "cluster", // "cluster" | "all" | "dragged"
    };
    var debugClusterCache = { id: null, version: -1, set: null };
    var activeLinksVersion = 0;

    function ensureDebugLinkDistEl() {
      if (!debugEnabled) return null;
      if (debugLinkDistEl) return debugLinkDistEl;
      var el = document.createElement("div");
      el.id = "debug-linkdist";
      el.style.position = "fixed";
      el.style.right = "12px";
      el.style.top = "56px";
      el.style.zIndex = "9999";
      el.style.padding = "6px 8px";
      el.style.background = "rgba(0,0,0,0.65)";
      el.style.border = "1px solid rgba(255,255,255,0.15)";
      el.style.borderRadius = "6px";
      el.style.color = "#e5e7eb";
      el.style.fontSize = "12px";
      el.style.fontFamily = "Segoe UI, Arial, sans-serif";
      el.style.whiteSpace = "pre";
      el.style.pointerEvents = "none";
      el.style.display = "none";
      document.body.appendChild(el);
      debugLinkDistEl = el;
      return el;
    }

    function hideDebugLinkDist() {
      if (!debugEnabled) return;
      if (debugLinkDistEl) debugLinkDistEl.style.display = "none";
    }

    function updateDebugLinkDist(node) {
      if (!debugEnabled) return;
      if (!node || !activeLinks || !activeLinks.length) {
        hideDebugLinkDist();
        return;
      }
      var el = ensureDebugLinkDistEl();
      var id = String(node.id);
      var min = null;
      var max = null;
      var count = 0;
      var over = 0;
      activeLinks.forEach(function (l) {
        if (!l || (l.meta && l.meta.flow_only)) return;
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        var sid = String(s);
        var tid = String(t);
        if (sid !== id && tid !== id) return;
        var otherId = sid === id ? tid : sid;
        var other = nodeById[otherId];
        if (!other) return;
        var dx = (node.x || 0) - (other.x || 0);
        var dy = (node.y || 0) - (other.y || 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (!isFinite(dist)) return;
        count += 1;
        if (min === null || dist < min) min = dist;
        if (max === null || dist > max) max = dist;
        if (dist > softPinRadius) over += 1;
      });
      if (!count) {
        el.textContent = "link dist: no direct links";
        el.style.display = "block";
        return;
      }
      var zoom = 1;
      try {
        if (Graph && typeof Graph.zoom === "function") {
          zoom = Graph.zoom() || 1;
        }
      } catch (_e) {
        zoom = 1;
      }
      var thrPx = softPinRadius * zoom;
      var minPx = min * zoom;
      var maxPx = max * zoom;
      el.textContent =
        "link dist (graph units)\n" +
        "min: " +
        min.toFixed(1) +
        "  max: " +
        max.toFixed(1) +
        "\nthreshold: " +
        softPinRadius.toFixed(1) +
        "  (px≈" +
        thrPx.toFixed(1) +
        ")\n" +
        "min/max px≈ " +
        minPx.toFixed(1) +
        " / " +
        maxPx.toFixed(1) +
        "\nlinks > threshold: " +
        over +
        " / " +
        count;
      el.style.display = "block";
    }

    function linkIds(l) {
      var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
      var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
      return { s: String(s), t: String(t) };
    }

    function isConnected(id) {
      if (!selectedId && !ctxMenuId) return true;
      if (selectedId && id === selectedId) return true;
      if (ctxMenuId && id === ctxMenuId) return true;
      var focus = selectedId || ctxMenuId;
      var set = neighborMap[focus];
      return set && set.has(id);
    }

    function isLinkConnected(l) {
      if (!selectedId && !ctxMenuId) return true;
      var ids = linkIds(l);
      if (selectedId && (ids.s === selectedId || ids.t === selectedId)) return true;
      if (ctxMenuId && (ids.s === ctxMenuId || ids.t === ctxMenuId)) return true;
      return false;
    }

    function applyDim(color, factor) {
      if (!color) return color;
      if (color.startsWith("rgba")) {
        try {
          var parts = color.replace("rgba(", "").replace(")", "").split(",");
          var r = parts[0].trim();
          var g = parts[1].trim();
          var b = parts[2].trim();
          var a = parseFloat(parts[3]);
          return "rgba(" + r + "," + g + "," + b + "," + (a * factor) + ")";
        } catch (_e) {
          return color;
        }
      }
      return colorWithAlpha(color, factor);
    }

    function linkStrokeColor(l) {
      if (l.meta && l.meta.flow_only) {
        return "rgba(0,0,0,0)";
      }
      var c = isKanjiComponent(l) ? componentColor() : layerColor(l.layer, layerColors);
      if (l.layer === "reference" && l.meta && l.meta.manual === false) {
        return colorWithAlpha(c, autoRefOpacity);
      }
      if (isKanjiComponent(l)) {
        return colorWithAlpha(c, kanjiComponentOpacity);
      }
      if (l.meta && l.meta.same_prio) {
        return colorWithAlpha(c, samePrioOpacity);
      }
      if (!isLinkConnected(l)) {
        return applyDim(c, 0.2);
      }
      return c;
    }

    function linkDashStyle(l) {
      var style = isKanjiComponent(l)
        ? kanjiComponentStyle || "solid"
        : layerStyles[l.layer] || "solid";
      if (style === "dashed") return [6, 4];
      if (style === "pointed") return [1, 4];
      return [];
    }

    function isLinkVisibleForPhysics(l) {
      if (!l) return false;
      if (l.meta && l.meta.flow_only) return false;
      if (!isLayerEnabled(l.layer)) return false;
      if (!kanjiComponentsEnabled && isKanjiComponent(l)) return false;
      if (kanjiComponentsEnabled && kanjiComponentFocusOnly && isKanjiComponent(l)) {
        if (!componentFocusSet || componentFocusSet.size === 0) return false;
        var s0 = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t0 = l.target && typeof l.target === "object" ? l.target.id : l.target;
        if (s0 === undefined || s0 === null) s0 = l.a;
        if (t0 === undefined || t0 === null) t0 = l.b;
        if (!componentFocusSet.has(String(s0)) || !componentFocusSet.has(String(t0))) {
          return false;
        }
      }
      return true;
    }

    function getLinkStrength(l) {
      if (!isLinkVisibleForPhysics(l)) return 0;
      if (!l) return physics.link_strength;
      function resolveStrength(raw) {
        if (typeof raw !== "number" || !isFinite(raw)) return null;
        if (raw < 0) return 0;
        return raw;
      }
      if (l.layer === "kanji" && l.meta && l.meta.kind === "component") {
        var k = resolveStrength(linkStrengths.kanji_component);
        if (k !== null) {
          var tuneK = hubLinkTuning(l);
          return tuneK ? k * tuneK.strength : k;
        }
      }
      var v = resolveStrength(linkStrengths[l.layer]);
      var strength = v !== null ? v : physics.link_strength;
      var tune = hubLinkTuning(l);
      if (tune) strength = strength * tune.strength;
      var boost = springBoost();
      if (boost !== 1) strength = strength * boost;
      return strength;
    }

    function linkStrokeWidth(l) {
      if (l && l.meta && l.meta.flow_only) return 0;
      return l && l.layer === "reference" ? 0.8 : 1.2;
    }

    function linkBaseColor(l) {
      if (l && l.meta && l.meta.flow_only) {
        return "rgba(0,0,0,0)";
      }
      var c = isKanjiComponent(l) ? componentColor() : layerColor(l.layer, layerColors);
      if (l.layer === "reference" && l.meta && l.meta.manual === false) {
        return colorWithAlpha(c, autoRefOpacity);
      }
      if (isKanjiComponent(l)) {
        return colorWithAlpha(c, kanjiComponentOpacity);
      }
      if (l.meta && l.meta.same_prio) {
        return colorWithAlpha(c, samePrioOpacity);
      }
      if (!isLinkConnected(l)) {
        return applyDim(c, 0.2);
      }
      return c;
    }

    function linkDashPattern(l) {
      var style = isKanjiComponent(l)
        ? kanjiComponentStyle || "solid"
        : layerStyles[l.layer] || "solid";
      if (style === "dashed") return [2, 1];
      if (style === "pointed") return [0.3, 1];
      return [];
    }

    function particleColor(l) {
      var alpha = 0.7;
      if (l.layer === "reference" && l.meta && l.meta.manual === false) {
        alpha = Math.min(1, alpha * autoRefOpacity);
      }
      if (isKanjiComponent(l)) {
        alpha = Math.min(1, alpha * kanjiComponentOpacity);
      }
      if (l.meta && l.meta.same_prio) {
        alpha = Math.min(1, alpha * samePrioOpacity);
      }
      var baseCol = isKanjiComponent(l)
        ? componentColor()
        : layerColor(l.layer, layerColors);
      return colorWithAlpha(baseCol, alpha);
    }

    function linkCurveValue(l) {
      var c = l && typeof l.curve === "number" ? l.curve : 0;
      if (!c) return 0;
      return c;
    }

    function curveControlPoint(sx, sy, tx, ty, curve) {
      if (!curve) return null;
      var dx = tx - sx;
      var dy = ty - sy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var mx = sx + dx * 0.5;
      var my = sy + dy * 0.5;
      var nx = -dy / len;
      var ny = dx / len;
      var offset = curve * len;
      return { x: mx + nx * offset, y: my + ny * offset };
    }

    function drawLinkPath(ctx, s, t, curve) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      if (!curve) {
        ctx.lineTo(t.x, t.y);
        return;
      }
      var cp = curveControlPoint(s.x, s.y, t.x, t.y, curve);
      var cx = cp ? cp.x : (s.x + t.x) * 0.5;
      var cy = cp ? cp.y : (s.y + t.y) * 0.5;
      ctx.quadraticCurveTo(cx, cy, t.x, t.y);
    }

    function linkLabelPoint(l) {
      var info = linkHubInfo(l);
      var s = info.s;
      var t = info.t;
      if (!s || !t) return null;
      var sx = s.x;
      var sy = s.y;
      var tx = t.x;
      var ty = t.y;
      if (isExpandedHubExternalLink(l)) {
        var pts = manualLinkPoints(l);
        if (pts) {
          sx = pts.sx;
          sy = pts.sy;
          tx = pts.tx;
          ty = pts.ty;
        }
      }
      if (
        typeof sx !== "number" ||
        typeof sy !== "number" ||
        typeof tx !== "number" ||
        typeof ty !== "number"
      ) {
        return null;
      }
      var curve = linkCurveValue(l);
      if (!curve) {
        return { x: (sx + tx) * 0.5, y: (sy + ty) * 0.5 };
      }
      var cp = curveControlPoint(sx, sy, tx, ty, curve);
      if (!cp) {
        return { x: (sx + tx) * 0.5, y: (sy + ty) * 0.5 };
      }
      var tmid = 0.5;
      var inv = 1 - tmid;
      var x = inv * inv * sx + 2 * inv * tmid * cp.x + tmid * tmid * tx;
      var y = inv * inv * sy + 2 * inv * tmid * cp.y + tmid * tmid * ty;
      return { x: x, y: y };
    }

    function getDragClusterSet() {
      if (!dragNodeId) return null;
      if (
        debugClusterCache.id === dragNodeId &&
        debugClusterCache.version === activeLinksVersion &&
        debugClusterCache.set
      ) {
        return debugClusterCache.set;
      }
      var adj = {};
      if (activeLinks && activeLinks.length) {
        activeLinks.forEach(function (l) {
          if (!l || (l.meta && l.meta.flow_only)) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          if (!adj[sk]) adj[sk] = new Set();
          if (!adj[tk]) adj[tk] = new Set();
          adj[sk].add(tk);
          adj[tk].add(sk);
        });
      }
      var seen = new Set();
      var stack = [String(dragNodeId)];
      seen.add(String(dragNodeId));
      while (stack.length) {
        var cur = stack.pop();
        var nbrs = adj[cur];
        if (!nbrs) continue;
        nbrs.forEach(function (nid) {
          if (!seen.has(nid)) {
            seen.add(nid);
            stack.push(nid);
          }
        });
      }
      debugClusterCache = { id: dragNodeId, version: activeLinksVersion, set: seen };
      return seen;
    }

    function drawLinkDistanceLabel(l, ctx, globalScale) {
      if (!debugEnabled) return;
      if (!debugLinkLabels || !debugLinkLabels.enabled) return;
      if (debugLinkLabels.mode === "dragged") {
        if (!dragNodeId) return;
        var s0 = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t0 = l.target && typeof l.target === "object" ? l.target.id : l.target;
        if (String(s0) !== dragNodeId && String(t0) !== dragNodeId) return;
      } else if (debugLinkLabels.mode === "cluster") {
        if (!dragNodeId) return;
        var set = getDragClusterSet();
        if (!set) return;
        var s1 = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t1 = l.target && typeof l.target === "object" ? l.target.id : l.target;
        if (!set.has(String(s1)) || !set.has(String(t1))) return;
      }
      var pt = linkLabelPoint(l);
      if (!pt) return;
      var dist = linkLength(l);
      if (!isFinite(dist)) return;
      var scale = globalScale || 1;
      var fontSize = 10 / scale;
      if (fontSize < 8) fontSize = 8;
      if (fontSize > 28) fontSize = 28;
      ctx.save();
      ctx.font = fontSize + "px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(1, 3 / scale);
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      var text = dist.toFixed(1);
      ctx.strokeText(text, pt.x, pt.y);
      ctx.fillText(text, pt.x, pt.y);
      ctx.restore();
    }

    function isHubMemberOf(node, hubNode) {
      if (!node || !hubNode) return false;
      if (!node.__hub_parent) return false;
      return String(node.__hub_parent) === String(hubNode.id);
    }

    function getLinkDistance(l) {
      var base = physics.link_distance;
      if (!l) return base;
      if (!isLinkVisibleForPhysics(l)) return base;
      var info = linkHubInfo(l);
      var tune = hubLinkTuning(l);
      if (tune) base = base * tune.distance;
      var s = info.s;
      var t = info.t;
      var sHub = s && s.__hub_parent ? String(s.__hub_parent) : "";
      var tHub = t && t.__hub_parent ? String(t.__hub_parent) : "";
      if (sHub && sHub === tHub && expandedHubs.has(sHub)) {
        var hubNode = nodeById[sHub];
        if (hubNode) {
          return Math.min(base, hubExpandedRadius(hubNode));
        }
      }
      var extra = 0;
      if (s && isHubExpanded(s) && !isHubMemberOf(t, s)) {
        extra += hubExpandedRadius(s);
      }
      if (t && isHubExpanded(t) && !isHubMemberOf(s, t)) {
        extra += hubExpandedRadius(t);
      }
      return base + extra;
    }

    function isKanjiComponent(l) {
      if (!l || l.layer !== "kanji") return false;
      var k = l.kind;
      if (l.meta && l.meta.kind) k = l.meta.kind;
      return k === "component";
    }

    function componentColor() {
      return kanjiComponentColor || layerColor("kanji", layerColors);
    }

    function isKanjiNode(node) {
      if (!node) return false;
      if (node.kind && String(node.kind).indexOf("kanji") === 0) return true;
      if (String(node.id || "").indexOf("kanji:") === 0) return true;
      return false;
    }

    function isNoteTypeHub(node) {
      return !!(node && node.kind === "note_type_hub");
    }

    function isHubNode(node) {
      if (!node) return false;
      return node.kind === "family" || node.kind === "note_type_hub" || node.kind === "kanji_hub";
    }

    function hubLinkTuning(l) {
      if (!hubClusterTuning) return null;
      var info = linkHubInfo(l);
      var sHub = isHubNode(info.s);
      var tHub = isHubNode(info.t);
      if (!sHub && !tHub) return null;
      var strength =
        typeof hubClusterTuning.link_strength_mult === "number"
          ? hubClusterTuning.link_strength_mult
          : 1;
      var distance =
        typeof hubClusterTuning.link_distance_mult === "number"
          ? hubClusterTuning.link_distance_mult
          : 1;
      return { strength: strength, distance: distance };
    }

    function clusterRepulsionMult(node) {
      if (!clusterRepulsion || !clusterRepulsion.enabled) return 1;
      var size = node && node.__cluster_size ? node.__cluster_size : 1;
      var ref = clusterRepulsion.size_ref || 1;
      if (size <= ref) return 1;
      var ratio = size / ref;
      var exp = typeof clusterRepulsion.exp === "number" ? clusterRepulsion.exp : 0.7;
      var mult = 1 / Math.pow(ratio, exp);
      var minMult = typeof clusterRepulsion.min_mult === "number" ? clusterRepulsion.min_mult : 0.2;
      if (mult < minMult) mult = minMult;
      return mult;
    }

    function springBoost() {
      if (!springTighten || !springTighten.enabled) return 1;
      var dur = springTighten.duration_ms || 0;
      if (dur <= 0) return springTighten.mult || 1;
      var t = nowMs() - lastReheatAt;
      if (t <= 0) return springTighten.mult || 1;
      if (t >= dur) return 1;
      var base = springTighten.mult || 1;
      var k = 1 - t / dur;
      return 1 + (base - 1) * k;
    }

    function graphViewBounds() {
      if (!Graph || typeof Graph.screen2GraphCoords !== "function") return null;
      var rect = graphEl.getBoundingClientRect();
      var tl = Graph.screen2GraphCoords(0, 0);
      var br = Graph.screen2GraphCoords(rect.width, rect.height);
      var minX = Math.min(tl.x, br.x);
      var maxX = Math.max(tl.x, br.x);
      var minY = Math.min(tl.y, br.y);
      var maxY = Math.max(tl.y, br.y);
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    function nodeInView(node, bounds) {
      if (!node || !bounds) return false;
      var pad = (linkPull && linkPull.view_pad) || 0;
      var z = 1;
      try {
        if (Graph && typeof Graph.zoom === "function") {
          z = Graph.zoom();
        }
      } catch (_e) {
        z = 1;
      }
      if (z && z > 0) pad = pad / z;
      var x = node.x || 0;
      var y = node.y || 0;
      return (
        x >= bounds.minX - pad &&
        x <= bounds.maxX + pad &&
        y >= bounds.minY - pad &&
        y <= bounds.maxY + pad
      );
    }

    function queuePullToAnchor(startId, anchorId, blocked) {
      if (!linkPull || !linkPull.enabled) return;
      var dur = linkPull.duration_ms || 0;
      if (dur <= 0) return;
      var start = String(startId);
      var anchor = String(anchorId);
      var stop = new Set();
      if (blocked && typeof blocked.forEach === "function") {
        blocked.forEach(function (id) {
          stop.add(String(id));
        });
      }
      stop.add(anchor);
      var comp = collectComponent(start, stop);
      if (!comp || !comp.size) return;
      var until = nowMs() + dur;
      comp.forEach(function (nid) {
        var n = nodeById[nid];
        if (!n) return;
        n.__pull_anchor = anchor;
        n.__pull_until = until;
      });
    }

    function hubBaseRadius(node) {
      var base = 3.5;
      var count = node && node.hub_count ? node.hub_count : 1;
      var scale = 1 + Math.min(count, 50) * 0.01;
      return Math.max(base * 1.6 * scale, 6);
    }

    function hubExpandedRadius(node) {
      var count = node && node.hub_count ? node.hub_count : 1;
      var base = hubBaseRadius(node) * 3.0;
      var extra = Math.pow(Math.min(count, 5000), 0.75) * 1.6 * 1.4;
      return Math.max(base + extra, 18);
    }

    function hubPlusRadius(node) {
      return Math.max(2.5, hubBaseRadius(node) * 0.45);
    }

    function isHubExpanded(node) {
      return isNoteTypeHub(node) && expandedHubs.has(String(node.id));
    }

    var hubLocalPhysics = {
      enabled: true,
      damping: 0.86,
      center: 0.02,
      boundary: 0.18,
      sleep_speed: 0.04,
      sleep_frames: 16,
      max_members: 80,
      charge: -1.6,
      min_dist: 6,
      push: 0.22,
      count_falloff: 0.35,
      link_strength: 0.08,
      link_max_strength: 0.18,
    };
    var hubLocalBurst = {
      duration_ms: 2000,
      cooldown_ms: 1200,
      cooldown_damp: 0.7,
    };
    var hubClusterTuning = {
      link_strength_mult: 1.35,
      link_distance_mult: 0.8,
      gravity: 0.02,
      gravity_max_dist: 1200,
      charge_mult: 0.6,
    };
    var clusterRepulsion = {
      enabled: true,
      size_ref: 90,
      min_mult: 0.2,
      exp: 0.7,
    };
    var springTighten = {
      enabled: true,
      duration_ms: 1400,
      mult: 1.4,
    };
    var linkPull = {
      enabled: true,
      duration_ms: 2200,
      strength: 0.08,
      max_speed: 6,
      view_pad: 60,
    };
    var lastReheatAt = 0;
    var hubLocalLastTs = null;
    var dragCollision = {
      enabled: true,
      strength: 0.9,
      pad: 2.0,
      max_checks: 800,
    };
    var dragNonClusterDamp = 0.2;
    var collisionAlways = {
      enabled: true,
      pad: 0.6,
      max_pairs: 0,
    };
    var hubExpandReheat = {
      enabled: true,
      duration: 12400,
      slowdown_ms: 10000,
      slowdown_step: 50,
      slowdown_damp: 0.85,
      slowdown_floor: 0.02,
      max_nodes: 600,
    };
    var hubExpandReheatTimer = null;
    var hubExpandReheatSlowStart = null;
    var hubExpandReheatSlowInterval = null;
    var hubExpandReheatToken = 0;

    function isExpandedHubMemberNode(node) {
      if (!node || !node.__hub_parent) return false;
      return expandedHubs.has(String(node.__hub_parent));
    }

    function nodeSeed(node) {
      if (!node) return 0;
      if (node.__seed !== undefined && node.__seed !== null) return node.__seed;
      var sid = String(node.id || "");
      var h = 0;
      for (var i = 0; i < sid.length; i++) {
        h = (h * 31 + sid.charCodeAt(i)) % 100000;
      }
      node.__seed = h;
      return h;
    }

    function nodeBaseRadius(node) {
      if (!node) return 3.5;
      var deg = node.__deg || 0;
      var scale = 1 + Math.min(deg, 20) * 0.08;
      var baseR = 3.5;
      if (isNoteTypeHub(node)) {
        return isHubExpanded(node) ? hubExpandedRadius(node) : hubBaseRadius(node);
      }
      if (node.kind === "family") return baseR * scale * 0.75;
      return baseR * scale;
    }

    var pulseScale = 1.3;
    var pulseAmp = 0.1;
    function nodePulseRadius(node, nowTs) {
      var radius = nodeBaseRadius(node);
      var t = (nowTs || Date.now()) / 600;
      var seed = nodeSeed(node);
      var pulse = 1 + pulseAmp * Math.sin(t + seed);
      return radius * pulseScale * pulse;
    }

    function nodeMaxPulseRadius(node) {
      var radius = nodeBaseRadius(node);
      return radius * pulseScale * (1 + pulseAmp);
    }

    function nodeCollisionRadius(node, nowTs) {
      if (!node) return 3.5;
      return nodeMaxPulseRadius(node) * 0.8;
    }

    function clampToHub(node, hubNode, maxR) {
      if (!node || !hubNode) return;
      var dx = node.x - hubNode.x;
      var dy = node.y - hubNode.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > maxR) {
        var scale = maxR / dist;
        node.x = hubNode.x + dx * scale;
        node.y = hubNode.y + dy * scale;
        if (node.fx != null) node.fx = node.x;
        if (node.fy != null) node.fy = node.y;
      }
    }

    function applyDragCollision(node) {
      if (!dragCollision.enabled || !frozenLayout) return;
      if (!node || !activeNodes || !activeNodes.length) return;
      var dragHubId = node.__hub_parent ? String(node.__hub_parent) : null;
      var now = Date.now();
      var r1 = nodeCollisionRadius(node, now);
      var maxChecks = dragCollision.max_checks || 0;
      var checks = 0;
      for (var i = 0; i < activeNodes.length; i++) {
        var n = activeNodes[i];
        if (!n || n === node) continue;
        if (isNoteTypeHub(node) && n.__hub_parent && String(n.__hub_parent) === String(node.id)) {
          continue;
        }
        if (node.__hub_parent && String(node.__hub_parent) === String(n.id)) {
          continue;
        }
        if (n.__hub_parent) {
          var nHubId = String(n.__hub_parent);
          if (expandedHubs.has(nHubId) && (!dragHubId || dragHubId !== nHubId)) {
            continue;
          }
        }
        var r2 = nodeCollisionRadius(n, now);
        var minDist = r1 + r2 + dragCollision.pad;
        var dx = n.x - node.x;
        var dy = n.y - node.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 > minDist * minDist) continue;
        if (dist2 < 0.0001) {
          dx = (Math.random() - 0.5) * 0.2;
          dy = (Math.random() - 0.5) * 0.2;
          dist2 = dx * dx + dy * dy;
        }
        var dist = Math.sqrt(dist2) || 1;
        var push = ((minDist - dist) / dist) * dragCollision.strength;
        n.x += dx * push;
        n.y += dy * push;
        if (n.__hub_parent) {
          var hubNode = nodeById[String(n.__hub_parent)];
          if (hubNode && isHubExpanded(hubNode)) {
            clampToHub(n, hubNode, hubExpandedRadius(hubNode) * 0.85);
          }
        }
        if (n.__frozen || n.__soft_pinned || n.fx != null || n.fy != null) {
      n.__frozen = false;
      if (n.__soft_pinned) {
        n.__soft_pinned = false;
        n.__pin_x = null;
        n.__pin_y = null;
      }
      n.fx = null;
      n.fy = null;
    }
        checks += 1;
        if (maxChecks && checks >= maxChecks) break;
      }
    }

    function resolveOverlaps(nowTs) {
      if (!collisionAlways.enabled || !activeNodes || activeNodes.length < 2) return;
      var nodes = activeNodes;
      var now = nowTs || Date.now();
      var maxR = 0;
      nodes.forEach(function (n, idx) {
        if (!n) return;
        n.__collide_id = idx;
        var r = nodeCollisionRadius(n, now) + collisionAlways.pad;
        n.__collide_r = r;
        if (r > maxR) maxR = r;
      });
      var cellSize = Math.max(8, maxR * 2);
      var grid = {};
      nodes.forEach(function (n) {
        if (!n) return;
        var cx = Math.floor((n.x || 0) / cellSize);
        var cy = Math.floor((n.y || 0) / cellSize);
        var key = cx + "," + cy;
        if (!grid[key]) grid[key] = [];
        grid[key].push(n);
      });
      var pairs = 0;
      var maxPairs = collisionAlways.max_pairs || 0;
      function separate(a, b) {
        if (!a || !b) return;
        if (a.__hub_parent && String(a.__hub_parent) === String(b.id)) return;
        if (b.__hub_parent && String(b.__hub_parent) === String(a.id)) return;
        var ax = a.x || 0;
        var ay = a.y || 0;
        var bx = b.x || 0;
        var by = b.y || 0;
        var dx = bx - ax;
        var dy = by - ay;
        var dist2 = dx * dx + dy * dy;
        var ra = a.__collide_r || nodeCollisionRadius(a, now);
        var rb = b.__collide_r || nodeCollisionRadius(b, now);
        var minDist = ra + rb;
        if (dist2 >= minDist * minDist) return;
        if (dist2 < 0.0001) {
          dx = (Math.random() - 0.5) * 0.2;
          dy = (Math.random() - 0.5) * 0.2;
          dist2 = dx * dx + dy * dy;
        }
        var dist = Math.sqrt(dist2) || 1;
        var overlap = (minDist - dist) / dist;
        var moveA = 0.5;
        var moveB = 0.5;
        var aIsHub = isNoteTypeHub(a);
        var bIsHub = isNoteTypeHub(b);
        if (a.__dragging) {
          moveA = 0;
          moveB = 1;
        } else if (b.__dragging) {
          moveA = 1;
          moveB = 0;
        } else if (aIsHub && !bIsHub) {
          moveA = 0;
          moveB = 1;
        } else if (bIsHub && !aIsHub) {
          moveA = 1;
          moveB = 0;
        }
        if (aIsHub && b.__dragging) {
          moveA = 1;
          moveB = 0;
        } else if (bIsHub && a.__dragging) {
          moveA = 0;
          moveB = 1;
        }
        a.x -= dx * overlap * moveA;
        a.y -= dy * overlap * moveA;
        b.x += dx * overlap * moveB;
        b.y += dy * overlap * moveB;
        if (a.__hub_parent) {
          var ha = nodeById[String(a.__hub_parent)];
        if (ha && isHubExpanded(ha)) clampToHub(a, ha, hubExpandedRadius(ha) * 0.85);
        }
        if (b.__hub_parent) {
          var hb = nodeById[String(b.__hub_parent)];
        if (hb && isHubExpanded(hb)) clampToHub(b, hb, hubExpandedRadius(hb) * 0.85);
        }
        if (a.fx != null) a.fx = a.x;
        if (a.fy != null) a.fy = a.y;
        if (b.fx != null) b.fx = b.x;
        if (b.fy != null) b.fy = b.y;
      }
      Object.keys(grid).forEach(function (key) {
        if (maxPairs && pairs >= maxPairs) return;
        var parts = key.split(",");
        var cx = parseInt(parts[0], 10);
        var cy = parseInt(parts[1], 10);
        var cellNodes = grid[key] || [];
        for (var gx = -1; gx <= 1; gx++) {
          for (var gy = -1; gy <= 1; gy++) {
            var nkey = (cx + gx) + "," + (cy + gy);
            var other = grid[nkey];
            if (!other) continue;
            for (var i = 0; i < cellNodes.length; i++) {
              var a = cellNodes[i];
              if (!a) continue;
              for (var j = 0; j < other.length; j++) {
                var b = other[j];
                if (!b || a === b) continue;
                if (a.__collide_id >= b.__collide_id) continue;
                separate(a, b);
                pairs += 1;
                if (maxPairs && pairs >= maxPairs) return;
              }
            }
          }
        }
      });
    }

    function applyHubClusterGravity() {
      if (!hubClusterTuning || !hubClusterTuning.gravity) return;
      if (!activeLinks || !activeLinks.length) return;
      var gravity = hubClusterTuning.gravity;
      var maxDist = hubClusterTuning.gravity_max_dist || 0;
      activeLinks.forEach(function (l) {
        if (!l || (l.meta && l.meta.flow_only)) return;
        var info = linkHubInfo(l);
        var s = info.s;
        var t = info.t;
        if (!s || !t) return;
        if (!isHubNode(s) && !isHubNode(t)) return;
        var dx = (t.x || 0) - (s.x || 0);
        var dy = (t.y || 0) - (s.y || 0);
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (maxDist && dist > maxDist) return;
        var falloff = maxDist ? (1 - dist / maxDist) : 1;
        var pull = gravity * falloff;
        if (!pull) return;
        var ux = dx / dist;
        var uy = dy / dist;
        if (s.fx == null && !s.__dragging) {
          s.vx = (s.vx || 0) + ux * pull;
          s.vy = (s.vy || 0) + uy * pull;
        }
        if (t.fx == null && !t.__dragging) {
          t.vx = (t.vx || 0) - ux * pull;
          t.vy = (t.vy || 0) - uy * pull;
        }
      });
    }

    function applyLinkPulls() {
      if (!linkPull || !linkPull.enabled) return;
      if (!activeNodes || !activeNodes.length) return;
      var now = nowMs();
      var strength = linkPull.strength || 0;
      if (strength <= 0) return;
      var maxSpeed = linkPull.max_speed || 0;
      activeNodes.forEach(function (n) {
        if (!n || !n.__pull_until || now > n.__pull_until) {
          if (n && n.__pull_until && now > n.__pull_until) {
            n.__pull_until = 0;
            n.__pull_anchor = null;
          }
          return;
        }
        if (dragActive) return;
        if (n.__dragging) return;
        if (n.__soft_pinned || n.__frozen || n.fx != null || n.fy != null) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
          n.__frozen = false;
          n.fx = null;
          n.fy = null;
        }
        var anchorId = n.__pull_anchor;
        if (!anchorId) return;
        var anchor = nodeById[String(anchorId)];
        if (!anchor) {
          n.__pull_until = 0;
          n.__pull_anchor = null;
          return;
        }
        var dx = (anchor.x || 0) - (n.x || 0);
        var dy = (anchor.y || 0) - (n.y || 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (!dist) return;
        var k = strength;
        var falloff = Math.min(1, dist / 200);
        k = k * falloff;
        var ux = dx / dist;
        var uy = dy / dist;
        n.vx = (n.vx || 0) + ux * k;
        n.vy = (n.vy || 0) + uy * k;
        if (maxSpeed > 0) {
          var sp = Math.sqrt((n.vx || 0) * (n.vx || 0) + (n.vy || 0) * (n.vy || 0));
          if (sp > maxSpeed) {
            var s = maxSpeed / sp;
            n.vx *= s;
            n.vy *= s;
          }
        }
      });
    }


    function collectConnectedIds(startId) {
      var start = String(startId);
      var visited = new Set();
      var queue = [start];
      while (queue.length) {
        var cur = queue.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        var neigh = neighborMap[cur];
        if (neigh && typeof neigh.forEach === "function") {
          neigh.forEach(function (nid) {
            if (!visited.has(nid)) queue.push(nid);
          });
        }
        if (visited.size > hubExpandReheat.max_nodes) break;
      }
      return visited;
    }

    function pulseConnectedPhysics(startId) {
      if (!hubExpandReheat.enabled) return;
      if (dragActive) return;
      var ids = collectConnectedIds(startId);
      if (!ids || !ids.size) return;
      var released = [];
      ids.forEach(function (id) {
        var n = nodeById[id];
        if (!n) return;
        if (isNoteTypeHub(n)) {
          n.fx = n.x;
          n.fy = n.y;
          return;
        }
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        if (n.__frozen) n.__frozen = false;
        if (!n.__dragging) {
          n.fx = null;
          n.fy = null;
        }
        released.push(n);
      });
      if (typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      hubExpandReheatToken += 1;
      var token = hubExpandReheatToken;
      if (hubExpandReheatTimer) clearTimeout(hubExpandReheatTimer);
      if (hubExpandReheatSlowStart) clearTimeout(hubExpandReheatSlowStart);
      if (hubExpandReheatSlowInterval) clearInterval(hubExpandReheatSlowInterval);
      var duration = Math.max(0, hubExpandReheat.duration || 0);
      var slowMs = Math.max(0, hubExpandReheat.slowdown_ms || 0);
      if (slowMs > duration) slowMs = duration;
      if (slowMs > 0) {
        var slowStart = Math.max(0, duration - slowMs);
        hubExpandReheatSlowStart = setTimeout(function () {
          if (token !== hubExpandReheatToken) return;
          var step = Math.max(16, hubExpandReheat.slowdown_step || 50);
          var damp = hubExpandReheat.slowdown_damp || 0.85;
          var floor = Math.max(0, hubExpandReheat.slowdown_floor || 0);
          var endAt = Date.now() + slowMs;
          hubExpandReheatSlowInterval = setInterval(function () {
            if (token !== hubExpandReheatToken) {
              clearInterval(hubExpandReheatSlowInterval);
              hubExpandReheatSlowInterval = null;
              return;
            }
            var done = Date.now() >= endAt;
            released.forEach(function (n) {
              if (!n || n.__dragging) return;
              if (typeof n.vx === "number") n.vx *= damp;
              if (typeof n.vy === "number") n.vy *= damp;
              if (floor > 0) {
                var vx = typeof n.vx === "number" ? n.vx : 0;
                var vy = typeof n.vy === "number" ? n.vy : 0;
                if (Math.abs(vx) + Math.abs(vy) < floor) {
                  n.vx = 0;
                  n.vy = 0;
                }
              }
            });
            if (done) {
              clearInterval(hubExpandReheatSlowInterval);
              hubExpandReheatSlowInterval = null;
            }
          }, step);
        }, slowStart);
      }
      hubExpandReheatTimer = setTimeout(function () {
        if (token !== hubExpandReheatToken) return;
        released.forEach(function (n) {
          if (!n || n.__dragging) return;
          n.__soft_pinned = true;
          n.__pin_x = n.x;
          n.__pin_y = n.y;
          n.fx = n.x;
          n.fy = n.y;
        });
      }, duration);
    }

    function resetHubMemberPhysics(members) {
      (members || []).forEach(function (n) {
        if (!n) return;
        n.__hub_vx = 0;
        n.__hub_vy = 0;
      });
    }

    function startHubLocalBurst(hubNode) {
      if (!hubNode) return;
      var now = Date.now();
      var dur = Math.max(0, hubLocalBurst.duration_ms || 0);
      var cd = Math.max(0, hubLocalBurst.cooldown_ms || 0);
      hubNode.__hub_local_until = now + dur;
      hubNode.__hub_local_cooldown_until = now + dur + cd;
      hubNode.__hub_sleep = false;
      hubNode.__hub_sleep_frames = 0;
    }

    function wakeHubLocalPhysics(hubNode) {
      if (!hubNode) return;
      hubNode.__hub_sleep = false;
      hubNode.__hub_sleep_frames = 0;
    }

    function stepHubLocalPhysics(nowTs) {
      if (!hubLocalPhysics.enabled || !expandedHubs.size) {
        hubLocalLastTs = nowTs || null;
        return;
      }
      if (dragActive) {
        hubLocalLastTs = nowTs || null;
        return;
      }
      var now = nowTs || Date.now();
      if (!hubLocalLastTs) {
        hubLocalLastTs = now;
        return;
      }
      var dt = (now - hubLocalLastTs) / 1000;
      hubLocalLastTs = now;
      if (!isFinite(dt) || dt <= 0) return;
      if (dt > 0.05) dt = 0.016;

      expandedHubs.forEach(function (hid) {
        var hubNode = nodeById[hid];
        if (!hubNode || !nodeVisible(hubNode)) return;
        var entry = noteTypeHubMembers[hid];
        if (!entry || !entry.nodes) return;
        var nowTsLocal = now;
        var burstUntil = hubNode.__hub_local_until || 0;
        var cooldownUntil = hubNode.__hub_local_cooldown_until || 0;
        var inBurst = burstUntil > nowTsLocal;
        var inCooldown = !inBurst && cooldownUntil > nowTsLocal;
        var allowSleep = !inBurst;
        if (inBurst) {
          hubNode.__hub_sleep = false;
          hubNode.__hub_sleep_frames = 0;
        }
        var members = entry.nodes.filter(function (n) {
          return n && n.__hub_parent === hid && nodeVisible(n);
        });
        var count = members.length;
        if (!count) return;
        var memberMap = {};
        var forceWake = false;
        members.forEach(function (n) {
          if (!n) return;
          memberMap[String(n.id)] = n;
          if (n.__dragging) forceWake = true;
        });
        if (!forceWake && hubNode.__hub_sleep && allowSleep) {
          var maxLenCheck = hubExpandedRadius(hubNode);
          var edgesCheck = entry.edges || [];
          for (var eIdx = 0; eIdx < edgesCheck.length; eIdx++) {
            var lChk = edgesCheck[eIdx];
            if (!lChk || (lChk.meta && lChk.meta.flow_only)) continue;
            var sIdChk = lChk.source && typeof lChk.source === "object" ? lChk.source.id : lChk.source;
            var tIdChk = lChk.target && typeof lChk.target === "object" ? lChk.target.id : lChk.target;
            var aChk = memberMap[String(sIdChk)];
            var bChk = memberMap[String(tIdChk)];
            if (!aChk || !bChk) continue;
            var dxChk = (bChk.x || 0) - (aChk.x || 0);
            var dyChk = (bChk.y || 0) - (aChk.y || 0);
            var distChk = Math.sqrt(dxChk * dxChk + dyChk * dyChk);
            if (distChk > maxLenCheck) {
              forceWake = true;
              break;
            }
          }
        }
        if (forceWake) {
          hubNode.__hub_sleep = false;
          hubNode.__hub_sleep_frames = 0;
        }
        var maxR = hubExpandedRadius(hubNode) * 0.85;
        var maxR2 = maxR * maxR;
        if (hubNode.__hub_sleep && allowSleep) {
          members.forEach(function (n) {
            if (!n || n.__dragging) return;
            clampToHub(n, hubNode, maxR);
            n.fx = n.x;
            n.fy = n.y;
          });
          return;
        }
        if (count > hubLocalPhysics.max_members && !(inBurst || inCooldown)) {
          members.forEach(function (n) {
            if (!n || n.__dragging) return;
            var dx = n.x - hubNode.x;
            var dy = n.y - hubNode.y;
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            clampToHub(n, hubNode, maxR);
            n.fx = n.x;
            n.fy = n.y;
          });
          return;
        }

        var baseCharge = (hubLocalPhysics.charge !== undefined && hubLocalPhysics.charge !== null)
          ? hubLocalPhysics.charge
          : (physics.charge || -80);
        var chargeScale = Math.abs(baseCharge) / 80;
        chargeScale = Math.max(0.2, Math.min(5, chargeScale));
        var repelK = (maxR * maxR) * 0.18 * chargeScale;
        var falloff = hubLocalPhysics.count_falloff || 0.5;
        var repelScale = 1 / Math.max(1, Math.pow(count, falloff));
        var minDist = hubLocalPhysics.min_dist || 4;

        members.forEach(function (n) {
          if (!n || n.__dragging) return;
          if (typeof n.x !== "number") n.x = hubNode.x + (Math.random() - 0.5) * 2;
          if (typeof n.y !== "number") n.y = hubNode.y + (Math.random() - 0.5) * 2;
          if (typeof n.__hub_vx !== "number") n.__hub_vx = 0;
          if (typeof n.__hub_vy !== "number") n.__hub_vy = 0;
          n.__hub_fx = 0;
          n.__hub_fy = 0;
        });

        for (var i = 0; i < count; i++) {
          var a = members[i];
          if (!a || a.__dragging) continue;
          for (var j = i + 1; j < count; j++) {
            var b = members[j];
            if (!b || b.__dragging) continue;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var dist2 = dx * dx + dy * dy + 0.01;
            var dist = Math.sqrt(dist2);
            var force = (repelK * repelScale) / dist2;
            var fx = (dx / dist) * force;
            var fy = (dy / dist) * force;
            a.__hub_fx -= fx;
            a.__hub_fy -= fy;
            b.__hub_fx += fx;
            b.__hub_fy += fy;
            if (dist < minDist) {
              var push = (minDist - dist) * (hubLocalPhysics.push || 0.12);
              var nx = dx / (dist || 1);
              var ny = dy / (dist || 1);
              a.__hub_fx -= nx * push;
              a.__hub_fy -= ny * push;
              b.__hub_fx += nx * push;
              b.__hub_fy += ny * push;
            }
          }
        }

        var edges = entry.edges || [];
        if (edges.length) {
          var maxLen = hubExpandedRadius(hubNode);
          var restLen = Math.min(physics.link_distance, maxLen);
          var linkK = hubLocalPhysics.link_strength || 0.08;
          var maxK = hubLocalPhysics.link_max_strength || 0.18;
          edges.forEach(function (l) {
            if (!l || (l.meta && l.meta.flow_only)) return;
            if (!isLayerEnabled(l.layer)) return;
            if (!kanjiComponentsEnabled && isKanjiComponent(l)) return;
            if (kanjiComponentsEnabled && kanjiComponentFocusOnly && isKanjiComponent(l)) {
              if (!componentFocusSet || componentFocusSet.size === 0) return;
              var s0 = l.source && typeof l.source === "object" ? l.source.id : l.source;
              var t0 = l.target && typeof l.target === "object" ? l.target.id : l.target;
              if (!componentFocusSet.has(String(s0)) || !componentFocusSet.has(String(t0))) {
                return;
              }
            }
            var sId = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var tId = l.target && typeof l.target === "object" ? l.target.id : l.target;
            var a = memberMap[String(sId)];
            var b = memberMap[String(tId)];
            if (!a || !b) return;
            var aDrag = !!a.__dragging;
            var bDrag = !!b.__dragging;
            if (aDrag && bDrag) return;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var dist2 = dx * dx + dy * dy + 0.01;
            var dist = Math.sqrt(dist2);
            var force = 0;
            if (dist > maxLen) {
              force = (dist - maxLen) * maxK;
            } else if (restLen > 0) {
              force = (dist - restLen) * linkK;
            }
            if (!force) return;
            var fx = (dx / dist) * force;
            var fy = (dy / dist) * force;
            if (!aDrag) {
              a.__hub_fx += fx;
              a.__hub_fy += fy;
            }
            if (!bDrag) {
              b.__hub_fx -= fx;
              b.__hub_fy -= fy;
            }
          });
        }

        members.forEach(function (n) {
          if (!n || n.__dragging) return;
          var dx = n.x - hubNode.x;
          var dy = n.y - hubNode.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          n.__hub_fx -= dx * hubLocalPhysics.center;
          n.__hub_fy -= dy * hubLocalPhysics.center;
          if (dist > maxR) {
            var over = dist - maxR;
            var s = (over / dist) * hubLocalPhysics.boundary;
            n.__hub_fx -= dx * s;
            n.__hub_fy -= dy * s;
          }
        });

        var maxSpeed = 0;
        var dead = hubLocalPhysics.sleep_speed || 0;
        if (inBurst) dead = 0;
        members.forEach(function (n) {
          if (!n || n.__dragging) return;
          n.__hub_vx = (n.__hub_vx + n.__hub_fx * dt) * hubLocalPhysics.damping;
          n.__hub_vy = (n.__hub_vy + n.__hub_fy * dt) * hubLocalPhysics.damping;
          if (inCooldown) {
            var cdTotal = Math.max(1, hubLocalBurst.cooldown_ms || 1);
            var cdT = Math.max(0, Math.min(1, (cooldownUntil - nowTsLocal) / cdTotal));
            var cdDamp = hubLocalBurst.cooldown_damp + (1 - hubLocalBurst.cooldown_damp) * cdT;
            n.__hub_vx *= cdDamp;
            n.__hub_vy *= cdDamp;
          }
          var sp = Math.abs(n.__hub_vx) + Math.abs(n.__hub_vy);
          if (dead > 0 && sp < dead) {
            n.__hub_vx = 0;
            n.__hub_vy = 0;
            sp = 0;
          }
          if (sp > maxSpeed) maxSpeed = sp;
          n.x += n.__hub_vx;
          n.y += n.__hub_vy;
          var dx = n.x - hubNode.x;
          var dy = n.y - hubNode.y;
          var dist2 = dx * dx + dy * dy;
          if (dist2 > maxR2) {
            var dist = Math.sqrt(dist2) || 1;
            var scale = maxR / dist;
            n.x = hubNode.x + dx * scale;
            n.y = hubNode.y + dy * scale;
            n.__hub_vx *= 0.5;
            n.__hub_vy *= 0.5;
          }
          n.fx = n.x;
          n.fy = n.y;
        });
        var sleepSpeed = hubLocalPhysics.sleep_speed || 0;
        var sleepFrames = hubLocalPhysics.sleep_frames || 0;
        if (allowSleep && sleepSpeed > 0 && sleepFrames > 0) {
          if (maxSpeed < sleepSpeed) {
            hubNode.__hub_sleep_frames = (hubNode.__hub_sleep_frames || 0) + 1;
          } else {
            hubNode.__hub_sleep_frames = 0;
          }
          if (hubNode.__hub_sleep_frames >= sleepFrames) {
            hubNode.__hub_sleep = true;
            members.forEach(function (n) {
              if (!n) return;
              n.__hub_vx = 0;
              n.__hub_vy = 0;
              n.fx = n.x;
              n.fy = n.y;
            });
          }
        }
      });
    }

    function linkHubInfo(l) {
      var s = l.source && typeof l.source === "object" ? l.source : nodeById[String(l.source)];
      var t = l.target && typeof l.target === "object" ? l.target : nodeById[String(l.target)];
      return { s: s, t: t };
    }

    function linkLength(l) {
      if (!l) return 1;
      var s = l.source;
      var t = l.target;
      if (s && typeof s !== "object") s = nodeById[String(s)];
      if (t && typeof t !== "object") t = nodeById[String(t)];
      var dx = ((s && s.x) || 0) - ((t && t.x) || 0);
      var dy = ((s && s.y) || 0) - ((t && t.y) || 0);
      return Math.sqrt(dx * dx + dy * dy) || 1;
    }

    function isExpandedHubExternalLink(l) {
      if (!l || !expandedHubs.size) return false;
      var info = linkHubInfo(l);
      var s = info.s;
      var t = info.t;
      if (!s || !t) return false;
      if (isNoteTypeHub(s) && isHubExpanded(s) && !isHubMemberOf(t, s)) return true;
      if (isNoteTypeHub(t) && isHubExpanded(t) && !isHubMemberOf(s, t)) return true;
      return false;
    }

    function manualLinkPoints(l) {
      if (!l) return null;
      var info = linkHubInfo(l);
      var s = info.s;
      var t = info.t;
      if (!s || !t) return null;
      if (typeof s.x !== "number" || typeof s.y !== "number") return null;
      if (typeof t.x !== "number" || typeof t.y !== "number") return null;
      var sx = s.x;
      var sy = s.y;
      var tx = t.x;
      var ty = t.y;
      var dx = tx - sx;
      var dy = ty - sy;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / dist;
      var uy = dy / dist;
      if (isNoteTypeHub(s) && isHubExpanded(s) && !isHubMemberOf(t, s)) {
        var rs = hubExpandedRadius(s) || 0;
        sx = s.x + ux * rs;
        sy = s.y + uy * rs;
      }
      if (isNoteTypeHub(t) && isHubExpanded(t) && !isHubMemberOf(s, t)) {
        var rt = hubExpandedRadius(t) || 0;
        tx = t.x - ux * rt;
        ty = t.y - uy * rt;
      }
      return { sx: sx, sy: sy, tx: tx, ty: ty };
    }

    function drawManualHubLink(l, ctx, globalScale) {
      if (!isExpandedHubExternalLink(l)) return;
      if (l.meta && l.meta.flow_only) return;
      var pts = manualLinkPoints(l);
      if (!pts) return;
      var curve = linkCurveValue(l);
      var color = linkBaseColor(l);
      var scale = globalScale || 1;
      var width = linkStrokeWidth(l) / scale;
      if (width <= 0) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      var dash = linkDashPattern(l);
      if (dash && dash.length) ctx.setLineDash(dash);
      drawLinkPath(
        ctx,
        { x: pts.sx, y: pts.sy },
        { x: pts.tx, y: pts.ty },
        curve
      );
      ctx.stroke();
      ctx.restore();

      var len = Math.sqrt(
        (pts.tx - pts.sx) * (pts.tx - pts.sx) + (pts.ty - pts.sy) * (pts.ty - pts.sy)
      ) || 1;
      var count = 0;
      if (isKanjiComponent(l)) {
        if (kanjiComponentFlow) count = Math.max(2, Math.min(10, Math.round(len / 120)));
      } else if (layerFlow[l.layer]) {
        count = Math.max(2, Math.min(10, Math.round(len / 160)));
      }
      if (count > 0) {
        var speed = 0;
        if (isKanjiComponent(l)) {
          speed = kanjiComponentFlow ? (flowSpeed * 2) / Math.max(30, len) : 0;
        } else if (layerFlow[l.layer]) {
          speed = flowSpeed / Math.max(30, len);
        }
        if (speed > 0) {
          var now = (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
          var t = (now * speed * 0.06) % 1;
          var cp = curveControlPoint(pts.sx, pts.sy, pts.tx, pts.ty, curve);
          ctx.save();
          ctx.fillStyle = particleColor(l);
          for (var i = 0; i < count; i++) {
            var p = (t + i / count) % 1;
            var x;
            var y;
            if (cp) {
              var inv = 1 - p;
              x = inv * inv * pts.sx + 2 * inv * p * cp.x + p * p * pts.tx;
              y = inv * inv * pts.sy + 2 * inv * p * cp.y + p * p * pts.ty;
            } else {
              x = pts.sx + (pts.tx - pts.sx) * p;
              y = pts.sy + (pts.ty - pts.sy) * p;
            }
            ctx.beginPath();
            ctx.arc(x, y, 2 / scale, 0, 2 * Math.PI);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    function layoutHubMembers(hubNode, entry, force) {
      if (!hubNode || !entry) return;
      var members = entry.nodes || [];
      if (!members.length) return;
      var spawnR = Math.max(1.5, hubExpandedRadius(hubNode) * 0.08);
      members.forEach(function (n, idx) {
        if (!n) return;
        if (!force && n.__hub_layout && n.__hub_parent === String(hubNode.id)) return;
        var ang = Math.random() * Math.PI * 2;
        var r = Math.random() * spawnR;
        var px = hubNode.x + Math.cos(ang) * r;
        var py = hubNode.y + Math.sin(ang) * r;
        n.x = px;
        n.y = py;
        n.__hub_layout = true;
        n.__hub_parent = String(hubNode.id);
      });
      resetHubMemberPhysics(members);
      wakeHubLocalPhysics(hubNode);
    }

    function toggleHubExpanded(node) {
      if (!isNoteTypeHub(node)) return;
      var id = String(node.id);
      var wasExpanded = expandedHubs.has(id);
      if (wasExpanded) {
        expandedHubs.delete(id);
        showToast("Collapse hub");
      } else {
        expandedHubs.add(id);
        var entry = noteTypeHubMembers[id];
        if (entry && entry.nodes) {
          entry.nodes.forEach(function (n) {
            if (n) n.__hub_layout = false;
          });
          layoutHubMembers(node, entry, true);
        }
        startHubLocalBurst(node);
        showToast("Expand hub");
      }
      wakeHubLocalPhysics(node);
      applyFilters({ reheat: false, toast_visible: true });
      pulseConnectedPhysics(id);
    }

    function isHubToggleClick(node, evt) {
      if (!node || !isNoteTypeHub(node)) return false;
      var pos = eventGraphPos(evt);
      if (!pos) return false;
      var r = hubPlusRadius(node);
      var dx = pos.x - node.x;
      var dy = pos.y - node.y;
      return dx * dx + dy * dy <= r * r;
    }

    function isNoteTypeVisible(n) {
      var ntid =
        n.note_type_id || n.note_type_id === 0 ? String(n.note_type_id) : "";
      if (ntid && visibleNoteTypes.hasOwnProperty(ntid)) {
        return !!visibleNoteTypes[ntid];
      }
      return true;
    }

    function isLayerEnabled(layer) {
      var chk = layerState[layer];
      return !chk || chk.checked;
    }

    var Graph = ForceGraph()(graphEl)
      .graphData({ nodes: [], links: [] })
      .nodeId("id")
      .linkSource("source")
      .linkTarget("target")
      .nodeColor(function (n) {
        return nodeColor(n, noteTypeColors, layerColors);
      })
      .nodeRelSize(3)
      .nodeVal(function (n) {
        var deg = n.__deg || 0;
        return 1 + Math.min(deg, 20) * 0.06;
      })
      .linkColor(function (l) {
        if (isExpandedHubExternalLink(l)) return "rgba(0,0,0,0)";
        return linkBaseColor(l);
      })
      .linkLineDash(function (l) {
        return linkDashPattern(l);
      })
      .linkWidth(function (l) {
        if (isExpandedHubExternalLink(l)) return 0;
        return linkStrokeWidth(l);
      })
      .linkCanvasObjectMode(function (l) {
        return isExpandedHubExternalLink(l) ? "replace" : "after";
      })
      .linkCanvasObject(function (l, ctx, globalScale) {
        drawManualHubLink(l, ctx, globalScale);
        drawLinkDistanceLabel(l, ctx, globalScale);
      })
      .linkDirectionalArrowLength(function (l) {
        var style = layerStyles[l.layer] || "solid";
        return 0;
      })
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalArrowColor(function (l) {
        return layerColor(l.layer, layerColors);
      })
      .autoPauseRedraw(false)
      .linkDirectionalParticles(function (l) {
        if (isExpandedHubExternalLink(l)) return 0;
        if (l && l.__particle_count !== undefined) return l.__particle_count;
        if (isKanjiComponent(l)) {
          if (!kanjiComponentFlow) return 0;
          var len = linkLength(l);
          return Math.max(2, Math.min(10, Math.round(len / 120)));
        }
        if (!layerFlow[l.layer]) return 0;
        var len2 = linkLength(l);
        return Math.max(2, Math.min(10, Math.round(len2 / 160)));
      })
      .linkDirectionalParticleSpeed(function (l) {
        if (l && l.__particle_speed !== undefined) return l.__particle_speed;
        if (isKanjiComponent(l)) {
          if (!kanjiComponentFlow) return 0;
          var len0 = linkLength(l);
          return (flowSpeed * 2) / Math.max(30, len0);
        } else if (!layerFlow[l.layer]) {
          return 0;
        }
        var len = linkLength(l);
        return flowSpeed / Math.max(30, len);
      })
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(function (l) {
        var col = particleColor(l);
        if (!isLinkConnected(l)) {
          if (isKanjiComponent(l) && kanjiComponentFocusOnly && componentFocusSet && componentFocusSet.size) {
            return col;
          }
          return applyDim(col, 0.2);
        }
        return col;
      })
      .cooldownTicks(80)
      .d3VelocityDecay(0.35);

    if (typeof Graph.d3Force === "function") {
      Graph.d3Force("charge").strength(-80);
    } else {
      log("d3Force unavailable");
    }

    Graph.onNodeDragEnd(function (node) {
      node.fx = node.x;
      node.fy = node.y;
      node.__dragging = false;
      dragNodeId = null;
      hideDebugLinkDist();
      if (node && node.__hub_parent) {
        node.__hub_vx = 0;
        node.__hub_vy = 0;
        var hubNode = nodeById[String(node.__hub_parent)];
        wakeHubLocalPhysics(hubNode);
      }
      node.__soft_pinned = true;
      node.__pin_x = node.x;
      node.__pin_y = node.y;
      var movedThreshold = 1.0;
      if (activeNodes && activeNodes.length) {
        activeNodes.forEach(function (n) {
          if (!n || n === node) return;
          var moved = false;
          if (n.__soft_pinned && typeof n.__pin_x === "number" && typeof n.__pin_y === "number") {
            var dxp = (n.x || 0) - n.__pin_x;
            var dyp = (n.y || 0) - n.__pin_y;
            if (dxp * dxp + dyp * dyp > movedThreshold * movedThreshold) moved = true;
          }
          if ((n.__frozen || n.fx != null || n.fy != null) && typeof n.fx === "number" && typeof n.fy === "number") {
            var dxf = (n.x || 0) - n.fx;
            var dyf = (n.y || 0) - n.fy;
            if (dxf * dxf + dyf * dyf > movedThreshold * movedThreshold) moved = true;
          }
          if (moved) {
            n.__soft_pinned = false;
            n.__pin_x = null;
            n.__pin_y = null;
            n.__frozen = false;
            n.fx = null;
            n.fy = null;
          }
        });
        // sync remaining soft pins to their new positions to avoid snapping back
        activeNodes.forEach(function (n) {
          if (!n) return;
          if (n.__soft_pinned) {
            n.__pin_x = n.x;
            n.__pin_y = n.y;
            if (n.fx === undefined || n.fx === null) {
              n.fx = n.x;
              n.fy = n.y;
            }
          }
        });
      }
      dragActive = false;
      if (typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      scheduleFlowUpdate();
    });
    if (typeof Graph.onNodeDragStart === "function") {
      Graph.onNodeDragStart(function (node) {
        dragActive = true;
      if (node) {
        node.__dragging = true;
        node.fx = node.x;
        node.fy = node.y;
        dragNodeId = String(node.id);
        updateDebugLinkDist(node);
        if (node.__hub_parent) {
          var hubNode = nodeById[String(node.__hub_parent)];
          wakeHubLocalPhysics(hubNode);
        }
        if (isNoteTypeHub(node) && isHubExpanded(node)) {
          node.__drag_last_x = node.x;
          node.__drag_last_y = node.y;
        }
        }
        unfreezeForDrag(node);
      });
    }
    if (typeof Graph.onNodeDrag === "function") {
      Graph.onNodeDrag(function (node) {
        if (!dragActive) {
          dragActive = true;
        }
        if (node) {
          node.__dragging = true;
          node.fx = node.x;
          node.fy = node.y;
          if (!dragNodeId) dragNodeId = String(node.id);
          updateDebugLinkDist(node);
          if (isNoteTypeHub(node) && isHubExpanded(node)) {
            var lastX = node.__drag_last_x;
            var lastY = node.__drag_last_y;
            if (typeof lastX === "number" && typeof lastY === "number") {
              var dx = node.x - lastX;
              var dy = node.y - lastY;
              node.__drag_last_x = node.x;
              node.__drag_last_y = node.y;
              var entry = noteTypeHubMembers[String(node.id)];
              if (entry && entry.nodes) {
                entry.nodes.forEach(function (m) {
                  if (!m) return;
                  m.x = (m.x || 0) + dx;
                  m.y = (m.y || 0) + dy;
                  if (m.fx != null) m.fx = m.x;
                  if (m.fy != null) m.fy = m.y;
                });
              }
            }
          } else if (node.__hub_parent) {
            var hubNode = nodeById[String(node.__hub_parent)];
            if (hubNode && isHubExpanded(hubNode)) {
              clampToHub(node, hubNode, hubExpandedRadius(hubNode) * 0.85);
            }
          }
        }
        applyDragCollision(node);
        unfreezeForDrag(node);
        // keep soft-pin anchors synced during drag to avoid snapping back
        if (activeNodes && activeNodes.length) {
          activeNodes.forEach(function (n) {
            if (!n || !n.__soft_pinned) return;
            n.__pin_x = n.x;
            n.__pin_y = n.y;
            if (n.fx != null || n.fy != null) {
              n.fx = n.x;
              n.fy = n.y;
            }
          });
        }
      });
    }
    if (typeof Graph.onEngineTick === "function") {
      Graph.onEngineTick(function () {
        if (dragActive && dragNodeId && activeNodes && activeNodes.length) {
          var set = getDragClusterSet();
          if (set && set.size) {
            activeNodes.forEach(function (n) {
              if (!n) return;
              if (set.has(String(n.id))) return;
              if (typeof n.vx === "number") n.vx *= dragNonClusterDamp;
              if (typeof n.vy === "number") n.vy *= dragNonClusterDamp;
            });
          }
        }
        if (!expandedHubs.size) return;
        expandedHubs.forEach(function (hid) {
          var hubNode = nodeById[hid];
          if (!hubNode) return;
          var entry = noteTypeHubMembers[hid];
          if (!entry || !entry.nodes) return;
          var maxR = hubExpandedRadius(hubNode) * 0.85;
          entry.nodes.forEach(function (n) {
            if (!n || n.__hub_parent !== hid) return;
            clampToHub(n, hubNode, maxR);
          });
        });
      });
    }
    function showCardPopup(node) {
      var cards = node && Array.isArray(node.cards) ? node.cards : [];
      if (cards.length <= 12) return;
      var overlay = document.getElementById("card-popup");
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = document.createElement("div");
      overlay.id = "card-popup";
      var dialog = document.createElement("div");
      dialog.className = "dialog";
      var heading = document.createElement("div");
      heading.className = "title";
      heading.textContent = "Cards (" + cards.length + ")";
      var list = document.createElement("div");
      list.className = "list";
      var extra = cards.slice(11);
      extra.forEach(function (card) {
        var row = document.createElement("div");
        row.className = "row";
        var badge = document.createElement("span");
        badge.className = "badge";
        var col = mixWithWhite(nodeColor(node, noteTypeColors, layerColors), 0.2);
        if (card.status === "suspended") {
          col = cardDotColors.suspended || "#ef4444";
        } else if (card.status === "buried") {
          col = cardDotColors.buried || "#f59e0b";
        }
        badge.style.background = col;
        var label = document.createElement("span");
        var name = cardName(node, card);
        var status = card.status || "normal";
        var stab = formatStability(card.stability).replace("stability: ", "");
        label.textContent = name + " - " + status + " - " + stab;
        row.appendChild(badge);
        row.appendChild(label);
        list.appendChild(row);
      });
      var btnRow = document.createElement("div");
      btnRow.className = "btn-row";
      var closeBtn = document.createElement("button");
      closeBtn.className = "btn primary";
      closeBtn.textContent = "Close";
      btnRow.appendChild(closeBtn);
      dialog.appendChild(heading);
      dialog.appendChild(list);
      dialog.appendChild(btnRow);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      function close() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      closeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        close();
      });
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
    }

    function eventGraphPos(evt) {
      if (!Graph || typeof Graph.screen2GraphCoords !== "function" || !evt) return null;
      var rect = graphEl.getBoundingClientRect();
      var x = evt.clientX - rect.left;
      var y = evt.clientY - rect.top;
      return Graph.screen2GraphCoords(x, y);
    }

    function isCardPlusClick(node, evt) {
      if (!node || !node.__card_plus || !evt || !Graph) return false;
      var pos = eventGraphPos(evt);
      if (!pos) return false;
      var dx = pos.x - node.__card_plus.x;
      var dy = pos.y - node.__card_plus.y;
      var r = node.__card_plus.r || 0;
      return dx * dx + dy * dy <= r * r;
    }

    function getCardDotClick(node, evt) {
      if (!node || !node.__card_dots || !node.__card_dots.length) return null;
      if (!evt || !Graph) return null;
      var z = 1;
      try {
        if (Graph && typeof Graph.zoom === "function") {
          z = Graph.zoom();
        }
      } catch (_e) {
        z = 1;
      }
      if (z < cardDotsMinZoom) return null;
      var pos = eventGraphPos(evt);
      if (!pos) return null;
      for (var i = 0; i < node.__card_dots.length; i++) {
        var d = node.__card_dots[i];
        if (!d || !d.card) continue;
        var dx = pos.x - d.x;
        var dy = pos.y - d.y;
        var r = d.r || 0;
        if (dx * dx + dy * dy <= r * r) {
          return d.card;
        }
      }
      return null;
    }

    Graph.onNodeClick(function (node, evt) {
      if (node && isNoteTypeHub(node) && isHubToggleClick(node, evt)) {
        toggleHubExpanded(node);
        return;
      }
      if (node && cardDotsEnabled) {
        if (isCardPlusClick(node, evt)) {
          showCardPopup(node);
          return;
        }
      }
      selectedId = node ? String(node.id) : null;
      refreshSelection();
    });
    if (typeof Graph.onBackgroundClick === "function") {
      Graph.onBackgroundClick(function () {
        if (selectedId) {
          selectedId = null;
          refreshSelection();
        }
      });
    }

    var tooltip = document.getElementById("tooltip");
    var hoverNode = null;
    var dotTooltipActive = false;
    var hoverDot = null;

    function renderNodeTooltip(node) {
      if (!tooltip) return;
      if (node) {
        tooltip.style.display = "block";
        var lines = [];
        lines.push(node.label || node.id);
        if (node.note_type) lines.push(node.note_type);
        if (node.prio !== undefined) lines.push("prio: " + node.prio);
        if (Array.isArray(node.extra)) {
          node.extra.forEach(function (entry) {
            if (!entry || !entry.name) return;
            var val = entry.value || "";
            if (val) {
              lines.push(entry.name + ": " + val);
            }
          });
        }
        tooltip.innerText = lines.join("\n");
      } else {
        tooltip.style.display = "none";
      }
    }

    function cardName(node, card) {
      var ntid =
        node && (node.note_type_id || node.note_type_id === 0)
          ? String(node.note_type_id)
          : "";
      var tmpls = ntid && noteTypeTemplates[ntid] ? noteTypeTemplates[ntid] : [];
      var ord = card && card.ord !== undefined ? card.ord : 0;
      var name = tmpls[ord];
      if (!name) name = "Card " + (ord + 1);
      return name;
    }

    function formatStability(value) {
      if (value === null || value === undefined || value === "") return "stability: —";
      var num = parseFloat(value);
      if (!isFinite(num)) return "stability: —";
      return "stability: " + num.toFixed(2);
    }

    function renderDotTooltip(node, card) {
      if (!tooltip) return;
      tooltip.style.display = "block";
      tooltip.innerText = cardName(node, card) + "\n" + formatStability(card.stability);
    }

    Graph.onNodeHover(function (node) {
      hoverNode = node || null;
      if (dotTooltipActive) {
        if (!node) {
          dotTooltipActive = false;
          renderNodeTooltip(null);
        }
        return;
      }
      renderNodeTooltip(node);
    });

    Graph.nodeRelSize(3);
    Graph.nodeCanvasObject(function (node, ctx) {
      var nodeId = String(node.id);
      var isActiveNode = selectedId && nodeId === selectedId;
      var isCtxNode = ctxMenuId && nodeId === ctxMenuId;
      var connected = isConnected(nodeId);
      var isNtHub = isNoteTypeHub(node);
      var hubExpanded = isHubExpanded(node);
      var showPulse = (node.kind === "family" || isNtHub)
        ? (isActiveNode || isCtxNode)
        : (connected || isActiveNode || isCtxNode);
      var color = nodeColor(node, noteTypeColors, layerColors);
      var radius = nodeBaseRadius(node);
      var t = Date.now() / 600;
      var seed = nodeSeed(node);
      var pulse = showPulse ? 1 + 0.1 * Math.sin(t + seed) : 1;
      var haloR = radius * 1.3 * pulse;
      var alpha = (connected || showPulse) ? 1 : 0.2;
      if (showPulse) {
        ctx.save();
        if (node.kind === "family" || isNtHub) {
          ctx.globalCompositeOperation = "destination-over";
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, 2 * Math.PI);
        ctx.fillStyle = colorWithAlpha(color, 0.5 * alpha);
        ctx.fill();
        ctx.lineWidth = 0.25;
        ctx.strokeStyle = colorWithAlpha(color, 0.75 * alpha);
        ctx.stroke();
        if (node.kind === "family" && !isCtxNode && !isActiveNode) {
          var hubOuterR = haloR + 2.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, hubOuterR, 0, 2 * Math.PI);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = colorWithAlpha(color, 0.75 * alpha);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (!(isNtHub && hubExpanded)) {
        // mask link lines under the node so they stop at the inner circle
        ctx.beginPath();
        var maskR = radius + (node.kind === "family" ? 0.2 : 0.6);
        ctx.arc(node.x, node.y, maskR, 0, 2 * Math.PI);
        ctx.fillStyle = "#0f1216";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = (connected || showPulse) ? color : applyDim(color, 0.2);
        ctx.fill();
        if (node.kind === "family") {
          var count = node.__hub_count || 0;
          if (count > 0) {
            ctx.save();
            ctx.fillStyle = "#f3f4f6";
            ctx.font = Math.max(5, radius * 0.2625) + "px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(count), node.x, node.y + radius * 0.08);
            ctx.restore();
          }
        }
        if (isNtHub && !hubExpanded) {
          var pr = hubPlusRadius(node) * 0.7;
          ctx.save();
          ctx.strokeStyle = colorWithAlpha(mixWithWhite(color, 0.2), 0.9);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(node.x - pr, node.y);
          ctx.lineTo(node.x + pr, node.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(node.x, node.y - pr);
          ctx.lineTo(node.x, node.y + pr);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = colorWithAlpha(color, 0.85);
        ctx.stroke();
        // minus sign for expanded hub
        var mr = hubPlusRadius(node);
        ctx.save();
        ctx.strokeStyle = colorWithAlpha(color, 0.9);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(node.x - mr, node.y);
        ctx.lineTo(node.x + mr, node.y);
        ctx.stroke();
        ctx.restore();
      }
      if (isActiveNode || isCtxNode) {
        var ringPad = isCtxNode ? (1.6 * 0.3) : (1.6 * 0.7);
        var ringR = haloR + ringPad;
        ctx.save();
        ctx.lineWidth = isCtxNode ? 0.3 : 0.6;
        ctx.strokeStyle = isCtxNode
          ? "rgba(239,68,68,0.9)"
          : colorWithAlpha(color, 0.9);
        ctx.beginPath();
        ctx.arc(node.x, node.y, ringR, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }
        var zoomLevel = 1;
        try {
          if (Graph && typeof Graph.zoom === "function") {
            zoomLevel = Graph.zoom();
          }
        } catch (_e) {
          zoomLevel = 1;
        }
        if (
          cardDotsEnabled &&
          zoomLevel >= cardDotsMinZoom &&
          node.kind === "note" &&
          Array.isArray(node.cards) &&
          node.cards.length
        ) {
          var cards = node.cards;
          var total = cards.length;
          var maxDots = 12;
          var slots = maxDots;
          var showPlus = total > maxDots;
          var dotCount = showPlus ? maxDots - 1 : total;
          var dotR = Math.max(0.6, radius * 0.144);
          var ringR = Math.max(radius - dotR * 1.4, radius * 0.6);
          var startAngle = Math.PI;
          var step = (Math.PI * 2) / Math.max(slots, 1);
          var baseDotColor = mixWithWhite(color, 0.2);
          var dotAlpha = (connected || showPulse) ? 1 : 0.2;
          var dotList = [];
          for (var i = 0; i < dotCount; i++) {
            var card = cards[i] || {};
            var ccol = baseDotColor;
            if (card.status === "suspended") {
              ccol = cardDotColors.suspended || "#ef4444";
            } else if (card.status === "buried") {
              ccol = cardDotColors.buried || "#f59e0b";
            }
            var angle = startAngle + step * i;
            var dx = Math.cos(angle) * ringR;
            var dy = Math.sin(angle) * ringR;
            var px = node.x + dx;
            var py = node.y + dy;
            dotList.push({ x: px, y: py, r: dotR * 1.4, card: card });
            ctx.beginPath();
            var isHover =
              hoverDot &&
              hoverDot.nodeId === String(node.id) &&
              hoverDot.cardId === (card && card.id ? card.id : null);
            var drawR = dotR * (isHover ? 1.05 : 1);
            ctx.arc(px, py, drawR, 0, 2 * Math.PI);
            ctx.fillStyle = (connected || showPulse) ? ccol : applyDim(ccol, dotAlpha);
            ctx.fill();
            if (
              ctxDot &&
              ctxDot.nodeId === String(node.id) &&
              ctxDot.cardId === (card && card.id ? card.id : null)
            ) {
              ctx.beginPath();
              ctx.arc(px, py, drawR * 1.35, 0, 2 * Math.PI);
              ctx.lineWidth = 0.225;
              ctx.strokeStyle = "rgba(239,68,68,0.9)";
              ctx.stroke();
            }
          }
          if (showPlus) {
            var pAngle = startAngle + step * (maxDots - 1);
            var px = node.x + Math.cos(pAngle) * ringR;
            var py = node.y + Math.sin(pAngle) * ringR;
            node.__card_plus = { x: px, y: py, r: dotR * 1.6 };
            ctx.beginPath();
            ctx.arc(px, py, dotR, 0, 2 * Math.PI);
            ctx.fillStyle = (connected || showPulse)
              ? baseDotColor
              : applyDim(baseDotColor, dotAlpha);
            ctx.fill();
            ctx.save();
            ctx.fillStyle = (connected || showPulse)
              ? "#0f1216"
              : applyDim("#0f1216", dotAlpha);
            ctx.font = Math.max(4, dotR * 2.2) + "px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+", px, py + dotR * 0.05);
            ctx.restore();
          } else {
            node.__card_plus = null;
          }
          node.__card_dots = dotList;
        } else {
          node.__card_dots = null;
          node.__card_plus = null;
        }
      }).nodeCanvasObjectMode(function () {
        return "replace";
      });
    if (typeof Graph.nodePointerAreaPaint === "function") {
      Graph.nodePointerAreaPaint(function (node, color, ctx) {
        var radius = nodeBaseRadius(node);
        var r = radius + 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
        ctx.fill();
      });
    }

    if (typeof Graph.onRenderFramePre === "function") {
      Graph.onRenderFramePre(function () {
        var now = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        stepHubLocalPhysics(now);
        applyHubClusterGravity();
        applyLinkPulls();
        resolveOverlaps(now);
      });
    }

    if (typeof Graph.onRenderFramePost === "function") {
      Graph.onRenderFramePost(function (ctx, globalScale) {
        var data = Graph.graphData();
        if (!data || !data.nodes) return;
        var z = globalScale || 1;
        var cap = 2;
        var base = 6.4;
        var fontSize = (base * Math.min(z, cap)) / z;
        if (z < 1) return;
        ctx.save();
        ctx.font = fontSize + "px Arial";
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        function breakToken(token, maxWidth) {
          var out = [];
          var cur = "";
          for (var i = 0; i < token.length; i++) {
            var ch = token[i];
            var next = cur + ch;
            if (ctx.measureText(next).width <= maxWidth || cur.length === 0) {
              cur = next;
            } else {
              out.push(cur);
              cur = ch;
            }
          }
          if (cur) out.push(cur);
          return out;
        }
        function wrapLabel(text, maxWidth) {
          if (!text) return [];
          var tokens = text.split(/\s+/).filter(function (t) { return t.length; });
          if (!tokens.length) tokens = [text];
          var lines = [];
          var cur = "";
          tokens.forEach(function (token) {
            if (!cur) {
              if (ctx.measureText(token).width <= maxWidth) {
                cur = token;
              } else {
                var parts = breakToken(token, maxWidth);
                if (parts.length) {
                  for (var i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
                  cur = parts[parts.length - 1] || "";
                }
              }
              return;
            }
            var trial = cur + " " + token;
            if (ctx.measureText(trial).width <= maxWidth) {
              cur = trial;
            } else {
              lines.push(cur);
              if (ctx.measureText(token).width <= maxWidth) {
                cur = token;
              } else {
                var parts2 = breakToken(token, maxWidth);
                if (parts2.length) {
                  for (var j = 0; j < parts2.length - 1; j++) lines.push(parts2[j]);
                  cur = parts2[parts2.length - 1] || "";
                }
              }
            }
          });
          if (cur) lines.push(cur);
          return lines;
        }
        var maxLabelWidth = 200 / z;
        var lineHeight = fontSize * 1.2;
        data.nodes.forEach(function (node) {
          var label = node.label || node.id;
          if (!label) return;
          if (isNoteTypeHub(node) && isHubExpanded(node)) return;
          var connected = isConnected(String(node.id));
          var labelColor = connected ? "#e5e7eb" : "rgba(229,231,235,0.2)";
          var radius = nodeBaseRadius(node);
          var pad = 4;
          if (node.__hub_parent) pad = pad * 0.5;
          var offset = radius + pad;
          ctx.fillStyle = labelColor;
          var lines = wrapLabel(label, maxLabelWidth);
          if (!lines.length) return;
          for (var li = 0; li < lines.length; li++) {
            var line = lines[lines.length - 1 - li];
            var y = node.y - offset - li * lineHeight;
            ctx.fillText(line, node.x, y);
          }
        });
        ctx.restore();
        maybeUpdateFlow();
      });
    }

    graphEl.onmousemove = function (e) {
      if (!tooltip) return;
      tooltip.style.left = e.clientX + 12 + "px";
      tooltip.style.top = e.clientY + 12 + "px";
      if (!cardDotsEnabled) {
        if (dotTooltipActive || hoverDot) {
          dotTooltipActive = false;
          hoverDot = null;
          renderNodeTooltip(hoverNode);
          if (Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
        }
        return;
      }
      if (!hoverNode || !hoverNode.__card_dots || !hoverNode.__card_dots.length) {
        if (dotTooltipActive || hoverDot) {
          dotTooltipActive = false;
          hoverDot = null;
          renderNodeTooltip(hoverNode);
          if (Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
        }
        return;
      }
      var z = 1;
      try {
        if (Graph && typeof Graph.zoom === "function") {
          z = Graph.zoom();
        }
      } catch (_e) {
        z = 1;
      }
      if (z < cardDotsMinZoom) {
        if (dotTooltipActive || hoverDot) {
          dotTooltipActive = false;
          hoverDot = null;
          renderNodeTooltip(hoverNode);
          if (Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
        }
        return;
      }
      var pos = eventGraphPos(e);
      if (!pos) return;
      var best = null;
      var bestDist = Infinity;
      hoverNode.__card_dots.forEach(function (d) {
        if (!d || !d.card) return;
        var dx = pos.x - d.x;
        var dy = pos.y - d.y;
        var dist = dx * dx + dy * dy;
        var r = d.r || 0;
        if (dist <= r * r && dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      });
      var nextHover =
        best && best.card
          ? { nodeId: String(hoverNode.id), cardId: best.card.id || null }
          : null;
      var changed =
        (!hoverDot && nextHover) ||
        (hoverDot && !nextHover) ||
        (hoverDot && nextHover && (hoverDot.nodeId !== nextHover.nodeId || hoverDot.cardId !== nextHover.cardId));
      hoverDot = nextHover;
      if (best && best.card) {
        dotTooltipActive = true;
        renderDotTooltip(hoverNode, best.card);
      } else if (dotTooltipActive) {
        dotTooltipActive = false;
        renderNodeTooltip(hoverNode);
      }
      if (changed && Graph && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    };

    function baseCurve(layer) {
      if (layer === "family") return 0.15;
      if (layer === "family_hub") return 0;
      if (layer === "reference") return -0.2;
      if (layer === "example") return 0.1;
      if (layer === "kanji") return -0.1;
      return 0;
    }

    function nodeVisible(n) {
      if (!n) return false;
      if (Array.isArray(n.layers) && n.layers.length) {
        var ok = false;
        n.layers.forEach(function (layer) {
          if (layer === "family_hub") {
            if (isLayerEnabled("family_hub")) ok = true;
          } else if (isLayerEnabled(layer)) {
            ok = true;
          }
        });
        if (!ok) return false;
      }
      if (n.kind === "family" && !isLayerEnabled("family_hub")) return false;
      if ((n.kind === "kanji" || n.kind === "kanji_hub") && !isLayerEnabled("kanji")) return false;
      return isNoteTypeVisible(n);
    }

    function applyFilters(opts) {
      opts = opts || {};
      var componentFocus = null;
      if (kanjiComponentFocusOnly) {
        componentFocus = new Set();
        if (selectedId && nodeById[selectedId] && isKanjiNode(nodeById[selectedId])) {
          var queue = [selectedId];
          componentFocus.add(selectedId);
          while (queue.length) {
            var cur = queue.pop();
            links.forEach(function (l) {
              if (!isKanjiComponent(l)) return;
              var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
              var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
              var sk = String(s);
              var tk = String(t);
              // follow only forward (source -> target) so we don't traverse into
              // other kanji that share the same component
              if (sk === cur && !componentFocus.has(tk)) {
                componentFocus.add(tk);
                queue.push(tk);
              }
            });
          }
        }
      }
        componentFocusSet = componentFocus;
      activeNodes = nodes.filter(function (n) {
        return nodeVisible(n);
      });
      var activeIds = {};
      activeNodes.forEach(function (n) {
        activeIds[String(n.id)] = true;
      });
      activeLinks = links.filter(function (l) {
        if (!isLayerEnabled(l.layer)) return false;
        if (!kanjiComponentsEnabled && isKanjiComponent(l)) return false;
        if (kanjiComponentsEnabled && kanjiComponentFocusOnly && isKanjiComponent(l)) {
          if (!componentFocus || componentFocus.size === 0) return false;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          if (!componentFocus.has(String(s)) || !componentFocus.has(String(t))) {
            return false;
          }
        }
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        return activeIds[String(s)] && activeIds[String(t)];
      });
      if (!showUnlinked) {
        if (!activeLinks.length) {
          activeNodes = [];
        } else {
          var idKind = {};
          activeNodes.forEach(function (n) {
            idKind[String(n.id)] = n.kind || "";
          });
          var linkIds = {};
          activeLinks.forEach(function (l) {
            var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
            var sk = String(s);
            var tk = String(t);
            var kindS = idKind[sk] || "";
            var kindT = idKind[tk] || "";
            if (l.layer === "family_hub" || kindS === "family" || kindT === "family") {
              return;
            }
            linkIds[sk] = true;
            linkIds[tk] = true;
          });
          activeNodes = activeNodes.filter(function (n) {
            return linkIds[String(n.id)];
          });
        }
      }
      if (!showUnlinked && activeNodes.length) {
        var activeIdSet = {};
        activeNodes.forEach(function (n) {
          activeIdSet[String(n.id)] = true;
        });
        var hubsToAdd = {};
        var hubLinks = [];
        activeLinks.forEach(function (l) {
          if (l.layer !== "family_hub") return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          var sActive = !!activeIdSet[sk];
          var tActive = !!activeIdSet[tk];
          if (sActive && !tActive && nodeById[tk] && nodeById[tk].kind === "family") {
            hubsToAdd[tk] = true;
            hubLinks.push(l);
          } else if (tActive && !sActive && nodeById[sk] && nodeById[sk].kind === "family") {
            hubsToAdd[sk] = true;
            hubLinks.push(l);
          }
        });
        Object.keys(hubsToAdd).forEach(function (hid) {
          var n = nodeById[hid];
          if (n) {
            activeNodes.push(n);
            activeIdSet[hid] = true;
          }
        });
        if (hubLinks.length) {
          activeLinks = activeLinks.concat(hubLinks);
        }
      }

      if (expandedHubs.size) {
        var expandedNodes = [];
        var expandedEdges = [];
        var expandedNodeIds = {};
        expandedHubs.forEach(function (hid) {
          var hubNode = nodeById[hid];
          if (!hubNode) return;
          var isActiveHub = false;
          for (var i = 0; i < activeNodes.length; i++) {
            if (String(activeNodes[i].id) === String(hid)) {
              isActiveHub = true;
              break;
            }
          }
          if (!isActiveHub) return;
          var entry = noteTypeHubMembers[hid];
          if (!entry) return;
          layoutHubMembers(hubNode, entry);
          var localSet = {};
          (entry.nodes || []).forEach(function (n) {
            if (!nodeVisible(n)) return;
            var nid = String(n.id);
            if (expandedNodeIds[nid]) return;
            expandedNodeIds[nid] = true;
            localSet[nid] = true;
            expandedNodes.push(n);
          });
          (entry.edges || []).forEach(function (l) {
            if (!isLayerEnabled(l.layer)) return;
            if (!kanjiComponentsEnabled && isKanjiComponent(l)) return;
            if (kanjiComponentsEnabled && kanjiComponentFocusOnly && isKanjiComponent(l)) {
              if (!componentFocus || componentFocus.size === 0) return;
              var s0 = l.source && typeof l.source === "object" ? l.source.id : l.source;
              var t0 = l.target && typeof l.target === "object" ? l.target.id : l.target;
              if (!componentFocus.has(String(s0)) || !componentFocus.has(String(t0))) {
                return;
              }
            }
            var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
            if (!localSet[String(s)] || !localSet[String(t)]) return;
            expandedEdges.push(l);
          });
        });
        if (expandedNodes.length) {
          activeNodes = activeNodes.concat(expandedNodes);
        }
        if (expandedEdges.length) {
          activeLinks = activeLinks.concat(expandedEdges);
        }
      }
      // Ensure links only reference currently active nodes
      var activeIdMapPre = {};
      activeNodes.forEach(function (n) {
        activeIdMapPre[String(n.id)] = true;
      });
      activeLinks = activeLinks.filter(function (l) {
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        return activeIdMapPre[String(s)] && activeIdMapPre[String(t)];
      });
      var hubCounts = {};
      var hubByFid = {};
      activeNodes.forEach(function (n) {
        if (n.kind !== "family") return;
        var fid = n.label || String(n.id).replace("family:", "");
        if (fid) hubByFid[fid] = String(n.id);
      });
      activeNodes.forEach(function (n) {
        if (n.kind === "family") return;
        if (!Array.isArray(n.families)) return;
        n.families.forEach(function (fid) {
          var hid = hubByFid[fid];
          if (hid) hubCounts[hid] = (hubCounts[hid] || 0) + 1;
        });
      });
      var degree = {};
      neighborMap = {};
      activeLinks.forEach(function (l) {
        if (!isLinkVisibleForPhysics(l)) return;
        if (l.layer === "family" && l.meta && l.meta.same_prio) return;
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        var sk = String(s);
        var tk = String(t);
        degree[sk] = (degree[sk] || 0) + 1;
        degree[tk] = (degree[tk] || 0) + 1;
        if (!neighborMap[sk]) neighborMap[sk] = new Set();
        if (!neighborMap[tk]) neighborMap[tk] = new Set();
        neighborMap[sk].add(tk);
        neighborMap[tk].add(sk);
      });
      (function assignClusterSizes() {
        var visited = {};
        activeNodes.forEach(function (n) {
          var id = String(n.id);
          if (visited[id]) return;
          var stack = [id];
          var comp = [];
          visited[id] = true;
          while (stack.length) {
            var cur = stack.pop();
            comp.push(cur);
            var nbrs = neighborMap[cur];
            if (!nbrs) continue;
            nbrs.forEach(function (nid) {
              if (visited[nid]) return;
              visited[nid] = true;
              stack.push(nid);
            });
          }
          var size = comp.length || 1;
          comp.forEach(function (cid) {
            var node = nodeById[cid];
            if (node) node.__cluster_size = size;
          });
        });
      })();
      activeNodes.forEach(function (n) {
        n.__deg = degree[String(n.id)] || 0;
        if (n.kind === "family") {
          n.__hub_count = hubCounts[String(n.id)] || 0;
        }
      });
      var activeIdMap = {};
      activeNodes.forEach(function (n) {
        activeIdMap[String(n.id)] = true;
      });
      if (selectedId && !activeIdMap[selectedId]) {
        selectedId = null;
      }
      var pairMap = {};
      var flowOnly = [];
      activeLinks.forEach(function (l) {
        if (l.meta && l.meta.flow_only) {
          flowOnly.push(l);
          return;
        }
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        var a = String(s);
        var b = String(t);
        var key = a < b ? a + "|" + b : b + "|" + a;
        if (!pairMap[key]) pairMap[key] = [];
        pairMap[key].push(l);
      });
      Object.keys(pairMap).forEach(function (key) {
        var arr = pairMap[key];
        var count = arr.length;
        for (var i = 0; i < count; i++) {
          var base = baseCurve(arr[i].layer);
          var offset = count > 1 ? (i - (count - 1) / 2) * 0.08 : 0;
          arr[i].curve = base + offset;
        }
      });
      var curveDir = {};
      Object.keys(pairMap).forEach(function (key) {
        var arr = pairMap[key];
        arr.forEach(function (l) {
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var dirKey = String(s) + ">" + String(t) + "|" + l.layer;
          curveDir[dirKey] = l.curve || 0;
        });
      });
      flowOnly.forEach(function (l) {
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        var fwdKey = String(s) + ">" + String(t) + "|" + l.layer;
        var revKey = String(t) + ">" + String(s) + "|" + l.layer;
        if (curveDir.hasOwnProperty(revKey)) {
          l.curve = -curveDir[revKey];
        } else if (curveDir.hasOwnProperty(fwdKey)) {
          l.curve = curveDir[fwdKey];
        } else {
          l.curve = 0;
        }
      });
      activeLinksVersion += 1;
      Graph.graphData({ nodes: activeNodes, links: activeLinks });
      scheduleFlowUpdate();
      if (typeof Graph.linkCurvature === "function") {
        Graph.linkCurvature(function (l) {
          return l.curve || 0;
        });
      }
      if (opts.reheat === false) {
        freezeNodes();
      } else {
        unfreezeNodes();
      }
      applyPhysics(opts.reheat);
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      var noteCount = 0;
      var hubCount = 0;
      activeNodes.forEach(function (n) {
        if (n.kind === "family" || n.kind === "kanji_hub") hubCount += 1;
        else noteCount += 1;
      });
      log(
        "filters applied nodes=" +
          activeNodes.length +
          " edges=" +
          activeLinks.length +
          " notes=" +
          noteCount +
          " hubs=" +
          hubCount
      );
      (function logActiveRefs() {
        var m = 0;
        var a = 0;
        activeLinks.forEach(function (l) {
          if (l.layer !== "reference") return;
          if (l.meta && l.meta.manual) m += 1;
          else a += 1;
        });
        log("active refs auto=" + a + " manual=" + m);
      })();
      updateLayerUnderlines();
      if (opts.toast_visible) {
        var currentIds = new Set();
        activeNodes.forEach(function (n) {
          if (n.kind === "family" || n.kind === "kanji_hub") return;
          currentIds.add(String(n.id));
        });
        if (opts.toast_visible === "count") {
          showToast("Visible notes: " + currentIds.size);
          lastActiveNoteIds = currentIds;
        } else {
          var added = 0;
          var removed = 0;
          currentIds.forEach(function (id) {
            if (!lastActiveNoteIds.has(id)) added += 1;
          });
          lastActiveNoteIds.forEach(function (id) {
            if (!currentIds.has(id)) removed += 1;
          });
          lastActiveNoteIds = currentIds;
          if (added || removed) {
            showToast("Visible notes: +" + added + " / -" + removed);
          }
        }
      } else {
        var snapshot = new Set();
        activeNodes.forEach(function (n) {
          if (n.kind === "family" || n.kind === "kanji_hub") return;
          snapshot.add(String(n.id));
        });
        lastActiveNoteIds = snapshot;
      }
    }

    function updateFlowParticles() {
      if (!activeLinks || !activeLinks.length) return;
      activeLinks.forEach(function (l) {
        var enabled = isKanjiComponent(l) ? kanjiComponentFlow : !!layerFlow[l.layer];
        if (!enabled) {
          l.__particle_count = 0;
          l.__particle_speed = 0;
          if (l.__photons) {
            l.__photons.length = 0;
          }
          return;
        }
        var len = linkLength(l);
        var div = isKanjiComponent(l) ? 120 : 160;
        var count = Math.max(2, Math.min(10, Math.round(len / div)));
        l.__particle_count = count;
        var speedBase = isKanjiComponent(l) ? flowSpeed * 2 : flowSpeed;
        l.__particle_speed = speedBase / Math.max(30, len);
        var photons = l.__photons;
        if (!photons) photons = [];
        if (photons.length > count) {
          photons.length = count;
        } else if (photons.length < count) {
          var add = count - photons.length;
          for (var i = 0; i < add; i++) {
            photons.push({});
          }
        }
        l.__photons = photons;
      });
      log("js flow particles updated");
    }

    function scheduleFlowUpdate() {
      pendingFlowUpdate = true;
    }

    function maybeUpdateFlow() {
      if (!pendingFlowUpdate) return;
      if (typeof Graph.isEngineRunning === "function" && Graph.isEngineRunning()) {
        return;
      }
      pendingFlowUpdate = false;
      updateFlowParticles();
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function refreshSelection() {
      if (kanjiComponentFocusOnly) {
        applyFilters({ reheat: false });
      } else if (typeof Graph.resumeAnimation === "function") {
        // Selection should not reheat physics; just ensure a redraw loop is active.
        Graph.resumeAnimation();
      }
    }

    function freezeNodes() {
      frozenLayout = true;
      activeNodes.forEach(function (n) {
        if (n.__soft_pinned) {
          n.__pin_x = n.x;
          n.__pin_y = n.y;
          if (n.fx === undefined || n.fx === null) {
            n.fx = n.x;
            n.fy = n.y;
          }
          return;
        }
        if (n.fx === undefined || n.fx === null) {
          n.__frozen = true;
          n.fx = n.x;
          n.fy = n.y;
        }
      });
    }

    function unfreezeNodes() {
      frozenLayout = false;
      activeNodes.forEach(function (n) {
        if (n.__frozen) {
          n.__frozen = false;
          if (!n.__soft_pinned) {
            n.fx = null;
            n.fy = null;
          }
        }
      });
    }



    function unfreezeForDrag(node) {
      if (!node) return;
      var id = String(node.id);
      var allow = new Set();
      // keep dragged node locked to cursor; do not let forces move it
      if (node.__soft_pinned) {
        node.__soft_pinned = false;
        node.__pin_x = null;
        node.__pin_y = null;
      }
      node.__frozen = false;
      node.fx = node.x;
      node.fy = node.y;

      // release connected nodes only once links stretch beyond threshold
      var release = new Set();
      release.add(id);
      var changed = true;
      var guard = 0;
      while (changed && guard < activeLinks.length + 1) {
        changed = false;
        guard += 1;
        activeLinks.forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          var sRel = release.has(sk);
          var tRel = release.has(tk);
          if (sRel === tRel) return;
          var n1 = nodeById[sk];
          var n2 = nodeById[tk];
          if (!n1 || !n2) return;
          var dx = (n1.x || 0) - (n2.x || 0);
          var dy = (n1.y || 0) - (n2.y || 0);
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > softPinRadius) {
            if (sRel) {
              release.add(tk);
              changed = true;
            } else if (tRel) {
              release.add(sk);
              changed = true;
            }
          }
        });
      }

      var releasedCount = 0;
      release.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        if (rid !== id) {
          n.fx = null;
          n.fy = null;
        }
        releasedCount += 1;
      });

      if (releasedCount > 1 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 1 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function releaseComponentFromSeeds(seeds) {
      if (!seeds || !seeds.length) return;
      if (dragActive) return;
      var release = new Set();
      var queue = [];
      seeds.forEach(function (s) {
        var id = String(s);
        if (!release.has(id)) {
          release.add(id);
          queue.push(id);
        }
      });
      while (queue.length) {
        var cur = queue.pop();
        var nbrs = neighborMap[cur];
        if (!nbrs) continue;
        nbrs.forEach(function (nid) {
          if (release.has(nid)) return;
          release.add(nid);
          queue.push(nid);
        });
      }
      var releasedCount = 0;
      release.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        n.fx = null;
        n.fy = null;
        releasedCount += 1;
      });
      if (releasedCount > 1 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 1 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      if (releaseTimer) {
        clearTimeout(releaseTimer);
      }
      releaseTimer = setTimeout(function () {
        freezeNodes();
      }, 900);
      log("js release component nodes=" + releasedCount);
    }

    function collectComponent(start, blocked) {
      var out = new Set();
      var queue = [start];
      out.add(start);
      while (queue.length) {
        var cur = queue.pop();
        var nbrs = neighborMap[cur];
        if (!nbrs) continue;
        nbrs.forEach(function (nid) {
          if (blocked && blocked.has(nid)) return;
          if (out.has(nid)) return;
          out.add(nid);
          queue.push(nid);
        });
      }
      return out;
    }

    function releaseForNewEdges(edges, anchors, existed) {
      if (!edges || !edges.length) return;
      if (dragActive) return;
      var toRelease = new Set();
      var blocked = anchors || new Set();
      var viewBounds = graphViewBounds();
      var pullQueued = false;
      edges.forEach(function (edge) {
        if (edge && !isLinkVisibleForPhysics(edge)) return;
        var a = String(edge.a);
        var b = String(edge.b);
        var anchor = null;
        var start = null;
        if (blocked.has(a)) {
          anchor = a;
          start = b;
        } else if (blocked.has(b)) {
          anchor = b;
          start = a;
        } else if (existed && existed.has(a) && !existed.has(b)) {
          anchor = a;
          start = b;
        } else if (existed && existed.has(b) && !existed.has(a)) {
          anchor = b;
          start = a;
        } else if (selectedId && (selectedId === a || selectedId === b)) {
          anchor = selectedId;
          start = selectedId === a ? b : a;
        } else {
          // fallback: move both ends
          start = a;
        }
        if (!start) return;
        if (viewBounds && linkPull && linkPull.enabled) {
          var na = nodeById[a];
          var nb = nodeById[b];
          if (na && nb) {
            var aIn = nodeInView(na, viewBounds);
            var bIn = nodeInView(nb, viewBounds);
            if (aIn && !bIn) {
              queuePullToAnchor(b, a, blocked);
              pullQueued = true;
            } else if (bIn && !aIn) {
              queuePullToAnchor(a, b, blocked);
              pullQueued = true;
            }
          }
        }
        var comp = collectComponent(start, blocked);
        comp.forEach(function (nid) {
          if (blocked.has(nid)) return;
          toRelease.add(nid);
        });
      });
      var releasedCount = 0;
      toRelease.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        n.fx = null;
        n.fy = null;
        releasedCount += 1;
      });
      if (releasedCount > 0 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 0 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      if (pullQueued && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (pullQueued && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      if (releaseTimer) {
        clearTimeout(releaseTimer);
      }
      function shouldHold() {
        var now = nowMs();
        var hold = false;
        toRelease.forEach(function (rid) {
          var n0 = nodeById[rid];
          if (n0 && n0.__pull_until && now < n0.__pull_until) {
            hold = true;
          }
        });
        if (hold) return true;
        activeLinks.forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          if (!toRelease.has(sk) && !toRelease.has(tk)) return;
          var n1 = nodeById[sk];
          var n2 = nodeById[tk];
          if (!n1 || !n2) return;
          var dx = (n1.x || 0) - (n2.x || 0);
          var dy = (n1.y || 0) - (n2.y || 0);
          var dist = Math.sqrt(dx * dx + dy * dy);
          var maxLen = getLinkDistance(l);
          if (dist > maxLen) {
            hold = true;
          }
        });
        return hold;
      }
      function freezeWhenReady() {
        if (dragActive) {
          releaseTimer = setTimeout(freezeWhenReady, 200);
          return;
        }
        if (shouldHold()) {
          if (typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
          releaseTimer = setTimeout(freezeWhenReady, 200);
          return;
        }
        freezeNodes();
      }
      releaseTimer = setTimeout(freezeWhenReady, 200);
      log("js release edges=" + edges.length + " nodes=" + releasedCount);
    }

    function bindLayerToggle(layerKey, el) {
      if (!el) return;
      el.addEventListener("change", function () {
        var lbl = this && this.parentNode ? this.parentNode.textContent.trim() : "Layer";
        showToast((this.checked ? "Enabled " : "Disabled ") + lbl);
        storeLayers();
        if (window.pycmd) {
          pycmd("lenabled:" + layerKey + ":" + (this.checked ? "1" : "0"));
        }
        applyFilters({ reheat: true, toast_visible: true });
      });
    }

    for (var k in layerState) {
      if (layerState[k]) {
        bindLayerToggle(k, layerState[k]);
      }
    }

    function storeLayers() {
      var state = {
        family: isLayerEnabled("family"),
        family_hub: isLayerEnabled("family_hub"),
        reference: isLayerEnabled("reference"),
        example: isLayerEnabled("example"),
        kanji: isLayerEnabled("kanji"),
      };
      try {
        localStorage.setItem("ajpc_graph_layers", JSON.stringify(state));
      } catch (_e) {}
    }

    function setupSettingsPanel() {
      var btn = document.getElementById("btn-settings");
      var panel = document.getElementById("settings-panel");
      if (!btn || !panel) return;
      var tabs = panel.querySelectorAll(".settings-tab");
      var panes = panel.querySelectorAll(".settings-pane");
      function setTab(name) {
        tabs.forEach(function (t) {
          t.classList.toggle("active", t.getAttribute("data-tab") === name);
        });
        panes.forEach(function (p) {
          p.classList.toggle("active", p.id === "settings-" + name);
        });
      }
      tabs.forEach(function (t) {
        t.addEventListener("click", function (e) {
          e.stopPropagation();
          setTab(t.getAttribute("data-tab"));
        });
      });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        panel.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (!panel.classList.contains("open")) return;
        if (panel.contains(e.target) || btn.contains(e.target)) return;
        panel.classList.remove("open");
      });
      setTab("notes");
    }

    if (typeof Graph.onEngineStop === "function") {
      Graph.onEngineStop(function () {
        scheduleFlowUpdate();
        maybeUpdateFlow();
      });
    }

    function loadLayers() {
      try {
        var state = null;
        if (layerEnabled && Object.keys(layerEnabled).length) {
          state = layerEnabled;
        } else {
          var raw = localStorage.getItem("ajpc_graph_layers");
          if (raw) state = JSON.parse(raw);
        }
        if (!state) return;
        Object.keys(layerState).forEach(function (k) {
          if (layerState[k] && state.hasOwnProperty(k)) {
            layerState[k].checked = !!state[k];
          }
        });
      } catch (_e) {}
    }

    function updateLayerUnderlines() {
      var labels = document.querySelectorAll("#toolbar label.layer-toggle");
      labels.forEach(function (lbl) {
        var layer = lbl.getAttribute("data-layer");
        var input = lbl.querySelector("input");
        if (input && input.checked) {
          lbl.style.borderBottom =
            "2px solid " + layerColor(layer, layerColors);
          lbl.classList.add("active");
        } else {
          lbl.style.borderBottom = "2px solid transparent";
          lbl.classList.remove("active");
        }
      });
    }

    function setupNoteTypePanel() {
      var list = document.getElementById("note-type-list");
      if (!list) return;
      list.innerHTML = "";
      noteTypeMeta
        .slice()
        .sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name));
        })
        .forEach(function (nt) {
          var group = document.createElement("div");
          group.className = "nt-group";
          var titleRow = document.createElement("div");
          titleRow.className = "nt-row";
          var chk = document.createElement("input");
          chk.type = "checkbox";
          chk.checked = visibleNoteTypes[String(nt.id)] !== false;
          var title = document.createElement("div");
          title.className = "nt-title";
          title.textContent = nt.name;
          titleRow.appendChild(chk);
          titleRow.appendChild(title);
          group.appendChild(titleRow);

          var fieldsWrap = document.createElement("div");
          var hubWrap = document.createElement("div");
          hubWrap.className = "nt-field";
          var hubLabel = document.createElement("label");
          hubLabel.textContent = "Aggregate to hub";
          var hubToggle = document.createElement("input");
          hubToggle.type = "checkbox";
          hubToggle.checked = !!nt.hub;
          hubToggle.addEventListener("change", function () {
            if (window.pycmd) {
              pycmd("nthub:" + nt.id + ":" + (hubToggle.checked ? "1" : "0"));
            }
            showToast("NoteType hub: " + nt.name + " " + (hubToggle.checked ? "On" : "Off"));
          });
          hubWrap.appendChild(hubLabel);
          hubWrap.appendChild(hubToggle);
          fieldsWrap.appendChild(hubWrap);
          var labelFieldWrap = document.createElement("div");
          labelFieldWrap.className = "nt-field";
          var labelFieldLabel = document.createElement("label");
          labelFieldLabel.textContent = "Name";
          var select = document.createElement("select");
          var optAuto = document.createElement("option");
          optAuto.value = "auto";
          optAuto.textContent = "Auto";
          select.appendChild(optAuto);
          (nt.fields || []).forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            select.appendChild(opt);
          });
          select.value = nt.label_field || "auto";
          select.addEventListener("change", function () {
            if (window.pycmd) {
              pycmd("label:" + nt.id + ":" + encodeURIComponent(select.value));
            }
            showToast("Name field: " + nt.name + " -> " + select.value);
          });
          labelFieldWrap.appendChild(labelFieldLabel);
          labelFieldWrap.appendChild(select);
          fieldsWrap.appendChild(labelFieldWrap);

          var linkedFieldWrap = document.createElement("div");
          linkedFieldWrap.className = "nt-field";
          var linkedFieldLabel = document.createElement("label");
          linkedFieldLabel.textContent = "Linked Field";
          var linked = document.createElement("select");
          var optNone = document.createElement("option");
          optNone.value = "none";
          optNone.textContent = "(none)";
          linked.appendChild(optNone);
          (nt.fields || []).forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            linked.appendChild(opt);
          });
          linked.value = nt.linked_field || "none";
          function updateLinkedColor() {
            linked.style.color = linked.value === "none" ? "#9ca3af" : "#e5e7eb";
          }
          linked.addEventListener("change", function () {
            if (window.pycmd) {
              pycmd("lnfield:" + nt.id + ":" + encodeURIComponent(linked.value));
            }
            updateLinkedColor();
            showToast("Linked field: " + nt.name + " -> " + linked.value);
          });
          updateLinkedColor();
          linkedFieldWrap.appendChild(linkedFieldLabel);
          linkedFieldWrap.appendChild(linked);
          fieldsWrap.appendChild(linkedFieldWrap);

          var tooltipWrap = document.createElement("div");
          tooltipWrap.className = "nt-field";
          var tooltipLabel = document.createElement("label");
          tooltipLabel.textContent = "Popup Fields";
          var tooltipDrop = document.createElement("div");
          tooltipDrop.className = "dropdown";
          var tooltipTrigger = document.createElement("div");
          tooltipTrigger.className = "dropdown-trigger";
          var tooltipMenu = document.createElement("div");
          tooltipMenu.className = "dropdown-menu";
          tooltipDrop.appendChild(tooltipTrigger);
          tooltipDrop.appendChild(tooltipMenu);

          var tooltipOpen = false;
          var selectedTooltip = (nt.tooltip_fields || []).slice();
          function renderTooltipMenu() {
            tooltipMenu.innerHTML = "";
            (nt.fields || []).forEach(function (f) {
              var row = document.createElement("div");
              row.className = "dropdown-item";
              var chk = document.createElement("input");
              chk.type = "checkbox";
              chk.checked = selectedTooltip.indexOf(f) >= 0;
              var lbl = document.createElement("span");
              lbl.textContent = f;
              row.appendChild(chk);
              row.appendChild(lbl);
              tooltipMenu.appendChild(row);
            });
          }
          function updateTooltipTrigger() {
            tooltipTrigger.textContent =
              "Fields" +
              (selectedTooltip.length ? " (" + selectedTooltip.length + ")" : "");
          }
          function collectTooltipSelection() {
            var out = [];
            var checks = tooltipMenu.querySelectorAll("input[type=checkbox]");
            checks.forEach(function (c, idx) {
              var f = (nt.fields || [])[idx];
              if (c.checked && f) out.push(f);
            });
            return out;
          }
          function closeTooltip() {
            if (!tooltipOpen) return;
            tooltipOpen = false;
            tooltipDrop.classList.remove("open");
            var vals = collectTooltipSelection();
            var changed =
              vals.length !== selectedTooltip.length ||
              vals.some(function (v) { return selectedTooltip.indexOf(v) < 0; });
            if (changed) {
              selectedTooltip = vals.slice();
              updateTooltipTrigger();
              if (window.pycmd) {
                pycmd(
                  "nttip:" +
                    nt.id +
                    ":" +
                    encodeURIComponent(JSON.stringify(selectedTooltip))
                );
              }
              showToast("Popup fields: " + nt.name + " (" + selectedTooltip.length + ")");
            }
          }
          tooltipTrigger.addEventListener("click", function (e) {
            e.stopPropagation();
            if (tooltipOpen) {
              closeTooltip();
            } else {
              tooltipOpen = true;
              renderTooltipMenu();
              tooltipDrop.classList.add("open");
            }
          });
          document.addEventListener("click", function (e) {
            if (!tooltipOpen) return;
            if (!tooltipDrop.contains(e.target)) {
              closeTooltip();
            }
          });
          updateTooltipTrigger();
          tooltipWrap.appendChild(tooltipLabel);
          tooltipWrap.appendChild(tooltipDrop);
          fieldsWrap.appendChild(tooltipWrap);

          var colorWrap = document.createElement("div");
          colorWrap.className = "nt-field";
          var color = document.createElement("input");
          color.type = "color";
          color.value = noteTypeColors[String(nt.id)] || "#4da3ff";
          color.addEventListener("change", function () {
            noteTypeColors[String(nt.id)] = color.value;
            if (window.pycmd) {
              pycmd(
                "color:" + nt.id + ":" + encodeURIComponent(color.value)
              );
            }
            applyFilters({ reheat: false });
            showToast("Color: " + nt.name);
          });
          colorWrap.appendChild(color);
          fieldsWrap.appendChild(colorWrap);
          group.appendChild(fieldsWrap);
          list.appendChild(group);

          function updateVisibility() {
            fieldsWrap.style.display = chk.checked ? "block" : "none";
          }
          chk.addEventListener("change", function () {
            visibleNoteTypes[String(nt.id)] = !!chk.checked;
            if (window.pycmd) {
              pycmd("ntvis:" + nt.id + ":" + (chk.checked ? "1" : "0"));
            }
            updateVisibility();
            applyFilters({ reheat: false, toast_visible: true });
            showToast((chk.checked ? "Show " : "Hide ") + nt.name);
          });
          updateVisibility();
        });
    }

    function setupCardPanel() {
      var list = document.getElementById("card-settings");
      if (!list) return;
      list.innerHTML = "";
      var group = document.createElement("div");
      group.className = "nt-group";
      var title = document.createElement("div");
      title.className = "nt-title";
      title.textContent = "Card Dots";
      group.appendChild(title);

      var toggleRow = document.createElement("div");
      toggleRow.className = "nt-field";
      var toggleLabel = document.createElement("label");
      toggleLabel.textContent = "Show Card Dots";
      var toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = !!cardDotsEnabled;
      toggle.addEventListener("change", function () {
        cardDotsEnabled = !!toggle.checked;
        if (window.pycmd) {
          pycmd("cdotenabled:" + (cardDotsEnabled ? "1" : "0"));
        }
        if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
        showToast("Card dots: " + (cardDotsEnabled ? "On" : "Off"));
      });
      toggleRow.appendChild(toggleLabel);
      toggleRow.appendChild(toggle);
      group.appendChild(toggleRow);

      function addDotRow(label, key) {
        var row = document.createElement("div");
        row.className = "nt-field";
        var lbl = document.createElement("label");
        lbl.textContent = label;
        var input = document.createElement("input");
        input.type = "color";
        input.value =
          cardDotColors[key] || (key === "buried" ? "#f59e0b" : "#ef4444");
        input.addEventListener("change", function () {
          cardDotColors[key] = input.value;
          if (window.pycmd) {
            pycmd("cdot:" + key + ":" + encodeURIComponent(input.value));
          }
          if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
          showToast(label + " dot color");
        });
        row.appendChild(lbl);
        row.appendChild(input);
        group.appendChild(row);
      }
      addDotRow("Suspended", "suspended");
      addDotRow("Buried", "buried");
      list.appendChild(group);
    }

    function setupLayerPanel() {
      var list = document.getElementById("layer-color-list");
      if (!list) return;
      list.innerHTML = "";

      var softPinRow = document.createElement("div");
      softPinRow.className = "layer-row";
      var softPinLabel = document.createElement("span");
      softPinLabel.textContent = "Soft pin distance";
      softPinLabel.style.flex = "1";
      var softPinRange = document.createElement("input");
      softPinRange.type = "range";
      softPinRange.min = "20";
      softPinRange.max = "600";
      softPinRange.step = "5";
      softPinRange.value = softPinRadius;
      var softPinInput = document.createElement("input");
      softPinInput.type = "number";
      softPinInput.step = "5";
      softPinInput.min = "20";
      softPinInput.max = "600";
      softPinInput.value = softPinRadius;
      var setSoftPin = function (v, notify) {
        if (isNaN(v)) return;
        softPinRadius = v;
        softPinRange.value = v;
        softPinInput.value = v;
        if (window.pycmd) {
          pycmd("softpin:" + softPinRadius);
        }
        if (notify) showToast("Soft pin distance: " + softPinRadius);
      };
      softPinRange.addEventListener("input", function () {
        setSoftPin(parseFloat(softPinRange.value), false);
      });
      softPinInput.addEventListener("change", function () {
        setSoftPin(parseFloat(softPinInput.value), true);
      });
      softPinRow.appendChild(softPinLabel);
      softPinRow.appendChild(softPinRange);
      softPinRow.appendChild(softPinInput);
      list.appendChild(softPinRow);

      var flowRow = document.createElement("div");
      flowRow.className = "layer-row";
      var flowLabel = document.createElement("span");
      flowLabel.textContent = "Flow speed";
      flowLabel.style.flex = "1";
      var flowRange = document.createElement("input");
      flowRange.type = "range";
      flowRange.min = "0";
      flowRange.max = "2";
      flowRange.step = "0.01";
      flowRange.value = flowSpeed;
      var flowInput = document.createElement("input");
      flowInput.type = "number";
      flowInput.step = "0.01";
      flowInput.min = "0";
      flowInput.max = "2";
      flowInput.value = flowSpeed;
      var setFlow = function (v, notify) {
        if (isNaN(v)) return;
        flowSpeed = v;
        flowRange.value = v;
        flowInput.value = v;
        if (window.pycmd) {
          pycmd("lflowspeed:" + flowSpeed);
        }
        applyFilters({ reheat: false });
        if (notify) showToast("Flow speed: " + flowSpeed);
      };
      flowRange.addEventListener("input", function () {
        setFlow(parseFloat(flowRange.value), false);
      });
      flowInput.addEventListener("change", function () {
        setFlow(parseFloat(flowInput.value), true);
      });
      flowRow.appendChild(flowLabel);
      flowRow.appendChild(flowRange);
      flowRow.appendChild(flowInput);
      list.appendChild(flowRow);

      function addGroup(title) {
        var group = document.createElement("div");
        group.className = "nt-group";
        var t = document.createElement("div");
        t.className = "nt-title";
        t.textContent = title;
        group.appendChild(t);
        list.appendChild(group);
        return group;
      }

      function layerRow(group, layer, title) {
        var row = document.createElement("div");
        row.className = "layer-row";
        var label = document.createElement("span");
        label.textContent = title;
        label.style.flex = "1";
        var color = document.createElement("input");
        color.type = "color";
        color.value = layerColor(layer, layerColors);
        color.addEventListener("change", function () {
          layerColors[layer] = color.value;
          if (window.pycmd) {
            pycmd("lcol:" + layer + ":" + encodeURIComponent(color.value));
          }
          applyFilters({ reheat: false });
          showToast("Link color: " + title);
        });
        var style = document.createElement("select");
        ["solid", "dashed", "pointed"].forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          style.appendChild(o);
        });
        style.value = layerStyles[layer] || "solid";
        style.addEventListener("change", function () {
          layerStyles[layer] = style.value;
          if (window.pycmd) {
            pycmd("lstyle:" + layer + ":" + encodeURIComponent(style.value));
          }
          applyFilters({ reheat: false });
          showToast("Link style: " + title);
        });
        var flow = document.createElement("input");
        flow.type = "checkbox";
        flow.checked = !!layerFlow[layer];
        flow.addEventListener("change", function () {
          layerFlow[layer] = !!flow.checked;
          if (window.pycmd) {
            pycmd("lflow:" + layer + ":" + (flow.checked ? "1" : "0"));
          }
          applyFilters({ reheat: false });
          showToast("Flow: " + title + " " + (flow.checked ? "On" : "Off"));
        });
        row.appendChild(label);
        row.appendChild(color);
        row.appendChild(style);
        row.appendChild(flow);
        group.appendChild(row);
        return row;
      }

      function toggleRow(group, labelText, checked, onChange) {
        var row = document.createElement("div");
        row.className = "layer-row-toggle";
        var toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = !!checked;
        toggle.addEventListener("change", function () {
          onChange(!!toggle.checked);
        });
        var label = document.createElement("span");
        label.textContent = labelText;
        row.appendChild(toggle);
        row.appendChild(label);
        group.appendChild(row);
        return { row: row, toggle: toggle };
      }

      var familyGroup = addGroup("Family Gate");
      layerRow(familyGroup, "family", "Family Gate");

      var opRow = document.createElement("div");
      opRow.className = "layer-row";
      var opLabel = document.createElement("span");
      opLabel.textContent = "Same-prio opacity";
      opLabel.style.flex = "1";
      var opRange = document.createElement("input");
      opRange.type = "range";
      opRange.min = "0.1";
      opRange.max = "1";
      opRange.step = "0.05";
      opRange.value = samePrioOpacity;
      var opInput = document.createElement("input");
      opInput.type = "number";
      opInput.min = "0.1";
      opInput.max = "1";
      opInput.step = "0.05";
      opInput.value = samePrioOpacity;
      var setOp = function (v, notify) {
        if (isNaN(v)) return;
        samePrioOpacity = v;
        opRange.value = v;
        opInput.value = v;
        if (window.pycmd) {
          pycmd("fprioop:" + samePrioOpacity);
        }
        applyFilters({ reheat: false });
        if (notify) showToast("Same-prio opacity: " + samePrioOpacity);
      };
      opRange.addEventListener("input", function () {
        setOp(parseFloat(opRange.value), false);
      });
      opInput.addEventListener("change", function () {
        setOp(parseFloat(opInput.value), true);
      });
      opRow.appendChild(opLabel);
      opRow.appendChild(opRange);
      opRow.appendChild(opInput);

      var sameRow = toggleRow(
        familyGroup,
        "Same-priority links",
        samePrioEdges,
        function (val) {
          samePrioEdges = val;
          if (window.pycmd) {
            pycmd("fprio:" + (samePrioEdges ? "1" : "0"));
          }
          opRow.style.display = samePrioEdges ? "flex" : "none";
          showToast("Same-priority links: " + (samePrioEdges ? "On" : "Off"));
        }
      );
      familyGroup.appendChild(opRow);
      opRow.style.display = samePrioEdges ? "flex" : "none";

      var hubGroup = addGroup("Family Hubs");
      layerRow(hubGroup, "family_hub", "Family Hubs");
      toggleRow(hubGroup, "Chain family levels", familyChainEdges, function (val) {
        familyChainEdges = val;
        if (window.pycmd) {
          pycmd("fchain:" + (familyChainEdges ? "1" : "0"));
        }
        showToast("Chain family levels: " + (familyChainEdges ? "On" : "Off"));
      });

      var refGroup = addGroup("Linked Notes");
      layerRow(refGroup, "reference", "Linked Notes");
      var autoRow = document.createElement("div");
      autoRow.className = "layer-row";
      var autoLabel = document.createElement("span");
      autoLabel.textContent = "Auto-link opacity";
      autoLabel.style.flex = "1";
      var autoRange = document.createElement("input");
      autoRange.type = "range";
      autoRange.min = "0.1";
      autoRange.max = "1";
      autoRange.step = "0.05";
      autoRange.value = autoRefOpacity;
      var autoInput = document.createElement("input");
      autoInput.type = "number";
      autoInput.min = "0.1";
      autoInput.max = "1";
      autoInput.step = "0.05";
      autoInput.value = autoRefOpacity;
      var setAuto = function (v, notify) {
        if (isNaN(v)) return;
        autoRefOpacity = v;
        autoRange.value = v;
        autoInput.value = v;
        if (window.pycmd) {
          pycmd("refauto:" + autoRefOpacity);
        }
        applyFilters({ reheat: false });
        if (notify) showToast("Auto-link opacity: " + autoRefOpacity);
      };
      autoRange.addEventListener("input", function () {
        setAuto(parseFloat(autoRange.value), false);
      });
      autoInput.addEventListener("change", function () {
        setAuto(parseFloat(autoInput.value), true);
      });
      autoRow.appendChild(autoLabel);
      autoRow.appendChild(autoRange);
      autoRow.appendChild(autoInput);
      refGroup.appendChild(autoRow);

      var exampleGroup = addGroup("Example Gate");
      layerRow(exampleGroup, "example", "Example Gate");

      var kanjiGroup = addGroup("Kanji Gate");
      layerRow(kanjiGroup, "kanji", "Kanji Gate");

      var compRow = toggleRow(kanjiGroup, "Kanji Parts", kanjiComponentsEnabled, function (val) {
        kanjiComponentsEnabled = val;
        if (window.pycmd) {
          pycmd("kcomp:" + (kanjiComponentsEnabled ? "1" : "0"));
        }
        partsWrap.style.display = kanjiComponentsEnabled ? "block" : "none";
        applyFilters({ reheat: false });
        showToast("Kanji parts: " + (kanjiComponentsEnabled ? "On" : "Off"));
      });

      var partsWrap = document.createElement("div");
      partsWrap.className = "nt-group";
      partsWrap.style.marginLeft = "12px";
      partsWrap.style.paddingLeft = "8px";
      partsWrap.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
      kanjiGroup.appendChild(partsWrap);

      var compColorRow = document.createElement("div");
      compColorRow.className = "layer-row";
      var compColorLabel = document.createElement("span");
      compColorLabel.textContent = "Parts";
      compColorLabel.style.flex = "1";
      var compColor = document.createElement("input");
      compColor.type = "color";
      compColor.value = kanjiComponentColor || layerColor("kanji", layerColors);
      compColor.addEventListener("change", function () {
        kanjiComponentColor = compColor.value;
        if (window.pycmd) {
          pycmd("kcompcol:" + encodeURIComponent(kanjiComponentColor));
        }
        applyFilters({ reheat: false });
        showToast("Parts color updated");
      });
      var compStyle = document.createElement("select");
      ["solid", "dashed", "pointed"].forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        compStyle.appendChild(o);
      });
      compStyle.value = kanjiComponentStyle || "solid";
      compStyle.addEventListener("change", function () {
        kanjiComponentStyle = compStyle.value;
        if (window.pycmd) {
          pycmd("kcompstyle:" + encodeURIComponent(kanjiComponentStyle));
        }
        applyFilters({ reheat: false });
        showToast("Parts style: " + kanjiComponentStyle);
      });
      var compFlowToggle = document.createElement("input");
      compFlowToggle.type = "checkbox";
      compFlowToggle.checked = !!kanjiComponentFlow;
      compFlowToggle.addEventListener("change", function () {
        kanjiComponentFlow = !!compFlowToggle.checked;
        if (window.pycmd) {
          pycmd("kcompflow:" + (kanjiComponentFlow ? "1" : "0"));
        }
        applyFilters({ reheat: false });
        showToast("Parts flow: " + (kanjiComponentFlow ? "On" : "Off"));
      });
      compColorRow.appendChild(compColorLabel);
      compColorRow.appendChild(compColor);
      compColorRow.appendChild(compStyle);
      compColorRow.appendChild(compFlowToggle);
      partsWrap.appendChild(compColorRow);


      var compOpacityRow = document.createElement("div");
      compOpacityRow.className = "layer-row";
      var compOpacityLabel = document.createElement("span");
      compOpacityLabel.textContent = "Parts opacity";
      compOpacityLabel.style.flex = "1";
      var compOpacityRange = document.createElement("input");
      compOpacityRange.type = "range";
      compOpacityRange.min = "0.05";
      compOpacityRange.max = "1";
      compOpacityRange.step = "0.05";
      compOpacityRange.value = kanjiComponentOpacity;
      var compOpacityInput = document.createElement("input");
      compOpacityInput.type = "number";
      compOpacityInput.min = "0.05";
      compOpacityInput.max = "1";
      compOpacityInput.step = "0.05";
      compOpacityInput.value = kanjiComponentOpacity;
      var setCompOpacity = function (v, notify) {
        if (isNaN(v)) return;
        kanjiComponentOpacity = v;
        compOpacityRange.value = v;
        compOpacityInput.value = v;
        if (window.pycmd) {
          pycmd("kcompop:" + kanjiComponentOpacity);
        }
        applyFilters({ reheat: false });
        if (notify) showToast("Parts opacity: " + kanjiComponentOpacity);
      };
      compOpacityRange.addEventListener("input", function () {
        setCompOpacity(parseFloat(compOpacityRange.value), false);
      });
      compOpacityInput.addEventListener("change", function () {
        setCompOpacity(parseFloat(compOpacityInput.value), true);
      });
      compOpacityRow.appendChild(compOpacityLabel);
      compOpacityRow.appendChild(compOpacityRange);
      compOpacityRow.appendChild(compOpacityInput);
      partsWrap.appendChild(compOpacityRow);

      var compFocusRow = document.createElement("div");
      compFocusRow.className = "layer-row-toggle";
      var compFocusToggle = document.createElement("input");
      compFocusToggle.type = "checkbox";
      compFocusToggle.checked = !!kanjiComponentFocusOnly;
      compFocusToggle.addEventListener("change", function () {
        kanjiComponentFocusOnly = !!compFocusToggle.checked;
        if (window.pycmd) {
          pycmd("kcompfocus:" + (kanjiComponentFocusOnly ? "1" : "0"));
        }
        applyFilters({ reheat: false });
        showToast("Parts focus: " + (kanjiComponentFocusOnly ? "On" : "Off"));
      });
      var compFocusLabel = document.createElement("span");
      compFocusLabel.textContent = "Parts only on selection";
      compFocusRow.appendChild(compFocusToggle);
      compFocusRow.appendChild(compFocusLabel);
      partsWrap.appendChild(compFocusRow);

      partsWrap.style.display = kanjiComponentsEnabled ? "block" : "none";
    }

    function setupDeckDropdown() {
      var dropdown = document.getElementById("deck-dropdown");
      var trigger = document.getElementById("deck-trigger");
      var menu = document.getElementById("deck-menu");
      if (!dropdown || !trigger || !menu) return;
      var decks = deckList.slice().sort(function (a, b) {
        return String(a).localeCompare(String(b));
      });
      var open = false;
      function updateTrigger() {
        trigger.textContent =
          "Decks" + (selectedDecks.length ? " (" + selectedDecks.length + ")" : "");
      }
      function sanitizeSelection(sel) {
        var set = new Set(sel);
        var removed = [];
        sel.forEach(function (name) {
          var parts = String(name).split("::");
          while (parts.length > 1) {
            parts.pop();
            var parent = parts.join("::");
            if (set.has(parent)) {
              set.delete(parent);
              removed.push(parent);
            }
          }
        });
        return { selected: Array.from(set), removed: removed };
      }
      function collectSelected() {
        var out = [];
        var checks = menu.querySelectorAll("input[type=checkbox]");
        checks.forEach(function (c, idx) {
          if (c.checked && decks[idx]) out.push(decks[idx]);
        });
        return out;
      }
      function renderMenu() {
        menu.innerHTML = "";
        if (!decks.length) {
          var empty = document.createElement("div");
          empty.className = "dropdown-item";
          empty.textContent = "No decks found.";
          menu.appendChild(empty);
          return;
        }
        decks.forEach(function (name) {
          var row = document.createElement("div");
          row.className = "dropdown-item";
          var chk = document.createElement("input");
          chk.type = "checkbox";
          chk.checked = selectedDecks.indexOf(name) >= 0;
          var label = document.createElement("span");
          label.textContent = name;
          row.appendChild(chk);
          row.appendChild(label);
          menu.appendChild(row);
        });
      }
      function openDropdown() {
        if (open) return;
        open = true;
        renderMenu();
        dropdown.classList.add("open");
      }
      function closeDropdown() {
        if (!open) return;
        open = false;
        dropdown.classList.remove("open");
        var sel = collectSelected();
        var res = sanitizeSelection(sel);
        var changed =
          res.selected.length !== selectedDecks.length ||
          res.selected.some(function (d) { return selectedDecks.indexOf(d) < 0; });
        if (changed || res.removed.length) {
          selectedDecks = res.selected.slice();
          updateTrigger();
          if (res.removed.length) {
            showMsg("Removed parent decks: " + res.removed.join(", "));
            log("deck selection removed parents=" + res.removed.join(","));
          }
          if (window.pycmd) {
            pycmd("decks:" + encodeURIComponent(JSON.stringify(selectedDecks)));
          }
          showToast("Decks selected: " + selectedDecks.length);
        }
      }
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        if (open) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });
      document.addEventListener("click", function (e) {
        if (!open) return;
        if (!dropdown.contains(e.target)) {
          closeDropdown();
        }
      });
      updateTrigger();
    }

    function setupSearch() {
      var input = document.getElementById("note-search");
      var btn = document.getElementById("btn-search");
      var suggest = document.getElementById("search-suggest");
      if (!input || !btn) return;
      var hits = [];
      var selectedHit = null;

      function focusNode(n) {
        if (!n) return;
        var id = String(n.id || n);
        var cur = nodeById[id] || n;
        if (typeof Graph.centerAt === "function") {
          Graph.centerAt(cur.x, cur.y, 800);
        }
        if (typeof Graph.zoom === "function") {
          Graph.zoom(2, 800);
        }
        log("search hit " + id);
        showToast("Focus: " + (cur.label || id));
      }

      function buildHits(q) {
        var lower = (q || "").trim().toLowerCase();
        if (!lower) return [];
        var data = Graph.graphData() || { nodes: [] };
        var nodes = data.nodes || [];
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var label = (n.label || "").toLowerCase();
          if (label.indexOf(lower) >= 0 || String(n.id).indexOf(q) >= 0) {
            out.push(n);
          }
          if (out.length >= 20) break;
        }
        return out;
      }

      function renderSuggest(list) {
        if (!suggest) return;
        suggest.innerHTML = "";
        if (!list || !list.length) {
          suggest.classList.remove("open");
          return;
        }
        list.forEach(function (n) {
          var div = document.createElement("div");
          div.className = "item";
          var title = n.label || String(n.id);
          if (n.note_type) {
            title += " - " + n.note_type;
          }
          div.textContent = title;
          div.addEventListener("click", function () {
            selectedHit = String(n.id);
            suggest.classList.remove("open");
            focusNode(n);
          });
          suggest.appendChild(div);
        });
        suggest.classList.add("open");
      }

      function runSearch() {
        var q = (input.value || "").trim();
        if (!q) return;
        if (selectedHit) {
          focusNode(selectedHit);
          return;
        }
        hits = buildHits(q);
        if (hits.length >= 1) {
          focusNode(hits[0]);
          return;
        }
        if (!hits.length) {
          showMsg("No matching note found.");
          log("search miss " + q);
          renderSuggest([]);
          return;
        }
        renderSuggest(hits);
        showMsg("Select a result from the dropdown.");
      }

      input.addEventListener("input", function () {
        selectedHit = null;
        hits = buildHits(input.value || "");
        renderSuggest(hits);
      });
      input.addEventListener("focus", function () {
        if (hits.length) renderSuggest(hits);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runSearch();
        }
      });
      btn.addEventListener("click", runSearch);
      document.addEventListener("click", function (e) {
        if (!suggest || !suggest.classList.contains("open")) return;
        if (e.target === input || (suggest && suggest.contains(e.target))) return;
        suggest.classList.remove("open");
      });
    }

    function setupUnlinkedToggle() {
      var toggle = document.getElementById("toggle-unlinked");
      if (!toggle) return;
      toggle.checked = !!showUnlinked;
      toggle.addEventListener("change", function () {
        showUnlinked = !!toggle.checked;
        if (window.pycmd) {
          pycmd("showunlinked:" + (showUnlinked ? "1" : "0"));
        }
        applyFilters({ reheat: false, toast_visible: true });
        showToast("Show unlinked: " + (showUnlinked ? "On" : "Off"));
      });
    }

    loadLayers();
    setupNoteTypePanel();
    setupCardPanel();
    setupLayerPanel();
    setupPhysicsPanel();
    setupSettingsPanel();
    setupDeckDropdown();
    setupSearch();
    setupUnlinkedToggle();
    applyFilters({ reheat: true, toast_visible: "count" });

    function loadPhysics() {
      physics = Object.assign({}, physicsDefaults);
      if (data.meta && data.meta.physics && typeof data.meta.physics === "object") {
        physics = Object.assign(physics, data.meta.physics);
      }
    }

    function applyPhysics(reheat) {
      if (!Graph) return;
      if (typeof Graph.linkDistance === "function") {
        Graph.linkDistance(function (l) {
          return getLinkDistance(l);
        });
      }
      if (typeof Graph.linkStrength === "function") {
        Graph.linkStrength(function (l) {
          return getLinkStrength(l);
        });
      }
      if (typeof Graph.d3VelocityDecay === "function") {
        Graph.d3VelocityDecay(physics.velocity_decay);
      }
      if (typeof Graph.d3AlphaDecay === "function") {
        Graph.d3AlphaDecay(physics.alpha_decay);
      }
      if (typeof Graph.cooldownTicks === "function") {
        Graph.cooldownTicks(physics.cooldown_ticks);
      }
      if (typeof Graph.warmupTicks === "function") {
        Graph.warmupTicks(physics.warmup_ticks);
      }
      if (typeof Graph.d3Force === "function") {
        var charge = Graph.d3Force("charge");
        if (charge && typeof charge.strength === "function") {
          var chargeStrength = physics.charge;
          var hubMult = hubClusterTuning && typeof hubClusterTuning.charge_mult === "number"
            ? hubClusterTuning.charge_mult
            : 1;
          var useFn = hubMult !== 1 || (clusterRepulsion && clusterRepulsion.enabled);
          if (useFn && typeof chargeStrength === "number") {
            charge.strength(function (node) {
              var s = chargeStrength;
              if (isHubNode(node)) s = s * hubMult;
              s = s * clusterRepulsionMult(node);
              return s;
            });
          } else {
            charge.strength(chargeStrength);
          }
        }
        if (charge && typeof charge.distanceMax === "function") {
          charge.distanceMax(physics.max_radius || 0);
        }
      }
      if (reheat !== false && typeof Graph.d3ReheatSimulation === "function") {
        lastReheatAt = nowMs();
        Graph.d3ReheatSimulation();
      }
      log(
        "physics charge=" +
          physics.charge +
          " link=" +
          physics.link_distance +
          " strength=" +
          physics.link_strength
      );
    }


    function persistPhysics(key, val) {
      if (!window.pycmd) return;
      pycmd("phys:" + key + ":" + val);
    }

    function bindRange(key, rangeId, numId, label) {
      var range = document.getElementById(rangeId);
      var num = document.getElementById(numId);
      if (!range || !num) return;
      var setVal = function (val, silent, persist) {
        if (isNaN(val)) return;
        physics[key] = val;
        range.value = val;
        num.value = val;
        applyPhysics();
        if (!silent && label) {
          showToast("Physics: " + label + " " + val);
        }
        if (persist) {
          persistPhysics(key, val);
        }
      };
      range.addEventListener("input", function () {
        setVal(parseFloat(range.value), true, false);
      });
      range.addEventListener("change", function () {
        setVal(parseFloat(range.value), false, true);
      });
      num.addEventListener("change", function () {
        setVal(parseFloat(num.value), false, true);
      });
      range.value = physics[key];
      num.value = physics[key];
    }

    function setControlValue(rangeId, numId, val) {
      var range = document.getElementById(rangeId);
      var num = document.getElementById(numId);
      if (range) range.value = val;
      if (num) num.value = val;
    }

    function setupPhysicsPanel() {
      loadPhysics();
      bindRange("charge", "phys-charge", "phys-charge-num", "charge");
      bindRange("link_distance", "phys-link-distance", "phys-link-distance-num", "link distance");
      bindRange("velocity_decay", "phys-vel-decay", "phys-vel-decay-num", "velocity decay");
      bindRange("alpha_decay", "phys-alpha-decay", "phys-alpha-decay-num", "alpha decay");
      bindRange("max_radius", "phys-max-radius", "phys-max-radius-num", "repulsion range");
      bindRange("cooldown_ticks", "phys-cooldown", "phys-cooldown-num", "cooldown ticks");
      bindRange("warmup_ticks", "phys-warmup", "phys-warmup-num", "warmup ticks");
      var resetBtn = document.getElementById("phys-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          physics = Object.assign({}, physicsDefaults);
          setControlValue("phys-charge", "phys-charge-num", physics.charge);
          setControlValue("phys-link-distance", "phys-link-distance-num", physics.link_distance);
          setControlValue("phys-vel-decay", "phys-vel-decay-num", physics.velocity_decay);
          setControlValue("phys-alpha-decay", "phys-alpha-decay-num", physics.alpha_decay);
          setControlValue("phys-max-radius", "phys-max-radius-num", physics.max_radius);
          setControlValue("phys-cooldown", "phys-cooldown-num", physics.cooldown_ticks);
          setControlValue("phys-warmup", "phys-warmup-num", physics.warmup_ticks);
          applyPhysics();
          persistPhysics("charge", physics.charge);
          persistPhysics("link_distance", physics.link_distance);
          persistPhysics("velocity_decay", physics.velocity_decay);
          persistPhysics("alpha_decay", physics.alpha_decay);
          persistPhysics("max_radius", physics.max_radius);
          persistPhysics("cooldown_ticks", physics.cooldown_ticks);
          persistPhysics("warmup_ticks", physics.warmup_ticks);
          showToast("Physics reset");
        });
      }
    }

    function showContextMenu(node, evt) {
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;
      ctxMenuId = node ? String(node.id) : null;
      ctxDot = null;
      if (node && cardDotsEnabled) {
        var dotCard = getCardDotClick(node, evt);
        if (dotCard && dotCard.id) {
          ctxDot = { nodeId: String(node.id), cardId: dotCard.id };
        }
      }
      var menuSelectedId = selectedId;
      if (!menuSelectedId && node && node.kind === "note") {
        menuSelectedId = String(node.id);
      }
      menu.innerHTML = "";
      function addItem(label, cb) {
        var div = document.createElement("div");
        div.className = "item";
        var parts = String(label).split("selected");
        if (parts.length > 1) {
          var prefix = parts[0];
          var suffix = parts.slice(1).join("selected");
          if (prefix) div.appendChild(document.createTextNode(prefix));
          var dot = document.createElement("span");
          dot.className = "ctx-selected-dot";
          div.appendChild(dot);
          div.appendChild(document.createTextNode("selected" + suffix));
        } else {
          div.textContent = label;
        }
        div.addEventListener("click", function () {
          cb();
          hideContextMenu();
        });
        menu.appendChild(div);
      }
      function addDivider() {
        if (!menu.lastElementChild) return;
        if (menu.lastElementChild.className === "divider") return;
        var div = document.createElement("div");
        div.className = "divider";
        menu.appendChild(div);
      }
      function appendGroup(items) {
        if (!items.length) return;
        if (menu.childElementCount) addDivider();
        items.forEach(function (entry) {
          addItem(entry.label, entry.cb);
        });
      }
      function showFamilyPicker(title, families, onApply) {
        if (!families || !families.length) return;
        var overlay = document.getElementById("ctx-picker");
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = document.createElement("div");
        overlay.id = "ctx-picker";
        var dialog = document.createElement("div");
        dialog.className = "dialog";
        var heading = document.createElement("div");
        heading.className = "title";
        heading.textContent = title || "Select families";
        var list = document.createElement("div");
        list.className = "list";
        families.forEach(function (fid) {
          var row = document.createElement("label");
          row.className = "row";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = fid;
          cb.checked = true;
          var span = document.createElement("span");
          span.textContent = fid;
          row.appendChild(cb);
          row.appendChild(span);
          list.appendChild(row);
        });
        var btnRow = document.createElement("div");
        btnRow.className = "btn-row";
        var cancelBtn = document.createElement("button");
        cancelBtn.className = "btn";
        cancelBtn.textContent = "Cancel";
        var okBtn = document.createElement("button");
        okBtn.className = "btn primary";
        okBtn.textContent = "Apply";
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(heading);
        dialog.appendChild(list);
        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        function close() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        cancelBtn.addEventListener("click", function (e) {
          e.preventDefault();
          close();
        });
        okBtn.addEventListener("click", function (e) {
          e.preventDefault();
          var selected = [];
          list.querySelectorAll("input[type=checkbox]:checked").forEach(function (el) {
            selected.push(el.value);
          });
          close();
          if (onApply) onApply(selected);
        });
        overlay.addEventListener("click", function (e) {
          if (e.target === overlay) close();
        });
      }

      var groups = [];
      var openGroup = [];
      var isNodeNoteTypeHub = node && node.kind === "note_type_hub";
      if (node.kind === "note") {
        openGroup.push({
          label: "Open Preview",
          cb: function () {
            showToast("Open preview");
            if (window.pycmd) pycmd("ctx:preview:" + node.id);
          },
        });
        if (ctxDot && ctxDot.cardId) {
          openGroup.push({
            label: "Open Card in Preview",
            cb: function () {
              showToast("Open card preview");
              if (window.pycmd) pycmd("ctx:previewcard:" + ctxDot.cardId);
            },
          });
        }
        openGroup.push({
          label: "Open Editor",
          cb: function () {
            showToast("Open editor");
            if (window.pycmd) pycmd("ctx:edit:" + node.id);
          },
        });
        openGroup.push({
          label: "Open Browser",
          cb: function () {
            showToast("Open browser");
            if (window.pycmd) pycmd("ctx:browser:" + node.id);
          },
        });
      } else if (isNodeNoteTypeHub) {
        openGroup.push({
          label: "Open Browser",
          cb: function () {
            showToast("Open browser");
            var mid = node.note_type_id || String(node.id).replace("notetype:", "");
            if (window.pycmd) pycmd("ctx:browsernt:" + mid);
          },
        });
      }
      groups.push(openGroup);

      var selectedNode =
        menuSelectedId && nodeById[menuSelectedId] ? nodeById[menuSelectedId] : null;
      var selectedKind = selectedNode ? selectedNode.kind || "" : "";
      var isSelectedNote = selectedNode && selectedKind === "note";
      var isSelectedFamily = selectedNode && selectedKind === "family";
      var isNodeNote = node && node.kind === "note";
      var isNodeFamily = node && node.kind === "family";
      var isDifferent = selectedNode && String(node.id) !== String(menuSelectedId);
      var isSame = selectedNode && String(node.id) === String(menuSelectedId);

      function getPrimaryFamily(n) {
        if (!n) return "";
        if (n.kind === "family") {
          return n.label || String(n.id).replace("family:", "");
        }
        if (Array.isArray(n.families) && n.families.length) {
          return String(n.families[0]);
        }
        return "";
      }

      function getSharedFamilies(a, b) {
        if (!a || !b) return [];
        if (!Array.isArray(a.families) || !Array.isArray(b.families)) return [];
        var set = {};
        a.families.forEach(function (f) {
          set[String(f)] = true;
        });
        var out = [];
        b.families.forEach(function (f) {
          var fid = String(f);
          if (set[fid]) out.push(fid);
        });
        return out;
      }

      function manualLinkInfo(aId, bId) {
        var info = { ab: false, ba: false };
        links.forEach(function (l) {
          if (l.layer !== "reference") return;
          if (!l.meta || !l.meta.manual) return;
          var ids = linkIds(l);
          if (ids.s === aId && ids.t === bId) info.ab = true;
          if (ids.s === bId && ids.t === aId) info.ba = true;
          if (l.meta.bidirectional && (ids.s === aId && ids.t === bId || ids.s === bId && ids.t === aId)) {
            info.ab = true;
            info.ba = true;
          }
        });
        return info;
      }

      var connectGroup = [];
      if (selectedNode && isDifferent && isNodeNote) {
        var canConnect =
          selectedKind === "family" ||
          (selectedKind === "note" &&
            Array.isArray(selectedNode.families) &&
            selectedNode.families.length);
        if (selectedKind === "kanji" || selectedKind === "kanji_hub") {
          canConnect = false;
        }
        if (canConnect) {
          function doConnectWithMode(title, mode) {
            return function () {
              function doConnect(families) {
                showToast("Connect family");
                var payload = {
                  source: String(menuSelectedId),
                  target: String(node.id),
                  source_kind: selectedKind,
                  source_label: selectedNode.label || "",
                  prio_mode: mode || "",
                };
                if (families) payload.families = families;
                if (window.pycmd) {
                  pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
                }
              }
              if (selectedKind === "note" && Array.isArray(selectedNode.families) && selectedNode.families.length > 1) {
                showFamilyPicker(title, selectedNode.families, doConnect);
              } else if (selectedKind === "family") {
                var fid = selectedNode.label || String(selectedNode.id).replace("family:", "");
                doConnect([fid]);
              } else if (selectedKind === "note") {
                doConnect(selectedNode.families || []);
              } else {
                doConnect([]);
              }
            };
          }
          if (selectedKind === "family") {
            connectGroup.push({
              label: "Connect selected to Family",
              cb: doConnectWithMode("Select hub families", "hub_zero"),
            });
          } else if (selectedKind === "note") {
            connectGroup.push({
              label: "Connect selected: to active Family@+1",
              cb: doConnectWithMode("Select families to connect", ""),
            });
            connectGroup.push({
              label: "Connect selected: to active Family@same prio",
              cb: doConnectWithMode("Select families to connect", "same"),
            });
            if (selectedNode.prio !== undefined && selectedNode.prio !== null && Number(selectedNode.prio) > 0) {
              connectGroup.push({
                label: "Connect selected: to active Family@-1",
                cb: doConnectWithMode("Select families to connect", "minus1"),
              });
            }
          }
        }
      }
      if (selectedNode && isDifferent && isNodeFamily && isSelectedNote) {
        var hubFid2 = node.label || String(node.id).replace("family:", "");
        var activeFamilies = Array.isArray(selectedNode.families)
          ? selectedNode.families.map(function (f) { return String(f); })
          : [];
        if (hubFid2 && activeFamilies.indexOf(String(hubFid2)) === -1) {
          connectGroup.push({
            label: "Connect to Family",
            cb: function () {
              showToast("Connect family");
              var payload = {
                source: String(node.id),
                target: String(menuSelectedId),
                source_kind: "family",
                source_label: hubFid2,
                prio_mode: "hub_zero",
              };
              if (window.pycmd) {
                pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
      }
      groups.push(connectGroup);

      var linkInfo = { ab: false, ba: false };
      if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
        linkInfo = manualLinkInfo(String(menuSelectedId), String(node.id));
      }

      var appendItems = [];
      if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
        var targetNt = node.note_type_id ? String(node.note_type_id) : "";
        var targetLinked = targetNt ? noteTypeLinkedField[targetNt] : "";
        var activeNt = selectedNode.note_type_id ? String(selectedNode.note_type_id) : "";
        var activeLinked = activeNt ? noteTypeLinkedField[activeNt] : "";
        if (targetLinked && !linkInfo.ba) {
          appendItems.push({
            label: "Append Link on selected: to active",
            cb: function () {
              showToast("Append link");
              var payload = {
                source: String(menuSelectedId),
                target: String(node.id),
                label: selectedNode.label || "",
              };
              if (window.pycmd) {
                pycmd("ctx:link:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
        if (activeLinked && !linkInfo.ab) {
          appendItems.push({
            label: "Append Link on active: to selected",
            cb: function () {
              showToast("Append link");
              var payload = {
                source: String(node.id),
                target: String(menuSelectedId),
                label: node.label || "",
              };
              if (window.pycmd) {
                pycmd("ctx:link_active:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
        if (targetLinked && activeLinked && !linkInfo.ab && !linkInfo.ba) {
          appendItems.push({
            label: "Append Link on both: to each other",
            cb: function () {
              showToast("Append links");
              var payload = {
                source: String(menuSelectedId),
                target: String(node.id),
                source_label: selectedNode.label || "",
                target_label: node.label || "",
              };
              if (window.pycmd) {
                pycmd("ctx:link_both:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
      }
      var disconnectGroup = [];
      if (
        selectedNode &&
        (isDifferent || isSame) &&
        (isSelectedNote || isSelectedFamily) &&
        (isNodeNote || isNodeFamily) &&
        !(isSelectedFamily && isNodeFamily)
      ) {
        var activeFamily = getPrimaryFamily(selectedNode);
        var sharedFamilies = [];
        if (isSelectedFamily) {
          sharedFamilies = activeFamily ? [activeFamily] : [];
        } else if (isNodeFamily) {
          var hubFid = node.label || String(node.id).replace("family:", "");
          var activeFamilies2 = Array.isArray(selectedNode.families)
            ? selectedNode.families.map(function (f) { return String(f); })
            : [];
          if (hubFid && activeFamilies2.indexOf(String(hubFid)) >= 0) {
            sharedFamilies = [hubFid];
          } else {
            sharedFamilies = [];
          }
        } else {
          sharedFamilies = isSame
            ? (Array.isArray(node.families) ? node.families.slice(0) : [])
            : getSharedFamilies(selectedNode, node);
        }
        if (sharedFamilies.length) {
          disconnectGroup.push({
            label: isSame
              ? "Disconnect from Family"
              : (isNodeFamily && isSelectedNote)
              ? "Disconnect from Family"
              : isSelectedFamily
              ? "Disconnect selected from Family"
              : "Disconnect selected: from active Family",
            cb: function () {
              function doDisconnect(families) {
                showToast("Disconnect family");
                var payload = {
                  source: String(menuSelectedId),
                  target: String(node.id),
                  source_kind: selectedKind,
                  source_label: selectedNode.label || "",
                };
                if (isNodeFamily && isSelectedNote) {
                  var hubFid3 = node.label || String(node.id).replace("family:", "");
                  payload.source = String(node.id);
                  payload.target = String(menuSelectedId);
                  payload.source_kind = "family";
                  payload.source_label = hubFid3;
                }
                if (families && families.length) {
                  payload.families = families;
                }
                if (window.pycmd) {
                  pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
                }
              }
              if (sharedFamilies.length > 1 && isSelectedNote) {
                showFamilyPicker("Select families to disconnect", sharedFamilies, doDisconnect);
              } else {
                doDisconnect(sharedFamilies);
              }
            },
          });
        }
      }

      var removeGroup = [];
      if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
        var nodeNt = node.note_type_id ? String(node.note_type_id) : "";
        var nodeLinked = nodeNt ? noteTypeLinkedField[nodeNt] : "";
        var selNt = selectedNode.note_type_id ? String(selectedNode.note_type_id) : "";
        var selLinked = selNt ? noteTypeLinkedField[selNt] : "";
        if (linkInfo.ba && nodeLinked) {
          removeGroup.push({
            label: "Remove Link on selected: to active",
            cb: function () {
              showToast("Remove link");
              var payload = {
                source: String(menuSelectedId),
                target: String(node.id),
              };
              if (window.pycmd) {
                pycmd("ctx:unlink:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
        if (linkInfo.ab && selLinked) {
          removeGroup.push({
            label: "Remove Link on active: to selected",
            cb: function () {
              showToast("Remove link");
              var payload = {
                source: String(node.id),
                target: String(menuSelectedId),
              };
              if (window.pycmd) {
                pycmd("ctx:unlink_active:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
        if (linkInfo.ab && linkInfo.ba && nodeLinked && selLinked) {
          removeGroup.push({
            label: "Remove Link on both: to each other",
            cb: function () {
              showToast("Remove links");
              var payload = {
                source: String(menuSelectedId),
                target: String(node.id),
              };
              if (window.pycmd) {
                pycmd("ctx:unlink_both:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
      }
      groups.push(disconnectGroup);
      groups.push(appendItems);
      groups.push(removeGroup);

      var filterGroup = [];
      var families = [];
      if (isNodeFamily) {
        families = [node.label || String(node.id).replace("family:", "")];
      } else if (Array.isArray(node.families)) {
        families = node.families.slice(0, 20);
      }
      families.forEach(function (fid) {
        filterGroup.push({
          label: "Filter Family: " + fid,
          cb: function () {
            showToast("Filter family");
            if (window.pycmd) pycmd("ctx:filter:" + encodeURIComponent(fid));
          },
        });
      });
      groups.push(filterGroup);

      groups.forEach(function (grp) {
        appendGroup(grp);
      });
      var e = evt || window.event;
      if (e) {
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";
      }
      menu.style.display = "block";
      if (ctxDot && Graph && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function hideContextMenu() {
      var menu = document.getElementById("ctx-menu");
      if (menu) menu.style.display = "none";
      ctxMenuId = null;
      if (ctxDot) {
        ctxDot = null;
        if (Graph && typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
      }
    }

    graphEl.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    document.addEventListener("click", function () {
      hideContextMenu();
    });
    Graph.onNodeRightClick(function (node, evt) {
      showContextMenu(node, evt);
    });
    if (typeof Graph.onBackgroundRightClick === "function") {
      Graph.onBackgroundRightClick(function () {
        hideContextMenu();
      });
    }

    function resizeGraph() {
      var rect = graphEl.getBoundingClientRect();
      Graph.width(rect.width || window.innerWidth).height(
        rect.height || window.innerHeight - 42
      );
    }
    window.addEventListener("resize", resizeGraph);
    resizeGraph();

    (function bindRebuildToast() {
      var btn = document.getElementById("btn-rebuild");
      if (!btn) return;
      btn.addEventListener("click", function () {
        showToast("Rebuild requested");
      });
    })();

    (function bindZoomIndicator() {
      var zoomEl = document.getElementById("zoom-indicator");
      if (!zoomEl || typeof Graph.zoom !== "function") return;
      function tick() {
        try {
          var z = Graph.zoom();
          if (typeof z === "number") {
            zoomEl.textContent = "Zoom: " + z.toFixed(2) + "x";
          }
        } catch (_e) {}
        requestAnimationFrame(tick);
      }
      tick();
    })();

    window.__ajpcGraph = Graph;
    window.ajpcGraphUpdate = function (newData) {
      try {
        if (!newData || !newData.nodes || !newData.edges) return;
        log(
          "js update start nodes=" +
            (newData.nodes || []).length +
            " edges=" +
            (newData.edges || []).length
        );
        var current = Graph.graphData() || { nodes: [], links: [] };
        var prevAllIds = new Set();
        (nodes || []).forEach(function (n) {
          prevAllIds.add(String(n.id));
        });
        var pos = {};
        var prevKeys = {};
        var existed = new Set();
        (current.nodes || []).forEach(function (n) {
          pos[String(n.id)] = {
            x: n.x,
            y: n.y,
            fx: n.fx,
            fy: n.fy,
            soft_pinned: n.__soft_pinned,
            pin_x: n.__pin_x,
            pin_y: n.__pin_y,
          };
          existed.add(String(n.id));
        });
        (current.links || []).forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var a = String(s);
          var b = String(t);
          var key = (l.layer || "") + "|" + (a < b ? a + "|" + b : b + "|" + a);
          prevKeys[key] = true;
        });

        if (newData.meta && Array.isArray(newData.meta.note_types)) {
          noteTypeMeta = newData.meta.note_types;
          noteTypeMeta.forEach(function (nt) {
            var id = String(nt.id);
            if (!visibleNoteTypes.hasOwnProperty(id)) {
              visibleNoteTypes[id] = nt.visible !== false;
            }
            if (nt.color && !noteTypeColors[id]) {
              noteTypeColors[id] = nt.color;
            }
            if (nt.linked_field) {
              noteTypeLinkedField[id] = nt.linked_field;
            } else {
              delete noteTypeLinkedField[id];
            }
            if (Array.isArray(nt.templates)) {
              noteTypeTemplates[id] = nt.templates.slice();
            }
          });
        }
        if (newData.meta && newData.meta.layer_colors) {
          Object.keys(newData.meta.layer_colors).forEach(function (k) {
            if (!layerColors[k]) layerColors[k] = newData.meta.layer_colors[k];
          });
        }
        if (newData.meta && newData.meta.layer_styles) {
          Object.keys(newData.meta.layer_styles).forEach(function (k) {
            if (!layerStyles[k]) layerStyles[k] = newData.meta.layer_styles[k];
          });
        }
        if (newData.meta && newData.meta.layer_flow) {
          Object.keys(newData.meta.layer_flow).forEach(function (k) {
            if (!layerFlow[k]) layerFlow[k] = newData.meta.layer_flow[k];
          });
        }
        if (newData.meta && newData.meta.link_strengths) {
          Object.keys(newData.meta.link_strengths).forEach(function (k) {
            linkStrengths[k] = newData.meta.link_strengths[k];
          });
        }
        if (newData.meta && newData.meta.card_dot_colors) {
          var cdc = newData.meta.card_dot_colors || {};
          if (cdc.suspended) cardDotColors.suspended = cdc.suspended;
          if (cdc.buried) cardDotColors.buried = cdc.buried;
        }
        if (newData.meta && newData.meta.card_dots_enabled !== undefined) {
          cardDotsEnabled = !!newData.meta.card_dots_enabled;
        }
        if (newData.meta && newData.meta.layer_flow_speed !== undefined) {
          flowSpeed = newData.meta.layer_flow_speed;
        }
        if (newData.meta && newData.meta.soft_pin_radius !== undefined) {
          var sp2 = parseFloat(newData.meta.soft_pin_radius);
          if (!isNaN(sp2)) softPinRadius = sp2;
        }
          if (
            newData.meta &&
            newData.meta.reference_auto_opacity !== undefined
          ) {
            autoRefOpacity = newData.meta.reference_auto_opacity;
          }
          if (newData.meta && newData.meta.show_unlinked !== undefined) {
            showUnlinked = !!newData.meta.show_unlinked;
            var _toggle = document.getElementById("toggle-unlinked");
            if (_toggle) {
              _toggle.checked = !!showUnlinked;
            }
          }
          if (newData.meta && newData.meta.kanji_components_enabled !== undefined) {
            kanjiComponentsEnabled = !!newData.meta.kanji_components_enabled;
          }
        if (newData.meta && newData.meta.kanji_component_style !== undefined) {
          kanjiComponentStyle = newData.meta.kanji_component_style || "solid";
        }
        if (newData.meta && newData.meta.kanji_component_color !== undefined) {
          kanjiComponentColor = newData.meta.kanji_component_color || "";
        }
        if (newData.meta && newData.meta.kanji_component_opacity !== undefined) {
          kanjiComponentOpacity = newData.meta.kanji_component_opacity;
        }
        if (newData.meta && newData.meta.kanji_component_focus_only !== undefined) {
          kanjiComponentFocusOnly = !!newData.meta.kanji_component_focus_only;
        }
        if (newData.meta && newData.meta.kanji_component_flow !== undefined) {
          kanjiComponentFlow = !!newData.meta.kanji_component_flow;
        }
        if (newData.meta && newData.meta.family_same_prio_edges !== undefined) {
          samePrioEdges = !!newData.meta.family_same_prio_edges;
        }
        if (newData.meta && newData.meta.family_chain_edges !== undefined) {
          familyChainEdges = !!newData.meta.family_chain_edges;
        }
        if (newData.meta && newData.meta.family_same_prio_opacity !== undefined) {
          samePrioOpacity = newData.meta.family_same_prio_opacity;
        }
        if (newData.meta && newData.meta.note_type_hub_members) {
          noteTypeHubMembers = buildNoteTypeHubMembers(
            newData.meta.note_type_hub_members
          );
        }

        nodes = (newData.nodes || []).map(function (n) {
          var copy = {};
          for (var k in n) copy[k] = n[k];
          var id = String(copy.id);
          var p = pos[id];
          if (p) {
            copy.x = p.x;
            copy.y = p.y;
            copy.fx = p.fx;
            copy.fy = p.fy;
            copy.__soft_pinned = p.soft_pinned;
            copy.__pin_x = p.pin_x;
            copy.__pin_y = p.pin_y;
          }
          return copy;
        });
        var newCount = 0;
        nodes.forEach(function (n) {
          if (!prevAllIds.has(String(n.id))) newCount += 1;
        });
        links = (newData.edges || []).map(function (e) {
          var copy = {};
          for (var k in e) copy[k] = e[k];
          return copy;
        });
        var addedEdges = [];
        links.forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var a = String(s);
          var b = String(t);
          var key = (l.layer || "") + "|" + (a < b ? a + "|" + b : b + "|" + a);
          if (!prevKeys[key]) {
            addedEdges.push({ a: a, b: b, layer: l.layer || "", meta: l.meta || null });
          }
        });
        nodeById = {};
        nodes.forEach(function (n) {
          nodeById[String(n.id)] = n;
        });
        addHubMembersToNodeMap();

        var neighbors = {};
        links.forEach(function (l) {
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          if (!neighbors[sk]) neighbors[sk] = [];
          if (!neighbors[tk]) neighbors[tk] = [];
          neighbors[sk].push(tk);
          neighbors[tk].push(sk);
        });

        nodes.forEach(function (n) {
          var id = String(n.id);
          if (pos[id]) return;
          var neigh = neighbors[id] || [];
          var sumX = 0;
          var sumY = 0;
          var count = 0;
          neigh.forEach(function (nid) {
            var p = pos[nid];
            if (!p) {
              var nn = nodeById[nid];
              if (nn && typeof nn.x === "number" && typeof nn.y === "number") {
                sumX += nn.x;
                sumY += nn.y;
                count += 1;
              }
              return;
            }
            if (typeof p.x === "number" && typeof p.y === "number") {
              sumX += p.x;
              sumY += p.y;
              count += 1;
            }
          });
          if (count) {
            n.x = sumX / count + (Math.random() - 0.5) * 10;
            n.y = sumY / count + (Math.random() - 0.5) * 10;
          } else {
            n.x = (Math.random() - 0.5) * 200;
            n.y = (Math.random() - 0.5) * 200;
          }
        });

        applyFilters({ reheat: false });
        var anchors = new Set();
        if (newData.meta && Array.isArray(newData.meta.changed_nids)) {
          newData.meta.changed_nids.forEach(function (nid) {
            anchors.add(String(nid));
          });
        }
        var changedCount =
          newData.meta && Array.isArray(newData.meta.changed_nids)
            ? newData.meta.changed_nids.length
            : 0;
        if (addedEdges.length) {
          releaseForNewEdges(addedEdges, anchors, existed);
        }
        if (newCount > 0) {
          showToast("New notes: " + newCount);
        } else if (changedCount > 0) {
          showToast("Notes updated: " + changedCount);
        }
        log(
          "js update done nodes=" +
            (nodes || []).length +
            " edges=" +
            (links || []).length
        );
      } catch (e) {
        log("js update failed " + e);
      }
    };
    log("graph render ready");
  }

  window.ajpcGraphInit = initGraph;
  log("graph.js loaded");
})();
