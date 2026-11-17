// Ground material (terrain and track verge use the same function → invisible seam).
// mowed / rough grass, dirt, gravel, concrete and pit lane, forest floor and, at distance, forest canopy.
#include palette
fn grHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
// painted pit-lane markings (main straight runs along +X with z = d, s = x + 60)
fn pitPaint(sr: f32, d: f32, aa: f32) -> f32 {
  var m = 0.0;
  let inB = step(PIT_B0 - 6.0, sr) * step(sr, PIT_B1 + 6.0);
  // fast-lane line and line along the wall
  m = max(m, (1.0 - smoothstep(0.05, 0.05 + aa, abs(d - (PIT_L0 + 0.35)))) * inB);
  m = max(m, (1.0 - smoothstep(0.06, 0.06 + aa, abs(d - 12.9))) * inB);
  // speed limits (transverse bands) at the entry and exit
  let cross = min(abs(sr - (PIT_B0 - 6.0)), abs(sr - (PIT_B1 + 6.0)));
  m = max(m, (1.0 - smoothstep(0.15, 0.15 + aa, cross)) * step(PIT_L0 + 0.3, d) * step(d, PIT_L1 - 0.2));
  // garage slots: T markings every 7 m
  let u = (sr - PIT_B0) / 7.0; let fu = abs(fract(u) - 0.5) * 7.0;
  let tee = max((1.0 - smoothstep(0.05, 0.05 + aa, abs(fu - 3.5))) * step(13.4, d) * step(d, 16.6),
                (1.0 - smoothstep(0.05, 0.05 + aa, abs(d - 13.4))) * step(2.3, fu));
  m = max(m, tee * inB * step(PIT_B0, sr) * step(sr, PIT_B1));
  return m;
}
fn groundSurf(wpos: vec3f, Ng: vec3f, forest: f32) -> Surface {
  var s = surfDefault(Ng);
  let xz = wpos.xz;
#ifdef PASS_CUBE
  let dist = distance(wpos, P.camPos.xyz);
#else
  let dist = distance(wpos, F.camPos.xyz);
#endif
  let z = wmZone(xz);
  let adist = z.r * 32.0 - 8.0;
  let nA = textureSample(tNoise, sLin, xz * 0.0137);
  let nB = textureSample(tNoise, sLin, vec2f(xz.x * 0.8 - xz.y * 0.6, xz.x * 0.6 + xz.y * 0.8) * 0.083);
  let nC = textureSample(tNoise, sLin, xz * 0.61 + nA.rg * 0.2);
  let nD = (textureSample(tNoise, sLin, vec2f(xz.x * 0.6 + xz.y * 0.8, -xz.x * 0.8 + xz.y * 0.6) * 4.7) + textureSample(tNoise, sLin, vec2f(xz.x * 0.966 - xz.y * 0.259, xz.x * 0.259 + xz.y * 0.966) * 3.31 + 0.37)) * 0.5;
  let near = 1.0 - smoothstep(20.0, 110.0, dist);
  let near2 = 1.0 - smoothstep(4.0, 30.0, dist);
  // ---- grass ----
  var g = mix(COL_GRASS_ROOT * 1.7, COL_GRASS, 0.3 + 0.7 * nC.r);
  g *= 0.78 + 0.44 * nB.r;
  let dry = smoothstep(0.48, 0.7, nA.g * 0.65 + nB.g * 0.35);
  g = mix(g, COL_GRASS_TALL * vec3f(1.05, 0.93, 0.62), dry * 0.4);
  // mowing bands (short grass next to the track): slight tone alternation
  let mow = smoothstep(0.35, 0.65, fract(adist / 3.2 + nB.r * 0.25));
  g *= mix(1.0, 0.9 + 0.2 * mow, (1.0 - z.b) * step(adist, 23.0));
  let gt = mix(COL_GRASS * 0.85, COL_GRASS_TALL, 0.25 + 0.6 * nB.g) * (0.66 + 0.6 * nC.g);
  g = mix(g, gt, z.b);
  // patches of ~3-6 m (darker clover, drier grass) and fine leaf fiber (mips average it out at distance)
  let nE = textureSample(tNoise, sLin, vec2f(xz.x * 0.342 + xz.y * 0.94, -xz.x * 0.94 + xz.y * 0.342) * 0.177 + 0.3);
  g = mix(g, g * vec3f(0.62, 0.8, 0.6), smoothstep(0.5, 0.68, nE.r) * 0.7);
  g *= 0.8 + 0.4 * nA.b;
  g = mix(g, g * vec3f(1.22, 1.12, 0.8), smoothstep(0.55, 0.75, nE.g) * 0.4 * (1.0 - z.b * 0.5));
  g *= 1.0 + (nD.b - 0.5) * 0.5 + (nD.a - 0.5) * 0.22;
  // blades: elongated fibers in three directions (noise stretched ~7:1). Up close the lawn reads as leaves, with shadow between them;
  // mips average it at distance, without changing the tone.
  let bq = xz + (nC.rg - 0.5) * 0.25;
  let b1 = textureSample(tNoise, sLin, vec2f(bq.x * 9.3, bq.y * 1.3));
  let b2 = textureSample(tNoise, sLin, vec2f((bq.x * 0.5 + bq.y * 0.866) * 8.1, (-bq.x * 0.866 + bq.y * 0.5) * 1.15) + 0.31);
  let b3 = textureSample(tNoise, sLin, vec2f((bq.x * 0.5 - bq.y * 0.866) * 10.4, (bq.x * 0.866 + bq.y * 0.5) * 1.45) + 0.67);
  let bq2 = bq * 2.3 + 0.37;
  let b4 = textureSample(tNoise, sLin, vec2f((bq2.x * 0.966 + bq2.y * 0.259) * 9.0, (-bq2.x * 0.259 + bq2.y * 0.966) * 1.2));
  let b5 = textureSample(tNoise, sLin, vec2f((bq2.x * 0.259 - bq2.y * 0.966) * 9.6, (bq2.x * 0.966 + bq2.y * 0.259) * 1.3) + 0.53);
  let blade = max(smoothstep(0.5, 0.7, max(b1.r, max(b2.g, b3.r))), smoothstep(0.55, 0.72, max(b4.g, b5.r)) * 0.8);
  let tuft = smoothstep(0.35, 0.7, nD.b);                              // tufts: lighter/darker clumps of ~10 cm
  g *= (0.56 + 0.66 * blade) * (0.84 + 0.32 * tuft);
  var alb = g; var rough = 0.9;
  var grad = (nC.rg - 0.5) * 1.1 * near + (nD.rg - 0.5) * 2.0 * near2
    + (vec2f(b1.r - 0.5, 0.0) * 2.8 + vec2f(0.5, 0.866) * (b2.g - 0.5) * 2.4 + vec2f(0.5, -0.866) * (b3.r - 0.5) * 2.4 + vec2f(0.966, -0.259) * (b4.g - 0.5) * 1.2 + vec2f(0.259, 0.966) * (b5.r - 0.5) * 1.2) * near2;
  var ao = (0.72 + 0.28 * nC.r * (0.6 + 0.4 * nD.b)) * (0.58 + 0.42 * blade);
  var sss = 0.25;
  // bare dirt: next to the asphalt and in sparse patches
  let dirtE = (1.0 - smoothstep(0.05, 0.75, adist + (nC.b - 0.5) * 0.7 + (nD.r - 0.5) * 0.25)) * step(-0.5, adist);
  let bald = smoothstep(0.7, 0.82, nB.b * 0.5 + nA.r * 0.6) * 0.6 * (1.0 - z.b * 0.5);
  let dirt = max(dirtE * 0.85, bald);
  let dcol = COL_DIRT * (0.65 + 0.7 * nC.g) * (0.85 + 0.3 * nD.a);
  alb = mix(alb, dcol, dirt); sss *= 1.0 - dirt;
  // ---- forest floor and distant canopy ----
  let fo = smoothstep(0.2, 0.6, forest);
  if (fo > 0.0) {
    let litter = mix(vec3f(0.05, 0.04, 0.026), COL_FOREST * 1.3, nC.g * 0.55 + nB.r * 0.25) * (0.7 + 0.5 * nD.r);
    alb = mix(alb, litter, fo * 0.85); ao *= mix(1.0, 0.7, fo);
#ifndef PASS_CUBE
    let cf = smoothstep(CANOPY_A, CANOPY_B, dist) * smoothstep(0.3, 0.6, forest + (nB.r - 0.5) * 0.2);
    if (cf > 0.0) {
      // canopies: cellular noise (≈ 8 m per canopy) + species variation
      let cuv = xz / 190.0 + (nB.rg - 0.5) * 0.012;
      let e = 0.0012;
      let c0 = textureSample(tNoise, sLin, cuv).b; let cx = textureSample(tNoise, sLin, cuv + vec2f(e, 0.0)).b; let cz = textureSample(tNoise, sLin, cuv + vec2f(0.0, e)).b;
      let far2 = smoothstep(1500.0, 5000.0, dist);
      var cc = COL_FOREST * (0.55 + 1.0 * c0) * (0.75 + 0.5 * nA.r);
      cc = mix(cc, vec3f(0.075, 0.085, 0.022) * (0.6 + c0), smoothstep(0.55, 0.75, nB.g) * 0.55);
      cc = mix(cc, COL_FOREST * 1.05 * (0.8 + 0.4 * nA.r), far2);
      alb = mix(alb, cc, cf); rough = mix(rough, 0.82, cf); sss = mix(sss, 0.45, cf);
      ao = mix(ao, 0.55 + 0.45 * c0, cf * (1.0 - far2));
      grad = mix(grad, vec2f(c0 - cx, c0 - cz) * (1.0 - far2) * 55.0, cf);
    }
#endif
  }
  // ---- gravel ----
  let gw = max(fwidth(z.g) * 1.2, 0.004);
  let gm = smoothstep(0.5 - gw, 0.5 + gw, z.g + (nC.b - 0.5) * 0.012);
  if (gm > 0.0) {
    let wq = xz + (nA.rg - 0.5) * 2.4 + (nC.rg - 0.5) * 0.22;      // warped domain: the fine texture doesn't repeat in a tile
    let st = (textureSample(tNoise, sLin, wq * 2.9) + textureSample(tNoise, sLin, vec2f(xz.x * 0.342 - xz.y * 0.94, xz.x * 0.94 + xz.y * 0.342) * 2.13 + 0.61)) * 0.5;
    let st2 = textureSample(tNoise, sLin, vec2f(xz.x * 0.8 - xz.y * 0.6, xz.x * 0.6 + xz.y * 0.8) * 0.21 + 0.5);
    // rake furrows: fine (45 cm) up close and broad rows (1.6 m) readable from afar; they fade before aliasing
    let rk = xz.y * 13.96 + (nB.r + nA.g) * 9.0; let rkf = 0.0; let rake = 0.0;   // (no parallel rake furrows: they read as stripes)
    // (no periodic broad rows: crossed with the fine furrows they formed a diamond pattern)
    let fur = textureSample(tNoise, sLin, vec2f(xz.x * 0.011 + nA.g * 0.2, xz.y * 0.29 + nB.r * 0.3));   // irregular rows, no period
    let rake2 = (fur.r - 0.5) * 2.0; let rkf2 = 1.0;
    // tire/tractor marks: darker sinuous bands (gravel churned up, damp underneath)
    let tq = vec2f(xz.x * 0.94 + xz.y * 0.34, -xz.x * 0.34 + xz.y * 0.94);
    let trk = textureSample(tNoise, sLin, vec2f(tq.x * 0.0047 + nA.r * 0.12, tq.y * 0.031 + nB.g * 0.1));
    let ruts = smoothstep(0.6, 0.72, trk.r) * (1.0 - smoothstep(0.72, 0.84, trk.r));
    // sparse larger stones (light and dark)
    let peb = textureSample(tNoise, sLin, wq * 0.83 + 0.21);
    let big = smoothstep(0.72, 0.86, peb.b);
    var gc = COL_GRAVEL * (0.62 + 0.76 * st.b) * (0.86 + 0.28 * st2.r) * (0.97 + 0.05 * rake + 0.035 * rake2);
    gc = mix(gc, gc * vec3f(1.08, 0.98, 0.86), nB.g);
    gc = mix(gc, gc * vec3f(0.78, 0.8, 0.84), smoothstep(0.5, 0.7, st2.g) * 0.5);            // grayish patches
    gc = mix(gc, gc * mix(0.82, 1.3, smoothstep(0.35, 0.65, peb.a)), big * 0.6);
    // grit: pebbles of ~8 mm and ~22 mm (cellular channel), each with its own tone and shadow at the seam
    let gr1 = textureSample(tNoise, sLin, wq * 5.3 + 0.11);
    let gr2 = textureSample(tNoise, sLin, vec2f(xz.x * 0.8 + xz.y * 0.6, -xz.x * 0.6 + xz.y * 0.8) * 1.9 + 0.43);
    gc *= (0.74 + 0.42 * smoothstep(0.25, 0.85, gr1.b)) * (0.84 + 0.26 * smoothstep(0.3, 0.85, gr2.b)) * (0.92 + 0.16 * gr1.a);
    // broad patches (finer/damp gravel, sand) readable from afar
    gc *= (0.74 + 0.5 * nA.r) * (0.86 + 0.28 * nB.b) * (1.0 - 0.3 * ruts);
    alb = mix(alb, gc, gm); rough = mix(rough, 0.95, gm); sss *= 1.0 - gm;
    let gg = (st.rg - 0.5) * 2.0 * near2 + ((gr1.rg - 0.5) * 2.4 + (gr2.rg - 0.5) * 1.6) * near2 + (peb.rg - 0.5) * 1.2 * near + vec2f(0.0, cos(rk) * 0.2 * rkf) + (fur.rg - 0.5) * 0.5 + (trk.rg - 0.5) * 0.5 * ruts;
    grad = mix(grad, gg, gm);
    ao = mix(ao, (0.72 + 0.28 * st.b) * (0.9 + 0.1 * rake2) * (1.0 - 0.25 * ruts) * (0.72 + 0.28 * smoothstep(0.2, 0.7, gr1.b)), gm);
  }
  // ---- concrete / pit lane ----
  let cw = max(fwidth(z.a) * 1.2, 0.004);
  let cm = smoothstep(0.5 - cw, 0.5 + cw, z.a);
  if (cm > 0.0) {
    let d = xz.y; let sr = xz.x + 60.0;
    let lane = step(0.0, d) * (1.0 - smoothstep(PIT_L1 + 0.1, PIT_L1 + 0.35, d));
    // concrete slabs with joints
    let sl = xz / 5.0; let jf = abs(fract(sl) - 0.5); let jd = (0.5 - max(jf.x, jf.y)) * 5.0;
    let joint = 1.0 - smoothstep(0.012, 0.012 + max(fwidth(jd), 0.004), jd);
    let tone = 0.85 + 0.3 * grHash(floor(sl));
    var cc = vec3f(0.3, 0.29, 0.27) * tone * (0.82 + 0.3 * nC.r) * (0.9 + 0.2 * nD.a * near2);
    cc = mix(cc, cc * 0.45, smoothstep(0.62, 0.8, nB.b * 0.6 + nC.g * 0.5) * 0.7);   // stains
    cc = mix(cc, vec3f(0.03), joint * 0.8 * near);
    var la = COL_ASPHALT * 1.5 * (0.8 + 0.4 * nC.r) * (0.75 + 0.5 * nD.a * near2);
    la = mix(la, la * 0.5, smoothstep(0.6, 0.8, nB.r) * 0.6);
    let aa = max(fwidth(d), 0.002) * 1.2;
    let paint = pitPaint(sr, d, aa) * lane * (0.75 + 0.25 * smoothstep(0.3, 0.5, nD.b));
    la = mix(la, vec3f(0.62, 0.62, 0.6), paint);
    let pc = mix(cc, la, lane);
    alb = mix(alb, pc, cm); rough = mix(rough, mix(0.7, 0.86, lane) - paint * 0.2, cm); sss *= 1.0 - cm;
    grad = mix(grad, (nD.rg - 0.5) * mix(0.25, 0.9, lane) * near2, cm); ao = mix(ao, 1.0 - joint * 0.4, cm);
  }
  s.albedo = alb; s.rough = rough; s.ao = ao; s.sss = sss * 0.6;
  s.normal = bumpXZ(Ng, grad);
  return s;
}
