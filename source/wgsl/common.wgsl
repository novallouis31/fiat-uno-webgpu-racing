// Common to the geometry families: utilities + global bindings of group 0.
#include util
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sLin: sampler;     // trilinear, repeat, anisotropic
@group(0) @binding(2) var sClamp: sampler;   // linear, clamp
@group(0) @binding(3) var tNoise: texture_2d<f32>;   // tileable 512² noise: R,G = value fbm (2 seeds), B = cellular, A = white noise
@group(0) @binding(4) var tNoise3: texture_3d<f32>;  // tileable 64³ 3D noise: R = perlin fbm, G = worley fbm, B = fine worley, A = fine perlin
@group(0) @binding(5) var tHeight: texture_2d<f32>;  // terrain height (m), 1 m/texel around the track
@group(0) @binding(6) var tZone: texture_2d<f32>;    // zones (see 11_worldmap.js)
// world maps: F.wm = (x0, z0, sizeX, sizeZ) in meters
fn wmIn(xz: vec2f) -> bool { let p = xz - F.wm.xy; return p.x >= 0.0 && p.y >= 0.0 && p.x <= F.wm.z && p.y <= F.wm.w; }
fn wmHeight(xz: vec2f) -> f32 { return textureSampleLevel(tHeight, sClamp, (xz - F.wm.xy + 0.5) / vec2f(textureDimensions(tHeight)), 0.0).r; }
fn wmZone(xz: vec2f) -> vec4f { if (!wmIn(xz)) { return vec4f(1.0, 0.0, 1.0, 0.0); } return textureSampleLevel(tZone, sClamp, ((xz - F.wm.xy) * 2.0 + 0.5) / vec2f(textureDimensions(tZone)), 0.0); }
