// Entry points for the direct families (transparent pass): the family defines vert() and shade().
@vertex fn vs(in: VIn) -> V2F {
  let o = vert(in);
  var r: V2F;
  r.pos = P.viewProj * vec4f(o.wpos, 1.0);
  r.wpos = o.wpos; r.nrm = o.nrm; r.uv = o.uv; r.mat = o.mat; r.col = o.col; r.ext = o.ext;
  return r;
}
@fragment fn fs(in: V2F, @builtin(front_facing) ff: bool) -> @location(0) vec4f { return shade(in, ff); }
