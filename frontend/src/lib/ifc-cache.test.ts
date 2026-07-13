import { describe, it, expect } from 'vitest';
import { cacheKeyFor, planEviction, DEFAULT_CACHE_BUDGET_BYTES } from './ifc-cache.js';

describe('cacheKeyFor', () => {
  it('composes storagePath + updatedAt so a re-upload changes the key', () => {
    const k1 = cacheKeyFor({ storagePath: 'projects/p1/a.ifc', uploadedAt: 100 });
    const k2 = cacheKeyFor({ storagePath: 'projects/p1/a.ifc', uploadedAt: 200 });
    expect(k1).not.toBe(k2);
    expect(k1).toBe('projects/p1/a.ifc@100');
  });

  it('same storagePath + same updatedAt = same key', () => {
    const a = cacheKeyFor({ storagePath: 'x', uploadedAt: 5 });
    const b = cacheKeyFor({ storagePath: 'x', uploadedAt: 5 });
    expect(a).toBe(b);
  });
});

describe('planEviction', () => {
  it('evicts nothing when under budget', () => {
    const entries = [{ key: 'a', size: 100, lastAccess: 1 }];
    expect(planEviction(entries, 50, 1000)).toEqual([]);
  });

  it('evicts oldest-accessed entries first until under budget', () => {
    const entries = [
      { key: 'old', size: 400, lastAccess: 1 },
      { key: 'mid', size: 400, lastAccess: 2 },
      { key: 'new', size: 400, lastAccess: 3 },
    ];
    // total 1200 + incoming 200 = 1400, budget 1000 -> need to free 400
    const evicted = planEviction(entries, 200, 1000);
    expect(evicted).toEqual(['old']);
  });

  it('evicts multiple entries if one is not enough', () => {
    const entries = [
      { key: 'a', size: 100, lastAccess: 1 },
      { key: 'b', size: 100, lastAccess: 2 },
      { key: 'c', size: 100, lastAccess: 3 },
    ];
    // total 300 + incoming 250 = 550, budget 400 -> free 150 -> evict a(100) then b(100)
    const evicted = planEviction(entries, 250, 400);
    expect(evicted).toEqual(['a', 'b']);
  });

  it('uses the ~2GB default budget when omitted', () => {
    const entries = [{ key: 'a', size: DEFAULT_CACHE_BUDGET_BYTES, lastAccess: 1 }];
    expect(planEviction(entries, 1)).toEqual(['a']);
    expect(planEviction([], 100)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { key: 'a', size: 100, lastAccess: 2 },
      { key: 'b', size: 100, lastAccess: 1 },
    ];
    const copy = [...entries];
    planEviction(entries, 1000, 50);
    expect(entries).toEqual(copy);
  });
});
