/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — STOREYS (merged, junk-filtered storey list for Walk levels)
   ───────────────────────────────────────────────────────────────────────
   Pure merge/filter logic lives here (unit-testable); the element-count
   glue (ensureStoreyCounts, walks the spatial tree via web-ifc) is below
   it since it needs appState/ifcManager and can't be pure.

   Coordinate convention: IFC `Elevation` values are in the model's own
   vertical space, but the scene is shifted by -sharedCenterOffset so
   multiple/federated models align (see section-visibility.ts's loadIFC).
   storeyWorldY() is the single place that applies this conversion —
   callers must never subtract the offset themselves. Field Mode's
   fieldSelectStorey() (fieldmode.ts) already does this correctly; the
   desktop 2D plan overlay historically did not (fixed alongside this).
═══════════════════════════════════════════════════════════════════════ */

export interface StoreySource {
  expressID: number;
  name: string;
  elevation: number;
  /** Descendant element count; undefined/Infinity means "unknown — never filter as junk". */
  elementCount?: number;
}

export interface WalkStorey {
  name: string;
  modelIdx: number;
  expressID: number;
  elevation: number;
  /** Next kept storey's elevation, else elevation + 3.5 (plan-overlay's fallback storey height). */
  topElevation: number;
  elementCount: number;
}

const DEDUPE_EPS = 0.1; // metres — same tolerance used by fieldmode.ts / plan-overlay.ts
const FALLBACK_HEIGHT = 3.5;

// Merge storeys across one or more loaded models: drop storeys with a known
// zero element count (junk — duplicate site levels, empty reference planes),
// dedupe near-identical elevations (±10cm) keeping the better-populated one,
// then compute each storey's "top" as the next kept storey's elevation.
export function mergeStoreys(perModel: { modelIdx: number; storeys: StoreySource[] }[]): WalkStorey[] {
  type Flat = { modelIdx: number; expressID: number; name: string; elevation: number; elementCount: number };
  const flat: Flat[] = [];
  for (const { modelIdx, storeys } of perModel) {
    for (const s of storeys) {
      flat.push({
        modelIdx,
        expressID: s.expressID,
        name: s.name,
        elevation: s.elevation,
        elementCount: s.elementCount ?? Infinity,
      });
    }
  }

  // Filter out storeys we KNOW are empty — but never let this empty the
  // whole list (e.g. if the count pass hasn't run yet / failed for all).
  const nonJunk = flat.filter(s => s.elementCount !== 0);
  const working = nonJunk.length > 0 ? nonJunk : flat;
  working.sort((a, b) => a.elevation - b.elevation);

  // Dedupe adjacent storeys within DEDUPE_EPS, keeping the better-populated one.
  const deduped: Flat[] = [];
  for (const s of working) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(s.elevation - last.elevation) < DEDUPE_EPS) {
      if (s.elementCount > last.elementCount) deduped[deduped.length - 1] = s;
      continue;
    }
    deduped.push(s);
  }

  return deduped.map((s, i) => ({
    name: s.name,
    modelIdx: s.modelIdx,
    expressID: s.expressID,
    elevation: s.elevation,
    topElevation: i + 1 < deduped.length ? deduped[i + 1].elevation : s.elevation + FALLBACK_HEIGHT,
    elementCount: s.elementCount,
  }));
}

export function storeyWorldY(elevation: number, offsetY: number): number {
  return elevation - offsetY;
}

// ── Glue: lazy per-storey element counts (not pure — reads appState) ────
import { appState } from '../store/index.js';

// Counts every spatial-tree descendant node under each storey (elements,
// spaces, …) — same GetSpatialStructure walk pattern as
// integrations/ai.ts's buildAiIndex, but keyed by storey expressID instead
// of name (names collide across federated models; ids don't) and only
// counting, not extracting full properties. Cached on model.spatial so it
// only runs once per model — GetSpatialStructure can be slow on big models,
// so this is called lazily (first time the walk level picker opens), not
// at load time.
export async function ensureStoreyCounts(modelIdx: number): Promise<Record<number, number> | null> {
  const model = appState.loadedModels[modelIdx];
  if (!model) return null;
  if (model.spatial?.storeyCounts) return model.spatial.storeyCounts;
  const storeys: StoreySource[] = model.spatial?.storeys || [];
  if (storeys.length === 0) return null;
  try {
    const mgr = appState.ifcLoader.ifcManager;
    const storeyIDs = new Set(storeys.map(s => s.expressID));
    const counts: Record<number, number> = {};
    for (const id of storeyIDs) counts[id] = 0;
    const tree = await mgr.getSpatialStructure(model.modelID, false);
    const walk = (node: any, currentStorey: number | null): void => {
      if (!node) return;
      const isStorey = storeyIDs.has(node.expressID);
      const st = isStorey ? node.expressID : currentStorey;
      if (st != null && !isStorey && node.expressID != null) counts[st] = (counts[st] || 0) + 1;
      if (node.children) for (const c of node.children) walk(c, st);
    };
    walk(tree, null);
    if (model.spatial) model.spatial.storeyCounts = counts;
    return counts;
  } catch {
    return null; // unknown — caller must treat every storey as non-junk
  }
}

// Build the merged, junk-filtered storey list for every currently loaded
// model, resolving element counts (lazily, cached) along the way.
export async function buildWalkStoreys(): Promise<WalkStorey[]> {
  const perModel: { modelIdx: number; storeys: StoreySource[] }[] = [];
  for (let i = 0; i < appState.loadedModels.length; i++) {
    const model = appState.loadedModels[i];
    if (!model || !model.spatial?.storeys?.length) continue;
    const counts = await ensureStoreyCounts(i);
    const storeys: StoreySource[] = model.spatial.storeys.map((s: any) => ({
      expressID: s.expressID,
      name: s.name,
      elevation: s.elevation,
      elementCount: counts ? (counts[s.expressID] ?? 0) : undefined,
    }));
    perModel.push({ modelIdx: i, storeys });
  }
  return mergeStoreys(perModel);
}
