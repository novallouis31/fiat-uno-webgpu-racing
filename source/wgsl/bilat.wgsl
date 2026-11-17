// Separable depth-aware blur for (ao, vol); b = linear z passes straight through.
#include fsq
@group(0) @binding(0) var t: texture_2d<f32>;
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy); let dim = vec2i(textureDimensions(t)) - 1;
  let c = textureLoad(t, p, 0); var acc = c.rg; var ws = 1.0;
  for (var i = -4; i <= 4; i++) {
    if (i == 0) { continue; }
    let q = clamp(p + vec2i(DIR) * i, vec2i(0), dim); let s = textureLoad(t, q, 0);
    let w = exp(-f32(i * i) / 10.0) * exp(-abs(s.b - c.b) / (0.03 * c.b + 0.03) * 2.0);
    acc += s.rg * w; ws += w;
  }
  return vec4f(acc / ws, c.b, 1.0);
}
