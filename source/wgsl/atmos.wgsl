// Atmosphere (single Rayleigh + Mie + ozone scattering) and volumetric clouds, evaluated during sky generation.
const RP = 6360e3; const RA = 6440e3;
const BR = vec3f(5.8e-6, 13.6e-6, 33.1e-6); const HR = 8000.0;
const BM = 26e-6; const HM = 1300.0; const GM = 0.78;
const BO = vec3f(0.65e-6, 1.881e-6, 0.085e-6);
const SUN_I = 22.0;
fn raySphere(o: vec3f, d: vec3f, r: f32) -> vec2f { let b = dot(o, d); let c = dot(o, o) - r * r; let h = b * b - c; if (h < 0.0) { return vec2f(1e20, -1e20); } let s = sqrt(h); return vec2f(-b - s, -b + s); }
fn dens(h: f32) -> vec3f { return vec3f(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0)); }
fn optDepth(o: vec3f, d: vec3f, n: i32) -> vec3f {
  let t = raySphere(o, d, RA).y; let dt = t / f32(n); var od = vec3f(0.0);
  for (var i = 0; i < n; i++) { let p = o + d * (f32(i) + 0.5) * dt; od += dens(length(p) - RP) * dt; }
  return od;
}
fn transm(od: vec3f) -> vec3f { return exp(-(BR * od.x + vec3f(BM * 1.11) * od.y + BO * od.z)); }
fn phR(c: f32) -> f32 { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
fn phM(c: f32, g: f32) -> f32 { let g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
// sky radiance in direction d (observer at 'alt' m), up to distance tmax (or infinity). Returns rgb + average transmittance.
fn atmosphere(d: vec3f, sun: vec3f, alt: f32, tmax: f32) -> vec4f {
  let o = vec3f(0.0, RP + alt, 0.0);
  var t1 = raySphere(o, d, RA).y; let tg = raySphere(o, d, RP - 400.0); if (tg.x > 0.0) { t1 = min(t1, tg.x); }
  t1 = min(t1, tmax);
  const N = 28; var sumR = vec3f(0.0); var sumM = vec3f(0.0); var od = vec3f(0.0); var tp = 0.0;
  for (var i = 0; i < N; i++) {
    // denser samples near the observer
    let f1 = f32(i + 1) / f32(N); let tn = t1 * f1 * f1; let dt = tn - tp; let p = o + d * (tp + dt * 0.5); tp = tn;
    let h = length(p) - RP; let dn = dens(h); od += dn * dt;
    let ods = optDepth(p, sun, 6); let shadow = step(raySphere(p, sun, RP - 2000.0).x, 0.0) + step(1e19, raySphere(p, sun, RP - 2000.0).x);
    let tr = transm(od + ods) * sat(shadow);
    sumR += tr * dn.x * dt; sumM += tr * dn.y * dt;
  }
  let c = dot(d, sun);
  // extra isotropic term ≈ multiple scattering
  let ms = (BR * sumR + vec3f(BM) * sumM) * 0.035;
  let col = SUN_I * (BR * sumR * phR(c) + vec3f(BM) * sumM * (phM(c, GM) * 0.85 + phM(c, 0.2) * 0.15) + ms);
  let tt = transm(od);
  return vec4f(col, (tt.x + tt.y + tt.z) / 3.0);
}
