// Vegetation — individual-leaf layer (near only): one quad per leaf; outline and veins computed in the shader
// from (u along the leaf, v across), so the edge stays sharp at any magnification (no blurry texture).
// With distance (corrected by zoom) each leaf shrinks to its base and vanishes: no dithering and no abrupt switch.
#include veg_common
struct VIn { @location(0) pos: vec3f, @location(1) off: vec4f, @location(2) nrm: vec4f, @location(3) uvx: vec4u, @location(4) col: vec4f, @location(5) i0: vec4f, @location(6) i1: vec4f }
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  let base = in.i0.xyz; let s = in.i0.w; let c = in.i1.x; let sn = in.i1.y;
  let zoom = vegZoom();
  let lb = (in.pos - in.off.xyz * 0.6) * s;                                   // leaf base (tree space)
  let relb = vec3f(lb.x * c - lb.z * sn, lb.y, lb.x * sn + lb.z * c);
  let dl = distance(base + relb, F.camPos.xyz) * zoom;
  // each leaf vanishes at its own distance (high phase = vanishes first): the canopy thins out gradually, from 23 m to 61 m
  let rk = mix(1.6, 0.6, f32(in.uvx.z) / 255.0);
  let k = 1.0 - smoothstep(VEG_L0 * rk, VEG_L1 * rk, dl);
  let lp = (in.pos - in.off.xyz * (0.6 * (1.0 - k))) * s;
  let rel = vec3f(lp.x * c - lp.z * sn, lp.y, lp.x * sn + lp.z * c);
  let ln = in.nrm.xyz; o.nrm = vec3f(ln.x * c - ln.z * sn, ln.y, ln.x * sn + ln.z * c);
  let fl = in.nrm.w; let ph = f32(in.uvx.z) / 255.0; let t = F.wind.w;
  var wp = base + rel + vegWind(base, rel, in.off.w, fl, ph, t);
  var pp = base + rel + vegWind(base, rel, in.off.w, fl, ph, t - F.misc.x);
  if (k <= 0.0) { wp = base; pp = base; }
  o.wpos = wp; o.pwpos = pp;
  o.uv = vec2f(f32(in.uvx.x) / 255.0, f32(in.uvx.y) / 127.5 - 1.0);
  o.mat = 2u | (u32(in.col.a * 255.0 + 0.5) << 8u);
  o.col = vec4f(in.col.rgb * 2.0 * vegTintA(in.i1.z, in.i1.w), f32(in.uvx.w) / 255.0);
  o.ext = vec4f(k, in.i1.z, rel.y, dl);
  return o;
}
// leaf half-width at u (0 = base, 1 = tip), normalized: > |v| = inside
fn leafHalf(u: f32, t: u32) -> f32 {
  let uu = clamp(u, 0.0, 1.0);
  if (t == 1u) { return pow(sin(3.14159 * pow(uu, 0.6)), 0.6); }       // rounded oval
  if (t == 2u) { return pow(sin(3.14159 * pow(uu, 0.8)), 0.85); }      // lanceolate
  return pow(sin(3.14159 * pow(uu, 0.68)), 0.75);                      // acute-tipped elliptic
}
fn surfAlpha(in: V2F) -> f32 { return select(0.0, 1.0, leafHalf(in.uv.x, (in.mat >> 8u) & 255u) > abs(in.uv.y)); }
fn surf(in: V2F, ff: bool) -> Surface {
  let u = in.uv.x; let v = in.uv.y; let ty = (in.mat >> 8u) & 255u;
  let w = leafHalf(u, ty);
  // analytic edge with ~1 pixel of stochastic transition (TAA resolves it into a smooth edge)
  let ed = (w - abs(v)) / max(fwidth(v) + fwidth(w), 1e-4);
  if (ed + 0.5 <= vegNoise(in.pos.xy + 7.0)) { discard; }
  // foliage very close to the lens fades out
  let dcam = distance(in.wpos, F.camPos.xyz);
  if (dcam < 3.2 && vegNoise(in.pos.xy) >= sat((dcam - 1.0) / 2.2)) { discard; }
  var s = surfDefault(normalize(in.nrm));
  // back of the leaf (normal pointing away from the viewer): turns toward him; a sun behind only contributes translucency
  let Vd = normalize(F.camPos.xyz - in.wpos); let nvd = dot(s.normal, Vd);
  if (nvd < 0.0) { s.normal = normalize(s.normal - Vd * (nvd * 1.7)); }
  let ao = in.col.a; let near = sat(1.0 - in.ext.w / 16.0);
  // bright midrib + herringbone lateral veins (fade with distance so they don't shimmer)
  let mid = (1.0 - smoothstep(0.035, 0.08 + fwidth(v) * 1.5, abs(v))) * 0.55;
  let vp = abs(fract(u * 7.0 - abs(v) * 1.7) - 0.5);
  let veins = (1.0 - smoothstep(0.04, 0.1 + fwidth(u) * 9.0, vp)) * 0.22 * near * smoothstep(0.06, 0.2, abs(v));
  // darker green along the vein and at the base, tips and edges slightly brighter
  var alb = vec3f(0.062, 0.076, 0.029) * in.col.rgb * (0.78 + 0.34 * u) * (0.9 + 0.16 * sat(abs(v) / max(w, 0.05)));
  alb = mix(alb, alb * vec3f(1.55, 1.5, 1.25) + 0.004, max(mid, veins));
  // some leaves glossy (sun glint), most matte; translucency on outer leaves
  s.rough = mix(0.92, 0.66, step(0.78, fract(in.col.a * 37.3 + in.ext.y * 11.1))); s.ao = max(ao, 0.5);
  s.sss = (0.3 + 0.12 * sat(-nvd * 2.0)) * (0.12 + 0.88 * ao * ao);
  let back = smoothstep(0.15, 0.8, dot(-Vd, F.sunDir.xyz)) * ao * ao;   // backlight: leaf lit through by the sun, yellow-green
  alb = mix(alb, alb * vec3f(1.16, 1.12, 0.78), back * 0.6);
  s.emissive = 0.05 * smoothstep(0.35, 0.9, dot(-Vd, F.sunDir.xyz)) * ao * ao * ao * smoothstep(1.5, 5.0, in.ext.z);   // light passing through (see veg_tree)
  if (!ff) { alb = alb * vec3f(1.06, 1.08, 0.95) + 0.002; s.rough = 0.92; }   // back face: brighter and matte
  s.albedo = alb * (0.7 + 0.3 * ao);
  return s;
}
