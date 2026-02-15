"use strict";

// Tooltip UI module (extracted from graph.city.ui.js).

function tooltipHtml(node) {
  var parts = [];
  parts.push(renderHtmlTemplate(
    `<div class="tip-title">{{title}}</div>`,
    { title: (node.label || node.id) }
  ));

  if (node.note_type) {
    parts.push(renderHtmlTemplate(
      `<div class="tip-muted">{{value}}</div>`,
      { value: node.note_type }
    ));
  } else if (node.kind) {
    parts.push(renderHtmlTemplate(
      `<div class="tip-muted">{{value}}</div>`,
      { value: node.kind }
    ));
  }

  if (Array.isArray(node.layers) && node.layers.length) {
    parts.push(renderHtmlTemplate(
      `<div>Layers: {{value}}</div>`,
      { value: node.layers.join(", ") }
    ));
  }

  if (Array.isArray(node.extra) && node.extra.length) {
    var ntid = String(node.note_type_id || "");
    var nt = STATE.noteTypes[ntid];
    var allowed = nt && Array.isArray(nt.tooltipFields) && nt.tooltipFields.length
      ? new Set(nt.tooltipFields)
      : null;
    var filtered = allowed
      ? node.extra.filter(function (entry) { return allowed.has(String(entry.name || "")); })
      : node.extra;
    var maxRows = 4;
    var rows = filtered.slice(0, maxRows).map(function (entry) {
      return renderHtmlTemplate(
        `<div>
          <strong>{{name}}:</strong> {{value}}
        </div>`,
        {
          name: (entry.name || ""),
          value: (entry.value || "")
        }
      );
    });
    parts.push(rows.join(""));
    if (filtered.length > maxRows) {
      parts.push(renderHtmlTemplate(
        `<div class="tip-muted">+ {{count}} more fields</div>`,
        { count: (filtered.length - maxRows) }
      ));
    }
  }

  return parts.join("");
}

function showTooltip(node, event) {
  if (!DOM.hoverTip || !node) return;
  var nodeId = String(node.id || "");
  if (String(DOM.hoverTip.__nodeId || "") !== nodeId) {
    DOM.hoverTip.innerHTML = tooltipHtml(node);
    DOM.hoverTip.__nodeId = nodeId;
  }
  DOM.hoverTip.classList.add("is-visible");

  var cx = event && typeof event.clientX === "number" ? Number(event.clientX) : NaN;
  var cy = event && typeof event.clientY === "number" ? Number(event.clientY) : NaN;
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    cx = Number(STATE.pointerClientX);
    cy = Number(STATE.pointerClientY);
  }
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    var panelRect = DOM.graphPanel ? DOM.graphPanel.getBoundingClientRect() : null;
    if (panelRect) {
      cx = panelRect.left + (panelRect.width * 0.5);
      cy = panelRect.top + (panelRect.height * 0.5);
    }
  }
  if (isFiniteNumber(cx) && isFiniteNumber(cy)) {
    DOM.hoverTip.style.left = (cx + 14) + "px";
    DOM.hoverTip.style.top = (cy + 14) + "px";
  }
  setHoverDebug("tooltip-show", {
    nodeId: node.id,
    noteType: node.note_type || node.kind || "",
    pointerX: cx,
    pointerY: cy
  });
}

function moveTooltip(clientX, clientY) {
  if (!DOM.hoverTip) return;
  if (!DOM.hoverTip.classList.contains("is-visible")) return;
  var cx = Number(clientX);
  var cy = Number(clientY);
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) return;
  DOM.hoverTip.style.left = (cx + 14) + "px";
  DOM.hoverTip.style.top = (cy + 14) + "px";
}

function hideTooltip() {
  if (!DOM.hoverTip) return;
  DOM.hoverTip.classList.remove("is-visible");
  DOM.hoverTip.__nodeId = "";
}

