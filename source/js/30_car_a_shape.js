// Fiat Uno Mille EP 1996 (2 doors) — body shape as a single parametric surface (right half, z >= 0).
// Car coordinate frame: origin on the ground under the center of the wheelbase; X forward, Y up, Z right. Units: meters.
// The skin is P(u, v): u runs along the upper profile (front → rear, by arc length), v climbs the side
// (sill → beltline → pillar → roof corner) and crosses the top to the plane of symmetry.
const CS = {
  XF: 1.876, XR: -1.692,          // profile endpoints in "edge coordinates" (the center moves forward/back due to bulging)
  YS: 0.19,                       // sill
  AXF: 1.181, AXR: -1.181, WR: 0.281,
  TH_S: Math.sin(19.5 * PI / 180), TH_C: Math.cos(19.5 * PI / 180),
  VF: [0, 0.36, 0.42, 0.60, 0.68, 1],
  ARCH_R: 0.318, ARCH_Y: 0.295,
};
const csq = x => x * x;
function csmin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function csmax(a, b, k) { return -csmin(-a, -b, k); }
// upper profile in the edge plane: hood, windshield, roof, rear window, hatch, front
function carYT(x) {
  const fascia = 0.765 - 4.3 * (x - 1.752);
  const hood = 0.96 - 0.1806 * (x - 0.672) + 0.012 * (1 - csq((x - 1.21) / 0.54));
  const wind = 0.96 - 0.81 * (x - 0.672);
  const a = x + 0.35, roof = 1.445 - (a > 0 ? 0.26 * a * a : 0.041 * a * a) + (x > 0.2 ? 6 * csq(x - 0.2) : 0);
  const hatch = 0.93 + 1.78 * (x + 1.585);
  const tail = 0.93 + 6.2 * (x + 1.585);
  let y = csmax(hood, wind, 0.02);
  y = csmin(y, roof, 0.035); y = csmin(y, hatch, 0.06); y = csmin(y, tail, 0.05); y = csmin(y, fascia, 0.05);
  return y;
}
// bulge in plan view: the center sits further forward (windshield, front) or further back (rear) than the edges
function carBulge(x) { return 0.055 * smooth(-0.15, 0.25, x) - 0.036 * smooth(-1.15, -1.42, x); }
function carCrown(x) { return 0.02 * smooth(0.62, 0.9, x) * smooth(1.8, 1.7, x) + 0.032 * smooth(0.2, -0.1, x) * smooth(-1.5, -1.3, x); }
function carYtop(x, z) {
  const zz = z / 0.72, xi = carBulge(x) * (1 - zz * zz);
  let y = carYT(x - xi) - carCrown(x) * zz * zz;
  // central hood ridge (two creases that converge toward the front)
  if (x > 0.6) {
    // (position measured from the front photo: ~0,51 m from the axis near the windshield, ~0,37 m at the front; 9 mm step with a sharp edge)
    const zc = 0.515 - 0.145 * sat((x - 0.72) / 1.03);
    y += 0.0095 * (1 - smooth(zc - 0.0065, zc + 0.0065, z)) * smooth(0.77, 0.9, x - xi) * smooth(1.78, 1.70, x - xi);
  }
  return y;
}
function carWPlan(x) {
  const t = sat((x - 0.55) / 1.3), t2 = sat((-0.85 - x) / 0.82);
  return 0.774 - 0.082 * t * t - 0.05 * t2 * t2;
}
// lower side: half-width as a function of height (bulge, recessed band, wheel-arch lip, sill fold)
function carZL(x, y) {
  let z = carWPlan(x);
  const d = y - 0.63; z -= d < 0 ? 0.03 * csq(d / 0.43) : 0.022 * csq(d / 0.30);
  z -= 0.003 * smooth(0.44, 0.53, y) * (1 - smooth(0.585, 0.675, y));   // wide transitions: no wavy highlights on the mesh
  if (y < 0.25) z -= 0.03 * csq((0.25 - y) / 0.06);
  const df = Math.hypot(x - CS.AXF, y - CS.ARCH_Y) - CS.ARCH_R, dr = Math.hypot(x - CS.AXR, y - CS.ARCH_Y) - CS.ARCH_R, da = Math.min(df, dr);
  if (da < 0.3) z += 0.0024 * Math.exp(-csq((da - 0.01) / 0.1));
  return z;
}
function carBeltN(x) { return 0.922 + 0.005 * (0.67 - x); }
function carR2(x) {
  // upper-corner radius: hood shoulder, A-pillar, roof, C-pillar, rear corner, front corner
  let r = 0.045;
  r = lerp(r, 0.024, smooth(-0.05, 0.2, x));       // A-pillar
  r = lerp(r, 0.013, smooth(0.6, 0.8, x));         // fender shoulder
  r = lerp(r, 0.04, smooth(1.66, 1.76, x));        // front corner
  r = lerp(r, 0.032, smooth(-1.3, -1.4, x));       // C-pillar
  r = lerp(r, 0.045, smooth(-1.56, -1.62, x));     // rear corner
  return r;
}
// section parameters at x (small cache: the patch queries the same station several times)
const _stCache = []; let _stNext = 0;
for (let i = 0; i < 8; i++) _stCache.push({ x: NaN, yB: 0, zB: 0, dAz: 0, LA: 0, LB: 0, zE: 0, yE: 0, dCy: 0, r1: 0, r2: 0, b: new Float64Array(6) });
function carStation(x) {
  for (let i = 0; i < 8; i++) if (_stCache[i].x === x) return _stCache[i];
  const st = _stCache[_stNext]; _stNext = (_stNext + 1) & 7; st.x = x;
  const bn = carBeltN(x);
  // top of the wall without the pillar: y = Ytop(x, zL(x, y))
  let y = bn; for (let k = 0; k < 4; k++) y = carYtop(x, carZL(x, Math.min(y, bn + 0.2)));
  if (y <= bn) { st.yB = y; st.LB = 0; }
  else {
    st.yB = bn; const zb = carZL(x, bn); let t = (carYtop(x, zb) - bn) / CS.TH_C;
    for (let k = 0; k < 5; k++) t = (carYtop(x, zb - t * CS.TH_S) - bn) / CS.TH_C;
    st.LB = Math.max(t, 0);
  }
  st.zB = carZL(x, st.yB); st.dAz = (carZL(x, st.yB) - carZL(x, st.yB - 0.004)) / 0.004;
  st.LA = st.yB - CS.YS;
  st.zE = st.zB - st.LB * CS.TH_S; st.yE = st.yB + st.LB * CS.TH_C;
  st.dCy = -(carYtop(x, st.zE) - carYtop(x, st.zE - 0.004)) / 0.004;   // dy/dq (q = zE - z)
  st.r1 = 0.010; st.r2 = carR2(x);
  const b = st.b, h = st.LB * 0.5; b[0] = 0; b[1] = st.LA - st.r1; b[2] = st.LA + Math.min(st.r1, h); b[3] = st.LA + st.LB - Math.min(st.r2, h); b[4] = st.LA + st.LB + st.r2; b[5] = st.LA + st.LB + st.zE;
  return st;
}
function carG(d, r) { return d <= -r || d >= r ? 0 : d < 0 ? (r + d) * (r + d) / (4 * r) : (r - d) * (r - d) / (4 * r); }
// skin point: x (station), v (0..1), off (displacement along the normal; + = outward). out = [x,y,z]
function carSkin(x, v, off, out) {
  const st = carStation(x), VF = CS.VF, b = st.b;
  let k = 0; while (k < 4 && v > VF[k + 1]) k++;
  const s = b[k] + (b[k + 1] - b[k]) * (v - VF[k]) / (VF[k + 1] - VF[k]);
  let z, y, tz, ty;   // raw point and tangent
  const s1 = st.LA, s2 = st.LA + st.LB;
  if (s <= s1) { y = CS.YS + s; z = carZL(x, y); tz = (carZL(x, y + 0.002) - carZL(x, y - 0.002)) / 0.004; ty = 1; }
  else if (s <= s2) { const t = s - s1; z = st.zB - t * CS.TH_S; y = st.yB + t * CS.TH_C; tz = -CS.TH_S; ty = CS.TH_C; }
  else { z = st.zE - (s - s2); y = carYtop(x, z); tz = -1; ty = -(carYtop(x, z + 0.002) - carYtop(x, z - 0.002)) / 0.004; }
  // rounded corners (exact parabolic fillet of the box filter)
  const d1z = -CS.TH_S - st.dAz, d1y = CS.TH_C - 1, d2z = -1 + CS.TH_S, d2y = st.dCy - CS.TH_C;
  const g1 = carG(s - s1, st.r1), g2 = carG(s - s2, st.r2);
  z += d1z * g1 + d2z * g2; y += d1y * g1 + d2y * g2;
  let px = x;
  if (off) {
    const e1 = s - s1, e2 = s - s2;
    const h1 = e1 <= -st.r1 ? 0 : e1 >= st.r1 ? 0 : (e1 < 0 ? (st.r1 + e1) : -(st.r1 - e1)) / (2 * st.r1);
    const h2 = e2 <= -st.r2 ? 0 : e2 >= st.r2 ? 0 : (e2 < 0 ? (st.r2 + e2) : -(st.r2 - e2)) / (2 * st.r2);
    // derivative of the fillets: g' = (r+d)/(2r) for d<0, -(r-d)/(2r) for d>0 — added to the raw tangent only inside the zone
    let Tz = tz, Ty = ty;
    if (s > s1 && e1 < st.r1) { /* already on side B: raw tangent = dB */ }
    Tz += d1z * h1 + d2z * h2; Ty += d1y * h1 + d2y * h2;
    // normal in the section plane (outward): (ty, -tz) in (z, y)
    let nz = Ty, ny = -Tz; const l = 1 / Math.hypot(nz, ny); nz *= l; ny *= l;
    // slope along x (only relevant on the top): dY/dx
    const yx = (carYtop(x + 0.003, Math.max(z, 0)) - carYtop(x - 0.003, Math.max(z, 0))) / 0.006;
    let nx = -yx * Math.max(ny, 0) * Math.max(ny, 0); const l2 = 1 / Math.hypot(nx, ny, nz);
    px += nx * l2 * off; y += ny * l2 * off; z += nz * l2 * off;
  }
  out[0] = px; out[1] = y; out[2] = z;
}
// u <-> x table by arc length of the profile (u = 0 at the front, 1 at the rear)
const CAR_UT = { n: 800, x: null, s: null, L: 0 };
function carShapeInit() {
  const n = CAR_UT.n, xs = CAR_UT.x = new Float64Array(n + 1), ss = CAR_UT.s = new Float64Array(n + 1);
  let px = CS.XF, py = carYT(px), acc = 0;
  for (let i = 0; i <= n; i++) {
    const x = CS.XF + (CS.XR - CS.XF) * i / n, y = carYT(x); acc += Math.hypot(x - px, y - py); px = x; py = y; xs[i] = x; ss[i] = acc;
  }
  CAR_UT.L = acc;
}
function carXofU(u) {
  const T = CAR_UT, s = sat(u) * T.L; let lo = 0, hi = T.n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T.s[m] <= s) lo = m; else hi = m; }
  const f = (s - T.s[lo]) / Math.max(1e-9, T.s[hi] - T.s[lo]); return T.x[lo] + (T.x[hi] - T.x[lo]) * f;
}
function carUofX(x) {
  const T = CAR_UT, f = sat((x - CS.XF) / (CS.XR - CS.XF)) * T.n, i = Math.min(T.n - 1, Math.floor(f));
  return (T.s[i] + (T.s[i + 1] - T.s[i]) * (f - i)) / T.L;
}
// surface function for MeshBuilder.patch (with optional displacement)
function carSkinFn(off) { return (u, v, out) => carSkin(carXofU(u), v, off || 0, out); }

// ---------- clipping fields (negative = inside the element) ----------
function carArchF(P) {
  return Math.min(Math.hypot(P[0] - CS.AXF, P[1] - CS.ARCH_Y), Math.hypot(P[0] - CS.AXR, P[1] - CS.ARCH_Y)) - CS.ARCH_R;
}
// side windows in side view (x, y): smooth maxima of half-planes
const CW = { apx: 0, apy: 0, anx: 0, any: 0, cpx: 0, cpy: 0, cnx: 0, cny: 0, roofA: 0, roofB: 0, roofC: 0 };
function carWindowsInit() {
  // A-pillar line: through the upper wall corners at two windshield stations
  const a = carStation(0.60), ax = 0.60, ay = a.yE, b = carStation(0.20), bx = 0.20, by = b.yE;
  let nx = -(by - ay), ny = (bx - ax); let l = Math.hypot(nx, ny); nx /= l; ny /= l; if (ny > 0) { nx = -nx; ny = -ny; }   // normal pointing down/rearward (inside the window)
  CW.apx = ax; CW.apy = ay; CW.anx = nx; CW.any = ny;
  const c = carStation(-1.40), cx = -1.40, cy = c.yE, d = carStation(-1.54), dx = -1.54, dy = d.yE;
  nx = -(dy - cy); ny = (dx - cx); l = Math.hypot(nx, ny); nx /= l; ny /= l; if (nx < 0) { nx = -nx; ny = -ny; }             // normal pointing forward
  CW.cpx = cx; CW.cpy = cy; CW.cnx = nx; CW.cny = ny;
}
function carRoofEdgeY(x) { return carStation(clamp(x, -1.33, 0.1)).yE; }
function carWinDoor(P) {
  const x = P[0], y = P[1];
  const bottom = (carBeltN(x) + 0.014) - y;
  const top = y - (carRoofEdgeY(x) - 0.04);
  const front = 0.062 - ((x - CW.apx) * CW.anx + (y - CW.apy) * CW.any);
  const rear = (-0.345 - 0.04 * (y - 0.95)) - x;
  return csmax(csmax(bottom, top, 0.03), csmax(front, rear, 0.03), 0.035);
}
function carWinQuarter(P) {
  const x = P[0], y = P[1];
  const bottom = (carBeltN(x) + 0.014) - y;
  const top = y - (carRoofEdgeY(x) - 0.04);
  const front = x - (-0.455 - 0.04 * (y - 0.95));
  const rear = 0.098 - ((x - CW.cpx) * CW.cnx + (y - CW.cpy) * CW.cny);
  return csmax(csmax(bottom, top, 0.03), csmax(front, rear, 0.03), 0.035);
}
// windshield: on the top surface, in coordinates (x shifted by the bulge, z)
function carXe(P) { const zz = P[2] / 0.72; return P[0] - carBulge(P[0]) * (1 - zz * zz); }
function carWindshield(P) {
  const xe = carXe(P), st = carStation(P[0]);
  const lo = xe - 0.648, hi = 0.162 - xe, side = P[2] - (st.zE - 0.047);
  return P[0] < 0 ? 1 : csmax(csmax(lo, hi, 0.03), side, 0.06);
}
function carHatchGlass(P) {
  const st = carStation(P[0]), y = P[1];
  const lo = 1.0 - y, hi = y - 1.352, side = P[2] - (st.zE - 0.072);
  return P[0] > -1.2 ? 1 : csmax(csmax(lo, hi, 0.03), side, 0.06);
}
function carRRect(a, b, ha, hb, r) { const qa = Math.abs(a) - ha + r, qb = Math.abs(b) - hb + r; return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r; }
const CL = { hlZ0: 0.378, hlZ1: 0.607, lY: 0.693, lH: 0.062, clZ: 0.6135, clX: 1.735 };   // headlight + FRONT amber turn signal alongside (z > clZ), which wraps around the corner
function carHeadlight(P) { return carRRect(P[2] - (CL.hlZ0 + CL.hlZ1) / 2, P[1] - CL.lY, (CL.hlZ1 - CL.hlZ0) / 2, CL.lH, 0.012); }
function carCornerLamp(P, v) {
  const g = v > 0.64 ? CL.clZ - P[2] : CL.clX - P[0];
  return Math.max(Math.abs(P[1] - CL.lY) - CL.lH, g);
}
function carGrille(P) {
  const z = P[2], y = P[1];
  return carRRect(z, y - 0.694, 0.356, 0.0475, 0.008);   // single opening; the body-colored center bar is a separate piece
}
const CT = { z0: 0.497, y0: 0.584, y1: 0.822 };   // nearly square taillight, flush against the bumper, wrapping around the corner
function carTailLamp(P, v) {
  // rear face (x behind -1,572) + ~4 cm wrap around the side
  // rear face + wrap of constant width (~5,5 cm) around the side, parallel to the slanted rear edge
  return Math.max(carRRect(0, P[1] - (CT.y0 + CT.y1) / 2, 1, (CT.y1 - CT.y0) / 2, 0.012), CT.z0 - P[2], P[0] - (-1.585 + (P[1] - 0.93) / 6.2 + 0.055));
}
// ---------- distance to panel-gap lines (doors, hood, hatch) — goes into uv.x and becomes a dark line in the shader ----------
const CSEAM = { door: null };
function carSeamInit() {
  const p = [[0.74, 0.215], [0.74, 0.92], [0.722, 0.95]];
  for (let x = 0.66; x >= -0.41; x -= 0.045) p.push([x, carStation(x).yE - (x > 0.1 ? 0.03 : 0.024)]);
  p.push([-0.418, carStation(-0.418).yE - 0.024]); p.push([-0.418, 0.215]); p.push([0.74, 0.215]);
  CSEAM.door = p;
}
function carSegDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = sat(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }
// SIGNED distance to the nearest panel gap: union (minimum) of the door, hood and hatch regions — negative inside.
// (interpolates correctly between vertices; the shader draws the line where |d| ≈ 0)
function carSeam(P, v) {
  const x = P[0], y = P[1], z = P[2]; let d = 1;
  if (v < 0.66 && x > -0.7 && x < 1.0) {
    const p = CSEAM.door; let m = 1e9, inside = false;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1]; m = Math.min(m, carSegDist(x, y, a[0], a[1], b[0], b[1]));
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])) inside = !inside;
    }
    d = Math.min(d, inside ? -m : m);
  }
  if (v > 0.6) {
    const xe = carXe(P), st = carStation(x);
    if (xe > 0.5) d = Math.min(d, Math.max(z - (st.zE - 0.058), 0.745 - xe, xe - 1.742));     // hood
    if (x < -1.1) {   // rear hatch: S-shaped side (wraps around the taillights), hinge at the roof and lower edge
      const zs = lerp(CT.z0 - 0.014, st.zE - 0.05, smooth(CT.y1 + 0.006, CT.y1 + 0.07, y));
      d = Math.min(d, Math.max(z - zs, 0.565 - y, x + 1.315));
    }
  }
  return d;
}
