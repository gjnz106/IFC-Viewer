import * as THREE from 'three';
import { appState } from '../state/index.js';
import { log } from './ifc-category.js';

// ── Module-level measure state ──
let measureMode: boolean = false;
let measureType: string = 'distance';
let measurePoints: THREE.Vector3[] = [];
let measureMarkers: THREE.Object3D[] = [];
let measureLine: THREE.Line | null = null;
let measureLabel: THREE.Sprite | null = null;

// ── Level mode: single click = show elevation ──
function handleMeasurePoint(point: THREE.Vector3): void {
  if (measureType === 'level') {
    const el = point.y;
    const elMM = (el * 1000).toFixed(0);

    // Draw vertical line from point down to Y=0
    const vPts = [point.clone(), new THREE.Vector3(point.x, 0, point.z)];
    const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
    const vMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.3, gapSize: 0.15, depthTest: false });
    const vLine = new THREE.Line(vGeo, vMat);
    vLine.computeLineDistances();
    vLine.renderOrder = 999;
    appState.scene.add(vLine);
    measureMarkers.push(vLine);

    // Draw horizontal reference line at Y=0
    const refLen = 2;
    const hPts = [new THREE.Vector3(point.x - refLen, 0, point.z), new THREE.Vector3(point.x + refLen, 0, point.z)];
    const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
    const hMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: false });
    const hLine = new THREE.Line(hGeo, hMat);
    hLine.renderOrder = 999;
    appState.scene.add(hLine);
    measureMarkers.push(hLine);

    // Draw horizontal line at point elevation
    const ePts = [new THREE.Vector3(point.x - refLen, el, point.z), new THREE.Vector3(point.x + refLen, el, point.z)];
    const eGeo = new THREE.BufferGeometry().setFromPoints(ePts);
    const eMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false });
    const eLine = new THREE.Line(eGeo, eMat);
    eLine.renderOrder = 999;
    appState.scene.add(eLine);
    measureMarkers.push(eLine);

    // 3D label
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(245,158,11,0.9)';
    ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EL ' + el.toFixed(3) + 'm', 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.set(point.x + 1.5, el, point.z);
    measureLabel.scale.set(2, 0.5, 1);
    measureLabel.renderOrder = 1000;
    appState.scene.add(measureLabel);
    measureMarkers.push(measureLabel); // Track for cleanup

    (document.getElementById('measureText') as HTMLElement).textContent = `📐 EL ${el.toFixed(3)}m (${elMM}mm) | Click another point or Clear`;

    // Allow clicking more points without clearing
    measurePoints = [];
    return;
  }

  // ── Distance mode: 2 points ──
  if (measurePoints.length === 1) {
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click second point';
  }

  if (measurePoints.length === 2) {
    const p1 = measurePoints[0], p2 = measurePoints[1];

    // Draw line between points
    const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 2, depthTest: false });
    measureLine = new THREE.Line(lineGeo, lineMat);
    measureLine.renderOrder = 999;
    appState.scene.add(measureLine);
    measureMarkers.push(measureLine);

    // Draw vertical dashed line for elevation difference
    if (Math.abs(p1.y - p2.y) > 0.01) {
      const vPts = [p2.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
      const vMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const vLine = new THREE.Line(vGeo, vMat);
      vLine.computeLineDistances();
      vLine.renderOrder = 999;
      appState.scene.add(vLine);
      measureMarkers.push(vLine);

      const hPts = [p1.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
      const hMat = new THREE.LineDashedMaterial({ color: 0x16a34a, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const hLine = new THREE.Line(hGeo, hMat);
      hLine.computeLineDistances();
      hLine.renderOrder = 999;
      appState.scene.add(hLine);
      measureMarkers.push(hLine);
    }

    // Calculate distances
    const dist = p1.distanceTo(p2);
    const dy = Math.abs(p2.y - p1.y);
    const hDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);

    (document.getElementById('measureText') as HTMLElement).textContent = `📏 ${dist.toFixed(3)}m | ↕ΔEL ${dy.toFixed(3)}m | ↔ ${hDist.toFixed(3)}m`;

    // 3D label at midpoint
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(37,99,235,0.9)';
    ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(dist.toFixed(3) + ' m', 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.copy(mid).add(new THREE.Vector3(0, 0.3, 0));
    measureLabel.scale.set(dist * 0.3 + 0.8, dist * 0.075 + 0.2, 1);
    measureLabel.renderOrder = 1000;
    appState.scene.add(measureLabel);
    measureMarkers.push(measureLabel); // Track for cleanup

    log('Measure: ' + dist.toFixed(3) + 'm');
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

// ══ Global Opacity ══
window.setGlobalOpacity = function (val: number): void {
  const op = val / 100;
  (document.getElementById('opVal') as HTMLElement).textContent = val + '%';
  appState.scene.traverse((c: any) => {
    if (!c.isMesh || c.parent?.name === 'sectionBox' || c.userData?.isHandle) return;
    if (c.type === 'GridHelper' || c.type === 'AxesHelper') return;
    const ms: any[] = Array.isArray(c.material) ? c.material : [c.material];
    ms.forEach((m: any) => {
      if (!m._origOpacity) m._origOpacity = m.opacity;
      m.opacity = m._origOpacity * op;
      m.transparent = m.opacity < 0.99;
      m.needsUpdate = true;
    });
  });
};

// ══ Storey Filter ══

// ══ Category Dropdown ══
window.toggleCatDropdown = function (): void {
  const dd = document.getElementById('catDropdown')!;
  const btn = document.getElementById('catBtn')!;
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  btn.classList.toggle('open');
  if (!isOpen) (document.getElementById('catSearch') as HTMLInputElement).focus();
};

// Close dropdown when clicking outside
document.addEventListener('click', (e: MouseEvent) => {
  const dd = document.getElementById('catDropdown');
  const btn = document.getElementById('catBtn');
  if (dd && !dd.contains(e.target as Node) && !btn?.contains(e.target as Node)) {
    dd.classList.remove('open');
    btn?.classList.remove('open');
  }
});

function buildCatDropdown(filter: string = ''): void {
  const data: Record<string, any> = (window as any)._catData || {};
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
  (document.getElementById('catList') as HTMLElement).innerHTML = html;
}

window.filterCatDropdown = function (): void {
  buildCatDropdown((document.getElementById('catSearch') as HTMLInputElement).value);
};

window.onCatCheck = function (): void {
  const boxes = document.querySelectorAll<HTMLInputElement>('.cat-dd-cb');
  const checked = new Set<string>();
  boxes.forEach(b => { if (b.checked) checked.add(b.dataset.cat!); });

  // If all checked → treat as no filter
  const allCats = Object.keys((window as any)._catData || {});
  if (checked.size === allCats.length || checked.size === 0) {
    appState.activeCategories = new Set();
  } else {
    appState.activeCategories = checked;
  }
  updateCatTags();
  (window as any).renderTree?.();
  applyCatVis();
};

window.catSelectAll = function (): void {
  document.querySelectorAll<HTMLInputElement>('.cat-dd-cb').forEach(b => b.checked = true);
  appState.activeCategories = new Set();
  updateCatTags();
  (window as any).renderTree?.();
  applyCatVis();
};

window.catSelectNone = function (): void {
  document.querySelectorAll<HTMLInputElement>('.cat-dd-cb').forEach(b => b.checked = false);
  appState.activeCategories = new Set(['__none__']); // Special: hide everything
  updateCatTags();
  (window as any).renderTree?.();
  applyCatVis();
};

window.catSelectChanged = function (): void {
  const data: Record<string, any> = (window as any)._catData || {};
  document.querySelectorAll<HTMLInputElement>('.cat-dd-cb').forEach(b => {
    const info = data[b.dataset.cat!];
    b.checked = info && (info.added > 0 || info.removed > 0 || info.modified > 0);
  });
  window.onCatCheck!();
};

function updateCatTags(): void {
  const tags = document.getElementById('catTags')!;
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

window.removeCatTag = function (cat: string): void {
  appState.activeCategories.delete(cat);
  if (appState.activeCategories.size === 0) {
    document.querySelectorAll<HTMLInputElement>('.cat-dd-cb').forEach(b => b.checked = true);
  } else {
    document.querySelectorAll<HTMLInputElement>('.cat-dd-cb').forEach(b => b.checked = appState.activeCategories.has(b.dataset.cat!));
  }
  updateCatTags();
  (window as any).renderTree?.();
  applyCatVis();
};

// ══ Model Visibility Toggle ══
window.toggleModelVis = function (idx: number): void {
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
function applyCatVis(): void {
  if (appState.compareResult) applyCategoryVisibility3D();
  else (window as any).applyCategoryVisibilityViewMode?.();
}

// ══ 3D Category Visibility — rebuild subsets (compare mode) ══
function applyCategoryVisibility3D(): void {
  if (!appState.ifcLoader || !appState.compareResult) return;
  const r: any = appState.compareResult;
  const showAll = appState.activeCategories.size === 0;
  const showNone = appState.activeCategories.has('__none__');

  // Remove old diff subsets
  const toRemove: THREE.Object3D[] = [];
  appState.scene.traverse((c: any) => { if (c.isMesh && c.userData?.diffSubset) toRemove.push(c); });
  toRemove.forEach(c => { if (c.parent) c.parent.remove(c); });

  const filterByCat = (items: any[]): any[] => {
    if (showNone) return [];
    if (showAll) return items;
    return items.filter(e => { const en = e.entity || e.a || e.b; return appState.activeCategories.has(en?.type || 'Unknown'); });
  };

  const matAdd = new THREE.MeshPhongMaterial({ color: 0x16a34a, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matRem = new THREE.MeshPhongMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matMod = new THREE.MeshPhongMaterial({ color: 0xf59e0b, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matUnch = new THREE.MeshPhongMaterial({ color: 0xd1d5db, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: appState.clipPlanes });

  const makeSub = (mi: number, ids: number[], mat: THREE.Material, name: string): void => {
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
    } catch (e) {}
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
      (appState.loadedModels[0] as any).traverse((c: any) => {
        if (c.isMesh) {
          c.visible = true;
          const ms: any[] = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m: any) => { m.color = new THREE.Color(0xe8a0a0); m.opacity = 0.12; m.transparent = true; m.depthWrite = false; m.needsUpdate = true; m.clippingPlanes = appState.clipPlanes; });
        }
      });
    }
  }
  // Model B base: very faded background
  if (appState.loadedModels[1]) {
    (appState.loadedModels[1] as any).visible = visBChecked && !showNone;
    (appState.loadedModels[1] as any).traverse((c: any) => { if (c.isMesh) { const ms: any[] = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach((m: any) => { m.opacity = 0.04; m.transparent = true; m.depthWrite = false; m.needsUpdate = true; }); } });
  }
}

window.setFilter = function (f: string): void {
  appState.activeFilter = f;
  document.querySelectorAll('.fchip').forEach((c: any) => c.classList.toggle('on', c.dataset.f === f));
  (window as any).renderTree?.();
  // Also filter issues list
  filterIssuesList();
};

function filterIssuesList(): void {
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
  (document.getElementById('issueNavInfo') as HTMLElement).textContent = visible.length + ' issues';
}

// ══ Issues Panel ══
// Note: issuesList and currentIssueIdx are tracked in appState

window.switchTab = function (tab: string): void {
  const tabs = document.querySelectorAll('.ptab');
  tabs.forEach((t: any, i) => t.classList.toggle('on', (tab === 'tree' && i === 0) || (tab === 'issues' && i === 1) || (tab === 'search' && i === 2)));
  (document.getElementById('eTree') as HTMLElement).style.display = tab === 'tree' ? '' : 'none';
  document.getElementById('issuesList')!.classList.toggle('show', tab === 'issues');
  document.getElementById('issueNav')!.classList.toggle('show', tab === 'issues');
  document.getElementById('searchPanel')!.classList.toggle('show', tab === 'search');
  if (tab === 'search') (window as any).searchInit?.();
};

function buildIssues(): void {
  if (!appState.compareResult) return;
  const r: any = appState.compareResult;
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

  (document.getElementById('issueCount') as HTMLElement).textContent = String(appState.issuesList.length);

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
  (document.getElementById('issuesList') as HTMLElement).innerHTML = html;
  document.getElementById('panelTabs')!.classList.add('show');

  // Always switch to issues tab after compare
  window.switchTab!('issues');
}

window.focusIssue = function (idx: number): void {
  if (idx < 0 || idx >= appState.issuesList.length) { log('focusIssue: bad idx', idx); return; }
  appState.currentIssueIdx = idx;
  const iss = appState.issuesList[idx];
  const targetEID = iss.expressID;
  const targetModelIdx = iss.modelIdx;
  log(`focusIssue #${iss.num}: eid=${targetEID} model=${targetModelIdx} status=${iss.status}`);

  // Highlight active card
  document.querySelectorAll('.issue-card').forEach((c: any, i) => c.classList.toggle('active', i === idx));
  (document.getElementById('issueNavInfo') as HTMLElement).textContent = `${idx + 1} / ${appState.issuesList.length}`;
};

export { buildIssues, handleMeasurePoint, applyCatVis, buildCatDropdown, updateCatTags, filterIssuesList };
