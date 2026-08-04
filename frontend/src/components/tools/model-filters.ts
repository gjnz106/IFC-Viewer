// ── View filters (named model + category visibility presets, per project) ──
// Dalux-style: two independent filter chips, "File" and "Category". Toggling
// checkboxes in either applies live to the viewport; "Save" names the current
// combination so it can be restored in one click later.
//
// File narrows which loaded models are shown (isolate by file name — the
// same engine this module always used). Category narrows which IFC types are
// shown, reusing the app's existing single global category-visibility engine
// (appState.activeCategories + applyCatVis()) that the Navigation panel's
// Objects tab also drives — a saved filter is just another way to set it.
//
// Stored per active project like viewpoints, so switching projects shows a
// different set of filters.

import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { escapeHtml } from '../../lib/escape.js';
import { getLoadedModelCount } from '../compare/federation-load.js';
import { loadRegistry, getActiveProject } from '../../lib/projects-store.js';
import { visibleCategories, toggleCategorySelection } from '../inspect/navigation-panel.js';
import {
  loadFilters, saveFilters, addFilter, removeFilter, renameFilter, updateFilterSelection,
  resolveFilter, captureVisibleModels, makeFilterId, type ModelFilter,
} from '../../lib/model-filters-store.js';

function currentProjectId(): string {
  try { return getActiveProject(loadRegistry())?.id || 'default'; } catch { return 'default'; }
}

let mfList: ModelFilter[] = loadFilters(currentProjectId());
let openDropdown: 'file' | 'cat' | null = null;

// Slot-indexed model names. Same fallback chain the Navigation panel uses, so
// a slot whose model object predates fileName still resolves to something.
function currentModelNames(): (string | null)[] {
  return appState.loadedModels.map(
    (m: any, i: number) => (m ? (m.fileName || appState.files[i]?.name || `Model ${i}`) : null),
  );
}

// Unique model names in slot order — the File checklist is per FILE, not per
// slot, matching how ModelFilter.models and resolveFilter() already treat a
// duplicated file name (loaded into two slots) as one entry that means "both".
function uniqueModelNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of currentModelNames()) { if (n && !seen.has(n)) { seen.add(n); out.push(n); } }
  return out;
}

function allCategories(): string[] {
  return Object.keys((window as any)._catData || {});
}

function catDisplayName(cat: string): string {
  return cat.replace('Ifc', '').replace('IFC_', '');
}

// ── File dropdown ────────────────────────────────────────────────────────
function renderFileDropdown(): void {
  const box = document.getElementById('mfFileList');
  const chipCount = document.getElementById('mfFileCount');
  if (!box) return;
  const names = uniqueModelNames();
  const visible = new Set(captureVisibleModels(currentModelNames(), appState.hiddenModels));
  if (chipCount) chipCount.textContent = visible.size === names.length ? '' : `(${visible.size}/${names.length})`;
  const q = ((document.getElementById('mfFileSearch') as HTMLInputElement)?.value || '').toLowerCase();
  if (names.length === 0) { box.innerHTML = '<div class="mf-dd-empty">No models loaded.</div>'; return; }
  const rows = names
    .filter(n => !q || n.toLowerCase().includes(q))
    .map(n => `<label class="mf-dd-row">
      <input type="checkbox" ${visible.has(n) ? 'checked' : ''} onchange="mfToggleFile('${escapeHtml(n).replace(/'/g, "\\'")}')">
      <span title="${escapeHtml(n)}">${escapeHtml(n)}</span>
    </label>`).join('');
  box.innerHTML = rows || '<div class="mf-dd-empty">No models match.</div>';
}

window.mfToggleFile = function (name: string): void {
  const names = currentModelNames();
  const visible = new Set(captureVisibleModels(names, appState.hiddenModels));
  const nextVisible = visible.has(name);
  // Toggling one file name flips EVERY slot holding that name, consistent
  // with resolveFilter treating a duplicated name as "all slots match".
  for (let i = 0; i < names.length; i++) if (names[i] === name) (window as any).toggleModelVis?.(i, !nextVisible);
  (window as any).navRefresh?.();
  renderFileDropdown();
  renderMfList();
};

window.mfFileSearchInput = function (): void { renderFileDropdown(); };

window.mfFileSelectAll = function (on: boolean): void {
  const names = currentModelNames();
  for (let i = 0; i < names.length; i++) if (names[i]) (window as any).toggleModelVis?.(i, on);
  (window as any).navRefresh?.();
  renderFileDropdown();
  renderMfList();
};

// ── Category dropdown ───────────────────────────────────────────────────
function applyCategories(next: Set<string>): void {
  appState.activeCategories = next;
  (window as any).applyCatVis?.();
  (window as any).updateCatTags?.();
}

function renderCatDropdown(): void {
  const box = document.getElementById('mfCatList');
  const chipCount = document.getElementById('mfCatCount');
  if (!box) return;
  const cats = allCategories();
  const visible = visibleCategories(appState.activeCategories, cats);
  if (chipCount) chipCount.textContent = visible.size === cats.length ? '' : `(${visible.size}/${cats.length})`;
  const q = ((document.getElementById('mfCatSearch') as HTMLInputElement)?.value || '').toLowerCase();
  if (cats.length === 0) { box.innerHTML = '<div class="mf-dd-empty">No categories yet — load a model.</div>'; return; }
  const sorted = cats.slice().sort((a, b) => catDisplayName(a).localeCompare(catDisplayName(b)));
  const rows = sorted
    .filter(c => !q || catDisplayName(c).toLowerCase().includes(q))
    .map(c => `<label class="mf-dd-row">
      <input type="checkbox" ${visible.has(c) ? 'checked' : ''} onchange="mfToggleCategory('${escapeHtml(c).replace(/'/g, "\\'")}')">
      <span title="${escapeHtml(c)}">${escapeHtml(catDisplayName(c))}</span>
    </label>`).join('');
  box.innerHTML = rows || '<div class="mf-dd-empty">No categories match.</div>';
}

window.mfToggleCategory = function (cat: string): void {
  applyCategories(toggleCategorySelection(appState.activeCategories, allCategories(), cat));
  renderCatDropdown();
  renderMfList();
};

window.mfCatSearchInput = function (): void { renderCatDropdown(); };

window.mfCatSelectAll = function (): void { applyCategories(new Set()); renderCatDropdown(); renderMfList(); };
window.mfCatSelectNone = function (): void { applyCategories(new Set(['__none__'])); renderCatDropdown(); renderMfList(); };

// ── Dropdown open/close ──────────────────────────────────────────────────
window.mfToggleDropdown = function (which: 'file' | 'cat'): void {
  openDropdown = openDropdown === which ? null : which;
  const fileEl = document.getElementById('mfFileDropdown');
  const catEl = document.getElementById('mfCatDropdown');
  fileEl?.classList.toggle('open', openDropdown === 'file');
  catEl?.classList.toggle('open', openDropdown === 'cat');
  document.getElementById('mfFileChip')?.classList.toggle('open', openDropdown === 'file');
  document.getElementById('mfCatChip')?.classList.toggle('open', openDropdown === 'cat');
  if (openDropdown === 'file') renderFileDropdown();
  if (openDropdown === 'cat') renderCatDropdown();
};

document.addEventListener('click', (e) => {
  if (!openDropdown) return;
  const bar = document.getElementById('mfFilterBar');
  if (bar && !bar.contains(e.target as Node)) {
    openDropdown = null;
    document.getElementById('mfFileDropdown')?.classList.remove('open');
    document.getElementById('mfCatDropdown')?.classList.remove('open');
    document.getElementById('mfFileChip')?.classList.remove('open');
    document.getElementById('mfCatChip')?.classList.remove('open');
  }
});

// ── Saved filters list ───────────────────────────────────────────────────
function categoryLabel(f: ModelFilter, allCats: string[]): string {
  if (f.categories.length === 0) return 'all categories';
  if (f.categories.includes('__none__')) return 'no categories';
  return `${f.categories.length}/${allCats.length || f.categories.length} categories`;
}

function renderMfList(): void {
  const list = document.getElementById('mfList');
  const badge = document.getElementById('mfBadge');
  if (badge) badge.textContent = String(mfList.length);
  if (!list) return;
  if (mfList.length === 0) {
    list.innerHTML = '<div class="mf-empty">No view filters yet. Pick File / Category above, then save.</div>';
    return;
  }
  const names = currentModelNames();
  const allCats = allCategories();
  list.innerHTML = mfList.map(f => {
    const r = resolveFilter(f.models, names);
    // Surface a missing-model count up front: a filter saved against a fuller
    // project would otherwise just look like it hid too much.
    const warn = r.missing.length
      ? `<span class="mf-warn" title="${escapeHtml(r.missing.join(', '))} not loaded">⚠ ${r.missing.length}</span>`
      : '';
    const modelCount = `${r.visibleSlots.length}/${f.models.length} files`;
    const catCount = categoryLabel(f, allCats);
    return `<div class="mf-row" onclick="mfApply('${f.id}')" title="${escapeHtml(f.models.join('\n'))}">
      <span class="mf-row-name">${escapeHtml(f.name)}</span>
      <span class="mf-row-count">${modelCount} · ${catCount}</span>${warn}
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
  const categories = Array.from(appState.activeCategories);
  const name = (prompt('View filter name:', 'Filter ' + (mfList.length + 1)) || '').trim();
  if (!name) return;

  mfList = addFilter(mfList, { id: makeFilterId(), name, createdAt: Date.now(), models, categories });
  persist();
  log(`View filter saved: ${name} (${models.length} model${models.length === 1 ? '' : 's'}, ${categoryLabel({ categories } as ModelFilter, allCategories())})`);
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
  applyCategories(new Set(f.categories));

  (window as any).navRefresh?.(); // keep the Navigation panel's eye icons honest
  if (openDropdown === 'file') renderFileDropdown();
  if (openDropdown === 'cat') renderCatDropdown();
  renderMfList();

  const warn = r.missing.length ? ` (${r.missing.length} not loaded)` : '';
  log(`View filter applied: ${f.name} — ${r.visibleSlots.length} shown, ${r.hiddenSlots.length} hidden${warn}`);
};

window.mfUpdate = function (id: string): void {
  const f = mfList.find(x => x.id === id);
  if (!f) return;
  const models = captureVisibleModels(currentModelNames(), appState.hiddenModels);
  if (models.length === 0) { alert('Every model is hidden — nothing to save into this filter.'); return; }
  const categories = Array.from(appState.activeCategories);
  if (!confirm(`Update "${f.name}" to the current File/Category selection (${models.length} model${models.length === 1 ? '' : 's'})?`)) return;
  mfList = updateFilterSelection(mfList, id, models, categories);
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
  applyCategories(new Set());
  (window as any).navRefresh?.();
  if (openDropdown === 'file') renderFileDropdown();
  if (openDropdown === 'cat') renderCatDropdown();
  renderMfList();
  log('View filter cleared — all models and categories shown');
};

// The filter list is per project, and the shown/missing counts depend on which
// models are loaded, so re-render on both.
window.addEventListener('ifc:projectchange', () => {
  mfList = loadFilters(currentProjectId());
  renderMfList();
});
window.addEventListener('ifc:modelloaded', () => {
  renderMfList();
  if (openDropdown === 'file') renderFileDropdown();
  if (openDropdown === 'cat') renderCatDropdown();
});

renderMfList();
