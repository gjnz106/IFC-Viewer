/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — VIEWPOINTS (named camera + visibility/section snapshots)
   ───────────────────────────────────────────────────────────────────────
   Saved per project (localStorage key `ifc.viewpoints.<projectId>`).
   Pure list ops + the camera remap math live here (testable); the actual
   capture/restore against appState/THREE lives in
   components/tools/viewpoints.ts.
═══════════════════════════════════════════════════════════════════════ */

export interface ViewpointCamera { px: number; py: number; pz: number; tx: number; ty: number; tz: number; }
export interface ViewpointSection { active: boolean; sliders: [number, number, number, number, number, number]; }
export interface ViewpointVisibility { slotVisible: boolean[]; hiddenKeys: string[]; isolated: number[] | null; }
export interface Vec3 { x: number; y: number; z: number; }

export interface Viewpoint {
  id: string;
  name: string;
  createdAt: number;
  camera: ViewpointCamera;
  /** sharedCenterOffset AT CAPTURE TIME — needed to remap the camera if it changes on restore. */
  anchor: Vec3 | null;
  section: ViewpointSection | null;
  visibility: ViewpointVisibility;
  modelsKey: string;
  thumb: string;
}

function makeId(): string {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

export function makeViewpointId(): string {
  return makeId();
}

// Newest first, capped so localStorage never grows unbounded (thumbnails
// are the bulk of the size).
export function addViewpoint(list: Viewpoint[], vp: Viewpoint, maxKeep = 30): Viewpoint[] {
  return [vp, ...list].slice(0, Math.max(1, maxKeep));
}

export function removeViewpoint(list: Viewpoint[], id: string): Viewpoint[] {
  return list.filter(v => v.id !== id);
}

export function renameViewpoint(list: Viewpoint[], id: string, name: string): Viewpoint[] {
  return list.map(v => (v.id === id ? { ...v, name: name.trim() || v.name } : v));
}

// Camera coordinates live in the shifted space `world = raw - sharedCenterOffset`,
// and that offset is set by whichever model loads FIRST — reload the same
// project with models in a different order and the offset changes, so a
// naively-restored camera would point at the wrong place. Convert back to
// raw space via the offset captured alongside the camera, then re-shift by
// the CURRENT offset. Identity when either anchor is unknown (e.g. no
// models loaded yet, or the viewpoint predates this field).
export function remapCamera(camera: ViewpointCamera, savedAnchor: Vec3 | null, currentOffset: Vec3 | null): ViewpointCamera {
  if (!savedAnchor || !currentOffset) return camera;
  const dx = savedAnchor.x - currentOffset.x;
  const dy = savedAnchor.y - currentOffset.y;
  const dz = savedAnchor.z - currentOffset.z;
  if (dx === 0 && dy === 0 && dz === 0) return camera;
  return {
    px: camera.px + dx, py: camera.py + dy, pz: camera.pz + dz,
    tx: camera.tx + dx, ty: camera.ty + dy, tz: camera.tz + dz,
  };
}

// Order-insensitive fingerprint of the currently loaded model set, used to
// warn (not block) when restoring a viewpoint captured against different files.
export function modelsFingerprint(fileNames: (string | undefined | null)[]): string {
  return fileNames.filter((n): n is string => !!n).slice().sort().join('|');
}

// ── LocalStorage glue ──────────────────────────────────────────────────
function keyFor(projectId: string): string {
  return 'ifc.viewpoints.' + (projectId || 'default');
}

export function loadViewpoints(projectId: string): Viewpoint[] {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveViewpoints(projectId: string, list: Viewpoint[]): void {
  try { localStorage.setItem(keyFor(projectId), JSON.stringify(list)); }
  catch { /* quota/private mode */ }
}

export function deleteProjectViewpoints(projectId: string): void {
  try { localStorage.removeItem(keyFor(projectId)); } catch { /* private mode */ }
}
