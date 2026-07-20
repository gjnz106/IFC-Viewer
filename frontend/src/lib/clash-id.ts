// ── Stable clash identity across runs ────────────────────────────────────
// expressIDs are NOT stable between exports of the same model (a re-export
// from Revit renumbers everything), so tracking an issue's Resolved state
// across model updates can't key on eids. Instead a clash is identified by
// what it physically is: the two element types + their names/tags + the
// clash-zone center rounded to a coarse grid. The same wall/pipe collision
// re-detected after a re-export lands on the same ID; a genuinely moved or
// fixed clash does not.
//
// Pure module — no DOM/appState — fully unit-testable.

export interface ClashIdInput {
  typeA: string; nameA?: string; tagA?: string;
  typeB: string; nameB?: string; tagB?: string;
  /** clash-zone center point in shared model space (meters) */
  point: { x: number; y: number; z: number };
  isDuplicate?: boolean;
}

// ~25cm grid: coarse enough that parse jitter / minor geometry tweaks keep
// the same cell, fine enough that neighbouring clashes rarely collide.
const GRID_M = 0.25;

function q(v: number): number {
  return Math.round(v / GRID_M);
}

// FNV-1a — tiny, stable, no deps. Collisions are acceptable (worst case two
// clashes share a status entry); crypto strength is not needed here.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable ID for one clash. Element order is normalized (A/B swap yields the
 * same ID) so re-running with Source/Target swapped tracks the same issues.
 */
export function clashStableId(c: ClashIdInput): string {
  const sideKey = (t: string, n?: string, g?: string) => `${t}|${n || ''}|${g || ''}`;
  const a = sideKey(c.typeA, c.nameA, c.tagA);
  const b = sideKey(c.typeB, c.nameB, c.tagB);
  const [s1, s2] = a <= b ? [a, b] : [b, a];
  const cell = `${q(c.point.x)},${q(c.point.y)},${q(c.point.z)}`;
  return fnv1a(`${s1}#${s2}#${cell}#${c.isDuplicate ? 'dup' : 'geo'}`);
}

/** Build the ClashIdInput from a result entry as clash.ts produces them. */
export function idInputFromResult(cl: any): ClashIdInput {
  return {
    typeA: cl?.elA?.type || '', nameA: cl?.elA?.name || '', tagA: cl?.elA?.tag || '',
    typeB: cl?.elB?.type || '', nameB: cl?.elB?.name || '', tagB: cl?.elB?.tag || '',
    point: { x: cl?.point?.x ?? 0, y: cl?.point?.y ?? 0, z: cl?.point?.z ?? 0 },
    isDuplicate: !!cl?.isDuplicate,
  };
}
