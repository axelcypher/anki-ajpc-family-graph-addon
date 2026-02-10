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
  if (typeof rendering.EdgeCurveProgram === "function") Base = rendering.EdgeCurveProgram;
  if (typeof Base !== "function") return;

  function patchSolidFragmentShader(source) {
    var fs = String(source || "");
    if (!fs || fs.indexOf("gl_FragColor") < 0) return fs;
    if (fs.indexOf("AJPC_SOLID_PATTERN") >= 0) return fs;
    var injection = [
      "#ifndef PICKING_MODE",
      "  // AJPC_SOLID_PATTERN",
      "  float ajpcRadial = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);",
      "  float ajpcHalfThickness = max(v_thickness * 0.5, 0.00001);",
      "  float ajpcFeather = max(v_feather, 0.00001);",
      "  float ajpcMask = 1.0 - smoothstep(ajpcHalfThickness - ajpcFeather, ajpcHalfThickness + ajpcFeather, ajpcRadial);",
      "  ajpcMask = clamp(ajpcMask, 0.0, 1.0);",
      "  if (ajpcMask <= 0.001) gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);",
      "  else {",
      "    float ajpcAlpha = v_color.a * ajpcMask;",
      "    gl_FragColor = vec4(v_color.rgb * ajpcAlpha, ajpcAlpha);",
      "  }",
      "#endif"
    ].join("\n");
    return fs.replace(/\}\s*$/, "\n" + injection + "\n}");
  }

  class AJPCCurvedEdgeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def.FRAGMENT_SHADER_SOURCE) def.FRAGMENT_SHADER_SOURCE = patchSolidFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      return def;
    }
  }

  registry.edge.curved = AJPCCurvedEdgeProgram;
})();
