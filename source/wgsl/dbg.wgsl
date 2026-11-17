// Debug visualization of any texture.
#include fsq
struct DU { p: vec4f }
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var<uniform> U: DU;
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  var c = textureSampleLevel(t, s, in.uv, 0.0);
  if (U.p.y > 0.5) { c = vec4f(c.a); }
  if (any(c.rgb != c.rgb)) { return vec4f(1.0, 0.0, 1.0, 1.0); }
  return vec4f(pow(clamp(c.rgb * U.p.x, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
