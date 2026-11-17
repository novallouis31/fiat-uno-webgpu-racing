// Per-pass entry points, generated around the family's vert()/surf().
@vertex fn vs(in: VIn) -> V2F {
  let o = vert(in);
  var r: V2F;
  r.pos = P.viewProj * vec4f(o.wpos, 1.0);
  r.wpos = o.wpos; r.nrm = o.nrm; r.uv = o.uv; r.mat = o.mat; r.col = o.col; r.ext = o.ext;
#ifdef PASS_GBUF
  r.cur = F.viewProj * vec4f(o.wpos, 1.0);
  r.prv = F.prevViewProj * vec4f(o.pwpos, 1.0);
#endif
  return r;
}
#ifdef PASS_GBUF
struct GOut { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @location(3) v: vec4f }
@fragment fn fs(in: V2F, @builtin(front_facing) ff: bool) -> GOut {
  let s = surf(in, ff);
  var o: GOut;
  o.a = vec4f(s.albedo, s.ao);
  o.b = vec4f(octEnc(s.normal), s.rough, s.metal);
  o.c = vec4f(s.coat, s.sss, sqrt(sat(s.emissive)), s.wet);
  let v = (in.cur.xy / in.cur.w - in.prv.xy / in.prv.w) * vec2f(0.5, -0.5);
  o.v = vec4f(v, 0.0, 0.0);
  return o;
}
#endif
#ifdef PASS_SHADOW
#ifdef ALPHA
@fragment fn fs(in: V2F, @builtin(front_facing) ff: bool) { if (surfAlpha(in) < 0.5) { discard; } }
#endif
#endif
#ifdef PASS_CUBE
#include cube_light
@fragment fn fs(in: V2F, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let s = surf(in, ff);
  return vec4f(cubeLit(s, in.wpos), 1.0);
}
#endif
