// Auto exposure: average (log) luminance of the smallest bloom level, smoothed over time.
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var tSmall: texture_2d<f32>;
@group(0) @binding(2) var tPrev: texture_2d<f32>;
@group(0) @binding(3) var s: sampler;
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  var acc = 0.0; var ws = 0.0;
  for (var y = 0; y < 6; y++) { for (var x = 0; x < 10; x++) {
    let uv = (vec2f(f32(x), f32(y)) + 0.5) / vec2f(10.0, 6.0);
    let w = 1.0 - 0.6 * length(uv - vec2f(0.5, 0.55));     // higher weight in the center
    acc += log(max(lum(textureSampleLevel(tSmall, s, uv, 0.0).rgb), 1e-4)) * w; ws += w;
  } }
  let cur = exp(acc / ws); let prev = textureLoad(tPrev, vec2i(0), 0).r;
  let a = select(1.0 - exp(-F.misc.x / 0.9), 1.0, prev <= 0.0 || F.misc.w > 0.5);
  return vec4f(mix(prev, cur, a), 0.0, 0.0, 1.0);
}
