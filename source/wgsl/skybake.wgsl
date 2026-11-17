// Generates the static late-afternoon sky (atmosphere + volumetric cumulus + cirrus) into a texture
// u = azimuth, v = elevation (non-linear, more resolution near the horizon). Alpha = cloud transmittance.
#include fsq
#include util
#include atmos
struct SB { sun: vec4f, p: vec4f }   // p.x = coverage, p.y = seed
@group(0) @binding(0) var<uniform> U: SB;
@group(0) @binding(1) var tN3: texture_3d<f32>;
@group(0) @binding(2) var tN2: texture_2d<f32>;
@group(0) @binding(3) var sRep: sampler;
const CB = 1700.0; const CT = 3500.0;
fn skyDirFromUV(uv: vec2f) -> vec3f {
  let t = 1.0 - uv.y; let el = SKY_EL0 + SKY_ELR * pow(t, 1.5); let az = uv.x * 2.0 * PI;
  return vec3f(cos(el) * cos(az), sin(el), cos(el) * sin(az));
}
fn coverage(p: vec3f) -> f32 {
  let q = p.xz + vec2f(31000.0, -17000.0);
  let a = textureSampleLevel(tN2, sRep, q / 61000.0, 0.0).r;
  let b = textureSampleLevel(tN2, sRep, vec2f(q.x * 0.8 - q.y * 0.6, q.x * 0.6 + q.y * 0.8) / 23000.0 + 0.37, 0.0).g;
  var c = a * 0.62 + b * 0.38;
  // opens up the sky around the sun and a bit above the circuit
  let dp = normalize(p + vec3f(0.0, 200.0, 0.0)); let cs = dot(dp, U.sun.xyz);
  c -= 0.14 * smoothstep(0.93, 0.998, cs);
  c -= 0.05 * smoothstep(8000.0, 1500.0, length(p.xz));
  return c;
}
fn cloudDens(p: vec3f, h: f32, fine: bool) -> f32 {
  let hn = (h - CB) / (CT - CB);
  if (hn <= 0.0 || hn >= 1.0) { return 0.0; }
  let cov = coverage(p);
  let thr = 1.0 - U.p.x;                      // coverage threshold
  let cv = sat((cov - thr) / 0.16);
  if (cv <= 0.0) { return 0.0; }
  // vertical profile: flat base, taller top where coverage is greater
  let top = mix(0.35, 1.0, cv);
  let prof = sat(hn / 0.07) * sat((top - hn) / (top * 0.55));
  let base = textureSampleLevel(tN3, sRep, p / vec3f(6100.0, 4700.0, 6100.0) + vec3f(0.13, 0.0, 0.71), 0.0);
  var d = sat((base.r * 0.75 + base.g * 0.25) * prof - (1.0 - cv) * 0.62) / (1.0 - (1.0 - cv) * 0.62 + 1e-3);
  d = sat(d * 1.9);
  if (d <= 0.0) { return 0.0; }
  if (fine) {
    // two-scale erosion, with the position warped by noise (frayed edges instead of smooth blobs)
    let wq = p + (base.gba - 0.5) * 520.0;
    let det = textureSampleLevel(tN3, sRep, wq / 1250.0 + vec3f(0.3, 0.6, 0.1), 0.0);
    let det2 = textureSampleLevel(tN3, sRep, wq / 410.0 + vec3f(0.7, 0.2, 0.5), 0.0);
    let e = (det.b * 0.55 + det.g * 0.45) * 0.44 + (det2.b * 0.6 + det2.a * 0.4) * 0.2;
    let k = e * (1.0 - d * 0.55) * mix(1.0, 0.7, sat(hn * 2.0 - 0.2));
    d = sat((d - k) / (1.0 - k + 1e-3));
    d = d * d * (3.0 - 2.0 * d);
  }
  return d;
}
fn altOf(p: vec3f) -> f32 { return length(p + vec3f(0.0, RP, 0.0)) - RP; }
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let d = skyDirFromUV(in.uv); let sun = U.sun.xyz; let alt = 40.0;
  let full = atmosphere(d, sun, alt, 1e9);
  var col = full.rgb; var Tc = 1.0;
  if (d.y > 0.004) {
    let o = vec3f(0.0, RP + alt, 0.0);
    // high cirrus (2D layer at 9.5 km)
    let tci = raySphere(o, d, RP + 9500.0).y; let pc = d * tci;
    let ci1 = textureSampleLevel(tN2, sRep, vec2f(pc.x * 0.92 + pc.z * 0.39, (-pc.x * 0.39 + pc.z * 0.92) * 2.1) / 70000.0, 0.0).r;
    let ci2 = textureSampleLevel(tN2, sRep, pc.xz / 210000.0 + 0.5, 0.0).g;
    let ci = smoothstep(0.56, 0.9, ci1 * 0.7 + ci2 * 0.55) * 0.22 * smoothstep(0.0, 0.14, d.y);
    let sunHi = SUN_I * transm(optDepth(vec3f(0.0, RP + 9500.0, 0.0), sun, 8));
    let cph = phM(dot(d, sun), 0.6) * 2.2 + 0.11;
    let nearC = atmosphere(d, sun, alt, tci);
    col = mix(col, nearC.rgb + nearC.a * (sunHi * cph + vec3f(0.10, 0.14, 0.22)), ci);
    // cumulus
    let t0 = raySphere(o, d, RP + CB).y; let t1 = min(raySphere(o, d, RP + CT).y, 90000.0);
    if (t1 > t0) {
      const NS = 96; let dt = (t1 - t0) / f32(NS);
      let jit = hash21(in.pos.xy);
      var S = vec3f(0.0); var tw = 0.0; var ww = 0.0;
      let cs = dot(d, sun);
      let ph = mix(phM(cs, 0.82), phM(cs, -0.25), 0.3) ;
      // sun color at cloud altitude (once per pixel)
      let pm = d * mix(t0, t1, 0.4);
      let sunC = SUN_I * transm(optDepth(pm + vec3f(0.0, RP, 0.0), sun, 8));
      for (var i = 0; i < NS; i++) {
        if (Tc < 0.01) { break; }
        let t = t0 + (f32(i) + jit) * dt; let p = d * t; let h = altOf(p);
        let dn = cloudDens(p, h, true);
        if (dn > 0.0) {
          // optical depth toward the sun
          var od = 0.0; var ls = 70.0; var lp = p;
          for (var k = 0; k < 6; k++) { lp += sun * ls; od += cloudDens(lp, altOf(lp), false) * ls; ls *= 1.7; }
          let sig = dn * 0.02; let hn = (h - CB) / (CT - CB);
          // approximate multiple scattering (octaves)
          let e = od * 0.02;
          let lsun = sunC * (exp(-e) * ph + 0.5 * exp(-e * 0.3) * mix(ph, 0.08, 0.55) + 0.28 * exp(-e * 0.09) * 0.08);
          let powder = 1.0 - exp(-e * 2.0 - sig * 60.0);
          let amb = mix(vec3f(0.30, 0.34, 0.44), vec3f(0.50, 0.64, 0.95), sat(hn * 1.2)) * 0.34 * SUN_I * 0.05 * (0.6 + 0.4 * exp(-e * 0.6));
          let L = lsun * mix(0.55, 1.0, powder) * 3.2 + amb;
          let a = 1.0 - exp(-sig * dt);
          S += Tc * a * L; tw += Tc * a * t; ww += Tc * a; Tc *= 1.0 - a;
        }
      }
      if (ww > 0.0) {
        let tm = tw / ww; let near = atmosphere(d, sun, alt, tm);
        col = col * Tc + near.rgb * (1.0 - Tc) + near.a * S;
      }
    }
  }
  return vec4f(col, Tc);
}
