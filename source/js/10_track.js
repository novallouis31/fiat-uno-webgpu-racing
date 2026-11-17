// Original circuit: layout, elevation, zones and terrain height (CPU only; no GPU).
// Conventions: X east, Z south, Y up. Clockwise. s = distance along the centerline (m), d = lateral offset (m, + to the right).
const TRK = {
  N: 0, L: 0, ds: 1,
  x: null, z: null, y: null, tx: null, tz: null, k: null, bank: null, slope: null,
  hw: 5.5,                 // half width of the asphalt
  kerbL: null, kerbR: null,   // 0..1 kerb presence (left / right side)
  gravL: null, gravR: null,   // depth of the gravel trap from the edge (0 = none)
  barL: null, barR: null,     // distance from the centerline to the barrier (guard rail / wall) on each side
  tyreL: null, tyreR: null,   // 0/1 tyre barrier in front of the barrier
  segs: [], corners: [],
  grid: null, gridX0: 0, gridZ0: 0, gridW: 0, gridH: 0, gridCell: 24,
  // pit lane and buildings (in s,d coordinates relative to the main straight; negative s = before the line)
  pit: { s0: -100, s1: 190, wallD: 7.6, laneD0: 8.6, laneD1: 17.0, bldS0: -62, bldS1: 78, bldD0: 17.6, bldD1: 31, padD1: 52 },
  stand: { s0: -75, s1: 75, d0: -15.5, d1: -36 },
  startS: -14, startD: -1.6,
};
const KERB_W = 1.3, APRON = 2.6;
const ZONE = { ASPHALT: 0, KERB: 1, GRASS: 2, GRAVEL: 3, ROUGH: 4, PIT: 5, CONCRETE: 6 };

function trackBuild() {
  // Segments: ['S', length] or ['A', radius, angle° (+ right)]. Lw and Ln are solved to close the loop.
  const def = [
    ['S', 210, -0.6], ['A', 55, 90, -2.6, 'T1'], ['S', 40, -2.2],
    ['A', 80, -33, 1.0, 'S1'], ['A', 62, 66, 5.2, 'S2'], ['A', 80, -33, 9.0, 'S3'], ['S', 20, 10.6],
    ['A', 27, 180, 12.6, 'Grampo'], ['S', 30, 12.0], ['A', 42, -90, 10.2, 'T5'],
    ['S', 'Lw', 3.8], ['A', 75, -90, -1.4, 'T6'], ['S', 25, -2.4],
    ['A', 58, 180, -4.4, 'Big Bend'], ['S', 'Ln', -3.0],
    ['A', 40, -30, -2.0, 'Ch1'], ['A', 40, 60, -1.0, 'Ch2'], ['A', 40, -30, -0.4, 'Ch3'], ['S', 15, -0.2],
    ['A', 45, 90, 0, 'Final'], ['S', 110, 0],
  ];
  // solve Lw, Ln: the final position is linear in them
  const walk = (Lw, Ln, emit) => {
    let x = -60, z = 0, th = 0, s = 0;
    for (const sg of def) {
      const s0 = s;
      if (sg[0] === 'S') {
        const L = sg[1] === 'Lw' ? Lw : sg[1] === 'Ln' ? Ln : sg[1];
        if (emit) emit(sg, s0, L, x, z, th, 0);
        x += Math.cos(th) * L; z += Math.sin(th) * L; s += L;
      } else {
        const R = sg[1], a = sg[2] * PI / 180, L = Math.abs(a) * R, sgn = Math.sign(a);
        if (emit) emit(sg, s0, L, x, z, th, sgn / R);
        const cx = x - Math.sin(th) * R * sgn, cz = z + Math.cos(th) * R * sgn;
        th += a; x = cx + Math.sin(th) * R * sgn; z = cz - Math.cos(th) * R * sgn; s += L;
      }
    }
    return [x, z, s];
  };
  const p0 = walk(0, 0), pw = walk(1, 0), pn = walk(0, 1);
  // [pw-p0, pn-p0] * [Lw,Ln] = target - p0
  const a = pw[0] - p0[0], b = pn[0] - p0[0], c = pw[1] - p0[1], d = pn[1] - p0[1], ex = -60 - p0[0], ez = 0 - p0[1], det = a * d - b * c;
  const Lw = (ex * d - b * ez) / det, Ln = (a * ez - c * ex) / det;
  // coarse sampling every 0.5 m
  const raw = []; const elevKeys = [];
  const total = walk(Lw, Ln, (sg, s0, L, x, z, th, k) => {
    TRK.segs.push({ type: sg[0], s0, s1: s0 + L, k, name: sg[4] || '', R: sg[0] === 'A' ? sg[1] : 0, ang: sg[0] === 'A' ? sg[2] : 0 });
    elevKeys.push([s0 + L, sg[0] === 'S' ? sg[2] : sg[3]]);
    const n = Math.max(1, Math.round(L / 0.5));
    for (let i = 0; i < n; i++) {
      const t = i / n * L;
      if (k === 0) raw.push([x + Math.cos(th) * t, z + Math.sin(th) * t]);
      else { const R = 1 / Math.abs(k), sgn = Math.sign(k), cx = x - Math.sin(th) * R * sgn, cz = z + Math.cos(th) * R * sgn, t2 = th + t * k; raw.push([cx + Math.sin(t2) * R * sgn, cz - Math.cos(t2) * R * sgn]); }
    }
  })[2];
  TRK.Lw = Lw; TRK.Ln = Ln;
  // smooth (periodic Gaussian) to create curvature transitions
  const M = raw.length, sm = new Array(M), SG = 14, KS = 42;
  for (let i = 0; i < M; i++) {
    let sx = 0, sz = 0, sw = 0;
    for (let j = -KS; j <= KS; j++) { const w = Math.exp(-0.5 * j * j / (SG * SG)), p = raw[(i + j + M * 4) % M]; sx += p[0] * w; sz += p[1] * w; sw += w; }
    sm[i] = [sx / sw, sz / sw];
  }
  // resample at uniform arc length (~1 m)
  const cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) { const p = sm[i], q = sm[(i + 1) % M]; cum[i + 1] = cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const L = cum[M], N = Math.round(L), ds = L / N;
  TRK.N = N; TRK.L = L; TRK.ds = ds;
  const F = () => new Float32Array(N);
  const X = TRK.x = F(), Z = TRK.z = F(), Y = TRK.y = F(), TX = TRK.tx = F(), TZ = TRK.tz = F(), K = TRK.k = F(), BK = TRK.bank = F(); TRK.slope = F();
  TRK.kerbL = F(); TRK.kerbR = F(); TRK.gravL = F(); TRK.gravR = F(); TRK.barL = F(); TRK.barR = F(); TRK.tyreL = F(); TRK.tyreR = F();
  let j = 0;
  for (let i = 0; i < N; i++) {
    const t = i * ds; while (cum[j + 1] < t) j++;
    const f = (t - cum[j]) / (cum[j + 1] - cum[j]), p = sm[j], q = sm[(j + 1) % M];
    X[i] = p[0] + (q[0] - p[0]) * f; Z[i] = p[1] + (q[1] - p[1]) * f;
  }
  const scl = L / total; // smoothed length differs little from the nominal one: rescale the segments' s positions
  for (const sg of TRK.segs) { sg.s0 *= scl; sg.s1 *= scl; }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N; let tx = X[b] - X[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, tz); TX[i] = tx / l; TZ[i] = tz / l;
  }
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; K[i] = (TX[a] * TZ[b] - TZ[a] * TX[b]) / (2 * ds); }
  // elevation: interpolate keys (end of each segment) with cosine and smooth
  const ey = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * ds / scl; let q = 0; while (q < elevKeys.length - 1 && elevKeys[q][0] < s) q++;
    const k1 = elevKeys[q], k0 = q > 0 ? elevKeys[q - 1] : [0, elevKeys[elevKeys.length - 1][1]];
    const f = sat((s - k0[0]) / Math.max(1e-3, k1[0] - k0[0])); ey[i] = k0[1] + (k1[1] - k0[1]) * (0.5 - 0.5 * Math.cos(f * PI));
  }
  const gs = (src, dst, sg) => { const ks = Math.ceil(sg * 3); for (let i = 0; i < N; i++) { let s = 0, w = 0; for (let q = -ks; q <= ks; q++) { const g = Math.exp(-0.5 * q * q / (sg * sg)); s += src[(i + q + N * 4) % N] * g; w += g; } dst[i] = s / w; } };
  gs(ey, Y, 16);
  const kb = F(); gs(K, kb, 6);
  for (let i = 0; i < N; i++) { BK[i] = clamp(kb[i] * 1.7, -0.062, 0.062); TRK.slope[i] = (Y[(i + 1) % N] - Y[(i - 1 + N) % N]) / (2 * ds); }
  // kerbs, gravel and barriers from the arc segments
  const mark = (arr, s0, s1, val, ramp) => {
    const i0 = Math.floor(s0 / ds), i1 = Math.ceil(s1 / ds);
    for (let i = i0; i <= i1; i++) { const q = ((i % N) + N) % N; const e = ramp ? Math.min(1, (i - i0 + 1) / ramp, (i1 - i + 1) / ramp) : 1; arr[q] = Math.max(arr[q], val * (e * e * (3 - 2 * e))); }
  };
  const hw = TRK.hw;
  for (const sg of TRK.segs) if (sg.type === 'A') {
    const right = sg.k > 0, len = sg.s1 - sg.s0, big = Math.abs(sg.ang) >= 60;
    const inK = right ? TRK.kerbR : TRK.kerbL, outK = right ? TRK.kerbL : TRK.kerbR;
    mark(inK, sg.s0 - 4, sg.s1 + 4, 1, 0);
    if (big) { mark(outK, sg.s1 - len * 0.25, sg.s1 + 38, 1, 0); mark(outK, sg.s0 - 30, sg.s0 + 2, 1, 0); }
    else mark(outK, sg.s1 - 2, sg.s1 + 16, 1, 0);
    if (big) {
      const depth = sg.R < 30 ? 26 : sg.R < 50 ? 22 : 30;
      mark(right ? TRK.gravL : TRK.gravR, sg.s0 - 34, sg.s1 + 22, depth, 26);
      mark(right ? TRK.tyreL : TRK.tyreR, sg.s0 - 10, sg.s1 + 6, 1, 0);
    }
    TRK.corners.push(sg);
  }
  // barriers: default 8.5 m from the edge; behind the gravel; limited on the inside of tight corners
  for (let i = 0; i < N; i++) {
    const R = 1 / Math.max(1e-4, Math.abs(kb[i]));
    let l = hw + 8.5 + TRK.gravL[i] * 0.86, r = hw + 8.5 + TRK.gravR[i] * 0.86;
    if (kb[i] > 0) r = Math.min(r, Math.max(hw + 3.2, R * 0.55)); else l = Math.min(l, Math.max(hw + 3.2, R * 0.55));
    TRK.barL[i] = l; TRK.barR[i] = r;
  }
  // main straight: pit wall on the right, grandstand fencing on the left
  const sI = s => (((Math.round(s / ds)) % N) + N) % N;
  for (let s = TRK.pit.s0 - 40; s <= TRK.pit.s1 + 40; s++) {
    const i = sI(s), e = Math.min(1, (s - (TRK.pit.s0 - 40)) / 40, (TRK.pit.s1 + 40 - s) / 40);
    TRK.barR[i] = lerp(TRK.barR[i], TRK.pit.wallD, e); TRK.barL[i] = lerp(TRK.barL[i], hw + 3.4, e);
  }
  const tmp = F(); gs(TRK.barL, tmp, 5); TRK.barL.set(tmp); gs(TRK.barR, tmp, 5); TRK.barR.set(tmp);
  // clearance: the barrier must not intrude into the track of another section (at most halfway)
  for (let side = -1; side <= 1; side += 2) {
    const bar = side < 0 ? TRK.barL : TRK.barR;
    for (let i = 0; i < N; i++) {
      let b = bar[i];
      for (; b > hw + 3.0; b -= 0.5) {
        const px = X[i] - TZ[i] * side * b, pz = Z[i] + TX[i] * side * b; let ok = true;
        for (let q = 0; q < N; q += 2) { let di = Math.abs(q - i); di = Math.min(di, N - di); if (di < 70) continue; const dx = X[q] - px, dz = Z[q] - pz; if (dx * dx + dz * dz < (b + 1.5) * (b + 1.5)) { ok = false; break; } }
        if (ok) break;
      }
      bar[i] = b;
    }
    gs(bar, tmp, 4); for (let i = 0; i < N; i++) bar[i] = Math.min(bar[i], tmp[i]);
    const grav = side < 0 ? TRK.gravL : TRK.gravR;
    for (let i = 0; i < N; i++) { grav[i] = Math.min(grav[i], Math.max(0, bar[i] - hw - 5.2)); if (grav[i] < 3) grav[i] = 0; }
  }
  // spatial grid of samples for nearest-point search
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); z0 = Math.min(z0, Z[i]); z1 = Math.max(z1, Z[i]); }
  TRK.bx0 = x0; TRK.bx1 = x1; TRK.bz0 = z0; TRK.bz1 = z1; TRK.cx = (x0 + x1) / 2; TRK.cz = (z0 + z1) / 2;
  const cell = TRK.gridCell, pad = 240; TRK.gridX0 = x0 - pad; TRK.gridZ0 = z0 - pad;
  TRK.gridW = Math.ceil((x1 - x0 + 2 * pad) / cell); TRK.gridH = Math.ceil((z1 - z0 + 2 * pad) / cell);
  // for each cell, store the index of the sample closest to the cell center (seed for the local search)
  TRK.grid = new Int32Array(TRK.gridW * TRK.gridH); TRK.gridDist = new Float32Array(TRK.gridW * TRK.gridH); TRK.cellList = new Array(TRK.gridW * TRK.gridH);
  const tmpL = [];
  for (let gz = 0; gz < TRK.gridH; gz++) for (let gx = 0; gx < TRK.gridW; gx++) {
    const px = TRK.gridX0 + (gx + 0.5) * cell, pz = TRK.gridZ0 + (gz + 0.5) * cell; let best = 0, bd = 1e18; tmpL.length = 0;
    for (let i = 0; i < N; i++) { const dx = X[i] - px, dz = Z[i] - pz, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } if (d2 < 125 * 125) tmpL.push(i); }
    const c = gz * TRK.gridW + gx; TRK.grid[c] = best; TRK.gridDist[c] = Math.sqrt(bd); TRK.cellList[c] = tmpL.length ? Int32Array.from(tmpL) : null;
  }
}
// approximate distance (lower bound) from the point to the track centerline; cheap. Returns 1e9 outside the grid.
function trackFarDist(x, z) {
  const gx = Math.floor((x - TRK.gridX0) / TRK.gridCell), gz = Math.floor((z - TRK.gridZ0) / TRK.gridCell);
  if (gx < 0 || gz < 0 || gx >= TRK.gridW || gz >= TRK.gridH) return 1e9;
  return TRK.gridDist[gz * TRK.gridW + gx] - TRK.gridCell * 0.7072;
}

// Locates (s, d) of the point (x,z). hint = nearby sample index (or -1 for a global search). out = [s, d, index, fraction]
// (used during generation; in the game loop use trackLocateQ, which takes no numbers as arguments)
const _loc = new Float64Array(4), _lq = new Float64Array(12);
function trackLocate(x, z, hint, out) { _lq[0] = x; _lq[1] = z; trackLocateQ(hint, _lq); out[0] = _lq[2]; out[1] = _lq[3]; out[2] = _lq[4]; out[3] = _lq[5]; return out; }
// Register q: input q[0]=x, q[1]=z; output q[2]=s, q[3]=d, q[4]=index, q[5]=fraction
function trackLocateQ(hint, q) {
  const x = q[0], z = q[1];
  const N = TRK.N, X = TRK.x, Z = TRK.z; let best = 0, bd = 1e18;
  if (hint < 0) {
    // global search: uses the cell's candidate list; outside the grid (or far away), scan everything
    const gx = Math.floor((x - TRK.gridX0) / TRK.gridCell), gz = Math.floor((z - TRK.gridZ0) / TRK.gridCell);
    const lst = (gx >= 0 && gz >= 0 && gx < TRK.gridW && gz < TRK.gridH) ? TRK.cellList[gz * TRK.gridW + gx] : null;
    if (lst) { for (let k = 0; k < lst.length; k++) { const i = lst[k], dx = X[i] - x, dz = Z[i] - z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } } }
    else for (let i = 0; i < N; i++) { const dx = X[i] - x, dz = Z[i] - z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
  } else {
    for (let k = -24; k <= 24; k++) { const i = (hint + k + N * 2) % N, dx = X[i] - x, dz = Z[i] - z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
  }
  // project onto the neighboring segment
  const tx = TRK.tx[best], tz = TRK.tz[best]; const along = (x - X[best]) * tx + (z - Z[best]) * tz;
  let i0 = best, f = along / TRK.ds;
  if (f < 0) { i0 = (best - 1 + N) % N; f += 1; }
  f = f < 0 ? 0 : f > 1 ? 1 : f; const i1 = (i0 + 1) % N;
  const px = X[i0] + (X[i1] - X[i0]) * f, pz = Z[i0] + (Z[i1] - Z[i0]) * f;
  const ttx = TRK.tx[i0] + (TRK.tx[i1] - TRK.tx[i0]) * f, ttz = TRK.tz[i0] + (TRK.tz[i1] - TRK.tz[i0]) * f;
  q[2] = (i0 + f) * TRK.ds; q[3] = (x - px) * (-ttz) + (z - pz) * ttx; q[4] = i0; q[5] = f;
}
// interpolates an array per sample
function trkAt(arr, i0, f) { const i1 = (i0 + 1) % TRK.N; return arr[i0] + (arr[i1] - arr[i0]) * f; }
// world position of (s,d) → out[0..2] (x,y,z) ; out[3..4] tangent
function trackPos(s, d, out) {
  const N = TRK.N; let u = s / TRK.ds; u = ((u % N) + N) % N; const i0 = Math.floor(u), f = u - i0, i1 = (i0 + 1) % N;
  const tx = lerp(TRK.tx[i0], TRK.tx[i1], f), tz = lerp(TRK.tz[i0], TRK.tz[i1], f), l = Math.sqrt(tx * tx + tz * tz);
  const x = lerp(TRK.x[i0], TRK.x[i1], f), z = lerp(TRK.z[i0], TRK.z[i1], f);
  out[0] = x - tz / l * d; out[2] = z + tx / l * d; out[1] = trackSurfY(i0, f, d); out[3] = tx / l; out[4] = tz / l;
  return out;
}
// kerb profile: ramp with teeth; x = distance beyond the edge (0..KERB_W)
function kerbProfile(x) { return x <= 0 || x >= KERB_W ? 0 : 0.012 + 0.045 * Math.sin(Math.min(1, x / (KERB_W * 0.82)) * PI * 0.5) * (x > KERB_W * 0.82 ? (KERB_W - x) / (KERB_W * 0.18) : 1); }
// surface height of the strip (asphalt + kerb + shoulder) at (sample, lateral)
function trackSurfY(i0, f, d) {
  const y = trkAt(TRK.y, i0, f), b = trkAt(TRK.bank, i0, f), lim = TRK.hw + APRON;
  return y - clamp(d, -lim, lim) * b;
}
// ---------- terrain ----------
// natural relief (without the track): regional plane + undulations + surrounding hills
function naturalH(x, z) {
  const dx = x - TRK.cx, dz = z - TRK.cz, r = Math.hypot(dx, dz);
  const reg = (0.0443 * x + 0.0127 * z) * (1 - smooth(260, 700, r)) + 6 * smooth(260, 700, r);
  const und = (fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7, 4) - 0.5) * 16 * smooth(60, 320, r) + (fbm(x * 0.021, z * 0.021, 3) - 0.5) * 3.0;
  // hills: ridged crests growing with distance
  const rn = 1 - Math.abs(fbm(x * 0.0011 + 7.7, z * 0.0011 + 2.2, 5) * 2 - 1); const rn2 = fbm(x * 0.00042 - 4.0, z * 0.00042 + 9.0, 4);
  const hills = (rn * rn * 150 + rn2 * 120 - 40) * smooth(380, 1700, r) + (rn2 * rn2 * 520 + rn * 130) * smooth(2200, 5200, r);
  return reg + und + Math.max(-6, hills);
}
// terrain height with the track corridor embedded. Used to fill the height field and the terrain mesh.
const _th = new Float64Array(4);
function terrainH(x, z) {
  const nat = naturalH(x, z);
  const OUT = 78;
  if (trackFarDist(x, z) > OUT) return nat;
  trackLocate(x, z, -1, _th);
  const dmin = Math.abs(_th[1]);
  if (dmin > OUT) return nat;
  const gx = Math.floor((x - TRK.gridX0) / TRK.gridCell), gz = Math.floor((z - TRK.gridZ0) / TRK.gridCell), lst = TRK.cellList[gz * TRK.gridW + gx];
  // weighted average (soft minimum) of nearby track heights → no steps between neighboring sections
  const N = TRK.N, X = TRK.x, Z = TRK.z, tau = 5.5; let sw = 0, sh = 0;
  for (let q = 0; q < lst.length; q += 2) {
    const i = lst[q], ddx = x - X[i], ddz = z - Z[i]; const d = Math.sqrt(ddx * ddx + ddz * ddz); if (d > dmin + 26) continue;
    const lat = ddx * -TRK.tz[i] + ddz * TRK.tx[i], lim = TRK.hw + APRON;
    const h = TRK.y[i] - clamp(lat, -lim, lim) * TRK.bank[i] + TRK.slope[i] * (ddx * TRK.tx[i] + ddz * TRK.tz[i]);
    const w = Math.exp(-(d - dmin) / tau); sw += w; sh += w * h;
  }
  const soft = sh / sw, exact = trackSurfY(_th[2], _th[3], _th[1]);
  const hw = TRK.hw;
  let h = lerp(exact, soft, smooth(hw + 2, hw + 9, dmin));
  // slightly lowered gravel; natural relief comes in beyond the barriers
  const w = smooth(hw + 16, OUT, dmin);
  h = lerp(h, nat, w * w * (3 - 2 * w) * 0.999);
  // under the asphalt the terrain sits below the strip
  h -= 0.3 * (1 - smooth(hw + 0.2, hw + 2.2, dmin));
  return h;
}
// regular height field (1 m) around the circuit, for physics and object placement.
const HF = { x0: 0, z0: 0, w: 0, h: 0, d: null };
function heightFieldBuild() {
  const pad = 150; HF.x0 = Math.floor(TRK.bx0 - pad); HF.z0 = Math.floor(TRK.bz0 - pad);
  HF.w = Math.ceil(TRK.bx1 + pad) - HF.x0 + 1; HF.h = Math.ceil(TRK.bz1 + pad) - HF.z0 + 1;
  HF.d = new Float32Array(HF.w * HF.h);
  for (let j = 0; j < HF.h; j++) for (let i = 0; i < HF.w; i++) HF.d[j * HF.w + i] = terrainH(HF.x0 + i, HF.z0 + j);
}
function hfAt(x, z) {
  const fx = x - HF.x0, fz = z - HF.z0;
  if (fx < 0 || fz < 0 || fx >= HF.w - 1 || fz >= HF.h - 1) return terrainH(x, z);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * HF.w + i, d = HF.d;
  return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + HF.w] * (1 - u) + d[k + HF.w + 1] * u) * v;
}
// field height on the register: input q[0]=x, q[1]=z; output q[6]
function hfAtQ(q) {
  const fx = q[0] - HF.x0, fz = q[1] - HF.z0;
  if (fx < 0 || fz < 0 || fx >= HF.w - 1 || fz >= HF.h - 1) { q[6] = terrainH(q[0], q[1]); return; }
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HF.w + i, d = HF.d;
  q[6] = (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + HF.w] * (1 - u) + d[k + HF.w + 1] * u) * v;
}
// Surface zones
// zone from (index, fraction, d). Used by the generators; in the game loop use zoneAtQ.
const _zq = new Float64Array(12);
function zoneAt(i0, f, d) { _zq[3] = d; _zq[4] = i0; _zq[5] = f; return zoneAtQ(_zq); }
// zone from the register (q[3]=d, q[4]=index, q[5]=fraction); returns an integer. Takes no numbers as arguments.
function zoneAtQ(q) {
  const d = q[3], i0 = q[4] | 0, f = q[5], N = TRK.N, i1 = (i0 + 1) % N;
  const hw = TRK.hw, ad = d < 0 ? -d : d;
  if (ad <= hw) return ZONE.ASPHALT;
  const left = d < 0, ka = left ? TRK.kerbL : TRK.kerbR;
  if (ad <= hw + KERB_W && ka[i0] + (ka[i1] - ka[i0]) * f > 0.5) return ZONE.KERB;
  const s = (i0 + f) * TRK.ds, sr = s > TRK.L / 2 ? s - TRK.L : s, p = TRK.pit;
  if (!left && sr > p.s0 && sr < p.s1) {
    // pit lane, with tapering entries
    let e = (sr - p.s0) / 45; const e2 = (p.s1 - sr) / 45; if (e2 < e) e = e2; if (e > 1) e = 1;
    const d0 = hw + (p.laneD0 - hw) * e, d1 = hw + 4.5 + (p.laneD1 - hw - 4.5) * e;
    if (d >= d0 - 0.01 && d <= d1) return ZONE.PIT;
    if (d > d1 && d < p.padD1 && sr > p.bldS0 - 25 && sr < p.bldS1 + 25) return ZONE.CONCRETE;
  }
  if (left && sr > TRK.stand.s0 - 12 && sr < TRK.stand.s1 + 12 && d < -hw - 3.2 && d > TRK.stand.d1 - 8) return ZONE.CONCRETE;
  const ga = left ? TRK.gravL : TRK.gravR, g = ga[i0] + (ga[i1] - ga[i0]) * f;
  if (g > 1 && ad > hw + 2.4 && ad < hw + 2.4 + g) return ZONE.GRAVEL;
  const ba = left ? TRK.barL : TRK.barR, bar = ba[i0] + (ba[i1] - ba[i0]) * f;
  return ad < bar + 1.5 ? ZONE.GRASS : ZONE.ROUGH;
}
// forest density 0..1 at the world point (0 = no trees). Clearings around the track, pits and grandstand.
const _fz = new Float64Array(4);
function forestAt(x, z) {
  let m = 1;
  if (trackFarDist(x, z) < 90) {
    trackLocate(x, z, -1, _fz);
    const d = _fz[1], ad = Math.abs(d), i0 = _fz[2], f = _fz[3], bar = trkAt(d < 0 ? TRK.barL : TRK.barR, i0, f);
    const s = _fz[0], sr = s > TRK.L / 2 ? s - TRK.L : s;
    let clear = bar + 7;
    if (d > 0 && sr > TRK.pit.s0 - 30 && sr < TRK.pit.s1 + 30) clear = TRK.pit.padD1 + 10;
    if (d < 0 && sr > TRK.stand.s0 - 25 && sr < TRK.stand.s1 + 25) clear = -TRK.stand.d1 + 14;
    m = smooth(clear, clear + 16, ad);
  }
  // clearing around the TV camera towers (foliage must not block the lens)
  if (typeof WORLD !== 'undefined' && WORLD.tvCams) for (let i = 0; i < WORLD.tvCams.length; i++) { const c = WORLD.tvCams[i], dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz; if (d2 < 15 * 15) return 0; }
  // low-frequency natural clearings (more open inside the circuit)
  const n = fbm(x * 0.0085 + 11.3, z * 0.0085 - 5.2, 3);
  return m * smooth(0.36, 0.5, n + 0.16);
}
