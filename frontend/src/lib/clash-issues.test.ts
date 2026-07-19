import { describe, it, expect } from 'vitest';
import { clashStableId, idInputFromResult } from './clash-id.js';
import {
  reconcileIssues, setIssueResolved, computeIssueMetrics, mergeIssueMaps, pruneGone,
  type IssueMap,
} from './clash-issues.js';

const mkClash = (over: any = {}) => ({
  elA: { type: 'IfcWall', name: 'W-101', tag: 'T1', eid: 11, ...over.elA },
  elB: { type: 'IfcPipeSegment', name: 'P-7', tag: 'T2', eid: 22, ...over.elB },
  point: { x: 1.02, y: 2.51, z: 0.11, ...over.point },
  isHard: over.isHard ?? true,
  isDuplicate: over.isDuplicate ?? false,
});

describe('clashStableId', () => {
  it('is stable when expressIDs change (re-exported model)', () => {
    const a = clashStableId(idInputFromResult(mkClash()));
    const b = clashStableId(idInputFromResult(mkClash({ elA: { eid: 9999 }, elB: { eid: 8888 } })));
    expect(a).toBe(b);
  });

  it('is order-independent (A/B swap gives the same id)', () => {
    const c = mkClash();
    const swapped = { ...c, elA: c.elB, elB: c.elA };
    expect(clashStableId(idInputFromResult(c))).toBe(clashStableId(idInputFromResult(swapped)));
  });

  it('tolerates small position jitter but separates distant clashes', () => {
    const base = clashStableId(idInputFromResult(mkClash()));
    const jitter = clashStableId(idInputFromResult(mkClash({ point: { x: 1.05 } })));
    const far = clashStableId(idInputFromResult(mkClash({ point: { x: 5.0 } })));
    expect(jitter).toBe(base);
    expect(far).not.toBe(base);
  });

  it('separates different element pairs at the same location', () => {
    const a = clashStableId(idInputFromResult(mkClash()));
    const b = clashStableId(idInputFromResult(mkClash({ elB: { name: 'P-8' } })));
    expect(a).not.toBe(b);
  });
});

describe('reconcileIssues', () => {
  it('marks first-run clashes as new', () => {
    const { next, resultIds, summary } = reconcileIssues({}, [mkClash()], 1000);
    expect(summary).toEqual({ newCount: 1, stillCount: 0, autoResolved: 0, reappeared: 0 });
    expect(next[resultIds[0]].status).toBe('new');
    expect(next[resultIds[0]].firstSeen).toBe(1000);
  });

  it('promotes re-detected clashes to active and auto-resolves absent ones', () => {
    const run1 = reconcileIssues({}, [mkClash(), mkClash({ elB: { name: 'P-8' } })], 1000);
    // second run: only the first clash remains
    const run2 = reconcileIssues(run1.next, [mkClash()], 2000);
    expect(run2.summary.stillCount).toBe(1);
    expect(run2.summary.autoResolved).toBe(1);
    expect(run2.next[run2.resultIds[0]].status).toBe('active');
    const gone = Object.values(run2.next).find(i => i.status === 'gone');
    expect(gone).toBeTruthy();
    expect(gone!.resolvedAt).toBe(2000);
  });

  it('flags manually-resolved clashes that reappear', () => {
    const run1 = reconcileIssues({}, [mkClash()], 1000);
    const marked = setIssueResolved(run1.next, run1.resultIds[0], true, 'a@b.c', 1500);
    const run2 = reconcileIssues(marked, [mkClash()], 2000);
    const issue = run2.next[run2.resultIds[0]];
    expect(issue.status).toBe('resolved');   // user's mark is preserved…
    expect(issue.reappeared).toBe(true);     // …but the conflict is surfaced
    expect(run2.summary.reappeared).toBe(1);
  });
});

describe('setIssueResolved', () => {
  it('round-trips resolve → unresolve', () => {
    const { next, resultIds } = reconcileIssues({}, [mkClash()], 1000);
    const id = resultIds[0];
    const resolved = setIssueResolved(next, id, true, 'me@x.y', 1100);
    expect(resolved[id].status).toBe('resolved');
    expect(resolved[id].resolvedBy).toBe('me@x.y');
    const back = setIssueResolved(resolved, id, false, undefined, 1200);
    expect(back[id].status).toBe('active');
    expect(back[id].resolvedAt).toBeUndefined();
  });
});

describe('computeIssueMetrics', () => {
  it('splits unresolved backlog by severity and counts states', () => {
    const map: IssueMap = {
      a: { status: 'new', firstSeen: 1, lastSeen: 1, isHard: true },
      b: { status: 'active', firstSeen: 1, lastSeen: 2, isHard: false },
      c: { status: 'resolved', firstSeen: 1, lastSeen: 2, resolvedAt: 3, reappeared: true },
      d: { status: 'gone', firstSeen: 1, lastSeen: 2, resolvedAt: 3 },
    };
    expect(computeIssueMetrics(map)).toEqual({
      unresolvedHard: 1, unresolvedClearance: 1, resolved: 1, gone: 1, reappeared: 1, total: 4,
    });
  });
});

describe('mergeIssueMaps', () => {
  it('keeps the entry with the newest event per id', () => {
    const local: IssueMap = { x: { status: 'active', firstSeen: 1, lastSeen: 5 } };
    const remote: IssueMap = { x: { status: 'resolved', firstSeen: 1, lastSeen: 5, resolvedAt: 9 } };
    expect(mergeIssueMaps(local, remote).x.status).toBe('resolved');
    expect(mergeIssueMaps(remote, local).x.status).toBe('resolved'); // symmetric
  });

  it('unions distinct ids', () => {
    const a: IssueMap = { x: { status: 'new', firstSeen: 1, lastSeen: 1 } };
    const b: IssueMap = { y: { status: 'new', firstSeen: 2, lastSeen: 2 } };
    expect(Object.keys(mergeIssueMaps(a, b)).sort()).toEqual(['x', 'y']);
  });
});

describe('pruneGone', () => {
  it('caps archived entries, dropping the oldest', () => {
    const map: IssueMap = {};
    for (let i = 0; i < 10; i++) map['g' + i] = { status: 'gone', firstSeen: i, lastSeen: i };
    map.live = { status: 'active', firstSeen: 99, lastSeen: 99 };
    const pruned = pruneGone(map, 3);
    expect(Object.keys(pruned)).toHaveLength(4); // 3 gone + 1 live
    expect(pruned.live).toBeTruthy();
    expect(pruned.g9 && pruned.g8 && pruned.g7).toBeTruthy();
    expect(pruned.g0).toBeUndefined();
  });
});
