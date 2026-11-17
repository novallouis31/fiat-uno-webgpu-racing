struct FsV { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> FsV {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return FsV(vec4f(p * 2.0 - 1.0, 0.0, 1.0), vec2f(p.x, 1.0 - p.y));
}
