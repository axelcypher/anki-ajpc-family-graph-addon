(function () {
  "use strict";

  var wrapId = "debug-toast-wrap";
  var frontId = "debug-toast-container";
  var backId = "debug-toast-container-backend";
  var styleId = "debug-toast-style";
  var wrap = null;
  var frontCol = null;
  var backCol = null;
  var styleEl = null;
  var overrideEnabled = null;
  var defaultEnabled = true;
  var levelOrder = ["trace", "debug", "info", "warn", "error"];
  var levelIndex = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
  var levelEnabled = { trace: true, debug: true, info: true, warn: true, error: true };
  var durationMs = 5000;
  var lineSeparator = "--------------------------------";

  function isEnabled() {
    if (overrideEnabled !== null) return !!overrideEnabled;
    if (typeof window.DebugEnabled !== "undefined") return !!window.DebugEnabled;
    return defaultEnabled;
  }

  function setEnabled(val) {
    overrideEnabled = !!val;
  }

  function clearOverride() {
    overrideEnabled = null;
  }

  function normalizeLevel(level) {
    var lvl = (level || "trace");
    lvl = String(lvl).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(levelIndex, lvl)) return "trace";
    return lvl;
  }

  function isLevelEnabled(level) {
    if (!isEnabled()) return false;
    var lvl = normalizeLevel(level);
    if (typeof window.DebugLevels === "object" && window.DebugLevels) {
      if (Object.prototype.hasOwnProperty.call(window.DebugLevels, lvl)) {
        return !!window.DebugLevels[lvl];
      }
    }
    if (Object.prototype.hasOwnProperty.call(levelEnabled, lvl)) {
      return !!levelEnabled[lvl];
    }
    return true;
  }

  function setLevelEnabled(level, val) {
    var lvl = normalizeLevel(level);
    levelEnabled[lvl] = !!val;
  }

  function setLevels(map) {
    if (!map || typeof map !== "object") return;
    levelOrder.forEach(function (lvl) {
      if (Object.prototype.hasOwnProperty.call(map, lvl)) {
        levelEnabled[lvl] = !!map[lvl];
      }
    });
  }

  function getLevels() {
    return {
      trace: !!levelEnabled.trace,
      debug: !!levelEnabled.debug,
      info: !!levelEnabled.info,
      warn: !!levelEnabled.warn,
      error: !!levelEnabled.error,
    };
  }

  function setDuration(ms) {
    if (typeof ms !== "number" || !isFinite(ms)) return;
    durationMs = Math.max(0, ms);
  }

  function getDuration() {
    return durationMs;
  }

  function ensureStyle() {
    if (styleEl && styleEl.parentNode) return;
    styleEl = document.getElementById(styleId);
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent =
      "#" + wrapId + "{" +
      "position:fixed;left:12px;bottom:12px;z-index:50;display:flex;flex-direction:row;align-items:flex-end;gap:10px;pointer-events:none;max-width:760px;" +
      "}" +
      "#" + frontId + ",#" + backId + "{" +
      "display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:360px;" +
      "}" +
      "." + "debug-toast{" +
      "background:#3b0a0a;border:1px solid #7f1d1d;color:#fecaca;font-size:12px;padding:8px 10px;border-radius:6px;" +
      "transform:translateY(120%);opacity:0;transition:transform 0.28s ease,opacity 0.28s ease;" +
      "}" +
      ".debug-toast-backend{" +
      "background:#0b3b1c;border:1px solid #166534;color:#dcfce7;" +
      "}" +
      ".debug-toast-sep{" +
      "background:#5c4b00;border:1px solid #facc15;color:#fef3c7;" +
      "}" +
      ".debug-toast.show{transform:translateY(0);opacity:1;}" +
      ".debug-toast.hide{transform:translateY(120%);opacity:0;}";
    document.head.appendChild(styleEl);
  }

  function ensureColumns() {
    if (frontCol && backCol && frontCol.parentNode && backCol.parentNode) {
      return { front: frontCol, back: backCol };
    }
    wrap = document.getElementById(wrapId);
    frontCol = document.getElementById(frontId);
    backCol = document.getElementById(backId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = wrapId;
      document.body.appendChild(wrap);
    }
    if (frontCol && frontCol.parentNode !== wrap) {
      wrap.appendChild(frontCol);
    }
    if (!frontCol) {
      frontCol = document.createElement("div");
      frontCol.id = frontId;
      wrap.appendChild(frontCol);
    }
    if (backCol && backCol.parentNode !== wrap) {
      wrap.appendChild(backCol);
    }
    if (!backCol) {
      backCol = document.createElement("div");
      backCol.id = backId;
      wrap.appendChild(backCol);
    }
    return { front: frontCol, back: backCol };
  }

  function trimStackPath(raw) {
    if (!raw) return raw;
    var cleaned = String(raw).trim();
    function trimInner(val) {
      var out = String(val || "");
      var marker = "addons21/ajpc-family-graph_dev/";
      var idx = out.indexOf(marker);
      if (idx >= 0) return out.slice(idx + marker.length).replace(/\)+$/, "").trim();
      marker = "_addons/ajpc-family-graph_dev/";
      idx = out.indexOf(marker);
      if (idx >= 0) return out.slice(idx + marker.length).replace(/\)+$/, "").trim();
      return out.replace(/^https?:\/\/[^/]+\//, "").replace(/\)+$/, "").trim();
    }
    var open = cleaned.indexOf("(");
    var close = cleaned.lastIndexOf(")");
    if (open >= 0 && close > open) {
      var head = cleaned.slice(0, open).trim();
      var inner = cleaned.slice(open + 1, close).trim();
      var loc = trimInner(inner);
      if (head.indexOf("at ") === 0) head = head.slice(3).trim();
      return head ? (head + " [" + loc + "]") : ("[" + loc + "]");
    }
    var locOnly = trimInner(cleaned);
    return "[" + locOnly + "]";
  }

  function show(text, ttl, extraClass, target, level) {
    if (!isLevelEnabled(level)) return;
    ensureStyle();
    var cols = ensureColumns();
    var bucket = (target === "backend" ? cols.back : cols.front);
    if (!bucket) return;
    var msg = document.createElement("div");
    msg.className = "debug-toast" + (extraClass ? (" " + extraClass) : "");
    var loc = "";
    try {
      var stack = new Error().stack || "";
      var line = stack.split("\n")[2] || "";
      loc = trimStackPath(line.trim());
    } catch (_e) {}
    msg.textContent = text + (loc ? (" @ " + loc) : "");
    bucket.appendChild(msg);
    requestAnimationFrame(function () {
      msg.classList.add("show");
    });
    var delay = typeof ttl === "number" ? ttl : durationMs;
    setTimeout(function () {
      msg.classList.remove("show");
      msg.classList.add("hide");
      setTimeout(function () {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 300);
    }, delay);
  }

  function log(level, text, opts) {
    var target = opts && opts.target ? opts.target : "frontend";
    var ttl = opts && typeof opts.ttl === "number" ? opts.ttl : undefined;
    var extraClass = opts && opts.extraClass ? opts.extraClass : "";
    show(text, ttl, extraClass, target, level);
  }

  function separator(level, target) {
    show(lineSeparator, undefined, "debug-toast-sep", target || "frontend", level);
  }

  function pipelineEnd(_label, level) {
    separator(level || "trace", "frontend");
  }

  function showBackend(text, ttl, level) {
    show(text, ttl, "debug-toast-backend", "backend", level);
  }

  function pipelineEndBackend(_label, level) {
    separator(level || "trace", "backend");
  }

  window.DebugToast = {
    show: show,
    log: log,
    separator: separator,
    showBackend: showBackend,
    pipelineEnd: pipelineEnd,
    pipelineEndBackend: pipelineEndBackend,
    trimStackPath: trimStackPath,
    isEnabled: isEnabled,
    isLevelEnabled: isLevelEnabled,
    setEnabled: setEnabled,
    clearOverride: clearOverride,
    setLevelEnabled: setLevelEnabled,
    setLevels: setLevels,
    getLevels: getLevels,
    setDuration: setDuration,
    getDuration: getDuration,
  };
})();
