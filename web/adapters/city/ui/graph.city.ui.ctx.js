"use strict";

// Context-menu UI module (extracted from graph.city.ui.js).
var CTX_ICON_DEFAULT_MODE = "fixed";
var CTX_ICON_DEFAULT_COLOR = "var(--text-main)";
var CTX_ICON_ENABLE_ENTRY_PREFIX = true; // keep only in-label token icons by default
var CTX_ICON_ALLOWED_MODES = Object.freeze({
  active: true,
  selected: true,
  fixed: true,
  split: true
});
var CTX_ICON_REGISTRY = Object.freeze({
  preview: "assets/ctx-icons/preview.svg",
  editor: "assets/ctx-icons/editor.svg",
  browser: "assets/ctx-icons/browser.svg",
  filter: "assets/ctx-icons/filter.svg",
  arrow_ltr: "assets/ctx-icons/arrow_ltr.svg",
  arrow_rtl: "assets/ctx-icons/arrow_rtl.svg",
  arrow_ltr_rtl: "assets/ctx-icons/arrow_ltr_rtl.svg",
  arrow_c_ltr: "assets/ctx-icons/arrow_c_ltr.svg",
  arrow_c_rtl: "assets/ctx-icons/arrow_c_rtl.svg",
  arrow_c_ltr_rtl: "assets/ctx-icons/arrow_c_ltr_rtl.svg",
  icon_active: "assets/ctx-icons/icon_active.svg",
  icon_selected: "assets/ctx-icons/icon_selected.svg",
  family_link: "assets/ctx-icons/family_link.svg",
  family_unlink: "assets/ctx-icons/family_unlink.svg",
  link: "assets/ctx-icons/link.svg",
  unlink: "assets/ctx-icons/unlink.svg"
});
var CTX_ICON_TEMPLATE_CACHE = Object.create(null);
var CTX_ICON_LOADING_CACHE = Object.create(null);
var CTX_ICON_BASE_URL_CACHE = "";
var CTX_ICON_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var CTX_ICON_VAR_RE = /^var\(\s*--[A-Za-z0-9_-]+\s*(?:,\s*[^)]+)?\)$/;

function logCtxIcon(level, msg) {
  try {
    var pycmd = window && window.pycmd;
    if (typeof pycmd !== "function") return;
    var lv = String(level || "debug").toLowerCase();
    if (lv !== "info" && lv !== "warn" && lv !== "error" && lv !== "debug") lv = "debug";
    pycmd("log:" + lv + ":ctx icon " + String(msg || ""));
  } catch (_err) {
    // no-op
  }
}

function ctxCallEngine(name) {
  var gw = window && window.AjpcCityGateway;
  if (!gw || typeof gw.callEngine !== "function") return undefined;
  return gw.callEngine.apply(gw, arguments);
}

function ctxCallEngineGraph(methodName) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift(methodName);
  return ctxCallEngine.apply(null, args);
}

function isValidCtxIconColor(value) {
  var color = String(value || "").trim();
  if (!color) return false;
  return CTX_ICON_HEX_RE.test(color) || CTX_ICON_VAR_RE.test(color);
}

function normalizeCtxIconColor(value) {
  var color = String(value || "").trim();
  return isValidCtxIconColor(color) ? color : CTX_ICON_DEFAULT_COLOR;
}

function parseIconSpec(spec) {
  var raw = String(spec || "").trim();
  if (!raw) return null;
  var parts = raw.split(":");
  var key = String(parts[0] || "").trim();
  if (!key || !CTX_ICON_REGISTRY[key]) {
    logCtxIcon("warn", "invalid spec key=" + key + " spec=" + raw);
    return null;
  }
  var mode = String(parts.length > 1 ? parts[1] : "").trim().toLowerCase();
  if (!CTX_ICON_ALLOWED_MODES[mode] && mode) {
    logCtxIcon("debug", "invalid mode fallback key=" + key + " mode=" + mode);
  }
  if (!CTX_ICON_ALLOWED_MODES[mode]) mode = CTX_ICON_DEFAULT_MODE;
  var color = String(parts.length > 2 ? parts.slice(2).join(":") : "").trim();
  if (color && !isValidCtxIconColor(color)) {
    logCtxIcon("debug", "invalid color fallback key=" + key + " color=" + color);
  }
  color = normalizeCtxIconColor(color);
  return { key: key, mode: mode, color: color };
}

function discoverCtxIconBaseUrl() {
  if (CTX_ICON_BASE_URL_CACHE) return CTX_ICON_BASE_URL_CACHE;
  try {
    var scripts = document && document.getElementsByTagName ? document.getElementsByTagName("script") : [];
    var marker = "/adapters/city/ui/graph.city.ui.ctx.js";
    for (var i = 0; i < scripts.length; i += 1) {
      var src = String((scripts[i] && scripts[i].getAttribute && scripts[i].getAttribute("src")) || "");
      var idx = src.indexOf(marker);
      if (idx <= 0) continue;
      var baseRaw = src.slice(0, idx);
      var abs = String(new URL(baseRaw + "/", window.location.href));
      CTX_ICON_BASE_URL_CACHE = abs.replace(/\/+$/, "");
      logCtxIcon("debug", "base from script=" + CTX_ICON_BASE_URL_CACHE);
      return CTX_ICON_BASE_URL_CACHE;
    }
  } catch (err) {
    logCtxIcon("warn", "base discover script failed err=" + String(err || ""));
  }
  try {
    var links = document && document.querySelectorAll ? document.querySelectorAll("link[rel='stylesheet']") : [];
    for (var j = 0; j < links.length; j += 1) {
      var href = String((links[j] && links[j].getAttribute && links[j].getAttribute("href")) || "");
      var cut = href.indexOf("/graph.css");
      if (cut <= 0) continue;
      var cssBaseRaw = href.slice(0, cut);
      var cssAbs = String(new URL(cssBaseRaw + "/", window.location.href));
      CTX_ICON_BASE_URL_CACHE = cssAbs.replace(/\/+$/, "");
      logCtxIcon("debug", "base from css=" + CTX_ICON_BASE_URL_CACHE);
      return CTX_ICON_BASE_URL_CACHE;
    }
  } catch (err2) {
    logCtxIcon("warn", "base discover css failed err=" + String(err2 || ""));
  }
  return "";
}

function resolveCtxIconAssetUrl(key) {
  var rel = CTX_ICON_REGISTRY[key];
  if (!rel) return "";
  var base = discoverCtxIconBaseUrl();
  if (base) {
    var normalizedRel = String(rel).replace(/^\/+/, "");
    return base + "/" + normalizedRel;
  }
  try {
    return String(new URL(rel, window.location.href));
  } catch (_err) {
    logCtxIcon("warn", "asset url resolve fallback key=" + key + " rel=" + rel);
    return String(rel);
  }
}

function loadCtxIconTemplate(key) {
  if (!CTX_ICON_REGISTRY[key]) {
    logCtxIcon("warn", "missing registry key=" + String(key || ""));
    return Promise.resolve(null);
  }
  if (CTX_ICON_TEMPLATE_CACHE[key]) return Promise.resolve(CTX_ICON_TEMPLATE_CACHE[key]);
  if (CTX_ICON_LOADING_CACHE[key]) return CTX_ICON_LOADING_CACHE[key];
  var url = resolveCtxIconAssetUrl(key);
  logCtxIcon("debug", "load start key=" + key + " url=" + url);
  var task = fetch(url)
    .then(function (resp) {
      if (!resp || !resp.ok) {
        var status = resp ? String(resp.status) : "n/a";
        throw new Error("icon fetch failed status=" + status + " key=" + key + " url=" + url);
      }
      return resp.text();
    })
    .then(function (svgText) {
      var doc = new DOMParser().parseFromString(String(svgText || ""), "image/svg+xml");
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root || String(root.nodeName || "").toLowerCase() !== "svg") {
        logCtxIcon("warn", "invalid svg root key=" + key + " url=" + url);
        return null;
      }
      var imported = document.importNode(root, true);
      if (!imported || String(imported.nodeName || "").toLowerCase() !== "svg") {
        logCtxIcon("warn", "svg import failed key=" + key + " url=" + url);
        return null;
      }
      CTX_ICON_TEMPLATE_CACHE[key] = imported;
      logCtxIcon("debug", "load ok key=" + key + " url=" + url);
      return imported;
    })
    .catch(function (err) {
      logCtxIcon("error", "load failed key=" + key + " url=" + url + " err=" + String(err || ""));
      return null;
    })
    .finally(function () {
      delete CTX_ICON_LOADING_CACHE[key];
    });
  CTX_ICON_LOADING_CACHE[key] = task;
  return task;
}

function resolveCtxIconColor(candidate, fallback) {
  var raw = String(candidate || "").trim();
  if (isValidCtxIconColor(raw)) return raw;
  return normalizeCtxIconColor(fallback);
}

function resolveCtxIconColors(icon, ctxColorState) {
  var state = ctxColorState && typeof ctxColorState === "object" ? ctxColorState : {};
  var fallback = normalizeCtxIconColor(icon && icon.color);
  var familyFallback = resolveCtxIconColor(state.familyColor, fallbackLayerColor("families"));
  if (!icon) return { primary: fallback, secondary: fallback, family: familyFallback };
  if (icon.mode === "active") {
    var active = resolveCtxIconColor(state.activeColor, fallback);
    var activeFamily = resolveCtxIconColor(state.activeFamilyColor, familyFallback);
    return { primary: active, secondary: active, family: activeFamily };
  }
  if (icon.mode === "selected") {
    var selected = resolveCtxIconColor(state.selectedColor, fallback);
    var selectedFamily = resolveCtxIconColor(state.selectedFamilyColor, familyFallback);
    return { primary: selected, secondary: selected, family: selectedFamily };
  }
  if (icon.mode === "split") {
    var splitPrimary = resolveCtxIconColor(state.activeColor, fallback);
    var splitSecondary = resolveCtxIconColor(state.selectedColor, fallback);
    var splitFamily = resolveCtxIconColor(state.familyColor, fallback);
    return { primary: splitPrimary, secondary: splitSecondary, family: splitFamily };
  }
  return { primary: fallback, secondary: fallback, family: fallback };
}

function createCtxIconElement(iconSpec, ctxColorState) {
  var icon = parseIconSpec(iconSpec);
  if (!icon) return Promise.resolve(null);
  return loadCtxIconTemplate(icon.key).then(function (template) {
    if (!template) {
      logCtxIcon("warn", "template missing key=" + icon.key + " spec=" + String(iconSpec || ""));
      return null;
    }
    var svg = template.cloneNode(true);
    if (!svg || !svg.classList) {
      logCtxIcon("warn", "clone failed key=" + icon.key);
      return null;
    }
    svg.classList.add("ctx-icon-base", "ctx-icon--" + icon.key);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var colors = resolveCtxIconColors(icon, ctxColorState);
    svg.style.setProperty("--ctx-icon-primary", colors.primary);
    svg.style.setProperty("--ctx-icon-secondary", colors.secondary);
    svg.style.setProperty("--ctx-icon-family", colors.family);
    return svg;
  });
}

function appendCtxIcon(container, iconSpec, ctxColorState) {
  if (!container) return;
  var icon = parseIconSpec(iconSpec);
  if (!icon) {
    logCtxIcon("warn", "icon skipped spec=" + String(iconSpec || ""));
    return;
  }
  var placeholder = document.createElement("span");
  placeholder.className = "ctx-icon-placeholder";
  container.appendChild(placeholder);
  createCtxIconElement(iconSpec, ctxColorState).then(function (svg) {
    if (!svg || !placeholder.parentNode) {
      logCtxIcon("warn", "icon render skipped key=" + icon.key + " spec=" + String(iconSpec || ""));
      if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      return;
    }
    placeholder.parentNode.replaceChild(svg, placeholder);
  });
}

function shouldRenderCtxEntryPrefixIcon(entry) {
  if (!entry || typeof entry !== "object") return CTX_ICON_ENABLE_ENTRY_PREFIX;
  if (entry.prefixIcon === true) return true;
  if (entry.prefixIcon === false) return false;
  return CTX_ICON_ENABLE_ENTRY_PREFIX;
}

function parseInlineIconToken(token) {
  var raw = String(token || "");
  if (!raw) return null;
  var trimmed = raw.trim();
  if (!trimmed) return null;
  var m = /^(.+?)([.,;!?)]*)$/.exec(trimmed);
  var core = m && m[1] ? String(m[1]) : trimmed;
  var trailing = m && m[2] ? String(m[2]) : "";
  var key = String(core.split(":")[0] || "").trim();
  if (!key || !CTX_ICON_REGISTRY[key]) return null;
  var parsed = parseIconSpec(core);
  if (!parsed) return null;
  return { spec: core, trailing: trailing };
}

function appendLabelWithCtxIcons(container, label, ctxColorState) {
  var chunks = String(label || "").split(/(\s+)/g);
  chunks.forEach(function (chunk) {
    if (!chunk) return;
    if (/^\s+$/.test(chunk)) {
      container.appendChild(document.createTextNode(chunk));
      return;
    }
    var inlineIcon = parseInlineIconToken(chunk);
    if (inlineIcon) {
      appendCtxIcon(container, inlineIcon.spec, ctxColorState);
      if (inlineIcon.trailing) container.appendChild(document.createTextNode(inlineIcon.trailing));
      return;
    }
    container.appendChild(document.createTextNode(chunk));
  });
}

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

function contextFamilyHubColor(node) {
  if (!node) return "";
  if (String(node.kind || "") !== "family") return "";
  return contextNodeColor(node);
}

function resolveContextFamilyColor(selectedNode, contextNode) {
  var activeFamilyColor = contextFamilyHubColor(selectedNode);
  if (activeFamilyColor) return activeFamilyColor;
  var selectedFamilyColor = contextFamilyHubColor(contextNode);
  if (selectedFamilyColor) return selectedFamilyColor;
  return fallbackLayerColor("families");
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

function normalizeFamilyIdForCtx(value) {
  var out = String(value || "").trim();
  try {
    if (out && typeof out.normalize === "function") out = out.normalize("NFC");
  } catch (_e0) {}
  return out;
}

function validateFamilyIdRenameInputForCtx(oldFid, newFid, separator) {
  var oldNorm = normalizeFamilyIdForCtx(oldFid);
  var newNorm = normalizeFamilyIdForCtx(newFid);
  var sep = String(separator || ";");
  if (!oldNorm) return { ok: false, error: "Old Family ID is required", old_fid: oldNorm, new_fid: newNorm };
  if (!newNorm) return { ok: false, error: "New Family ID is required", old_fid: oldNorm, new_fid: newNorm };
  if (oldNorm === newNorm) return { ok: false, error: "Old and new Family IDs must be different", old_fid: oldNorm, new_fid: newNorm };
  if (newNorm.indexOf("@") >= 0) return { ok: false, error: "New Family ID must not contain '@'", old_fid: oldNorm, new_fid: newNorm };
  if (sep && newNorm.indexOf(sep) >= 0) return { ok: false, error: "New Family ID must not contain '" + sep + "'", old_fid: oldNorm, new_fid: newNorm };
  return { ok: true, error: "", old_fid: oldNorm, new_fid: newNorm };
}

function showFamilyIdEditDialogForCtx(oldFid, pycmd, showToast) {
  var oldNorm = normalizeFamilyIdForCtx(oldFid);
  if (!oldNorm) {
    if (typeof showToast === "function") showToast("Missing family id");
    return;
  }
  var overlay = byId("ctx-picker");
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);

  overlay = document.createElement("div");
  overlay.id = "ctx-picker";
  overlay.setAttribute("data-mode", "famedit");
  overlay.setAttribute("data-old-fid", oldNorm);
  overlay.setAttribute("data-preview-ready", "0");
  overlay.setAttribute("data-pending-kind", "");
  overlay.setAttribute("data-pending-old", "");
  overlay.setAttribute("data-pending-new", "");

  var dialog = document.createElement("div");
  dialog.className = "dialog";

  var heading = document.createElement("div");
  heading.className = "title";
  heading.textContent = "Edit Family ID";

  var list = document.createElement("div");
  list.className = "list";

  var oldRow = document.createElement("div");
  oldRow.className = "row";
  oldRow.textContent = "Old Family ID: " + oldNorm;

  var newRow = document.createElement("label");
  newRow.className = "row";
  var newLabel = document.createElement("span");
  newLabel.textContent = "New Family ID:";
  var newInput = document.createElement("input");
  newInput.type = "text";
  newInput.value = "";
  newInput.placeholder = "Enter new family id";
  newInput.style.flex = "1 1 auto";
  newInput.style.minWidth = "0";
  newInput.style.padding = "6px 8px";
  newInput.style.borderRadius = "8px";
  newInput.style.border = "1px solid var(--border-100)";
  newInput.style.background = "var(--bg-chip-200)";
  newInput.style.color = "var(--text-main)";
  newRow.appendChild(newLabel);
  newRow.appendChild(newInput);

  var statusRow = document.createElement("div");
  statusRow.className = "row";
  statusRow.style.display = "block";
  statusRow.style.opacity = "0.9";
  statusRow.textContent = "Step 1: Enter new ID and run Preview.";

  var summaryRow = document.createElement("div");
  summaryRow.className = "row";
  summaryRow.style.display = "block";
  summaryRow.style.opacity = "0.9";
  summaryRow.textContent = "";

  list.appendChild(oldRow);
  list.appendChild(newRow);
  list.appendChild(statusRow);
  list.appendChild(summaryRow);

  var btnRow = document.createElement("div");
  btnRow.className = "btn-row";

  var cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  var previewBtn = document.createElement("button");
  previewBtn.className = "btn";
  previewBtn.type = "button";
  previewBtn.textContent = "Preview";

  var applyBtn = document.createElement("button");
  applyBtn.className = "btn primary";
  applyBtn.type = "button";
  applyBtn.textContent = "Apply";
  applyBtn.disabled = true;

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(previewBtn);
  btnRow.appendChild(applyBtn);

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

  previewBtn.addEventListener("click", function () {
    var v = validateFamilyIdRenameInputForCtx(oldNorm, newInput.value, ";");
    if (!v.ok) {
      overlay.setAttribute("data-preview-ready", "0");
      applyBtn.disabled = true;
      statusRow.textContent = v.error;
      summaryRow.textContent = "";
      return;
    }
    if (typeof pycmd !== "function") {
      statusRow.textContent = "Bridge unavailable";
      return;
    }
    overlay.setAttribute("data-preview-ready", "0");
    overlay.setAttribute("data-pending-kind", "preview");
    overlay.setAttribute("data-pending-old", v.old_fid);
    overlay.setAttribute("data-pending-new", v.new_fid);
    applyBtn.disabled = true;
    statusRow.textContent = "Preview running...";
    summaryRow.textContent = "";
    pycmd("ctx:famedit_preview:" + encodeURIComponent(JSON.stringify({
      old_fid: v.old_fid,
      new_fid: v.new_fid
    })));
  });

  applyBtn.addEventListener("click", function () {
    var v = validateFamilyIdRenameInputForCtx(oldNorm, newInput.value, ";");
    if (!v.ok) {
      overlay.setAttribute("data-preview-ready", "0");
      applyBtn.disabled = true;
      statusRow.textContent = v.error;
      return;
    }
    var previewReady = overlay.getAttribute("data-preview-ready") === "1";
    var previewOld = String(overlay.getAttribute("data-preview-old") || "");
    var previewNew = String(overlay.getAttribute("data-preview-new") || "");
    if (!previewReady || previewOld !== v.old_fid || previewNew !== v.new_fid) {
      statusRow.textContent = "Run Preview first before Apply.";
      applyBtn.disabled = true;
      return;
    }
    if (typeof pycmd !== "function") {
      statusRow.textContent = "Bridge unavailable";
      return;
    }
    overlay.setAttribute("data-pending-kind", "apply");
    overlay.setAttribute("data-pending-old", v.old_fid);
    overlay.setAttribute("data-pending-new", v.new_fid);
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    statusRow.textContent = "Applying rename...";
    pycmd("ctx:famedit_apply:" + encodeURIComponent(JSON.stringify({
      old_fid: v.old_fid,
      new_fid: v.new_fid
    })));
  });

  newInput.addEventListener("input", function () {
    overlay.setAttribute("data-preview-ready", "0");
    applyBtn.disabled = true;
    previewBtn.disabled = false;
    statusRow.textContent = "Step 1: Enter new ID and run Preview.";
    summaryRow.textContent = "";
  });

  overlay.addEventListener("click", function (evt) {
    if (evt.target === overlay) close();
  });

  newInput.focus();
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
  var showToast = ctx.showToast || function () { };
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
      iconSpec: "preview",
      cb: function () { showToast("Open preview"); if (pycmd) pycmd("ctx:preview:" + node.id); }
    });
    openGroup.push({
      label: "Open Editor",
      iconSpec: "editor",
      cb: function () { showToast("Open editor"); openEditorViaApi(node.id); }
    });
    openGroup.push({
      label: "Open Browser",
      iconSpec: "browser",
      cb: function () { showToast("Open browser"); if (pycmd) pycmd("ctx:browser:" + node.id); }
    });
  } else if (isNodeNoteTypeHub) {
    openGroup.push({
      label: "Open Browser by Mass Linker Tag",
      iconSpec: "browser",
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

  var familyEditGroup = [];
  if (isNodeFamily) {
    familyEditGroup.push({
      label: "Edit Family ID...",
      iconSpec: "family_link",
      cb: function () {
        var hubFid = getPrimaryFamily(node);
        if (!hubFid) {
          showToast("Missing family id");
          return;
        }
        showFamilyIdEditDialogForCtx(hubFid, pycmd, showToast);
      }
    });
  }
  groups.push(familyEditGroup);

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
          label: "Add Family: from active arrow_ltr:active to selected",
          iconSpec: "family_link",
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
        connectGroup.push({ 
          label: "Add selected to Family", 
          iconSpec: "family_link", 
          cb: doConnectWithMode("Select hub families", "hub_zero") 
        });
      } else if (selectedKind === "note") {
        connectGroup.push({ 
          label: "Add Family[+1]: to active arrow_rtl:fixed:#f72a2a from selected", 
          iconSpec: "family_link", 
          cb: doConnectWithMode("Select families to connect", "") 
        });
        connectGroup.push({ 
          label: "Add Family: to active arrow_rtl:fixed:#f72a2a from selected", 
          iconSpec: "family_link", 
          cb: doConnectWithMode("Select families to connect", "same") 
        });
        if (hasPositiveFamilyPrioForCtx(selectedNode)) {
          connectGroup.push({ 
            label: "Add Family[-1]: to active arrow_rtl:fixed:#f72a2a from selected", 
            iconSpec: "family_link", 
            cb: doConnectWithMode("Select families to connect", "minus1") 
          });
        }
        connectGroup.push({
          label: "Add Family: from active arrow_ltr:active to selected",
          iconSpec: "family_link",
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
          ? "Remove from Family"
          : (isNodeFamily && isSelectedNote)
            ? "Remove from Family"
            : isSelectedFamily
              ? "Remove Family from selected"
              : "Remove Family from selected",
        iconSpec: "family_unlink",
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
        label: "Append Link: to active arrow_rtl:fixed:#f72a2a from selected",
        iconSpec: "link",
        cb: function () {
          showToast("Append link");
          var payload = { source: String(menuSelectedId), target: String(node.id), label: selectedNode.label || "" };
          if (pycmd) pycmd("ctx:link:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (activeLinked && !linkInfo.ab) {
      appendItems.push({
        label: "Append Link: from active arrow_ltr:active to selected",
        iconSpec: "link",
        cb: function () {
          showToast("Append link");
          var payload = { source: String(node.id), target: String(menuSelectedId), label: node.label || "" };
          if (pycmd) pycmd("ctx:link_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (targetLinked && activeLinked && !linkInfo.ab && !linkInfo.ba) {
      appendItems.push({
        label: "Append Link: on both arrow_ltr_rtl:split to both",
        iconSpec: "link",
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
        label: "Remove Link: to active arrow_c_rtl:fixed:#f72a2a from selected",
        iconSpec: "unlink",
        cb: function () {
          showToast("Remove link");
          var payload = { source: String(menuSelectedId), target: String(node.id) };
          if (pycmd) pycmd("ctx:unlink:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && selLinked) {
      removeGroup.push({
        label: "Remove Link: from active arrow_c_ltr:active to selected",
        iconSpec: "unlink",
        cb: function () {
          showToast("Remove link");
          var payload = { source: String(node.id), target: String(menuSelectedId) };
          if (pycmd) pycmd("ctx:unlink_active:" + encodeURIComponent(JSON.stringify(payload)));
        }
      });
    }
    if (linkInfo.ab && linkInfo.ba && nodeLinked && selLinked) {
      removeGroup.push({
        label: "Remove Link: on both arrow_c_ltr_rtl:split to both",
        iconSpec: "unlink",
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
      iconSpec: "filter",
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
    var gw = window && window.AjpcCityGateway;
    if (gw && typeof gw.callEngine === "function") {
      gw.callEngine("applyVisualStyles", 0.08);
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
  var activeFamilyColor = contextFamilyHubColor(selectedNode);
  var selectedFamilyColor = contextFamilyHubColor(node);
  var iconColorState = {
    activeColor: selectedNode ? contextNodeColor(selectedNode) : "",
    selectedColor: contextNodeColor(node),
    activeFamilyColor: activeFamilyColor,
    selectedFamilyColor: selectedFamilyColor,
    familyColor: resolveContextFamilyColor(selectedNode, node)
  };
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

  Object.keys(CTX_ICON_REGISTRY).forEach(function (key) {
    loadCtxIconTemplate(key);
  });

  function addItem(entry) {
    if (!entry || typeof entry.cb !== "function") return;
    var label = entry.label;
    var div = document.createElement("div");
    div.className = "item";
    if (shouldRenderCtxEntryPrefixIcon(entry) && entry.iconSpec) appendCtxIcon(div, entry.iconSpec, iconColorState);
    appendLabelWithCtxIcons(div, label, iconColorState);
    div.addEventListener("click", function () {
      try {
        entry.cb();
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
      addItem(entry);
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
    addItem({
      label: "Unpin Node",
      iconSpec: "icon_active:fixed:#ef4444",
      cb: function () {
        node.fx = null;
        node.fy = null;
        ctxCallEngineGraph("start");
        showCtxMessage("Node unpinned");
      }
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

window.onCtxFamilyEditPreviewResult = function (result) {
  var overlay = byId("ctx-picker");
  if (!overlay || overlay.getAttribute("data-mode") !== "famedit") return;
  var pendingKind = String(overlay.getAttribute("data-pending-kind") || "");
  if (pendingKind !== "preview") return;

  var out = result && typeof result === "object" ? result : {};
  var oldFid = normalizeFamilyIdForCtx(out.old_fid || "");
  var newFid = normalizeFamilyIdForCtx(out.new_fid || "");
  var expectedOld = String(overlay.getAttribute("data-pending-old") || "");
  var expectedNew = String(overlay.getAttribute("data-pending-new") || "");
  if (oldFid !== expectedOld || newFid !== expectedNew) return;
  overlay.setAttribute("data-pending-kind", "");

  var dialog = overlay.querySelector(".dialog");
  if (!dialog) return;
  var rows = dialog.querySelectorAll(".list .row");
  if (!rows || rows.length < 4) return;
  var statusRow = rows[2];
  var summaryRow = rows[3];
  var applyBtn = dialog.querySelector(".btn.primary");
  if (!statusRow || !summaryRow || !applyBtn) return;

  if (!out.ok) {
    overlay.setAttribute("data-preview-ready", "0");
    applyBtn.disabled = true;
    statusRow.textContent = String(out.error || "Preview failed");
    summaryRow.textContent = "";
    return;
  }

  var affected = Number(out.affected_notes || 0);
  var scanned = Number(out.scanned_notes || 0);
  var collisions = Number(out.collisions || 0);
  overlay.setAttribute("data-preview-ready", affected > 0 ? "1" : "0");
  overlay.setAttribute("data-preview-old", oldFid);
  overlay.setAttribute("data-preview-new", newFid);
  applyBtn.disabled = !(affected > 0);
  statusRow.textContent = affected > 0
    ? "Step 2: Confirm Apply."
    : "No matching notes found.";
  summaryRow.textContent =
    "Affected notes: " + String(affected)
    + " | Collisions: " + String(collisions)
    + " | Scanned: " + String(scanned);
};

window.onCtxFamilyEditApplyResult = function (result) {
  var overlay = byId("ctx-picker");
  if (!overlay || overlay.getAttribute("data-mode") !== "famedit") return;
  var pendingKind = String(overlay.getAttribute("data-pending-kind") || "");
  if (pendingKind !== "apply") return;

  var out = result && typeof result === "object" ? result : {};
  var oldFid = normalizeFamilyIdForCtx(out.old_fid || "");
  var newFid = normalizeFamilyIdForCtx(out.new_fid || "");
  var expectedOld = String(overlay.getAttribute("data-pending-old") || "");
  var expectedNew = String(overlay.getAttribute("data-pending-new") || "");
  if (oldFid !== expectedOld || newFid !== expectedNew) return;
  overlay.setAttribute("data-pending-kind", "");

  var dialog = overlay.querySelector(".dialog");
  if (!dialog) return;
  var rows = dialog.querySelectorAll(".list .row");
  if (!rows || rows.length < 4) return;
  var statusRow = rows[2];
  var summaryRow = rows[3];
  var previewBtn = dialog.querySelector(".btn-row .btn:nth-child(2)");
  var applyBtn = dialog.querySelector(".btn.primary");
  if (previewBtn) previewBtn.disabled = false;

  if (!out.ok) {
    overlay.setAttribute("data-preview-ready", "0");
    if (applyBtn) applyBtn.disabled = true;
    statusRow.textContent = String(out.error || "Apply failed");
    return;
  }

  var changed = Number(out.changed_notes || 0);
  var collisions = Number(out.collisions || 0);
  var scanned = Number(out.scanned_notes || 0);
  summaryRow.textContent =
    "Changed notes: " + String(changed)
    + " | Collisions: " + String(collisions)
    + " | Scanned: " + String(scanned);
  showCtxMessage(
    changed > 0
      ? ("Family ID renamed: " + oldFid + " -> " + newFid + " (" + String(changed) + " notes)")
      : "Family ID rename: no changes"
  );
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
};

window.hideContextMenu = hideContextMenu;

