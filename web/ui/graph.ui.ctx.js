"use strict";

// Context-menu UI module (extracted from graph.ui.js).

function getNodeFamilyMapForCtx(node) {
  if (!node) return null;
  return (node.family_prios && typeof node.family_prios === "object") ? node.family_prios : null;
}

function getNodeFamiliesForCtx(node) {
  if (!node) return [];
  if (Array.isArray(node.families) && node.families.length) return node.families.slice(0);
  var map = getNodeFamilyMapForCtx(node);
  return map ? Object.keys(map) : [];
}

function hasPositiveFamilyPrioForCtx(node) {
  var map = getNodeFamilyMapForCtx(node);
  if (!map) return false;
  return Object.keys(map).some(function (k) {
    var v = map[k];
    return typeof v === "number" && isFinite(v) && v > 0;
  });
}

function edgeIdsForCtx(edge) {
  var s = edge && edge.source && typeof edge.source === "object" ? edge.source.id : (edge ? edge.source : "");
  var t = edge && edge.target && typeof edge.target === "object" ? edge.target.id : (edge ? edge.target : "");
  return { s: String(s), t: String(t) };
}

function contextNodeColor(node) {
  if (!node) return "";
  if (String(node.kind || "") === "family") return fallbackLayerColor("families");
  var ntid = String(node.note_type_id || "");
  if (ntid && STATE.noteTypes && STATE.noteTypes[ntid] && STATE.noteTypes[ntid].color) {
    return normalizeHexColor(STATE.noteTypes[ntid].color, fallbackLayerColor("notes"));
  }
  return fallbackLayerColor("notes");
}

function isNodePinnedForCtx(node) {
  if (!node) return false;
  return node.fx != null || node.fy != null;
}

function buildNoteTypeLinkedFieldMapForCtx() {
  var out = {};
  var src = STATE.noteTypes && typeof STATE.noteTypes === "object" ? STATE.noteTypes : {};
  Object.keys(src).forEach(function (id) {
    out[String(id)] = String(src[id] && src[id].linkedField || "");
  });
  return out;
}

function showCtxMessage(text) {
  updateStatus(String(text || ""));
}

function showFamilyPickerForCtx(title, families, onApply) {
  if (!families || !families.length) return;
  var overlay = byId("ctx-picker");
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);

  overlay = document.createElement("div");
  overlay.id = "ctx-picker";
  var dialog = document.createElement("div");
  dialog.className = "dialog";
  var heading = document.createElement("div");
  heading.className = "title";
  heading.textContent = String(title || "Select families");
  var list = document.createElement("div");
  list.className = "list";

  families.forEach(function (fid) {
    var row = document.createElement("label");
    row.className = "row";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(fid);
    var span = document.createElement("span");
    span.textContent = String(fid);
    row.appendChild(cb);
    row.appendChild(span);
    list.appendChild(row);
  });

  var btnRow = document.createElement("div");
  btnRow.className = "btn-row";
  var cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  var okBtn = document.createElement("button");
  okBtn.className = "btn primary";
  okBtn.type = "button";
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

  cancelBtn.addEventListener("click", function () {
    close();
  });

  okBtn.addEventListener("click", function () {
    var selected = [];
    list.querySelectorAll("input[type=checkbox]:checked").forEach(function (el) {
      selected.push(String(el.value || ""));
    });
    close();
    if (typeof onApply === "function") onApply(selected);
  });

  overlay.addEventListener("click", function (evt) {
    if (evt.target === overlay) close();
  });
}

function manualLinkInfoForCtx(aId, bId) {
  var info = { ab: false, ba: false };
  var edges = Array.isArray(STATE.activeEdges) ? STATE.activeEdges : [];
  edges.forEach(function (edge) {
    if (!edge) return;
    var layer = String(edge.layer || "");
    if (layer !== "note_links" && layer !== "reference") return;
    var meta = edge.meta && typeof edge.meta === "object" ? edge.meta : {};
    if (!meta.manual) return;
    var ids = edgeIdsForCtx(edge);
    if (ids.s === aId && ids.t === bId) info.ab = true;
    if (ids.s === bId && ids.t === aId) info.ba = true;
    if (meta.bidirectional && ((ids.s === aId && ids.t === bId) || (ids.s === bId && ids.t === aId))) {
      info.ab = true;
      info.ba = true;
    }
  });
  return info;
}

function buildContextMenuGroupsForCtx(ctx) {
  ctx = ctx || {};
  var node = ctx.node;
  if (!node) return [];
  var selectedNode = ctx.selectedNode || null;
  var selectedKind = ctx.selectedKind || (selectedNode ? (selectedNode.kind || "") : "");
  var menuSelectedId = ctx.menuSelectedId || (selectedNode ? String(selectedNode.id) : "");
  var noteTypeLinkedField = ctx.noteTypeLinkedField || {};
  var showToast = ctx.showToast || function () {};
  var pycmd = ctx.pycmd || null;
  var showFamilyPicker = ctx.showFamilyPicker || null;
  function openEditorViaApi(nodeId) {
    if (typeof updateEditorVisibility === "function") updateEditorVisibility(true);
    if (typeof syncEmbeddedEditorRect === "function") syncEmbeddedEditorRect();
    if (!pycmd) return;
    pycmd("ctx:editapi:" + String(nodeId));
  }

  function getPrimaryFamily(n) {
    if (!n) return "";
    if (n.kind === "family") return n.label || String(n.id || "").replace("family:", "");
    var fams = getNodeFamiliesForCtx(n);
    return fams.length ? String(fams[0]) : "";
  }

  function getSharedFamilies(a, b) {
    if (!a || !b) return [];
    var famA = getNodeFamiliesForCtx(a);
    var famB = getNodeFamiliesForCtx(b);
    if (!famA.length || !famB.length) return [];
    var set = Object.create(null);
    famA.forEach(function (f) { set[String(f)] = true; });
    var out = [];
    famB.forEach(function (f) { if (set[String(f)]) out.push(String(f)); });
    return out;
  }

  var groups = [];
  var openGroup = [];
  var isNodeNoteTypeHub = node && node.kind === "note_type_hub";
  if (node.kind === "note") {
    openGroup.push({
      label: "Open Preview",
      cb: function () { showToast("Open preview"); if (pycmd) pycmd("ctx:preview:" + node.id); }
    });
    openGroup.push({
      label: "Open Editor",
      cb: function () { showToast("Open editor"); openEditorViaApi(node.id); }
    });
    openGroup.push({
      label: "Open Browser",
      cb: function () { showToast("Open browser"); if (pycmd) pycmd("ctx:browser:" + node.id); }
    });
  } else if (isNodeNoteTypeHub) {
    openGroup.push({
      label: "Open Browser by Mass Linker Tag",
      cb: function () {
        var tag = "";
        var rawId = String(node.id || "");
        if (rawId.indexOf("autolink:") === 0) tag = rawId.slice("autolink:".length);
        tag = String(tag || "").trim();
        if (!tag) { showToast("Missing Mass Linker tag"); return; }
        showToast("Open browser");
        if (pycmd) pycmd("ctx:browsertag:" + encodeURIComponent(tag));
      }
    });
  }
  groups.push(openGroup);

  var isSelectedNote = selectedNode && selectedKind === "note";
  var isSelectedFamily = selectedNode && selectedKind === "family";
  var isNodeNote = node && node.kind === "note";
  var isNodeFamily = node && node.kind === "family";
  var isDifferent = selectedNode && String(node.id) !== String(menuSelectedId);
  var isSame = selectedNode && String(node.id) === String(menuSelectedId);

  var connectGroup = [];
  if (selectedNode && isDifferent && (isNodeNote || isNodeFamily)) {
    var canConnect = selectedKind === "family" || (
      selectedKind === "note" &&
      (isNodeFamily || getNodeFamiliesForCtx(selectedNode).length)
    );
    if (selectedKind === "kanji" || selectedKind === "kanji_hub") canConnect = false;
    if (canConnect) {
      if (isNodeFamily && selectedKind === "note") {
        connectGroup.push({
          label: "Connect active to: selected Family",
          cb: function () {
            var hubFid = node.label || String(node.id).replace("family:", "");
            hubFid = String(hubFid || "").trim();
            if (!hubFid) { showToast("Missing family id"); return; }
            showToast("Connect family");
            var payload = {
              source: String(node.id),
              target: String(menuSelectedId),
              source_kind: "family",
              source_label: hubFid,
              prio_mode: "hub_zero"
            };
            if (pycmd) pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
          }
        });
      }
    }
    if (canConnect && isNodeNote) {
      function doConnectWithMode(title, mode) {
        return function () {
          function doConnect(families) {
            if (Array.isArray(families) && families.length === 0) { showToast("Select at least one family"); return; }
            showToast("Connect family");
            var payload = {
              source: String(menuSelectedId),
              target: String(node.id),
              source_kind: selectedKind,
              source_label: selectedNode.label || "",
              prio_mode: mode || ""
            };
            if (families) payload.families = families;
            if (pycmd) pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
          }
          var selectedFamilies = getNodeFamiliesForCtx(selectedNode);
          if (selectedKind === "note" && selectedFamilies.length > 1) {
            if (showFamilyPicker) showFamilyPicker(title, selectedFamilies, doConnect);
            else doConnect(selectedFamilies || []);
          } else if (selectedKind === "family") {
            var fid = selectedNode.label || String(selectedNode.id).replace("family:", "");
            doConnect([fid]);
          } else if (selectedKind === "note") {
            doConnect(selectedFamilies || []);
          } else {
            doConnect([]);
          }
        };
      }
      if (selectedKind === "family") {
        connectGroup.push({ label: "Connect selected to Family", cb: doConnectWithMode("Select hub families", "hub_zero") });
      } else if (selectedKind === "note") {
        connectGroup.push({ label: "Connect selected: to active Family@+1", cb: doConnectWithMode("Select families to connect", "") });
        connectGroup.push({ label: "Connect selected to: active Family", cb: doConnectWithMode("Select families to connect", "same") });
        if (hasPositiveFamilyPrioForCtx(selectedNode)) {
          connectGroup.push({ label: "Connect selected: to active Family@-1", cb: doConnectWithMode("Select families to connect", "minus1") });
        }
        connectGroup.push({
          label: "Connect active to: selected Family",
          cb: function () {
            var families = getNodeFamiliesForCtx(node);
            if (!families.length) { showToast("No family on selected"); return; }
            function doConnectFromSelected(fams) {
              if (Array.isArray(fams) && fams.length === 0) { showToast("Select at least one family"); return; }
              showToast("Connect family");
              var payload = {
                source: String(node.id),
                target: String(menuSelectedId),
                source_kind: "note",
                source_label: node.label || "",
                prio_mode: "hub_zero"
              };
              if (Array.isArray(fams)) payload.families = fams;
              if (pycmd) pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
            }
            if (families.length > 1 && showFamilyPicker) showFamilyPicker("Select families to connect", families, doConnectFromSelected);
            else doConnectFromSelected(families);
          }
        });
      }
    }
  }
  groups.push(connectGroup);

  var linkInfo = { ab: false, ba: false };
  if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
    linkInfo = manualLinkInfoForCtx(String(menuSelectedId), String(node.id));
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
      var activeFamilies2 = getNodeFamiliesForCtx(selectedNode).map(function (f) { return String(f); });
      if (hubFid && activeFamilies2.indexOf(String(hubFid)) >= 0) sharedFamilies = [hubFid];
    } else {
      sharedFamilies = isSame ? getNodeFamiliesForCtx(node).slice(0) : getSharedFamilies(selectedNode, node);
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
              source_label: selectedNode.label || ""
            };
            if (isNodeFamily && isSelectedNote) {
              var hubFid3 = node.label || String(node.id).replace("family:", "");
              payload.source = String(node.id);
              payload.target = String(menuSelectedId);
              payload.source_kind = "family";
              payload.source_label = hubFid3;
            }
            if (families && families.length) payload.families = families;
            if (pycmd) pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
          }
          if (sharedFamilies.length > 1 && isSelectedNote) {
            if (showFamilyPicker) showFamilyPicker("Select families to disconnect", sharedFamilies, doDisconnect);
            else doDisconnect(sharedFamilies);
          } else {
            doDisconnect(sharedFamilies);
          }
        }
      });
    }
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
          var payload = { source: String(menuSelectedId), target: String(node.id), label: selectedNode.label || "" };
          if (pycmd) pycmd("ctx:link:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (activeLinked && !linkInfo.ab) {
      appendItems.push({
        label: "Append Link on active: to selected",
        cb: function () {
          showToast("Append link");
          var payload = { source: String(node.id), target: String(menuSelectedId), label: node.label || "" };
          if (pycmd) pycmd("ctx:link_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
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
            target_label: node.label || ""
          };
          if (pycmd) pycmd("ctx:link_both:" + encodeURIComponent(JSON.stringify(payload)));
        }
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
          var payload = { source: String(menuSelectedId), target: String(node.id) };
          if (pycmd) pycmd("ctx:unlink:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && selLinked) {
      removeGroup.push({
        label: "Remove Link on active: to selected",
        cb: function () {
          showToast("Remove link");
          var payload = { source: String(node.id), target: String(menuSelectedId) };
          if (pycmd) pycmd("ctx:unlink_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && linkInfo.ba && nodeLinked && selLinked) {
      removeGroup.push({
        label: "Remove Link on both: to each other",
        cb: function () {
          showToast("Remove links");
          var payload = { source: String(menuSelectedId), target: String(node.id) };
          if (pycmd) pycmd("ctx:unlink_both:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
  }

  var filterGroup = [];
  var families = [];
  if (isNodeFamily) families = [node.label || String(node.id).replace("family:", "")];
  else families = getNodeFamiliesForCtx(node).slice(0, 20);
  families.forEach(function (fid) {
    filterGroup.push({
      label: "Filter Family: " + fid,
      cb: function () {
        showToast("Filter family");
        if (pycmd) pycmd("ctx:filter:" + encodeURIComponent(fid));
      }
    });
  });

  groups.push(disconnectGroup);
  groups.push(appendItems);
  groups.push(removeGroup);
  groups.push(filterGroup);

  return groups;
}

function hideContextMenu(suppressStateClear) {
  if (!DOM.ctxMenu) return;
  if (suppressStateClear === true) {
    DOM.ctxMenu.classList.remove("is-visible");
    DOM.ctxMenu.setAttribute("aria-hidden", "true");
    return;
  }
  var hadContext = !!(STATE && STATE.contextNodeId !== null && STATE.contextNodeId !== undefined && STATE.contextNodeId !== "");
  DOM.ctxMenu.classList.remove("is-visible");
  DOM.ctxMenu.setAttribute("aria-hidden", "true");
  if (STATE) {
    STATE.contextNodeId = null;
    STATE.contextPointIndex = null;
  }
  if (hadContext) {
    var adapter = window && window.GraphAdapter;
    if (adapter && typeof adapter.callEngine === "function") {
      adapter.callEngine("applyVisualStyles", 0.08);
    } else if (typeof callEngineApplyVisualStyles === "function") {
      callEngineApplyVisualStyles(0.08);
    }
  }
}

function contextMenuViewportRect() {
  var vv = (window && window.visualViewport) ? window.visualViewport : null;
  var vpLeft = vv && isFiniteNumber(Number(vv.offsetLeft)) ? Number(vv.offsetLeft) : 0;
  var vpTop = vv && isFiniteNumber(Number(vv.offsetTop)) ? Number(vv.offsetTop) : 0;
  var vpWidth = vv && isFiniteNumber(Number(vv.width)) ? Number(vv.width) : (window.innerWidth || document.documentElement.clientWidth || 1);
  var vpHeight = vv && isFiniteNumber(Number(vv.height)) ? Number(vv.height) : (window.innerHeight || document.documentElement.clientHeight || 1);
  var vpRight = vpLeft + vpWidth;
  var vpBottom = vpTop + vpHeight;

  // Clamp to the graph panel if available, so the menu cannot leave the graph viewport.
  if (DOM && DOM.graphPanel && typeof DOM.graphPanel.getBoundingClientRect === "function") {
    var r = DOM.graphPanel.getBoundingClientRect();
    var pl = Number(r.left);
    var pt = Number(r.top);
    var pr = Number(r.right);
    var pb = Number(r.bottom);
    if (isFiniteNumber(pl) && isFiniteNumber(pt) && isFiniteNumber(pr) && isFiniteNumber(pb) && pr > pl && pb > pt) {
      vpLeft = Math.max(vpLeft, pl);
      vpTop = Math.max(vpTop, pt);
      vpRight = Math.min(vpRight, pr);
      vpBottom = Math.min(vpBottom, pb);
      vpWidth = Math.max(1, vpRight - vpLeft);
      vpHeight = Math.max(1, vpBottom - vpTop);
    }
  }

  return {
    left: vpLeft,
    top: vpTop,
    width: vpWidth,
    height: vpHeight,
    right: vpRight,
    bottom: vpBottom
  };
}

function showContextMenu(node, evt) {
  var menu = DOM.ctxMenu;
  if (!menu || !node) return;

  var menuSelectedId = STATE.selectedNodeId ? String(STATE.selectedNodeId) : "";
  var selectedNode = null;
  if (menuSelectedId && STATE.activeIndexById && STATE.activeIndexById.has(menuSelectedId)) {
    var si = Number(STATE.activeIndexById.get(menuSelectedId));
    if (isFinite(si) && si >= 0 && si < STATE.activeNodes.length) selectedNode = STATE.activeNodes[si];
  }
  if (!selectedNode && node.kind === "note") {
    selectedNode = node;
    menuSelectedId = String(node.id || "");
  }
  var selectedKind = selectedNode ? String(selectedNode.kind || "") : "";
  var activeColor = contextNodeColor(node);
  var noteTypeLinkedField = buildNoteTypeLinkedFieldMapForCtx();

  var groups = buildContextMenuGroupsForCtx({
    node: node,
    selectedNode: selectedNode,
    selectedKind: selectedKind,
    menuSelectedId: menuSelectedId,
    noteTypeLinkedField: noteTypeLinkedField,
    showToast: showCtxMessage,
    pycmd: window.pycmd,
    showFamilyPicker: showFamilyPickerForCtx
  });

  function addItem(label, cb) {
    var div = document.createElement("div");
    div.className = "item";
    var tokens = String(label || "").split(/(selected|active)/g);
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
    div.addEventListener("click", function () {
      try {
        cb();
      } finally {
        hideContextMenu();
      }
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
    if (!Array.isArray(items) || !items.length) return;
    if (menu.childElementCount) addDivider();
    items.forEach(function (entry) {
      if (!entry || typeof entry.cb !== "function") return;
      addItem(entry.label, entry.cb);
    });
  }

  menu.innerHTML = "";
  groups.forEach(appendGroup);
  if (isNodePinnedForCtx(node)) {
    if (menu.childElementCount) {
      var d = document.createElement("div");
      d.className = "divider";
      menu.appendChild(d);
    }
    addItem("Unpin Node", function () {
      node.fx = null;
      node.fy = null;
      if (STATE.graph && typeof STATE.graph.start === "function") STATE.graph.start();
      showCtxMessage("Node unpinned");
    });
  }

  var e = evt || window.event;
  var x = e && isFiniteNumber(Number(e.clientX)) ? Number(e.clientX) : 0;
  var y = e && isFiniteNumber(Number(e.clientY)) ? Number(e.clientY) : 0;

  var margin = 8;
  var vr = contextMenuViewportRect();
  var maxW = Math.max(160, vr.width - (margin * 2));
  var maxH = Math.max(96, vr.height - (margin * 2));
  menu.style.minWidth = Math.round(Math.min(220, maxW)) + "px";
  menu.style.maxWidth = Math.round(maxW) + "px";
  menu.style.maxHeight = Math.round(maxH) + "px";
  menu.style.overflowY = "auto";
  menu.style.overflowX = "hidden";

  menu.classList.add("is-visible");
  menu.setAttribute("aria-hidden", "false");

  var box = menu.getBoundingClientRect();
  var mw = isFiniteNumber(Number(box.width)) && Number(box.width) > 0 ? Number(box.width) : (menu.offsetWidth || 220);
  var mh = isFiniteNumber(Number(box.height)) && Number(box.height) > 0 ? Number(box.height) : (menu.offsetHeight || 120);

  var left = Math.max(vr.left + margin, Math.min(vr.right - mw - margin, x));
  var top = Math.max(vr.top + margin, Math.min(vr.bottom - mh - margin, y));
  menu.style.left = Math.round(left) + "px";
  menu.style.top = Math.round(top) + "px";
}

window.hideContextMenu = hideContextMenu;
