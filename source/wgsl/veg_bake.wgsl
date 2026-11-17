// Vegetation — bakes the impostors: orthographic projection of the mesh in 8 azimuths; output albedo(+AO)+coverage and normal+leaf mask.
struct BU { vp: mat4x4f }
@group(0) @binding(0) var<uniform> U: BU; // @dyn
@group(0) @binding(1) var tLeaf: texture_2d<f32>;
@group(0) @binding(2) var sLeaf: sampler;
@group(0) @binding(3) var tNoise: texture_2d<f32>;
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec4f, @location(2) uv: vec2f, @location(3) mat: vec4u, @location(4) col: vec4f }
struct V2F { @builtin(position) pos: vec4f, @location(0) nrm: vec3f, @location(1) uv: vec2f, @location(2) @interpolate(flat) mat: u32, @location(3) col: vec4f }
@vertex fn vs(in: VIn) -> V2F {
  var o: V2F; o.pos = U.vp * vec4f(in.pos, 1.0); o.nrm = in.nrm.xyz; o.uv = in.uv; o.mat = in.mat.x | (in.mat.z << 16u); o.col = in.col; return o;
}
struct BOut { @location(0) a: vec4f, @location(1) n: vec4f }
@fragment fn fs(in: V2F) -> BOut {
  var o: BOut; let n = normalize(in.nrm);
  if ((in.mat & 255u) == 1u) {
    let t = textureSample(tLeaf, sLeaf, in.uv);
    if (t.a < 0.25) { discard; }
    o.a = vec4f(t.rgb * in.col.rgb * mix(1.0, in.col.a, 0.75), smoothstep(0.25, 0.6, t.a));
    o.n = vec4f(n * 0.5 + 0.5, 1.0);
  } else {
    let bt = (in.mat >> 16u) & 255u;
    // bark: high-contrast vertical striations (the impostor trunk must not read as smooth and bright)
    let k = (0.3 + 0.75 * smoothstep(0.3, 0.75, textureSample(tNoise, sLeaf, in.uv * vec2f(0.55, 0.11)).b)) * (0.7 + 0.5 * textureSample(tNoise, sLeaf, in.uv * vec2f(0.21, 0.07)).r);
    o.a = vec4f(in.col.rgb * k * 0.56 * mix(1.0, in.col.a, 0.75), 1.0);
    o.n = vec4f(n * 0.5 + 0.5, 0.0);
  }
  return o;
}
