// Default vertex shader for MeshBuilder meshes with object transform.
struct Obj { model: mat4x4f, prevModel: mat4x4f, p0: vec4f, p1: vec4f, p2: vec4f, p3: vec4f }
@group(2) @binding(0) var<uniform> O: Obj; // @dyn
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec4f, @location(2) uv: vec2f, @location(3) mat: vec4u, @location(4) col: vec4f }
fn vert(in: VIn) -> VSOut {
  var o: VSOut;
  o.wpos = (O.model * vec4f(in.pos, 1.0)).xyz;
  o.pwpos = (O.prevModel * vec4f(in.pos, 1.0)).xyz;
  o.nrm = (O.model * vec4f(in.nrm.xyz, 0.0)).xyz;
  o.uv = in.uv;
  o.mat = in.mat.x | (in.mat.y << 8u) | (in.mat.z << 16u) | (in.mat.w << 24u);
  o.col = in.col;
  o.ext = vec4f(in.pos, in.nrm.w);   // local position + weight
  return o;
}
