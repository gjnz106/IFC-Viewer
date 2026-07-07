import { describe, it, expect } from 'vitest';
import { runCompare } from './compare.js';

// Minimal entity shape doCompare()/runCompare() read: keyed by GlobalId,
// each entity also carries its own `globalId` (used once unmatched).
let nextEid = 1;
function entity(globalId: string, overrides: Partial<Record<string, any>> = {}) {
  return {
    expressID: nextEid++,
    globalId,
    type: 'IfcDoor',
    name: '',
    objectType: '',
    tag: '',
    description: '',
    ...overrides,
  };
}

describe('runCompare smart-match (Phase 2, unmatched-by-GlobalId pairing)', () => {
  it('does not pair unrelated same-type/same-ObjectType elements on ObjectType alone', () => {
    // 10 new doors + 3 removed doors, all IfcDoor / same ObjectType, but with
    // no Name or Tag evidence linking any specific pair — this is exactly the
    // scenario that used to make the greedy matcher invent bogus "modified
    // (Recreated)" pairs from unrelated elements.
    const a: Record<string, any> = {};
    const b: Record<string, any> = {};
    for (let i = 0; i < 3; i++) {
      const gid = 'A-removed-' + i;
      a[gid] = entity(gid, { objectType: 'Door_Standard', name: '', tag: '' });
    }
    for (let i = 0; i < 10; i++) {
      const gid = 'B-added-' + i;
      b[gid] = entity(gid, { objectType: 'Door_Standard', name: '', tag: '' });
    }

    const result = runCompare(a, b);
    expect(result.modified.length).toBe(0);
    expect(result.removed.length).toBe(3);
    expect(result.added.length).toBe(10);
  });

  it('pairs elements across a GlobalId change when Tag (Revit ElementId) matches', () => {
    const a = { 'gid-old': entity('gid-old', { tag: 'E-12345', name: 'Door-A' }) };
    const b = { 'gid-new': entity('gid-new', { tag: 'E-12345', name: 'Door-A' }) };

    const result = runCompare(a, b);
    expect(result.modified.length).toBe(1);
    expect(result.added.length).toBe(0);
    expect(result.removed.length).toBe(0);
    expect(result.modified[0].diffs.some((d: any) => d.prop === 'GlobalId')).toBe(true);
  });

  it('pairs elements across a GlobalId change when Name matches exactly', () => {
    const a = { 'gid-old': entity('gid-old', { name: 'Door-Unique-42' }) };
    const b = { 'gid-new': entity('gid-new', { name: 'Door-Unique-42' }) };

    const result = runCompare(a, b);
    expect(result.modified.length).toBe(1);
  });

  it('does not pair when only ObjectType matches and there is a same-type distractor with a real Name match', () => {
    // Two doors in A (one has a name, one doesn't); one door in B whose name
    // matches the named one. The unnamed A door must NOT get matched via
    // ObjectType alone once the named pair is taken.
    const a = {
      'a-named': entity('a-named', { name: 'Door-77', objectType: 'Door_Standard' }),
      'a-unnamed': entity('a-unnamed', { name: '', objectType: 'Door_Standard' }),
    };
    const b = {
      'b-named': entity('b-named', { name: 'Door-77', objectType: 'Door_Standard' }),
    };

    const result = runCompare(a, b);
    expect(result.modified.length).toBe(1);
    expect(result.removed.length).toBe(1);
    expect(result.removed[0].entity.globalId).toBe('a-unnamed');
  });
});
