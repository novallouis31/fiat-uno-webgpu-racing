// Bloom: downsample chain (13 samples, Karis average at the first level) and additive 3x3 tent upsample.
#include fsq
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn kw(c: vec3f) -> f32 { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(t)); let uv = in.uv;
#ifdef UP
  var c = textureSampleLevel(t, s, uv, 0.0).rgb * 4.0;
  c += (textureSampleLevel(t, s, uv + vec2f(ts.x, 0.0), 0.0).rgb + textureSampleLevel(t, s, uv - vec2f(ts.x, 0.0), 0.0).rgb + textureSampleLevel(t, s, uv + vec2f(0.0, ts.y), 0.0).rgb + textureSampleLevel(t, s, uv - vec2f(0.0, ts.y), 0.0).rgb) * 2.0;
  c += textureSampleLevel(t, s, uv + ts, 0.0).rgb + textureSampleLevel(t, s, uv - ts, 0.0).rgb + textureSampleLevel(t, s, uv + vec2f(ts.x, -ts.y), 0.0).rgb + textureSampleLevel(t, s, uv + vec2f(-ts.x, ts.y), 0.0).rgb;
  return vec4f(c / 16.0 * UPW, 1.0);
#else
  let a = textureSampleLevel(t, s, uv + ts * vec2f(-2.0, -2.0), 0.0).rgb; let b = textureSampleLevel(t, s, uv + ts * vec2f(0.0, -2.0), 0.0).rgb; let c = textureSampleLevel(t, s, uv + ts * vec2f(2.0, -2.0), 0.0).rgb;
  let d = textureSampleLevel(t, s, uv + ts * vec2f(-2.0, 0.0), 0.0).rgb; let e = textureSampleLevel(t, s, uv, 0.0).rgb; let f = textureSampleLevel(t, s, uv + ts * vec2f(2.0, 0.0), 0.0).rgb;
  let g = textureSampleLevel(t, s, uv + ts * vec2f(-2.0, 2.0), 0.0).rgb; let h = textureSampleLevel(t, s, uv + ts * vec2f(0.0, 2.0), 0.0).rgb; let i = textureSampleLevel(t, s, uv + ts * vec2f(2.0, 2.0), 0.0).rgb;
  let j = textureSampleLevel(t, s, uv + ts * vec2f(-1.0, -1.0), 0.0).rgb; let k = textureSampleLevel(t, s, uv + ts * vec2f(1.0, -1.0), 0.0).rgb;
  let l = textureSampleLevel(t, s, uv + ts * vec2f(-1.0, 1.0), 0.0).rgb; let m = textureSampleLevel(t, s, uv + ts * vec2f(1.0, 1.0), 0.0).rgb;
#ifdef FIRST
  let g0 = (j + k + l + m) * 0.25; let g1 = (a + b + d + e) * 0.25; let g2 = (b + c + e + f) * 0.25; let g3 = (d + e + g + h) * 0.25; let g4 = (e + f + h + i) * 0.25;
  let w0 = kw(g0) * 0.5; let w1 = kw(g1) * 0.125; let w2 = kw(g2) * 0.125; let w3 = kw(g3) * 0.125; let w4 = kw(g4) * 0.125;
  return vec4f(min((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), vec3f(200.0)), 1.0);
#else
  return vec4f(e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125, 1.0);
#endif
#endif
}
