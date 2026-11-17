// Temporal anti-aliasing: reprojection with dilated velocity, variance clipping in YCoCg, bicubic history.
#include fsq
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var tCur: texture_2d<f32>;
@group(0) @binding(2) var tHist: texture_2d<f32>;
@group(0) @binding(3) var tVel: texture_2d<f32>;
@group(0) @binding(4) var gD: texture_depth_2d;
@group(0) @binding(5) var sClamp: sampler;
fn toY(c: vec3f) -> vec3f { return vec3f(dot(c, vec3f(0.25, 0.5, 0.25)), dot(c, vec3f(0.5, 0.0, -0.5)), dot(c, vec3f(-0.25, 0.5, -0.25))); }
fn fromY(c: vec3f) -> vec3f { return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
fn tm(c: vec3f) -> vec3f { return c / (1.0 + max(c.r, max(c.g, c.b))); }
fn itm(c: vec3f) -> vec3f { return c / max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); }
fn histCR(uv: vec2f) -> vec3f {
  // Catmull-Rom with 5 bilinear samples
  let sz = F.screen.xy; let p = uv * sz; let c = floor(p - 0.5) + 0.5; let f = p - c;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); let w1 = 1.0 + f * f * (-2.5 + 1.5 * f); let w2 = f * (0.5 + f * (2.0 - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2; let o12 = w2 / w12;
  let t0 = (c - 1.0) / sz; let t3 = (c + 2.0) / sz; let t12 = (c + o12) / sz;
  var r = vec4f(0.0);
  r += vec4f(tm(textureSampleLevel(tHist, sClamp, vec2f(t12.x, t0.y), 0.0).rgb), 1.0) * (w12.x * w0.y);
  r += vec4f(tm(textureSampleLevel(tHist, sClamp, vec2f(t0.x, t12.y), 0.0).rgb), 1.0) * (w0.x * w12.y);
  r += vec4f(tm(textureSampleLevel(tHist, sClamp, vec2f(t12.x, t12.y), 0.0).rgb), 1.0) * (w12.x * w12.y);
  r += vec4f(tm(textureSampleLevel(tHist, sClamp, vec2f(t3.x, t12.y), 0.0).rgb), 1.0) * (w3.x * w12.y);
  r += vec4f(tm(textureSampleLevel(tHist, sClamp, vec2f(t12.x, t3.y), 0.0).rgb), 1.0) * (w12.x * w3.y);
  return max(r.rgb / r.a, vec3f(0.0));
}
struct TOut { @location(0) col: vec4f, @location(1) vel: vec4f }
@fragment fn fs(in: FsV) -> TOut {
  let p = vec2i(in.pos.xy); let dim = vec2i(F.screen.xy) - 1;
  // velocity of the pixel closest to the camera in the 3x3 neighborhood (dilates edges of moving objects)
  var best = p; var bd = -1.0;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) { let q = clamp(p + vec2i(x, y), vec2i(0), dim); let d = textureLoad(gD, q, 0); if (d > bd) { bd = d; best = q; } } }
  var vel = textureLoad(tVel, best, 0).xy;
  if (bd <= 0.0) {
    // sky: only the camera rotation
    let w = F.invViewProjJ * vec4f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, 1e-6, 1.0);
    let dir = normalize(w.xyz / w.w - F.camPos.xyz);
    let pc = F.prevViewProj * vec4f(dir, 0.0); let cc = F.viewProj * vec4f(dir, 0.0);
    vel = (cc.xy / cc.w - pc.xy / pc.w) * vec2f(0.5, -0.5);
  }
  // 3x3 neighborhood in YCoCg (compressed space)
  var m1 = vec3f(0.0); var m2 = vec3f(0.0); var cmin = vec3f(1e9); var cmax = vec3f(-1e9);
  var cur = vec3f(0.0); var wsum = 0.0; var curF = vec3f(0.0);
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(p + vec2i(x, y), vec2i(0), dim); let c = toY(tm(textureLoad(tCur, q, 0).rgb));
    m1 += c; m2 += c * c; cmin = min(cmin, c); cmax = max(cmax, c);
    // reconstruction filter (approx. Blackman-Harris) centered on the un-jittered position
    let dd = vec2f(f32(x), f32(y)) - F.jitter.xy * vec2f(0.5, -0.5) * F.screen.xy;
    let w = exp(-2.29 * dot(dd, dd)); curF += c * w; wsum += w;
    if (x == 0 && y == 0) { cur = c; }
  } }
  curF /= wsum;
  let mu = m1 / 9.0; let sg = sqrt(max(m2 / 9.0 - mu * mu, vec3f(0.0)));
  let huv = in.uv - vel;
  var o: TOut; o.vel = vec4f(vel, 0.0, 0.0);
  if (F.misc.w > 0.5) { o.vel = vec4f(0.0); o.col = vec4f(itm(fromY(curF)), 1.0); return o; }   // camera cut: no history and no smearing
  if (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) { o.col = vec4f(itm(fromY(curF)), 1.0); return o; }
  var h = toY(histCR(huv));
  // variance clipping (box mu ± g*sigma), limited to the neighborhood min/max
  let vpx = length(vel * F.screen.xy);
  let g = mix(1.25, 0.9, sat(vpx / 20.0));
  let lo = max(mu - sg * g, cmin); let hi = min(mu + sg * g, cmax);
  let cc = (lo + hi) * 0.5; let ee = (hi - lo) * 0.5 + 1e-5; let dv = h - cc; let t = abs(dv) / ee; let mt = max(t.x, max(t.y, t.z));
  if (mt > 1.0) { h = cc + dv / mt; }
  // current-frame weight: higher with fast motion; anti-flicker by luminance contrast
  var alpha = mix(0.07, 0.22, sat(vpx / 40.0));
  let lc = curF.x; let lh = h.x; let diff = abs(lc - lh) / max(lc, max(lh, 0.05)); alpha *= mix(1.0, 0.55, sat(diff * diff * 4.0) * (1.0 - sat(vpx / 6.0)));
  let r = mix(h, curF, alpha);
  o.col = vec4f(max(itm(fromY(r)), vec3f(0.0)), 1.0);
  return o;
}
