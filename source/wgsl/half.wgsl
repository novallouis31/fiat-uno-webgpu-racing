// Half resolution: screen-space ambient occlusion (r) + average sun visibility in fog (g) + linear z (b).
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var gD: texture_depth_2d;
@group(0) @binding(2) var gB: texture_2d<f32>;
@group(0) @binding(3) var tShadow: texture_depth_2d_array;
@group(0) @binding(4) var tShadowS: texture_depth_2d;
@group(0) @binding(5) var sCmp: sampler_comparison;
fn viewPos(px: vec2f, d: f32) -> vec3f {
  let uv = px * F.screen.zw;
  let p = F.invProjJ * vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d, 1.0); return p.xyz / p.w;
}
fn fogSigma(y: f32) -> f32 { return F.fog.x * exp(-F.fog.y * (y - F.fog.z)); }
fn sunVis1(wp: vec3f) -> f32 {
  for (var c = 1; c < 3; c++) {
    let lp = F.shadowVP[c] * vec4f(wp, 1.0); let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
    if (uv.x > 0.01 && uv.y > 0.01 && uv.x < 0.99 && uv.y < 0.99 && lp.z < 1.0) { return textureSampleCompareLevel(tShadow, sCmp, uv, c, lp.z - 0.0006); }
  }
  let lp = F.shadowVP[3] * vec4f(wp, 1.0); let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 1.0; }
  return textureSampleCompareLevel(tShadowS, sCmp, uv, lp.z - 0.001);
}
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let fp = floor(in.pos.xy) * 2.0 + 0.5;               // corresponding full-resolution pixel
  let pxi = vec2i(fp); let dim = vec2i(F.screen.xy) - 1;
  let d = textureLoad(gD, pxi, 0);
  let noise = ign(in.pos.xy, F.misc.y);
  var ao = 1.0; var zl = 30000.0;
  if (d > 0.0) {
    let P = viewPos(fp, d); zl = -P.z;
    let N = (F.view * vec4f(octDec(textureLoad(gB, pxi, 0).xy), 0.0)).xyz;
    let R = clamp(zl * 0.11, 0.35, 1.6);                // radius in meters, grows with distance
    let ps = F.screen.y * 0.5 / F.post.y;
    let rpx = clamp(R * ps / zl, 5.0, 96.0);
    var occ = 0.0; const NS = 14;
    for (var i = 0; i < NS; i++) {
      let r = (f32(i) + 0.5 + noise * 0.5) / f32(NS); let a = (f32(i) * 2.39996 + noise * 6.2832);
      let sp = fp + vec2f(cos(a), sin(a)) * rpx * r;
      let si = clamp(vec2i(sp), vec2i(0), dim);
      let S = viewPos(vec2f(si) + 0.5, textureLoad(gD, si, 0));
      let v = S - P; let vv = dot(v, v); let vn = dot(v, N);
      occ += max(0.0, vn - 0.015 * zl * 0.2 - 0.004) / (vv + 0.0006) * sat(1.0 - vv / (R * R));
    }
    ao = sat(1.0 - occ * (2.0 * 0.11 / f32(NS)) * 4.6);
  }
  // fog: illuminated fraction along the ray
  let wpp = F.invViewProjJ * vec4f(fp.x * F.screen.z * 2.0 - 1.0, 1.0 - fp.y * F.screen.w * 2.0, max(d, 1e-5), 1.0);
  let wp = wpp.xyz / wpp.w; let cam = F.camPos.xyz; let dv = wp - cam; let dist = length(dv); let dir = dv / dist;
  let tMax = min(dist, VOL_DIST); const NV = 20; var wsum = 1e-6; var vsum = 0.0; var T = 1.0; var tp = 0.0;
  let j2 = fract(noise + 0.618 * f32(pxi.x & 1) + 0.31 * f32(pxi.y & 1));
  for (var i = 0; i < NV; i++) {
    let f1 = (f32(i) + 1.0) / f32(NV); let tn = tMax * f1 * f1; let dt = tn - tp; let t = tp + dt * j2; tp = tn;
    let p = cam + dir * t; let sg = fogSigma(p.y);
    let w = sg * T * dt; T *= exp(-sg * dt);
    vsum += w * sunVis1(p); wsum += w;
  }
  return vec4f(ao, vsum / wsum, min(zl, 30000.0), 1.0);
}
