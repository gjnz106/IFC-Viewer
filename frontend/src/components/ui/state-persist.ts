// Persists UI state to localStorage so F5 keeps the previous session.
// Saved: panel visibility, active compare filter, SG gateway,
//        colorize prefs, camera position.
// NOT saved: loaded File objects (browser security) — user re-uploads.

import { appState } from '../../store/index.js';

const K = {
  panels:  'ifc.panels',
  filter:  'ifc.filter',
  gateway: 'ifc.sg.gateway',
  colMode: 'ifc.colorize.mode',
  colProp: 'ifc.colorize.property',
  camera:  'ifc.camera',
} as const;

// ── Save ─────────────────────────────────────────────────────────────────

function save() {
  try {
    // Panel visibility
    const lp = document.getElementById('leftPanel');
    const rp = document.getElementById('rightPanel');
    if (lp && rp) {
      localStorage.setItem(K.panels, JSON.stringify({
        left:  getComputedStyle(lp).display !== 'none',
        right: getComputedStyle(rp).display !== 'none',
      }));
    }

    // Compare filter
    localStorage.setItem(K.filter, appState.activeFilter || 'all');

    // SG gateway
    localStorage.setItem(K.gateway, appState.sgState.gateway || 'design');

    // Colorize prefs
    localStorage.setItem(K.colMode, appState.colorize.mode || 'auto');
    localStorage.setItem(K.colProp, appState.colorize.property || 'category');

    // Camera — persisted per-project (each project restores its own view),
    // keyed by appState.activeProjectId. Falls back to the legacy global key
    // when no project id is set yet (very early boot).
    saveCameraForProject(appState.activeProjectId);
  } catch { /* storage quota — silent */ }
}

// ── Restore ───────────────────────────────────────────────────────────────

function restore() {
  try {
    // Panels
    const raw = localStorage.getItem(K.panels);
    if (raw) {
      const p = JSON.parse(raw) as { left: boolean; right: boolean };
      const lp = document.getElementById('leftPanel');
      const rp = document.getElementById('rightPanel');
      const btnL = document.getElementById('btnToggleLeft');
      const btnR = document.getElementById('btnToggleRight');

      if (lp) {
        lp.style.display = p.left ? 'flex' : 'none';
        if (p.left) lp.style.flexDirection = 'column';
        btnL?.classList.toggle('hdr-panel-btn-active', p.left);
      }
      if (rp) {
        rp.style.display = p.right ? 'flex' : 'none';
        if (p.right) rp.style.flexDirection = 'column';
        btnR?.classList.toggle('hdr-panel-btn-active', p.right);
      }
    }

    // SG gateway
    const gw = localStorage.getItem(K.gateway);
    if (gw) {
      appState.sgState.gateway = gw as any;
      const sel = document.getElementById('sgGateway') as HTMLSelectElement | null;
      if (sel) sel.value = gw;
    }

    // Compare filter
    const filter = localStorage.getItem(K.filter);
    if (filter) appState.activeFilter = filter;

    // Colorize prefs (applied when colorize next activates)
    const colMode = localStorage.getItem(K.colMode);
    if (colMode) appState.colorize.mode = colMode as 'auto' | 'rules';
    const colProp = localStorage.getItem(K.colProp);
    if (colProp) appState.colorize.property = colProp as 'category' | 'type' | 'name' | 'tag' | 'file';
  } catch { /* corrupt data — ignore */ }
}

// ── Per-project camera persistence ────────────────────────────────────────
// Each project (local or cloud) restores its own view. Camera is keyed by the
// active project id; the legacy global `ifc.camera` key is used as a fallback
// only when no project id is available (very early boot before the registry
// resolves).
const CAM_PROJ_PREFIX = 'ifc.camera.proj:';
function cameraKeyFor(projectId: string): string {
  return projectId ? CAM_PROJ_PREFIX + projectId : K.camera;
}

export function saveCameraForProject(projectId: string): void {
  const ctrl = appState.controls as any;
  if (!appState.camera || !ctrl?.target) return;
  try {
    localStorage.setItem(cameraKeyFor(projectId), JSON.stringify({
      px: appState.camera.position.x, py: appState.camera.position.y, pz: appState.camera.position.z,
      tx: ctrl.target.x,              ty: ctrl.target.y,              tz: ctrl.target.z,
    }));
  } catch { /* storage quota — silent */ }
}

// Drop a project's stored camera (called when the project is deleted so its
// key doesn't linger in localStorage).
export function clearCameraForProject(projectId: string): void {
  if (!projectId) return;
  try { localStorage.removeItem(cameraKeyFor(projectId)); } catch { /* ignore */ }
}

// Called after a project's models finish loading so zoomFit doesn't override.
export function restoreCameraForProject(projectId: string): void {
  try {
    const raw = localStorage.getItem(cameraKeyFor(projectId));
    if (!raw) return;
    const c = JSON.parse(raw);
    const ctrl = appState.controls as any;
    if (!appState.camera || !ctrl?.target) return;
    appState.camera.position.set(c.px, c.py, c.pz);
    ctrl.target.set(c.tx, c.ty, c.tz);
    ctrl.update?.();
  } catch { /* ignore */ }
}

// Back-compat shim: restore the currently-active project's camera. Existing
// call sites (cloud auto-load, local-session restore) call this at the right
// moment; it now resolves the per-project key off appState.activeProjectId.
export function restoreCamera(): void {
  restoreCameraForProject(appState.activeProjectId);
}

// ── Init ──────────────────────────────────────────────────────────────────

export function initStatePersist() {
  restore();
  window.addEventListener('beforeunload', save);
  setInterval(save, 30_000); // autosave every 30 s
}
