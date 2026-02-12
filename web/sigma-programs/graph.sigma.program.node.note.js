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

  var FRAGMENT_SHADER_SOURCE = [
    "precision highp float;",
    "",
    "varying vec4 v_color;",
    "varying vec2 v_diffVector;",
    "varying float v_radius;",
    "varying float v_seed;",
    "",
    "uniform float u_correctionRatio;",
    "uniform float u_aaEnabled;",
    "uniform float u_time;",
    "",
    "float band(float d, float inner, float outer, float aa) {",
    "  float inA = smoothstep(inner - aa, inner + aa, d);",
    "  float outA = 1.0 - smoothstep(outer - aa, outer + aa, d);",
    "  return clamp(inA * outA, 0.0, 1.0);",
    "}",
    "",
    "void main(void) {",
    "  if (v_radius <= 0.0) discard;",
    "",
    "  float d = length(v_diffVector);",
    "  float coreRadius = v_radius;",
    "  float ringGap = coreRadius * 0.14;",
    "  float ringWidth = coreRadius * 0.14;",
    "  float ringInner = coreRadius + ringGap;",
    "  float ringOuter = ringInner + ringWidth;",
    "  float pulseInner = ringOuter;",
    "",
    "  float wave = 0.5 + (0.5 * sin(((u_time * 0.4) + v_seed) * 6.28318530718));",
    "  float pulseOuter = pulseInner + (coreRadius * (0.2 + (0.2 * wave)));",
    "",
    "  float aa = coreRadius * 0.02 * u_correctionRatio;",
    "  float aaOn = step(0.5, u_aaEnabled);",
    "",
    "  float core = mix(1.0 - step(coreRadius, d), 1.0 - smoothstep(coreRadius - aa, coreRadius + aa, d), aaOn);",
    "  float ringHard = step(ringInner, d) * (1.0 - step(ringOuter, d));",
    "  float pulseHard = step(pulseInner, d) * (1.0 - step(pulseOuter, d));",
    "  float ring = mix(ringHard, band(d, ringInner, ringOuter, aa), aaOn);",
    "  float pulse = mix(pulseHard, band(d, pulseInner, pulseOuter, aa), aaOn);",
    "",
    "  #ifdef PICKING_MODE",
    "    gl_FragColor = v_color;",
    "  #else",
    "    float baseAlpha = v_color.a * clamp(core + ring, 0.0, 1.0);",
    "    float pulseAlpha = v_color.a * (0.3 * pulse);",
    "    float alpha = max(baseAlpha, pulseAlpha);",
    "    if (alpha <= 0.001) discard;",
    "    float maxOuter = mix(pulseOuter, pulseOuter + aa, aaOn);",
    "    if (d > maxOuter) discard;",
    "    gl_FragColor = vec4(v_color.rgb * alpha, alpha);",
    "  #endif",
    "}"
  ].join("\n");
  var VERTEX_SHADER_SOURCE = "\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_seed;\nattribute float a_angle;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\nvarying float v_seed;\n\nconst float bias = 255.0 / 254.0;\nconst float coverageScale = 2.1;\n\nvoid main() {\n  float baseSize = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 unit = vec2(cos(a_angle), sin(a_angle));\n  vec2 diffVector = (baseSize * coverageScale) * unit;\n  vec2 position = a_position + diffVector;\n  gl_Position = vec4((u_matrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n\n  v_diffVector = diffVector;\n  v_radius = baseSize / 2.0;\n  v_seed = a_seed;\n\n  #ifdef PICKING_MODE\n    v_color = a_id;\n  #else\n    v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n";

  var UNSIGNED_BYTE = WebGLRenderingContext.UNSIGNED_BYTE;
  var FLOAT = WebGLRenderingContext.FLOAT;
  var UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_aaEnabled", "u_time", "u_matrix"];

  class AJPCNoteNodeProgram extends NodeProgram {
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
          { name: "a_seed", size: 1, type: FLOAT },
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
      var color = floatColor(data.color);
      var seed = (Math.abs((nodeIndex * 1103515245) + 12345) % 2048) / 2048;
      array[startIndex++] = data.x;
      array[startIndex++] = data.y;
      array[startIndex++] = data.size;
      array[startIndex++] = seed;
      array[startIndex++] = color;
      array[startIndex++] = nodeIndex;
    }

    setUniforms(params, context) {
      var gl = context.gl;
      var uniformLocations = context.uniformLocations;
      var runtime = root && root.AJPCSigmaRuntime && typeof root.AJPCSigmaRuntime === "object" ? root.AJPCSigmaRuntime : null;
      var aaEnabled = runtime && runtime.noteNodeAAEnabled !== undefined ? !!runtime.noteNodeAAEnabled : true;
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_aaEnabled, aaEnabled ? 1 : 0);
      gl.uniform1f(uniformLocations.u_time, performance.now() * 0.001);
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    }
  }

  registry.node.note = AJPCNoteNodeProgram;
})();
