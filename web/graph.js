(function () {
  function log(msg) {
    try {
      if (window.pycmd) {
        pycmd("log:" + msg);
      }
    } catch (_e) {}
  }

  function showToast(text, ttl) {
    var container = document.getElementById("toast-container");
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

  window.onerror = function (msg, _src, line, col) {
    showMsg("JS error: " + msg + " @ " + line + ":" + col);
    log("js error: " + msg + " @ " + line + ":" + col);
  };

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
    if (layer === "example") return "#a78bfa";
    if (layer === "kanji") return "#f87171";
    return "#9ca3af";
  }

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
    return prioColor(node.prio);
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

    var layerState = {
      family: document.getElementById("layer-family"),
      family_hub: document.getElementById("layer-family-hub"),
      reference: document.getElementById("layer-reference"),
      example: document.getElementById("layer-example"),
      kanji: document.getElementById("layer-kanji"),
    };

    var physicsDefaults = {
      charge: -80,
      link_distance: 30,
      link_strength: 1,
      velocity_decay: 0.35,
      alpha_decay: 0.02,
      cooldown_ticks: 80,
      warmup_ticks: 0,
      max_radius: 1400,
    };
    var physics = {};

    var noteTypeMeta = (data.meta && data.meta.note_types) || [];
    var visibleNoteTypes = {};
    var noteTypeColors = {};
    var noteTypeLinkedField = {};

    var layerColors = (data.meta && data.meta.layer_colors) || {};
    var layerStyles = (data.meta && data.meta.layer_styles) || {};
    var layerFlow = (data.meta && data.meta.layer_flow) || {};
    var flowSpeed = (data.meta && data.meta.layer_flow_speed) || 0.02;
    var autoRefOpacity =
      data.meta && data.meta.reference_auto_opacity !== undefined
        ? data.meta.reference_auto_opacity
        : 1.0;
      var showUnlinked =
      data.meta && data.meta.show_unlinked !== undefined
        ? !!data.meta.show_unlinked
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
    });

    var nodes = (data.nodes || []).map(function (n) {
      var copy = {};
      for (var k in n) copy[k] = n[k];
      copy.x = copy.x || Math.random() * 800;
      copy.y = copy.y || Math.random() * 600;
      return copy;
    });
    var links = (data.edges || []).map(function (e) {
      var copy = {};
      for (var k in e) copy[k] = e[k];
      return copy;
    });
    (function logLinkStats() {
      var refAuto = 0;
      var refManual = 0;
      links.forEach(function (l) {
        if (l.layer !== "reference") return;
        if (l.meta && l.meta.manual) refManual += 1;
        else refAuto += 1;
      });
      log(
        "links reference auto=" +
          refAuto +
          " manual=" +
          refManual +
          " total=" +
          links.length
      );
    })();

    var nodeById = {};
    nodes.forEach(function (n) {
      nodeById[String(n.id)] = n;
    });

    var selectedId = null;
    var ctxMenuId = null;
    var componentFocusSet = null;
    var neighborMap = {};
    var activeNodes = [];
    var activeLinks = [];
    var frozenLayout = false;
    var dragActive = false;
    var pendingFlowUpdate = false;
    var lastActiveNoteIds = new Set();
    var softPinRadius = 140;
    var releaseTimer = null;
    var graphReady = true;

    function linkIds(l) {
      var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
      var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
      return { s: String(s), t: String(t) };
    }

    function isConnected(id) {
      if (!selectedId && !ctxMenuId) return true;
      if (selectedId && id === selectedId) return true;
      if (ctxMenuId && id === ctxMenuId) return true;
      var focus = selectedId || ctxMenuId;
      var set = neighborMap[focus];
      return set && set.has(id);
    }

    function isLinkConnected(l) {
      if (!selectedId && !ctxMenuId) return true;
      var ids = linkIds(l);
      if (selectedId && (ids.s === selectedId || ids.t === selectedId)) return true;
      if (ctxMenuId && (ids.s === ctxMenuId || ids.t === ctxMenuId)) return true;
      return false;
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
        if (l.meta && l.meta.flow_only) {
          return "rgba(0,0,0,0)";
        }
        var c = isKanjiComponent(l) ? componentColor() : layerColor(l.layer, layerColors);
        if (l.layer === "reference" && l.meta && l.meta.manual === false) {
          return colorWithAlpha(c, autoRefOpacity);
        }
        if (isKanjiComponent(l)) {
          return colorWithAlpha(c, kanjiComponentOpacity);
        }
        if (l.meta && l.meta.same_prio) {
          return colorWithAlpha(c, samePrioOpacity);
        }
        if (!isLinkConnected(l)) {
          return applyDim(c, 0.2);
        }
        return c;
      })
      .linkLineDash(function (l) {
        var style = isKanjiComponent(l)
          ? kanjiComponentStyle || "solid"
          : layerStyles[l.layer] || "solid";
        if (style === "dashed") return [6, 4];
        if (style === "pointed") return [1, 4];
        return [];
      })
      .linkWidth(function (l) {
        if (l.meta && l.meta.flow_only) return 0;
        return l.layer === "reference" ? 0.8 : 1.2;
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
        if (l && l.__particle_count !== undefined) return l.__particle_count;
        if (isKanjiComponent(l)) {
          if (!kanjiComponentFlow) return 0;
          var len = linkLength(l);
          return Math.max(2, Math.min(10, Math.round(len / 120)));
        }
        if (!layerFlow[l.layer]) return 0;
        var len2 = linkLength(l);
        return Math.max(2, Math.min(10, Math.round(len2 / 160)));
      })
      .linkDirectionalParticleSpeed(function (l) {
        if (l && l.__particle_speed !== undefined) return l.__particle_speed;
        if (isKanjiComponent(l)) {
          if (!kanjiComponentFlow) return 0;
          var len0 = linkLength(l);
          return (flowSpeed * 2) / Math.max(30, len0);
        } else if (!layerFlow[l.layer]) {
          return 0;
        }
        var len = linkLength(l);
        return flowSpeed / Math.max(30, len);
      })
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(function (l) {
        var alpha = 0.7;
        if (l.layer === "reference" && l.meta && l.meta.manual === false) {
          alpha = Math.min(1, alpha * autoRefOpacity);
        }
        if (isKanjiComponent(l)) {
          alpha = Math.min(1, alpha * kanjiComponentOpacity);
        }
        if (l.meta && l.meta.same_prio) {
          alpha = Math.min(1, alpha * samePrioOpacity);
        }
        var baseCol = isKanjiComponent(l)
          ? componentColor()
          : layerColor(l.layer, layerColors);
        var col = colorWithAlpha(baseCol, alpha);
        if (!isLinkConnected(l)) {
            if (isKanjiComponent(l) && kanjiComponentFocusOnly && componentFocusSet && componentFocusSet.size) {
              return col;
            }
            return applyDim(col, 0.2);
          }
          return col;
      })
      .cooldownTicks(80)
      .d3VelocityDecay(0.35);

    if (typeof Graph.d3Force === "function") {
      Graph.d3Force("charge").strength(-80);
    } else {
      log("d3Force unavailable");
    }

    Graph.onNodeDragEnd(function (node) {
      node.fx = node.x;
      node.fy = node.y;
      node.__dragging = false;
      node.__soft_pinned = true;
      node.__pin_x = node.x;
      node.__pin_y = node.y;
      dragActive = false;
      // stop physics again after drag settles
      freezeNodes();
      scheduleFlowUpdate();
    });
    if (typeof Graph.onNodeDragStart === "function") {
      Graph.onNodeDragStart(function (node) {
        dragActive = true;
        // freeze everything first so only released nodes move
        freezeNodes();
        if (node) {
          node.__dragging = true;
          node.fx = node.x;
          node.fy = node.y;
        }
        unfreezeForDrag(node);
      });
    }
    if (typeof Graph.onNodeDrag === "function") {
      Graph.onNodeDrag(function (node) {
        if (!dragActive) {
          dragActive = true;
          freezeNodes();
        }
        if (node) {
          node.__dragging = true;
          node.fx = node.x;
          node.fy = node.y;
        }
        unfreezeForDrag(node);
      });
    }
    Graph.onNodeClick(function (node) {
      selectedId = node ? String(node.id) : null;
      refreshSelection();
    });
    if (typeof Graph.onBackgroundClick === "function") {
      Graph.onBackgroundClick(function () {
        if (selectedId) {
          selectedId = null;
          refreshSelection();
        }
      });
    }

    var tooltip = document.getElementById("tooltip");
    Graph.onNodeHover(function (node) {
      if (!tooltip) return;
      if (node) {
        tooltip.style.display = "block";
        var lines = [];
        lines.push(node.label || node.id);
        if (node.note_type) lines.push(node.note_type);
        if (node.prio !== undefined) lines.push("prio: " + node.prio);
        if (Array.isArray(node.extra)) {
          node.extra.forEach(function (entry) {
            if (!entry || !entry.name) return;
            var val = entry.value || "";
            if (val) {
              lines.push(entry.name + ": " + val);
            }
          });
        }
        tooltip.innerText = lines.join("\n");
      } else {
        tooltip.style.display = "none";
      }
    });

    Graph.nodeRelSize(3);
    Graph.nodeCanvasObject(function (node, ctx) {
      var nodeId = String(node.id);
      var isActiveNode = selectedId && nodeId === selectedId;
      var isCtxNode = ctxMenuId && nodeId === ctxMenuId;
      var connected = isConnected(nodeId);
      var showPulse = node.kind === "family"
        ? (isActiveNode || isCtxNode)
        : (connected || isActiveNode || isCtxNode);
      var color = nodeColor(node, noteTypeColors, layerColors);
      var deg = node.__deg || 0;
      var scale = 1 + Math.min(deg, 20) * 0.08;
      var baseR = 3.5;
      var radius = baseR * scale;
      var t = Date.now() / 600;
      var seed = node.__seed;
      if (seed === undefined || seed === null) {
        var sid = String(node.id || "");
        var h = 0;
        for (var i = 0; i < sid.length; i++) {
          h = (h * 31 + sid.charCodeAt(i)) % 100000;
        }
        node.__seed = h;
        seed = h;
      }
      var pulse = showPulse ? 1 + 0.1 * Math.sin(t + seed) : 1;
      var haloR = radius * 1.3 * pulse;
      var alpha = (connected || showPulse) ? 1 : 0.2;
      if (showPulse) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, 2 * Math.PI);
        ctx.fillStyle = colorWithAlpha(color, 0.5 * alpha);
        ctx.fill();
        ctx.lineWidth = 0.25;
        ctx.strokeStyle = colorWithAlpha(color, 0.75 * alpha);
        ctx.stroke();
        if (isActiveNode && !isCtxNode) {
          var ringR = haloR + 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, 2 * Math.PI);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = colorWithAlpha(color, 0.9);
          ctx.stroke();
        }
        if (isCtxNode) {
          var ctxRingR = haloR + 0.8;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ctxRingR, 0, 2 * Math.PI);
          ctx.lineWidth = 0.36;
          ctx.strokeStyle = "rgba(239,68,68,0.9)";
          ctx.stroke();
        }
        if (showPulse && node.kind === "family" && !isCtxNode) {
          var hubOuterR = haloR + 2.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, hubOuterR, 0, 2 * Math.PI);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = colorWithAlpha(color, 0.75 * alpha);
          ctx.stroke();
        }
      }
      // mask link lines under the node so they stop at the inner circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 0.6, 0, 2 * Math.PI);
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
            ctx.font = Math.max(5, radius * 0.35) + "px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(count), node.x, node.y + radius * 0.08);
            ctx.restore();
          }
        }
      }).nodeCanvasObjectMode(function () {
        return "replace";
      });

    if (typeof Graph.onRenderFramePost === "function") {
      Graph.onRenderFramePost(function (ctx, globalScale) {
        var data = Graph.graphData();
        if (!data || !data.nodes) return;
        var z = globalScale || 1;
        var cap = 3;
        var base = 6.4;
        var fontSize = (base * Math.min(z, cap)) / z;
        if (z < 0.25) return;
        ctx.save();
        ctx.font = fontSize + "px Arial";
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        function breakToken(token, maxWidth) {
          var out = [];
          var cur = "";
          for (var i = 0; i < token.length; i++) {
            var ch = token[i];
            var next = cur + ch;
            if (ctx.measureText(next).width <= maxWidth || cur.length === 0) {
              cur = next;
            } else {
              out.push(cur);
              cur = ch;
            }
          }
          if (cur) out.push(cur);
          return out;
        }
        function wrapLabel(text, maxWidth) {
          if (!text) return [];
          var tokens = text.split(/\s+/).filter(function (t) { return t.length; });
          if (!tokens.length) tokens = [text];
          var lines = [];
          var cur = "";
          tokens.forEach(function (token) {
            if (!cur) {
              if (ctx.measureText(token).width <= maxWidth) {
                cur = token;
              } else {
                var parts = breakToken(token, maxWidth);
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
                var parts2 = breakToken(token, maxWidth);
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
        var maxLabelWidth = 200 / z;
        var lineHeight = fontSize * 1.2;
        data.nodes.forEach(function (node) {
          var label = node.label || node.id;
          if (!label) return;
          var connected = isConnected(String(node.id));
          var labelColor = connected ? "#e5e7eb" : "rgba(229,231,235,0.2)";
          var deg = node.__deg || 0;
          var scale = 1 + Math.min(deg, 20) * 0.08;
          var baseR = 3.5;
          var radius = baseR * scale;
          var offset = radius + 4;
          ctx.fillStyle = labelColor;
          var lines = wrapLabel(label, maxLabelWidth);
          if (!lines.length) return;
          for (var li = 0; li < lines.length; li++) {
            var line = lines[lines.length - 1 - li];
            var y = node.y - offset - li * lineHeight;
            ctx.fillText(line, node.x, y);
          }
        });
        ctx.restore();
        maybeUpdateFlow();
      });
    }

    graphEl.onmousemove = function (e) {
      if (!tooltip) return;
      tooltip.style.left = e.clientX + 12 + "px";
      tooltip.style.top = e.clientY + 12 + "px";
    };

    function baseCurve(layer) {
      if (layer === "family") return 0.15;
      if (layer === "family_hub") return 0;
      if (layer === "reference") return -0.2;
      if (layer === "example") return 0.1;
      if (layer === "kanji") return -0.1;
      return 0;
    }

    function applyFilters(opts) {
      opts = opts || {};
      var componentFocus = null;
      if (kanjiComponentFocusOnly) {
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
        });
      var activeIds = {};
      activeNodes.forEach(function (n) {
        activeIds[String(n.id)] = true;
      });
      activeLinks = links.filter(function (l) {
        if (!isLayerEnabled(l.layer)) return false;
        if (!kanjiComponentsEnabled && isKanjiComponent(l)) return false;
        if (kanjiComponentsEnabled && kanjiComponentFocusOnly && isKanjiComponent(l)) {
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
      if (!showUnlinked) {
        if (!activeLinks.length) {
          activeNodes = [];
        } else {
          var idKind = {};
          activeNodes.forEach(function (n) {
            idKind[String(n.id)] = n.kind || "";
          });
          var linkIds = {};
          activeLinks.forEach(function (l) {
            var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
            var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
            var sk = String(s);
            var tk = String(t);
            var kindS = idKind[sk] || "";
            var kindT = idKind[tk] || "";
            if (l.layer === "family_hub" || kindS === "family" || kindT === "family") {
              return;
            }
            linkIds[sk] = true;
            linkIds[tk] = true;
          });
          activeNodes = activeNodes.filter(function (n) {
            return linkIds[String(n.id)];
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
      var hubCounts = {};
      var hubByFid = {};
      activeNodes.forEach(function (n) {
        if (n.kind !== "family") return;
        var fid = n.label || String(n.id).replace("family:", "");
        if (fid) hubByFid[fid] = String(n.id);
      });
      activeNodes.forEach(function (n) {
        if (n.kind === "family") return;
        if (!Array.isArray(n.families)) return;
        n.families.forEach(function (fid) {
          var hid = hubByFid[fid];
          if (hid) hubCounts[hid] = (hubCounts[hid] || 0) + 1;
        });
      });
      var degree = {};
      neighborMap = {};
      activeLinks.forEach(function (l) {
        if (l.meta && l.meta.flow_only) return;
        if (l.layer === "family" && l.meta && l.meta.same_prio) return;
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        var sk = String(s);
        var tk = String(t);
        degree[sk] = (degree[sk] || 0) + 1;
        degree[tk] = (degree[tk] || 0) + 1;
        if (!neighborMap[sk]) neighborMap[sk] = new Set();
        if (!neighborMap[tk]) neighborMap[tk] = new Set();
        neighborMap[sk].add(tk);
        neighborMap[tk].add(sk);
      });
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
        selectedId = null;
      }
      var pairMap = {};
      var flowOnly = [];
      activeLinks.forEach(function (l) {
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
          var base = baseCurve(arr[i].layer);
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
      Graph.graphData({ nodes: activeNodes, links: activeLinks });
      scheduleFlowUpdate();
      if (typeof Graph.linkCurvature === "function") {
        Graph.linkCurvature(function (l) {
          return l.curve || 0;
        });
      }
      if (opts.reheat === false) {
        freezeNodes();
      } else {
        unfreezeNodes();
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
        activeLinks.forEach(function (l) {
          if (l.layer !== "reference") return;
          if (l.meta && l.meta.manual) m += 1;
          else a += 1;
        });
        log("active refs auto=" + a + " manual=" + m);
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

    function updateFlowParticles() {
      if (!activeLinks || !activeLinks.length) return;
      activeLinks.forEach(function (l) {
        var enabled = isKanjiComponent(l) ? kanjiComponentFlow : !!layerFlow[l.layer];
        if (!enabled) {
          l.__particle_count = 0;
          l.__particle_speed = 0;
          if (l.__photons) {
            l.__photons.length = 0;
          }
          return;
        }
        var len = linkLength(l);
        var div = isKanjiComponent(l) ? 120 : 160;
        var count = Math.max(2, Math.min(10, Math.round(len / div)));
        l.__particle_count = count;
        var speedBase = isKanjiComponent(l) ? flowSpeed * 2 : flowSpeed;
        l.__particle_speed = speedBase / Math.max(30, len);
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
      log("js flow particles updated");
    }

    function scheduleFlowUpdate() {
      pendingFlowUpdate = true;
    }

    function maybeUpdateFlow() {
      if (!pendingFlowUpdate) return;
      if (typeof Graph.isEngineRunning === "function" && Graph.isEngineRunning()) {
        return;
      }
      pendingFlowUpdate = false;
      updateFlowParticles();
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function refreshSelection() {
      if (kanjiComponentFocusOnly) {
        applyFilters({ reheat: false });
      } else if (typeof Graph.resumeAnimation === "function") {
        // Selection should not reheat physics; just ensure a redraw loop is active.
        Graph.resumeAnimation();
      }
    }

    function freezeNodes() {
      frozenLayout = true;
      activeNodes.forEach(function (n) {
        if (n.__soft_pinned) return;
        if (n.fx === undefined || n.fx === null) {
          n.__frozen = true;
          n.fx = n.x;
          n.fy = n.y;
        }
      });
    }

    function unfreezeNodes() {
      frozenLayout = false;
      activeNodes.forEach(function (n) {
        if (n.__frozen) {
          n.__frozen = false;
          if (!n.__soft_pinned) {
            n.fx = null;
            n.fy = null;
          }
        }
      });
    }

    function unfreezeForDrag(node) {
      if (!node) return;
      var id = String(node.id);
      var allow = new Set();
      // keep dragged node locked to cursor; do not let forces move it
      if (node.__soft_pinned) {
        node.__soft_pinned = false;
        node.__pin_x = null;
        node.__pin_y = null;
      }
      node.__frozen = false;
      node.fx = node.x;
      node.fy = node.y;

      // release connected nodes only once links stretch beyond threshold
      var release = new Set();
      release.add(id);
      var changed = true;
      var guard = 0;
      while (changed && guard < activeLinks.length + 1) {
        changed = false;
        guard += 1;
        activeLinks.forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var sk = String(s);
          var tk = String(t);
          var sRel = release.has(sk);
          var tRel = release.has(tk);
          if (sRel === tRel) return;
          var n1 = nodeById[sk];
          var n2 = nodeById[tk];
          if (!n1 || !n2) return;
          var dx = (n1.x || 0) - (n2.x || 0);
          var dy = (n1.y || 0) - (n2.y || 0);
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > softPinRadius) {
            if (sRel) {
              release.add(tk);
            } else {
              release.add(sk);
            }
            changed = true;
          }
        });
      }

      var releasedCount = 0;
      release.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        if (rid !== id) {
          n.fx = null;
          n.fy = null;
        }
        releasedCount += 1;
      });

      if (releasedCount > 1 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 1 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function releaseComponentFromSeeds(seeds) {
      if (!seeds || !seeds.length) return;
      if (dragActive) return;
      var release = new Set();
      var queue = [];
      seeds.forEach(function (s) {
        var id = String(s);
        if (!release.has(id)) {
          release.add(id);
          queue.push(id);
        }
      });
      while (queue.length) {
        var cur = queue.pop();
        var nbrs = neighborMap[cur];
        if (!nbrs) continue;
        nbrs.forEach(function (nid) {
          if (release.has(nid)) return;
          release.add(nid);
          queue.push(nid);
        });
      }
      var releasedCount = 0;
      release.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        n.fx = null;
        n.fy = null;
        releasedCount += 1;
      });
      if (releasedCount > 1 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 1 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      if (releaseTimer) {
        clearTimeout(releaseTimer);
      }
      releaseTimer = setTimeout(function () {
        freezeNodes();
      }, 900);
      log("js release component nodes=" + releasedCount);
    }

    function collectComponent(start, blocked) {
      var out = new Set();
      var queue = [start];
      out.add(start);
      while (queue.length) {
        var cur = queue.pop();
        var nbrs = neighborMap[cur];
        if (!nbrs) continue;
        nbrs.forEach(function (nid) {
          if (blocked && blocked.has(nid)) return;
          if (out.has(nid)) return;
          out.add(nid);
          queue.push(nid);
        });
      }
      return out;
    }

    function releaseForNewEdges(edges, anchors, existed) {
      if (!edges || !edges.length) return;
      if (dragActive) return;
      var toRelease = new Set();
      var blocked = anchors || new Set();
      edges.forEach(function (edge) {
        var a = String(edge.a);
        var b = String(edge.b);
        var anchor = null;
        var start = null;
        if (blocked.has(a)) {
          anchor = a;
          start = b;
        } else if (blocked.has(b)) {
          anchor = b;
          start = a;
        } else if (existed && existed.has(a) && !existed.has(b)) {
          anchor = a;
          start = b;
        } else if (existed && existed.has(b) && !existed.has(a)) {
          anchor = b;
          start = a;
        } else if (selectedId && (selectedId === a || selectedId === b)) {
          anchor = selectedId;
          start = selectedId === a ? b : a;
        } else {
          // fallback: move both ends
          start = a;
        }
        if (!start) return;
        var comp = collectComponent(start, blocked);
        comp.forEach(function (nid) {
          if (blocked.has(nid)) return;
          toRelease.add(nid);
        });
      });
      var releasedCount = 0;
      toRelease.forEach(function (rid) {
        var n = nodeById[rid];
        if (!n) return;
        if (n.__frozen) n.__frozen = false;
        if (n.__soft_pinned) {
          n.__soft_pinned = false;
          n.__pin_x = null;
          n.__pin_y = null;
        }
        n.fx = null;
        n.fy = null;
        releasedCount += 1;
      });
      if (releasedCount > 0 && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      if (releasedCount > 0 && typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
      if (releaseTimer) {
        clearTimeout(releaseTimer);
      }
      releaseTimer = setTimeout(function () {
        freezeNodes();
      }, 900);
      log("js release edges=" + edges.length + " nodes=" + releasedCount);
    }

    for (var k in layerState) {
      if (layerState[k]) {
        layerState[k].addEventListener("change", function () {
          var lbl = this && this.parentNode ? this.parentNode.textContent.trim() : "Layer";
          showToast((this.checked ? "Enabled " : "Disabled ") + lbl);
          storeLayers();
          applyFilters({ reheat: true, toast_visible: true });
        });
      }
    }

    function storeLayers() {
      var state = {
        family: isLayerEnabled("family"),
        family_hub: isLayerEnabled("family_hub"),
        reference: isLayerEnabled("reference"),
        example: isLayerEnabled("example"),
        kanji: isLayerEnabled("kanji"),
      };
      try {
        localStorage.setItem("ajpc_graph_layers", JSON.stringify(state));
      } catch (_e) {}
    }

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
          e.stopPropagation();
          setTab(t.getAttribute("data-tab"));
        });
      });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        panel.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (!panel.classList.contains("open")) return;
        if (panel.contains(e.target) || btn.contains(e.target)) return;
        panel.classList.remove("open");
      });
      setTab("notes");
    }

    if (typeof Graph.onEngineStop === "function") {
      Graph.onEngineStop(function () {
        scheduleFlowUpdate();
        maybeUpdateFlow();
      });
    }

    function loadLayers() {
      try {
        var raw = localStorage.getItem("ajpc_graph_layers");
        if (!raw) return;
        var state = JSON.parse(raw);
        Object.keys(layerState).forEach(function (k) {
          if (layerState[k] && state.hasOwnProperty(k)) {
            layerState[k].checked = !!state[k];
          }
        });
      } catch (_e) {}
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
            if (window.pycmd) {
              pycmd("label:" + nt.id + ":" + encodeURIComponent(select.value));
            }
            showToast("Name field: " + nt.name + " -> " + select.value);
          });
          labelFieldWrap.appendChild(labelFieldLabel);
          labelFieldWrap.appendChild(select);
          fieldsWrap.appendChild(labelFieldWrap);

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
            if (window.pycmd) {
              pycmd("lnfield:" + nt.id + ":" + encodeURIComponent(linked.value));
            }
            updateLinkedColor();
            showToast("Linked field: " + nt.name + " -> " + linked.value);
          });
          updateLinkedColor();
          linkedFieldWrap.appendChild(linkedFieldLabel);
          linkedFieldWrap.appendChild(linked);
          fieldsWrap.appendChild(linkedFieldWrap);

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
            if (!tooltipOpen) return;
            if (!tooltipDrop.contains(e.target)) {
              closeTooltip();
            }
          });
          updateTooltipTrigger();
          tooltipWrap.appendChild(tooltipLabel);
          tooltipWrap.appendChild(tooltipDrop);
          fieldsWrap.appendChild(tooltipWrap);

          var colorWrap = document.createElement("div");
          colorWrap.className = "nt-field";
          var color = document.createElement("input");
          color.type = "color";
          color.value = noteTypeColors[String(nt.id)] || "#4da3ff";
          color.addEventListener("change", function () {
            noteTypeColors[String(nt.id)] = color.value;
            if (window.pycmd) {
              pycmd(
                "color:" + nt.id + ":" + encodeURIComponent(color.value)
              );
            }
            applyFilters({ reheat: false });
            showToast("Color: " + nt.name);
          });
          colorWrap.appendChild(color);
          fieldsWrap.appendChild(colorWrap);
          group.appendChild(fieldsWrap);
          list.appendChild(group);

          function updateVisibility() {
            fieldsWrap.style.display = chk.checked ? "block" : "none";
          }
          chk.addEventListener("change", function () {
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
      var setFlow = function (v) {
        if (isNaN(v)) return;
        flowSpeed = v;
        flowRange.value = v;
        flowInput.value = v;
        if (window.pycmd) {
          pycmd("lflowspeed:" + flowSpeed);
        }
        applyFilters({ reheat: false });
        showToast("Flow speed: " + flowSpeed);
      };
      flowRange.addEventListener("input", function () {
        setFlow(parseFloat(flowRange.value));
      });
      flowInput.addEventListener("change", function () {
        setFlow(parseFloat(flowInput.value));
      });
      flowRow.appendChild(flowLabel);
      flowRow.appendChild(flowRange);
      flowRow.appendChild(flowInput);
      list.appendChild(flowRow);

      var chainRow = document.createElement("div");
      chainRow.className = "layer-row-toggle";
      var chainToggle = document.createElement("input");
      chainToggle.type = "checkbox";
      chainToggle.checked = !!familyChainEdges;
      chainToggle.addEventListener("change", function () {
        familyChainEdges = !!chainToggle.checked;
        if (window.pycmd) {
          pycmd("fchain:" + (familyChainEdges ? "1" : "0"));
        }
        showToast("Chain family levels: " + (familyChainEdges ? "On" : "Off"));
      });
      var chainLabel = document.createElement("span");
      chainLabel.textContent = "Chain family levels";
      chainRow.appendChild(chainToggle);
      chainRow.appendChild(chainLabel);
      var layers = ["family", "family_hub", "reference", "example", "kanji"];
      var familyRow = null;
      var familyHubRow = null;
      var referenceRow = null;
      layers.forEach(function (layer) {
        var row = document.createElement("div");
        row.className = "layer-row";
        var label = document.createElement("span");
        var labelMap = {
          family: "Family Gate",
          family_hub: "Family Hubs",
          reference: "Linked Notes",
          example: "Example Gate",
          kanji: "Kanji Gate",
        };
        label.textContent = labelMap[layer] || layer;
        label.style.flex = "1";
        var color = document.createElement("input");
        color.type = "color";
        color.value = layerColor(layer, layerColors);
        color.addEventListener("change", function () {
          layerColors[layer] = color.value;
          if (window.pycmd) {
            pycmd("lcol:" + layer + ":" + encodeURIComponent(color.value));
          }
          applyFilters({ reheat: false });
          showToast("Link color: " + (labelMap[layer] || layer));
        });
        var style = document.createElement("select");
        ["solid", "dashed", "pointed"].forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          style.appendChild(o);
        });
        style.value = layerStyles[layer] || "solid";
        style.addEventListener("change", function () {
          layerStyles[layer] = style.value;
          if (window.pycmd) {
            pycmd("lstyle:" + layer + ":" + encodeURIComponent(style.value));
          }
          applyFilters({ reheat: false });
          showToast("Link style: " + (labelMap[layer] || layer));
        });
        if (style.value === "pointed") {
          style.value = "pointed";
        }
        var flow = document.createElement("input");
        flow.type = "checkbox";
        flow.checked = !!layerFlow[layer];
        flow.addEventListener("change", function () {
          layerFlow[layer] = !!flow.checked;
          if (window.pycmd) {
            pycmd("lflow:" + layer + ":" + (flow.checked ? "1" : "0"));
          }
          applyFilters({ reheat: false });
          showToast("Flow: " + (labelMap[layer] || layer) + " " + (flow.checked ? "On" : "Off"));
        });
        row.appendChild(label);
        row.appendChild(color);
        row.appendChild(style);
        row.appendChild(flow);
        list.appendChild(row);
        if (layer === "family") familyRow = row;
        if (layer === "family_hub") familyHubRow = row;
        if (layer === "reference") referenceRow = row;
      });

      function insertAfter(ref, node) {
        if (!ref || !ref.parentNode) {
          list.appendChild(node);
          return;
        }
        if (ref.nextSibling) {
          ref.parentNode.insertBefore(node, ref.nextSibling);
        } else {
          ref.parentNode.appendChild(node);
        }
      }

      if (familyHubRow) {
        insertAfter(familyHubRow, chainRow);
      } else {
        list.appendChild(chainRow);
      }

      var toggleRow = document.createElement("div");
      toggleRow.className = "layer-row-toggle";
      var toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = !!samePrioEdges;
      toggle.addEventListener("change", function () {
        samePrioEdges = !!toggle.checked;
        if (window.pycmd) {
          pycmd("fprio:" + (samePrioEdges ? "1" : "0"));
        }
        showToast("Same-priority links: " + (samePrioEdges ? "On" : "Off"));
      });
      var tlabel = document.createElement("span");
      tlabel.textContent = "Same-priority links";
      toggleRow.appendChild(toggle);
      toggleRow.appendChild(tlabel);
      if (familyRow) {
        insertAfter(familyRow, toggleRow);
      } else {
        list.appendChild(toggleRow);
      }

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
      var setOp = function (v) {
        if (isNaN(v)) return;
        samePrioOpacity = v;
        opRange.value = v;
        opInput.value = v;
        if (window.pycmd) {
          pycmd("fprioop:" + samePrioOpacity);
        }
        applyFilters({ reheat: false });
      };
      opRange.addEventListener("input", function () {
        setOp(parseFloat(opRange.value));
      });
      opInput.addEventListener("change", function () {
        setOp(parseFloat(opInput.value));
        showToast("Same-prio opacity: " + samePrioOpacity);
      });
      opRow.appendChild(opLabel);
      opRow.appendChild(opRange);
      opRow.appendChild(opInput);
      insertAfter(toggleRow, opRow);
      opRow.style.display = toggle.checked ? "flex" : "none";
      toggle.addEventListener("change", function () {
        opRow.style.display = toggle.checked ? "flex" : "none";
      });

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
      var setAuto = function (v) {
        if (isNaN(v)) return;
        autoRefOpacity = v;
        autoRange.value = v;
        autoInput.value = v;
        if (window.pycmd) {
          pycmd("refauto:" + autoRefOpacity);
        }
        applyFilters({ reheat: false });
      };
      autoRange.addEventListener("input", function () {
        setAuto(parseFloat(autoRange.value));
      });
      autoInput.addEventListener("change", function () {
        setAuto(parseFloat(autoInput.value));
        showToast("Auto-link opacity: " + autoRefOpacity);
      });
      autoRow.appendChild(autoLabel);
      autoRow.appendChild(autoRange);
      autoRow.appendChild(autoInput);
      if (referenceRow) {
        insertAfter(referenceRow, autoRow);
      } else {
        list.appendChild(autoRow);
      }

      var compToggleRow = document.createElement("div");
      compToggleRow.className = "layer-row-toggle";
      var compToggle = document.createElement("input");
      compToggle.type = "checkbox";
      compToggle.checked = !!kanjiComponentsEnabled;
      compToggle.addEventListener("change", function () {
        kanjiComponentsEnabled = !!compToggle.checked;
        if (window.pycmd) {
          pycmd("kcomp:" + (kanjiComponentsEnabled ? "1" : "0"));
        }
        compStyleRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
        compColorRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
        compOpacityRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
        compFlowRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
        compFocusRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
        applyFilters({ reheat: false });
        showToast("Kanji parts: " + (kanjiComponentsEnabled ? "On" : "Off"));
      });
      var compLabel = document.createElement("span");
      compLabel.textContent = "Kanji Parts";
      compToggleRow.appendChild(compToggle);
      compToggleRow.appendChild(compLabel);
      list.appendChild(compToggleRow);

      var compColorRow = document.createElement("div");
      compColorRow.className = "layer-row";
      var compColorLabel = document.createElement("span");
      compColorLabel.textContent = "Kanji Parts";
      compColorLabel.style.flex = "1";
      var compColor = document.createElement("input");
      compColor.type = "color";
      compColor.value = kanjiComponentColor || layerColor("kanji", layerColors);
      compColor.addEventListener("change", function () {
        kanjiComponentColor = compColor.value;
        if (window.pycmd) {
          pycmd("kcompcol:" + encodeURIComponent(kanjiComponentColor));
        }
        applyFilters({ reheat: false });
        showToast("Parts color updated");
      });
      compColorRow.appendChild(compColorLabel);
      compColorRow.appendChild(compColor);
      list.appendChild(compColorRow);

      var compOpacityRow = document.createElement("div");
      compOpacityRow.className = "layer-row";
      var compOpacityLabel = document.createElement("span");
      compOpacityLabel.textContent = "Parts Opacity";
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
      var setCompOpacity = function (v) {
        if (isNaN(v)) return;
        kanjiComponentOpacity = v;
        compOpacityRange.value = v;
        compOpacityInput.value = v;
        if (window.pycmd) {
          pycmd("kcompop:" + kanjiComponentOpacity);
        }
        applyFilters({ reheat: false });
      };
      compOpacityRange.addEventListener("input", function () {
        setCompOpacity(parseFloat(compOpacityRange.value));
      });
      compOpacityInput.addEventListener("change", function () {
        setCompOpacity(parseFloat(compOpacityInput.value));
        showToast("Parts opacity: " + kanjiComponentOpacity);
      });
      compOpacityRow.appendChild(compOpacityLabel);
      compOpacityRow.appendChild(compOpacityRange);
      compOpacityRow.appendChild(compOpacityInput);
      list.appendChild(compOpacityRow);

      var compStyleRow = document.createElement("div");
      compStyleRow.className = "layer-row";
      var compStyleLabel = document.createElement("span");
      compStyleLabel.textContent = "Parts Style";
      compStyleLabel.style.flex = "1";
      var compStyle = document.createElement("select");
      ["solid", "dashed", "pointed"].forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        compStyle.appendChild(o);
      });
      compStyle.value = kanjiComponentStyle || "solid";
      compStyle.addEventListener("change", function () {
        kanjiComponentStyle = compStyle.value;
        if (window.pycmd) {
          pycmd("kcompstyle:" + encodeURIComponent(kanjiComponentStyle));
        }
        applyFilters({ reheat: false });
        showToast("Parts style: " + kanjiComponentStyle);
      });
      compStyleRow.appendChild(compStyleLabel);
      compStyleRow.appendChild(compStyle);
      // place style in same row as color, without extra label
      compStyleLabel.textContent = "";
      compColorRow.appendChild(compStyle);

      var compFlowToggle = document.createElement("input");
      compFlowToggle.type = "checkbox";
      compFlowToggle.checked = !!kanjiComponentFlow;
      compFlowToggle.addEventListener("change", function () {
        kanjiComponentFlow = !!compFlowToggle.checked;
        if (window.pycmd) {
          pycmd("kcompflow:" + (kanjiComponentFlow ? "1" : "0"));
        }
        applyFilters({ reheat: false });
        showToast("Parts flow: " + (kanjiComponentFlow ? "On" : "Off"));
      });
      compColorRow.appendChild(compFlowToggle);

      var compFocusRow = document.createElement("div");
      compFocusRow.className = "layer-row-toggle";
      var compFocusToggle = document.createElement("input");
      compFocusToggle.type = "checkbox";
      compFocusToggle.checked = !!kanjiComponentFocusOnly;
      compFocusToggle.addEventListener("change", function () {
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
      list.appendChild(compFocusRow);

      compStyleRow.style.display = "none";
      compColorRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
      compOpacityRow.style.display = kanjiComponentsEnabled ? "flex" : "none";
      compFocusRow.style.display = kanjiComponentsEnabled ? "flex" : "none";

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
        e.stopPropagation();
        if (open) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });
      document.addEventListener("click", function (e) {
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
        if (typeof Graph.centerAt === "function") {
          Graph.centerAt(n.x, n.y, 800);
        }
        if (typeof Graph.zoom === "function") {
          Graph.zoom(2, 800);
        }
        log("search hit " + n.id);
        showToast("Focus: " + (n.label || n.id));
      }

      function buildHits(q) {
        var lower = (q || "").trim().toLowerCase();
        if (!lower) return [];
        var data = Graph.graphData() || { nodes: [] };
        var nodes = data.nodes || [];
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var label = (n.label || "").toLowerCase();
          if (label.indexOf(lower) >= 0 || String(n.id).indexOf(q) >= 0) {
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
            selectedHit = n;
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
        selectedHit = null;
        hits = buildHits(input.value || "");
        renderSuggest(hits);
      });
      input.addEventListener("focus", function () {
        if (hits.length) renderSuggest(hits);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runSearch();
        }
      });
      btn.addEventListener("click", runSearch);
      document.addEventListener("click", function (e) {
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
        showUnlinked = !!toggle.checked;
        if (window.pycmd) {
          pycmd("showunlinked:" + (showUnlinked ? "1" : "0"));
        }
        applyFilters({ reheat: false, toast_visible: true });
        showToast("Show unlinked: " + (showUnlinked ? "On" : "Off"));
      });
    }

    loadLayers();
    setupNoteTypePanel();
    setupLayerPanel();
    setupPhysicsPanel();
    setupSettingsPanel();
    setupDeckDropdown();
    setupSearch();
    setupUnlinkedToggle();
    applyFilters({ reheat: true, toast_visible: "count" });

    function loadPhysics() {
      try {
        var raw = localStorage.getItem("ajpc_graph_physics");
        if (raw) {
          var obj = JSON.parse(raw);
          physics = Object.assign({}, physicsDefaults, obj || {});
          return;
        }
      } catch (_e) {}
      physics = Object.assign({}, physicsDefaults);
    }

    function storePhysics() {
      try {
        localStorage.setItem("ajpc_graph_physics", JSON.stringify(physics));
      } catch (_e) {}
    }

    function applyPhysics(reheat) {
      if (!Graph) return;
      if (typeof Graph.linkDistance === "function") {
        Graph.linkDistance(physics.link_distance);
      }
      if (typeof Graph.linkStrength === "function") {
        Graph.linkStrength(function (l) {
          if (l && l.meta && l.meta.flow_only) return 0;
          return physics.link_strength;
        });
      }
      if (typeof Graph.d3VelocityDecay === "function") {
        Graph.d3VelocityDecay(physics.velocity_decay);
      }
      if (typeof Graph.d3AlphaDecay === "function") {
        Graph.d3AlphaDecay(physics.alpha_decay);
      }
      if (typeof Graph.cooldownTicks === "function") {
        Graph.cooldownTicks(physics.cooldown_ticks);
      }
      if (typeof Graph.warmupTicks === "function") {
        Graph.warmupTicks(physics.warmup_ticks);
      }
      if (typeof Graph.d3Force === "function") {
        var charge = Graph.d3Force("charge");
        if (charge && typeof charge.strength === "function") {
          charge.strength(physics.charge);
        }
        if (charge && typeof charge.distanceMax === "function") {
          charge.distanceMax(physics.max_radius || 0);
        }
      }
      if (reheat !== false && typeof Graph.d3ReheatSimulation === "function") {
        Graph.d3ReheatSimulation();
      }
      log(
        "physics charge=" +
          physics.charge +
          " link=" +
          physics.link_distance +
          " strength=" +
          physics.link_strength
      );
      storePhysics();
    }


    function bindRange(key, rangeId, numId, label) {
      var range = document.getElementById(rangeId);
      var num = document.getElementById(numId);
      if (!range || !num) return;
      var setVal = function (val, silent) {
        if (isNaN(val)) return;
        physics[key] = val;
        range.value = val;
        num.value = val;
        applyPhysics();
        if (!silent && label) {
          showToast("Physics: " + label + " " + val);
        }
      };
      range.addEventListener("input", function () {
        setVal(parseFloat(range.value), true);
      });
      range.addEventListener("change", function () {
        setVal(parseFloat(range.value), false);
      });
      num.addEventListener("change", function () {
        setVal(parseFloat(num.value), false);
      });
      range.value = physics[key];
      num.value = physics[key];
    }

    function setControlValue(rangeId, numId, val) {
      var range = document.getElementById(rangeId);
      var num = document.getElementById(numId);
      if (range) range.value = val;
      if (num) num.value = val;
    }

    function setupPhysicsPanel() {
      loadPhysics();
      bindRange("charge", "phys-charge", "phys-charge-num", "charge");
      bindRange("link_distance", "phys-link-distance", "phys-link-distance-num", "link distance");
      bindRange("link_strength", "phys-link-strength", "phys-link-strength-num", "link strength");
      bindRange("velocity_decay", "phys-vel-decay", "phys-vel-decay-num", "velocity decay");
      bindRange("alpha_decay", "phys-alpha-decay", "phys-alpha-decay-num", "alpha decay");
      bindRange("max_radius", "phys-max-radius", "phys-max-radius-num", "repulsion range");
      bindRange("cooldown_ticks", "phys-cooldown", "phys-cooldown-num", "cooldown ticks");
      bindRange("warmup_ticks", "phys-warmup", "phys-warmup-num", "warmup ticks");
      var resetBtn = document.getElementById("phys-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          physics = Object.assign({}, physicsDefaults);
          setControlValue("phys-charge", "phys-charge-num", physics.charge);
          setControlValue("phys-link-distance", "phys-link-distance-num", physics.link_distance);
          setControlValue("phys-link-strength", "phys-link-strength-num", physics.link_strength);
          setControlValue("phys-vel-decay", "phys-vel-decay-num", physics.velocity_decay);
          setControlValue("phys-alpha-decay", "phys-alpha-decay-num", physics.alpha_decay);
          setControlValue("phys-max-radius", "phys-max-radius-num", physics.max_radius);
          setControlValue("phys-cooldown", "phys-cooldown-num", physics.cooldown_ticks);
          setControlValue("phys-warmup", "phys-warmup-num", physics.warmup_ticks);
          applyPhysics();
          showToast("Physics reset");
        });
      }
    }

    function showContextMenu(node, evt) {
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;
      ctxMenuId = node ? String(node.id) : null;
      menu.innerHTML = "";
      function addItem(label, cb) {
        var div = document.createElement("div");
        div.className = "item";
        var parts = String(label).split("selected");
        if (parts.length > 1) {
          var prefix = parts[0];
          var suffix = parts.slice(1).join("selected");
          if (prefix) div.appendChild(document.createTextNode(prefix));
          var dot = document.createElement("span");
          dot.className = "ctx-selected-dot";
          div.appendChild(dot);
          div.appendChild(document.createTextNode("selected" + suffix));
        } else {
          div.textContent = label;
        }
        div.addEventListener("click", function () {
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
          cb.checked = true;
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
          e.preventDefault();
          close();
        });
        okBtn.addEventListener("click", function (e) {
          e.preventDefault();
          var selected = [];
          list.querySelectorAll("input[type=checkbox]:checked").forEach(function (el) {
            selected.push(el.value);
          });
          close();
          if (onApply) onApply(selected);
        });
        overlay.addEventListener("click", function (e) {
          if (e.target === overlay) close();
        });
      }

      var groups = [];
      var openGroup = [];
      if (node.kind !== "family") {
        openGroup.push({
          label: "Open Preview",
          cb: function () {
            showToast("Open preview");
            if (window.pycmd) pycmd("ctx:preview:" + node.id);
          },
        });
        openGroup.push({
          label: "Open Editor",
          cb: function () {
            showToast("Open editor");
            if (window.pycmd) pycmd("ctx:edit:" + node.id);
          },
        });
        openGroup.push({
          label: "Open Browser",
          cb: function () {
            showToast("Open browser");
            if (window.pycmd) pycmd("ctx:browser:" + node.id);
          },
        });
      }
      groups.push(openGroup);

      var selectedNode =
        selectedId && nodeById[selectedId] ? nodeById[selectedId] : null;
      var selectedKind = selectedNode ? selectedNode.kind || "" : "";
      var isSelectedNote = selectedNode && selectedKind === "note";
      var isSelectedFamily = selectedNode && selectedKind === "family";
      var isNodeNote = node && node.kind === "note";
      var isNodeFamily = node && node.kind === "family";
      var isDifferent = selectedNode && String(node.id) !== String(selectedId);
      var isSame = selectedNode && String(node.id) === String(selectedId);

      function getPrimaryFamily(n) {
        if (!n) return "";
        if (n.kind === "family") {
          return n.label || String(n.id).replace("family:", "");
        }
        if (Array.isArray(n.families) && n.families.length) {
          return String(n.families[0]);
        }
        return "";
      }

      function getSharedFamilies(a, b) {
        if (!a || !b) return [];
        if (!Array.isArray(a.families) || !Array.isArray(b.families)) return [];
        var set = {};
        a.families.forEach(function (f) {
          set[String(f)] = true;
        });
        var out = [];
        b.families.forEach(function (f) {
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

      var connectGroup = [];
      if (selectedNode && isDifferent && isNodeNote) {
        var canConnect =
          selectedKind === "family" ||
          (selectedKind === "note" &&
            Array.isArray(selectedNode.families) &&
            selectedNode.families.length);
        if (selectedKind === "kanji" || selectedKind === "kanji_hub") {
          canConnect = false;
        }
        if (canConnect) {
          function doConnectWithMode(title, mode) {
            return function () {
              function doConnect(families) {
                showToast("Connect family");
                var payload = {
                  source: String(selectedId),
                  target: String(node.id),
                  source_kind: selectedKind,
                  source_label: selectedNode.label || "",
                  prio_mode: mode || "",
                };
                if (families) payload.families = families;
                if (window.pycmd) {
                  pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
                }
              }
              if (selectedKind === "note" && Array.isArray(selectedNode.families) && selectedNode.families.length > 1) {
                showFamilyPicker(title, selectedNode.families, doConnect);
              } else if (selectedKind === "family") {
                var fid = selectedNode.label || String(selectedNode.id).replace("family:", "");
                doConnect([fid]);
              } else if (selectedKind === "note") {
                doConnect(selectedNode.families || []);
              } else {
                doConnect([]);
              }
            };
          }
          if (selectedKind === "family") {
            connectGroup.push({
              label: "Connect selected to Family",
              cb: doConnectWithMode("Select hub families", ""),
            });
          } else if (selectedKind === "note") {
            connectGroup.push({
              label: "Connect selected: to active Family@+1",
              cb: doConnectWithMode("Select families to connect", ""),
            });
            connectGroup.push({
              label: "Connect selected: to active Family@same prio",
              cb: doConnectWithMode("Select families to connect", "same"),
            });
            if (selectedNode.prio !== undefined && selectedNode.prio !== null && Number(selectedNode.prio) > 0) {
              connectGroup.push({
                label: "Connect selected: to active Family@-1",
                cb: doConnectWithMode("Select families to connect", "minus1"),
              });
            }
          }
        }
      }
      if (selectedNode && isDifferent && isNodeFamily && isSelectedNote) {
        var hubFid2 = node.label || String(node.id).replace("family:", "");
        var activeFamilies = Array.isArray(selectedNode.families)
          ? selectedNode.families.map(function (f) { return String(f); })
          : [];
        if (hubFid2 && activeFamilies.indexOf(String(hubFid2)) === -1) {
          connectGroup.push({
            label: "Connect to Family",
            cb: function () {
              showToast("Connect family");
              var payload = {
                source: String(node.id),
                target: String(selectedId),
                source_kind: "family",
                source_label: hubFid2,
                prio_mode: "hub_zero",
              };
              if (window.pycmd) {
                pycmd("ctx:connect:" + encodeURIComponent(JSON.stringify(payload)));
              }
            },
          });
        }
      }
      groups.push(connectGroup);

      var linkInfo = { ab: false, ba: false };
      if (selectedNode && isDifferent && isNodeNote && isSelectedNote) {
        linkInfo = manualLinkInfo(String(selectedId), String(node.id));
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
                source: String(selectedId),
                target: String(node.id),
                label: selectedNode.label || "",
              };
              if (window.pycmd) {
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
                target: String(selectedId),
                label: node.label || "",
              };
              if (window.pycmd) {
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
                source: String(selectedId),
                target: String(node.id),
                source_label: selectedNode.label || "",
                target_label: node.label || "",
              };
              if (window.pycmd) {
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
          var activeFamilies2 = Array.isArray(selectedNode.families)
            ? selectedNode.families.map(function (f) { return String(f); })
            : [];
          if (hubFid && activeFamilies2.indexOf(String(hubFid)) >= 0) {
            sharedFamilies = [hubFid];
          } else {
            sharedFamilies = [];
          }
        } else {
          sharedFamilies = isSame
            ? (Array.isArray(node.families) ? node.families.slice(0) : [])
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
                  source: String(selectedId),
                  target: String(node.id),
                  source_kind: selectedKind,
                  source_label: selectedNode.label || "",
                };
                if (isNodeFamily && isSelectedNote) {
                  var hubFid3 = node.label || String(node.id).replace("family:", "");
                  payload.source = String(node.id);
                  payload.target = String(selectedId);
                  payload.source_kind = "family";
                  payload.source_label = hubFid3;
                }
                if (families && families.length) {
                  payload.families = families;
                }
                if (window.pycmd) {
                  pycmd("ctx:disconnect:" + encodeURIComponent(JSON.stringify(payload)));
                }
              }
              if (sharedFamilies.length > 1 && isSelectedNote) {
                showFamilyPicker("Select families to disconnect", sharedFamilies, doDisconnect);
              } else {
                doDisconnect(sharedFamilies);
              }
            },
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
              var payload = {
                source: String(selectedId),
                target: String(node.id),
              };
              if (window.pycmd) {
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
                target: String(selectedId),
              };
              if (window.pycmd) {
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
                source: String(selectedId),
                target: String(node.id),
              };
              if (window.pycmd) {
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
      } else if (Array.isArray(node.families)) {
        families = node.families.slice(0, 20);
      }
      families.forEach(function (fid) {
        filterGroup.push({
          label: "Filter Family: " + fid,
          cb: function () {
            showToast("Filter family");
            if (window.pycmd) pycmd("ctx:filter:" + encodeURIComponent(fid));
          },
        });
      });
      groups.push(filterGroup);

      groups.forEach(function (grp) {
        appendGroup(grp);
      });
      var e = evt || window.event;
      if (e) {
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";
      }
      menu.style.display = "block";
    }

    function hideContextMenu() {
      var menu = document.getElementById("ctx-menu");
      if (menu) menu.style.display = "none";
      ctxMenuId = null;
    }

    graphEl.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    document.addEventListener("click", function () {
      hideContextMenu();
    });
    Graph.onNodeRightClick(function (node, evt) {
      showContextMenu(node, evt);
    });
    if (typeof Graph.onBackgroundRightClick === "function") {
      Graph.onBackgroundRightClick(function () {
        hideContextMenu();
      });
    }

    function resizeGraph() {
      var rect = graphEl.getBoundingClientRect();
      Graph.width(rect.width || window.innerWidth).height(
        rect.height || window.innerHeight - 42
      );
    }
    window.addEventListener("resize", resizeGraph);
    resizeGraph();

    (function bindRebuildToast() {
      var btn = document.getElementById("btn-rebuild");
      if (!btn) return;
      btn.addEventListener("click", function () {
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
        } catch (_e) {}
        requestAnimationFrame(tick);
      }
      tick();
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
            soft_pinned: n.__soft_pinned,
            pin_x: n.__pin_x,
            pin_y: n.__pin_y,
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
            copy.__soft_pinned = p.soft_pinned;
            copy.__pin_x = p.pin_x;
            copy.__pin_y = p.pin_y;
          }
          return copy;
        });
        var newCount = 0;
        nodes.forEach(function (n) {
          if (!prevAllIds.has(String(n.id))) newCount += 1;
        });
        links = (newData.edges || []).map(function (e) {
          var copy = {};
          for (var k in e) copy[k] = e[k];
          return copy;
        });
        var addedEdges = [];
        links.forEach(function (l) {
          if (l.meta && l.meta.flow_only) return;
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          var a = String(s);
          var b = String(t);
          var key = (l.layer || "") + "|" + (a < b ? a + "|" + b : b + "|" + a);
          if (!prevKeys[key]) {
            addedEdges.push({ a: a, b: b });
          }
        });
        nodeById = {};
        nodes.forEach(function (n) {
          nodeById[String(n.id)] = n;
        });

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
        if (addedEdges.length) {
          releaseForNewEdges(addedEdges, anchors, existed);
        }
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
})();
