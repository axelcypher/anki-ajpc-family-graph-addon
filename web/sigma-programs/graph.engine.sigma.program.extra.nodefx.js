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
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_time",
    "u_maxCoverageMul",
    "u_ping_max_radius_mul",
    "u_ping_width_mul",
    "u_ping_alpha",
    "u_ring_base_mul",
    "u_ring_pulse_mul",
    "u_ring_width_mul",
    "u_ring_speed",
    "u_focus_active",
    "u_dim_rgb_mul",
    "u_dim_alpha_mul"
  ];

  // Must stay aligned with node pulse max in graph.engine.sigma.program.node.note.js:
  // pulseOuterMax = coreRadius * (1.28 + 0.40) = 1.68 * coreRadius
  var NODE_PULSE_MAX_RADIUS_MUL = 1.68;
  // Must stay aligned with node pulse min in graph.engine.sigma.program.node.note.js:
  // pulseOuterMin = coreRadius * (1.28 + 0.20) = 1.48 * coreRadius
  var NODE_PULSE_MIN_RADIUS_MUL = 1.48;
  // Must stay aligned with node pulse speed in graph.engine.sigma.program.node.note.js:
  // wave = sin(((u_time * 0.4) + seed) * TAU) -> angular speed = TAU * 0.4
  var NODE_PULSE_ANGULAR_SPEED = 6.28318530717958647692 * 0.4;

  var VERTEX_SHADER_SOURCE = [
    "attribute vec4 a_id;",
    "attribute vec2 a_position;",
    "attribute float a_size;",
    "attribute vec4 a_color;",
    "attribute float a_focus;",
    "attribute float a_ping_start;",
    "attribute float a_ping_dur;",
    "attribute float a_ping_mode;",
    "attribute vec4 a_ping_color;",
    "attribute float a_ring_mode;",
    "attribute vec4 a_ring_color;",
    "attribute float a_angle;",
    "",
    "uniform mat3 u_matrix;",
    "uniform float u_sizeRatio;",
    "uniform float u_correctionRatio;",
    "uniform float u_maxCoverageMul;",
    "",
    "varying vec4 v_id;",
    "varying vec2 v_local;",
    "varying float v_node_radius;",
    "varying float v_focus;",
    "varying float v_ping_start;",
    "varying float v_ping_dur;",
    "varying float v_ping_mode;",
    "varying vec4 v_ping_color;",
    "varying float v_ring_mode;",
    "varying vec4 v_ring_color;",
    "",
    "void main(void) {",
    "  float baseSize = a_size * u_correctionRatio / u_sizeRatio * 4.0;",
    "  float coverageScale = u_maxCoverageMul + 0.7;",
    "  vec2 local = (baseSize * coverageScale) * vec2(cos(a_angle), sin(a_angle));",
    "  vec2 position = a_position + local;",
    "  gl_Position = vec4((u_matrix * vec3(position, 1.0)).xy, 0.0, 1.0);",
    "",
    "  v_id = a_id;",
    "  v_local = local;",
    "  v_node_radius = baseSize * 0.5;",
    "  v_focus = a_focus;",
    "  v_ping_start = a_ping_start;",
    "  v_ping_dur = a_ping_dur;",
    "  v_ping_mode = a_ping_mode;",
    "  v_ping_color = a_ping_color;",
    "  v_ring_mode = a_ring_mode;",
    "  v_ring_color = a_ring_color;",
    "}"
  ].join("\n");

  var FRAGMENT_SHADER_SOURCE = [
    "precision highp float;",
    "",
    "varying vec4 v_id;",
    "varying vec2 v_local;",
    "varying float v_node_radius;",
    "varying float v_focus;",
    "varying float v_ping_start;",
    "varying float v_ping_dur;",
    "varying float v_ping_mode;",
    "varying vec4 v_ping_color;",
    "varying float v_ring_mode;",
    "varying vec4 v_ring_color;",
    "",
    "uniform float u_correctionRatio;",
    "uniform float u_time;",
    "uniform float u_maxCoverageMul;",
    "uniform float u_ping_max_radius_mul;",
    "uniform float u_ping_width_mul;",
    "uniform float u_ping_alpha;",
    "uniform float u_ring_base_mul;",
    "uniform float u_ring_pulse_mul;",
    "uniform float u_ring_width_mul;",
    "uniform float u_ring_speed;",
    "uniform float u_focus_active;",
    "uniform float u_dim_rgb_mul;",
    "uniform float u_dim_alpha_mul;",
    "",
    "float bandMask(float dist, float radius, float width, float aa) {",
    "  float outer = 1.0 - smoothstep(radius - aa, radius + aa, dist);",
    "  float innerRadius = max(radius - width, 0.0);",
    "  float inner = 1.0 - smoothstep(innerRadius - aa, innerRadius + aa, dist);",
    "  return clamp(outer - inner, 0.0, 1.0);",
    "}",
    "",
    "void compositePremul(inout vec3 dstRgb, inout float dstA, vec3 srcRgb, float srcA) {",
    "  float a = clamp(srcA, 0.0, 1.0);",
    "  float inv = 1.0 - dstA;",
    "  dstRgb += (srcRgb * a) * inv;",
    "  dstA += a * inv;",
    "}",
    "",
    "void main(void) {",
    "  if (!(v_node_radius > 0.0)) discard;",
    "",
    "  float dist = length(v_local);",
    "  if (!(dist >= 0.0)) discard;",
    "  float aa = v_node_radius * 0.03 * u_correctionRatio;",
    "  float safeMaxRadius = v_node_radius * u_maxCoverageMul;",
    "  if (!(safeMaxRadius > 0.0)) discard;",
    // Hard circular clip guard: never render outside this radius even if branch math goes wrong.
    "  float coverageClip = 1.0 - smoothstep(safeMaxRadius - (aa * 1.5), safeMaxRadius + (aa * 1.5), dist);",
    "  if (!(coverageClip > 0.001)) discard;",
    "  vec3 rgb = vec3(0.0);",
    "  float alpha = 0.0;",
    "  float activeOuter = -1.0;",
    "",
    "  if (v_ring_mode > 0.5) {",
    "    float phase = 0.5 + (0.5 * sin(u_time * u_ring_speed));",
    "    float ringRadius = v_node_radius * (" + String(NODE_PULSE_MAX_RADIUS_MUL) + " + (phase * u_ring_pulse_mul));",
    "    ringRadius = min(ringRadius, safeMaxRadius);",
    "    float ringWidth = max(v_node_radius * u_ring_width_mul, aa * 1.2);",
    "    activeOuter = max(activeOuter, min(ringRadius + ringWidth + aa, safeMaxRadius));",
    "    float ringMask = bandMask(dist, ringRadius, ringWidth, aa);",
    "    if (!(ringMask >= 0.0)) ringMask = 0.0;",
    "    float ringA = ringMask;",
    "    compositePremul(rgb, alpha, v_ring_color.rgb, ringA);",
    "  }",
    "",
    "  if (v_ping_mode > 0.5 && v_ping_dur > 0.001 && v_ping_color.a > 0.0) {",
    "    float t = (u_time - v_ping_start) / v_ping_dur;",
    "    float launchGap = 0.22;",
    "    float activeSpan = 0.56;",
    "    float pingStartRadius = v_node_radius * " + String(NODE_PULSE_MIN_RADIUS_MUL) + ";",
    "    for (int i = 0; i < 3; i++) {",
    "      float fi = float(i);",
    "      float t0 = fi * launchGap;",
    "      float t1 = t0 + activeSpan;",
    "      if (t >= t0 && t <= t1) {",
    "        float lt = (t - t0) / max(activeSpan, 0.0001);",
    "        float ease = lt * lt * (3.0 - (2.0 * lt));",
    "        float pingRadius = mix(pingStartRadius, v_node_radius * u_ping_max_radius_mul, ease);",
    "        pingRadius = min(pingRadius, safeMaxRadius);",
    "        float pingWidth = max(v_node_radius * u_ping_width_mul, aa * 1.6);",
    "        activeOuter = max(activeOuter, min(pingRadius + pingWidth + aa, safeMaxRadius));",
    "        float pingMask = bandMask(dist, pingRadius, pingWidth, aa);",
    "        if (!(pingMask >= 0.0)) pingMask = 0.0;",
    "        float fade = 0.5 * (1.0 - ease);",
    "        float pingA = pingMask * fade * u_ping_alpha * v_ping_color.a;",
    "        compositePremul(rgb, alpha, v_ping_color.rgb, pingA);",
    "      }",
    "    }",
    "  }",
    "",
    "  if (!(activeOuter > 0.0)) discard;",
    "  if (dist > activeOuter) discard;",
    "  if (!(alpha > 0.001)) discard;",
    "",
    "  float dimNode = step(0.5, u_focus_active) * (1.0 - step(0.5, v_focus));",
    "  float dimRgb = mix(1.0, u_dim_rgb_mul, dimNode);",
    "  float dimAlpha = mix(1.0, u_dim_alpha_mul, dimNode);",
    "  alpha *= dimAlpha;",
    "  alpha *= coverageClip;",
    "  if (!(alpha > 0.001)) discard;",
    "  rgb *= (dimRgb * dimAlpha);",
    "",
    "  #ifdef PICKING_MODE",
    "    discard;",
    "  #else",
    "    gl_FragColor = vec4(rgb, alpha);",
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

  class AJPCNodeFxProgram extends NodeProgram {
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
          { name: "a_focus", size: 1, type: FLOAT },
          { name: "a_ping_start", size: 1, type: FLOAT },
          { name: "a_ping_dur", size: 1, type: FLOAT },
          { name: "a_ping_mode", size: 1, type: FLOAT },
          { name: "a_ping_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_ring_mode", size: 1, type: FLOAT },
          { name: "a_ring_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
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
      var baseColor = floatColor(data.color || "#ffffff");
      var pingColor = floatColor(data.ajpc_ping_color || data.ping_color || "#60a5fa");
      var ringColor = floatColor(data.ajpc_ring_color || data.ring_color || "#ffffff");

      array[startIndex++] = numOr(data.x, 0);
      array[startIndex++] = numOr(data.y, 0);
      array[startIndex++] = numOr(data.size, 0);
      array[startIndex++] = numOr(data.ajpc_focus, 0) > 0 ? 1 : 0;
      array[startIndex++] = numOr(data.ajpc_ping_start, -1);
      array[startIndex++] = numOr(data.ajpc_ping_dur, 0);
      array[startIndex++] = numOr(data.ajpc_ping_mode, 0);
      array[startIndex++] = pingColor;
      array[startIndex++] = numOr(data.ajpc_ring_mode, 0);
      array[startIndex++] = ringColor;
      array[startIndex++] = baseColor;
      array[startIndex++] = nodeIndex;
    }

    setUniforms(params, context) {
      var gl = context.gl;
      var uniformLocations = context.uniformLocations;
      var runtime = root && root.AJPCSigmaRuntime && typeof root.AJPCSigmaRuntime === "object" ? root.AJPCSigmaRuntime : null;

      var pingRadiusMul = numOr(runtime && runtime.nodeFxPingRadiusMul, 2.9);
      if (!(pingRadiusMul > 0)) pingRadiusMul = 2.9;
      var pingWidthMul = numOr(runtime && runtime.nodeFxPingWidthMul, 0.22);
      if (!(pingWidthMul >= 0)) pingWidthMul = 0.22;
      var pingAlpha = clamp01(numOr(runtime && runtime.nodeFxPingAlpha, 0.92));

      var ringBaseMul = numOr(runtime && runtime.nodeFxRingBaseMul, 1.28);
      if (!(ringBaseMul > 0)) ringBaseMul = 1.28;
      var ringPulseMul = numOr(runtime && runtime.nodeFxRingPulseMul, 0.24);
      if (ringPulseMul < 0) ringPulseMul = 0;
      var ringWidthMul = numOr(runtime && runtime.nodeFxRingWidthMul, 0.11);
      if (!(ringWidthMul > 0)) ringWidthMul = 0.11;
      var ringSpeed = numOr(runtime && runtime.nodeFxRingSpeed, NODE_PULSE_ANGULAR_SPEED);
      if (!(ringSpeed > 0)) ringSpeed = NODE_PULSE_ANGULAR_SPEED;

      // Ring minimum should match node-pulse maximum radius.
      // Coverage must include both ring and ping outer extents.
      var ringOuter = NODE_PULSE_MAX_RADIUS_MUL + ringPulseMul + ringWidthMul;
      var pingOuter = pingRadiusMul + pingWidthMul;
      // Extra headroom so max-size ping/ring cannot hit the carrier clip edge.
      var coveragePad = 0.45;
      var maxCoverage = Math.max(ringOuter, pingOuter) + coveragePad;
      if (!(maxCoverage > 0)) maxCoverage = 1.6;

      var focusActive = runtime && runtime.focusDimActive !== undefined ? !!runtime.focusDimActive : false;
      var dimRgbMul = numOr(runtime && runtime.focusDimRgbMul, 0.58);
      if (dimRgbMul < 0) dimRgbMul = 0;
      if (dimRgbMul > 1) dimRgbMul = 1;
      var dimAlphaMul = numOr(runtime && runtime.focusDimAlphaMul, 0.1);
      if (dimAlphaMul < 0) dimAlphaMul = 0;
      if (dimAlphaMul > 1) dimAlphaMul = 1;

      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_time, performance.now() * 0.001);
      gl.uniform1f(uniformLocations.u_maxCoverageMul, maxCoverage);
      gl.uniform1f(uniformLocations.u_ping_max_radius_mul, pingRadiusMul);
      gl.uniform1f(uniformLocations.u_ping_width_mul, pingWidthMul);
      gl.uniform1f(uniformLocations.u_ping_alpha, pingAlpha);
      gl.uniform1f(uniformLocations.u_ring_base_mul, ringBaseMul);
      gl.uniform1f(uniformLocations.u_ring_pulse_mul, ringPulseMul);
      gl.uniform1f(uniformLocations.u_ring_width_mul, ringWidthMul);
      gl.uniform1f(uniformLocations.u_ring_speed, ringSpeed);
      gl.uniform1f(uniformLocations.u_focus_active, focusActive ? 1 : 0);
      gl.uniform1f(uniformLocations.u_dim_rgb_mul, dimRgbMul);
      gl.uniform1f(uniformLocations.u_dim_alpha_mul, dimAlphaMul);
    }
  }

  registry.node.node_fx = AJPCNodeFxProgram;
})();
