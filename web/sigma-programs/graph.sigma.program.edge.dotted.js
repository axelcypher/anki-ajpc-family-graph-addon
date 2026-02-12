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

  function attributeItems(attrs) {
    var list = Array.isArray(attrs) ? attrs : [];
    var sum = 0;
    for (var i = 0; i < list.length; i += 1) {
      var a = list[i] || {};
      sum += a.normalized ? 1 : Number(a.size || 0);
    }
    return sum;
  }

  function patchFocusVertexShader(source) {
    var vs = String(source || "");
    if (!vs || vs.indexOf("AJPC_EDGE_FOCUS_PATCH") >= 0) return vs;
    if (!/attribute\s+float\s+a_focus\s*;/.test(vs)) {
      if (/attribute\s+vec4\s+a_id\s*;/.test(vs)) vs = vs.replace(/attribute\s+vec4\s+a_id\s*;/, "attribute vec4 a_id;\nattribute float a_focus;");
      else vs = "attribute float a_focus;\n" + vs;
    }
    if (!/varying\s+float\s+v_focus\s*;/.test(vs)) {
      if (/varying\s+vec4\s+v_color\s*;/.test(vs)) vs = vs.replace(/varying\s+vec4\s+v_color\s*;/, "varying vec4 v_color;\nvarying float v_focus;");
      else vs = "varying float v_focus;\n" + vs;
    }
    if (vs.indexOf("v_focus = a_focus;") < 0) {
      vs = vs.replace(/\}\s*$/, "  v_focus = a_focus;\n}\n// AJPC_EDGE_FOCUS_PATCH");
    }
    return vs;
  }

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
    if (!/varying\s+float\s+v_focus\s*;/.test(fs)) {
      fs = fs.replace(
        /(precision\s+(?:lowp|mediump|highp|)\s*float\s*;)/,
        "$1\nvarying float v_focus;\nuniform float u_focus_active;\nuniform float u_dim_rgb_mul;\nuniform float u_dim_alpha_mul;"
      );
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
      "    float ajpcDim = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));",
      "    float ajpcRgbMul = mix(1.0, u_dim_rgb_mul, ajpcDim);",
      "    float ajpcAlphaMul = mix(1.0, u_dim_alpha_mul, ajpcDim);",
      "    float ajpcAlpha = v_color.a * ajpcMask * ajpcAlphaMul;",
      "    gl_FragColor = vec4((v_color.rgb * ajpcRgbMul) * ajpcAlpha, ajpcAlpha);",
      "  }",
      "#endif"
    ].join("\n");
    return fs.replace(/\}\s*$/, "\n" + injection + "\n}");
  }

  class AJPCDottedEdgeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def._ajpcFocusPatched) return def;
      var attrs = Array.isArray(def.ATTRIBUTES) ? def.ATTRIBUTES.slice() : [];
      this._ajpcFocusOffset = attributeItems(attrs);
      attrs.push({ name: "a_focus", size: 1, type: WebGLRenderingContext.FLOAT });
      def.ATTRIBUTES = attrs;
      var uniforms = Array.isArray(def.UNIFORMS) ? def.UNIFORMS.slice() : [];
      if (uniforms.indexOf("u_focus_active") < 0) uniforms.push("u_focus_active");
      if (uniforms.indexOf("u_dim_rgb_mul") < 0) uniforms.push("u_dim_rgb_mul");
      if (uniforms.indexOf("u_dim_alpha_mul") < 0) uniforms.push("u_dim_alpha_mul");
      def.UNIFORMS = uniforms;
      if (def.VERTEX_SHADER_SOURCE) def.VERTEX_SHADER_SOURCE = patchFocusVertexShader(def.VERTEX_SHADER_SOURCE);
      if (def.FRAGMENT_SHADER_SOURCE) def.FRAGMENT_SHADER_SOURCE = patchDottedFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      def._ajpcFocusPatched = true;
      return def;
    }

    processVisibleItem(edgeIndex, startIndex, sourceData, targetData, edgeData) {
      super.processVisibleItem(edgeIndex, startIndex, sourceData, targetData, edgeData);
      var offset = this._ajpcFocusOffset;
      if (!isFinite(offset)) offset = 0;
      var focus = Number(edgeData && edgeData.ajpc_focus);
      if (!isFinite(focus)) focus = 0;
      this.array[startIndex + offset] = focus > 0 ? 1 : 0;
    }

    setUniforms(params, context) {
      super.setUniforms(params, context);
      var gl = context.gl;
      var uniformLocations = context.uniformLocations || {};
      var runtime = root && root.AJPCSigmaRuntime && typeof root.AJPCSigmaRuntime === "object" ? root.AJPCSigmaRuntime : null;
      var focusActive = runtime && runtime.focusDimActive !== undefined ? !!runtime.focusDimActive : false;
      var dimRgbMul = Number(runtime && runtime.focusDimRgbMul);
      if (!isFinite(dimRgbMul)) dimRgbMul = 0.58;
      var dimAlphaMul = Number(runtime && runtime.focusDimAlphaMul);
      if (!isFinite(dimAlphaMul)) dimAlphaMul = 0.16;
      if (uniformLocations.u_focus_active !== undefined && uniformLocations.u_focus_active !== null) gl.uniform1f(uniformLocations.u_focus_active, focusActive ? 1 : 0);
      if (uniformLocations.u_dim_rgb_mul !== undefined && uniformLocations.u_dim_rgb_mul !== null) gl.uniform1f(uniformLocations.u_dim_rgb_mul, dimRgbMul);
      if (uniformLocations.u_dim_alpha_mul !== undefined && uniformLocations.u_dim_alpha_mul !== null) gl.uniform1f(uniformLocations.u_dim_alpha_mul, dimAlphaMul);
    }
  }

  registry.edge.dotted = AJPCDottedEdgeProgram;
})();
