/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — LOCAL (NON-CLOUD) SESSION FILE CACHE
   ───────────────────────────────────────────────────────────────────────
   Cloud-project users get their files auto-restored on F5 for free (see
   projects.ts's refreshCloudList()/autoLoadCloudProjectFiles()). Local
   (non-cloud) users previously lost their loaded file on refresh and had
   to re-pick it from disk. This module caches the raw File bytes for
   whichever slots were loaded locally, keyed flatly by slot index — it is
   intentionally NOT tied to the local project registry (which has no
   per-project file tracking today); it just resumes "whatever was loaded
   last locally". Reuses ifc-cache.ts's single IndexedDB store/LRU budget
   so this doesn't compete with cloud file caching for its own budget.
   Manifest lives in localStorage (tiny metadata) so restoreLocalSession()
   can decide what to fetch without an IndexedDB round-trip just to know
   "is there anything to restore".
═══════════════════════════════════════════════════════════════════════ */

import { getCachedBlob, putCachedBlob, deleteCachedBlob } from './ifc-cache.js';

const MANIFEST_KEY = 'ifc.localSession';

export interface LocalSessionSlot {
  idx: number;
  name: string;
}

export interface LocalSessionManifest {
  slots: LocalSessionSlot[];
}

export function localSessionKey(slotIdx: number): string {
  return 'local-session:slot' + slotIdx;
}

export function emptyManifest(): LocalSessionManifest {
  return { slots: [] };
}

export function parseManifest(raw: string | null): LocalSessionManifest {
  if (!raw) return emptyManifest();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.slots)) {
      return {
        slots: parsed.slots.filter(
          (s: unknown): s is LocalSessionSlot =>
            !!s && typeof (s as any).idx === 'number' && typeof (s as any).name === 'string',
        ),
      };
    }
  } catch { /* corrupt — treat as empty */ }
  return emptyManifest();
}

export function serializeManifest(manifest: LocalSessionManifest): string {
  return JSON.stringify(manifest);
}

export function withSlotAdded(manifest: LocalSessionManifest, idx: number, name: string): LocalSessionManifest {
  const rest = manifest.slots.filter(s => s.idx !== idx);
  return { slots: [...rest, { idx, name }].sort((a, b) => a.idx - b.idx) };
}

export function withSlotRemoved(manifest: LocalSessionManifest, idx: number): LocalSessionManifest {
  if (!manifest.slots.some(s => s.idx === idx)) return manifest;
  return { slots: manifest.slots.filter(s => s.idx !== idx) };
}

// ── localStorage/IndexedDB glue ──

function readManifest(): LocalSessionManifest {
  try {
    return parseManifest(localStorage.getItem(MANIFEST_KEY));
  } catch {
    return emptyManifest();
  }
}

function writeManifest(manifest: LocalSessionManifest): void {
  try {
    localStorage.setItem(MANIFEST_KEY, serializeManifest(manifest));
  } catch { /* private mode / quota — best-effort */ }
}

// Best-effort — never throws. Called right after a slot loads locally
// (no active cloud project); overwrites any previously cached blob for
// the same slot.
export async function saveLocalSessionFile(idx: number, file: File): Promise<void> {
  try {
    await putCachedBlob(localSessionKey(idx), file);
    writeManifest(withSlotAdded(readManifest(), idx, file.name));
  } catch (e) {
    console.warn('[local-session] saveLocalSessionFile failed:', e);
  }
}

// Best-effort — never throws. Called when the user explicitly removes a
// file from a slot, so it doesn't reappear on the next reload.
export async function clearLocalSessionFile(idx: number): Promise<void> {
  try {
    await deleteCachedBlob(localSessionKey(idx));
    writeManifest(withSlotRemoved(readManifest(), idx));
  } catch (e) {
    console.warn('[local-session] clearLocalSessionFile failed:', e);
  }
}

// Wipes the entire local session — every cached slot blob plus the manifest.
// Called on sign-out so the next user on a shared machine can't F5 and have
// the previous user's locally-loaded file bytes restored into their viewport
// (the manifest/store are keyed only by slot index, not by uid). Best-effort.
export async function clearLocalSession(): Promise<void> {
  const manifest = readManifest();
  for (const { idx } of manifest.slots) {
    try { await deleteCachedBlob(localSessionKey(idx)); } catch { /* best-effort */ }
  }
  try { localStorage.removeItem(MANIFEST_KEY); } catch { /* best-effort */ }
}

// Reads the manifest and fetches each recorded slot's cached blob. A slot
// whose blob is missing (e.g. evicted by LRU) is dropped from the manifest
// and skipped rather than erroring.
export async function restoreLocalSession(): Promise<{ idx: number; file: File }[]> {
  const manifest = readManifest();
  if (manifest.slots.length === 0) return [];
  const out: { idx: number; file: File }[] = [];
  let dirty = false;
  for (const { idx, name } of manifest.slots) {
    try {
      const file = await getCachedBlob(localSessionKey(idx), name);
      if (file) {
        out.push({ idx, file });
      } else {
        dirty = true;
      }
    } catch (e) {
      console.warn('[local-session] restore failed for slot', idx, e);
      dirty = true;
    }
  }
  if (dirty) {
    const restoredIdx = new Set(out.map(o => o.idx));
    writeManifest({ slots: manifest.slots.filter(s => restoredIdx.has(s.idx)) });
  }
  return out;
}
