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
  it('computes per-key deltas between two runs', () => {
    const d = diffStats({ findings: 10, fail: 4, warn: 2 }, { findings: 6, fail: 1, warn: 3 });
    const byKey = Object.fromEntries(d.map(x => [x.key, x.delta]));
    expect(byKey.findings).toBe(-4);
    expect(byKey.fail).toBe(-3);
    expect(byKey.warn).toBe(1);
  });
  it('treats missing keys as 0', () => {
    const d = diffStats(null, { findings: 5 });
    expect(d.find(x => x.key === 'findings')!.delta).toBe(5);
    expect(d.find(x => x.key === 'pass')!.delta).toBe(0);
  });
});
