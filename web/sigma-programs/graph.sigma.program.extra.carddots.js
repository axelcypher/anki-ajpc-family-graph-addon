"use strict";
(function () {
  var root = window;
  var registry = root.AJPCSigmaPrograms || (root.AJPCSigmaPrograms = { edge: {}, node: {} });
  registry.edge = registry.edge || {};
  registry.node = registry.node || {};

  var sigma = root.Sigma || null;
  var rendering = sigma && sigma.rendering ? sigma.rendering : null;
  var utils = sigma && sigma.utils ? sigma.utils : null;
  if (!rendering || !utils) return;

  var NodeProgram = rendering.NodeProgram;
  var floatColor = utils.floatColor;
  if (typeof NodeProgram !== "function" || typeof floatColor !== "function") return;

  var UNSIGNED_BYTE = WebGLRenderingContext.UNSIGNED_BYTE;
  var FLOAT = WebGLRenderingContext.FLOAT;

  var UNIFORMS = [
    "u_sizeRatio",
    "u_correctionRatio",
    "u_ringRadiusMul",
    "u_dotRadiusMul",
    "u_color_default",
    "u_color_normal",
    "u_color_suspended",
    "u_color_buried",
    "u_color_plus_bg",
    "u_color_plus_fg",
    "u_focus_active",
    "u_dim_rgb_mul",
    "u_dim_alpha_mul",
    "u_matrix"
  ];

  var VERTEX_SHADER_SOURCE = [
    "attribute vec4 a_id;",
    "attribute vec4 a_color;",
    "attribute vec2 a_position;",
    "attribute float a_size;",
    "attribute float a_card_count;",
    "attribute float a_mask_normal;",
    "attribute float a_mask_suspended;",
    "attribute float a_mask_buried;",
    "attribute float a_focus;",
    "attribute float a_angle;",
    "",
    "uniform mat3 u_matrix;",
    "uniform float u_sizeRatio;",
    "uniform float u_correctionRatio;",
    "uniform float u_ringRadiusMul;",
    "uniform float u_dotRadiusMul;",
    "",
    "varying vec4 v_id;",
    "varying vec4 v_color;",
    "varying vec2 v_diffVector;",
    "varying float v_radius;",
    "varying float v_card_count;",
    "varying float v_mask_normal;",
    "varying float v_mask_suspended;",
    "varying float v_mask_buried;",
    "varying float v_focus;",
    "",
    "void main(void) {",
    "  float baseSize = a_size * u_correctionRatio / u_sizeRatio * 4.0;",
    "  float coverageScale = u_ringRadiusMul + u_dotRadiusMul + 0.7;",
    "  vec2 unit = vec2(cos(a_angle), sin(a_angle));",
    "  vec2 diffVector = (baseSize * coverageScale) * unit;",
    "  vec2 position = a_position + diffVector;",
    "  gl_Position = vec4((u_matrix * vec3(position, 1.0)).xy, 0.0, 1.0);",
    "",
    "  v_id = a_id;",
    "  v_color = a_color;",
    "  v_diffVector = diffVector;",
    "  v_radius = baseSize * 0.5;",
    "  v_card_count = a_card_count;",
    "  v_mask_normal = a_mask_normal;",
    "  v_mask_suspended = a_mask_suspended;",
    "  v_mask_buried = a_mask_buried;",
    "  v_focus = a_focus;",
    "}"
  ].join("\n");

  var FRAGMENT_SHADER_SOURCE = [
    "precision highp float;",
    "",
    "varying vec4 v_id;",
    "varying vec4 v_color;",
    "varying vec2 v_diffVector;",
    "varying float v_radius;",
    "varying float v_card_count;",
    "varying float v_mask_normal;",
    "varying float v_mask_suspended;",
    "varying float v_mask_buried;",
    "varying float v_focus;",
    "",
    "uniform float u_correctionRatio;",
    "uniform float u_ringRadiusMul;",
    "uniform float u_dotRadiusMul;",
    "uniform vec4 u_color_default;",
    "uniform vec4 u_color_normal;",
    "uniform vec4 u_color_suspended;",
    "uniform vec4 u_color_buried;",
    "uniform vec4 u_color_plus_bg;",
    "uniform vec4 u_color_plus_fg;",
    "uniform float u_focus_active;",
    "uniform float u_dim_rgb_mul;",
    "uniform float u_dim_alpha_mul;",
    "",
    "const float PI = 3.14159265358979323846;",
    "const float TAU = 6.28318530717958647692;",
    "const float SLOT_COUNT = 12.0;",
    "const float SLOT_STEP = TAU / SLOT_COUNT;",
    "",
    "float decodeBit(float packedBits, float idx) {",
    "  float p = exp2(idx);",
    "  return mod(floor(packedBits / p), 2.0);",
    "}",
    "",
    "float circleMask(vec2 p, vec2 center, float radius, float aa) {",
    "  float d = length(p - center);",
    "  return 1.0 - smoothstep(radius - aa, radius + aa, d);",
    "}",
    "",
    "float plusMask(vec2 q, float aa) {",
    "  float arm = 0.28;",
    "  float len = 0.62;",
    "  float v = (1.0 - smoothstep(arm - aa, arm + aa, abs(q.x))) * (1.0 - smoothstep(len - aa, len + aa, abs(q.y)));",
    "  float h = (1.0 - smoothstep(arm - aa, arm + aa, abs(q.y))) * (1.0 - smoothstep(len - aa, len + aa, abs(q.x)));",
    "  return clamp(max(v, h), 0.0, 1.0);",
    "}",
    "",
    "void main(void) {",
    "  if (v_radius <= 0.0) discard;",
    "",
    "  float ringR = v_radius * u_ringRadiusMul;",
    "  float dotR = v_radius * u_dotRadiusMul;",
    "  float aa = v_radius * 0.03 * u_correctionRatio;",
    "",
    "  vec2 p = v_diffVector;",
    "  float theta = atan(p.y, p.x);",
    "  if (theta < 0.0) theta += TAU;",
    "",
    "  float start = PI;",
    "  float delta = mod(start - theta + TAU, TAU);",
    "  float slot = floor((delta / SLOT_STEP) + 0.5);",
    "  if (slot >= SLOT_COUNT) slot -= SLOT_COUNT;",
    "",
    "  float slotAngle = start - (slot * SLOT_STEP);",
    "  vec2 dotCenter = vec2(cos(slotAngle), sin(slotAngle)) * ringR;",
    "",
    "  float outer = circleMask(p, dotCenter, dotR, aa);",
    "  if (outer <= 0.001) discard;",
    "",
    "  float count = floor(v_card_count + 0.5);",
    "  float isPlus = 0.0;",
    "  float isActive = 0.0;",
    "  if (count <= SLOT_COUNT) {",
    "    if (slot < count) isActive = 1.0;",
    "  } else {",
    "    if (slot < 11.0) isActive = 1.0;",
    "    else if (slot == 11.0) {",
    "      isActive = 1.0;",
    "      isPlus = 1.0;",
    "    }",
    "  }",
    "  if (isActive < 0.5) discard;",
    "",
    "  vec4 fill = u_color_default;",
    "  if (isPlus > 0.5) {",
    "    fill = u_color_plus_bg;",
    "  } else {",
    "    float s = decodeBit(v_mask_suspended, slot);",
    "    float b = decodeBit(v_mask_buried, slot);",
    "    float n = decodeBit(v_mask_normal, slot);",
    "    if (s > 0.5) fill = u_color_suspended;",
    "    else if (b > 0.5) fill = u_color_buried;",
    "    else if (n > 0.5) fill = u_color_normal;",
    "  }",
    "",
    "  vec4 color = fill;",
    "",
    "  if (isPlus > 0.5) {",
    "    vec2 q = (p - dotCenter) / dotR;",
    "    float pm = plusMask(q, aa / dotR);",
    "    color = mix(fill, u_color_plus_fg, pm);",
    "  }",
    "",
    "  float alpha = outer * v_color.a * color.a;",
    "  float dimNode = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));",
    "  float dimRgb = mix(1.0, u_dim_rgb_mul, dimNode);",
    "  float dimAlpha = mix(1.0, u_dim_alpha_mul, dimNode);",
    "  alpha *= dimAlpha;",
    "  vec3 rgb = color.rgb * dimRgb;",
    "",
    "  #ifdef PICKING_MODE",
    "    gl_FragColor = vec4(v_id.rgb, v_id.a * outer);",
    "  #else",
    "    gl_FragColor = vec4(rgb * alpha, alpha);",
    "  #endif",
    "}"
  ].join("\n");

  function numOr(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : Number(fallback || 0);
  }

  function clamp01(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function colorToVec4(input, fallback) {
    var fb = (Array.isArray(fallback) && fallback.length >= 4) ? fallback : [1, 1, 1, 1];

    function parseRgbPart(p) {
      if (/%$/.test(p)) return clamp01(Number(p.slice(0, -1)) / 100);
      return clamp01(Number(p) / 255);
    }

    function parseAlphaPart(p) {
      if (p === undefined || p === null || p === "") return 1;
      if (/%$/.test(p)) return clamp01(Number(p.slice(0, -1)) / 100);
      var n = Number(p);
      if (!isFinite(n)) return 1;
      if (n > 1) return clamp01(n / 255);
      return clamp01(n);
    }

    if (Array.isArray(input) && input.length >= 3) {
      var uses255 = Number(input[0]) > 1 || Number(input[1]) > 1 || Number(input[2]) > 1;
      var div = uses255 ? 255 : 1;
      var aRaw = Number(input.length >= 4 ? input[3] : 1);
      var a = (!isFinite(aRaw) ? 1 : (aRaw > 1 ? clamp01(aRaw / 255) : clamp01(aRaw)));
      return [
        clamp01(Number(input[0]) / div),
        clamp01(Number(input[1]) / div),
        clamp01(Number(input[2]) / div),
        a
      ];
    }

    if (typeof input !== "string") return [fb[0], fb[1], fb[2], fb[3]];
    var s = input.trim().toLowerCase();
    if (!s) return [fb[0], fb[1], fb[2], fb[3]];

    var m = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) {
        return [
          parseInt(h.charAt(0) + h.charAt(0), 16) / 255,
          parseInt(h.charAt(1) + h.charAt(1), 16) / 255,
          parseInt(h.charAt(2) + h.charAt(2), 16) / 255,
          h.length === 4 ? (parseInt(h.charAt(3) + h.charAt(3), 16) / 255) : 1
        ];
      }
      return [
        parseInt(h.slice(0, 2), 16) / 255,
        parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255,
        h.length === 8 ? (parseInt(h.slice(6, 8), 16) / 255) : 1
      ];
    }

    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      var parts = m[1].split(",").map(function (p) { return p.trim(); });
      if (parts.length >= 3) {
        return [
          parseRgbPart(parts[0]),
          parseRgbPart(parts[1]),
          parseRgbPart(parts[2]),
          parseAlphaPart(parts.length >= 4 ? parts[3] : 1)
        ];
      }
    }

    return [fb[0], fb[1], fb[2], fb[3]];
  }

  var CARD_DOTS_SHADER_COLOR_INPUT = {
    colorDefault: "#ffffff2c",
    colorNormal: "#ffffff2c",
    colorSuspended: "#f5ca0b",
    colorBuried: "#f37c1a",
    colorPlusBg: "#0f1729",
    colorPlusFg: "rgba(247,250,255,0)"
  };

  var CARD_DOTS_SHADER_COLORS = {
    colorDefault: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorDefault, [0.584, 0.639, 0.722, 1]),
    colorNormal: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorNormal, [0.133, 0.773, 0.369, 1]),
    colorSuspended: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorSuspended, [0.961, 0.62, 0.043, 1]),
    colorBuried: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorBuried, [0.937, 0.267, 0.267, 1]),
    colorPlusBg: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorPlusBg, [0.06, 0.09, 0.16, 1]),
    colorPlusFg: colorToVec4(CARD_DOTS_SHADER_COLOR_INPUT.colorPlusFg, [0.97, 0.98, 1.0, 1])
  };

  class AJPCCardDotsNodeProgram extends NodeProgram {
    getDefinition() {
      return {
        VERTICES: 3,
        VERTEX_SHADER_SOURCE: VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER_SOURCE,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS: UNIFORMS,
        ATTRIBUTES: [
          { name: "a_position", size: 2, type: FLOAT },
          { name: "a_size", size: 1, type: FLOAT },
          { name: "a_card_count", size: 1, type: FLOAT },
          { name: "a_mask_normal", size: 1, type: FLOAT },
          { name: "a_mask_suspended", size: 1, type: FLOAT },
          { name: "a_mask_buried", size: 1, type: FLOAT },
          { name: "a_focus", size: 1, type: FLOAT },
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true }
        ],
        CONSTANT_ATTRIBUTES: [{ name: "a_angle", size: 1, type: FLOAT }],
        CONSTANT_DATA: [
          [0.0],
          [2.0 * Math.PI / 3.0],
          [4.0 * Math.PI / 3.0]
        ]
      };
    }

    processVisibleItem(nodeIndex, startIndex, data) {
      var array = this.array;
      var color = floatColor(data.color || "#ffffff");
      var count = numOr(data.card_count !== undefined ? data.card_count : data.cardCount, 0);
      var maskNormal = numOr(data.cards_mask_normal !== undefined ? data.cards_mask_normal : data.cardMaskNormal, 0);
      var maskSuspended = numOr(data.cards_mask_suspended !== undefined ? data.cards_mask_suspended : data.cardMaskSuspended, 0);
      var maskBuried = numOr(data.cards_mask_buried !== undefined ? data.cards_mask_buried : data.cardMaskBuried, 0);
      var focus = numOr(data.ajpc_focus, 0);

      array[startIndex++] = numOr(data.x, 0);
      array[startIndex++] = numOr(data.y, 0);
      array[startIndex++] = numOr(data.size, 0);
      array[startIndex++] = count;
      array[startIndex++] = maskNormal;
      array[startIndex++] = maskSuspended;
      array[startIndex++] = maskBuried;
      array[startIndex++] = focus > 0 ? 1 : 0;
      array[startIndex++] = color;
      array[startIndex++] = nodeIndex;
    }

    setUniforms(params, context) {
      var gl = context.gl;
      var uniformLocations = context.uniformLocations;
      var c = CARD_DOTS_SHADER_COLORS;
      var runtime = root && root.AJPCSigmaRuntime && typeof root.AJPCSigmaRuntime === "object" ? root.AJPCSigmaRuntime : null;
      var focusActive = runtime && runtime.focusDimActive !== undefined ? !!runtime.focusDimActive : false;
      var dimRgbMul = Number(runtime && runtime.focusDimRgbMul);
      if (!isFinite(dimRgbMul)) dimRgbMul = 0.58;
      var dimAlphaMul = Number(runtime && runtime.focusDimAlphaMul);
      if (!isFinite(dimAlphaMul)) dimAlphaMul = 0.16;
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_ringRadiusMul, 0.7); //Dot distance to center
      gl.uniform1f(uniformLocations.u_dotRadiusMul, 0.11); //Dot diameter
      gl.uniform4f(uniformLocations.u_color_default, c.colorDefault[0], c.colorDefault[1], c.colorDefault[2], c.colorDefault[3]);
      gl.uniform4f(uniformLocations.u_color_normal, c.colorNormal[0], c.colorNormal[1], c.colorNormal[2], c.colorNormal[3]);
      gl.uniform4f(uniformLocations.u_color_suspended, c.colorSuspended[0], c.colorSuspended[1], c.colorSuspended[2], c.colorSuspended[3]);
      gl.uniform4f(uniformLocations.u_color_buried, c.colorBuried[0], c.colorBuried[1], c.colorBuried[2], c.colorBuried[3]);
      gl.uniform4f(uniformLocations.u_color_plus_bg, c.colorPlusBg[0], c.colorPlusBg[1], c.colorPlusBg[2], c.colorPlusBg[3]);
      gl.uniform4f(uniformLocations.u_color_plus_fg, c.colorPlusFg[0], c.colorPlusFg[1], c.colorPlusFg[2], c.colorPlusFg[3]);
      gl.uniform1f(uniformLocations.u_focus_active, focusActive ? 1 : 0);
      gl.uniform1f(uniformLocations.u_dim_rgb_mul, dimRgbMul);
      gl.uniform1f(uniformLocations.u_dim_alpha_mul, dimAlphaMul);
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    }
  }

  registry.node.card_dots = AJPCCardDotsNodeProgram;
})();
