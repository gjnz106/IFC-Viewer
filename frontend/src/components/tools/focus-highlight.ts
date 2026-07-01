import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

// ── Find element bbox by scanning scene meshes for matching expressID ──
// We scan EVERY mesh in the scene that has an expressID attribute. This
// covers: diff subsets (added/removed/modified-a/modified-b/unchanged-b)
// created during compare, AND the base models. Whichever finds the
// element first wins. Tracking which mesh matched lets us also use it
// directly for highlighting without needing createSubset.
function focusIssueGeometry(idx: number): void {
  if (idx < 0 || idx >= appState.issuesList.length) { log('focusIssue: bad idx', idx); return; }
  appState.currentIssueIdx = idx;
  const iss = appState.issuesList[idx];
  const targetEID: number = iss.expressID;
  const targetModelIdx: number = iss.modelIdx;
  log(`focusIssue #${iss.num}: eid=${targetEID} model=${targetModelIdx} status=${iss.status}`);

  // Highlight active card
  document.querySelectorAll('.issue-card').forEach((c: any, i) => c.classList.toggle('active', i === idx));
  (document.getElementById('issueNavInfo') as HTMLElement).textContent = `${idx + 1} / ${appState.issuesList.length}`;

  let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  let found = false;
  let scanCount = 0, hitCount = 0;

  appState.scene.traverse((c: any) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    // Only scan meshes belonging to the issue's model. expressIDs are unique
    // ONLY within a model, so with two models loaded (compare A/B) or a
    // federation the same eid in another model would otherwise merge into the
    // bbox and pull the camera to the wrong element.
    if (targetModelIdx >= 0) {
      let mIdx: number | undefined | null = c.userData?.srcModelIdx;
      if (mIdx === undefined || mIdx === null) {
        const f = (window as any).findModelIdx;
        mIdx = typeof f === 'function' ? f(c) : -1;
      }
      if (mIdx! >= 0 && mIdx !== targetModelIdx) return;
    }
    scanCount++;
    const eidArr: ArrayLike<number> = c.geometry.attributes.expressID.array;
    const posArr: ArrayLike<number> = c.geometry.attributes.position.array;
    const wm: THREE.Matrix4 = c.matrixWorld;
    const v = new THREE.Vector3();
    let localHit = false;
    for (let i = 0; i < eidArr.length; i++) {
      if (eidArr[i] !== targetEID) continue;
      const pi = i * 3;
      if (pi + 2 >= posArr.length || isNaN((posArr as any)[pi])) continue;
      v.set((posArr as any)[pi], (posArr as any)[pi + 1], (posArr as any)[pi + 2]).applyMatrix4(wm);
      if (isNaN(v.x)) continue;
      if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
      if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
      if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
      found = true; localHit = true;
    }
    if (localHit) hitCount++;
  });
  log(`focusIssue: scanned ${scanCount} meshes, ${hitCount} contained eid ${targetEID}, found=${found}`);

  if (!found) {
    log('Issue focus FAILED: geometry not in scene. Showing properties only.');
    showIssueProps(iss);
    return;
  }

  // Compute element center + a generous frame distance
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;
  const elSize = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ);
  log(`focusIssue: element bbox center=(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}) size=${elSize.toFixed(2)}`);

  // ── Camera move ──
  // Move camera FIRST (before section box so the user sees the new view
  // even if section box update fails for some reason). Camera distance is
  // 1.5× the largest element dimension + a 5m floor so tiny elements still
  // get a comfortable framing.
  const viewDist = Math.max(elSize * 1.5, 5);
  appState.camera.position.set(cx + viewDist * 0.5, cy + viewDist * 0.4, cz + viewDist * 0.5);
  appState.controls.target.set(cx, cy, cz);
  appState.controls.update();
  // Invalidate any stale pivot — we just moved the camera explicitly, so
  // the next click should set a fresh pivot from the new state.
  if ((window as any)._pendingPivot) (window as any)._pendingPivot = null;

  // ── Section box ──
  // Tighten section box around element + small padding (10% or 0.5m floor).
  // If section box wasn't active, activate it. If sliders fail to compute
  // for any reason, skip section box but still keep camera + highlight.
  try {
    // Padding around element: 30% of element size, minimum 1m, maximum 5m.
    // Thin elements (50mm walls, 25mm pipes) get a generous 1m floor so the
    // section box doesn't hug the geometry so tightly that the user can't see
    // any context. Big elements get capped at 5m to avoid framing the whole
    // building when zooming to a slab.
    const sbPad = Math.max(Math.min(elSize * 0.3, 5), 1);
    const sbMnX = mnX - sbPad, sbMxX = mxX + sbPad;
    const sbMnY = mnY - sbPad, sbMxY = mxY + sbPad;
    const sbMnZ = mnZ - sbPad, sbMxZ = mxZ + sbPad;
    const b = appState.modelBounds;
    const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    if (sx > 0 && sy > 0 && sz > 0) {
      // ── Directional rounding to prevent slider collapse ──
      // Sliders are 0-100 integer percentages of model bounds. For tiny
      // elements (e.g. a 50mm pipe wall in a 100m project), both edges
      // round to the same integer → section box dimension = 0 → element
      // gets clipped to nothing → user sees empty viewport. Fix: ceil the
      // upper edge and floor the lower edge so the resulting integer pair
      // always brackets the element. Also enforce a minimum 2% spread so
      // even degenerate-dimension elements (flat planes) get a thin slice
      // around them.
      const slUp = (val: number, mn: number, range: number) => Math.max(0, Math.min(100, Math.ceil(((val - mn) / range) * 100)));
      const slDn = (val: number, mn: number, range: number) => Math.max(0, Math.min(100, Math.floor(((val - mn) / range) * 100)));
      const ensureMin = (lo: number, hi: number, minSpread: number): [number, number] => {
        if (hi - lo >= minSpread) return [lo, hi];
        // Expand symmetrically around midpoint, but clamp to 0..100
        const mid = (lo + hi) / 2;
        const half = minSpread / 2;
        let nlo = Math.max(0, Math.floor(mid - half));
        let nhi = Math.min(100, Math.ceil(mid + half));
        // If we hit a wall, push from the other side
        if (nhi - nlo < minSpread) {
          if (nlo === 0) nhi = Math.min(100, nlo + minSpread);
          else nlo = Math.max(0, nhi - minSpread);
        }
        return [nlo, nhi];
      };
      let xLo = slDn(sbMnX, b.min.x, sx), xHi = slUp(sbMxX, b.min.x, sx);
      let yLo = slDn(sbMnY, b.min.y, sy), yHi = slUp(sbMxY, b.min.y, sy);
      let zLo = slDn(sbMnZ, b.min.z, sz), zHi = slUp(sbMxZ, b.min.z, sz);
      [xLo, xHi] = ensureMin(xLo, xHi, 2);
      [yLo, yHi] = ensureMin(yLo, yHi, 2);
      [zLo, zHi] = ensureMin(zLo, zHi, 2);
      (document.getElementById('slXp') as HTMLInputElement).value = String(xHi);
      (document.getElementById('slXn') as HTMLInputElement).value = String(xLo);
      (document.getElementById('slYp') as HTMLInputElement).value = String(yHi);
      (document.getElementById('slYn') as HTMLInputElement).value = String(yLo);
      (document.getElementById('slZp') as HTMLInputElement).value = String(zHi);
      (document.getElementById('slZn') as HTMLInputElement).value = String(zLo);
      if (!appState.sectionActive) {
        appState.sectionActive = true;
        document.getElementById('sectionPanel')!.classList.add('show');
        document.getElementById('btnSection')!.classList.add('active');
        (window as any).createSectionBox3D?.();
      }
      (window as any).updateSectionFromSliders?.();
    } else {
      log('focusIssue: skipping section box (modelBounds invalid)');
    }
  } catch (e: any) { log('focusIssue section box err:', e?.message); }

  // ── Highlight ──
  // Try web-ifc-three subset first. If it returns null (issue #83 with
  // stale cache after compare), fall back to a manually-built geometry
  // copy of just the matching faces.
  try {
    (window as any).clearHighlight?.();
    if (!(window as any)._hlMat) (window as any)._hlMat = new THREE.MeshPhongMaterial({ color: 0x2563eb, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: appState.clipPlanes });
    const mid = (appState.loadedModels[targetModelIdx] as any)?.modelID;
    let sub: any = null;
    if (mid !== undefined) {
      sub = (appState.ifcLoader as any).ifcManager.createSubset({ modelID: mid, ids: [targetEID], material: (window as any)._hlMat, scene: appState.scene, removePrevious: true });
      if (sub) {
        sub.position.copy((appState.loadedModels[targetModelIdx] as any).position);
        sub.updateMatrixWorld(true);
        (window as any)._lastHL = { subset: sub, mid };
        log('focusIssue: highlight subset created');
      } else {
        log('focusIssue: createSubset returned null (issue #83?). Highlight skipped — element still visible via diff subsets.');
      }
    }
  } catch (e: any) { log('focusIssue highlight err:', e?.message); }

  // Show properties
  showIssueProps(iss);
}

function showIssueProps(iss: any): void {
  const colors: Record<string, string> = { added: 'var(--green)', removed: 'var(--red)', modified: 'var(--amber)' };
  const bgs: Record<string, string> = { added: 'var(--green-lt)', removed: 'var(--red-lt)', modified: 'var(--amber-lt)' };
  let h = `<div style="padding:8px 12px;background:${bgs[iss.status]};border-bottom:1px solid var(--border)">
    <span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${colors[iss.status]}">ISSUE #${iss.num} — ${iss.status.toUpperCase()}</span>
  </div>
  <div class="ps"><div class="ps-t">Element</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${iss.name}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${iss.type}</div></div>
    <div class="pr"><div class="pk">Tag / Element ID</div><div class="pv">${iss.tag || '—'}</div></div>
    <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${iss.gid}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${iss.expressID}</div></div>
    <div class="pr"><div class="pk">Source</div><div class="pv">Version ${iss.modelIdx === 0 ? 'A' : 'B'}</div></div>
  </div>
  <div class="ps"><div class="ps-t">How to find in BIM software</div>
    <div class="pr"><div class="pk">Revit</div><div class="pv" style="font-size:12px">Select by ID → <b>${iss.tag || 'N/A'}</b></div></div>
    <div class="pr"><div class="pk">Tekla</div><div class="pv" style="font-size:12px">Inquire → GUID: <b style="word-break:break-all">${iss.gid}</b></div></div>
    <div class="pr"><div class="pk">ArchiCAD</div><div class="pv" style="font-size:12px">Find by IFC GlobalId: <b style="word-break:break-all">${iss.gid}</b></div></div>
  </div>`;

  if (iss.diffs && iss.diffs.length > 0) {
    h += `<div class="ps"><div class="ps-t">Property Changes</div>`;
    iss.diffs.forEach((d: any) => {
      h += `<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`;
    });
    h += '</div>';
  }

  (document.getElementById('propArea') as HTMLElement).innerHTML = h;
}

// Clicking an issue card (onclick="focusIssue(i)") must run the SAME full
// focus flow as the ◀/▶ nav arrows. Point window.focusIssue at the real
// geometry-focusing implementation here (this module loads after measure.ts,
// which previously registered a stub that only highlighted the card).
window.focusIssue = focusIssueGeometry;

window.navIssue = function (dir: number): void {
  if (appState.issuesList.length === 0) return;
  let next = appState.currentIssueIdx + dir;
  if (next < 0) next = appState.issuesList.length - 1;
  if (next >= appState.issuesList.length) next = 0;
  focusIssueGeometry(next);
  // Scroll card into view
  document.getElementById('issue-' + next)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

window.exportCSV = function (): void {
  if (!appState.compareResult) return;
  const r: any = appState.compareResult;
  let csv = 'Status,Type,GlobalId,Tag/ElementID,Name,Details\n';
  csv += '# Revit: use Tag/ElementID with Select by ID. Tekla/ArchiCAD: use GlobalId to find elements.\n';
  r.added.forEach((e: any) => csv += `Added,${e.entity.type},"${e.gid}","${e.entity.tag || ''}","${e.entity.name}",New in B\n`);
  r.removed.forEach((e: any) => csv += `Removed,${e.entity.type},"${e.gid}","${e.entity.tag || ''}","${e.entity.name}",Only in A\n`);
  r.modified.forEach((e: any) => { const en = e.a || e.b; csv += `Modified,${en.type},"${e.gid}","${en.tag || ''}","${en.name}","${e.diffs.map((d: any) => d.prop + ':' + d.oldVal + '→' + d.newVal).join('; ')}"\n`; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'ifc-compare.csv';
  a.click();
};

// ══ BCF Export ══
window.exportBCF = async function (): Promise<void> {
  if (!appState.compareResult || !appState.issuesList.length) { log('No issues to export'); return; }
  if (!(window as any).JSZip) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(s);
    await new Promise<void>((res, rej) => { s.onload = () => res(); s.onerror = rej; });
  }
  log('Exporting BCF for ' + appState.issuesList.length + ' issues...');
  const zip = new (window as any).JSZip();
  const now = new Date().toISOString();
  const pid = crypto.randomUUID();

  // Coord transform: Three.js is Y-up, BCF/IFC is Z-up.
  // Three (x,y,z) -> IFC (x, z, -y). First reverse the sharedCenterOffset applied on load
  // (model.position is the Three-space offset), then swap axes.
  // threeToIfc(v) returns the IFC-space coordinates for a Three-space point v.
  const mdlPos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2; i++) {
    if (appState.loadedModels[i]) {
      mdlPos.x = (appState.loadedModels[i] as any).position.x;
      mdlPos.y = (appState.loadedModels[i] as any).position.y;
      mdlPos.z = (appState.loadedModels[i] as any).position.z;
      break;
    }
  }
  const threeToIfc = (x: number, y: number, z: number) => {
    // reverse offset in Three-space first
    const tx = x - mdlPos.x, ty = y - mdlPos.y, tz = z - mdlPos.z;
    // Y-up -> Z-up: (x, y, z)_three -> (x, z, -y)_ifc
    return { x: tx, y: tz, z: -ty };
  };
  // Axis swap for direction vectors (no offset)
  const dirThreeToIfc = (x: number, y: number, z: number) => ({ x: x, y: z, z: -y });
  log('Compare BCF model offset (three-space): (' + mdlPos.x.toFixed(2) + ', ' + mdlPos.y.toFixed(2) + ', ' + mdlPos.z.toFixed(2) + ')');

  // Save camera
  const saveCam = appState.camera.position.clone();
  const saveTgt = appState.controls.target.clone();

  zip.file('bcf.version', '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file('project.bcfp', '<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="' + pid + '"><Name>IFC Delta Compare</Name></Project></ProjectExtension>');

  for (let i = 0; i < appState.issuesList.length; i++) {
    const iss = appState.issuesList[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();

    // Element bbox center in Three-space → transform to IFC (Z-up) coords
    const bbox: any = iss.modelIdx !== undefined ? (window as any).getElementBBox?.(iss.modelIdx, iss.expressID) : null;
    const ifcCenter = bbox?.center ? threeToIfc(bbox.center.x, bbox.center.y, bbox.center.z) : { x: 0, y: 0, z: 0 };
    const ix = ifcCenter.x, iy = ifcCenter.y, iz = ifcCenter.z;
    const d = bbox ? Math.max(bbox.size.x, bbox.size.y, bbox.size.z) * 2 + 5 : 20;

    // Snapshot: zoom to element, highlight it, wait for render, capture.
    let snap64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==';
    if (bbox?.center) {
      appState.camera.position.set(bbox.center.x + d * 0.4, bbox.center.y + d * 0.3, bbox.center.z + d * 0.4);
      appState.controls.target.set(bbox.center.x, bbox.center.y, bbox.center.z);
      appState.controls.update();
      // Colored highlight so the element pops in the snapshot thumbnail
      let snapHL: any = null;
      try {
        const hlColor: Record<string, number> = { added: 0x16a34a, removed: 0xdc2626, modified: 0xd97706 };
        const hlMat = new THREE.MeshPhongMaterial({ color: hlColor[iss.status] || 0x2563eb, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: true });
        const mid = (appState.loadedModels[iss.modelIdx] as any)?.modelID;
        if (mid !== undefined) {
          snapHL = (appState.ifcLoader as any).ifcManager.createSubset({ modelID: mid, ids: [iss.expressID], material: hlMat, scene: appState.scene, removePrevious: false, customID: 'bcfSnap' });
          if (snapHL) { snapHL.position.copy((appState.loadedModels[iss.modelIdx] as any).position); snapHL.updateMatrixWorld(true); }
        }
      } catch (e) {}
      appState.renderer.render(appState.scene, appState.camera);
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      appState.renderer.render(appState.scene, appState.camera);
      try { snap64 = appState.renderer.domElement.toDataURL('image/png').split(',')[1]; } catch (e) {}
      // Remove the highlight subset so it doesn't persist between issues
      if (snapHL) { try { appState.scene.remove(snapHL); snapHL.geometry?.dispose(); } catch (e) {} }
    }

    let desc = iss.status.toUpperCase() + ': ' + (iss.name || '');
    if (iss.tag) desc += ' | Element ID: ' + iss.tag;
    if (iss.detail) desc += ' | ' + iss.detail;
    // Add position info for elements that may not exist in target Revit project
    if (bbox?.center) {
      desc += ' | Position: (' + ix.toFixed(2) + ', ' + iy.toFixed(2) + ', ' + iz.toFixed(2) + ')';
      if (iss.status === 'added') desc += ' | NOTE: This element is NEW in Version B. Look at this location in Revit to see where it should be placed.';
      if (iss.status === 'removed') desc += ' | NOTE: This element was REMOVED. It existed at this location in Version A.';
    }

    // BCF camera and section box in IFC coords.
    const rawSx = bbox ? bbox.size.x / 2 : 5;
    const rawSy = bbox ? bbox.size.z / 2 : 5;
    const rawSz = bbox ? bbox.size.y / 2 : 5;
    const elMax = Math.max(rawSx, rawSy, rawSz);
    // padding: at least 2m, or 1.5x element half-size (scales for large elements)
    const pad = Math.max(2, elMax * 1.5);
    const sx = rawSx + pad, sy = rawSy + pad, sz = rawSz + pad;
    const viewR = Math.max(sx, sy, sz) * 1.8 + 3;
    const camX = ix + viewR * 0.55, camY = iy - viewR * 0.75, camZ = iz + viewR * 0.45;
    const ddx = ix - camX, ddy = iy - camY, ddz = iz - camZ;
    const ln = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    const col: Record<string, string> = { added: 'FF16A34A', removed: 'FFDC2626', modified: 'FFD97706' };
    const colStr = col[iss.status] || 'FF2563EB';

    // 6 ClippingPlanes forming a section box around element in IFC coords.
    const clips =
      '<ClippingPlanes>' +
      '<ClippingPlane><Location><X>' + (ix + sx).toFixed(6) + '</X><Y>' + (iy).toFixed(6) + '</Y><Z>' + (iz).toFixed(6) + '</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + (ix - sx).toFixed(6) + '</X><Y>' + (iy).toFixed(6) + '</Y><Z>' + (iz).toFixed(6) + '</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + (ix).toFixed(6) + '</X><Y>' + (iy + sy).toFixed(6) + '</Y><Z>' + (iz).toFixed(6) + '</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + (ix).toFixed(6) + '</X><Y>' + (iy - sy).toFixed(6) + '</Y><Z>' + (iz).toFixed(6) + '</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + (ix).toFixed(6) + '</X><Y>' + (iy).toFixed(6) + '</Y><Z>' + (iz + sz).toFixed(6) + '</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + (ix).toFixed(6) + '</X><Y>' + (iy).toFixed(6) + '</Y><Z>' + (iz - sz).toFixed(6) + '</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane>' +
      '</ClippingPlanes>';

    const tag = iss.tag || '';
    const buildComponent = (): string => {
      let x = '<Component IfcGuid="' + escXml(iss.gid) + '">';
      x += '<OriginatingSystem>Autodesk Revit</OriginatingSystem>';
      if (tag) x += '<AuthoringToolId>' + escXml(tag) + '</AuthoringToolId>';
      x += '</Component>';
      return x;
    };
    const compXml = buildComponent();

    // markup.bcf
    const headerXml = '<Header>' +
      (appState.files[0] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(appState.files[0].name) + '</Filename><Date>' + now + '</Date></File>' : '') +
      (appState.files[1] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(appState.files[1].name) + '</Filename><Date>' + now + '</Date></File>' : '') +
      '</Header>';

    zip.file(tid + '/markup.bcf', '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' + headerXml + '\n<Topic Guid="' + tid + '" TopicType="Issue" TopicStatus="Active"><Title>' + escXml('#' + iss.num + ' ' + iss.name + ' [' + iss.status.toUpperCase() + ']') + '</Title><Description>' + escXml(desc) + '</Description><CreationDate>' + now + '</CreationDate><CreationAuthor>IFC Delta</CreationAuthor><ModifiedDate>' + now + '</ModifiedDate></Topic>\n<Comment Guid="' + crypto.randomUUID() + '"><Date>' + now + '</Date><Author>IFC Delta</Author><Comment>' + escXml(desc) + '</Comment><Viewpoint Guid="' + vid + '"/></Comment>\n<Viewpoints Guid="' + vid + '"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n</Markup>');

    const viewpointXml = '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="' + vid + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '<Components>' +
      '<Selection>' + compXml + '</Selection>' +
      '<Visibility DefaultVisibility="true"><Exceptions/></Visibility>' +
      '<Coloring><Color Color="' + colStr + '">' + compXml + '</Color></Coloring>' +
      '</Components>\n' +
      '<PerspectiveCamera>' +
      '<CameraViewPoint><X>' + camX.toFixed(6) + '</X><Y>' + camY.toFixed(6) + '</Y><Z>' + camZ.toFixed(6) + '</Z></CameraViewPoint>' +
      '<CameraDirection><X>' + (ddx / ln).toFixed(6) + '</X><Y>' + (ddy / ln).toFixed(6) + '</Y><Z>' + (ddz / ln).toFixed(6) + '</Z></CameraDirection>' +
      '<CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>' +
      '<FieldOfView>60</FieldOfView>' +
      '</PerspectiveCamera>\n' +
      clips + '\n' +
      '</VisualizationInfo>';
    zip.file(tid + '/viewpoint.bcfv', viewpointXml);

    zip.file(tid + '/snapshot.png', snap64, { base64: true });
  }

  // Restore camera
  appState.camera.position.copy(saveCam); appState.controls.target.copy(saveTgt); appState.controls.update(); appState.renderer.render(appState.scene, appState.camera);

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ifc-delta-issues.bcf'; a.click();
  log('BCF exported: ' + appState.issuesList.length + ' issues');
};

function escXml(s: any): string { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function setStatus(t: string, x: string): void { const b = document.getElementById('statusBadge')!; b.className = 'status-badge show ' + t; (document.getElementById('statusText') as HTMLElement).textContent = x; }

export { focusIssueGeometry, showIssueProps, escXml, setStatus };

// ── Expose cross-module callers on window ──
Object.assign(window as any, { escXml, setStatus });
