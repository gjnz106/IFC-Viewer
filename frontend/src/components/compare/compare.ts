import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

// ── NOTE: This module is the continuation of doCompare() (which starts in
//    08-federation-load.js / federation-load.ts) PLUS the compare-mode UI
//    functions. In the original build system these two source files are
//    concatenated into one shared module scope.  In the TypeScript port the
//    doCompare body has been moved here as the exported runCompare helper
//    wraps it. All shared globals are accessed via appState.* ──

// ── Compute geometry hashes for both models ──
// (called from runCompare / doCompare; kept here because it reads scene)
function computeGeometryHashes(modelIdx: number): Record<number, any> {
  const hashes: Record<number, any> = {};
  const model = appState.loadedModels[modelIdx];
  if (!model) return hashes;

  model.traverse((c: any) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    const eidArr = c.geometry.attributes.expressID.array;
    const posArr = c.geometry.attributes.position.array;
    const wm = c.matrixWorld;
    const v = new THREE.Vector3();

    // Group vertices by expressID
    const eidVerts: Record<number, any> = {};
    for (let i = 0; i < eidArr.length; i++) {
      const eid = eidArr[i];
      if (!eid || eid <= 0) continue;
      if (!eidVerts[eid]) eidVerts[eid] = { verts: [], count: 0, mnX: Infinity, mnY: Infinity, mnZ: Infinity, mxX: -Infinity, mxY: -Infinity, mxZ: -Infinity };
      const ev = eidVerts[eid];
      const pi = i * 3;
      if (pi + 2 >= posArr.length) continue;
      const x = posArr[pi], y = posArr[pi + 1], z = posArr[pi + 2];
      if (isNaN(x)) continue;
      ev.count++;
      // Track bounding box
      if (x < ev.mnX) ev.mnX = x; if (x > ev.mxX) ev.mxX = x;
      if (y < ev.mnY) ev.mnY = y; if (y > ev.mxY) ev.mxY = y;
      if (z < ev.mnZ) ev.mnZ = z; if (z > ev.mxZ) ev.mxZ = z;
      // Sample some vertices for hash (not all — too slow for large models)
      if (ev.verts.length < 50) ev.verts.push(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    }

    // Build hash per expressID
    for (const [eid, ev] of Object.entries(eidVerts)) {
      const sx = (ev.mxX - ev.mnX).toFixed(2);
      const sy = (ev.mxY - ev.mnY).toFixed(2);
      const sz = (ev.mxZ - ev.mnZ).toFixed(2);
      const cx = ((ev.mnX + ev.mxX) / 2).toFixed(2);
      const cy = ((ev.mnY + ev.mxY) / 2).toFixed(2);
      const cz = ((ev.mnZ + ev.mxZ) / 2).toFixed(2);

      // Hash combines: vertex count + sampled vertex positions + bbox
      const hashStr = ev.verts.join(',') + `|${ev.count}|${sx},${sy},${sz}`;
      let hash = 0;
      for (let i = 0; i < hashStr.length; i++) { hash = ((hash << 5) - hash) + hashStr.charCodeAt(i); hash |= 0; }

      hashes[parseInt(eid)] = {
        vertCount: ev.count,
        hash: hash,
        bboxStr: `${sx}×${sy}×${sz} @(${cx},${cy},${cz})`,
        size: { x: parseFloat(sx), y: parseFloat(sy), z: parseFloat(sz) },
        center: { x: parseFloat(cx), y: parseFloat(cy), z: parseFloat(cz) }
      };
    }
  });

  return hashes;
}

function doCompare(a: Record<string, any>, b: Record<string, any>): any {
  const added: any[] = [], removed: any[] = [], modified: any[] = [], unchanged: any[] = [];

  // ── Compute geometry hashes for both models ──
  const geoHashA = computeGeometryHashes(0);
  const geoHashB = computeGeometryHashes(1);
  log(`Geometry hashes: A=${Object.keys(geoHashA).length}, B=${Object.keys(geoHashB).length}`);

  // Log sample entries for debugging
  const sampleA = Object.entries(geoHashA).slice(0, 3);
  const sampleB = Object.entries(geoHashB).slice(0, 3);
  sampleA.forEach(([eid, h]: [string, any]) => log(`  GeoHash A #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));
  sampleB.forEach(([eid, h]: [string, any]) => log(`  GeoHash B #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));

  // ── Phase 1: Match by GlobalId (exact) ──
  const allGids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const unmatchedA: any[] = [];
  const unmatchedB: any[] = [];

  for (const gid of allGids) {
    const ea = a[gid], eb = b[gid];
    if (ea && eb) {
      const d: any[] = [];
      if (ea.name !== eb.name) d.push({ prop: 'Name', oldVal: ea.name || '(empty)', newVal: eb.name || '(empty)' });
      if (ea.type !== eb.type) d.push({ prop: 'Type', oldVal: ea.type, newVal: eb.type });
      if (ea.description !== eb.description) d.push({ prop: 'Description', oldVal: ea.description || '—', newVal: eb.description || '—' });
      if (ea.objectType !== eb.objectType) d.push({ prop: 'ObjectType', oldVal: ea.objectType || '—', newVal: eb.objectType || '—' });
      if (ea.tag !== eb.tag) d.push({ prop: 'Element ID', oldVal: ea.tag || '—', newVal: eb.tag || '—' });

      // ── Geometry comparison with tolerance ──
      const ghA = geoHashA[ea.expressID];
      const ghB = geoHashB[eb.expressID];
      if (ghA && ghB) {
        // Vertex count change > 5% = geometry change
        const vcA = ghA.vertCount, vcB = ghB.vertCount;
        const vcDiff = Math.abs(vcA - vcB) / Math.max(vcA, vcB, 1);
        if (vcDiff > 0.05) {
          d.push({ prop: 'Geometry (vertices)', oldVal: String(vcA), newVal: String(vcB) });
        }

        // Bounding box size change > 0.5% = significant
        const sA = ghA.size, sB = ghB.size;
        if (sA && sB) {
          const maxDim = Math.max(sA.x, sA.y, sA.z, sB.x, sB.y, sB.z, 0.01);
          const dxS = Math.abs(sA.x - sB.x) / maxDim;
          const dyS = Math.abs(sA.y - sB.y) / maxDim;
          const dzS = Math.abs(sA.z - sB.z) / maxDim;
          if (dxS > 0.005 || dyS > 0.005 || dzS > 0.005) {
            d.push({ prop: 'Size Changed', oldVal: `${sA.x.toFixed(3)}×${sA.y.toFixed(3)}×${sA.z.toFixed(3)}`, newVal: `${sB.x.toFixed(3)}×${sB.y.toFixed(3)}×${sB.z.toFixed(3)}` });
          }

          // Position change > 0.01 units (10mm) = moved
          const cA = ghA.center, cB = ghB.center;
          if (cA && cB) {
            const posDist = Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2 + (cA.z - cB.z) ** 2);
            if (posDist > 0.01) {
              d.push({ prop: 'Position Moved', oldVal: `(${cA.x.toFixed(3)},${cA.y.toFixed(3)},${cA.z.toFixed(3)})`, newVal: `(${cB.x.toFixed(3)},${cB.y.toFixed(3)},${cB.z.toFixed(3)})`, distance: (posDist * 1000).toFixed(0) + 'mm' });
            }
          }
        }

        // Hash comparison — catches any vertex-level change not covered by bbox
        if (ghA.hash !== ghB.hash && d.length === 0) {
          d.push({ prop: 'Geometry Changed', oldVal: 'hash:' + ghA.hash, newVal: 'hash:' + ghB.hash });
        }
      }

      d.length ? modified.push({ gid, a: ea, b: eb, status: 'modified', diffs: d }) : unchanged.push({ gid, a: ea, b: eb, status: 'unchanged' });
    } else if (ea && !eb) {
      unmatchedA.push(ea);
    } else if (!ea && eb) {
      unmatchedB.push(eb);
    }
  }

  log(`Phase1 (GlobalId+Geometry): modified=${modified.length}, unchanged=${unchanged.length}, unmatchedA=${unmatchedA.length}, unmatchedB=${unmatchedB.length}`);

  // Diagnostic: how many matched pairs had geometry data
  let geoFoundBoth = 0, geoMissingA = 0, geoMissingB = 0, geoMissingBoth = 0;
  [...modified, ...unchanged].forEach(e => {
    const hA = geoHashA[e.a.expressID], hB = geoHashB[e.b.expressID];
    if (hA && hB) geoFoundBoth++;
    else if (!hA && !hB) geoMissingBoth++;
    else if (!hA) geoMissingA++;
    else geoMissingB++;
  });
  log(`  Geo data: both=${geoFoundBoth}, missingA=${geoMissingA}, missingB=${geoMissingB}, missingBoth=${geoMissingBoth}`);

  // ── Phase 2: Smart match unmatched by Type + Name ──
  // When Revit modifies/moves an element, it often creates a new GlobalId.
  // We detect this by matching: same Type + same/similar Name → Modified (with new GlobalId)
  const modifiedBeforePhase2 = modified.length;
  const matchedA = new Set<number>();
  const matchedB = new Set<number>();

  for (let i = 0; i < unmatchedA.length; i++) {
    if (matchedA.has(i)) continue;
    const ea = unmatchedA[i];

    // Find best match in B: same type + same name (or similar name)
    let bestIdx = -1;
    let bestScore = 0;

    for (let j = 0; j < unmatchedB.length; j++) {
      if (matchedB.has(j)) continue;
      const eb = unmatchedB[j];

      // Must be same type
      if (ea.type !== eb.type) continue;

      let score = 0;

      // Exact name match = strong signal
      if (ea.name && eb.name && ea.name === eb.name) score += 10;
      // Same objectType
      if (ea.objectType && eb.objectType && ea.objectType === eb.objectType) score += 5;
      // Same tag (Revit ElementId) = very strong signal
      if (ea.tag && eb.tag && ea.tag === eb.tag) score += 20;
      // Similar name (contains same base name)
      if (ea.name && eb.name) {
        const baseA = ea.name.replace(/[:\-\.]\d+$/, '').trim();
        const baseB = eb.name.replace(/[:\-\.]\d+$/, '').trim();
        if (baseA && baseB && baseA === baseB) score += 8;
      }

      if (score > bestScore) { bestScore = score; bestIdx = j; }
    }

    // If we found a good match (score >= 5), treat as Modified
    if (bestIdx >= 0 && bestScore >= 5) {
      const eb = unmatchedB[bestIdx];
      matchedA.add(i);
      matchedB.add(bestIdx);

      const d: any[] = [];
      d.push({ prop: 'GlobalId', oldVal: ea.globalId, newVal: eb.globalId });
      if (ea.name !== eb.name) d.push({ prop: 'Name', oldVal: ea.name || '(empty)', newVal: eb.name || '(empty)' });
      if (ea.tag !== eb.tag) d.push({ prop: 'Element ID', oldVal: ea.tag || '—', newVal: eb.tag || '—' });
      if (ea.description !== eb.description) d.push({ prop: 'Description', oldVal: ea.description || '—', newVal: eb.description || '—' });

      modified.push({
        gid: eb.globalId, a: ea, b: eb, status: 'modified',
        diffs: d.length > 0 ? d : [{ prop: 'Element', oldVal: 'Recreated', newVal: 'New GlobalId assigned' }]
      });
    }
  }

  // ── Phase 3: Remaining unmatched → truly Added or Removed ──
  for (let i = 0; i < unmatchedA.length; i++) {
    if (!matchedA.has(i)) {
      removed.push({ gid: unmatchedA[i].globalId, entity: unmatchedA[i], status: 'removed' });
    }
  }
  for (let j = 0; j < unmatchedB.length; j++) {
    if (!matchedB.has(j)) {
      added.push({ gid: unmatchedB[j].globalId, entity: unmatchedB[j], status: 'added' });
    }
  }

  log(`Phase2 (smart match): +${modified.length - modifiedBeforePhase2} modified via Type+Name`);
  log(`Final: added=${added.length}, removed=${removed.length}, modified=${modified.length}, unchanged=${unchanged.length}`);

  return { added, removed, modified, unchanged };
}

export function runCompare(a: Record<string, any>, b: Record<string, any>): any {
  const result = doCompare(a, b);
  appState.compareResult = result;
  return result;
}

window.resetSection = function () {
  ['slXp', 'slYp', 'slZp'].forEach(id => { (document.getElementById(id) as HTMLInputElement).value = '100'; });
  ['slXn', 'slYn', 'slZn'].forEach(id => { (document.getElementById(id) as HTMLInputElement).value = '0'; });
  (window as any).updateSectionFromSliders?.();
};

// Auto-focus section box on changed elements
window.focusSectionOnChanges = function () {
  if (!appState.compareResult) return;
  const r = appState.compareResult;

  // Collect expressIDs of all changed elements
  const changedIDs = new Set<number>();
  r.added.forEach((e: any) => changedIDs.add(e.entity.expressID));
  r.removed.forEach((e: any) => changedIDs.add(e.entity.expressID));
  r.modified.forEach((e: any) => { changedIDs.add(e.a.expressID); changedIDs.add(e.b.expressID); });

  if (changedIDs.size === 0) { log('No changes to focus on'); return; }

  // Find bounding box of changed elements by scanning diff subsets
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  let found = false;

  appState.scene.traverse((c: any) => {
    if (!c.isMesh || !c.userData?.diffSubset) return;
    if (c.userData.diffSubset === 'unchanged-b' || c.userData.diffSubset === 'unchanged-b_cat') return;
    if (!c.geometry?.attributes?.position) return;

    const pos = c.geometry.attributes.position.array;
    const wm = c.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      if (isNaN(pos[i])) continue;
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(wm);
      if (isNaN(v.x)) continue;
      if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
      if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
      if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
      found = true;
    }
  });

  if (!found) { log('Could not compute bounds of changes'); return; }

  // Add padding around the changes (10% of model size on each side)
  const b = appState.modelBounds;
  const padX = (b.max.x - b.min.x) * 0.05;
  const padY = (b.max.y - b.min.y) * 0.05;
  const padZ = (b.max.z - b.min.z) * 0.05;
  mnX -= padX; mnY -= padY; mnZ -= padZ;
  mxX += padX; mxY += padY; mxZ += padZ;

  // Convert world coords to slider percentages (0-100)
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSlider = (val: number, mn: number, range: number) => Math.max(0, Math.min(100, Math.round(((val - mn) / range) * 100)));

  (document.getElementById('slXp') as HTMLInputElement).value = String(toSlider(mxX, b.min.x, sx));
  (document.getElementById('slXn') as HTMLInputElement).value = String(toSlider(mnX, b.min.x, sx));
  (document.getElementById('slYp') as HTMLInputElement).value = String(toSlider(mxY, b.min.y, sy));
  (document.getElementById('slYn') as HTMLInputElement).value = String(toSlider(mnY, b.min.y, sy));
  (document.getElementById('slZp') as HTMLInputElement).value = String(toSlider(mxZ, b.min.z, sz));
  (document.getElementById('slZn') as HTMLInputElement).value = String(toSlider(mnZ, b.min.z, sz));

  // Activate section box if not already
  if (!appState.sectionActive) {
    appState.sectionActive = true;
    document.getElementById('sectionPanel')?.classList.add('show');
    document.getElementById('btnSection')?.classList.add('active');
    (window as any).createSectionBox3D?.();
  }

  (window as any).updateSectionFromSliders?.();

  // Zoom camera to the changes area
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;
  const maxDim = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ) * 1.5;
  appState.camera.position.set(cx + maxDim * 0.6, cy + maxDim * 0.5, cz + maxDim * 0.6);
  appState.controls.target.set(cx, cy, cz);
  appState.controls.update();

  log(`Focused on changes: (${mnX.toFixed(1)},${mnY.toFixed(1)},${mnZ.toFixed(1)}) → (${mxX.toFixed(1)},${mxY.toFixed(1)},${mxZ.toFixed(1)})`);
};

function colorModel(m: any, color: number, opacity: number) { m.traverse((c: any) => { if (c.isMesh) { const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach((mt: any) => { mt.color = new THREE.Color(color); mt.transparent = true; mt.opacity = opacity; mt.needsUpdate = true; }); } }); }

function showResultsUI() {
  const r = appState.compareResult;
  document.getElementById('sumStrip')?.classList.add('show');
  document.getElementById('searchW')?.classList.add('show');
  document.getElementById('filterB')?.classList.add('show');
  document.getElementById('catFilter')?.classList.add('show');
  document.getElementById('vpLegend')?.classList.add('show');
  const btnExport = document.getElementById('btnExport');
  if (btnExport) btnExport.style.display = '';
  const btnExportBCF = document.getElementById('btnExportBCF');
  if (btnExportBCF) btnExportBCF.style.display = '';
  const btnExitCompare = document.getElementById('btnExitCompare');
  if (btnExitCompare) btnExitCompare.style.display = '';
  const sA = document.getElementById('sA'); if (sA) sA.textContent = '+' + r.added.length;
  const sR = document.getElementById('sR'); if (sR) sR.textContent = '−' + r.removed.length;
  const sM = document.getElementById('sM'); if (sM) sM.textContent = '~' + r.modified.length;
  const sU = document.getElementById('sU'); if (sU) sU.textContent = String(r.unchanged.length);
  appState.activeFilter = 'all';
  appState.activeCategories = new Set();
  document.querySelectorAll('.fchip').forEach((c: any) => c.classList.toggle('on', c.dataset.f === 'all'));

  // Update catData with diff status counts
  const allItems = [...r.added, ...r.removed, ...r.modified, ...r.unchanged];
  // Reset diff counts but keep totals from model scan
  Object.values((window as any)._catData || {}).forEach((d: any) => { d.added = 0; d.removed = 0; d.modified = 0; });
  allItems.forEach((e: any) => {
    const en = e.entity || e.a || e.b;
    const t = en?.type || 'Unknown';
    if (!(window as any)._catData[t]) (window as any)._catData[t] = { total: 0, added: 0, removed: 0, modified: 0 };
    if (e.status === 'added') (window as any)._catData[t].added++;
    if (e.status === 'removed') (window as any)._catData[t].removed++;
    if (e.status === 'modified') (window as any)._catData[t].modified++;
  });

  buildCatDropdown();
  updateCatTags();
  renderTree();
  (window as any).buildIssues?.();
}

// ══ Tree ══
export function renderTree() {
  const r = appState.compareResult; if (!r) return;
  const q = ((document.getElementById('searchIn') as HTMLInputElement)?.value || '').toLowerCase();
  let items: any[] = [];
  if (appState.activeFilter === 'all' || appState.activeFilter === 'added') items.push(...r.added);
  if (appState.activeFilter === 'all' || appState.activeFilter === 'removed') items.push(...r.removed);
  if (appState.activeFilter === 'all' || appState.activeFilter === 'modified') items.push(...r.modified);
  if (appState.activeFilter === 'all' || appState.activeFilter === 'unchanged') items.push(...r.unchanged);

  // Category filter
  if (appState.activeCategories.size > 0) {
    items = items.filter(e => { const en = e.entity || e.a || e.b; return appState.activeCategories.has(en?.type || 'Unknown'); });
  }

  if (q) items = items.filter(e => { const en = e.entity || e.a || e.b; return (en?.name || '').toLowerCase().includes(q) || (en?.type || '').toLowerCase().includes(q) || (e.gid || '').toLowerCase().includes(q); });

  const groups: Record<string, any[]> = {};
  items.forEach(e => { const en = e.entity || e.a || e.b; const t = en?.type || 'Unknown'; (groups[t] = groups[t] || []).push(e); });
  const sorted = Object.keys(groups).sort((a, b) => { const ac = groups[a].some(e => e.status !== 'unchanged'), bc = groups[b].some(e => e.status !== 'unchanged'); if (ac !== bc) return (bc ? 1 : 0) - (ac ? 1 : 0); return groups[b].length - groups[a].length; });

  let html = '';
  for (const type of sorted) {
    const list = groups[type];
    const na = list.filter(e => e.status === 'added').length, nr = list.filter(e => e.status === 'removed').length, nm = list.filter(e => e.status === 'modified').length;
    const badges = [na ? `<span class="tg-b ba">+${na}</span>` : '', nr ? `<span class="tg-b br">−${nr}</span>` : '', nm ? `<span class="tg-b bm">~${nm}</span>` : ''].filter(Boolean).join('');
    const col = appState.activeFilter === 'all' && list.length > 20 && !list.some(e => e.status !== 'unchanged');
    html += `<div><div class="tg-hdr" onclick="togG(this)"><span class="tg-arr${col ? ' col' : ''}">▼</span><span class="tg-n">${type} (${list.length})</span>${badges}</div><div class="tg-items${col ? ' col' : ''}">`;
    list.slice(0, 150).forEach(e => { const en = e.entity || e.a || e.b;
      html += `<div class="ti" data-g="${e.gid}" onclick="selI('${e.gid}')"><div class="ti-dot ${e.status}"></div><span class="ti-nm">${en?.name || '(unnamed)'}</span><span class="ti-id">${e.status}</span></div>`;
    });
    if (list.length > 150) html += `<div style="padding:4px 26px;font-size:12px;color:var(--text-muted)">+${list.length - 150} more</div>`;
    html += '</div></div>';
  }
  const eTree = document.getElementById('eTree');
  if (eTree) eTree.innerHTML = html || `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">${items.length === 0 ? 'No changes found for this filter' : 'No match'}</div>`;
}
window.renderTree = renderTree;
window.togG = function (h: HTMLElement) { h.querySelector('.tg-arr')?.classList.toggle('col'); h.nextElementSibling?.classList.toggle('col'); };
window.selI = function (gid: string) {
  const r = appState.compareResult, all = [...r.added, ...r.removed, ...r.modified, ...r.unchanged];
  const item = all.find(e => e.gid === gid); if (!item) return;
  document.querySelectorAll('.ti').forEach(e => e.classList.remove('sel'));
  const el = document.querySelector(`.ti[data-g="${gid}"]`); if (el) { el.classList.add('sel'); el.scrollIntoView({ block: 'nearest' }); }
  const ent = item.entity || item.a || item.b;
  showEntityProps(item, ent);
};

function showEntityProps(item: any, ent: any) {
  const c: Record<string, string> = { added: 'var(--green)', removed: 'var(--red)', modified: 'var(--amber)', unchanged: 'var(--indigo)' };
  const bg: Record<string, string> = { added: 'var(--green-lt)', removed: 'var(--red-lt)', modified: 'var(--amber-lt)', unchanged: 'var(--blue-lt)' };
  let h = `<div style="padding:8px 12px;background:${bg[item.status]};border-bottom:1px solid var(--border)"><span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${c[item.status]}">${item.status.toUpperCase()}</span></div>
  <div class="ps"><div class="ps-t">Identity</div>
  <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${ent?.globalId || '—'}</div></div>
  <div class="pr"><div class="pk">Type</div><div class="pv">${ent?.type || '—'}</div></div>
  <div class="pr"><div class="pk">Name</div><div class="pv">${ent?.name || '—'}</div></div>
  <div class="pr"><div class="pk">Tag</div><div class="pv">${ent?.tag || '—'}</div></div></div>`;
  if (item.diffs) {
    h += `<div class="ps"><div class="ps-t">Changes (${item.diffs.length})</div>`;
    item.diffs.forEach((d: any) => { h += `<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`; });
    h += '</div>';
  }
  const propArea = document.getElementById('propArea');
  if (propArea) propArea.innerHTML = h;
}

window.setFilter = function (f: string) {
  appState.activeFilter = f;
  document.querySelectorAll('.fchip').forEach((c: any) => c.classList.toggle('on', c.dataset.f === f));
  renderTree();
  // Also filter issues list
  filterIssuesList();
};

export function filterIssuesList() {
  document.querySelectorAll('.issue-card').forEach((card: any) => {
    if (appState.activeFilter === 'all') { card.style.display = ''; return; }
    const status = card.querySelector('.issue-status');
    if (status) {
      const s = status.textContent.toLowerCase();
      card.style.display = (s === appState.activeFilter) ? '' : 'none';
    }
  });
  // Update nav count
  const visible = document.querySelectorAll('.issue-card:not([style*="display: none"])');
  const issueNavInfo = document.getElementById('issueNavInfo');
  if (issueNavInfo) issueNavInfo.textContent = visible.length + ' issues';
}

window.switchTab = function (tab: string) {
  const tabs = document.querySelectorAll('.ptab');
  tabs.forEach((t: any, i: number) => t.classList.toggle('on', (tab === 'tree' && i === 0) || (tab === 'issues' && i === 1) || (tab === 'search' && i === 2)));
  const eTree = document.getElementById('eTree');
  if (eTree) eTree.style.display = tab === 'tree' ? '' : 'none';
  document.getElementById('issuesList')?.classList.toggle('show', tab === 'issues');
  document.getElementById('issueNav')?.classList.toggle('show', tab === 'issues');
  document.getElementById('searchPanel')?.classList.toggle('show', tab === 'search');
  if (tab === 'search') (window as any).searchInit?.();
};

export function buildIssues() {
  if (!appState.compareResult) return;
  const r = appState.compareResult;
  appState.issuesList = [];
  let num = 1;

  // Each changed element = 1 issue
  r.added.forEach((e: any) => {
    const en = e.entity;
    appState.issuesList.push({
      num: num++, status: 'added', gid: e.gid,
      name: en.name || '(unnamed)', type: en.type, tag: en.tag || '',
      detail: 'New element in Version B',
      expressID: en.expressID, modelIdx: 1,
      diffs: null
    });
  });
  r.removed.forEach((e: any) => {
    const en = e.entity;
    appState.issuesList.push({
      num: num++, status: 'removed', gid: e.gid,
      name: en.name || '(unnamed)', type: en.type, tag: en.tag || '',
      detail: 'Removed from Version A',
      expressID: en.expressID, modelIdx: 0,
      diffs: null
    });
  });
  r.modified.forEach((e: any) => {
    const en = e.b || e.a;
    const details = e.diffs.map((d: any) => `${d.prop}: ${d.oldVal} → ${d.newVal}`).join(', ');
    appState.issuesList.push({
      num: num++, status: 'modified', gid: e.gid,
      name: en.name || '(unnamed)', type: en.type, tag: en.tag || '',
      detail: details,
      expressID: en.expressID, modelIdx: 1,
      diffs: e.diffs
    });
  });

  const issueCount = document.getElementById('issueCount');
  if (issueCount) issueCount.textContent = String(appState.issuesList.length);

  // Render issue cards
  let html = '';
  if (appState.issuesList.length === 0) {
    html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">No changes detected</div>';
  } else {
    appState.issuesList.forEach((iss: any, i: number) => {
      html += `<div class="issue-card" id="issue-${i}" onclick="focusIssue(${i})">
        <div class="issue-hdr">
          <span class="issue-num">#${iss.num}</span>
          <span class="issue-status ${iss.status}">${iss.status.toUpperCase()}</span>
          <span class="issue-type">${(iss.type || '').replace('Ifc', '')}</span>
        </div>
        <div class="issue-name">${iss.name}</div>
        <div class="issue-detail">${iss.detail}</div>
      </div>`;
    });
  }
  const issuesList = document.getElementById('issuesList');
  if (issuesList) issuesList.innerHTML = html;
  document.getElementById('panelTabs')?.classList.add('show');

  // Always switch to issues tab after compare
  window.switchTab?.('issues');
}
window.buildIssues = buildIssues;

// ══ Category Dropdown ══
window.toggleCatDropdown = function () {
  const dd = document.getElementById('catDropdown');
  const btn = document.getElementById('catBtn');
  const isOpen = dd?.classList.contains('open');
  dd?.classList.toggle('open');
  btn?.classList.toggle('open');
  if (!isOpen) (document.getElementById('catSearch') as HTMLInputElement)?.focus();
};

// Close dropdown when clicking outside
document.addEventListener('click', (e: Event) => {
  const dd = document.getElementById('catDropdown');
  const btn = document.getElementById('catBtn');
  if (dd && !dd.contains(e.target as Node) && !btn?.contains(e.target as Node)) {
    dd.classList.remove('open');
    btn?.classList.remove('open');
  }
});

function buildCatDropdown(filter = '') {
  const data = (window as any)._catData || {};
  const sorted = Object.entries(data).sort((a: any, b: any) => b[1].total - a[1].total);
  const q = filter.toLowerCase();
  let html = '';
  sorted.forEach(([cat, info]: [string, any]) => {
    const name = cat.replace('Ifc', '').replace('IFC_', '');
    if (q && !name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) return;
    const checked = appState.activeCategories.size === 0 || appState.activeCategories.has(cat) ? 'checked' : '';
    const changes: string[] = [];
    if (info.added) changes.push(`<span class="cat-dd-ch a">+${info.added}</span>`);
    if (info.removed) changes.push(`<span class="cat-dd-ch r">−${info.removed}</span>`);
    if (info.modified) changes.push(`<span class="cat-dd-ch m">~${info.modified}</span>`);
    html += `<label class="cat-dd-item"><input type="checkbox" class="cat-dd-cb" data-cat="${cat}" ${checked} onchange="onCatCheck()"><span class="cat-dd-name">${name}</span><span class="cat-dd-changes">${changes.join('')}</span><span class="cat-dd-count">${info.total}</span></label>`;
  });
  const catList = document.getElementById('catList');
  if (catList) catList.innerHTML = html;
}

window.filterCatDropdown = function () {
  buildCatDropdown((document.getElementById('catSearch') as HTMLInputElement).value);
};

window.onCatCheck = function () {
  const boxes = document.querySelectorAll('.cat-dd-cb');
  const checked = new Set<string>();
  boxes.forEach((b: any) => { if (b.checked) checked.add(b.dataset.cat); });

  // If all checked → treat as no filter
  const allCats = Object.keys((window as any)._catData || {});
  if (checked.size === allCats.length || checked.size === 0) {
    appState.activeCategories = new Set();
  } else {
    appState.activeCategories = checked;
  }
  updateCatTags();
  renderTree();
  applyCatVis();
};

window.catSelectAll = function () {
  document.querySelectorAll('.cat-dd-cb').forEach((b: any) => b.checked = true);
  appState.activeCategories = new Set();
  updateCatTags();
  renderTree();
  applyCatVis();
};

window.catSelectNone = function () {
  document.querySelectorAll('.cat-dd-cb').forEach((b: any) => b.checked = false);
  appState.activeCategories = new Set(['__none__']); // Special: hide everything
  updateCatTags();
  renderTree();
  applyCatVis();
};

window.catSelectChanged = function () {
  const data = (window as any)._catData || {};
  document.querySelectorAll('.cat-dd-cb').forEach((b: any) => {
    const info = data[b.dataset.cat];
    b.checked = info && (info.added > 0 || info.removed > 0 || info.modified > 0);
  });
  (window as any).onCatCheck?.();
};

function updateCatTags() {
  const tags = document.getElementById('catTags');
  if (!tags) return;
  if (appState.activeCategories.size === 0) {
    tags.innerHTML = '<span style="color:var(--text-muted);font-size:13px">All categories</span>';
    return;
  }
  if (appState.activeCategories.has('__none__')) {
    tags.innerHTML = '<span style="color:var(--red);font-size:13px">None selected</span>';
    return;
  }
  let html = '';
  appState.activeCategories.forEach(cat => {
    const name = cat.replace('Ifc', '').replace('IFC_', '');
    html += `<span class="cat-tag">${name}<span class="tag-x" onclick="event.stopPropagation();removeCatTag('${cat}')">×</span></span>`;
  });
  tags.innerHTML = html;
}

window.removeCatTag = function (cat: string) {
  appState.activeCategories.delete(cat);
  if (appState.activeCategories.size === 0) {
    document.querySelectorAll('.cat-dd-cb').forEach((b: any) => b.checked = true);
  } else {
    document.querySelectorAll('.cat-dd-cb').forEach((b: any) => b.checked = appState.activeCategories.has(b.dataset.cat));
  }
  updateCatTags();
  renderTree();
  applyCatVis();
};

// ══ Model Visibility Toggle ══
window.toggleModelVis = function (idx: number) {
  const vis = (document.getElementById(idx === 0 ? 'visA' : 'visB') as HTMLInputElement).checked;
  log('toggleModelVis: model ' + idx + ' → ' + vis);

  if (appState.compareResult) {
    applyCatVis();
  } else {
    if (appState.loadedModels[idx]) (appState.loadedModels[idx] as any).visible = vis;
    // Also toggle any subsets belonging to this model
    (window as any).viewSubsets?.forEach((s: any) => { if (s.userData?.srcModelIdx === idx) s.visible = vis; });
    (window as any).visSubsets?.forEach((s: any) => { if (s.userData?.srcModelIdx === idx) s.visible = vis; });
    // Colorize subsets are created per-value with srcModelIdx tag — toggle
    // them too so un-checking Version A actually hides the colored model A
    // elements (fixes the bug where ColorizeA elements stayed visible after
    // un-checking).
    if (appState.colorize && appState.colorize.subsets) {
      appState.colorize.subsets.forEach((s: any) => { if (s.userData?.srcModelIdx === idx) s.visible = vis; });
    }
    (window as any).applyCategoryVisibilityViewMode?.();
  }
};

// ══ 3D Category Visibility — rebuild subsets ══
// Route to correct visibility handler
export function applyCatVis() {
  if (appState.compareResult) applyCategoryVisibility3D();
  else (window as any).applyCategoryVisibilityViewMode?.();
}

// ══ 3D Category Visibility — rebuild subsets (compare mode) ══
export function applyCategoryVisibility3D() {
  if (!appState.ifcLoader || !appState.compareResult) return;
  const r = appState.compareResult;
  const showAll = appState.activeCategories.size === 0;
  const showNone = appState.activeCategories.has('__none__');

  // Remove old diff subsets
  const toRemove: any[] = [];
  appState.scene.traverse((c: any) => { if (c.isMesh && c.userData?.diffSubset) toRemove.push(c); });
  toRemove.forEach(c => { if (c.parent) c.parent.remove(c); });

  const filterByCat = (items: any[]) => {
    if (showNone) return [];
    if (showAll) return items;
    return items.filter(e => { const en = e.entity || e.a || e.b; return appState.activeCategories.has(en?.type || 'Unknown'); });
  };

  const matAdd = new THREE.MeshPhongMaterial({ color: 0x16a34a, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matRem = new THREE.MeshPhongMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matMod = new THREE.MeshPhongMaterial({ color: 0xf59e0b, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matUnch = new THREE.MeshPhongMaterial({ color: 0xd1d5db, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: appState.clipPlanes });

  const makeSub = (mi: number, ids: number[], mat: any, name: string) => {
    if (!ids.length || !appState.loadedModels[mi]) return;
    try {
      const sub = (appState.ifcLoader as any).ifcManager.createSubset({ modelID: (appState.loadedModels[mi] as any).modelID, ids, material: mat, scene: appState.scene, removePrevious: false, customID: name + '_cat' });
      if (sub) {
        sub.position.copy((appState.loadedModels[mi] as any).position);
        sub.updateMatrixWorld(true);
        sub.userData.diffSubset = name;
        sub.userData.srcModelIdx = mi;
        sub.visible = (document.getElementById(mi === 0 ? 'visA' : 'visB') as HTMLInputElement).checked;
      }
    } catch (e) { }
  };

  const fA = filterByCat(r.added), fR = filterByCat(r.removed), fM = filterByCat(r.modified), fU = filterByCat(r.unchanged);
  makeSub(1, fA.map((e: any) => e.entity.expressID), matAdd, 'added');
  makeSub(0, fR.map((e: any) => e.entity.expressID), matRem, 'removed');
  makeSub(1, fM.map((e: any) => e.b.expressID), matMod, 'modified-b');
  makeSub(1, fU.map((e: any) => e.b.expressID), matUnch, 'unchanged-b');

  // Base models: in compare mode, model A shows only "removed" subsets.
  // Base mesh is hidden but subsets handle visibility via srcModelIdx check above.
  // Respect user checkbox for base model visibility
  const visAChecked = (document.getElementById('visA') as HTMLInputElement).checked;
  const visBChecked = (document.getElementById('visB') as HTMLInputElement).checked;

  // Model A: if user ticked it, show as faded red overlay so they can see the old version
  if (appState.loadedModels[0]) {
    (appState.loadedModels[0] as any).visible = visAChecked && !showNone;
    if (visAChecked) {
      appState.loadedModels[0].traverse((c: any) => {
        if (c.isMesh) {
          c.visible = true;
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m: any) => { m.color = new THREE.Color(0xe8a0a0); m.opacity = 0.12; m.transparent = true; m.depthWrite = false; m.needsUpdate = true; m.clippingPlanes = appState.clipPlanes; });
        }
      });
    }
  }
  // Model B base: very faded background
  if (appState.loadedModels[1]) {
    (appState.loadedModels[1] as any).visible = visBChecked && !showNone;
    appState.loadedModels[1].traverse((c: any) => { if (c.isMesh) { const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach((m: any) => { m.opacity = 0.04; m.transparent = true; m.depthWrite = false; m.needsUpdate = true; }); } });
  }
}

export function renderSummary() {
  showResultsUI();
}

// ── Expose on window for cross-module caller ──
Object.assign(window as any, { showResultsUI });
