// Initialization, main loop and capture API.
const msgEl = document.getElementById('msg');
const setMsg = t => { if (msgEl) msgEl.textContent = t; };
// test ground (asphalt with puddles) for the isolated viewing modes: ?scene=test, ?scene=car ...
function buildTestGround() {
  const fam = R.families.test || mkFamily('test', { src: 'mat_test' });
  const set = new MeshSet(fam); R.drawables.push(set);
  const mb = new MeshBuilder(); mb.mat(4).color(0.2, 0.2, 0.2); mb.quad(-300, 0, 300, 300, 0, 300, 300, 0, -300, -300, 0, -300);
  set.add(mb.upload(), 0, 7); return set;
}
// temporary world (height field colored by zone) for testing vegetation/signage in isolation: used when there is no real scenery
function buildPlaceholderWorld() {
  const fam = R.families.test || mkFamily('test', { src: 'mat_test' });
  const set = new MeshSet(fam); R.drawables.push(set);
  const st = 2, w = Math.floor((HF.w - 1) / st), h = Math.floor((HF.h - 1) / st), loc = new Float64Array(4);
  const cols = [[0.05, 0.05, 0.055], [0.5, 0.1, 0.1], [0.105, 0.165, 0.042], [0.34, 0.3, 0.24], [0.08, 0.12, 0.035], [0.07, 0.07, 0.075], [0.3, 0.3, 0.3]];
  const mb = new MeshBuilder(1 << 18); mb.mat(5);
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) {
    const x = HF.x0 + i * st, z = HF.z0 + j * st, y = hfAt(x, z);
    const nx = hfAt(x - 1, z) - hfAt(x + 1, z), nz = hfAt(x, z - 1) - hfAt(x, z + 1);
    let c = cols[4]; if (trackFarDist(x, z) < 70) { trackLocate(x, z, -1, loc); c = cols[zoneAt(loc[2], loc[3], loc[1])]; }
    mb.color(c[0], c[1], c[2]); mb.v(x, y + (c === cols[0] ? 0.3 : 0), z, nx, 2, nz, x, z);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = j * (w + 1) + i; mb.quadI(a, a + w + 1, a + w + 2, a + 1); }
  set.add(mb.upload(), 0, 7);
}
function buildTestScene() {
  const set = buildTestGround();
  const mb = new MeshBuilder();
  const gl = new GlassSet(); R.transparents.push(gl);
  const g = new MeshBuilder(); g.mat(0).color(0.75, 0.9, 0.85); g.quad(-1, 0, 4, 1, 0, 4, 1, 1.5, 4, -1, 1.5, 4); gl.add_(g.upload(), 0);
  mb.mat(0).color(0.7, 0.2, 0.15); mb.box(0, 0.5, 0, 1, 1, 1);
  mb.mat(2).color(0.35, 0.55, 0.75); mb.rbox(2.5, 0.6, 0, 1.6, 1.2, 1.2, 0.3, 6);
  mb.mat(1).color(0.9, 0.9, 0.92); mb.cyl(-2.5, 0, 0, 0.5, 1.6, 0.3, 32, true, true);
  mb.mat(0).color(0.8, 0.8, 0.8); mb.tube([[-4, 0.2, 2], [-2, 1.2, 2.5], [0, 0.4, 3], [2, 1.5, 2.5], [4, 0.3, 2]], 0.06, 12);
  mb.mat(0).color(0.3, 0.6, 0.2); for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 8 + i * 1.5; mb.cyl(Math.cos(a) * r, 0, Math.sin(a) * r, 0.3, 6 + (i % 5), 0.2, 10, false, true); }
  mb.mat(3).color(1, 0.2, 0.1); mb.box(0, 1.2, 0, 0.3, 0.3, 0.3);
  set.add(mb.upload(), 0, 7);
}
async function main() {
  try {
    await gpuInit();
    setMsg('generating track…'); await new Promise(r => setTimeout(r));
    trackBuild(); heightFieldBuild(); worldMapBuild(); aiBuild();   // aiBuild defines TRK.line (trajectory) before the scene constructors
    rendererInit();
    setMsg('generating sky…'); await skyInit();
    setMsg('generating scenery…'); await new Promise(r => setTimeout(r));
    if (GAME.mode === 'test') buildTestScene();
    if (GAME.mode === 'placeholder') { buildPlaceholderWorld(); GAME.init = () => { const p = trackPos(40, 0, new Float64Array(5)); setCamera(p[0] - 12, p[1] + 3, p[2] + 4, p[0] + 30, p[1] + 1, p[2], 0.9); R.cube.pos.set([p[0], p[1] + 1.2, p[2]]); }; }
    for (const b of BUILD) await b();
    await Promise.all(R.pending);
    if (G.lastErr) throw new Error(G.lastErr);
    perfInit();
    renderStaticShadow();
    if (GAME.init) GAME.init();
    else { setCamera(6, 2.2, 7, 0, 0.6, 0, 0.9); R.cube.pos.set([0, 1.2, 0]); }
    // warms up the environment cubemap and computes ambient light (SH) from it; two rounds to include the bounce
    for (let k = 0; k < 2; k++) { for (let i = 0; i < 6; i++) renderFrame(); await computeSH(); }
    if (GAME.prewarm) {
      const worst = await GAME.prewarm(); await computeSH();
      // Cadence: at 120 Hz only 8.3 ms remain per frame. If the heaviest view doesn't fit with headroom, frames queue up
      // on the GPU and frame time fluctuates; in that case the game runs steadily at 60 frames per second (one frame every two
      // of the 120 Hz monitor). ?hz=120 or ?hz=60 forces the choice.
      GAME.gpuWorstMs = worst; GAME.minFrameMs = Q.get('hz') === '120' ? 0 : (Q.get('hz') === '60' || worst > 6.2) ? 14.6 : 0;
    }
    for (let i = 0; i < 8; i++) renderFrame();
    R.cam.first = true;
    setMsg(''); const hint = document.getElementById('hint'); if (hint) setTimeout(() => { hint.style.opacity = 0; }, 9000);
    if (GAME.ui) uiInit();
    GAME.ready = true;
    if (!GAME.capture) requestAnimationFrame(rafLoop);
  } catch (e) { setMsg('error: ' + e.message); console.error(e); GAME.error = e.message; }
}
let _lastT = 0;
function rafLoop(t) {
  if (GAME.minFrameMs > 0 && _lastT && t - _lastT < GAME.minFrameMs) { requestAnimationFrame(rafLoop); return; }   // 60 Hz cadence on a faster monitor
  if (GAME.ui && uiFrame()) { _lastT = 0; requestAnimationFrame(rafLoop); return; }   // menu open: the game and sound are stopped and nothing is rendered
  let dt = _lastT ? (t - _lastT) / 1000 : 1 / 60; RT[3] = dt * 1000; if (dt > 0.05) dt = 0.05; _lastT = t;
  if (PERF.rec) perfFrameTimes(t);
  RT[2] = dt;
  if (GAME.tick) GAME.tick(false); else { RT[1] = dt; RT[0] += dt; }
  renderFrame();
  if (GAME.ui) uiAfter();
  if (PERF.rec) perfJsTime();
  requestAnimationFrame(rafLoop);
}
// --- capture API (used by the scripts in work/) ---
let _cap2d = null;
window.__cap = {
  ready: () => GAME.ready, error: () => GAME.error || G.lastErr || null,
  cam(ex, ey, ez, tx, ty, tz, fov) { if (typeof GS !== 'undefined') { GS.freeCam = true; GS.cut = true; } setCamera(ex, ey, ez, tx, ty, tz, fov); },
  // advances n frames with a fixed step and renders each one
  frames(n, dt) {
    dt = dt || 1 / 60; RT[2] = dt;
    for (let i = 0; i < n; i++) {
      if (GAME.ui && uiFrame()) continue;   // with ?ui=1&cap=1 (tests): the same game loop, at a fixed step — an open menu does not simulate
      RT[3] = dt * 1000; if (GAME.tick) GAME.tick(true); else { RT[1] = dt; RT[0] += dt; } if (!this.noRender) renderFrame();
      if (GAME.ui) uiAfter();
    }
    if (this.noRender) return;
    // copies the frame to a 2D canvas in the same task (WebGPU canvas content disappears after presentation)
    if (!_cap2d) { _cap2d = document.createElement('canvas'); _cap2d.width = G.W; _cap2d.height = G.H; }
    _cap2d.getContext('2d').drawImage(G.canvas, 0, 0);
  },
  shot(type, q) { return _cap2d.toDataURL(type || 'image/png', q); },
  // applies pose i and leaves the frame ready for shot()
  pose(i) { poseApply(i); if (!_cap2d) { _cap2d = document.createElement('canvas'); _cap2d.width = G.W; _cap2d.height = G.H; } _cap2d.getContext('2d').drawImage(G.canvas, 0, 0); return POSES[i].nome; },
  poses() { return POSES.map(p => p.nome); },
  // frame-interval-only measurement (no GPU timing queries): used to compare with/without 'timestamp-query'
  rafLog(n) { const a = new Float32Array(n); let i = 0, last = 0; const f = t => { if (last) a[i++] = t - last; last = t; if (i < n) requestAnimationFrame(f); else window.__rafLog = Array.from(a); }; requestAnimationFrame(f); },
  perfStart() { perfStart(); }, perfReport() { return perfReport(); }, restart() { gameRestart(); },
  // view from each TV camera toward the point on the track 35 m before it (line-of-sight check)
  tvView(i) { const o = i * 4, p = trackPos(GS.tvData[o] - 30, 0, new Float64Array(5)); GS.freeCam = true; GS.frozen = true; GS.cut = true; setCamera(GS.tvData[o + 1], GS.tvData[o + 2], GS.tvData[o + 3], p[0], p[1] + 0.8, p[2], 0.5); return GS.tvN; },
  cadencia() { return { piorVistaMs: GAME.gpuWorstMs, minFrameMs: GAME.minFrameMs, hz: GAME.minFrameMs > 0 ? 60 : 'monitor' }; },
  // game state for tests
  // --- sound: records the 16 controls every 1/60 s frame and synthesizes the track offline, from the same simulation
  somGravar(n) { SND.rec = new Int32Array(n * 16); SND.recN = 0; },
  somVolta(n) { this.somGravar(n); GS.frozen = false; GS.freeCam = false; GS.replayOn = true; gameRestart(); RT[2] = 1 / 60; for (let i = 0; i < n; i++) GAME.tick(true); return SND.recN; },
  somRender(mix, mudoDe, pausaDe) { return sndOffline(mix === undefined ? 63 : mix, mudoDe === undefined ? -1 : mudoDe, pausaDe === undefined ? -1 : pausaDe); },
  somPcm(i0, n) { const u = new Uint8Array(SND.pcm.buffer, i0 * 2, Math.min(n, SND.pcm.length - i0) * 2); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); },
  somCtl() { return Array.from(SND.rec.subarray(0, SND.recN * 16)); },
  // real-time sound peak level (for tests only: connects an analyzer to the synthesizer output)
  somNivel() { if (!SND.node) return null; if (!SND.an) { SND.an = SND.ctx.createAnalyser(); SND.an.fftSize = 2048; SND.node.connect(SND.an); SND.anBuf = new Float32Array(2048); } SND.an.getFloatTimeDomainData(SND.anBuf); let p = 0; for (const v of SND.anBuf) p = Math.max(p, Math.abs(v)); return p; },
  // interface state for tests
  ui() { return { ligada: GAME.ui, estado: GAME.ui ? Object.keys(ST)[UI.st] : null, menu: GAME.ui && UI.el.style.display !== 'none', painel: HUD.vis, stats: HUD.stats, mudo: SND.mute, som: SND.ctx ? SND.ctx.state : 'none', somOk: SND.ok, somVia: SND.P ? 'AudioWorklet' : SND.node ? 'ScriptProcessor' : null, tempoAudio: SND.ctx ? SND.ctx.currentTime : 0, pose: UI.pose, bench: UI.bench, pad: UI.padN, replay: GS.replayOn, gpuTempo: G.hasTS, perfOn: PERF.on, gpuVivo: PERF.live[0] }; },
  state() { const V = VEH; return { rpm: V.rpm, thr: V.ctl[0], brk: V.ctl[1], keys: GS.keys, volta: LAP[3] === 1 ? V.time - LAP[0] : 0, ultima: LAP[1], melhor: LAP[2], voltas: V.laps, tempo: V.time, camPos: Array.from(R.cam.pos), camFwd: Array.from(R.cam.fwd), x: V.x, z: V.z, y: V.y, yaw: V.yaw, speed: Math.hypot(V.vx, V.vy), vx: V.vx, steer: V.steer, s: V.s, d: V.d, gear: V.gear, cam: GS.cam, lapS: V.lapS, off: V.offCount, hits: V.hits, tick: GS.tick60, zone: V.zone, brake: objParams(carObj().slotBody)[0], slip: Array.from(V.slip), particles: FX.pAlive, roll: V.roll, pitch: V.pitch, spin: V.spin[0] }; },
  dbg(name, scale, alpha) { setDebugView(name, scale, alpha); },
  R, G, GAME, TRK, GS, VEH, FX, RT, renderFrame, SND, HUD, UI, PERF, LAP,
};
main();
