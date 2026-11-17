// Vegetation — impostors: one card per tree, facing the camera (or the sun in shadow passes),
// with an 8-azimuth atlas per archetype (albedo+alpha and normal+leaf mask), lit in the G-buffer.
#include veg_common
struct VIn { @builtin(vertex_index) vi: u32, @location(5) i0: vec4f, @location(6) i1: vec4f }
struct ImpU { a: array<vec4f, 12> }   // per archetype: (half width, height, _, _)
@group(3) @binding(0) var tImpA: texture_2d_array<f32>;
@group(3) @binding(1) var tImpN: texture_2d_array<f32>;
@group(3) @binding(2) var sImp: sampler;
@group(3) @binding(3) var<uniform> IU: ImpU;
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  let base = in.i0.xyz; let s = in.i0.w; let c = in.i1.x; let sn = in.i1.y; let arch = in.i1.w;
  let ai = u32(arch); let dim = IU.a[min(ai, 11u)];
  let slot = P.camPos.w;
  let d = distance(base.xz, F.camPos.xz) * vegZoom();   // effective distance (with lens zoom)
  var fade = vegFade(d, in.i1.z, VEG_D0, VEG_D1);
  var kill = arch >= VEG_NT;
#ifdef PASS_GBUF
  var h = P.camPos.xz - base.xz;
  if (fade <= 0.0) { kill = true; }
#endif
#ifdef PASS_SHADOW
  var h = F.sunDir.xz;
  if (vegShadowMesh(base, fade)) { kill = true; }
  if (vegShadowCull(base, dim.y * s)) { kill = true; }
  fade = 1.0;
#endif
#ifdef PASS_CUBE
  var h = P.camPos.xz - base.xz;
  fade = 1.0;
  if (distance(base.xz, P.camPos.xz) > 700.0) { kill = true; }
#endif
  h = normalize(h);
  let right = vec3f(h.y, 0.0, -h.x);
  let cx = f32(in.vi & 1u) * 2.0 - 1.0; let cy = f32(in.vi >> 1u);
  var wp = base + right * (cx * dim.x * s) + vec3f(0.0, cy * dim.y * s, 0.0);
#ifdef PASS_SHADOW
  wp -= vec3f(F.sunDir.x, 0.0, F.sunDir.z) * (dim.x * s * 0.55);   // moves away from the sun: the canopy doesn't shadow itself entirely
#endif
  if (kill) { wp = base; }
  // atlas frame: angle of the camera→tree direction in the tree's local space
  let hl = vec2f(h.x * c + h.y * sn, -h.x * sn + h.y * c);
  let f = fract(atan2(hl.y, hl.x) / 6.2831853 + 1.0) * 8.0;
  o.wpos = wp; o.pwpos = wp;
  o.nrm = vec3f(c, sn, fract(f));
  o.uv = vec2f(cx * 0.5 + 0.5, 1.0 - cy);
  o.mat = ai | (u32(floor(f)) << 8u);
  o.col = vec4f(vegTintA(in.i1.z, arch), 1.0);
  o.ext = vec4f(fade, d, 0.0, 0.0);
  return o;
}
fn impLayers(in: V2F) -> vec2i {
  let f0 = (in.mat >> 8u) & 255u; let b = (in.mat & 255u) * 8u;
  return vec2i(i32(b + f0), i32(b + ((f0 + 1u) & 7u)));
}
fn surfAlpha(in: V2F) -> f32 {
  let L = impLayers(in);
  // canopy shadow with foliage cutout: the atlas alpha is punched by cellular noise (small, varied light holes, frayed
  // edge) instead of the card's solid silhouette. One sample, with the simple sampler (this pass has a lot of overdraw).
  let a = textureSampleBias(tImpA, sImp, in.uv, select(L.x, L.y, in.nrm.z > 0.5), 0.3).a + 0.06;
  let n = textureSampleLevel(tNoise, sImp, in.uv * 6.0 + f32(L.x) * 0.37, 0.0).b;
  return a * (0.52 + 0.6 * smoothstep(0.3, 0.62, n));
}
fn surf(in: V2F, ff: bool) -> Surface {
  let nz = 1.0 - vegNoise(in.pos.xy);   // complement of the mesh's: at the LOD switch each pixel comes from one or the other
  // blends the two neighboring atlas azimuths (the silhouette morphs gradually)
  let L = impLayers(in); let t = smoothstep(0.15, 0.85, in.nrm.z);
  let a = mix(textureSample(tImpA, sImp, in.uv, L.x), textureSample(tImpA, sImp, in.uv, L.y), t);
  // how magnified the atlas is on screen (telephoto): 0 = 1 texel per pixel or less, 1 = heavily magnified
  let tpp = max(fwidth(in.uv.x), fwidth(in.uv.y)) * 512.0; let mag = sat(1.0 - tpp);
  // when magnified, the blurry atlas becomes a blob: break up the silhouette and tone with leaf-scale noise
  let dn = textureSample(tNoise, sLin, in.uv * 7.0 + f32(L.x) * 0.37);
  let dn2 = textureSample(tNoise, sLin, in.uv * 19.0 + f32(L.x) * 0.11);
  // at distance the mips thin the canopy: compensate the threshold
  let thr = 0.5 - 0.22 * smoothstep(120.0, 600.0, in.ext.y);
  let aa = a.a + (dn.r * 0.6 + dn2.g * 0.4 - 0.5) * 0.5 * mag * smoothstep(0.05, 0.4, a.a) * (1.0 - smoothstep(0.75, 1.0, a.a));
  if (vegCover(aa, thr) * in.ext.x <= nz) { discard; }
  let nt = mix(textureSample(tImpN, sImp, in.uv, L.x), textureSample(tImpN, sImp, in.uv, L.y), t);
  var nl = nt.xyz * 2.0 - 1.0; let c = in.nrm.x; let sn = in.nrm.y;
  nl += vec3f(dn.g - 0.5, dn2.r - 0.5, dn.b - 0.5) * (0.2 + 0.3 * mag) * nt.a;
  // smoother normals at distance (canopy as a volume, no leaf-by-leaf noise)
  let far = smoothstep(90.0, 450.0, in.ext.y);
  nl = normalize(mix(nl, vec3f(nl.x * 0.5, abs(nl.y) * 0.5 + 0.6, nl.z * 0.5), far * 0.7));
  var s = surfDefault(normalize(vec3f(nl.x * c - nl.z * sn, nl.y, nl.x * sn + nl.z * c)));
  // as in the mesh: a normal pointing away from the viewer is turned toward him (back of a leaf gets no head-on sun)
  let Vd = normalize(F.camPos.xyz - in.wpos); let nvd = dot(s.normal, Vd);
  if (nvd < 0.0) { s.normal = normalize(s.normal - Vd * (nvd * 1.7)); }
  // same tone as the mesh (see veg_tree.wgsl), with light/dark mass variation at the tuft scale
  // 0.69 ≈ average of the mesh's tuft modulations (cellular noise × dark core), so the two mean colors coincide
  var lc = a.rgb * mix(vec3f(0.8), in.col.rgb * vec3f(0.57, 0.64, 0.33) * 0.74, nt.a);
  // light and dark tufts (same idea as the mesh), which vanish at distance
  let tuft = (0.66 + 0.68 * smoothstep(0.25, 0.8, dn.b)) * (0.8 + 0.4 * dn2.r);
  s.albedo = lc * mix(1.0, tuft, nt.a * (1.0 - 0.6 * far)) * mix(1.0, 0.85, far * nt.a);
  // stronger translucency at the silhouette edge (low blurred coverage), less at distance; matte foliage
  let ab = textureSampleBias(tImpA, sImp, in.uv, L.x, 3.0).a;
  let edge = 1.0 - smoothstep(0.5, 0.92, ab);
  s.sss = 0.24 * nt.a * mix(0.3, 1.0, edge) * mix(1.0, 0.4, far);
  let back = smoothstep(0.15, 0.8, dot(-Vd, F.sunDir.xyz)) * edge * nt.a * (1.0 - 0.6 * far);
  s.albedo = mix(s.albedo, s.albedo * vec3f(1.28, 1.22, 0.66), back * 0.7);
  s.emissive = 0.04 * back;   // light passing through the canopy edge (as in the mesh)
  s.rough = mix(0.9, 0.95, nt.a) + 0.04 * far; s.ao = mix(1.0, 0.8, far * (1.0 - edge));
  return s;
}
