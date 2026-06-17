// ── Saved color schemes (LocalStorage) ────────────────────────────────
// Schemes persist in the browser (per-origin) under a single JSON blob.
// Each scheme captures mode + rules + Auto-mode value-color overrides, so
// loading restores the exact coloring the user set up previously.

import * as THREE from 'three';
import { appState } from '../state/index.js';
import { log } from './ifc-category.js';
import { colorizeDisposeSubsets, colorizeFadeBase } from './colorize.js';

const CZ_STORAGE_KEY = 'ifc-delta-color-schemes-v1';

let hiddenExpressIDs = new Set<string>();
let hiddenTypes = new Set<string>();
let isolatedIDs: Set<number> | null = null;
let visSubsets: THREE.Object3D[] = [];

// Section box drag state (used by initSectionDrag, defined in section module)
let sectionBox: THREE.Object3D | null = null;
let dragHandle: THREE.Object3D | null = null;
let dragPlane: THREE.Plane | null = null;
let dragStart: THREE.Vector3 | null = null;

// ══ Lightweight single-element BBox ══
export function getElementBBox(modelIdx: number, expressID: number): {size:{x:number;y:number;z:number};center:{x:number;y:number;z:number}} | null {
  let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
  let found=false;
  const scan=(mesh: any)=>{
    if(!mesh.geometry?.attributes?.expressID||!mesh.geometry?.attributes?.position)return;
    const eids=mesh.geometry.attributes.expressID.array;
    const pos=mesh.geometry.attributes.position.array;
    const wm=mesh.matrixWorld;
    const v=new THREE.Vector3();
    for(let i=0;i<eids.length;i++){
      if(eids[i]!==expressID)continue;
      const pi=i*3;
      if(pi+2>=pos.length||isNaN(pos[pi]))continue;
      v.set(pos[pi],pos[pi+1],pos[pi+2]).applyMatrix4(wm);
      if(isNaN(v.x))continue;
      mnX=Math.min(mnX,v.x);mxX=Math.max(mxX,v.x);
      mnY=Math.min(mnY,v.y);mxY=Math.max(mxY,v.y);
      mnZ=Math.min(mnZ,v.z);mxZ=Math.max(mxZ,v.z);
      found=true;
    }
  };
  // Scan loaded model and all scene meshes
  if(appState.loadedModels[modelIdx])appState.loadedModels[modelIdx]!.traverse((c: any)=>{if(c.isMesh)scan(c)});
  appState.scene.traverse((c: any)=>{if(c.isMesh&&c.userData?.srcModelIdx===modelIdx)scan(c)});

  if(!found)return null;
  return{
    size:{x:mxX-mnX,y:mxY-mnY,z:mxZ-mnZ},
    center:{x:(mnX+mxX)/2,y:(mnY+mxY)/2,z:(mnZ+mxZ)/2}
  };
}

// ══ Context Menu Actions ══

window.ctxAction=function(action: string){
  const menu=document.getElementById('ctxMenu')!;
  menu.classList.remove('show');
  console.log('[CTX] action='+action, 'ctxTarget=', appState.ctxTarget);

  if(action==='showAll'){showAllHidden();return}
  if(!appState.ctxTarget){console.log('[CTX] no target, abort');return}

  const eid=appState.ctxTarget.expressID;
  const mi=appState.ctxTarget.modelIdx;
  const bbox=appState.ctxTarget.bbox;
  const typeName=appState.ctxTarget.typeName;
  console.log('[CTX] eid='+eid, 'mi='+mi, 'bbox=', bbox, 'type='+typeName);

  if(action==='hide'){hideExpressID(eid,mi);return}
  if(action==='isolate'){isolateExpressID(eid,mi);return}
  if(action==='hideType'&&typeName){hideByType(typeName);return}
  if(action==='isolateType'&&typeName){isolateByType(typeName,mi);return}
  if(action==='sectionFit'&&bbox){sectionAroundElement(bbox);return}
  if(action==='sectionPlane'){(window as any).sectionPlanParallelToFace&&(window as any).sectionPlanParallelToFace();return}
  if(action==='zoom'&&bbox){(window as any).zoomToElement&&(window as any).zoomToElement(bbox);return}
  if(action==='props'&&eid!=null&&mi>=0){
    appState.ifcLoader.ifcManager.getItemProperties((appState.loadedModels[mi] as any).modelID,eid,true).then((p: any)=>{if(p)(window as any).showProps(p,mi)});
    return;
  }
  console.log('[CTX] action not handled or missing data');
};

function hideExpressID(eid: number, mi: number): void {
  console.log('[HIDE] eid='+eid+' mi='+mi);
  if(!appState.ifcLoader||!appState.loadedModels[mi])return;

  // Add to hidden set with model-aware key
  hiddenExpressIDs.add(mi+'_'+eid);

  // In compare mode, rebuild diff subsets; otherwise rebuild visibility subset
  if(appState.compareResult){(window as any).applyCatVis&&(window as any).applyCatVis()}else{rebuildModelSubset(mi)}
  document.getElementById('btnShowAll')!.style.display='';
}

function hideByType(typeName: string): void {
  console.log('[HIDE TYPE]',typeName);
  const catIDs=(window as any)._catModelIDs||{};
  const ids=catIDs[typeName];
  if(ids){
    for(let mi=0;mi<2;mi++){
      if(ids[mi]&&ids[mi].length>0){
        ids[mi].forEach((id: number)=>hiddenExpressIDs.add(mi+'_'+id));
        if(appState.compareResult){(window as any).applyCatVis&&(window as any).applyCatVis()}else{rebuildModelSubset(mi)}
      }
    }
  }
  document.getElementById('btnShowAll')!.style.display='';
}

// Central function to rebuild visibility subset for a model
export function rebuildModelSubset(mi: number): void {
  if(!appState.ifcLoader||!appState.loadedModels[mi])return;

  const allIDs=getAllExpressIDsForModel(mi);
  let showIDs=allIDs;

  // Apply isolated filter
  if(isolatedIDs){
    showIDs=showIDs.filter(id=>isolatedIDs!.has(id));
  }
  // Remove hidden IDs for THIS specific model (keys are 'mi_eid')
  if(hiddenExpressIDs.size>0){
    showIDs=showIDs.filter(id=>!hiddenExpressIDs.has(mi+'_'+id));
  }

  const hiddenCount=allIDs.length-showIDs.length;
  console.log('[REBUILD] model='+mi+' total='+allIDs.length+' hidden='+hiddenCount+' showing='+showIDs.length);

  // Remove old vis subsets for this model
  visSubsets=visSubsets.filter(s=>{
    if((s as any).userData?.srcModelIdx===mi){if(s.parent)s.parent.remove(s);return false}
    return true;
  });

  // Hide base model
  appState.loadedModels[mi]!.visible=false;

  if(showIDs.length===0)return;

  // If no filter active, just show original
  if(!isolatedIDs&&hiddenCount===0){
    appState.loadedModels[mi]!.visible=true;
    return;
  }

  try{
    const sub=appState.ifcLoader.ifcManager.createSubset({modelID:(appState.loadedModels[mi] as any).modelID,ids:showIDs,removePrevious:true,customID:'vis_'+mi,scene:appState.scene});
    if(sub){
      sub.position.copy(appState.loadedModels[mi]!.position);sub.updateMatrixWorld(true);
      sub.userData.srcModelIdx=mi;
      sub.traverse((c: any)=>{if(c.isMesh){c.userData.srcModelIdx=mi;const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach((m: any)=>{m.clippingPlanes=appState.clipPlanes;m.side=THREE.DoubleSide})}});
      visSubsets.push(sub);
      console.log('[REBUILD] subset created ok');
    }
  }catch(e){console.error('[REBUILD] error:',e)}
}

function isolateExpressID(eid: number, mi: number): void {
  console.log('[ISOLATE] eid='+eid+' mi='+mi);
  isolatedIDs=new Set([eid]);
  for(let i=0;i<2;i++){
    if(!appState.loadedModels[i])continue;
    rebuildModelSubset(i);
  }
  document.getElementById('btnShowAll')!.style.display='';
}

function isolateByType(typeName: string, mi: number): void {
  console.log('[ISOLATE TYPE]',typeName);
  const catIDs=(window as any)._catModelIDs||{};
  isolatedIDs=new Set<number>();
  const ids=catIDs[typeName];
  if(ids){for(let i=0;i<2;i++){if(ids[i])ids[i].forEach((id: number)=>isolatedIDs!.add(id))}}
  for(let i=0;i<2;i++){if(appState.loadedModels[i])rebuildModelSubset(i)}
  document.getElementById('btnShowAll')!.style.display='';
}

// Get all expressIDs from a model by scanning geometry
function getAllExpressIDsForModel(mi: number): number[] {
  const ids=new Set<number>();
  if(!appState.loadedModels[mi])return[];
  appState.loadedModels[mi]!.traverse((c: any)=>{
    if(c.isMesh&&c.geometry?.attributes?.expressID){
      const arr=c.geometry.attributes.expressID.array;
      for(let i=0;i<arr.length;i++){if(arr[i]>0)ids.add(arr[i])}
    }
  });
  return[...ids];
}

export function showAllHidden(): void {
  console.log('[SHOW ALL]');
  hiddenExpressIDs.clear();
  hiddenTypes.clear();
  isolatedIDs=null;

  visSubsets.forEach(s=>{if(s.parent)s.parent.remove(s)});
  visSubsets=[];

  const visA=(document.getElementById('visA') as HTMLInputElement|null)?.checked??true;
  const visB=(document.getElementById('visB') as HTMLInputElement|null)?.checked??true;
  if(appState.loadedModels[0])appState.loadedModels[0].visible=visA;
  if(appState.loadedModels[1])appState.loadedModels[1].visible=visB;

  if(appState.compareResult)(window as any).applyCatVis&&(window as any).applyCatVis();
  else if(typeof (window as any).applyCategoryVisibilityViewMode==='function')(window as any).applyCategoryVisibilityViewMode();

  document.getElementById('btnShowAll')!.style.display='none';
}
window.showAllHidden=showAllHidden;

function sectionThroughElement(bbox: {center:{x:number;y:number;z:number};size:{x:number;y:number;z:number}}, axis: string): void {
  console.log('[SECTION] axis='+axis, 'bbox=', bbox);
  if(!bbox){console.log('[SECTION] no bbox');return}
  const b=appState.modelBounds;
  const c=bbox.center;
  const s=bbox.size;

  // Reset all sliders to full
  ['slXp','slYp','slZp'].forEach(id=>{(document.getElementById(id) as HTMLInputElement).value='100'});
  ['slXn','slYn','slZn'].forEach(id=>{(document.getElementById(id) as HTMLInputElement).value='0'});

  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
  const toSl=(val: number,mn: number,range: number)=>Math.max(0,Math.min(100,Math.round(((val-mn)/range)*100)));

  // Cut through the center of element on specified axis
  // Show a thin slice through the element
  const thickness=Math.max(s.x,s.y,s.z)*0.5+1; // Half element + 1m padding

  if(axis==='x'){
    (document.getElementById('slXp') as HTMLInputElement).value=String(toSl(c.x+thickness,b.min.x,sx));
    (document.getElementById('slXn') as HTMLInputElement).value=String(toSl(c.x-thickness,b.min.x,sx));
  }else if(axis==='y'){
    (document.getElementById('slYp') as HTMLInputElement).value=String(toSl(c.y+thickness,b.min.y,sy));
    (document.getElementById('slYn') as HTMLInputElement).value=String(toSl(c.y-thickness,b.min.y,sy));
  }else{
    (document.getElementById('slZp') as HTMLInputElement).value=String(toSl(c.z+thickness,b.min.z,sz));
    (document.getElementById('slZn') as HTMLInputElement).value=String(toSl(c.z-thickness,b.min.z,sz));
  }

  if(!appState.sectionActive){
    appState.sectionActive=true;
    document.getElementById('sectionPanel')!.classList.add('show');
    document.getElementById('btnSection')!.classList.add('active');
    (window as any).createSectionBox3D&&(window as any).createSectionBox3D();
  }
  (window as any).updateSectionFromSliders&&(window as any).updateSectionFromSliders();
  (window as any).zoomToElement&&(window as any).zoomToElement(bbox);
}

function sectionAroundElement(bbox: {center:{x:number;y:number;z:number};size:{x:number;y:number;z:number}}): void {
  if(!bbox)return;
  const b=appState.modelBounds;
  const c=bbox.center,s=bbox.size;
  // Padding: 30% of element size, min 1m, max 5m — keeps thin elements from
  // hugging the geometry too tight to see context (matches focusIssue rule).
  const pad=Math.max(Math.min(Math.max(s.x,s.y,s.z)*0.3, 5), 1);

  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
  // Directional rounding so X+/X- (and Y, Z) never collapse to the same
  // integer when the element is tiny relative to the project bounds.
  // See focusIssue for the same fix.
  const slUp=(v: number,mn: number,r: number)=>Math.max(0,Math.min(100,Math.ceil( ((v-mn)/r)*100)));
  const slDn=(v: number,mn: number,r: number)=>Math.max(0,Math.min(100,Math.floor(((v-mn)/r)*100)));
  const ensureMin=(lo: number,hi: number,m: number): [number,number]=>{
    if(hi-lo>=m)return [lo,hi];
    const mid=(lo+hi)/2,half=m/2;
    let nlo=Math.max(0,Math.floor(mid-half)), nhi=Math.min(100,Math.ceil(mid+half));
    if(nhi-nlo<m){if(nlo===0)nhi=Math.min(100,nlo+m);else nlo=Math.max(0,nhi-m)}
    return [nlo,nhi];
  };
  let xLo=slDn(c.x-s.x/2-pad,b.min.x,sx), xHi=slUp(c.x+s.x/2+pad,b.min.x,sx);
  let yLo=slDn(c.y-s.y/2-pad,b.min.y,sy), yHi=slUp(c.y+s.y/2+pad,b.min.y,sy);
  let zLo=slDn(c.z-s.z/2-pad,b.min.z,sz), zHi=slUp(c.z+s.z/2+pad,b.min.z,sz);
  [xLo,xHi]=ensureMin(xLo,xHi,2);
  [yLo,yHi]=ensureMin(yLo,yHi,2);
  [zLo,zHi]=ensureMin(zLo,zHi,2);
  (document.getElementById('slXp') as HTMLInputElement).value=String(xHi);
  (document.getElementById('slXn') as HTMLInputElement).value=String(xLo);
  (document.getElementById('slYp') as HTMLInputElement).value=String(yHi);
  (document.getElementById('slYn') as HTMLInputElement).value=String(yLo);
  (document.getElementById('slZp') as HTMLInputElement).value=String(zHi);
  (document.getElementById('slZn') as HTMLInputElement).value=String(zLo);

  if(!appState.sectionActive){
    appState.sectionActive=true;
    document.getElementById('sectionPanel')!.classList.add('show');
    document.getElementById('btnSection')!.classList.add('active');
    (window as any).createSectionBox3D&&(window as any).createSectionBox3D();
  }
  (window as any).updateSectionFromSliders&&(window as any).updateSectionFromSliders();
  (window as any).zoomToElement&&(window as any).zoomToElement(bbox);
}

// initSectionDrag — placeholder export; actual drag logic lives in section-visibility module.
// Exported here so other modules can import from color-schemes as listed in the task spec.
export function initSectionDrag(): void {
  // Section drag initialization is handled by the section-visibility module.
  // This export exists for module wiring compatibility.
}

// Re-export colorizeFadeBase and colorizeDisposeSubsets for modules that import from color-schemes
export { colorizeFadeBase, colorizeDisposeSubsets };
