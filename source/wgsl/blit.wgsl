#include fsq
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
@fragment fn fs(in: FsV) -> @location(0) vec4f { return textureSampleLevel(t, s, in.uv, 0.0); }
