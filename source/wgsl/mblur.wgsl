// Per-pixel motion blur (McGuire-style reconstruction): spreads along the block's dominant velocity,
// weighting each sample by depth and by its own velocity — the car stays sharp, the scenery streaks.
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var tCol: texture_2d<f32>;
@group(0) @binding(2) var tVel: texture_2d<f32>;
@group(0) @binding(3) var tTile: texture_2d<f32>;
@group(0) @binding(4) var gD: texture_depth_2d;
@group(0) @binding(5) var sClamp: sampler;
fn linZ(d: f32) -> f32 { return F.camFwd.w / max(d, 1e-6); }
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy); let sz = F.screen.xy; let dim = vec2i(sz) - 1;
  let c0 = textureLoad(tCol, p, 0).rgb;
  let k = F.post.x * 0.5;                              // shutter fraction (in px per px of velocity)
  let maxLen = 26.0 * sz.y / 1440.0;
  let noise = ign(in.pos.xy, F.misc.y);
  // dithered tile to hide the grid
  let tdim = vec2f(textureDimensions(tTile));
  let tuv = (in.pos.xy + (vec2f(noise, fract(noise * 7.31)) - 0.5) * f32(TILE) * 0.8) / (tdim * f32(TILE));
  var vmax = textureSampleLevel(tTile, sClamp, tuv, 0.0).xy * sz * k;
  let lm = length(vmax);
  if (lm < 0.6) { return vec4f(c0, 1.0); }
  if (lm > maxLen) { vmax *= maxLen / lm; }
  let lmc = min(lm, maxLen);
  var vc = textureLoad(tVel, p, 0).xy * sz * k; let lc = min(length(vc), maxLen);
  let zc = linZ(textureLoad(gD, p, 0));
  const NS = 24;
  var acc = c0 * 1.0; var ws = 1.0;
  // center weight: lower when the center itself is moving
  let wc = 1.0 / max(lc, 0.75); acc = c0 * wc; ws = wc;
  for (var i = 0; i < NS; i++) {
    let t = mix(-1.0, 1.0, (f32(i) + noise) / f32(NS));
    let off = vmax * t; let q = in.pos.xy + off; let qi = clamp(vec2i(q), vec2i(0), dim);
    let zs = linZ(textureLoad(gD, qi, 0)); let ls = min(length(textureLoad(tVel, qi, 0).xy * sz * k), maxLen);
    let dl = length(off);
    // a sample in front smears over the center if it moves enough; a sample behind shows if the center moves
    let fg = sat(1.0 - (zs - zc) / (0.05 * zc + 0.02)); let bg = sat(1.0 - (zc - zs) / (0.05 * zc + 0.02));
    let w = fg * sat(1.0 - dl / max(ls, 0.01)) + bg * sat(1.0 - dl / max(lc, 0.01)) + sat(1.0 - dl / max(ls, 0.01) + 0.05) * sat(1.0 - dl / max(lc, 0.01) + 0.05) * 2.0;
    let wk = w * (1.0 - 0.75 * abs(t));   // tent kernel: continuous trail, no double image of a box kernel
    acc += textureSampleLevel(tCol, sClamp, q / sz, 0.0).rgb * wk; ws += wk;
  }
  return vec4f(acc / ws, 1.0);
}
