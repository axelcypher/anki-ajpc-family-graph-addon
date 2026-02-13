"use strict";

// Embedded editor bridge helpers.
// This module only handles UI -> Python bridge messaging for the native editor panel.
(function () {
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

  function openEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (!(nid > 0)) {
      if (typeof updateStatus === "function") updateStatus("Select a note node first");
      return false;
    }
    return pycmdSafe("embed_editor:open:" + String(nid));
  }

  function toggleEmbeddedEditorForSelectedNote() {
    var nid = selectedNoteNidFromState();
    if (nid > 0) return pycmdSafe("embed_editor:toggle:" + String(nid));
    return pycmdSafe("embed_editor:toggle:0");
  }

  function closeEmbeddedEditorPanel() {
    return pycmdSafe("embed_editor:close");
  }

  window.selectedNoteNidFromState = selectedNoteNidFromState;
  window.openEmbeddedEditorForSelectedNote = openEmbeddedEditorForSelectedNote;
  window.toggleEmbeddedEditorForSelectedNote = toggleEmbeddedEditorForSelectedNote;
  window.closeEmbeddedEditorPanel = closeEmbeddedEditorPanel;
})();
