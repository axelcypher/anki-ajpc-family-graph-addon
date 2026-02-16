"use strict";
(function () {
  var root = window;
  if (!root) return;

  function cloneSpec(value) {
    if (value === undefined || value === null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_e0) {
      return null;
    }
  }

  function freezeSpecs(map) {
    var src = map && typeof map === "object" ? map : {};
    var out = Object.create(null);
    Object.keys(src).forEach(function (key) {
      var spec = cloneSpec(src[key]);
      if (spec) out[key] = spec;
    });
    return Object.freeze(out);
  }

  function getSpec(map, name) {
    var key = String(name || "").trim();
    if (!key) return null;
    if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
    return cloneSpec(map[key]);
  }

  var CITY_PORT_CONTRACTS = freezeSpecs({
    // city utils
    seededPos: {
      args: [{ name: "id", type: "string|number", required: true }],
      returns: "array",
      desc: "Return deterministic seeded graph-space position for node id."
    },
    // city flow
    ensureFlowCanvasSize: {
      args: [],
      returns: "undefined",
      desc: "Flow canvas compatibility stub (no-op in shader flow mode)."
    },
    ensureFlowParticlesLoop: {
      args: [],
      returns: "undefined",
      desc: "Ensure shader-flow RAF loop is running when flow is active."
    },
    // city ui
    updateStatus: {
      args: [{ name: "extraText", type: "string|number|boolean", required: false }],
      returns: "undefined",
      desc: "Update toolbar/status text and active-node summary."
    },
    showTooltip: {
      args: [{ name: "node", type: "object", required: false }, { name: "eventPos", type: "object", required: false }],
      returns: "undefined",
      desc: "Show hover tooltip for current node."
    },
    moveTooltip: {
      args: [{ name: "clientX", type: "number", required: true }, { name: "clientY", type: "number", required: true }],
      returns: "undefined",
      desc: "Move tooltip to pointer coordinates."
    },
    setHoverDebug: {
      args: [{ name: "reason", type: "string", required: false }, { name: "details", type: "object", required: false }],
      returns: "undefined",
      desc: "Store hover-debug diagnostics in STATE."
    },
    clearHoverNodeState: {
      args: [{ name: "reason", type: "string", required: false }, { name: "details", type: "object", required: false }],
      returns: "undefined",
      desc: "Clear hover selection and tooltip."
    },
    hideTooltip: {
      args: [],
      returns: "undefined",
      desc: "Hide hover tooltip UI."
    },
    hideContextMenu: {
      args: [{ name: "suppressStateClear", type: "boolean", required: false }],
      returns: "undefined",
      desc: "Hide node context menu UI."
    },
    buildSearchEntries: {
      args: [],
      returns: "undefined",
      desc: "Rebuild search suggestion index from active nodes."
    },
    hideSuggest: {
      args: [],
      returns: "undefined",
      desc: "Hide search suggestion dropdown."
    },
    openEmbeddedEditorForNodeId: {
      args: [{ name: "nodeId", type: "string|number", required: true }],
      returns: "boolean",
      desc: "Open embedded editor panel for a note node id."
    },
    openFamilyIdEditForNodeId: {
      args: [{ name: "nodeId", type: "string|number", required: true }],
      returns: "boolean",
      desc: "Open family-id edit popup for a family hub node id."
    },
    // city payload
    getEngineSolverDefaults: { args: [], returns: "object", desc: "Return default solver runtime settings." },
    getEngineRuntimeDefaults: { args: [], returns: "object", desc: "Return default engine runtime settings." },
    getEngineRendererDefaults: { args: [], returns: "object", desc: "Return default renderer settings." },
    getEngineSolverSpec: { args: [], returns: "array", desc: "Return solver settings specification list." },
    getEngineRuntimeSpec: { args: [], returns: "array", desc: "Return engine runtime settings specification list." },
    getEngineRendererSpec: { args: [], returns: "array", desc: "Return renderer settings specification list." },
    collectSolverSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw solver settings input." },
    collectEngineRuntimeSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw engine runtime settings input." },
    collectRendererSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw renderer settings input." },
    getNodeSettingsDefaults: { args: [], returns: "object", desc: "Return default node settings." },
    getNodeSettingsSpec: { args: [], returns: "array", desc: "Return node settings specification list." },
    collectNodeSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw node settings input." },
    getCardSettingsDefaults: { args: [], returns: "object", desc: "Return default card settings." },
    getCardSettingsSpec: { args: [], returns: "array", desc: "Return card settings specification list." },
    collectCardSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw card settings input." },
    cardSettingsFromMeta: { args: [], returns: "object", desc: "Extract card settings snapshot from payload meta." },
    syncCardSettingsFromMeta: { args: [], returns: "undefined", desc: "Sync STATE.cards from payload meta and defaults." },
    getLinkSettingsDefaults: { args: [], returns: "object", desc: "Return default link settings." },
    getLinkSettingsSpec: { args: [], returns: "array", desc: "Return link settings specification list." },
    collectLinkSettings: { args: [{ name: "input", type: "object", required: false }], returns: "object", desc: "Normalize raw link settings input." },
    linkSettingsFromMeta: { args: [], returns: "object", desc: "Extract link settings snapshot from payload meta." },
    syncLinkSettingsFromMeta: { args: [], returns: "undefined", desc: "Sync STATE.linkSettings from payload meta and defaults." },
    stableEdgeKey: { args: [{ name: "edge", type: "object", required: true }], returns: "string", desc: "Build stable edge identity key from edge record." },
    applyNodeMods: { args: [{ name: "data", type: "object", required: true }, { name: "cfg", type: "object", required: false }, { name: "runtimeCtx", type: "object", required: false }], returns: "object", desc: "Apply node-level payload modifications." },
    applyEdgeMods: { args: [{ name: "data", type: "object", required: true }, { name: "cfg", type: "object", required: false }, { name: "runtimeCtx", type: "object", required: false }], returns: "object", desc: "Apply edge-level payload modifications." },
    applyLayerProviderMods: { args: [{ name: "data", type: "object", required: true }, { name: "cfg", type: "object", required: false }, { name: "runtimeCtx", type: "object", required: false }], returns: "object", desc: "Apply provider-layer payload modifications." },
    applyHubGroupingMods: { args: [{ name: "data", type: "object", required: true }, { name: "cfg", type: "object", required: false }, { name: "runtimeCtx", type: "object", required: false }], returns: "object", desc: "Apply hub-grouping payload modifications." },
    applyDerivedVisualMods: { args: [{ name: "data", type: "object", required: true }, { name: "cfg", type: "object", required: false }, { name: "runtimeCtx", type: "object", required: false }], returns: "object", desc: "Apply derived visual payload modifications." },
    prepareDeltaSlice: { args: [{ name: "payload", type: "object", required: false }], returns: "object", desc: "Normalize/annotate incoming delta payload slice." },
    buildDeltaOps: { args: [{ name: "slice", type: "object", required: false }], returns: "object", desc: "Build node/edge delta operations from normalized slice." },
    applyDeltaOpsToState: { args: [{ name: "ops", type: "object", required: false }, { name: "slice", type: "object", required: false }], returns: "undefined", desc: "Mutate STATE.raw with prepared delta operations." },
    AjpcNodeBaseSize: { args: [{ name: "node", type: "object", required: false }], returns: "number", desc: "Resolve runtime base node size scalar." },
    buildGraphArrays: { args: [{ name: "active", type: "object", required: true }], returns: "object", desc: "Build renderer/solver arrays from active graph state." },
    applyRuntimeUiSettings: { args: [{ name: "solverRestartLayout", type: "boolean", required: false }], returns: "boolean", desc: "Apply runtime visibility/style arrays to engine." },
    applyRuntimeLinkDistances: { args: [{ name: "solverRestart", type: "boolean", required: false }], returns: "boolean", desc: "Apply runtime link distances/strengths to engine." }
  });

  var ENGINE_GRAPH_METHOD_CONTRACTS = freezeSpecs({
    reheat: {
      args: [{ name: "alpha", type: "number", required: false }],
      returns: "boolean|undefined",
      desc: "Alpha-only solver nudge on running simulation."
    },
    runSubsetNoDampingPull: {
      args: [{ name: "nodeIds", type: "array", required: true }, { name: "options", type: "object", required: false }],
      returns: "object|boolean",
      desc: "Run subset-only d3 pull simulation with velocityDecay(0), optional weighted-degree directed bias, and write back positions."
    },
    requestFrame: { args: [], returns: "undefined", desc: "Request one render frame for shader uniforms." },
    getPointPositions: { args: [], returns: "array|typedarray|null", desc: "Get flattened [x,y] pairs for active nodes." },
    spaceToScreenPosition: { args: [{ name: "spacePoint", type: "array2", required: true }], returns: "array", desc: "Project graph-space position to viewport-space." },
    getPointScreenRadiusByIndex: { args: [{ name: "index", type: "number", required: true }], returns: "number", desc: "Get rendered point radius in pixels." },
    spaceToScreenRadius: { args: [{ name: "radius", type: "number", required: true }], returns: "number", desc: "Project graph-space radius to viewport-space." },
    getSelectedIndices: { args: [], returns: "array|null", desc: "Return selected node indices." },
    getZoomLevel: { args: [], returns: "number", desc: "Return camera zoom ratio." },
    setConfig: { args: [{ name: "configPatch", type: "object", required: true }], returns: "undefined", desc: "Apply runtime engine/solver/renderer config patch." },
    stop: { args: [{ name: "destroySupervisor", type: "boolean", required: false }], returns: "undefined", desc: "Stop layout simulation." },
    start: { args: [{ name: "alpha", type: "number", required: false }], returns: "undefined", desc: "Start/restart layout simulation." },
    render: { args: [{ name: "alpha", type: "number", required: false }], returns: "undefined", desc: "Render frame with optional interpolation alpha." },
    resize: { args: [], returns: "undefined", desc: "Resize renderer to host viewport." },
    fitView: { args: [{ name: "durationMs", type: "number", required: false }, { name: "paddingRatio", type: "number", required: false }], returns: "undefined", desc: "Fit camera to graph bounds." },
    setPointColors: { args: [{ name: "colors", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set flattened RGBA point colors." },
    setPointSizes: { args: [{ name: "sizes", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set point sizes by index." },
    setLinkColors: { args: [{ name: "colors", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set flattened RGBA edge colors." },
    setLinkWidths: { args: [{ name: "widths", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set edge widths by index." },
    setLinkStrength: { args: [{ name: "strengths", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set solver link strengths by index." },
    setLinkStyleCodes: { args: [{ name: "styleCodes", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set edge style code array." },
    setLinkFlowMask: { args: [{ name: "flowMask", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set per-edge shader flow mask." },
    setLinkBidirMask: { args: [{ name: "bidirMask", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set per-edge bidirectional mask." },
    setLinkDistance: { args: [{ name: "distances", type: "typedarray|array", required: true }], returns: "undefined", desc: "Set solver link distances by index." },
    screenToSpacePosition: { args: [{ name: "screenPoint", type: "array2", required: true }], returns: "array", desc: "Project viewport-space position to graph-space." },
    getCameraState: { args: [], returns: "object|null", desc: "Get current camera state." }
  });

  var ENGINE_PORT_CONTRACTS = freezeSpecs({
    applyGraphData: {
      args: [{ name: "fitView", type: "boolean", required: false }],
      returns: "undefined"
    },
    applyGraphDeltaOps: {
      args: [
        { name: "ops", type: "object", required: false },
        { name: "arrays", type: "object", required: false },
        { name: "options", type: "object", required: false }
      ],
      returns: "boolean"
    },
    applyVisualStyles: {
      args: [{ name: "renderAlpha", type: "number", required: false }],
      returns: "undefined"
    },
    applyPhysicsToGraph: {
      args: [],
      returns: "undefined"
    },
    createGraphEngineSigma: {
      args: [
        { name: "container", type: "object", required: true },
        { name: "config", type: "object", required: false }
      ],
      returns: "object"
    },
    focusNodeById: {
      args: [
        { name: "nodeId", type: "string|number", required: true },
        { name: "fromSearch", type: "boolean", required: false }
      ],
      returns: "undefined"
    },
    edgeCurvByStyle: {
      args: [
        { name: "styleCode", type: "number", required: true },
        { name: "edgeIndex", type: "number", required: false }
      ],
      returns: "number"
    },
    graphCall: {
      args: [{ name: "methodName", type: "string", required: true }],
      returns: "any",
      methods: ENGINE_GRAPH_METHOD_CONTRACTS
    }
  });

  var contracts = root.AjpcGraphContracts && typeof root.AjpcGraphContracts === "object"
    ? root.AjpcGraphContracts
    : {};

  contracts.getCityPortContract = function (name) {
    return getSpec(CITY_PORT_CONTRACTS, name);
  };
  contracts.listCityPortContracts = function () {
    return cloneSpec(CITY_PORT_CONTRACTS) || {};
  };

  contracts.getEnginePortContract = function (name) {
    return getSpec(ENGINE_PORT_CONTRACTS, name);
  };
  contracts.listEnginePortContracts = function () {
    return cloneSpec(ENGINE_PORT_CONTRACTS) || {};
  };

  contracts.getEngineGraphMethodContract = function (name) {
    return getSpec(ENGINE_GRAPH_METHOD_CONTRACTS, name);
  };
  contracts.listEngineGraphMethodContracts = function () {
    return cloneSpec(ENGINE_GRAPH_METHOD_CONTRACTS) || {};
  };

  root.AjpcGraphContracts = contracts;
})();
