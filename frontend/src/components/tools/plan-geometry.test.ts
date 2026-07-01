import { describe, it, expect } from 'vitest';
import { planBasis, worldToUV, uvToWorld, rotatedExtent } from './plan-geometry.js';

const cam = { x: 0, z: 0 };
const frustum = { left: -50, right: 50, top: 50, bottom: -50 };

describe('planBasis', () => {
  it('at tnAngle=0 matches the pre-existing axis-aligned convention (right=+X, up=-Z)', () => {
    const b = planBasis(0);
    expect(b.rx).toBeCloseTo(1, 10); expect(b.rz).toBeCloseTo(0, 10);
    expect(b.ux).toBeCloseTo(0, 10); expect(b.uz).toBeCloseTo(-1, 10);
  });
  it('matches the camera.up formula already present in the codebase for any angle', () => {
    for (const tn of [0.3, 1.1, -0.7, Math.PI / 2]) {
      const b = planBasis(tn);
      // up(tn) = (-sin(tn), 0, -cos(tn)) — this exact formula already existed
      // (unused) in plan-overlay.ts for camera.up; planBasis must reproduce it.
      expect(b.ux).toBeCloseTo(-Math.sin(tn), 10);
      expect(b.uz).toBeCloseTo(-Math.cos(tn), 10);
    }
  });
  it('right and up are always unit length and orthogonal', () => {
    for (const tn of [0, 0.5, 1.5, 3.0, -2.2]) {
      const b = planBasis(tn);
      expect(b.rx * b.rx + b.rz * b.rz).toBeCloseTo(1, 10);
      expect(b.ux * b.ux + b.uz * b.uz).toBeCloseTo(1, 10);
      expect(b.rx * b.ux + b.rz * b.uz).toBeCloseTo(0, 10); // orthogonal
    }
  });
});

describe('worldToUV at tnAngle=0 (backward compatibility)', () => {
  it('reduces exactly to the original axis-aligned formula', () => {
    // Original: u=(wx-camX-left)/fw ; v=1-((camZ-wz)-bottom)/fh
    const wx = 12, wz = -7;
    const [u, v] = worldToUV(wx, wz, cam, frustum, 0);
    const fw = frustum.right - frustum.left, fh = frustum.top - frustum.bottom;
    const relX = wx - cam.x, relZup = cam.z - wz;
    const uExpected = (relX - frustum.left) / fw;
    const vExpected = 1 - (relZup - frustum.bottom) / fh;
    expect(u).toBeCloseTo(uExpected, 10);
    expect(v).toBeCloseTo(vExpected, 10);
  });
  it('camera position (0,0) maps to the canvas centre (0.5,0.5) for a symmetric frustum', () => {
    const [u, v] = worldToUV(0, 0, cam, frustum, 0);
    expect(u).toBeCloseTo(0.5, 10);
    expect(v).toBeCloseTo(0.5, 10);
  });
  it('a point directly to world +X of the camera moves right on screen (u increases)', () => {
    const [u] = worldToUV(10, 0, cam, frustum, 0);
    expect(u).toBeGreaterThan(0.5);
  });
  it('a point toward world -Z (project north) of the camera moves up on screen (v decreases)', () => {
    const [, v] = worldToUV(0, -10, cam, frustum, 0);
    expect(v).toBeLessThan(0.5);
  });
});

describe('worldToUV / uvToWorld round-trip', () => {
  const cases: [number, number, number][] = [
    [0, 0, 0], [10, -5, 0.4], [-30, 25, Math.PI / 2], [7, 7, Math.PI], [-12, -8, -1.3],
  ];
  for (const [wx, wz, tn] of cases) {
    it(`world(${wx},${wz}) survives a round trip through UV at tn=${tn.toFixed(2)}`, () => {
      const [u, v] = worldToUV(wx, wz, cam, frustum, tn);
      const [wx2, wz2] = uvToWorld(u, v, cam, frustum, tn);
      expect(wx2).toBeCloseTo(wx, 8);
      expect(wz2).toBeCloseTo(wz, 8);
    });
  }
  it('round-trips with an off-centre camera position too', () => {
    const offCam = { x: 123.4, z: -56.7 };
    const [u, v] = worldToUV(200, -10, offCam, frustum, 0.8);
    const [wx, wz] = uvToWorld(u, v, offCam, frustum, 0.8);
    expect(wx).toBeCloseTo(200, 8);
    expect(wz).toBeCloseTo(-10, 8);
  });
});

describe('worldToUV rotation actually rotates the render', () => {
  it('a 90° true-north turn maps what was "north of camera" to "right on screen" instead of "up"', () => {
    // At tn=0, a point due project-north of the camera (world -Z) renders "up" (v<0.5, u≈0.5).
    const [u0, v0] = worldToUV(0, -10, cam, frustum, 0);
    expect(v0).toBeLessThan(0.5);
    expect(u0).toBeCloseTo(0.5, 6);
    // At tn=90°, the SAME world point renders with its offset moved from the
    // v-axis onto the u-axis (screen-right) instead — confirming the basis
    // (and therefore the actual 3D render, which uses the same formula for
    // camera.up) really rotates with tnAngle, unlike the old cosmetic-arrow-
    // only behavior where the render never moved at all.
    const [u90, v90] = worldToUV(0, -10, cam, frustum, Math.PI / 2);
    expect(v90).toBeCloseTo(0.5, 6);           // no longer offset vertically
    expect(u90).toBeGreaterThan(0.5);          // now offset horizontally instead
    // A pure 90° rotation preserves the magnitude of the offset, just moves
    // which screen axis it shows up on.
    expect(Math.abs(u90 - 0.5)).toBeCloseTo(Math.abs(v0 - 0.5), 10);
  });
});

describe('rotatedExtent', () => {
  const bounds = { minX: -10, maxX: 10, minZ: -4, maxZ: 4 };
  it('at tnAngle=0 matches the plain axis-aligned box size', () => {
    const { sx, sz } = rotatedExtent(bounds, 0);
    expect(sx).toBeCloseTo(20, 8);
    expect(sz).toBeCloseTo(8, 8);
  });
  it('at 90°, width and depth swap (a 20×8 box viewed rotated 90° reads as 8×20)', () => {
    const { sx, sz } = rotatedExtent(bounds, Math.PI / 2);
    expect(sx).toBeCloseTo(8, 6);
    expect(sz).toBeCloseTo(20, 6);
  });
  it('at 45°, matches the hand-computed projected-corner spread (not just the raw axis size)', () => {
    // A 20×8 rectangle's corners projected onto a 45°-rotated basis: the two
    // axes trade off (one can end up SMALLER than the original 20, the other
    // larger) — rotatedExtent must always frame the union of the rotated
    // corners exactly, not simply "grow monotonically" (that only holds for
    // squares — see the next test).
    const { sx, sz } = rotatedExtent(bounds, Math.PI / 4);
    const c = Math.SQRT1_2; // cos(45°) = sin(45°)
    // r = x*cos - z*sin over the 4 corners → spread = (maxX-minX+maxZ-minZ) * c... but
    // signs differ per corner, so compute directly from the same projection the
    // implementation uses (independent hand re-derivation, not a copy of the code):
    // corners (x,z): (-10,-4)(10,-4)(10,4)(-10,4); r=x*c - z*c (since rz=-sin=-c)... i.e r=(x-z)*c? no:
    // rx=cos=c, rz=-sin=-c → r = x*c + z*(-c) = (x - z) * c.
    const rVals = [(-10 - -4), (10 - -4), (10 - 4), (-10 - 4)].map(d => d * c);
    const expectedSx = Math.max(...rVals) - Math.min(...rVals);
    // ux=-sin=-c, uz=-cos=-c → u = x*(-c) + z*(-c) = -(x+z)*c.
    const uVals = [(-10 + -4), (10 + -4), (10 + 4), (-10 + 4)].map(s => -s * c);
    const expectedSz = Math.max(...uVals) - Math.min(...uVals);
    expect(sx).toBeCloseTo(expectedSx, 8);
    expect(sz).toBeCloseTo(expectedSz, 8);
  });
  it('a square box only ever grows (or stays equal) when rotated — extremes at 0°/90°', () => {
    const sq = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    const a = rotatedExtent(sq, 0);
    const rotated = rotatedExtent(sq, 0.37);
    // For a SQUARE specifically (unlike a general rectangle), any rotation off
    // the axis-aligned angles increases the axis-aligned bounding size — this
    // one does hold, since both axes are symmetric.
    expect(rotated.sx).toBeGreaterThan(a.sx - 1e-9);
    expect(rotated.sz).toBeGreaterThan(a.sz - 1e-9);
    // 45° is the worst case for a square: bounding size becomes the full diagonal.
    const at45 = rotatedExtent(sq, Math.PI / 4);
    expect(at45.sx).toBeCloseTo(10 * Math.SQRT2, 6);
    expect(at45.sz).toBeCloseTo(10 * Math.SQRT2, 6);
  });
});
