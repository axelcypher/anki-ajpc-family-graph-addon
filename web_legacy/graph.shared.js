(function () {
  "use strict";

  function nowMs() {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  var toastContainer = null;

  function getToastContainer() {
    if (toastContainer && toastContainer.parentNode) return toastContainer;
    toastContainer = document.getElementById("toast-container");
    return toastContainer;
  }

  function showToast(text, ttl) {
    var container = getToastContainer();
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

  function debugUI(label) {
    if (!window.DebugUIEnabled) return;
    debugToast("ui " + label, "ui", null, "debug");
  }

  var DEBUG_SPAM_LIMIT = 10;
  var DEBUG_SPAM_WINDOW_MS = 1000;
  var DEBUG_SPAM_COOLDOWN_MS = 10000;
  var debugSpamState = {};
  function shouldSuppressDebugSpam(text, level) {
    if (!text) return false;
    var lvl = (level || "trace").toLowerCase();
    var key = lvl + "|" + String(text);
    var now = nowMs();
    var state = debugSpamState[key];
    if (!state) {
      state = { last: 0, count: 0, cooldownUntil: 0 };
      debugSpamState[key] = state;
    }
    if (state.cooldownUntil && now < state.cooldownUntil) return true;
    if (now - state.last <= DEBUG_SPAM_WINDOW_MS) {
      state.count += 1;
    } else {
      state.count = 1;
    }
    state.last = now;
    if (state.count >= DEBUG_SPAM_LIMIT) {
      state.cooldownUntil = now + DEBUG_SPAM_COOLDOWN_MS;
      state.count = 0;
      return true;
    }
    return false;
  }

  function isDebugLevelEnabled(level) {
    var lvl = (level || "trace").toLowerCase();
    var map = window.GraphDebugLevels;
    if (!map || typeof map !== "object") return true;
    if (!Object.prototype.hasOwnProperty.call(map, lvl)) return true;
    return !!map[lvl];
  }

  function isDebugCategoryEnabled(cat, level) {
    if (!window.DebugEnabled) return false;
    if (window.GraphDebugToastsEnabled === false) return false;
    if (!isDebugLevelEnabled(level)) return false;
    if (!cat) return true;
    var map = window.GraphDebugCategories;
    if (!map || typeof map !== "object") return true;
    if (!Object.prototype.hasOwnProperty.call(map, cat)) return true;
    return !!map[cat];
  }

  function debugToast(text, cat, ttl, level) {
    var lvl = level || "trace";
    if (!isDebugCategoryEnabled(cat, lvl)) return;
    if (shouldSuppressDebugSpam(text, lvl)) return;
    if (window.DebugToast) {
      if (typeof window.DebugToast.log === "function") {
        window.DebugToast.log(lvl, text, { ttl: ttl, target: "frontend" });
        return;
      }
      if (typeof window.DebugToast.show === "function") {
        window.DebugToast.show(text, ttl, "", "frontend", lvl);
      }
    }
  }

  function debugIf(cat, label, cond, level) {
    debugToast(label + " => " + (cond ? "true" : "false"), cat, null, level || "trace");
    return cond;
  }

  function debugSeparator(cat, level, target) {
    var lvl = level || "trace";
    if (!isDebugCategoryEnabled(cat, lvl)) return;
    if (window.DebugToast && typeof window.DebugToast.separator === "function") {
      window.DebugToast.separator(lvl, target || "frontend");
      return;
    }
    if (window.DebugToast && typeof window.DebugToast.show === "function") {
      window.DebugToast.show("--------------------------------", null, "debug-toast-sep", target || "frontend", lvl);
    }
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
    if (layer === "mass_linker") return "#f59e0b";
    if (layer === "example") return "#a78bfa";
    if (layer === "kanji") return "#f87171";
    return "#9ca3af";
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

  function getNodeFamilyMap(n) {
    if (!n) return null;
    var map = n.family_prios && typeof n.family_prios === "object" ? n.family_prios : null;
    return map;
  }

  function getNodeFamilies(n) {
    if (!n) return [];
    if (Array.isArray(n.families) && n.families.length) {
      return n.families.slice(0);
    }
    var map = getNodeFamilyMap(n);
    return map ? Object.keys(map) : [];
  }

  function hasPositiveFamilyPrio(n) {
    var map = getNodeFamilyMap(n);
    if (!map) return false;
    return Object.keys(map).some(function (k) {
      var v = map[k];
      return typeof v === "number" && isFinite(v) && v > 0;
    });
  }

  function linkIds(l) {
    var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
    var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
    return { s: String(s), t: String(t) };
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

  function assignLinkCurves(links, baseCurveFn) {
    if (debugIf("sim_links", "assignLinkCurves: no links", !Array.isArray(links) || !links.length)) return;
    debugToast("assignLinkCurves: start", "sim_links");
    var pairMap = {};
    var flowOnly = [];
    links.forEach(function (l) {
      if (!l) return;
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
        var base = typeof baseCurveFn === "function" ? baseCurveFn(arr[i].layer) : 0;
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
  }

  function wrapLabelLines(ctx, text, maxWidth) {
    if (!text) return [];
    var tokens = text.split(/\s+/).filter(function (t) { return t.length; });
    if (!tokens.length) tokens = [text];
    var lines = [];
    var cur = "";
    function breakToken(token) {
      var out = [];
      var acc = "";
      for (var i = 0; i < token.length; i++) {
        var ch = token[i];
        var trial = acc + ch;
        if (ctx.measureText(trial).width > maxWidth && acc.length) {
          out.push(acc);
          acc = ch;
        } else {
          acc = trial;
        }
      }
      if (acc) out.push(acc);
      return out;
    }
    tokens.forEach(function (token) {
      if (!cur) {
        if (ctx.measureText(token).width <= maxWidth) {
          cur = token;
        } else {
          var parts = breakToken(token);
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
          var parts2 = breakToken(token);
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

  function buildContextMenuGroups(ctx) {
    ctx = ctx || {};
    var node = ctx.node;
    if (!node) return [];
    var selectedNode = ctx.selectedNode || null;
    var selectedKind = ctx.selectedKind || (selectedNode ? selectedNode.kind || "" : "");
    var menuSelectedId = ctx.menuSelectedId || (selectedNode ? String(selectedNode.id) : "");
    var noteTypeLinkedField = ctx.noteTypeLinkedField || {};
    var links = ctx.links || [];
    var showToast = ctx.showToast || function () {};
    var pycmd = ctx.pycmd || null;
    var showFamilyPicker = ctx.showFamilyPicker || null;
    var ctxDot = ctx.ctxDot || null;

    function getPrimaryFamily(n) {
      if (!n) return "";
      if (n.kind === "family") {
        return n.label || String(n.id).replace("family:", "");
      }
      var fams = getNodeFamilies(n);
      if (fams.length) return String(fams[0]);
      return "";
    }

    function getSharedFamilies(a, b) {
      if (!a || !b) return [];
      var famA = getNodeFamilies(a);
      var famB = getNodeFamilies(b);
      if (!famA.length || !famB.length) return [];
      var set = {};
      famA.forEach(function (f) {
        set[String(f)] = true;
      });
      var out = [];
      famB.forEach(function (f) {
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

    var groups = [];
    var openGroup = [];
    var isNodeNoteTypeHub = node && node.kind === "note_type_hub";
    if (node.kind === "note") {
      openGroup.push({
        label: "Open Preview",
        cb: function () {
          showToast("Open preview");
          if (pycmd) pycmd("ctx:preview:" + node.id);
        },
      });
      if (ctxDot && ctxDot.cardId) {
        openGroup.push({
          label: "Open Card in Preview",
          cb: function () {
            showToast("Open card preview");
            if (pycmd) pycmd("ctx:previewcard:" + ctxDot.cardId);
          },
        });
      }
      openGroup.push({
        label: "Open Editor",
        cb: function () {
          showToast("Open editor");
          if (pycmd) pycmd("ctx:edit:" + node.id);
        },
      });
      openGroup.push({
        label: "Open Browser",
        cb: function () {
          showToast("Open browser");
          if (pycmd) pycmd("ctx:browser:" + node.id);
        },
      });
    } else if (isNodeNoteTypeHub) {
      openGroup.push({
        label: "Open Browser by Mass Linker Tag",
        cb: function () {
          var tag = "";
          var rawId = String(node.id || "");
          if (rawId.indexOf("autolink:") === 0) {
            tag = rawId.slice("autolink:".length);
          }
          tag = (tag || "").trim();
          if (!tag) {
            showToast("Missing Mass Linker tag");
            return;
          }
          showToast("Open browser");
          if (pycmd) pycmd("ctx:browsertag:" + encodeURIComponent(tag));
        },
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
    if (selectedNode && isDifferent && isNodeNote) {
      var canConnect =
        selectedKind === "family" ||
        (selectedKind === "note" &&
          getNodeFamilies(selectedNode).length);
      if (selectedKind === "kanji" || selectedKind === "kanji_hub") {
        canConnect = false;
      }
      if (canConnect) {
        function doConnectWithMode(title, mode) {
          return function () {
            function doConnect(families) {
              if (Array.isArray(families) && families.length === 0) {
                showToast("Select at least one family");
                return;
              }
              showToast("Connect family");
              var payload = {
                source: String(menuSelectedId),
                target: String(node.id),
                source_kind: selectedKind,
                source_label: selectedNode.label || "",
                prio_mode: mode || "",
              };
              if (families) payload.families = families;
              if (pycmd) {
                pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
              }
            }
            var selectedFamilies = getNodeFamilies(selectedNode);
            if (selectedKind === "note" && selectedFamilies.length > 1) {
              if (showFamilyPicker) {
                showFamilyPicker(title, selectedFamilies, doConnect);
              } else {
                doConnect(selectedFamilies || []);
              }
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
            label: "Connect selected to Family",
            cb: doConnectWithMode("Select hub families", "hub_zero"),
          });
        } else if (selectedKind === "note") {
          connectGroup.push({
            label: "Connect selected: to active Family@+1",
            cb: doConnectWithMode("Select families to connect", ""),
          });
          connectGroup.push({
            label: "Connect selected to: active Family",
            cb: doConnectWithMode("Select families to connect", "same"),
          });
          if (hasPositiveFamilyPrio(selectedNode)) {
            connectGroup.push({
              label: "Connect selected: to active Family@-1",
              cb: doConnectWithMode("Select families to connect", "minus1"),
            });
          }
          if (node && node.kind === "note") {
            connectGroup.push({
              label: "Connect active to: selected Family",
              cb: function () {
                var families = getNodeFamilies(node);
                if (!families.length) {
                  showToast("No family on selected");
                  return;
                }
                function doConnectFromSelected(fams) {
                  if (Array.isArray(fams) && fams.length === 0) {
                    showToast("Select at least one family");
                    return;
                  }
                  showToast("Connect family");
                  var payload = {
                    source: String(node.id),
                    target: String(menuSelectedId),
                    source_kind: "note",
                    source_label: node.label || "",
                    prio_mode: "hub_zero",
                  };
                  if (Array.isArray(fams)) payload.families = fams;
                  if (pycmd) {
                    pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
                  }
                }
                if (families.length > 1 && showFamilyPicker) {
                  showFamilyPicker("Select families to connect", families, doConnectFromSelected);
                } else {
                  doConnectFromSelected(families);
                }
              },
            });
          }
        }
      }
    }
    if (selectedNode && isDifferent && isNodeFamily && isSelectedNote) {
      var hubFid2 = node.label || String(node.id).replace("family:", "");
      var activeFamilies = getNodeFamilies(selectedNode).map(function (f) { return String(f); });
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
            if (pycmd) {
              pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
            }
          },
        });
        connectGroup.push({
          label: "Connect active to: selected Family",
          cb: function () {
            showToast("Connect family");
            var payload = {
              source: String(node.id),
              target: String(menuSelectedId),
              source_kind: "family",
              source_label: hubFid2,
              prio_mode: "hub_zero",
            };
            if (pycmd) {
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
            if (pycmd) {
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
            if (pycmd) {
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
            if (pycmd) {
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
        var activeFamilies2 = getNodeFamilies(selectedNode).map(function (f) { return String(f); });
        if (hubFid && activeFamilies2.indexOf(String(hubFid)) >= 0) {
          sharedFamilies = [hubFid];
        } else {
          sharedFamilies = [];
        }
      } else {
        sharedFamilies = isSame
          ? getNodeFamilies(node).slice(0)
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
              if (pycmd) {
                pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
              }
            }
            if (sharedFamilies.length > 1 && isSelectedNote) {
              if (showFamilyPicker) {
                showFamilyPicker("Select families to disconnect", sharedFamilies, doDisconnect);
              } else {
                doDisconnect(sharedFamilies);
              }
            } else {
              doDisconnect(sharedFamilies);
            }
          },
        });
      }
      if (isSelectedNote && isNodeNote && isDifferent) {
        var selectedFamilies = getNodeFamilies(node);
        if (selectedFamilies.length) {
          disconnectGroup.push({
            label: "Disconnect active from: selected Family",
            cb: function () {
              function doDisconnectFromSelected(families) {
                showToast("Disconnect family");
                var payload = {
                  source: String(node.id),
                  target: String(menuSelectedId),
                  source_kind: "note",
                  source_label: node.label || "",
                };
                if (families && families.length) {
                  payload.families = families;
                }
                if (pycmd) {
                  pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
                }
              }
              if (selectedFamilies.length > 1 && showFamilyPicker) {
                showFamilyPicker("Select families to disconnect", selectedFamilies, doDisconnectFromSelected);
              } else {
                doDisconnectFromSelected(selectedFamilies);
              }
            },
          });
        }
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
            if (pycmd) {
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
            if (pycmd) {
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
            if (pycmd) {
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
    } else {
      families = getNodeFamilies(node).slice(0, 20);
    }
    families.forEach(function (fid) {
      filterGroup.push({
        label: "Filter Family: " + fid,
        cb: function () {
          showToast("Filter family");
          if (pycmd) pycmd("ctx:filter:" + encodeURIComponent(fid));
        },
      });
    });
    groups.push(filterGroup);

    return groups;
  }

  window.GraphShared = {
    nowMs: nowMs,
    randBetween: randBetween,
    showToast: showToast,
    showMsg: showMsg,
    debugUI: debugUI,
    debugToast: debugToast,
    debugIf: debugIf,
    debugSeparator: debugSeparator,
    colorWithAlpha: colorWithAlpha,
    parseColor: parseColor,
    mixWithWhite: mixWithWhite,
    prioColor: prioColor,
    layerColor: layerColor,
    applyDim: applyDim,
    linkIds: linkIds,
    curveControlPoint: curveControlPoint,
    drawLinkPath: drawLinkPath,
    assignLinkCurves: assignLinkCurves,
    wrapLabelLines: wrapLabelLines,
    buildContextMenuGroups: buildContextMenuGroups,
  };
})();
