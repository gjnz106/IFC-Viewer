/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — CLOUD PROJECT FILES (Firebase Storage + Firestore, Phase 13)
   ───────────────────────────────────────────────────────────────────────
   Companion to cloud-projects.ts (Phase 12): that file owns the
   `projects/{id}` doc, this one owns the `projects/{id}/files/{fileId}`
   subcollection + the actual IFC bytes in Storage. Same split as Phase 12:
   pure helpers (zero SDK import, unit-testable) at the top, thin glue that
   lazy `import('firebase/storage'|'firebase/firestore')` at the bottom so
   the SDKs never land in the main chunk for local-only users.
═══════════════════════════════════════════════════════════════════════ */

import type { CloudProjectFile } from './cloud-projects.js';

export type SyncStatus = 'local-only' | 'uploading' | 'synced' | 'error';

function makeId(): string {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

// ── Pure helpers (no Storage/Firestore import — unit-testable standalone) ──

// Slot 0/1 map to the fixed 'A'/'B' keys the plan's data model uses;
// federation slots (>=2) keep their raw numeric index.
export function slotIndexToKey(idx: number): 'A' | 'B' | number {
  if (idx === 0) return 'A';
  if (idx === 1) return 'B';
  return idx;
}

export function keyToSlotIndex(slot: 'A' | 'B' | number): number {
  if (slot === 'A') return 0;
  if (slot === 'B') return 1;
  return slot;
}

// A/B (0,1) always come before federation slots (2+), which then load in
// ascending order — matches the plan's "A/B trước, federation sau".
export function orderFilesForAutoLoad(files: CloudProjectFile[]): CloudProjectFile[] {
  return [...files].sort((a, b) => keyToSlotIndex(a.slot) - keyToSlotIndex(b.slot));
}

export function formatUploadProgress(loaded: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

// Overwrite-confirm decision: prompt iff a cloud file record already exists
// for this slot. No existing record (first upload into the slot, or the
// file that was just auto-loaded from that same record) = no prompt.
export function shouldConfirmOverwrite(existing: CloudProjectFile | null | undefined): boolean {
  return !!existing;
}

export function syncChipLabel(status: SyncStatus, progress?: number): string {
  switch (status) {
    case 'synced': return '☁ synced';
    case 'uploading': return '⬆ uploading ' + formatUploadProgress(progress || 0, 100) + '%';
    case 'error': return '⚠ upload failed';
    default: return '⚠ local-only';
  }
}

// Matches the Storage rules cap (storage.rules: `request.resource.size < 500 * 1024 * 1024`)
// — used to warn BEFORE attempting an upload that would be rejected server-side anyway.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function exceedsUploadQuota(size: number): boolean {
  return size >= MAX_UPLOAD_BYTES;
}

// Sum of `files` subcollection doc `size` fields — simple totalling, no
// real-time Storage API usage query (per Phase 14 spec).
export function sumStorageUsage(files: CloudProjectFile[]): number {
  return files.reduce((sum, f) => sum + (f.size || 0), 0);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return (i === 0 ? val.toFixed(0) : val.toFixed(val < 10 ? 2 : 1)) + ' ' + units[i];
}

// Builds the doc payload for `projects/{id}/files/{fileId}` create — pure.
export function buildCloudFileDoc(
  name: string,
  size: number,
  idx: number,
  storagePath: string,
  uploadedBy: string,
): Omit<CloudProjectFile, 'id'> {
  return {
    name,
    size,
    slot: slotIndexToKey(idx),
    storagePath,
    contentType: 'application/x-step',
    uploadedBy,
    uploadedAt: Date.now(),
  };
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

export async function fetchProjectFiles(projectId: string): Promise<CloudProjectFile[]> {
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const db = await getDb();
    const snap = await getDocs(collection(db, 'projects', projectId, 'files'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CloudProjectFile, 'id'>) }));
  } catch (e) {
    console.warn('[cloud-files] fetchProjectFiles failed:', e);
    return [];
  }
}

// Downloads a cloud file record's bytes and returns a File ready to feed
// into the existing loadIFC(idx) pipeline (same shape as drive.ts's gdLoadFile).
export async function downloadProjectFile(record: CloudProjectFile): Promise<File> {
  const { ref, getDownloadURL } = await import('firebase/storage');
  const storage = await getBucket();
  const url = await getDownloadURL(ref(storage, record.storagePath));
  const r = await fetch(url);
  if (!r.ok) throw new Error('Download failed: ' + r.status);
  const blob = await r.blob();
  return new File([blob], record.name, { type: 'application/octet-stream' });
}

// Best-effort — an orphaned blob left behind on failure is logged, not thrown.
export async function deleteProjectFileBlob(storagePath: string): Promise<void> {
  try {
    const { ref, deleteObject } = await import('firebase/storage');
    const storage = await getBucket();
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    console.warn('[cloud-files] deleteProjectFileBlob (orphaned blob) failed:', e);
  }
}

async function uploadOnce(
  projectId: string,
  fileId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const { ref, uploadBytesResumable } = await import('firebase/storage');
  const storage = await getBucket();
  const storagePath = `projects/${projectId}/${fileId}.ifc`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: 'application/x-step' });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress(formatUploadProgress(snap.bytesTransferred, snap.totalBytes)),
      err => reject(err),
      () => resolve(),
    );
  });
  return storagePath;
}

// Uploads `file` into `projectId`'s slot `idx`, retries once on failure,
// writes/overwrites the `files/{fileId}` doc, and best-effort deletes the
// previous blob for that slot (if any). Returns the new record, or null on
// failure (both attempts).
export async function uploadProjectFile(
  projectId: string,
  idx: number,
  file: File,
  uploadedBy: string,
  existing: CloudProjectFile | null | undefined,
  onProgress: (pct: number) => void,
): Promise<CloudProjectFile | null> {
  const fileId = existing?.id || makeId();
  let storagePath: string | null = null;
  for (let attempt = 0; attempt < 2 && !storagePath; attempt++) {
    try {
      storagePath = await uploadOnce(projectId, fileId, file, onProgress);
    } catch (e) {
      console.warn(`[cloud-files] uploadProjectFile attempt ${attempt + 1} failed:`, e);
      if (attempt === 1) return null;
    }
  }
  if (!storagePath) return null;
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const db = await getDb();
    const payload = buildCloudFileDoc(file.name, file.size, idx, storagePath, uploadedBy);
    await setDoc(doc(db, 'projects', projectId, 'files', fileId), payload);
    if (existing && existing.storagePath && existing.storagePath !== storagePath) {
      deleteProjectFileBlob(existing.storagePath);
    }
    return { id: fileId, ...payload };
  } catch (e) {
    console.warn('[cloud-files] uploadProjectFile Firestore write failed:', e);
    return null;
  }
}

export async function deleteProjectFileRecord(projectId: string, record: CloudProjectFile): Promise<void> {
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    const db = await getDb();
    await deleteDoc(doc(db, 'projects', projectId, 'files', record.id));
  } catch (e) {
    console.warn('[cloud-files] deleteProjectFileRecord failed:', e);
  }
  await deleteProjectFileBlob(record.storagePath);
}
