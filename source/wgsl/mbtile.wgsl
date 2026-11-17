// Motion blur, step 1: largest-magnitude velocity per block (TILE px), or a 3x3 maximum across blocks (NEIGH).
#include fsq
@group(0) @binding(0) var t: texture_2d<f32>;
@fragment fn fs(in: FsV) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy); let dim = vec2i(textureDimensions(t)) - 1; var best = vec2f(0.0); var bm = -1.0;
#ifdef NEIGH
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) { let v = textureLoad(t, clamp(p + vec2i(x, y), vec2i(0), dim), 0).xy; let m = dot(v, v); if (m > bm) { bm = m; best = v; } } }
#else
  for (var y = 0; y < TILE; y += 4) { for (var x = 0; x < TILE; x += 4) { let v = textureLoad(t, clamp(p * TILE + vec2i(x + (y / 4) % 2 * 2, y + 1), vec2i(0), dim), 0).xy; let m = dot(v, v); if (m > bm) { bm = m; best = v; } } }
#endif
  return vec4f(best, 0.0, 0.0);
}
