// Generates the tileable noise textures (once, at initialization).
#include fsq
struct NB { p: vec4f }   // x = z slice (0..1) for 3D, y = mode
@group(0) @binding(0) var<uniform> U: NB; // @dyn
fn h3(p: vec3f) -> vec3f { var q = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)), dot(p, vec3f(269.5, 183.3, 246.1)), dot(p, vec3f(113.5, 271.9, 124.6))); return fract(sin(q) * 43758.5453); }
fn wrp(p: vec3f, per: f32) -> vec3f { return p - per * floor(p / per); }
// periodic gradient noise
fn gnoise(p: vec3f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  var r = 0.0; var acc = array<f32, 8>();
  for (var k = 0; k < 8; k++) {
    let o = vec3f(f32(k & 1), f32((k >> 1) & 1), f32((k >> 2) & 1));
    let g = normalize(h3(wrp(i + o, per)) * 2.0 - 1.0);
    acc[k] = dot(g, f - o);
  }
  let x0 = mix(acc[0], acc[1], u.x); let x1 = mix(acc[2], acc[3], u.x); let x2 = mix(acc[4], acc[5], u.x); let x3 = mix(acc[6], acc[7], u.x);
  return mix(mix(x0, x1, u.y), mix(x2, x3, u.y), u.z) * 0.9 + 0.5;
}
// periodic Worley (1 - distance to the nearest point)
fn worley(p: vec3f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); var d = 1.0;
  for (var z = -1; z <= 1; z++) { for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let q = h3(wrp(i + o, per)) + o - f; d = min(d, dot(q, q));
  } } }
  return 1.0 - sqrt(d);
}
fn gfbm(p: vec3f, per: f32, oct: i32) -> f32 { var a = 0.5; var s = 0.0; var n = 0.0; var q = p; var pp = per; for (var i = 0; i < oct; i++) { s += a * gnoise(q, pp); n += a; q *= 2.0; pp *= 2.0; a *= 0.5; } return s / n; }
fn wfbm(p: vec3f, per: f32) -> f32 { return worley(p, per) * 0.625 + worley(p * 2.0, per * 2.0) * 0.25 + worley(p * 4.0, per * 4.0) * 0.125; }
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  if (U.p.y < 0.5) {
    // 3D: R = Perlin-Worley (base cloud shape), G = medium Worley fbm, B = fine Worley fbm, A = Perlin fbm
    let p = vec3f(in.uv, U.p.x);
    let pf = gfbm(p * 4.0, 4.0, 5); let w1 = wfbm(p * 4.0, 4.0); let w2 = wfbm(p * 8.0, 8.0); let w3 = wfbm(p * 16.0, 16.0);
    let pw = saturate((pf - (1.0 - w1) * 0.55) / (1.0 - (1.0 - w1) * 0.55));
    return vec4f(pw, w2, w3, pf);
  }
  // 2D 512²: R,G = fbm (2 seeds), B = cellular, A = white noise
  let p = vec3f(in.uv, 0.37);
  let a = gfbm(p * 8.0, 8.0, 6); let b = gfbm(p * 8.0 + vec3f(3.0, 5.0, 2.31), 8.0, 6);
  let c = worley(vec3f(in.uv * 24.0, 0.5), 24.0);
  let d = fract(sin(dot(floor(in.uv * 512.0), vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(a, b, c, d);
}
