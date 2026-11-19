// Tesla Model 3 — imported photoreal GLB, baked to MeshBuilder-compatible buffers.
// Geometry comes from tools/glb2game.js (see models/ATTRIBUTION.json in the lab).
const TESLA = {
  id: 'tesla', name: 'tesla', label: 'Tesla Model 3',
  wheelbase: 2.87, trackF: 1.58, trackR: 1.58, wheelR: 0.34,
  hubs: [[1.34, 0.34, -0.79], [1.34, 0.34, 0.79], [-1.53, 0.34, -0.79], [-1.53, 0.34, 0.79]],
  phys: { m: 1750, Izz: 2100, L: 2.87, a: 1.34, b: 1.53, tw: 1.58, h: 0.50, R: 0.34,
    mu: 1.38, B: 9.5, C: 1.35, gears: [3.5, 2.1, 1.40, 1.00, 0.78], final: 4.0, rev: 3.5,
    eff: 0.92, cdA: 0.55, crr: 0.010, brakeF: 0.60, halfW: 0.86, front: 2.1, rear: 1.9, torque: 1.8 },
  slotBody: 0, slotWheel: [0, 0, 0, 0], slotSteer: 0,
  steerMat: m4(), inp: new Float64Array(2), tris: TESLA_COUNT / 3,
  _t: m4(), _t2: m4(), _z4: new Float32Array(4), set: null,
  build() {
    const fam = mkFamily('car_tesla', { src: 'mat_sport', noCube: true });
    this.slotBody = objSlot();
    for (let i = 0; i < 4; i++) this.slotWheel[i] = objSlot();
    this.slotSteer = objSlot();
    const set = this.set = new MeshSet(fam);
    const verts = Uint8Array.from(atob(TESLA_VERTS), c => c.charCodeAt(0));
    const index = Uint8Array.from(atob(TESLA_INDEX), c => c.charCodeAt(0));
    const mesh = {
      vb: mkBuf(verts.byteLength, BU.V, verts),
      ib: mkBuf(index.byteLength, BU.I, index),
      count: TESLA_COUNT,
      bounds: { c: [0, 0.7, 0], r: 3.5, min: [-2.35, 0, -1.05], max: [2.35, 1.42, 1.05] }
    };
    set.add(mesh, this.slotBody, 3);
    R.drawables.push({ draw(pass, ctx) { if (ctx.kind === KIND.SHADOW && ctx.cascade === 3) return; set.draw(pass, ctx); } });
    const zero = this._z4;
    m4ident(this._t); this.place(this._t, zero, zero); this.place(this._t, zero, zero);
  },
  place(body, spin, susp) {
    const t = this._t2;
    objPrev(this.slotBody).set(objModel(this.slotBody)); objModel(this.slotBody).set(body);
    for (let i = 0; i < 4; i++) {
      const s = this.slotWheel[i];
      objPrev(s).set(objModel(s)); objModel(s).set(body);
    }
    objPrev(this.slotSteer).set(objModel(this.slotSteer)); objModel(this.slotSteer).set(body);
  },
};
CAR_MODELS.tesla = TESLA;
