// Utility functions and the Frame struct (no bindings).
#include frame
const PI = 3.14159265;
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.0), vec3f(1.0)); }
fn sq(x: f32) -> f32 { return x * x; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn hash11(p: f32) -> f32 { var x = fract(p * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
fn hash21(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn hash22(p: vec2f) -> vec2f { var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
fn hash31(p: vec3f) -> f32 { var p3 = fract(p * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
fn hash33(p: vec3f) -> vec3f { var p3 = fract(p * vec3f(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
// interleaved gradient noise (works well with TAA)
fn ign(px: vec2f, frame: f32) -> f32 { let p = px + 5.588238 * frame; return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }
fn remap(x: f32, a: f32, b: f32) -> f32 { return sat((x - a) / (b - a)); }
// octahedron-encoded normal
fn octEnc(n: vec3f) -> vec2f { let p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z)); let s = vec2f(select(-1.0, 1.0, p.x >= 0.0), select(-1.0, 1.0, p.y >= 0.0)); return select((1.0 - abs(p.yx)) * s, p, n.z >= 0.0); }
fn octDec(e: vec2f) -> vec3f { var n = vec3f(e, 1.0 - abs(e.x) - abs(e.y)); let t = sat(-n.z); n.x += select(t, -t, n.x >= 0.0); n.y += select(t, -t, n.y >= 0.0); return normalize(n); }
// perturbs normal n by a height gradient (dhdx, dhdz in the world plane) — for near-horizontal surfaces
fn bumpXZ(n: vec3f, g: vec2f) -> vec3f { return normalize(n - vec3f(g.x, 0.0, g.y) + n * dot(n, vec3f(g.x, 0.0, g.y))); }
// arbitrary tangent basis from a normal
fn tbn(n: vec3f) -> mat3x3f { let s = select(-1.0, 1.0, n.z >= 0.0); let a = -1.0 / (s + n.z); let b = n.x * n.y * a; return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n); }
