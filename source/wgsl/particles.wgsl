// Tire smoke and dust: camera-facing cards, vertex-lit, with a soft edge against scene depth.
#include fwd_common
struct VIn {
  @builtin(vertex_index) vi: u32,
  @location(0) pos: vec4f,     // xyz center, w size
  @location(1) col: vec4f,     // rgb, alpha
  @location(2) misc: vec4f,    // rotation, seed, -, -
}
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  let k = in.vi % 6u; let cx = select(-1.0, 1.0, k == 1u || k == 2u || k == 4u); let cy = select(-1.0, 1.0, k == 2u || k == 4u || k == 5u);
  let right = F.invView[0].xyz; let up = F.invView[1].xyz;
  let c = cos(in.misc.x); let s = sin(in.misc.x); let q = vec2f(cx * c - cy * s, cx * s + cy * c);
  o.wpos = in.pos.xyz + (right * q.x + up * q.y) * in.pos.w;
  o.pwpos = o.wpos; o.nrm = vec3f(0.0, 1.0, 0.0); o.uv = vec2f(cx, cy); o.mat = 0u;
  // light at the card center
  let lp = F.shadowVP[1] * vec4f(in.pos.xyz, 1.0); let suv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  // softened shadow (4 scattered taps) so the cloud doesn't flicker when crossing a shadow edge
  var sh = 1.0;
  if (suv.x > 0.02 && suv.y > 0.02 && suv.x < 0.98 && suv.y < 0.98) {
    sh = 0.0; let e = 14.0 / SHADOW_RES;
    sh += textureSampleCompareLevel(tShadow, sCmp, suv + vec2f(e, e), 1, lp.z - 0.002); sh += textureSampleCompareLevel(tShadow, sCmp, suv + vec2f(-e, e), 1, lp.z - 0.002);
    sh += textureSampleCompareLevel(tShadow, sCmp, suv + vec2f(e, -e), 1, lp.z - 0.002); sh += textureSampleCompareLevel(tShadow, sCmp, suv + vec2f(-e, -e), 1, lp.z - 0.002);
    sh *= 0.25;
  }
  let V = normalize(F.camPos.xyz - in.pos.xyz);
  let ph = 0.55 + 0.45 * pow(sat(dot(-V, F.sunDir.xyz) * 0.5 + 0.5), 3.0) * 2.2;
  let amb = max(F.sh[0].rgb + F.sh[1].rgb * 0.5, vec3f(0.0));
  o.col = vec4f(in.col.rgb * (F.sunCol.rgb * (0.15 + 0.85 * sh) * ph / PI + amb * 1.2), in.col.a);
  o.ext = vec4f(in.misc.y, 0.0, 0.0, 0.0);
  return o;
}
fn shade(in: V2F, ff: bool) -> vec4f {
  let r = length(in.uv);
  // two levels of noise offset by the seed: ragged edges and a core with relief
  let sd = vec2f(in.ext.x * 7.3, in.ext.x * 3.1);
  let n = textureSampleLevel(tNoise, sLin, in.uv * 0.19 + sd, 1.0);
  let n2 = textureSampleLevel(tNoise, sLin, in.uv * 0.47 - sd * 1.7, 0.0);
  // wisps with frayed edges: noise erodes the density (without this, summed particles become a uniform veil)
  let dens = smoothstep(1.0, 0.35, r) * sat(0.85 - r * 0.9 + (n.r - 0.5) * 2.3 + (n2.g - 0.5) * 1.1);
  var a = smoothstep(0.1, 0.62, dens) * in.col.a;
  // fake volume: normal of a sphere dented by noise, lit by the sun in camera space
  let nz = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  let N = normalize(vec3f(in.uv + (n.rg - 0.5) * 0.9, nz + 0.35));
  let Lv = (F.view * vec4f(F.sunDir.xyz, 0.0)).xyz;
  let wrap = sat(dot(N, Lv) * 0.5 + 0.5);
  let lit = mix(0.3, 1.3, wrap * wrap) * (0.7 + 0.6 * n2.r) * mix(0.72, 1.0, sat(in.uv.y * 0.5 + 0.5));   // darker cloud base (self-shadow)
  // soft edge against geometry and near the lens
  let zs = F.camFwd.w / max(textureLoad(gD, vec2i(in.pos.xy), 0), 1e-6); let zf = F.camFwd.w / in.pos.z;
  a *= smoothstep(0.0, 1.1, zs - zf) * smoothstep(1.2, 7.0, zf);
  return vec4f(in.col.rgb * lit * a, a);
}
