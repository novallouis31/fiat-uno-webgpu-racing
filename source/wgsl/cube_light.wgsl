// Simplified direct lighting for the environment cubemap (shadow only from the static map).
@group(1) @binding(1) var tShadowS: texture_depth_2d;
@group(1) @binding(2) var sCmp: sampler_comparison;
fn cubeLit(s: Surface, wp: vec3f) -> vec3f {
  let L = F.sunDir.xyz; let nl = sat(dot(s.normal, L));
  let lp = F.shadowVP[3] * vec4f(wp + s.normal * 0.8, 1.0); let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  var sh = 1.0;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) { sh = textureSampleCompareLevel(tShadowS, sCmp, uv, lp.z - 0.0015); }
  let dif = s.albedo * (1.0 - s.metal);
  let sh0 = F.sh[0].rgb + F.sh[1].rgb * s.normal.y;
  var col = dif * (F.sunCol.rgb * (nl * sh + s.sss * 0.25 * sh) / 3.14159 + max(sh0, vec3f(0.0)) * s.ao) + s.albedo * s.emissive * s.emissive * 16.0;
  col += mix(vec3f(0.04), s.albedo, s.metal) * max(sh0, vec3f(0.0)) * 0.6 * (1.0 - s.rough);
  // simple distance fog
  let d = distance(wp, P.camPos.xyz); let T = exp(-d * F.fog.x * 0.55);
  return mix(max(F.sh[0].rgb + F.sh[1].rgb * 0.25, vec3f(0.0)) * 0.35 + F.fogCol.rgb, col, T);
}
