// Vegetation — instanced tree/underbrush meshes (near). Dithered switch to impostor at distance.
#include veg_common
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec4f, @location(2) uv: vec2f, @location(3) mat: vec4u, @location(4) col: vec4f, @location(5) i0: vec4f, @location(6) i1: vec4f }
@group(3) @binding(0) var tLeaf: texture_2d<f32>;
@group(3) @binding(1) var sLeaf: sampler;
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  let base = in.i0.xyz; let s = in.i0.w; let c = in.i1.x; let sn = in.i1.y;
  let lp = in.pos * s; let rel = vec3f(lp.x * c - lp.z * sn, lp.y, lp.x * sn + lp.z * c);
  let ln = in.nrm.xyz; o.nrm = vec3f(ln.x * c - ln.z * sn, ln.y, ln.x * sn + ln.z * c);
  let d = distance(base.xz, F.camPos.xz) * vegZoom();   // effective distance (with lens zoom)
  let under = in.i1.w >= VEG_NT;
  var fade = vegFade(d, in.i1.z, VEG_D0, VEG_D1);
  if (under) { fade = vegFade(d, in.i1.z, VEG_U0, VEG_U1); }
  let fl = f32(in.mat.w) / 255.0; let ph = f32(in.mat.y) / 255.0;
  let t = F.wind.w;
  var wp = base + rel + vegWind(base, rel, in.nrm.w, fl, ph, t);
  var pp = base + rel + vegWind(base, rel, in.nrm.w, fl, ph, t - F.misc.x);
#ifdef PASS_SHADOW
  if ((!under && !vegShadowMesh(base, fade)) || fade >= 0.5 || vegShadowCull(base, VEG_H[u32(in.i1.w)] * s)) { wp = base; pp = base; }
#else
  if (fade >= 1.0) { wp = base; pp = base; }
#endif
  o.wpos = wp; o.pwpos = pp; o.uv = in.uv;
  o.mat = in.mat.x | (in.mat.y << 8u) | (in.mat.z << 16u) | (in.mat.w << 24u);
  let tint = vegTintA(in.i1.z, in.i1.w);
  // up close the individual-leaf layer covers the cards: they become the shaded core of the canopy
  let inner = select(1.0, mix(0.78, 1.0, smoothstep(VEG_L0 * 0.8, VEG_L1 * 1.5, d)), !under && in.i1.w != 3.0);
  o.col = vec4f(in.col.rgb * select(vec3f(1.0), tint * inner, in.mat.x == 1u), in.col.a);
  o.ext = vec4f(fade, in.i1.z, rel.y, d);
  return o;
}
fn leafAlpha(uv: vec2f) -> f32 { return textureSample(tLeaf, sLeaf, uv).a; }
fn surfAlpha(in: V2F) -> f32 {
  if (matId(in.mat) != 1u) { return 1.0; }
  return leafAlpha(in.uv) * 0.84;   // shadow slightly more see-through than the visible canopy: small light holes between the leaves
}
fn surf(in: V2F, ff: bool) -> Surface {
  let nz = vegNoise(in.pos.xy);
  // fraction of the fragment kept: LOD switch (complement of the impostor), near-lens fade and leaf-edge coverage,
  // all in a single per-pixel stochastic test
  var keep = 1.0 - in.ext.x;
  let dcam = distance(in.wpos, F.camPos.xyz);
  // foliage very close to the lens fades out (doesn't become a flat polygon in front of a TV camera)
  keep *= sat((dcam - 1.0) / 2.2);
  var s = surfDefault(normalize(in.nrm));
  if (matId(in.mat) == 1u) {
    let t = textureSample(tLeaf, sLeaf, in.uv);
    keep *= vegCover(t.a, 0.5);   // slightly high threshold: more open canopy (branches and sky show between the tufts)
    // card only a few meters from the lens (texture too magnified): fades out; the individual leaves remain
    if (in.ext.w < VEG_D0) { keep *= sat((dcam - 3.0) / 5.0); }
    if (keep <= nz) { discard; }
    let ao = in.col.a;
    // light inside the canopy: the canopy's volume normal, tilted by the card's own plane and by a fine leaf relief,
    // so each tuft catches the sun differently (light and dark masses instead of a flat patch)
    var geo = normalize(cross(dpdx(in.wpos), dpdy(in.wpos))); if (dot(geo, s.normal) < 0.0) { geo = -geo; }
    let dn = textureSample(tNoise, sLin, in.uv * 3.0 + in.ext.y * 13.0).rg - 0.5;
    let lum0 = dot(t.rgb, vec3f(0.3, 0.6, 0.1));
    s.normal = normalize(mix(s.normal, geo, 0.2) + vec3f(dn.x, (lum0 - 0.25) * 0.5, dn.y) * 0.26);
    // leaves on the far side of the canopy (volume normal pointing away from the viewer): what you see is the back, which gets no
    // head-on sun — only transmitted light. Turn the normal toward the viewer (else backlight fills the canopy with bright cards).
    let Vd = normalize(F.camPos.xyz - in.wpos); let nvd = dot(s.normal, Vd);
    if (nvd < 0.0) { s.normal = normalize(s.normal - Vd * (nvd * 1.7)); }
    // darker canopy core (self-shadow that distant cascades don't resolve), brighter tips
    // dark, low-saturation forest green (the tone comes from the tree/species tint); leaf-by-leaf variation at the tuft scale
    // (cellular noise): light and dark tufts side by side read as foliage at medium distance, instead of a smooth patch
    var lc = t.rgb * in.col.rgb * vec3f(0.57, 0.64, 0.33);   // natural green, moderate saturation
    let cell = textureSample(tNoise, sLin, in.uv * 1.6 + in.ext.y * 7.0).b; let cell2 = textureSample(tNoise, sLin, in.uv * 0.55 + in.ext.y * 3.0).r;
    lc *= (0.74 + 0.5 * cell) * (0.78 + 0.44 * cell2);   // continuous variation (no steps: steps read as posterized canopy)
    lc = mix(lc, lc * vec3f(1.2, 1.1, 0.72), smoothstep(0.62, 0.9, cell2) * ao * 0.4);   // sunlit tips lean yellow-green
    // canopy core: dark green, never black (at least ~60% of the tips' albedo; the rest of the darkening comes from occlusion)
    s.albedo = lc * mix(0.62, 1.0, ao * ao);
    // up close the cards are the shaded core beneath the individual leaves
    let nearK = smoothstep(VEG_L0 * 0.8, VEG_L1 * 1.5, in.ext.w);
    // translucency: an outer leaf lit through by the sun becomes vivid green (backlight with color, no black silhouette)
    // (the light pass returns ~1.7 × sss of a head-on sun: ~20% passes through)
    s.sss = (0.26 + 0.12 * sat(-nvd * 2.0)) * (0.12 + 0.88 * ao * ao) * mix(0.45, 1.0, nearK);
    // backlight: looking toward the sun, the outer canopy leaves (lit through) turn yellow-green
    let back = smoothstep(0.15, 0.8, dot(-Vd, F.sunDir.xyz)) * ao * ao;
    s.albedo = mix(s.albedo, s.albedo * vec3f(1.28, 1.22, 0.66), back * 0.7);
    // light passing through the canopy edge: yellow-green glow on outer and upper leaves when looking into the sun
    // (the shadow map would leave the whole canopy in its own shadow; radiance = albedo × emissive × 16 ≈ 25% of direct sun)
    s.emissive = 0.05 * smoothstep(0.35, 0.9, dot(-Vd, F.sunDir.xyz)) * ao * ao * ao * smoothstep(1.5, 5.0, in.ext.z);
    // specular glint: some leaves are glossy (waxy) and catch the sun; the rest are matte
    s.rough = mix(0.95, 0.7, smoothstep(0.7, 0.85, cell) * ao); s.ao = max(ao, 0.58) * mix(0.88, 1.0, nearK);
    // back face of the leaf: slightly brighter and matte
    if (!ff) { s.albedo *= vec3f(1.06, 1.08, 0.94); s.rough = 0.98; }
  } else {
    if (keep <= nz) { discard; }
    let bt = (in.mat >> 16u) & 255u; let N = s.normal;
    // bark in two scales: deep vertical grooves (stretched cellular noise) + fine plates/scales; relief from the height gradient
    var sc = vec2f(0.55, 0.11); var depth = 1.0;
    if (bt == 1u) { sc = vec2f(0.34, 0.42); depth = 0.42; } if (bt == 2u) { sc = vec2f(0.5, 1.4); depth = 0.7; }
    let wr = textureSample(tNoise, sLin, in.uv * vec2f(0.21, 0.07)).rg;
    let q = in.uv * sc + wr * 0.09; let e = 0.004;
    let q2 = in.uv * sc * vec2f(3.1, 2.3) + wr.yx * 0.05;
    let h0 = textureSample(tNoise, sLin, q).b * 0.72 + textureSample(tNoise, sLin, q2).b * 0.28;
    let hx = textureSample(tNoise, sLin, q + vec2f(e, 0.0)).b * 0.72 + textureSample(tNoise, sLin, q2 + vec2f(e * 3.1, 0.0)).b * 0.28;
    let hy = textureSample(tNoise, sLin, q + vec2f(0.0, e)).b * 0.72 + textureSample(tNoise, sLin, q2 + vec2f(0.0, e * 2.3)).b * 0.28;
    let g = vec2f(hx - h0, hy - h0) / e * 0.034 * depth;
    let dp1 = dpdx(in.wpos); let dp2 = dpdy(in.wpos); let du1 = dpdx(q); let du2 = dpdy(q);
    let p2 = cross(dp2, N); let p1 = cross(N, dp1);
    let T = p2 * du1.x + p1 * du2.x; let B = p2 * du1.y + p1 * du2.y; let im = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    let fd = sat(1.25 - in.ext.w / 70.0);
    s.normal = normalize(N - (T * g.x + B * g.y) * im * fd);
    // dark groove (low h0) × bright ridge: strong contrast so the relief shows even in shadow
    let ridge = smoothstep(0.28, 0.72, h0);
    var k = mix(1.0, mix(0.16, 1.45, ridge), 0.5 + 0.5 * depth) * (0.6 + 0.8 * wr.x);
    // fine vertical veins and darkening near the ground (damp/dirt)
    let vein = textureSample(tNoise, sLin, in.uv * vec2f(1.9, 0.05)).g;
    k *= mix(0.68, 1.14, smoothstep(0.35, 0.62, vein)) * mix(0.5, 1.0, smoothstep(0.0, 1.8, in.ext.z));
    if (bt == 2u) { k *= 0.72 + 0.28 * smoothstep(0.08, 0.2, abs(fract(in.uv.y * 2.6) - 0.5)); }
    if (bt == 1u) { // smooth bark: bright lichen patches and subtle horizontal rings
      let pt = textureSample(tNoise, sLin, in.uv * vec2f(0.33, 0.12) + 0.4).r;
      k *= mix(0.82, 1.3, smoothstep(0.5, 0.66, pt)) * (0.9 + 0.1 * smoothstep(0.1, 0.25, abs(fract(in.uv.y * 1.3 + wr.x) - 0.5)));
    }
    // moss/lichen near the base and on upward-facing surfaces
    let moss = smoothstep(0.46, 0.7, wr.y + (1.0 - sat(in.ext.z * 0.2)) * 0.26 + sat(N.y) * 0.25) * 0.6;
    // color variation along the trunk (more reddish and more grayish bands) + moss
    let hue = textureSample(tNoise, sLin, in.uv * vec2f(0.13, 0.031) + 0.7).g;
    s.albedo = mix(in.col.rgb * mix(vec3f(1.12, 0.92, 0.78), vec3f(0.86, 0.98, 1.1), smoothstep(0.3, 0.7, hue)) * k * 0.56, vec3f(0.07, 0.1, 0.03) * (0.6 + 0.8 * h0), moss);
    s.rough = 0.88; s.ao = in.col.a * mix(1.0, 0.4 + 0.6 * ridge, depth) * mix(0.55, 1.0, smoothstep(0.0, 0.9, in.ext.z));
  }
  return s;
}
