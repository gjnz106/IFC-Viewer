import { describe, it, expect } from 'vitest';
import {
  findDuplicateGuids,
  checkStoreyNaming,
  checkGeoReference,
  buildCrossDisciplineReport,
} from './cross-discipline.js';

describe('findDuplicateGuids', () => {
  it('flags GlobalIds present in 2+ models', () => {
    const els = [
      { globalId: 'A', modelIdx: 0, name: 'Wall1', category: 'Walls' },
      { globalId: 'A', modelIdx: 1, name: 'Wall1b', category: 'Walls' },
      { globalId: 'B', modelIdx: 0, name: 'Col1', category: 'Columns' },
      { globalId: 'C', modelIdx: 0, name: 'x', category: 'Walls' },
      { globalId: 'C', modelIdx: 0, name: 'x2', category: 'Walls' }, // dup within same model → not cross-model
    ];
    const r = findDuplicateGuids(els);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ guid: 'A', modelCount: 2 });
    expect(r[0].occurrences).toHaveLength(2);
  });
  it('ignores elements without a globalId', () => {
    expect(findDuplicateGuids([{ modelIdx: 0 }, { modelIdx: 1 }])).toEqual([]);
  });
});

describe('checkStoreyNaming', () => {
  it('is consistent when all models share the same storeys', () => {
    const r = checkStoreyNaming([
      { idx: 0, name: 'ARC', storeys: ['L1', 'L2'] },
      { idx: 1, name: 'STR', storeys: ['L2', 'L1'] },
    ]);
    expect(r.consistent).toBe(true);
    expect(r.allStoreyNames).toEqual(['L1', 'L2']);
    expect(r.perModel.every(p => p.missing.length === 0)).toBe(true);
  });
  it('reports missing storeys per model', () => {
    const r = checkStoreyNaming([
      { idx: 0, name: 'ARC', storeys: ['L1', 'L2', 'Roof'] },
      { idx: 1, name: 'MEP', storeys: ['L1', 'L2'] },
    ]);
    expect(r.consistent).toBe(false);
    expect(r.perModel.find(p => p.idx === 1)!.missing).toEqual(['Roof']);
  });
  it('trims and de-duplicates names for the union', () => {
    const r = checkStoreyNaming([{ idx: 0, name: 'A', storeys: [' L1 ', 'L1'] }]);
    expect(r.allStoreyNames).toEqual(['L1']);
  });
});

describe('checkGeoReference', () => {
  const base = { lat: 1.3, lon: 103.8, elev: 0 };
  it('is aligned when sites match within tolerance', () => {
    const r = checkGeoReference([
      { modelIdx: 0, modelName: 'A', ...base },
      { modelIdx: 1, modelName: 'B', lat: 1.3 + 1e-7, lon: 103.8, elev: 0 },
    ]);
    expect(r.aligned).toBe(true);
    expect(r.mismatches).toEqual([]);
    expect(r.withGeo).toBe(2);
  });
  it('flags a model whose coordinates differ beyond tolerance', () => {
    const r = checkGeoReference([
      { modelIdx: 0, modelName: 'A', ...base },
      { modelIdx: 1, modelName: 'B', lat: 1.35, lon: 103.8, elev: 0 },
    ]);
    expect(r.aligned).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0].modelIdx).toBe(1);
  });
  it('lists models missing geo-reference', () => {
    const r = checkGeoReference([
      { modelIdx: 0, modelName: 'A', ...base },
      { modelIdx: 1, modelName: 'B', lat: null, lon: null, elev: null },
    ]);
    expect(r.missingGeo).toEqual([{ modelIdx: 1, modelName: 'B' }]);
    expect(r.aligned).toBe(true); // the one with geo has nothing to conflict with
  });
  it('is not aligned when no model has geo-reference', () => {
    const r = checkGeoReference([{ modelIdx: 0, modelName: 'A', lat: null, lon: null, elev: null }]);
    expect(r.aligned).toBe(false);
    expect(r.reference).toBeNull();
  });
});

describe('buildCrossDisciplineReport', () => {
  it('combines all three checks', () => {
    const r = buildCrossDisciplineReport(
      [{ globalId: 'A', modelIdx: 0 }, { globalId: 'A', modelIdx: 1 }],
      [{ idx: 0, name: 'A', storeys: ['L1'] }, { idx: 1, name: 'B', storeys: ['L1'] }],
      [{ modelIdx: 0, modelName: 'A', lat: 1.3, lon: 103.8, elev: 0 }, { modelIdx: 1, modelName: 'B', lat: 1.3, lon: 103.8, elev: 0 }],
    );
    expect(r.modelCount).toBe(2);
    expect(r.duplicateGuids).toHaveLength(1);
    expect(r.storeyNaming.consistent).toBe(true);
    expect(r.geoReference.aligned).toBe(true);
  });
});
