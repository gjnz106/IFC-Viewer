import { describe, it, expect } from 'vitest';
import { polygonArea3D, angleAt, type Pt } from './measure-math.js';

describe('polygonArea3D', () => {
  it('computes the area of a unit square in the XY plane', () => {
    const pts: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }];
    expect(polygonArea3D(pts)).toBeCloseTo(1);
  });

  it('is translation-invariant', () => {
    const pts: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }];
    const shifted: Pt[] = pts.map(p => ({ x: p.x + 50, y: p.y - 20, z: p.z + 7 }));
    expect(polygonArea3D(shifted)).toBeCloseTo(1);
  });

  it('works for a square rotated out of the XY plane', () => {
    // Same unit square, rotated into the XZ plane (y is now the "depth" axis).
    const pts: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }];
    expect(polygonArea3D(pts)).toBeCloseTo(1);
  });

  it('computes a right triangle correctly (3-4-5-ish legs)', () => {
    const pts: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }];
    expect(polygonArea3D(pts)).toBeCloseTo(6); // 0.5 * 3 * 4
  });

  it('is winding-order invariant', () => {
    const cw: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }];
    const ccw = [...cw].reverse();
    expect(polygonArea3D(cw)).toBeCloseTo(polygonArea3D(ccw));
  });

  it('returns 0 for fewer than 3 points', () => {
    expect(polygonArea3D([])).toBe(0);
    expect(polygonArea3D([{ x: 0, y: 0, z: 0 }])).toBe(0);
    expect(polygonArea3D([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }])).toBe(0);
  });

  it('returns ~0 for collinear/degenerate points', () => {
    const pts: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }];
    expect(polygonArea3D(pts)).toBeCloseTo(0);
  });
});

describe('angleAt', () => {
  it('measures a 90-degree angle', () => {
    const deg = angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(deg).toBeCloseTo(90);
  });

  it('measures a 180-degree (straight) angle', () => {
    const deg = angleAt({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(deg).toBeCloseTo(180);
  });

  it('measures a 45-degree acute angle', () => {
    const deg = angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });
    expect(deg).toBeCloseTo(45);
  });

  it('is scale-invariant along each ray', () => {
    const deg = angleAt({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 8, z: 0 });
    expect(deg).toBeCloseTo(90);
  });

  it('returns 0 for a degenerate vertex coincident with an endpoint', () => {
    const deg = angleAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });
    expect(deg).toBe(0);
  });
});
