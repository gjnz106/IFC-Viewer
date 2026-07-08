import { describe, it, expect } from 'vitest';
import { mergeStoreys, storeyWorldY, type StoreySource } from './storeys.js';

function s(expressID: number, name: string, elevation: number, elementCount?: number): StoreySource {
  return { expressID, name, elevation, elementCount };
}

describe('storeyWorldY', () => {
  it('subtracts the shared center offset from the raw elevation', () => {
    expect(storeyWorldY(3.0, 0)).toBe(3.0);
    expect(storeyWorldY(3.0, 1.5)).toBeCloseTo(1.5);
    expect(storeyWorldY(0, -2)).toBe(2);
  });
});

describe('mergeStoreys', () => {
  it('sorts by elevation and keeps all storeys when counts are unknown', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(3, 'L2', 6, undefined), s(1, 'L0', 0, undefined), s(2, 'L1', 3, undefined)],
    }]);
    expect(merged.map(m => m.name)).toEqual(['L0', 'L1', 'L2']);
  });

  it('drops storeys with a known zero element count (junk)', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(1, 'Ground', 0, 40), s(2, 'Empty Ref Plane', 3, 0), s(3, 'Roof', 6, 12)],
    }]);
    expect(merged.map(m => m.name)).toEqual(['Ground', 'Roof']);
  });

  it('never empties the list even if every storey has a zero count', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(1, 'A', 0, 0), s(2, 'B', 3, 0)],
    }]);
    expect(merged).toHaveLength(2); // falls back to the unfiltered set
  });

  it('dedupes near-identical elevations, keeping the better-populated storey', () => {
    const merged = mergeStoreys([
      { modelIdx: 0, storeys: [s(1, 'Level 1 (A)', 3.0, 50)] },
      { modelIdx: 1, storeys: [s(2, 'Level 1 (B)', 3.05, 5)] }, // within 0.1m, fewer elements
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Level 1 (A)');
    expect(merged[0].elementCount).toBe(50);
  });

  it('does not dedupe storeys more than the epsilon apart', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(1, 'L0', 0, 10), s(2, 'L1', 0.5, 10)],
    }]);
    expect(merged).toHaveLength(2);
  });

  it('computes topElevation from the next kept storey', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(1, 'L0', 0, 10), s(2, 'L1', 3, 10), s(3, 'L2', 6.5, 10)],
    }]);
    expect(merged[0].topElevation).toBe(3);
    expect(merged[1].topElevation).toBe(6.5);
  });

  it('falls back to elevation + 3.5 for the topmost storey', () => {
    const merged = mergeStoreys([{ modelIdx: 0, storeys: [s(1, 'Roof', 10, 5)] }]);
    expect(merged[0].topElevation).toBe(13.5);
  });

  it('topElevation skips a storey removed as junk', () => {
    const merged = mergeStoreys([{
      modelIdx: 0,
      storeys: [s(1, 'L0', 0, 10), s(2, 'Junk', 3, 0), s(3, 'L1', 6, 10)],
    }]);
    expect(merged.map(m => m.name)).toEqual(['L0', 'L1']);
    expect(merged[0].topElevation).toBe(6); // next KEPT storey, not the removed junk one
  });

  it('merges storeys across multiple federated models', () => {
    const merged = mergeStoreys([
      { modelIdx: 0, storeys: [s(1, 'Ground (Arch)', 0, 20)] },
      { modelIdx: 2, storeys: [s(5, 'Ground (MEP)', 0.02, 8)] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].modelIdx).toBe(0); // higher element count wins
  });
});
