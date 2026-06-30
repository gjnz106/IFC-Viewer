import * as THREE from 'three';
import {
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM,
  IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING,
  IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING,
  IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT,
  IFCSPACE, IFCOPENINGELEMENT,
} from 'web-ifc';
import { appState } from '../../store/index.js';
import { FED_COLORS, IFC_NAMES } from '../../lib/constants.js';
import { runCompare as computeDiff } from './compare.js';

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
  })().catch((e: unknown)=>console.error('fedHandleFile error:', e));
  // Reset input so same file can be reloaded
  (ev.target as HTMLInputElement).value = '';
};

window.fedRemoveSlot = function(idx: number){
  if(idx < 2) return;
  if(appState.loadedModels[idx]){
    appState.scene.remove(appState.loadedModels[idx]!);
    appState.loadedModels[idx] = null;
  }
  appState.files[idx] = null;
  if(window._colorizeInvalidate) window._colorizeInvalidate(idx);
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
  appState.loadedModels[idx]!.visible = chk?.checked ?? true;
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
    html += `<div class="fed-slot ${loaded?'loaded':''}">
      <div class="fed-slot-color" style="background:${color}"></div>
      <div class="fed-slot-info">
        <div class="fed-slot-name" title="${(window as any).escapeHtml(fname)}">${(window as any).escapeHtml(fname)}</div>
        <div class="fed-slot-status"><span style="${statusCls}">${statusText}</span> ${size}</div>
      </div>
      <input type="checkbox" class="fed-slot-vis" id="fedVis${i}" ${loaded?'checked':''} onchange="fedToggleVis(${i})" title="Toggle visibility">
      <button class="fed-slot-rm" onclick="fedRemoveSlot(${i})" title="Remove this file">✕</button>
    </div>`;
  }
  container.innerHTML = html;
}

// Helper: get total number of loaded models (any slot)
export function getLoadedModelCount(): number {
  return appState.loadedModels.filter(m=>!!m).length;
}

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
      (window as any).log('Category filter applied: A='+Object.keys(filteredA).length+'/'+Object.keys(pA).length+', B='+Object.keys(filteredB).length+'/'+Object.keys(pB).length);
    }

    lt.textContent='Comparing...';(lf as HTMLElement).style.width='70%';await new Promise(r=>setTimeout(r,50));
    appState.compareResult=computeDiff(filteredA,filteredB);
    lt.textContent=`Done! ${(appState.compareResult as any).added.length+(appState.compareResult as any).removed.length+(appState.compareResult as any).modified.length} changes`;(lf as HTMLElement).style.width='100%';
    await new Promise(r=>setTimeout(r,300));

    // ── Color-coded subsets per entity status ──
    await applyDiffColors();
    (window as any).showResultsUI();
  }catch(e: any){(window as any).log('Compare err:',e.message);lt.textContent='Error: '+e.message}
  lo.classList.remove('on');
};

async function applyDiffColors(): Promise<void> {
  const r=appState.compareResult as any;

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

  (window as any).log('Creating subsets: added='+addedIDs.length+', removed='+removedIDs.length+', modified='+modifiedIDsA.length+', unchanged='+unchangedIDsA.length);

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
        (window as any).log('Subset '+name+': created with '+ids.length+' elements for model '+modelIdx);
      }else{
        (window as any).log('Subset '+name+': createSubset returned null');
      }
      return sub;
    }catch(e: any){(window as any).log('Subset error ('+name+'):',e.message);return null}
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
            props[p.GlobalId.value]={expressID:eid,globalId:p.GlobalId.value,type:typeName,name:p.Name?.value||'',description:p.Description?.value||'',objectType:p.ObjectType?.value||'',tag:p.Tag?.value||''};
            found++;
          }
        }catch(e){}
      }
    }catch(e){}
  }

  (window as any).log(`getAllProps method1 (by type): found ${found} entities`);
  (window as any).log('  Types: '+Object.entries(typeCounts).map(([t,c])=>t+'='+c).join(', '));

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
          props[p.GlobalId.value]={expressID:eid,globalId:p.GlobalId.value,type:typeName,name:p.Name?.value||'',description:p.Description?.value||'',objectType:p.ObjectType?.value||'',tag:p.Tag?.value||''};
          extra++;found++;
        }
      }catch(e){}
    }
    if(extra>0)(window as any).log(`getAllProps method2 (full scan): found ${extra} additional entities (types not in predefined list)`);
  }catch(e: any){(window as any).log('getAllProps method2 error:',e.message)}

  return props;
}

// ══ Geometry Hash — detect shape/position changes per element ══
export function computeGeometryHashes(modelIdx: number): Record<number, any> {
  const hashes: Record<number, any>={};
  const model=appState.loadedModels[modelIdx];
  if(!model)return hashes;

  model.traverse(c=>{
    if(!(c as any).isMesh||!(c as any).geometry?.attributes?.expressID||!(c as any).geometry?.attributes?.position)return;
    const eidArr=(c as any).geometry.attributes.expressID.array;
    const posArr=(c as any).geometry.attributes.position.array;

    // Group vertices by expressID
    const eidVerts: Record<number, any>={};
    for(let i=0;i<eidArr.length;i++){
      const eid=eidArr[i];
      if(!eid||eid<=0)continue;
      if(!eidVerts[eid])eidVerts[eid]={verts:[],count:0,mnX:Infinity,mnY:Infinity,mnZ:Infinity,mxX:-Infinity,mxY:-Infinity,mxZ:-Infinity};
      const ev=eidVerts[eid];
      const pi=i*3;
      if(pi+2>=posArr.length)continue;
      const x=posArr[pi],y=posArr[pi+1],z=posArr[pi+2];
      if(isNaN(x))continue;
      ev.count++;
      // Track bounding box
      if(x<ev.mnX)ev.mnX=x;if(x>ev.mxX)ev.mxX=x;
      if(y<ev.mnY)ev.mnY=y;if(y>ev.mxY)ev.mxY=y;
      if(z<ev.mnZ)ev.mnZ=z;if(z>ev.mxZ)ev.mxZ=z;
      // Sample some vertices for hash (not all — too slow for large models)
      if(ev.verts.length<50) ev.verts.push(Math.round(x*100),Math.round(y*100),Math.round(z*100));
    }

    // Build hash per expressID
    for(const[eid,ev]of Object.entries(eidVerts)){
      const sx=((ev as any).mxX-(ev as any).mnX).toFixed(2);
      const sy=((ev as any).mxY-(ev as any).mnY).toFixed(2);
      const sz=((ev as any).mxZ-(ev as any).mnZ).toFixed(2);
      const cx=(((ev as any).mnX+(ev as any).mxX)/2).toFixed(2);
      const cy=(((ev as any).mnY+(ev as any).mxY)/2).toFixed(2);
      const cz=(((ev as any).mnZ+(ev as any).mxZ)/2).toFixed(2);

      // Hash combines: vertex count + sampled vertex positions + bbox
      const hashStr=(ev as any).verts.join(',')+`|${(ev as any).count}|${sx},${sy},${sz}`;
      let hash=0;
      for(let i=0;i<hashStr.length;i++){hash=((hash<<5)-hash)+hashStr.charCodeAt(i);hash|=0}

      hashes[parseInt(eid)]={
        vertCount:(ev as any).count,
        hash:hash,
        bboxStr:`${sx}×${sy}×${sz} @(${cx},${cy},${cz})`,
        size:{x:parseFloat(sx),y:parseFloat(sy),z:parseFloat(sz)},
        center:{x:parseFloat(cx),y:parseFloat(cy),z:parseFloat(cz)}
      };
    }
  });

  return hashes;
}

// ── Expose cross-module callers on window ──
// window.getAllProps (AI index), window.findModelIdx (pick), window.fedRenderSlots
// (federation UI) are called from other modules.
Object.assign(window as any, { fedRenderSlots, findModelIdx, getAllProps });
