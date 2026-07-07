import { describe, it, expect } from 'vitest';
import { bboxGap } from './clash.js';

const box = (mnX: number, mnY: number, mnZ: number, mxX: number, mxY: number, mxZ: number) => ({ mnX, mnY, mnZ, mxX, mxY, mxZ });

describe('bboxGap (clash clearance)', () => {
  it('is 0 for overlapping boxes', () => {
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(0.5, 0.5, 0.5, 1.5, 1.5, 1.5);
    expect(bboxGap(a, b)).toBe(0);
  });

  it('is 0 for boxes that only touch (zero clearance)', () => {
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(1, 0, 0, 2, 1, 1);
    expect(bboxGap(a, b)).toBe(0);
  });

  it('measures the real separation along a single axis', () => {
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(1.05, 0, 0, 2, 1, 1); // 50mm gap on X, flush on Y/Z
    expect(bboxGap(a, b)).toBeCloseTo(0.05, 6);
  });

  it('measures diagonal (multi-axis) separation, not just per-axis', () => {
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(1.03, 1.04, 0, 2, 2, 1); // 30mm X gap + 40mm Y gap => 50mm hypotenuse
    expect(bboxGap(a, b)).toBeCloseTo(0.05, 6);
  });

  it('a near-miss within tolerance is correctly surfaced (not silently 0)', () => {
    // This is the bug bboxGap was introduced to fix: bboxPenetration returns 0
    // for any pair of separated boxes, which used to make every clearance
    // check fail even when the elements were within the configured minimum
    // distance. bboxGap must return the true positive gap here.
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(1.008, 0, 0, 2, 1, 1); // 8mm gap
    const gap = bboxGap(a, b);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeCloseTo(0.008, 6);
    const toleranceM = 0.01; // 10mm minimum distance
    expect(gap <= toleranceM).toBe(true); // should register as a clearance hit
  });
});
