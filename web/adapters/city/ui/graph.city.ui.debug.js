"use strict";

// Debug panel UI module (extracted from graph.city.ui.js)

var DEBUG_EXTRA_SPEC = [
  { key: "fps", a: "perfFps", b: null },
  { key: "hov", a: "hoverReason", b: "hoverIdx" },
  { key: "node", a: "hoverNode", b: "hoverType" },
  { key: "sty", a: "styleMode", b: "styleCount" },
  { key: "dep", a: "depTreeRps", b: "depTreeSkipCount" }
];

var DEBUG_COORD_SPEC = [
  { key: "use", a: "use", b: null },
  { key: "ratio", a: "camR", b: null },
  { key: "vp", a: "vpX", b: "vpY" },
  { key: "cl", a: "clX", b: "clY" },
  { key: "cam", a: "camX", b: "camY" }
];

function debugCallEngine(name) {
  var gw = window && window.AjpcCityGateway;
  if (!gw || typeof gw.callEngine !== "function") return undefined;
  return gw.callEngine.apply(gw, arguments);
}

function debugCallEngineGraph(methodName) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift(methodName);
  return debugCallEngine.apply(null, args);
}

function ensureDebugCoordRows() {
  if (!DOM.debugCoords || DOM.debugCoordCells) return;
  DOM.debugCoordCells = {};
  var table = document.createElement("div");
  table.className = "coord-table";
  table.setAttribute("aria-label", "debug coordinates");
  DEBUG_COORD_SPEC.forEach(function (row) {
    var k = document.createElement("div");
    k.className = "coord-key";
    k.textContent = row.key;
    var a = document.createElement("div");
    a.className = "coord-val";
    a.textContent = "--";
    var b = document.createElement("div");
    b.className = row.b ? "coord-val" : "coord-empty";
    b.textContent = "--";
    table.appendChild(k);
    table.appendChild(a);
    table.appendChild(b);
    DOM.debugCoordCells[row.a] = a;
    if (row.b) DOM.debugCoordCells[row.b] = b;
  });
  DOM.debugCoords.innerHTML = "";
  DOM.debugCoords.appendChild(table);
}

function ensureDebugExtraRows() {
  if (!DOM.debugExtra || DOM.debugExtraCells) return;
  DOM.debugExtraCells = {};
  var table = document.createElement("div");
  table.className = "coord-table";
  table.setAttribute("aria-label", "debug extra");
  DEBUG_EXTRA_SPEC.forEach(function (row) {
    var k = document.createElement("div");
    k.className = "coord-key";
    k.textContent = row.key;
    var a = document.createElement("div");
    a.className = "coord-val";
    a.textContent = "--";
    var b = document.createElement("div");
    b.className = row.b ? "coord-val" : "coord-empty";
    b.textContent = "--";
    table.appendChild(k);
    table.appendChild(a);
    table.appendChild(b);
    DOM.debugExtraCells[row.a] = a;
    if (row.b) DOM.debugExtraCells[row.b] = b;
  });
  DOM.debugExtra.innerHTML = "";
  DOM.debugExtra.appendChild(table);
}

function setDebugCoordValues(v) {
  ensureDebugCoordRows();
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugCoordCells) return;
  DEBUG_COORD_SPEC.forEach(function (row) {
    if (DOM.debugCoordCells[row.a]) DOM.debugCoordCells[row.a].textContent = String(x[row.a] || "--");
    if (row.b && DOM.debugCoordCells[row.b]) DOM.debugCoordCells[row.b].textContent = String(x[row.b] || "--");
  });
}

function setDebugExtraValues(v) {
  ensureDebugExtraRows();
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugExtraCells) return;
  DEBUG_EXTRA_SPEC.forEach(function (row) {
    if (DOM.debugExtraCells[row.a]) DOM.debugExtraCells[row.a].textContent = String(x[row.a] || "--");
    if (row.b && DOM.debugExtraCells[row.b]) DOM.debugExtraCells[row.b].textContent = String(x[row.b] || "--");
  });
}

function clearDebugValueTables() {
  setDebugCoordValues({
    use: "--",
    vpX: "--",
    vpY: "--",
    clX: "--",
    clY: "--",
    camX: "--",
    camY: "--",
    camR: "--"
  });
  setDebugExtraValues({
    perfFps: "--",
    hoverReason: "--",
    hoverIdx: "--",
    hoverNode: "--",
    hoverType: "--",
    styleMode: "--",
    styleCount: "--",
    depTreeRps: "--",
    depTreeSkipCount: "--"
  });
}

function styleDebugSummary() {
  var s = STATE && STATE.styleDebug && typeof STATE.styleDebug === "object" ? STATE.styleDebug : {};
  var mode = String(s.lastMode || "--");
  var h = Number(s.hoverPatchCount || 0);
  var f = Number(s.focusPatchCount || 0);
  var a = Number(s.fullCount || 0);
  if (!isFiniteNumber(h) || h < 0) h = 0;
  if (!isFiniteNumber(f) || f < 0) f = 0;
  if (!isFiniteNumber(a) || a < 0) a = 0;
  return {
    mode: mode,
    count: "h" + h + "|f" + f + "|a" + a
  };
}

function syncDebugPanelVisibility() {
  var enabled = !!STATE.debugEnabled;
  if (DOM.toolbarDebugPanel) {
    DOM.toolbarDebugPanel.classList.toggle("hidden", !enabled);
    DOM.toolbarDebugPanel.classList.toggle("is-hidden", !enabled);
    DOM.toolbarDebugPanel.setAttribute("aria-hidden", enabled ? "false" : "true");
  }
  if (DOM.statusDebugPanel) {
    DOM.statusDebugPanel.classList.toggle("is-hidden", !enabled);
    DOM.statusDebugPanel.setAttribute("aria-hidden", enabled ? "false" : "true");
  }
}

function stopDebugPerfMonitor() {
  if (STATE.perfRaf) {
    window.cancelAnimationFrame(STATE.perfRaf);
    STATE.perfRaf = null;
  }
  STATE.perfWindowStart = 0;
  STATE.perfFrameCount = 0;
  STATE.perfFps = NaN;
}

function startDebugPerfMonitor() {
  if (!STATE.debugEnabled) return;
  if ((!DOM.debugCoords && !DOM.debugExtra) || STATE.perfRaf) return;
  ensureDebugCoordRows();
  ensureDebugExtraRows();
  STATE.perfFps = NaN;

  function tick(ts) {
    if (!STATE.debugEnabled) {
      stopDebugPerfMonitor();
      clearDebugValueTables();
      syncDebugPanelVisibility();
      return;
    }

    if (!STATE.perfWindowStart) STATE.perfWindowStart = ts;
    STATE.perfFrameCount += 1;

    var elapsed = ts - STATE.perfWindowStart;
    if (elapsed >= 500) {
      var fps = (STATE.perfFrameCount * 1000) / elapsed;
      STATE.perfFps = fps;
      STATE.perfFrameCount = 0;
      STATE.perfWindowStart = ts;
    }
    updateCoordsStatus();
    STATE.perfRaf = window.requestAnimationFrame(tick);
  }

  STATE.perfRaf = window.requestAnimationFrame(tick);
}

function syncDebugPerfMonitor() {
  syncDebugPanelVisibility();
  if (!STATE.debugEnabled) {
    stopDebugPerfMonitor();
    clearDebugValueTables();
    return;
  }
  startDebugPerfMonitor();
}

function updateCoordsStatus() {
  if (!STATE.debugEnabled) {
    syncDebugPanelVisibility();
    return;
  }
  if (!DOM.debugCoords) return;
  syncDebugPanelVisibility();
  function setOff() {
    if (DOM.debugCoords) {
      if (!!STATE.debugEnabled) {
        var hd0 = STATE.hoverDebug || {};
        var hReason0 = String(hd0.reason || "--");
        var hIdx0 = (hd0.idx === null || hd0.idx === undefined || !isFiniteNumber(hd0.idx)) ? "--" : String(Math.round(Number(hd0.idx)));
        var sty0 = styleDebugSummary();
        var dep0 = depTreeDebugStats(Date.now());
        setDebugCoordValues({
          use: "--",
          vpX: "--",
          vpY: "--",
          clX: "--",
          clY: "--",
          camX: "--",
          camY: "--",
          camR: "--"
        });
        setDebugExtraValues({
          perfFps: (isFiniteNumber(STATE.perfFps) ? Number(STATE.perfFps).toFixed(1) : "--"),
          hoverReason: hReason0,
          hoverIdx: hIdx0,
          hoverNode: "--",
          hoverType: "--",
          styleMode: sty0.mode,
          styleCount: sty0.count,
          depTreeRps: dep0.depTreeRps,
          depTreeSkipCount: dep0.depTreeSkipCount
        });
      } else {
        clearDebugValueTables();
      }
    }
  }
  if (!DOM.graph) {
    setOff();
    return;
  }
  if (!STATE.pointerInsideGraph || !isFiniteNumber(STATE.pointerClientX) || !isFiniteNumber(STATE.pointerClientY)) {
    setOff();
    return;
  }

  var rect = DOM.graph.getBoundingClientRect();
  if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) {
    setOff();
    return;
  }

  var vx = Number(STATE.pointerClientX) - Number(rect.left);
  var vy = Number(STATE.pointerClientY) - Number(rect.top);
  if (!isFiniteNumber(vx) || !isFiniteNumber(vy) || vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) {
    setOff();
    return;
  }

  function spaceScore(space) {
    if (!Array.isArray(space) || space.length < 2 || !isFiniteNumber(space[0]) || !isFiniteNumber(space[1])) return Number.POSITIVE_INFINITY;
    var x = Number(space[0]);
    var y = Number(space[1]);
    var sMin = 0;
    var sMax = (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE)) ? Number(SPACE_SIZE) : 4096;
    var ox = 0;
    var oy = 0;
    if (x < sMin) ox = sMin - x;
    else if (x > sMax) ox = x - sMax;
    if (y < sMin) oy = sMin - y;
    else if (y > sMax) oy = y - sMax;
    return (ox * ox) + (oy * oy);
  }

  var spaceViewport = debugCallEngineGraph("screenToSpacePosition", [vx, vy]);
  var spaceClient = debugCallEngineGraph("screenToSpacePosition", [Number(STATE.pointerClientX), Number(STATE.pointerClientY)]);
  var scoreViewport = spaceScore(spaceViewport);
  var scoreClient = spaceScore(spaceClient);
  var space = scoreViewport <= scoreClient ? spaceViewport : spaceClient;
  if (!Array.isArray(space) || space.length < 2 || !isFiniteNumber(space[0]) || !isFiniteNumber(space[1])) {
    setOff();
    return;
  }
  if (!!STATE.debugEnabled) {
    var vpX = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[0])) ? Number(spaceViewport[0]).toFixed(1) : "--";
    var vpY = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[1])) ? Number(spaceViewport[1]).toFixed(1) : "--";
    var clX = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[0])) ? Number(spaceClient[0]).toFixed(1) : "--";
    var clY = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[1])) ? Number(spaceClient[1]).toFixed(1) : "--";
    var useTag = scoreViewport <= scoreClient ? "vp" : "cl";
    var camX = "--";
    var camY = "--";
    var camR = "--";
    var cam = debugCallEngineGraph("getCameraState");
    if (cam && isFiniteNumber(cam.x) && isFiniteNumber(cam.y) && isFiniteNumber(cam.ratio)) {
      camX = Number(cam.x).toFixed(3);
      camY = Number(cam.y).toFixed(3);
      camR = Number(cam.ratio).toFixed(4);
    }
    var hd = STATE.hoverDebug || {};
    var hReason = String(hd.reason || "--");
    var hIdx = (hd.idx === null || hd.idx === undefined || !isFiniteNumber(hd.idx)) ? "--" : String(Math.round(Number(hd.idx)));
    var hNode = String(hd.nodeId || "--");
    var hType = String(hd.noteType || "--");
    var sty = styleDebugSummary();
    var dep = depTreeDebugStats(Date.now());
    setDebugCoordValues({
      use: useTag,
      vpX: vpX,
      vpY: vpY,
      clX: clX,
      clY: clY,
      camX: camX,
      camY: camY,
      camR: camR
    });
    setDebugExtraValues({
      perfFps: (isFiniteNumber(STATE.perfFps) ? Number(STATE.perfFps).toFixed(1) : "--"),
      hoverReason: hReason,
      hoverIdx: hIdx,
      hoverNode: hNode,
      hoverType: hType,
      styleMode: sty.mode,
      styleCount: sty.count,
      depTreeRps: dep.depTreeRps,
      depTreeSkipCount: dep.depTreeSkipCount
    });
  } else if (DOM.debugCoords) {
    clearDebugValueTables();
  }
}

function reloadGraphStylesheet() {
  var links = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]'));
  if (!links.length) return;
  var target = null;
  for (var i = 0; i < links.length; i += 1) {
    var href = String(links[i].getAttribute("href") || "");
    if (href.indexOf("graph.css") >= 0) {
      target = links[i];
      break;
    }
  }
  if (!target) target = links[0];
  var hrefRaw = String(target.getAttribute("href") || "");
  if (!hrefRaw) return;
  var stamp = String(Date.now());
  var next = hrefRaw;
  if (hrefRaw.indexOf("?") >= 0) {
    if (/([?&])v=\d+/.test(hrefRaw)) {
      next = hrefRaw.replace(/([?&])v=\d+/, "$1v=" + stamp);
    } else {
      next = hrefRaw + "&v=" + stamp;
    }
  } else {
    next = hrefRaw + "?v=" + stamp;
  }
  target.setAttribute("href", next);
}

function wireDebugDom() {
  
  DOM.debugCoords = byId("debug-coords");
  DOM.debugExtra = byId("debug-extra");
  DOM.debugCoordCells = null;
  DOM.debugExtraCells = null;

  DOM.statusDebugPanel = byId("status-debug-panel");
  DOM.toolbarDebugPanel = byId("toolbar-debug");

  DOM.btnDevTools = byId("btn-dev-tools");
  DOM.btnReloadCss = byId("btn-reload-css");

  if (DOM.btnReloadCss) {
    DOM.btnReloadCss.addEventListener("click", function () {
      reloadGraphStylesheet();
    });
  }
  if (DOM.btnDevTools) {
    DOM.btnDevTools.addEventListener("click", function () {
      if (window.pycmd) {
        window.pycmd("devtools");
      } else {
        debugCallEngine("applyGraphData", true);
      }
    });
  }
  syncDebugPerfMonitor();
}

