import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three';
// IFC type code constants from the IFC4 schema (stable numeric values)
const IFCSPACE = 3856911033;
const IFCOPENINGELEMENT = 3588315303;
const IFCPROJECT = 103090709;
const IFCSITE = 4097777520;
const IFCBUILDING = 4031249490;
const IFCBUILDINGSTOREY = 3124254112;
const IFCWALL = 2391406946;
const IFCWALLSTANDARDCASE = 3512223829;
const IFCSLAB = 1529196076;
const IFCCOLUMN = 843113511;
const IFCBEAM = 753842376;
const IFCDOOR = 395920057;
const IFCWINDOW = 3304561284;
const IFCROOF = 2016517767;
const IFCSTAIR = 331165859;
const IFCSTAIRFLIGHT = 4252922144;
const IFCRAILING = 2262370178;
const IFCPLATE = 3171933400;
const IFCMEMBER = 1073191201;
const IFCCURTAINWALL = 3495092785;
const IFCFOOTING = 900683007;
const IFCBUILDINGELEMENTPROXY = 1095909175;
const IFCFURNISHINGELEMENT = 263784265;
const IFCFLOWSEGMENT = 987401354;
const IFCFLOWTERMINAL = 2223149337;
const IFCFLOWFITTING = 4278956645;
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { setStatus } from './focus-highlight.js';
import { fedRenderSlots } from '../compare/federation-load.js';
import { IFC_NAMES } from '../../lib/constants.js';

// ── Section Plan parallel to clicked face (Dalux-style) ──
// Only creates ONE clipping plane at the face position. All other directions stay fully open.
function sectionPlanParallelToFace(){
  if(!appState.ctxTarget){return}

  const normal=appState.ctxTarget.faceNormal;
  const point=appState.ctxTarget.hitPoint;

  if(!normal||!point){return}
  

  const b=appState.modelBounds;
  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
  const toSl=(val: number,mn: number,range: number)=>Math.max(0,Math.min(100,Math.round(((val-mn)/range)*100)));

  // Determine dominant axis of the face normal
  const ax=Math.abs(normal.x),ay=Math.abs(normal.y),az=Math.abs(normal.z);

  // Reset ALL sliders to fully open
  ['slXp','slYp','slZp'].forEach(id=>{(document.getElementById(id) as HTMLInputElement).value='100'});
  ['slXn','slYn','slZn'].forEach(id=>{(document.getElementById(id) as HTMLInputElement).value='0'});

  // Only adjust the ONE slider that corresponds to the face normal direction
  if(ax>=ay&&ax>=az){
    if(normal.x>0){
      // Face points +X → clip from +X side at this position
      (document.getElementById('slXp') as HTMLInputElement).value=String(toSl(point.x,b.min.x,sx));
    }else{
      // Face points -X → clip from -X side
      (document.getElementById('slXn') as HTMLInputElement).value=String(toSl(point.x,b.min.x,sx));
    }
  }else if(ay>=ax&&ay>=az){
    if(normal.y>0){
      (document.getElementById('slYp') as HTMLInputElement).value=String(toSl(point.y,b.min.y,sy));
    }else{
      (document.getElementById('slYn') as HTMLInputElement).value=String(toSl(point.y,b.min.y,sy));
    }
  }else{
    if(normal.z>0){
      (document.getElementById('slZp') as HTMLInputElement).value=String(toSl(point.z,b.min.z,sz));
    }else{
      (document.getElementById('slZn') as HTMLInputElement).value=String(toSl(point.z,b.min.z,sz));
    }
  }

  // Activate section box
  if(!appState.sectionActive){
    appState.sectionActive=true;
    document.getElementById('sectionPanel')!.classList.add('show');
    document.getElementById('btnSection')!.classList.add('active');
    createSectionBox3D();
  }
  updateSectionFromSliders();
  // Camera stays where it is — no movement
  log('Section plane created at face');
}

function zoomToElement(bbox: any){
  
  if(!bbox||!bbox.center){return}
  const c=bbox.center,s=bbox.size;
  const dist=Math.max(s.x,s.y,s.z)*2+5;
  appState.camera.position.set(c.x+dist*0.5,c.y+dist*0.4,c.z+dist*0.5);
  appState.controls.target.set(c.x,c.y,c.z);
  appState.controls.update();
}

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.key==='h'||e.key==='H'){if(appState.ctxTarget)(window as any).hideExpressID?.(appState.ctxTarget.expressID,appState.ctxTarget.modelIdx)}
  if(e.key==='i'||e.key==='I'){if(appState.ctxTarget)(window as any).isolateExpressID?.(appState.ctxTarget.expressID,appState.ctxTarget.modelIdx)}
  if(e.key==='Escape'){
    // Only clear highlight + section, NOT unhide
    clearHighlight();
    document.getElementById('propArea')!.innerHTML='<div class="prop-empty">Click element in 3D to inspect</div>';
    if(appState.sectionActive){window.toggleSectionBox?.()}
  }
});

function clearHighlight(){
  if(window._lastHL){
    try{
      if(window._lastHL.subset&&window._lastHL.subset.parent){
        window._lastHL.subset.parent.remove(window._lastHL.subset);
      }
      // Use customID to remove only the highlight subset, not diff subsets
      try{ appState.ifcLoader.ifcManager.removeSubset(window._lastHL.mid, window._hlMat, 'userHighlight'); }catch(e2){
        // Fallback: older API without customID
        try{ appState.ifcLoader.ifcManager.removeSubset(window._lastHL.mid, window._hlMat); }catch(e3){}
      }
    }catch(e){}
    window._lastHL=null;
  }
}

// ══ IFC Loader ══
async function initIFC(){
  setStatus('loading','Loading WASM...');
  try{
    appState.ifcLoader=new IFCLoader();
    // Self-host the web-ifc WASM (in frontend/public/vendor/web-ifc/, version-matched
    // to the bundled web-ifc) instead of a CDN — the CDN can be blocked and then the
    // loader falls back to a same-origin path that the SPA rewrite answers with HTML,
    // causing "expected magic word 00 61 73 6d, found 3c 21 44 4f". A real static file
    // is served before the rewrite, so this is robust on both Vercel and Firebase.
    await appState.ifcLoader.ifcManager.setWasmPath('/vendor/web-ifc/');
    await appState.ifcLoader.ifcManager.applyWebIfcConfig({USE_FAST_BOOLS:false});
    await appState.ifcLoader.ifcManager.parser.setupOptionalCategories({[IFCSPACE]:false,[IFCOPENINGELEMENT]:false});
    log('WASM ready');setStatus('done','Ready');setTimeout(()=>setStatus('',''),2000);return true;
  }catch(e: any){log('WASM err:',e.message);setStatus('error',e.message);return false}
}

// ══ Load IFC ══
// ══ Project Units + Spatial Structure readers ══
// These run once per model load and cache results on loadedModels[idx] so
// per-element property rendering can do unit conversion + spatial context
// without repeated traversals.

// Cheap helper to pick a filename from the uc-pair UI (used when we want a
// model label but model object hasn't cached one yet).
function fileA_name_if_set(idx: number){
  try{
    const span=document.querySelector(`#uc${idx} .uc-file`);
    return (span as HTMLElement)?.textContent?.trim()||('Model '+(idx===0?'A':'B'));
  }catch(e){return 'Model '+(idx===0?'A':'B')}
}

// Read project units from IfcProject.UnitsInContext.Units. For each unit type
// (LENGTHUNIT, AREAUNIT, VOLUMEUNIT), compute a factor to convert from the
// project's internal representation to millimetres / square metres / cubic
// metres. SI units use IfcSIUnit.Prefix (MILLI, CENTI, ...) for power-of-10
// scaling; conversion-based units (FOOT, INCH) use their ValueComponent.
// Returns {lengthFactor, lengthUnit, areaFactor, areaUnit, volumeFactor, volumeUnit}.
async function readProjectUnits(modelID: number){
  const out={
    lengthFactor:1000, lengthUnit:'mm',   // default: assume metres → *1000 to get mm
    areaFactor:  1,    areaUnit:  'm²',
    volumeFactor:1,    volumeUnit:'m³',
  };
  const mgr=appState.ifcLoader.ifcManager;
  // Find the IfcProject (usually 1 per file, small ID). Robust way: ask
  // web-ifc directly.
  try{
    const api=(mgr as any).state.api;
    // Get all IfcProject express IDs using imported constant
    const projIDs=await api.GetLineIDsWithType(modelID, IFCPROJECT);
    const cnt=projIDs.size();
    if(!cnt)return out;
    const projID=projIDs.get(0);
    const project=await mgr.getItemProperties(modelID, projID, true);
    const unitsRoot=project?.UnitsInContext;
    // UnitsInContext is either an inline IfcUnitAssignment or a ref
    let unitAssignment=unitsRoot;
    if(unitsRoot?.value!==undefined && typeof unitsRoot.value==='number'){
      unitAssignment=await mgr.getItemProperties(modelID, unitsRoot.value, true);
    }
    if(!unitAssignment?.Units)return out;
    const units=Array.isArray(unitAssignment.Units)?unitAssignment.Units:[unitAssignment.Units];

    // SI prefix → power-of-10 multiplier (to metre)
    const SI_PREFIX: Record<string,number>={EXA:1e18,PETA:1e15,TERA:1e12,GIGA:1e9,MEGA:1e6,KILO:1e3,HECTO:1e2,DECA:1e1,
      DECI:1e-1,CENTI:1e-2,MILLI:1e-3,MICRO:1e-6,NANO:1e-9,PICO:1e-12,FEMTO:1e-15,ATTO:1e-18};

    const resolveUnit=async(u: any)=>{
      if(typeof u?.value==='number')return await mgr.getItemProperties(modelID, u.value, true);
      return u;
    };

    for(const uRef of units){
      const u=await resolveUnit(uRef);
      if(!u)continue;
      // UnitType is an enum like {value:'LENGTHUNIT', type:3}
      const ut = u.UnitType?.value || u.UnitType;
      const className = IFC_NAMES[u.type] || '';
      if(!ut)continue;
      let factor=1;
      if(className==='IfcSIUnit'){
        // Factor from this SI unit to the base SI unit (metre/m²/m³)
        const prefix = u.Prefix?.value || u.Prefix;
        if(prefix && SI_PREFIX[prefix])factor=SI_PREFIX[prefix];
        // For area/volume the prefix actually applies per-dimension. web-ifc
        // typically stores raw SI (square_metre, cubic_metre) without prefix,
        // so this is mostly a no-op for area/volume.
      }else if(className==='IfcConversionBasedUnit'){
        // ValueComponent is an IfcMeasureWithUnit { ValueComponent (the
        // numeric factor), UnitComponent (the base SI unit) }. We traverse
        // to find the factor in metres per foot / inch / etc.
        const convRef=u.ConversionFactor;
        if(convRef){
          const conv = typeof convRef?.value==='number'
            ? await mgr.getItemProperties(modelID, convRef.value, true)
            : convRef;
          const vc = conv?.ValueComponent;
          // ValueComponent is typically {value: 0.3048, type: typecode}
          const numFactor = vc?.value ?? vc;
          if(typeof numFactor==='number')factor=numFactor;
        }
      }
      // Write to output per UnitType
      if(ut==='LENGTHUNIT'){
        // Convert raw value → mm: raw * factor(→metre) * 1000
        out.lengthFactor = factor * 1000;
        // Display unit: if conversion is based (ft/in), still show mm for
        // consistency with BIMcollab. Users expect normalized mm.
        out.lengthUnit = 'mm';
      }else if(ut==='AREAUNIT'){
        // SI square_metre already; for conversion (sq_ft) factor²
        out.areaFactor = className==='IfcConversionBasedUnit' ? (factor*factor) : factor;
        out.areaUnit = 'm²';
      }else if(ut==='VOLUMEUNIT'){
        out.volumeFactor = className==='IfcConversionBasedUnit' ? (factor*factor*factor) : factor;
        out.volumeUnit = 'm³';
      }
    }
  }catch(e: any){log('readProjectUnits err:',e?.message)}
  return out;
}

// Read spatial structure once. Cache storeys sorted by elevation + keep
// project/site/building names so Location section can surface them without
// re-traversal per element.
async function readSpatialInfo(modelID: number, modelName: string){
  const mgr=appState.ifcLoader.ifcManager;
  const info: any={
    projectName:'', siteName:'', buildingName:'',
    storeys:[],           // [{expressID, name, elevation}] sorted asc by elev
    sites: [],            // [{expressID, name, refLat, refLon, refElev}]
    modelName: modelName || '',
    trueNorthAngle: 0,    // rotation angle in radians (0 = Y+ is north, positive = CW)
  };
  try{
    const api=(mgr as any).state.api;
    // Use web-ifc constants imported at top of module — safer than hardcoded numbers.
    const projIDs=await api.GetLineIDsWithType(modelID, IFCPROJECT);
    if(projIDs.size()){
      const p=await mgr.getItemProperties(modelID, projIDs.get(0), false);
      info.projectName = p?.Name?.value || p?.LongName?.value || '';
      // ── Read TrueNorth from IfcGeometricRepresentationContext ──
      // IFC stores TrueNorth as a 2D direction in IfcGeometricRepresentationContext.
      // Direction (0,1) = default (project north = Y+). A rotated TrueNorth
      // like (sin θ, cos θ) means true north is rotated θ radians from Y+.
      try{
        // IfcGeometricRepresentationContext type code = 3448662350
        const ctxIDs = await api.GetLineIDsWithType(modelID, 3448662350);
        for(let ci=0; ci<ctxIDs.size(); ci++){
          const ctx = await mgr.getItemProperties(modelID, ctxIDs.get(ci), false);
          if(!ctx?.TrueNorth) continue;
          // TrueNorth can be a ref to IfcDirection or inline
          let tn = ctx.TrueNorth;
          if(tn.value !== undefined) tn = await mgr.getItemProperties(modelID, tn.value, false);
          const coords = tn?.DirectionRatios;
          if(coords && coords.length >= 2){
            const nx = coords[0]?.value ?? coords[0] ?? 0;
            const ny = coords[1]?.value ?? coords[1] ?? 0;
            if(Math.abs(nx) > 0.0001 || Math.abs(ny) > 0.0001){
              // Angle from Y+ axis: atan2(x, y) gives CW rotation from north
              info.trueNorthAngle = Math.atan2(nx, ny);
              log(`TrueNorth: direction=(${nx.toFixed(4)}, ${ny.toFixed(4)}), angle=${(info.trueNorthAngle*180/Math.PI).toFixed(1)}°`);
            }
          }
          break; // only need the first context with TrueNorth
        }
      }catch(tnErr: any){ log('TrueNorth read err:', tnErr?.message); }
    }
    const siteIDs=await api.GetLineIDsWithType(modelID, IFCSITE);
    for(let si=0; si<siteIDs.size(); si++){
      const s=await mgr.getItemProperties(modelID, siteIDs.get(si), false);
      if(!s) continue;
      if(si===0) info.siteName = s?.Name?.value || s?.LongName?.value || '';
      info.sites.push({
        expressID: siteIDs.get(si),
        name: s?.Name?.value || s?.LongName?.value || '',
        refLat: s?.RefLatitude ?? null,
        refLon: s?.RefLongitude ?? null,
        refElev: s?.RefElevation?.value ?? s?.RefElevation ?? null,
      });
    }
    const bldgIDs=await api.GetLineIDsWithType(modelID, IFCBUILDING);
    if(bldgIDs.size()){
      const b=await mgr.getItemProperties(modelID, bldgIDs.get(0), false);
      info.buildingName = b?.Name?.value || b?.LongName?.value || '';
    }
    const storeyIDs=await api.GetLineIDsWithType(modelID, IFCBUILDINGSTOREY);
    for(let i=0;i<storeyIDs.size();i++){
      const sid=storeyIDs.get(i);
      const s=await mgr.getItemProperties(modelID, sid, false);
      if(!s)continue;
      const elev = s.Elevation?.value ?? 0;
      info.storeys.push({
        expressID: sid,
        name: s.Name?.value || s.LongName?.value || ('Storey '+sid),
        elevation: elev,
      });
    }
    info.storeys.sort((a: any,b: any)=>a.elevation-b.elevation);
  }catch(e: any){log('readSpatialInfo err:',e?.message)}
  return info;
}

async function loadIFC(idx: number){
  const file=appState.files[idx];if(!file||!appState.ifcLoader)return;
  // Status element: slots 0,1 have their own DOM; federation slots update fedRenderSlots
  const st=idx<2?document.getElementById('us'+idx):null;
  if(st){st.className='uc-status prog';st.textContent='⏳ Parsing...';}
  try{
    if(appState.loadedModels[idx]){appState.scene.remove(appState.loadedModels[idx]!);appState.loadedModels[idx]=null}
    // Invalidate cached props for this slot so Colorize rescans on next use
    if(window._colorizeInvalidate)window._colorizeInvalidate(idx);
    // If no models remain at all, reset shared offset
    if(!appState.loadedModels.some(m=>!!m)){appState.sharedCenterOffset=null;appState.modelBounds.min.set(0,0,0);appState.modelBounds.max.set(0,0,0)}
    const buf=await file.arrayBuffer();const url=URL.createObjectURL(new Blob([buf]));
    const model=await new Promise<any>((ok,no)=>{
      appState.ifcLoader.load(url,(m: any)=>ok(m),(p: any)=>{if(p.total>0&&st)st.textContent='⏳ '+Math.round(p.loaded/p.total*100)+'%'},(e: any)=>no(e));
    });
    URL.revokeObjectURL(url);

    // Scan vertices, fix NaN, compute bounds
    let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity,vc=0;
    const scan=(g: any)=>{if(!g?.attributes?.position)return;const a=g.attributes.position.array;for(let i=0;i<a.length;i+=3){if(isNaN(a[i])){a[i]=a[i+1]=a[i+2]=0;continue}vc++;if(a[i]<mnX)mnX=a[i];if(a[i]>mxX)mxX=a[i];if(a[i+1]<mnY)mnY=a[i+1];if(a[i+1]>mxY)mxY=a[i+1];if(a[i+2]<mnZ)mnZ=a[i+2];if(a[i+2]>mxZ)mxZ=a[i+2]}g.attributes.position.needsUpdate=true};
    if(model.geometry)scan(model.geometry);model.traverse((c: any)=>{if(c.isMesh)scan(c.geometry)});
    if(!isFinite(mnX)||vc===0)throw new Error('No valid geometry');

    // ── Coordinate alignment: first model sets the shared center, subsequent models reuse it ──
    let cx,cy,cz;
    const anyOtherLoaded = appState.loadedModels.some(m=>!!m);
    if(appState.sharedCenterOffset && anyOtherLoaded){
      // Another model already loaded — reuse its center offset so all models align
      cx=appState.sharedCenterOffset.x; cy=appState.sharedCenterOffset.y; cz=appState.sharedCenterOffset.z;
      log(`Model ${idx}: reusing shared offset (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`);
    }else{
      // First model loaded — compute center from its own bbox
      cx=(mnX+mxX)/2; cy=(mnY+mxY)/2; cz=(mnZ+mxZ)/2;
      appState.sharedCenterOffset={x:cx,y:cy,z:cz} as any;
      log(`Model ${idx}: setting shared offset (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`);
    }
    model.position.set(-cx,-cy,-cz);model.updateMatrixWorld(true);
    log(`Model ${idx}: ${vc} verts, size ${(mxX-mnX).toFixed(0)}×${(mxY-mnY).toFixed(0)}×${(mxZ-mnZ).toFixed(0)}`);

    // Store bounds in world-shifted space — merge with all existing models
    const wMnX=mnX-cx, wMnY=mnY-cy, wMnZ=mnZ-cz;
    const wMxX=mxX-cx, wMxY=mxY-cy, wMxZ=mxZ-cz;
    if(!anyOtherLoaded){appState.modelBounds.min.set(wMnX,wMnY,wMnZ);appState.modelBounds.max.set(wMxX,wMxY,wMxZ)}
    else{appState.modelBounds.min.set(Math.min(appState.modelBounds.min.x,wMnX),Math.min(appState.modelBounds.min.y,wMnY),Math.min(appState.modelBounds.min.z,wMnZ));
         appState.modelBounds.max.set(Math.max(appState.modelBounds.max.x,wMxX),Math.max(appState.modelBounds.max.y,wMxY),Math.max(appState.modelBounds.max.z,wMxZ))}

    // Materials: ensure visible with original IFC colors, apply clipping
    model.traverse((c: any)=>{if(c.isMesh){const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach((m: any)=>{
      m.side=THREE.DoubleSide;
      m.clippingPlanes=appState.clipPlanes;
      m.clipShadows=true;
      // Fix invisible materials but keep original IFC colors
      if(m.opacity<0.1){m.opacity=0.85;m.transparent=true}
      // Ensure not fully black
      if(m.color&&m.color.r<0.05&&m.color.g<0.05&&m.color.b<0.05){
        m.color.set(0x8899aa);
      }
      m.depthWrite=!m.transparent||m.opacity>0.5;
    })}});

    // Ensure loadedModels array is long enough
    while(appState.loadedModels.length <= idx) appState.loadedModels.push(null);
    appState.loadedModels[idx]=model;appState.scene.add(model);
    document.getElementById('emptyVP')!.style.display='none';

    // ── Extract project units + spatial structure for this model ──
    try{
      const units=await readProjectUnits(model.modelID);
      const spatial=await readSpatialInfo(model.modelID, fileA_name_if_set(idx));
      appState.loadedModels[idx]!.units=units;
      appState.loadedModels[idx]!.spatial=spatial;
      appState.loadedModels[idx]!.fileName=appState.files[idx]?.name||'model_'+idx;
      log(`Model ${idx}: lengthFactor=${units.lengthFactor}mm, areaFactor=${units.areaFactor}m², ${spatial.storeys.length} storeys`);
      // Plan overlay (if open) needs the new storey list
      if(window.requestPlanRebuild)window.requestPlanRebuild();
    }catch(ue: any){log('Units/spatial read error:',ue?.message)}

    // Camera — use combined model bounds for proper framing
    const bSize=new THREE.Vector3().subVectors(appState.modelBounds.max,appState.modelBounds.min);
    const mx2=Math.max(bSize.x,bSize.y,bSize.z,mxX-mnX,mxY-mnY,mxZ-mnZ);
    const dist=mx2*1.5;
    appState.camera.near=Math.max(mx2*0.001,0.01);appState.camera.far=Math.max(mx2*50,5000);appState.camera.updateProjectionMatrix();
    const bCenter=new THREE.Vector3().addVectors(appState.modelBounds.min,appState.modelBounds.max).multiplyScalar(0.5);
    appState.camera.position.set(bCenter.x+dist*.6,bCenter.y+dist*.5,bCenter.z+dist*.6);
    appState.controls.target.copy(bCenter);appState.controls.update();

    if(idx < 2){
      // Slots 0,1: update original upload card UI
      if(st){st.className='uc-status ok';st.textContent='✓ Loaded';}
      document.getElementById('visRow'+idx)!.style.display='block';
      const bothLoaded = !!(appState.loadedModels[0]&&appState.loadedModels[1]);
      (document.getElementById('btnCompare') as HTMLButtonElement).disabled=!bothLoaded;
      const panelBtn = document.getElementById('btnRunComparePanel') as HTMLButtonElement|null;
      if(panelBtn){panelBtn.disabled=!bothLoaded;panelBtn.style.opacity=bothLoaded?'1':'.35';}
    }else{
      // Federation slot: update federation UI
      fedRenderSlots();
    }

    // Update clash mode if active
    if(appState.clashMode){
      if(appState.files[0])document.getElementById('clashFileA')!.textContent=appState.files[0]!.name;
      if(appState.files[1])document.getElementById('clashFileB')!.textContent=appState.files[1]!.name;
      document.getElementById('clashFileA')!.classList.toggle('loaded',!!appState.loadedModels[0]);
      document.getElementById('clashFileB')!.classList.toggle('loaded',!!appState.loadedModels[1]);
      (document.getElementById('btnRunClash') as HTMLButtonElement).disabled=!(appState.loadedModels[0]&&appState.loadedModels[1]);
    }

    // Build category filter from loaded models
    await buildCatFromModels();

    // Invalidate SG validation cache so next run includes new model
    appState.sgState.cachedCtx = null;
  }catch(e: any){
    log('Load err:',e.message);
    if(st){st.className='uc-status err';st.textContent='✕ '+e.message}
    if(idx >= 2) fedRenderSlots();
  }
}

// ══ Build Category Filter from loaded models ══
async function buildCatFromModels(){
  const api=(appState.ifcLoader?.ifcManager as any)?.state?.api;
  if(!api)return;

  window._catData={};
  (window as any)._catModelIDs={}; // {typeName: {0: [expressIDs], 1: [expressIDs]}}

  // PRODUCT_TYPES for category filter UI + clash element-type dropdown.
  // Critical: must include all CONCRETE IFC4 subtypes that real authoring
  // tools (Revit, ArchiCAD, Tekla) actually emit. The abstract parent types
  // (IfcFlowSegment, IfcFlowFitting, IfcFlowTerminal etc.) rarely appear by
  // themselves — what shows up in real files is IfcPipeSegment, IfcPipeFitting,
  // IfcDuctSegment, IfcCableSegment, etc. Missing those here means Categories
  // dropdown only shows "Generic Models / Plumbing Fixtures" for big MEP files
  // — which was the bug the user hit.
  // Spatial structures (Site/Building/Storey/Project/Space) intentionally
  // excluded — never a clash candidate.
  const PRODUCT_TYPES=[
    // Architectural & structural (named imports from web-ifc)
    IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM,
    IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
    IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING,
    IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT,
    // Abstract MEP parents (occasionally emitted directly)
    IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING,
    // ── Concrete MEP subtypes (the ones Revit actually exports) ──
    // Plumbing
    3612865200, // IfcPipeSegment
    310824031,  // IfcPipeFitting
    2474470126, // IfcSanitaryTerminal
    4252922144, // IfcStackTerminal
    2391406946, // IfcWasteTerminal
    1426591983, // IfcFireSuppressionTerminal
    4207607924, // IfcValve
    90941305,   // IfcPump
    819412036,  // IfcFilter
    // HVAC
    3518393246, // IfcDuctSegment
    342316401,  // IfcDuctFitting
    1360408905, // IfcDuctSilencer
    2082059205, // IfcAirTerminal
    3304561284, // IfcAirTerminalBox
    331165859,  // IfcFan
    763608111,  // IfcCooledBeam
    1469388950, // IfcCoolingTower
    1281925730, // IfcCondenser
    4136498852, // IfcCoil
    3171933400, // IfcDamper
    1758889154, // IfcCompressor
    4237592921, // IfcChiller
    753842376,  // IfcBoiler
    4074379575, // IfcHumidifier
    25142252,   // IfcUnitaryEquipment
    3283111854, // IfcSpaceHeater
    3026737570, // IfcTubeBundle
    // Electrical
    3512223829, // IfcCableCarrierFitting
    1051757585, // IfcCableCarrierSegment
    3999819293, // IfcCableSegment
    1634111441, // IfcElectricAppliance
    402227799,  // IfcElectricDistributionBoard
    264262732,  // IfcElectricGenerator
    3310460725, // IfcElectricMotor
    1904799276, // IfcElectricFlowStorageDevice
    862014818,  // IfcElectricTimeControl
    629592764,  // IfcLightFixture
    76236018,   // IfcLamp
    707683696,  // IfcOutlet
    2176052936, // IfcJunctionBox
    3825984169, // IfcTransformer
    1973544240, // IfcSensor
    2979338954, // IfcAlarm
    626022354,  // IfcController
    3024970846, // IfcSwitchingDevice
    987401354,  // IfcFlowMeter
    3640358203, // IfcProtectiveDevice
    2295281155, // IfcProtectiveDeviceTrippingUnit
    // Generic distribution
    1945004755, // IfcDistributionElement
    3040386961, // IfcDistributionFlowElement
    1658829314, // IfcEnergyConversionDevice
    4278956645, // IfcFlowMovingDevice
    3132237377, // IfcFlowStorageDevice
    3508470533, // IfcFlowTreatmentDevice
    2058353004, // IfcFlowController
    3415622556, // IfcDistributionChamberElement
    1335981549, // IfcDiscreteAccessory
    1437502449, // IfcMedicalDevice
    1687234759, // IfcShadingDevice
    900683007,  // IfcFooting (duplicate of IFCFOOTING just to be safe)
  ];

  for(let idx=0;idx<2;idx++){
    if(!appState.loadedModels[idx])continue;
    const mid=(appState.loadedModels[idx] as any).modelID;
    for(const typeNum of PRODUCT_TYPES){
      try{
        const lines=api.GetLineIDsWithType(mid,typeNum);
        const cnt=lines.size();
        if(cnt===0)continue;
        const typeName=IFC_NAMES[typeNum]||('IFC_'+typeNum);
        if(!window._catData[typeName])window._catData[typeName]={total:0,added:0,removed:0,modified:0};
        if(!window._catModelIDs[typeName])window._catModelIDs[typeName]={};
        if(!window._catModelIDs[typeName][idx])window._catModelIDs[typeName][idx]=[];
        for(let i=0;i<cnt;i++) window._catModelIDs[typeName][idx].push(lines.get(i));
        window._catData[typeName].total+=cnt;
      }catch(e){}
    }
  }

  log('Categories found:',Object.keys(window._catData).length,'types');
  document.getElementById('catFilter')!.classList.add('show');
  // Show panel tabs so Search is accessible even without compare
  // (#panelTabs is vestigial — the redesigned tab strip is always visible — so
  // guard against null instead of crashing the load/compare flow.)
  document.getElementById('panelTabs')?.classList.add('show');
  appState.activeCategories=new Set();
  (window as any).buildCatDropdown?.();
  (window as any).updateCatTags?.();
}

// ══ Apply category visibility in VIEW mode (no compare) ══
// View mode category subsets
let viewSubsets: any[]=[];

function applyCategoryVisibilityViewMode(){
  if(!appState.ifcLoader)return;
  if(appState.compareResult)return; // Use compare handler instead

  const showAll=appState.activeCategories.size===0;
  const showNone=appState.activeCategories.has('__none__');
  const catIDs=window._catModelIDs||{};

  // Remove old view subsets
  viewSubsets.forEach(s=>{if(s.parent)s.parent.remove(s)});
  viewSubsets=[];
  (window as any).viewSubsets=viewSubsets; // mirrored (same ref — later .push() stays in sync): compare.ts/measure.ts read this to hide/show category-filter subsets when toggling model A/B visibility

  for(let idx=0;idx<2;idx++){
    if(!appState.loadedModels[idx])continue;
    const vis=(document.getElementById(idx===0?'visA':'visB') as HTMLInputElement).checked;

    if(!vis||showNone){
      appState.loadedModels[idx]!.visible=false;
      continue;
    }

    if(showAll){
      // Show original model with IFC colors — but respect checkbox
      appState.loadedModels[idx]!.visible=vis;
      if(vis)appState.loadedModels[idx]!.traverse((c: any)=>{if(c.isMesh)c.visible=true});
      continue;
    }

    // Category filter active: hide base model, create subset with selected IDs
    appState.loadedModels[idx]!.visible=false;

    // Collect expressIDs from selected categories
    const ids: number[]=[];
    appState.activeCategories.forEach(cat=>{
      const catIds=catIDs[cat]?.[idx];
      if(catIds)ids.push(...catIds);
    });

    if(ids.length===0)continue;

    // Create subset showing only selected categories — with ORIGINAL materials
    try{
      const sub=appState.ifcLoader.ifcManager.createSubset({
        modelID:(appState.loadedModels[idx] as any).modelID,
        ids:ids,
        removePrevious:true,
        customID:'viewFilter_'+idx,
        scene:appState.scene,
        // No material = use original IFC materials
      });
      if(sub){
        sub.position.copy(appState.loadedModels[idx]!.position);
        sub.updateMatrixWorld(true);
        // Apply clipping if section active
        sub.traverse((c: any)=>{if(c.isMesh){
          const ms=Array.isArray(c.material)?c.material:[c.material];
          ms.forEach((m: any)=>{m.clippingPlanes=appState.clipPlanes;m.side=THREE.DoubleSide});
        }});
        viewSubsets.push(sub);
      }
    }catch(e: any){log('View subset error:',e.message)}
  }
}

// ══ Exit Compare Mode ══
window.exitCompare=function(){
  // Remove all diff subsets
  const toRemove: any[]=[];
  appState.scene.traverse(c=>{if((c as any).isMesh&&(c as any).userData?.diffSubset)toRemove.push(c)});
  toRemove.forEach(c=>{if(c.parent)c.parent.remove(c)});

  // Remove view subsets
  viewSubsets.forEach(s=>{if(s.parent)s.parent.remove(s)});
  viewSubsets=[];
  (window as any).viewSubsets=viewSubsets; // mirrored (same ref — later .push() stays in sync): compare.ts/measure.ts read this to hide/show category-filter subsets when toggling model A/B visibility

  // Clear compare result
  appState.compareResult=null;

  // Restore original model materials and visibility
  for(let idx=0;idx<2;idx++){
    if(!appState.loadedModels[idx])continue;
    const vis=(document.getElementById(idx===0?'visA':'visB') as HTMLInputElement).checked;
    appState.loadedModels[idx]!.visible=vis;
    appState.loadedModels[idx]!.traverse((c: any)=>{if(c.isMesh){
      c.visible=true;
      // Restore original materials
      if(c.userData._origMaterials){
        c.material=c.userData._origMaterials;
        delete c.userData._origMaterials;
      }
    }});
  }

  // Re-apply category filter in view mode
  applyCategoryVisibilityViewMode();

  // Hide compare UI
  document.getElementById('sumStrip')!.classList.remove('show');
  document.getElementById('searchW')!.classList.remove('show');
  document.getElementById('filterB')!.classList.remove('show');
  document.getElementById('vpLegend')!.classList.remove('show');
  (document.getElementById('btnExport') as HTMLElement).style.display='none';
  (document.getElementById('btnExportBCF') as HTMLElement).style.display='none';
  (document.getElementById('btnExitCompare') as HTMLElement).style.display='none';
  document.getElementById('eTree')!.innerHTML='';
  (document.getElementById('eTree') as HTMLElement).style.display='';

  // Hide issues
  document.getElementById('panelTabs')?.classList.remove('show');
  document.getElementById('issuesList')!.classList.remove('show');
  document.getElementById('issuesList')!.innerHTML='';
  document.getElementById('issueNav')!.classList.remove('show');
  appState.issuesList=[];
  appState.currentIssueIdx=-1;

  // Reset section box
  if(appState.sectionActive){
    appState.sectionActive=false;
    document.getElementById('sectionPanel')!.classList.remove('show');
    document.getElementById('btnSection')!.classList.remove('active');
    removeSectionBox3D();
    appState.clipPlanes.forEach(p=>p.constant=99999);
  }

  log('Exited compare mode');
};

// ══ 3D Section Box ══
let sectionBox: any=null; // {group, faces[], edges, helpers}
window.toggleSectionBox=function(){
  appState.sectionActive=!appState.sectionActive;
  document.getElementById('sectionPanel')!.classList.toggle('show',appState.sectionActive);
  document.getElementById('btnSection')!.classList.toggle('active',appState.sectionActive);
  if(appState.sectionActive){
    createSectionBox3D();
    updateSectionFromSliders();
  }else{
    removeSectionBox3D();
    // Reset clipping planes to not clip anything
    appState.clipPlanes[0].set(new THREE.Vector3(-1,0,0),99999);
    appState.clipPlanes[1].set(new THREE.Vector3(1,0,0),99999);
    appState.clipPlanes[2].set(new THREE.Vector3(0,-1,0),99999);
    appState.clipPlanes[3].set(new THREE.Vector3(0,1,0),99999);
    appState.clipPlanes[4].set(new THREE.Vector3(0,0,-1),99999);
    appState.clipPlanes[5].set(new THREE.Vector3(0,0,1),99999);
  }
};

function createSectionBox3D(){
  if(sectionBox)removeSectionBox3D();
  const b=appState.modelBounds;
  const group=new THREE.Group();
  group.name='sectionBox';

  // Create wireframe box edges
  const edgesMat=new THREE.LineBasicMaterial({color:0x2563eb,linewidth:2,depthTest:false,transparent:true,opacity:0.8});

  // Create 6 face planes (semi-transparent colored planes)
  const faceMats=[
    new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // X+
    new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // X-
    new THREE.MeshBasicMaterial({color:0x22c55e,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // Y+
    new THREE.MeshBasicMaterial({color:0x22c55e,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // Y-
    new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // Z+
    new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.06,side:THREE.DoubleSide,depthTest:false}), // Z-
  ];

  // Arrow handle materials — flat, depth-test off so they always render on top
  const arrowMats=[
    new THREE.MeshBasicMaterial({color:0xef4444,depthTest:false}),
    new THREE.MeshBasicMaterial({color:0xef4444,depthTest:false}),
    new THREE.MeshBasicMaterial({color:0x22c55e,depthTest:false}),
    new THREE.MeshBasicMaterial({color:0x22c55e,depthTest:false}),
    new THREE.MeshBasicMaterial({color:0x3b82f6,depthTest:false}),
    new THREE.MeshBasicMaterial({color:0x3b82f6,depthTest:false}),
  ];

  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;

  const faces: any[]=[];
  const arrows: any[]=[];

  // Create face planes and arrow handles
  const faceConfigs=[
    {axis:'x',dir:1, rot:[0,Math.PI/2,0]},  // X+
    {axis:'x',dir:-1,rot:[0,-Math.PI/2,0]}, // X-
    {axis:'y',dir:1, rot:[Math.PI/2,0,0]},  // Y+
    {axis:'y',dir:-1,rot:[-Math.PI/2,0,0]}, // Y-
    {axis:'z',dir:1, rot:[0,0,0]},           // Z+
    {axis:'z',dir:-1,rot:[0,Math.PI,0]},     // Z-
  ];

  faceConfigs.forEach((cfg,i)=>{
    // Face plane
    const pw=cfg.axis==='x'?sz:sx;
    const ph=cfg.axis==='y'?sz:sy;
    const faceGeo=new THREE.PlaneGeometry(pw*1.01,ph*1.01);
    const face=new THREE.Mesh(faceGeo,faceMats[i]);
    face.renderOrder=999;
    face.userData={faceIdx:i,axis:cfg.axis,dir:cfg.dir};
    face.raycast=()=>{}; // Make faces invisible to raycaster — only visual
    group.add(face);
    faces.push(face);

    // Arrow handle: UNIT-SIZE cone (radius=1, height=2.4).
    // Actual screen-size is applied per frame by updateSectionHandleSizes()
    // so arrows stay the same visual size regardless of zoom — matches Revit
    // triangle-handle behavior where handles never overwhelm the viewport.
    const coneGeo=new THREE.ConeGeometry(1, 2.4, 12);
    const cone=new THREE.Mesh(coneGeo,arrowMats[i]);
    cone.renderOrder=1000;
    cone.userData={faceIdx:i,axis:cfg.axis,dir:cfg.dir,isHandle:true};
    group.add(cone);
    arrows.push(cone);
  });

  // Wireframe box
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo),edgesMat);
  edges.renderOrder=998;
  (edges as any).raycast=()=>{}; // Not pickable
  group.add(edges);

  appState.scene.add(group);
  sectionBox={group,faces,arrows,edges};
  updateSectionBox3DPositions();
  updateSectionHandleSizes();
}

// Scale section-box arrow handles so they appear ~constant size on screen
// regardless of camera distance. Called every frame from the render loop.
// Target visual size: ~14px radius (Revit-style small triangles).
function updateSectionHandleSizes(){
  if(!sectionBox||!appState.camera||!appState.renderer)return;
  const vh=appState.renderer.domElement.clientHeight||1;
  const fov=(appState.camera.fov||50)*Math.PI/180;
  const tanHalfFov=Math.tan(fov/2);
  const camPos=appState.camera.position;
  const targetRadiusPx=9;   // cone radius in screen pixels (Revit-small)
  const targetOffsetPx=16;  // cone tip-to-face distance in screen pixels

  // For each arrow, pin it to its face center, scale to constant screen size,
  // and push it outward along the face normal by a screen-constant offset.
  // Face positions were set when sliders changed (updateSectionBox3DPositions).
  for(let i=0;i<sectionBox.arrows.length;i++){
    const arrow=sectionBox.arrows[i];
    const face=sectionBox.faces[i];
    if(!face)continue;
    const {axis,dir}=arrow.userData;
    // Normal in world: axis + dir
    const n={x:axis==='x'?dir:0, y:axis==='y'?dir:0, z:axis==='z'?dir:0};
    // Distance camera → face center (stable reference for scaling)
    const d=camPos.distanceTo(face.position);
    const worldPerPx=(2*d*tanHalfFov)/vh;
    const r=worldPerPx*targetRadiusPx;
    const off=worldPerPx*targetOffsetPx;
    arrow.scale.set(r,r,r);
    arrow.position.set(
      face.position.x + n.x*off,
      face.position.y + n.y*off,
      face.position.z + n.z*off
    );
  }
}

function removeSectionBox3D(){
  if(sectionBox){
    appState.scene.remove(sectionBox.group);
    sectionBox=null;
  }
}

function updateSectionBox3DPositions(){
  if(!sectionBox)return;
  const b=appState.modelBounds;
  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;

  const xp=+(document.getElementById('slXp') as HTMLInputElement).value/100;
  const xn=+(document.getElementById('slXn') as HTMLInputElement).value/100;
  const yp=+(document.getElementById('slYp') as HTMLInputElement).value/100;
  const yn=+(document.getElementById('slYn') as HTMLInputElement).value/100;
  const zp=+(document.getElementById('slZp') as HTMLInputElement).value/100;
  const zn=+(document.getElementById('slZn') as HTMLInputElement).value/100;

  // Actual clip bounds in world space
  const cxn=b.min.x+sx*xn, cxp=b.min.x+sx*xp;
  const cyn=b.min.y+sy*yn, cyp=b.min.y+sy*yp;
  const czn=b.min.z+sz*zn, czp=b.min.z+sz*zp;

  const bsx=cxp-cxn, bsy=cyp-cyn, bsz=czp-czn;
  const bcx=(cxn+cxp)/2, bcy=(cyn+cyp)/2, bcz=(czn+czp)/2;

  // Update wireframe box
  sectionBox.edges.scale.set(Math.max(bsx,0.01),Math.max(bsy,0.01),Math.max(bsz,0.01));
  sectionBox.edges.position.set(bcx,bcy,bcz);

  // Position/rotate face planes. Arrow positions are NOT set here — they are
  // recomputed every frame by updateSectionHandleSizes() to stay screen-constant
  // distance from their face.
  // X+ face
  sectionBox.faces[0].position.set(cxp,bcy,bcz);
  sectionBox.faces[0].rotation.set(0,Math.PI/2,0);
  sectionBox.faces[0].scale.set(Math.max(bsz,0.01)/sz,Math.max(bsy,0.01)/sy,1);
  sectionBox.arrows[0].rotation.set(0,0,-Math.PI/2);
  // X- face
  sectionBox.faces[1].position.set(cxn,bcy,bcz);
  sectionBox.faces[1].rotation.set(0,-Math.PI/2,0);
  sectionBox.faces[1].scale.set(Math.max(bsz,0.01)/sz,Math.max(bsy,0.01)/sy,1);
  sectionBox.arrows[1].rotation.set(0,0,Math.PI/2);
  // Y+ face
  sectionBox.faces[2].position.set(bcx,cyp,bcz);
  sectionBox.faces[2].rotation.set(-Math.PI/2,0,0);
  sectionBox.faces[2].scale.set(Math.max(bsx,0.01)/sx,Math.max(bsz,0.01)/sz,1);
  sectionBox.arrows[2].rotation.set(0,0,0);
  // Y- face
  sectionBox.faces[3].position.set(bcx,cyn,bcz);
  sectionBox.faces[3].rotation.set(Math.PI/2,0,0);
  sectionBox.faces[3].scale.set(Math.max(bsx,0.01)/sx,Math.max(bsz,0.01)/sz,1);
  sectionBox.arrows[3].rotation.set(Math.PI,0,0);
  // Z+ face
  sectionBox.faces[4].position.set(bcx,bcy,czp);
  sectionBox.faces[4].rotation.set(0,0,0);
  sectionBox.faces[4].scale.set(Math.max(bsx,0.01)/sx,Math.max(bsy,0.01)/sy,1);
  sectionBox.arrows[4].rotation.set(Math.PI/2,0,0);
  // Z- face
  sectionBox.faces[5].position.set(bcx,bcy,czn);
  sectionBox.faces[5].rotation.set(0,Math.PI,0);
  sectionBox.faces[5].scale.set(Math.max(bsx,0.01)/sx,Math.max(bsy,0.01)/sy,1);
  sectionBox.arrows[5].rotation.set(-Math.PI/2,0,0);
}

// Dragging section box handles — ONLY arrows
let dragHandle: any=null,dragPlane: any=null,dragStart: any=null;
function initSectionDrag(){
  const ray=new THREE.Raycaster();const mouse=new THREE.Vector2();
  const plane=new THREE.Plane();

  appState.renderer.domElement.addEventListener('pointerdown',e=>{
    if(!appState.sectionActive||!sectionBox)return;
    const r=appState.renderer.domElement.getBoundingClientRect();
    mouse.x=((e.clientX-r.left)/r.width)*2-1;
    mouse.y=-((e.clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(mouse,appState.camera);

    // ONLY check arrows
    const hits=ray.intersectObjects(sectionBox.arrows,false);
    if(hits.length>0){
      const hitObj=hits[0].object;
      dragHandle={obj:hitObj,faceIdx:hitObj.userData.faceIdx,axis:hitObj.userData.axis,dir:hitObj.userData.dir};
      (window as any).dragHandle=dragHandle; // mirrored: viewer-core's pick handler reads this to skip a click right after a handle drag
      const camDir=new THREE.Vector3();appState.camera.getWorldDirection(camDir);
      const axis=dragHandle.axis;
      let pn: THREE.Vector3;
      if(axis==='x')pn=new THREE.Vector3(0,Math.abs(camDir.z)>Math.abs(camDir.y)?0:1,Math.abs(camDir.z)>Math.abs(camDir.y)?1:0).normalize();
      else if(axis==='y')pn=new THREE.Vector3(Math.abs(camDir.x)>Math.abs(camDir.z)?0:1,0,Math.abs(camDir.x)>Math.abs(camDir.z)?1:0).normalize();
      else pn=new THREE.Vector3(Math.abs(camDir.x)>Math.abs(camDir.y)?0:1,Math.abs(camDir.x)>Math.abs(camDir.y)?1:0,0).normalize();
      plane.setFromNormalAndCoplanarPoint(pn,hits[0].point);
      dragPlane=plane;dragStart=hits[0].point.clone();appState.controls.enabled=false;
    }
  },true);

  appState.renderer.domElement.addEventListener('pointermove',e=>{
    if(!dragHandle||!dragPlane)return;
    const r=appState.renderer.domElement.getBoundingClientRect();
    const m2=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
    const r2=new THREE.Raycaster();r2.setFromCamera(m2,appState.camera);
    const pt=new THREE.Vector3();if(!r2.ray.intersectPlane(dragPlane,pt))return;
    const delta=pt.clone().sub(dragStart),axis=dragHandle.axis;
    const b=appState.modelBounds,axisLen=axis==='x'?b.max.x-b.min.x:axis==='y'?b.max.y-b.min.y:b.max.z-b.min.z;
    const d=axis==='x'?delta.x:axis==='y'?delta.y:delta.z;
    const sliderIds=['slXp','slXn','slYp','slYn','slZp','slZn'];
    const sl=document.getElementById(sliderIds[dragHandle.faceIdx]) as HTMLInputElement;
    sl.value=String(Math.round(Math.max(0,Math.min(1,+sl.value/100+d/axisLen))*100));
    dragStart.copy(pt);updateSectionFromSliders();
  });

  window.addEventListener('pointerup',()=>{if(dragHandle){dragHandle=null;(window as any).dragHandle=null;dragPlane=null;dragStart=null;appState.controls.enabled=true}});

  // Hover — only arrows
  let lastH: any=null;
  appState.renderer.domElement.addEventListener('pointermove',e=>{
    if(dragHandle||!appState.sectionActive||!sectionBox)return;
    const r=appState.renderer.domElement.getBoundingClientRect();
    const m=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
    const r3=new THREE.Raycaster();r3.setFromCamera(m,appState.camera);
    const hits=r3.intersectObjects(sectionBox.arrows,false);
    const h=hits.length>0?hits[0].object:null;
    if(h!==lastH){
      sectionBox.arrows.forEach((a: any,i: number)=>{a.material.color.set([0xef4444,0xef4444,0x22c55e,0x22c55e,0x3b82f6,0x3b82f6][i]);a.scale.setScalar(1.0)});
      if(h){(h as any).material.color.set(0xffffff);h.scale.setScalar(1.3)}
      lastH=h;
    }
    appState.renderer.domElement.style.cursor=h?'grab':'';
  });
}

function updateSectionFromSliders(){
  if(!appState.sectionActive)return;
  const b=appState.modelBounds,mn=b.min,mx=b.max;
  const sx=mx.x-mn.x,sy=mx.y-mn.y,sz=mx.z-mn.z;

  const xp=+(document.getElementById('slXp') as HTMLInputElement).value/100;
  const xn=+(document.getElementById('slXn') as HTMLInputElement).value/100;
  const yp=+(document.getElementById('slYp') as HTMLInputElement).value/100;
  const yn=+(document.getElementById('slYn') as HTMLInputElement).value/100;
  const zp=+(document.getElementById('slZp') as HTMLInputElement).value/100;
  const zn=+(document.getElementById('slZn') as HTMLInputElement).value/100;

  document.getElementById('vXp')!.textContent=Math.round(xp*100)+'%';
  document.getElementById('vXn')!.textContent=Math.round(xn*100)+'%';
  document.getElementById('vYp')!.textContent=Math.round(yp*100)+'%';
  document.getElementById('vYn')!.textContent=Math.round(yn*100)+'%';
  document.getElementById('vZp')!.textContent=Math.round(zp*100)+'%';
  document.getElementById('vZn')!.textContent=Math.round(zn*100)+'%';

  appState.clipPlanes[0].set(new THREE.Vector3(-1,0,0), mn.x+sx*xp);
  appState.clipPlanes[1].set(new THREE.Vector3(1,0,0),  -(mn.x+sx*xn));
  appState.clipPlanes[2].set(new THREE.Vector3(0,-1,0), mn.y+sy*yp);
  appState.clipPlanes[3].set(new THREE.Vector3(0,1,0),  -(mn.y+sy*yn));
  appState.clipPlanes[4].set(new THREE.Vector3(0,0,-1), mn.z+sz*zp);
  appState.clipPlanes[5].set(new THREE.Vector3(0,0,1),  -(mn.z+sz*zn));

  appState.scene.traverse(c=>{if((c as any).isMesh&&!(c as any).userData?.isHandle&&c.parent?.name!=='sectionBox'){const ms=Array.isArray((c as any).material)?(c as any).material:[(c as any).material];ms.forEach((m: any)=>{m.clippingPlanes=appState.clipPlanes;m.clipShadows=true;m.needsUpdate=true})}});

  updateSectionBox3DPositions();
  if(window.requestPlanRender)window.requestPlanRender();
}

// ══ File handling ══
window.handleFile=async function(idx: number){
  const f=(document.getElementById('f'+idx) as HTMLInputElement).files![0];if(!f)return;
  appState.files[idx]=f;document.getElementById('uc'+idx)!.classList.add('loaded');
  document.getElementById('fn'+idx)!.textContent=f.name;
  document.getElementById('fs'+idx)!.textContent=(f.size/1048576).toFixed(2)+' MB';
  if(!appState.ifcLoader){if(!await initIFC())return}
  await loadIFC(idx);
};
[0,1].forEach(idx=>{
  const el=document.getElementById('uc'+idx)!;
  el.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();(el as HTMLElement).style.borderColor='var(--blue)'});
  el.addEventListener('dragleave',e=>{e.preventDefault();(el as HTMLElement).style.borderColor=''});
  el.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();(el as HTMLElement).style.borderColor='';
    const f=(e as DragEvent).dataTransfer!.files[0];if(f&&f.name.toLowerCase().endsWith('.ifc')){appState.files[idx]=f;el.classList.add('loaded');
    document.getElementById('fn'+idx)!.textContent=f.name;document.getElementById('fs'+idx)!.textContent=(f.size/1048576).toFixed(2)+' MB';
    (async()=>{if(!appState.ifcLoader){if(!await initIFC())return}await loadIFC(idx)})()}});
});

// ── Expose cross-module callers on window ──
// Invoked as window.X() from other modules (viewer-core pick handler, file-input
// /drive loaders, focus tools). In the deployed standalone these share one scope;
// the Vite port must attach them so the runtime calls resolve.
Object.assign(window as any, {
  clearHighlight, createSectionBox3D, initIFC, loadIFC,
  sectionPlanParallelToFace, updateSectionHandleSizes, zoomToElement,
  // These three were previously only reachable as window.X() from other
  // modules (main.ts, compare.ts, color-schemes.ts, clash.ts, focus-highlight.ts)
  // but were never actually attached to window, so those call sites silently
  // no-op'd: main.ts's post-init `initSectionDrag()` call never ran at all
  // (section-box arrow-handle dragging was completely non-functional), and
  // applyCategoryVisibilityViewMode/updateSectionFromSliders never re-synced
  // section clipping / category-filter subsets after Compare/Colorize/focus
  // changes in other modules.
  initSectionDrag, applyCategoryVisibilityViewMode, updateSectionFromSliders,
});
