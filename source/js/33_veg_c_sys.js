// Vegetation — instance distribution, impostors baked at startup and drawing (mesh near, impostor far).
const VEG = {
  on: true, onMesh: true, onLeaf: true, onImp: true, onShadow: true, onGrass: true, onCube: true,
  CELL: 64, SUP: 256, NC: 52, NS: 13, x0: 0, z0: 0, n: 0, nTrees: 0,
  inst: null, cellStart: null, cellCount: null, cellY: null, supStart: null, supCount: null, supY: null,
  meshes: [], leafMeshes: [], dims: new Float32Array(48), zoom: 1, stats: { meshDraws: 0, impDraws: 0, meshInst: 0, meshTris: 0, leafDraws: 0, leafInst: 0, leafTris: 0 },
};
const VEG_INST = { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 5, offset: 0, format: 'float32x4' }, { shaderLocation: 6, offset: 16, format: 'float32x4' }] };

function vegPlace() {
  const rnd = mkRng(4711), V = VEG, half = V.NC * V.CELL / 2; V.x0 = TRK.cx - half; V.z0 = TRK.cz - half;
  let cap = 1 << 17, data = new Float32Array(cap * 8), keys = new Uint32Array(cap), n = 0;
  const push = (x, y, z, s, rot, seed, arch) => {
    const cx = Math.floor((x - V.x0) / V.CELL), cz = Math.floor((z - V.z0) / V.CELL); if (cx < 0 || cz < 0 || cx >= V.NC || cz >= V.NC) return;
    if (n >= cap) { cap *= 2; const d2 = new Float32Array(cap * 8); d2.set(data); data = d2; const k2 = new Uint32Array(cap); k2.set(keys); keys = k2; }
    const o = n * 8; data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = s; data[o + 4] = Math.cos(rot); data[o + 5] = Math.sin(rot); data[o + 6] = seed; data[o + 7] = arch;
    const s16 = (Math.floor((z - V.z0) / 16) & 3) * 4 + (Math.floor((x - V.x0) / 16) & 3);   // 16 m subcell inside the cell (individual leaves)
    keys[n++] = ((((cz >> 2) * V.NS + (cx >> 2)) * 16 + (cz & 3) * 4 + (cx & 3)) * VEG_NA + arch) * 16 + s16;
  };
  // TV cameras (telephoto lens): no crowns near the tower or along the sight lines between the camera and the stretch of track
  // it covers (from 160 m before to 60 m after the tower) — otherwise a sapling 25 m away hides the whole car.
  const tv = [];
  if (typeof WORLD !== 'undefined' && WORLD.tvCams) for (const c of WORLD.tvCams) {
    const t = { x: c.x, z: c.z, pts: [] }, q = new Float64Array(5);
    for (let ds = -160; ds <= 60; ds += 8) { trackPos(c.s + ds, 0, q); t.pts.push(q[0], q[2]); }
    tv.push(t);
  }
  const nearTV = (x, z, r, rl) => {
    for (const c of tv) {
      const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz; if (d2 > 215 * 215) continue; if (d2 < r * r) return true;
      for (let k = 0; k < c.pts.length; k += 2) {
        const ex = c.pts[k] - c.x, ez = c.pts[k + 1] - c.z, l2 = ex * ex + ez * ez, t = clamp((dx * ex + dz * ez) / l2, 0, 1), px = dx - ex * t, pz = dz - ez * t;
        if (px * px + pz * pz < rl * rl) return true;
      }
    }
    return false;
  };
  const loc0 = new Float64Array(4);
  const inHF = (x, z) => x > HF.x0 + 1 && z > HF.z0 + 1 && x < HF.x0 + HF.w - 2 && z < HF.z0 + HF.h - 2;
  // trees: jittered grid; density from the forest; sparser and larger in the distance
  const g = 5.6 * QUALITY.vegStep, ng = Math.floor(2 * half / g);
  for (let gz = 0; gz < ng; gz++) for (let gx = 0; gx < ng; gx++) {
    const x = V.x0 + (gx + rnd()) * g, z = V.z0 + (gz + rnd()) * g, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd();
    const dc = Math.hypot(x - TRK.cx, z - TRK.cz); if (dc > half - 30) continue;
    const far = smooth(600, 1450, dc); if (r1 > lerp(0.92, 0.36, far)) continue;
    const f = forestAt(x, z); if (f < 0.03 || r2 > f * 1.15) continue;
    const pn = vnoise(x * 0.017 + 5.1, z * 0.017 - 2.3), edge = 1 - smooth(0.35, 0.9, f);
    // weights: 0 large, 1 medium, 2 tall, 3 palm, 4 sapling
    // (at the forest edge species mix: none exceeds ~1/3 — before, saplings dominated and the edge read as a uniform wall)
    const w0 = 0.2 * (1 - edge * 0.35) + far * 0.2, w1 = 0.3, w2 = 0.16 + edge * 0.06 + far * 0.1, w3 = (0.06 + 0.3 * smooth(0.62, 0.8, pn) + edge * 0.05) * (1 - far), w4 = (0.24 + edge * 0.12) * (1 - far);   // more saplings (mid-height crowns): they close the gap between the undergrowth and the tall crowns
    let q = r3 * (w0 + w1 + w2 + w3 + w4), arch = 0; if ((q -= w0) > 0) { arch = 1; if ((q -= w1) > 0) { arch = 2; if ((q -= w2) > 0) { arch = 3; if ((q -= w3) > 0) arch = 4; } } }
    if (dc < 700 && nearTV(x, z, 22, arch < 3 ? 6.5 : 4)) continue;
    const y = (inHF(x, z) ? hfAt(x, z) : terrainH(x, z)) - lerp(0.25, 1.6, far);
    push(x, y, z, lerp(0.68, 1.38, r4 * r4 * (3 - 2 * r4)) * (1 + far * 0.3), r5 * TAU, rnd(), arch);
  }
  // large shrubs and saplings (archetype 5, with impostor): fill the undergrowth, the forest edge and slopes/clearings,
  // so the hills seen from the track (and through the TV cameras' telephoto lenses) don't look like a smooth lawn
  const gb = 3.3 * QUALITY.vegStep, nb = Math.floor(2 * half / gb);
  for (let gz = 0; gz < nb; gz++) for (let gx = 0; gx < nb; gx++) {
    const x = V.x0 + (gx + rnd()) * gb, z = V.z0 + (gz + rnd()) * gb, r1 = rnd(), r2 = rnd(), r3 = rnd();
    const dc = Math.hypot(x - TRK.cx, z - TRK.cz); if (dc > 780) continue;
    const td = trackFarDist(x, z);
    let p;
    if (td < 60) {
      trackLocate(x, z, -1, loc0); const d = loc0[1], ad = Math.abs(d), bar = trkAt(d < 0 ? TRK.barL : TRK.barR, loc0[2], loc0[3]);
      if (ad < bar + 4.5) continue; const zn = zoneAt(loc0[2], loc0[3], d); if (zn !== ZONE.ROUGH && zn !== ZONE.GRASS) continue;
      // clear strip beside the pits/stands (forestAt already zeroes it there): no stray shrubs in the paddock
      const sr = loc0[0] > TRK.L / 2 ? loc0[0] - TRK.L : loc0[0];
      if ((d > 0 && sr > TRK.pit.s0 - 30 && sr < TRK.pit.s1 + 30 && ad < TRK.pit.padD1 + 8) || (d < 0 && sr > TRK.stand.s0 - 25 && sr < TRK.stand.s1 + 25 && ad < -TRK.stand.d1 + 12)) continue;
    }
    const f = forestAt(x, z), pn = vnoise(x * 0.045 + 9.1, z * 0.045 + 4.4);
    // slopes and open clearings: clumps and saplings in patches (the hill seen through a telephoto lens isn't a smooth lawn)
    p = 0.46 * smooth(0.18, 0.62, pn) * (1 - smooth(0.05, 0.3, f)) + 0.5 * smooth(0.02, 0.3, f) * (1 - 0.3 * smooth(0.5, 1, f)) + 0.16 * f;
    if (r1 > p * (1 - 0.5 * smooth(450, 780, dc))) continue;
    if (dc < 700 && nearTV(x, z, 16, 2.6)) continue;
    const y = (inHF(x, z) ? hfAt(x, z) : terrainH(x, z)) - 0.12;
    push(x, y, z, lerp(0.5, 1.4 + 0.6 * smooth(0.3, 0.9, f), Math.pow(r2, 1.6)), r3 * TAU, rnd(), 5);   // inside the forest, taller saplings
  }
  V.nTrees = n;
  // undergrowth near the circuit (only seen up close): shrubs at the forest edge, ferns inside, grass tufts in the rough
  const loc = new Float64Array(4), gu = 1.9 * QUALITY.vegStep;
  for (let z0 = HF.z0 + 2; z0 < HF.z0 + HF.h - 3; z0 += gu) for (let x0 = HF.x0 + 2; x0 < HF.x0 + HF.w - 3; x0 += gu) {
    const x = x0 + rnd() * gu, z = z0 + rnd() * gu, r1 = rnd(), r2 = rnd(), r3 = rnd();
    if (trackFarDist(x, z) > 100) continue;
    trackLocate(x, z, -1, loc); const d = loc[1], ad = Math.abs(d), bar = trkAt(d < 0 ? TRK.barL : TRK.barR, loc[2], loc[3]);
    if (ad < bar + 2.2 || ad > 105) continue;
    const zn = zoneAt(loc[2], loc[3], d); if (zn !== ZONE.GRASS && zn !== ZONE.ROUGH) continue;
    if (nearTV(x, z, 9, 0.0)) continue;
    const f = forestAt(x, z), y = hfAt(x, z) - 0.04;
    const pB = 0.5 * smooth(0.02, 0.3, f) * (1 - 0.5 * smooth(0.6, 1, f)), pF = 0.36 * smooth(0.3, 0.9, f), pC = 0.08 + 0.2 * smooth(0.0, 0.15, f) * (1 - smooth(0.3, 0.6, f));
    if (r1 < pB) push(x, y, z, lerp(0.6, 1.35, r2), r3 * TAU, rnd(), 6);
    else if (r1 < pB + pF) push(x, y, z, lerp(0.7, 1.3, r2), r3 * TAU, rnd(), 7);
    else if (r1 < pB + pF + pC) push(x, y, z, lerp(0.6, 1.15, r2), r3 * TAU, rnd(), 8);
  }
  // sort by supercell → cell → archetype
  const srt = new Float64Array(n), idx = new Uint32Array(n);   // native sort: key * 2^20 + index
  for (let i = 0; i < n; i++) srt[i] = keys[i] * 1048576 + i;
  srt.sort(); for (let i = 0; i < n; i++) idx[i] = srt[i] % 1048576;
  const inst = V.inst = new Float32Array(n * 8); V.n = n;
  const nCell = V.NC * V.NC, nSup = V.NS * V.NS;
  V.subStart = new Uint32Array(nCell * VEG_NA * 16); V.subCount = new Uint16Array(nCell * VEG_NA * 16);
  V.cellStart = new Uint32Array(nCell * VEG_NA); V.cellCount = new Uint32Array(nCell * VEG_NA); V.cellY = new Float32Array(nCell); const cn = new Uint32Array(nCell);
  V.supStart = new Uint32Array(nSup); V.supCount = new Uint32Array(nSup); V.supY = new Float32Array(nSup);
  for (let i = 0; i < n; i++) {
    const s = idx[i]; inst.set(data.subarray(s * 8, s * 8 + 8), i * 8);
    const k = keys[s] >>> 4, s16 = keys[s] & 15, arch = k % VEG_NA, cs = Math.floor(k / VEG_NA), sup = cs >> 4, sub = cs & 15;
    const cx = (sup % V.NS) * 4 + (sub & 3), cz = Math.floor(sup / V.NS) * 4 + (sub >> 2), c = cz * V.NC + cx;
    if (!V.cellCount[c * VEG_NA + arch]) V.cellStart[c * VEG_NA + arch] = i; V.cellCount[c * VEG_NA + arch]++;
    const sq = (c * VEG_NA + arch) * 16 + s16; if (!V.subCount[sq]) V.subStart[sq] = i; V.subCount[sq]++;
    if (!V.supCount[sup]) V.supStart[sup] = i; V.supCount[sup]++;
    V.cellY[c] += data[s * 8 + 1]; cn[c]++; V.supY[sup] += data[s * 8 + 1];
  }
  for (let c = 0; c < nCell; c++) if (cn[c]) V.cellY[c] /= cn[c];
  for (let s = 0; s < nSup; s++) if (V.supCount[s]) V.supY[s] /= V.supCount[s];
  V.instBuf = mkBuf(inst.byteLength, BU.V, inst);
  // copy of the trees sorted from the sun outward (by supercell), only for the cards in the shadow passes:
  // with a low sun the crowns stack up in light space; drawing front to back lets the depth test discard the rest
  const sx = R.sun[0], sz = R.sun[2], sup = new Uint32Array(n), s2 = new Float64Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (inst[i * 8 + 7] >= VEG_NT) continue; const cx = Math.floor((inst[i * 8] - V.x0) / V.SUP), cz = Math.floor((inst[i * 8 + 2] - V.z0) / V.SUP); sup[i] = cz * V.NS + cx;
    const dq = clamp(Math.round(32768 - (inst[i * 8] * sx + inst[i * 8 + 2] * sz) * 8), 0, 65535);   // greater depth for sun-first order
    s2[m++] = (sup[i] * 65536 + dq) * 1048576 + i;
  }
  const ss = s2.subarray(0, m); ss.sort(); const ids = new Uint32Array(m); for (let i = 0; i < m; i++) ids[i] = ss[i] % 1048576;
  const inst2 = new Float32Array(m * 8); V.sunStart = new Uint32Array(nSup); V.sunCount = new Uint32Array(nSup);
  for (let i = 0; i < m; i++) { const q = ids[i]; inst2.set(inst.subarray(q * 8, q * 8 + 8), i * 8); const sp = sup[q]; if (!V.sunCount[sp]) V.sunStart[sp] = i; V.sunCount[sp]++; }
  V.instSunBuf = mkBuf(inst2.byteLength, BU.V, inst2);
  // supercells in sun order
  V.sunOrder = new Uint16Array(nSup); for (let i = 0; i < nSup; i++) V.sunOrder[i] = i;
  V.sunOrder.sort((a, b) => ((b % V.NS) * sx + Math.floor(b / V.NS) * sz) - ((a % V.NS) * sx + Math.floor(a / V.NS) * sz));
}

function vegBakeImpostors(cpu) {
  const dev = G.dev, S = 512, layers = VEG_NT * 8, V = VEG;
  const mips = 8;
  V.texA = dev.createTexture({ size: [S, S, layers], format: 'rgba8unorm-srgb', usage: TU.RT | TU.TB, mipLevelCount: mips });
  V.texN = dev.createTexture({ size: [S, S, layers], format: 'rgba8unorm', usage: TU.RT | TU.TB, mipLevelCount: mips });
  const msA = dev.createTexture({ size: [S, S], format: 'rgba8unorm-srgb', usage: TU.RT, sampleCount: 4 }), msN = dev.createTexture({ size: [S, S], format: 'rgba8unorm', usage: TU.RT, sampleCount: 4 });
  const msD = dev.createTexture({ size: [S, S], format: 'depth32float', usage: TU.RT, sampleCount: 4 });
  const code = wgslPP('veg_bake', SH_DEFS), mod = mkShader('veg_bake', SH_DEFS), bgls = reflectBGLs(code);
  const pipe = dev.createRenderPipeline({
    layout: dev.createPipelineLayout({ bindGroupLayouts: bgls }), vertex: { module: mod, entryPoint: 'vs', buffers: [VLAYOUT] },
    fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }, { format: 'rgba8unorm' }] },
    primitive: { cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: 4, alphaToCoverageEnabled: true },
  });
  const ub = new Float32Array(layers * 64), view = m4(), proj = m4(), vp = m4(), el = 8 * PI / 180;
  for (let a = 0; a < VEG_NA; a++) {
    const f = cpu[a].f32; let r = 0, h = 0; for (let i = 0; i < cpu[a].nv; i++) { r = Math.max(r, Math.hypot(f[i * 9], f[i * 9 + 2])); h = Math.max(h, f[i * 9 + 1]); }
    V.dims[a * 4] = r * 1.03; V.dims[a * 4 + 1] = h * 1.03;
  }
  for (let a = 0; a < VEG_NT; a++) for (let k = 0; k < 8; k++) {
    const th = k * PI / 4, R = V.dims[a * 4], H = V.dims[a * 4 + 1], cy = H / 2, D = 100;
    m4lookAt(view, Math.cos(el) * Math.cos(th) * D, cy + Math.sin(el) * D, Math.cos(el) * Math.sin(th) * D, 0, cy, 0, 0, 1, 0);
    m4ortho(proj, -R, R, -H / 2, H / 2, D - 40, D + 40); m4mul(vp, proj, view); ub.set(vp, (a * 8 + k) * 64);
  }
  const ubuf = mkBuf(ub.byteLength, BU.U, ub);
  const bg = dev.createBindGroup({ layout: bgls[0], entries: [{ binding: 0, resource: { buffer: ubuf, size: 64 } }, { binding: 1, resource: V.leafView }, { binding: 2, resource: V.sLeaf }, { binding: 3, resource: R.view.noise }] });
  const enc = dev.createCommandEncoder();
  for (let a = 0; a < VEG_NT; a++) for (let k = 0; k < 8; k++) {
    const L = a * 8 + k, lv = t => t.createView({ dimension: '2d', baseArrayLayer: L, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 });
    const p = enc.beginRenderPass({
      colorAttachments: [{ view: msA.createView(), resolveTarget: lv(V.texA), loadOp: 'clear', storeOp: 'discard', clearValue: { r: 0.05, g: 0.1, b: 0.03, a: 0 } },
      { view: msN.createView(), resolveTarget: lv(V.texN), loadOp: 'clear', storeOp: 'discard', clearValue: { r: 0.5, g: 0.85, b: 0.5, a: 1 } }],
      depthStencilAttachment: { view: msD.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
    });
    p.setPipeline(pipe); p.setBindGroup(0, bg, [L * 256]); p.setVertexBuffer(0, V.meshes[a].vb); p.setIndexBuffer(V.meshes[a].ib, 'uint32'); p.drawIndexed(V.meshes[a].count); p.end();
  }
  dev.queue.submit([enc.finish()]);
  genMips(V.texA, 'rgba8unorm-srgb', layers); genMips(V.texN, 'rgba8unorm', layers);
  msA.destroy(); msN.destroy(); msD.destroy();
}

const vegDrawable = {
  draw(pass, ctx) {
    const V = VEG; if (!V.on || !V.n) return;
    const kind = ctx.kind, shadow = kind === KIND.SHADOW; if (shadow && !V.onShadow) return; if (kind === KIND.CUBE && !V.onCube) return;
    const camx = R.cam.pos[0], camz = R.cam.pos[2], NA = VEG_NA, NC = V.NC, CELL = V.CELL, st = V.stats;
    if (kind === KIND.GBUF) { st.meshDraws = 0; st.impDraws = 0; st.meshInst = 0; st.meshTris = 0; st.leafDraws = 0; st.leafInst = 0; st.leafTris = 0; }
    // screen-size LOD: with a telephoto lens (TV camera) the switch distances grow in proportion to the zoom
    let zoom = Math.tan(R.cam.fovy * 0.5) * 2; zoom = zoom < 0.3 ? 0.3 : zoom > 1.25 ? 1.25 : zoom; V.zoom = zoom;
    // --- meshes (near) ---
    const pm = V.famTree.pipe[kind];
    if (pm && V.onMesh && (kind === KIND.GBUF || (shadow && ctx.cascade < 2))) {
      pass.setPipeline(pm); pass.setBindGroup(3, V.bgTree); pass.setVertexBuffer(1, V.instBuf);
      const ccx = Math.floor((camx - V.x0) / CELL), ccz = Math.floor((camz - V.z0) / CELL);
      // in shadows only the casters near the cascade matter: shorter range (fewer vertices processed)
      let rng = (shadow ? 96 : 114) / zoom; if (rng > 620) rng = 620; const rc = ((rng / CELL) | 0) + 1, rng2 = rng * rng;
      for (let a = 0; a < NA; a++) {
        let set = false; const ur = 82 / zoom, m = V.meshes[a], ru = a >= VEG_NT ? (ur < 620 ? ur : 620) : rng, ru2 = ru * ru;
        for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
          const cx = ccx + dx, cz = ccz + dz; if (cx < 0 || cz < 0 || cx >= NC || cz >= NC) continue;
          const c = cz * NC + cx, cnt = V.cellCount[c * NA + a]; if (!cnt) continue;
          const mx = V.x0 + cx * CELL, mz = V.z0 + cz * CELL;
          const ex = camx < mx ? mx - camx : camx > mx + CELL ? camx - mx - CELL : 0, ez = camz < mz ? mz - camz : camz > mz + CELL ? camz - mz - CELL : 0;
          if (ex * ex + ez * ez > ru2) continue;
          if (!(SQ[0] = mx + CELL / 2, SQ[1] = V.cellY[c] + 10, SQ[2] = mz + CELL / 2, SQ[3] = 62, sphereQ(ctx.planes, ctx.nPlanes))) continue;
          if (!set) { pass.setVertexBuffer(0, m.vb); pass.setIndexBuffer(m.ib, 'uint32'); set = true; }
          pass.drawIndexed(m.count, cnt, 0, 0, V.cellStart[c * NA + a]);
          if (kind === KIND.GBUF) { st.meshDraws++; st.meshInst += cnt; st.meshTris += cnt * m.count / 3; }
        }
      }
    }
    // --- individual leaves (very close): by 16 m subcell ---
    const pl = V.famLeaf.pipe[kind];
    if (pl && V.onMesh && V.onLeaf && kind === KIND.GBUF) {
      pass.setPipeline(pl); pass.setVertexBuffer(1, V.instBuf);
      let rl = 62 / zoom; if (rl > 230) rl = 230; const S16 = 16, rs = ((rl / S16) | 0) + 1, scx = Math.floor((camx - V.x0) / S16), scz = Math.floor((camz - V.z0) / S16), n16 = NC * 4;
      for (let a = 0; a < VEG_NT; a++) {
        const m = V.leafMeshes[a]; if (!m) continue; let set = false;
        for (let dz = -rs; dz <= rs; dz++) for (let dx = -rs; dx <= rs; dx++) {
          const sx = scx + dx, sz = scz + dz; if (sx < 0 || sz < 0 || sx >= n16 || sz >= n16) continue;
          const c = (sz >> 2) * NC + (sx >> 2), q = (c * NA + a) * 16 + (sz & 3) * 4 + (sx & 3), cnt = V.subCount[q]; if (!cnt) continue;
          const mx = V.x0 + sx * S16, mz = V.z0 + sz * S16;
          const ex = camx < mx ? mx - camx : camx > mx + S16 ? camx - mx - S16 : 0, ez = camz < mz ? mz - camz : camz > mz + S16 ? camz - mz - S16 : 0;
          const d2 = ex * ex + ez * ez; if (d2 > rl * rl) continue;
          // fraction of leaves still visible at this distance (see veg_leaf.wgsl: high-phase ones disappear first)
          let fr = 1.6 - Math.sqrt(d2) * zoom / 38; if (fr <= 0.02) continue; if (fr > 1) fr = 1;
          if (!(SQ[0] = mx + 8, SQ[1] = V.cellY[c] + 10, SQ[2] = mz + 8, SQ[3] = 28, sphereQ(ctx.planes, ctx.nPlanes))) continue;
          if (!set) { pass.setVertexBuffer(0, m.vb); pass.setIndexBuffer(m.ib, 'uint32'); set = true; }
          pass.drawIndexed(((m.n * fr) | 0) * 6, cnt, 0, 0, V.subStart[q]);
          st.leafDraws++; st.leafInst += cnt; st.leafTris += cnt * ((m.n * fr) | 0) * 2;
        }
      }
    }
    // --- impostors (far), in rings of supercells: front to back ---
    const pi = V.famImp.pipe[kind]; if (!pi || !V.onImp) return;
    pass.setPipeline(pi); pass.setBindGroup(3, V.bgImp);
    if (shadow) {
      pass.setVertexBuffer(0, V.instSunBuf); const NS = V.NS, SUP = V.SUP, stat = ctx.cascade === 3;
      for (let q = 0; q < NS * NS; q++) {
        const s = V.sunOrder[q], cnt = V.sunCount[s]; if (!cnt) continue;
        const sx = s % NS, sz = (s - sx) / NS, x = V.x0 + (sx + 0.5) * SUP, z = V.z0 + (sz + 0.5) * SUP;
        if (!stat) { const dx = x - camx, dz = z - camz; if (dx * dx + dz * dz > 640 * 640) continue; if (!(SQ[0] = x, SQ[1] = V.supY[s] + 12, SQ[2] = z, SQ[3] = 215, sphereQ(ctx.planes, ctx.nPlanes))) continue; }
        pass.draw(4, cnt, 0, V.sunStart[s]);
      }
      return;
    }
    pass.setVertexBuffer(0, V.instBuf);
    const NS = V.NS, SUP = V.SUP, scx = clamp(Math.floor((camx - V.x0) / SUP), 0, NS - 1), scz = clamp(Math.floor((camz - V.z0) / SUP), 0, NS - 1);
    const all = shadow && ctx.cascade === 3, maxR = all || kind === KIND.GBUF ? NS : 3;
    for (let r = 0; r < maxR; r++) for (let dz = -r; dz <= r; dz++) {
      const stp = (dz === -r || dz === r) ? 1 : 2 * r;
      for (let dx = -r; dx <= r; dx += stp || 1) {
        const sx = (all ? 0 : scx) + dx, sz = (all ? 0 : scz) + dz; if (sx < 0 || sz < 0 || sx >= NS || sz >= NS) continue;
        const s = sz * NS + sx, cnt = V.supCount[s]; if (!cnt) continue;
        if (!all && !(SQ[0] = V.x0 + (sx + 0.5) * SUP, SQ[1] = V.supY[s] + 12, SQ[2] = V.z0 + (sz + 0.5) * SUP, SQ[3] = 215, sphereQ(ctx.planes, ctx.nPlanes))) continue;
        pass.draw(4, cnt, 0, V.supStart[s]); if (kind === KIND.GBUF) st.impDraws++;
      }
    }
  }
};

// BUILD is declared in 90_main.js (after this file): register in a microtask, which runs before the build loop.
queueMicrotask(() => BUILD.push(async () => {
  if (GAME.mode === 'test' || GAME.mode === 'car' || Q.has('noveg')) return;
  const V = VEG, dev = G.dev;
  V.leafTex = vegAtlasBuild(); V.leafView = V.leafTex.createView(); R.view.vegLeaf = V.leafView;
  V.sLeaf = dev.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 });
  V.sImp = dev.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 4 });
  const cpu = vegArchetypes(); V.meshes = cpu.map(m => m.upload());
  V.leafMeshes = cpu.map(m => (m.leaves && m.leaves.n) ? m.leaves.upload() : null);
  V.famLeaf = mkFamily('vegLeaf', { src: 'veg_leaf', buffers: [VEG_LEAF_LAYOUT, VEG_INST], alpha: true, cull: 'none', noCube: true, noShadow: true });
  // larger slope shadow bias: large cards nearly parallel to the low sun were self-shadowing in diagonal hatching
  V.famTree = mkFamily('vegTree', { src: 'veg_tree', buffers: [VLAYOUT, VEG_INST], alpha: true, cull: 'none', noCube: true, shadowBias: 24, shadowSlope: 7 });
  V.famImp = mkFamily('vegImp', { src: 'veg_imp', buffers: [VEG_INST], alpha: true, cull: 'none', topology: 'triangle-strip', shadowBias: 4 });
  vegBakeImpostors(cpu);
  V.viewA = V.texA.createView({ dimension: '2d-array' }); V.viewN = V.texN.createView({ dimension: '2d-array' });
  V.dimBuf = mkBuf(192, BU.U, V.dims);
  V.bgTree = dev.createBindGroup({ layout: V.famTree.bgl3, entries: [{ binding: 0, resource: V.leafView }, { binding: 1, resource: V.sLeaf }] });
  V.bgImp = dev.createBindGroup({ layout: V.famImp.bgl3, entries: [{ binding: 0, resource: V.viewA }, { binding: 1, resource: V.viewN }, { binding: 2, resource: V.sImp }, { binding: 3, resource: { buffer: V.dimBuf } }] });
  vegPlace();
  R.drawables.push(vegDrawable); R.veg = V;
  if (typeof grassBuild === 'function') grassBuild();
}));
