import { describe, it, expect } from 'vitest';
import {
  buildModelSignature, signaturesMatch, formatCompareCounts, formatClashCounts,
  buildResultMetadata, outdatedBadgeLabel, resultStoragePath, RESULT_KINDS,
} from './cloud-results.js';

describe('resultStoragePath / RESULT_KINDS', () => {
  it('matches the Storage layout saveResult writes to', () => {
    expect(resultStoragePath('p1', 'compare')).toBe('projects/p1/results/compare.json');
    expect(resultStoragePath('p1', 'clash')).toBe('projects/p1/results/clash.json');
  });
  it('enumerates every result kind exactly once (deep-delete relies on this)', () => {
    expect([...RESULT_KINDS].sort()).toEqual(['clash', 'compare']);
  });
});

describe('buildModelSignature', () => {
  it('is deterministic for the same inputs', () => {
    const files = [{ name: 'a.ifc', size: 100 }, { name: 'b.ifc', size: 200 }];
    expect(buildModelSignature(files)).toBe(buildModelSignature(files));
    expect(buildModelSignature(files)).toBe(buildModelSignature([{ name: 'a.ifc', size: 100 }, { name: 'b.ifc', size: 200 }]));
  });

  it('changes when a file name changes', () => {
    const s1 = buildModelSignature([{ name: 'a.ifc', size: 100 }, { name: 'b.ifc', size: 200 }]);
    const s2 = buildModelSignature([{ name: 'a2.ifc', size: 100 }, { name: 'b.ifc', size: 200 }]);
    expect(s1).not.toBe(s2);
  });

  it('changes when a file size changes', () => {
    const s1 = buildModelSignature([{ name: 'a.ifc', size: 100 }]);
    const s2 = buildModelSignature([{ name: 'a.ifc', size: 101 }]);
    expect(s1).not.toBe(s2);
  });

  it('treats null/undefined slots distinctly from an empty list', () => {
    const s1 = buildModelSignature([{ name: 'a.ifc', size: 100 }, null]);
    const s2 = buildModelSignature([{ name: 'a.ifc', size: 100 }]);
    expect(s1).not.toBe(s2);
  });

  it('order matters (A/B swap is a real change)', () => {
    const s1 = buildModelSignature([{ name: 'a.ifc', size: 100 }, { name: 'b.ifc', size: 200 }]);
    const s2 = buildModelSignature([{ name: 'b.ifc', size: 200 }, { name: 'a.ifc', size: 100 }]);
    expect(s1).not.toBe(s2);
  });
});

describe('signaturesMatch', () => {
  it('matches identical signatures', () => {
    expect(signaturesMatch('abc', 'abc')).toBe(true);
  });
  it('rejects different signatures', () => {
    expect(signaturesMatch('abc', 'def')).toBe(false);
  });
  it('rejects when either side is empty/null/undefined', () => {
    expect(signaturesMatch('', '')).toBe(false);
    expect(signaturesMatch(null, 'abc')).toBe(false);
    expect(signaturesMatch('abc', undefined)).toBe(false);
  });
});

describe('formatCompareCounts', () => {
  it('counts each bucket length', () => {
    const counts = formatCompareCounts({
      added: [1, 2], removed: [1], modified: [1, 2, 3], unchanged: [1, 2, 3, 4],
    } as any);
    expect(counts).toEqual({ added: 2, removed: 1, modified: 3 });
  });
  it('handles empty arrays', () => {
    expect(formatCompareCounts({ added: [], removed: [], modified: [] } as any)).toEqual({ added: 0, removed: 0, modified: 0 });
  });
});

describe('formatClashCounts', () => {
  it('splits hard vs near by isHard', () => {
    const clashes = [{ isHard: true }, { isHard: true }, { isHard: false }, {}];
    expect(formatClashCounts(clashes as any)).toEqual({ total: 4, hard: 2, near: 2 });
  });
  it('handles empty', () => {
    expect(formatClashCounts([])).toEqual({ total: 0, hard: 0, near: 0 });
  });
});

describe('buildResultMetadata / outdatedBadgeLabel', () => {
  it('builds a metadata object with the given fields', () => {
    const meta = buildResultMetadata('a@b.com', { added: 1, removed: 0, modified: 0 }, 'sig123');
    expect(meta.ranBy).toBe('a@b.com');
    expect(meta.modelSignature).toBe('sig123');
    expect(meta.counts).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(typeof meta.ranAt).toBe('number');
  });

  it('outdatedBadgeLabel returns a non-empty string', () => {
    expect(outdatedBadgeLabel().length).toBeGreaterThan(0);
  });
});
