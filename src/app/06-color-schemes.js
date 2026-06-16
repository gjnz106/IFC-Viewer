// ── Saved color schemes (LocalStorage) ────────────────────────────────
// Schemes persist in the browser (per-origin) under a single JSON blob.
// Each scheme captures mode + rules + Auto-mode value-color overrides, so
// loading restores the exact coloring the user set up previously.
const CZ_STORAGE_KEY='ifc-delta-color-schemes-v1';

function colorizeReadSchemes(){
  try{
    const raw=localStorage.getItem(CZ_STORAGE_KEY);
    if(!raw)return {};
    const obj=JSON.parse(raw);
    return (obj && typeof obj==='object') ? obj : {};
  }catch(e){log('Colorize: schemes read error',e?.message);return {}}
}
function colorizeWriteSchemes(schemes){
  try{
    localStorage.setItem(CZ_STORAGE_KEY, JSON.stringify(schemes));
    return true;
  }catch(e){
    log('Colorize: schemes write error',e?.message);
    // Most likely quota exceeded (5MB). Surface this rather than silently failing.
    alert('Could not save scheme: browser storage is full or blocked.');
    return false;
  }
}

// Save the current state (mode + rules + auto-mode value colors) as a named
// scheme. Prompts the user for a name. If a scheme with that name exists,
// ask whether to overwrite.
window.colorizeSaveScheme=function(){
  if(!colorize.active){alert('Turn on Colorize first, then save.');return}
  const name=(prompt('Name for this color scheme:','My scheme') || '').trim();
  if(!name)return;
  const schemes=colorizeReadSchemes();
  if(schemes[name]){
    if(!confirm('A scheme named "'+name+'" already exists. Overwrite?'))return;
  }
  schemes[name]={
    mode: colorize.mode,
    property: colorize.property,
    rules: JSON.parse(JSON.stringify(colorize.rules||[])), // deep clone
    valueColors: {...(colorize.valueColors||{})},
    savedAt: Date.now(),
  };
  if(colorizeWriteSchemes(schemes)){
    log('Colorize: saved scheme "'+name+'"');
    // If schemes panel is open, refresh it
    const sp=document.getElementById('czSchemesPanel');
    if(sp && sp.style.display!=='none')colorizeRenderSchemes();
  }
};

// Toggle the schemes sub-panel (shows list of saved schemes below the rules/
// legend area, above the footer). Clicking Load a second time closes it.
window.colorizeToggleSchemesPanel=function(){
  const sp=document.getElementById('czSchemesPanel');
  if(!sp)return;
  if(sp.style.display==='none'||!sp.style.display){
    colorizeRenderSchemes();
    sp.style.display='block';
  }else{
    sp.style.display='none';
  }
};

// Render the list of saved schemes. Each row: name + saved-date + delete btn.
// Click the row (outside the delete button) to load.
function colorizeRenderSchemes(){
  const sp=document.getElementById('czSchemesPanel');
  if(!sp)return;
  const schemes=colorizeReadSchemes();
  const names=Object.keys(schemes).sort((a,b)=>(schemes[b].savedAt||0)-(schemes[a].savedAt||0));
  if(!names.length){
    sp.innerHTML='<div class="cz-schemes-empty">No saved schemes yet.<br><span style="font-size:11px">Click 💾 Save to save the current setup.</span></div>';
    return;
  }
  const safeAttr=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html='';
  for(const n of names){
    const s=schemes[n];
    const when = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : '';
    const modeLabel = s.mode==='rules' ? ((s.rules||[]).length+'r') : (s.property||'auto');
    html+=`<div class="cz-scheme-row" onclick="colorizeLoadScheme('${safeAttr(n)}')">
      <span class="cz-scheme-name" title="${safeAttr(n)}">${safeAttr(n)}</span>
      <span class="cz-scheme-meta" title="${when}">${modeLabel}</span>
      <button class="cz-scheme-del" onclick="event.stopPropagation();colorizeDeleteScheme('${safeAttr(n)}')" title="Delete">🗑</button>
    </div>`;
  }
  sp.innerHTML=html;
}

// Load a scheme by name. Restores mode + rules + Auto overrides and re-applies.
window.colorizeLoadScheme=async function(name){
  const schemes=colorizeReadSchemes();
  const s=schemes[name];
  if(!s){alert('Scheme not found: '+name);return}
  colorize.mode = s.mode==='rules' ? 'rules' : 'auto';
  colorize.property = s.property || 'category';
  colorize.rules = JSON.parse(JSON.stringify(s.rules||[]));
  colorize.valueColors = {...(s.valueColors||{})};
  // Sync UI: tab active class, view visibility, dropdown value, render rules
  document.getElementById('czTabAuto').classList.toggle('active',colorize.mode==='auto');
  document.getElementById('czTabRules').classList.toggle('active',colorize.mode==='rules');
  document.getElementById('czViewAuto').style.display =(colorize.mode==='auto')?'':'none';
  document.getElementById('czViewRules').style.display=(colorize.mode==='rules')?'flex':'none';
  const sel=document.getElementById('czProp');
  if(sel && colorize.mode==='auto')sel.value=colorize.property;
  if(colorize.mode==='rules')colorizeRenderRules();
  // Hide schemes panel
  document.getElementById('czSchemesPanel').style.display='none';
  // If Colorize wasn't active yet, turn it on
  if(!colorize.active){
    if(compareResult){try{window.exitCompare&&exitCompare()}catch(e){}}
    colorize.active=true;
    document.getElementById('btnColorize').classList.add('active');
    document.getElementById('colorizePanel').classList.add('show');
  }
  await applyColorize();
  log('Colorize: loaded scheme "'+name+'"');
};

// Delete a scheme (with confirm).
window.colorizeDeleteScheme=function(name){
  if(!confirm('Delete scheme "'+name+'"?'))return;
  const schemes=colorizeReadSchemes();
  delete schemes[name];
  colorizeWriteSchemes(schemes);
  colorizeRenderSchemes();
};

// Dispose subsets: remove each from the scene. We don't call
// ifcManager.removeSubset because of a known web-ifc-three issue (#83) where
// it sometimes leaves visuals behind, and because we pass a fresh material
// to createSubset each apply cycle anyway — so the internal cache lookup
// keys are unique per cycle and GC handles them on next frame.
// We also don't call geometry.dispose() because web-ifc-three subsets can
// share geometry buffers with the main model — disposing them would break
// the main render.
function colorizeDisposeSubsets(){
  for(const sub of colorize.subsets){
    if(sub.parent)sub.parent.remove(sub);
  }
  colorize.subsets=[];
}

// Fade / un-fade the base models so colored subsets pop. Mirrors the pattern
// in applyDiffColors() so behavior is consistent between the two modes.
function colorizeFadeBase(fade){
  for(let i=0;i<2;i++){
    if(!loadedModels[i])continue;
    loadedModels[i].traverse(c=>{
      if(!c.isMesh)return;
      if(fade){
        // Back up materials once
        if(!c.userData._origMaterials){
          c.userData._origMaterials=Array.isArray(c.material)
            ? c.material.map(m=>m.clone())
            : c.material.clone();
        }
        const ms=Array.isArray(c.material)?c.material:[c.material];
        ms.forEach(m=>{
          m.color=new THREE.Color(0xc0c4cc);
          m.transparent=true;m.opacity=0.15;m.depthWrite=false;m.needsUpdate=true;
        });
      }else{
        // Restore
        if(c.userData._origMaterials){
          c.material=c.userData._origMaterials;
          delete c.userData._origMaterials;
          const ms=Array.isArray(c.material)?c.material:[c.material];
          ms.forEach(m=>{m.needsUpdate=true});
        }
      }
    });
  }
}

// Invalidate props cache when a model is (un)loaded so we rescan next time.
// Hook this into the existing load handler by exposing a small helper.
window._colorizeInvalidate=function(mi){
  if(mi===undefined){colorize.propsCache=[null,null]}
  else colorize.propsCache[mi]=null;
};


// ══ Lightweight single-element BBox ══
function getElementBBox(modelIdx,expressID){
  let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
  let found=false;
  const scan=(mesh)=>{
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
  if(loadedModels[modelIdx])loadedModels[modelIdx].traverse(c=>{if(c.isMesh)scan(c)});
  scene.traverse(c=>{if(c.isMesh&&c.userData?.srcModelIdx===modelIdx)scan(c)});
  
  if(!found)return null;
  return{
    size:{x:mxX-mnX,y:mxY-mnY,z:mxZ-mnZ},
    center:{x:(mnX+mxX)/2,y:(mnY+mxY)/2,z:(mnZ+mxZ)/2}
  };
}

// ══ Context Menu Actions ══
let hiddenExpressIDs=new Set();
let hiddenTypes=new Set();

window.ctxAction=function(action){
  const menu=document.getElementById('ctxMenu');
  menu.classList.remove('show');
  console.log('[CTX] action='+action, 'ctxTarget=', ctxTarget);
  
  if(action==='showAll'){showAllHidden();return}
  if(!ctxTarget){console.log('[CTX] no target, abort');return}
  
  const eid=ctxTarget.expressID;
  const mi=ctxTarget.modelIdx;
  const bbox=ctxTarget.bbox;
  const typeName=ctxTarget.typeName;
  console.log('[CTX] eid='+eid, 'mi='+mi, 'bbox=', bbox, 'type='+typeName);
  
  if(action==='hide'){hideExpressID(eid,mi);return}
  if(action==='isolate'){isolateExpressID(eid,mi);return}
  if(action==='hideType'&&typeName){hideByType(typeName);return}
  if(action==='isolateType'&&typeName){isolateByType(typeName,mi);return}
  if(action==='sectionFit'&&bbox){sectionAroundElement(bbox);return}
  if(action==='sectionPlane'){sectionPlanParallelToFace();return}
  if(action==='zoom'&&bbox){zoomToElement(bbox);return}
  if(action==='props'&&eid!=null&&mi>=0){
    ifcLoader.ifcManager.getItemProperties(loadedModels[mi].modelID,eid,true).then(p=>{if(p)showProps(p,mi)});
    return;
  }
  console.log('[CTX] action not handled or missing data');
};

function hideExpressID(eid,mi){
  console.log('[HIDE] eid='+eid+' mi='+mi);
  if(!ifcLoader||!loadedModels[mi])return;
  
  // Add to hidden set with model-aware key
  hiddenExpressIDs.add(mi+'_'+eid);
  
  // In compare mode, rebuild diff subsets; otherwise rebuild visibility subset
  if(compareResult){applyCatVis()}else{rebuildModelSubset(mi)}
  document.getElementById('btnShowAll').style.display='';
}

function hideByType(typeName){
  console.log('[HIDE TYPE]',typeName);
  const catIDs=window._catModelIDs||{};
  const ids=catIDs[typeName];
  if(ids){
    for(let mi=0;mi<2;mi++){
      if(ids[mi]&&ids[mi].length>0){
        ids[mi].forEach(id=>hiddenExpressIDs.add(mi+'_'+id));
        if(compareResult){applyCatVis()}else{rebuildModelSubset(mi)}
      }
    }
  }
  document.getElementById('btnShowAll').style.display='';
}

// Central function to rebuild visibility subset for a model
function rebuildModelSubset(mi){
  if(!ifcLoader||!loadedModels[mi])return;
  
  const allIDs=getAllExpressIDsForModel(mi);
  let showIDs=allIDs;
  
  // Apply isolated filter
  if(isolatedIDs){
    showIDs=showIDs.filter(id=>isolatedIDs.has(id));
  }
  // Remove hidden IDs for THIS specific model (keys are 'mi_eid')
  if(hiddenExpressIDs.size>0){
    showIDs=showIDs.filter(id=>!hiddenExpressIDs.has(mi+'_'+id));
  }
  
  const hiddenCount=allIDs.length-showIDs.length;
  console.log('[REBUILD] model='+mi+' total='+allIDs.length+' hidden='+hiddenCount+' showing='+showIDs.length);
  
  // Remove old vis subsets for this model
  visSubsets=visSubsets.filter(s=>{
    if(s.userData?.srcModelIdx===mi){if(s.parent)s.parent.remove(s);return false}
    return true;
  });
  
  // Hide base model
  loadedModels[mi].visible=false;
  
  if(showIDs.length===0)return;
  
  // If no filter active, just show original
  if(!isolatedIDs&&hiddenCount===0){
    loadedModels[mi].visible=true;
    return;
  }
  
  try{
    const sub=ifcLoader.ifcManager.createSubset({modelID:loadedModels[mi].modelID,ids:showIDs,removePrevious:true,customID:'vis_'+mi,scene:scene});
    if(sub){
      sub.position.copy(loadedModels[mi].position);sub.updateMatrixWorld(true);
      sub.userData.srcModelIdx=mi;
      sub.traverse(c=>{if(c.isMesh){c.userData.srcModelIdx=mi;const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach(m=>{m.clippingPlanes=clipPlanes;m.side=THREE.DoubleSide})}});
      visSubsets.push(sub);
      console.log('[REBUILD] subset created ok');
    }
  }catch(e){console.error('[REBUILD] error:',e)}
}

let isolatedIDs=null;

function isolateExpressID(eid,mi){
  console.log('[ISOLATE] eid='+eid+' mi='+mi);
  isolatedIDs=new Set([eid]);
  for(let i=0;i<2;i++){
    if(!loadedModels[i])continue;
    rebuildModelSubset(i);
  }
  document.getElementById('btnShowAll').style.display='';
}

function isolateByType(typeName,mi){
  console.log('[ISOLATE TYPE]',typeName);
  const catIDs=window._catModelIDs||{};
  isolatedIDs=new Set();
  const ids=catIDs[typeName];
  if(ids){for(let i=0;i<2;i++){if(ids[i])ids[i].forEach(id=>isolatedIDs.add(id))}}
  for(let i=0;i<2;i++){if(loadedModels[i])rebuildModelSubset(i)}
  document.getElementById('btnShowAll').style.display='';
}

// Get all expressIDs from a model by scanning geometry
function getAllExpressIDsForModel(mi){
  const ids=new Set();
  if(!loadedModels[mi])return[];
  loadedModels[mi].traverse(c=>{
    if(c.isMesh&&c.geometry?.attributes?.expressID){
      const arr=c.geometry.attributes.expressID.array;
      for(let i=0;i<arr.length;i++){if(arr[i]>0)ids.add(arr[i])}
    }
  });
  return[...ids];
}

let visSubsets=[];

window.showAllHidden=function(){
  console.log('[SHOW ALL]');
  hiddenExpressIDs.clear();
  hiddenTypes.clear();
  isolatedIDs=null;
  
  visSubsets.forEach(s=>{if(s.parent)s.parent.remove(s)});
  visSubsets=[];
  
  const visA=document.getElementById('visA')?.checked??true;
  const visB=document.getElementById('visB')?.checked??true;
  if(loadedModels[0])loadedModels[0].visible=visA;
  if(loadedModels[1])loadedModels[1].visible=visB;
  
  if(compareResult)applyCatVis();
  else if(typeof applyCategoryVisibilityViewMode==='function')applyCategoryVisibilityViewMode();
  
  document.getElementById('btnShowAll').style.display='none';
};

function sectionThroughElement(bbox,axis){
  console.log('[SECTION] axis='+axis, 'bbox=', bbox);
  if(!bbox){console.log('[SECTION] no bbox');return}
  const b=modelBounds;
  const c=bbox.center;
  const s=bbox.size;
  
  // Reset all sliders to full
  ['slXp','slYp','slZp'].forEach(id=>{document.getElementById(id).value=100});
  ['slXn','slYn','slZn'].forEach(id=>{document.getElementById(id).value=0});
  
  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
  const toSl=(val,mn,range)=>Math.max(0,Math.min(100,Math.round(((val-mn)/range)*100)));
  
  // Cut through the center of element on specified axis
  // Show a thin slice through the element
  const thickness=Math.max(s.x,s.y,s.z)*0.5+1; // Half element + 1m padding
  
  if(axis==='x'){
    document.getElementById('slXp').value=toSl(c.x+thickness,b.min.x,sx);
    document.getElementById('slXn').value=toSl(c.x-thickness,b.min.x,sx);
  }else if(axis==='y'){
    document.getElementById('slYp').value=toSl(c.y+thickness,b.min.y,sy);
    document.getElementById('slYn').value=toSl(c.y-thickness,b.min.y,sy);
  }else{
    document.getElementById('slZp').value=toSl(c.z+thickness,b.min.z,sz);
    document.getElementById('slZn').value=toSl(c.z-thickness,b.min.z,sz);
  }
  
  if(!sectionActive){
    sectionActive=true;
    document.getElementById('sectionPanel').classList.add('show');
    document.getElementById('btnSection').classList.add('active');
    createSectionBox3D();
  }
  updateSectionFromSliders();
  zoomToElement(bbox);
}

function sectionAroundElement(bbox){
  if(!bbox)return;
  const b=modelBounds;
  const c=bbox.center,s=bbox.size;
  // Padding: 30% of element size, min 1m, max 5m — keeps thin elements from
  // hugging the geometry too tight to see context (matches focusIssue rule).
  const pad=Math.max(Math.min(Math.max(s.x,s.y,s.z)*0.3, 5), 1);
  
  const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
  // Directional rounding so X+/X- (and Y, Z) never collapse to the same
  // integer when the element is tiny relative to the project bounds.
  // See focusIssue for the same fix.
  const slUp=(v,mn,r)=>Math.max(0,Math.min(100,Math.ceil( ((v-mn)/r)*100)));
  const slDn=(v,mn,r)=>Math.max(0,Math.min(100,Math.floor(((v-mn)/r)*100)));
  const ensureMin=(lo,hi,m)=>{
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
  document.getElementById('slXp').value=xHi;
  document.getElementById('slXn').value=xLo;
  document.getElementById('slYp').value=yHi;
  document.getElementById('slYn').value=yLo;
  document.getElementById('slZp').value=zHi;
  document.getElementById('slZn').value=zLo;
  
  if(!sectionActive){
    sectionActive=true;
    document.getElementById('sectionPanel').classList.add('show');
    document.getElementById('btnSection').classList.add('active');
    createSectionBox3D();
  }
  updateSectionFromSliders();
  zoomToElement(bbox);
}

