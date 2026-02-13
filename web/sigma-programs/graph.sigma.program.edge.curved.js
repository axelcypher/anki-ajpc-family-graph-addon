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
      if (/attribute\s+vec4\s+a_id\s*;/.test(vs)) vs = vs.replace(/attribute\s+vec4\s+a_id\s*;/, "attribute vec4 a_id;\nattribute float a_focus;\nattribute float a_flow;\nattribute float a_bidir;");
      else vs = "attribute float a_focus;\n" + vs;
      if (!/attribute\s+float\s+a_flow\s*;/.test(vs)) vs = "attribute float a_flow;\n" + vs;
      if (!/attribute\s+float\s+a_bidir\s*;/.test(vs)) vs = "attribute float a_bidir;\n" + vs;
    }
    if (!/attribute\s+float\s+a_flow\s*;/.test(vs)) {
      if (/attribute\s+float\s+a_focus\s*;/.test(vs)) vs = vs.replace(/attribute\s+float\s+a_focus\s*;/, "attribute float a_focus;\nattribute float a_flow;");
      else vs = "attribute float a_flow;\n" + vs;
    }
    if (!/attribute\s+float\s+a_bidir\s*;/.test(vs)) {
      if (/attribute\s+float\s+a_flow\s*;/.test(vs)) vs = vs.replace(/attribute\s+float\s+a_flow\s*;/, "attribute float a_flow;\nattribute float a_bidir;");
      else if (/attribute\s+float\s+a_focus\s*;/.test(vs)) vs = vs.replace(/attribute\s+float\s+a_focus\s*;/, "attribute float a_focus;\nattribute float a_bidir;");
      else vs = "attribute float a_bidir;\n" + vs;
    }
    if (!/varying\s+float\s+v_focus\s*;/.test(vs)) {
      if (/varying\s+vec4\s+v_color\s*;/.test(vs)) vs = vs.replace(/varying\s+vec4\s+v_color\s*;/, "varying vec4 v_color;\nvarying float v_focus;\nvarying float v_flow;\nvarying float v_bidir;");
      else vs = "varying float v_focus;\n" + vs;
      if (!/varying\s+float\s+v_flow\s*;/.test(vs)) vs = "varying float v_flow;\n" + vs;
      if (!/varying\s+float\s+v_bidir\s*;/.test(vs)) vs = "varying float v_bidir;\n" + vs;
    }
    if (!/varying\s+float\s+v_flow\s*;/.test(vs)) {
      if (/varying\s+float\s+v_focus\s*;/.test(vs)) vs = vs.replace(/varying\s+float\s+v_focus\s*;/, "varying float v_focus;\nvarying float v_flow;");
      else vs = "varying float v_flow;\n" + vs;
    }
    if (!/varying\s+float\s+v_bidir\s*;/.test(vs)) {
      if (/varying\s+float\s+v_flow\s*;/.test(vs)) vs = vs.replace(/varying\s+float\s+v_flow\s*;/, "varying float v_flow;\nvarying float v_bidir;");
      else if (/varying\s+float\s+v_focus\s*;/.test(vs)) vs = vs.replace(/varying\s+float\s+v_focus\s*;/, "varying float v_focus;\nvarying float v_bidir;");
      else vs = "varying float v_bidir;\n" + vs;
    }
    vs = vs.replace(/\}\s*$/, "  v_focus = a_focus;\n  v_flow = a_flow;\n  v_bidir = a_bidir;\n}\n// AJPC_EDGE_FOCUS_PATCH");
    return vs;
  }

  function patchSolidFragmentShader(source) {
    var fs = String(source || "");
    if (!fs || fs.indexOf("gl_FragColor") < 0) return fs;
    if (fs.indexOf("AJPC_SOLID_PATTERN") >= 0) return fs;
    if (!/varying\s+float\s+v_focus\s*;/.test(fs)) {
      fs = fs.replace(/(precision\s+(?:lowp|mediump|highp|)\s*float\s*;)/, "$1\nvarying float v_focus;\nvarying float v_flow;\nvarying float v_bidir;\nuniform float u_focus_active;\nuniform float u_dim_rgb_mul;\nuniform float u_dim_alpha_mul;\nuniform float u_time;\nuniform float u_flow_speed;\nuniform float u_flow_spacing_mul;\nuniform float u_flow_radius_mul;");
    } else if (!/varying\s+float\s+v_bidir\s*;/.test(fs)) {
      fs = fs.replace(/varying\s+float\s+v_flow\s*;/, "varying float v_flow;\nvarying float v_bidir;");
    }
    var injection = [
      "#ifndef PICKING_MODE",
      "  // AJPC_SOLID_PATTERN",
      "  vec2 ajpcClosestVector = getDistanceVector(v_cpA - gl_FragCoord.xy, v_cpB - gl_FragCoord.xy, v_cpC - gl_FragCoord.xy);",
      "  vec2 ajpcClosestPoint = gl_FragCoord.xy + ajpcClosestVector;",
      "  vec2 ajpcChord = v_cpC - v_cpA;",
      "  float ajpcChordLen = max(length(ajpcChord), 0.00001);",
      "  vec2 ajpcDir = ajpcChord / ajpcChordLen;",
      "  float ajpcAlongWorld = dot(ajpcClosestPoint - v_cpA, ajpcDir);",
      "  float ajpcRadial = length(ajpcClosestVector);",
      "  float ajpcHalfThickness = max(v_thickness * 0.5, 0.00001);",
      "  float ajpcFeather = max(v_feather, 0.00001);",
      "  float ajpcLineMask = 1.0 - smoothstep(ajpcHalfThickness - ajpcFeather, ajpcHalfThickness + ajpcFeather, ajpcRadial);",
      "  ajpcLineMask = clamp(ajpcLineMask, 0.0, 1.0);",
      "  {",
      "    float ajpcDim = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));",
      "    float ajpcRgbMul = mix(1.0, u_dim_rgb_mul, ajpcDim);",
      "    float ajpcFlowGate = step(0.5, v_flow) * step(0.001, u_flow_speed);",
      "    float ajpcSpacing = ajpcHalfThickness * max(u_flow_spacing_mul, 0.00001);",
      "    float ajpcCyclesPerSec = 0.65 + (u_flow_speed * 1.1);",
      "    float ajpcRadius = ajpcHalfThickness * max(u_flow_radius_mul, 0.00001);",
      "    float ajpcTravel = u_time * ajpcCyclesPerSec * ajpcSpacing;",
      "    float ajpcLocalFwd = mod(ajpcAlongWorld - ajpcTravel, ajpcSpacing) - (ajpcSpacing * 0.5);",
      "    float ajpcDistFwd = sqrt((ajpcLocalFwd * ajpcLocalFwd) + (ajpcRadial * ajpcRadial));",
      "    float ajpcCoreFwd = 1.0 - smoothstep(ajpcRadius * 0.34, ajpcRadius * 0.84, ajpcDistFwd);",
      "    float ajpcGlowFwd = 1.0 - smoothstep(ajpcRadius * 0.90, ajpcRadius * 1.45, ajpcDistFwd);",
      "    float ajpcPhotonFwd = clamp(max(ajpcCoreFwd, 0.22 * ajpcGlowFwd), 0.0, 1.0);",
      "    float ajpcPhoton = ajpcPhotonFwd;",
      "    if (v_bidir > 0.5) {",
      "      float ajpcLocalRev = mod(ajpcAlongWorld + ajpcTravel, ajpcSpacing) - (ajpcSpacing * 0.5);",
      "      float ajpcDistRev = sqrt((ajpcLocalRev * ajpcLocalRev) + (ajpcRadial * ajpcRadial));",
      "      float ajpcCoreRev = 1.0 - smoothstep(ajpcRadius * 0.34, ajpcRadius * 0.84, ajpcDistRev);",
      "      float ajpcGlowRev = 1.0 - smoothstep(ajpcRadius * 0.90, ajpcRadius * 1.45, ajpcDistRev);",
      "      float ajpcPhotonRev = clamp(max(ajpcCoreRev, 0.22 * ajpcGlowRev), 0.0, 1.0);",
      "      ajpcPhoton = max(ajpcPhotonFwd, ajpcPhotonRev);",
      "    }",
      "    ajpcPhoton *= ajpcFlowGate;",
      "    float ajpcBaseAlphaRaw = clamp(v_color.a * ajpcLineMask, 0.0, 1.0);",
      "    float ajpcDimAlpha = clamp(u_dim_alpha_mul * ajpcLineMask, 0.0, 1.0);",
      "    float ajpcBaseAlpha = mix(ajpcBaseAlphaRaw, ajpcDimAlpha, ajpcDim);",
      "    float ajpcPhotonAlpha = clamp(v_color.a * ajpcPhoton * 0.58, 0.0, 1.0);",
      "    float ajpcAlpha = clamp(ajpcBaseAlpha + ajpcPhotonAlpha, 0.0, 1.0);",
      "    if (ajpcAlpha <= 0.001) gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);",
      "    else {",
      "      vec3 ajpcBaseRgb = v_color.rgb * ajpcRgbMul;",
      "      vec3 ajpcPhotonRgb = mix(ajpcBaseRgb, vec3(0.92, 0.97, 1.0), 0.34);",
      "      vec3 ajpcRgb = ((ajpcBaseRgb * ajpcBaseAlpha) + (ajpcPhotonRgb * ajpcPhotonAlpha)) / max(ajpcAlpha, 0.00001);",
      "      gl_FragColor = vec4(ajpcRgb * ajpcAlpha, ajpcAlpha);",
      "    }",
      "  }",
      "#endif"
    ].join("\n");
    return fs.replace(/\}\s*$/, "\n" + injection + "\n}");
  }

  class AJPCCurvedEdgeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def._ajpcFocusPatched) return def;
      var attrs = Array.isArray(def.ATTRIBUTES) ? def.ATTRIBUTES.slice() : [];
      this._ajpcFocusOffset = attributeItems(attrs);
      attrs.push({ name: "a_focus", size: 1, type: WebGLRenderingContext.FLOAT });
      this._ajpcFlowOffset = attributeItems(attrs);
      attrs.push({ name: "a_flow", size: 1, type: WebGLRenderingContext.FLOAT });
      this._ajpcBidirOffset = attributeItems(attrs);
      attrs.push({ name: "a_bidir", size: 1, type: WebGLRenderingContext.FLOAT });
      def.ATTRIBUTES = attrs;
      var uniforms = Array.isArray(def.UNIFORMS) ? def.UNIFORMS.slice() : [];
      if (uniforms.indexOf("u_focus_active") < 0) uniforms.push("u_focus_active");
      if (uniforms.indexOf("u_dim_rgb_mul") < 0) uniforms.push("u_dim_rgb_mul");
      if (uniforms.indexOf("u_dim_alpha_mul") < 0) uniforms.push("u_dim_alpha_mul");
      if (uniforms.indexOf("u_time") < 0) uniforms.push("u_time");
      if (uniforms.indexOf("u_flow_speed") < 0) uniforms.push("u_flow_speed");
      if (uniforms.indexOf("u_flow_spacing_mul") < 0) uniforms.push("u_flow_spacing_mul");
      if (uniforms.indexOf("u_flow_radius_mul") < 0) uniforms.push("u_flow_radius_mul");
      def.UNIFORMS = uniforms;
      if (def.VERTEX_SHADER_SOURCE) def.VERTEX_SHADER_SOURCE = patchFocusVertexShader(def.VERTEX_SHADER_SOURCE);
      if (def.FRAGMENT_SHADER_SOURCE) def.FRAGMENT_SHADER_SOURCE = patchSolidFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      def._ajpcFocusPatched = true;
      return def;
    }

    processVisibleItem(edgeIndex, startIndex, sourceData, targetData, edgeData) {
      super.processVisibleItem(edgeIndex, startIndex, sourceData, targetData, edgeData);
      var offset = this._ajpcFocusOffset;
      if (!isFinite(offset)) offset = 0;
      var flowOffset = this._ajpcFlowOffset;
      if (!isFinite(flowOffset)) flowOffset = offset + 1;
      var focus = Number(edgeData && edgeData.ajpc_focus);
      if (!isFinite(focus)) focus = 0;
      var flow = Number(edgeData && edgeData.ajpc_flow);
      if (!isFinite(flow)) flow = 0;
      var bidir = Number(edgeData && edgeData.ajpc_bidir);
      if (!isFinite(bidir)) bidir = 0;
      var bidirOffset = this._ajpcBidirOffset;
      if (!isFinite(bidirOffset)) bidirOffset = flowOffset + 1;
      this.array[startIndex + offset] = focus > 0 ? 1 : 0;
      this.array[startIndex + flowOffset] = flow > 0 ? 1 : 0;
      this.array[startIndex + bidirOffset] = bidir > 0 ? 1 : 0;
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
      if (!isFinite(dimAlphaMul)) dimAlphaMul = 0.1;
      var flowSpeed = Number(runtime && runtime.flowAnimSpeed);
      if (!isFinite(flowSpeed)) flowSpeed = 0;
      if (flowSpeed < 0) flowSpeed = 0;
      if (flowSpeed > 3) flowSpeed = 3;
      var flowSpacingMul = Number(runtime && runtime.flowSpacingMul);
      if (!isFinite(flowSpacingMul)) flowSpacingMul = 18.0;
      if (flowSpacingMul < 0.1) flowSpacingMul = 0.1;
      var flowRadiusMul = Number(runtime && runtime.flowRadiusMul);
      if (!isFinite(flowRadiusMul)) flowRadiusMul = 3.6;
      if (flowRadiusMul < 0.1) flowRadiusMul = 0.1;
      if (uniformLocations.u_focus_active !== undefined && uniformLocations.u_focus_active !== null) gl.uniform1f(uniformLocations.u_focus_active, focusActive ? 1 : 0);
      if (uniformLocations.u_dim_rgb_mul !== undefined && uniformLocations.u_dim_rgb_mul !== null) gl.uniform1f(uniformLocations.u_dim_rgb_mul, dimRgbMul);
      if (uniformLocations.u_dim_alpha_mul !== undefined && uniformLocations.u_dim_alpha_mul !== null) gl.uniform1f(uniformLocations.u_dim_alpha_mul, dimAlphaMul);
      if (uniformLocations.u_time !== undefined && uniformLocations.u_time !== null) gl.uniform1f(uniformLocations.u_time, performance.now() * 0.001);
      if (uniformLocations.u_flow_speed !== undefined && uniformLocations.u_flow_speed !== null) gl.uniform1f(uniformLocations.u_flow_speed, flowSpeed);
      if (uniformLocations.u_flow_spacing_mul !== undefined && uniformLocations.u_flow_spacing_mul !== null) gl.uniform1f(uniformLocations.u_flow_spacing_mul, flowSpacingMul);
      if (uniformLocations.u_flow_radius_mul !== undefined && uniformLocations.u_flow_radius_mul !== null) gl.uniform1f(uniformLocations.u_flow_radius_mul, flowRadiusMul);
    }
  }

  registry.edge.curved = AJPCCurvedEdgeProgram;
})();
