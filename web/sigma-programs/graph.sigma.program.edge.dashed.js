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

  function patchDashedFragmentShader(source) {
    var fs = String(source || "");
    if (!fs || fs.indexOf("gl_FragColor") < 0) return fs;
    if (fs.indexOf("AJPC_DASHED_PATTERN") >= 0) return fs;
    if (fs.indexOf("uniform float u_sizeRatio;") < 0) {
      fs = fs.replace(
        /(precision\s+(?:lowp|mediump|highp)\s+float\s*;)/,
        "$1\nuniform float u_sizeRatio;"
      );
      if (fs.indexOf("uniform float u_sizeRatio;") < 0) {
        fs = fs.replace(
          /(precision\s+float\s*;)/,
          "$1\nuniform float u_sizeRatio;"
        );
      }
    }
    var injection = [
      "#ifndef PICKING_MODE",
      "  // AJPC_DASHED_PATTERN",
      "  vec2 ajpcClosestVector = getDistanceVector(v_cpA - gl_FragCoord.xy, v_cpB - gl_FragCoord.xy, v_cpC - gl_FragCoord.xy);",
      "  vec2 ajpcClosestPoint = gl_FragCoord.xy + ajpcClosestVector;",
      "  vec2 ajpcChord = v_cpC - v_cpA;",
      "  float ajpcChordLen = max(length(ajpcChord), 0.00001);",
      "  vec2 ajpcDir = ajpcChord / ajpcChordLen;",
      "  float ajpcAlongWorld = dot(ajpcClosestPoint - v_cpA, ajpcDir);",
      "  float ajpcRadial = length(ajpcClosestVector);",
      "  float ajpcInv = 1.0 / max(u_sizeRatio, 0.00001);",
      "  float ajpcHalfThickness = max(v_thickness * 0.5, 0.00001);",
      "  float ajpcDashPeriod = max(ajpcHalfThickness * 10.5, 10.0 * ajpcInv);",
      "  float ajpcDashOn = ajpcDashPeriod * 0.64;",
      "  float ajpcDashCenter = ajpcDashOn * 0.5;",
      "  float ajpcDashPos = mod(ajpcAlongWorld, ajpcDashPeriod);",
      "  float ajpcAlong = abs(ajpcDashPos - ajpcDashCenter);",
      "  float ajpcDashHalf = ajpcDashOn * 0.5;",
      "  float ajpcFeather = max(v_feather * 0.52, 0.18 * ajpcInv);",
      "  float ajpcMaskAlong = 1.0 - smoothstep(ajpcDashHalf - ajpcFeather, ajpcDashHalf + ajpcFeather, ajpcAlong);",
      "  float ajpcMaskRadial = 1.0 - smoothstep(ajpcHalfThickness - ajpcFeather, ajpcHalfThickness + ajpcFeather, ajpcRadial);",
      "  float ajpcMask = clamp(ajpcMaskAlong * ajpcMaskRadial, 0.0, 1.0);",
      "  if (ajpcMask <= 0.001) gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);",
      "  else {",
      "    float ajpcAlpha = v_color.a * ajpcMask;",
      "    gl_FragColor = vec4(v_color.rgb * ajpcAlpha, ajpcAlpha);",
      "  }",
      "#endif"
    ].join("\n");
    return fs.replace(/\}\s*$/, "\n" + injection + "\n}");
  }

  class AJPCDashedEdgeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def.FRAGMENT_SHADER_SOURCE) def.FRAGMENT_SHADER_SOURCE = patchDashedFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      return def;
    }
  }

  registry.edge.dashed = AJPCDashedEdgeProgram;
})();
