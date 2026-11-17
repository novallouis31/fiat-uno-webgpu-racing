// Generic test materials (to be replaced by the scene materials).
#include mesh_vert
fn surf(in: V2F, ff: bool) -> Surface {
  var s = surfDefault(normalize(in.nrm));
  let id = matId(in.mat);
  s.albedo = in.col.rgb;
  if (id == 1u) { s.metal = 1.0; s.rough = 0.25; }
  else if (id == 2u) { s.metal = 0.6; s.rough = 0.4; s.coat = 1.0; }
  else if (id == 3u) { s.emissive = 0.5; }
  else if (id == 4u) {
    let n = textureSample(tNoise, sLin, in.wpos.xz * 0.05).r;
    let w = smoothstep(0.45, 0.55, n);
    s.albedo = mix(vec3f(0.06), vec3f(0.025), w); s.rough = mix(0.85, 0.04, w); s.wet = w;
    let g = textureSample(tNoise, sLin, in.wpos.xz * 2.0).rg - 0.5;
    s.normal = bumpXZ(s.normal, g * 0.5 * (1.0 - w));
  }
  else if (id == 5u) { s.rough = 0.9; }
  return s;
}
