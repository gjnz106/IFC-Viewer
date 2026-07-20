// ── Overview tab (left rail) — per-file spatial tree ─────────────────────
// Renders every loaded model as a card with its file name plus the IFC
// spatial hierarchy (Project → Site → Building → Storey → per-class groups
// → elements), built from ifcManager.getSpatialStructure(). Clicking an
// element highlights it in 3D, shows its Properties and zooms to it —
// same interaction pattern as Search. Trees are cached per model and only
// rebuilt when the loaded-model set changes.

import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { escapeHtml } from '../../lib/escape.js';
import { IFC_NAMES, FED_COLORS, FED_LABELS } from '../../lib/constants.js';
import { log } from '../core/ifc-category.js';
import { getElementBBox } from '../tools/color-schemes.js';
import {
  buildOverviewTree, buildPrettyTypeLookup, filterOverviewTree, countStoreys,
  type OvNode,
} from '../../lib/spatial-tree.js';
import { loadIssueMap, computeIssueMetrics } from '../../lib/clash-issues.js';
import { clashProjectKey } from '../compare/clash.js';
import { loadSnapshots } from '../validate/snapshots.js';

const PRETTY = buildPrettyTypeLookup(Object.values(IFC_NAMES));

interface SlotTree {
  cacheKey: string;       // modelID + fileName — invalidates on reload/replace
  fileName: string;
  root: OvNode | null;    // null = spatial structure unavailable for this model
  names: Map<number, string>; // expressID → IFC Name (lazily filled)
}

const slotTrees = new Map<number, SlotTree>();
const expanded = new Set<string>();     // OvNode.key values ("slot:" prefixed)
const namesRequested = new Set<string>(); // group keys already fetched
let query = '';
let generation = 0;                     // invalidates in-flight async builds

function slotCacheKey(idx: number): string {
  const m = appState.loadedModels[idx];
  return m ? `${m.modelID}:${appState.files[idx]?.name || ''}` : '';
}

function slotBadge(idx: number): { label: string; color: string } {
  if (idx === 0) return { label: 'A', color: '#3b82f6' };
  if (idx === 1) return { label: 'B', color: '#f59e0b' };
  return {
    label: FED_LABELS[(idx - 2) % FED_LABELS.length],
    color: FED_COLORS[(idx - 2) % FED_COLORS.length],
  };
}

// ── Build / refresh ──────────────────────────────────────────────────────
async function rebuildSlot(idx: number, gen: number): Promise<void> {
  const model = appState.loadedModels[idx];
  if (!model) return;
  const key = slotCacheKey(idx);
  const entry: SlotTree = {
    cacheKey: key,
    fileName: appState.files[idx]?.name || model.fileName || `Model ${idx}`,
    root: null,
    names: new Map(),
  };
  slotTrees.set(idx, entry);
  try {
    const raw = await appState.ifcLoader.ifcManager.getSpatialStructure(model.modelID, false);
    if (gen !== generation || slotCacheKey(idx) !== key) return;
    entry.root = raw ? buildOverviewTree(raw, PRETTY, `s${idx}`) : null;
    // Resolve real names for the (few) spatial containers eagerly.
    const spatialNodes: OvNode[] = [];
    const collect = (n: OvNode) => { if (n.kind === 'spatial') { spatialNodes.push(n); n.children.forEach(collect); } };
    if (entry.root) collect(entry.root);
    for (const n of spatialNodes.slice(0, 120)) {
      try {
        const p = await appState.ifcLoader.ifcManager.getItemProperties(model.modelID, n.eid, false);
        const nm = p?.Name?.value || p?.LongName?.value;
        if (nm) entry.names.set(n.eid, String(nm));
      } catch { /* keep type label */ }
      if (gen !== generation) return;
    }
  } catch (e: any) {
    log('Overview: spatial structure failed for slot ' + idx + ':', e?.message);
  }
  if (gen === generation) render();
}

function ovRefresh(): void {
  const gen = ++generation;
  // Drop cache entries whose slot was unloaded/replaced.
  for (const [idx] of slotTrees) {
    if (slotTrees.get(idx)!.cacheKey !== slotCacheKey(idx)) slotTrees.delete(idx);
  }
  render(); // instant paint with whatever is cached
  for (let i = 0; i < appState.loadedModels.length; i++) {
    if (appState.loadedModels[i] && !slotTrees.has(i)) void rebuildSlot(i, gen);
  }
}
window.ovRefresh = ovRefresh;

// Lazily fetch element names for one expanded group (bounded).
async function fetchGroupNames(idx: number, group: OvNode): Promise<void> {
  if (namesRequested.has(group.key) || group.children.length > 300) return;
  namesRequested.add(group.key);
  const entry = slotTrees.get(idx);
  const model = appState.loadedModels[idx];
  if (!entry || !model) return;
  const gen = generation;
  let changed = false;
  for (const el of group.children) {
    if (entry.names.has(el.eid)) continue;
    try {
      const p = await appState.ifcLoader.ifcManager.getItemProperties(model.modelID, el.eid, false);
      if (p?.Name?.value) { entry.names.set(el.eid, String(p.Name.value)); changed = true; }
    } catch { /* keep #eid */ }
    if (gen !== generation) return;
  }
  if (changed && gen === generation) render();
}

// ── Rendering ────────────────────────────────────────────────────────────
function nodeLabel(entry: SlotTree, n: OvNode): string {
  if (n.kind === 'group') return n.label;
  const nm = entry.names.get(n.eid);
  if (n.kind === 'spatial') return nm || n.label;
  return nm ? nm : ('#' + n.eid);
}

function renderNode(idx: number, entry: SlotTree, n: OvNode, depth: number): string {
  const hasKids = n.children.length > 0;
  // A non-empty filter auto-expands the (pruned, small) result tree.
  const isOpen = query.trim() !== '' || expanded.has(n.key);
  const caret = hasKids
    ? `<span class="ov-caret${isOpen ? ' open' : ''}">▸</span>`
    : '<span class="ov-caret leaf"></span>';
  const cnt = n.kind === 'element' ? '' : `<span class="ov-count">${n.count}</span>`;
  const sub = n.kind === 'element' && entry.names.get(n.eid) ? ` <span class="ov-eid">#${n.eid}</span>` : '';
  let html = `<div class="ov-row ov-${n.kind}" data-slot="${idx}" data-key="${escapeHtml(n.key)}" data-eid="${n.eid}" data-kind="${n.kind}" style="padding-left:${8 + depth * 14}px" title="${escapeHtml(n.ifcType)} #${n.eid}">
    ${caret}<span class="ov-label">${escapeHtml(nodeLabel(entry, n))}${sub}</span>${cnt}
  </div>`;
  if (hasKids && isOpen) {
    for (const c of n.children) html += renderNode(idx, entry, c, depth + 1);
  }
  return html;
}

// ── Clash-tracking dashboard (Overview header) ───────────────────────────
// Backlog + trend for the active project's tracked clash issues. Hidden
// entirely until the project has clash-tracking history.
function clashDashboardHtml(): string {
  const metrics = computeIssueMetrics(loadIssueMap(clashProjectKey()));
  if (metrics.total === 0) return '';
  const unresolved = metrics.unresolvedHard + metrics.unresolvedClearance;

  // Trend from the recorded clash snapshots (newest first) — total per run.
  const snaps = loadSnapshots().filter(s => s.kind === 'clash').slice(0, 10);
  let trendHtml = '';
  if (snaps.length >= 2) {
    const vals = snaps.map(s => Number(s.stats?.total) || 0).reverse(); // oldest → newest
    const max = Math.max(...vals, 1);
    const bars = vals.map(v =>
      `<span class="ovc-bar" style="height:${Math.max(8, Math.round((v / max) * 26))}px" title="${v} clashes"></span>`
    ).join('');
    const delta = vals[vals.length - 1] - vals[vals.length - 2];
    const deltaTxt = delta === 0 ? '±0'
      : `${delta > 0 ? '▲ +' : '▼ '}${delta}`;
    trendHtml = `<div class="ovc-trend"><span class="ovc-bars">${bars}</span><span class="ovc-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${deltaTxt} vs previous run</span></div>`;
  }

  return `<div class="ovc">
    <div class="ovc-head">Clash backlog</div>
    <div class="ovc-stats">
      <div class="ovc-stat bad"><b>${metrics.unresolvedHard}</b><span>hard open</span></div>
      <div class="ovc-stat warn"><b>${metrics.unresolvedClearance}</b><span>clearance open</span></div>
      <div class="ovc-stat ok"><b>${metrics.resolved}</b><span>resolved</span></div>
      <div class="ovc-stat"><b>${metrics.gone}</b><span>auto-fixed</span></div>
    </div>
    ${metrics.reappeared ? `<div class="ovc-reopen">⚠ ${metrics.reappeared} marked resolved but detected again</div>` : ''}
    ${trendHtml}
    ${unresolved ? `<button class="ovc-open" onclick="navigateTo('clash')">Open Clash →</button>` : ''}
  </div>`;
}

function render(): void {
  const treeEl = document.getElementById('ovTree');
  const sumEl = document.getElementById('ovSummary');
  if (!treeEl || !sumEl) return;
  const dashEl = document.getElementById('ovClash');
  if (dashEl) dashEl.innerHTML = clashDashboardHtml();

  const loadedIdxs: number[] = [];
  for (let i = 0; i < appState.loadedModels.length; i++) if (appState.loadedModels[i]) loadedIdxs.push(i);

  if (loadedIdxs.length === 0) {
    sumEl.innerHTML = '';
    treeEl.innerHTML = '<div class="ov-empty">No models loaded.<br>Load an IFC file to see its structure here.</div>';
    return;
  }

  let totalElems = 0, totalStoreys = 0, pending = 0;
  for (const i of loadedIdxs) {
    const t = slotTrees.get(i);
    if (t?.root) { totalElems += t.root.count; totalStoreys += countStoreys(t.root); }
    else pending++;
  }
  sumEl.innerHTML = `
    <div class="ov-stat"><b>${loadedIdxs.length}</b><span>file${loadedIdxs.length === 1 ? '' : 's'}</span></div>
    <div class="ov-stat"><b>${totalElems.toLocaleString()}</b><span>elements</span></div>
    <div class="ov-stat"><b>${totalStoreys}</b><span>storeys</span></div>`;

  let html = '';
  for (const i of loadedIdxs) {
    const entry = slotTrees.get(i);
    const badge = slotBadge(i);
    const fileKey = `s${i}:file`;
    const isOpen = query.trim() !== '' || expanded.has(fileKey) || loadedIdxs.length === 1;
    const name = entry?.fileName || appState.files[i]?.name || `Model ${i}`;
    html += `<div class="ov-file${isOpen ? ' open' : ''}" data-filekey="${fileKey}">
      <span class="ov-file-dot" style="background:${badge.color}">${badge.label}</span>
      <span class="ov-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="ov-count">${entry?.root ? entry.root.count.toLocaleString() : '…'}</span>
      <span class="ov-caret${isOpen ? ' open' : ''}">▸</span>
    </div>`;
    if (!isOpen) continue;
    if (!entry) { html += '<div class="ov-empty">Reading structure…</div>'; continue; }
    if (!entry.root) { html += '<div class="ov-empty">No spatial structure in this file.</div>'; continue; }
    const shown = filterOverviewTree(entry.root, query);
    if (!shown) { html += '<div class="ov-empty">No match in this file.</div>'; continue; }
    html += renderNode(i, entry, shown, 1);
  }
  if (pending > 0 && loadedIdxs.every(i => !slotTrees.get(i)?.root)) {
    html += '<div class="ov-empty">Reading model structure…</div>';
  }
  treeEl.innerHTML = html;
}

// ── Interactions ─────────────────────────────────────────────────────────
function findNode(root: OvNode, key: string): OvNode | null {
  if (root.key === key) return root;
  for (const c of root.children) {
    if (key.startsWith(c.key)) { const hit = findNode(c, key); if (hit) return hit; }
  }
  return null;
}

async function pickElement(idx: number, eid: number): Promise<void> {
  const model = appState.loadedModels[idx];
  if (!model || !appState.ifcLoader) return;
  const modelID = model.modelID;
  try {
    const props = await appState.ifcLoader.ifcManager.getItemProperties(modelID, eid, true);
    if (props) (window as any).showProps?.(props, idx);
  } catch { /* properties are best-effort */ }
  try {
    (window as any).clearHighlight?.();
    if (!(window as any)._hlMat) (window as any)._hlMat = new THREE.MeshPhongMaterial({ color: 0x2563eb, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: appState.clipPlanes });
    const sub = appState.ifcLoader.ifcManager.createSubset({ modelID, ids: [eid], material: (window as any)._hlMat, scene: appState.scene, removePrevious: true, customID: 'userHighlight' });
    if (sub) { sub.position.copy(model.position); sub.updateMatrixWorld(true); (window as any)._lastHL = { subset: sub, mid: modelID }; }
  } catch { /* highlight is best-effort */ }
  const bbox = getElementBBox(idx, eid);
  if (bbox?.center) {
    const size = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
    const d = Math.max(size * 2.5, 3);
    appState.camera.position.set(bbox.center.x + d * 0.5, bbox.center.y + d * 0.4, bbox.center.z + d * 0.5);
    appState.controls.target.set(bbox.center.x, bbox.center.y, bbox.center.z);
    appState.controls.update();
  }
}

document.getElementById('ovTree')?.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  const fileRow = target.closest('.ov-file') as HTMLElement | null;
  if (fileRow) {
    const k = fileRow.dataset.filekey!;
    expanded.has(k) ? expanded.delete(k) : expanded.add(k);
    render();
    return;
  }
  const row = target.closest('.ov-row') as HTMLElement | null;
  if (!row) return;
  const idx = Number(row.dataset.slot);
  const key = row.dataset.key!;
  const kind = row.dataset.kind;
  if (kind === 'element') {
    document.querySelectorAll('#ovTree .ov-row.sel').forEach(el => el.classList.remove('sel'));
    row.classList.add('sel');
    void pickElement(idx, Number(row.dataset.eid));
    return;
  }
  // spatial / group rows toggle expansion
  const wasOpen = expanded.has(key);
  wasOpen ? expanded.delete(key) : expanded.add(key);
  if (!wasOpen && kind === 'group') {
    const entry = slotTrees.get(idx);
    if (entry?.root) {
      const g = findNode(entry.root, key);
      if (g) void fetchGroupNames(idx, g);
    }
  }
  render();
});

window.ovSearchInput = function (): void {
  query = (document.getElementById('ovSearch') as HTMLInputElement | null)?.value || '';
  render();
};

// Project switch tears models down — reset the tab's state with it.
window.addEventListener('ifc:projectchange', () => {
  slotTrees.clear(); expanded.clear(); namesRequested.clear(); query = '';
  const q = document.getElementById('ovSearch') as HTMLInputElement | null;
  if (q) q.value = '';
  generation++;
  render();
});
