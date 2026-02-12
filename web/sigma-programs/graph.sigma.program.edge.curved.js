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
      if (/attribute\s+vec4\s+a_id\s*;/.test(vs)) vs = vs.replace(/attribute\s+vec4\s+a_id\s*;/, "attribute vec4 a_id;\nattribute float a_focus;\nattribute float a_flow;");
      else vs = "attribute float a_focus;\n" + vs;
      if (!/attribute\s+float\s+a_flow\s*;/.test(vs)) vs = "attribute float a_flow;\n" + vs;
    }
    if (!/attribute\s+float\s+a_flow\s*;/.test(vs)) {
      if (/attribute\s+float\s+a_focus\s*;/.test(vs)) vs = vs.replace(/attribute\s+float\s+a_focus\s*;/, "attribute float a_focus;\nattribute float a_flow;");
      else vs = "attribute float a_flow;\n" + vs;
    }
    if (!/varying\s+float\s+v_focus\s*;/.test(vs)) {
      if (/varying\s+vec4\s+v_color\s*;/.test(vs)) vs = vs.replace(/varying\s+vec4\s+v_color\s*;/, "varying vec4 v_color;\nvarying float v_focus;\nvarying float v_flow;");
      else vs = "varying float v_focus;\n" + vs;
      if (!/varying\s+float\s+v_flow\s*;/.test(vs)) vs = "varying float v_flow;\n" + vs;
    }
    if (!/varying\s+float\s+v_flow\s*;/.test(vs)) {
      if (/varying\s+float\s+v_focus\s*;/.test(vs)) vs = vs.replace(/varying\s+float\s+v_focus\s*;/, "varying float v_focus;\nvarying float v_flow;");
      else vs = "varying float v_flow;\n" + vs;
    }
    vs = vs.replace(/\}\s*$/, "  v_focus = a_focus;\n  v_flow = a_flow;\n}\n// AJPC_EDGE_FOCUS_PATCH");
    return vs;
  }

  function patchSolidFragmentShader(source) {
    var fs = String(source || "");
    if (!fs || fs.indexOf("gl_FragColor") < 0) return fs;
    if (fs.indexOf("AJPC_SOLID_PATTERN") >= 0) return fs;
    if (!/varying\s+float\s+v_focus\s*;/.test(fs)) {
      fs = fs.replace(/(precision\s+(?:lowp|mediump|highp|)\s*float\s*;)/, "$1\nvarying float v_focus;\nvarying float v_flow;\nuniform float u_focus_active;\nuniform float u_dim_rgb_mul;\nuniform float u_dim_alpha_mul;\nuniform float u_time;\nuniform float u_flow_speed;");
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
      "  float ajpcMask = 1.0 - smoothstep(ajpcHalfThickness - ajpcFeather, ajpcHalfThickness + ajpcFeather, ajpcRadial);",
      "  ajpcMask = clamp(ajpcMask, 0.0, 1.0);",
      "  if (ajpcMask <= 0.001) gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);",
      "  else {",
      "    float ajpcDim = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));",
      "    float ajpcRgbMul = mix(1.0, u_dim_rgb_mul, ajpcDim);",
      "    float ajpcAlphaMul = mix(1.0, u_dim_alpha_mul, ajpcDim);",
      "    float ajpcFlowGate = step(0.5, v_flow) * step(0.001, u_flow_speed);",
      "    float ajpcPhase = (ajpcAlongWorld * 0.055) - (u_time * (1.6 + (u_flow_speed * 3.2)));",
      "    float ajpcWave = 0.5 + (0.5 * sin(ajpcPhase));",
      "    float ajpcFlowRgbMul = mix(1.0, 1.0 + (0.45 * ajpcWave), ajpcFlowGate);",
      "    float ajpcFlowAlphaMul = mix(1.0, 0.85 + (0.35 * ajpcWave), ajpcFlowGate);",
      "    float ajpcAlpha = v_color.a * ajpcMask * ajpcAlphaMul * ajpcFlowAlphaMul;",
      "    gl_FragColor = vec4(((v_color.rgb * ajpcRgbMul) * ajpcFlowRgbMul) * ajpcAlpha, ajpcAlpha);",
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
      def.ATTRIBUTES = attrs;
      var uniforms = Array.isArray(def.UNIFORMS) ? def.UNIFORMS.slice() : [];
      if (uniforms.indexOf("u_focus_active") < 0) uniforms.push("u_focus_active");
      if (uniforms.indexOf("u_dim_rgb_mul") < 0) uniforms.push("u_dim_rgb_mul");
      if (uniforms.indexOf("u_dim_alpha_mul") < 0) uniforms.push("u_dim_alpha_mul");
      if (uniforms.indexOf("u_time") < 0) uniforms.push("u_time");
      if (uniforms.indexOf("u_flow_speed") < 0) uniforms.push("u_flow_speed");
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
      this.array[startIndex + offset] = focus > 0 ? 1 : 0;
      this.array[startIndex + flowOffset] = flow > 0 ? 1 : 0;
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
      var flowSpeed = Number(runtime && runtime.flowAnimSpeed);
      if (!isFinite(flowSpeed)) flowSpeed = 0;
      if (flowSpeed < 0) flowSpeed = 0;
      if (flowSpeed > 3) flowSpeed = 3;
      if (uniformLocations.u_focus_active !== undefined && uniformLocations.u_focus_active !== null) gl.uniform1f(uniformLocations.u_focus_active, focusActive ? 1 : 0);
      if (uniformLocations.u_dim_rgb_mul !== undefined && uniformLocations.u_dim_rgb_mul !== null) gl.uniform1f(uniformLocations.u_dim_rgb_mul, dimRgbMul);
      if (uniformLocations.u_dim_alpha_mul !== undefined && uniformLocations.u_dim_alpha_mul !== null) gl.uniform1f(uniformLocations.u_dim_alpha_mul, dimAlphaMul);
      if (uniformLocations.u_time !== undefined && uniformLocations.u_time !== null) gl.uniform1f(uniformLocations.u_time, performance.now() * 0.001);
      if (uniformLocations.u_flow_speed !== undefined && uniformLocations.u_flow_speed !== null) gl.uniform1f(uniformLocations.u_flow_speed, flowSpeed);
    }
  }

  registry.edge.curved = AJPCCurvedEdgeProgram;
})();
