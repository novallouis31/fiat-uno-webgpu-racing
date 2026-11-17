// World maps on the GPU (around the circuit): height (r32float, 1 m/texel) and zones (rgba8, 0.5 m/texel).
// zone: R = distance to the asphalt edge ([-8,+24] m → 0..1) | G = gravel (signed distance to the edge, ±8 m; >0.5 = inside)
//       B = tall/rough grass 0..1 (0 = mown next to the track) | A = concrete/pit floor (signed distance ±8 m; >0.5 = inside)
const WM = { height: null, zone: null, x0: 0, z0: 0, sx: 1, sz: 1, zw: 0, zh: 0, zdata: null };
function worldMapBuild() {
  const dev = G.dev;
  WM.x0 = HF.x0; WM.z0 = HF.z0; WM.sx = HF.w - 1; WM.sz = HF.h - 1;
  WM.height = mkTex(HF.w, HF.h, 'r32float', TU.TB | TU.CD);
  dev.queue.writeTexture({ texture: WM.height }, HF.d, { bytesPerRow: HF.w * 4 }, [HF.w, HF.h]);
  const zw = WM.zw = (HF.w - 1) * 2 + 1, zh = WM.zh = (HF.h - 1) * 2 + 1, z = WM.zdata = new Uint8Array(zw * zh * 4), loc = new Float64Array(4);
  const enc = (v, lo, hi) => Math.round(sat((v - lo) / (hi - lo)) * 255);
  for (let j = 0; j < zh; j++) for (let i = 0; i < zw; i++) {
    const x = WM.x0 + i * 0.5, zz = WM.z0 + j * 0.5, o = (j * zw + i) * 4;
    if (trackFarDist(x, zz) > 70) { z[o] = 255; z[o + 1] = 0; z[o + 2] = 255; z[o + 3] = 0; continue; }
    trackLocate(x, zz, -1, loc); const d = loc[1], ad = Math.abs(d), i0 = loc[2], f = loc[3], hw = TRK.hw, left = d < 0;
    z[o] = enc(ad - hw, -8, 24);
    const g = trkAt(left ? TRK.gravL : TRK.gravR, i0, f), g0 = hw + 2.4;
    z[o + 1] = enc(g > 1 ? Math.min(ad - g0, g0 + g - ad) : -8, -8, 8);
    const bar = trkAt(left ? TRK.barL : TRK.barR, i0, f);
    z[o + 2] = enc(ad - bar, -1.0, 5.0);
    // concrete: pits + paddock to the right of the straight, grandstand base to the left
    const s = loc[0], sr = s > TRK.L / 2 ? s - TRK.L : s, p = TRK.pit; let c = -8;
    if (!left) {
      const e = Math.min(1, (sr - p.s0) / 45, (p.s1 - sr) / 45), d0 = lerp(hw, p.laneD0, sat(e)), d1 = lerp(hw + 4.5, p.laneD1, sat(e));
      c = Math.min(d - d0, d1 - d, (sr - p.s0) * 0.25, (p.s1 - sr) * 0.25);
      c = Math.max(c, Math.min(d - p.laneD1 + 0.5, p.padD1 - d, sr - (p.bldS0 - 25), p.bldS1 + 25 - sr));
    } else c = Math.min(-d - (hw + 3.2), d - (TRK.stand.d1 - 8), sr - (TRK.stand.s0 - 12), TRK.stand.s1 + 12 - sr);
    z[o + 3] = enc(c, -8, 8);
  }
  WM.zone = mkTex(zw, zh, 'rgba8unorm', TU.TB | TU.CD);
  dev.queue.writeTexture({ texture: WM.zone }, z, { bytesPerRow: zw * 4 }, [zw, zh]);
}
