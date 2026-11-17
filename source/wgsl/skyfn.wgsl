// Lookup of the pre-generated sky + sun disk. Requires tSky, sSky, F.
fn skyUV(d: vec3f) -> vec2f {
  let el = asin(clamp(d.y, -1.0, 1.0)); let az = atan2(d.z, d.x);
  let t = pow(sat((el - SKY_EL0) / SKY_ELR), 1.0 / 1.5);
  return vec2f(az / (2.0 * PI), 1.0 - t);
}
fn skyColor(d: vec3f) -> vec3f {
  let uv = skyUV(d);
  // explicit gradients: avoids the atan2 seam at u = ±0.5
  let s = textureSampleLevel(tSky, sSky, uv, 0.0);
  var c = s.rgb;
  let cs = dot(d, F.sunDir.xyz);
  // sun disk with limb darkening + halo
  let disc = smoothstep(0.99987, 0.99993, cs);
  c += F.sunCol.rgb * (disc * 420.0 + pow(sat(cs), 900.0) * 6.0 + pow(sat(cs), 90.0) * 0.5) * s.a;
  return c;
}
