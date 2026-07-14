/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — CLOUD COMPARE/CLASH RESULTS (Phase 15)
   ───────────────────────────────────────────────────────────────────────
   Persists appState.compareResult / appState.clashResults for a cloud
   project so re-opening it (same machine or another) shows the last run
   without re-computing. Same split as cloud-files.ts / cloud-projects.ts:
   pure helpers (zero SDK import, unit-testable) at the top, thin glue that
   lazy `import('firebase/storage'|'firebase/firestore')` at the bottom.

   Full result JSON (potentially thousands of elements) goes to Storage —
   Firestore's 1MB/doc cap makes it unsuitable there. Only a small metadata
   doc `projects/{id}/results/{kind}` lives in Firestore: { ranAt, ranBy,
   counts, modelSignature }. `modelSignature` is a simple, deterministic
   string built from the currently loaded files' name+size (not content
   hashing — this only needs to detect "did the loaded files change since
   this result was saved", not verify byte-for-byte integrity).
═══════════════════════════════════════════════════════════════════════ */

export type ResultKind = 'compare' | 'clash';

export interface CompareCounts {
  added: number;
  removed: number;
  modified: number;
}

export interface ClashCounts {
  total: number;
  hard: number;
  near: number;
}

export interface ResultMetadata {
  ranAt: number;
  ranBy: string;
  counts: CompareCounts | ClashCounts;
  modelSignature: string;
}

// ── Pure helpers (no Storage/Firestore import — unit-testable standalone) ──

export interface SigFile {
  name: string;
  size: number;
}

// Deterministic signature over the currently loaded file slots — order
// matters (slot index order), null slots included as a placeholder so
// "A swapped out, B unchanged" still changes the signature.
export function buildModelSignature(files: (SigFile | null | undefined)[]): string {
  return files.map(f => (f ? `${f.name}:${f.size}` : '∅')).join('|');
}

export function signaturesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b;
}

export function formatCompareCounts(result: { added: any[]; removed: any[]; modified: any[] }): CompareCounts {
  return {
    added: result.added?.length || 0,
    removed: result.removed?.length || 0,
    modified: result.modified?.length || 0,
  };
}

// Matches the hard/near split already computed in clash.ts's showClashResults().
export function formatClashCounts(clashResults: { isHard?: boolean }[]): ClashCounts {
  const total = clashResults.length;
  const hard = clashResults.filter(c => c.isHard).length;
  return { total, hard, near: total - hard };
}

export function buildResultMetadata(
  ranBy: string,
  counts: CompareCounts | ClashCounts,
  modelSignature: string,
): ResultMetadata {
  return { ranAt: Date.now(), ranBy, counts, modelSignature };
}

export function outdatedBadgeLabel(): string {
  return '⚠ Outdated — re-run';
}

// ── Firestore/Storage glue (lazy-imported SDKs — never in the main bundle) ──

async function getDb() {
  const [{ getApps, getApp }, { getFirestore }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ]);
  if (!getApps().length) throw new Error('Firebase app not initialized (auth.ts should run first)');
  return getFirestore(getApp());
}

async function getBucket() {
  const [{ getApps, getApp }, { getStorage }] = await Promise.all([
    import('firebase/app'),
    import('firebase/storage'),
  ]);
  if (!getApps().length) throw new Error('Firebase app not initialized (auth.ts should run first)');
  return getStorage(getApp());
}

// Best-effort — never throws. Uploads the full result JSON to Storage, then
// writes the metadata doc. Mirrors uploadProjectFile's "storage first, then
// Firestore" ordering (a stale/missing metadata doc is harmless; an
// orphaned metadata doc pointing at nothing is worse).
export async function saveResult(
  projectId: string,
  kind: ResultKind,
  resultData: unknown,
  metadata: ResultMetadata,
): Promise<boolean> {
  try {
    const { ref, uploadBytesResumable } = await import('firebase/storage');
    const storage = await getBucket();
    const storagePath = `projects/${projectId}/results/${kind}.json`;
    const blob = new Blob([JSON.stringify(resultData)], { type: 'application/json' });
    const task = uploadBytesResumable(ref(storage, storagePath), blob, { contentType: 'application/json' });
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', undefined, err => reject(err), () => resolve());
    });

    const { doc, setDoc } = await import('firebase/firestore');
    const db = await getDb();
    await setDoc(doc(db, 'projects', projectId, 'results', kind), metadata);
    return true;
  } catch (e) {
    console.warn(`[cloud-results] saveResult(${kind}) failed (best-effort, ignored):`, e);
    return false;
  }
}

export async function fetchResultMetadata(projectId: string, kind: ResultKind): Promise<ResultMetadata | null> {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const db = await getDb();
    const snap = await getDoc(doc(db, 'projects', projectId, 'results', kind));
    if (!snap.exists()) return null;
    return snap.data() as ResultMetadata;
  } catch (e) {
    console.warn(`[cloud-results] fetchResultMetadata(${kind}) failed:`, e);
    return null;
  }
}

export async function downloadResult<T = unknown>(projectId: string, kind: ResultKind): Promise<T | null> {
  try {
    const { ref, getDownloadURL } = await import('firebase/storage');
    const storage = await getBucket();
    const storagePath = `projects/${projectId}/results/${kind}.json`;
    const url = await getDownloadURL(ref(storage, storagePath));
    const r = await fetch(url);
    if (!r.ok) throw new Error('Download failed: ' + r.status);
    return await r.json() as T;
  } catch (e) {
    console.warn(`[cloud-results] downloadResult(${kind}) failed:`, e);
    return null;
  }
}
