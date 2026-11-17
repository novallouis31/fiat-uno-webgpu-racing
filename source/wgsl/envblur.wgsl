// Pre-filters the environment cubemap mips: each level blurs the previous one with disk samples (no seams between faces).
#include fsq
struct EB { ax: vec4f, ay: vec4f, az: vec4f, p: vec4f }
@group(0) @binding(0) var<uniform> U: EB; // @dyn
@group(0) @binding(1) var t: texture_cube<f32>;
@group(0) @binding(2) var s: sampler;
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let q = in.uv * 2.0 - 1.0;
  let d = normalize(U.az.xyz + U.ax.xyz * q.x + U.ay.xyz * q.y);
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9);
  let tx = normalize(cross(up, d)); let ty = cross(d, tx);
  var acc = vec4f(0.0); let rad = U.p.x;
  for (var i = 0; i < 12; i++) {
    let r = sqrt((f32(i) + 0.5) / 12.0) * rad; let a = f32(i) * 2.39996323;
    let dd = normalize(d + (tx * cos(a) + ty * sin(a)) * r);
    let c = textureSampleLevel(t, s, dd, 0.0).rgb;
    let w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)) * 0.02); acc += vec4f(c * w, w);
  }
  return vec4f(acc.rgb / acc.a, 1.0);
}
