import { describe, it, expect } from 'vitest';
import { makeSnapshot, addSnapshot, diffStats } from './snapshots.js';

describe('makeSnapshot', () => {
  it('captures kind + a copy of stats and a unique id', () => {
    const s = makeSnapshot('validate', { findings: 3 }, 'run A');
    expect(s.kind).toBe('validate');
    expect(s.label).toBe('run A');
    expect(s.stats).toEqual({ findings: 3 });
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
    expect(typeof s.ts).toBe('number');
  });
});

describe('addSnapshot', () => {
  it('prepends newest and caps the history length', () => {
    let list: any[] = [];
    for (let i = 0; i < 5; i++) list = addSnapshot(list, makeSnapshot('validate', { findings: i }), 3);
    expect(list).toHaveLength(3);
    expect(list[0].stats.findings).toBe(4); // newest first
    expect(list[2].stats.findings).toBe(2);
  });
});

describe('diffStats', () => {
  it('computes per-key deltas between two runs (auto-inferred numeric keys)', () => {
    const d = diffStats({ findings: 10, fail: 4, warn: 2 }, { findings: 6, fail: 1, warn: 3 });
    const byKey = Object.fromEntries(d.map(x => [x.key, x.delta]));
    expect(byKey.findings).toBe(-4);
    expect(byKey.fail).toBe(-3);
    expect(byKey.warn).toBe(1);
  });
  it('treats a key missing from one side as 0', () => {
    const d = diffStats(null, { findings: 5 });
    expect(d.find(x => x.key === 'findings')!.delta).toBe(5);
  });
  it('infers keys from BOTH sides even if one is missing them', () => {
    const d = diffStats({ pass: 3 }, { findings: 5 });
    const byKey = Object.fromEntries(d.map(x => [x.key, x]));
    expect(byKey.pass).toEqual({ key: 'pass', prev: 3, curr: 0, delta: -3 });
    expect(byKey.findings).toEqual({ key: 'findings', prev: 0, curr: 5, delta: 5 });
  });
  it('ignores non-numeric fields like a gateway string', () => {
    const d = diffStats({ findings: 2, gateway: 'design' }, { findings: 1, gateway: 'design' });
    expect(d.map(x => x.key)).toEqual(['findings']);
  });
  it('works for arbitrary stat shapes (e.g. clash: total/hard/near)', () => {
    const d = diffStats({ total: 10, hard: 4, near: 6 }, { total: 7, hard: 2, near: 5 });
    const byKey = Object.fromEntries(d.map(x => [x.key, x.delta]));
    expect(byKey).toEqual({ total: -3, hard: -2, near: -1 });
  });
  it('respects an explicit keys list when given', () => {
    const d = diffStats({ a: 1, b: 2 }, { a: 3, b: 4 }, ['a']);
    expect(d).toEqual([{ key: 'a', prev: 1, curr: 3, delta: 2 }]);
  });
});
