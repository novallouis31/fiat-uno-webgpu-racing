// Tire marks: a dark decal over the G-buffer albedo.
#include common
#include gbuf
struct SIn { @location(0) pos: vec3f, @location(1) au: vec2f }
struct SOut { @builtin(position) pos: vec4f, @location(0) au: vec2f, @location(1) wp: vec3f }
@vertex fn vs(in: SIn) -> SOut { var o: SOut; o.pos = P.viewProj * vec4f(in.pos, 1.0); o.au = in.au; o.wp = in.pos; return o; }
struct DOut { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f }
@fragment fn fs(in: SOut) -> DOut {
  let u = abs(in.au.y);
  let n = textureSample(tNoise, sLin, in.wp.xz * vec2f(3.1, 3.1)).r;
  let edge = 1.0 - smoothstep(0.62, 1.0, u);
  // tread-rib bands + underlying asphalt grain
  let rib = 0.72 + 0.28 * smoothstep(0.1, 0.25, abs(fract(u * 2.5 + 0.25) - 0.5));
  let al = sat(in.au.x) * edge * rib * (0.55 + 0.7 * n);
  var o: DOut; o.a = vec4f(vec3f(0.014), sat(al) * 0.62); o.b = vec4f(0.0); o.c = vec4f(0.0); return o;
}
