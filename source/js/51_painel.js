// On-screen dashboard: speedometer, tachometer, gear, lap stopwatch, last and best lap, and performance statistics.
// It is three small 2D canvases overlaid on the game, only in the game opened by one person (GAME.ui). No allocation per frame:
// dials and labels are drawn once onto background canvases; each frame only has image copies (digits from an
// atlas) and two needles, always with integer arguments (the dial canvas has a 1/16 scale so the needles
// can move in fractional pixels), and only when the displayed value changed. No text is assembled in the loop.
const HUD = {
  cg: null, ct: null, cs: null, g: null, t: null, s: null, face: null, hub: null, bgT: null, bgS: null, A: null, B: null, C: null,
  L: new Int32Array(40), K: new Int32Array(12), acc: new Float64Array(4), stats: false, vis: false,
  V: new Int32Array(6),   // what the dashboard shows: km/h × 10, rpm, gear, current lap, last and best (hundredths of a second; -1 = no time)
};
const HCH = '0123456789:.,-R';
// digit atlas: each character centered in a cell; all digits have the same width (numbers don't "dance")
function hudAtlas(px) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 ' + px + 'px "Helvetica Neue",Helvetica,Arial,sans-serif', n = HCH.length, w = new Int32Array(n), x = new Int32Array(n);
  g.font = font; let dw = 0, X = 0; for (let i = 0; i < 10; i++) dw = Math.max(dw, Math.ceil(g.measureText(HCH[i]).width));
  for (let i = 0; i < n; i++) { const m = Math.ceil(g.measureText(HCH[i]).width); w[i] = (i < 10 || i > 12 ? Math.max(dw, m) : m) + 2; x[i] = X; X += w[i]; }
  c.width = X; c.height = Math.ceil(px * 1.16); g.font = font; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  for (let i = 0; i < n; i++) g.fillText(HCH[i], x[i] + w[i] / 2, px * 0.94);
  return { c, w, x, h: c.height };
}
function hudInit() {
  const H = HUD; H.cg = document.getElementById('hg'); H.ct = document.getElementById('ht'); H.cs = document.getElementById('hs');
  H.g = H.cg.getContext('2d'); H.t = H.ct.getContext('2d'); H.s = H.cs.getContext('2d');
  hudLayout(); addEventListener('resize', hudLayout);
}
// strip with fixed labels and gaps for the numbers; returns the background canvas and records in L[o + i] the x of each number
function hudStrip(cv, labels, widths, units, At, px, o) {
  const dpr = devicePixelRatio || 1, f = document.createElement('canvas'), g = f.getContext('2d'), font = '600 ' + Math.round(px * 0.62) + 'px "Helvetica Neue",Helvetica,Arial,sans-serif', pad = Math.round(px * 0.7), L = HUD.L;
  g.font = font; let X = pad; const xs = [];
  for (let i = 0; i < labels.length; i++) { const lw = g.measureText(labels[i]).width, uw = units[i] ? g.measureText(units[i]).width + px * 0.25 : 0; xs.push(X); L[o + i] = Math.round(X + lw + px * 0.4); X = L[o + i] + widths[i] + uw + pad * 1.3; }
  const W = Math.round(X - pad * 0.3), Hh = Math.round(px * 1.75); f.width = cv.width = W; f.height = cv.height = Hh; cv.style.width = W / dpr + 'px'; cv.style.height = Hh / dpr + 'px';
  g.fillStyle = 'rgba(9,11,14,.62)'; g.beginPath(); g.roundRect(0, 0, W, Hh, Hh * 0.3); g.fill();
  g.font = font; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(255,255,255,.62)';
  for (let i = 0; i < labels.length; i++) { g.fillText(labels[i], xs[i], Hh * 0.5 + px * 0.26); if (units[i]) g.fillText(units[i], L[o + i] + widths[i] + px * 0.25, Hh * 0.5 + px * 0.26); }
  L[o + 6] = Math.round((Hh - At.h) / 2); L[o + 7] = W; L[o + 8] = Hh;
  return f;
}
function hudLayout() {
  const H = HUD, L = H.L, dpr = devicePixelRatio || 1, r = Math.round(Math.min(Math.max(innerHeight * 0.105, 54), 124) * dpr), W = Math.round(r * 4.5), Hh = Math.round(r * 2.26);
  const A = H.A = hudAtlas(Math.round(r * 0.33)), B = H.B = hudAtlas(Math.round(r * 0.23)), C = H.C = hudAtlas(Math.round(r * 0.17));
  const c = H.cg; c.width = W; c.height = Hh; c.style.width = W / dpr + 'px'; c.style.height = Hh / dpr + 'px';
  const cx1 = Math.round(r * 1.12), cy = Math.round(r * 1.12), cx2 = W - cx1; L[0] = cx1; L[1] = cy; L[2] = cx2; L[3] = r; L[4] = W; L[5] = Hh;
  const fc = H.face = document.createElement('canvas'); fc.width = W; fc.height = Hh; const f = fc.getContext('2d');
  f.textAlign = 'center'; f.textBaseline = 'middle';
  const dial = (cx, max, step, minor, red0, unit) => {
    const ang = v => (145 + 250 * v / max) * PI / 180;
    f.beginPath(); f.arc(cx, cy, r, 0, TAU); f.fillStyle = 'rgba(9,11,14,.66)'; f.fill(); f.lineWidth = r * 0.02; f.strokeStyle = 'rgba(255,255,255,.3)'; f.stroke();
    if (red0) { f.beginPath(); f.arc(cx, cy, r * 0.9, ang(red0), ang(max)); f.lineWidth = r * 0.075; f.strokeStyle = '#d8351c'; f.stroke(); }
    f.fillStyle = '#fff'; f.font = '600 ' + Math.round(r * 0.135) + 'px "Helvetica Neue",Helvetica,Arial,sans-serif';
    for (let k = 0; k <= Math.round(max / minor); k++) {
      const v = k * minor, major = k % Math.round(step / minor) === 0, a = ang(v), co = Math.cos(a), si = Math.sin(a);
      f.beginPath(); f.moveTo(cx + co * r * 0.945, cy + si * r * 0.945); f.lineTo(cx + co * r * (major ? 0.8 : 0.87), cy + si * r * (major ? 0.8 : 0.87)); f.lineWidth = r * (major ? 0.028 : 0.014); f.strokeStyle = 'rgba(255,255,255,.9)'; f.stroke();
      if (major) f.fillText(String(v), cx + co * r * 0.64, cy + si * r * 0.64);
    }
    f.fillStyle = 'rgba(255,255,255,.6)'; f.font = '600 ' + Math.round(r * 0.115) + 'px "Helvetica Neue",Helvetica,Arial,sans-serif'; f.fillText(unit, cx, cy + r * 0.84);
  };
  dial(cx1, 200, 20, 10, 0, 'km/h'); dial(cx2, 7, 1, 0.5, 6.25, 'rpm × 1000');
  const hb = H.hub = document.createElement('canvas'), hr = Math.round(r * 0.085); hb.width = hb.height = hr * 2; const hg = hb.getContext('2d'); hg.beginPath(); hg.arc(hr, hr, hr, 0, TAU); hg.fillStyle = '#16181b'; hg.fill(); hg.lineWidth = hr * 0.25; hg.strokeStyle = '#ff5a36'; hg.stroke();
  L[6] = hr; L[7] = Math.round(cy + r * 0.3);                                   // hub radius; y of the large numbers
  const g = H.g; g.setTransform(1 / 16, 0, 0, 1 / 16, 0, 0); g.lineCap = 'round'; g.lineWidth = Math.round(r * 0.034 * 16); g.strokeStyle = '#ff5a36';
  // stopwatch (m:ss.cc) and statistics
  const tw = B.w[0] * 5 + B.w[10] + B.w[11];
  H.bgT = hudStrip(H.ct, ['LAP', 'LAST', 'BEST'], [tw, tw, tw], ['', '', ''], B, B.h / 1.16, 10);
  H.bgS = hudStrip(H.cs, ['FPS', 'FRAME', 'GPU'], [C.w[0] * 3, C.w[0] * 4 + C.w[12], C.w[0] * 4 + C.w[12]], ['', 'ms', 'ms'], C, C.h / 1.16, 20);
  H.K.fill(-9);
}
// copies character i from the atlas to (x, y) in pixels (q = 16 on the dial canvas, 1 on the others); returns the width
function hudCh(g, A, i, x, y, q) { const w = A.w[i]; g.drawImage(A.c, A.x[i], 0, w, A.h, x * q, y * q, w * q, A.h * q); return w; }
// integer v right-aligned in n cells, with no leading zeros
function hudInt(g, A, v, n, x, y, q) { const w = A.w[0]; for (let k = n - 1; k >= 0; k--) { hudCh(g, A, v % 10, x + k * w, y, q); v = (v / 10) | 0; if (v === 0) break; } }
// time in hundredths as m:ss.cc; negative = no time (-:--.--)
function hudTime(g, A, cs, x, y) {
  if (cs > 59999) cs = 59999;
  const no = cs < 0, m = (cs / 6000) | 0, s = ((cs / 100) | 0) % 60, c = cs % 100;
  x += hudCh(g, A, no ? 13 : m, x, y, 1); x += hudCh(g, A, 10, x, y, 1); x += hudCh(g, A, no ? 13 : (s / 10) | 0, x, y, 1); x += hudCh(g, A, no ? 13 : s % 10, x, y, 1);
  x += hudCh(g, A, 11, x, y, 1); x += hudCh(g, A, no ? 13 : (c / 10) | 0, x, y, 1); hudCh(g, A, no ? 13 : c % 10, x, y, 1);
}
// value with one decimal place (v10 = value × 10) as NN.N; negative = unavailable
function hudDec(g, A, v10, x, y) {
  const w = A.w[0]; if (v10 > 9999) v10 = 9999;
  if (v10 < 0) { hudCh(g, A, 13, x + w * 2, y, 1); hudCh(g, A, 13, x + w * 3 + A.w[12], y, 1); return; }
  hudInt(g, A, (v10 / 10) | 0, 3, x, y, 1); hudCh(g, A, 12, x + w * 3, y, 1); hudCh(g, A, v10 % 10, x + w * 3 + A.w[12], y, 1);
}
// called every game frame: reads the state (hudRead) and redraws only what changed (hudDraw)
function hudFrame() { hudRead(); hudDraw(); }
function hudRead() {
  const V = HUD.V, v = VEH; let kmh = GS.speed * 36; if (kmh > 2000) kmh = 2000; let rpm = v.rpm; if (rpm > 7000) rpm = 7000;
  V[0] = kmh; V[1] = rpm; V[2] = v.gear; V[3] = LAP[3] === 1 ? (v.time - LAP[0]) * 100 : 0; V[4] = LAP[1] > 0 ? LAP[1] * 100 : -1; V[5] = LAP[2] > 0 ? LAP[2] * 100 : -1;
}
function hudDraw() {
  const H = HUD, L = H.L, K = H.K, V = H.V, an = V[0], ki = ((an + 5) / 10) | 0, ar = (V[1] / 10) | 0, gear = V[2];
  if (ki !== K[0] || an !== K[1] || ar !== K[2] || gear !== K[3]) {
    K[0] = ki; K[1] = an; K[2] = ar; K[3] = gear;
    const g = H.g, A = H.A, r = L[3], cy = L[1], w = A.w[0];
    g.clearRect(0, 0, L[4] * 16, L[5] * 16); g.drawImage(H.face, 0, 0, L[4] * 16, L[5] * 16);
    hudInt(g, A, ki, 3, L[0] - ((w * 3) >> 1), L[7], 16); hudCh(g, A, gear === 0 ? 14 : gear, L[2] - (A.w[gear === 0 ? 14 : gear] >> 1), L[7], 16);
    g.beginPath();
    for (let d = 0; d < 2; d++) {
      const a = (145 + (d ? ar * (250 / 700) : an * (250 / 2000))) * 0.017453292519943295, co = Math.cos(a), si = Math.sin(a), cx = L[d * 2] * 16, cY = cy * 16, len = r * 16;
      g.moveTo((cx - co * len * 0.16) | 0, (cY - si * len * 0.16) | 0); g.lineTo((cx + co * len * 0.86) | 0, (cY + si * len * 0.86) | 0);
    }
    g.stroke();
    const hr = L[6]; g.drawImage(H.hub, (L[0] - hr) * 16, (cy - hr) * 16, hr * 32, hr * 32); g.drawImage(H.hub, (L[2] - hr) * 16, (cy - hr) * 16, hr * 32, hr * 32);
  }
  const cur = V[3], last = V[4], best = V[5];
  if (cur !== K[4] || last !== K[5] || best !== K[6]) {
    K[4] = cur; K[5] = last; K[6] = best; const t = H.t, B = H.B, y = L[16];
    t.clearRect(0, 0, L[17], L[18]); t.drawImage(H.bgT, 0, 0); hudTime(t, B, cur, L[10], y); hudTime(t, B, last, L[11], y); hudTime(t, B, best, L[12], y);
  }
}
// performance statistics (H key): half-second average of frames; RT[3] = last frame interval (ms)
function hudStatsFrame() {
  const H = HUD, a = H.acc; a[0] += RT[3]; a[1]++;
  if (a[0] < 500) return;
  const L = H.L, s = H.s, C = H.C, y = L[26], fps = (a[1] * 1000 / a[0] + 0.5) | 0, ms = (a[0] / a[1] * 10 + 0.5) | 0, gpu = PERF.on && PERF.live[0] > 0 ? (PERF.live[0] * 10 + 0.5) | 0 : -1;
  a[0] = 0; a[1] = 0;
  s.clearRect(0, 0, L[27], L[28]); s.drawImage(H.bgS, 0, 0); hudInt(s, C, fps > 999 ? 999 : fps, 3, L[20], y, 1); hudDec(s, C, ms, L[21], y); hudDec(s, C, gpu, L[22], y);
}
function hudShow(on) { HUD.vis = on; HUD.cg.style.display = HUD.ct.style.display = on ? 'block' : 'none'; HUD.K.fill(-9); }
function hudStats(on) { HUD.stats = on; HUD.cs.style.display = on ? 'block' : 'none'; HUD.acc[0] = 0; HUD.acc[1] = 0; if (on) { const L = HUD.L; HUD.s.clearRect(0, 0, L[27], L[28]); HUD.s.drawImage(HUD.bgS, 0, 0); } }
