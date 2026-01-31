(function () {
  function log(msg) {
    try {
      if (window.pycmd) {
        pycmd("log:" + msg);
      }
    } catch (_e) {}
  }

  function showMsg(text) {
    var msg = document.createElement("div");
    msg.style.position = "fixed";
    msg.style.bottom = "12px";
    msg.style.left = "12px";
    msg.style.background = "#1f2937";
    msg.style.padding = "8px 10px";
    msg.style.border = "1px solid #374151";
    msg.style.borderRadius = "6px";
    msg.style.color = "#f9fafb";
    msg.style.fontSize = "12px";
    msg.innerText = text;
    document.body.appendChild(msg);
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
    var layerColors = (data.meta && data.meta.layer_colors) || {};
    var layerStyles = (data.meta && data.meta.layer_styles) || {};
    var layerFlow = (data.meta && data.meta.layer_flow) || {};
    var flowSpeed = (data.meta && data.meta.layer_flow_speed) || 0.02;
    var autoRefOpacity =
      data.meta && data.meta.reference_auto_opacity !== undefined
        ? data.meta.reference_auto_opacity
        : 1.0;
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
    var neighborMap = {};
    var activeNodes = [];
    var activeLinks = [];
    var frozenLayout = false;

    function linkIds(l) {
      var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
      var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
      return { s: String(s), t: String(t) };
    }

    function isConnected(id) {
      if (!selectedId) return true;
      if (id === selectedId) return true;
      var set = neighborMap[selectedId];
      return set && set.has(id);
    }

    function isLinkConnected(l) {
      if (!selectedId) return true;
      var ids = linkIds(l);
      return ids.s === selectedId || ids.t === selectedId;
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
        var c = layerColor(l.layer, layerColors);
        if (l.layer === "reference" && l.meta && l.meta.manual === false) {
          return colorWithAlpha(c, autoRefOpacity);
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
        var style = layerStyles[l.layer] || "solid";
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
        if (!layerFlow[l.layer]) return 0;
        return 2;
      })
      .linkDirectionalParticleSpeed(function (l) {
        if (!layerFlow[l.layer]) return 0;
        var s = l.source || {};
        var t = l.target || {};
        var dx = (s.x || 0) - (t.x || 0);
        var dy = (s.y || 0) - (t.y || 0);
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        return flowSpeed / Math.max(30, len);
      })
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(function (l) {
        var alpha = 0.7;
        if (l.layer === "reference" && l.meta && l.meta.manual === false) {
          alpha = Math.min(1, alpha * autoRefOpacity);
        }
        if (l.meta && l.meta.same_prio) {
          alpha = Math.min(1, alpha * samePrioOpacity);
        }
        var col = colorWithAlpha(layerColor(l.layer, layerColors), alpha);
        if (!isLinkConnected(l)) {
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
      node.__pinned = true;
    });
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
      var connected = isConnected(String(node.id));
      var color = nodeColor(node, noteTypeColors, layerColors);
      var deg = node.__deg || 0;
      var scale = 1 + Math.min(deg, 20) * 0.08;
      var baseR = 3.5;
      var radius = baseR * scale;
      var t = Date.now() / 600;
      var pulse = connected ? 1 + 0.1 * Math.sin(t + (node.id || 0)) : 1;
      var haloR = radius * 1.3 * pulse;
      var alpha = connected ? 1 : 0.2;
      if (connected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, 2 * Math.PI);
        ctx.fillStyle = colorWithAlpha(color, 0.5 * alpha);
        ctx.fill();
        ctx.lineWidth = 0.25;
        ctx.strokeStyle = colorWithAlpha(color, 0.75 * alpha);
        ctx.stroke();
        if (selectedId && String(node.id) === selectedId) {
          var ringR = haloR + 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, 2 * Math.PI);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = colorWithAlpha(color, 0.9);
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
      ctx.fillStyle = connected ? color : applyDim(color, 0.2);
      ctx.fill();
    }).nodeCanvasObjectMode(function () {
      return "replace";
    });

    if (typeof Graph.onRenderFramePost === "function") {
      Graph.onRenderFramePost(function (ctx, globalScale) {
        var data = Graph.graphData();
        if (!data || !data.nodes) return;
        var z = globalScale || 1;
        var cap = 3;
        var base = 8;
        var fontSize = (base * Math.min(z, cap)) / z;
        if (z < 0.25) return;
        ctx.save();
        ctx.font = fontSize + "px Arial";
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
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
          ctx.fillText(label, node.x, node.y - offset);
        });
        ctx.restore();
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
      activeNodes = nodes.filter(function (n) {
        if (n.kind === "family" && !isLayerEnabled("family_hub")) return false;
        return isNoteTypeVisible(n);
      });
      var activeIds = {};
      activeNodes.forEach(function (n) {
        activeIds[String(n.id)] = true;
      });
      activeLinks = links.filter(function (l) {
        if (!isLayerEnabled(l.layer)) return false;
        var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
        var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
        return activeIds[String(s)] && activeIds[String(t)];
      });
      if (activeLinks.length) {
        var linkIds = {};
        activeLinks.forEach(function (l) {
          var s = l.source && typeof l.source === "object" ? l.source.id : l.source;
          var t = l.target && typeof l.target === "object" ? l.target.id : l.target;
          linkIds[String(s)] = true;
          linkIds[String(t)] = true;
        });
        activeNodes = activeNodes.filter(function (n) {
          return linkIds[String(n.id)];
        });
      }
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
      log(
        "filters applied nodes=" +
          activeNodes.length +
          " edges=" +
          activeLinks.length
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
    }

    function refreshSelection() {
      // Selection should not reheat physics; just ensure a redraw loop is active.
      if (typeof Graph.resumeAnimation === "function") {
        Graph.resumeAnimation();
      }
    }

    function freezeNodes() {
      frozenLayout = true;
      activeNodes.forEach(function (n) {
        if (n.__pinned) return;
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
          if (!n.__pinned) {
            n.fx = null;
            n.fy = null;
          }
        }
      });
    }

    for (var k in layerState) {
      if (layerState[k]) {
        layerState[k].addEventListener("change", function () {
          storeLayers();
          applyFilters({ reheat: true });
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
      var btn = document.getElementById("btn-note-types");
      var panel = document.getElementById("note-type-panel");
      var list = document.getElementById("note-type-list");
      if (!btn || !panel || !list) return;
      var panelStateKey = "ajpc_graph_ntpanel_open";
      btn.addEventListener("click", function () {
        panel.classList.toggle("open");
        var layerPanel = document.getElementById("layer-panel");
        var physPanel = document.getElementById("physics-panel");
        if (layerPanel) layerPanel.classList.remove("open");
        if (physPanel) physPanel.classList.remove("open");
        try {
          localStorage.setItem(
            panelStateKey,
            panel.classList.contains("open") ? "1" : "0"
          );
        } catch (_e) {}
      });
      try {
        if (localStorage.getItem(panelStateKey) === "1") {
          panel.classList.add("open");
        }
      } catch (_e) {}
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
            applyFilters({ reheat: false });
          });
          updateVisibility();
        });
    }

    function setupLayerPanel() {
      var btn = document.getElementById("btn-layers");
      var panel = document.getElementById("layer-panel");
      var list = document.getElementById("layer-color-list");
      if (!btn || !panel || !list) return;
      var key = "ajpc_graph_layerpanel_open";
      btn.addEventListener("click", function () {
        panel.classList.toggle("open");
        var notePanel = document.getElementById("note-type-panel");
        var physPanel = document.getElementById("physics-panel");
        if (notePanel) notePanel.classList.remove("open");
        if (physPanel) physPanel.classList.remove("open");
        try {
          localStorage.setItem(
            key,
            panel.classList.contains("open") ? "1" : "0"
          );
        } catch (_e) {}
      });
      try {
        if (localStorage.getItem(key) === "1") {
          panel.classList.add("open");
        }
      } catch (_e) {}
      list.innerHTML = "";
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
      });
      var tlabel = document.createElement("span");
      tlabel.textContent = "Same-priority links";
      toggleRow.appendChild(toggle);
      toggleRow.appendChild(tlabel);
      list.appendChild(toggleRow);
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
      });
      var chainLabel = document.createElement("span");
      chainLabel.textContent = "Chain family levels";
      chainRow.appendChild(chainToggle);
      chainRow.appendChild(chainLabel);
      list.appendChild(chainRow);
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
      });
      autoRow.appendChild(autoLabel);
      autoRow.appendChild(autoRange);
      autoRow.appendChild(autoInput);
      list.appendChild(autoRow);
      var layers = ["family", "family_hub", "reference", "example", "kanji"];
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
        });
        row.appendChild(label);
        row.appendChild(color);
        row.appendChild(style);
        row.appendChild(flow);
        list.appendChild(row);
      });

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
      });
      opRow.appendChild(opLabel);
      opRow.appendChild(opRange);
      opRow.appendChild(opInput);
      list.appendChild(opRow);
      opRow.style.display = toggle.checked ? "flex" : "none";
      toggle.addEventListener("change", function () {
        opRow.style.display = toggle.checked ? "flex" : "none";
      });
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
      if (!input || !btn) return;
      function runSearch() {
        var q = (input.value || "").trim();
        if (!q) return;
        var lower = q.toLowerCase();
        var data = Graph.graphData() || { nodes: [] };
        var nodes = data.nodes || [];
        var hit = null;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var label = (n.label || "").toLowerCase();
          if (label.indexOf(lower) >= 0 || String(n.id).indexOf(q) >= 0) {
            hit = n;
            break;
          }
        }
        if (!hit) {
          showMsg("No matching note found.");
          log("search miss " + q);
          return;
        }
        if (typeof Graph.centerAt === "function") {
          Graph.centerAt(hit.x, hit.y, 800);
        }
        if (typeof Graph.zoom === "function") {
          Graph.zoom(2, 800);
        }
        log("search hit " + hit.id);
      }
      btn.addEventListener("click", runSearch);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          runSearch();
        }
      });
    }

    loadLayers();
    setupNoteTypePanel();
    setupLayerPanel();
    setupPhysicsPanel();
    setupDeckDropdown();
    setupSearch();
    applyFilters({ reheat: true });
    (function syncPanels() {
      var notePanel = document.getElementById("note-type-panel");
      var layerPanel = document.getElementById("layer-panel");
      var physPanel = document.getElementById("physics-panel");
      if (physPanel && physPanel.classList.contains("open")) {
        if (notePanel) notePanel.classList.remove("open");
        if (layerPanel) layerPanel.classList.remove("open");
        return;
      }
      if (notePanel && notePanel.classList.contains("open")) {
        if (layerPanel) layerPanel.classList.remove("open");
      }
      if (layerPanel && layerPanel.classList.contains("open")) {
        if (notePanel) notePanel.classList.remove("open");
      }
    })();

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


    function bindRange(key, rangeId, numId) {
      var range = document.getElementById(rangeId);
      var num = document.getElementById(numId);
      if (!range || !num) return;
      var setVal = function (val) {
        if (isNaN(val)) return;
        physics[key] = val;
        range.value = val;
        num.value = val;
        applyPhysics();
      };
      range.addEventListener("input", function () {
        setVal(parseFloat(range.value));
      });
      num.addEventListener("change", function () {
        setVal(parseFloat(num.value));
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
      var btn = document.getElementById("btn-physics");
      var panel = document.getElementById("physics-panel");
      if (btn && panel) {
        var key = "ajpc_graph_physics_panel";
        btn.addEventListener("click", function () {
          panel.classList.toggle("open");
          var notePanel = document.getElementById("note-type-panel");
          var layerPanel = document.getElementById("layer-panel");
          if (notePanel) notePanel.classList.remove("open");
          if (layerPanel) layerPanel.classList.remove("open");
          try {
            localStorage.setItem(
              key,
              panel.classList.contains("open") ? "1" : "0"
            );
          } catch (_e) {}
        });
        try {
          if (localStorage.getItem(key) === "1") {
            panel.classList.add("open");
          }
        } catch (_e) {}
      }
      bindRange("charge", "phys-charge", "phys-charge-num");
      bindRange(
        "link_distance",
        "phys-link-distance",
        "phys-link-distance-num"
      );
      bindRange(
        "link_strength",
        "phys-link-strength",
        "phys-link-strength-num"
      );
      bindRange("velocity_decay", "phys-vel-decay", "phys-vel-decay-num");
      bindRange("alpha_decay", "phys-alpha-decay", "phys-alpha-decay-num");
      bindRange("max_radius", "phys-max-radius", "phys-max-radius-num");
      bindRange("cooldown_ticks", "phys-cooldown", "phys-cooldown-num");
      bindRange("warmup_ticks", "phys-warmup", "phys-warmup-num");
      var resetBtn = document.getElementById("phys-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          physics = Object.assign({}, physicsDefaults);
          setControlValue("phys-charge", "phys-charge-num", physics.charge);
          setControlValue(
            "phys-link-distance",
            "phys-link-distance-num",
            physics.link_distance
          );
          setControlValue(
            "phys-link-strength",
            "phys-link-strength-num",
            physics.link_strength
          );
          setControlValue(
            "phys-vel-decay",
            "phys-vel-decay-num",
            physics.velocity_decay
          );
          setControlValue(
            "phys-alpha-decay",
            "phys-alpha-decay-num",
            physics.alpha_decay
          );
          setControlValue(
            "phys-max-radius",
            "phys-max-radius-num",
            physics.max_radius
          );
          setControlValue(
            "phys-cooldown",
            "phys-cooldown-num",
            physics.cooldown_ticks
          );
          setControlValue(
            "phys-warmup",
            "phys-warmup-num",
            physics.warmup_ticks
          );
          applyPhysics();
        });
      }
      applyPhysics();
    }

    function showContextMenu(node, evt) {
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;
      menu.innerHTML = "";
      function addItem(label, cb) {
        var div = document.createElement("div");
        div.className = "item";
        div.textContent = label;
        div.addEventListener("click", function () {
          cb();
          hideContextMenu();
        });
        menu.appendChild(div);
      }
      if (node.kind !== "family") {
        addItem("Open Preview", function () {
          if (window.pycmd) pycmd("ctx:preview:" + node.id);
        });
        addItem("Open Editor", function () {
          if (window.pycmd) pycmd("ctx:edit:" + node.id);
        });
      }
      var families = [];
      if (node.kind === "family") {
        families = [node.label || String(node.id).replace("family:", "")];
      } else if (Array.isArray(node.families)) {
        families = node.families.slice(0, 20);
      }
      families.forEach(function (fid) {
        addItem("Filter Family: " + fid, function () {
          if (window.pycmd)
            pycmd("ctx:filter:" + encodeURIComponent(fid));
        });
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
    log("graph render ready");
  }

  window.ajpcGraphInit = initGraph;
  log("graph.js loaded");
})();
