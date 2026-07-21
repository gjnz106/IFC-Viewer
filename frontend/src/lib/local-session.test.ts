import { describe, it, expect } from 'vitest';
import {
  localSessionKey, emptyManifest, parseManifest, serializeManifest,
  withSlotAdded, withSlotRemoved,
} from './local-session.js';

describe('localSessionKey', () => {
  it('builds a per-slot key', () => {
    expect(localSessionKey(0)).toBe('local-session:slot0');
    expect(localSessionKey(3)).toBe('local-session:slot3');
  });
});

describe('parseManifest / serializeManifest', () => {
  it('round-trips a manifest', () => {
    const m = { slots: [{ idx: 0, name: 'a.ifc' }, { idx: 2, name: 'b.ifc' }] };
    expect(parseManifest(serializeManifest(m))).toEqual(m);
  });

  it('returns empty manifest for null input', () => {
    expect(parseManifest(null)).toEqual(emptyManifest());
  });

  it('returns empty manifest for corrupt JSON', () => {
    expect(parseManifest('not json')).toEqual(emptyManifest());
  });

  it('returns empty manifest when shape is wrong', () => {
    expect(parseManifest(JSON.stringify({ foo: 'bar' }))).toEqual(emptyManifest());
  });

  it('filters malformed entries in slots', () => {
    expect(parseManifest(JSON.stringify({ slots: [{ idx: 0, name: 'a.ifc' }, 'x', { idx: 1 }] })))
      .toEqual({ slots: [{ idx: 0, name: 'a.ifc' }] });
  });
});

describe('withSlotAdded', () => {
  it('adds a new slot, sorted by idx', () => {
    expect(withSlotAdded({ slots: [{ idx: 1, name: 'b.ifc' }] }, 0, 'a.ifc'))
      .toEqual({ slots: [{ idx: 0, name: 'a.ifc' }, { idx: 1, name: 'b.ifc' }] });
  });

  it('overwrites the name if slot already present', () => {
    const m = { slots: [{ idx: 0, name: 'old.ifc' }, { idx: 1, name: 'b.ifc' }] };
    expect(withSlotAdded(m, 0, 'new.ifc')).toEqual({ slots: [{ idx: 0, name: 'new.ifc' }, { idx: 1, name: 'b.ifc' }] });
  });

  it('does not mutate the input', () => {
    const m = { slots: [{ idx: 1, name: 'b.ifc' }] };
    withSlotAdded(m, 0, 'a.ifc');
    expect(m).toEqual({ slots: [{ idx: 1, name: 'b.ifc' }] });
  });
});

describe('withSlotRemoved', () => {
  it('removes a slot', () => {
    expect(withSlotRemoved({ slots: [{ idx: 0, name: 'a.ifc' }, { idx: 1, name: 'b.ifc' }] }, 0))
      .toEqual({ slots: [{ idx: 1, name: 'b.ifc' }] });
  });

  it('is a no-op if slot not present', () => {
    const m = { slots: [{ idx: 1, name: 'b.ifc' }] };
    expect(withSlotRemoved(m, 0)).toBe(m);
  });
});
