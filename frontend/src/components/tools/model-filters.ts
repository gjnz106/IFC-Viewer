// ── View filters (named model-visibility presets, per project) ────────────
// Dalux-style: toggle the models a discipline cares about, save the selection
// under a name, and switch to it later in one click. Applying a filter
// ISOLATES — models in the filter are shown, every other loaded slot is hidden.
//
// Stored per active project like viewpoints, so switching projects shows a
// different set of filters.

import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { escapeHtml } from '../../lib/escape.js';
import { getLoadedModelCount } from '../compare/federation-load.js';
import { loadRegistry, getActiveProject } from '../../lib/projects-store.js';
import {
  loadFilters, saveFilters, addFilter, removeFilter, renameFilter, updateFilterModels,
  resolveFilter, captureVisibleModels, makeFilterId, type ModelFilter,
} from '../../lib/model-filters-store.js';

function currentProjectId(): string {
  try { return getActiveProject(loadRegistry())?.id || 'default'; } catch { return 'default'; }
}

let mfList: ModelFilter[] = loadFilters(currentProjectId());

// Slot-indexed model names. Same fallback chain the Navigation panel uses, so
// a slot whose model object predates fileName still resolves to something.
function currentModelNames(): (string | null)[] {
  return appState.loadedModels.map(
    (m: any, i: number) => (m ? (m.fileName || appState.files[i]?.name || `Model ${i}`) : null),
  );
}

function renderMfList(): void {
  const list = document.getElementById('mfList');
  const badge = document.getElementById('mfBadge');
  if (badge) badge.textContent = String(mfList.length);
  if (!list) return;
  if (mfList.length === 0) {
    list.innerHTML = '<div class="mf-empty">No view filters yet. Toggle the models you want, then save.</div>';
    return;
  }
  const names = currentModelNames();
  list.innerHTML = mfList.map(f => {
    const r = resolveFilter(f.models, names);
    // Surface a missing-model count up front: a filter saved against a fuller
    // project would otherwise just look like it hid too much.
    const warn = r.missing.length
      ? `<span class="mf-warn" title="${escapeHtml(r.missing.join(', '))} not loaded">⚠ ${r.missing.length}</span>`
      : '';
    const count = `${r.visibleSlots.length}/${f.models.length}`;
    return `<div class="mf-row" onclick="mfApply('${f.id}')" title="${escapeHtml(f.models.join('\n'))}">
      <span class="mf-row-name">${escapeHtml(f.name)}</span>
      <span class="mf-row-count">${count}</span>${warn}
      <span class="mf-row-actions">
        <button onclick="event.stopPropagation();mfUpdate('${f.id}')" title="Update to current selection">⟳</button>
        <button onclick="event.stopPropagation();mfRename('${f.id}')" title="Rename">✎</button>
        <button onclick="event.stopPropagation();mfDelete('${f.id}')" title="Delete">✕</button>
      </span>
    </div>`;
  }).join('');
}

function persist(): void {
  if (!saveFilters(currentProjectId(), mfList)) {
    alert('Could not save view filters — browser storage is full.');
    log('View filter save FAILED (storage quota)');
  }
  renderMfList();
}

window.mfTogglePanel = function (): void {
  document.getElementById('mfBody')?.classList.toggle('show');
};

window.mfSave = function (): void {
  if (getLoadedModelCount() === 0) { alert('Load a model first.'); return; }
  const models = captureVisibleModels(currentModelNames(), appState.hiddenModels);
  if (models.length === 0) {
    alert('Every model is hidden — show the ones this filter should contain, then save.');
    return;
  }
  const name = (prompt('View filter name:', 'Filter ' + (mfList.length + 1)) || '').trim();
  if (!name) return;

  mfList = addFilter(mfList, { id: makeFilterId(), name, createdAt: Date.now(), models });
  persist();
  log(`View filter saved: ${name} (${models.length} model${models.length === 1 ? '' : 's'})`);
};

window.mfApply = function (id: string): void {
  const f = mfList.find(x => x.id === id);
  if (!f) return;
  if (getLoadedModelCount() === 0) { alert('Load a model first.'); return; }

  const r = resolveFilter(f.models, currentModelNames());
  if (r.visibleSlots.length === 0) {
    // Applying would blank the viewport with no obvious cause — refuse instead.
    alert(`None of the models in "${f.name}" are loaded, so applying it would hide everything.\n\nMissing: ${r.missing.join(', ')}`);
    return;
  }

  // Route through toggleModelVis so hiddenModels, the A/B checkboxes and the
  // category subsets all stay in sync — the same seam viewpoint restore uses.
  for (const i of r.visibleSlots) (window as any).toggleModelVis?.(i, true);
  for (const i of r.hiddenSlots) (window as any).toggleModelVis?.(i, false);

  (window as any).navRefresh?.(); // keep the Navigation panel's eye icons honest
  renderMfList();

  const warn = r.missing.length ? ` (${r.missing.length} not loaded)` : '';
  log(`View filter applied: ${f.name} — ${r.visibleSlots.length} shown, ${r.hiddenSlots.length} hidden${warn}`);
};

window.mfUpdate = function (id: string): void {
  const f = mfList.find(x => x.id === id);
  if (!f) return;
  const models = captureVisibleModels(currentModelNames(), appState.hiddenModels);
  if (models.length === 0) { alert('Every model is hidden — nothing to save into this filter.'); return; }
  if (!confirm(`Update "${f.name}" to the ${models.length} model${models.length === 1 ? '' : 's'} visible now?`)) return;
  mfList = updateFilterModels(mfList, id, models);
  persist();
  log(`View filter updated: ${f.name}`);
};

window.mfRename = function (id: string): void {
  const f = mfList.find(x => x.id === id);
  if (!f) return;
  const name = prompt('View filter name:', f.name);
  if (name === null) return;
  mfList = renameFilter(mfList, id, name);
  persist();
};

window.mfDelete = function (id: string): void {
  const f = mfList.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`Delete view filter "${f.name}"?`)) return;
  mfList = removeFilter(mfList, id);
  persist();
};

window.mfShowAll = function (): void {
  if (getLoadedModelCount() === 0) return;
  const names = currentModelNames();
  for (let i = 0; i < names.length; i++) if (names[i]) (window as any).toggleModelVis?.(i, true);
  (window as any).navRefresh?.();
  log('View filter cleared — all models shown');
};

// The filter list is per project, and the shown/missing counts depend on which
// models are loaded, so re-render on both.
window.addEventListener('ifc:projectchange', () => {
  mfList = loadFilters(currentProjectId());
  renderMfList();
});
window.addEventListener('ifc:modelloaded', () => renderMfList());

renderMfList();
