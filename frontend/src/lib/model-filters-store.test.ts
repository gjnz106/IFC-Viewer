import { describe, it, expect, beforeEach } from 'vitest';
import {
  addFilter, removeFilter, renameFilter, updateFilterModels,
  resolveFilter, captureVisibleModels,
  loadFilters, saveFilters, deleteProjectFilters,
  type ModelFilter,
} from './model-filters-store.js';

function makeFilter(id: string, name: string, models: string[] = ['a.ifc']): ModelFilter {
  return { id, name, createdAt: 1, models };
}

describe('addFilter', () => {
  it('prepends the new filter (newest first)', () => {
    const list = addFilter([makeFilter('1', 'old')], makeFilter('2', 'new'));
    expect(list.map(f => f.id)).toEqual(['2', '1']);
  });

  it('caps the list length', () => {
    const list = addFilter([makeFilter('1', 'a'), makeFilter('2', 'b')], makeFilter('3', 'c'), 2);
    expect(list.map(f => f.id)).toEqual(['3', '1']);
  });

  it('keeps at least one entry even with a nonsense cap', () => {
    expect(addFilter([], makeFilter('1', 'a'), 0)).toHaveLength(1);
  });
});

describe('removeFilter / renameFilter / updateFilterModels', () => {
  it('removes by id', () => {
    expect(removeFilter([makeFilter('1', 'a'), makeFilter('2', 'b')], '1').map(f => f.id)).toEqual(['2']);
  });

  it('renames by id and trims', () => {
    expect(renameFilter([makeFilter('1', 'a')], '1', '  MEP  ')[0].name).toBe('MEP');
  });

  it('keeps the old name when the new one is blank', () => {
    expect(renameFilter([makeFilter('1', 'a')], '1', '   ')[0].name).toBe('a');
  });

  it('replaces the model set but keeps identity', () => {
    const out = updateFilterModels([makeFilter('1', 'MEP', ['a.ifc'])], '1', ['b.ifc', 'c.ifc']);
    expect(out[0]).toMatchObject({ id: '1', name: 'MEP', createdAt: 1, models: ['b.ifc', 'c.ifc'] });
  });

  it('copies the incoming array so later mutation cannot leak in', () => {
    const models = ['b.ifc'];
    const out = updateFilterModels([makeFilter('1', 'MEP')], '1', models);
    models.push('sneaky.ifc');
    expect(out[0].models).toEqual(['b.ifc']);
  });
});

describe('resolveFilter', () => {
  it('splits loaded slots into visible and hidden', () => {
    const r = resolveFilter(['b.ifc'], ['a.ifc', 'b.ifc', 'c.ifc']);
    expect(r.visibleSlots).toEqual([1]);
    expect(r.hiddenSlots).toEqual([0, 2]);
    expect(r.missing).toEqual([]);
  });

  it('skips empty slots entirely — they are neither shown nor hidden', () => {
    // Slots 0/1 are the compare A/B pair and are empty in a federation session.
    const r = resolveFilter(['d.ifc'], [null, undefined, 'c.ifc', 'd.ifc']);
    expect(r.visibleSlots).toEqual([3]);
    expect(r.hiddenSlots).toEqual([2]);
  });

  it('reports filter entries that are not loaded', () => {
    const r = resolveFilter(['a.ifc', 'gone.ifc'], ['a.ifc']);
    expect(r.visibleSlots).toEqual([0]);
    expect(r.missing).toEqual(['gone.ifc']);
  });

  it('matches every slot sharing a duplicated file name', () => {
    const r = resolveFilter(['a.ifc'], ['a.ifc', 'a.ifc', 'b.ifc']);
    expect(r.visibleSlots).toEqual([0, 1]);
    expect(r.hiddenSlots).toEqual([2]);
  });

  it('hides everything when no filter model is loaded', () => {
    const r = resolveFilter(['gone.ifc'], ['a.ifc', 'b.ifc']);
    expect(r.visibleSlots).toEqual([]);
    expect(r.hiddenSlots).toEqual([0, 1]);
    expect(r.missing).toEqual(['gone.ifc']);
  });

  it('handles an empty filter as "hide all"', () => {
    const r = resolveFilter([], ['a.ifc']);
    expect(r.visibleSlots).toEqual([]);
    expect(r.hiddenSlots).toEqual([0]);
  });
});

describe('captureVisibleModels', () => {
  it('returns visible slot names in slot order', () => {
    expect(captureVisibleModels(['a.ifc', 'b.ifc', 'c.ifc'], new Set([1]))).toEqual(['a.ifc', 'c.ifc']);
  });

  it('ignores empty slots', () => {
    expect(captureVisibleModels([null, 'b.ifc'], new Set())).toEqual(['b.ifc']);
  });

  it('returns empty when everything is hidden', () => {
    expect(captureVisibleModels(['a.ifc'], new Set([0]))).toEqual([]);
  });
});

describe('localStorage glue', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a list per project', () => {
    saveFilters('p1', [makeFilter('1', 'MEP', ['m.ifc'])]);
    expect(loadFilters('p1')).toEqual([{ id: '1', name: 'MEP', createdAt: 1, models: ['m.ifc'] }]);
  });

  it('scopes storage per project', () => {
    saveFilters('p1', [makeFilter('1', 'MEP')]);
    expect(loadFilters('p2')).toEqual([]);
  });

  it('returns [] for a missing key', () => {
    expect(loadFilters('nope')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    localStorage.setItem('ifc.modelfilters.p1', '{not json');
    expect(loadFilters('p1')).toEqual([]);
  });

  it('returns [] when the stored value is not an array', () => {
    localStorage.setItem('ifc.modelfilters.p1', '{"id":"1"}');
    expect(loadFilters('p1')).toEqual([]);
  });

  it('drops records whose models field is not an array', () => {
    // One bad record must not take the whole panel down.
    localStorage.setItem('ifc.modelfilters.p1', '[{"id":"1","models":"oops"},{"id":"2","models":["a.ifc"]}]');
    expect(loadFilters('p1').map(f => f.id)).toEqual(['2']);
  });

  it('deletes a project bucket', () => {
    saveFilters('p1', [makeFilter('1', 'MEP')]);
    deleteProjectFilters('p1');
    expect(loadFilters('p1')).toEqual([]);
  });
});
