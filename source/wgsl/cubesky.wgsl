// Sky in the environment cubemap (without the solar disk: the sun's specular highlight comes from direct light).
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<uniform> P: CP; // @dyn
@group(0) @binding(2) var tSky: texture_2d<f32>;
@group(0) @binding(3) var sSky: sampler;
struct CP { inv: mat4x4f }
#include skyfn
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let w = P.inv * vec4f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, 1.0, 1.0);
  let w0 = P.inv * vec4f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, 0.0, 1.0);
  let d = normalize(w.xyz / w.w - w0.xyz / w0.w);
  let uv = skyUV(d);
  var c = textureSampleLevel(tSky, sSky, uv, 0.0).rgb;
  // below the horizon: average ground color (the real terrain is drawn on top)
  c = mix(c, vec3f(0.035, 0.05, 0.02) * F.sunCol.rgb * 0.6 + vec3f(0.01, 0.014, 0.02), smoothstep(0.0, -0.05, d.y));
  return vec4f(c, 1.0);
}
