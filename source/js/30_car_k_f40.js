// Ferrari F40 — imported CC BY 3.0 model (Poly Pizza, PuKkBuMXDD).
// Converted offline with tools/glb2game.js into baked vertex-colour buffers.
const F40 = {
  id: 'f40', name: 'f40', label: 'Ferrari F40',
  wheelbase: 2.45, trackF: 1.49, trackR: 1.55, wheelR: 0.32,
  hubs: [[1.18, 0.32, -0.745], [1.18, 0.32, 0.745], [-1.27, 0.32, -0.775], [-1.27, 0.32, 0.775]],
  phys: { m: 1100, Izz: 1480, L: 2.45, a: 1.18, b: 1.27, tw: 1.52, h: 0.42, R: 0.32,
    mu: 1.55, B: 10.0, C: 1.4, gears: [3.1, 2.0, 1.45, 1.10, 0.88], final: 3.7, rev: 3.4,
    eff: 0.9, cdA: 0.48, crr: 0.013, brakeF: 0.62, halfW: 0.88, front: 2.0, rear: 1.8, torque: 1.45 },
  slotBody: 0, slotWheel: [0, 0, 0, 0], slotSteer: 0,
  steerMat: m4(), inp: new Float64Array(2), tris: F40_COUNT / 3,
  _t: m4(), _t2: m4(), _z4: new Float32Array(4), set: null,
  build() {
    const fam = mkFamily('car_f40', { src: 'mat_sport', noCube: true });
    this.slotBody = objSlot();
    for (let i = 0; i < 4; i++) this.slotWheel[i] = objSlot();
    this.slotSteer = objSlot();
    const set = this.set = new MeshSet(fam);
    const verts = Uint8Array.from(atob(F40_VERTS), c => c.charCodeAt(0));
    const index = Uint8Array.from(atob(F40_INDEX), c => c.charCodeAt(0));
    const mesh = {
      vb: mkBuf(verts.byteLength, BU.V, verts),
      ib: mkBuf(index.byteLength, BU.I, index),
      count: F40_COUNT,
      bounds: { c: [0, 0.7, 0], r: 3.2, min: [-2.35, 0, -1.13], max: [2.35, 1.4, 1.13] }
    };
    set.add(mesh, this.slotBody, 3);
    R.drawables.push({ draw(pass, ctx) { if (ctx.kind === KIND.SHADOW && ctx.cascade === 3) return; set.draw(pass, ctx); } });
    const zero = this._z4;
    m4ident(this._t); this.place(this._t, zero, zero); this.place(this._t, zero, zero);
  },
  place(body, spin, susp) {
    const t = this._t2;
    objPrev(this.slotBody).set(objModel(this.slotBody)); objModel(this.slotBody).set(body);
    for (let i = 0; i < 4; i++) { const s = this.slotWheel[i]; objPrev(s).set(objModel(s)); objModel(s).set(body); }
    objPrev(this.slotSteer).set(objModel(this.slotSteer)); objModel(this.slotSteer).set(body);
  },
};
CAR_MODELS.f40 = F40;
