/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — MODEL FILTERS (named "which models are visible" presets)
   ───────────────────────────────────────────────────────────────────────
   A Dalux-style view filter: pick the models a discipline cares about
   (ARC / STR / MEP / …), name it, and switch to it in one click. Applying
   a filter ISOLATES — the listed models are shown, every other loaded slot
   is hidden.

   Saved per project (localStorage key `ifc.modelfilters.<projectId>`),
   mirroring viewpoints-store.ts.

   Models are stored BY FILE NAME, not by slot index. Slot indices are
   assigned in load order, so a filter keyed on them would silently point at
   the wrong models after a reload that ordered files differently — the same
   trap remapCamera() exists to work around for viewpoints.
═══════════════════════════════════════════════════════════════════════ */

export interface ModelFilter {
  id: string;
  name: string;
  createdAt: number;
  /** File names of the models this filter shows. Everything else is hidden. */
  models: string[];
}

function makeId(): string {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

export function makeFilterId(): string {
  return makeId();
}

// Newest first, capped like viewpoints so localStorage never grows unbounded.
// Filters are tiny (no thumbnails), so the cap is far higher than the 30 used
// for viewpoints.
export function addFilter(list: ModelFilter[], f: ModelFilter, maxKeep = 100): ModelFilter[] {
  return [f, ...list].slice(0, Math.max(1, maxKeep));
}

export function removeFilter(list: ModelFilter[], id: string): ModelFilter[] {
  return list.filter(f => f.id !== id);
}

export function renameFilter(list: ModelFilter[], id: string, name: string): ModelFilter[] {
  return list.map(f => (f.id === id ? { ...f, name: name.trim() || f.name } : f));
}

/** Overwrite a filter's model set in place, keeping its id/name/createdAt. */
export function updateFilterModels(list: ModelFilter[], id: string, models: string[]): ModelFilter[] {
  return list.map(f => (f.id === id ? { ...f, models: models.slice() } : f));
}

export interface FilterResolution {
  /** Loaded slots the filter wants visible. */
  visibleSlots: number[];
  /** Loaded slots to hide (every loaded slot not in visibleSlots). */
  hiddenSlots: number[];
  /** Filter entries with no matching loaded model — reported so the UI can warn. */
  missing: string[];
}

/**
 * Map a saved filter onto the currently loaded slots.
 *
 * `currentNames` is indexed BY SLOT; empty slots hold null/undefined and are
 * skipped entirely (they are neither shown nor hidden — slot 0/1 are the
 * compare A/B pair and are frequently empty in a federation-only session).
 *
 * Duplicate file names across slots all match, which is the useful reading:
 * loading the same file twice and filtering on it should show both.
 */
export function resolveFilter(models: string[], currentNames: (string | null | undefined)[]): FilterResolution {
  const wanted = new Set(models);
  const visibleSlots: number[] = [];
  const hiddenSlots: number[] = [];
  const matched = new Set<string>();

  for (let i = 0; i < currentNames.length; i++) {
    const name = currentNames[i];
    if (!name) continue; // empty slot — leave it alone
    if (wanted.has(name)) {
      visibleSlots.push(i);
      matched.add(name);
    } else {
      hiddenSlots.push(i);
    }
  }

  return { visibleSlots, hiddenSlots, missing: models.filter(m => !matched.has(m)) };
}

/**
 * Names of the models currently visible, in slot order.
 *
 * `hidden` is appState.hiddenModels — the single source of truth for user
 * intent. Reading Three.js `.visible` instead would capture the wrong state,
 * because the category filter clobbers `.visible` on the base model whenever
 * it swaps in a per-category subset.
 */
export function captureVisibleModels(
  currentNames: (string | null | undefined)[],
  hidden: Set<number>,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < currentNames.length; i++) {
    const name = currentNames[i];
    if (name && !hidden.has(i)) out.push(name);
  }
  return out;
}

// ── LocalStorage glue ──────────────────────────────────────────────────
function keyFor(projectId: string): string {
  return 'ifc.modelfilters.' + (projectId || 'default');
}

export function loadFilters(projectId: string): ModelFilter[] {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Same guard as loadViewpoints: a key overwritten by something else can be
    // valid JSON that isn't an array, and every caller does .find/.map on it.
    if (!Array.isArray(parsed)) return [];
    // Drop entries whose `models` isn't an array — resolveFilter would throw on
    // them, taking the whole panel down for one bad record.
    return parsed.filter((f: any) => f && Array.isArray(f.models));
  } catch { return []; }
}

/** Returns whether the write landed, so callers can surface a quota warning. */
export function saveFilters(projectId: string, list: ModelFilter[]): boolean {
  try {
    localStorage.setItem(keyFor(projectId), JSON.stringify(list));
    return true;
  } catch { return false; }
}

export function deleteProjectFilters(projectId: string): void {
  try { localStorage.removeItem(keyFor(projectId)); } catch { /* private mode */ }
}
