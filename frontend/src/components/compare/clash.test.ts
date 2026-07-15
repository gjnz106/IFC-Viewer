import { describe, it, expect } from 'vitest';
import { bboxGap, passesBoxFilter, findDuplicatePairs, buildClashModelOptions, type BoxFilterConfig, type HashedElement } from './clash.js';

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

function cfg(overrides: Partial<BoxFilterConfig> = {}): BoxFilterConfig {
  return { sizeOn: false, sizeMm: 0, side: 'longest', volOn: false, volM3: 0, ...overrides };
}

describe('passesBoxFilter', () => {
  it('passes everything when both filters are off', () => {
    expect(passesBoxFilter(0.001, 0.001, 0.001, cfg())).toBe(true);
  });

  it('rejects a clash whose longest overlap side is below the size threshold', () => {
    // Overlap box 2mm x 2mm x 2mm — longest side 2mm, threshold 5mm
    expect(passesBoxFilter(0.002, 0.002, 0.002, cfg({ sizeOn: true, sizeMm: 5, side: 'longest' }))).toBe(false);
  });

  it('accepts a clash whose longest overlap side meets the size threshold', () => {
    expect(passesBoxFilter(0.002, 0.002, 0.05, cfg({ sizeOn: true, sizeMm: 5, side: 'longest' }))).toBe(true);
  });

  it('shortest-side mode rejects when even the largest axis is thin', () => {
    // shortest side = 1mm even though one axis is 100mm
    expect(passesBoxFilter(0.001, 0.05, 0.1, cfg({ sizeOn: true, sizeMm: 5, side: 'shortest' }))).toBe(false);
  });

  it('is exactly at the boundary (equal to threshold) — accepted', () => {
    expect(passesBoxFilter(0.005, 0.05, 0.1, cfg({ sizeOn: true, sizeMm: 5, side: 'shortest' }))).toBe(true);
  });

  it('rejects by volume when below the configured minimum', () => {
    // 10mm x 10mm x 10mm = 1e-6 m3
    expect(passesBoxFilter(0.01, 0.01, 0.01, cfg({ volOn: true, volM3: 0.001 }))).toBe(false);
  });

  it('accepts by volume when at/above the configured minimum', () => {
    expect(passesBoxFilter(0.5, 0.5, 0.5, cfg({ volOn: true, volM3: 0.001 }))).toBe(true);
  });

  it('requires passing BOTH filters when both are enabled', () => {
    const c = cfg({ sizeOn: true, sizeMm: 100, side: 'longest', volOn: true, volM3: 10 });
    expect(passesBoxFilter(0.2, 0.2, 0.2, c)).toBe(false); // longest side ok, volume too small
  });
});

function he(hash: number, type: string): HashedElement {
  return { hash, type };
}

describe('findDuplicatePairs', () => {
  it('pairs elements with equal hash and equal type', () => {
    const setA = { 1: he(111, 'IfcWall') };
    const setB = { 2: he(111, 'IfcWall') };
    expect(findDuplicatePairs(setA, setB, false)).toEqual([{ eidA: 1, eidB: 2 }]);
  });

  it('does not pair elements with equal hash but different type', () => {
    const setA = { 1: he(111, 'IfcWall') };
    const setB = { 2: he(111, 'IfcColumn') };
    expect(findDuplicatePairs(setA, setB, false)).toEqual([]);
  });

  it('does not pair elements with different hashes', () => {
    const setA = { 1: he(111, 'IfcWall') };
    const setB = { 2: he(222, 'IfcWall') };
    expect(findDuplicatePairs(setA, setB, false)).toEqual([]);
  });

  it('finds multiple pairs across a mixed set', () => {
    const setA = { 1: he(100, 'IfcWall'), 2: he(200, 'IfcSlab') };
    const setB = { 3: he(100, 'IfcWall'), 4: he(300, 'IfcWall') };
    expect(findDuplicatePairs(setA, setB, false)).toEqual([{ eidA: 1, eidB: 3 }]);
  });

  it('never pairs an element with itself in same-set mode', () => {
    const setA = { 1: he(100, 'IfcWall') };
    expect(findDuplicatePairs(setA, setA, true)).toEqual([]);
  });

  it('dedupes reciprocal pairs in same-set mode (self-clash)', () => {
    const set = { 1: he(100, 'IfcWall'), 2: he(100, 'IfcWall') };
    const pairs = findDuplicatePairs(set, set, true);
    expect(pairs).toHaveLength(1); // not 2 — (1,2) and (2,1) collapse to one
  });

  it('same-set mode still finds all distinct pairs among 3+ identical elements', () => {
    const set = { 1: he(100, 'IfcWall'), 2: he(100, 'IfcWall'), 3: he(100, 'IfcWall') };
    const pairs = findDuplicatePairs(set, set, true);
    expect(pairs).toHaveLength(3); // (1,2) (1,3) (2,3)
  });
});

// Fake File-ish objects (only .name is read by buildClashModelOptions).
const f = (name: string) => ({ name } as File);

describe('buildClashModelOptions (Phase 16 — Source/Target model dropdowns)', () => {
  it('lists only slots with a loaded model, labelled by file name', () => {
    const files = [f('A.ifc'), f('B.ifc')];
    const loadedModels = [{}, {}];
    expect(buildClashModelOptions(files, loadedModels)).toEqual([
      { idx: 0, label: 'A.ifc' },
      { idx: 1, label: 'B.ifc' },
    ]);
  });

  it('skips slots without a loaded model even if a file is present (still loading)', () => {
    const files = [f('A.ifc'), f('B.ifc')];
    const loadedModels = [{}, null];
    expect(buildClashModelOptions(files, loadedModels)).toEqual([{ idx: 0, label: 'A.ifc' }]);
  });

  it('includes federation slots (index >= 2)', () => {
    const files = [f('A.ifc'), f('B.ifc'), f('MEP.ifc')];
    const loadedModels = [{}, {}, {}];
    expect(buildClashModelOptions(files, loadedModels)).toEqual([
      { idx: 0, label: 'A.ifc' },
      { idx: 1, label: 'B.ifc' },
      { idx: 2, label: 'MEP.ifc' },
    ]);
  });

  it('falls back to a generic label when the file name is unknown', () => {
    const files: (File | null)[] = [null];
    const loadedModels = [{}];
    expect(buildClashModelOptions(files, loadedModels)).toEqual([{ idx: 0, label: 'Model 0' }]);
  });

  it('returns an empty list when nothing is loaded', () => {
    expect(buildClashModelOptions([], [])).toEqual([]);
  });
});
