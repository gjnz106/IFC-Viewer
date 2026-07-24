import * as THREE from 'three';
import {
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM,
  IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING,
  IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING,
  IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT,
  IFCSPACE, IFCOPENINGELEMENT,
  // Geometry / topology / resource / relationship families — none of these
  // are physical products, so they are cheaply skipped (via GetLineType) in the
  // Method-2 full-file scan BEFORE the expensive getItemProperties() parse.
  IFCCARTESIANPOINT, IFCCARTESIANPOINTLIST2D, IFCCARTESIANPOINTLIST3D,
  IFCDIRECTION, IFCVECTOR, IFCVERTEXPOINT, IFCPOLYLOOP, IFCFACE,
  IFCFACEOUTERBOUND, IFCFACEBOUND, IFCCLOSEDSHELL, IFCOPENSHELL,
  IFCFACETEDBREP, IFCTRIANGULATEDFACESET, IFCPOLYGONALFACESET,
  IFCINDEXEDPOLYGONALFACE, IFCINDEXEDPOLYGONALFACEWITHVOIDS,
  IFCAXIS2PLACEMENT2D, IFCAXIS2PLACEMENT3D, IFCLOCALPLACEMENT,
  IFCCARTESIANTRANSFORMATIONOPERATOR3D, IFCSHAPEREPRESENTATION,
  IFCPRODUCTDEFINITIONSHAPE, IFCEXTRUDEDAREASOLID, IFCARBITRARYCLOSEDPROFILEDEF,
  IFCARBITRARYPROFILEDEFWITHVOIDS, IFCRECTANGLEPROFILEDEF, IFCCIRCLEPROFILEDEF,
  IFCISHAPEPROFILEDEF, IFCPOLYLINE, IFCMAPPEDITEM, IFCREPRESENTATIONMAP,
  IFCSTYLEDITEM, IFCSURFACESTYLE, IFCCOLOURRGB, IFCPRESENTATIONSTYLEASSIGNMENT,
  IFCSURFACESTYLERENDERING, IFCPROPERTYSINGLEVALUE, IFCPROPERTYSET,
  IFCELEMENTQUANTITY, IFCQUANTITYLENGTH, IFCQUANTITYAREA, IFCQUANTITYVOLUME,
  IFCPROPERTYENUMERATEDVALUE, IFCCOMPLEXPROPERTY, IFCMATERIAL, IFCMATERIALLAYER,
  IFCMATERIALLAYERSET, IFCMATERIALLAYERSETUSAGE, IFCGEOMETRICREPRESENTATIONCONTEXT,
  IFCPROPERTYBOUNDEDVALUE, IFCPROPERTYLISTVALUE, IFCOWNERHISTORY, IFCPERSON,
  IFCORGANIZATION, IFCPERSONANDORGANIZATION, IFCAPPLICATION,
} from 'web-ifc';
import { appState } from '../../store/index.js';
import { FED_COLORS, IFC_NAMES } from '../../lib/constants.js';
import { escapeHtml } from '../../lib/escape.js';
import { runCompare as computeDiff } from './compare.js';
import { log } from '../core/ifc-category.js';
import { disposeModel } from '../core/viewer-core.js';
import { syncUploadSlot } from '../ui/projects.js';
import { saveLocalSessionFile, clearLocalSessionFile } from '../../lib/local-session.js';
import { syncChipLabel } from '../../lib/cloud-files.js';
import { saveResult, buildModelSignature, formatCompareCounts, buildResultMetadata } from '../../lib/cloud-results.js';

// ══ Federation file management (slots 2+) ══════════════════════════
let _fedPendingSlot = -1;

window.fedAddSlot = function(){
  _fedPendingSlot = appState.fedNextSlot;
  document.getElementById('fedFileInput')!.click();
};

window.fedHandleFile = function(ev: Event){
  const f = (ev.target as HTMLInputElement)?.files?.[0];
  if(!f) return;
  const idx = _fedPendingSlot;
  if(idx < 2) return;
  appState.files[idx] = f;
  appState.fedNextSlot = Math.max(appState.fedNextSlot, idx + 1);
  fedRenderSlots();
  (async()=>{
    if(!appState.ifcLoader){if(!await (window as any).initIFC()) return}
    await (window as any).loadIFC(idx);
    fedRenderSlots();
    syncUploadSlot(idx, f).catch((e: unknown)=>console.warn('syncUploadSlot error:', e));
    if(!appState.activeCloudProjectId) saveLocalSessionFile(idx, f).catch((e: unknown)=>console.warn('saveLocalSessionFile error:', e));
  })().catch((e: unknown)=>console.error('fedHandleFile error:', e));
  // Reset input so same file can be reloaded
  (ev.target as HTMLInputElement).value = '';
};

window.fedRemoveSlot = function(idx: number){
  if(idx < 2) return;
  if(appState.loadedModels[idx]){
    disposeModel(appState.loadedModels[idx]);
    appState.scene.remove(appState.loadedModels[idx]!);
    appState.loadedModels[idx] = null;
  }
  appState.files[idx] = null;
  appState.hiddenModels.delete(idx); // don't let a stale hidden flag carry to a future slot reuse
  if(!appState.activeCloudProjectId) clearLocalSessionFile(idx).catch((e: unknown)=>console.warn('clearLocalSessionFile error:', e));
  if(window._colorizeInvalidate) window._colorizeInvalidate(idx);
  // If the removed slot was the current clash Source/Target, repoint it at a
  // still-loaded model (otherwise Run silently no-ops on a disposed slot).
  (window as any).clashHandleModelRemoved?.(idx);
  // Recompute model bounds from remaining models
  fedRecomputeBounds();
  fedRenderSlots();
  // Invalidate SG context cache
  appState.sgState.cachedCtx = null;
  if(window.requestPlanRebuild) window.requestPlanRebuild();
};

window.fedToggleVis = function(idx: number){
  if(!appState.loadedModels[idx]) return;
  const chk = document.getElementById('fedVis'+idx) as HTMLInputElement | null;
  // Route through toggleModelVis so hiddenModels (the single source of truth)
  // stays in sync and the category-filter subsets re-render correctly.
  (window as any).toggleModelVis?.(idx, chk?.checked ?? true);
  if(window.requestPlanRender) window.requestPlanRender();
};

export function fedRecomputeBounds(): void {
  let first = true;
  for(let i=0; i<appState.loadedModels.length; i++){
    const m = appState.loadedModels[i];
    if(!m) continue;
    const b = new THREE.Box3().setFromObject(m);
    if(!b.isEmpty()){
      if(first){ appState.modelBounds.min.copy(b.min); appState.modelBounds.max.copy(b.max); first=false; }
      else { appState.modelBounds.min.min(b.min); appState.modelBounds.max.max(b.max); }
    }
  }
  if(first){ appState.modelBounds.min.set(0,0,0); appState.modelBounds.max.set(0,0,0); }
}

export function fedRenderSlots(): void {
  const container = document.getElementById('fedSlots')!;
  let html = '';
  let count = 0;
  for(let i=2; i<appState.loadedModels.length || i<appState.files.length; i++){
    if(!appState.files[i] && !appState.loadedModels[i]) continue;
    count++;
    const colorIdx = (i-2) % FED_COLORS.length;
    const color = FED_COLORS[colorIdx];
    const loaded = !!appState.loadedModels[i];
    const fname = appState.files[i]?.name || '(unknown)';
    const size = appState.files[i] ? (appState.files[i]!.size/1048576).toFixed(1)+'MB' : '';
    const statusText = loaded ? '✓ Loaded' : '⏳ Loading...';
    const statusCls = loaded ? 'color:var(--green)' : 'color:var(--amber)';
    // Reflect the model's actual current visibility (set by fedToggleVis),
    // not just "loaded" — re-rendering this list (e.g. when another
    // federation file finishes loading) used to always mark the checkbox
    // checked, silently re-showing a model the user had just hidden.
    const isVisible = loaded && !appState.hiddenModels.has(i);
    const syncSt = appState.cloudSyncStatus[i];
    const syncChip = appState.activeCloudProjectId && syncSt ? syncChipLabel(syncSt.status, syncSt.progress) : '';
    html += `<div class="fed-slot ${loaded?'loaded':''}">
      <div class="fed-slot-color" style="background:${color}"></div>
      <div class="fed-slot-info">
        <div class="fed-slot-name" title="${escapeHtml(fname)}">${escapeHtml(fname)}</div>
        <div class="fed-slot-status"><span style="${statusCls}">${statusText}</span> ${size}${syncChip ? ' · '+syncChip : ''}</div>
      </div>
      <input type="checkbox" class="fed-slot-vis" id="fedVis${i}" ${isVisible?'checked':''} onchange="fedToggleVis(${i})" title="Toggle visibility">
      <button class="fed-slot-rm" onclick="fedRemoveSlot(${i})" title="Remove this file">✕</button>
    </div>`;
  }
  container.innerHTML = html;
}

// Helper: get total number of loaded models (any slot)
export function getLoadedModelCount(): number {
  return appState.loadedModels.filter(m=>!!m).length;
}

// ══ Unload everything (used by project switching) ══════════════════
// There was previously no "clear the whole workspace" path — fedRemoveSlot
// only ever handled federation slots (≥2), and loadIFC only replaces the
// single slot it's given. Switching projects needs a full teardown so the
// next project starts from a pristine state.
export function unloadAllModels(): void {
  if (appState.walkActive) (window as any).toggleWalkMode?.();

  // Clear overlays that read appState.loadedModels to restore visibility —
  // must run before the models themselves are disposed below.
  (window as any).clearMeasure?.();
  window.clearHighlight?.();
  if (appState.colorize.active) (window as any).colorizeClear?.();
  (window as any).showAllHidden?.();

  // Sweep diff subsets (exitCompare already ran via the router's navigateTo,
  // but this is idempotent and cheap to call defensively).
  disposeDiffSubsets();

  // Dispose + remove every model slot. Mutate the arrays in place (not
  // reassign) — other modules read appState.loadedModels/.files by property
  // lookup each time, but this keeps the same array identity just in case.
  for (let i = 0; i < appState.loadedModels.length; i++) {
    const m = appState.loadedModels[i];
    if (m) {
      disposeModel(m);
      appState.scene.remove(m);
      if (window._colorizeInvalidate) window._colorizeInvalidate(i);
    }
  }
  appState.loadedModels.length = 0;
  appState.loadedModels.push(null, null);
  appState.files.length = 0;
  appState.files.push(null, null);

  appState.fedNextSlot = 2;
  appState.sharedCenterOffset = null;
  appState.modelBounds.min.set(0, 0, 0);
  appState.modelBounds.max.set(0, 0, 0);
  appState.compareResult = null;
  appState.clashResults = [];
  // Sweep clash-zone markers too — clearing clashResults alone left the marker
  // meshes in the scene, so a switched-to project showed the previous one's
  // red boxes floating over its models.
  (window as any).clearClashSubsets?.();
  appState.sgState.cachedCtx = null;
  appState.sgState.cachedCtxKey = null;
  appState.aiIndex = null;
  appState.aiIndexKey = null;
  appState.activeCategories = new Set();
  appState.hiddenModels.clear();
  (window as any)._catData = {};
  (window as any)._catModelIDs = {};

  if (appState.sectionActive) {
    window.toggleSectionBox?.();
  } else {
    appState.clipPlanes.forEach(p => { p.constant = 99999; });
  }

  for (const idx of [0, 1]) {
    document.getElementById('uc' + idx)?.classList.remove('loaded');
    const fn = document.getElementById('fn' + idx); if (fn) fn.textContent = '';
    const fs = document.getElementById('fs' + idx); if (fs) fs.textContent = '';
    const us = document.getElementById('us' + idx);
    if (us) { us.className = 'uc-badge-loaded'; us.textContent = 'Loading…'; }
    const visRow = document.getElementById('visRow' + idx) as HTMLElement | null;
    if (visRow) visRow.style.display = 'none';
  }
  fedRenderSlots();

  const emptyVP = document.getElementById('emptyVP') as HTMLElement | null;
  if (emptyVP) emptyVP.style.display = 'flex';
  const btnCompare = document.getElementById('btnCompare') as HTMLButtonElement | null;
  if (btnCompare) btnCompare.disabled = true;
  const panelBtn = document.getElementById('btnRunComparePanel') as HTMLButtonElement | null;
  if (panelBtn) { panelBtn.disabled = true; panelBtn.style.opacity = '.35'; }
  const propArea = document.getElementById('propArea');
  if (propArea) propArea.innerHTML = '<div class="prop-empty">Click element in 3D to inspect</div>';
  if (window.requestPlanRebuild) window.requestPlanRebuild();
}
window.unloadAllModels = unloadAllModels;

// Helper: iterate all loaded models with callback(model, index)
export function forEachModel(fn: (model: THREE.Group, index: number) => void): void {
  for(let i=0; i<appState.loadedModels.length; i++){
    if(appState.loadedModels[i]) fn(appState.loadedModels[i]!, i);
  }
}

// Helper: find which model index owns a Three.js object
export function findModelIdx(obj: THREE.Object3D): number {
  for(let i=0; i<appState.loadedModels.length; i++){
    if(!appState.loadedModels[i]) continue;
    if(obj === appState.loadedModels[i]) return i;
    let found = false;
    appState.loadedModels[i]!.traverse(ch => { if(ch === obj) found = true; });
    if(found) return i;
  }
  return -1;
}

// ══ Compare ══
window.runCompare=async function(){
  if(!appState.loadedModels[0]||!appState.loadedModels[1])return;
  // Mutex: exit colorize mode before running compare (they both manipulate
  // base materials + create subsets; two at once would leave a broken state).
  if(appState.colorize.active){try{(window as any).colorizeClear()}catch(e){}}
  const lo=document.getElementById('loadOv')!,lt=document.getElementById('loadTxt')!,lf=document.getElementById('loadFill')! as HTMLElement;
  lo.classList.add('on');lt.textContent='Extracting Version A properties...';(lf as HTMLElement).style.width='10%';
  try{
    const pA=await getAllProps((appState.loadedModels[0] as any).modelID);
    lt.textContent='Extracting Version B properties...';(lf as HTMLElement).style.width='40%';
    const pB=await getAllProps((appState.loadedModels[1] as any).modelID);

    // ── Filter by selected categories if any ──
    let filteredA: Record<string, any>=pA, filteredB: Record<string, any>=pB;
    if(appState.activeCategories.size>0&&!appState.activeCategories.has('__none__')){
      filteredA={};filteredB={};
      for(const[gid,e]of Object.entries(pA)){
        if(appState.activeCategories.has((e as any).type))filteredA[gid]=e;
      }
      for(const[gid,e]of Object.entries(pB)){
        if(appState.activeCategories.has((e as any).type))filteredB[gid]=e;
      }
      log('Category filter applied: A='+Object.keys(filteredA).length+'/'+Object.keys(pA).length+', B='+Object.keys(filteredB).length+'/'+Object.keys(pB).length);
    }

    lt.textContent='Comparing...';(lf as HTMLElement).style.width='70%';await new Promise(r=>setTimeout(r,50));
    appState.compareResult=computeDiff(filteredA,filteredB);
    lt.textContent=`Done! ${(appState.compareResult as any).added.length+(appState.compareResult as any).removed.length+(appState.compareResult as any).modified.length} changes`;(lf as HTMLElement).style.width='100%';
    await new Promise(r=>setTimeout(r,300));

    // ── Color-coded subsets per entity status ──
    await applyDiffColors();
    (window as any).showResultsUI();
    saveCompareResultToCloud();
  }catch(e: any){log('Compare err:',e.message);lt.textContent='Error: '+e.message}
  lo.classList.remove('on');
};

// Applies a compare result fetched from cloud storage (Phase 15 restore) —
// same rendering path as a live runCompare(), minus the property extraction.
export async function restoreCompareResult(result: any): Promise<void> {
  appState.compareResult = result;
  await applyDiffColors();
  (window as any).showResultsUI();
}

// Best-effort background persist of the just-computed compare result — no-op
// for local (non-cloud) projects, never blocks/errors the UI on failure.
function saveCompareResultToCloud(): void {
  const projectId = appState.activeCloudProjectId;
  const result = appState.compareResult;
  if (!projectId || !result) return;
  const user = (window as any).getAuthUser?.();
  const signature = buildModelSignature(appState.files);
  const counts = formatCompareCounts(result as any);
  const metadata = buildResultMetadata(user?.email || '', counts, signature);
  saveResult(projectId, 'compare', result, metadata).catch(e => console.warn('[cloud-results] saveCompareResultToCloud failed:', e));
}

// createSubset() keys each subset by (modelID, material.uuid, customID) — since
// applyDiffColors() builds a fresh material every run, re-running Compare never
// reuses the previous subsetID, so the old 'added'/'removed'/'modified-*'/
// 'unchanged-*' meshes are orphaned rather than replaced. Sweep them out (and
// dispose their geometry/material) before creating the new set.
function disposeDiffSubsets(): void {
  const stale = appState.scene.children.filter((c: any) => c.userData?.diffSubset);
  stale.forEach((sub: any) => {
    appState.scene.remove(sub);
    disposeModel(sub);
  });
}

async function applyDiffColors(): Promise<void> {
  const r=appState.compareResult as any;
  disposeDiffSubsets();

  // Backup original materials before modifying
  [0,1].forEach(i=>{if(appState.loadedModels[i])appState.loadedModels[i]!.traverse(c=>{if((c as any).isMesh){
    if(!c.userData._origMaterials){
      c.userData._origMaterials=Array.isArray((c as any).material)?(c as any).material.map((m: any)=>m.clone()):(c as any).material.clone();
    }
  }})});

  // Make both models very faded
  [0,1].forEach(i=>{if(appState.loadedModels[i])appState.loadedModels[i]!.traverse(c=>{if((c as any).isMesh){const ms=Array.isArray((c as any).material)?(c as any).material:[(c as any).material];ms.forEach((m: any)=>{m.color=new THREE.Color(0xc0c4cc);m.transparent=true;m.opacity=0.15;m.depthWrite=false;m.needsUpdate=true})}})});

  // Create colored subsets for changed entities
  const matAdd=new THREE.MeshPhongMaterial({color:0x16a34a,transparent:false,opacity:1.0,side:THREE.DoubleSide,depthWrite:true,clippingPlanes:appState.clipPlanes});
  const matRem=new THREE.MeshPhongMaterial({color:0xdc2626,transparent:true,opacity:0.7,side:THREE.DoubleSide,depthWrite:true,clippingPlanes:appState.clipPlanes});
  const matMod=new THREE.MeshPhongMaterial({color:0xf59e0b,transparent:false,opacity:1.0,side:THREE.DoubleSide,depthWrite:true,clippingPlanes:appState.clipPlanes});
  const matUnch=new THREE.MeshPhongMaterial({color:0xd1d5db,transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false,clippingPlanes:appState.clipPlanes});

  // Collect expressIDs per status for each model
  const addedIDs=r.added.map((e: any)=>e.entity.expressID);
  const removedIDs=r.removed.map((e: any)=>e.entity.expressID);
  const modifiedIDsA=r.modified.map((e: any)=>e.a.expressID);
  const modifiedIDsB=r.modified.map((e: any)=>e.b.expressID);
  const unchangedIDsA=r.unchanged.map((e: any)=>e.a.expressID);
  const unchangedIDsB=r.unchanged.map((e: any)=>e.b.expressID);

  log('Creating subsets: added='+addedIDs.length+', removed='+removedIDs.length+', modified='+modifiedIDsA.length+', unchanged='+unchangedIDsA.length);

  // Helper to create subset and position it
  const makeSub=(modelIdx: number,ids: number[],mat: any,name: string)=>{
    if(!ids.length)return null;
    try{
      const sub=appState.ifcLoader.ifcManager.createSubset({
        modelID:(appState.loadedModels[modelIdx] as any).modelID,
        ids:ids,
        material:mat,
        scene:appState.scene,
        removePrevious:false,
        customID:name,
      });
      if(sub){
        sub.position.copy(appState.loadedModels[modelIdx]!.position);
        sub.updateMatrixWorld(true);
        sub.userData.diffSubset=name;
        sub.userData.srcModelIdx=modelIdx;
        // Propagate srcModelIdx to ALL child meshes for picking
        sub.traverse(ch=>{if((ch as any).isMesh){ch.userData.srcModelIdx=modelIdx;ch.userData.diffSubset=name}});
        log('Subset '+name+': created with '+ids.length+' elements for model '+modelIdx);
      }else{
        log('Subset '+name+': createSubset returned null');
      }
      return sub;
    }catch(e: any){log('Subset error ('+name+'):',e.message);return null}
  };

  // Added: only in model B (green solid)
  makeSub(1,addedIDs,matAdd,'added');
  // Removed: only in model A (red semi-transparent) — must stay visible even when model A is hidden
  const removedSub=makeSub(0,removedIDs,matRem,'removed');
  if(removedSub)removedSub.visible=true; // Force visible
  // Modified: show in model B (orange solid)
  makeSub(1,modifiedIDsB,matMod,'modified-b');
  // Modified: also show old position in model A (orange transparent) for comparison
  if(modifiedIDsA.length>0){
    const matModA=new THREE.MeshPhongMaterial({color:0xf59e0b,transparent:true,opacity:0.35,side:THREE.DoubleSide,depthWrite:false,clippingPlanes:appState.clipPlanes});
    const modSubA=makeSub(0,modifiedIDsA,matModA,'modified-a');
    if(modSubA)modSubA.visible=true; // Force visible even when model A hidden
  }
  // Unchanged: show in model B (gray very transparent)
  makeSub(1,unchangedIDsB,matUnch,'unchanged-b');

  // Model A: very faded (removed elements shown via separate subset above)
  if(appState.loadedModels[0]){
    appState.loadedModels[0].visible=true;
    appState.loadedModels[0].traverse(c=>{if((c as any).isMesh){const ms=Array.isArray((c as any).material)?(c as any).material:[(c as any).material];ms.forEach((m: any)=>{m.color=new THREE.Color(0xc0c4cc);m.opacity=0.04;m.transparent=true;m.depthWrite=false;m.needsUpdate=true})}});
  }
  // Model B: very faded (changed elements shown via subsets)
  if(appState.loadedModels[1])appState.loadedModels[1].traverse(c=>{if((c as any).isMesh){const ms=Array.isArray((c as any).material)?(c as any).material:[(c as any).material];ms.forEach((m: any)=>{m.opacity=0.04;m.transparent=true;m.depthWrite=false;m.needsUpdate=true})}});
}

async function getAllProps(modelID: number): Promise<Record<string, any>> {
  const props: Record<string, any>={};
  const api=(appState.ifcLoader.ifcManager as any).state.api;

  // Product type constants - comprehensive list including MEP/Electrical.
  // Spatial structure types (IfcSite, IfcBuilding, IfcBuildingStorey, IfcProject,
  // IfcSpace) are INTENTIONALLY EXCLUDED — they are abstract containers without
  // physical geometry. Revit regenerates their GlobalIds on every IFC export,
  // which would produce phantom "modified" issues that can't be zoomed to.
  // Industry-standard BIM compare tools (Solibri, BIMcollab Zoom) exclude them.
  const PRODUCT_TYPES=new Set([
    IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM,
    IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
    IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING,
    IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT,
    IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING,
    // Numeric IFC type codes for MEP/Electrical/Plumbing
    3512223829,3588315303,1051757585,3999819293,753842376,
    2082059205,3304561284,2979338954,331165859,4252922144,
    763608111,90941305,3026737570,626022354,1469388950,
    1281925730,2058353004,4136498852,3171933400,1758889154,
    4237592921,987401354,3132237377,3024970846,3283111854,
    1687234759,900683007,1973544240,25142252,
    // Distribution elements (MEP)
    1945004755, // IfcDistributionElement
    3040386961, // IfcDistributionFlowElement
    3132237377, // IfcFlowStorageDevice
    3508470533, // IfcFlowTreatmentDevice
    2058353004, // IfcFlowController
    4278956645, // IfcFlowMovingDevice
    1658829314, // IfcEnergyConversionDevice
    // Electrical
    402227799,  // IfcElectricDistributionBoard (IFC4)
    1634111441, // IfcElectricAppliance
    264262732,  // IfcElectricGenerator
    3310460725, // IfcElectricMotor
    // Additional common types
    1335981549, // IfcDiscreteAccessory
    843113511,  // IfcColumn (alternate)
    2391368822, // IfcBuildingElementProxy (alternate code)
    3493046030, // IfcDistributionPort
    3415622556, // IfcDistributionChamberElement
    900683007,  // IfcFooting (alternate)
    819412036,  // IfcFilter
    342316401,  // IfcDuctFitting
    3518393246, // IfcDuctSegment
    1360408905, // IfcDuctSilencer
    1904799276, // IfcElectricFlowStorageDevice
    862014818,  // IfcElectricTimeControl
    1426591983, // IfcFireSuppressionTerminal
    4074379575, // IfcHumidifier
    2176052936, // IfcJunctionBox
    76236018,   // IfcLamp
    629592764,  // IfcLightFixture
    1437502449, // IfcMedicalDevice
    707683696,  // IfcOutlet
    310824031,  // IfcPipeFitting (correct code; was wrongly listed as 3132237377)
    3612865200, // IfcPipeSegment
    3640358203, // IfcProtectiveDevice
    2295281155, // IfcProtectiveDeviceTrippingUnit
    90941305,   // IfcPump
    2474470126, // IfcSanitaryTerminal
    1973544240, // IfcSensor
    3825984169, // IfcTransformer
    3026737570, // IfcTubeBundle
    4207607924, // IfcValve
    2391406946, // IfcWasteTerminal
  ].filter(Boolean));

  // Defensive: even if a spatial type slips into PRODUCT_TYPES above,
  // reject any entity that lacks Representation (3D geometry). This mirrors the
  // check in Method 2 and guarantees issues always have something to zoom to.
  const SPATIAL_TYPES=new Set([IFCSITE,IFCBUILDING,IFCBUILDINGSTOREY,IFCPROJECT,IFCSPACE].filter(Boolean));

  // METHOD 1: Scan by type
  let found=0;
  const typeCounts: Record<string, number>={};
  for(const typeNum of PRODUCT_TYPES){
    // Hard skip spatial types in case the list gets edited later
    if(SPATIAL_TYPES.has(typeNum))continue;
    try{
      const lines=api.GetLineIDsWithType(modelID,typeNum);
      const cnt=lines.size();
      if(cnt===0)continue;
      const typeName=IFC_NAMES[typeNum]||('IFC_'+typeNum);
      typeCounts[typeName]=(typeCounts[typeName]||0)+cnt;
      for(let i=0;i<cnt;i++){
        const eid=lines.get(i);
        try{
          const p=await appState.ifcLoader.ifcManager.getItemProperties(modelID,eid,false);
          if(p?.GlobalId?.value){
            // Defensive: only add entities that have actual 3D geometry.
            // Prevents abstract containers (sans Representation) from becoming
            // issues that can't be zoomed to. Mirrors the check in Method 2.
            if(!p.Representation)continue;
            props[p.GlobalId.value]={expressID:eid,globalId:p.GlobalId.value,type:typeName,name:p.Name?.value||'',description:p.Description?.value||'',objectType:p.ObjectType?.value||'',tag:p.Tag?.value||'',
              // Direct IFC attributes the SG validator reads (OverallWidth/Height on
              // doors/windows, PredefinedType on slabs, LongName on spaces). p is already
              // fetched so this is free; kept raw ({value}) since rules read `.value`.
              OverallWidth:p.OverallWidth,OverallHeight:p.OverallHeight,PredefinedType:p.PredefinedType,LongName:p.LongName};
            found++;
          }
        }catch(e){}
      }
    }catch(e){}
  }

  log(`getAllProps method1 (by type): found ${found} entities`);
  log('  Types: '+Object.entries(typeCounts).map(([t,c])=>t+'='+c).join(', '));

  // METHOD 2: Always scan ALL lines to catch entities with types not in PRODUCT_TYPES
  // This ensures we never miss elements due to unknown IFC type codes
  // Skip non-physical/internal types that shouldn't be compared
  const SKIP_TYPES=new Set([
    3041715199, // IfcDistributionPort — internal connection point, no geometry
    4086658281, // IfcRelConnectsPortToElement
    3190031847, // IfcRelConnectsPorts
    2565941209, // IfcRelConnectsElements
    1204542856, // IfcRelConnectsWithRealizingElements
    826625072,  // IfcRelAssigns
    2851387026, // IfcRelAssociatesMaterial
    982818633,  // IfcRelAssociatesClassification
    2728634034, // IfcRelAssociatesDocument
    919958153,  // IfcRelAssociatesProfileProperties
    4095574036, // IfcRelAssociatesApproval
    2043862942, // IfcRelAssociatesConstraint
    IFCSPACE,   // IfcSpace — room volumes, not physical
    IFCOPENINGELEMENT, // IfcOpeningElement — void geometry
    IFCSITE,IFCBUILDING,IFCBUILDINGSTOREY,IFCPROJECT, // Spatial structure
    // ── Geometry / topology / resource / relationship families ──────────
    // These dominate a real IFC file by line count (a faceted-BREP model is
    // mostly IfcCartesianPoint / IfcPolyLoop / IfcFace…). None are physical
    // products, so skipping them via the cheap GetLineType check BELOW avoids
    // hundreds of thousands of expensive getItemProperties() WASM round-trips —
    // the single biggest cost of Compare/Validate on a large model. Any type
    // NOT listed here still gets parsed, so genuinely unknown product types are
    // never missed (the original safety-net intent of Method 2 is preserved).
    IFCCARTESIANPOINT, IFCCARTESIANPOINTLIST2D, IFCCARTESIANPOINTLIST3D,
    IFCDIRECTION, IFCVECTOR, IFCVERTEXPOINT, IFCPOLYLOOP, IFCFACE,
    IFCFACEOUTERBOUND, IFCFACEBOUND, IFCCLOSEDSHELL, IFCOPENSHELL,
    IFCFACETEDBREP, IFCTRIANGULATEDFACESET, IFCPOLYGONALFACESET,
    IFCINDEXEDPOLYGONALFACE, IFCINDEXEDPOLYGONALFACEWITHVOIDS,
    IFCAXIS2PLACEMENT2D, IFCAXIS2PLACEMENT3D, IFCLOCALPLACEMENT,
    IFCCARTESIANTRANSFORMATIONOPERATOR3D, IFCSHAPEREPRESENTATION,
    IFCPRODUCTDEFINITIONSHAPE, IFCEXTRUDEDAREASOLID, IFCARBITRARYCLOSEDPROFILEDEF,
    IFCARBITRARYPROFILEDEFWITHVOIDS, IFCRECTANGLEPROFILEDEF, IFCCIRCLEPROFILEDEF,
    IFCISHAPEPROFILEDEF, IFCPOLYLINE, IFCMAPPEDITEM, IFCREPRESENTATIONMAP,
    IFCSTYLEDITEM, IFCSURFACESTYLE, IFCCOLOURRGB, IFCPRESENTATIONSTYLEASSIGNMENT,
    IFCSURFACESTYLERENDERING, IFCPROPERTYSINGLEVALUE, IFCPROPERTYSET,
    IFCELEMENTQUANTITY, IFCQUANTITYLENGTH, IFCQUANTITYAREA, IFCQUANTITYVOLUME,
    IFCPROPERTYENUMERATEDVALUE, IFCCOMPLEXPROPERTY, IFCMATERIAL, IFCMATERIALLAYER,
    IFCMATERIALLAYERSET, IFCMATERIALLAYERSETUSAGE, IFCGEOMETRICREPRESENTATIONCONTEXT,
    IFCPROPERTYBOUNDEDVALUE, IFCPROPERTYLISTVALUE, IFCOWNERHISTORY, IFCPERSON,
    IFCORGANIZATION, IFCPERSONANDORGANIZATION, IFCAPPLICATION,
  ].filter(Boolean));

  try{
    const allLines=api.GetAllLines(modelID);
    const total=allLines.size();
    let extra=0;
    for(let i=0;i<total;i++){
      const eid=allLines.get(i);
      try{
        // Skip known non-physical types early
        let lineType=0;
        try{lineType=api.GetLineType(modelID,eid)}catch(e){}
        if(SKIP_TYPES.has(lineType))continue;

        const p=await appState.ifcLoader.ifcManager.getItemProperties(modelID,eid,false);
        if(!p?.GlobalId?.value)continue;
        if(props[p.GlobalId.value])continue; // Already found by Method 1
        // Must have Representation (actual 3D geometry) — not just ObjectPlacement
        if(p.Representation){
          let typeName='Unknown';
          try{typeName=IFC_NAMES[lineType]||('IFC_'+lineType)}catch(e){}
          props[p.GlobalId.value]={expressID:eid,globalId:p.GlobalId.value,type:typeName,name:p.Name?.value||'',description:p.Description?.value||'',objectType:p.ObjectType?.value||'',tag:p.Tag?.value||'',
              // Direct IFC attributes the SG validator reads (OverallWidth/Height on
              // doors/windows, PredefinedType on slabs, LongName on spaces). p is already
              // fetched so this is free; kept raw ({value}) since rules read `.value`.
              OverallWidth:p.OverallWidth,OverallHeight:p.OverallHeight,PredefinedType:p.PredefinedType,LongName:p.LongName};
          extra++;found++;
        }
      }catch(e){}
    }
    if(extra>0)log(`getAllProps method2 (full scan): found ${extra} additional entities (types not in predefined list)`);
  }catch(e: any){log('getAllProps method2 error:',e.message)}

  return props;
}

// computeGeometryHashes() used to be duplicated here — moved to
// lib/geometry-hash.ts (imported by compare.ts, the only caller) so both
// halves of Compare share one implementation instead of two that could drift.

// ── Expose cross-module callers on window ──
// window.getAllProps (AI index), window.findModelIdx (pick), window.fedRenderSlots
// (federation UI) are called from other modules.
Object.assign(window as any, { fedRenderSlots, findModelIdx, getAllProps });
