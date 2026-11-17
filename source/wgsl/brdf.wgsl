// Microfacet BRDF (GGX) and IBL approximations.
fn dGGX(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d + 1e-7); }
fn vSmith(nv: f32, nl: f32, a: f32) -> f32 { let a2 = a * a; let gv = nl * sqrt(nv * nv * (1.0 - a2) + a2); let gl = nv * sqrt(nl * nl * (1.0 - a2) + a2); return 0.5 / (gv + gl + 1e-5); }
fn fSchlick(f0: vec3f, vh: f32) -> vec3f { let f = pow(1.0 - vh, 5.0); return f0 + (vec3f(1.0) - f0) * f; }
fn fSchlick1(f0: f32, vh: f32) -> f32 { return f0 + (1.0 - f0) * pow(1.0 - vh, 5.0); }
// Pre-integrated environment BRDF (Karis analytical approximation)
fn envBRDF(f0: vec3f, rough: f32, nv: f32) -> vec3f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022); let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = rough * c0 + c1; let a004 = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y;
  let ab = vec2f(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + vec3f(ab.y);
}
// spherical harmonics irradiance (L2), coefficients already convolved with the cosine
fn shIrr(n: vec3f) -> vec3f {
  return max(vec3f(0.0), F.sh[0].rgb + F.sh[1].rgb * n.y + F.sh[2].rgb * n.z + F.sh[3].rgb * n.x
    + F.sh[4].rgb * (n.x * n.y) + F.sh[5].rgb * (n.y * n.z) + F.sh[6].rgb * (3.0 * n.z * n.z - 1.0) + F.sh[7].rgb * (n.x * n.z) + F.sh[8].rgb * (n.x * n.x - n.y * n.y));
}
// environment cubemap mip level for a given roughness
fn envMip(rough: f32) -> f32 { let a = rough * rough; return clamp(log2(max(1.0, a * 1.2 * ENV_MIP_K)), 0.0, ENV_MIPS); }
