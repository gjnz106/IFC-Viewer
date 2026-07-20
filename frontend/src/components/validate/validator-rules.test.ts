import { describe, it, expect } from 'vitest';
import { compoundToDeg, sgReadParam, sgHasParam, sgReadNumeric, SG_RULES } from './validator-rules.js';

const rule = (id: string) => {
  const r = SG_RULES.find((x: any) => x.id === id);
  if (!r) throw new Error('rule not found: ' + id);
  return r;
};
// Minimal ctx matching what sgBuildContext() produces.
const makeCtx = (opts: { buildings?: any[]; spaces?: any[] } = {}) => {
  const byClass = new Map<string, any[]>();
  if (opts.spaces) byClass.set('IfcSpace', opts.spaces);
  return {
    modelIDs: [{ modelID: 1, modelIdx: 0, spatial: { buildings: opts.buildings || [], sites: [], storeys: [] } }],
    byClass,
    entities: [...(opts.spaces || [])],
  };
};

describe('compoundToDeg', () => {
  it('passes through plain numbers', () => {
    expect(compoundToDeg(1.5)).toBe(1.5);
  });

  it('converts a degrees/minutes/seconds compound array', () => {
    expect(compoundToDeg([1, 30, 0])).toBeCloseTo(1.5, 6);
  });

  it('preserves sign for negative compound values', () => {
    expect(compoundToDeg([-1, 30, 0])).toBeCloseTo(-1.5, 6);
  });

  it('includes the micro-degree component', () => {
    expect(compoundToDeg([103, 36, 0, 1800000])).toBeCloseTo(103.6005, 6);
  });
});

describe('sgReadParam', () => {
  const entity = {
    psets: [
      {
        Name: { value: 'Pset_WallCommon' },
        HasProperties: [
          { Name: { value: 'FireRating' }, NominalValue: { value: '60 min', type: 'IfcLabel' } },
        ],
      },
      {
        Name: { value: 'Qto_WallBaseQuantities' },
        Quantities: [
          { Name: { value: 'Length' }, LengthValue: { value: 4200 } },
        ],
      },
    ],
  };

  it('returns null when entity has no psets', () => {
    expect(sgReadParam(null, 'FireRating')).toBeNull();
    expect(sgReadParam({}, 'FireRating')).toBeNull();
  });

  it('finds a property in HasProperties', () => {
    const r = sgReadParam(entity, 'FireRating');
    expect(r).toMatchObject({ value: '60 min', psetName: 'Pset_WallCommon' });
  });

  it('finds a quantity in Quantities', () => {
    const r = sgReadParam(entity, 'Length');
    expect(r).toMatchObject({ value: 4200, type: 'quantity', psetName: 'Qto_WallBaseQuantities' });
  });

  it('respects the pset name hint', () => {
    expect(sgReadParam(entity, 'FireRating', 'Qto_WallBaseQuantities')).toBeNull();
  });

  it('returns null for an unknown property', () => {
    expect(sgReadParam(entity, 'DoesNotExist')).toBeNull();
  });

  it('returns a null-value entry when NominalValue is missing', () => {
    const e = { psets: [{ Name: { value: 'P' }, HasProperties: [{ Name: { value: 'X' } }] }] };
    expect(sgReadParam(e, 'X')).toMatchObject({ value: null, psetName: 'P' });
  });
});

describe('sgHasParam', () => {
  const entity = {
    psets: [
      { Name: { value: 'P' }, HasProperties: [
        { Name: { value: 'Filled' }, NominalValue: { value: 'yes' } },
        { Name: { value: 'Blank' }, NominalValue: { value: '' } },
        { Name: { value: 'Null' } },
      ] },
    ],
  };

  it('is true when the value is non-empty', () => {
    expect(sgHasParam(entity, 'Filled')).toBe(true);
  });

  it('is false for an empty string value', () => {
    expect(sgHasParam(entity, 'Blank')).toBe(false);
  });

  it('is false when the property is missing entirely', () => {
    expect(sgHasParam(entity, 'Missing')).toBe(false);
  });

  it('is false when NominalValue is absent', () => {
    expect(sgHasParam(entity, 'Null')).toBe(false);
  });
});

describe('sgReadNumeric', () => {
  const entity = {
    psets: [
      { Name: { value: 'P' }, HasProperties: [
        { Name: { value: 'Count' }, NominalValue: { value: '12' } },
        { Name: { value: 'NotANumber' }, NominalValue: { value: 'abc' } },
      ] },
    ],
  };

  it('parses a numeric-looking string value', () => {
    expect(sgReadNumeric(entity, 'Count')).toBe(12);
  });

  it('returns null for a non-numeric value', () => {
    expect(sgReadNumeric(entity, 'NotANumber')).toBeNull();
  });

  it('returns null for a missing property', () => {
    expect(sgReadNumeric(entity, 'Missing')).toBeNull();
  });
});

// ── Regression: SG context data contract ──────────────────────────────
// These rules were silently broken because sgBuildContext() never supplied the
// data they read: `spatial.buildings` (an array) was never populated — only the
// `buildingName` string — so GEN-005 always reported "No IfcBuilding found"; and
// getAllProps() excludes IfcSpace, so byClass.get('IfcSpace') was always empty,
// making every space rule pass/skip vacuously. These tests pin the contract the
// context builder must satisfy.
describe('GEN-005 IfcBuilding present (reads spatial.buildings)', () => {
  it('passes when spatial.buildings has an entry', () => {
    const res = rule('GEN-005').check(makeCtx({ buildings: [{ expressID: 42, name: 'Block A' }] }));
    expect(res.failed).toHaveLength(0);
    expect(res.passed).toEqual([{ eid: 42, name: 'Block A' }]);
  });

  it('fails when no buildings are present', () => {
    const res = rule('GEN-005').check(makeCtx({ buildings: [] }));
    expect(res.passed).toHaveLength(0);
    expect(res.failed[0].reason).toMatch(/No IfcBuilding/);
  });
});

describe('BCA-SP01 spaces have a name (reads byClass.IfcSpace)', () => {
  it('separates named from unnamed spaces', () => {
    const res = rule('BCA-SP01').check(makeCtx({
      spaces: [
        { eid: 1, name: 'Office 1' },
        { eid: 2, name: '' },
      ],
    }));
    expect(res.passed).toEqual([{ eid: 1, name: 'Office 1' }]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].eid).toBe(2);
  });

  it('finds nothing to check when spaces are absent (the old always-empty state)', () => {
    const res = rule('BCA-SP01').check(makeCtx({ spaces: [] }));
    expect(res.passed).toHaveLength(0);
    expect(res.failed).toHaveLength(0);
  });
});

describe('LTA-001 carpark spaces (reads byClass.IfcSpace LongName)', () => {
  it('detects carpark spaces by LongName', () => {
    const res = rule('LTA-001').check(makeCtx({
      spaces: [
        { eid: 1, name: 'B1-01', LongName: { value: 'CARPARK' } },
        { eid: 2, name: 'Office', LongName: { value: 'OFFICE' } },
      ],
    }));
    expect(res.passed).toEqual([{ eid: 1, name: 'B1-01' }]);
  });
});
