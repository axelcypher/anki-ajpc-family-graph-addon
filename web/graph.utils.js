"use strict";

var LAYER_ORDER = Object.freeze([
  "notes",
  "priority",
  "families",
  "note_links",
  "examples",
  "mass_links",
  "kanji"
]);

var LAYER_ORDER_INDEX = (function buildLayerOrderIndex() {
  var out = {};
  LAYER_ORDER.forEach(function (layer, idx) {
    out[String(layer)] = idx;
  });
  return out;
})();

function layerOrderRank(layer) {
  var key = String(layer || "");
  if (Object.prototype.hasOwnProperty.call(LAYER_ORDER_INDEX, key)) {
    return Number(LAYER_ORDER_INDEX[key]);
  }
  return 9999;
}

function compareLayerOrder(a, b) {
  var ak = String(a || "");
  var bk = String(b || "");
  var ar = layerOrderRank(ak);
  var br = layerOrderRank(bk);
  if (ar !== br) return ar - br;
  return ak.localeCompare(bk);
}

function orderedLayerKeys(keys) {
  var arr = Array.isArray(keys) ? keys.slice() : [];
  arr.sort(compareLayerOrder);
  return arr;
}
function byId(id) {
  return document.getElementById(id);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function isFiniteNumber(value) {
  return typeof value === "number" && isFinite(value);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function humanizeLayer(layer) {
  var raw = String(layer || "").replace(/_/g, " ").trim();
  if (!raw) return "unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function fallbackLayerColor(layer) {
  var key = String(layer || "");
  if (key === "notes") return "#3d95e7";
  if (key === "priority") return "#6ee7b7";
  if (key === "families") return "#34d399";
  if (key === "note_links") return "#f59e0b";
  if (key === "mass_links") return "#f97316";
  if (key === "examples") return "#60a5fa";
  if (key === "kanji") return "#f87171";
  if (key === "family") return "#6ee7b7";
  if (key === "family_hub") return "#34d399";
  if (key === "reference") return "#f59e0b";
  if (key === "mass_linker") return "#f97316";
  if (key === "example") return "#60a5fa";
  return "#94a3b8";
}

function parseColor(color, fallbackAlpha) {
  var alpha = fallbackAlpha === undefined ? 1 : fallbackAlpha;
  if (!color) return [148 / 255, 163 / 255, 184 / 255, alpha];
  var c = String(color).trim();

  var shortHex = c.match(/^#([a-fA-F0-9]{3})$/);
  if (shortHex) {
    c = "#"
      + shortHex[1].charAt(0) + shortHex[1].charAt(0)
      + shortHex[1].charAt(1) + shortHex[1].charAt(1)
      + shortHex[1].charAt(2) + shortHex[1].charAt(2);
  }

  var hex = c.match(/^#([a-fA-F0-9]{6})$/);
  if (hex) {
    var h = hex[1];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      alpha
    ];
  }

  var rgb = c.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (rgb) {
    return [
      clamp(parseInt(rgb[1], 10), 0, 255) / 255,
      clamp(parseInt(rgb[2], 10), 0, 255) / 255,
      clamp(parseInt(rgb[3], 10), 0, 255) / 255,
      alpha
    ];
  }

  var rgba = c.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/i);
  if (rgba) {
    return [
      clamp(parseInt(rgba[1], 10), 0, 255) / 255,
      clamp(parseInt(rgba[2], 10), 0, 255) / 255,
      clamp(parseInt(rgba[3], 10), 0, 255) / 255,
      clamp(parseFloat(rgba[4]), 0, 1)
    ];
  }

  return [148 / 255, 163 / 255, 184 / 255, alpha];
}

function normalizeHexColor(color, fallback) {
  var c = String(color || "").trim();
  if (/^#[a-fA-F0-9]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[a-fA-F0-9]{3}$/.test(c)) {
    return (
      "#"
      + c.charAt(1) + c.charAt(1)
      + c.charAt(2) + c.charAt(2)
      + c.charAt(3) + c.charAt(3)
    ).toLowerCase();
  }
  if (/^rgba?\(/i.test(c)) {
    var parsed = parseColor(c, 1);
    var r = clamp(Math.round(Number(parsed[0] || 0) * 255), 0, 255);
    var g = clamp(Math.round(Number(parsed[1] || 0) * 255), 0, 255);
    var b = clamp(Math.round(Number(parsed[2] || 0) * 255), 0, 255);
    var toHex2 = function (n) {
      var h = Number(n).toString(16);
      return h.length < 2 ? ("0" + h) : h;
    };
    return ("#" + toHex2(r) + toHex2(g) + toHex2(b)).toLowerCase();
  }
  return fallback || "#93c5fd";
}

function hashCode(str) {
  var h = 0;
  var s = String(str || "");
  var i;
  for (i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function seededPos(id) {
  var h = Math.abs(hashCode(id));
  var angle = (h % 3600) * (Math.PI / 1800);
  var space = (typeof SPACE_SIZE === "number" && isFinite(SPACE_SIZE) && SPACE_SIZE > 0) ? Number(SPACE_SIZE) : 4096;
  var radiusMin = Math.max(space * 0.05, 64);
  var radiusSpan = Math.max(space * 0.22, 256);
  var radius = radiusMin + (h % Math.floor(radiusSpan));
  var cx = space / 2;
  var cy = space / 2;
  var x = cx + (Math.cos(angle) * radius);
  var y = cy + (Math.sin(angle) * radius);
  return [x, y];
}
