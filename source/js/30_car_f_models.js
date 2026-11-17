// Extra cars: Ferrari F40 and Tesla Model 3. Procedural, no external assets.
// Both use the shared assembly in 30_car_e_common.js and mat_sport.wgsl.

// ---------------------------------------------------------------------------
// Ferrari F40 — low red wedge, rear wing, exposed wheels, sparse trim.
// ---------------------------------------------------------------------------
const F40_PROFILE = [
  [-2.15, 0.44, 0.34, 0.80], [-1.85, 0.80, 0.28, 1.00], [-1.25, 0.94, 0.26, 1.07],
  [-0.55, 0.97, 0.25, 1.12], [0.25, 0.96, 0.24, 1.05], [0.95, 0.88, 0.25, 0.79],
  [1.65, 0.74, 0.26, 0.58], [2.25, 0.40, 0.30, 0.45]
];
function f40Build(mb, gl) {
  xShell(mb, F40_PROFILE, [0.60, 0.025, 0.025]);
  xGlass(gl, F40_PROFILE, 0.32, 0.62, 0.52, [0.20, 0.22, 0.22]);
  // carbon rear wing: endplates, uprights and a wide blade
  mb.mat(XMAT.CARBON).color(0.045, 0.045, 0.05);
  for (const z of [-0.68, 0.68]) {
    mb.rbox(-1.82, 1.05, z, 0.07, 0.44, 0.035, 0.01, 2);
    mb.rbox(-1.86, 1.32, z, 0.38, 0.30, 0.035, 0.012, 2);
  }
  mb.rbox(-1.86, 1.36, 0, 0.52, 0.055, 1.52, 0.02, 2);
  // front splitter, side skirts and rear diffuser
  mb.mat(XMAT.PLASTIC).color(0.035, 0.035, 0.038);
  mb.rbox(2.14, 0.22, 0, 0.34, 0.05, 1.54, 0.015, 2);
  for (const z of [-0.92, 0.92]) mb.rbox(-0.05, 0.24, z, 2.05, 0.10, 0.13, 0.02, 2);
  mb.rbox(-2.08, 0.30, 0, 0.22, 0.16, 1.15, 0.02, 2);
  // quad headlights and narrow taillights
  mb.mat(XMAT.LIGHT, 0).color(0.92, 0.94, 1.0);
  for (const z of [-0.56, -0.30, 0.30, 0.56]) mb.rbox(2.17, 0.63, z, 0.055, 0.13, 0.19, 0.03, 2);
  mb.mat(XMAT.LIGHT, 1).color(0.75, 0.03, 0.02);
  for (const z of [-0.66, 0.66]) mb.rbox(-2.17, 0.80, z, 0.05, 0.075, 0.32, 0.02, 2);
  // rear engine grille slats
  mb.mat(XMAT.CARBON).color(0.03, 0.03, 0.032);
  for (let i = 0; i < 7; i++) mb.rbox(-2.19, 0.46 + i * 0.048, 0, 0.035, 0.018, 1.10, 0.006, 1);
  // mirrors
  mb.mat(XMAT.PAINT).color(0.60, 0.025, 0.025);
  for (const z of [-0.99, 0.99]) mb.rbox(0.62, 0.94, z, 0.20, 0.09, 0.12, 0.03, 2);
}

// ---------------------------------------------------------------------------
// Tesla Model 3 — smooth white fastback, glass roof, light bars, aero wheels.
// ---------------------------------------------------------------------------
const TESLA_PROFILE = [
  [-2.35, 0.52, 0.31, 0.63], [-2.05, 0.84, 0.28, 0.88], [-1.55, 0.91, 0.25, 1.08],
  [-0.85, 0.93, 0.24, 1.39], [0.10, 0.94, 0.23, 1.44], [0.85, 0.93, 0.24, 1.28],
  [1.55, 0.88, 0.26, 0.93], [2.05, 0.74, 0.28, 0.63], [2.35, 0.44, 0.30, 0.52]
];
function teslaBuild(mb, gl) {
  xShell(mb, TESLA_PROFILE, [0.86, 0.87, 0.86]);
  xGlass(gl, TESLA_PROFILE, 0.26, 0.72, 0.54, [0.16, 0.19, 0.20]);
  // panoramic glass roof
  gl.mat(0).color(0.14, 0.17, 0.18, 1);
  gl.quad(-0.95, 1.44, -0.62, 0.85, 1.44, -0.62, 0.85, 1.44, 0.62, -0.95, 1.44, 0.62, 0, 0, 1, 1);
  // full-width light bars
  mb.mat(XMAT.LIGHT, 0).color(0.88, 0.92, 1.0);
  mb.rbox(2.34, 0.66, 0, 0.055, 0.055, 1.34, 0.02, 2);
  mb.mat(XMAT.LIGHT, 1).color(0.72, 0.02, 0.02);
  mb.rbox(-2.34, 0.80, 0, 0.055, 0.06, 1.42, 0.02, 2);
  // lower intake and diffuser
  mb.mat(XMAT.PLASTIC).color(0.05, 0.052, 0.055);
  mb.rbox(2.33, 0.40, 0, 0.05, 0.12, 1.10, 0.02, 2);
  mb.rbox(-2.32, 0.34, 0, 0.06, 0.10, 1.20, 0.02, 2);
  // flush door handles and side mirror cameras
  mb.mat(XMAT.ACCENT).color(0.72, 0.74, 0.75);
  for (const z of [-0.95, 0.95]) for (const x of [-0.72, 0.62]) mb.rbox(x, 0.84, z, 0.13, 0.025, 0.02, 0.008, 1);
  mb.mat(XMAT.PAINT).color(0.86, 0.87, 0.86);
  for (const z of [-1.0, 1.0]) mb.rbox(0.72, 0.95, z, 0.17, 0.06, 0.10, 0.025, 2);
}

extraCar({
  id: 'f40', name: 'f40', label: 'Ferrari F40',
  wheelbase: 2.45, a: 1.18, b: 1.27, trackF: 1.49, trackR: 1.55, wheelR: 0.32,
  spokes: 5, darkRims: true, body: f40Build,
  phys: { m: 1100, Izz: 1480, L: 2.45, a: 1.18, b: 1.27, tw: 1.52, h: 0.42, R: 0.32,
    mu: 1.55, B: 10.0, C: 1.4, gears: [3.1, 2.0, 1.45, 1.10, 0.88], final: 3.7, rev: 3.4,
    eff: 0.9, cdA: 0.48, crr: 0.013, brakeF: 0.62, halfW: 0.88, front: 2.0, rear: 1.8, torque: 1.45 }
});

extraCar({
  id: 'tesla', name: 'tesla', label: 'Tesla Model 3',
  wheelbase: 2.87, a: 1.34, b: 1.53, trackF: 1.58, trackR: 1.58, wheelR: 0.34,
  spokes: 10, darkRims: true, body: teslaBuild,
  phys: { m: 1750, Izz: 2100, L: 2.87, a: 1.34, b: 1.53, tw: 1.58, h: 0.50, R: 0.34,
    mu: 1.38, B: 9.5, C: 1.35, gears: [3.5, 2.1, 1.40, 1.00, 0.78], final: 4.0, rev: 3.5,
    eff: 0.92, cdA: 0.55, crr: 0.010, brakeF: 0.60, halfW: 0.86, front: 2.1, rear: 1.9, torque: 1.8 }
});
