// Glass and lenses (transparent pass). Two draws per mesh:
//   GLASS_MUL: multiplies the background by the colored transmittance;  GLASS_ADD: adds environment reflection + sun highlight.
// material: id 0 = window glass (vertex color = tint), 1 = clear fluted lens (headlight)
#include mesh_vert
#include fwd_common
fn shade(in: V2F, ff: bool) -> vec4f {
  var N = normalize(in.nrm); if (!ff) { N = -N; }
  let V = normalize(F.camPos.xyz - in.wpos);
  let id = matId(in.mat);
  var milk = 0.0;
  var flute = 1.0;
  if (id == 1u) {
    // headlight lens: clear glass with subtle vertical flutes (only slightly deflect the reflection); no milky veil or streaks
    let zd = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz);
    let k = sin(in.ext.z * 6.2831853 / 0.0085); let kf = sat(1.0 - fwidth(in.ext.z) / 0.0085 * 2.5);
    N = normalize(N + zd * k * 0.16 * kf);
    flute = mix(0.96, 0.9 + 0.1 * k * k, kf);
  }
  let nv = max(dot(N, V), 1e-3);
  // windshield and rear window (normal along the car) reflect the sky a bit more than the side windows
  let nO = normalize((vec4f(N, 0.0) * O.model).xyz);
  let ws = smoothstep(0.3, 0.6, abs(nO.x));   // 1 = windshield/rear window
  let f0w = mix(0.08, 0.17, ws);
  let fr = min(fSchlick1(select(f0w, 0.06, id == 1u), nv), 0.6);   // windows slightly above real glass (readable sky reflection); headlight lens like ordinary glass
#ifdef GLASS_MUL
  // transmittance: nearly neutral tint, slightly greenish and CONSTANT with angle (the angular power saturated to green
  // when viewed at grazing angle through two panes)
  // windshield and rear window slightly darker (greenish tint, ~0.78) than the sides; gradient band at the top of the windshield
  var base = select(mix(vec3f(0.84, 0.875, 0.86), vec3f(0.75, 0.805, 0.78), ws), in.col.rgb, id == 1u);
  if (id != 1u && nO.x > 0.3) { base *= mix(vec3f(1.0), vec3f(0.5, 0.66, 0.62), smoothstep(1.3, 1.4, in.ext.y)); }
  let tint = base * (1.0 - fr) * (1.0 - milk) * flute;
  return vec4f(tint, 1.0);
#else
  let R = reflect(-V, N);
  var env = textureSampleLevel(tEnv, sClamp, R, select(1.2, 0.3, id == 1u)).rgb;
  env = mix(vec3f(lum(env)), env, 0.65);
  // reflection floor: the sky gradient (from ambient light) shows on the glass even when the local cubemap is dark
  if (id != 1u) { let up = sat(R.y * 0.5 + 0.5); env = max(env, shIrr(normalize(R + vec3f(0.0, 0.5, 0.0))) * mix(0.25, 0.75, up)); }   // reflection without spurious colors (zebras/license plates turned into red and green patches on the glass)
  let L = F.sunDir.xyz; let H = normalize(L + V); let nl = sat(dot(N, L));
  let sh = sunShadow(in.wpos, N, in.pos.xy, nl);
  let spec = F.sunCol.rgb * nl * sh * fr * min(dGGX(sat(dot(N, H)), 0.003) * vSmith(nv, nl, 0.003), 14.0);
  var c = env * fr + spec;
  // milky scattering of the lens
  c += (shIrr(N) + F.sunCol.rgb * nl * sh / PI) * milk;
  if (!ff) { c *= 0.35; }
  return vec4f(c, 0.0);
#endif
}
