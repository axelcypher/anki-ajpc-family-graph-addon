"use strict";
(function () {
  var root = window;
  var registry = root.AJPCSigmaPrograms || (root.AJPCSigmaPrograms = { edge: {}, node: {} });
  registry.edge = registry.edge || {};
  registry.node = registry.node || {};

  var sigma = root.Sigma || null;
  var rendering = sigma && sigma.rendering ? sigma.rendering : null;
  if (!rendering) return;

  var Base = null;
  if (typeof rendering.NodeCircleProgram === "function") {
    Base = rendering.NodeCircleProgram;
  } else if (typeof rendering.NodePointProgram === "function") {
    Base = rendering.NodePointProgram;
  }
  if (typeof Base !== "function") return;

  class AJPCHubNodeProgram extends Base {}

  registry.node.hub = AJPCHubNodeProgram;
})();
