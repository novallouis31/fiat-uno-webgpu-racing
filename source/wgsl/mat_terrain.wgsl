// Terrain: static mesh, shared ground material. Vertex col.r = forest density.
#include mesh_vert
#include world_ground
fn surf(in: V2F, ff: bool) -> Surface { return groundSurf(in.wpos, normalize(in.nrm), in.col.r); }
