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

  function attributeItems(attrs) {
    var list = Array.isArray(attrs) ? attrs : [];
    var sum = 0;
    for (var i = 0; i < list.length; i += 1) {
      var a = list[i] || {};
      sum += a.normalized ? 1 : Number(a.size || 0);
    }
    return sum;
  }

  function ensureLine(src, line, pattern) {
    if (pattern && pattern.test(src)) return src;
    if (src.indexOf(line) >= 0) return src;
    var m = /(precision\s+(?:lowp|mediump|highp|)\s*float\s*;)/.exec(src);
    if (m) return src.replace(m[0], m[0] + "\n" + line);
    return line + "\n" + src;
  }

  function patchHubVertexShader(source) {
    var vs = String(source || "");
    if (!vs) return vs;
    if (vs.indexOf("AJPC_HUB_FOCUS_PATCH") >= 0) return vs;

    if (!/attribute\s+float\s+a_focus\s*;/.test(vs)) {
      if (/attribute\s+vec4\s+a_id\s*;/.test(vs)) vs = vs.replace(/attribute\s+vec4\s+a_id\s*;/, "attribute vec4 a_id;\nattribute float a_focus;");
      else vs = "attribute float a_focus;\n" + vs;
    }
    if (!/varying\s+float\s+v_focus\s*;/.test(vs)) {
      if (/varying\s+vec4\s+v_color\s*;/.test(vs)) vs = vs.replace(/varying\s+vec4\s+v_color\s*;/, "varying vec4 v_color;\nvarying float v_focus;");
      else vs = "varying float v_focus;\n" + vs;
    }
    if (vs.indexOf("v_focus = a_focus;") < 0) {
      vs = vs.replace(/\}\s*$/, "  v_focus = a_focus;\n}\n// AJPC_HUB_FOCUS_PATCH");
    }
    return vs;
  }

  function patchHubFragmentShader(source) {
    var fs = String(source || "");
    if (!fs) return fs;
    if (fs.indexOf("AJPC_HUB_FOCUS_PATCH") >= 0) return fs;

    fs = ensureLine(fs, "varying float v_focus;", /varying\s+float\s+v_focus\s*;/);
    fs = ensureLine(fs, "uniform float u_focus_active;", /uniform\s+float\s+u_focus_active\s*;/);
    fs = ensureLine(fs, "uniform float u_dim_rgb_mul;", /uniform\s+float\s+u_dim_rgb_mul\s*;/);
    fs = ensureLine(fs, "uniform float u_dim_alpha_mul;", /uniform\s+float\s+u_dim_alpha_mul\s*;/);

    fs = fs.replace(
      /\}\s*$/,
      "\n#ifndef PICKING_MODE\n  float ajpcDimNode = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));\n  float ajpcDimRgb = mix(1.0, u_dim_rgb_mul, ajpcDimNode);\n  float ajpcDimAlpha = mix(1.0, u_dim_alpha_mul, ajpcDimNode);\n  gl_FragColor.rgb *= ajpcDimRgb;\n  gl_FragColor.a *= ajpcDimAlpha;\n#endif\n}\n// AJPC_HUB_FOCUS_PATCH"
    );

    return fs;
  }

  class AJPCHubNodeProgram extends Base {
    getDefinition() {
      var def = (typeof super.getDefinition === "function") ? super.getDefinition() : null;
      if (!def) return def;
      if (def._ajpcHubFocusPatched) return def;

      var attrs = Array.isArray(def.ATTRIBUTES) ? def.ATTRIBUTES.slice() : [];
      this._ajpcFocusOffset = attributeItems(attrs);
      attrs.push({ name: "a_focus", size: 1, type: WebGLRenderingContext.FLOAT });
      def.ATTRIBUTES = attrs;

      var uniforms = Array.isArray(def.UNIFORMS) ? def.UNIFORMS.slice() : [];
      if (uniforms.indexOf("u_focus_active") < 0) uniforms.push("u_focus_active");
      if (uniforms.indexOf("u_dim_rgb_mul") < 0) uniforms.push("u_dim_rgb_mul");
      if (uniforms.indexOf("u_dim_alpha_mul") < 0) uniforms.push("u_dim_alpha_mul");
      def.UNIFORMS = uniforms;

      def.VERTEX_SHADER_SOURCE = patchHubVertexShader(def.VERTEX_SHADER_SOURCE);
      def.FRAGMENT_SHADER_SOURCE = patchHubFragmentShader(def.FRAGMENT_SHADER_SOURCE);
      def._ajpcHubFocusPatched = true;
      return def;
    }

    processVisibleItem(nodeIndex, startIndex, data) {
      super.processVisibleItem(nodeIndex, startIndex, data);
      var offset = this._ajpcFocusOffset;
      if (!isFinite(offset)) offset = 0;
      var focus = Number(data && data.ajpc_focus);
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

  registry.node.hub = AJPCHubNodeProgram;
})();
