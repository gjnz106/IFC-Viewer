// ── Clash issue tracking (Resolved / Unresolved across runs) ─────────────
// Persists a per-project map  stableClashId → issue status  so the team can
// mark clashes Resolved and see which clashes are NEW in an updated model.
//
// Reconciliation on every clash run:
//   • result id NOT in store            → status 'new'       (first seen)
//   • result id in store as new/active  → status 'active'    (still there)
//   • result id in store as resolved    → stays 'resolved' but is flagged
//     `reappeared` (someone marked it fixed, the model still clashes)
//   • store id NOT in result            → status 'gone'      (auto-resolved
//     by the model update — kept for history/metrics, pruned after limit)
//
// Storage: localStorage per project (works offline / local projects).
// Cloud projects additionally mirror through cloud-results (kind
// 'clash-issues') from the UI layer so the whole team shares statuses —
// this module stays storage-agnostic: pure logic + localStorage helpers.

import { clashStableId, idInputFromResult } from './clash-id.js';

export type IssueStatus = 'new' | 'active' | 'resolved' | 'gone';

export interface ClashIssue {
  status: IssueStatus;
  firstSeen: number;      // ts of the run that first detected it
  lastSeen: number;       // ts of the latest run that detected it
  resolvedAt?: number;    // ts the user marked it resolved (or auto via 'gone')
  resolvedBy?: string;    // email, when marked manually
  reappeared?: boolean;   // marked resolved but detected again
  isHard?: boolean;       // severity of the latest detection
}

export type IssueMap = Record<string, ClashIssue>;

export interface ReconcileSummary {
  newCount: number;        // first-time clashes in this run
  stillCount: number;      // carried over (new/active/reappeared-resolved)
  autoResolved: number;    // present before, absent from this run → 'gone'
  reappeared: number;      // marked resolved but detected again
}

/**
 * Pure reconcile: previous issue map + current run's results → next map +
 * per-result ids (aligned with `results` order) + summary counts.
 */
export function reconcileIssues(
  prev: IssueMap,
  results: any[],
  now: number = Date.now(),
): { next: IssueMap; resultIds: string[]; summary: ReconcileSummary } {
  const next: IssueMap = {};
  const resultIds: string[] = [];
  const seen = new Set<string>();
  const summary: ReconcileSummary = { newCount: 0, stillCount: 0, autoResolved: 0, reappeared: 0 };

  for (const cl of results) {
    const id = clashStableId(idInputFromResult(cl));
    resultIds.push(id);
    if (seen.has(id)) continue; // duplicate id within one run — count once
    seen.add(id);
    const old = prev[id];
    if (!old) {
      next[id] = { status: 'new', firstSeen: now, lastSeen: now, isHard: !!cl.isHard };
      summary.newCount++;
    } else if (old.status === 'resolved') {
      next[id] = { ...old, lastSeen: now, reappeared: true, isHard: !!cl.isHard };
      summary.reappeared++;
      summary.stillCount++;
    } else {
      next[id] = { ...old, status: 'active', lastSeen: now, isHard: !!cl.isHard };
      summary.stillCount++;
    }
  }

  // Anything previously tracked but absent from this run got fixed by the
  // model update (or fell outside the run's Source/Target scope).
  for (const [id, issue] of Object.entries(prev)) {
    if (seen.has(id)) continue;
    if (issue.status === 'gone') { next[id] = issue; continue; } // already archived
    next[id] = { ...issue, status: 'gone', resolvedAt: issue.resolvedAt ?? now };
    summary.autoResolved++;
  }

  return { next: pruneGone(next), resultIds, summary };
}

// Keep the archive bounded: retain the most recently seen 500 'gone' entries.
export function pruneGone(map: IssueMap, keep = 500): IssueMap {
  const gone = Object.entries(map).filter(([, i]) => i.status === 'gone');
  if (gone.length <= keep) return map;
  gone.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  const drop = new Set(gone.slice(keep).map(([id]) => id));
  const out: IssueMap = {};
  for (const [id, i] of Object.entries(map)) if (!drop.has(id)) out[id] = i;
  return out;
}

/** Toggle a manual Resolved/Unresolved mark. Returns a new map. */
export function setIssueResolved(
  map: IssueMap, id: string, resolved: boolean, by?: string, now: number = Date.now(),
): IssueMap {
  const cur = map[id];
  if (!cur) return map;
  const next = { ...map };
  next[id] = resolved
    ? { ...cur, status: 'resolved', resolvedAt: now, resolvedBy: by, reappeared: false }
    : { ...cur, status: 'active', resolvedAt: undefined, resolvedBy: undefined, reappeared: false };
  return next;
}

/** Backlog metrics for the dashboard. */
export interface IssueMetrics {
  unresolvedHard: number;
  unresolvedClearance: number;
  resolved: number;
  gone: number;
  reappeared: number;
  total: number;
}
export function computeIssueMetrics(map: IssueMap): IssueMetrics {
  const m: IssueMetrics = { unresolvedHard: 0, unresolvedClearance: 0, resolved: 0, gone: 0, reappeared: 0, total: 0 };
  for (const i of Object.values(map)) {
    m.total++;
    if (i.status === 'gone') { m.gone++; continue; }
    if (i.status === 'resolved') { m.resolved++; if (i.reappeared) m.reappeared++; continue; }
    if (i.isHard) m.unresolvedHard++; else m.unresolvedClearance++;
  }
  return m;
}

// ── localStorage persistence (per project) ───────────────────────────────
const LS_PREFIX = 'ifc.clashIssues.';

export function loadIssueMap(projectKey: string): IssueMap {
  try {
    const raw = localStorage.getItem(LS_PREFIX + projectKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function saveIssueMap(projectKey: string, map: IssueMap): void {
  try { localStorage.setItem(LS_PREFIX + projectKey, JSON.stringify(map)); }
  catch { /* quota — tracking is best-effort */ }
}

/** Merge a teammate's cloud copy into ours: latest information wins per id. */
export function mergeIssueMaps(local: IssueMap, remote: IssueMap): IssueMap {
  const out: IssueMap = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const l = out[id];
    if (!l) { out[id] = r; continue; }
    // Prefer the entry with the newer "most recent event" timestamp.
    const lTs = Math.max(l.lastSeen || 0, l.resolvedAt || 0);
    const rTs = Math.max(r.lastSeen || 0, r.resolvedAt || 0);
    out[id] = rTs > lTs ? r : l;
  }
  return out;
}
