// Shadow sampling: 3 dynamic cascades + a static world map. Requires tShadow, tShadowS, sCmp, and F.
const VOGEL_N = 8;
fn vogel(i: i32, n: i32, phi: f32) -> vec2f { let r = sqrt((f32(i) + 0.5) / f32(n)); let a = f32(i) * 2.39996323 + phi; return vec2f(cos(a), sin(a)) * r; }
fn shadowTap(c: i32, uv: vec2f, z: f32, rad: f32, phi: f32) -> f32 {
  var s = 0.0;
  // near cascade with more samples (large penumbras over the car don't show the noise pattern)
  let n = select(VOGEL_N, 16, c == 0);
  for (var i = 0; i < n; i++) { s += textureSampleCompareLevel(tShadow, sCmp, uv + vogel(i, n, phi) * rad, c, z); }
  return s / f32(n);
}
fn shadowStatic(wp: vec3f, n: vec3f, phi: f32, soft: f32) -> f32 {
  let tw = F.shadowP.w;
  let lp = F.shadowVP[3] * vec4f(wp + n * tw * 1.2, 1.0);
  let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || lp.z > 1.0) { return 1.0; }
  var s = 0.0; let rad = soft / 4096.0;
  for (var i = 0; i < 5; i++) { s += textureSampleCompareLevel(tShadowS, sCmp, uv + vogel(i, 5, phi) * rad, lp.z - 0.0012); }
  return s / 5.0;
}
// sun visibility at wp (normal n, pixel px for the noise). nl = N·L for the bias.
fn sunShadow(wp: vec3f, n: vec3f, px: vec2f, nl: f32) -> f32 { return sunShadowK(wp, n, px, nl, 1.0); }
// rot = 0: fixed kernel, no per-pixel rotation (for clear-coated surfaces: the specular highlight amplified noise into a pattern)
fn sunShadowK(wp: vec3f, n: vec3f, px: vec2f, nl: f32, rot: f32) -> f32 {
  let noise = ign(px, F.misc.y);
  let phi = noise * 6.2831853 * rot;
  let slope = sat(1.0 - nl);
  // walks the cascades from finest to coarsest; in each one's border band it BLENDS with the next
  // (before, the switch was dithered by noise and the cascade edge showed up as "comb teeth" on the asphalt)
  var acc = 0.0; var wAcc = 0.0;
  for (var c = 0; c < 3; c++) {
    let tw = F.shadowP[c];
    let lp = F.shadowVP[c] * vec4f(wp + n * tw * (0.6 + 2.2 * slope), 1.0);
    let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
    let e = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
    if (e > 0.012 && lp.z < 1.0 && lp.z > 0.0) {
      let rad = select(select(1.6, 2.0, c == 1), 2.6, c == 0) / SHADOW_RES;
      let w = (1.0 - wAcc) * sat((e - 0.012) / 0.06);
      acc += shadowTap(c, uv, lp.z - 0.00035, rad, phi) * w; wAcc += w;
      if (wAcc > 0.999) { return acc; }
    }
  }
  return acc + (1.0 - wAcc) * shadowStatic(wp, n, phi, 1.6);
}
