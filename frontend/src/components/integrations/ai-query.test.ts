import { describe, it, expect } from 'vitest';
import {
  aiApplyFilter,
  aiGroupCount,
  resolveQuantityKey,
  quantityUnit,
  sumQuantityValues,
  quantityTakeoff,
  takeoffToMarkdown,
  takeoffToCsv,
  listElements,
} from './ai-query.js';

const elements = [
  { expressID: 1, globalId: 'g1', modelIdx: 0, ifcClass: 'IfcColumn', category: 'Columns', name: 'C1', storey: 'L3', materials: ['Concrete'], quantities: { volume: 2, area: null, length: 3000, count: null } },
  { expressID: 2, globalId: 'g2', modelIdx: 0, ifcClass: 'IfcColumn', category: 'Columns', name: 'C2', storey: 'L3', materials: ['Concrete'], quantities: { volume: 3, area: null, length: 3000, count: null } },
  { expressID: 3, globalId: 'g3', modelIdx: 0, ifcClass: 'IfcSlab', category: 'Floors', name: 'S1', storey: 'L2', materials: ['Concrete', 'Rebar'], quantities: { volume: 10, area: 50, length: null, count: null } },
  { expressID: 4, globalId: 'g4', modelIdx: 1, ifcClass: 'IfcDoor', category: 'Doors', name: 'D1', storey: null, materials: [], quantities: null },
];

describe('aiApplyFilter', () => {
  it('matches category case-insensitively and fuzzily', () => {
    expect(aiApplyFilter(elements, { category: 'columns' })).toHaveLength(2);
  });
  it('filters by storey', () => {
    expect(aiApplyFilter(elements, { storey: 'l3' }).map(e => e.expressID)).toEqual([1, 2]);
  });
  it('filters by material across the materials array', () => {
    expect(aiApplyFilter(elements, { material: 'rebar' }).map(e => e.expressID)).toEqual([3]);
  });
  it('filters by modelIdx exactly', () => {
    expect(aiApplyFilter(elements, { modelIdx: 1 }).map(e => e.expressID)).toEqual([4]);
  });
  it('returns everything for an empty filter', () => {
    expect(aiApplyFilter(elements, {})).toHaveLength(4);
  });
});

describe('aiGroupCount', () => {
  it('groups and counts, sorted descending', () => {
    expect(aiGroupCount(elements, 'category')).toEqual([
      { name: 'Columns', count: 2 },
      { name: 'Floors', count: 1 },
      { name: 'Doors', count: 1 },
    ]);
  });
});

describe('resolveQuantityKey / quantityUnit', () => {
  it('resolves English and Vietnamese aliases', () => {
    expect(resolveQuantityKey('volume')).toBe('volume');
    expect(resolveQuantityKey('Thể tích')).toBe('volume');
    expect(resolveQuantityKey('AREA')).toBe('area');
    expect(resolveQuantityKey('số lượng')).toBe('count');
  });
  it('defaults unknown to volume', () => {
    expect(resolveQuantityKey('nonsense')).toBe('volume');
    expect(resolveQuantityKey(undefined as any)).toBe('volume');
  });
  it('maps units', () => {
    expect(quantityUnit('volume')).toBe('m³');
    expect(quantityUnit('area')).toBe('m²');
    expect(quantityUnit('length')).toBe('mm');
    expect(quantityUnit('count')).toBe('cái');
  });
});

describe('sumQuantityValues', () => {
  it('sums present values and counts missing (null quantities)', () => {
    expect(sumQuantityValues(elements, 'volume')).toEqual({ total: 15, withQuantity: 3, missing: 1 });
    expect(sumQuantityValues(elements, 'area')).toEqual({ total: 50, withQuantity: 1, missing: 3 });
  });
});

describe('quantityTakeoff', () => {
  it('groups by storey and sums, sorted by total desc', () => {
    const r = quantityTakeoff(elements, { quantity: 'volume', groupBy: 'storey' });
    expect(r.quantity).toBe('volume');
    expect(r.unit).toBe('m³');
    expect(r.grandTotal).toBe(15);
    expect(r.totalElements).toBe(4);
    expect(r.elementsWithQuantity).toBe(3);
    expect(r.elementsMissing).toBe(1);
    expect(r.rows).toEqual([
      { name: 'L2', count: 1, total: 10, withQuantity: 1, missing: 0 },
      { name: 'L3', count: 2, total: 5, withQuantity: 2, missing: 0 },
      { name: '(không xác định)', count: 1, total: 0, withQuantity: 0, missing: 1 },
    ]);
  });

  it('groups by material, letting shared elements land in each material', () => {
    const r = quantityTakeoff(elements, { quantity: 'volume', groupBy: 'material' });
    const byName = Object.fromEntries(r.rows.map(x => [x.name, x.total]));
    expect(byName['Concrete']).toBe(15); // C1(2)+C2(3)+S1(10)
    expect(byName['Rebar']).toBe(10);    // S1
    expect(byName['(không gán vật liệu)']).toBe(0); // door
  });

  it('respects a pre-filter and defaults groupBy to category', () => {
    const r = quantityTakeoff(elements, { quantity: 'volume', filter: { category: 'columns' } });
    expect(r.groupBy).toBe('category');
    expect(r.totalElements).toBe(2);
    expect(r.grandTotal).toBe(5);
  });
});

describe('takeoffToMarkdown / takeoffToCsv', () => {
  const r = quantityTakeoff(elements, { quantity: 'volume', groupBy: 'storey' });
  it('renders a markdown table with header and total row', () => {
    const md = takeoffToMarkdown(r);
    expect(md).toContain('| Storey | Count | Volume (m³) | Missing |');
    expect(md).toContain('| L2 | 1 | 10 | 0 |');
    expect(md).toContain('| **Tổng** | **4** | **15** | **1** |');
  });
  it('renders CSV with header and total row', () => {
    const csv = takeoffToCsv(r).split('\n');
    expect(csv[0]).toBe('Storey,count,volume_m³,with_quantity,missing');
    expect(csv[csv.length - 1]).toBe('Total,4,15,3,1');
  });
});

describe('listElements', () => {
  it('lists matching elements with key fields', () => {
    const r = listElements(elements, { category: 'columns' });
    expect(r.total).toBe(2);
    expect(r.returned).toBe(2);
    expect(r.truncated).toBe(false);
    expect(r.items[0]).toMatchObject({ expressID: 1, name: 'C1', category: 'Columns', storey: 'L3' });
  });
  it('truncates to the limit and flags it', () => {
    const r = listElements(elements, {}, 2);
    expect(r.total).toBe(4);
    expect(r.returned).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.limit).toBe(2);
  });
});
