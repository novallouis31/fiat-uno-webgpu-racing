// Car parts: bumpers, wheel arches, headlights, mirrors, wipers, interior, roof rack + ladder, wheels, steering wheel, atlas.
// 2D polyline with rounded corners (parabolic fillet): pts = [[a,b,radius]...]; at(s) → [a, b, ta, tb]
function carPath(pts) {
  const n = pts.length, cum = [0], dir = [];
  for (let i = 0; i < n - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy); cum.push(cum[i] + l); dir.push([dx / l, dy / l]); }
  const L = cum[n - 1];
  return {
    L, at(s, o) {
      s = clamp(s, 0, L); let k = 0; while (k < n - 2 && s > cum[k + 1]) k++;
      const t = s - cum[k]; let a = pts[k][0] + dir[k][0] * t, b = pts[k][1] + dir[k][1] * t, ta = dir[k][0], tb = dir[k][1];
      for (let i = 1; i < n - 1; i++) {
        const r = pts[i][2] || 0; if (!r) continue; const d = s - cum[i]; if (d <= -r || d >= r) continue;
        const g = d < 0 ? (r + d) * (r + d) / (4 * r) : (r - d) * (r - d) / (4 * r), h = d < 0 ? (r + d) / (2 * r) : -(r - d) / (2 * r);
        const ex = dir[i][0] - dir[i - 1][0], ey = dir[i][1] - dir[i - 1][1];
        a += ex * g; b += ey * g; ta += ex * h; tb += ey * h;
      }
      o[0] = a; o[1] = b; o[2] = ta; o[3] = tb; return o;
    }
  };
}
// x of the top surface (front or rear) at (z, y)
function carTopX(z, y, rear) {
  let a = rear ? -1.76 : 1.6, b = rear ? -1.35 : 1.95;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2, f = carYtop(m, z) - y; if ((f > 0) === !rear) a = m; else b = m; }
  return (a + b) / 2;
}
const _cp = new Float64Array(4), _cq = new Float64Array(4);
function carBumper(mb, path, prof, sign, field, nu, nv, sC, side, yTop, taper) {
  // sign: +1 outward normal = (tz, -tx) (front), -1 = (-tz, tx) (rear)
  // side: factor of the bulge on the side; taper: how much the lower edge rises on reaching the wheel arch
  mb.patch((u, v, o) => {
    const sp = u * path.L; path.at(sp, _cp); prof.at(v * prof.L, _cq);
    const l = 1 / Math.hypot(_cp[2], _cp[3]), nx = _cp[3] * l * sign, nz = -_cp[2] * l * sign;
    const k = _cq[0] > 0 ? lerp(1, side, smooth(sC - 0.06, sC + 0.14, sp)) : 1;
    const hk = 1 - taper * smooth(sC + 0.05, path.L, sp);
    o[0] = _cp[0] + nx * _cq[0] * k; o[1] = yTop - (yTop - _cq[1]) * hk; o[2] = _cp[1] + nz * _cq[0] * k;
  }, 0, 1, 0, 1, { nu, nv, flip: sign < 0, field, rim: 0.02, uv: (u, v, P) => { _cuv[0] = P[2]; _cuv[1] = P[1]; return _cuv; } });
}
function carBuildParts(mb, gl) {
  const v0 = mb.nv, i0 = mb.ni, gv0 = gl.nv, gi0 = gl.ni;
  // ================= bumpers (textured black plastic) =================
  mb.mat(CM.PLASTIC).color(0.02, 0.02, 0.021);
  // front: low piece (0,30–0,60 m), flush with the front, just below the headlights; the side follows the fender to the wheel arch
  const fPath = carPath([[1.869, 0], [1.862, 0.30, 0.15], [1.838, 0.56, 0.12], [1.822, 0.686, 0.07], [1.70, 0.702, 0.06], [1.49, 0.722, 0.1], [1.25, 0.742]]);
  // profile: protruding upper edge (lip), face, recessed trim, skirt
  const fProf = carPath([[-0.09, 0.600], [0.026, 0.598, 0.004], [0.034, 0.590, 0.004], [0.034, 0.574, 0.004], [0.029, 0.568, 0.004], [0.029, 0.474, 0.003], [0.023, 0.470, 0.003], [0.023, 0.458, 0.003], [0.029, 0.454, 0.003], [0.028, 0.340, 0.012], [0.006, 0.308, 0.008], [-0.07, 0.300]]);
  const fSC = 0.30 + 0.261 + 0.127;
  carBumper(mb, fPath, fProf, 1, (u, v, P) => {
    let f = carArchF(P) - 0.004;
    // side air intakes, slot above the license plate and license-plate recess
    if (P[0] > 1.78) f = Math.min(f, carRRect(P[2] - 0.45, P[1] - 0.386, 0.15, 0.026, 0.01), carRRect(P[2], P[1] - 0.538, 0.21, 0.0075, 0.006), carRRect(P[2], P[1] - 0.476, 0.212, 0.072, 0.008), carRRect(P[2], P[1] - 0.352, 0.19, 0.03, 0.01));   // + central air intake below the license plate
    return -f;
  }, 150, 46, fSC, 0.3, 0.600, 0.3);
  const rPath = carPath([[-1.692, 0], [-1.688, 0.30, 0.15], [-1.674, 0.58, 0.1], [-1.657, 0.70, 0.07], [-1.60, 0.722, 0.05], [-1.49, 0.735, 0.1], [-1.26, 0.751]]);
  const rProf = carPath([[-0.09, 0.572], [0.023, 0.570, 0.004], [0.031, 0.562, 0.004], [0.031, 0.547, 0.004], [0.026, 0.541, 0.004], [0.026, 0.468, 0.003], [0.02, 0.464, 0.003], [0.02, 0.452, 0.003], [0.026, 0.448, 0.003], [0.025, 0.376, 0.014], [0.006, 0.346, 0.008], [-0.07, 0.338]]);
  carBumper(mb, rPath, rProf, -1, (u, v, P) => -(carArchF(P) - 0.004), 124, 42, 0.30 + 0.28 + 0.121, 0.4, 0.572, 0.22);
  // backing of the front air intakes (vanes)
  mb.mat(CM.GRILLE, 1).color(0.008, 0.008, 0.009);
  mb.quad(1.862, 0.33, 0.62, 1.862, 0.33, 0, 1.862, 0.425, 0, 1.862, 0.425, 0.62);
  mb.quad(1.876, 0.522, 0.23, 1.876, 0.522, 0, 1.876, 0.552, 0, 1.876, 0.552, 0.23);
  // backing of the license-plate recess
  mb.mat(CM.PLASTIC).color(0.016, 0.016, 0.017);
  mb.quad(1.886, 0.396, 0.222, 1.886, 0.396, 0, 1.886, 0.556, 0, 1.886, 0.556, 0.222);
  // ================= wheel arches and underbody =================
  mb.mat(CM.UNDER).color(0.006, 0.006, 0.007);
  for (const ax of [CS.AXF, CS.AXR]) {
    const R0 = CS.ARCH_R + 0.006, N = 28, zo = carZL(ax, 0.55) - 0.012, zi = 0.33;
    for (let i = 0; i < N; i++) {
      // the liner ends at the height of the bumper's lower edge on the overhang side (it doesn't hang below it)
      const aS = ax > 0 ? 12 : -18, aE = ax > 0 ? 198 : 163;
      const a0 = (aS + (aE - aS) * i / N) * PI / 180, a1 = (aS + (aE - aS) * (i + 1) / N) * PI / 180;
      const x0 = ax + Math.cos(a0) * R0, y0 = CS.ARCH_Y + Math.sin(a0) * R0, x1 = ax + Math.cos(a1) * R0, y1 = CS.ARCH_Y + Math.sin(a1) * R0;
      const a = mb.v(x0, y0, zo, -Math.cos(a0), -Math.sin(a0), 0, 0, 0), b = mb.v(x0, y0, zi, -Math.cos(a0), -Math.sin(a0), 0, 0, 1), c = mb.v(x1, y1, zi, -Math.cos(a1), -Math.sin(a1), 0, 1, 1), d = mb.v(x1, y1, zo, -Math.cos(a1), -Math.sin(a1), 0, 1, 0);
      mb.quadI(a, d, c, b);
    }
    mb.quad(ax - 0.33, 0.25, zi, ax + 0.33, 0.25, zi, ax + 0.33, 0.66, zi, ax - 0.33, 0.66, zi);
  }
  // closures under the bumpers (dark) + floor underneath (half car; mirrored later)
  mb.quad(1.56, 0.2, 0.56, 1.56, 0.2, 0, 1.56, 0.42, 0, 1.56, 0.42, 0.56);
  mb.quad(-1.33, 0.2, 0, -1.33, 0.2, 0.56, -1.33, 0.42, 0.56, -1.33, 0.42, 0);
  // raised underbody beneath the overhangs (not visible from under the bumpers)
  mb.quad(1.56, 0.42, 0, 1.86, 0.42, 0, 1.86, 0.42, 0.72, 1.56, 0.42, 0.72);
  mb.quad(-1.68, 0.42, 0, -1.33, 0.42, 0, -1.33, 0.42, 0.74, -1.68, 0.42, 0.74);
  // underbody: full width only between the wheels; beside the wheels it is narrow (the full plane passed through the tire and hubcap and
  // showed up as a thin horizontal scratch on the hubcap)
  mb.quad(-0.84, 0.2, 0, 0.84, 0.2, 0, 0.84, 0.2, 0.705, -0.84, 0.2, 0.705);
  mb.quad(0.84, 0.2, 0, 1.56, 0.2, 0, 1.56, 0.2, 0.5, 0.84, 0.2, 0.5);
  mb.quad(-1.33, 0.2, 0, -0.84, 0.2, 0, -0.84, 0.2, 0.5, -1.33, 0.2, 0.5);
  // ================= headlight: chrome reflector in a bowl behind the lens =================
  {
    const z0 = CL.hlZ0 + 0.003, z1 = CL.hlZ1 - 0.003, y0 = CL.lY - CL.lH + 0.003, y1 = CL.lY + CL.lH - 0.003, D = 0.062;
    const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, hz = (z1 - z0) / 2, hy = (y1 - y0) / 2;
    const dep = (a, b) => 0.006 + D * Math.pow(Math.max(0, (1 - a * a * a * a) * (1 - b * b * b * b)), 0.6);
    mb.mat(CM.REFLECTOR).color(0.9, 0.9, 0.92);
    mb.patch((u, v, o) => { const z = zc + u * hz, y = yc + v * hy, d = dep(u, v), x = carTopX(z, y, false); o[0] = x - d * 0.97; o[1] = y - d * 0.2; o[2] = z; }, -1, 1, -1, 1, { nu: 22, nv: 12, flip: true, uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; } });
    // bulb (small, at the bottom of the bowl)
    const xb = carTopX(zc, yc, false) - (dep(0, 0) - 0.012) * 0.97, ybb = yc - (dep(0, 0) - 0.012) * 0.2;
    // glass bulb at the center of the bowl, with a chrome collar at the base and a dark cap at the tip
    mb.push(m4translate(m4(), xb, ybb, zc)); mb.push(m4rotZ(m4(), -PI / 2 + 0.2));
    mb.mat(CM.REFLECTOR, 1).color(1, 0.95, 0.8); mb.cyl(0, -0.012, 0, 0.0105, 0.024, 0.0095, 12, false, true);
    mb.mat(CM.REFLECTOR, 2).color(0.85, 0.85, 0.86); mb.cyl(0, -0.012, 0, 0.016, -0.007, 0.014, 14, false, true);   // silver collar (the chrome reflected darkly: it turned into a black dot)
    mb.mat(CM.REFLECTOR, 2).color(0.6, 0.6, 0.6); mb.cyl(0, 0.022, 0, 0.0105, 0.029, 0.007, 12, false, true);   // silver cap (not a black pin)
    mb.pop(); mb.pop();
  }
  // ================= exterior mirrors: rectangular housing, bellows arm, door-mounted base =================
  mb.mat(CM.PLASTIC).color(0.013, 0.013, 0.014);
  mb.push(m4translate(m4(), 0.566, 1.004, 0.905)); mb.push(m4rotY(m4(), 0.14));
  mb.rbox(0, 0, 0, 0.078, 0.108, 0.185, 0.024, 5);
  mb.mat(CM.MIRROR).color(0.62, 0.64, 0.67);
  mb.quad(-0.0395, -0.041, -0.078, -0.0395, -0.041, 0.078, -0.0395, 0.041, 0.078, -0.0395, 0.041, -0.078);
  mb.pop(); mb.pop();
  mb.mat(CM.RUBBER).color(0.012, 0.012, 0.013);
  mb.push(m4translate(m4(), 0.576, 0.994, 0.742)); mb.push(m4rotY(m4(), -PI / 2));
  { const pr = []; for (let i = 0; i <= 12; i++) pr.push([i * 0.006, 0.031 + (i & 1 ? 0.006 : 0) - i * 0.0004]); mb.lathe(pr, 18); }
  mb.pop(); mb.pop();
  mb.mat(CM.PLASTIC).color(0.013, 0.013, 0.014);
  mb.rbox(0.596, 0.994, 0.742, 0.13, 0.085, 0.02, 0.008, 2);
  // ================= interior (right half; mirrored) =================
  mb.mat(CM.INTERIOR).color(0.05, 0.05, 0.055);
  mb.quad(-0.86, 0.235, 0.72, 0.85, 0.235, 0.72, 0.85, 0.235, 0, -0.86, 0.235, 0);
  mb.quad(-1.33, 0.235, 0.5, -0.86, 0.235, 0.5, -0.86, 0.235, 0, -1.33, 0.235, 0);   // next to the rear wheels the carpet is narrow (the full plane passed through the hubcap: thin horizontal scratch)
  mb.quad(-1.63, 0.45, 0.72, -1.33, 0.45, 0.72, -1.33, 0.45, 0, -1.63, 0.45, 0);                         // trunk floor (above the raised underbody)                       // floor (carpet)
  mb.quad(0.82, 0.2, 0, 0.82, 0.2, 0.72, 0.82, 0.93, 0.72, 0.82, 0.93, 0);                               // firewall
  mb.mat(CM.INTERIOR, 3).color(0.045, 0.045, 0.05);
  mb.rbox(0.60, 0.80, 0.34, 0.40, 0.22, 0.70, 0.05, 4);                                                  // dashboard
  mb.rbox(0.45, 0.52, 0.05, 0.3, 0.34, 0.12, 0.03, 2);                                                   // console
  mb.mat(CM.INTERIOR, 3).color(0.075, 0.075, 0.082); mb.rbox(0.62, 0.915, 0.34, 0.34, 0.024, 0.69, 0.01, 2);              // dashboard top (lighter)
  mb.mat(CM.GRILLE).color(0.02, 0.02, 0.022);                                                                              // air vents (vanes)
  mb.box(0.397, 0.862, 0.615, 0.008, 0.045, 0.1); mb.box(0.397, 0.862, 0.09, 0.008, 0.045, 0.1);
  mb.mat(CM.INTERIOR, 3).color(0.03, 0.03, 0.034); mb.rbox(0.396, 0.775, 0.34, 0.012, 0.085, 0.3, 0.005, 2);               // glovebox lid / radio
  // front seat
  const seat = (x, z, w, color) => {
    mb.mat(CM.INTERIOR, 4).color(color[0], color[1], color[2]);
    mb.rbox(x, 0.43, z, 0.5, 0.15, w, 0.055, 4);
    mb.push(m4translate(m4(), x - 0.26, 0.47, z)); mb.push(m4rotZ(m4(), 0.33)); mb.rbox(0, 0.3, 0, 0.13, 0.6, w - 0.02, 0.055, 4);
    mb.color(color[0] * 1.9, color[1] * 1.9, color[2] * 2.1); mb.rbox(0.058, 0.3, 0, 0.03, 0.46, w - 0.2, 0.012, 2); mb.pop(); mb.pop();   // light fabric insert on the backrest
    mb.rbox(x + 0.02, 0.498, z, 0.36, 0.03, w - 0.2, 0.012, 2);                                                                          // and on the seat cushion
  };
  seat(-0.03, 0.345, 0.5, [0.07, 0.072, 0.08]);
  mb.push(m4translate(m4(), -0.29, 0.47, 0.345)); mb.push(m4rotZ(m4(), 0.33));
  mb.mat(CM.INTERIOR, 2).color(0.065, 0.067, 0.075); mb.rbox(0.005, 0.71, 0, 0.1, 0.17, 0.25, 0.04, 4);
  mb.mat(CM.STEEL).color(0.3, 0.3, 0.3); mb.cyl(0, 0.58, -0.06, 0.006, 0.64, 0.006, 6); mb.cyl(0, 0.58, 0.06, 0.006, 0.64, 0.006, 6);
  mb.pop(); mb.pop();
  // rear seat (one-piece) and parcel shelf
  mb.mat(CM.INTERIOR, 4).color(0.07, 0.072, 0.08);
  mb.rbox(-0.93, 0.45, 0.31, 0.46, 0.15, 0.62, 0.055, 4);
  mb.push(m4translate(m4(), -1.16, 0.5, 0.31)); mb.push(m4rotZ(m4(), 0.36)); mb.rbox(0, 0.25, 0, 0.12, 0.52, 0.62, 0.05, 4); mb.pop(); mb.pop();
  mb.mat(CM.INTERIOR).color(0.04, 0.04, 0.045); mb.box(-1.40, 0.925, 0.3, 0.28, 0.02, 0.6);
  // ================= roof rack (feet) =================
  mb.mat(CM.STEEL).color(0.03, 0.03, 0.032);
  for (const xb of [CRK.x0, CRK.x1]) {
    const st = carStation(xb);
    mb.rbox(xb, st.yE + 0.045, st.zE - 0.035, 0.075, 0.07, 0.06, 0.012, 2);
    mb.push(m4translate(m4(), xb, st.yE - 0.012, st.zE + 0.012)); mb.push(m4rotX(m4(), 0.34)); mb.box(0, 0, 0, 0.06, 0.07, 0.006); mb.pop(); mb.pop();
  }
  mb.mirror(v0, i0, 2); gl.mirror(gv0, gi0, 2);
  // ======================= asymmetric parts =======================
  // rack bars + ladder + straps
  mb.mat(CM.STEEL).color(0.035, 0.035, 0.038);
  for (const xb of [CRK.x0, CRK.x1]) mb.rbox(xb, CRK.barY, 0, 0.036, 0.028, 1.2, 0.006, 2);
  carLadder(mb);
  // wipers
  carWipers(mb);
  // exhaust: transverse muffler (matte steel) + short tailpipe pointing rearward, as in the photo
  mb.mat(CM.STEEL, 1).color(0.03, 0.03, 0.032);
  mb.push(m4translate(m4(), -1.43, 0.272, 0.0)); mb.push(m4rotX(m4(), PI / 2)); mb.cyl(0, 0, 0, 0.062, 0.34, 0.062, 20, true, true); mb.pop(); mb.pop();
  mb.mat(CM.STEEL, 1).color(0.035, 0.035, 0.038);
  mb.tube([[-1.44, 0.268, -0.2], [-1.56, 0.26, -0.2], [-1.705, 0.256, -0.2]], 0.019, 10);   // short, dark, straight-rearward tailpipe
  // steering wheel: fixed column
  mb.mat(CM.INTERIOR, 3).color(0.04, 0.04, 0.045);
  mb.tube([[0.36, 0.875, -0.36], [0.56, 0.80, -0.36]], 0.03, 10);
  mb.rbox(0.47, 0.925, -0.36, 0.2, 0.07, 0.32, 0.03, 3);        // instrument binnacle
  // interior rearview mirror, gear lever, handbrake
  mb.rbox(0.23, 1.29, 0, 0.025, 0.055, 0.2, 0.012, 2); mb.tube([[0.24, 1.29, 0], [0.2, 1.35, 0]], 0.008, 6);
  mb.tube([[0.2, 0.42, 0.0], [0.17, 0.6, 0.0]], 0.01, 6); mb.rbox(0.168, 0.62, 0, 0.045, 0.045, 0.045, 0.02, 3);
  mb.rbox(-0.12, 0.40, 0, 0.3, 0.05, 0.04, 0.015, 2);
  // driver: torso, shoulders, arms on the steering wheel and helmet (simple, seen through the glass)
  {
    const zd = -0.345;
    mb.mat(CM.INTERIOR, 2).color(0.2, 0.028, 0.03);   // dark red racing suit
    mb.push(m4translate(m4(), -0.245, 0.50, zd)); mb.push(m4rotZ(m4(), 0.30));
    mb.rbox(0.085, 0.27, 0, 0.2, 0.54, 0.36, 0.08, 4);                 // torso
    mb.rbox(0.085, 0.50, 0, 0.17, 0.1, 0.44, 0.045, 3);                // shoulders
    mb.pop(); mb.pop();
    mb.rbox(0.02, 0.535, zd, 0.44, 0.13, 0.34, 0.06, 3);               // thighs
    for (const sg of [-1, 1]) mb.tube([[-0.26, 0.97, zd + sg * 0.2], [-0.02, 0.86, zd + sg * 0.215], [0.275, 0.93, -0.36 + sg * 0.165]], 0.043, 8);   // arms
    mb.mat(CM.INTERIOR, 3).color(0.02, 0.02, 0.022);
    for (const sg of [-1, 1]) mb.rbox(0.285, 0.935, -0.36 + sg * 0.17, 0.085, 0.07, 0.075, 0.03, 2);   // gloves
    mb.rbox(-0.275, 1.035, zd, 0.1, 0.07, 0.11, 0.03, 2);              // neck
    // diagonal seat belt (left shoulder → right hip), in front of the torso
    mb.mat(CM.INTERIOR, 3).color(0.012, 0.012, 0.013);
    mb.sweep([[-0.262, 1.0, zd - 0.15], [-0.15, 0.82, zd - 0.02], [-0.085, 0.63, zd + 0.15]], [[-0.022, 0.004], [0.022, 0.004], [0.022, -0.004], [-0.022, -0.004]], { closedProfile: true, hard: true, up: [1, 0.3, 0] });
    mb.mat(CM.GLOSS).color(0.05, 0.052, 0.058);   // graphite full-face helmet (subtle through the glass); the racing suit is dark red
    mb.rbox(-0.262, 1.168, zd, 0.25, 0.25, 0.228, 0.112, 7);          // helmet shell
    mb.rbox(-0.236, 1.092, zd, 0.186, 0.105, 0.206, 0.05, 5);         // chin bar (flush with the shell)
    mb.mat(CM.GLOSS, 1).color(0.01, 0.011, 0.014);
    mb.rbox(-0.2, 1.178, zd, 0.13, 0.08, 0.233, 0.034, 5);        // visor: dark band wrapping around the front and sides of the shell
  }
  // front emblem: five slanted chrome bars overlaid at the center of the grille (spanning the height of the two slots)
  {
    const y = 0.694, x = carTopX(0, y, false), xu = carTopX(0, y + 0.02, false), sl = (xu - x) / 0.02, l = Math.hypot(1, sl);
    const B = m4basis(m4(), 0, 0, -1, sl / l, 1 / l, 0, 1 / l, -sl / l, 0, x + 0.002, y, 0);
    mb.mat(CM.CHROME, 2).color(0.93, 0.93, 0.95); mb.push(B);
    const sh = m4(); sh[4] = 0.3;
    mb.push(sh); for (let i = 0; i < 5; i++) mb.rbox((i - 2) * 0.0165, 0, 0.004, 0.0072, 0.09, 0.008, 0.002, 2); mb.pop(); mb.pop();
  }
  // rear license plates and emblems (atlas decals)
  carDecals(mb);
}
const CRK = { x0: 0.0, x1: -0.98, barY: 1.47, railZ: 0.205, lx0: -1.98, lx1: 1.22 };
function carLadder(mb) {
  const yb = CRK.barY + 0.014, h = 0.062, yc = yb + h / 2, L = CRK.lx1 - CRK.lx0, xc = (CRK.lx0 + CRK.lx1) / 2;
  // side rails (rectangular profile) and rubber end caps
  for (const s of [-1, 1]) {
    mb.mat(CM.ALU).color(0.86, 0.87, 0.88); mb.rbox(xc, yc, s * CRK.railZ, L, h, 0.024, 0.004, 1);
    mb.mat(CM.RUBBER).color(0.02, 0.02, 0.02);
    mb.rbox(CRK.lx0 - 0.012, yc, s * CRK.railZ, 0.04, h + 0.008, 0.034, 0.006, 1); mb.rbox(CRK.lx1 + 0.012, yc, s * CRK.railZ, 0.04, h + 0.008, 0.034, 0.006, 1);
  }
  // rungs
  mb.mat(CM.ALU, 1).color(0.88, 0.89, 0.9);
  const n = 11, sp = 0.28, xs = xc - (n - 1) * sp / 2;
  mb.push(m4rotX(m4(), PI / 2));
  for (let i = 0; i < n; i++) mb.cyl(xs + i * sp, -CRK.railZ - 0.0135, -yc, 0.017, CRK.railZ + 0.0135, 0.017, 14, true, true);
  mb.pop();
  // ratchet straps, one on each bar
  for (const xb of [CRK.x0, CRK.x1]) {
    const z0 = CRK.railZ + 0.0165, y0 = CRK.barY - 0.0165, y1 = yb + h + 0.0025, r = 0.008, path = [];
    const corner = (cz, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + k * PI / 8; path.push([xb, cy + Math.sin(a) * r, cz + Math.cos(a) * r]); } };
    corner(z0 - r, y1 - r, 0); corner(-z0 + r, y1 - r, PI / 2); corner(-z0 + r, y0 + r, PI); corner(z0 - r, y0 + r, 1.5 * PI);
    mb.mat(CM.STRAP).color(0.85, 0.28, 0.02);
    mb.sweep(path, [[-0.0013, -0.019], [0.0013, -0.019], [0.0013, 0.019], [-0.0013, 0.019]], { closed: true, closedProfile: true, hard: true, up: [1, 0, 0], vScale: 0.02 });
    // ratchet and slack strap end
    mb.mat(CM.CHROME, 1).color(0.62, 0.62, 0.64); mb.rbox(xb, y1 + 0.011, 0.07, 0.052, 0.02, 0.085, 0.004, 1);
    mb.rbox(xb, y1 + 0.028, 0.1, 0.04, 0.012, 0.07, 0.004, 1);
    mb.mat(CM.STRAP).color(0.85, 0.28, 0.02); mb.box(xb, y1 + 0.004, -0.06, 0.036, 0.004, 0.14);
  }
}
function carWipers(mb) {
  const wip = (zp, z1, xe0, lift) => {
    // arm from the pivot to the middle of the blade; blade resting at the base of the windshield
    const P = (z, xe) => { const zz = z / 0.72, x = xe + carBulge(xe) * (1 - zz * zz); return [x, carYtop(x, z) + 0.016, z]; };
    mb.mat(CM.RUBBER).color(0.015, 0.015, 0.015);
    const zm = (zp + z1) / 2, a = P(zp, 0.69), m = P(zm + (z1 - zp) * 0.1, xe0 - lift * 0.5);
    mb.rbox(a[0], a[1] - 0.004, a[2], 0.03, 0.022, 0.03, 0.008, 2);
    mb.sweep([a, [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2 + 0.006, (a[2] + m[2]) / 2], m], [[-0.006, -0.003], [0.006, -0.003], [0.006, 0.003], [-0.006, 0.003]], { closedProfile: true, hard: true });
    const pts = []; for (let k = 0; k <= 8; k++) { const z = lerp(zp + (z1 - zp) * 0.12, z1, k / 8); pts.push(P(z, lerp(xe0, xe0 - lift, k / 8))); }
    mb.sweep(pts, [[-0.007, -0.008], [0.007, -0.008], [0.004, 0.006], [-0.004, 0.006]], { closedProfile: true, hard: true });
  };
  wip(0.30, -0.22, 0.655, 0.03); wip(-0.24, -0.66, 0.655, 0.05);
  // rear wiper
  mb.mat(CM.RUBBER).color(0.015, 0.015, 0.015);
  const PR = (z, y) => { const x = carTopX(z, y, true); return [x - 0.016, y + 0.006, z]; };
  const a = PR(0.02, 0.975), b = PR(-0.2, 1.01);
  mb.rbox(a[0], a[1], a[2], 0.03, 0.03, 0.03, 0.008, 2);
  mb.sweep([a, b], [[-0.005, -0.003], [0.005, -0.003], [0.005, 0.003], [-0.005, 0.003]], { closedProfile: true, hard: true });
  const pts = []; for (let k = 0; k <= 6; k++) pts.push(PR(lerp(0.0, -0.4, k / 6), 1.015 + 0.012 * k / 6));
  mb.sweep(pts, [[-0.006, -0.006], [0.006, -0.006], [0.003, 0.006], [-0.003, 0.006]], { closedProfile: true, hard: true });
}
// atlas regions (u0, v0, u1, v1)
const CAT = { plate: [0, 0, 0.5, 0.332], fiat: [0.5, 0, 0.75, 0.16], mille: [0.5, 0.18, 0.95, 0.4] };
function carDecals(mb) {
  // quad on the rear/front surface: center (z, y), width w, height h; rear: text read by someone looking from behind
  const dq = (reg, zc, y0, w, h, rear, lift) => {
    const P = (z, y) => { const x = rear ? carTopX(z, y, true) - lift : lift; return [x, y, z]; };
    const s = rear ? 1 : -1, a = P(zc - s * w / 2, y0), b = P(zc + s * w / 2, y0), c = P(zc + s * w / 2, y0 + h), d = P(zc - s * w / 2, y0 + h);
    mb.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], reg[0], reg[3], reg[2], reg[1]);
  };
  mb.mat(CM.DECAL).color(1, 1, 1);
  dq(CAT.plate, 0, 0.652, 0.40, 0.13, true, 0.006);
  dq(CAT.plate, 0, 0.411, 0.40, 0.13, false, 1.8885);
  mb.mat(CM.DECAL, 1).color(1, 1, 1);
  dq(CAT.fiat, -0.40, 0.925, 0.145, 0.046, true, 0.003);
  dq(CAT.mille, 0.37, 0.932, 0.175, 0.043, true, 0.003);
  // black license-plate frames and hatch lock
  mb.mat(CM.PLASTIC).color(0.02, 0.02, 0.02);
  const lk = [carTopX(0.33, 0.7, true) - 0.006, 0.7, 0.33];
  mb.rbox(lk[0], lk[1], lk[2], 0.014, 0.036, 0.11, 0.006, 2);
}
// ---------- emblem and license-plate atlas (2D canvas via paths; letters as strokes) ----------
const CGLYPH = {
  F: [[[0, 0], [0, 1], [0.75, 1]], [[0, 0.52], [0.55, 0.52]]], I: [[[0.2, 0], [0.2, 1]]], A: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.15, 0.36], [0.65, 0.36]]], T: [[[0, 1], [0.8, 1]], [[0.4, 1], [0.4, 0]]],
  M: [[[0, 0], [0, 1], [0.45, 0.3], [0.9, 1], [0.9, 0]]], i: [[[0.12, 0], [0.12, 0.6]], [[0.12, 0.84], [0.12, 0.88]]], l: [[[0.12, 0], [0.12, 1]]],
  e: [[[0.06, 0.32], [0.62, 0.32], [0.6, 0.48], [0.46, 0.62], [0.24, 0.62], [0.09, 0.48], [0.06, 0.28], [0.13, 0.09], [0.3, 0], [0.5, 0.02], [0.62, 0.12]]],
  E: [[[0.72, 0], [0, 0], [0, 1], [0.72, 1]], [[0, 0.52], [0.52, 0.52]]], P: [[[0, 0], [0, 1], [0.52, 1], [0.72, 0.88], [0.72, 0.62], [0.52, 0.5], [0, 0.5]]],
  U: [[[0, 1], [0, 0.25], [0.14, 0.05], [0.4, 0], [0.66, 0.05], [0.8, 0.25], [0.8, 1]]], N: [[[0, 0], [0, 1], [0.8, 0], [0.8, 1]]],
  O: [[[0.4, 0], [0.14, 0.08], [0, 0.3], [0, 0.7], [0.14, 0.92], [0.4, 1], [0.66, 0.92], [0.8, 0.7], [0.8, 0.3], [0.66, 0.08], [0.4, 0]]],
  1: [[[0.12, 0.74], [0.42, 1], [0.42, 0]]], 9: [[[0.7, 0.62], [0.55, 0.46], [0.3, 0.46], [0.1, 0.6], [0.1, 0.85], [0.3, 1], [0.52, 1], [0.7, 0.85], [0.7, 0.3], [0.55, 0.05], [0.3, 0], [0.12, 0.1]]],
  6: [[[0.66, 0.9], [0.5, 1], [0.3, 1], [0.12, 0.82], [0.1, 0.3], [0.25, 0.03], [0.5, 0], [0.68, 0.15], [0.7, 0.4], [0.52, 0.56], [0.3, 0.56], [0.12, 0.42]]],
  '-': [[[0.1, 0.48], [0.5, 0.48]]],
};
const CADV = { I: 0.45, i: 0.3, l: 0.3, M: 1.12, '-': 0.6, 1: 0.7, e: 0.82 };
function carText(g, txt, x, y, h, lw, skew) {
  g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ch of txt) {
    const gl = CGLYPH[ch];
    if (gl) for (const st of gl) { g.beginPath(); st.forEach((p, i) => { const px = x + (p[0] + (skew || 0) * p[1]) * h * 0.72, py = y - p[1] * h; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); }
    x += (CADV[ch] || 1.0) * h * 0.72 + lw * 0.6;
  }
  return x;
}
function carAtlas() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  // gray license plate (1990s Brazilian standard): light-gray background, black letters, municipality band
  g.fillStyle = '#b9bcbc'; g.fillRect(0, 0, 512, 170); g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 160);
  g.fillStyle = '#9fa3a3'; g.fillRect(150, 12, 212, 26); g.strokeStyle = '#222'; carText(g, 'UNO Mille', 178, 34, 17, 2.4, 0);
  g.strokeStyle = '#141414'; carText(g, 'UNO-1996', 30, 146, 76, 11, 0);
  g.fillStyle = '#777'; g.beginPath(); g.arc(28, 24, 6, 0, TAU); g.arc(484, 24, 6, 0, TAU); g.fill();
  // FIAT emblem: four blue diamonds with silver letters
  for (let i = 0; i < 4; i++) {
    const x = 518 + i * 60; g.fillStyle = '#16327a'; g.beginPath(); g.moveTo(x + 10, 6); g.lineTo(x + 58, 6); g.lineTo(x + 48, 74); g.lineTo(x, 74); g.closePath(); g.fill();
    g.strokeStyle = '#e4e8ec'; carText(g, 'FIAT'[i], x + 13 + (i === 1 ? 7 : 0), 66, 52, 12.5, 0.14);
  }
  // "Mille EP": Mille in dark gray italic, EP in red
  // "Mille" in joined cursive (curves), "EP" in red italic
  const SCR = {
    M: [1.02, [0, 0, 0.03, 0.62, 0.17, 1.0], [0.25, 0.5, 0.34, 0.08], [0.43, 0.62, 0.57, 1.0], [0.63, 0.5, 0.7, 0.1], [0.77, -0.05, 0.98, 0.13]],
    i: [0.36, [0, 0.13, 0.1, 0.32, 0.14, 0.62], [0.1, 0.2, 0.17, 0.06], [0.23, -0.03, 0.36, 0.13]],
    l: [0.36, [0, 0.13, 0.2, 0.5, 0.2, 0.9], [0.18, 1.07, 0.12, 0.9], [0.06, 0.5, 0.14, 0.08], [0.2, -0.03, 0.36, 0.13]],
    e: [0.5, [0, 0.13, 0.25, 0.3, 0.31, 0.48], [0.3, 0.67, 0.18, 0.62], [0.04, 0.5, 0.1, 0.2], [0.19, -0.05, 0.47, 0.15]],
  };
  let xs = 526; const hs = 84, sk = 0.3, ys = 190, T = (x, y) => [xs + (x + sk * y) * hs, ys - y * hs];
  g.strokeStyle = '#1c1e22'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ch of 'Mille') {
    const d = SCR[ch]; g.beginPath(); let p = T(d[1][0], d[1][1]); g.moveTo(p[0], p[1]);
    let c = T(d[1][2], d[1][3]), e = T(d[1][4], d[1][5]); g.quadraticCurveTo(c[0], c[1], e[0], e[1]);
    for (let k = 2; k < d.length; k++) { c = T(d[k][0], d[k][1]); e = T(d[k][2], d[k][3]); g.quadraticCurveTo(c[0], c[1], e[0], e[1]); }
    g.stroke();
    if (ch === 'i') { const q = T(0.17, 0.86); g.beginPath(); g.arc(q[0], q[1], 6, 0, TAU); g.fillStyle = '#1c1e22'; g.fill(); }
    xs += d[0] * hs;
  }
  const xe = xs + 4;
  g.strokeStyle = '#d0281a'; carText(g, 'EP', xe + 20, 190, 86, 16, 0.24);
  const im = g.getImageData(0, 0, W, H);
  const tex = mkTex(W, H, 'rgba8unorm-srgb', TU.RT | TU.TB | TU.CD, { mipLevelCount: 6 });
  G.dev.queue.writeTexture({ texture: tex }, im.data, { bytesPerRow: W * 4 }, [W, H]);
  genMips(tex, 'rgba8unorm-srgb');
  return tex;
}
// ---------- wheel (local Z axis; outer face at +Z) ----------
function carBuildWheel(mb, mbBlur) {
  mb.push(m4rotY(m4(), -PI / 2));    // local X of the lathe → +Z
  mb.push(m4translate(m4(), -0.015, 0, 0));   // wheel 1,5 cm inward: the tire's outer face sits behind the fender lip
  const R = CAR.wheelR, hw = 0.0725, seg = 72;
  // inner sidewall, grooved tread band, outer sidewall
  const tj = [0.5, 1];
  mb.mat(CM.TIRE, 255).color(0.02, 0.02, 0.021);
  mb.lathe([[-0.058, 0.168], [-0.066, 0.18], [-0.0735, 0.205], [-0.074, 0.228], [-0.071, 0.25], [-0.066, 0.264, 0.5, 1]], seg);
  mb.lathe([[0.066, 0.264, 0.5, -1], [0.071, 0.25], [0.074, 0.228], [0.0735, 0.205], [0.066, 0.18], [0.058, 0.168]], seg);
  mb.mat(CM.TIRE, 0);
  const tread = [[-0.066, 0.264, 0.5, 1], [-0.061, 0.2745], [-0.052, 0.2795]];
  const groove = (x) => { tread.push([x - 0.0045, R], [x - 0.0036, R - 0.0065], [x + 0.0036, R - 0.0065], [x + 0.0045, R]); };
  tread.push([-0.041, R]); groove(-0.033); groove(-0.011); groove(0.011); groove(0.033); tread.push([0.041, R]);
  tread.push([0.052, 0.2795], [0.061, 0.2745], [0.066, 0.264, 0.5, -1]);
  mb.lathe(tread, seg);
  // steel rim: visible edge, recess behind the hubcap, inner side
  mb.mat(CM.STEEL, 1).color(0.035, 0.035, 0.038);
  mb.lathe([[0.058, 0.168], [0.062, 0.171], [0.064, 0.168], [0.062, 0.164], [0.04, 0.16], [0.03, 0.13], [0.03, 0.0]], 40);
  mb.lathe([[-0.02, 0.0], [-0.02, 0.1], [-0.05, 0.158], [-0.06, 0.166], [-0.058, 0.168]], 32);
  // silver hubcap with 14 radial slots
  mb.mat(CM.HUBCAP).color(0.62, 0.63, 0.65);
  const NS = 16, prof = r => { const t = r / 0.166; return 0.0715 - 0.021 * t * t - 0.004 * smooth(0.028, 0.036, r) + 0.004 * smooth(0.06, 0.09, r) - 0.004 * smooth(0.15, 0.166, r); };
  mb.patch((u, v, o) => { const a = u * TAU, r = v * 0.1665; o[0] = prof(r); o[1] = r * Math.cos(a); o[2] = r * Math.sin(a); }, 0, 1.003, 0.0, 1, {   // 1.003: overlaps the angular seam (no gap)
    nu: 210, nv: 30, flip: true, rim: 0.018, rimMat: m => m.mat(CM.STEEL, 1).color(0.03, 0.03, 0.03),
    uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; },
    field: (u, v, P) => { const r = v * 0.1665, da = (u * NS - Math.round(u * NS)) / NS * TAU, t = r * Math.sin(da), q = Math.max(Math.abs(r - 0.123) - 0.019, 0); return -(Math.hypot(t, q) - 0.0082); }
  });
  // blur disc in its own mesh (outside the shadow pass: without it the disc's shadow scratched the stationary hubcap)
  const bm = mbBlur || mb; if (mbBlur) { bm.push(m4rotY(m4(), -PI / 2)); bm.push(m4translate(m4(), -0.015, 0, 0)); }
  bm.mat(CM.HUBCAP, 1).color(0.62, 0.63, 0.65);
  bm.patch((u, v, o) => { const a = u * TAU, r = 0.036 + v * 0.127; o[0] = prof(r) + 0.002; o[1] = r * Math.cos(a); o[2] = r * Math.sin(a); }, 0, 1, 0, 1, { nu: 56, nv: 8, flip: true, uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; } });
  if (mbBlur) { bm.pop(); bm.pop(); }
  mb.pop(); mb.pop();
}
// ---------- steering wheel (column axis = local X) ----------
function carBuildSteer(mb) {
  mb.mat(CM.INTERIOR, 3).color(0.035, 0.035, 0.038);
  const ring = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; ring.push([0, 0.185 * Math.cos(a), 0.185 * Math.sin(a)]); }
  mb.tube(ring, 0.0135, 10, { closed: true, up: [1, 0, 0] });
  mb.rbox(-0.035, -0.01, 0, 0.05, 0.1, 0.16, 0.025, 3);
  mb.rbox(-0.02, 0.0, 0.1, 0.022, 0.03, 0.17, 0.008, 1); mb.rbox(-0.02, 0.0, -0.1, 0.022, 0.03, 0.17, 0.008, 1); mb.rbox(-0.02, -0.1, 0, 0.022, 0.17, 0.035, 0.008, 1);
  m4translate(CAR._t, 0.345, 0.885, -0.36); m4rotZ(CAR._t2, 158 * PI / 180); m4mul(CAR.steerMat, CAR._t, CAR._t2);
}
