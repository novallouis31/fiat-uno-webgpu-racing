// Car registry and assembly. CAR is the active model; the Uno is the default.
// Extra models register themselves in CAR_MODELS from 30_car_e_* / 30_car_f_*.
const CAR_MODELS = {};
let CAR = null;
const CAR_ID = Q.get('car') || (() => { try { return localStorage.getItem('uno-car'); } catch (e) { return null; } })() || 'uno';
const UNO = {
  wheelbase: 2.362, trackF: 1.34, trackR: 1.30, wheelR: 0.281,
  hubs: [[1.181, 0.281, -0.67], [1.181, 0.281, 0.67], [-1.181, 0.281, -0.65], [-1.181, 0.281, 0.65]],
  slotBody: 0, slotWheel: [0, 0, 0, 0], slotSteer: 0,
  steerMat: m4(), tris: 0, _t: m4(), _t2: m4(), _t3: m4(), set: null, glass: null, atlasBG: null, fam: null,
  build() {
    carShapeInit(); carWindowsInit(); carSeamInit();
    const fam = CAR.fam = mkFamily('car', { src: 'mat_car', noCube: true });
    CAR.slotBody = objSlot(); for (let i = 0; i < 4; i++) CAR.slotWheel[i] = objSlot(); CAR.slotSteer = objSlot();
    const set = CAR.set = new MeshSet(fam), glass = CAR.glass = new GlassSet();
    const mb = new MeshBuilder(1 << 17), gl = new MeshBuilder(1 << 14);
    carBuildBody(mb, gl);
    if (typeof carBuildParts === 'function') carBuildParts(mb, gl);
    CAR.tris = mb.ni / 3 + gl.ni / 3;
    set.add(mb.upload(), CAR.slotBody, 3); glass.add_(gl.upload(), CAR.slotBody);
    if (typeof carBuildWheel === 'function') {
      const w = new MeshBuilder(1 << 15), wb = new MeshBuilder(1 << 11); carBuildWheel(w, wb); const wm = w.upload(), wbm = wb.upload(); CAR.tris += 4 * (w.ni + wb.ni) / 3;
      for (let i = 0; i < 4; i++) { set.add(wm, CAR.slotWheel[i], 3); set.add(wbm, CAR.slotWheel[i], 1); }   // blur disc: main pass only
    }
    if (typeof carBuildSteer === 'function') { const s = new MeshBuilder(1 << 12); carBuildSteer(s); CAR.tris += s.ni / 3; set.add(s.upload(), CAR.slotSteer, 3); }
    const tex = typeof carAtlas === 'function' ? carAtlas() : mkTex(4, 4, 'rgba8unorm-srgb');
    // drawable: binds the atlas (group 3) and does not enter the world's static shadow map
    R.drawables.push({ draw(pass, ctx) {
      if (ctx.kind === KIND.SHADOW && ctx.cascade === 3) return;
      if (!CAR.atlasBG) { if (!fam.bgl3) return; CAR.atlasBG = G.dev.createBindGroup({ layout: fam.bgl3, entries: [{ binding: 0, resource: tex.createView() }] }); }
      pass.setBindGroup(3, CAR.atlasBG); set.draw(pass, ctx);
    } });
    R.transparents.push(glass);
    m4ident(CAR._t); CAR.place(CAR._t, CAR._z4, CAR._z4); CAR.place(CAR._t, CAR._z4, CAR._z4);
  },
  _z4: new Float32Array(4),
  // writes the matrices of all slots (and stores the previous ones for the motion vectors). No allocation.
  // steer (front-wheel angle, + = right) and steering-wheel angle come from CAR.inp[0..1]: no number is passed as an
  // argument (V8 would box each one on the heap on every call).
  inp: new Float64Array(2),
  place(body, spin, susp) {
    const steer = CAR.inp[0], steerWheelAngle = CAR.inp[1];
    const t = CAR._t2, t2 = CAR._t3;
    objPrev(CAR.slotBody).set(objModel(CAR.slotBody)); objModel(CAR.slotBody).set(body);
    for (let i = 0; i < 4; i++) {
      const s = CAR.slotWheel[i], h = CAR.hubs[i], left = (i & 1) === 0;
      objPrev(s).set(objModel(s));
      // wheel: T(hub + suspension) ┬À Ry(steering [+¤Ç to the left]) ┬À Rz(spin)
      const a = -(i < 2 ? steer : 0) + (left ? PI : 0), c = Math.cos(a), sn = Math.sin(a);
      const g = left ? spin[i] : -spin[i], cg = Math.cos(g), sg = Math.sin(g);
      // Ry(a) * Rz(g)
      t[0] = c * cg; t[1] = sg; t[2] = -sn * cg; t[3] = 0;
      t[4] = -c * sg; t[5] = cg; t[6] = sn * sg; t[7] = 0;
      t[8] = sn; t[9] = 0; t[10] = c; t[11] = 0;
      t[12] = h[0]; t[13] = h[1] + susp[i]; t[14] = h[2]; t[15] = 1;
      m4mul(objModel(s), body, t);
    }
    objPrev(CAR.slotSteer).set(objModel(CAR.slotSteer));
    const ca = Math.cos(-steerWheelAngle), sa = Math.sin(-steerWheelAngle); t2.fill(0); t2[0] = 1; t2[5] = ca; t2[6] = sa; t2[9] = -sa; t2[10] = ca; t2[15] = 1;
    m4mul(t, CAR.steerMat, t2); m4mul(objModel(CAR.slotSteer), body, t);
  },
};
CAR_MODELS.uno = UNO;
// Selects the active car and applies its physics profile. Safe to call before
// vehicle physics is loaded: the profile is then applied by gameInit().
function carSelect(id) {
  CAR = CAR_MODELS[id] || UNO;
  if (typeof vehicleApplyCar === 'function') vehicleApplyCar(CAR.phys);
  return CAR;
}
BUILD.push(async () => {
  carSelect(CAR_ID);
  CAR.build();
  if (GAME.mode === 'car') {
    buildTestGround();
    GAME.init = () => { setCamera(3.3, 1.25, -3.6, 0.1, 0.62, 0, 0.5); R.cube.pos.set([0, 0.9, 0]); };
    window.__car = CAR;
  }
});
