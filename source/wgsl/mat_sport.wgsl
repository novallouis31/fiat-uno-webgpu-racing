// Generic materials for the extra cars (F40, Model 3).
// id: 1 paint (vertex color) | 2 dark plastic | 3 rubber | 4 tire | 5 rim | 6 metal
//     7 light (a<0.5 headlight, a>=0.5 taillight) | 8 interior | 9 carbon / dark texture | 10 accent
// Body slot p0: x = brake light, y = reverse light, z = headlights. Wheel slot p0.x = |spin|.
#include mesh_vert

fn blurSpot(w: f32) -> f32 { return sat(w / 30.0); }

fn surf(in: V2F, ff: bool) -> Surface {
  var s = surfDefault(normalize(in.nrm));
  let id = matId(in.mat); let pa = matA(in.mat);
  let lp = in.ext.xyz;
  s.albedo = in.col.rgb;
  switch (id) {
    case 1u: {   // clear-coated metallic paint, color comes from the vertex
      let nO = normalize((vec4f(s.normal, 0.0) * O.model).xyz);
      let wt = abs(nO) / (abs(nO.x) + abs(nO.y) + abs(nO.z));
      let fl = textureSample(tNoise, sLin, lp.zy * 21.0).a * wt.x
             + textureSample(tNoise, sLin, lp.xz * 21.0).a * wt.y
             + textureSample(tNoise, sLin, lp.xy * 21.0).a * wt.z - 0.5;
      s.albedo = in.col.rgb * (1.0 + 0.06 * fl);
      s.metal = select(0.5, 0.72, pa > 0.5);
      s.rough = 0.28 + 0.05 * fl;
      s.coat = 1.0;
    }
    case 2u: { s.albedo = in.col.rgb * 0.9; s.rough = 0.88; s.metal = 0.05; s.ao = 0.55; }
    case 3u: { s.albedo = in.col.rgb; s.rough = 0.86; s.metal = 0.0; }
    case 4u: {
      let r = length(lp.xy);
      let blur = blurSpot(O.p0.x);
      let rib = 0.5 + 0.5 * sin(atan2(lp.y, lp.x) * 96.0);
      s.albedo = in.col.rgb * (0.75 + 0.25 * rib * (1.0 - blur));
      s.rough = 0.93; s.metal = 0.0; s.ao = 0.5;
    }
    case 5u: {
      let r = length(lp.xy);
      let a = atan2(lp.y, lp.x);
      let spoke = 0.5 + 0.5 * cos(a * select(10.0, 5.0, pa > 0.5));
      let ring = 1.0 - smoothstep(0.008, 0.016, abs(r - 0.26));
      s.albedo = in.col.rgb * (0.8 + 0.32 * spoke * (1.0 - blurSpot(O.p0.x)) + 0.2 * ring);
      s.metal = 0.85; s.rough = select(0.24, 0.38, pa > 0.5); s.coat = 0.2;
    }
    case 6u: { s.metal = 0.9; s.rough = select(0.16, 0.42, pa > 0.5); }
    case 7u: {   // headlight / taillight
      s.rough = 0.22; s.coat = 0.6;
      if (pa < 0.5) {
        s.albedo = in.col.rgb * 0.7;
        s.emissive = 0.05 + O.p0.z * 0.85;
      } else {
        let br = sat(O.p0.x);
        s.albedo = in.col.rgb * mix(0.16, 0.6, br);
        s.emissive = mix(0.04, 0.9, br);
      }
    }
    case 8u: { s.albedo = in.col.rgb * 0.85; s.rough = 0.92; s.ao = 0.5; }
    case 9u: {   // carbon / ribbed dark trim
      let w = sin(lp.x * 520.0) * sin(lp.z * 520.0);
      s.albedo = in.col.rgb * (0.7 + 0.12 * w); s.rough = 0.5; s.metal = 0.25;
    }
    case 10u: { s.albedo = in.col.rgb; s.rough = 0.3; s.metal = 0.4; s.coat = 0.7; }
    default: {}
  }
  return s;
}
