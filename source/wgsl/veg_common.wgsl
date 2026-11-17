// Vegetation — wind and shared utilities.
#include palette
const VEG_D0 = 90.0;   // start/end of mesh → impostor switch (m)
const VEG_D1 = 112.0;
const VEG_U0 = 60.0;   // underbrush fades out between U0 and U1
const VEG_U1 = 80.0;
const VEG_NT = 6.0;
const VEG_L0 = 26.0;   // individual leaves shrink until they vanish between L0 and L1
const VEG_L1 = 38.0;
// LOD by on-screen size: zoom factor of the main camera (1 = chase-camera lens; TV telephoto << 1).
// Switch distances are compared against distance * zoom.
fn vegZoom() -> f32 { return clamp(F.post.y * 2.0, 0.3, 1.25); }
// mesh → impostor switch: each tree has its own threshold within [D0, D1] and a short dithered window (5 m),
// so at any instant only a few trees are transitioning (no "screen" of dithering across whole bands of forest)
// (hard switch, no dither band: even with per-pixel noise, a canopy half mesh/half impostor reads as a dot screen
// against the sky where the two silhouettes don't coincide; one tree at a time switching at ~100 m is imperceptible)
fn vegFade(dEff: f32, seed: f32, d0: f32, d1: f32) -> f32 { let a = mix(d0, d1, fract(seed * 7.31 + 0.13)); return step(a, dEff); }
// wind displacement at a point on the tree. base = tree foot; rel = point relative to the foot (m);
// w = branch weight (0 trunk .. 1 tip); fl = leaf flutter weight (0..1); ph = leaf phase (0..1)
fn vegWind(base: vec3f, rel: vec3f, w: f32, fl: f32, ph: f32, time: f32) -> vec3f {
  let W = vec3f(F.wind.x, 0.0, F.wind.y); let S = F.wind.z; let X = vec3f(-F.wind.y, 0.0, F.wind.x);
  let p0 = base.x * 0.031 + base.z * 0.047;
  let gust = 0.55 + 0.45 * sin(time * 0.43 + p0) * sin(time * 0.71 + p0 * 1.7 + 1.3);
  let hb = rel.y * 0.05;
  var d = W * (hb * hb) * (0.16 + 0.34 * gust + 0.07 * sin(time * 1.31 + p0 * 3.0));
  let p1 = p0 * 5.0 + dot(rel, vec3f(0.37, 0.29, 0.41));
  d += (W * (0.35 * gust + 0.65 * sin(time * 1.7 + p1)) + X * 0.6 * sin(time * 2.3 + p1 * 1.3) + vec3f(0.0, 0.45, 0.0) * sin(time * 2.9 + p1 * 0.7)) * (w * w * 0.16);
  let p2 = ph * 40.0 + dot(rel, vec3f(2.1, 1.7, 2.6));
  d += (X * sin(time * 6.3 + p2) + vec3f(0.0, 0.7, 0.0) * sin(time * 7.9 + p2 * 1.4) + W * 0.5 * sin(time * 5.1 + p2 * 0.6)) * (fl * 0.035 * (0.5 + 0.8 * gust));
  return d * S;
}
// per-pixel white noise that changes every frame: used in EVERY stochastic cut (alpha edge, LOD switch, near-lens fade).
// No regular structure (no checkerboard/hatching in a still frame) and TAA integrates across frames.
fn vegNoise(px: vec2f) -> f32 { return hash21(px + vec2f(F.misc.y * 17.13, F.misc.y * 31.71)); }
// texture alpha → coverage with a ~1-pixel edge (instead of a fixed threshold, which leaves steps the size of the magnified texel)
fn vegCover(a: f32, thr: f32) -> f32 { return sat((a - thr) / clamp(fwidth(a), 0.02, 0.7) + 0.5); }
// Per-tree tint — forest palette: from bottle-green to yellow-olive, with some very dark canopies, some yellowed/dry
// and rare reddish ones; plus each tree's own brightness. Multiplies the leaf color (same for mesh, leaves, and impostor).
fn vegTint(seed: f32) -> vec3f {
  let a = fract(seed * 13.37 + 0.21); let b = fract(seed * 5.71 + 0.63); let l = fract(seed * 29.3 + 0.4);
  var c = mix(vec3f(0.72, 0.76, 0.62), vec3f(1.18, 1.0, 0.54), a * a * (3.0 - 2.0 * a));   // bottle-green ↔ yellow-olive
  c = mix(c, vec3f(0.64, 0.68, 0.56), smoothstep(0.74, 0.92, b));                           // very dark canopies (~20%)
  c = mix(c, vec3f(1.3, 1.06, 0.56), smoothstep(0.11, 0.03, b) * 0.7);                    // yellowed (~8%)
  c = mix(c, vec3f(1.55, 0.74, 0.42), smoothstep(0.972, 0.995, a) * 0.8);                  // dry/reddish (rare)
  return c * (0.8 + 0.42 * l);
}
// tone of each species (archetype): large, medium, tall slender, palm, small tree, large shrub, shrub, fern, tuft
const VEG_SP = array<vec3f, 9>(vec3f(0.92, 0.94, 0.86), vec3f(1.06, 1.0, 0.78), vec3f(0.88, 0.9, 0.88), vec3f(1.12, 1.06, 0.66), vec3f(1.0, 1.06, 0.72),
  vec3f(1.0, 1.0, 0.74), vec3f(0.94, 0.96, 0.78), vec3f(1.0, 1.1, 0.7), vec3f(1.1, 1.04, 0.66));
fn vegTintA(seed: f32, arch: f32) -> vec3f { return vegTint(seed) * VEG_SP[u32(clamp(arch, 0.0, 8.0))]; }
const VEG_H = array<f32, 9>(20.5, 12.6, 27.9, 11.7, 8.5, 3.7, 1.8, 0.5, 1.2);   // height of each archetype (m), see vegArchetypes()
#ifdef PASS_SHADOW
// Shadow cascades. In light space the shadow runs only along z, so a tree matters to a cascade only if its
// xy projection covers the [-1,1]² square (with a canopy-sized margin). Works for any cascade position/size.
fn vegShadowCull(base: vec3f, h: f32) -> bool {
  let slot = P.camPos.w; if (slot > 3.5) { return false; }
  let lp = P.viewProj * vec4f(base + vec3f(0.0, h * 0.5, 0.0), 1.0);
  let inv = length(vec3f(P.viewProj[0][0], P.viewProj[1][0], P.viewProj[2][0]));   // 1 / cascade radius
  let m = (h * 0.75 + 5.0) * inv;
  return abs(lp.x) > 1.0 + m || abs(lp.y) > 1.0 + m || lp.z > 1.02 || lp.z < -0.08;
}
// in cascades 0 and 1 only trees near the visible region use the mesh; those farther toward the sun
// (whose shadow already arrives diffuse) use the card
fn vegShadowMesh(base: vec3f, fade: f32) -> bool {
  let slot = P.camPos.w; if (slot > 2.5 || fade >= 0.5) { return false; }
  let lp = P.viewProj * vec4f(base, 1.0);
  let inv = length(vec3f(P.viewProj[0][0], P.viewProj[1][0], P.viewProj[2][0]));
  let zr = 1.0 / max(length(vec3f(P.viewProj[0][2], P.viewProj[1][2], P.viewProj[2][2])), 1e-6);   // total box depth (m)
  return abs(lp.x) < 1.0 + 20.0 * inv && abs(lp.y) < 1.0 + 20.0 * inv && (1.0 - lp.z) * zr < 2.0 / inv + 75.0;
}
#endif
