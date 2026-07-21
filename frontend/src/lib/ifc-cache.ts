/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — LOCAL BLOB CACHE FOR CLOUD FILES (Phase 14, "Hướng B" layer)
   ───────────────────────────────────────────────────────────────────────
   Caches downloaded cloud IFC blobs in IndexedDB, keyed by
   `storagePath + updatedAt` so a changed cloud file (re-uploaded, new
   `uploadedAt`) invalidates the cache automatically without any explicit
   invalidation logic. Pure LRU/key helpers below have zero IndexedDB
   import (unit-testable); the thin glue at the bottom does the actual
   `indexedDB.open`/transactions, following the pattern of cloud-files.ts's
   lazy SDK imports (here there's no SDK to lazy-import, just the browser
   API, but the split keeps the pure logic testable without a DOM/IDB shim).
═══════════════════════════════════════════════════════════════════════ */

import type { CloudProjectFile } from './cloud-projects.js';

export interface CacheEntry {
  key: string;
  size: number;
  lastAccess: number;
}

// One entry per (storagePath, uploadedAt) pair — re-uploading a file to the
// same slot changes uploadedAt, which changes the key, so the old blob is
// simply orphaned (evicted like any other entry once it ages out under LRU
// pressure) rather than needing an explicit invalidation step.
export function cacheKeyFor(record: Pick<CloudProjectFile, 'storagePath' | 'uploadedAt'>): string {
  return record.storagePath + '@' + record.uploadedAt;
}

export const DEFAULT_CACHE_BUDGET_BYTES = 2 * 1024 * 1024 * 1024; // ~2GB

// Given the current cache state + an incoming entry's size + a byte budget,
// decides which existing entries must be evicted (oldest `lastAccess`
// first) to make room. Pure decision function — does not mutate `entries`.
// Returns the keys to evict, oldest-accessed first.
export function planEviction(
  entries: CacheEntry[],
  incomingSize: number,
  budgetBytes: number = DEFAULT_CACHE_BUDGET_BYTES,
): string[] {
  const currentTotal = entries.reduce((sum, e) => sum + e.size, 0);
  let over = currentTotal + incomingSize - budgetBytes;
  if (over <= 0) return [];
  const sorted = [...entries].sort((a, b) => a.lastAccess - b.lastAccess);
  const toEvict: string[] = [];
  for (const e of sorted) {
    if (over <= 0) break;
    toEvict.push(e.key);
    over -= e.size;
  }
  return toEvict;
}

// ── IndexedDB glue (browser-only — never imported by pure-logic tests) ──

const DB_NAME = 'ifc-delta-cache';
const DB_VERSION = 1;
const STORE = 'blobs';

interface StoredBlob {
  key: string;
  size: number;
  lastAccess: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listEntries(db: IDBDatabase): Promise<CacheEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out: CacheEntry[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const v = cursor.value as StoredBlob;
        out.push({ key: v.key, size: v.size, lastAccess: v.lastAccess });
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteKeys(db: IDBDatabase, keys: string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const k of keys) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Returns the cached File stored under `key`, or null on a cache miss.
// Bumps `lastAccess` on hit. `fileName` is used to rebuild the File object
// (the stored blob itself has no name).
export async function getCachedBlob(key: string, fileName: string): Promise<File | null> {
  try {
    const db = await openDb();
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const v = req.result as StoredBlob | undefined;
        if (!v) { resolve(null); return; }
        v.lastAccess = Date.now();
        store.put(v);
        resolve(new File([v.blob], fileName, { type: 'application/octet-stream' }));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[ifc-cache] getCachedBlob failed, treating as miss:', e);
    return null;
  }
}

// Stores `file` under `key`, evicting oldest-accessed entries first (shared
// LRU budget across every key in this store) if the budget would be
// exceeded. Best-effort — a failure here never blocks the caller's
// already-completed download/load.
export async function putCachedBlob(key: string, file: File, budgetBytes: number = DEFAULT_CACHE_BUDGET_BYTES): Promise<void> {
  try {
    const db = await openDb();
    const existing = await listEntries(db);
    const evictKeys = planEviction(existing.filter(e => e.key !== key), file.size, budgetBytes);
    await deleteKeys(db, evictKeys);
    const entry: StoredBlob = { key, size: file.size, lastAccess: Date.now(), blob: file };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[ifc-cache] putCachedBlob failed (best-effort, ignored):', e);
  }
}

// Best-effort delete of a single cache entry.
export async function deleteCachedBlob(key: string): Promise<void> {
  try {
    const db = await openDb();
    await deleteKeys(db, [key]);
  } catch (e) {
    console.warn('[ifc-cache] deleteCachedBlob failed (best-effort, ignored):', e);
  }
}

// Returns the cached File for `record`, or null on a cache miss (caller
// falls through to downloadProjectFile). Bumps `lastAccess` on hit.
export function getCachedFile(record: CloudProjectFile): Promise<File | null> {
  return getCachedBlob(cacheKeyFor(record), record.name);
}

// Stores `file` under `record`'s cache key, evicting oldest-accessed
// entries first if the budget would be exceeded. Best-effort — a failure
// here never blocks the caller's already-completed download/load.
export function putCachedFile(record: CloudProjectFile, file: File, budgetBytes: number = DEFAULT_CACHE_BUDGET_BYTES): Promise<void> {
  return putCachedBlob(cacheKeyFor(record), file, budgetBytes);
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[ifc-cache] clearCache failed:', e);
  }
}
