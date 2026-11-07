// Ice scan layer: a thin sweeping beam with a hairline grid revealed in its trail, a light
// chromatic fringe (high tier), faint scanlines and grain; plus lock-on brackets drawn as
// instanced quads. Everything is drawn on a transparent canvas above the photo.
export const BEAM_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_beam;  // 0..1 top to bottom, < 0 when no sweep
uniform int u_tier;    // 0 high, 1 medium, 2 low
uniform vec3 u_accent;
uniform vec3 u_alert;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 px = uv * u_res;
  vec3 c = vec3(0.0);
  float a = 0.0;
  if (u_beam >= 0.0) {
    float d = uv.y - u_beam;
    float beam = exp(-abs(d) * 700.0);
    float trail = d < 0.0 ? exp(d * 7.0) : 0.0;
    c += u_accent * beam * 1.6;
    a += beam * 0.95;
    if (u_tier <= 1) {
      vec2 g = abs(fract(px / (48.0 * max(1.0, u_res.y / 900.0))) - 0.5);
      float grid = 1.0 - smoothstep(0.0, 0.025, min(g.x, g.y));
      c += u_accent * grid * trail * 0.9;
      a += grid * trail * 0.45 + trail * 0.08;
    }
    if (u_tier == 0) {
      c.r += exp(-abs(d + 0.004) * 700.0) * 0.35 + u_alert.r * exp(-abs(d + 0.008) * 900.0) * 0.15;
      c.b += exp(-abs(d - 0.004) * 700.0) * 0.45;
    }
  }
  if (u_tier <= 1) {
    float lines = 0.5 + 0.5 * sin(px.y * 1.5708);
    a += (1.0 - lines) * 0.05;
    float grain = hash(px + fract(u_time) * 97.0) - 0.5;
    c += vec3(grain * 0.05);
    a += abs(grain) * 0.03;
  }
  o = vec4(c, clamp(a, 0.0, 1.0));
}`;

export const RETICLE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;     // quad corner, -1..1
layout(location = 1) in vec4 a_rect;    // x, y, w, h in 0..1 (top-left origin)
layout(location = 2) in vec3 a_state;   // scale, alpha, alert
uniform vec2 u_res;
out vec2 v_local;  // 0..1 across the bracket box
out vec2 v_size;   // box size in pixels
out vec2 v_state;  // alpha, alert
void main() {
  vec2 center = a_rect.xy + a_rect.zw * 0.5;
  vec2 half_ = a_rect.zw * 0.5 * a_state.x + 2.0 / u_res;
  vec2 p = center + a_pos * half_;
  v_local = a_pos * 0.5 + 0.5;
  v_size = half_ * 2.0 * u_res;
  v_state = a_state.yz;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

export const RETICLE_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec2 v_size;
in vec2 v_state;
out vec4 o;
uniform vec3 u_accent;
uniform vec3 u_alert;
uniform float u_px;  // line width in pixels
void main() {
  vec2 p = v_local * v_size;            // pixels from the top-left corner
  vec2 q = min(p, v_size - p);          // distance to the nearest edges
  float arm = min(v_size.x, v_size.y) * 0.24;
  bool nearX = q.x < u_px && q.y < arm;
  bool nearY = q.y < u_px && q.x < arm;
  if (!(nearX || nearY)) discard;
  vec3 c = mix(u_accent, u_alert, v_state.y);
  o = vec4(c * v_state.x, v_state.x);
}`;
