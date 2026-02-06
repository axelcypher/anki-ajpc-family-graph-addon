(function () {
  "use strict";

  var Shared = window.GraphShared || {};
  var randBetween = Shared.randBetween || function (min, max) {
    return min + Math.random() * (max - min);
  };
  var debugToast = Shared.debugToast || function () { };
  var debugIf = Shared.debugIf || function (_cat, _label, cond) { return cond; };

  // --- TWEAKS (hub) ---
  var TWEAKS = {
    memberCap: 100,
    spawnRadiusRatio: 0.08,
    minSpawnRadius: 1.5,
    borderWidth: 3.0,
    borderMinWidth: 1.0,
    borderAlpha: 0.85,
  };

  function getMemberCap() {
    debugToast("hub:getMemberCap", "sim_hub");
    return TWEAKS.memberCap || 0;
  }

  function limitMembers(nodes) {
    var list = Array.isArray(nodes) ? nodes.slice() : [];
    var cap = getMemberCap();
    if (cap > 0 && list.length > cap) {
      debugToast("hub:limitMembers cap " + cap + " from " + list.length, "sim_hub");
      list = list.slice(0, cap);
    }
    return list;
  }

  function buildNoteTypeHubMembers(raw) {
    var map = {};
    (raw || []).forEach(function (entry) {
      if (debugIf("sim_hub", "hub:buildMembers missing entry", !entry || !entry.hub_id)) return;
      var nodesList = entry.nodes || [];
      nodesList.forEach(function (n) {
        if (!n) return;
        if (!n.kind) n.kind = "note";
        n.__hub_parent = String(entry.hub_id);
      });
      map[String(entry.hub_id)] = {
        nodes: nodesList,
        edges: entry.edges || [],
      };
    });
    return map;
  }

  function isNoteTypeHub(node) {
    return !!(node && node.kind === "note_type_hub");
  }

  function isHubMemberOf(node, hubNode) {
    if (!node || !hubNode) return false;
    if (!node.__hub_parent) return false;
    return String(node.__hub_parent) === String(hubNode.id);
  }

  function hubBaseRadius(node) {
    var base = 3.5;
    var count = node && node.hub_count ? node.hub_count : 1;
    var scale = 1 + Math.min(count, 50) * 0.01;
    return Math.max(base * 1.6 * scale, 6);
  }

  function hubExpandedRadius(node) {
    var count = node && node.hub_count ? node.hub_count : 1;
    var base = hubBaseRadius(node) * 3.0;
    var extra = Math.pow(Math.min(count, 5000), 0.75) * 1.6 * 1.4;
    return Math.max(base + extra, 18);
  }

  function hubPlusRadius(node) {
    return Math.max(2.5, hubBaseRadius(node) * 0.45);
  }

  function layoutHubMembers(hubNode, entry, force) {
    if (debugIf("sim_hub", "hub:layoutMembers missing args", !hubNode || !entry)) return;
    var members = limitMembers(entry.nodes || []);
    if (debugIf("sim_hub", "hub:layoutMembers empty", !members.length)) return;
    debugToast("hub:layoutMembers " + (hubNode.id || ""), "sim_hub");
    var spawnR = Math.max(TWEAKS.minSpawnRadius, hubExpandedRadius(hubNode) * TWEAKS.spawnRadiusRatio);
    members.forEach(function (n) {
      if (!n) return;
      if (!force && n.__hub_layout && n.__hub_parent === String(hubNode.id)) return;
      var ang = randBetween(0, Math.PI * 2);
      var r = randBetween(0.4, 1) * spawnR;
      n.x = hubNode.x + Math.cos(ang) * r;
      n.y = hubNode.y + Math.sin(ang) * r;
      n.__hub_layout = true;
      n.__hub_parent = String(hubNode.id);
    });
  }

  window.GraphHub = {
    TWEAKS: TWEAKS,
    getMemberCap: getMemberCap,
    limitMembers: limitMembers,
    buildNoteTypeHubMembers: buildNoteTypeHubMembers,
    isNoteTypeHub: isNoteTypeHub,
    isHubMemberOf: isHubMemberOf,
    hubBaseRadius: hubBaseRadius,
    hubExpandedRadius: hubExpandedRadius,
    hubPlusRadius: hubPlusRadius,
    layoutHubMembers: layoutHubMembers,
  };
})();
