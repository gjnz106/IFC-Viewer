// ── Saved viewpoints (per-project gallery) ────────────────────────────────
// A viewpoint = camera + section box + visibility, captured with a
// thumbnail and restorable later. Stored per active project (Phase 6) so
// switching projects shows a different gallery.

import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { escapeHtml } from '../../lib/escape.js';
import { getLoadedModelCount } from '../compare/federation-load.js';
import { getVisibilityState, applyVisibilityState } from './color-schemes.js';
import { loadRegistry, getActiveProject } from '../../lib/projects-store.js';
import {
  loadViewpoints, saveViewpoints, addViewpoint, removeViewpoint, renameViewpoint,
  remapCamera, modelsFingerprint, makeViewpointId, type Viewpoint, type ViewpointSection,
} from '../../lib/viewpoints-store.js';

const SLIDER_IDS = ['slXp', 'slXn', 'slYp', 'slYn', 'slZp', 'slZn'] as const;

function currentProjectId(): string {
  try { return getActiveProject(loadRegistry())?.id || 'default'; } catch { return 'default'; }
}

let vpList: Viewpoint[] = loadViewpoints(currentProjectId());

function currentModelsKey(): string {
  return modelsFingerprint(appState.loadedModels.map((m: any) => m?.fileName));
}

// ── Field Mode reuse ──────────────────────────────────────────────────
// Field Mode renders its own touch gallery; expose the current list (id, name,
// thumb) so it can, and a change hook so it refreshes after save/delete/rename
// or a project switch. window.vpSave / vpRestore / vpDelete are reused as-is.
(window as any).vpFieldData = () => vpList.map(vp => ({ id: vp.id, name: vp.name, thumb: vp.thumb }));
function notifyVpChange(): void { try { window.dispatchEvent(new CustomEvent('ifc:vpchange')); } catch {} }

function captureThumbnail(): string {
  try {
    appState.renderer.render(appState.scene, appState.camera);
    const src = appState.renderer.domElement;
    const W = 160, H = 100;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, W, H);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch { return ''; }
}

function renderVpGallery(): void {
  notifyVpChange(); // keep the Field Mode gallery in sync with every mutation
  const grid = document.getElementById('vpGrid');
  const badge = document.getElementById('vpBadge');
  if (badge) badge.textContent = String(vpList.length);
  if (!grid) return;
  if (vpList.length === 0) {
    grid.innerHTML = '<div class="vp-empty">No saved viewpoints yet.</div>';
    return;
  }
  grid.innerHTML = vpList.map(vp => `
    <div class="vp-card" onclick="vpRestore('${vp.id}')">
      <img src="${vp.thumb}" alt="${escapeHtml(vp.name)}" draggable="false">
      <div class="vp-card-name" title="${escapeHtml(vp.name)}">${escapeHtml(vp.name)}</div>
      <div class="vp-card-actions">
        <button onclick="event.stopPropagation();vpRename('${vp.id}')" title="Rename">✎</button>
        <button onclick="event.stopPropagation();vpDelete('${vp.id}')" title="Delete">✕</button>
      </div>
    </div>`).join('');
}

window.vpTogglePanel = function (): void {
  const body = document.getElementById('vpBody');
  if (body) body.classList.toggle('show');
};

window.vpSave = function (): void {
  if (getLoadedModelCount() === 0) { alert('Load a model first.'); return; }
  const name = (prompt('Viewpoint name:', 'Viewpoint ' + (vpList.length + 1)) || '').trim();
  if (!name) return;

  const camera = {
    px: appState.camera.position.x, py: appState.camera.position.y, pz: appState.camera.position.z,
    tx: appState.controls.target.x, ty: appState.controls.target.y, tz: appState.controls.target.z,
  };
  const offset = appState.sharedCenterOffset;
  const anchor = offset ? { x: offset.x, y: offset.y, z: offset.z } : null;

  let section: ViewpointSection | null = null;
  const sliderEls = SLIDER_IDS.map(id => document.getElementById(id) as HTMLInputElement | null);
  if (sliderEls.every(Boolean)) {
    section = {
      active: appState.sectionActive,
      sliders: sliderEls.map(el => +el!.value) as ViewpointSection['sliders'],
    };
  }

  const vis = getVisibilityState();
  const vp: Viewpoint = {
    id: makeViewpointId(),
    name,
    createdAt: Date.now(),
    camera,
    anchor,
    section,
    visibility: {
      slotVisible: appState.loadedModels.map((m, i) => !m || !appState.hiddenModels.has(i)),
      hiddenKeys: vis.hiddenKeys,
      isolated: vis.isolated,
    },
    modelsKey: currentModelsKey(),
    thumb: captureThumbnail(),
  };

  vpList = addViewpoint(vpList, vp);
  const ok = saveViewpoints(currentProjectId(), vpList);
  renderVpGallery();
  window.dispatchEvent(new CustomEvent('ifc:viewpointschange', { detail: { count: vpList.length } }));
  if (ok) {
    log('Viewpoint saved: ' + name);
  } else {
    alert('Could not save "' + name + '" — browser storage is full. It will disappear after reload; delete some older viewpoints and try again.');
    log('Viewpoint save FAILED (storage quota): ' + name);
  }
};

window.vpRestore = function (id: string): void {
  const vp = vpList.find(v => v.id === id);
  if (!vp) return;
  if (appState.compareResult) { alert('Exit Compare first, then restore this viewpoint.'); return; }

  const hasModels = getLoadedModelCount() > 0;
  if (hasModels && currentModelsKey() !== vp.modelsKey) {
    if (!confirm('This viewpoint was captured with a different set of loaded models. Restore the camera anyway?')) return;
  }

  const offset = appState.sharedCenterOffset;
  const currentOffset = offset ? { x: offset.x, y: offset.y, z: offset.z } : null;
  const cam = remapCamera(vp.camera, vp.anchor, currentOffset);
  appState.camera.position.set(cam.px, cam.py, cam.pz);
  appState.controls.target.set(cam.tx, cam.ty, cam.tz);
  appState.controls.update();

  if (!hasModels) {
    log('Viewpoint restored (camera only — load the models for full restore): ' + vp.name);
    return;
  }

  if (vp.section) {
    SLIDER_IDS.forEach((id, i) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = String(vp.section!.sliders[i]);
    });
    if (vp.section.active !== appState.sectionActive) (window as any).toggleSectionBox?.();
    else if (appState.sectionActive) (window as any).updateSectionFromSliders?.();
  }

  vp.visibility.slotVisible.forEach((visible, i) => {
    if (!appState.loadedModels[i]) return;
    // Force the slot to the saved state (toggleModelVis keeps hiddenModels,
    // the A/B checkbox and the category subsets all in sync).
    (window as any).toggleModelVis?.(i, visible);
  });
  applyVisibilityState({ hiddenKeys: vp.visibility.hiddenKeys, isolated: vp.visibility.isolated });

  log('Viewpoint restored: ' + vp.name);
};

window.vpRename = function (id: string): void {
  const vp = vpList.find(v => v.id === id);
  if (!vp) return;
  const name = prompt('Viewpoint name:', vp.name);
  if (name === null) return;
  vpList = renameViewpoint(vpList, id, name);
  saveViewpoints(currentProjectId(), vpList);
  renderVpGallery();
  window.dispatchEvent(new CustomEvent('ifc:viewpointschange', { detail: { count: vpList.length } }));
};

window.vpDelete = function (id: string): void {
  const vp = vpList.find(v => v.id === id);
  if (!vp) return;
  if (!confirm(`Delete viewpoint "${vp.name}"?`)) return;
  vpList = removeViewpoint(vpList, id);
  saveViewpoints(currentProjectId(), vpList);
  renderVpGallery();
  window.dispatchEvent(new CustomEvent('ifc:viewpointschange', { detail: { count: vpList.length } }));
};

// Re-read the gallery whenever the active project changes (Phase 6 dispatches
// this on create/switch/delete).
window.addEventListener('ifc:projectchange', () => {
  vpList = loadViewpoints(currentProjectId());
  renderVpGallery();
});

renderVpGallery();
