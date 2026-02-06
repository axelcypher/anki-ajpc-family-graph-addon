(function () {
  function getScriptBase() {
    var src = "";
    if (document.currentScript && document.currentScript.src) {
      src = document.currentScript.src;
    } else {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var cand = scripts[i].src || "";
        if (cand.indexOf("graph.js") >= 0) {
          src = cand;
          break;
        }
      }
    }
    if (!src) return "";
    return src.slice(0, src.lastIndexOf("/") + 1);
  }

  function loadScriptOnce(src, cb) {
    if (!src) {
      if (cb) cb();
      return;
    }
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src === src) {
        if (scripts[i].dataset && scripts[i].dataset.loaded) {
          if (cb) cb();
        } else if (cb) {
          scripts[i].addEventListener("load", cb);
        }
        return;
      }
    }
    var tag = document.createElement("script");
    tag.src = src;
    tag.async = false;
    tag.onload = function () {
      if (tag.dataset) tag.dataset.loaded = "1";
      if (cb) cb();
    };
    tag.onerror = function () {
      if (cb) cb();
    };
    if (tag.dataset) tag.dataset.loaded = "";
    document.head.appendChild(tag);
  }

  function ensureDeps(cb) {
    var base = getScriptBase();
    var needDebug = !window.DebugToast;
    var needShared = !window.GraphShared;
    var needHub = !window.GraphHub;
    if (!needDebug && !needShared && !needHub) {
      if (cb) cb();
      return;
    }
    if (!base) {
      if (cb) cb();
      return;
    }
    function loadHub(next) {
      if (needHub) {
        loadScriptOnce(base + "graph.hub.js", next);
      } else if (next) {
        next();
      }
    }
    function loadShared(next) {
      if (needShared) {
        loadScriptOnce(base + "graph.shared.js", next);
      } else if (next) {
        next();
      }
    }
    if (needDebug) {
      loadScriptOnce(base + "debug.js", function () {
        loadShared(function () {
          loadHub(cb);
        });
      });
      return;
    }
    loadShared(function () {
      loadHub(cb);
    });
  }

  function boot() {
    // --- Grundlagen: Logging, Zeit, Toasts ---
    function log(msg) {
      try {
        if (window.pycmd) {
          pycmd("log:" + msg);
        }
      } catch (_e) { }
    }

    var Shared = window.GraphShared || {};
    var Hub = window.GraphHub || {};
    var DebugToast = window.DebugToast || {};
    var nowMs = Shared.nowMs;
    var showToast = Shared.showToast || function () { };
    var showMsg = Shared.showMsg || function (text) { if (Shared.showToast) Shared.showToast(text); };
    var debugToast = Shared.debugToast || function () { };
    var debugIf = Shared.debugIf || function (_cat, _label, cond) { return cond; };
    var debugSeparator = Shared.debugSeparator || function () { };
    function showDebugToast(msg, a, b, c) {
      var ttl = undefined;
      var cat = undefined;
      var level = undefined;
      if (a && typeof a === "object") {
        cat = a.cat;
        ttl = a.ttl;
        level = a.level;
      } else {
        ttl = typeof a === "number" ? a : (typeof b === "number" ? b : undefined);
        cat = typeof a === "string" ? a : (typeof b === "string" ? b : undefined);
        if (typeof c === "string") level = c;
      }
      if (!cat) cat = "pipeline";
      if (!level) level = "trace";
      if (debugToast) {
        debugToast(msg, cat, ttl, level);
        return;
      }
      if (DebugToast && typeof DebugToast.log === "function") {
        DebugToast.log(level, msg, { ttl: ttl, target: "frontend" });
        return;
      }
      if (DebugToast && typeof DebugToast.show === "function") {
        DebugToast.show(msg, ttl, "", "frontend", level);
      }
    }
    function debugPipelineEnd(_label, level, cat) {
      debugSeparator(cat || "pipeline", level || "trace", "frontend");
    }
    var DEBUG_THROTTLE_SPAM_COUNT = 5;
    var DEBUG_THROTTLE_SPAM_COOLDOWN_MS = 10000;
    var debugThrottleState = {};
    function debugThrottle(cat, key, msg, level, minMs) {
      if (!window.DebugEnabled || window.GraphDebugToastsEnabled === false) return;
      var now = nowMs ? nowMs() : Date.now();
      var wait = typeof minMs === "number" ? minMs : 500;
      var state = debugThrottleState[key];
      if (!state) {
        state = { last: 0, suppressed: 0, cooldownUntil: 0 };
        debugThrottleState[key] = state;
      }
      if (state.cooldownUntil && now < state.cooldownUntil) return;
      if (now - state.last < wait) {
        state.suppressed += 1;
        if (state.suppressed >= DEBUG_THROTTLE_SPAM_COUNT) {
          state.cooldownUntil = now + Math.max(DEBUG_THROTTLE_SPAM_COOLDOWN_MS, wait);
          state.suppressed = 0;
        }
        return;
      }
      state.last = now;
      state.suppressed = 0;
      state.cooldownUntil = 0;
      debugToast(msg, cat, null, level || "trace");
    }
    function debugIfThrottle(cat, key, label, cond, level, minMs) {
      if (cond) {
        debugThrottle(cat, key, label + " => true", level || "trace", minMs);
      } else {
        debugThrottle(cat, key, label + " => false", level || "trace", minMs);
      }
      return cond;
    }
    var debugUI = Shared.debugUI || function () { };
    var layerColor = Shared.layerColor;
    var colorWithAlpha = Shared.colorWithAlpha;
    var parseColor = Shared.parseColor;
    var mixWithWhite = Shared.mixWithWhite;
    var applyDim = Shared.applyDim;
    var linkIds = Shared.linkIds;
    var curveControlPoint = Shared.curveControlPoint;
    var drawLinkPath = Shared.drawLinkPath;
    var assignLinkCurves = Shared.assignLinkCurves;
    var wrapLabelLines = Shared.wrapLabelLines;
    var buildContextMenuGroups = Shared.buildContextMenuGroups;

    var buildNoteTypeHubMembers = Hub.buildNoteTypeHubMembers;
    var hubBaseRadius = Hub.hubBaseRadius;
    var hubExpandedRadius = Hub.hubExpandedRadius;
    var hubPlusRadius = Hub.hubPlusRadius;
    var layoutHubMembers = Hub.layoutHubMembers;
    var limitHubMembers = Hub.limitMembers;
    var isNoteTypeHub = Hub.isNoteTypeHub;
    var isHubMemberOf = Hub.isHubMemberOf;

    window.onerror = function (msg, _src, line, col) {
      showMsg("JS error: " + msg + " @ " + line + ":" + col);
      log("js error: " + msg + " @ " + line + ":" + col);
    };

    // --- Farben / Stil helpers ---
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
      return "#4da3ff";
    }

    function ensureHubTag(node) {
      if (!node || !isNoteTypeHub(node)) return "";
      if (node.__hub_tag !== undefined && node.__hub_tag !== null) {
        return String(node.__hub_tag || "");
      }
      var rawId = node.id !== undefined && node.id !== null ? String(node.id) : "";
      var tag = "";
      if (rawId.indexOf("autolink:") === 0) {
        tag = rawId.slice("autolink:".length);
      } else if (node.label) {
        tag = String(node.label);
      }
      node.__hub_tag = tag;
      return tag;
    }

    function hubDisplayLabel(node) {
      var tag = ensureHubTag(node);
      if (!tag) return node.label || node.id || "";
      var idx = tag.lastIndexOf("::");
      return idx >= 0 ? tag.slice(idx + 2) : tag;
    }

    function nodeDisplayLabel(node) {
      if (!node) return "";
      if (isNoteTypeHub(node)) return hubDisplayLabel(node);
      return node.label || node.id || "";
    }

    function getNodeFamilies(node) {
      if (!node) return [];
      if (Array.isArray(node.families) && node.families.length) return node.families;
      var map = node.family_prios && typeof node.family_prios === "object" ? node.family_prios : null;
      return map ? Object.keys(map) : [];
    }

    var nodeById = {};

    function getFamilyIdFromHubId(id) {
      if (!id) return "";
      var raw = String(id);
      if (raw.indexOf("family:") === 0) return raw.slice("family:".length);
      var node = nodeById[raw];
      if (node && node.kind === "family") {
        return node.label || raw.replace("family:", "");
      }
      return "";
    }

    function isFamilyHubId(id) {
      var raw = String(id || "");
      if (!raw) return false;
      if (raw.indexOf("family:") === 0) return true;
      var node = nodeById[raw];
      return !!(node && node.kind === "family");
    }

    // --- Graph bootstrap + state ---
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

      // --- DOM: Layer toggles / UI elements ---
      var layerState = {
        family: document.getElementById("layer-family"),
        family_hub: document.getElementById("layer-family-hub"),
        reference: document.getElementById("layer-reference"),
        mass_linker: document.getElementById("layer-mass-linker"),
        example: document.getElementById("layer-example"),
        kanji: document.getElementById("layer-kanji"),
      };

      // --- Physics defaults + runtime values ---
      var physicsDefaults = {
        charge: -120,         //Repulsion
        link_distance: 25,
        link_strength: 1,
        velocity_decay: 0.15,
        alpha_decay: 0.02,
        center_force: 0,
        cooldown_ticks: 110,
        cooldown_time: 15000,
        warmup_ticks: 2,
        max_radius: 400,      //Repulsion Range
      };
      var physics = {};
      var neighborScaling = {
        mode: "none",
        directed: "undirected",
        weights: {},
      };
      var NEIGHBOR_DEFAULT_WEIGHTS = {
        family: 1.4,
        family_hub: 0.7,
        reference: 0.9,
        mass_linker: 0.4,
        example: 1.0,
        kanji: 0.2,
        kanji_component: 0.0,
      };
      function applyNeighborScalingConfig(cfg) {
        if (!cfg || typeof cfg !== "object") return;
        var mode = String(cfg.mode || "none");
        if (mode !== "none" && mode !== "ccm" && mode !== "twohop" && mode !== "jaccard" && mode !== "overlap") {
          mode = "none";
        }
        neighborScaling.mode = mode;
        var directed = String(cfg.directed || "undirected");
        if (directed !== "undirected" && directed !== "out" && directed !== "in") {
          directed = "undirected";
        }
        neighborScaling.directed = directed;
        var weights = {};
        var rawWeights = cfg.weights && typeof cfg.weights === "object" ? cfg.weights : {};
        Object.keys(NEIGHBOR_DEFAULT_WEIGHTS).forEach(function (k) {
          var v = rawWeights[k];
          weights[k] = (typeof v === "number" && isFinite(v)) ? v : NEIGHBOR_DEFAULT_WEIGHTS[k];
        });
        neighborScaling.weights = weights;
      }
      if (data.meta && data.meta.neighbor_scaling) {
        applyNeighborScalingConfig(data.meta.neighbor_scaling);
      } else {
        applyNeighborScalingConfig({});
      }

      // --- TWEAKS (simulation) ---
      var HUB_BOUNDARY_SCALE = 2.0;
      var HUB_AUTO_COLLAPSE_ZOOM = 1.5;
      // --- Hub physics overrides (optional) ---
      // Set enabled=true and override any field to tweak hub sim independently.
      var hubPhysics = {
        enabled: false,
        charge: null,
        link_distance: null,
        link_strength: null,
        velocity_decay: null,
        alpha_decay: null,
        center_force: null,
        cooldown_ticks: null,
        cooldown_time: null,
        warmup_ticks: null,
        max_radius: null,
        charge_scale_mult: 1,
      };
      // --- Meta: note types + hub members ---
      var noteTypeMeta = (data.meta && data.meta.note_types) || [];
      var noteTypeHubMembers = buildNoteTypeHubMembers(
        (data.meta && data.meta.note_type_hub_members) || []
      );
      var hubMemberParentById = {};
      var hubMemberById = {};
      function rebuildHubMemberIndex() {
        hubMemberParentById = {};
        hubMemberById = {};
        Object.keys(noteTypeHubMembers || {}).forEach(function (hid) {
          var entry = noteTypeHubMembers[hid];
          if (!entry || !entry.nodes) return;
          entry.nodes.forEach(function (n) {
            if (!n) return;
            hubMemberParentById[String(n.id)] = String(hid);
            hubMemberById[String(n.id)] = n;
          });
        });
      }
      rebuildHubMemberIndex();
      function isHubMemberId(id) {
        if (id === undefined || id === null) return false;
        return !!hubMemberParentById[String(id)];
      }
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
      var updateCardPreviewColor = null;
      var cardDotsMinZoom = 2.5;
      var labelMinZoom = 1.0;

      var layerColors = (data.meta && data.meta.layer_colors) || {};
      var layerEnabled = (data.meta && data.meta.layer_enabled) || {};
      var layerStyles = (data.meta && data.meta.layer_styles) || {};
      var layerFlow = (data.meta && data.meta.layer_flow) || {};
      var linkStrengths = (data.meta && data.meta.link_strengths) || {};
      var linkDistances = (data.meta && data.meta.link_distances) || {};
      if (layerColors.mass_linker === undefined) {
        layerColors.mass_linker = layerColor("mass_linker", layerColors);
      }
      if (layerStyles.mass_linker === undefined) {
        layerStyles.mass_linker = layerStyles.reference || "dashed";
      }
      if (layerFlow.mass_linker === undefined) {
        layerFlow.mass_linker = layerFlow.reference || false;
      }
      if (linkStrengths.mass_linker === undefined && linkStrengths.reference !== undefined) {
        linkStrengths.mass_linker = linkStrengths.reference;
      }
      if (linkDistances.mass_linker === undefined && linkDistances.reference !== undefined) {
        linkDistances.mass_linker = linkDistances.reference;
      }
      var flowSpeed = (data.meta && data.meta.layer_flow_speed) || 0.02;
      var flowMinZoom = 1.5;
      var flowZoomFadeBand = 0.3;
      var cardDotsFadeBand = 0.3;
      var labelFadeBand = 0.3;
      var lastFlowFade = null;
      var autoRefOpacity =
        data.meta && data.meta.reference_auto_opacity !== undefined
          ? data.meta.reference_auto_opacity
          : 1.0;
      var showUnlinked =
        data.meta && data.meta.show_unlinked !== undefined
          ? !!data.meta.show_unlinked
          : false;
      var linkMstEnabled =
        data.meta && data.meta.link_mst_enabled !== undefined
          ? !!data.meta.link_mst_enabled
          : false;
      var hubDampingEnabled =
        data.meta && data.meta.hub_damping !== undefined
          ? !!data.meta.hub_damping
          : false;
      var referenceDampingEnabled =
        data.meta && data.meta.reference_damping !== undefined
          ? !!data.meta.reference_damping
          : false;
      var kanjiTfidfEnabled =
        data.meta && data.meta.kanji_tfidf_enabled !== undefined
          ? !!data.meta.kanji_tfidf_enabled
          : false;
      var kanjiTopKEnabled =
        data.meta && data.meta.kanji_top_k_enabled !== undefined
          ? !!data.meta.kanji_top_k_enabled
          : false;
      var kanjiTopK = 0;
      try {
        kanjiTopK = parseInt(data.meta && data.meta.kanji_top_k !== undefined ? data.meta.kanji_top_k : 0, 10);
      } catch (_e) {
        kanjiTopK = 0;
      }
      if (!isFinite(kanjiTopK) || kanjiTopK < 0) kanjiTopK = 0;
      var linkQuantileNorm =
        data.meta && data.meta.kanji_quantile_norm !== undefined
          ? !!data.meta.kanji_quantile_norm
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

      // --- Graph data copy (nodes/links) ---
      var nodes = (data.nodes || []).map(function (n) {
        var copy = {};
        for (var k in n) copy[k] = n[k];
        copy.x = copy.x || Math.random() * 800;
        copy.y = copy.y || Math.random() * 600;
        return copy;
      });
      var rawLinks = (data.edges || []).map(function (e) {
        var copy = {};
        for (var k in e) copy[k] = e[k];
        return copy;
      });
      function isMassLinkerEdge(l) {
        if (!l) return false;
        if (l.layer === "mass_linker") return true;
        if (l.layer !== "reference") return false;
        if (!l.meta || l.meta.manual !== false) return false;
        return !!l.meta.tag;
      }
      function normalizeMassLinkerLayerOnLink(l) {
        if (!l) return;
        if (isMassLinkerEdge(l)) {
          l.layer = "mass_linker";
        }
      }
      function ensureNodeLayer(node, layer) {
        if (!node || !layer) return;
        var list = node.layers;
        if (!Array.isArray(list)) {
          list = list ? [list] : [];
        }
        if (list.indexOf(layer) < 0) list.push(layer);
        node.layers = list;
      }
      function normalizeEdgeList(list) {
        var out = [];
        (list || []).forEach(function (l) {
          if (!l) return;
          var copy = {};
          for (var k in l) copy[k] = l[k];
          normalizeMassLinkerLayerOnLink(copy);
          out.push(copy);
        });
        return out;
      }

      var baseLinks = normalizeEdgeList(rawLinks);
      var familyEdgesDirect = normalizeEdgeList((data.meta && data.meta.family_edges_direct) || []);
      var familyEdgesChain = normalizeEdgeList((data.meta && data.meta.family_edges_chain) || []);
      var familyHubEdgesDirect = normalizeEdgeList((data.meta && data.meta.family_hub_edges_direct) || []);
      var familyHubEdgesChain = normalizeEdgeList((data.meta && data.meta.family_hub_edges_chain) || []);
      var links = [];
      function rebuildLinkVariants() {
        links = baseLinks.slice();
        var fam = familyChainEdges ? familyEdgesChain : familyEdgesDirect;
        var hub = familyChainEdges ? familyHubEdgesChain : familyHubEdgesDirect;
        if (fam && fam.length) links = links.concat(fam);
        if (hub && hub.length) links = links.concat(hub);
      }
      rebuildLinkVariants();
      Object.keys(noteTypeHubMembers).forEach(function (hid) {
        var entry = noteTypeHubMembers[hid];
        if (!entry || !entry.edges) return;
        entry.edges.forEach(function (l) {
          normalizeMassLinkerLayerOnLink(l);
        });
      });
      nodes.forEach(function (n) {
        if (!n) return;
        if (isNoteTypeHub(n) && String(n.id).indexOf("autolink:") === 0) {
          ensureNodeLayer(n, "mass_linker");
        }
        if (isNoteTypeHub(n)) {
          ensureHubTag(n);
        }
      });
      (function logLinkStats() {
        var refAuto = 0;
        var refManual = 0;
        var massAuto = 0;
        links.forEach(function (l) {
          if (l.layer === "mass_linker") {
            massAuto += 1;
            return;
          }
          if (l.layer !== "reference") return;
          if (l.meta && l.meta.manual) refManual += 1;
          else refAuto += 1;
        });
        log(
          "links mass_linker=" +
          massAuto +
          " reference auto=" +
          refAuto +
          " manual=" +
          refManual +
          " total=" +
          links.length
        );
      })();

      // --- Node lookup + hub members ---
      nodeById = {};
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

      // --- Runtime state ---
      var selectedId = null;
      var ctxMenuId = null;
      var ctxDot = null;
      var componentFocusSet = null;
      var neighborMap = {};
      var neighborMetricById = {};
      var linkScoreRawByKey = {};
      var linkScoreByKey = {};
      var linkScoreLayerScores = {};
      var linkTopKSet = null;
      var linkMstSet = null;
      var referenceInDegById = {};
      var familyChainParent = {};
      var familyHubByMember = {};
      var familyMembersByFid = {};
      var familyHubIdByFid = {};
      var familyChainCache = { selId: null, version: -1, set: null };
      var activeNodes = [];
      var activeLinks = [];
      var dragActive = false;
      var dragNodeId = null;
      var engineRunningFallback = false;
      function markEngineRunning() {
        engineRunningFallback = true;
      }
      var linkRefineControls = {};
      var selectionState = {
        active: { scope: "main", id: null, hubId: null },
      };
      var pendingFlowUpdate = false;
      var lastActiveNoteIds = new Set();
      var graphReady = true;
      var debugEnabled = !!(data.meta && data.meta.debug_enabled);
      if (data.meta && Object.prototype.hasOwnProperty.call(data.meta, "debug_enabled")) {
        window.DebugEnabled = debugEnabled;
      }

      var debugPanelEl = document.getElementById("debug-panel");
      if (debugPanelEl) {
        debugPanelEl.style.display = debugEnabled ? "flex" : "none";
      }

      var debugAreas = false;
      var debugToggles = {
        shadow_canvas: false,
        link_labels: false,
        engine_panel: true,
        reheat_guard: true,
        debug_toasts: false,
      };
      window.GraphDebugToastsEnabled = !!debugToggles.debug_toasts;
      var debugLevels = {
        trace: true,
        debug: true,
        info: true,
        warn: true,
        error: true,
      };
      window.GraphDebugLevels = debugLevels;
      window.DebugLevels = debugLevels;
      var debugCategories = {
        pipeline: false,
        ui: false,
        input: false,
        selection: false,
        render: false,
        perf: false,
        config: false,
        data: false,
        sim_core: false,
        sim_forces: false,
        sim_flow: false,
        sim_collision: false,
        sim_drag: false,
        sim_hub: false,
        sim_freeze: false,
        sim_bounds: false,
        sim_links: false,
        sim_alpha: false,
        sim_velocity: false,
        sim_state: false,
        sim_events: false,
      };
      window.GraphDebugCategories = debugCategories;
      var debugShowPointerMap = false;
      var debugEngineEnabled = false;
      var debugLinkDistEl = null;
      var debugLinkLabels = {
        enabled: false,
        mode: "cluster", // "cluster" | "all" | "dragged"
      };
      var debugClusterCache = { id: null, version: -1, set: null };
      var activeLinksVersion = 0;
      if (debugAreas) {
        var wrapEl = document.getElementById("canvas-wrap");
        if (wrapEl) {
          wrapEl.classList.add("debug-areas");
        }
        if (document.body) {
          document.body.classList.add("debug-areas");
        }
      }
      if (debugEnabled) {
        debugLinkLabels.enabled = false;
        debugLinkLabels.mode = "all";
      }
      if (DebugToast && typeof DebugToast.isEnabled === "function") {
        debugToggles.debug_toasts = !!DebugToast.isEnabled();
      }

      function setActiveSelection(scope, id, hubId) {
        var nextScope = scope || "main";
        var nextId = id !== undefined && id !== null ? String(id) : null;
        var nextHub = hubId !== undefined && hubId !== null ? String(hubId) : null;
        debugToast(
          "setActiveSelection scope=" + nextScope + " id=" + (nextId || "null") + " hub=" + (nextHub || "null"),
          "selection",
          null,
          "trace"
        );
        selectionState.active.scope = nextScope;
        selectionState.active.id = nextId;
        selectionState.active.hubId = nextHub;
        selectedId = nextScope === "main" ? nextId : null;
      }

      function clearActiveSelection(scope, hubId) {
        if (!scope) {
          debugToast("clearActiveSelection: all", "selection", null, "trace");
          selectionState.active.scope = "main";
          selectionState.active.id = null;
          selectionState.active.hubId = null;
          selectedId = null;
          return true;
        }
        if (scope === "main") {
          if (debugIf("selection", "clearActiveSelection: main scope mismatch", selectionState.active.scope !== "main" || !selectionState.active.id, "trace")) return false;
          debugToast("clearActiveSelection: main", "selection", null, "trace");
          selectionState.active.id = null;
          selectionState.active.hubId = null;
          selectionState.active.scope = "main";
          selectedId = null;
          return true;
        }
        if (scope === "hub") {
          if (debugIf("selection", "clearActiveSelection: hub scope mismatch", selectionState.active.scope !== "hub", "trace")) return false;
          if (debugIf("selection", "clearActiveSelection: hub id mismatch", hubId && selectionState.active.hubId !== String(hubId), "trace")) return false;
          debugToast("clearActiveSelection: hub", "selection", null, "trace");
          selectionState.active.id = null;
          selectionState.active.hubId = null;
          selectionState.active.scope = "main";
          selectedId = null;
          return true;
        }
        return false;
      }

      function getActiveSelectionId(scope, hubId) {
        if (scope === "hub") {
          if (selectionState.active.scope !== "hub") return null;
          if (hubId && selectionState.active.hubId !== String(hubId)) return null;
          return selectionState.active.id;
        }
        if (scope === "main") {
          if (selectionState.active.scope !== "main") return null;
          return selectionState.active.id;
        }
        return selectionState.active.id;
      }

      function getRenderActiveIdForMain() {
        debugThrottle("render", "getRenderActiveIdForMain", "getRenderActiveIdForMain", "trace", 1000);
        if (!selectionState.active.id) return null;
        if (selectionState.active.scope === "main") return selectionState.active.id;
        return null;
      }

      function getRenderFocusIdForMain() {
        debugThrottle("render", "getRenderFocusIdForMain", "getRenderFocusIdForMain", "trace", 1000);
        if (!selectionState.active.id) return null;
        if (selectionState.active.scope === "main") return selectionState.active.id;
        if (selectionState.active.scope === "hub") {
          return selectionState.active.hubId || selectionState.active.id;
        }
        return selectionState.active.id;
      }

      function getRenderActiveIdForHub() {
        debugThrottle("render", "getRenderActiveIdForHub", "getRenderActiveIdForHub", "trace", 1000);
        if (!selectionState.active.id) return null;
        if (selectionState.active.scope === "hub") return selectionState.active.id;
        return null;
      }

      function getRenderFocusIdForHub() {
        debugThrottle("render", "getRenderFocusIdForHub", "getRenderFocusIdForHub", "trace", 1000);
        if (!selectionState.active.id) return null;
        return selectionState.active.id;
      }

      function getHoverFocusId() {
        return hoverNode && hoverNode.id !== undefined && hoverNode.id !== null
          ? String(hoverNode.id)
          : null;
      }

      function isConnectedForRender(nodeId, focusId, ctxId) {
        debugThrottle("render", "isConnectedForRender", "isConnectedForRender", "trace", 1000);
        if (!focusId && !ctxId) return true;
        return isConnectedWith(nodeId, focusId, ctxId);
      }

      function isLinkConnectedForRenderWithHover(l, focusId, ctxId) {
        debugThrottle("render", "isLinkConnectedForRenderWithHover", "isLinkConnectedForRenderWithHover", "trace", 1000);
        var hoverId = getHoverFocusId();
        if (!focusId && !ctxId && !hoverId) return true;
        if ((focusId || ctxId) && isLinkConnectedForRender(l, focusId, ctxId)) return true;
        if (hoverId) return isLinkConnectedForRender(l, hoverId, null);
        return false;
      }

      function isLinkEmphasizedForRender(l, focusId, ctxId) {
        debugThrottle("render", "isLinkEmphasizedForRender", "isLinkEmphasizedForRender", "trace", 1000);
        var hoverId = getHoverFocusId();
        if (!focusId && !ctxId && !hoverId) return false;
        return isLinkConnectedForRenderWithHover(l, focusId, ctxId);
      }

      function isHoverConnectedNode(nodeId) {
        var hoverId = getHoverFocusId();
        if (!hoverId) return false;
        if (String(nodeId) === String(hoverId)) return false;
        return isConnectedWith(String(nodeId), hoverId, null);
      }

      var mainPointerDebugCanvas = null;
      function ensureMainPointerDebugCanvas() {
        if (!debugShowPointerMap) {
          if (mainPointerDebugCanvas) mainPointerDebugCanvas.style.display = "none";
          return null;
        }
        if (mainPointerDebugCanvas) {
          mainPointerDebugCanvas.style.display = "block";
          return mainPointerDebugCanvas;
        }
        var wrap = document.getElementById("canvas-wrap") || graphEl;
        if (!wrap) return null;
        var c = document.createElement("canvas");
        c.id = "pointer-debug-main";
        c.style.position = "absolute";
        c.style.left = "0";
        c.style.top = "0";
        c.style.zIndex = "3";
        c.style.pointerEvents = "none";
        c.style.opacity = "0.65";
        wrap.appendChild(c);
        mainPointerDebugCanvas = c;
        return c;
      }

      function drawPointerDebugMain() {
        if (!debugShowPointerMap) return;
        if (!Graph || typeof Graph.graph2ScreenCoords !== "function") return;
        var c = ensureMainPointerDebugCanvas();
        if (!c) return;
        var rect = graphEl.getBoundingClientRect();
        var w = Math.max(1, rect.width || 1);
        var h = Math.max(1, rect.height || 1);
        var dpr = window.devicePixelRatio || 1;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
          c.style.width = w + "px";
          c.style.height = h + "px";
        }
        var ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var nodesToDraw = activeNodes && activeNodes.length ? activeNodes : (Graph.graphData().nodes || []);
        nodesToDraw.forEach(function (n) {
          if (!n) return;
          if (isActiveHubMember(n)) return;
          var screen = Graph.graph2ScreenCoords(n.x || 0, n.y || 0);
          if (!screen) return;
          var r = 0;
          if (isNoteTypeHub(n) && isHubExpanded(n)) {
            r = hubPlusRadius(n);
          } else {
            r = nodeBaseRadius(n) + (isNoteTypeHub(n) ? 0 : 2);
          }
          var col = n.__indexColor || "rgba(255,0,255,0.8)";
          ctx.beginPath();
          ctx.fillStyle = col;
          ctx.arc(screen.x, screen.y, r, 0, 2 * Math.PI, false);
          ctx.fill();
        });
        ctx.restore();
      }

      function applyDebugToggles() {
        debugShowPointerMap = !!(debugEnabled && debugToggles.shadow_canvas);
        debugLinkLabels.enabled = !!(debugEnabled && debugToggles.link_labels);
        debugEngineEnabled = !!(debugEnabled && debugToggles.engine_panel);
        window.GraphDebugToastsEnabled = !!debugToggles.debug_toasts;
        window.GraphDebugLevels = debugLevels;
        window.DebugLevels = debugLevels;
        if (DebugToast) {
          if (debugToggles.debug_toasts === false) {
            if (typeof DebugToast.setEnabled === "function") DebugToast.setEnabled(false);
          } else if (typeof DebugToast.clearOverride === "function") {
            DebugToast.clearOverride();
          }
          if (typeof DebugToast.setLevels === "function") {
            DebugToast.setLevels(debugLevels);
          }
        }
        var engineWrap = document.getElementById("debug-engine");
        if (engineWrap) engineWrap.style.display = debugEngineEnabled ? "flex" : "none";
        if (!debugShowPointerMap) {
          if (mainPointerDebugCanvas) mainPointerDebugCanvas.style.display = "none";
          return;
        }
        ensureMainPointerDebugCanvas();
      }

      // --- Debug: link distance overlay ---
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
        var minPx = min * zoom;
        var maxPx = max * zoom;
        el.textContent =
          "link dist (graph units)\n" +
          "min: " +
          min.toFixed(1) +
          "  max: " +
          max.toFixed(1) +
          "min/max px≈ " +
          minPx.toFixed(1) +
          " / " +
          maxPx.toFixed(1) +
          "\nlinks: " +
          count;
        el.style.display = "block";
      }

      // --- Selection / connectivity helpers ---
      function isConnectedWith(id, selId, ctxId) {
        var useSel = selId !== undefined ? selId : selectedId;
        var useCtx = ctxId !== undefined ? ctxId : ctxMenuId;
        if (!useSel && !useCtx) return true;
        if (useSel && id === useSel) return true;
        if (useCtx && id === useCtx) return true;
        var focus = useSel || useCtx;
        if (focus && isFamilyHubId(focus)) {
          var fidHub = getFamilyIdFromHubId(focus);
          if (fidHub) {
            if (String(id) === String(focus)) return true;
            var setHub = familyMembersByFid[fidHub];
            if (setHub && setHub.has(String(id))) return true;
          }
        }
        var set = neighborMap[focus];
        if (set && set.has(id)) return true;
        if (familyChainEdges && useSel) {
          var node = nodeById[String(useSel)];
          var fams = getNodeFamilies(node);
          if (node && fams.length) {
            var hubNode = nodeById[String(id)];
            var isFamilyHub = (hubNode && hubNode.kind === "family") || String(id).indexOf("family:") === 0;
            if (isFamilyHub) {
              var sel = String(useSel);
              for (var i = 0; i < fams.length; i++) {
                var fid = String(fams[i]);
                var parentMap = familyChainParent[fid] || {};
                var hubMap = familyHubByMember[fid] || {};
                var stack = [sel];
                var visited = {};
                while (stack.length) {
                  var cur = stack.pop();
                  if (visited[cur]) continue;
                  visited[cur] = true;
                  var parents = parentMap[cur];
                  if (Array.isArray(parents) && parents.length) {
                    parents.forEach(function (p) {
                      var parent = String(p);
                      if (!visited[parent]) stack.push(parent);
                    });
                  } else if (parents) {
                    var parentSingle = String(parents);
                    if (!visited[parentSingle]) stack.push(parentSingle);
                  } else {
                    var hubId = hubMap[cur];
                    if (hubId && String(hubId) === String(id)) return true;
                  }
                }
              }
            }
          }
        }
        return false;
      }

      function isConnected(id) {
        return isConnectedWith(id, undefined, undefined);
      }

      function isLinkConnectedWith(l, selId, ctxId) {
        var useSel = selId !== undefined ? selId : selectedId;
        var useCtx = ctxId !== undefined ? ctxId : ctxMenuId;
        if (!useSel && !useCtx) return true;
        var ids = linkIds(l);
        if (useSel && (ids.s === useSel || ids.t === useSel)) return true;
        if (useCtx && (ids.s === useCtx || ids.t === useCtx)) return true;
        return false;
      }

      function isLinkConnected(l) {
        return isLinkConnectedWith(l, undefined, undefined);
      }

      // --- Link styling / color helpers ---
      function isAutoLinkEdge(l) {
        if (!l) return false;
        if (l.layer === "mass_linker") return true;
        return l.layer === "reference" && l.meta && l.meta.manual === false;
      }

      function linkStrokeColor(l) {
        debugThrottle("render", "linkStrokeColor", "linkStrokeColor", "trace", 1000);
        if (l.meta && l.meta.flow_only) {
          return "rgba(0,0,0,0)";
        }
        if (!isLayerEnabled(l.layer)) {
          return "rgba(0,0,0,0)";
        }
        var c = isKanjiComponent(l) ? componentColor() : layerColor(l.layer, layerColors);
        if (isAutoLinkEdge(l)) {
          return colorWithAlpha(c, autoRefOpacity);
        }
        if (isKanjiComponent(l) && isKanjiLayerActive()) {
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
        if (!isLayerEnabled(l.layer)) return [];
        var style = isKanjiComponent(l)
          ? kanjiComponentStyle || "solid"
          : layerStyles[l.layer] || "solid";
        if (style === "pointed") style = "dotted";
        if (style === "dashed") return [6, 4];
        if (style === "dotted") return [1, 4];
        return [];
      }

      // --- Link physics gating + strength ---
      function isLinkVisibleForPhysics(l) {
        if (!l) return false;
        if (l.meta && l.meta.flow_only) return false;
        if (!isLayerEnabled(l.layer)) return false;
        if (isKanjiComponent(l) && (!isKanjiLayerActive() || !kanjiComponentsEnabled)) return false;
        if (isKanjiComponent(l) && isKanjiLayerActive() && kanjiComponentsEnabled && kanjiComponentFocusOnly) {
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

      function resolvePhysicsValue(key, override) {
        debugThrottle("config", "resolvePhysicsValue", "resolvePhysicsValue key=" + key, "trace", 1000);
        if (override && override.enabled) {
          var v = override[key];
          if (v !== undefined && v !== null) return v;
        }
        return physics[key];
      }

      function getLinkStrengthWithBase(l, baseStrength) {
        debugThrottle("sim_links", "getLinkStrengthWithBase", "getLinkStrengthWithBase layer=" + (l && l.layer), "trace", 500);
        if (!isLinkVisibleForPhysics(l)) return 0;
        if (!l) return baseStrength;
        var maxStrength = 1.5;
        function resolveStrength(raw) {
          if (typeof raw !== "number" || !isFinite(raw)) return null;
          if (raw < 0) return 0;
          return Math.min(raw, maxStrength);
        }
        if (l.layer === "kanji" && l.meta && l.meta.kind === "component") {
          var k = resolveStrength(linkStrengths.kanji_component);
          if (k !== null) {
            return k;
          }
        }
        var v = resolveStrength(linkStrengths[l.layer]);
        var strength = v !== null ? v : baseStrength;
        var nMetric = neighborMetricForLink(l);
        if (nMetric > 0) {
          strength = neighborScaleStrength(strength, nMetric);
        }
        if (referenceDampingEnabled && (l.layer === "reference" || l.layer === "mass_linker")) {
          var idsRef = linkIds(l);
          var inDeg = referenceInDegById[String(idsRef.t)] || 0;
          var denom = Math.max(1, Math.log1p(inDeg));
          var refFactor = denom > 0 ? (1 / denom) : 1;
          strength = strength * refFactor;
        }
        if (hubDampingEnabled) {
          var info = linkHubInfo(l);
          var s = info.s;
          var t = info.t;
          var ds = s && isFinite(s.__deg) ? s.__deg : 0;
          var dt = t && isFinite(t.__deg) ? t.__deg : 0;
          var dmax = Math.max(ds, dt);
          if (dmax > 1) {
            var hubFactor = 1 / (1 + HUB_DAMPING_LAMBDA * dmax);
            strength = strength * hubFactor;
          }
        }
        if (strength < 0) strength = 0;
        if (strength > maxStrength) strength = maxStrength;
        return strength;
      }

      function getLinkStrength(l) {
        debugThrottle("sim_links", "getLinkStrength", "getLinkStrength", "trace", 1000);
        return getLinkStrengthWithBase(l, physics.link_strength);
      }

      function getHubLinkStrength(l) {
        debugThrottle("sim_links", "getHubLinkStrength", "getHubLinkStrength", "trace", 1000);
        var base = resolvePhysicsValue("link_strength", hubPhysics);
        return getLinkStrengthWithBase(l, base);
      }

      function getMainLinkStrength(l) {
        debugThrottle("sim_links", "getMainLinkStrength", "getMainLinkStrength", "trace", 1000);
        if (isHubInternalLink(l)) return 0;
        return getLinkStrength(l);
      }

      // --- Link render properties ---
      function linkStrokeWidth(l, focusId, ctxId) {
        debugThrottle("render", "linkStrokeWidth", "linkStrokeWidth", "trace", 1000);
        if (l && l.meta && l.meta.flow_only) return 0;
        if (!isLayerEnabled(l.layer)) return 0;
        var base = l && (l.layer === "reference" || l.layer === "mass_linker") ? 0.8 : 1.2;
        var emph = isLinkEmphasizedForRender(l, focusId, ctxId);
        return emph ? base * 2 : base;
      }

      function isLinkConnectedForRender(l, selId, ctxId) {
        if (isLinkConnectedWith(l, selId, ctxId)) return true;
        if (!familyChainEdges || !selId) return false;
        if (selId && isFamilyHubId(selId)) {
          if (!l || !l.meta || !l.meta.fid) return false;
          var fidHub = getFamilyIdFromHubId(selId);
          if (fidHub && String(l.meta.fid) === String(fidHub)) {
            return l.layer === "family" || l.layer === "family_hub";
          }
        }
        if (!l || l.layer !== "family_hub" || !l.meta) return false;
        var kind = l.meta.kind || "";
        if (kind !== "chain" && kind !== "hub") return false;
        var sid = String(selId);
        if (sid.startsWith("family:")) return false;
        var path = getFamilyChainPathSet(sid);
        if (!path) return false;
        var key = familyChainEdgeKey(l);
        if (key && path.has(key)) return true;
        if (kind === "hub") {
          var ids = linkIds(l);
          var fid = l.meta && l.meta.fid !== undefined && l.meta.fid !== null ? String(l.meta.fid) : "";
          if (fid) {
            var alt = fid + "|" + String(ids.t) + "|" + String(ids.s) + "|hub";
            if (path.has(alt)) return true;
          }
        }
        return false;
      }

      function familyChainEdgeKey(l) {
        if (!l || !l.meta || !l.meta.fid) return "";
        var ids = linkIds(l);
        return String(l.meta.fid) + "|" + ids.s + "|" + ids.t + "|" + String(l.meta.kind || "");
      }

      function getFamilyChainPathSet(selId) {
        if (!familyChainEdges || !selId) return null;
        if (familyChainCache.selId === selId && familyChainCache.version === activeLinksVersion) {
          return familyChainCache.set;
        }
        var node = nodeById[String(selId)];
        var fams = getNodeFamilies(node);
        if (!node || !fams.length) {
          familyChainCache = { selId: selId, version: activeLinksVersion, set: null };
          return null;
        }
        var set = new Set();
        fams.forEach(function (fidRaw) {
          var fid = String(fidRaw);
          var parentMap = familyChainParent[fid] || {};
          var hubMap = familyHubByMember[fid] || {};
          var stack = [String(selId)];
          var visited = {};
          while (stack.length) {
            var cur = stack.pop();
            if (visited[cur]) continue;
            visited[cur] = true;
            var parents = parentMap[cur];
            if (Array.isArray(parents) && parents.length) {
              parents.forEach(function (p) {
                var parent = String(p);
                set.add(fid + "|" + cur + "|" + parent + "|chain");
                if (!visited[parent]) stack.push(parent);
              });
            } else if (parents) {
              var parentSingle = String(parents);
              set.add(fid + "|" + cur + "|" + parentSingle + "|chain");
              if (!visited[parentSingle]) stack.push(parentSingle);
            } else {
              var hubId = hubMap[cur];
              if (hubId) {
                set.add(fid + "|" + cur + "|" + String(hubId) + "|hub");
              }
            }
          }
        });
        familyChainCache = { selId: selId, version: activeLinksVersion, set: set };
        return set;
      }

      function linkBaseColor(l, selId, ctxId) {
        debugThrottle("render", "linkBaseColor", "linkBaseColor", "trace", 1000);
        if (l && l.meta && l.meta.flow_only) {
          return "rgba(0,0,0,0)";
        }
        if (!isLayerEnabled(l.layer)) {
          return "rgba(0,0,0,0)";
        }
        var connected = isLinkConnectedForRender(l, selId, ctxId);
        var c = isKanjiComponent(l) ? componentColor() : layerColor(l.layer, layerColors);
        var alpha = 1;
        if (isAutoLinkEdge(l)) {
          alpha = Math.min(1, alpha * autoRefOpacity);
        }
        if (isKanjiComponent(l) && isKanjiLayerActive()) {
          alpha = Math.min(1, alpha * kanjiComponentOpacity);
        }
        if (l.meta && l.meta.same_prio) {
          alpha = Math.min(1, alpha * samePrioOpacity);
        }
        var base = colorWithAlpha(c, alpha);
        if (!connected) {
          return applyDim(base, 0.2);
        }
        return base;
      }

      function getLinkNodes(l) {
        if (!l) return { s: null, t: null };
        var s = l.source && typeof l.source === "object" ? l.source : nodeById[String(l.source)];
        var t = l.target && typeof l.target === "object" ? l.target : nodeById[String(l.target)];
        return { s: s || null, t: t || null };
      }

      function getHubExternalClip(l, lineWidth) {
        if (!l || l.__hub_internal) return null;
        var nodes = getLinkNodes(l);
        var s = nodes.s;
        var t = nodes.t;
        if (!s || !t) return null;
        var sIsHub = isNoteTypeHub(s) && isHubExpanded(s);
        var tIsHub = isNoteTypeHub(t) && isHubExpanded(t);
        if (!sIsHub && !tIsHub) return null;
        var hubNode = sIsHub ? s : t;
        var other = sIsHub ? t : s;
        if (isHubMemberOf(other, hubNode)) return null;
        var dx = (other.x || 0) - (hubNode.x || 0);
        var dy = (other.y || 0) - (hubNode.y || 0);
        var dist = Math.sqrt(dx * dx + dy * dy) || 0;
        if (!isFinite(dist) || dist <= 0) return null;
        var r = hubExpandedRadiusScaled(hubNode);
        if (!isFinite(r) || r <= 0) return null;
        var cut = (typeof lineWidth === "number" && isFinite(lineWidth)) ? (lineWidth * 0.75) : 0;
        if (cut > 0) r = Math.max(1, r - cut);
        var ux = dx / dist;
        var uy = dy / dist;
        var clipPoint = { x: (hubNode.x || 0) + ux * r, y: (hubNode.y || 0) + uy * r };
        return {
          hub: hubNode,
          other: other,
          hubIsSource: sIsHub,
          point: clipPoint,
        };
      }

      function drawMainLink(l, ctx, globalScale) {
        if (!l || !ctx) return;
        if (l.meta && l.meta.flow_only) return;
        if (!isLayerEnabled(l.layer)) return;
        var nodes = getLinkNodes(l);
        var s = nodes.s;
        var t = nodes.t;
        if (!s || !t) return;
        var scale = globalScale || 1;
        if (!isFinite(scale) || scale <= 0) scale = 1;
        var width = linkStrokeWidth(l, getRenderFocusIdForMain(), ctxMenuId);
        if (!width || width <= 0) return;
        var stroke = linkBaseColor(l, getRenderFocusIdForMain(), ctxMenuId);
        if (!stroke || stroke === "rgba(0,0,0,0)") return;
        var dash = linkDashPattern(l) || [];
        var sPos = { x: s.x || 0, y: s.y || 0 };
        var tPos = { x: t.x || 0, y: t.y || 0 };
        var curve = l.curve || 0;
        var clip = getHubExternalClip(l, width);
        if (clip) {
          if (clip.hubIsSource) {
            sPos = clip.point;
          } else {
            tPos = clip.point;
          }
          curve = 0;
        }
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width / scale;
        if (dash.length) {
          ctx.setLineDash(dash.map(function (d) { return d / scale; }));
        } else {
          ctx.setLineDash([]);
        }
        drawLinkPath(ctx, sPos, tPos, curve);
        ctx.stroke();
        ctx.restore();
        drawLinkDistanceLabel(l, ctx, globalScale);
      }

      function linkDashPattern(l) {
        debugThrottle("render", "linkDashPattern", "linkDashPattern", "trace", 1000);
        if (!isLayerEnabled(l.layer)) return [];
        var style = isKanjiComponent(l)
          ? kanjiComponentStyle || "solid"
          : layerStyles[l.layer] || "solid";
        if (style === "dashed") return [2, 1];
        if (style === "pointed" || style === "dotted") return [0.3, 1];
        return [];
      }

      function particleColor(l) {
        if (!isLayerEnabled(l.layer)) return "rgba(0,0,0,0)";
        var alpha = 0.7;
        if (isAutoLinkEdge(l)) {
          alpha = Math.min(1, alpha * autoRefOpacity);
        }
        if (isKanjiComponent(l) && isKanjiLayerActive()) {
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

      // --- Link geometry / curves ---
      function linkCurveValue(l) {
        debugThrottle("render", "linkCurveValue", "linkCurveValue", "trace", 1000);
        var c = l && typeof l.curve === "number" ? l.curve : 0;
        if (!c) return 0;
        return c;
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

      function hubAbsPos(hubNode, simNode) {
        return {
          x: (hubNode.x || 0) + (simNode.x || 0),
          y: (hubNode.y || 0) + (simNode.y || 0),
        };
      }

      function pointOnCurve(sx, sy, tx, ty, curve, t) {
        if (!curve) {
          return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t };
        }
        var cp = curveControlPoint(sx, sy, tx, ty, curve);
        if (!cp) {
          return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t };
        }
        var inv = 1 - t;
        var x = inv * inv * sx + 2 * inv * t * cp.x + t * t * tx;
        var y = inv * inv * sy + 2 * inv * t * cp.y + t * t * ty;
        return { x: x, y: y };
      }

      function updateHubLinkParticles(sim, nowTs) {
        if (!sim || !sim.links || !sim.hubNode) return;
        var now = nowTs || nowMs();
        var last = sim.__last_particle_ts || now;
        var dt = Math.max(1, now - last);
        sim.__last_particle_ts = now;
        var step = dt / 16.67;
        var hubNode = sim.hubNode;
        var nodesById = sim.nodesById || {};
        sim.links.forEach(function (l) {
          var sId = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var tId = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sNode = nodesById[String(sId)];
          var tNode = nodesById[String(tId)];
          if (!sNode || !tNode) return;
          var sp = hubAbsPos(hubNode, sNode);
          var tp = hubAbsPos(hubNode, tNode);
          var dx = sp.x - tp.x;
          var dy = sp.y - tp.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var count = getFlowParticleCount(l, len);
          if (!count) {
            l.__particle_count = 0;
            l.__particle_speed = 0;
            if (l.__photons) l.__photons.length = 0;
            return;
          }
          l.__particle_count = count;
          l.__particle_speed = getFlowParticleSpeed(l, len);
          var photons = l.__photons;
          if (!photons) photons = [];
          if (photons.length > count) {
            photons.length = count;
          } else if (photons.length < count) {
            var add = count - photons.length;
            for (var i = 0; i < add; i++) photons.push({});
          }
          for (var p = 0; p < photons.length; p++) {
            var ph = photons[p];
            if (typeof ph.t !== "number") {
              ph.t = Math.random();
            } else {
              ph.t = (ph.t + l.__particle_speed * step) % 1;
            }
          }
          l.__photons = photons;
        });
      }

      // --- Drag cluster + debug labels ---
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
        debugThrottle("render", "drawLinkDistanceLabel", "drawLinkDistanceLabel", "trace", 1000);
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
        var info = getLinkDistanceInfo(l);
        var scale = globalScale || 1;
        if (scale < 1) return;
        var cap = 2;
        var base = 4.2;
        var fontSize = (base * Math.min(scale, cap)) / scale;
        var s = l.source;
        var t = l.target;
        if (s && typeof s !== "object") s = nodeById[String(s)];
        if (t && typeof t !== "object") t = nodeById[String(t)];
        if (!s || !t) return;
        var ang = Math.atan2((t.y || 0) - (s.y || 0), (t.x || 0) - (s.x || 0));
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) {
          ang += Math.PI;
        }
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(ang);
        ctx.font = fontSize + "px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(1, 2 / scale);
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        var text = dist.toFixed(1);
        if (info) {
          var target = info.total;
          var extra = info.extra;
          text += " | L:" + (isFinite(target) ? target.toFixed(1) : "?");
          if (isFinite(extra) && Math.abs(extra) > 0.01) {
            text += " (+" + extra.toFixed(1) + ")";
          }
          text += info.phys ? " P1" : " P0";
        }
        ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      // --- Hub member helper ---
      var HUB_LINK_DISTANCE_SCALE = 0.4;
      function getLinkDistance(l) {
        debugThrottle("sim_links", "getLinkDistance", "getLinkDistance", "trace", 1000);
        var info = getLinkDistanceInfo(l, null);
        return info ? info.total : physics.link_distance;
      }

      function getHubLinkDistance(l) {
        debugThrottle("sim_links", "getHubLinkDistance", "getHubLinkDistance", "trace", 1000);
        var base = resolvePhysicsValue("link_distance", hubPhysics);
        if (isFinite(HUB_LINK_DISTANCE_SCALE) && HUB_LINK_DISTANCE_SCALE > 0) {
          base = base * HUB_LINK_DISTANCE_SCALE;
        }
        var info = getLinkDistanceInfo(l, base);
        return info ? info.total : base;
      }

      function getLinkDistanceInfo(l, baseOverride) {
        debugThrottle("sim_links", "getLinkDistanceInfo", "getLinkDistanceInfo", "trace", 1000);
        var base = typeof baseOverride === "number" ? baseOverride : physics.link_distance;
        if (l && typeof baseOverride !== "number") {
          var layer = l.layer;
          if (layer === "kanji" && l.meta && l.meta.kind === "component") {
            layer = "kanji_component";
          }
          if (typeof linkDistances[layer] === "number" && isFinite(linkDistances[layer])) {
            base = linkDistances[layer];
          }
        }
        if (!l) return { base: base, extra: 0, total: base, phys: false };
        if (!isLinkVisibleForPhysics(l)) return { base: base, extra: 0, total: base, phys: false };
        var info = linkHubInfo(l);
        var s = info.s;
        var t = info.t;
        var sHub = s && s.__hub_parent ? String(s.__hub_parent) : "";
        var tHub = t && t.__hub_parent ? String(t.__hub_parent) : "";
        if (sHub && sHub === tHub && expandedHubs.has(sHub)) {
          var hubNode = nodeById[sHub];
          if (hubNode) {
            var inner = Math.min(base, hubExpandedRadiusScaled(hubNode));
            return { base: base, extra: inner - base, total: inner, phys: true };
          }
        }
        var extra = 0;
        if (s && isHubExpanded(s) && !isHubMemberOf(t, s)) {
          extra += hubExpandedRadiusScaled(s);
        }
        if (t && isHubExpanded(t) && !isHubMemberOf(s, t)) {
          extra += hubExpandedRadiusScaled(t);
        }
        var total = base + extra;
        var nMetric = neighborMetricForLink(l);
        if (nMetric > 0) {
          var distBase = neighborScaleDistance(base, nMetric);
          var ratio2 = base !== 0 ? (distBase / base) : 1;
          base = distBase;
          extra = extra * ratio2;
          total = base + extra;
        }
        if (base < 1) {
          base = 1;
          total = base + extra;
        }
        return { base: base, extra: extra, total: total, phys: true };
      }

      function neighborScalingEnabled() {
        return !!(neighborScaling && neighborScaling.mode && neighborScaling.mode !== "none");
      }

      var NEIGHBOR_SCALE_STRENGTH = 0.6;
      var NEIGHBOR_SCALE_DISTANCE = 0.6;
      var HUB_DAMPING_LAMBDA = 0.4;
      var HUB_BOUNDARY_INSET = 10;
      var HUB_EXTERNAL_MARGIN = 14;
      var HUB_EXTERNAL_PUSH = 1.6;
      var NEIGHBOR_SCALING_LAYERS = {
        reference: true,
        mass_linker: true,
        family: true,
        family_hub: true,
        example: true,
        kanji: true,
        kanji_component: true,
      };
      var LINK_REFINEMENT_LAYERS = {
        reference: true,
        mass_linker: true,
        example: true,
        kanji: true,
        kanji_component: true,
      };

      function linkKey(l) {
        if (!l) return "";
        var ids = linkIds(l);
        var layer = l.layer || "";
        var kind = l.meta && l.meta.kind ? l.meta.kind : "";
        var fid = l.meta && l.meta.fid ? l.meta.fid : "";
        var value = l.meta && l.meta.value ? l.meta.value : "";
        var tag = l.meta && l.meta.tag ? l.meta.tag : "";
        return (
          layer +
          "|" +
          ids.s +
          "|" +
          ids.t +
          "|" +
          kind +
          "|" +
          fid +
          "|" +
          value +
          "|" +
          tag
        );
      }

      function isRefineLayer(l) {
        var layer = neighborScalingLayerKey(l);
        return !!LINK_REFINEMENT_LAYERS[layer];
      }

      function neighborScalingLayerKey(l) {
        if (!l) return "";
        var layer = l.layer;
        if (layer === "kanji" && l.meta && l.meta.kind === "component") {
          layer = "kanji_component";
        }
        return layer || "";
      }

      function neighborWeightForLayer(layer) {
        if (!layer) return 0;
        if (neighborScaling.weights && typeof neighborScaling.weights[layer] === "number") {
          return neighborScaling.weights[layer];
        }
        return NEIGHBOR_DEFAULT_WEIGHTS[layer] !== undefined ? NEIGHBOR_DEFAULT_WEIGHTS[layer] : 1;
      }

      function isNeighborScalingLink(l) {
        if (!neighborScalingEnabled()) return false;
        if (!isLinkVisibleForPhysics(l)) return false;
        var layer = neighborScalingLayerKey(l);
        if (!NEIGHBOR_SCALING_LAYERS[layer]) return false;
        if (neighborWeightForLayer(layer) <= 0) return false;
        if (layer === "family" && l.meta && l.meta.same_prio) return false;
        return true;
      }

      function weightedJaccard(a, b) {
        var keys = {};
        Object.keys(a || {}).forEach(function (k) { keys[k] = true; });
        Object.keys(b || {}).forEach(function (k) { keys[k] = true; });
        var inter = 0;
        var uni = 0;
        Object.keys(keys).forEach(function (k) {
          var wa = a && a[k] ? a[k] : 0;
          var wb = b && b[k] ? b[k] : 0;
          if (wa === 0 && wb === 0) return;
          inter += Math.min(wa, wb);
          uni += Math.max(wa, wb);
        });
        return uni > 0 ? (inter / uni) : 0;
      }

      function weightedOverlap(a, b) {
        var keys = {};
        var sumA = 0;
        var sumB = 0;
        Object.keys(a || {}).forEach(function (k) {
          keys[k] = true;
          sumA += a[k] || 0;
        });
        Object.keys(b || {}).forEach(function (k) {
          keys[k] = true;
          sumB += b[k] || 0;
        });
        if (sumA <= 0 || sumB <= 0) return 0;
        var inter = 0;
        Object.keys(keys).forEach(function (k) {
          var wa = a && a[k] ? a[k] : 0;
          var wb = b && b[k] ? b[k] : 0;
          if (wa === 0 && wb === 0) return;
          inter += Math.min(wa, wb);
        });
        var denom = Math.min(sumA, sumB);
        return denom > 0 ? (inter / denom) : 0;
      }

      function computeNeighborMetrics(links) {
        var metrics = {};
        if (!neighborScalingEnabled() || !links || !links.length) return metrics;
        var neighbors = {};
        var directed = neighborScaling.directed || "undirected";

        function addNeighbor(a, b, w) {
          if (!neighbors[a]) neighbors[a] = {};
          var cur = neighbors[a][b] || 0;
          if (w > cur) neighbors[a][b] = w;
        }

        links.forEach(function (l) {
          if (!isNeighborScalingLink(l)) return;
          var ids = linkIds(l);
          var sk = String(ids.s);
          var tk = String(ids.t);
          var w = neighborWeightForLayer(neighborScalingLayerKey(l));
          if (!isFinite(w) || w <= 0) return;
          if (directed === "out") {
            addNeighbor(sk, tk, w);
          } else if (directed === "in") {
            addNeighbor(tk, sk, w);
          } else {
            addNeighbor(sk, tk, w);
            addNeighbor(tk, sk, w);
          }
        });
        var coeff = {};
        Object.keys(neighbors).forEach(function (id) {
          var map = neighbors[id] || {};
          var keys = Object.keys(map);
          var k = keys.length;
          if (k < 2) {
            coeff[id] = 0;
            return;
          }
          var arr = keys;
          var edges = 0;
          for (var i = 0; i < arr.length; i++) {
            var ni = arr[i];
            var nmap = neighbors[ni];
            if (!nmap) continue;
            for (var j = i + 1; j < arr.length; j++) {
              if (nmap[arr[j]] > 0) edges += 1;
            }
          }
          var base = (2 * edges) / (k * (k - 1));
          var sumW = 0;
          for (var m = 0; m < arr.length; m++) {
            sumW += map[arr[m]] || 0;
          }
          var avgW = k ? (sumW / k) : 0;
          coeff[id] = base * avgW;
        });
        var mode = neighborScaling.mode || "none";
        if (mode === "ccm") {
          return coeff;
        }
        if (mode === "twohop") {
          Object.keys(neighbors).forEach(function (id) {
            var map = neighbors[id] || {};
            var keys = Object.keys(map);
            var k = keys.length;
            if (!k) {
              metrics[id] = 0;
              return;
            }
            var sum = 0;
            var wsum = 0;
            keys.forEach(function (nid) {
              var w = map[nid] || 0;
              sum += (coeff[nid] || 0) * w;
              wsum += w;
            });
            metrics[id] = wsum > 0 ? (sum / wsum) : 0;
          });
          return metrics;
        }
        if (mode === "jaccard" || mode === "overlap") {
          Object.keys(neighbors).forEach(function (id) {
            var map = neighbors[id] || {};
            var keys = Object.keys(map);
            var k = keys.length;
            if (!k) {
              metrics[id] = 0;
              return;
            }
            var sum = 0;
            var wsum = 0;
            keys.forEach(function (nid) {
              var nmap = neighbors[nid] || {};
              var val = (mode === "overlap") ? weightedOverlap(map, nmap) : weightedJaccard(map, nmap);
              var w = map[nid] || 0;
              sum += val * w;
              wsum += w;
            });
            metrics[id] = wsum > 0 ? (sum / wsum) : 0;
          });
          return metrics;
        }
        return metrics;
      }

      function buildNeighborWeightMap(links) {
        var neighbors = {};
        if (!neighborScalingEnabled() || !links || !links.length) return neighbors;
        var directed = neighborScaling.directed || "undirected";
        function addNeighbor(a, b, w) {
          if (!neighbors[a]) neighbors[a] = {};
          var cur = neighbors[a][b] || 0;
          if (w > cur) neighbors[a][b] = w;
        }
        links.forEach(function (l) {
          if (!isNeighborScalingLink(l)) return;
          var ids = linkIds(l);
          var sk = String(ids.s);
          var tk = String(ids.t);
          var w = neighborWeightForLayer(neighborScalingLayerKey(l));
          if (!isFinite(w) || w <= 0) return;
          if (directed === "out") {
            addNeighbor(sk, tk, w);
          } else if (directed === "in") {
            addNeighbor(tk, sk, w);
          } else {
            addNeighbor(sk, tk, w);
            addNeighbor(tk, sk, w);
          }
        });
        return neighbors;
      }

      function computeNeighborCoeff(neighbors) {
        var coeff = {};
        Object.keys(neighbors || {}).forEach(function (id) {
          var map = neighbors[id] || {};
          var keys = Object.keys(map);
          var k = keys.length;
          if (k < 2) {
            coeff[id] = 0;
            return;
          }
          var edges = 0;
          for (var i = 0; i < keys.length; i++) {
            var ni = keys[i];
            var nmap = neighbors[ni];
            if (!nmap) continue;
            for (var j = i + 1; j < keys.length; j++) {
              if (nmap[keys[j]] > 0) edges += 1;
            }
          }
          var base = (2 * edges) / (k * (k - 1));
          var sumW = 0;
          for (var m = 0; m < keys.length; m++) {
            sumW += map[keys[m]] || 0;
          }
          var avgW = k ? (sumW / k) : 0;
          coeff[id] = base * avgW;
        });
        return coeff;
      }

      function computeTwoHopMetrics(neighbors, coeff) {
        var metrics = {};
        Object.keys(neighbors || {}).forEach(function (id) {
          var map = neighbors[id] || {};
          var keys = Object.keys(map);
          var k = keys.length;
          if (!k) {
            metrics[id] = 0;
            return;
          }
          var sum = 0;
          var wsum = 0;
          keys.forEach(function (nid) {
            var w = map[nid] || 0;
            sum += (coeff[nid] || 0) * w;
            wsum += w;
          });
          metrics[id] = wsum > 0 ? (sum / wsum) : 0;
        });
        return metrics;
      }

      function buildKanjiIdf(links) {
        var counts = {};
        var total = 0;
        (links || []).forEach(function (l) {
          if (!l || l.layer !== "kanji") return;
          if (!l.meta || !l.meta.value) return;
          var key = String(l.meta.value);
          counts[key] = (counts[key] || 0) + 1;
          total += 1;
        });
        var idf = {};
        Object.keys(counts).forEach(function (k) {
          var df = counts[k] || 0;
          var val = df > 0 ? (1 / Math.log1p(df)) : 0;
          if (!isFinite(val) || val < 0) val = 0;
          idf[k] = val;
        });
        return idf;
      }

      function rebuildLinkScoreCache(links) {
        linkScoreRawByKey = {};
        linkScoreByKey = {};
        linkScoreLayerScores = {};
        if (!links || !links.length) return;
        var mode = neighborScaling.mode || "none";
        var scoringActive = mode !== "none" || kanjiTfidfEnabled;
        var neighbors = {};
        var coeff = {};
        var twoHop = {};
        if (neighborScalingEnabled()) {
          neighbors = buildNeighborWeightMap(links);
          coeff = computeNeighborCoeff(neighbors);
          if (mode === "twohop") {
            twoHop = computeTwoHopMetrics(neighbors, coeff);
          }
        }
        var useOverlap = mode === "overlap";
        var useJaccard = mode === "jaccard" || useOverlap;
        var kanjiIdf = null;
        if (kanjiTfidfEnabled) {
          kanjiIdf = buildKanjiIdf(links);
        }
        links.forEach(function (l) {
          if (!l || (l.meta && l.meta.flow_only)) return;
          var key = linkKey(l);
          var layerKey = neighborScalingLayerKey(l);
          var score = 0;
          if (kanjiTfidfEnabled && l.layer === "kanji" && l.meta && l.meta.value) {
            var idf = kanjiIdf ? kanjiIdf[String(l.meta.value)] : 0;
            score = isFinite(idf) ? idf : 0;
          } else if (mode !== "none" && isNeighborScalingLink(l)) {
            var ids = linkIds(l);
            if (useJaccard) {
              var mapA = neighbors[ids.s] || {};
              var mapB = neighbors[ids.t] || {};
              score = useOverlap ? weightedOverlap(mapA, mapB) : weightedJaccard(mapA, mapB);
            } else if (mode === "twohop") {
              var m2s = twoHop[ids.s] || 0;
              var m2t = twoHop[ids.t] || 0;
              score = (m2s + m2t) * 0.5;
            } else if (mode === "ccm") {
              var ms = coeff[ids.s] || 0;
              var mt = coeff[ids.t] || 0;
              score = (ms + mt) * 0.5;
            }
          }
          if (!isFinite(score) || score < 0) score = 0;
          if (score > 1) score = 1;
          linkScoreRawByKey[key] = score;
          if (!linkScoreLayerScores[layerKey]) linkScoreLayerScores[layerKey] = [];
          linkScoreLayerScores[layerKey].push({ key: key, score: score });
        });
        if (linkQuantileNorm && scoringActive) {
          Object.keys(linkScoreLayerScores).forEach(function (layer) {
            var arr = linkScoreLayerScores[layer] || [];
            if (!arr.length) return;
            var min = Infinity;
            var max = -Infinity;
            arr.forEach(function (it) {
              if (it.score < min) min = it.score;
              if (it.score > max) max = it.score;
            });
            if (!isFinite(min) || !isFinite(max) || Math.abs(max - min) < 1e-6) {
              arr.forEach(function (it) {
                linkScoreByKey[it.key] = isFinite(min) ? min : 0;
              });
              return;
            }
            arr.sort(function (a, b) { return a.score - b.score; });
            var n = arr.length;
            if (n === 1) {
              linkScoreByKey[arr[0].key] = 0;
              return;
            }
            for (var i = 0; i < n; i++) {
              var q = i / (n - 1);
              linkScoreByKey[arr[i].key] = q;
            }
          });
        } else {
          linkScoreByKey = Object.assign({}, linkScoreRawByKey);
        }
      }

      function getLinkScore(l) {
        if (!l) return 0;
        var key = linkKey(l);
        if (linkScoreByKey && linkScoreByKey.hasOwnProperty(key)) {
          return linkScoreByKey[key] || 0;
        }
        if (linkScoreRawByKey && linkScoreRawByKey.hasOwnProperty(key)) {
          return linkScoreRawByKey[key] || 0;
        }
        return 0;
      }

      function buildTopKLinkSet(links) {
        if (!kanjiTopKEnabled || !kanjiTopK || kanjiTopK <= 0) return null;
        var topKByLayer = { kanji: kanjiTopK, kanji_component: kanjiTopK };
        var byLayer = {};
        (links || []).forEach(function (l) {
          if (!l || (l.meta && l.meta.flow_only)) return;
          if (!isRefineLayer(l)) return;
          var layer = neighborScalingLayerKey(l);
          var cap = topKByLayer[layer];
          if (!cap || cap <= 0) return;
          var ids = linkIds(l);
          var key = linkKey(l);
          if (!byLayer[layer]) byLayer[layer] = {};
          var layerMap = byLayer[layer];
          var s = String(ids.s);
          var t = String(ids.t);
          if (!layerMap[s]) layerMap[s] = [];
          if (!layerMap[t]) layerMap[t] = [];
          var score = getLinkScore(l);
          layerMap[s].push({ key: key, score: score });
          layerMap[t].push({ key: key, score: score });
        });
        var out = new Set();
        Object.keys(byLayer).forEach(function (layer) {
          var layerMap = byLayer[layer];
          var cap = topKByLayer[layer] || 0;
          Object.keys(layerMap).forEach(function (nid) {
            var arr = layerMap[nid] || [];
            if (!arr.length) return;
            arr.sort(function (a, b) { return b.score - a.score; });
            for (var i = 0; i < arr.length && i < cap; i++) {
              out.add(arr[i].key);
            }
          });
        });
        return out;
      }

      function buildMstLinkSet(links) {
        if (!linkMstEnabled) return null;
        var byLayer = {};
        (links || []).forEach(function (l) {
          if (!l || (l.meta && l.meta.flow_only)) return;
          if (!isRefineLayer(l)) return;
          var layer = neighborScalingLayerKey(l);
          if (!byLayer[layer]) byLayer[layer] = [];
          byLayer[layer].push({
            link: l,
            score: getLinkScore(l),
          });
        });
        var out = new Set();
        Object.keys(byLayer).forEach(function (layer) {
          var edges = byLayer[layer];
          if (!edges.length) return;
          edges.sort(function (a, b) { return b.score - a.score; });
          var parent = {};
          function find(x) {
            if (!parent[x]) parent[x] = x;
            if (parent[x] === x) return x;
            parent[x] = find(parent[x]);
            return parent[x];
          }
          function union(a, b) {
            var ra = find(a);
            var rb = find(b);
            if (ra !== rb) parent[rb] = ra;
          }
          edges.forEach(function (entry) {
            var l = entry.link;
            var ids = linkIds(l);
            var s = String(ids.s);
            var t = String(ids.t);
            if (find(s) === find(t)) return;
            union(s, t);
            out.add(linkKey(l));
          });
        });
        return out;
      }

      function assignNeighborMetrics() {
        neighborMetricById = {};
        if (!neighborScalingEnabled()) {
          activeNodes.forEach(function (n) {
            if (n) n.__neighbor_metric = 0;
          });
          return;
        }
        var metrics = computeNeighborMetrics(activeLinks);
        neighborMetricById = metrics;
        activeNodes.forEach(function (n) {
          if (!n) return;
          n.__neighbor_metric = metrics[String(n.id)] || 0;
        });
      }

      function neighborMetricForLink(l) {
        if (!neighborScalingEnabled() && !(kanjiTfidfEnabled && l && l.layer === "kanji")) return 0;
        if (!l) return 0;
        var key = linkKey(l);
        if (linkScoreByKey && Object.prototype.hasOwnProperty.call(linkScoreByKey, key)) {
          return linkScoreByKey[key] || 0;
        }
        if (linkScoreRawByKey && Object.prototype.hasOwnProperty.call(linkScoreRawByKey, key)) {
          return linkScoreRawByKey[key] || 0;
        }
        var info = linkHubInfo(l);
        var s = info.s;
        var t = info.t;
        var ms = s && isFinite(s.__neighbor_metric) ? s.__neighbor_metric : 0;
        var mt = t && isFinite(t.__neighbor_metric) ? t.__neighbor_metric : 0;
        if (l.layer === "family_hub") {
          if (s && s.kind === "family" && t && t.kind !== "family") return mt;
          if (t && t.kind === "family" && s && s.kind !== "family") return ms;
        }
        return Math.max(ms, mt);
      }

      function neighborScaleStrength(base, metric) {
        if (!isFinite(base) || base === 0) return base;
        if (!isFinite(metric) || metric <= 0) return base;
        var next = base * (1 - NEIGHBOR_SCALE_STRENGTH * metric);
        if (next < 0) next = 0;
        return next;
      }

      function neighborScaleDistance(base, metric) {
        if (!isFinite(base) || base === 0) return base;
        if (!isFinite(metric) || metric <= 0) return base;
        var mult = 1 + NEIGHBOR_SCALE_DISTANCE * metric;
        return base * mult;
      }

      // --- Kanji / hub helpers ---
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

      // --- Viewport helpers ---
      function graphViewBounds() {
        debugThrottle("sim_bounds", "graphViewBounds", "graphViewBounds", "trace", 1000);
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
        debugThrottle("sim_bounds", "nodeInView", "nodeInView", "trace", 1000);
        if (!node || !bounds) return false;
        var pad = 0;
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

      // --- Hub radius helpers ---
      function isMassLinkerLayerEnabled() {
        return isLayerEnabled("mass_linker");
      }

      function isHubExpanded(node) {
        return isMassLinkerLayerEnabled() && isNoteTypeHub(node) && expandedHubs.has(String(node.id));
      }

      function hubExpandedRadiusScaled(node) {
        var base = hubExpandedRadius(node);
        var scale = HUB_BOUNDARY_SCALE;
        if (!isFinite(scale) || scale <= 0) scale = 1;
        if (!isFinite(base) || base <= 0) return base;
        return base * scale;
      }

      function hubInView(node, bounds) {
        debugThrottle("sim_bounds", "hubInView", "hubInView", "trace", 1000);
        if (!node) return false;
        if (!bounds) return true;
        var pad = hubExpandedRadiusScaled(node) || 0;
        var x = node.x || 0;
        var y = node.y || 0;
        return (
          x >= bounds.minX - pad &&
          x <= bounds.maxX + pad &&
          y >= bounds.minY - pad &&
          y <= bounds.maxY + pad
        );
      }

      function isActiveHubMember(node) {
        if (!node) return false;
        var parent = node.__hub_parent ? String(node.__hub_parent) : "";
        if (!parent && node.id !== undefined && node.id !== null) {
          parent = hubMemberParentById[String(node.id)] || "";
        }
        if (!parent) return false;
        if (!isMassLinkerLayerEnabled()) return false;
        return expandedHubs.has(parent);
      }

      function isHubInternalLink(l) {
        if (!l) return false;
        if (!l.source || !l.target) return false;
        if (!isMassLinkerLayerEnabled()) return false;
        var sHub = "";
        var tHub = "";
        if (typeof l.source === "object") {
          sHub = l.source.__hub_parent ? String(l.source.__hub_parent) : "";
        } else {
          sHub = hubMemberParentById[String(l.source)] || "";
        }
        if (typeof l.target === "object") {
          tHub = l.target.__hub_parent ? String(l.target.__hub_parent) : "";
        } else {
          tHub = hubMemberParentById[String(l.target)] || "";
        }
        if (!sHub || !tHub) return false;
        if (sHub !== tHub) return false;
        return expandedHubs.has(sHub);
      }

      function normalizeFamilyHubLinkDirection(l) {
        if (!l || l.layer !== "family_hub" || !l.meta || l.meta.kind !== "hub") return;
        var ids = linkIds(l);
        var sNode = nodeById[ids.s];
        var tNode = nodeById[ids.t];
        var sIsHub = (sNode && sNode.kind === "family") || String(ids.s).indexOf("family:") === 0;
        var tIsHub = (tNode && tNode.kind === "family") || String(ids.t).indexOf("family:") === 0;
        if (sIsHub && !tIsHub) {
          var tmp = l.source;
          l.source = l.target;
          l.target = tmp;
        }
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

      // --- Node size / pulse / collision ---
      function nodeBaseRadius(node) {
        if (!node) return 3.5;
        if (node.__hub_center) {
          return node.__hub_center_radius || 3.5;
        }
        var deg = node.__deg || 0;
        var scale = 1 + Math.min(deg, 20) * 0.08;
        var baseR = 3.5;
        if (isNoteTypeHub(node)) {
          return isHubExpanded(node) ? hubExpandedRadiusScaled(node) : hubBaseRadius(node);
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
        debugThrottle("sim_collision", "nodeCollisionRadius", "nodeCollisionRadius", "trace", 1000);
        if (!node) return 3.5;
        if (node.__hub_center) {
          return nodeMaxPulseRadius(node);
        }
        return nodeMaxPulseRadius(node) * 0.8;
      }

      function applyHubBoundaryToMain(nowTs) {
        debugToast("applyHubBoundaryToMain: start", "sim_bounds", null, "trace");
        if (debugIf("sim_bounds", "applyHubBoundaryToMain: no activeNodes", !activeNodes || !activeNodes.length)) return;
        if (debugIf("sim_bounds", "applyHubBoundaryToMain: no expandedHubs", !expandedHubs || !expandedHubs.size)) return;
        if (debugIf("sim_bounds", "applyHubBoundaryToMain: mass linker disabled", !isMassLinkerLayerEnabled())) return;
        activeNodes.forEach(function (n) {
          if (!n || isNoteTypeHub(n)) return;
          if (isActiveHubMember(n)) return;
          var x = n.x || 0;
          var y = n.y || 0;
          var pad = nodeMaxPulseRadius(n) || 0;
          expandedHubs.forEach(function (hid) {
            var hn = nodeById[String(hid)];
            if (!hn || !isHubExpanded(hn)) return;
            var dx = x - (hn.x || 0);
            var dy = y - (hn.y || 0);
            var dist2 = dx * dx + dy * dy;
            if (dist2 <= 0) return;
            var dist = Math.sqrt(dist2);
            var limit = hubExpandedRadiusScaled(hn) + pad + HUB_EXTERNAL_MARGIN;
            if (!isFinite(limit) || limit <= 0) return;
            if (dist >= limit) return;
            var push = ((limit - dist) / dist) * HUB_EXTERNAL_PUSH;
            x += dx * push;
            y += dy * push;
          });
          n.x = x;
          n.y = y;
          if (n.fx != null) n.fx = n.x;
          if (n.fy != null) n.fy = n.y;
        });
      }

      // --- Link helpers ---
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
      // --- Hub expansion layout + toggle ---
      function toggleHubExpanded(node) {
        if (!isNoteTypeHub(node)) return;
        var id = String(node.id);
        var wasExpanded = expandedHubs.has(id);
        if (wasExpanded) {
          expandedHubs.delete(id);
          clearActiveSelection("hub", id);
          if (hubSimManager && typeof hubSimManager.sync === "function") {
            hubSimManager.sync();
          }
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
          if (selectedId && String(selectedId) === String(id)) {
            clearActiveSelection("main");
          }
          showToast("Expand hub");
        }
        applyFilters({ reheat: true, toast_visible: true });
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

      // --- Hub simulation manager (separate simulation per expanded hub) ---
      function createHubSimManager() {
        var sims = {};
        var root = null;

        function ensureRoot() {
          if (root) return;
          root = document.getElementById("hub-sim-root");
          if (!root) {
            root = document.createElement("div");
            root.id = "hub-sim-root";
            root.style.position = "absolute";
            root.style.left = "-10000px";
            root.style.top = "-10000px";
            root.style.width = "400px";
            root.style.height = "400px";
            root.style.overflow = "hidden";
            root.style.opacity = "0";
            root.style.pointerEvents = "none";
            root.style.zIndex = "-1";
            (document.body || document.documentElement).appendChild(root);
          }
        }

        function createSim(hubId) {
          ensureRoot();
          debugToast("hub createSim: " + hubId, "sim_hub", null, "trace");
          var el = document.createElement("div");
          el.className = "hub-sim";
          el.dataset.hubId = String(hubId);
          el.style.width = "400px";
          el.style.height = "400px";
          el.style.pointerEvents = "none";
          el.style.opacity = "0";
          el.style.background = "transparent";
          if (root) {
            root.appendChild(el);
          }
          var g = ForceGraph()(el)
            .graphData({ nodes: [], links: [] })
            .nodeId("id")
            .linkSource("source")
            .linkTarget("target")
            .nodeRelSize(3)
            .nodeVal(1)
            .nodeColor(function (n) {
              return nodeColor(n, noteTypeColors, layerColors);
            })
            .linkColor(function (l) {
              var selId = getRenderFocusIdForHub();
              return linkBaseColor(l, selId, ctxMenuId);
            })
            .linkLineDash(function (l) {
              return linkDashPattern(l);
            })
            .linkWidth(function (l) {
              return linkStrokeWidth(l, getRenderFocusIdForHub(), ctxMenuId);
            })
            .linkCanvasObjectMode(function () {
              return "after";
            })
            .linkCanvasObject(function (l, ctx, globalScale) {
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
            .linkDirectionalParticles(function (l) {
              var len = linkLength(l);
              return getFlowParticleCountCached(l, len, getRenderFocusIdForHub(), ctxMenuId);
            })
            .linkDirectionalParticleSpeed(function (l) {
              var len = linkLength(l);
              return getFlowParticleSpeedCached(l, len, getRenderFocusIdForHub(), ctxMenuId);
            })
            .linkDirectionalParticleWidth(function (l) {
              var base = 2;
              return isLinkEmphasizedForRender(l, getRenderFocusIdForHub(), ctxMenuId) ? base * 2 : base;
            })
            .linkDirectionalParticleColor(function (l) {
              var col = particleColor(l);
              var selId = getRenderFocusIdForHub();
              var flowFade = getFlowFadeForLink(l, selId, ctxMenuId);
              if (!isLinkConnectedForRender(l, selId, ctxMenuId)) {
                if (isKanjiComponent(l) && isKanjiLayerActive() && kanjiComponentFocusOnly && componentFocusSet && componentFocusSet.size) {
                  return flowFade < 1 ? applyDim(col, flowFade) : col;
                }
                var dimmed = applyDim(col, 0.2);
                return flowFade < 1 ? applyDim(dimmed, flowFade) : dimmed;
              }
              return flowFade < 1 ? applyDim(col, flowFade) : col;
            })
            .autoPauseRedraw(false)
            .cooldownTicks(physics.cooldown_ticks)
            .warmupTicks(physics.warmup_ticks)
            .d3VelocityDecay(physics.velocity_decay)
            .d3AlphaDecay(physics.alpha_decay);
          if (typeof g.nodeCanvasObject === "function") {
            g.nodeCanvasObject(function (node, ctx) {
              var activeId = getRenderActiveIdForHub();
              var focusId = getRenderFocusIdForHub();
              drawNodeOnCanvas(node, ctx, {
                skipHubMembers: false,
                selectedId: activeId,
                activeId: activeId,
                focusId: focusId,
                ctxMenuId: ctxMenuId,
              });
            }).nodeCanvasObjectMode(function () {
              return "replace";
            });
          }
          if (typeof g.nodePointerAreaPaint === "function") {
            g.nodePointerAreaPaint(function (node, color, ctx) {
              if (node && node.__hub_center) return;
              var radius = nodeBaseRadius(node);
              var r = radius + 2;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fill();
            });
          }
          if (typeof g.onRenderFramePost === "function") {
            g.onRenderFramePost(function (ctx, globalScale) {
              var data = g.graphData();
              if (data && data.nodes) {
                var activeId = getRenderActiveIdForHub();
                var focusId = getRenderFocusIdForHub();
                drawNodeLabels(ctx, data.nodes, globalScale, {
                  selectedId: activeId,
                  focusId: focusId,
                  ctxMenuId: ctxMenuId,
                });
              }
            });
          }
          if (typeof g.enablePointerInteraction === "function") {
            g.enablePointerInteraction(false);
          }
          if (typeof g.enableZoomPanInteraction === "function") {
            g.enableZoomPanInteraction(false);
          }
          if (typeof g.enableNodeDrag === "function") {
            g.enableNodeDrag(false);
          }
          if (typeof g.width === "function") g.width(1);
          if (typeof g.height === "function") g.height(1);
          if (typeof g.d3Force === "function") {
            var charge = g.d3Force("charge");
            if (charge && typeof charge.strength === "function") {
              charge.strength(physics.charge);
            }
            if (charge && typeof charge.distanceMax === "function") {
              charge.distanceMax(physics.max_radius || 0);
            }
          }
          var sim = {
            id: hubId,
            el: el,
            graph: g,
            hubNode: null,
            nodes: [],
            links: [],
            nodesById: {},
          };
          g.onEngineTick(function () {
            applyHubBoundaryClamp(sim);
            updateMainFromHubSim(sim);
          });
          sims[hubId] = sim;
          return sim;
        }

        function destroySim(hubId) {
          debugToast("hub destroySim: " + hubId, "sim_hub", null, "trace");
          var sim = sims[hubId];
          if (!sim) return;
          clearActiveSelection("hub", hubId);
          if (sim.nodes && sim.nodes.length) {
            sim.nodes.forEach(function (n) {
              if (n && n.__main) {
                n.__main.__hub_sim = false;
                n.__main.__hub_sim_hid = null;
                if (n.__main.fx != null) {
                  n.__main.fx = null;
                  n.__main.fy = null;
                }
              }
            });
          }
          if (sim.graph && typeof sim.graph.graphData === "function") {
            sim.graph.graphData({ nodes: [], links: [] });
          }
          if (sim.el && sim.el.parentNode) {
            sim.el.parentNode.removeChild(sim.el);
          }
          delete sims[hubId];
        }

        function assignClusterSizes(nodes, links) {
          var degree = {};
          var neighbors = {};
          var nodeMap = {};
          nodes.forEach(function (n) {
            nodeMap[String(n.id)] = n;
          });
          links.forEach(function (l) {
            if (!isLinkVisibleForPhysics(l)) return;
            var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
            var sk = String(s);
            var tk = String(t);
            degree[sk] = (degree[sk] || 0) + 1;
            degree[tk] = (degree[tk] || 0) + 1;
            if (!neighbors[sk]) neighbors[sk] = new Set();
            if (!neighbors[tk]) neighbors[tk] = new Set();
            neighbors[sk].add(tk);
            neighbors[tk].add(sk);
          });
          nodes.forEach(function (n) {
            n.__deg = degree[String(n.id)] || 0;
          });
          var visited = {};
          nodes.forEach(function (n) {
            var id = String(n.id);
            if (visited[id]) return;
            var stack = [id];
            var comp = [];
            visited[id] = true;
            while (stack.length) {
              var cur = stack.pop();
              comp.push(cur);
              var nbrs = neighbors[cur];
              if (!nbrs) continue;
              nbrs.forEach(function (nid) {
                if (visited[nid]) return;
                visited[nid] = true;
                stack.push(nid);
              });
            }
            var size = comp.length || 1;
            comp.forEach(function (cid) {
              var node = nodeMap[cid];
              if (node) node.__cluster_size = size;
            });
          });
        }

        function applyHubBoundaryClamp(sim) {
          debugToast("applyHubBoundaryClamp: start", "sim_bounds", null, "trace");
          if (debugIf("sim_bounds", "applyHubBoundaryClamp: invalid sim", !sim || !sim.hubNode || !sim.nodes || !sim.nodes.length)) return;
          var r = hubExpandedRadiusScaled(sim.hubNode);
          if (debugIf("sim_bounds", "applyHubBoundaryClamp: invalid radius", !isFinite(r) || r <= 0)) return;
          sim.nodes.forEach(function (n) {
            if (!n) return;
            if (n.__hub_center) return;
            var x = n.x || 0;
            var y = n.y || 0;
            var pad = nodeMaxPulseRadius(n) || 0;
            var limit = r - pad - HUB_BOUNDARY_INSET;
            if (!isFinite(limit) || limit <= 0) limit = r;
            var dist2 = x * x + y * y;
            if (dist2 <= limit * limit) return;
            var dist = Math.sqrt(dist2) || 1;
            var scale = limit / dist;
            n.x = x * scale;
            n.y = y * scale;
            if (n.fx != null) n.fx = n.x;
            if (n.fy != null) n.fy = n.y;
          });
        }

        function updateMainFromHubSim(sim) {
          if (debugIf("sim_hub", "updateMainFromHubSim: invalid sim", !sim || !sim.nodes || !sim.hubNode)) return;
          showDebugToast("updateMainFromHubSim: start", "sim_hub");
          var hx = sim.hubNode.x || 0;
          var hy = sim.hubNode.y || 0;
          sim.nodes.forEach(function (n) {
            if (!n) return;
            var absX = hx + (n.x || 0);
            var absY = hy + (n.y || 0);
            n.__abs_x = absX;
            n.__abs_y = absY;
            if (n.__main) {
              n.__main.__hub_sim = true;
              n.__main.__hub_sim_hid = String(sim.hubNode.id || "");
              n.__main.x = absX;
              n.__main.y = absY;
              n.__main.fx = absX;
              n.__main.fy = absY;
            }
          });
        }

        function hubChargeScale(hubNode) {
          var ref = resolvePhysicsValue("max_radius", hubPhysics) || 1;
          if (ref <= 0) ref = 1;
          var r = hubExpandedRadiusScaled(hubNode);
          if (!isFinite(r) || r <= 0) r = ref;
          var mult = hubPhysics && typeof hubPhysics.charge_scale_mult === "number"
            ? hubPhysics.charge_scale_mult
            : 1;
          return (r / ref) * mult;
        }

        function syncHubMemberData(target, source) {
          if (!target || !source) return;
          target.kind = source.kind;
          target.note_type_id = source.note_type_id;
          target.note_type = source.note_type;
          target.label = source.label;
          target.family_prios = source.family_prios && typeof source.family_prios === "object"
            ? Object.assign({}, source.family_prios)
            : source.family_prios;
          target.cards = Array.isArray(source.cards) ? source.cards.slice(0) : source.cards;
          target.extra = Array.isArray(source.extra) ? source.extra.slice(0) : source.extra;
          target.layers = Array.isArray(source.layers) ? source.layers.slice(0) : source.layers;
        }

        function updateSimForHub(hubId, hubNode, entry) {
          if (debugIf("sim_hub", "updateSimForHub: missing hub/entry", !hubNode || !entry || !entry.nodes)) {
            destroySim(hubId);
            return;
          }
          showDebugToast("updateSimForHub: start " + hubId, "sim_hub");
          var sim = sims[hubId] || createSim(hubId);
          sim.hubNode = hubNode;
          sim.charge_scale = hubChargeScale(hubNode);
          var members = limitHubMembers(entry.nodes || []);
          var nodesById = sim.nodesById;
          var nextNodes = [];
          var keep = {};
          var centerId = "__hub_center__" + String(hubId);
          var center = nodesById[centerId];
          if (!center) {
            center = { id: centerId };
            nodesById[centerId] = center;
          }
          center.__hub_center = true;
          center.__fixed = true;
          center.__hub_parent = String(hubId);
          center.__hub_center_color = mixWithWhite(
            nodeColor(hubNode, noteTypeColors, layerColors),
            0.2
          );
          center.__hub_center_radius = Math.max(3, hubPlusRadius(hubNode) * 1.05);
          center.x = 0;
          center.y = 0;
          center.fx = 0;
          center.fy = 0;
          keep[centerId] = true;
          nextNodes.push(center);
          members.forEach(function (main) {
            if (!main) return;
            var id = String(main.id);
            var sn = nodesById[id];
            if (!sn) {
              sn = { id: id };
              nodesById[id] = sn;
            }
            sn.__main = main;
            sn.__hub_parent = String(hubId);
            syncHubMemberData(sn, main);
            sn.__deg = main.__deg || 0;
            if (typeof sn.x !== "number" || typeof sn.y !== "number") {
              var baseX = typeof main.x === "number" ? main.x : hubNode.x || 0;
              var baseY = typeof main.y === "number" ? main.y : hubNode.y || 0;
              sn.x = baseX - (hubNode.x || 0);
              sn.y = baseY - (hubNode.y || 0);
            }
            keep[id] = true;
            nextNodes.push(sn);
          });
          Object.keys(nodesById).forEach(function (id) {
            if (!keep[id]) delete nodesById[id];
          });
          var nextLinks = [];
          (entry.edges || []).forEach(function (l) {
            if (!l) return;
            var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
            var sid = String(s);
            var tid = String(t);
            if (!keep[sid] || !keep[tid]) return;
            nextLinks.push({
              source: sid,
              target: tid,
              layer: l.layer,
              meta: l.meta || {},
              kind: l.kind || (l.meta ? l.meta.kind : null),
            });
          });
          sim.nodes = nextNodes;
          sim.links = nextLinks;
          if (getActiveSelectionId("hub", hubId)) {
            if (!nodesById[String(getActiveSelectionId("hub", hubId))]) {
              clearActiveSelection("hub", hubId);
            }
          }
          if (assignLinkCurves) {
            assignLinkCurves(sim.links, baseCurve);
          }
          assignClusterSizes(nextNodes, nextLinks);
          if (typeof sim.graph.graphData === "function") {
            sim.graph.graphData({ nodes: nextNodes, links: nextLinks });
          }
          if (typeof sim.graph.linkCurvature === "function") {
            sim.graph.linkCurvature(function (l) {
              return -(l.curve || 0);
            });
          }
          applyPhysicsToGraph(sim.graph, {
            linkStrength: getHubLinkStrength,
            linkDistance: getHubLinkDistance,
            chargeStrengthFn: function (node) {
              var base = resolvePhysicsValue("charge", hubPhysics) * (sim.charge_scale || 1);
              return base;
            },
            reheat: true,
            setLastReheat: false,
            physicsOverride: hubPhysics,
          });
          updateMainFromHubSim(sim);
        }

        function sync() {
          debugToast("hub sync: start", "sim_hub", null, "trace");
          if (debugIf("sim_hub", "hub sync: mass linker disabled", !isMassLinkerLayerEnabled())) {
            Object.keys(sims).forEach(function (hid) {
              destroySim(hid);
            });
            return;
          }
          var bounds = graphViewBounds();
          var needed = {};
          expandedHubs.forEach(function (hid) {
            var id = String(hid);
            var hubNode = nodeById[id];
            var entry = noteTypeHubMembers[id];
            if (!hubNode || !entry) return;
            if (bounds && !hubInView(hubNode, bounds)) return;
            needed[id] = { hubNode: hubNode, entry: entry };
          });
          Object.keys(sims).forEach(function (hid) {
            if (!needed[hid]) destroySim(hid);
          });
          Object.keys(needed).forEach(function (id) {
            var info = needed[id];
            updateSimForHub(id, info.hubNode, info.entry);
          });
        }

        function applyPhysicsAll() {
          debugToast("hub applyPhysicsAll: start", "sim_hub", null, "trace");
          Object.keys(sims).forEach(function (hid) {
            var sim = sims[hid];
            if (!sim || !sim.graph) return;
            showDebugToast("hub applyPhysics: " + hid, "sim_hub");
            if (sim.hubNode) {
              sim.charge_scale = hubChargeScale(sim.hubNode);
            }
            applyPhysicsToGraph(sim.graph, {
              linkStrength: getHubLinkStrength,
              linkDistance: getHubLinkDistance,
              chargeStrengthFn: function (node) {
                var base = resolvePhysicsValue("charge", hubPhysics) * (sim.charge_scale || 1);
                return base;
              },
              reheat: true,
              setLastReheat: false,
              physicsOverride: hubPhysics,
            });
          });
        }

        function getSim(hubId) {
          return sims[hubId] || null;
        }

        return {
          sync: sync,
          applyPhysics: applyPhysicsAll,
          getSim: getSim,
          each: function (fn) {
            if (typeof fn !== "function") return;
            Object.keys(sims).forEach(function (hid) {
              fn(sims[hid], hid);
            });
          },
          refreshPositions: function (hubId) {
            var sim = sims[hubId];
            if (sim) updateMainFromHubSim(sim);
          },
        };
      }

      var hubSimManager = createHubSimManager();
      var hubAutoCollapsed = false;
      var lastHubCollapseKey = "";
      var lastHubViewKey = "";

      function updateHubAutoCollapse() {
        if (!isMassLinkerLayerEnabled()) {
          hubAutoCollapsed = false;
          return;
        }
        if (!HUB_AUTO_COLLAPSE_ZOOM || HUB_AUTO_COLLAPSE_ZOOM <= 0) return;
        var z = 1;
        try {
          if (Graph && typeof Graph.zoom === "function") {
            z = Graph.zoom() || 1;
          }
        } catch (_e) {
          z = 1;
        }
        if (!isFinite(z)) z = 1;
        if (z < HUB_AUTO_COLLAPSE_ZOOM) {
          if (expandedHubs.size) {
            var ids = Array.from(expandedHubs).map(String).sort();
            var key = ids.join(",");
            if (key && key !== lastHubCollapseKey) {
              lastHubCollapseKey = key;
              expandedHubs.clear();
              clearActiveSelection("hub");
              if (hubSimManager && typeof hubSimManager.sync === "function") {
                hubSimManager.sync();
              }
              applyFilters({ reheat: false, toast_visible: false });
            }
          }
          hubAutoCollapsed = true;
        } else {
          hubAutoCollapsed = false;
          lastHubCollapseKey = "";
        }
      }

      function syncHubSimsToView() {
        if (!hubSimManager || typeof hubSimManager.sync !== "function") return;
        if (!isMassLinkerLayerEnabled()) {
          if (lastHubViewKey !== "") {
            lastHubViewKey = "";
            hubSimManager.sync();
          }
          return;
        }
        if (!expandedHubs || !expandedHubs.size) {
          if (lastHubViewKey !== "") {
            lastHubViewKey = "";
            hubSimManager.sync();
          }
          return;
        }
        var bounds = graphViewBounds();
        var ids = [];
        expandedHubs.forEach(function (hid) {
          var hubNode = nodeById[String(hid)];
          if (!hubNode) return;
          if (bounds && !hubInView(hubNode, bounds)) return;
          ids.push(String(hid));
        });
        ids.sort();
        var key = ids.join(",");
        if (key === lastHubViewKey) return;
        lastHubViewKey = key;
        hubSimManager.sync();
      }



      // --- Visibility / layer filters ---
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
      function isKanjiLayerActive() {
        return isLayerEnabled("kanji");
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
          return linkBaseColor(l, getRenderFocusIdForMain(), ctxMenuId);
        })
        .linkLineDash(function (l) {
          return linkDashPattern(l);
        })
        .linkWidth(function (l) {
          return linkStrokeWidth(l, getRenderFocusIdForMain(), ctxMenuId);
        })
        .linkCanvasObjectMode(function (l) {
          return "replace";
        })
        .linkCanvasObject(function (l, ctx, globalScale) {
          drawMainLink(l, ctx, globalScale);
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
          if (getHubExternalClip(l, 1)) return 0;
          var len = linkLength(l);
          return getFlowParticleCountCached(l, len, getRenderFocusIdForMain(), ctxMenuId);
        })
        .linkDirectionalParticleSpeed(function (l) {
          var len = linkLength(l);
          return getFlowParticleSpeedCached(l, len, getRenderFocusIdForMain(), ctxMenuId);
        })
        .linkDirectionalParticleWidth(function (l) {
          var base = 2;
          return isLinkEmphasizedForRender(l, getRenderFocusIdForMain(), ctxMenuId) ? base * 2 : base;
        })
        .linkDirectionalParticleColor(function (l) {
          var col = particleColor(l);
          var selId = getRenderFocusIdForMain();
          var flowFade = getFlowFadeForLink(l, selId, ctxMenuId);
          if (!isLinkConnectedForRender(l, selId, ctxMenuId)) {
            if (isKanjiComponent(l) && isKanjiLayerActive() && kanjiComponentFocusOnly && componentFocusSet && componentFocusSet.size) {
              return flowFade < 1 ? applyDim(col, flowFade) : col;
            }
            var dimmed = applyDim(col, 0.2);
            return flowFade < 1 ? applyDim(dimmed, flowFade) : dimmed;
          }
          return flowFade < 1 ? applyDim(col, flowFade) : col;
        })
        .cooldownTicks(80)
        .d3VelocityDecay(0.35);

      if (typeof Graph.d3Force === "function") {
        Graph.d3Force("charge").strength(-80);
      } else {
        log("d3Force unavailable");
      }


      Graph.onNodeDragEnd(function (node) {
        showDebugToast("main onNodeDragEnd");
        node.fx = node.x;
        node.fy = node.y;
        node.__dragging = false;
        dragNodeId = null;
        hideDebugLinkDist();
        if (node && node.__hub_parent && hubSimManager) {
          var hid = String(node.__hub_parent);
          var sim = hubSimManager.getSim ? hubSimManager.getSim(hid) : null;
          var hubNode = nodeById[hid];
          if (sim && hubNode && sim.nodesById) {
            var sn = sim.nodesById[String(node.id)];
            if (sn) {
              sn.__dragging = false;
              sn.x = (node.x || 0) - (hubNode.x || 0);
              sn.y = (node.y || 0) - (hubNode.y || 0);
              sn.fx = null;
              sn.fy = null;
            }
          }
        }
        dragActive = false;
        if (typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
        scheduleFlowUpdate();
        debugPipelineEnd("main onNodeDragEnd");
      });
      if (typeof Graph.onNodeDragStart === "function") {
        Graph.onNodeDragStart(function (node) {
          showDebugToast("main onNodeDragStart");
          hideContextMenu();
          dragActive = true;
          markEngineRunning();
          if (node) {
            node.__dragging = true;
            node.fx = node.x;
            node.fy = node.y;
            dragNodeId = String(node.id);
            updateDebugLinkDist(node);
            if (isNoteTypeHub(node) && isHubExpanded(node)) {
              node.__drag_last_x = node.x;
              node.__drag_last_y = node.y;
              if (hubSimManager && typeof hubSimManager.refreshPositions === "function") {
                hubSimManager.refreshPositions(String(node.id));
              }
            }
            if (node.__hub_parent && hubSimManager) {
              var hid = String(node.__hub_parent);
              var sim = hubSimManager.getSim ? hubSimManager.getSim(hid) : null;
              var hubNode = nodeById[hid];
              if (sim && hubNode && sim.nodesById) {
                var sn = sim.nodesById[String(node.id)];
                if (sn) {
                  sn.__dragging = true;
                  sn.fx = (node.x || 0) - (hubNode.x || 0);
                  sn.fy = (node.y || 0) - (hubNode.y || 0);
                }
              }
            }
          }
          debugPipelineEnd("main onNodeDragStart");
        });
      }
      if (typeof Graph.onNodeDrag === "function") {
        Graph.onNodeDrag(function (node) {
          showDebugToast("main onNodeDrag");
          hideContextMenu();
          markEngineRunning();
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
              if (hubSimManager && typeof hubSimManager.refreshPositions === "function") {
                hubSimManager.refreshPositions(String(node.id));
              }
            } else if (node.__hub_parent) {
              var hid = String(node.__hub_parent);
              var sim = hubSimManager && hubSimManager.getSim ? hubSimManager.getSim(hid) : null;
              var hubNode = nodeById[hid];
              if (sim && hubNode && sim.nodesById) {
                var sn = sim.nodesById[String(node.id)];
                if (sn) {
                  sn.__dragging = true;
                  sn.x = (node.x || 0) - (hubNode.x || 0);
                  sn.y = (node.y || 0) - (hubNode.y || 0);
                  sn.fx = sn.x;
                  sn.fy = sn.y;
                }
              }
            }
          }
          debugPipelineEnd("main onNodeDrag");
        });
      }
      if (typeof Graph.onEngineTick === "function") {
        Graph.onEngineTick(function () {
          debugIfThrottle("sim_events", "engineTick:dragActive", "onEngineTick: dragActive", !!dragActive, "trace", 500);
          if (debugIf("sim_events", "onEngineTick: hubSimManager refresh", hubSimManager && typeof hubSimManager.refreshPositions === "function", "trace")) {
            expandedHubs.forEach(function (hid) {
              hubSimManager.refreshPositions(String(hid));
            });
          }
        });
      }

      // --- Card popup + tooltip helpers ---
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
          debugUI("card popup close");
          e.preventDefault();
          close();
        });
        overlay.addEventListener("click", function (e) {
          debugUI("card popup overlay click");
          if (e.target === overlay) close();
        });
      }

      function eventGraphPosFor(graphInstance, evt, rectOverride) {
        if (!graphInstance || typeof graphInstance.screen2GraphCoords !== "function" || !evt) return null;
        var rect = rectOverride || graphEl.getBoundingClientRect();
        var x = evt.clientX - rect.left;
        var y = evt.clientY - rect.top;
        return graphInstance.screen2GraphCoords(x, y);
      }

      function eventGraphPos(evt) {
        return eventGraphPosFor(Graph, evt, null);
      }

      function isCardPlusClick(node, evt, graphInstance, rectOverride) {
        var g = graphInstance || Graph;
        if (!node || !node.__card_plus || !evt || !g) return false;
        var pos = eventGraphPosFor(g, evt, rectOverride);
        if (!pos) return false;
        var dx = pos.x - node.__card_plus.x;
        var dy = pos.y - node.__card_plus.y;
        var r = node.__card_plus.r || 0;
        return dx * dx + dy * dy <= r * r;
      }

      function getCardDotClick(node, evt, graphInstance, rectOverride) {
        var g = graphInstance || Graph;
        if (!node || !node.__card_dots || !node.__card_dots.length) return null;
        if (!evt || !g) return null;
        var z = 1;
        try {
          if (g && typeof g.zoom === "function") {
            z = g.zoom();
          }
        } catch (_e) {
          z = 1;
        }
        if (z < cardDotsMinZoom) return null;
        var pos = eventGraphPosFor(g, evt, rectOverride);
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
        var clearedHubSelection = false;
        if (clearActiveSelection("hub")) {
          clearedHubSelection = true;
        }
        if (node && isNoteTypeHub(node) && isHubToggleClick(node, evt)) {
          showDebugToast("main onNodeClick: hub toggle");
          toggleHubExpanded(node);
          if (clearedHubSelection) {
            refreshSelection();
          }
          debugPipelineEnd("main onNodeClick");
          return;
        }
        if (node && isNoteTypeHub(node) && isHubExpanded(node)) {
          showDebugToast("main onNodeClick: hub expanded no-select");
          debugPipelineEnd("main onNodeClick");
          return;
        }
        if (node && cardDotsEnabled) {
          if (isCardPlusClick(node, evt)) {
            showDebugToast("main onNodeClick: card plus");
            showCardPopup(node);
            if (clearedHubSelection) {
              refreshSelection();
            }
            debugPipelineEnd("main onNodeClick");
            return;
          }
        }
        showDebugToast("main onNodeClick: select node");
        setActiveSelection("main", node ? node.id : null);
        refreshSelection();
        debugPipelineEnd("main onNodeClick");
      });
      if (typeof Graph.onBackgroundClick === "function") {
        Graph.onBackgroundClick(function () {
          var hadHubSelection = !!getActiveSelectionId("hub");
          if (hadHubSelection) {
            clearActiveSelection("hub");
          }
          if (selectedId) {
            showDebugToast("main onBackgroundClick: clear selection");
            clearActiveSelection("main");
            refreshSelection();
          } else {
            showDebugToast("main onBackgroundClick: no selection");
            if (hadHubSelection) {
              refreshSelection();
            }
          }
          debugPipelineEnd("main onBackgroundClick");
        });
      }

      var tooltip = document.getElementById("tooltip");
      var hoverNode = null;
      var hoverNodeHit = null;
      var dotTooltipActive = false;
      var hoverDot = null;

      function renderNodeTooltip(node) {
        if (!tooltip) return;
        if (node) {
          tooltip.style.display = "block";
          var lines = [];
          lines.push(nodeDisplayLabel(node));
          lines.push({ __divider: true });
          if (node.note_type) lines.push(node.note_type);
          var fams = getNodeFamilies(node);
          var famMap = node.family_prios && typeof node.family_prios === "object" ? node.family_prios : null;
          if (Array.isArray(node.extra)) {
            node.extra.forEach(function (entry) {
              if (!entry || !entry.name) return;
              var val = entry.value || "";
              if (val) {
                lines.push(entry.name + ": " + val);
              }
            });
          }

          if (fams.length) {
            lines.push({ __divider: true });
            fams.forEach(function (fid) {
              var key = String(fid);
              var p = famMap && famMap[key] !== undefined ? famMap[key] : undefined;
              if (p !== undefined && p !== null) {
                lines.push("family: " + key + " @ " + p);
              } else {
                lines.push("family: " + key);
              }
            });
          }
          tooltip.innerHTML = "";
          lines.forEach(function (line) {
            if (line && line.__divider) {
              var divider = document.createElement("div");
              divider.className = "tooltip-divider";
              tooltip.appendChild(divider);
              return;
            }
            var row = document.createElement("div");
            row.textContent = line;
            tooltip.appendChild(row);
          });
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

      function requestRenderKick(graph) {
        if (graph && typeof graph.resumeAnimation === "function") {
          graph.resumeAnimation();
        }
      }

      function refreshFlowForGraph(graph) {
        if (!graph) return;
        if (typeof graph.linkDirectionalParticles === "function") {
          graph.linkDirectionalParticles(graph.linkDirectionalParticles());
        }
        if (typeof graph.linkDirectionalParticleSpeed === "function") {
          graph.linkDirectionalParticleSpeed(graph.linkDirectionalParticleSpeed());
        }
        if (typeof graph.linkDirectionalParticleColor === "function") {
          graph.linkDirectionalParticleColor(graph.linkDirectionalParticleColor());
        }
      }

      Graph.onNodeHover(function (node) {
        hoverNode = node || null;
        hoverNodeHit = node || null;
        if (node) {
          showDebugToast("main onNodeHover");
        }
        if (dotTooltipActive) {
          if (!node) {
            dotTooltipActive = false;
            renderNodeTooltip(null);
          }
          return;
        }
        renderNodeTooltip(node);
        refreshFlowForGraph(Graph);
        requestRenderKick(Graph);
      });

      Graph.nodeRelSize(3);
      function drawNodeOnCanvas(node, ctx, opts) {
        opts = opts || {};
        var selId = opts.selectedId !== undefined ? opts.selectedId : selectedId;
        var ctxId = opts.ctxMenuId !== undefined ? opts.ctxMenuId : ctxMenuId;
        var activeId = opts.activeId !== undefined ? opts.activeId : selId;
        var focusId = opts.focusId !== undefined ? opts.focusId : selId;
        if (node && node.__hub_center) {
          var ccol = node.__hub_center_color || "#e5e7eb";
          var cr = nodeBaseRadius(node);
          var ringR = nodePulseRadius(node);
          var pr = cr * 0.45;
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, ringR, 0, 2 * Math.PI);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = colorWithAlpha(ccol, 0.9);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo((node.x || 0) - pr, node.y || 0);
          ctx.lineTo((node.x || 0) + pr, node.y || 0);
          ctx.lineWidth = 0.7;
          ctx.strokeStyle = colorWithAlpha(ccol, 0.9);
          ctx.stroke();
          ctx.restore();
          return;
        }
        var nodeId = String(node.id);
        var isActiveNode = activeId && nodeId === activeId;
        var isCtxNode = ctxId && nodeId === ctxId;
        var connected = isConnectedForRender(nodeId, focusId, ctxId);
        var isNtHub = isNoteTypeHub(node);
        var hubExpanded = isHubExpanded(node);
        var showPulse = (node.kind === "family" || isNtHub)
          ? (isActiveNode || isCtxNode)
          : (connected || isActiveNode || isCtxNode);
        var color = nodeColor(node, noteTypeColors, layerColors);
        var radius = nodeBaseRadius(node);
        var hoverId = getHoverFocusId();
        var isHoverNode = hoverId && nodeId === hoverId;
        if (isHoverNode) {
          var cur = typeof node.__hover_scale === "number" ? node.__hover_scale : 1;
          var target = 1.05;
          cur += (target - cur) * 0.2;
          if (Math.abs(target - cur) < 0.001) cur = target;
          node.__hover_scale = cur;
          radius *= cur;
        } else if (typeof node.__hover_scale === "number" && node.__hover_scale !== 1) {
          var cur2 = node.__hover_scale;
          cur2 += (1 - cur2) * 0.2;
          if (Math.abs(1 - cur2) < 0.001) cur2 = 1;
          node.__hover_scale = cur2;
          radius *= cur2;
        }
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
          // minus sign for expanded hub
          var mr = hubPlusRadius(node);
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          var hubBorderW = Hub && Hub.TWEAKS && typeof Hub.TWEAKS.borderWidth === "number"
            ? Hub.TWEAKS.borderWidth
            : 2.2;
          ctx.lineWidth = hubBorderW;
          ctx.strokeStyle = colorWithAlpha(color, 0.85);
          ctx.stroke();
          ctx.restore();
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
        if (hoverId && isHoverConnectedNode(nodeId)) {
          var hRing = haloR + 0.6;
          ctx.save();
          ctx.lineWidth = 0.3;
          ctx.strokeStyle = "rgba(250,204,21,0.9)";
          ctx.beginPath();
          ctx.arc(node.x, node.y, hRing, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
        var zoomLevel = getMainZoom();
        var dotsFade = zoomFade(zoomLevel, cardDotsMinZoom, cardDotsFadeBand);
        if (
          cardDotsEnabled &&
          dotsFade > 0 &&
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
            var baseDot = colorWithAlpha(ccol, dotsFade);
            ctx.fillStyle = (connected || showPulse)
              ? baseDot
              : applyDim(baseDot, dotAlpha);
            ctx.fill();
            if (
              ctxDot &&
              ctxDot.nodeId === String(node.id) &&
              ctxDot.cardId === (card && card.id ? card.id : null)
            ) {
              ctx.beginPath();
              ctx.arc(px, py, drawR * 1.35, 0, 2 * Math.PI);
              ctx.lineWidth = 0.225;
              ctx.strokeStyle = colorWithAlpha("rgb(239,68,68)", 0.9 * dotsFade);
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
            var basePlus = colorWithAlpha(baseDotColor, dotsFade);
            ctx.fillStyle = (connected || showPulse)
              ? basePlus
              : applyDim(basePlus, dotAlpha);
            ctx.fill();
            ctx.save();
            ctx.fillStyle = (connected || showPulse)
              ? colorWithAlpha("#0f1216", dotsFade)
              : applyDim(colorWithAlpha("#0f1216", dotsFade), dotAlpha);
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
      }

      Graph.nodeCanvasObject(function (node, ctx) {
        drawNodeOnCanvas(node, ctx, {
          skipHubMembers: true,
          selectedId: getRenderActiveIdForMain(),
          activeId: getRenderActiveIdForMain(),
          focusId: getRenderFocusIdForMain(),
          ctxMenuId: ctxMenuId,
        });
      }).nodeCanvasObjectMode(function () {
        return "replace";
      });
      if (typeof Graph.nodePointerAreaPaint === "function") {
        Graph.nodePointerAreaPaint(function (node, color, ctx) {
          if (node && isNoteTypeHub(node) && isHubExpanded(node)) {
            var mr = hubPlusRadius(node);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, mr, 0, 2 * Math.PI, false);
            ctx.fill();
            return;
          }
          var radius = nodeBaseRadius(node);
          var pad = isNoteTypeHub(node) ? 0 : 2;
          var r0 = radius + pad;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r0, 0, 2 * Math.PI, false);
          ctx.fill();
        });
      }

      if (typeof Graph.onRenderFramePre === "function") {
        Graph.onRenderFramePre(function (ctx) {
          if (ctx && expandedHubs && expandedHubs.size && isMassLinkerLayerEnabled()) {
            ctx.save();
            ctx.fillStyle = "#0f1216";
            expandedHubs.forEach(function (hid) {
              var hn = nodeById[String(hid)];
              if (!hn || !isHubExpanded(hn)) return;
              var r = hubExpandedRadiusScaled(hn);
              if (!isFinite(r) || r <= 0) return;
              ctx.beginPath();
              ctx.arc(hn.x || 0, hn.y || 0, r, 0, 2 * Math.PI);
              ctx.fill();
            });
            ctx.restore();
          }
          var now = (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
          applyHubBoundaryToMain(now);
        });
      }

      function drawNodeLabels(ctx, nodes, globalScale, opts) {
        if (!ctx || !nodes || !nodes.length) return;
        opts = opts || {};
        var selId = opts.selectedId !== undefined ? opts.selectedId : selectedId;
        var ctxId = opts.ctxMenuId !== undefined ? opts.ctxMenuId : ctxMenuId;
        var focusId = opts.focusId !== undefined ? opts.focusId : selId;
        var z = globalScale || 1;
        var fade = zoomFade(z, labelMinZoom, labelFadeBand);
        if (fade <= 0) return;
        var cap = 2;
        var base = 6.4;
        var fontSize = (base * Math.min(z, cap)) / z;
        ctx.save();
        ctx.font = fontSize + "px Arial";
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        var maxLabelWidth = 200 / z;
        var lineHeight = fontSize * 1.2;
        nodes.forEach(function (node) {
          if (!node) return;
          if (node.__hub_center) return;
          var label = nodeDisplayLabel(node);
          if (!label) return;
          if (isNoteTypeHub(node) && isHubExpanded(node)) return;
          var connected = isConnectedForRender(String(node.id), focusId, ctxId);
          var labelColor = connected ? "#e5e7eb" : "rgba(229,231,235,0.2)";
          labelColor = applyDim(labelColor, fade);
          var radius = nodeBaseRadius(node);
          var pad = 4;
          if (node.__hub_parent) pad = pad * 0.5;
          var offset = radius + pad;
          ctx.fillStyle = labelColor;
          var lines = wrapLabelLines
            ? wrapLabelLines(ctx, String(label), maxLabelWidth)
            : [String(label)];
          if (!lines.length) return;
          for (var li = 0; li < lines.length; li++) {
            var line = lines[lines.length - 1 - li];
            var y = node.y - offset - li * lineHeight;
            ctx.fillText(line, node.x, y);
          }
        });
        ctx.restore();
      }

      if (typeof Graph.onRenderFramePost === "function") {
        Graph.onRenderFramePost(function (ctx, globalScale) {
          var data = Graph.graphData();
          if (!data || !data.nodes) return;
          drawNodeLabels(ctx, data.nodes, globalScale, {
            selectedId: getRenderActiveIdForMain(),
            focusId: getRenderFocusIdForMain(),
            ctxMenuId: ctxMenuId,
          });
          maybeUpdateFlow();
          drawPointerDebugMain();
        });
      }

      function handlePointerMove(e) {
        if (!tooltip) return;
        var ctxGraph = Graph;
        var ctxRect = null;
        tooltip.style.left = e.clientX + 12 + "px";
        tooltip.style.top = e.clientY + 12 + "px";
        if (!cardDotsEnabled) {
          if (dotTooltipActive || hoverDot) {
            dotTooltipActive = false;
            hoverDot = null;
            renderNodeTooltip(hoverNode);
            if (ctxGraph && typeof ctxGraph.resumeAnimation === "function") {
              ctxGraph.resumeAnimation();
            }
          }
          return;
        }
        var dotNode = hoverNodeHit || hoverNode;
        if (!dotNode || !dotNode.__card_dots || !dotNode.__card_dots.length) {
          if (dotTooltipActive || hoverDot) {
            dotTooltipActive = false;
            hoverDot = null;
            renderNodeTooltip(hoverNode);
            if (ctxGraph && typeof ctxGraph.resumeAnimation === "function") {
              ctxGraph.resumeAnimation();
            }
          }
          return;
        }
        var z = 1;
        try {
          if (ctxGraph && typeof ctxGraph.zoom === "function") {
            z = ctxGraph.zoom();
          }
        } catch (_e) {
          z = 1;
        }
        if (z < cardDotsMinZoom) {
          if (dotTooltipActive || hoverDot) {
            dotTooltipActive = false;
            hoverDot = null;
            renderNodeTooltip(hoverNode);
            if (ctxGraph && typeof ctxGraph.resumeAnimation === "function") {
              ctxGraph.resumeAnimation();
            }
          }
          return;
        }
        var pos = eventGraphPosFor(ctxGraph, e, ctxRect);
        if (!pos) return;
        var best = null;
        var bestDist = Infinity;
        dotNode.__card_dots.forEach(function (d) {
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
            ? { nodeId: String(dotNode.id), cardId: best.card.id || null }
            : null;
        var changed =
          (!hoverDot && nextHover) ||
          (hoverDot && !nextHover) ||
          (hoverDot && nextHover && (hoverDot.nodeId !== nextHover.nodeId || hoverDot.cardId !== nextHover.cardId));
        hoverDot = nextHover;
        if (best && best.card) {
          dotTooltipActive = true;
          renderDotTooltip(hoverNode || dotNode, best.card);
        } else if (dotTooltipActive) {
          dotTooltipActive = false;
          renderNodeTooltip(hoverNode);
        }
        if (changed && ctxGraph && typeof ctxGraph.resumeAnimation === "function") {
          ctxGraph.resumeAnimation();
        }
      }
      graphEl.onmousemove = handlePointerMove;
      graphEl.addEventListener("mouseleave", function () {
        showDebugToast("main mouseleave");
        hoverNode = null;
        hoverNodeHit = null;
        renderNodeTooltip(null);
      });

      // --- Link curves + visibility helpers ---
      function baseCurve(layer) {
        if (layer === "family") return 0.15;
        if (layer === "family_hub") return 0;
        if (layer === "reference") return -0.2;
        if (layer === "mass_linker") return -0.2;
        if (layer === "example") return 0.1;
        if (layer === "kanji") return -0.1;
        return 0;
      }

      function nodeVisible(n) {
        if (!n) return false;
        if (isHubMemberId(n.id)) return isActiveHubMember(n);
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

      // --- Filtering (layers, selection, hubs) ---
      function applyFilters(opts) {
        opts = opts || {};
        debugToast(
          "applyFilters: start reheat=" + (opts.reheat !== false) + " toast_visible=" + (opts.toast_visible || "off"),
          "sim_state",
          null,
          "trace"
        );
        var componentFocus = null;
        if (debugIf("sim_state", "applyFilters: kanjiFocusOnly branch", kanjiComponentFocusOnly && isKanjiLayerActive(), "trace")) {
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
          if (isKanjiComponent(l) && (!isKanjiLayerActive() || !kanjiComponentsEnabled)) return false;
          if (isKanjiComponent(l) && isKanjiLayerActive() && kanjiComponentsEnabled && kanjiComponentFocusOnly) {
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
        if (expandedHubs && expandedHubs.size && isMassLinkerLayerEnabled()) {
          expandedHubs.forEach(function (hid) {
            var entry = noteTypeHubMembers[String(hid)];
            if (!entry || !entry.nodes) return;
            entry.nodes.forEach(function (n) {
              if (!n || n.id === undefined || n.id === null) return;
              n.__hub_parent = String(hid);
              if (!activeIds[String(n.id)]) {
                activeIds[String(n.id)] = true;
                activeNodes.push(n);
              }
            });
          });
          expandedHubs.forEach(function (hid) {
            var entry = noteTypeHubMembers[String(hid)];
            if (!entry || !entry.edges) return;
            entry.edges.forEach(function (l) {
              if (!l) return;
              var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
              var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
              if (!activeIds[String(s)] || !activeIds[String(t)]) return;
              activeLinks.push({
                source: String(s),
                target: String(t),
                layer: l.layer,
                meta: l.meta ? Object.assign({}, l.meta) : {},
                kind: l.kind || (l.meta ? l.meta.kind : null),
                __hub_internal: true,
              });
            });
          });
        }
        if (!showUnlinked) {
          if (!activeLinks.length) {
            activeNodes = [];
          } else {
            var idKind = {};
            activeNodes.forEach(function (n) {
              idKind[String(n.id)] = n.kind || "";
            });
            var linkIdSet = {};
            activeLinks.forEach(function (l) {
              var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
              var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
              var sk = String(s);
              var tk = String(t);
              linkIdSet[sk] = true;
              linkIdSet[tk] = true;
            });
            activeNodes = activeNodes.filter(function (n) {
              if (n && n.kind === "family") return true;
              return linkIdSet[String(n.id)];
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

        // Hub members are rendered in the main canvas; positions are synced from hub sims.
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
        activeLinks.forEach(function (l) {
          normalizeFamilyHubLinkDirection(l);
        });
        rebuildLinkScoreCache(activeLinks);
        linkTopKSet = buildTopKLinkSet(activeLinks);
        linkMstSet = buildMstLinkSet(activeLinks);
        if (linkTopKSet || linkMstSet) {
          activeLinks = activeLinks.filter(function (l) {
            if (!l) return false;
            if (!isRefineLayer(l)) return true;
            var key = linkKey(l);
            var layerKey = neighborScalingLayerKey(l);
            var applyTopK = !!(linkTopKSet && (layerKey === "kanji" || layerKey === "kanji_component"));
            if (applyTopK && !linkTopKSet.has(key)) return false;
            if (linkMstSet && !linkMstSet.has(key)) return false;
            return true;
          });
        }
        familyChainParent = {};
        familyHubByMember = {};
        familyMembersByFid = {};
        familyHubIdByFid = {};
        if (familyChainEdges) {
          activeLinks.forEach(function (l) {
            if (!l || l.layer !== "family_hub" || !l.meta) return;
            var fid = l.meta.fid !== undefined && l.meta.fid !== null ? String(l.meta.fid) : "";
            if (!fid) return;
            var ids = linkIds(l);
            if (l.meta.kind === "chain") {
              if (!familyChainParent[fid]) familyChainParent[fid] = {};
              var bucket = familyChainParent[fid][ids.s];
              if (!bucket) {
                familyChainParent[fid][ids.s] = [ids.t];
              } else if (Array.isArray(bucket)) {
                if (bucket.indexOf(ids.t) === -1) bucket.push(ids.t);
              } else if (bucket !== ids.t) {
                familyChainParent[fid][ids.s] = [bucket, ids.t];
              }
            } else if (l.meta.kind === "hub") {
              if (!familyHubByMember[fid]) familyHubByMember[fid] = {};
              var hubId = ids.t;
              var memberId = ids.s;
              if (!String(ids.t).startsWith("family:") && String(ids.s).startsWith("family:")) {
                hubId = ids.s;
                memberId = ids.t;
              }
              familyHubByMember[fid][memberId] = hubId;
            }
          });
        }
        var hubCounts = {};
        var hubByFid = {};
        activeNodes.forEach(function (n) {
          if (n.kind !== "family") return;
          var fid = n.label || String(n.id).replace("family:", "");
          if (fid) {
            hubByFid[fid] = String(n.id);
            familyHubIdByFid[fid] = String(n.id);
          }
        });
        activeNodes.forEach(function (n) {
          if (n.kind === "family") return;
          var fams = getNodeFamilies(n);
          if (!fams.length) return;
          fams.forEach(function (fid) {
            var hid = hubByFid[fid];
            if (hid) hubCounts[hid] = (hubCounts[hid] || 0) + 1;
            if (!familyMembersByFid[fid]) familyMembersByFid[fid] = new Set();
            familyMembersByFid[fid].add(String(n.id));
          });
        });
        var degree = {};
        neighborMap = {};
        referenceInDegById = {};
        activeLinks.forEach(function (l) {
          if (!isLinkVisibleForPhysics(l)) return;
          if (l.layer === "family" && l.meta && l.meta.same_prio) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          degree[sk] = (degree[sk] || 0) + 1;
          degree[tk] = (degree[tk] || 0) + 1;
          if (l.layer === "reference" || l.layer === "mass_linker") {
            referenceInDegById[tk] = (referenceInDegById[tk] || 0) + 1;
          }
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
        assignNeighborMetrics();
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
          clearActiveSelection("main");
        }
        if (assignLinkCurves) {
          assignLinkCurves(activeLinks, baseCurve);
        }
        activeLinksVersion += 1;
        familyChainCache = { selId: null, version: activeLinksVersion, set: null };
        if (hubSimManager && typeof hubSimManager.sync === "function") {
          hubSimManager.sync();
        }
        Graph.graphData({ nodes: activeNodes, links: activeLinks });
        debugThrottle(
          "sim_state",
          "applyFilters:counts",
          "applyFilters counts: nodes=" + activeNodes.length + " links=" + activeLinks.length,
          "debug",
          1000
        );
        scheduleFlowUpdate();
      if (typeof Graph.linkCurvature === "function") {
        Graph.linkCurvature(function (l) {
          return -(l.curve || 0);
        });
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
          var ml = 0;
          activeLinks.forEach(function (l) {
            if (l.layer === "mass_linker") {
              ml += 1;
              return;
            }
            if (l.layer !== "reference") return;
            if (l.meta && l.meta.manual) m += 1;
            else a += 1;
          });
          log("active refs auto=" + a + " manual=" + m + " mass_linker=" + ml);
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

      function getMainZoom() {
        var z = 1;
        try {
          if (Graph && typeof Graph.zoom === "function") {
            z = Graph.zoom() || 1;
          }
        } catch (_e) {
          z = 1;
        }
        if (!isFinite(z)) z = 1;
        return z;
      }

      function refreshNeighborScaling(reheat) {
        applyFilters({ reheat: reheat !== false });
      }

      function zoomFade(z, min, band) {
        var b = band || 0;
        if (b <= 0) return z >= min ? 1 : 0;
        var start = min - b;
        var end = min + b;
        if (z <= start) return 0;
        if (z >= end) return 1;
        var t = (z - start) / (end - start);
        return t * t * (3 - 2 * t);
      }

      function getFlowFade() {
        debugThrottle("sim_flow", "getFlowFade", "getFlowFade", "trace", 1000);
        return zoomFade(getMainZoom(), flowMinZoom, flowZoomFadeBand);
      }

      function getFlowFadeForLink(l, focusId, ctxId) {
        debugThrottle("sim_flow", "getFlowFadeForLink", "getFlowFadeForLink", "trace", 1000);
        return isFlowForcedForLink(l, focusId, ctxId) ? 1 : getFlowFade();
      }

      function isFlowZoomActive() {
        debugThrottle("sim_flow", "isFlowZoomActive", "isFlowZoomActive", "trace", 1000);
        return getFlowFade() > 0;
      }

      function handleFlowZoomChange() {
        var fade = getFlowFade();
        var changed = lastFlowFade === null || Math.abs(fade - lastFlowFade) > 0.02;
        debugThrottle("sim_flow", "flowZoom:fade", "handleFlowZoomChange fade=" + fade.toFixed(2) + " changed=" + changed, "trace", 500);
        debugIf("sim_flow", "handleFlowZoomChange: changed", changed);
        if (changed) {
          lastFlowFade = fade;
          updateFlowParticles();
          if (typeof Graph.linkDirectionalParticles === "function") {
            Graph.linkDirectionalParticles(Graph.linkDirectionalParticles());
          }
          if (typeof Graph.linkDirectionalParticleSpeed === "function") {
            Graph.linkDirectionalParticleSpeed(Graph.linkDirectionalParticleSpeed());
          }
          if (hubSimManager && typeof hubSimManager.forEachSim === "function") {
            hubSimManager.forEachSim(function (sim) {
              if (!sim || !sim.graph) return;
              updateHubLinkParticles(sim);
              if (typeof sim.graph.linkDirectionalParticles === "function") {
                sim.graph.linkDirectionalParticles(sim.graph.linkDirectionalParticles());
              }
              if (typeof sim.graph.linkDirectionalParticleSpeed === "function") {
                sim.graph.linkDirectionalParticleSpeed(sim.graph.linkDirectionalParticleSpeed());
              }
            });
          }
          if (typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
        }
      }

      function isFlowEnabledForLink(l) {
        if (!l) return false;
        if (!isLayerEnabled(l.layer)) return false;
        if (l.layer === "family" && l.meta && l.meta.same_prio) return false;
        if (l.meta && l.meta.flow_only && !(l.meta && l.meta.bidirectional)) return false;
        if (isKanjiComponent(l)) return !!kanjiComponentFlow;
        return !!layerFlow[l.layer];
      }

      function isFlowForcedForLink(l, focusId, ctxId) {
        return isLinkEmphasizedForRender(l, focusId, ctxId);
      }

      function getFlowParticleCount(l, len, focusId, ctxId) {
        debugThrottle("sim_flow", "getFlowParticleCount", "getFlowParticleCount", "trace", 1000);
        var forced = isFlowForcedForLink(l, focusId, ctxId);
        if (!forced && !isFlowEnabledForLink(l)) return 0;
        var fade = forced ? 1 : getFlowFade();
        if (fade <= 0) return 0;
        var div = isKanjiComponent(l) ? 120 : 160;
        var base = Math.max(2, Math.min(10, Math.round(len / div)));
        return Math.max(0, Math.round(base * fade));
      }

      function getFlowParticleSpeed(l, len, focusId, ctxId) {
        debugThrottle("sim_flow", "getFlowParticleSpeed", "getFlowParticleSpeed", "trace", 1000);
        var forced = isFlowForcedForLink(l, focusId, ctxId);
        if (!forced && !isFlowEnabledForLink(l)) return 0;
        var fade = forced ? 1 : getFlowFade();
        if (fade <= 0) return 0;
        var speedBase = isKanjiComponent(l) ? flowSpeed * 2 : flowSpeed;
        if (forced) speedBase = Math.max(speedBase, 0.02);
        return (speedBase / Math.max(30, len)) * fade;
      }

      function getFlowParticleCountCached(l, len, focusId, ctxId) {
        debugThrottle("sim_flow", "getFlowParticleCountCached", "getFlowParticleCountCached", "trace", 1000);
        if (isFlowForcedForLink(l, focusId, ctxId)) {
          return getFlowParticleCount(l, len, focusId, ctxId);
        }
        if (!isFlowEnabledForLink(l)) return 0;
        if (!isFlowZoomActive()) return 0;
        if (l && l.__particle_count !== undefined) {
          if (l.__particle_count === 0 && isFlowEnabledForLink(l) && isFlowZoomActive()) {
            return getFlowParticleCount(l, len, focusId, ctxId);
          }
          return l.__particle_count;
        }
        return getFlowParticleCount(l, len, focusId, ctxId);
      }

      function getFlowParticleSpeedCached(l, len, focusId, ctxId) {
        debugThrottle("sim_flow", "getFlowParticleSpeedCached", "getFlowParticleSpeedCached", "trace", 1000);
        if (isFlowForcedForLink(l, focusId, ctxId)) {
          return getFlowParticleSpeed(l, len, focusId, ctxId);
        }
        if (!isFlowEnabledForLink(l)) return 0;
        if (!isFlowZoomActive()) return 0;
        if (l && l.__particle_speed !== undefined) {
          if (l.__particle_speed === 0 && isFlowEnabledForLink(l) && isFlowZoomActive()) {
            return getFlowParticleSpeed(l, len, focusId, ctxId);
          }
          return l.__particle_speed;
        }
        return getFlowParticleSpeed(l, len, focusId, ctxId);
      }

      // --- Flow particles scheduling ---
      function updateFlowParticles() {
        if (debugIf("sim_flow", "updateFlowParticles: no activeLinks", !activeLinks || !activeLinks.length)) return;
        showDebugToast("updateFlowParticles: start", "sim_flow");
        activeLinks.forEach(function (l) {
          var len = linkLength(l);
          var count = getFlowParticleCount(l, len);
          if (!count) {
            l.__particle_count = 0;
            l.__particle_speed = 0;
            if (l.__photons) {
              l.__photons.length = 0;
            }
            return;
          }
          l.__particle_count = count;
          l.__particle_speed = getFlowParticleSpeed(l, len);
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
        showDebugToast("updateFlowParticles: end", "sim_flow");
        log("js flow particles updated");
      }

      function scheduleFlowUpdate() {
        showDebugToast("scheduleFlowUpdate", "sim_flow");
        pendingFlowUpdate = true;
      }

      function maybeUpdateFlow() {
        if (debugIf("sim_flow", "maybeUpdateFlow: no pending", !pendingFlowUpdate)) return;
        if (debugIf("sim_flow", "maybeUpdateFlow: engine running", typeof Graph.isEngineRunning === "function" && Graph.isEngineRunning())) {
          return;
        }
        pendingFlowUpdate = false;
        debugToast("maybeUpdateFlow: apply", "sim_flow", null, "trace");
        updateFlowParticles();
        if (typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
      }

      function refreshSelection() {
        if (kanjiComponentFocusOnly && isLayerEnabled("kanji")) {
          applyFilters({ reheat: false });
          showDebugToast("refreshSelection: kanji applyFilters", "sim_state");
        } else if (typeof Graph.resumeAnimation === "function") {
          // Selection should not reheat physics; just ensure a redraw loop is active.
          Graph.resumeAnimation();
          showDebugToast("refreshSelection: resumeAnimation", "sim_state");
        }
        if (typeof Graph.linkColor === "function") {
          Graph.linkColor(Graph.linkColor());
        }
        if (typeof Graph.linkDirectionalParticleColor === "function") {
          Graph.linkDirectionalParticleColor(Graph.linkDirectionalParticleColor());
        }
        if (hubSimManager && typeof hubSimManager.forEachSim === "function") {
          hubSimManager.forEachSim(function (sim) {
            if (!sim || !sim.graph) return;
            if (typeof sim.graph.linkColor === "function") {
              sim.graph.linkColor(sim.graph.linkColor());
            }
            if (typeof sim.graph.linkDirectionalParticleColor === "function") {
              sim.graph.linkDirectionalParticleColor(sim.graph.linkDirectionalParticleColor());
            }
          });
        }
      }

      // --- Drag handling ---
      function bindLayerToggle(layerKey, el) {
        if (!el) return;
        el.addEventListener("change", function () {
          debugUI("layer toolbar toggle: " + layerKey);
          var lbl = this && this.parentNode ? this.parentNode.textContent.trim() : "Layer";
          showToast((this.checked ? "Enabled " : "Disabled ") + lbl);
          storeLayers();
          if (window.pycmd) {
            pycmd("lenabled:" + layerKey + ":" + (this.checked ? "1" : "0"));
          }
          if (layerKey === "mass_linker" && !this.checked) {
            expandedHubs.clear();
          }
          applyFilters({ reheat: true, toast_visible: true });
        });
      }

      for (var k in layerState) {
        if (layerState[k]) {
          bindLayerToggle(k, layerState[k]);
        }
      }

      function bindDebugToggle(key, el) {
        if (!el) return;
        var storageKey = "ajpc_graph_debug_toggle:" + key;
        try {
          var stored = localStorage.getItem(storageKey);
          if (stored !== null) {
            debugToggles[key] = stored === "1";
          }
        } catch (_e) {}
        el.checked = !!debugToggles[key];
        if (el.checked && el.parentNode) el.parentNode.classList.add("active");
        el.addEventListener("change", function () {
          debugUI("debug toggle: " + key);
          debugToggles[key] = !!this.checked;
          try {
            localStorage.setItem(storageKey, debugToggles[key] ? "1" : "0");
          } catch (_e2) {}
          if (key === "debug_toasts") {
            window.GraphDebugToastsEnabled = !!debugToggles[key];
          }
          if (el.parentNode) {
            if (debugToggles[key]) el.parentNode.classList.add("active");
            else el.parentNode.classList.remove("active");
          }
          updateDebugUnderlines();
          applyDebugToggles();
        });
      }
      function bindDebugMstToggle() {
        var el = document.getElementById("debug-mst");
        if (!el) return;
        el.checked = !!linkMstEnabled;
        if (el.checked && el.parentNode) el.parentNode.classList.add("active");
        el.addEventListener("change", function () {
          linkMstEnabled = !!this.checked;
          if (data.meta) data.meta.link_mst_enabled = linkMstEnabled;
          if (window.pycmd) {
            pycmd("linkmst:" + (linkMstEnabled ? "1" : "0"));
          }
          applyFilters({ reheat: true });
          updateDebugUnderlines();
        });
      }
      function bindDebugKanjiTopK() {
        var toggle = document.getElementById("debug-kanji-topk");
        var row = document.getElementById("debug-kanji-topk-row");
        var range = document.getElementById("debug-kanji-topk-range");
        var num = document.getElementById("debug-kanji-topk-num");
        if (!toggle || !range || !num) return;
        var showRow = function () {
          if (row) row.style.display = kanjiTopKEnabled ? "flex" : "none";
        };
        toggle.checked = !!kanjiTopKEnabled;
        if (toggle.checked && toggle.parentNode) toggle.parentNode.classList.add("active");
        range.value = kanjiTopK || 1;
        num.value = kanjiTopK || 1;
        showRow();
        function persistTopK() {
          if (data.meta) {
            data.meta.kanji_top_k_enabled = kanjiTopKEnabled;
            data.meta.kanji_top_k = kanjiTopK;
          }
          if (window.pycmd) {
            pycmd("kanjitopkenabled:" + (kanjiTopKEnabled ? "1" : "0"));
            pycmd("kanjitopk:" + kanjiTopK);
          }
        }
        toggle.addEventListener("change", function () {
          kanjiTopKEnabled = !!toggle.checked;
          if (toggle.parentNode) {
            if (kanjiTopKEnabled) toggle.parentNode.classList.add("active");
            else toggle.parentNode.classList.remove("active");
          }
          persistTopK();
          showRow();
          applyFilters({ reheat: true });
          updateDebugUnderlines();
        });
        function setVal(val, notify) {
          if (!isFinite(val)) return;
          var next = Math.max(1, Math.min(100, Math.round(val)));
          kanjiTopK = next;
          range.value = next;
          num.value = next;
          if (notify) {
            persistTopK();
            applyFilters({ reheat: true });
          }
        }
        range.addEventListener("input", function () {
          setVal(parseFloat(range.value), false);
        });
        range.addEventListener("change", function () {
          setVal(parseFloat(range.value), true);
        });
        num.addEventListener("change", function () {
          setVal(parseFloat(num.value), true);
        });
      }
      function bindDebugCategoryToggle(key, el) {
        if (!el) return;
        var storageKey = "ajpc_graph_debug_cat:" + key;
        try {
          var stored = localStorage.getItem(storageKey);
          if (stored !== null) {
            debugCategories[key] = stored === "1";
          }
        } catch (_e) {}
        el.checked = !!debugCategories[key];
        if (el.parentNode) {
          if (el.checked) el.parentNode.classList.add("active");
          else el.parentNode.classList.remove("active");
        }
        el.addEventListener("change", function () {
          debugUI("debug category toggle: " + key);
          debugCategories[key] = !!this.checked;
          try {
            localStorage.setItem(storageKey, debugCategories[key] ? "1" : "0");
          } catch (_e2) {}
          if (el.parentNode) {
            if (debugCategories[key]) el.parentNode.classList.add("active");
            else el.parentNode.classList.remove("active");
          }
          window.GraphDebugCategories = debugCategories;
        });
      }
      function bindDebugLevelToggle(level, el) {
        if (!el) return;
        var storageKey = "ajpc_graph_debug_level:" + level;
        try {
          var stored = localStorage.getItem(storageKey);
          if (stored !== null) {
            debugLevels[level] = stored === "1";
          }
        } catch (_e) {}
        el.checked = !!debugLevels[level];
        if (el.parentNode) {
          if (el.checked) el.parentNode.classList.add("active");
          else el.parentNode.classList.remove("active");
        }
        el.addEventListener("change", function () {
          debugUI("debug level toggle: " + level);
          debugLevels[level] = !!this.checked;
          try {
            localStorage.setItem(storageKey, debugLevels[level] ? "1" : "0");
          } catch (_e2) {}
          if (el.parentNode) {
            if (debugLevels[level]) el.parentNode.classList.add("active");
            else el.parentNode.classList.remove("active");
          }
          window.GraphDebugLevels = debugLevels;
          window.DebugLevels = debugLevels;
          if (DebugToast && typeof DebugToast.setLevelEnabled === "function") {
            DebugToast.setLevelEnabled(level, debugLevels[level]);
          }
        });
      }
      function setupDebugLevelPanel() {
        var wrap = document.getElementById("debug-levels");
        if (!wrap) return;
        wrap.innerHTML = "";
        var order = ["trace", "debug", "info", "warn", "error"];
        order.forEach(function (lvl) {
          var label = document.createElement("label");
          label.className = "debug-level";
          label.setAttribute("data-debug-level", lvl);
          var input = document.createElement("input");
          input.type = "checkbox";
          input.id = "debug-level-" + lvl;
          label.appendChild(input);
          label.appendChild(document.createTextNode(" " + lvl.toUpperCase()));
          wrap.appendChild(label);
          bindDebugLevelToggle(lvl, input);
        });
      }
      function setupDebugCategoryPanel() {
        var wrap = document.getElementById("debug-categories");
        if (!wrap) return;
        wrap.innerHTML = "";
        var defs = [
          { key: "pipeline", label: "Pipeline" },
          { key: "ui", label: "UI" },
          { key: "input", label: "Input" },
          { key: "selection", label: "Selection" },
          { key: "render", label: "Render" },
          { key: "perf", label: "Perf" },
          { key: "config", label: "Config" },
          { key: "data", label: "Data" },
          { key: "sim_core", label: "Sim Core" },
          { key: "sim_state", label: "Sim State" },
          { key: "sim_events", label: "Sim Events" },
          { key: "sim_alpha", label: "Sim Alpha" },
          { key: "sim_velocity", label: "Sim Velocity" },
          { key: "sim_forces", label: "Sim Forces" },
          { key: "sim_collision", label: "Sim Collision" },
          { key: "sim_bounds", label: "Sim Bounds" },
          { key: "sim_links", label: "Sim Links" },
          { key: "sim_flow", label: "Sim Flow" },
          { key: "sim_drag", label: "Sim Drag" },
          { key: "sim_hub", label: "Sim Hub" },
          { key: "sim_freeze", label: "Sim Freeze" },
        ];
        defs.forEach(function (def) {
          var label = document.createElement("label");
          label.className = "debug-cat";
          label.setAttribute("data-debug-cat", def.key);
          var input = document.createElement("input");
          input.type = "checkbox";
          input.id = "debug-cat-" + def.key;
          label.appendChild(input);
          label.appendChild(document.createTextNode(" " + def.label));
          wrap.appendChild(label);
          bindDebugCategoryToggle(def.key, input);
        });
      }
      bindDebugToggle("shadow_canvas", document.getElementById("debug-shadow-canvas"));
      bindDebugToggle("link_labels", document.getElementById("debug-link-labels"));
      bindDebugToggle("engine_panel", document.getElementById("debug-engine-panel"));
      bindDebugToggle("reheat_guard", document.getElementById("debug-reheat-guard"));
      bindDebugToggle("debug_toasts", document.getElementById("debug-toasts"));
      bindDebugMstToggle();
      bindDebugKanjiTopK();
      (function bindDebugToastSection() {
        var wrap = document.getElementById("debug-toasts-wrap");
        var btn = document.getElementById("debug-toasts-toggle");
        var storageKey = "ajpc_graph_debug_toasts_collapsed";
        if (!wrap || !btn) return;
        var collapsed = false;
        try {
          collapsed = localStorage.getItem(storageKey) === "1";
        } catch (_e) {}
        if (collapsed) wrap.classList.add("collapsed");
        btn.addEventListener("click", function () {
          wrap.classList.toggle("collapsed");
          var isCollapsed = wrap.classList.contains("collapsed");
          try {
            localStorage.setItem(storageKey, isCollapsed ? "1" : "0");
          } catch (_e2) {}
        });
      })();
      setupDebugLevelPanel();
      setupDebugCategoryPanel();
      updateDebugUnderlines();
      applyDebugToggles();

      function startPerfMeter() {
        var wrap = document.getElementById("debug-perf");
        if (!wrap) return;
        var fpsEl = wrap.querySelector(".debug-perf-fps");
        var msEl = wrap.querySelector(".debug-perf-ms");
        var last = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        var acc = 0;
        var frames = 0;
        function tick(now) {
          var t = now;
          if (typeof t !== "number") {
            t = (typeof performance !== "undefined" && performance.now)
              ? performance.now()
              : Date.now();
          }
          var dt = t - last;
          last = t;
          acc += dt;
          frames += 1;
          if (acc >= 500) {
            var fps = Math.round((frames * 1000) / acc);
            var ms = (acc / frames).toFixed(1);
            if (fpsEl) fpsEl.textContent = fps + " fps";
            if (msEl) msEl.textContent = ms + " ms";
            acc = 0;
            frames = 0;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
      startPerfMeter();

      function startEngineOverlay() {
        var wrap = document.getElementById("debug-engine");
        if (!wrap) return;
        var statusEl = wrap.querySelector(".debug-engine-status");
        var forcesEl = wrap.querySelector(".debug-engine-forces");
        var flagsEl = wrap.querySelector(".debug-engine-flags");
        function safeNum(val, fallback) {
          return (typeof val === "number" && isFinite(val)) ? val : fallback;
        }
        function fmt(val, digits) {
          if (!isFinite(val)) return String(val);
          var d = typeof digits === "number" ? digits : 3;
          return Number(val).toFixed(d);
        }
        function getSampleNode() {
          if (activeNodes && activeNodes.length) return activeNodes[0];
          if (Graph && typeof Graph.graphData === "function") {
            var data = Graph.graphData() || {};
            if (data.nodes && data.nodes.length) return data.nodes[0];
          }
          return null;
        }
        function getSampleLink() {
          if (activeLinks && activeLinks.length) return activeLinks[0];
          if (Graph && typeof Graph.graphData === "function") {
            var data = Graph.graphData() || {};
            if (data.links && data.links.length) return data.links[0];
          }
          return null;
        }
        function readForceStrength(force, sample) {
          if (!force || typeof force.strength !== "function") return null;
          try {
            var s = force.strength();
            if (typeof s === "function") {
              if (sample) return s(sample);
              return null;
            }
            return s;
          } catch (_e) {
            return null;
          }
        }
        function readForceDistance(force, sample) {
          if (!force || typeof force.distance !== "function") return null;
          try {
            var d = force.distance();
            if (typeof d === "function") {
              if (sample) return d(sample);
              return null;
            }
            return d;
          } catch (_e) {
            return null;
          }
        }
        function tick() {
          if (!debugEngineEnabled) {
            if (wrap) wrap.style.display = "none";
          } else {
            if (wrap) wrap.style.display = "flex";
          }
          var running = Graph && typeof Graph.isEngineRunning === "function" ? Graph.isEngineRunning() : engineRunningFallback;
          if (!running && engineRunningFallback) running = true;
          var alpha = Graph && typeof Graph.d3Alpha === "function" ? Graph.d3Alpha() : null;
          var alphaDecay = Graph && typeof Graph.d3AlphaDecay === "function" ? Graph.d3AlphaDecay() : (physics ? physics.alpha_decay : null);
          var cooldown = Graph && typeof Graph.cooldownTicks === "function" ? Graph.cooldownTicks() : (physics ? physics.cooldown_ticks : null);
          var warmup = Graph && typeof Graph.warmupTicks === "function" ? Graph.warmupTicks() : (physics ? physics.warmup_ticks : null);
          var velDecay = Graph && typeof Graph.d3VelocityDecay === "function" ? Graph.d3VelocityDecay() : (physics ? physics.velocity_decay : null);
          var sampleNode = getSampleNode();
          var sampleLink = getSampleLink();
          var chargeForce = Graph && typeof Graph.d3Force === "function" ? Graph.d3Force("charge") : null;
          var linkForce = Graph && typeof Graph.d3Force === "function" ? Graph.d3Force("link") : null;
          var fxForce = Graph && typeof Graph.d3Force === "function" ? Graph.d3Force("x") : null;
          var fyForce = Graph && typeof Graph.d3Force === "function" ? Graph.d3Force("y") : null;
          var charge = readForceStrength(chargeForce, sampleNode);
          var linkDist = readForceDistance(linkForce, sampleLink);
          var linkStrength = readForceStrength(linkForce, sampleLink);
          var maxRadius = chargeForce && typeof chargeForce.distanceMax === "function" ? chargeForce.distanceMax() : (physics ? physics.max_radius : null);
          var centerX = readForceStrength(fxForce, sampleNode);
          var centerY = readForceStrength(fyForce, sampleNode);
          var centerForce = (centerX !== null) ? centerX : (centerY !== null ? centerY : (physics ? physics.center_force : null));

          if (statusEl) {
            statusEl.textContent =
              (running ? "running" : "stopped") +
              " | alpha=" + (alpha !== null ? fmt(alpha, 3) : "--") +
              " | alphaDecay=" + (alphaDecay !== null ? fmt(alphaDecay, 3) : "--") +
              " | cooldown=" + (cooldown === -1 ? "∞" : (cooldown !== null ? cooldown : "--")) +
              " | warmup=" + (warmup !== null ? warmup : "--") +
              " | velDecay=" + (velDecay !== null ? fmt(velDecay, 3) : "--");
          }
          if (forcesEl) {
            forcesEl.textContent =
              "charge=" + (charge !== null ? fmt(charge, 2) : "--") +
              " | linkDist=" + (linkDist !== null ? fmt(linkDist, 1) : "--") +
              " | linkStrength=" + (linkStrength !== null ? fmt(linkStrength, 2) : "--") +
              " | maxRadius=" + (maxRadius !== null ? fmt(maxRadius, 0) : "--") +
              " | center=" + (centerForce !== null ? fmt(centerForce, 3) : "--");
          }
          if (flagsEl) {
            flagsEl.textContent =
              "dragActive=" + (!!dragActive) +
              " | pendingFlow=" + (!!pendingFlowUpdate) +
              " | expandedHubs=" + (expandedHubs ? expandedHubs.size : 0);
          }
          setTimeout(tick, 500);
        }
        tick();
      }
      startEngineOverlay();

      function storeLayers() {
        var state = {
          family: isLayerEnabled("family"),
          family_hub: isLayerEnabled("family_hub"),
          reference: isLayerEnabled("reference"),
          mass_linker: isLayerEnabled("mass_linker"),
          example: isLayerEnabled("example"),
          kanji: isLayerEnabled("kanji"),
        };
        try {
          localStorage.setItem("ajpc_graph_layers", JSON.stringify(state));
        } catch (_e) { }
      }

      // --- Settings UI (tabs + panels) ---
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
            debugUI("settings tab click");
            e.stopPropagation();
            setTab(t.getAttribute("data-tab"));
          });
        });
        btn.addEventListener("click", function (e) {
          debugUI("settings toggle");
          e.stopPropagation();
          panel.classList.toggle("open");
        });
        document.addEventListener("click", function (e) {
          debugUI("settings outside click");
          if (!panel.classList.contains("open")) return;
          if (panel.contains(e.target) || btn.contains(e.target)) return;
          panel.classList.remove("open");
        });
        setTab("links");
      }

      if (typeof Graph.onEngineStop === "function") {
        Graph.onEngineStop(function () {
          debugToast("onEngineStop", "sim_state", null, "trace");
          var fmtVal = function (val, digits) {
            if (val === null || val === undefined || !isFinite(val)) return "--";
            var d = typeof digits === "number" ? digits : 2;
            try {
              return Number(val).toFixed(d);
            } catch (_e) {
              return String(val);
            }
          };
          var alpha = Graph && typeof Graph.d3Alpha === "function" ? Graph.d3Alpha() : null;
          var alphaMin = Graph && typeof Graph.d3AlphaMin === "function" ? Graph.d3AlphaMin() : null;
          var alphaDecay = Graph && typeof Graph.d3AlphaDecay === "function" ? Graph.d3AlphaDecay() : null;
          var velDecay = Graph && typeof Graph.d3VelocityDecay === "function" ? Graph.d3VelocityDecay() : null;
          var cooldownTicks = Graph && typeof Graph.cooldownTicks === "function" ? Graph.cooldownTicks() : null;
          var cooldownTime = Graph && typeof Graph.cooldownTime === "function" ? Graph.cooldownTime() : null;
          showDebugToast(
            "Engine stop: alpha=" +
            fmtVal(alpha, 3) +
            " alphaMin=" +
            fmtVal(alphaMin, 3) +
            " alphaDecay=" +
            fmtVal(alphaDecay, 4) +
            " velDecay=" +
            fmtVal(velDecay, 4) +
            " cooldownTicks=" +
            (cooldownTicks === Infinity ? "∞" : (cooldownTicks !== null ? cooldownTicks : "--")) +
            " cooldownTime=" +
            (cooldownTime === Infinity ? "∞" : (cooldownTime !== null ? cooldownTime : "--")),
            { cat: "sim_state", level: "info" }
          );
          engineRunningFallback = false;
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
        } catch (_e) { }
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

      function updateDebugUnderlines() {
        var labels = document.querySelectorAll("#debug-panel label.debug-toggle");
        labels.forEach(function (lbl) {
          var input = lbl.querySelector("input");
          if (input && input.checked) {
            lbl.style.borderBottom = "2px solid #d4b04c";
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
            fieldsWrap.className = "nt-fields";
            var fieldsLeft = document.createElement("div");
            fieldsLeft.className = "nt-fields-left";
            var fieldsRight = document.createElement("div");
            fieldsRight.className = "nt-fields-right";
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
              debugUI("note-type label-field change");
              if (window.pycmd) {
                pycmd("label:" + nt.id + ":" + encodeURIComponent(select.value));
              }
              showToast("Name field: " + nt.name + " -> " + select.value);
            });
            labelFieldWrap.appendChild(labelFieldLabel);
            labelFieldWrap.appendChild(select);
            fieldsLeft.appendChild(labelFieldWrap);

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
              debugUI("note-type linked-field change");
              if (window.pycmd) {
                pycmd("lnfield:" + nt.id + ":" + encodeURIComponent(linked.value));
              }
              updateLinkedColor();
              showToast("Linked field: " + nt.name + " -> " + linked.value);
            });
            updateLinkedColor();
            linkedFieldWrap.appendChild(linkedFieldLabel);
            linkedFieldWrap.appendChild(linked);
            fieldsLeft.appendChild(linkedFieldWrap);

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
              debugUI("note-type tooltip toggle");
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
              debugUI("note-type tooltip outside click");
              if (!tooltipOpen) return;
              if (!tooltipDrop.contains(e.target)) {
                closeTooltip();
              }
            });
            updateTooltipTrigger();
            tooltipWrap.appendChild(tooltipLabel);
            tooltipWrap.appendChild(tooltipDrop);
            fieldsLeft.appendChild(tooltipWrap);

            var color = document.createElement("input");
            color.type = "color";
            color.className = "nt-color-input";
            color.value = noteTypeColors[String(nt.id)] || "#4da3ff";
            var preview = document.createElement("div");
            preview.className = "nt-preview";
            var previewDot = document.createElement("div");
            previewDot.className = "nt-preview-dot";
            preview.appendChild(previewDot);
            preview.appendChild(color);
            function updatePreviewColor(val) {
              preview.style.borderColor = val;
              preview.style.setProperty("--preview-color", val);
              preview.style.setProperty("--preview-color-alpha", colorWithAlpha(val, 0.2));
              previewDot.style.background = val;
              if (colorWithAlpha) {
                preview.style.background = colorWithAlpha(val, 0.2);
              } else {
                preview.style.background = val;
              }
            }
            updatePreviewColor(color.value);
            color.addEventListener("change", function () {
              debugUI("note-type color change");
              noteTypeColors[String(nt.id)] = color.value;
              if (window.pycmd) {
                pycmd(
                  "color:" + nt.id + ":" + encodeURIComponent(color.value)
                );
              }
              applyFilters({ reheat: false });
              updatePreviewColor(color.value);
              if (typeof updateCardPreviewColor === "function") {
                updateCardPreviewColor();
              }
              showToast("Color: " + nt.name);
            });
            fieldsRight.appendChild(preview);
            fieldsWrap.appendChild(fieldsLeft);
            fieldsWrap.appendChild(fieldsRight);
            group.appendChild(fieldsWrap);
            list.appendChild(group);

            function updateVisibility() {
              fieldsWrap.style.display = chk.checked ? "flex" : "none";
            }
            chk.addEventListener("change", function () {
              debugUI("note-type visibility toggle");
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

        var layout = document.createElement("div");
        layout.className = "card-settings-wrap";
        var left = document.createElement("div");
        left.className = "card-settings-left";
        var right = document.createElement("div");
        right.className = "card-settings-right";

        var toggleRow = document.createElement("div");
        toggleRow.className = "nt-field";
        var toggleLabel = document.createElement("label");
        toggleLabel.textContent = "Show Card Dots";
        var toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = !!cardDotsEnabled;
        toggle.addEventListener("change", function () {
          debugUI("card dots toggle");
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
        left.appendChild(toggleRow);

        var preview = document.createElement("div");
        preview.className = "card-preview-node";
        var previewCore = document.createElement("div");
        previewCore.className = "card-preview-core";
        preview.appendChild(previewCore);
        var previewBaseColor = "#4da3ff";

        var inputSusp = document.createElement("input");
        inputSusp.type = "color";
        inputSusp.className = "card-preview-picker";
        inputSusp.value = cardDotColors.suspended || "#ef4444";
        var inputBur = document.createElement("input");
        inputBur.type = "color";
        inputBur.className = "card-preview-picker";
        inputBur.value = cardDotColors.buried || "#f59e0b";
        preview.appendChild(inputSusp);
        preview.appendChild(inputBur);

        var slots = 12;
        var dots = [];
        for (var idx = 0; idx < slots; idx++) {
          var dot = document.createElement("div");
          dot.className = "card-preview-dot";
          var key = "normal";
          if (idx < 2) key = "ghost";
          else if (idx < 4) key = "suspended";
          else if (idx === 4) key = "buried";
          dot.dataset.key = key;
          var ang = Math.PI + (Math.PI * 2 * idx) / slots;
          var dx = Math.cos(ang) * 14;
          var dy = Math.sin(ang) * 14;
          dot.style.left = "calc(50% + " + dx.toFixed(1) + "px)";
          dot.style.top = "calc(50% + " + dy.toFixed(1) + "px)";
          dot.addEventListener("click", function (e) {
            e.stopPropagation();
            var cur = e && e.currentTarget ? e.currentTarget : null;
            var k = cur && cur.dataset ? cur.dataset.key : "";
            if (k === "suspended") inputSusp.click();
            else if (k === "buried") inputBur.click();
          });
          preview.appendChild(dot);
          dots.push(dot);
        }

        function updateDotColors() {
          dots.forEach(function (dot) {
            var key = dot.dataset.key;
            if (key === "ghost") {
              dot.style.background = "rgba(255,255,255,0.3)";
              return;
            }
            if (key === "suspended") {
              dot.style.background = cardDotColors.suspended || "#ef4444";
              return;
            }
            if (key === "buried") {
              dot.style.background = cardDotColors.buried || "#f59e0b";
              return;
            }
            if (key === "normal") {
              dot.style.background = "#ffffff00";
              return;
            }
            var base = previewBaseColor || "#4da3ff00";
            if (mixWithWhite) base = mixWithWhite(base, 0.2);
            dot.style.background = base;
          });
        }
        updateDotColors();

        function updatePreviewColor() {
          var col = "#4da3ff";
          if (noteTypeMeta && noteTypeMeta.length) {
            var nt0 = noteTypeMeta[0];
            if (nt0 && noteTypeColors[String(nt0.id)]) {
              col = noteTypeColors[String(nt0.id)];
            }
          }
          previewBaseColor = col;
          preview.style.setProperty("--preview-color", col);
          preview.style.borderColor = col;
          previewCore.style.background = col;
          if (colorWithAlpha) {
            preview.style.background = colorWithAlpha(col, 0.2);
          } else {
            preview.style.background = col;
          }
          updateDotColors();
        }
        updatePreviewColor();
        updateCardPreviewColor = updatePreviewColor;

        inputSusp.addEventListener("change", function () {
          debugUI("card dot color change");
          cardDotColors.suspended = inputSusp.value;
          if (window.pycmd) {
            pycmd("cdot:suspended:" + encodeURIComponent(inputSusp.value));
          }
          updateDotColors();
          if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
          showToast("Suspended dot color");
        });
        inputBur.addEventListener("change", function () {
          debugUI("card dot color change");
          cardDotColors.buried = inputBur.value;
          if (window.pycmd) {
            pycmd("cdot:buried:" + encodeURIComponent(inputBur.value));
          }
          updateDotColors();
          if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
          showToast("Buried dot color");
        });

        right.appendChild(preview);
        layout.appendChild(left);
        layout.appendChild(right);
        group.appendChild(layout);
        list.appendChild(group);
      }

      function setupLayerPanel() {
        var list = document.getElementById("layer-color-list");
        if (!list) return;
        list.innerHTML = "";

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
          debugUI("flow speed input");
          setFlow(parseFloat(flowRange.value), false);
        });
        flowInput.addEventListener("change", function () {
          debugUI("flow speed change");
          setFlow(parseFloat(flowInput.value), true);
        });
        flowRow.appendChild(flowLabel);
        flowRow.appendChild(flowRange);
        flowRow.appendChild(flowInput);
        list.appendChild(flowRow);

        function addGroup(title) {
          var group = document.createElement("div");
          group.className = "nt-group link-group";
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
            debugUI("layer color change");
            layerColors[layer] = color.value;
            if (window.pycmd) {
              pycmd("lcol:" + layer + ":" + encodeURIComponent(color.value));
            }
            applyFilters({ reheat: false });
            showToast("Link color: " + title);
          });
          var style = document.createElement("select");
          ["solid", "dashed", "dotted"].forEach(function (opt) {
            var o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            style.appendChild(o);
          });
          var initStyle = layerStyles[layer] || "solid";
          if (initStyle === "pointed") initStyle = "dotted";
          style.value = initStyle;
          style.addEventListener("change", function () {
            debugUI("layer style change");
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
            debugUI("layer flow toggle");
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
          var flowLabel = document.createElement("span");
          flowLabel.textContent = "Flow";
          flowLabel.style.fontSize = "11px";
          flowLabel.style.color = "#94a3b8";
          row.appendChild(flowLabel);
          row.appendChild(flow);
          group.appendChild(row);
          return row;
        }

        function layerTuningRow(group, layer, title) {
          var row = document.createElement("div");
          row.className = "layer-row layer-row-metrics";

          function metricBlock(labelText, min, max, step, getVal, setVal) {
            var wrap = document.createElement("div");
            wrap.className = "layer-metric";
            var lbl = document.createElement("span");
            lbl.className = "metric-label";
            lbl.textContent = labelText;
            var range = document.createElement("input");
            range.type = "range";
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            var num = document.createElement("input");
            num.type = "number";
            num.min = String(min);
            num.max = String(max);
            num.step = String(step);
            var current = getVal();
            range.value = String(current);
            num.value = String(current);
            function update(val, notify, persist) {
              if (!isFinite(val)) return;
              var clamped = Math.min(max, Math.max(min, val));
              range.value = String(clamped);
              num.value = String(clamped);
              setVal(clamped, notify, persist);
            }
            range.addEventListener("input", function () {
              update(parseFloat(range.value), false, false);
            });
            range.addEventListener("change", function () {
              update(parseFloat(range.value), true, true);
            });
            num.addEventListener("change", function () {
              update(parseFloat(num.value), true, true);
            });
            wrap.appendChild(lbl);
            wrap.appendChild(range);
            wrap.appendChild(num);
            return wrap;
          }

          var strengthBlock = metricBlock(
            "Strength",
            0,
            1.5,
            0.01,
            function () {
              var current = linkStrengths[layer];
              if (typeof current !== "number" || !isFinite(current)) {
                current = physics.link_strength;
              }
              return Math.min(1.5, Math.max(0, current));
            },
            function (val, notify, persist) {
              linkStrengths[layer] = val;
              applyPhysics();
              if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
                Graph.resumeAnimation();
              }
              if (persist && window.pycmd) {
                pycmd("lstrength:" + layer + ":" + val);
              }
              if (notify) {
                showToast("Link strength: " + title + " " + val);
              }
            }
          );

          var distanceBlock = metricBlock(
            "Distance",
            5,
            500,
            1,
            function () {
              var current = linkDistances[layer];
              if (typeof current !== "number" || !isFinite(current)) {
                current = physics.link_distance;
              }
              return Math.min(500, Math.max(5, current));
            },
            function (val, notify, persist) {
              linkDistances[layer] = val;
              applyPhysics();
              if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
                Graph.resumeAnimation();
              }
              if (persist && window.pycmd) {
                pycmd("ldistance:" + layer + ":" + val);
              }
              if (notify) {
                showToast("Link distance: " + title + " " + val);
              }
            }
          );

          row.appendChild(strengthBlock);
          row.appendChild(distanceBlock);
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
            debugUI("layer toggle: " + labelText);
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
        layerTuningRow(familyGroup, "family", "Family Gate");

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
          debugUI("same-prio opacity input");
          setOp(parseFloat(opRange.value), false);
        });
        opInput.addEventListener("change", function () {
          debugUI("same-prio opacity change");
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
        layerTuningRow(hubGroup, "family_hub", "Family Hubs");
        toggleRow(hubGroup, "Chain family levels", familyChainEdges, function (val) {
          familyChainEdges = val;
          if (window.pycmd) {
            pycmd("fchain:" + (familyChainEdges ? "1" : "0"));
          }
          showToast("Chain family levels: " + (familyChainEdges ? "On" : "Off"));
          rebuildLinkVariants();
          applyFilters({ reheat: true });
        });

        var refGroup = addGroup("Linked Notes");
        layerRow(refGroup, "reference", "Linked Notes");
        layerTuningRow(refGroup, "reference", "Linked Notes");

        var massGroup = addGroup("Mass Linker");
        layerRow(massGroup, "mass_linker", "Mass Linker");
        layerTuningRow(massGroup, "mass_linker", "Mass Linker");
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
          debugUI("auto-link opacity input");
          setAuto(parseFloat(autoRange.value), false);
        });
        autoInput.addEventListener("change", function () {
          debugUI("auto-link opacity change");
          setAuto(parseFloat(autoInput.value), true);
        });
        autoRow.appendChild(autoLabel);
        autoRow.appendChild(autoRange);
        autoRow.appendChild(autoInput);
        massGroup.appendChild(autoRow);

        var exampleGroup = addGroup("Example Gate");
        layerRow(exampleGroup, "example", "Example Gate");
        layerTuningRow(exampleGroup, "example", "Example Gate");

        var kanjiGroup = addGroup("Kanji Gate");
        layerRow(kanjiGroup, "kanji", "Kanji Gate");
        layerTuningRow(kanjiGroup, "kanji", "Kanji Gate");

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
          debugUI("kanji parts color change");
          kanjiComponentColor = compColor.value;
          if (window.pycmd) {
            pycmd("kcompcol:" + encodeURIComponent(kanjiComponentColor));
          }
          applyFilters({ reheat: false });
          showToast("Parts color updated");
        });
        var compStyle = document.createElement("select");
        ["solid", "dashed", "dotted"].forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          compStyle.appendChild(o);
        });
        var initCompStyle = kanjiComponentStyle || "solid";
        if (initCompStyle === "pointed") initCompStyle = "dotted";
        compStyle.value = initCompStyle;
        compStyle.addEventListener("change", function () {
          debugUI("kanji parts style change");
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
          debugUI("kanji parts flow toggle");
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
        var compFlowLabel = document.createElement("span");
        compFlowLabel.textContent = "Flow";
        compFlowLabel.style.fontSize = "11px";
        compFlowLabel.style.color = "#94a3b8";
        compColorRow.appendChild(compFlowLabel);
        compColorRow.appendChild(compFlowToggle);
        partsWrap.appendChild(compColorRow);

        layerTuningRow(partsWrap, "kanji_component", "Kanji Components");


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
          debugUI("kanji parts opacity input");
          setCompOpacity(parseFloat(compOpacityRange.value), false);
        });
        compOpacityInput.addEventListener("change", function () {
          debugUI("kanji parts opacity change");
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
          debugUI("kanji parts focus toggle");
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
            chk.addEventListener("change", function () {
              debugUI("deck checkbox change");
            });
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
          debugUI("deck dropdown toggle");
          e.stopPropagation();
          if (open) {
            closeDropdown();
          } else {
            openDropdown();
          }
        });
        document.addEventListener("click", function (e) {
          debugUI("deck dropdown outside click");
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

          function pushVal(arr, v) {
            if (v === undefined || v === null) return;
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              var s = String(v).trim();
              if (s) arr.push(s);
            }
          }
          function pushArr(arr, list) {
            if (!Array.isArray(list)) return;
            list.forEach(function (v) { pushVal(arr, v); });
          }
          function pushMap(arr, obj) {
            if (!obj || typeof obj !== "object") return;
            Object.keys(obj).forEach(function (k) {
              pushVal(arr, k);
              pushVal(arr, obj[k]);
            });
          }
          function pushExtra(arr, list) {
            if (!Array.isArray(list)) return;
            list.forEach(function (entry) {
              if (!entry) return;
              if (entry.name) pushVal(arr, entry.name);
              if (entry.value) pushVal(arr, entry.value);
            });
          }

          function nodeSearchText(n) {
            if (!n) return "";
            var parts = [];
            try { pushVal(parts, nodeDisplayLabel(n)); } catch (_e) {}
            pushVal(parts, n.label);
            pushVal(parts, n.note_type);
            pushVal(parts, n.note_type_id);
            pushVal(parts, n.note_id);
            pushVal(parts, n.id);
            pushMap(parts, n.family_prios);
            pushArr(parts, n.tags);
            pushExtra(parts, n.extra);
            pushVal(parts, n.field);
            pushVal(parts, n.value);
            return parts.join(" ").toLowerCase();
          }

          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var text = n.__search_text;
            if (!text) {
              text = nodeSearchText(n);
              n.__search_text = text;
            }
            if (text.indexOf(lower) >= 0) {
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
              debugUI("search suggest click");
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
          debugUI("search input");
          selectedHit = null;
          hits = buildHits(input.value || "");
          renderSuggest(hits);
        });
        input.addEventListener("focus", function () {
          debugUI("search focus");
          if (hits.length) renderSuggest(hits);
        });
        input.addEventListener("keydown", function (e) {
          debugUI("search keydown");
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch();
          }
        });
        btn.addEventListener("click", function () {
          debugUI("search button click");
          runSearch();
        });
        document.addEventListener("click", function (e) {
          debugUI("search outside click");
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
          debugUI("unlinked toggle");
          showUnlinked = !!toggle.checked;
          if (window.pycmd) {
            pycmd("showunlinked:" + (showUnlinked ? "1" : "0"));
          }
          applyFilters({ reheat: false, toast_visible: true });
          showToast("Show unlinked: " + (showUnlinked ? "On" : "Off"));
        });
      }

      function bindDebugReheatButton() {
        var btn = document.getElementById("debug-reheat");
        if (!btn) return;
        btn.addEventListener("click", function () {
          debugUI("debug reheat");
          if (Graph && typeof Graph.d3ReheatSimulation === "function" && shouldReheatGraph(Graph)) {
            Graph.d3ReheatSimulation();
            markEngineRunning();
          }
          if (Graph && typeof Graph.resumeAnimation === "function") {
            Graph.resumeAnimation();
          }
          if (hubSimManager && typeof hubSimManager.applyPhysics === "function") {
            hubSimManager.applyPhysics();
          }
          scheduleFlowUpdate();
          showToast("Reheat");
        });
      }

      function bindDebugDevtoolsButton() {
        var btn = document.getElementById("debug-devtools");
        if (!btn) return;
        btn.addEventListener("click", function () {
          debugUI("debug devtools");
          if (window.pycmd) {
            pycmd("devtools");
          }
        });
      }

      function bindDebugStopButton() {
        var btn = document.getElementById("debug-stop");
        if (!btn) return;
        btn.addEventListener("click", function () {
          debugUI("debug stop");
          if (Graph && typeof Graph.d3Alpha === "function") {
            Graph.d3Alpha(0);
          }
          if (Graph && typeof Graph.pauseAnimation === "function") {
            Graph.pauseAnimation();
          }
          if (hubSimManager && typeof hubSimManager.forEachSim === "function") {
            hubSimManager.forEachSim(function (sim) {
              if (!sim || !sim.graph) return;
              if (typeof sim.graph.d3Alpha === "function") {
                sim.graph.d3Alpha(0);
              }
              if (typeof sim.graph.pauseAnimation === "function") {
                sim.graph.pauseAnimation();
              }
            });
          }
          showToast("Stopped");
        });
      }

      loadLayers();
      setupNoteTypePanel();
      setupCardPanel();
      setupLayerPanel();
      setupPhysicsPanel();
      setupZoomPanel();
      setupSettingsPanel();
      setupDeckDropdown();
      setupSearch();
      setupUnlinkedToggle();
      bindDebugReheatButton();
      bindDebugDevtoolsButton();
      bindDebugStopButton();
      applyFilters({ reheat: true, toast_visible: "count" });

      // --- Physics UI + persistence ---
      function loadPhysics() {
        physics = Object.assign({}, physicsDefaults);
        if (data.meta && data.meta.physics && typeof data.meta.physics === "object") {
          physics = Object.assign(physics, data.meta.physics);
        }
      }

      function shouldReheatGraph(graph) {
        if (!graph) return false;
        if (debugToggles && debugToggles.reheat_guard === false) return true;
        var running = false;
        if (typeof graph.isEngineRunning === "function") {
          try {
            running = !!graph.isEngineRunning();
          } catch (_e) {
            running = false;
          }
        } else if (typeof graph.d3Alpha === "function") {
          try {
            var alphaNow = graph.d3Alpha();
            running = !!(alphaNow && alphaNow > 0);
          } catch (_e2) {
            running = false;
          }
        }
        if (debugIf("sim_freeze", "applyPhysicsToGraph: skip reheat (engine running)", running)) return false;
        return true;
      }

      function applyPhysicsToGraph(graph, opts) {
        if (!graph) return;
        debugToast("applyPhysicsToGraph: start", "sim_core", null, "trace");
        var physOverride = opts && opts.physicsOverride ? opts.physicsOverride : null;
        var linkDistanceFn = (opts && opts.linkDistance) || getLinkDistance;
        var linkStrengthFn = (opts && opts.linkStrength) || getLinkStrength;
        var chargeStrengthFn = (opts && opts.chargeStrengthFn) || null;
        debugThrottle(
          "sim_core",
          "applyPhysicsToGraph:values",
          "applyPhysicsToGraph values: linkDist=" + resolvePhysicsValue("link_distance", physOverride) +
          " linkStrength=" + resolvePhysicsValue("link_strength", physOverride) +
          " charge=" + resolvePhysicsValue("charge", physOverride) +
          " alphaDecay=" + resolvePhysicsValue("alpha_decay", physOverride) +
          " velDecay=" + resolvePhysicsValue("velocity_decay", physOverride),
          "debug",
          1000
        );
        var hasLinkDistance = debugIf("sim_core", "applyPhysicsToGraph: linkDistance fn", typeof graph.linkDistance === "function");
        if (hasLinkDistance) {
          graph.linkDistance(function (l) {
            return linkDistanceFn(l);
          });
        }
        var hasLinkStrength = debugIf("sim_core", "applyPhysicsToGraph: linkStrength fn", typeof graph.linkStrength === "function");
        if (hasLinkStrength) {
          graph.linkStrength(function (l) {
            return linkStrengthFn(l);
          });
        }
        var hasVelDecay = debugIf("sim_core", "applyPhysicsToGraph: velocityDecay fn", typeof graph.d3VelocityDecay === "function");
        if (hasVelDecay) {
          graph.d3VelocityDecay(resolvePhysicsValue("velocity_decay", physOverride));
        }
        var hasAlphaDecay = debugIf("sim_core", "applyPhysicsToGraph: alphaDecay fn", typeof graph.d3AlphaDecay === "function");
        if (hasAlphaDecay) {
          graph.d3AlphaDecay(resolvePhysicsValue("alpha_decay", physOverride));
        }
        var hasCooldown = debugIf("sim_core", "applyPhysicsToGraph: cooldownTicks fn", typeof graph.cooldownTicks === "function");
        if (hasCooldown) {
          var cd = resolvePhysicsValue("cooldown_ticks", physOverride);
          if (cd === -1 || cd === Infinity) cd = Infinity;
          graph.cooldownTicks(cd);
        }
        var hasCooldownTime = debugIf("sim_core", "applyPhysicsToGraph: cooldownTime fn", typeof graph.cooldownTime === "function");
        if (hasCooldownTime) {
          var ct = resolvePhysicsValue("cooldown_time", physOverride);
          if (ct === -1 || ct === Infinity) ct = Infinity;
          graph.cooldownTime(ct);
        }
        var hasWarmup = debugIf("sim_core", "applyPhysicsToGraph: warmupTicks fn", typeof graph.warmupTicks === "function");
        if (hasWarmup) {
          graph.warmupTicks(resolvePhysicsValue("warmup_ticks", physOverride));
        }
        var hasForce = debugIf("sim_core", "applyPhysicsToGraph: d3Force fn", typeof graph.d3Force === "function");
        if (hasForce) {
          var charge = graph.d3Force("charge");
          var linkForce = graph.d3Force("link");
          if (linkForce && typeof linkForce.distance === "function") {
            linkForce.distance(linkDistanceFn);
          }
          if (linkForce && typeof linkForce.strength === "function") {
            linkForce.strength(linkStrengthFn);
          }
          var hasChargeStrength = debugIf("sim_forces", "applyPhysicsToGraph: charge strength fn", !!(charge && typeof charge.strength === "function"));
          if (hasChargeStrength) {
            var chargeStrength = resolvePhysicsValue("charge", physOverride);
            if (debugIf("sim_forces", "applyPhysicsToGraph: chargeStrengthFn branch", !!chargeStrengthFn)) {
              charge.strength(chargeStrengthFn);
            } else {
              charge.strength(chargeStrength);
            }
          }
          var hasDistanceMax = debugIf("sim_forces", "applyPhysicsToGraph: charge distanceMax fn", !!(charge && typeof charge.distanceMax === "function"));
          if (hasDistanceMax) {
            charge.distanceMax(resolvePhysicsValue("max_radius", physOverride) || 0);
          }
          var centerStrength = resolvePhysicsValue("center_force", physOverride);
          if (typeof graph.d3Force === "function") {
            var d3ref = (typeof window !== "undefined" && window.d3) ? window.d3 : null;
            if (typeof centerStrength === "number" && centerStrength > 0) {
              var fx = graph.d3Force("x");
              var fy = graph.d3Force("y");
              if (!fx && d3ref && typeof d3ref.forceX === "function") {
                fx = d3ref.forceX(0);
                graph.d3Force("x", fx);
              }
              if (!fy && d3ref && typeof d3ref.forceY === "function") {
                fy = d3ref.forceY(0);
                graph.d3Force("y", fy);
              }
              if (fx && typeof fx.strength === "function") fx.strength(centerStrength);
              if (fy && typeof fy.strength === "function") fy.strength(centerStrength);
            } else {
              graph.d3Force("x", null);
              graph.d3Force("y", null);
            }
          }
        }
        if (debugIf("sim_freeze", "applyPhysicsToGraph: reheat disabled return", opts && opts.reheat === false)) return;
        if (!shouldReheatGraph(graph)) return;
        var hasReheat = debugIf("sim_freeze", "applyPhysicsToGraph: d3ReheatSimulation fn", typeof graph.d3ReheatSimulation === "function");
        if (hasReheat) {
          graph.d3ReheatSimulation();
          markEngineRunning();
        }
      }

      function applyPhysics(reheat) {
        if (!Graph) return;
        debugToast("applyPhysics: start reheat=" + (!!reheat), "sim_core", null, "trace");
        showDebugToast("applyPhysics: main", "sim_core");
        applyPhysicsToGraph(Graph, {
          linkStrength: getMainLinkStrength,
          chargeStrengthFn: function (node) {
            if (isActiveHubMember(node)) return 0;
            var base = physics.charge;
            return base;
          },
          reheat: reheat,
        });
        if (hubSimManager && typeof hubSimManager.applyPhysics === "function") {
          showDebugToast("applyPhysics: hub sims", "sim_hub");
          hubSimManager.applyPhysics();
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
        var isCooldown = key === "cooldown_ticks" || key === "cooldown_time";
        var maxVal = parseFloat(range.max || "0");
        function toPhysicsVal(v) {
          if (isCooldown && isFinite(maxVal) && v >= maxVal) return -1;
          return v;
        }
        function toUiVal(v) {
          if (isCooldown && (v === -1 || v === Infinity)) return maxVal;
          return v;
        }
        function syncCooldownUi(v) {
          if (!isCooldown) return;
          if (v === -1 || v === Infinity || (isFinite(maxVal) && v >= maxVal)) {
            num.value = "";
            num.placeholder = "∞";
          } else {
            num.placeholder = "";
          }
        }
        var setVal = function (val, silent, persist) {
          if (isNaN(val)) return;
          var physVal = toPhysicsVal(val);
          physics[key] = physVal;
          range.value = toUiVal(physVal);
          num.value = (physVal === -1 || physVal === Infinity) ? "" : physVal;
          syncCooldownUi(physVal);
          applyPhysics();
          if (!silent && label) {
            var msgVal = (isCooldown && (physVal === -1 || physVal === Infinity)) ? "∞" : physVal;
            showToast("Physics: " + label + " " + msgVal);
          }
          if (persist) {
            persistPhysics(key, physVal);
          }
        };
        range.addEventListener("input", function () {
          debugUI("physics range input: " + key);
          setVal(parseFloat(range.value), true, false);
        });
        range.addEventListener("change", function () {
          debugUI("physics range change: " + key);
          setVal(parseFloat(range.value), false, true);
        });
        num.addEventListener("change", function () {
          debugUI("physics num change: " + key);
          setVal(parseFloat(num.value), false, true);
        });
        range.value = toUiVal(physics[key]);
        num.value = (physics[key] === -1 || physics[key] === Infinity) ? "" : physics[key];
        syncCooldownUi(physics[key]);
      }

      function setControlValue(rangeId, numId, val) {
        var range = document.getElementById(rangeId);
        var num = document.getElementById(numId);
        if (rangeId === "phys-cooldown" && range) {
          var max = parseFloat(range.max || "0");
          if (val === -1 || val === Infinity) {
            range.value = max;
            if (num) {
              num.value = "";
              num.placeholder = "∞";
            }
            return;
          }
        }
        if (range) range.value = val;
        if (num) {
          num.value = val;
          num.placeholder = "";
        }
      }

      function loadZoomSettings() {
        try {
          var raw = localStorage.getItem("ajpc_graph_zoom");
          if (!raw) return;
          var cfg = JSON.parse(raw);
          if (cfg && typeof cfg === "object") {
            if (typeof cfg.flow_min === "number") flowMinZoom = cfg.flow_min;
            if (typeof cfg.flow_fade === "number") flowZoomFadeBand = cfg.flow_fade;
            if (typeof cfg.card_min === "number") cardDotsMinZoom = cfg.card_min;
            if (typeof cfg.card_fade === "number") cardDotsFadeBand = cfg.card_fade;
            if (typeof cfg.label_min === "number") labelMinZoom = cfg.label_min;
            if (typeof cfg.label_fade === "number") labelFadeBand = cfg.label_fade;
          }
        } catch (_e) { }
      }

      function storeZoomSettings() {
        try {
          localStorage.setItem(
            "ajpc_graph_zoom",
            JSON.stringify({
              flow_min: flowMinZoom,
              flow_fade: flowZoomFadeBand,
              card_min: cardDotsMinZoom,
              card_fade: cardDotsFadeBand,
              label_min: labelMinZoom,
              label_fade: labelFadeBand,
            })
          );
        } catch (_e) { }
      }

      function applyZoomSettings() {
        handleFlowZoomChange();
        if (typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
      }

      function bindZoomRange(key, rangeId, numId, label) {
        var range = document.getElementById(rangeId);
        var num = document.getElementById(numId);
        if (!range || !num) return;
        var setVal = function (val, silent) {
          if (isNaN(val)) return;
          if (key === "flow_min") flowMinZoom = val;
          if (key === "flow_fade") flowZoomFadeBand = val;
          if (key === "card_min") cardDotsMinZoom = val;
          if (key === "card_fade") cardDotsFadeBand = val;
          if (key === "label_min") labelMinZoom = val;
          if (key === "label_fade") labelFadeBand = val;
          range.value = val;
          num.value = val;
          storeZoomSettings();
          applyZoomSettings();
          if (!silent && label) {
            showToast("Zoom: " + label + " " + val);
          }
        };
        range.addEventListener("input", function () {
          debugUI("zoom range input: " + key);
          setVal(parseFloat(range.value), true);
        });
        range.addEventListener("change", function () {
          debugUI("zoom range change: " + key);
          setVal(parseFloat(range.value), false);
        });
        num.addEventListener("change", function () {
          debugUI("zoom num change: " + key);
          setVal(parseFloat(num.value), false);
        });
        range.value = (key === "flow_min") ? flowMinZoom
          : (key === "flow_fade") ? flowZoomFadeBand
            : (key === "card_min") ? cardDotsMinZoom
              : (key === "card_fade") ? cardDotsFadeBand
                : (key === "label_min") ? labelMinZoom
                  : labelFadeBand;
        num.value = range.value;
      }

      function setupZoomPanel() {
        loadZoomSettings();
        bindZoomRange("flow_min", "zoom-flow-min", "zoom-flow-min-num", "flow min");
        bindZoomRange("flow_fade", "zoom-flow-fade", "zoom-flow-fade-num", "flow fade");
        bindZoomRange("card_min", "zoom-card-min", "zoom-card-min-num", "card min");
        bindZoomRange("card_fade", "zoom-card-fade", "zoom-card-fade-num", "card fade");
        bindZoomRange("label_min", "zoom-label-min", "zoom-label-min-num", "label min");
        bindZoomRange("label_fade", "zoom-label-fade", "zoom-label-fade-num", "label fade");
        applyZoomSettings();
      }

      function setupPhysicsPanel() {
        loadPhysics();
        bindRange("charge", "phys-charge", "phys-charge-num", "charge");
        bindRange("velocity_decay", "phys-vel-decay", "phys-vel-decay-num", "velocity decay");
        bindRange("alpha_decay", "phys-alpha-decay", "phys-alpha-decay-num", "alpha decay");
        bindRange("center_force", "phys-center-force", "phys-center-force-num", "center force");
        bindRange("max_radius", "phys-max-radius", "phys-max-radius-num", "repulsion range");
        bindRange("cooldown_ticks", "phys-cooldown", "phys-cooldown-num", "cooldown ticks");
        bindRange("cooldown_time", "phys-cooldown-time", "phys-cooldown-time-num", "cooldown time");
        bindRange("warmup_ticks", "phys-warmup", "phys-warmup-num", "warmup ticks");

        function persistNeighborScaling() {
          if (data.meta) data.meta.neighbor_scaling = Object.assign({}, neighborScaling);
          try {
            if (window.pycmd) {
              window.pycmd(
                "neighborscale:" + encodeURIComponent(JSON.stringify(neighborScaling))
              );
            }
          } catch (_e) {}
        }


        function setupNeighborScalingPanel() {
          var panel = document.getElementById("neighbor-scaling-settings");
          if (!panel) return;
          panel.innerHTML = "";

          var modeRow = document.createElement("div");
          modeRow.className = "phys-row";
          var modeLabel = document.createElement("span");
          modeLabel.textContent = "Model";
          var modeSelect = document.createElement("select");
          [
            { value: "none", label: "None" },
            { value: "ccm", label: "CCM" },
            { value: "twohop", label: "2-Hop" },
            { value: "jaccard", label: "Jaccard" },
            { value: "overlap", label: "Overlap" },
          ].forEach(function (optData) {
            var opt = document.createElement("option");
            opt.value = optData.value;
            opt.textContent = optData.label;
            modeSelect.appendChild(opt);
          });
          modeSelect.value = neighborScaling.mode || "none";
          modeSelect.addEventListener("change", function () {
            neighborScaling.mode = modeSelect.value;
            persistNeighborScaling();
            refreshNeighborScaling(true);
          });
          modeRow.appendChild(modeLabel);
          modeRow.appendChild(modeSelect);
          panel.appendChild(modeRow);

          var dirRow = document.createElement("div");
          dirRow.className = "phys-row";
          var dirLabel = document.createElement("span");
          dirLabel.textContent = "Directedness";
          var dirSelect = document.createElement("select");
          [
            { value: "undirected", label: "Undirected" },
            { value: "out", label: "Directed (Outgoing)" },
            { value: "in", label: "Directed (Incoming)" },
          ].forEach(function (optData) {
            var opt = document.createElement("option");
            opt.value = optData.value;
            opt.textContent = optData.label;
            dirSelect.appendChild(opt);
          });
          dirSelect.value = neighborScaling.directed || "undirected";
          dirSelect.addEventListener("change", function () {
            neighborScaling.directed = dirSelect.value;
            persistNeighborScaling();
            refreshNeighborScaling(true);
          });
          dirRow.appendChild(dirLabel);
          dirRow.appendChild(dirSelect);
          panel.appendChild(dirRow);

          var weightWrap = document.createElement("div");
          weightWrap.className = "dense-scale-rows";
          panel.appendChild(weightWrap);

          var defs = [
            { key: "reference", label: "Linked Notes" },
            { key: "mass_linker", label: "Mass Linker" },
            { key: "family", label: "Family Gate" },
            { key: "family_hub", label: "Family Hubs" },
            { key: "example", label: "Example Gate" },
            { key: "kanji", label: "Kanji Gate" },
            { key: "kanji_component", label: "Kanji Components" },
          ];

          defs.forEach(function (d) {
            var r = document.createElement("div");
            r.className = "phys-row";
            var l = document.createElement("span");
            l.textContent = d.label + " weight";
            var range = document.createElement("input");
            range.type = "range";
            range.min = "0";
            range.max = "2";
            range.step = "0.05";
            var num = document.createElement("input");
            num.type = "number";
            num.min = "0";
            num.max = "2";
            num.step = "0.05";
            var cur = neighborScaling.weights && typeof neighborScaling.weights[d.key] === "number"
              ? neighborScaling.weights[d.key]
              : (NEIGHBOR_DEFAULT_WEIGHTS[d.key] || 1);
            range.value = cur;
            num.value = cur;
            function setVal(val, notify) {
              if (!isFinite(val)) return;
              if (!neighborScaling.weights) neighborScaling.weights = {};
              var clamped = Math.max(0, Math.min(2, val));
              neighborScaling.weights[d.key] = clamped;
              range.value = clamped;
              num.value = clamped;
              if (notify) {
                persistNeighborScaling();
                refreshNeighborScaling(true);
              }
            }
            range.addEventListener("input", function () {
              setVal(parseFloat(range.value), false);
            });
            range.addEventListener("change", function () {
              setVal(parseFloat(range.value), true);
            });
            num.addEventListener("change", function () {
              setVal(parseFloat(num.value), true);
            });
            r.appendChild(l);
            r.appendChild(range);
            r.appendChild(num);
            weightWrap.appendChild(r);
          });
        }

        setupNeighborScalingPanel();

        function setupLinkRefinePanel() {
          var panel = document.getElementById("link-refine-settings");
          if (!panel) return;
          panel.innerHTML = "";
          linkRefineControls = {};

          function addToggle(labelText, value, onChange) {
            var row = document.createElement("div");
            row.className = "phys-row";
            var label = document.createElement("span");
            label.textContent = labelText;
            var input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!value;
            input.addEventListener("change", function () {
              onChange(!!input.checked);
            });
            row.appendChild(label);
            row.appendChild(input);
            panel.appendChild(row);
            return input;
          }

          function addRange(labelText, min, max, step, value, onChange) {
            var row = document.createElement("div");
            row.className = "phys-row";
            var label = document.createElement("span");
            label.textContent = labelText;
            var range = document.createElement("input");
            range.type = "range";
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            range.value = String(value);
            var num = document.createElement("input");
            num.type = "number";
            num.min = String(min);
            num.max = String(max);
            num.step = String(step);
            num.value = String(value);
            function setVal(val, notify) {
              if (!isFinite(val)) return;
              var next = Math.max(min, Math.min(max, val));
              range.value = next;
              num.value = next;
              onChange(next, notify);
            }
            range.addEventListener("input", function () {
              setVal(parseFloat(range.value), false);
            });
            range.addEventListener("change", function () {
              setVal(parseFloat(range.value), true);
            });
            num.addEventListener("change", function () {
              setVal(parseFloat(num.value), true);
            });
            row.appendChild(label);
            row.appendChild(range);
            row.appendChild(num);
            panel.appendChild(row);
            return { range: range, num: num };
          }

          var refToggle = addToggle("Reference Damping", referenceDampingEnabled, function (val) {
            referenceDampingEnabled = val;
            if (data.meta) data.meta.reference_damping = referenceDampingEnabled;
            if (window.pycmd) {
              pycmd("refdamp:" + (referenceDampingEnabled ? "1" : "0"));
            }
            applyFilters({ reheat: true });
            showToast("Reference damping: " + (referenceDampingEnabled ? "On" : "Off"));
          });
          linkRefineControls.refDamp = refToggle;

          var quantToggle = addToggle("Quantile Normalize", linkQuantileNorm, function (val) {
            linkQuantileNorm = val;
            if (data.meta) data.meta.kanji_quantile_norm = linkQuantileNorm;
            if (window.pycmd) {
              pycmd("kanjinorm:" + (linkQuantileNorm ? "1" : "0"));
            }
            applyFilters({ reheat: true });
            showToast("Quantile norm: " + (linkQuantileNorm ? "On" : "Off"));
          });
          linkRefineControls.quantile = quantToggle;

          var hubToggle = addToggle("Hub Damping (lambda=0.4)", hubDampingEnabled, function (val) {
            hubDampingEnabled = val;
            if (data.meta) data.meta.hub_damping = hubDampingEnabled;
            if (window.pycmd) {
              pycmd("hubdamp:" + (hubDampingEnabled ? "1" : "0"));
            }
            applyFilters({ reheat: true });
            showToast("Hub damping: " + (hubDampingEnabled ? "On" : "Off"));
          });
          linkRefineControls.hubDamp = hubToggle;

          var tfidfToggle = addToggle("Kanji TF-IDF", kanjiTfidfEnabled, function (val) {
            kanjiTfidfEnabled = val;
            if (data.meta) data.meta.kanji_tfidf_enabled = kanjiTfidfEnabled;
            if (window.pycmd) {
              pycmd("kanjitfidf:" + (kanjiTfidfEnabled ? "1" : "0"));
            }
            applyFilters({ reheat: true });
            showToast("Kanji TF-IDF: " + (kanjiTfidfEnabled ? "On" : "Off"));
          });
          linkRefineControls.kanjiTfidf = tfidfToggle;

          linkRefineControls.kanjiTopK = null;
          linkRefineControls.kanjiTopKRange = null;
          linkRefineControls.kanjiTopKNum = null;
        }

        setupLinkRefinePanel();
        var resetBtn = document.getElementById("phys-reset");
        if (resetBtn) {
          resetBtn.addEventListener("click", function () {
            debugUI("physics reset");
            physics = Object.assign({}, physicsDefaults);
            setControlValue("phys-charge", "phys-charge-num", physics.charge);
            setControlValue("phys-vel-decay", "phys-vel-decay-num", physics.velocity_decay);
            setControlValue("phys-alpha-decay", "phys-alpha-decay-num", physics.alpha_decay);
            setControlValue("phys-center-force", "phys-center-force-num", physics.center_force);
            setControlValue("phys-max-radius", "phys-max-radius-num", physics.max_radius);
            setControlValue("phys-cooldown", "phys-cooldown-num", physics.cooldown_ticks);
            setControlValue("phys-cooldown-time", "phys-cooldown-time-num", physics.cooldown_time);
            setControlValue("phys-warmup", "phys-warmup-num", physics.warmup_ticks);
            applyPhysics();
            persistPhysics("charge", physics.charge);
            persistPhysics("velocity_decay", physics.velocity_decay);
            persistPhysics("alpha_decay", physics.alpha_decay);
            persistPhysics("center_force", physics.center_force);
            persistPhysics("max_radius", physics.max_radius);
            persistPhysics("cooldown_ticks", physics.cooldown_ticks);
            persistPhysics("cooldown_time", physics.cooldown_time);
            persistPhysics("warmup_ticks", physics.warmup_ticks);
            showToast("Physics reset");
          });
        }
      }
      // --- Context menu ---
      function isNodePinned(node) {
        if (!node) return false;
        if (node.fx != null || node.fy != null) return true;
        return false;
      }

      function clearNodePin(node) {
        if (!node) return;
        node.fx = null;
        node.fy = null;
      }

      function unpinNode(node) {
        if (!node) return;
        clearNodePin(node);
        if (node.__main && node.__main !== node) {
          clearNodePin(node.__main);
        }
        if (typeof Graph !== "undefined" && Graph && typeof Graph.resumeAnimation === "function") {
          Graph.resumeAnimation();
        }
      }

      function showContextMenu(node, evt, graphInstance, rectOverride, hitNode, opts) {
        var menu = document.getElementById("ctx-menu");
        if (!menu) return;
        opts = opts || {};
        ctxMenuId = node ? String(node.id) : null;
        ctxDot = null;
        if (node && cardDotsEnabled) {
          var dotCard = getCardDotClick(hitNode || node, evt, graphInstance, rectOverride);
          if (dotCard && dotCard.id) {
            ctxDot = { nodeId: String(node.id), cardId: dotCard.id };
          }
        }
        var menuSelectedId = selectedId;
        if (!menuSelectedId && selectionState.active.scope === "hub" && selectionState.active.id) {
          menuSelectedId = String(selectionState.active.id);
        }
        if (!menuSelectedId && node && node.kind === "note") {
          menuSelectedId = String(node.id);
        }
        menu.innerHTML = "";
        function addItem(label, cb) {
          var div = document.createElement("div");
          div.className = "item";
          function appendLabelWithMarkers(text) {
            var tokens = String(text).split(/(selected|active)/g);
            tokens.forEach(function (tok) {
              if (!tok) return;
              if (tok === "selected") {
                div.appendChild(document.createTextNode("selected"));
                var dot = document.createElement("span");
                dot.className = "ctx-selected-dot";
                div.appendChild(dot);
                return;
              }
              if (tok === "active") {
                div.appendChild(document.createTextNode("active"));
                var ad = document.createElement("span");
                ad.className = "ctx-active-dot";
                if (activeColor) ad.style.background = activeColor;
                div.appendChild(ad);
                return;
              }
              div.appendChild(document.createTextNode(tok));
            });
          }
          appendLabelWithMarkers(label);
          div.addEventListener("click", function () {
            debugUI("context menu item click");
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
            cb.checked = false;
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
            debugUI("family picker cancel");
            e.preventDefault();
            close();
          });
          okBtn.addEventListener("click", function (e) {
            debugUI("family picker apply");
            e.preventDefault();
            var selected = [];
            list.querySelectorAll("input[type=checkbox]:checked").forEach(function (el) {
              selected.push(el.value);
            });
            close();
            if (onApply) onApply(selected);
          });
          overlay.addEventListener("click", function (e) {
            debugUI("family picker overlay click");
            if (e.target === overlay) close();
          });
        }

        var selectedNode =
          menuSelectedId && nodeById[menuSelectedId] ? nodeById[menuSelectedId] : null;
        if (!selectedNode && menuSelectedId && hubMemberById[menuSelectedId]) {
          selectedNode = hubMemberById[menuSelectedId];
        }
        if (!selectedNode && node && menuSelectedId && String(node.id) === String(menuSelectedId)) {
          selectedNode = node;
        }
        var activeColor = selectedNode ? nodeColor(selectedNode, noteTypeColors, layerColors) : "";
        var selectedKind = selectedNode ? selectedNode.kind || "" : "";
        var ctxLinks = opts.links || links;
        var groups = buildContextMenuGroups
          ? buildContextMenuGroups({
            node: node,
            selectedNode: selectedNode,
            selectedKind: selectedKind,
            menuSelectedId: menuSelectedId,
            noteTypeLinkedField: noteTypeLinkedField,
            links: ctxLinks,
            showToast: showToast,
            pycmd: window.pycmd,
            showFamilyPicker: showFamilyPicker,
            ctxDot: ctxDot,
          })
          : [];

        groups.forEach(function (grp) {
          appendGroup(grp);
        });
        if (node && isNodePinned(node)) {
          if (menu.childElementCount) addDivider();
          addItem("Unpin Node", function () {
            unpinNode(node);
            showToast("Node unpinned");
          });
        }
        var e = evt || window.event;
        if (e) {
          menu.style.left = e.clientX + "px";
          menu.style.top = e.clientY + "px";
        }
        menu.style.display = "block";
        if (ctxDot && graphInstance && typeof graphInstance.resumeAnimation === "function") {
          graphInstance.resumeAnimation();
        } else if (ctxDot && Graph && typeof Graph.resumeAnimation === "function") {
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
        debugUI("graph contextmenu");
        e.preventDefault();
      });
      graphEl.addEventListener("pointerdown", function (e) {
        if (e && e.button === 2) return;
        hideContextMenu();
      });
      document.addEventListener("click", function () {
        debugUI("context menu hide");
        hideContextMenu();
      });
      if (debugEnabled) {
        document.addEventListener("click", function (e) {
          var t = e && e.target ? e.target : null;
          var hit = null;
          try {
            if (e && typeof document.elementFromPoint === "function") {
              hit = document.elementFromPoint(e.clientX, e.clientY);
            }
          } catch (_e) { }
          function describe(el) {
            if (!el) return "none";
            var tag = el.tagName ? String(el.tagName).toLowerCase() : "unknown";
            var id = el.id ? el.id : "";
            var cls = "";
            if (el.classList && el.classList.length) {
              cls = Array.from(el.classList).join(" ");
            } else if (el.getAttribute) {
              cls = el.getAttribute("class") || "";
            } else if (el.className) {
              cls = String(el.className);
            }
            cls = String(cls || "").trim();
            var out =
              "tag=" +
              tag +
              " id=" +
              (id || "-") +
              " class=" +
              (cls || "-");
            var hubEl = el.closest ? el.closest(".hub-sim") : null;
            if (hubEl && hubEl.dataset && hubEl.dataset.hubId) {
              out += " hub=" + hubEl.dataset.hubId + " canvas=hub";
            } else {
              var mainEl = el.closest ? el.closest("#graph") : null;
              if (mainEl) out += " canvas=main";
            }
            return out;
          }
          var label = "click target: " + describe(t);
          if (hit && hit !== t) {
            label += " | hit: " + describe(hit);
          }
          showDebugToast(label);
        }, true);
      }
      Graph.onNodeRightClick(function (node, evt) {
        showDebugToast("main onNodeRightClick: node");
        showContextMenu(node, evt);
        debugPipelineEnd("main onNodeRightClick");
      });
      if (typeof Graph.onBackgroundRightClick === "function") {
        Graph.onBackgroundRightClick(function () {
          showDebugToast("main onBackgroundRightClick");
          hideContextMenu();
          debugPipelineEnd("main onBackgroundRightClick");
        });
      }

      // --- Resize + bootstrapping ---
      function resizeGraph() {
        var rect = graphEl.getBoundingClientRect();
        Graph.width(rect.width || window.innerWidth).height(
          rect.height || window.innerHeight - 42
        );
      }
      window.addEventListener("resize", function () {
        debugUI("window resize");
        resizeGraph();
      });
      resizeGraph();

      (function bindRebuildToast() {
        var btn = document.getElementById("btn-rebuild");
        if (!btn) return;
        btn.addEventListener("click", function () {
          debugUI("rebuild click");
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
          } catch (_e) { }
          handleFlowZoomChange();
          updateHubAutoCollapse();
          syncHubSimsToView();
          requestAnimationFrame(tick);
        }
        tick();
      })();

      (function bindZoomButtons() {
        if (!Graph || typeof Graph.zoom !== "function") return;
        var btnIn = document.getElementById("zoom-in");
        var btnOut = document.getElementById("zoom-out");
        if (!btnIn || !btnOut) return;
        function setZoom(delta) {
          var z = 1;
          try {
            z = Graph.zoom() || 1;
          } catch (_e) {
            z = 1;
          }
          if (!isFinite(z)) z = 1;
          var next = z + delta;
          if (next < 0.1) next = 0.1;
          Graph.zoom(next, 200);
        }
        btnIn.addEventListener("click", function (e) {
          debugUI("zoom in");
          e.preventDefault();
          setZoom(0.1);
        });
        btnOut.addEventListener("click", function (e) {
          debugUI("zoom out");
          e.preventDefault();
          setZoom(-0.1);
        });
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
          if (newData.meta && newData.meta.link_distances) {
            Object.keys(newData.meta.link_distances).forEach(function (k) {
              linkDistances[k] = newData.meta.link_distances[k];
            });
          }
          if (layerColors.mass_linker === undefined) {
            layerColors.mass_linker = layerColor("mass_linker", layerColors);
          }
          if (layerStyles.mass_linker === undefined) {
            layerStyles.mass_linker = layerStyles.reference || "dashed";
          }
          if (layerFlow.mass_linker === undefined) {
            layerFlow.mass_linker = layerFlow.reference || false;
          }
          if (linkStrengths.mass_linker === undefined && linkStrengths.reference !== undefined) {
            linkStrengths.mass_linker = linkStrengths.reference;
          }
          if (linkDistances.mass_linker === undefined && linkDistances.reference !== undefined) {
            linkDistances.mass_linker = linkDistances.reference;
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
          if (newData.meta && newData.meta.link_mst_enabled !== undefined) {
            linkMstEnabled = !!newData.meta.link_mst_enabled;
            var mstToggle = document.getElementById("debug-mst");
            if (mstToggle) mstToggle.checked = linkMstEnabled;
          }
          if (newData.meta && newData.meta.hub_damping !== undefined) {
            hubDampingEnabled = !!newData.meta.hub_damping;
            if (linkRefineControls.hubDamp) linkRefineControls.hubDamp.checked = hubDampingEnabled;
          }
          if (newData.meta && newData.meta.reference_damping !== undefined) {
            referenceDampingEnabled = !!newData.meta.reference_damping;
            if (linkRefineControls.refDamp) linkRefineControls.refDamp.checked = referenceDampingEnabled;
          }
          if (newData.meta && newData.meta.kanji_tfidf_enabled !== undefined) {
            kanjiTfidfEnabled = !!newData.meta.kanji_tfidf_enabled;
            if (linkRefineControls.kanjiTfidf) linkRefineControls.kanjiTfidf.checked = kanjiTfidfEnabled;
          }
          if (newData.meta && newData.meta.kanji_top_k_enabled !== undefined) {
            kanjiTopKEnabled = !!newData.meta.kanji_top_k_enabled;
            var topKToggle = document.getElementById("debug-kanji-topk");
            if (topKToggle) topKToggle.checked = kanjiTopKEnabled;
            var topKRow = document.getElementById("debug-kanji-topk-row");
            if (topKRow) topKRow.style.display = kanjiTopKEnabled ? "flex" : "none";
          }
          if (newData.meta && newData.meta.kanji_top_k !== undefined) {
            try {
              kanjiTopK = parseInt(newData.meta.kanji_top_k, 10);
            } catch (_e) {
              kanjiTopK = 0;
            }
            if (!isFinite(kanjiTopK) || kanjiTopK < 0) kanjiTopK = 0;
            var topKRange = document.getElementById("debug-kanji-topk-range");
            var topKNum = document.getElementById("debug-kanji-topk-num");
            if (topKRange) topKRange.value = kanjiTopK || 1;
            if (topKNum) topKNum.value = kanjiTopK || 1;
          }
          if (newData.meta && newData.meta.kanji_quantile_norm !== undefined) {
            linkQuantileNorm = !!newData.meta.kanji_quantile_norm;
            if (linkRefineControls.quantile) linkRefineControls.quantile.checked = linkQuantileNorm;
          }
          updateDebugUnderlines();
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
            rebuildHubMemberIndex();
            Object.keys(noteTypeHubMembers).forEach(function (hid) {
              var entry = noteTypeHubMembers[hid];
              if (!entry || !entry.edges) return;
              entry.edges.forEach(function (l) {
                normalizeMassLinkerLayerOnLink(l);
              });
            });
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
            }
            return copy;
          });
          nodes.forEach(function (n) {
            if (!n) return;
            if (isNoteTypeHub(n) && String(n.id).indexOf("autolink:") === 0) {
              ensureNodeLayer(n, "mass_linker");
            }
            if (isNoteTypeHub(n)) {
              ensureHubTag(n);
            }
          });
          var newCount = 0;
          nodes.forEach(function (n) {
            if (!prevAllIds.has(String(n.id))) newCount += 1;
          });
          baseLinks = normalizeEdgeList(newData.edges || []);
          familyEdgesDirect = normalizeEdgeList((newData.meta && newData.meta.family_edges_direct) || []);
          familyEdgesChain = normalizeEdgeList((newData.meta && newData.meta.family_edges_chain) || []);
          familyHubEdgesDirect = normalizeEdgeList((newData.meta && newData.meta.family_hub_edges_direct) || []);
          familyHubEdgesChain = normalizeEdgeList((newData.meta && newData.meta.family_hub_edges_chain) || []);
          rebuildLinkVariants();
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
  }

  if (!window.GraphShared || !window.GraphHub) {
    ensureDeps(boot);
  } else {
    boot();
  }
})();

