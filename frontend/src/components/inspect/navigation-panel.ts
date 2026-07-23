/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — NAVIGATION PANEL (Models / Objects / Structure)
   ───────────────────────────────────────────────────────────────────────
   A BIMcollab-style quick-toggle panel living in the left "Overview" rail
   section. Three tabs:
     • Models    — every loaded IFC file, each with a show/hide eye toggle
                   (reuses window.toggleModelVis).
     • Objects   — every IFC category present across the loaded models, each
                   with a show/hide eye toggle (reuses the category-visibility
                   engine: appState.activeCategories + applyCatVis(), with
                   per-category ids in window._catModelIDs).
     • Structure — the existing per-file spatial tree (overview-tree.ts).
   This module only renders the Models/Objects tabs and drives tab switching;
   Structure is owned by overview-tree.ts (ovRefresh).
═══════════════════════════════════════════════════════════════════════ */

import { appState } from '../../store/index.js';
import { escapeHtml } from '../../lib/escape.js';

type NavTab = 'models' | 'objects' | 'structure';
let activeTab: NavTab = 'models';

const EYE_ON = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// ── Models tab ─────────────────────────────────────────────────────────────
function loadedModelSlots(): number[] {
  const out: number[] = [];
  for (let i = 0; i < appState.loadedModels.length; i++) if (appState.loadedModels[i]) out.push(i);
  return out;
}

function modelName(i: number): string {
  return (appState.loadedModels[i] as any)?.fileName || appState.files[i]?.name || `Model ${i}`;
}

function modelVisible(i: number): boolean {
  return (appState.loadedModels[i] as any)?.visible !== false;
}

function renderModels(): void {
  const list = document.getElementById('navModelsList');
  if (!list) return;
  const slots = loadedModelSlots();
  if (slots.length === 0) {
    list.innerHTML = '<div class="nav-empty">No models loaded.</div>';
    return;
  }
  const q = ((document.getElementById('navModelSearch') as HTMLInputElement)?.value || '').toLowerCase();
  let html = '';
  let shown = 0;
  for (const i of slots) {
    const name = modelName(i);
    if (q && !name.toLowerCase().includes(q)) continue;
    shown++;
    const vis = modelVisible(i);
    html += `<div class="nav-row${vis ? '' : ' off'}">
      <button class="nav-eye" onclick="navToggleModel(${i})" title="${vis ? 'Hide model' : 'Show model'}">${vis ? EYE_ON : EYE_OFF}</button>
      <span class="nav-row-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
    </div>`;
  }
  list.innerHTML = shown ? html : '<div class="nav-empty">No models match.</div>';
}

(window as any).navToggleModel = function (i: number): void {
  (window as any).toggleModelVis?.(i);
  renderModels();
};

(window as any).navAllModels = function (on: boolean): void {
  for (const i of loadedModelSlots()) (window as any).toggleModelVis?.(i, on);
  renderModels();
};

// ── Objects (category) tab ──────────────────────────────────────────────────
// activeCategories semantics (shared with the compare-era filter): an empty
// set = "all visible"; a set = "only these visible"; the sentinel '__none__' =
// "all hidden". We translate those to/from a concrete visible-set so each
// category can be toggled independently, then normalise back.
function allCategories(): string[] {
  return Object.keys((window as any)._catData || {});
}

// Pure: expand activeCategories into the concrete set of currently-visible
// categories. Exported for unit testing the tricky sentinel handling.
export function visibleCategories(active: Set<string>, allCats: string[]): Set<string> {
  if (active.size === 0) return new Set(allCats);          // empty = all visible
  if (active.has('__none__')) return new Set();            // sentinel = all hidden
  return new Set(allCats.filter(c => active.has(c)));       // explicit subset
}

// Pure: given the current activeCategories, flip one category's visibility and
// return the normalised activeCategories to store (empty = all, '__none__' =
// none, else the explicit visible subset).
export function toggleCategorySelection(active: Set<string>, allCats: string[], cat: string): Set<string> {
  const visible = visibleCategories(active, allCats);
  if (visible.has(cat)) visible.delete(cat); else visible.add(cat);
  if (visible.size === 0) return new Set(['__none__']);
  if (visible.size >= allCats.length) return new Set();
  return visible;
}

function visibleCategorySet(): Set<string> {
  return visibleCategories(appState.activeCategories, allCategories());
}

function commitActiveCategories(next: Set<string>): void {
  appState.activeCategories = next;
  (window as any).applyCatVis?.();
  (window as any).updateCatTags?.();  // keep the compare-panel category tags in sync
}

function catDisplayName(cat: string): string {
  return cat.replace('Ifc', '').replace('IFC_', '');
}

function renderObjects(): void {
  const list = document.getElementById('navObjectsList');
  if (!list) return;
  const data = (window as any)._catData || {};
  const cats = Object.keys(data);
  if (cats.length === 0) {
    list.innerHTML = '<div class="nav-empty">No categories yet.<br>Load a model to list its object types.</div>';
    return;
  }
  const visible = visibleCategorySet();
  const q = ((document.getElementById('navObjectSearch') as HTMLInputElement)?.value || '').toLowerCase();
  const sorted = cats.sort((a, b) => (data[b].total || 0) - (data[a].total || 0));
  let html = '';
  let shown = 0;
  for (const cat of sorted) {
    const name = catDisplayName(cat);
    if (q && !name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) continue;
    shown++;
    const vis = visible.has(cat);
    const total = data[cat].total || 0;
    html += `<div class="nav-row${vis ? '' : ' off'}">
      <button class="nav-eye" onclick="navToggleObject('${escapeHtml(cat)}')" title="${vis ? 'Hide category' : 'Show category'}">${vis ? EYE_ON : EYE_OFF}</button>
      <span class="nav-row-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="nav-row-count">${total}</span>
    </div>`;
  }
  list.innerHTML = shown ? html : '<div class="nav-empty">No categories match.</div>';
}

(window as any).navToggleObject = function (cat: string): void {
  commitActiveCategories(toggleCategorySelection(appState.activeCategories, allCategories(), cat));
  renderObjects();
};

(window as any).navAllObjects = function (on: boolean): void {
  commitActiveCategories(on ? new Set() : new Set(['__none__']));
  renderObjects();
};

// ── Tabs ────────────────────────────────────────────────────────────────────
function showTab(tab: NavTab): void {
  activeTab = tab;
  (['models', 'objects', 'structure'] as NavTab[]).forEach(t => {
    document.getElementById('navTab-' + t)?.classList.toggle('active', t === tab);
    document.getElementById('navPane-' + t)?.classList.toggle('hide', t !== tab);
  });
  if (tab === 'models') renderModels();
  else if (tab === 'objects') renderObjects();
  else (window as any).ovRefresh?.();
}
(window as any).navShowTab = showTab;
(window as any).navRenderModels = renderModels;
(window as any).navRenderObjects = renderObjects;

// Called when the Navigation section is opened (rail) or the model set changes.
// Renders whichever tab is active.
(window as any).navRefresh = function (): void {
  showTab(activeTab);
};

// A model (re)loaded or the project switched — refresh the lists so counts and
// toggles stay accurate. Cheap; only re-renders the active tab's DOM.
window.addEventListener('ifc:modelloaded', () => (window as any).navRefresh());
window.addEventListener('ifc:projectchange', () => (window as any).navRefresh());
window.addEventListener('ifc:cloudprojects', () => { if (activeTab === 'models') renderModels(); });
