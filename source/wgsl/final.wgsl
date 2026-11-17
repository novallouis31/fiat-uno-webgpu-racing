// Output: bloom, exposure, tone mapping, light sharpening, vignette, grain and dithering against banding.
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var tCol: texture_2d<f32>;
@group(0) @binding(2) var tBloom: texture_2d<f32>;
@group(0) @binding(3) var tExp: texture_2d<f32>;
@group(0) @binding(4) var s: sampler;
@group(0) @binding(5) var gD: texture_depth_2d;
// AgX (polynomial approximation) with a "punchy" look
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x; let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn agx(c: vec3f) -> vec3f {
  let m = mat3x3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let mi = mat3x3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438, -0.0980208811401368, 1.15190312990417, -0.0980434501171241, -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  var v = m * c;
  v = clamp(log2(max(v, vec3f(1e-10))), vec3f(-12.47393), vec3f(4.026069));
  v = (v + 12.47393) / (4.026069 + 12.47393);
  v = agxContrast(v);
  // look: more contrast and saturation
  let l = dot(v, vec3f(0.2126, 0.7152, 0.0722));
  v = pow(max(v, vec3f(0.0)), vec3f(1.12));
  v = mix(vec3f(dot(v, vec3f(0.2126, 0.7152, 0.0722))), v, 1.32);
  v = mi * v;
  return sat3(v);   // already in display encoding (≈ sRGB 2.2)
}
fn tone(c: vec3f) -> vec3f { return agx(c); }
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy); let dim = vec2i(F.screen.xy) - 1;
  // partial auto exposure: compensates ~50% of the luminance variation (dark scenes stay a bit darker)
  let lavg = clamp(textureLoad(tExp, vec2i(0), 0).r, 0.02, 3.0);
  let ex = F.misc.z * 0.094 * pow(0.16 / lavg, 0.5) / 0.16;
  var c = textureLoad(tCol, p, 0).rgb;
  // sharpening (in tone space) with the 4 neighbors
  let n = textureLoad(tCol, clamp(p + vec2i(0, -1), vec2i(0), dim), 0).rgb + textureLoad(tCol, clamp(p + vec2i(0, 1), vec2i(0), dim), 0).rgb
        + textureLoad(tCol, clamp(p + vec2i(-1, 0), vec2i(0), dim), 0).rgb + textureLoad(tCol, clamp(p + vec2i(1, 0), vec2i(0), dim), 0).rgb;
  let bl = textureSampleLevel(tBloom, s, in.uv, 0.0).rgb * (1.0 / 6.0);
  let lc = lum(c); let ln = lum(n) * 0.25;
  let sharp = clamp((lc - ln) * 0.8, -0.3 * lc, 0.4 * lc);
  c = c * (1.0 + sharp / max(lc, 1e-4));
  c = mix(c, bl, 0.055);
  // sun lens flare: halo + thin rays, proportional to the fraction of the solar disk visible (not occluded by geometry)
  if (F.sunScr.z > 0.5 && F.sunScr.x > -0.3 && F.sunScr.x < 1.3 && F.sunScr.y > -0.3 && F.sunScr.y < 1.3) {
    var vis = 0.0;
    for (var i = 0; i < 6; i++) {
      let a = f32(i) * 1.0472; let q = F.sunScr.xy + vec2f(cos(a), sin(a) * F.post.z) * 0.006 * f32(1 + (i & 1));
      if (q.x > 0.0 && q.y > 0.0 && q.x < 1.0 && q.y < 1.0) { vis += select(0.0, 1.0, textureLoad(gD, vec2i(q * F.screen.xy), 0) <= 0.0); }
    }
    vis /= 6.0;
    if (vis > 0.0) {
      let dv = (in.uv - F.sunScr.xy) * vec2f(F.post.z, 1.0); let r = length(dv); let an = atan2(dv.y, dv.x);
      let halo = 0.05 / (1.0 + pow(r / 0.045, 2.0)) + 0.012 / (1.0 + pow(r / 0.25, 2.0));
      let rays = (pow(abs(cos(an * 3.0 + 0.4)), 40.0) * 0.5 + pow(abs(cos(an * 7.0 + 1.1)), 90.0) * 0.25) * 0.05 / (1.0 + pow(r / 0.16, 2.0));
      let streak = 0.03 * exp(-abs(dv.y) * 90.0) / (1.0 + pow(abs(dv.x) / 0.3, 2.0));
      c += F.sunCol.rgb * (halo + rays + streak) * vis * 0.32;
    }
  }
  // vignette
  let q = (in.uv - 0.5) * vec2f(F.post.z / 1.7778, 1.0); let vg = 1.0 - smoothstep(0.35, 1.25, length(q) * 1.45) * 0.42;
  // white balance: neutralizes part of the orange tint of the low sun (the rest stays as a late-afternoon mood)
  let sc = F.sunCol.rgb / lum(F.sunCol.rgb);
  c *= pow(sc, vec3f(-0.5));
  c *= ex * vg;
  var o = tone(c);
  // fine grain + triangular dithering
  let h = hash22(in.pos.xy + vec2f(F.misc.y * 37.0, F.misc.y * 17.0));
  let tri = (h.x + h.y - 1.0);
  o += vec3f(tri) * (1.2 / 255.0) + (h.x - 0.5) * 0.012 * (1.0 - o) * o * 4.0 * 0.5;
  return vec4f(o, 1.0);
}
