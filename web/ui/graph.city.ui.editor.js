"use strict";

// Embedded editor bridge helpers.
// This module only handles UI -> Python bridge messaging for the native editor panel.
(function () {
  var rectSyncTimer = null;
  var pendingOpenTimer = null;
  var pendingOpenNonce = 0;

  function pycmdSafe(msg) {
    try {
      if (window.pycmd) {
        window.pycmd(String(msg || ""));
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function selectedNoteNidFromState() {
    if (!window.STATE || !Array.isArray(STATE.activeNodes)) return 0;

    var idx = Number(STATE.selectedPointIndex);
    if ((!isFinite(idx) || idx < 0) && STATE.activeIndexById && STATE.selectedNodeId !== null && STATE.selectedNodeId !== undefined) {
      var mapped = STATE.activeIndexById.get(String(STATE.selectedNodeId));
      if (mapped !== undefined) idx = Number(mapped);
    }
    if (!isFinite(idx) || idx < 0 || idx >= STATE.activeNodes.length) return 0;

    var node = STATE.activeNodes[idx];
    if (!node || String(node.kind || "") !== "note") return 0;

    var nid = Number(node.id);
    if (!isFinite(nid) || nid <= 0) return 0;
    return Math.floor(nid);
  }

  function editorPanelRectPayload() {
    if (!window.DOM || !DOM.editorPanel) {
      return { visible: false, x: 0, y: 0, w: 0, h: 0, vw: 0, vh: 0, tms: 0 };
    }
    var closed = DOM.editorPanel.classList.contains("closed");
    var tms = editorPanelTransitionMs();
    if (closed) {
      return {
        visible: false,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        vw: Math.max(0, Math.round(Number(window.innerWidth || 0))),
        vh: Math.max(0, Math.round(Number(window.innerHeight || 0))),
        tms: tms
      };
    }
    var r = DOM.editorPanel.getBoundingClientRect();
    if (!r) {
      return {
        visible: false,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        vw: Math.max(0, Math.round(Number(window.innerWidth || 0))),
        vh: Math.max(0, Math.round(Number(window.innerHeight || 0))),
        tms: tms
      };
    }
    var cs = null;
    try { cs = window.getComputedStyle(DOM.editorPanel); } catch (_e0) {}
    var cssW = cs ? Number.parseFloat(cs.width || "0") : 0;
    var cssH = cs ? Number.parseFloat(cs.height || "0") : 0;
    return {
      visible: true,
      x: Math.round(Number(r.left || 0)),
      y: Math.round(Number(r.top || 0)),
      w: Math.max(0, Math.round(cssW > 0 ? cssW : Number(r.width || 0))),
      h: Math.max(0, Math.round(cssH > 0 ? cssH : Number(r.height || 0))),
      vw: Math.max(0, Math.round(Number(window.innerWidth || 0))),
      vh: Math.max(0, Math.round(Number(window.innerHeight || 0))),
      tms: tms
    };
  }

  function parseCssTimeMs(raw) {
    var s = String(raw || "").trim();
    if (!s) return 0;
    if (s.slice(-2) === "ms") return Number.parseFloat(s.slice(0, -2)) || 0;
    if (s.slice(-1) === "s") return (Number.parseFloat(s.slice(0, -1)) || 0) * 1000;
    return Number.parseFloat(s) || 0;
  }

  function editorPanelTransitionMs() {
    if (!window.DOM || !DOM.editorPanel) return 220;
    var cs = null;
    try { cs = window.getComputedStyle(DOM.editorPanel); } catch (_e1) {}
    if (!cs) return 220;
    var durs = String(cs.transitionDuration || "").split(",");
    var delays = String(cs.transitionDelay || "").split(",");
    var n = Math.max(durs.length, delays.length, 1);
    var maxMs = 0;
    for (var i = 0; i < n; i += 1) {
      var d = parseCssTimeMs(durs[i] || durs[durs.length - 1] || "0ms");
      var dl = parseCssTimeMs(delays[i] || delays[delays.length - 1] || "0ms");
      var total = d + dl;
      if (total > maxMs) maxMs = total;
    }
    return Math.max(0, Math.round(maxMs));
  }

  function sendEmbeddedEditorRect() {
    var payload = editorPanelRectPayload();
    return pycmdSafe("embed_editor:rect:" + encodeURIComponent(JSON.stringify(payload)));
  }

  function syncEmbeddedEditorRect() {
    sendEmbeddedEditorRect();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        sendEmbeddedEditorRect();
      });
    });
    if (rectSyncTimer) {
      try { window.clearTimeout(rectSyncTimer); } catch (_e0) {}
      rectSyncTimer = null;
    }
    // Re-send after panel transition settles (duration is read from CSS).
    var settleMs = editorPanelTransitionMs() + 40;
    rectSyncTimer = window.setTimeout(function () {
      rectSyncTimer = null;
      sendEmbeddedEditorRect();
      window.setTimeout(sendEmbeddedEditorRect, 90);
    }, settleMs);
    return true;
  }

  function cancelPendingOpen() {
    pendingOpenNonce += 1;
    if (pendingOpenTimer) {
      try { window.clearTimeout(pendingOpenTimer); } catch (_e2) {}
      pendingOpenTimer = null;
    }
  }

  function runDelayedOpen(nid, nonce) {
    if (nonce !== pendingOpenNonce) return;
    if (!(window.DOM && DOM.editorPanel) || DOM.editorPanel.classList.contains("closed")) return;
    syncEmbeddedEditorRect();
    pycmdSafe("embed_editor:open:" + String(nid));
    syncEmbeddedEditorRect();
  }

  function openEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (!(nid > 0)) {
      if (typeof updateStatus === "function") updateStatus("Select a note node first");
      return false;
    }
    cancelPendingOpen();
    syncEmbeddedEditorRect();
    runDelayedOpen(nid, pendingOpenNonce);
    return true;
  }

  function toggleEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (nid > 0) return pycmdSafe("embed_editor:toggle:" + String(nid));
    return pycmdSafe("embed_editor:toggle:0");
  }

  function closeEmbeddedEditorPanel() {
    cancelPendingOpen();
    var ok = pycmdSafe("embed_editor:close");
    sendEmbeddedEditorRect();
    return ok;
  }

  function openEmbeddedEditorDevTools() {
    return pycmdSafe("embed_editor:devtools");
  }

  function bindEmbeddedEditorRectSync() {
    if (window.__ajpcEditorRectSyncBound) return;
    window.__ajpcEditorRectSyncBound = true;
    window.addEventListener("resize", function () {
      if (window.DOM && DOM.editorPanel && !DOM.editorPanel.classList.contains("closed")) {
        syncEmbeddedEditorRect();
      }
    });
  }
  bindEmbeddedEditorRectSync();

  window.selectedNoteNidFromState = selectedNoteNidFromState;
  window.openEmbeddedEditorForSelectedNote = openEmbeddedEditorForSelectedNote;
  window.toggleEmbeddedEditorForSelectedNote = toggleEmbeddedEditorForSelectedNote;
  window.closeEmbeddedEditorPanel = closeEmbeddedEditorPanel;
  window.openEmbeddedEditorDevTools = openEmbeddedEditorDevTools;
  window.sendEmbeddedEditorRect = sendEmbeddedEditorRect;
  window.syncEmbeddedEditorRect = syncEmbeddedEditorRect;
})();
