// Car materials (Fiat Uno Mille EP): metallic paint with clear coat, plastics, rubber, tires, hubcaps, lenses, aluminum...
// id (mat.x): 1 paint | 2 black plastic | 3 rubber | 4 tire | 5 hubcap | 6 steel | 7 chrome | 8 interior | 9 opaque lens
//             10 aluminum | 11 strap | 12 atlas decal | 13 background | 14 headlight reflector | 15 mirror | 16 grille slats
//             17 glossy smooth paint (helmet; a=1 glassy black)
// O.p0 of the bodywork: x = brake light, y = reverse light, z = headlights. O.p0.x of the wheels = |angular velocity|.
#include mesh_vert
@group(3) @binding(0) var tAtlas: texture_2d<f32>;
const PAINT_COL = vec3f(0.168, 0.275, 0.425);   // studio light-blue metallic: darker and grayer (the game's sun is strong)
fn carBulgeW(x: f32) -> f32 { return 0.055 * smoothstep(-0.15, 0.25, x) - 0.036 * smoothstep(-1.15, -1.42, x); }
fn surf(in: V2F, ff: bool) -> Surface {
  var s = surfDefault(normalize(in.nrm));
  let id = matId(in.mat); let pa = matA(in.mat) * 255.0;
  let lp = in.ext.xyz;
  s.albedo = in.col.rgb;
  switch (id) {
    case 1u: {   // light-blue metallic paint with clear coat
      // metallic flakes: 3D noise in car space (no streaking on any panel)
      // (2D noise with mips, projected along the car's three axes: at distance or grazing angle the mips average out
      //  and the flake disappears on its own — 3D noise without mips turned into a diagonal pattern on the hood)
      let nO = normalize((vec4f(s.normal, 0.0) * O.model).xyz); let wt = abs(nO) / (abs(nO.x) + abs(nO.y) + abs(nO.z));
      let fl = textureSample(tNoise, sLin, lp.zy * 23.0).a * wt.x + textureSample(tNoise, sLin, lp.xz * 23.0).a * wt.y + textureSample(tNoise, sLin, lp.xy * 23.0).a * wt.z - 0.5;
      s.albedo = PAINT_COL * (1.0 + 0.08 * fl); s.metal = 0.58; s.rough = 0.3 + 0.04 * fl; s.coat = 1.0;
      // tabs of the cutouts near the ground (base of the wheel arches): dark, so no light chip hangs out
      { let under = (1.0 - smoothstep(0.31, 0.345, lp.y)) * smoothstep(1.4, 1.5, abs(lp.x)); s.albedo = mix(s.albedo, vec3f(0.01), under); s.coat *= 1.0 - under; s.metal *= 1.0 - under; s.rough = mix(s.rough, 0.95, under); }
      if (pa > 0.5) { let low = max(1.0 - smoothstep(0.2, 0.26, lp.y), (1.0 - smoothstep(0.54, 0.6, lp.y)) * smoothstep(1.2, 1.3, abs(lp.x))); s.albedo = mix(s.albedo, vec3f(0.012), low); s.coat *= 1.0 - low; s.metal *= 1.0 - low; s.rough = mix(s.rough, 0.9, low); }
      if (pa < 0.5) {
        var d = abs(in.uv.x);
        // fuel cap (left side)
        if (lp.z < -0.5) { d = min(d, abs(length(vec2f(lp.x + 1.04, lp.y - 0.715)) - 0.062)); }
        // gap between panels: dark core of ~4 mm + soft shadow around it (reads as a gap, not a stroke);
        // when it gets smaller than a pixel, it fades by coverage instead of thickening
        let w = max(fwidth(d), 1e-5); let hw = 0.002;
        let line = sat((hw - d) / w + 0.5) * min(1.0, 2.0 * hw / w);
        let halo = (1.0 - smoothstep(hw, hw + 0.007, d)) * sat(0.0035 / w);
        s.albedo *= 1.0 - 0.22 * halo; s.ao = min(s.ao, 1.0 - 0.4 * halo);
        // darker side band between the two creases + thin dark trim at the top edge + shaded sill
        let side = step(in.uv.y, 0.4);
        // (in the studio photos everything below the trim is a darker shade)
        let band = smoothstep(0.215, 0.25, lp.y) * (1.0 - smoothstep(0.575, 0.59, lp.y)) * side;
        s.albedo *= 1.0 - 0.3 * band; s.rough += 0.03 * band;
        let wy = max(fwidth(lp.y), 1e-5);
        // side trim: wide black rubber strip (~5 cm) at bumper-top height, between the wheel arches
        let sx = smoothstep(-0.83, -0.80, lp.x) * (1.0 - smoothstep(0.80, 0.83, lp.x));
        let sdy = lp.y - 0.607; let strip = sat((0.025 - abs(sdy)) / wy + 0.5) * min(1.0, 0.05 / wy) * side * sx;
        { let upS = normalize((O.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz); let eb = smoothstep(0.014, 0.024, abs(sdy)) * strip; s.normal = normalize(s.normal + upS * sign(sdy) * eb * 0.8); }
        // sill: matte black strip under the door, between the wheel arches
        let sill = (1.0 - smoothstep(0.222, 0.234, lp.y)) * side;
        s.albedo = mix(s.albedo, vec3f(0.014), sill * 0.92); s.coat *= 1.0 - sill; s.metal *= 1.0 - sill; s.rough = mix(s.rough, 0.85, sill); s.ao = min(s.ao, 1.0 - 0.3 * sill);
        // horizontal crease of the trunk lid (at taillight-top height): bends the normal in a narrow band
        if (lp.x < -1.5 && in.uv.y > 0.66) {
          let t = (lp.y - 0.836) / 0.007; let upW = normalize((O.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz);
          s.normal = normalize(s.normal + upW * (t * exp(-t * t) * 0.55) * (1.0 - smoothstep(0.44, 0.48, abs(lp.z))));
          // license plate recess: shaded step around the plate (rounded rectangle) and slightly darker background
          let q = abs(vec2f(lp.z, lp.y - 0.717)) - vec2f(0.203, 0.064); let pr = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.014;
          let stepb = 1.0 - smoothstep(0.0, 0.007, abs(pr));
          s.albedo *= 1.0 - 0.3 * stepb - 0.07 * (1.0 - smoothstep(-0.004, 0.0, pr)); s.ao = min(s.ao, 1.0 - 0.5 * stepb);
        }
        var black = max(line, strip); var lvShade = 1.0;
        if (in.uv.y > 0.66) {
          let zz = lp.z / 0.72; let xe = lp.x - carBulgeW(lp.x) * (1.0 - zz * zz);
          // plastic grille at the base of the windshield
          let cowl = smoothstep(0.6, 0.61, xe) * (1.0 - smoothstep(0.741, 0.745, xe));
          black = max(black, cowl);
          // hood ventilation grille: row of fins ~10 cm ahead of the rear edge, centered (as in the photo)
          let lz = lp.z / 0.021; let cz = fract(lz) - 0.5; let slot = smoothstep(0.3, 0.42, abs(cz) * 2.0);
          let lin = smoothstep(0.843, 0.846, xe) * (1.0 - smoothstep(0.876, 0.879, xe)) * (1.0 - smoothstep(0.218, 0.222, abs(lp.z)));
          let lv = (1.0 - slot) * lin;
          // recess: the edge of each fin bends the normal (catches highlight on one side, shadow on the other) and the background has a gradient
          let rightW = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz); let fwdW = normalize((O.model * vec4f(1.0, 0.0, 0.0, 0.0)).xyz);
          let bev = smoothstep(0.22, 0.36, abs(cz) * 2.0) * (1.0 - smoothstep(0.44, 0.58, abs(cz) * 2.0)) * lin;
          let endb = (smoothstep(0.836, 0.845, xe) * (1.0 - smoothstep(0.845, 0.851, xe)) - smoothstep(0.871, 0.877, xe) * (1.0 - smoothstep(0.877, 0.886, xe))) * (1.0 - slot) * (1.0 - smoothstep(0.218, 0.222, abs(lp.z)));
          s.normal = normalize(s.normal - rightW * sign(cz) * bev * 0.7 + fwdW * endb * 0.6);
          s.ao = min(s.ao, 1.0 - 0.35 * bev); s.ao = min(s.ao, 1.0 - 0.7 * lv);   // the bottom of the slot returns neither sky nor sun
          lvShade = mix(1.0, mix(0.3, 1.1, sat(cz * 2.6 + 0.5)) * mix(0.5, 1.0, sat((xe - 0.846) / 0.03)), lin);   // only inside the fins (the windshield base stays smooth)
          // foot of the two longitudinal creases: thin shadow line following the ridge
          let zc = 0.515 - 0.145 * sat((xe - 0.72) / 1.03);
          let hx = smoothstep(0.78, 0.9, xe) * (1.0 - smoothstep(1.68, 1.76, xe));
          // sharp edge of the ridge: the normal bends outward in a narrow band (the step face catches sky on one side and
          // shadow on the other), with a thin shadow line at the foot — the crease reads from any angle, including the hood camera
          let dz = abs(lp.z) - zc; let wz = max(fwidth(lp.z), 1e-5);
          let face = (1.0 - smoothstep(0.004, 0.0085, abs(dz))) * hx;
          let foot = (1.0 - smoothstep(0.003, 0.02 + 2.0 * wz, abs(dz - 0.013))) * hx;   // wide, soft shadow band (reads at 1 m at grazing angle, without stippling)
          let crest = (1.0 - smoothstep(0.003, 0.016 + 2.0 * wz, abs(dz + 0.012))) * hx;
          s.normal = normalize(s.normal + rightW * sign(lp.z) * (face * 1.0 + foot * 0.3));
          s.albedo *= (1.0 - 0.5 * foot) * (1.0 + 0.2 * crest); s.ao = min(s.ao, 1.0 - 0.6 * foot);
          s.coat *= 1.0 - 0.8 * foot; s.rough = mix(s.rough, 0.7, foot);   // at the foot of the step the clear coat doesn't return the sky: the shadow line shows at grazing angle too
          black = max(black, lv);
        }
        s.albedo = mix(s.albedo, vec3f(0.016) * lvShade, black); s.coat *= 1.0 - black; s.rough = mix(s.rough, 0.95, black); s.metal *= 1.0 - black; s.ao = min(s.ao, 1.0 - line * 0.6);
      }
    }
    case 2u: {   // black plastic: very fine grain (almost smooth at 3 m), sharp edges, a bit of diffuse to read in shadow
      let g = textureSample(tNoise, sLin, lp.xz * 57.0 + lp.yy * 43.0).b;
      let g2 = textureSample(tNoise, sLin, lp.zy * 131.0 + lp.xx * 97.0).a;
      s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * (0.2 + 0.13 * g + 0.09 * g2); s.rough = select(0.94 + 0.05 * g2, 0.4, pa > 0.5); s.ao = 0.38 + 0.2 * g2; s.metal = select(0.0, 0.55, pa > 0.5);
    }
    case 3u: { s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 1.0; s.rough = 0.84; s.ao = 0.6; s.metal = 0.5; }
    case 4u: {   // passenger tire
      let r = length(lp.xy); let ang = atan2(lp.y, lp.x);
      let blur = sat(O.p0.x / 25.0);
      if (pa < 0.5) {
        // tread: thin, subtle sipes only between the shoulders (the longitudinal grooves are geometry)
        let lane = floor((lp.z + 0.055) / 0.022);
        let k = fract(ang / 6.2831853 * 118.0 + lane * 0.5);
        let sipe = (1.0 - smoothstep(0.05, 0.1, abs(k - 0.5))) * (1.0 - blur) * (1.0 - smoothstep(0.03, 0.038, abs(lp.z)));
        s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 0.5 * (1.0 - 0.5 * sipe); s.ao = 0.45 - 0.2 * sipe; s.rough = 0.95; s.metal = 0.0;
      } else {
        // smooth sidewall: two concentric rings and a few small embossed inscriptions
        let ring = (1.0 - smoothstep(0.0006, 0.0014, abs(r - 0.243))) + (1.0 - smoothstep(0.0006, 0.0014, abs(r - 0.196)));
        let tb = smoothstep(0.2075, 0.209, r) * (1.0 - smoothstep(0.2185, 0.22, r));
        let win = step(0.55, textureSampleLevel(tNoise, sLin, vec2f(ang * 0.33, 0.61), 0.0).r);
        let st = smoothstep(0.3, 0.45, abs(fract(ang * 58.0) - 0.5)) * step(0.35, textureSampleLevel(tNoise, sLin, vec2f(ang * 9.3, 0.37), 0.0).a);
        let letters = tb * win * st * (1.0 - blur);
        // wide band near the shoulder and thin radial ribs on the sidewall (a real tire, not a smooth blob)
        let ribs = (0.5 + 0.5 * sin(ang * 150.0)) * smoothstep(0.222, 0.226, r) * (1.0 - smoothstep(0.238, 0.242, r)) * (1.0 - blur) * sat(1.0 - fwidth(ang) * 150.0 * 0.4);
        let band2 = smoothstep(0.247, 0.249, r) * (1.0 - smoothstep(0.256, 0.258, r));
        s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 0.5 * (1.0 + 1.8 * letters + 0.8 * ring * (1.0 - blur) + 0.35 * ribs + 0.3 * band2); s.rough = 0.9 - 0.2 * letters; s.ao = 0.5 - 0.15 * ribs + 0.25 * letters; s.metal = 0.0;
      }
    }
    case 5u: {   // silver hubcap
      let r = length(lp.xy);
      s.albedo = in.col.rgb; s.metal = 0.75; s.rough = 0.36; s.coat = 0.25;
      if (pa > 0.5) {
        // motion-blur disc: covers the slots with dithering as the wheel spins (radial average: slot ring darker)
        let cov = smoothstep(9.0, 34.0, O.p0.x);
        if (ign(in.pos.xy, F.misc.y) >= cov) { discard; }
        let ringd = 1.0 - smoothstep(0.016, 0.03, abs(r - 0.123));
        let rim = 1.0 - smoothstep(0.001, 0.003, abs(r - 0.156)); let hub = 1.0 - smoothstep(0.016, 0.024, r); let bolts = 1.0 - smoothstep(0.005, 0.01, abs(r - 0.058));
        let streak = 0.5 + 0.5 * sin(atan2(lp.y, lp.x) * 16.0);   // remnant of the 16 slots, nearly erased by the spin
        s.albedo = in.col.rgb * (1.0 - 0.5 * ringd * (0.85 + 0.15 * streak) - 0.35 * rim - 0.4 * hub - 0.22 * bolts); s.rough = 0.42; s.coat = 0.15; s.ao = 1.0 - 0.35 * ringd;
        return s;
      }
      let far = smoothstep(0.004, 0.011, fwidth(r)) * (1.0 - smoothstep(0.019, 0.026, abs(r - 0.123)));
      s.albedo *= 1.0 - 0.3 * far;
      let c = 1.0 - smoothstep(0.0012, 0.0024, abs(r - 0.031));
      // center emblem: five slanted bars in low relief
      let q = lp.x + lp.y * 0.3;
      let bars = (1.0 - smoothstep(0.2, 0.3, abs(fract(q / 0.0078 + 0.5) - 0.5))) * step(abs(lp.y), 0.0155) * step(abs(q), 0.0195) * (1.0 - sat(O.p0.x / 20.0));
      s.albedo *= 1.0 - 0.5 * bars; s.rough += 0.1 * bars;
      // trim on the edge and soft shadow into the slots
      s.albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.001, 0.0025, abs(r - 0.156)));
      // five screw recesses around the center
      let a5 = atan2(lp.y, lp.x) / 6.2831853 * 5.0; let da = (a5 - round(a5)) / 5.0 * 6.2831853 * r;
      let dimple = 1.0 - smoothstep(0.006, 0.008, length(vec2f(da, r - 0.058)));
      s.albedo *= 1.0 - 0.5 * c - 0.6 * dimple; s.ao = 1.0 - 0.5 * dimple;
    }
    case 6u: { s.metal = 0.5; s.rough = select(0.45, 0.6, pa > 0.5); }
    case 7u: { s.metal = 1.0; s.rough = select(0.07, 0.26, pa > 0.5); if (pa > 1.5) { s.metal = 0.72; s.rough = 0.3; } }   // a=2: bright satin chrome (emblem)
    case 8u: {   // interior
      s.rough = 0.92;
      // inner lining behind the bumpers (the outer skin is cut there): dark, so it doesn't show under the car
      { let under = (1.0 - smoothstep(0.56, 0.62, lp.y)) * smoothstep(1.2, 1.3, abs(lp.x)); s.albedo = mix(s.albedo, vec3f(0.006), under); }
      if ((pa > 1.5 && pa < 2.5) || pa > 3.5) { let w = sin(lp.z * 900.0) * sin(lp.x * 900.0 + lp.y * 900.0); s.albedo = in.col.rgb * (1.0 + 0.1 * w); }
      if (pa > 3.5) {
        // seats: horizontal bolsters with a seam (dark groove) every ~8 cm
        let k = (fract(lp.y / 0.082 + 0.3 * lp.x) - 0.5) * 0.082; let seam = 1.0 - smoothstep(0.0025, 0.008, abs(k));
        s.albedo *= (1.0 - 0.5 * seam) * (0.86 + 0.14 * cos(k / 0.082 * 6.2831853)); s.ao = 1.0 - 0.4 * seam;
      }
      if (pa > 2.5 && pa < 3.5) { s.rough = 0.55; }
    }
    case 9u: {   // lenses (taillight, turn signals): thin prisms over reflector, deep colors even in sunlight
      s.rough = 0.38; s.coat = 0.0;
      let rib = 0.86 + 0.14 * sin(lp.y * 6.2831853 / 0.0042);
      if (pa < 1.5) {
        // taillight: dark amber top band (turn signal), ruby red (position/brake) in the middle, clear reverse at the bottom
        let v = in.uv.y; let u = in.uv.x; let br = sat(O.p0.x);
        // the albedo stays dark (in sunlight it doesn't wash out to pink); the lit brake comes only from emission, in pure red
        var c = mix(vec3f(0.17, 0.003, 0.002), vec3f(0.2, 0.004, 0.002), br); var e = mix(0.03, 0.66, br);
        if (v > 0.66) { c = vec3f(0.19, 0.05, 0.002); e = 0.006; }
        else if (v < 0.2 && u < 0.36) { c = mix(vec3f(0.1, 0.1, 0.098), vec3f(1.0, 1.0, 0.95), sat(O.p0.y)); e = 0.004 + sat(O.p0.y) * 0.5; }   // reverse: small inner rectangle
        // raised dividers between the sections (horizontal) and one vertical at 1/3 of the width: dark bars with bevels
        let fy = max(fwidth(v), 1e-4); let fu = max(fwidth(u), 1e-4);
        let dh = min(abs(v - 0.66), select(9.0, abs(v - 0.2), u < 0.36)); let dvv = select(9.0, abs(u - 0.36), v < 0.2);
        // thin dark frame around the lens (top, bottom and inner edges)
        let vh = (0.5 - abs(v - 0.5)) ; let edge = max(sat(1.0 - (vh - 0.0) / max(0.028, fy)), sat(1.0 - u / max(0.03, fu)));
        let k = sat(max(max(sat(1.0 - dh / max(0.02, fy)), sat(1.0 - dvv / max(0.014, fu))), edge));
        // prisms: ~4.5 mm pyramids that bend the normal (point highlights from the sun) and give light/dark per cell
        let cell = vec2f(lp.z, lp.y) / 0.0045; var pc = fract(cell) - 0.5; pc.x = 0.0;   // fluted lens: thin horizontal ribs
        let fade = sat(1.0 - fwidth(cell.y) * 1.4);   // fades out before becoming jagged
        let rightW = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz); let upW = normalize((O.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz);
        s.normal = normalize(s.normal + (rightW * pc.x + upW * pc.y) * 0.45 * fade * (1.0 - k));
        let prism = mix(1.0, 0.62 + 0.76 * (1.0 - 2.0 * max(abs(pc.x), abs(pc.y))), fade);
        let depth = 0.8 + 0.2 * sin(u * 7.0 + v * 2.5);   // reflector gradient behind the lens
        s.albedo = mix(c * prism * depth, vec3f(0.006), k); s.emissive = e * (1.0 - k) * mix(1.0, 0.8 + 0.4 * (1.0 - 2.0 * max(abs(pc.x), abs(pc.y))), fade);
        s.rough = mix(0.62, 0.8, k);   // low-specular lens: in sunlight it stays red/amber, without washing to pink
      } else {
        // turn signals: translucent amber lens (darker and saturated) with the reflector glow behind and clear coat
// (uv.x = x + z: coordinate along the front/side) — thin vertical flutes and a reflector gradient behind
        let fl2 = 0.5 + 0.5 * sin(in.uv.x * 6.2831853 / 0.0075); let fadeP = sat(1.0 - fwidth(in.uv.x) / 0.0075 * 2.0);
        let gy = 1.0 - 0.45 * abs((lp.y - 0.693) / 0.062);
        s.albedo = in.col.rgb * vec3f(0.9, 0.62, 0.3) * mix(1.0, 0.74 + 0.4 * fl2, fadeP) * gy * (0.9 + 0.1 * rib); s.rough = 0.3; s.coat = 0.7; s.emissive = 0.03;   // smooth translucent lens, only thin horizontal flutes
      }
    }
    case 10u: {  // step ladder aluminum
      let n = textureSample(tNoise, sLin, vec2f(lp.x * 0.7, (lp.y + lp.z) * 30.0)).r;
      s.albedo = in.col.rgb * (0.94 + 0.08 * n); s.metal = 0.55; s.rough = 0.5 + 0.1 * n;
      if (pa > 0.5) { let k = sin(lp.z * 900.0); s.rough = 0.55; s.albedo *= 0.9 + 0.1 * k; }
      else if (abs(abs(lp.z) - 0.205) > 0.0105 && lp.x > -1.97 && lp.x < 1.21) {
        // riveted end of each step, visible on the side faces of the stringers
        let kx = (fract((lp.x + 1.78) / 0.28 + 0.5) - 0.5) * 0.28; let d = length(vec2f(kx, lp.y - 1.515));
        let ring = smoothstep(0.0215, 0.0195, d) * smoothstep(0.0135, 0.0155, d); let core = 1.0 - smoothstep(0.012, 0.014, d);
        s.albedo *= 1.0 - 0.55 * ring - 0.2 * core; s.ao = 1.0 - 0.5 * ring;
      }
    }
    case 11u: {  // polyester strap
      let w = sin((lp.z + lp.y) * 1800.0) * sin(lp.x * 1800.0);
      s.albedo = in.col.rgb * (0.9 + 0.12 * w); s.rough = 0.8;
    }
    case 12u: {  // decal (plate / emblems)
      let t = textureSample(tAtlas, sLin, in.uv);
      if (pa > 0.5 && t.a < 0.5) { discard; }
      s.albedo = t.rgb * select(0.7, 1.0, pa > 0.5); s.rough = select(0.62, 0.28, pa > 0.5); s.metal = select(0.0, 0.4, pa > 0.5); s.coat = select(0.0, 0.6, pa > 0.5);
    }
    case 13u: { s.rough = 1.0; s.ao = 0.3; s.metal = 0.9; }
    case 14u: {  // headlight reflector: silver bowl with its own look (little dependent on the sky) / bulb
      let u = in.uv.x; let v = in.uv.y;
      // gradient: brighter in the center (around the bulb), darkening toward the edges and downward; vertical facets in columns
      let rightW = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz);
      let fz = sin(lp.z * 6.2831853 / 0.013); let ffade = sat(1.0 - fwidth(lp.z) / 0.013 * 2.5);
      s.normal = normalize(s.normal + rightW * fz * 0.12 * ffade);
      let rr = length(vec2f(u * 0.85, v));
      let grad = mix(1.0, 0.36, smoothstep(0.1, 1.05, rr)) * mix(0.72, 1.0, smoothstep(-1.0, 0.3, v));
      let facet = mix(1.0, 0.86 + 0.14 * fz, ffade);
      s.albedo = vec3f(0.74, 0.75, 0.77) * grad * facet; s.metal = 0.25; s.rough = 0.32; s.ao = 1.0;
      s.emissive = 0.105 * grad;   // the bowl sits in the frame's shadow: self-light proportional to the design (silver, not sky blue)
      if (pa > 0.5) {
        // clear bulb (a > 0.5) and its silver cap at the tip (a > 1.5): subtle, no black dot
        s.normal = normalize(in.nrm);
        if (pa > 1.5) { s.metal = 0.3; s.albedo = vec3f(0.5, 0.5, 0.51); s.rough = 0.35; s.emissive = 0.06; }
        else { s.metal = 0.2; s.albedo = vec3f(0.8, 0.79, 0.74); s.rough = 0.25; s.emissive = 0.09 + O.p0.z * 0.1; }
      }
    }
    case 15u: {   // rearview mirror: FIXED reflection (sky / treeline horizon / ground), darkened — doesn't depend on the cubemap
      let g = sat((lp.y - 0.965) / 0.082);
      let ground = vec3f(0.03, 0.03, 0.032); let trees = vec3f(0.018, 0.03, 0.014); let sky = mix(vec3f(0.2, 0.25, 0.3), vec3f(0.1, 0.16, 0.26), sat((g - 0.52) / 0.48));
      var c = mix(ground, trees, smoothstep(0.36, 0.42, g)); c = mix(c, sky, smoothstep(0.5, 0.56, g));
      s.albedo = c; s.metal = 0.0; s.rough = 0.5; s.coat = 0.25; s.emissive = 0.045;
    }
    case 16u: {  // slats at the bottom of the slots: nearly black
      let k = fract(lp.y / select(0.0105, 0.0175, pa > 0.5));
      s.albedo = in.col.rgb * mix(0.1, 1.0, smoothstep(0.25, 0.5, k)); s.rough = 0.92; s.metal = 0.3; s.ao = mix(0.2, 0.7, smoothstep(0.25, 0.5, k));
    }
    case 17u: { s.rough = select(0.42, 0.3, pa > 0.5); s.coat = select(0.3, 0.35, pa > 0.5); }   // helmet (paint) / smooth dark visor, without mirroring zebras
    default: {}
  }
  return s;
}
