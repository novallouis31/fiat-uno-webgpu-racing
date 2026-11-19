// Vehicle physics (no library): flat 4-wheel model with load transfer, friction ellipse,
// front-wheel drive, automatic transmission, handbrake, track relief/bank and barrier collisions.
// Fixed step of 1/120 s. No allocations during the simulation.
const PHYS_DT = 1 / 120;
const K_W = 1, K_S = 2, K_A = 4, K_D = 8, K_SPACE = 16, K_C = 32, K_R = 64, K_V = 128, K_PAD = 256, K_PADS = 512;
// Analog controller input: VIN[0] throttle 0..1, VIN[1] brake 0..1 (valid when keys carry K_PAD), VIN[2] steering -1..1 (K_PADS).
// The recorded keys of the scripted lap never carry these bits: the digital path stays exactly as it was.
const VIN = new Float64Array(3);
const VP = {
  m: 900, Izz: 1250, L: 2.362, a: 0.96, b: 1.402, tw: 1.33, h: 0.5, R: 0.281,
  mu: 1.42, B: 9.5, C: 1.42,
  gears: [3.91, 2.16, 1.48, 1.12, 0.9], final: 4.07, rev: 3.9, eff: 0.9,
  cdA: 0.62, crr: 0.014, brakeF: 0.64, halfW: 0.78, front: 1.92, rear: 1.72,
};
// Per-car engine multiplier (set by vehicleApplyCar for the extra models).
const VTUNE = { torque: 1 };
const VEH = {
  x: 0, z: 0, yaw: 0, vx: 0, vy: 0, r: 0,                  // CG position in the plane, heading, body-frame velocities (forward, right), yaw
  steer: 0, rpm: 900, gear: 1, throttle: 0, brake: 0, hand: 0,
  ax: 0, ay: 0,                                              // filtered accelerations (body frame)
  roll: 0, rollV: 0, pitch: 0, pitchV: 0, heave: 0, heaveV: 0,
  y: 0, gPitch: 0, gRoll: 0,                                 // height and slope of the ground under the car (filtered)
  spin: new Float32Array(4), omega: new Float32Array(4), susp: new Float32Array(4),
  slip: new Float32Array(4),                                 // slip intensity per wheel 0..1 (smoke/skid marks)
  wx: new Float32Array(4), wy: new Float32Array(4), wz: new Float32Array(4), wzone: new Uint8Array(4), whint: new Int32Array(4).fill(-1),
  fz: new Float32Array(4), hint: -1, s: 0, d: 0, zone: 0, lapS: 0, lastS: 0, laps: 0, maxOff: 0, offCount: 0, hits: 0, time: 0, steps: 0,
  ctl: new Float32Array(2),                                  // output for audio: effective throttle and brake from the last step
  // previous state (for render interpolation)
  px: 0, pz: 0, pyaw: 0, py: 0, proll: 0, ppitch: 0, pheave: 0, pgPitch: 0, pgRoll: 0, psteer: 0, pspin: new Float32Array(4), psusp: new Float32Array(4),
};
const _vl = new Float64Array(4), _vp = new Float64Array(5);
// local wheel positions (x forward, z right): FL, FR, RL, RR
const WLX = [VP.a, VP.a, -VP.b, -VP.b], WLZ = [-VP.tw / 2, VP.tw / 2, -VP.tw / 2, VP.tw / 2];

// Applies a car's physics profile and refreshes the derived wheel coordinates.
// Called at build time and again from gameInit(), so it is safe in both orders.
function vehicleApplyCar(phys) {
  if (!phys) { VTUNE.torque = 1; return; }
  Object.assign(VP, phys);
  WLX[0] = VP.a; WLX[1] = VP.a; WLX[2] = -VP.b; WLX[3] = -VP.b;
  WLZ[0] = -VP.tw / 2; WLZ[1] = VP.tw / 2; WLZ[2] = -VP.tw / 2; WLZ[3] = VP.tw / 2;
  VTUNE.torque = phys.torque || 1;
}

function engineTorque(rpm) { // torque curve (N┬Àm), scaled by the selected car
  const x = rpm / 1000; const t = (180 + 118 * Math.sin(clamp((x - 0.6) / 5.4, 0, 1) * PI)) * VTUNE.torque - Math.max(0, x - 6.0) * 110;
  return Math.max(0, t);
}
// ground query without numbers via argument/return: input _gq[0]=x, _gq[1]=z; output _gq[8]=height; returns the zone (integer).
// wi = wheel index (search hint in VEH.whint) or -1 for the CG.
const _gq = new Float64Array(12);
function groundQ(wi) {
  const q = _gq, V = VEH;
  trackLocateQ(wi >= 0 ? V.whint[wi] : V.hint, q);
  if (q[3] > 90 || q[3] < -90) trackLocateQ(-1, q);
  const i0 = q[4] | 0, f = q[5], d = q[3], ad = d < 0 ? -d : d, i1 = (i0 + 1) % TRK.N;
  if (wi >= 0) V.whint[wi] = i0; else { V.hint = i0; V.s = q[2]; V.d = d; }
  const zone = zoneAtQ(q), lim = TRK.hw + APRON;
  const ty = TRK.y[i0] + (TRK.y[i1] - TRK.y[i0]) * f - (d < -lim ? -lim : d > lim ? lim : d) * (TRK.bank[i0] + (TRK.bank[i1] - TRK.bank[i0]) * f);
  let y = ty;
  if (ad <= lim - 0.4) {
    if (zone === ZONE.KERB) { const kx = ad - TRK.hw; if (kx > 0 && kx < KERB_W) y += 0.012 + 0.045 * Math.sin(Math.min(1, kx / (KERB_W * 0.82)) * PI * 0.5) * (kx > KERB_W * 0.82 ? (KERB_W - kx) / (KERB_W * 0.18) : 1) + 0.012 * Math.sin(q[2] * 5.2); }
  } else {
    hfAtQ(q); let e = (ad - (lim - 0.4)) / 1.2; e = e < 0 ? 0 : e > 1 ? 1 : e; y = ty + (q[6] - ty) * e;
    if (zone === ZONE.GRAVEL) y -= 0.03;
  }
  q[8] = y; return zone;
}
// convenience version (generation/tests)
function groundAt(x, z, wi) { _gq[0] = x; _gq[1] = z; _vl[3] = groundQ(wi); return _gq[8]; }
const ZMU = [1.0, 0.96, 0.56, 0.5, 0.5, 0.95, 0.95], ZDRAG = [0, 0.005, 0.07, 0.24, 0.12, 0, 0];

function vehicleReset(s, d, heading) {
  const V = VEH; trackPos(s, d, _vp);
  V.x = _vp[0]; V.z = _vp[2]; V.yaw = Math.atan2(_vp[4], _vp[3]) + (heading || 0);
  V.vx = V.vy = V.r = 0; V.steer = 0; V.rpm = 900; V.gear = 1; V.ax = V.ay = 0; V.roll = V.rollV = V.pitch = V.pitchV = V.heave = V.heaveV = 0;
  V.hint = -1; V.whint.fill(-1); V.omega.fill(0); V.slip.fill(0);
  _gq[0] = V.x; _gq[1] = V.z; groundQ(-1); V.y = _gq[8]; V.gPitch = 0; V.gRoll = 0; V.lastS = V.s;
  for (let k = 0; k < 6; k++) vehicleGround(1);
  vehicleSavePrev();
}
function vehicleSavePrev() {
  const V = VEH; V.px = V.x; V.pz = V.z; V.pyaw = V.yaw; V.py = V.y; V.proll = V.roll; V.ppitch = V.pitch; V.pheave = V.heave; V.pgPitch = V.gPitch; V.pgRoll = V.gRoll; V.psteer = V.steer;
  V.pspin.set(V.spin); V.psusp.set(V.susp);
}
// samples the ground at the 4 wheels; updates body height/slope (filtered with factor k)
function vehicleGround(k) {
  const V = VEH, c = Math.cos(V.yaw), s = Math.sin(V.yaw);
  for (let i = 0; i < 4; i++) {
    const wx = V.x + c * WLX[i] - s * WLZ[i], wz = V.z + s * WLX[i] + c * WLZ[i];
    V.wx[i] = wx; V.wz[i] = wz; _gq[0] = wx; _gq[1] = wz; V.wzone[i] = groundQ(i); V.wy[i] = _gq[8];
  }
  const yF = (V.wy[0] + V.wy[1]) / 2, yR = (V.wy[2] + V.wy[3]) / 2, yL = (V.wy[0] + V.wy[2]) / 2, yRt = (V.wy[1] + V.wy[3]) / 2;
  const gy = (yF * VP.b + yR * VP.a) / VP.L, gp = Math.atan2(yF - yR, VP.L), gr = Math.atan2(yRt - yL, VP.tw);
  V.y += (gy - V.y) * k; V.gPitch += (gp - V.gPitch) * k; V.gRoll += (gr - V.gRoll) * k;
  _gq[0] = V.x; _gq[1] = V.z; V.zone = groundQ(-1);
}
function vehicleStep(keys) {
  const V = VEH, P = VP, dt = PHYS_DT, g = 9.81;
  vehicleSavePrev();
  // (keys also pass through VIN: this way thr, brk and sIn are always floating-point numbers read from a typed array, and
  // V8's intermediate compiler doesn't have to box the mix of integers and fractions ÔÇö the values are the same 0 and 1)
  if (!(keys & K_PAD)) { VIN[0] = (keys & K_W) ? 1 : 0; VIN[1] = (keys & K_S) ? 1 : 0; }
  const thr = VIN[0], brk = VIN[1], hand = (keys & K_SPACE) ? 1 : 0;
  const speed = Math.sqrt(V.vx * V.vx + V.vy * V.vy);
  // --- smoothed digital steering, with speed-dependent limit
  if (!(keys & K_PADS)) VIN[2] = ((keys & K_D) ? 1 : 0) - ((keys & K_A) ? 1 : 0);
  const sIn = VIN[2];
  const sMax = Math.min(0.6, Math.max(0.05, Math.atan(P.L * 11.5 / Math.max(speed * speed, 1)) * 1.25));
  // keyboard: smoothed digital steering; controller analog: the wheel follows the stick almost directly
  const sTgt = sIn * sMax, sRate = ((keys & K_PADS) ? 2.4 + 5 * sMax : sIn !== 0 && Math.sign(sTgt - V.steer) === sIn ? 1.15 + 1.2 * sMax : 2.6 * Math.max(0.25, sMax)) * dt;
  V.steer += Math.min(sRate, Math.max(-sRate, sTgt - V.steer));
  // --- gear, engine, reverse
  let reverse = false, throttle = thr, brake = brk;
  if (V.gear === 0) { // reverse engaged
    reverse = true; throttle = brk; brake = thr;
    if (thr && V.vx > -0.5) { V.gear = 1; reverse = false; throttle = thr; brake = brk; }
  } else if (brk && !thr && V.vx < 0.6) { V.gear = 0; reverse = true; throttle = brk; brake = 0; }
  const wheelSpd = (V.omega[0] + V.omega[1]) * 0.5;
  let ratio = reverse ? -P.rev * P.final : P.gears[V.gear - 1] * P.final;
  let rpm = Math.abs(wheelSpd * ratio) * 9.5493;
  if (!reverse) {
    if (rpm > 6250 && V.gear < 5) { V.gear++; }
    else if (V.gear > 1 && Math.abs(wheelSpd * P.gears[V.gear - 2] * P.final) * 9.5493 < 5350) V.gear--;
    ratio = P.gears[V.gear - 1] * P.final; rpm = Math.abs(wheelSpd * ratio) * 9.5493;
  }
  const rpmE = Math.min(6700, Math.max(900, Math.max(rpm, 1100 + throttle * 1900 * Math.min(1, Math.max(0, 1 - speed / 6)))));   // clutch slipping on launch
  V.rpm += (rpmE - V.rpm) * 0.25;
  const ex = rpmE / 1000, ek = (ex - 0.6) / 5.4, eT = (180 + 118 * Math.sin((ek < 0 ? 0 : ek > 1 ? 1 : ek) * PI)) * VTUNE.torque - (ex > 6 ? (ex - 6) * 110 : 0);   // = engineTorque(rpmE), inlined
  let Tdrive = throttle * (eT > 0 ? eT : 0) * ratio * P.eff;                  // total torque at the front wheels
  if (rpm > 6500) Tdrive = 0;
  if (reverse && V.vx < -11) Tdrive = 0;
  Tdrive -= (1 - throttle) * 0.012 * rpmE * Math.sign(wheelSpd) * Math.abs(ratio) * 0.1;   // engine braking
  // --- vertical load per wheel
  const W = P.m * g, dFx = P.m * V.ax * P.h / P.L, dFy = P.m * V.ay * P.h / P.tw;
  const cosg = Math.cos(V.gPitch);
  V.fz[0] = Math.max(60, (W * P.b / P.L * cosg - dFx) * 0.5 + dFy * 0.56); V.fz[1] = Math.max(60, (W * P.b / P.L * cosg - dFx) * 0.5 - dFy * 0.56);
  V.fz[2] = Math.max(60, (W * P.a / P.L * cosg + dFx) * 0.5 + dFy * 0.44); V.fz[3] = Math.max(60, (W * P.a / P.L * cosg + dFx) * 0.5 - dFy * 0.44);
  // --- tire forces
  let Fx = 0, Fy = 0, Mz = 0; const cs = Math.cos(V.steer), sn = Math.sin(V.steer);
  const lw0 = Math.min(1, Math.max(0, (speed - 0.4) / 1.8));
  const lowW = (lw0 * lw0 * (3 - 2 * lw0));
  for (let i = 0; i < 4; i++) {
    const front = i < 2, zone = V.wzone[i], mu = P.mu * ZMU[zone], cap = mu * V.fz[i];
    // contact patch velocity in the body frame
    const vxw = V.vx - V.r * WLZ[i], vyw = V.vy + V.r * WLX[i];
    // in the wheel frame
    const vl = front ? vxw * cs + vyw * sn : vxw, vt = front ? -vxw * sn + vyw * cs : vyw;
    // longitudinal: drive/brake demand limited by friction
    let fxd = 0, locked = false, spinning = false;
    if (front) fxd += Tdrive * 0.5 / P.R;
    const bdem = brake * P.m * g * 1.25 * (front ? P.brakeF : 1 - P.brakeF) * 0.5;
    const dirL = Math.abs(vl) > 0.25 ? Math.sign(vl) : (Math.abs(fxd) > 1 ? 0 : Math.sign(vl) * Math.abs(vl) / 0.25);
    fxd -= bdem * dirL;
    if (!front && hand) { fxd = -cap * 0.92 * dirL; locked = Math.abs(vl) > 0.3; }
    fxd -= (P.crr + ZDRAG[zone]) * V.fz[i] * dirL;
    let fx = fxd, latCap;
    if (locked) { latCap = cap * 0.34; }
    else if (Math.abs(fxd) > cap * 0.985) {
      if (front && Math.abs(Tdrive) * 0.5 / P.R > bdem && throttle) { fx = Math.sign(fxd) * cap * 0.9; spinning = true; latCap = cap * 0.42; }   // spins
      else { fx = Math.sign(fxd) * cap * 0.97; latCap = cap * 0.243; }                                                             // ABS
    } else latCap = Math.sqrt(cap * cap - fx * fx);
    // lateral: simplified Pacejka; at low speed blends with viscous damping (stable at rest)
    const alpha = Math.atan2(vt, Math.max(Math.abs(vl), 1.2));
    let fy = -cap * Math.sin(P.C * Math.atan(P.B * alpha));
    fy = fy * lowW + (1 - lowW) * (-vt * P.m * 0.25 / 0.07);
    fy = Math.min(latCap, Math.max(-latCap, fy));
    // slip for effects
    const sl = Math.max(spinning ? 0.55 + 0.45 * Math.min(1, Math.max(0, 1 - Math.abs(vl) / 14)) : 0, locked ? Math.min(1, Math.max(0, Math.abs(vl) / 4)) : 0, Math.min(1, Math.max(0, (Math.abs(alpha) - 0.13) / 0.16)) * Math.min(1, Math.max(0, speed / 6)), (brake && Math.abs(fxd) > cap * 0.985) ? 0.35 * Math.min(1, Math.max(0, speed / 8)) : 0);
    V.slip[i] += (((zone === ZONE.ASPHALT || zone === ZONE.KERB || zone === ZONE.PIT) ? sl : sl * 0.6 + Math.min(1, Math.max(0, speed / 10)) * 0.5) - V.slip[i]) * 0.3;
    // visual wheel rotation
    let wT = vl / P.R;
    if (spinning) wT = Math.max(wT, Math.min(rpmE / 9.5493 / Math.abs(ratio), wT + 34)) * Math.sign(ratio);
    if (locked) wT = 0;
    V.omega[i] += (wT - V.omega[i]) * (locked ? 0.5 : 0.35);
    V.spin[i] += V.omega[i] * dt;
    // back to the body frame
    const fbx = front ? fx * cs - fy * sn : fx, fby = front ? fx * sn + fy * cs : fy;
    Fx += fbx; Fy += fby; Mz += WLX[i] * fby - WLZ[i] * fbx;
  }
  // drag, gravity on slopes
  Fx -= 0.5 * 1.2 * P.cdA * V.vx * Math.abs(V.vx);
  Fx -= P.m * g * Math.sin(V.gPitch); Fy -= P.m * g * Math.sin(V.gRoll);
  // integrate (rotating body frame)
  const axb = Fx / P.m, ayb = Fy / P.m;
  V.vx += (axb + V.r * V.vy) * dt; V.vy += (ayb - V.r * V.vx) * dt; V.r += Mz / P.Izz * dt;
  if (speed < 0.25 && !throttle && Math.abs(Tdrive) < 30) { V.vx *= 0.9; V.vy *= 0.8; V.r *= 0.8; }
  V.ax += (axb - V.ax) * 0.18; V.ay += (ayb - V.ay) * 0.18;
  const c = Math.cos(V.yaw), s = Math.sin(V.yaw);
  V.x += (V.vx * c - V.vy * s) * dt; V.z += (V.vx * s + V.vy * c) * dt; V.yaw += V.r * dt;
  // ground and collision
  vehicleGround(0.35);
  vehicleCollide();
  // body motion over the suspension: roll in corners, dive under braking, squat on launch
  const kR = 78, cR = 9.5; const rollT = Math.min(0.062, Math.max(-0.062, V.ay * 0.0058)), pitchT = Math.min(0.03, Math.max(-0.03, -V.ax * (V.ax < 0 ? 0.0034 : 0.003)));
  V.rollV += ((rollT - V.roll) * kR - V.rollV * cR) * dt; V.roll += V.rollV * dt;
  V.pitchV += ((pitchT - V.pitch) * kR * 1.15 - V.pitchV * cR) * dt; V.pitch += V.pitchV * dt;
  // vibration on curbs / off track
  let rough = 0; for (let i = 0; i < 4; i++) rough += V.wzone[i] === ZONE.KERB ? 0.5 : (V.wzone[i] === ZONE.GRAVEL || V.wzone[i] === ZONE.ROUGH || V.wzone[i] === ZONE.GRASS) ? 1 : 0;
  const hT = rough > 0 ? Math.sin(V.time * 61) * 0.004 * rough * Math.min(1, Math.max(0, speed / 8)) : 0;
  V.heaveV += ((hT - V.heave) * 220 - V.heaveV * 14) * dt; V.heave += V.heaveV * dt;
  // lap statistics
  V.ctl[0] = throttle; V.ctl[1] = brake;
  V.time += dt; V.steps++;
  let ds = V.s - V.lastS; if (ds < -TRK.L / 2) { ds += TRK.L; V.laps++; } else if (ds > TRK.L / 2) { ds -= TRK.L; V.laps--; }
  V.lapS += ds; V.lastS = V.s;
  let off = 0; for (let i = 0; i < 4; i++) if (V.wzone[i] !== ZONE.ASPHALT && V.wzone[i] !== ZONE.KERB && V.wzone[i] !== ZONE.PIT) off++;
  if (off > 0) V.offCount++;
}
// collision with side barriers: tests the 4 corners, pushes back and reflects velocity
function vehicleCollide() {
  const V = VEH, P = VP, c = Math.cos(V.yaw), s = Math.sin(V.yaw);
  for (let k = 0; k < 4; k++) {
    const lx = k < 2 ? P.front : -P.rear, lz = (k & 1) ? P.halfW : -P.halfW;
    const cx = V.x + c * lx - s * lz, cz = V.z + s * lx + c * lz;
    _gq[0] = cx; _gq[1] = cz; trackLocateQ(V.hint, _gq);
    const d = _gq[3], i0 = _gq[4] | 0, f = _gq[5], i1 = (i0 + 1) % TRK.N, bar = d < 0 ? TRK.barL : TRK.barR, lim = bar[i0] + (bar[i1] - bar[i0]) * f - 0.25, pen = (d < 0 ? -d : d) - lim;
    if (pen > 0 && pen < 6) {
      // barrier normal (points toward the track) = -sign(d) * track lateral normal
      const tx = TRK.tx[i0] + (TRK.tx[i1] - TRK.tx[i0]) * f, tz = TRK.tz[i0] + (TRK.tz[i1] - TRK.tz[i0]) * f, sg = d < 0 ? 1 : -1, nx = -tz * sg, nz = tx * sg;
      V.x += nx * pen; V.z += nz * pen;
      // world velocity
      let wvx = V.vx * c - V.vy * s, wvz = V.vx * s + V.vy * c; const vn = wvx * nx + wvz * nz;
      if (vn < 0) {
        wvx -= nx * vn * 1.25; wvz -= nz * vn * 1.25; const tgx = -nz, tgz = nx, vt = wvx * tgx + wvz * tgz; wvx -= tgx * vt * 0.12; wvz -= tgz * vt * 0.12;
        V.vx = wvx * c + wvz * s; V.vy = -wvx * s + wvz * c;
        // yaw torque from the corner impact
        const rx = c * lx - s * lz, rz = s * lx + c * lz; V.r += (rx * nz - rz * nx) * (-vn) * 0.35; V.r *= 0.85; V.hits++;
      }
    }
  }
}
