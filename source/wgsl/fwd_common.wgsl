// Lighting resources for the direct families (transparent): group 3.
@group(3) @binding(0) var tEnv: texture_cube<f32>;
@group(3) @binding(1) var tShadow: texture_depth_2d_array;
@group(3) @binding(2) var tShadowS: texture_depth_2d;
@group(3) @binding(3) var sCmp: sampler_comparison;
@group(3) @binding(4) var gD: texture_depth_2d;
#include brdf
#include shadow
#include fog
