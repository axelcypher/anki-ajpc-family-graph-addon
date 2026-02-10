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

  function patchDottedFragmentShader(source) {
    var fs = String(source || "");
    if (!fs || fs.indexOf("gl_FragColor") < 0) return fs;
    if (fs.indexOf("AJPC_DOTTED_PATTERN") >= 0) return fs;
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
      "  // AJPC_DOTTED_PATTERN",
      "  vec2 ajpcClosestVector = getDistanceVector(v_cpA - gl_FragCoord.xy, v_cpB - gl_FragCoord.xy, v_cpC - gl_FragCoord.xy);",
      "  vec2 ajpcClosestPoint = gl_FragCoord.xy + ajpcClosestVector;",
      "  vec2 ajpcChord = v_cpC - v_cpA;",
      "  float ajpcChordLen = max(length(ajpcChord), 0.00001);",
      "  vec2 ajpcDir = ajpcChord / ajpcChordLen;",
      "  float ajpcAlongWorld = dot(ajpcClosestPoint - v_cpA, ajpcDir);",
      "  float ajpcInv = 1.0 / max(u_sizeRatio, 0.00001);",
      "  float ajpcHalfThickness = max(v_thickness * 0.5, 0.00001);",
      "  float ajpcDotRadius = min(ajpcHalfThickness * 0.78, 1.25 * ajpcInv);",
      "  float ajpcDotPeriod = max(ajpcDotRadius * 0.6, 2.2 * ajpcInv);",
      "  float ajpcDotFeather = max(v_feather * 0.42, 0.16 * ajpcInv);",
      "  float ajpcDotPos = mod(ajpcAlongWorld + (ajpcDotPeriod * 0.5), ajpcDotPeriod) - (ajpcDotPeriod * 0.5);",
      "  float ajpcAlong = abs(ajpcDotPos);",
      "  float ajpcRadial = length(ajpcClosestVector);",
      "  float ajpcDotDist = sqrt((ajpcAlong * ajpcAlong) + (ajpcRadial * ajpcRadial));",
      "  float ajpcMask = 1.0 - smoothstep(ajpcDotRadius - ajpcDotFeather, ajpcDotRadius + ajpcDotFeather, ajpcDotDist);",
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

  class AJPCDottedEdgeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def.FRAGMENT_SHADER_SOURCE) def.FRAGMENT_SHADER_SOURCE = patchDottedFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      return def;
    }
  }

  registry.edge.dotted = AJPCDottedEdgeProgram;
})();
