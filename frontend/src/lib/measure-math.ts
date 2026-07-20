// Pure geometry helpers for the Area/Angle measure modes — no appState/THREE
// dependency so they're trivially unit-testable with plain {x,y,z} points.

export interface Pt { x: number; y: number; z: number; }

// Polygon area via Newell's method: sums the cross products of consecutive
// edges into a normal vector whose magnitude is twice the (possibly
// non-planar, "best-fit-plane projected") polygon area. Order/winding-
// invariant in magnitude, and — unlike a naive shoelace formula — works for
// polygons in any 3D orientation, not just ones lying in a coordinate plane.
export function polygonArea3D(points: Pt[]): number {
  if (points.length < 3) return 0;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

// Angle in degrees at `vertex`, between rays vertex->p1 and vertex->p2.
export function angleAt(p1: Pt, vertex: Pt, p2: Pt): number {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y, z: p1.z - vertex.z };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y, z: p2.z - vertex.z };
  const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
  if (len1 < 1e-9 || len2 < 1e-9) return 0; // degenerate: vertex coincides with an endpoint
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const cos = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  return Math.acos(cos) * 180 / Math.PI;
}
