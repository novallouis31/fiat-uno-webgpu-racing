// WebGPU device, resource utilities and WGSL preprocessor.
const Q = new URLSearchParams(location.search);
// Quality presets. "low" is the default: it targets a laptop NVIDIA T1200 (4 GB)
// instead of the M4 Max used for the original demo. ?quality=high restores the
// original settings; the choice is remembered in localStorage.
const QUALITY_SETS = {
  low:    { label: 'Low',    resScale: 0.70, shadows: 1024, staticShadow: 2048, env: 256, skyW: 2048, skyH: 512,  volDist: 150, bloom: 4, cubeFaces: 1, vegStep: 1.30 },
  medium: { label: 'Medium', resScale: 0.85, shadows: 1536, staticShadow: 3072, env: 512, skyW: 3072, skyH: 768,  volDist: 180, bloom: 5, cubeFaces: 2, vegStep: 1.12 },
  high:   { label: 'High',   resScale: 1.00, shadows: 2048, staticShadow: 4096, env: 512, skyW: 4096, skyH: 1024, volDist: 220, bloom: 6, cubeFaces: 2, vegStep: 1.00 }
};
const QUALITY_NAME = Q.get('quality') || (() => { try { return localStorage.getItem('uno-quality'); } catch (e) { return null; } })();
const QUALITY_KEY = QUALITY_SETS[QUALITY_NAME] ? QUALITY_NAME : 'low';
const QUALITY = QUALITY_SETS[QUALITY_KEY];
const BUILD = [];           // scene constructors registered by the other files: async fn(), run in order by main()
const GAME = { ready: false, mode: Q.get('scene') || 'game', capture: Q.has('cap'), tick: null, init: null, minFrameMs: 0, gpuWorstMs: 0, ui: false };
// Game opened by a person (start screen, panel, sound) × tool (capture, poses, test, benchmarking): the work
// tools use ?cap, ?perf, ?replay or run in an automated browser, and nothing changes for them — no menu, no panel.
// ?ui=1 forces the full game (this is how the menu, input and sound tests open it); ?ui=0 forces tool mode.
GAME.ui = Q.has('ui') ? Q.get('ui') !== '0' : !(Q.has('cap') || Q.has('perf') || Q.has('replay') || Q.has('auto') || Q.has('scene') || navigator.webdriver);
// Time in a typed array (per-frame writes with no heap boxing): RT[0] = accumulated time (s), RT[1] = dt of the rendered frame, RT[2] = dt requested by the game
const RT = new Float64Array([0, 1 / 60, 1 / 60, 0]);   // RT[3] = actual interval of the last frame (ms), for the statistics
const G = { dev: null, ctx: null, fmt: 'bgra8unorm', W: 0, H: 0, hasTS: false, canvas: null };

async function gpuInit() {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
  const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!ad) throw new Error('No WebGPU adapter.');
  const feats = [];
  // 'timestamp-query' is requested during performance measurement (?perf) and in the game opened by a person (benchmarks and statistics
  // show GPU time when the browser allows it); ?nots disables it. Capture, poses and tests continue without the feature.
  for (const f of ['float32-filterable', 'rg11b10ufloat-renderable'].concat((Q.has('perf') || GAME.ui) && !Q.has('nots') ? ['timestamp-query'] : [])) if (ad.features.has(f)) feats.push(f);
  if (!ad.features.has('float32-filterable')) throw new Error('GPU without float32-filterable.');
  G.hasTS = feats.includes('timestamp-query');
  G.dev = await ad.requestDevice({
    requiredFeatures: feats,
    requiredLimits: { maxColorAttachmentBytesPerSample: Math.min(64, ad.limits.maxColorAttachmentBytesPerSample), maxSampledTexturesPerShaderStage: 24, maxBufferSize: ad.limits.maxBufferSize, maxTextureDimension2D: 8192 }
  });
  G.dev.addEventListener('uncapturederror', e => { console.error('GPU: ' + e.error.message); G.lastErr = e.error.message; });
  G.canvas = document.getElementById('c');
  const res = (Q.get('res') || '').split('x');
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * QUALITY.resScale;
  G.W = res.length === 2 ? +res[0] : Math.round(innerWidth * dpr);
  G.H = res.length === 2 ? +res[1] : Math.round(innerHeight * dpr);
  G.W = clamp(G.W & ~1, 320, 5120); G.H = clamp(G.H & ~1, 180, 2880);
  G.canvas.width = G.W; G.canvas.height = G.H;
  G.ctx = G.canvas.getContext('webgpu');
  G.fmt = navigator.gpu.getPreferredCanvasFormat();
  G.ctx.configure({ device: G.dev, format: G.fmt, alphaMode: 'opaque' });
}

const TU = { RT: 0x10, TB: 0x04, CS: 0x01, CD: 0x02, ST: 0x08 };
function mkTex(w, h, format, usage, extra) {
  const d = { size: [w, h, 1], format, usage: usage ?? (TU.RT | TU.TB), mipLevelCount: 1 };
  if (extra) Object.assign(d, extra);
  return G.dev.createTexture(d);
}
function mkBuf(size, usage, data) {
  const b = G.dev.createBuffer({ size: (size + 3) & ~3, usage, mappedAtCreation: !!data });
  if (data) { new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); b.unmap(); }
  return b;
}
const BU = { V: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, I: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, U: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, S: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST };

// Preprocessor: #include name, #define NAME [value], #ifdef/#ifndef/#else/#endif. Replaces macros as whole words.
function wgslPP(name, defs) {
  defs = Object.assign({}, defs);
  const seen = {};
  const run = (nm) => {
    const src = WGSL[nm]; if (src === undefined) throw new Error('wgsl missing: ' + nm);
    const out = []; const st = []; let on = true;
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (t[0] === '#') {
        const p = t.split(/\s+/);
        if (p[0] === '#ifdef') { st.push(on); on = on && (p[1] in defs); continue; }
        if (p[0] === '#ifndef') { st.push(on); on = on && !(p[1] in defs); continue; }
        if (p[0] === '#else') { on = st[st.length - 1] && !on; continue; }
        if (p[0] === '#endif') { on = st.pop(); continue; }
        if (!on) continue;
        if (p[0] === '#include') { if (!seen[p[1]]) { seen[p[1]] = 1; out.push(run(p[1])); } continue; }
        if (p[0] === '#define') { defs[p[1]] = p.slice(2).join(' '); continue; }
        continue;
      }
      if (on) out.push(line);
    }
    return out.join('\n');
  };
  let code = 'diagnostic(off, derivative_uniformity);\n' + run(name);
  for (const k in defs) if (defs[k] !== '' && defs[k] !== true) code = code.replace(new RegExp('\\b' + k + '\\b', 'g'), defs[k]);
  return code;
}
const _modCache = {};
function mkShader(name, defs) {
  const key = name + JSON.stringify(defs || {});
  if (_modCache[key]) return _modCache[key];
  const code = wgslPP(name, defs);
  const m = G.dev.createShaderModule({ code, label: name });
  m.getCompilationInfo().then(info => {
    for (const msg of info.messages) if (msg.type === 'error') {
      const ln = code.split('\n'); console.error(`WGSL ${name}:${msg.lineNum}: ${msg.message}\n${ln.slice(Math.max(0, msg.lineNum - 3), msg.lineNum + 1).join('\n')}`);
      G.lastErr = `WGSL ${name}:${msg.lineNum}: ${msg.message}`;
    }
  });
  return _modCache[key] = m;
}
// Fullscreen pipeline (single triangle) with automatic layout.
function mkFsPipe(name, defs, targets, opts) {
  const mod = mkShader(name, defs);
  return G.dev.createRenderPipeline({
    label: name, layout: 'auto',
    vertex: { module: mod, entryPoint: 'vs' },
    fragment: { module: mod, entryPoint: (opts && opts.entry) || 'fs', targets: targets.map(t => typeof t === 'string' ? { format: t } : t) },
    primitive: { topology: 'triangle-list' },
  });
}
function mkBG(pipe, idx, entries) {
  return G.dev.createBindGroup({ layout: pipe.getBindGroupLayout(idx), entries: entries.map((r, i) => ({ binding: i, resource: (r instanceof GPUBuffer) ? { buffer: r } : r })) });
}
function mkBGL(layout, entries) {
  return G.dev.createBindGroup({ layout, entries: entries.map((r, i) => ({ binding: i, resource: (r instanceof GPUBuffer) ? { buffer: r } : (r && r.buffer instanceof GPUBuffer) ? r : r })) });
}
// reusable pass descriptor (no per-frame allocation: only .view is swapped)
function mkPassDesc(nColor, depth, clear, label) {
  const d = { label, colorAttachments: [] };
  for (let i = 0; i < nColor; i++) d.colorAttachments.push({ view: null, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } });
  if (depth) d.depthStencilAttachment = { view: null, depthLoadOp: depth === 'load' || depth === 'ro' ? 'load' : 'clear', depthStoreOp: 'store', depthClearValue: depth === 'clear1' ? 1 : 0 };
  if (depth === 'ro') { const a = d.depthStencilAttachment; delete a.depthLoadOp; delete a.depthStoreOp; delete a.depthClearValue; a.depthReadOnly = true; }
  return d;
}
// generates mips by linear blit (used at initialization)
let _mipPipe = {};
function genMips(tex, format, layers) {
  const dev = G.dev;
  if (!_mipPipe[format]) _mipPipe[format] = mkFsPipe('blit', {}, [format]);
  const pipe = _mipPipe[format];
  const samp = dev.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const enc = dev.createCommandEncoder();
  for (let L = 0; L < (layers || 1); L++) for (let m = 1; m < tex.mipLevelCount; m++) {
    const srcV = tex.createView({ dimension: '2d', baseMipLevel: m - 1, mipLevelCount: 1, baseArrayLayer: L, arrayLayerCount: 1 });
    const dstV = tex.createView({ dimension: '2d', baseMipLevel: m, mipLevelCount: 1, baseArrayLayer: L, arrayLayerCount: 1 });
    const p = enc.beginRenderPass({ colorAttachments: [{ view: dstV, loadOp: 'clear', storeOp: 'store' }] });
    p.setPipeline(pipe); p.setBindGroup(0, mkBG(pipe, 0, [srcV, samp])); p.draw(3); p.end();
  }
  dev.queue.submit([enc.finish()]);
}
const mipCount = (w, h) => 1 + Math.floor(Math.log2(Math.max(w, h)));
