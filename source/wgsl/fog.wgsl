// Height-based exponential fog with forward sun scattering. Requires F and tEnv/sClamp.
fn fogOD(cam: vec3f, dir: vec3f, dist: f32) -> f32 {
  let a = F.fog.x; let b = F.fog.y; let dy = dir.y * dist;
  let base = a * exp(-b * (cam.y - F.fog.z));
  let k = b * dy;
  let f = select((1.0 - exp(-k)) / k, 1.0 - k * 0.5, abs(k) < 1e-3);
  return base * dist * f;
}
fn fogPhase(c: f32) -> f32 { let g = 0.6; let g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
fn fogSunCol(dir: vec3f) -> vec3f { return F.sunCol.rgb * (fogPhase(dot(dir, F.sunDir.xyz)) * 0.9 + 0.035) * F.fog.w; }
fn fogAmbCol(dir: vec3f) -> vec3f {
  let d = normalize(vec3f(dir.x, max(dir.y, 0.0) * 0.5 + 0.06, dir.z));
  return textureSampleLevel(tEnv, sClamp, d, ENV_MIPS - 2.0).rgb * F.fogCol.a + F.fogCol.rgb;
}
