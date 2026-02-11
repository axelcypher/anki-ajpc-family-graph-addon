"use strict";

// Debug panel UI module (extracted from graph.ui.js)

var DEBUG_EXTRA_SPEC = [
  { key: "hov", a: "hoverReason", b: "hoverIdx" },
  { key: "node", a: "hoverNode", b: "hoverType" },
  { key: "hit", a: "hoverHit", b: "hoverDist" },
  { key: "dxy", a: "hoverDx", b: "hoverDy" },
  { key: "dep", a: "depTreeRps", b: "depTreeSkipCount" }
];

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
    b.className = "coord-val";
    b.textContent = "--";
    table.appendChild(k);
    table.appendChild(a);
    table.appendChild(b);
    DOM.debugExtraCells[row.a] = a;
    DOM.debugExtraCells[row.b] = b;
  });
  DOM.debugExtra.innerHTML = "";
  DOM.debugExtra.appendChild(table);
}

function setDebugCoordValues(v) {
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugCoordUse) return;
  DOM.debugCoordUse.textContent = String(x.use || "--");
  DOM.debugCoordVpX.textContent = String(x.vpX || "--");
  DOM.debugCoordVpY.textContent = String(x.vpY || "--");
  DOM.debugCoordClX.textContent = String(x.clX || "--");
  DOM.debugCoordClY.textContent = String(x.clY || "--");
  DOM.debugCoordCamX.textContent = String(x.camX || "--");
  DOM.debugCoordCamY.textContent = String(x.camY || "--");
  DOM.debugCoordRatio.textContent = String(x.camR || "--");
}

function setDebugExtraValues(v) {
  ensureDebugExtraRows();
  var x = v && typeof v === "object" ? v : {};
  if (!DOM.debugExtraCells) return;
  DEBUG_EXTRA_SPEC.forEach(function (row) {
    if (DOM.debugExtraCells[row.a]) DOM.debugExtraCells[row.a].textContent = String(x[row.a] || "--");
    if (DOM.debugExtraCells[row.b]) DOM.debugExtraCells[row.b].textContent = String(x[row.b] || "--");
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
    hoverReason: "--",
    hoverIdx: "--",
    hoverNode: "--",
    hoverType: "--",
    hoverHit: "--",
    hoverDist: "--",
    hoverDx: "--",
    hoverDy: "--",
    depTreeRps: "--",
    depTreeSkipCount: "--"
  });
}

function syncDebugPanelVisibility() {
  if (!DOM.statusDebugPanel) return;
  var enabled = !!STATE.debugEnabled;
  DOM.statusDebugPanel.classList.toggle("is-hidden", !enabled);
  DOM.statusDebugPanel.setAttribute("aria-hidden", enabled ? "false" : "true");
}

function updateCoordsStatus() {
  if (!STATE.debugEnabled) {
    syncDebugPanelVisibility();
    return;
  }
  if (!DOM.statusCoords && !DOM.debugCoords) return;
  syncDebugPanelVisibility();
  function fnum(v, digits) {
    return isFiniteNumber(v) ? Number(v).toFixed(digits) : "--";
  }
  function setOff() {
    if (DOM.statusCoords) DOM.statusCoords.textContent = "Coords: --, --";
    if (DOM.debugCoords) {
      if (!!STATE.debugEnabled) {
        var hd0 = STATE.hoverDebug || {};
        var hReason0 = String(hd0.reason || "--");
        var hIdx0 = (hd0.idx === null || hd0.idx === undefined || !isFiniteNumber(hd0.idx)) ? "--" : String(Math.round(Number(hd0.idx)));
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
          hoverReason: hReason0,
          hoverIdx: hIdx0,
          hoverNode: "--",
          hoverType: "--",
          hoverHit: "--",
          hoverDist: "--",
          hoverDx: "--",
          hoverDy: "--",
          depTreeRps: dep0.depTreeRps,
          depTreeSkipCount: dep0.depTreeSkipCount
        });
      } else {
        clearDebugValueTables();
      }
    }
  }
  if (!STATE.graph || !DOM.graph) {
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

  if (typeof STATE.graph.screenToSpacePosition !== "function") {
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

  var spaceViewport = STATE.graph.screenToSpacePosition([vx, vy]);
  var spaceClient = STATE.graph.screenToSpacePosition([Number(STATE.pointerClientX), Number(STATE.pointerClientY)]);
  var scoreViewport = spaceScore(spaceViewport);
  var scoreClient = spaceScore(spaceClient);
  var space = scoreViewport <= scoreClient ? spaceViewport : spaceClient;
  if (!Array.isArray(space) || space.length < 2 || !isFiniteNumber(space[0]) || !isFiniteNumber(space[1])) {
    setOff();
    return;
  }
  var sBase = (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE) && SPACE_SIZE > 0) ? Number(SPACE_SIZE) : 4096;
  var nx = (Number(space[0]) / sBase) * 100;
  var ny = (Number(space[1]) / sBase) * 100;
  var out = "Coords: " + nx.toFixed(1) + ", " + ny.toFixed(1);

  if (DOM.statusCoords) DOM.statusCoords.textContent = out;
  if (!!STATE.debugEnabled) {
    var vpX = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[0])) ? Number(spaceViewport[0]).toFixed(1) : "--";
    var vpY = (Array.isArray(spaceViewport) && isFiniteNumber(spaceViewport[1])) ? Number(spaceViewport[1]).toFixed(1) : "--";
    var clX = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[0])) ? Number(spaceClient[0]).toFixed(1) : "--";
    var clY = (Array.isArray(spaceClient) && isFiniteNumber(spaceClient[1])) ? Number(spaceClient[1]).toFixed(1) : "--";
    var useTag = scoreViewport <= scoreClient ? "vp" : "cl";
    var camX = "--";
    var camY = "--";
    var camR = "--";
    if (STATE.graph && typeof STATE.graph.getCameraState === "function") {
      var cam = STATE.graph.getCameraState();
      if (cam && isFiniteNumber(cam.x) && isFiniteNumber(cam.y) && isFiniteNumber(cam.ratio)) {
        camX = Number(cam.x).toFixed(3);
        camY = Number(cam.y).toFixed(3);
        camR = Number(cam.ratio).toFixed(4);
      }
    }
    var hd = STATE.hoverDebug || {};
    var hReason = String(hd.reason || "--");
    var hIdx = (hd.idx === null || hd.idx === undefined || !isFiniteNumber(hd.idx)) ? "--" : String(Math.round(Number(hd.idx)));
    var hNode = String(hd.nodeId || "--");
    var hType = String(hd.noteType || "--");
    var hHit = fnum(hd.hitRadius, 2);
    var hDist = fnum(hd.dist, 2);
    var hDx = fnum(hd.dx, 1);
    var hDy = fnum(hd.dy, 1);
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
      hoverReason: hReason,
      hoverIdx: hIdx,
      hoverNode: hNode,
      hoverType: hType,
      hoverHit: hHit,
      hoverDist: hDist,
      hoverDx: hDx,
      hoverDy: hDy,
      depTreeRps: dep.depTreeRps,
      depTreeSkipCount: dep.depTreeSkipCount
    });
  } else if (DOM.debugCoords) {
    clearDebugValueTables();
  }
}

