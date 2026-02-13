"use strict";

// Embedded editor bridge helpers.
// This module only handles UI -> Python bridge messaging for the native editor panel.
(function () {
  var rectSyncTimer = null;

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
      return { visible: false, x: 0, y: 0, w: 0, h: 0 };
    }
    var closed = DOM.editorPanel.classList.contains("closed");
    if (closed) return { visible: false, x: 0, y: 0, w: 0, h: 0 };
    var r = DOM.editorPanel.getBoundingClientRect();
    if (!r) return { visible: false, x: 0, y: 0, w: 0, h: 0 };
    return {
      visible: true,
      x: Math.round(Number(r.left || 0)),
      y: Math.round(Number(r.top || 0)),
      w: Math.max(0, Math.round(Number(r.width || 0))),
      h: Math.max(0, Math.round(Number(r.height || 0)))
    };
  }

  function sendEmbeddedEditorRect() {
    var payload = editorPanelRectPayload();
    return pycmdSafe("embed_editor:rect:" + encodeURIComponent(JSON.stringify(payload)));
  }

  function syncEmbeddedEditorRect() {
    sendEmbeddedEditorRect();
    if (rectSyncTimer) {
      try { window.clearTimeout(rectSyncTimer); } catch (_e0) {}
      rectSyncTimer = null;
    }
    // Re-send after panel transition settles.
    rectSyncTimer = window.setTimeout(function () {
      rectSyncTimer = null;
      sendEmbeddedEditorRect();
    }, 240);
    return true;
  }

  function openEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (!(nid > 0)) {
      if (typeof updateStatus === "function") updateStatus("Select a note node first");
      return false;
    }
    syncEmbeddedEditorRect();
    var ok = pycmdSafe("embed_editor:open:" + String(nid));
    syncEmbeddedEditorRect();
    return ok;
  }

  function toggleEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (nid > 0) return pycmdSafe("embed_editor:toggle:" + String(nid));
    return pycmdSafe("embed_editor:toggle:0");
  }

  function closeEmbeddedEditorPanel() {
    var ok = pycmdSafe("embed_editor:close");
    sendEmbeddedEditorRect();
    return ok;
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
  window.sendEmbeddedEditorRect = sendEmbeddedEditorRect;
  window.syncEmbeddedEditorRect = syncEmbeddedEditorRect;
})();
