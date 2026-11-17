// Materials for track-side props (barriers, buildings, signs). Vertex col.a = baked ambient occlusion.
// id: 1 galvanized steel | 2 paint (a = roughness, b = metal) | 3 concrete | 4 tire (col = paint) | 5 facade glass
//     6 emissive (a = intensity) | 7 sign (atlas) | 8 seats | 9 corrugated roofing | 10 tarp | 11 pole (fades in the distance)
//     (ids 1, 2 and 11: byte c = dithered fade-out distance / 4 m; 0 = never fades)
//     12 distant tire wall (substitute) | 13 roll-up door | 14 cone | 15 nearby tires (fade out in the distance)
//     18 starting-light bulb (lit with F.car2.x)
//     17 painted ribbed sheet   (people — crowd, teams, officials — belong to the world_crowd family)
#include mesh_vert
#include palette
@group(3) @binding(0) var tAtlas: texture_2d<f32>;
fn camDist(wp: vec3f) -> f32 {
#ifdef PASS_CUBE
  return distance(wp, P.camPos.xyz);
#else
  return distance(wp, F.camPos.xyz);
#endif
}
fn surf(in: V2F, ff: bool) -> Surface {
  var N = normalize(in.nrm); if (!ff) { N = -N; }
  var s = surfDefault(N);
  let id = matId(in.mat); let wp = in.wpos; let dist = camDist(wp);
  let near = 1.0 - smoothstep(8.0, 60.0, dist);
  // noise on surfaces of any orientation: slanted projection
  let pu = wp.xz + wp.yy * vec2f(0.71, -0.53);
  let n1 = textureSample(tNoise, sLin, pu * 0.19);
  let n2 = textureSample(tNoise, sLin, pu * 2.3);
  s.ao = in.col.a;
  var bump = vec3f(0.0);
#ifdef PASS_GBUF
  // dithered fade of thin parts: material byte c = start distance / 4 m (ends at 1.4x)
  let fd = f32((in.mat >> 24u) & 255u) * 4.0;
  if (fd > 0.0 && (id == 1u || id == 2u || id == 11u || id == 7u || id == 17u)) { if (smoothstep(fd, fd * 1.4, dist) > ign(in.pos.xy, F.misc.y) * 0.98 + 0.01) { discard; } }
#endif
  if (id == 1u || id == 11u) {
    let rust = smoothstep(0.66, 0.82, n1.b * 0.55 + n2.r * 0.45) * 0.55;
    s.albedo = mix(vec3f(0.5, 0.52, 0.54) * (0.8 + 0.35 * n1.r), vec3f(0.16, 0.08, 0.04), rust);
    s.metal = select(0.9, 0.55, id == 11u) * (1.0 - rust); s.rough = 0.42 + 0.2 * n2.g + rust * 0.3; if (id == 11u) { s.albedo *= 0.55; }
    // dirt streaks
    let streak = textureSample(tNoise, sLin, vec2f(pu.x * 1.3, wp.y * 0.12)).r;
    s.albedo *= 0.75 + 0.3 * streak;
    // accumulated dirt: earth dust and rubber in medium-scale patches, stronger near the ground
    let hgA = wp.y - wmHeight(wp.xz);
    let dirtM = sat(smoothstep(0.5, 0.78, n1.g * 0.6 + n2.b * 0.5) * 0.7 + (1.0 - smoothstep(0.15, 0.7, hgA)) * 0.45);
    s.albedo = mix(s.albedo, vec3f(0.13, 0.11, 0.085) * (0.7 + 0.5 * n2.r), dirtM * 0.6); s.rough = mix(s.rough, 0.85, dirtM * 0.7); s.metal *= 1.0 - dirtM * 0.6;
  } else if (id == 2u) {
    // paint: tone variation, vertical dirt streaks and fine chips/wear (no flat color)
    let streak = textureSample(tNoise, sLin, vec2f(pu.x * 1.1, wp.y * 0.09)).g;
    let chip = smoothstep(0.7, 0.84, n2.b * 0.6 + n1.g * 0.5) * near;
    var c = in.col.rgb * (0.8 + 0.3 * n1.r) * (0.94 + 0.12 * n2.a * near) * (0.8 + 0.3 * streak);
    c = mix(c, c * 0.5 + vec3f(0.02, 0.018, 0.015), chip * 0.6);
    // meter-scale wear (faded/scraped paint) and dirt splatter near the ground
    let wearM = smoothstep(0.52, 0.8, textureSample(tNoise, sLin, vec2f(pu.x * 0.31, wp.y * 0.6)).b * 0.6 + n1.b * 0.5);
    c = mix(c, c * 0.62 + vec3f(0.07, 0.068, 0.062), wearM * 0.5);
    let hgP = wp.y - wmHeight(wp.xz);
    c = mix(c, vec3f(0.1, 0.085, 0.065) * (0.7 + 0.5 * n2.g), (1.0 - smoothstep(0.05, 0.6, hgP)) * (0.3 + 0.5 * n1.r) * step(hgP, 3.0));
    s.albedo = c;
    s.rough = 0.22 + matA(in.mat) * 0.7 + 0.1 * n2.g + chip * 0.2; s.metal = matB(in.mat) * (1.0 - chip * 0.5);
    bump = (vec3f(n2.r, n2.g, n2.b) - 0.5) * 0.06 * near;
  } else if (id == 3u) {
    let streak = textureSample(tNoise, sLin, vec2f(pu.x * 0.9, wp.y * 0.07)).g;
    // concrete: nearly uniform tone up close (no noise blotches); the reading comes from the joints, panels and streaks
    var c = in.col.rgb * (0.92 + 0.12 * n1.r) * (0.97 + 0.06 * n2.a * near);
    c *= 0.84 + 0.2 * streak;
    // formwork joints
    let jx = abs(fract(dot(wp.xz, vec2f(0.7071, 0.7071)) / 3.4) - 0.5) * 3.4; let jy = abs(fract(wp.y / 1.25) - 0.5) * 1.25;
    let jw = max(fwidth(wp.y) + fwidth(wp.x) + fwidth(wp.z), 0.006);
    let j = (1.0 - smoothstep(0.012, 0.012 + jw * 1.2, min(jx, jy))) * (1.0 - smoothstep(60.0, 220.0, dist));
    // each formwork panel with its own tone; dirty band along the ground and dark streak under the edges
    let cell = floor(vec2f(dot(wp.xz, vec2f(0.7071, 0.7071)) / 3.4, wp.y / 1.25));
    c *= 0.84 + 0.26 * fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453);
    // meter-scale weathering: damp/soot stains and lighter horizontal bands (leaching)
    let wth = textureSample(tNoise, sLin, vec2f(pu.x * 0.043, wp.y * 0.11));
    c *= 0.8 + 0.34 * smoothstep(0.3, 0.72, wth.g); c = mix(c, c * vec3f(0.86, 0.9, 0.84), smoothstep(0.62, 0.8, wth.r) * 0.6);
    // form-tie holes (two per panel) and damp stains running down from the horizontal joints
    let fx = fract(dot(wp.xz, vec2f(0.7071, 0.7071)) / 3.4); let fy = fract(wp.y / 1.25);
    let hd = length(vec2f((abs(fx - 0.5) - 0.3) * 3.4, (fy - 0.5) * 1.25));
    let hole = (1.0 - smoothstep(0.028, 0.028 + jw * 1.2, hd)) * (1.0 - smoothstep(40.0, 120.0, dist));
    let drip = smoothstep(0.55, 0.8, textureSample(tNoise, sLin, vec2f(pu.x * 2.1, 0.37)).b) * (1.0 - fy) * (1.0 - fy);
    c *= 1.0 - 0.3 * drip;
    let hgC = wp.y - wmHeight(wp.xz);
    c = mix(c, c * 0.5 + vec3f(0.03, 0.026, 0.02), (1.0 - smoothstep(0.03, 0.55, hgC)) * (0.35 + 0.5 * n1.g) * step(hgC, 3.0));
    s.albedo = mix(c, c * 0.4, max(j * 0.8, hole * 0.8)); s.rough = 0.74 + 0.2 * wth.g; s.ao *= 1.0 - max(j * 0.4, hole * 0.5);
    bump = (vec3f(n2.r, n2.g, n2.b) - 0.5) * 0.1 * near;
  } else if (id == 4u || id == 15u || id == 12u) {
    var fade = smoothstep(150.0, 190.0, dist);
#ifdef PASS_GBUF
    let th = ign(in.pos.xy, F.misc.y) * 0.98 + 0.01;
    if (id == 15u && fade > th) { discard; }
    if (id == 12u && fade <= th) { discard; }
#endif
    let painted = smoothstep(0.08, 0.2, max(in.col.r, max(in.col.g, in.col.b)));
    let chip = smoothstep(0.5, 0.72, n2.b * 0.6 + n1.g * 0.5);
    var c = mix(vec3f(0.022, 0.022, 0.024) * (0.7 + 0.8 * n2.r), in.col.rgb * (0.75 + 0.3 * n1.r), painted * (1.0 - chip * 0.55));
    // dust on the top faces
    c = mix(c, vec3f(0.11, 0.09, 0.065), sat(N.y) * 0.5 * (0.5 + 0.5 * n1.b));
    // each stack with its own tone (fresh, faded or nearly worn-out paint) and earth dirt at the base
    let pid = floor(wp.xz / 0.66); let ph2 = fract(sin(dot(pid, vec2f(127.1, 311.7))) * 43758.5453);
    c *= 0.62 + 0.6 * ph2; c = mix(c, vec3f(dot(c, vec3f(0.33))), 0.45 * step(0.6, ph2));
    let hgT = wp.y - wmHeight(wp.xz);
    c = mix(c, vec3f(0.1, 0.085, 0.06) * (0.7 + 0.5 * n2.r), (1.0 - smoothstep(0.0, 0.5, hgT)) * 0.55);
    s.albedo = c; s.rough = 0.82;
    if (id == 15u) {
      // stack of 5 tires (lathe; uv.y runs along the profile: 4 points per tire): dark gap between tires, brighter shoulder,
      // tread grooves and the central hole on top
      let idx = in.uv.y * 22.0; let g = fract((idx + 0.5) * 0.25);
      let gap = (1.0 - smoothstep(0.0, 0.17, min(g, 1.0 - g))) * step(idx, 19.6);
      s.albedo *= 1.0 - 0.8 * gap; s.ao *= 1.0 - 0.85 * gap;
      let tread = smoothstep(0.3, 0.45, abs(fract(in.uv.x * 26.0) - 0.5)) * smoothstep(0.3, 0.42, g) * (1.0 - smoothstep(0.58, 0.7, g)) * near;
      s.albedo *= 1.0 - 0.35 * tread * step(idx, 19.6);
      let hole = smoothstep(19.9, 20.6, idx);
      s.albedo *= 1.0 - 0.75 * hole; s.ao *= 1.0 - 0.7 * hole;
    }
    if (id == 12u) {
      // substitute: fake relief of the stacks (uv.x = stack index, uv.y = height in tires)
      let f = fract(in.uv.x); let g = fract(in.uv.y);
      let tang = normalize(cross(vec3f(0.0, 1.0, 0.0), N) + vec3f(1e-6, 0.0, 0.0));
      let lat = (f - 0.5) * 1.7;
      s.normal = normalize(N * sqrt(max(0.05, 1.0 - lat * lat)) + tang * lat * step(N.y, 0.5));
      let gap = (1.0 - smoothstep(0.0, 0.2, min(f, 1.0 - f))) * 0.85 + (1.0 - smoothstep(0.0, 0.2, min(g, 1.0 - g))) * 0.7 * step(N.y, 0.5);
      s.ao *= 1.0 - sat(gap) * 0.9; s.albedo *= 1.0 - 0.75 * sat(gap);
      // each tire with its own sheen on the sidewall (bright band at mid-height) and a slightly different tone
      let tid = floor(vec2f(in.uv.x, in.uv.y)); let th2 = fract(sin(dot(tid, vec2f(12.9898, 78.233))) * 43758.5453);
      s.albedo *= (0.78 + 0.4 * th2) * (0.85 + 0.3 * smoothstep(0.25, 0.5, g) * (1.0 - smoothstep(0.5, 0.75, g)));
      if (N.y > 0.5) { let hole = 1.0 - smoothstep(0.1, 0.2, abs(fract(in.uv.y) - 0.5)); let hole2 = 1.0 - smoothstep(0.12, 0.26, abs(f - 0.5)); s.albedo *= 1.0 - 0.8 * hole * hole2; s.ao *= 1.0 - 0.7 * hole * hole2; }
    }
  } else if (id == 5u) {
    // reflective facade glass, in 1.75 x 3.3 m modules (uv in meters): aluminum frames, transom, opaque spandrel
    // (spandrel) at the base of each module, bluish tone that brightens toward the top (reflected sky) and varies from pane to pane,
    // blinds in some. No black rectangle: the glass has its own color beyond the environment reflection.
    let fx = fract(in.uv.x / 1.75); let fy = fract(in.uv.y / 3.3);
    let mx = abs(fx - 0.5) * 1.75; let my = abs(fy - 0.5) * 3.3;
    let aa = max(fwidth(in.uv.x) + fwidth(in.uv.y), 0.004);
    let frame = max(1.0 - smoothstep(0.04, 0.04 + aa, min(mx, my)), 1.0 - smoothstep(0.025, 0.025 + aa, abs(fy - 0.26) * 3.3));
    let pc = floor(vec2f(in.uv.x / 1.75, in.uv.y / 3.3)); let ph = fract(sin(dot(pc, vec2f(12.9898, 78.233))) * 43758.5453);
    let span = step(fy, 0.26);                                                     // opaque spandrel at the module base
    let blind = (1.0 - span) * step(0.7, ph) * step(1.0 - (0.2 + 0.5 * fract(ph * 7.3)), fy);
    let slat = 0.85 + 0.15 * sin(in.uv.y * 78.0) * (1.0 - smoothstep(0.2, 0.7, fwidth(in.uv.y * 78.0)));
    var gc = mix(vec3f(0.06, 0.085, 0.12), vec3f(0.26, 0.36, 0.48), smoothstep(0.26, 1.0, fy) * (0.6 + 0.4 * n1.g)) * (0.75 + 0.5 * ph);
    gc = mix(gc, vec3f(0.5, 0.49, 0.44) * slat, blind * 0.75);
    gc = mix(gc, vec3f(0.17, 0.21, 0.27) * (0.85 + 0.3 * n1.r), span);
    s.albedo = mix(gc, vec3f(0.46, 0.48, 0.5) * (0.85 + 0.25 * n2.r), frame);
    let glassy = (1.0 - frame) * (1.0 - blind) * (1.0 - span);
    s.metal = mix(0.25, 0.62, glassy) + frame * 0.5; s.rough = mix(0.42, 0.07 + 0.05 * ph, glassy); s.coat = glassy;
    s.normal = normalize(N + vec3f(ph - 0.5, 0.0, fract(ph * 3.7) - 0.5) * 0.02 * glassy);   // each pane slightly out of plumb
    s.ao *= 1.0 - 0.25 * frame;
  } else if (id == 6u) {
    s.albedo = in.col.rgb; s.emissive = matA(in.mat); s.rough = 0.3;
  } else if (id == 7u) {
    if (ff) {
      let t = textureSampleBias(tAtlas, sLin, in.uv, -0.8);
      s.albedo = t.rgb * (0.82 + 0.2 * n1.r) * (0.95 + 0.08 * n2.a * near); s.rough = 0.42;
    } else {
      // back of the sign: galvanized sheet with a grid of crossbars and uprights (drawn in the shader, in world meters)
      let tg = normalize(cross(vec3f(0.0, 1.0, 0.0), N) + vec3f(1e-5, 0.0, 0.0)); let a = dot(wp, tg);
      let aw = max(fwidth(wp.y) + fwidth(a), 0.004);
      let ry = abs(fract(wp.y / 0.7 + 0.2) - 0.5) * 0.7; let rx = abs(fract(a / 1.2) - 0.5) * 1.2;
      let fr = max(1.0 - smoothstep(0.03, 0.03 + aw, ry), 1.0 - smoothstep(0.025, 0.025 + aw, rx));
      let sh = max(1.0 - smoothstep(0.03, 0.1, ry), 1.0 - smoothstep(0.025, 0.09, rx)) * (1.0 - fr);       // shadow next to the frame
      let rust = smoothstep(0.62, 0.8, n1.b * 0.5 + n2.r * 0.5);
      var c = vec3f(0.34, 0.36, 0.38) * (0.78 + 0.35 * n1.r) * (0.9 + 0.2 * textureSample(tNoise, sLin, vec2f(a * 1.1, wp.y * 0.1)).g);
      c = mix(c, vec3f(0.2, 0.11, 0.06), rust * 0.45);
      c = mix(c, vec3f(0.5, 0.52, 0.54) * (0.85 + 0.25 * n2.g), fr);
      s.albedo = c * (1.0 - 0.45 * sh); s.rough = mix(0.55, 0.38, fr); s.metal = mix(0.6, 0.85, fr) * (1.0 - rust * 0.5); s.ao *= 1.0 - 0.35 * sh;
    }
  } else if (id == 8u) {
    let u = fract(in.uv.x / 0.52); let aa = max(fwidth(in.uv.x / 0.52), 0.004);
    let gap = 1.0 - smoothstep(0.045, 0.045 + aa, min(u, 1.0 - u));
    s.albedo = mix(in.col.rgb * (0.85 + 0.2 * n1.r), vec3f(0.035), gap * (1.0 - smoothstep(60.0, 140.0, dist)) + 0.12 * smoothstep(60.0, 140.0, dist));
    s.rough = 0.42; s.ao *= 1.0 - gap * 0.4;
  } else if (id == 9u) {
    let ph = in.uv.y / 0.19 * 6.2832; let aa = fwidth(in.uv.y / 0.19);
    let k = 1.0 - smoothstep(0.25, 0.9, aa);
    s.albedo = in.col.rgb * (0.82 + 0.25 * n1.r) * (1.0 + 0.1 * sin(ph) * k);
    s.metal = 0.55; s.rough = 0.48; s.ao *= 1.0 - 0.18 * (0.5 - 0.5 * sin(ph)) * k;
    bump = vec3f(0.0);
  } else if (id == 10u) {
    s.albedo = in.col.rgb * (0.85 + 0.2 * n1.r); s.rough = 0.8; s.sss = 0.5;
  } else if (id == 13u) {
    let ph = wp.y / 0.11 * 6.2832; let k = 1.0 - smoothstep(0.2, 0.8, fwidth(wp.y / 0.11));
    s.albedo = in.col.rgb * (0.85 + 0.2 * n1.r) * (1.0 + 0.08 * sin(ph) * k);
    s.normal = normalize(N + vec3f(0.0, cos(ph) * 0.35 * k, 0.0)); s.rough = 0.5; s.metal = 0.35;
  } else if (id == 14u) {
    let band = step(0.45, in.uv.y) * step(in.uv.y, 0.68);
    s.albedo = mix(vec3f(0.75, 0.16, 0.02), vec3f(0.7), band) * (0.85 + 0.2 * n2.r); s.rough = 0.55;
  } else if (id == 18u) {
    // starting-light bulb: red while the car waits on the grid (F.car2.x = 1), off afterwards
    // off: smooth dark-red lens (reflects the sky); on: saturated emissive red, hotter at the center
    let on = F.car2.x;
    s.albedo = mix(vec3f(0.05, 0.004, 0.003), in.col.rgb, on); s.emissive = matA(in.mat) * on; s.rough = mix(0.12, 0.3, on); s.coat = 1.0 - on;
  } else if (id == 17u) {
    // painted ribbed metal sheet (facade and pillar cladding): vertical ribs, panel seams, streaks
    let tg = normalize(cross(vec3f(0.0, 1.0, 0.0), N) + vec3f(1e-5, 0.0, 0.0)); let a = dot(wp, tg);
    let ph = a / 0.22 * 6.2832; let k = 1.0 - smoothstep(0.2, 0.8, fwidth(a / 0.22));
    let aw = max(fwidth(a) + fwidth(wp.y), 0.004);
    let seam = max(1.0 - smoothstep(0.012, 0.012 + aw, abs(fract(a / 2.2) - 0.5) * 2.2), 1.0 - smoothstep(0.012, 0.012 + aw, abs(fract(wp.y / 3.0 + 0.15) - 0.5) * 3.0));
    let streak = textureSample(tNoise, sLin, vec2f(a * 0.9, wp.y * 0.06)).g;
    var c = in.col.rgb * (0.82 + 0.22 * n1.r) * (0.78 + 0.34 * streak) * (1.0 + 0.07 * sin(ph) * k);
    c = mix(c, c * 0.35, seam * 0.8);
    s.albedo = c; s.rough = 0.36 + 0.2 * n2.g; s.metal = 0.45; s.ao *= 1.0 - seam * 0.3 - 0.12 * (0.5 - 0.5 * sin(ph)) * k;
    s.normal = normalize(N + tg * cos(ph) * 0.3 * k);
  } else {
    s.albedo = in.col.rgb;
  }
  if (dot(bump, bump) > 0.0) { s.normal = normalize(s.normal + bump); }
  return s;
}
