// Landing background: a slow, noise-warped hairline grid in Ice cyan, with a ripple where
// the user touches. Cheap: one full-screen pass.
export const FIELD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_touch;  // x, y in pixels (top-left origin), z = seconds since touch
uniform vec3 u_accent;
uniform int u_tier;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  float scale = 56.0 * max(1.0, u_res.y / 1000.0);
  float t = u_time * 0.06;
  vec2 warp = vec2(noise(px / 420.0 + t), noise(px / 420.0 - t + 7.3)) - 0.5;
  vec2 p = px + warp * 60.0;
  // Ripple from the last touch.
  float d = distance(px, u_touch.xy);
  float ring = exp(-abs(d - u_touch.z * 520.0) / 30.0) * exp(-u_touch.z * 1.6);
  p += normalize(px - u_touch.xy + 0.001) * ring * 14.0;
  vec2 g = abs(fract(p / scale) - 0.5) * scale;
  float line = 1.0 - smoothstep(0.0, 1.1, min(g.x, g.y));
  float node = 1.0 - smoothstep(0.0, 2.2, length(g - scale * 0.5));
  float fade = smoothstep(0.0, 0.9, 1.0 - length((px / u_res - vec2(0.5, 0.35)) * vec2(1.2, 1.0)));
  float pulse = 0.5 + 0.5 * sin(u_time * 0.7 + noise(p / scale) * 6.28);
  float a = (line * 0.10 + node * 0.35 * pulse + ring * 0.25) * fade;
  if (u_tier >= 2) a = line * 0.08 * fade;
  o = vec4(u_accent * a, a);
}`;
