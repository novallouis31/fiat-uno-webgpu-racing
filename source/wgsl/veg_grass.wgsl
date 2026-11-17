// Vegetation — grass: blades generated on the GPU in rings centered on the camera (no vertex buffers).
// Each instance = one blade in a grid cell (position by cell hash, world-stable).
#include veg_common
struct VIn { @builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32 }
struct GrassU { p: vec4f, q: vec4f, r: vec4f, s: vec4f, t: vec4f, u: vec4f }   // s = (telephoto gate, half side of ring, xz center) | t = (zoom, half side of previous ring, xz center of previous)   // p = (cell m, cells/block, blocks/side, segments) | q = fades (in0, in1, out0, out1) | r = (width, ring, originX, originZ in blocks)
@group(3) @binding(0) var tForest: texture_2d<f32>;
@group(3) @binding(1) var<uniform> GR: GrassU; // @dyn
@group(3) @binding(2) var tLeaf: texture_2d<f32>;
fn grassWind(xz: vec2f, time: f32) -> vec2f {
  let W = F.wind.xy; let ph = dot(xz, W) * 0.22 - time * 1.6;
  let g = 0.5 + 0.5 * sin(ph) * sin(ph * 0.37 + xz.x * 0.05 + 1.7) + 0.25 * sin(time * 3.1 + xz.x * 1.3 + xz.y * 0.9);
  return W * (0.12 + 0.3 * g) * F.wind.z + vec2f(-W.y, W.x) * 0.06 * sin(time * 2.3 + xz.y * 0.8) * F.wind.z;
}
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  let cell = GR.p.x; let bs = u32(GR.p.y); let B = u32(GR.p.z); let K = u32(GR.p.w); let ring = GR.r.y;
  let b = in.ii / (bs * bs); let l = in.ii % (bs * bs);
  let cxz = vec2f(f32((b % B) * bs + l % bs), f32((b / B) * bs + l / bs)) + GR.r.zw * f32(bs);
  let h = hash22(cxz + ring * 37.0); let h2 = hash22(cxz * 1.37 + 11.3 + ring * 5.0);
  // tufts (K = 0): jitter of up to a whole cell in each direction — the grid disappears; blades: jitter within the cell
  let xz = (cxz + select(select(h, h * 1.9 - 0.45, ring > 0.5), h * 2.4 - 0.7, K == 0u)) * cell;
  let dW = distance(xz, F.camPos.xz);
  // effective distance: with a telephoto lens (TV camera) distant lawns are seen magnified — use distance × zoom
  let d = dW * GR.t.x;
  // coverage of this ring (fades before the grid edge) and of the previous ring (this appears where the previous doesn't cover)
  let eS = max(abs(xz.x - GR.s.z), abs(xz.y - GR.s.w)) / GR.s.y; let extS = 1.0 - smoothstep(0.8, 0.97, eS);
  var extP = 0.0; if (GR.t.y > 0.0) { let eP = max(abs(xz.x - GR.t.z), abs(xz.y - GR.t.w)) / GR.t.y; extP = 1.0 - smoothstep(0.8, 0.97, eP); }
  let z = wmZone(xz);
  // the mowed/rough boundary is no ruler: noise (only inside the transition band) cuts the edge into tongues and loose tufts
  let bn = (textureSampleLevel(tNoise, sLin, xz * 0.071, 0.0).r - 0.5) * 0.9 + (h2.x - 0.5) * 0.35;
  let dEdge = z.r * 32.0 - 8.0; let tall = smoothstep(0.12, 0.6, z.b + bn * 4.0 * z.b * (1.0 - z.b));
  let forest = textureSampleLevel(tForest, sClamp, (xz - F.wm.xy + 1.0) / (vec2f(textureDimensions(tForest)) * 2.0), 0.0).r;
  let patchN = textureSampleLevel(tNoise, sLin, xz * 0.013, 0.0).rg;
  var ok = wmIn(xz) && dEdge > 1.5 && z.g < 0.485 && z.a < 0.48 && h2.y > forest * 0.75;
  // height: short next to the track; tall and clumpy in the rough (and sparser/shorter under the forest)
  let clump = smoothstep(0.25, 0.7, patchN.x) * 0.8 + 0.35;
  // (the mowed grass grows a little with distance: at 40-70 m the blade is still 3-5 pixels tall and gives the lawn relief)
  var ht = mix((0.07 + 0.075 * h2.x) * (1.0 + 0.35 * sat(d / 22.0) + 0.9 * sat((d - 24.0) / 40.0)), (0.34 + 0.5 * h2.x * h2.x + 0.25 * h.y) * clump, tall);
  ht *= mix(1.0, 0.5, forest) * smoothstep(1.5, 2.7, dEdge);
  var fade = max(smoothstep(GR.q.x, GR.q.y, d), 1.0 - extP) * (1.0 - smoothstep(GR.q.z, GR.q.w, d)) * extS;
  if (K == 0u) {
    // tufts in irregular clumps: bare patches (low-frequency noise) + random gaps
    let cl = textureSampleLevel(tNoise, sLin, xz * 0.023 + ring * 0.21, 0.0).g;
    // in the far rings (banks seen from afar or through a telephoto) coverage is nearly continuous: a smooth bank read as
    // terrain with no vegetation; up close the clumps with gaps remain
    let farR = step(2.5, ring);
    fade *= tall * GR.s.x * smoothstep(mix(0.3, 0.12, farR), mix(0.5, 0.3, farR), cl + (h2.x - 0.5) * 0.3);
    if (hash21(cxz * 2.71 + ring * 3.3) < mix(0.3, 0.08, farR)) { ok = false; }
  }
  if (ring > 4.5) { fade *= 1.0 - smoothstep(0.25, 0.6, tall); }   // far blade ring: only mowed grass (tall grass comes from the tufts)
  ht *= fade;
  if (ht < 0.012) { ok = false; }
  // next to the track the height map sits up to 0.3 m below the verge (see terrainH): the visible surface is the max between
  // the verge (track plane, dropping after 1.62 m) and the terrain
  let tDy = -0.3 * (1.0 - smoothstep(0.2, 2.2, dEdge)); let aDy = -0.07 * sat((dEdge - 1.62) / 0.48) - 0.48 * sat((dEdge - 2.1) / 0.5);
  let y0 = wmHeight(xz) - tDy + max(aDy, tDy);
  let base = vec3f(xz.x, y0 - 0.01, xz.y);
  if (!ok) { o.wpos = base; o.pwpos = base; o.nrm = vec3f(0.0, 1.0, 0.0); o.uv = vec2f(0.0); o.mat = 0u; o.col = vec4f(0.0); o.ext = vec4f(0.0); return o; }
  let w1 = grassWind(xz, F.wind.w); let w0 = grassWind(xz, F.wind.w - F.misc.x);
  let patchD = sat(patchN.y * 1.6 - 0.45 + h2.x * 0.3) * tall;
  if (K == 0u) {
    // tuft: upright card with the atlas clump (many thin, curved blades of varying heights)
    let cx = f32(in.vi & 1u) * 2.0 - 1.0; let cy = f32(in.vi >> 1u);
    let yawc = h.x * 6.2831853; var fw = vec2f(cos(yawc), sin(yawc));
    // partially turns toward the camera (without becoming a pure "billboard")
    let tc = normalize(F.camPos.xz - xz); let sdc = normalize(mix(vec2f(-fw.y, fw.x), vec2f(-tc.y, tc.x) * sign(dot(vec2f(-fw.y, fw.x), vec2f(-tc.y, tc.x)) + 1e-4), 0.55));
    // variants: whole clump or just the left/right half of the tile (three shapes, mirrorable), widely varying sizes
    let v1 = hash21(cxz * 0.731 + 4.1 + ring); let v2 = hash21(cxz * 1.913 + 9.7);
    let cu = select(0.5, select(0.31, 0.69, v2 > 0.5), v1 < 0.6); let hu = select(0.47, 0.29, v1 < 0.6);
    let hc = ht * 1.25 * (0.45 + 1.05 * h2.y * h2.y) * select(1.0, 1.5, ring > 2.5) * select(1.0, 1.2, ring > 3.5); let wc = GR.r.x * (0.5 + 1.1 * h.y) * (0.6 + 0.5 * sat(hc)) * (hu / 0.47 * 0.8 + 0.2);
    let sway = (fw * (0.1 + 0.25 * h.y)) * hc * cy;
    o.wpos = base + vec3f(sdc.x, 0.0, sdc.y) * (cx * wc) + vec3f(0.0, hc * cy, 0.0) + vec3f(sway.x + w1.x * hc * cy, 0.0, sway.y + w1.y * hc * cy);
    o.pwpos = base + vec3f(sdc.x, 0.0, sdc.y) * (cx * wc) + vec3f(0.0, hc * cy, 0.0) + vec3f(sway.x + w0.x * hc * cy, 0.0, sway.y + w0.y * hc * cy);
    o.nrm = normalize(vec3f(fw.x * 0.25, 1.0, fw.y * 0.25));
    // green tips (slightly brighter than the mowed grass); only dry patches lean to straw — no blown-out yellow
    let tipT = mix(mix(COL_GRASS * 1.25, vec3f(0.088, 0.142, 0.036), tall), vec3f(0.15, 0.15, 0.058), patchD * 0.4);
    var cc = mix(COL_GRASS_ROOT * 1.3, tipT, smoothstep(0.0, 0.9, cy)) * (0.66 + 0.6 * h.y) * mix(vec3f(0.74, 0.84, 0.86), vec3f(1.26, 1.1, 0.66), v2);   // each tuft with its own tone (dark green to olive)
    o.col = vec4f(cc, mix(0.22, 1.0, sqrt(cy)) * mix(1.0, 0.6, forest));
    // atlas tile 5 (tuft): 4x2 columns → (1, 1)
    o.uv = vec2f((1.0 + (cu + hu * cx * select(1.0, -1.0, h2.x > 0.5))) / 4.0, (1.0 + (1.0 - cy) * 0.985 + 0.006) / 2.0);
    o.mat = 1u; o.ext = vec4f(tall, cy, 0.0, d);
    return o;
  }
  let lvl = min(in.vi >> 1u, K); let side = f32(in.vi & 1u) * 2.0 - 1.0; let tip = (in.vi >> 1u) >= K;
  let t = f32(lvl) / f32(K);
  let yaw = h.x * 6.2831853 + h2.y * 3.0; let fwd = vec2f(cos(yaw), sin(yaw)); let sd = vec2f(-fwd.y, fwd.x);
  // width: never below ~0.9 pixel at the base (widens with distance × zoom; a subpixel blade would shimmer and vanish)
  let pxw = dW * 2.0 * F.post.y / F.screen.y;
  let wid = max(GR.r.x * (0.65 + 0.7 * h2.y) * mix(1.35, 1.3, tall), pxw * 0.9) * (1.0 - 0.92 * pow(t, 1.6));   // thin blades (the mowed grass was a wide triangle)
  let lean = (0.12 + 0.5 * h.y * h.y) * mix(1.6, 1.0, tall);
  let bend = fwd * lean; let t2 = t * t;
  var off = vec3f(sd.x, 0.0, sd.y) * (wid * select(side, 0.0, tip));
  let up = vec3f(0.0, ht * t * (1.0 - 0.18 * t2 * (lean + length(w1))), 0.0);
  let stiff = mix(0.45, 1.0, tall);
  o.wpos = base + up + off + vec3f(bend.x + w1.x * stiff, 0.0, bend.y + w1.y * stiff) * (ht * t2);
  o.pwpos = base + up + off + vec3f(bend.x + w0.x * stiff, 0.0, bend.y + w0.y * stiff) * (ht * t2);
  // normal: nearly straight up, pulled by the blade face and the lean
  o.nrm = normalize(vec3f(fwd.x * 0.35 * side + bend.x * t, 1.0, fwd.y * 0.35 * side + bend.y * t));
  // color: dark root → green → tip (dry on tall grass), with patches
  let dry = patchD;
  let tipC = mix(mix(COL_GRASS * 1.25, vec3f(0.088, 0.142, 0.036), tall), vec3f(0.15, 0.15, 0.058), dry * 0.4);
  let midC = mix(COL_GRASS, COL_GRASS * vec3f(1.0, 0.95, 0.8), tall * 0.5);
  let tk = 0.35;
  // mowed grass: root almost the color of the lawn (the mat of blades blends with the terrain texture instead of turning dark)
  let rootC = mix(mix(COL_GRASS_ROOT, COL_GRASS, 0.7), COL_GRASS_ROOT, tall);
  var c = mix(rootC, midC, smoothstep(0.0, 0.45, t)); c = mix(c, tipC, smoothstep(tk, 1.0, t));
  c *= 0.78 + 0.44 * h.y;
  c *= mix(vec3f(0.8, 0.9, 0.86), vec3f(1.22, 1.1, 0.72), sat(patchN.x * 1.5 - 0.3 + (h2.y - 0.5) * 0.5));   // tone patches (dark green ↔ yellow-green) and tuft-to-tuft variation
  c *= mix(0.88, 1.0, tall);   // mowed a bit darker: blends with the lawn texture when the blades end
  o.col = vec4f(c, mix(mix(0.62, 0.35, tall), mix(0.86, 1.0, tall), sat(t * 1.5)) * mix(1.0, 0.6, forest));
  o.uv = vec2f(side, t); o.mat = 0u; o.ext = vec4f(tall, t, 0.0, 0.0);
  return o;
}
fn surf(in: V2F, ff: bool) -> Surface {
  var s = surfDefault(normalize(in.nrm));
  s.albedo = in.col.rgb; s.ao = in.col.a; s.rough = 0.88; s.sss = 0.2 * in.ext.y;
  if (in.mat == 1u) {
    let t = textureSample(tLeaf, sLin, in.uv);
    if (vegCover(t.a, 0.45) <= vegNoise(in.pos.xy)) { discard; }   // ~1-pixel edge resolved by TAA (no card aliasing)
    // the texture only modulates the tone (blade by blade); the color comes from the palette, to blend with the terrain
    // the texture modulates the tone blade by blade and marks the dry blades (straw) — the green comes from the palette, to blend with the terrain
    let dryT = sat((t.r / max(t.g, 1e-3) - 0.82) * 3.5);
    s.albedo = mix(in.col.rgb, vec3f(0.19, 0.165, 0.075) * (0.55 + 0.6 * in.ext.y), dryT * 0.85) * clamp(0.5 + lum(t.rgb) * 8.0, 0.5, 1.1); s.sss = 0.11 * in.ext.y;   // sunlit tuft doesn't blow out to straw
  }
  return s;
}
