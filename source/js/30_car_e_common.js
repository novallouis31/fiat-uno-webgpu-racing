// Shared assembly for the extra procedurally generated cars.
// All geometry uses the standard MeshBuilder vertex format and mat_sport.wgsl.
const XMAT = { PAINT: 1, PLASTIC: 2, RUBBER: 3, TIRE: 4, RIM: 5, METAL: 6, LIGHT: 7, INTERIOR: 8, CARBON: 9, ACCENT: 10 };

// Linear interpolation of a [x, halfWidth, bottom, top] car profile.
function xProfile(prof, t) {
  const x = prof[0][0] + t * (prof[prof.length - 1][0] - prof[0][0]);
  let i = 0;
  while (i < prof.length - 2 && prof[i + 1][0] < x) i++;
  const a = prof[i], b = prof[i + 1];
  const f = clamp((x - a[0]) / ((b[0] - a[0]) || 1), 0, 1), s = f * f * (3 - 2 * f);
  return [x, lerp(a[1], b[1], s), lerp(a[2], b[2], s), lerp(a[3], b[3], s)];
}

// Smooth closed car body from a profile. u = front->rear, v = around the section.
function xShell(mb, prof, paint) {
  mb.mat(XMAT.PAINT).color(paint[0], paint[1], paint[2]);
  mb.patch((u, v, o) => {
    const p = xProfile(prof, u), a = v * TAU, ca = Math.cos(a), sa = Math.sin(a);
    o[0] = p[0];
    o[1] = p[2] + (p[3] - p[2]) * (0.5 + 0.5 * sa);
    o[2] = p[1] * ca * (0.94 + 0.06 * sa);
  }, 0, 1, 0, 1, { nu: 64, nv: 32, uv: (u, v) => [u, v] });
}

// Simple side + windshield/rear-window glazing (translucent pass, material 0).
function xGlass(gl, prof, t0, t1, belt, tint) {
  gl.mat(0).color(tint[0], tint[1], tint[2], 1);
  for (const side of [-1, 1]) {
    const p0 = xProfile(prof, t0), p1 = xProfile(prof, t1);
    const z0 = side * (p0[1] + 0.012), z1 = side * (p1[1] + 0.012);
    gl.quad(p0[0], p0[2] + (p0[3] - p0[2]) * belt, z0, p1[0], p1[2] + (p1[3] - p1[2]) * belt, z1,
      p1[0], p1[3] - 0.02, z1, p0[0], p0[3] - 0.02, z0, 0, 0, 1, 1);
  }
  for (const t of [t0, t1]) {
    const p = xProfile(prof, t), y0 = p[2] + (p[3] - p[2]) * belt, y1 = p[3] - 0.015, w = p[1] * 0.74;
    gl.quad(p[0], y0, -w, p[0], y1, -w * 0.8, p[0], y1, w * 0.8, p[0], y0, w, 0, 0, 1, 1);
  }
}

// Wheel: tire + rim + spokes. Local axis Z (matching the game's Rz(spin)).
function xWheel(mb, R, spokes, dark) {
  const hw = 0.082, seg = 48;
  mb.push(m4rotY(m4(), -PI / 2));
  mb.mat(XMAT.TIRE).color(0.024, 0.024, 0.025);
  mb.lathe([[-hw * 0.8, R * 0.62], [-hw, R * 0.8], [-hw, R * 0.97], [-hw * 0.9, R],
    [hw * 0.9, R], [hw, R * 0.97], [hw, R * 0.8], [hw * 0.8, R * 0.62]], seg);
  mb.mat(XMAT.RIM, dark ? 1 : 0).color(dark ? 0.16 : 0.58, dark ? 0.17 : 0.6, dark ? 0.19 : 0.63);
  mb.lathe([[-hw * 0.86, 0.015], [-hw * 0.86, R * 0.69], [hw * 0.86, R * 0.69], [hw * 0.86, 0.015]], 40);
  for (let i = 0; i < spokes; i++) {
    mb.push(m4rotZ(m4(), (i / spokes) * TAU));
    mb.rbox(0, R * 0.38, hw * 0.86, R * 0.1, R * 0.52, 0.016, 0.006, 2);
    mb.pop();
  }
  mb.mat(XMAT.METAL, 1).color(0.5, 0.52, 0.55);
  mb.lathe([[hw * 0.9, 0.02], [hw * 0.95, R * 0.12]], 20);
  mb.pop();
}

// Creates and registers a car model from a declarative config.
function extraCar(cfg) {
  const front = cfg.a, rear = cfg.b;
  const M = {
    id: cfg.id, name: cfg.name, label: cfg.label, phys: cfg.phys, bodyFn: cfg.body,
    wheelbase: cfg.wheelbase, trackF: cfg.trackF, trackR: cfg.trackR, wheelR: cfg.wheelR,
    hubs: [[front, cfg.wheelR, -cfg.trackF / 2], [front, cfg.wheelR, cfg.trackF / 2],
      [-rear, cfg.wheelR, -cfg.trackR / 2], [-rear, cfg.wheelR, cfg.trackR / 2]],
    slotBody: 0, slotWheel: [0, 0, 0, 0], slotSteer: 0,
    steerMat: m4(), tris: 0, _t: m4(), _t2: m4(), _t3: m4(), _z4: new Float32Array(4),
    set: null, glass: null, fam: null, inp: new Float64Array(2),
    build() {
      const fam = M.fam = mkFamily('car_' + cfg.id, { src: 'mat_sport', noCube: true });
      M.slotBody = objSlot();
      for (let i = 0; i < 4; i++) M.slotWheel[i] = objSlot();
      M.slotSteer = objSlot();
      const set = M.set = new MeshSet(fam), glass = M.glass = new GlassSet();
      const mb = new MeshBuilder(1 << 17), gl = new MeshBuilder(1 << 14);
      cfg.body(mb, gl);
      M.tris = (mb.ni + gl.ni) / 3;
      set.add(mb.upload(), M.slotBody, 3);
      glass.add_(gl.upload(), M.slotBody);
      const w = new MeshBuilder(1 << 15);
      xWheel(w, cfg.wheelR, cfg.spokes, cfg.darkRims);
      const wm = w.upload(); M.tris += 4 * w.ni / 3;
      for (let i = 0; i < 4; i++) set.add(wm, M.slotWheel[i], 3);
      R.drawables.push({ draw(pass, ctx) { if (ctx.kind === KIND.SHADOW && ctx.cascade === 3) return; set.draw(pass, ctx); } });
      R.transparents.push(glass);
      m4ident(M._t); M.place(M._t, M._z4, M._z4); M.place(M._t, M._z4, M._z4);
    },
    place(body, spin, susp) {
      const steer = M.inp[0], t = M._t2;
      objPrev(M.slotBody).set(objModel(M.slotBody)); objModel(M.slotBody).set(body);
      for (let i = 0; i < 4; i++) {
        const s = M.slotWheel[i], h = M.hubs[i], left = (i & 1) === 0;
        objPrev(s).set(objModel(s));
        const ang = -(i < 2 ? steer : 0) + (left ? PI : 0), c = Math.cos(ang), sn = Math.sin(ang);
        const g = left ? spin[i] : -spin[i], cg = Math.cos(g), sg = Math.sin(g);
        t[0] = c * cg; t[1] = sg; t[2] = -sn * cg; t[3] = 0;
        t[4] = -c * sg; t[5] = cg; t[6] = sn * sg; t[7] = 0;
        t[8] = sn; t[9] = 0; t[10] = c; t[11] = 0;
        t[12] = h[0]; t[13] = h[1] + susp[i]; t[14] = h[2]; t[15] = 1;
        m4mul(objModel(s), body, t);
      }
      objPrev(M.slotSteer).set(objModel(M.slotSteer));
      objModel(M.slotSteer).set(body);
    },
  };
  CAR_MODELS[cfg.id] = M;
  return M;
}
