// ── Render the properties accordion (Dalux-style) ────────────────────
// `groups` is an array of {name, rows: [{label, value, _empty?}]}.
// Renders a sticky toolbar at top with element header + total count +
// Expand all / Collapse all buttons, then a sequence of collapsible
// group headers. Default state: only "Identity" expanded (the most-
// useful info on first inspect). Click any header to toggle.
function renderPropertiesAccordion(elementHeader, groups){
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // Drop empty groups (no rows AND no _empty marker)
  const visibleGroups = groups.filter(g=>g.rows.length>0);
  // Default-expanded set: Identity only. Users can expand all via toolbar.
  const DEFAULT_OPEN = new Set(['Identity']);
  // Total row count for the toolbar badge
  const totalRows = visibleGroups.reduce((sum,g)=>sum+g.rows.filter(r=>!r._empty).length, 0);

  let html = '';
  // Sticky toolbar with element name + total count + expand/collapse buttons.
  // Replaces the older blue eid-banner + ps-section split — combining them
  // into one row saves vertical space and matches Dalux's compact layout.
  html += `<div class="prop-toolbar">
    <span class="prop-toolbar-title">${esc(elementHeader)}</span>
    <span class="prop-toolbar-count">${totalRows}</span>
    <button class="prop-toolbar-btn" onclick="propAccordionToggleAll(true)" title="Expand all">⊞ Expand all</button>
    <button class="prop-toolbar-btn" onclick="propAccordionToggleAll(false)" title="Collapse all">⊟ Collapse all</button>
  </div>`;
  // One row per group
  for(const g of visibleGroups){
    const open = DEFAULT_OPEN.has(g.name);
    const rowCount = g.rows.filter(r=>!r._empty).length;
    let rowsHtml = '';
    for(const r of g.rows){
      if(r._empty){
        rowsHtml += `<div class="pr"><div class="pk" style="grid-column:1/-1;color:var(--text-muted);font-style:italic;font-size:11px">(no properties)</div></div>`;
      }else{
        rowsHtml += `<div class="pr"><div class="pk">${esc(r.label)}</div><div class="pv">${esc(r.value)}</div></div>`;
      }
    }
    html += `<div class="prop-group">
      <div class="prop-group-hdr${open?' expanded':''}" onclick="propAccordionToggle(this)">
        <span class="prop-group-arr">▶</span>
        <span class="prop-group-name">${esc(g.name)}</span>
        <span class="prop-group-cnt">${rowCount}</span>
      </div>
      <div class="prop-group-body">${rowsHtml}</div>
    </div>`;
  }
  document.getElementById('propArea').innerHTML = html;
}

// Toggle a single group header (click event handler).
window.propAccordionToggle=function(hdr){
  if(!hdr)return;
  hdr.classList.toggle('expanded');
};

// Expand or collapse every group in the properties panel.
window.propAccordionToggleAll=function(expand){
  const headers=document.querySelectorAll('#propArea .prop-group-hdr');
  headers.forEach(h=>{
    if(expand)h.classList.add('expanded');
    else      h.classList.remove('expanded');
  });
};

// ── Right-panel tabs: Properties / SG Check ──
window.rpSelect=function(tab){
  document.getElementById('rpTabProps')?.classList.toggle('on', tab==='props');
  document.getElementById('rpTabSG')?.classList.toggle('on', tab==='sg');
  const propArea=document.getElementById('propArea');
  const sgEmpty=document.getElementById('rpSGEmpty');
  if(propArea) propArea.style.display = tab==='props' ? '' : 'none';
  if(tab==='sg'){
    if(sgEmpty) sgEmpty.style.display = sgState.open ? 'none' : 'flex';
    if(!sgState.open) (window as any).toggleSGCheckPanel?.();
  }else{
    if(sgEmpty) sgEmpty.style.display = 'none';
    if(sgState.open) (window as any).toggleSGCheckPanel?.();
  }
};

async function showProps(props,modelIdx){
  (window as any).rpSelect?.('props');
  const mid=loadedModels[modelIdx]?.modelID;
  const eid=props.expressID;
  const mgr=ifcLoader?.ifcManager;

  // ── Helpers ──
  // Pull a scalar value safely regardless of whether web-ifc returned
  // {value:X, type: labelcode} or a raw primitive or an array.
  const getVal=(v)=>{
    if(v===null||v===undefined)return '';
    if(Array.isArray(v))return v.map(getVal).filter(x=>x!=='').join(', ');
    if(typeof v==='object' && 'value' in v){
      // IfcValue wrapper — .value is the actual data
      const inner=v.value;
      if(inner===null||inner===undefined)return '';
      if(typeof inner==='number')return Number.isInteger(inner)?String(inner):(+inner.toFixed(6)+'').replace(/\.?0+$/,'');
      return String(inner);
    }
    if(typeof v==='object'){
      // Complex nested object (reference / entity). Show label if we can.
      if('type' in v && 'expressID' in v)return `#${v.expressID} <${IFC_NAMES[v.type]||'IFC_'+v.type}>`;
      return '';
    }
    if(typeof v==='number')return Number.isInteger(v)?String(v):(+v.toFixed(6)+'').replace(/\.?0+$/,'');
    return String(v);
  };
  // Units for this model (set during loadIFC). Fallback: identity-ish defaults.
  const units = loadedModels[modelIdx]?.units || {
    lengthFactor:1000, lengthUnit:'mm',
    areaFactor:1,      areaUnit:'m²',
    volumeFactor:1,    volumeUnit:'m³',
  };
  const spatial = loadedModels[modelIdx]?.spatial || null;

  // Format a number with unit. Length values get thousands-separator + mm
  // suffix (e.g. "1,619 mm"). Area/volume show 2 decimals + unit.
  const fmtLength=(raw)=>{
    if(typeof raw!=='number'||isNaN(raw))return '';
    const mm = raw * units.lengthFactor;
    // Round to 0 decimals for mm (engineering convention)
    const rounded = Math.round(mm);
    return rounded.toLocaleString('en-US') + ' ' + units.lengthUnit;
  };
  const fmtArea=(raw)=>{
    if(typeof raw!=='number'||isNaN(raw))return '';
    const m2 = raw * units.areaFactor;
    return m2.toFixed(2) + ' ' + units.areaUnit;
  };
  const fmtVolume=(raw)=>{
    if(typeof raw!=='number'||isNaN(raw))return '';
    const m3 = raw * units.volumeFactor;
    return m3.toFixed(3) + ' ' + units.volumeUnit;
  };

  // Pretty-print a property value of any IfcProperty* subtype.
  // Detect measure type to apply unit conversion. For IfcQuantity* the type
  // is implicit in the field name (LengthValue vs AreaValue). For regular
  // IfcPropertySingleValue we inspect the NominalValue wrapper's type code.
  const extractPropValue=(p)=>{
    if(!p)return '';
    // ── IfcQuantity* (IfcElementQuantity) ──
    // These have fixed semantic types that web-ifc represents as dedicated
    // fields. Apply unit conversion based on the field used.
    if(p.LengthValue !==undefined)return fmtLength(p.LengthValue?.value ?? p.LengthValue);
    if(p.AreaValue   !==undefined)return fmtArea  (p.AreaValue?.value   ?? p.AreaValue);
    if(p.VolumeValue !==undefined)return fmtVolume(p.VolumeValue?.value ?? p.VolumeValue);
    if(p.WeightValue !==undefined){const v=p.WeightValue?.value??p.WeightValue;return (typeof v==='number')?(v.toFixed(2)+' kg'):getVal(p.WeightValue)}
    if(p.CountValue  !==undefined)return getVal(p.CountValue);
    if(p.TimeValue   !==undefined){const v=p.TimeValue?.value??p.TimeValue;return (typeof v==='number')?(v.toFixed(2)+' s'):getVal(p.TimeValue)}
    // ── IfcPropertySingleValue.NominalValue ──
    // The type code on the NominalValue wrapper tells us what measure it is.
    // We don't have a rock-solid mapping, so the hybrid fallback:
    //   1. Try to detect by property Name (e.g. "Length", "Width",
    //      "OuterSurfaceArea") — pattern matching on common Pset conventions.
    //   2. Otherwise render as a raw number via getVal().
    if(p.NominalValue!==undefined){
      const nv=p.NominalValue;
      const rawV = (nv && typeof nv==='object' && 'value' in nv) ? nv.value : nv;
      const name = (p.Name?.value || p.Name || '').toString();
      if(typeof rawV==='number'){
        // Length-ish property names (case-insensitive exact match on common suffixes)
        if(/^(length|width|height|thickness|diameter|radius|depth|size|perimeter|offset|overall(length|width|height)|nominallength|nominalwidth|nominalheight|nominaldiameter|wall\s*thickness|insulation\s*thickness|invertelevation|elevation)$/i.test(name)){
          return fmtLength(rawV);
        }
        // Area-ish
        if(/area$/i.test(name)){
          return fmtArea(rawV);
        }
        // Volume-ish
        if(/volume$/i.test(name)){
          return fmtVolume(rawV);
        }
      }
      return getVal(nv);
    }
    if(p.EnumerationValues)return getVal(p.EnumerationValues);
    if(p.ListValues)return getVal(p.ListValues);
    if(p.LowerBoundValue!==undefined||p.UpperBoundValue!==undefined){
      const lo=getVal(p.LowerBoundValue), up=getVal(p.UpperBoundValue);
      return `[${lo||'−∞'} .. ${up||'+∞'}]`;
    }
    return getVal(p);
  };
  const resolveRef=async(ref, recursive=false)=>{
    if(!ref||mid===undefined)return null;
    const id=typeof ref==='number'?ref:(ref?.value ?? null);
    if(typeof id!=='number'||id<=0)return null;
    try{return await mgr.getItemProperties(mid, id, recursive)}catch(e){return null}
  };
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const addRow=(label,val)=>{
    if(val===''||val===undefined||val===null)return;
    if(!curGroup){beginGroup('Other')}
    curGroup.rows.push({label, value: val});
  };

  const ifcClass = IFC_NAMES[props.type] || ('IFC_'+props.type);
  const revitCat = ifcClassToRevitCategory(ifcClass);

    // ── Group accumulator ──
  // showProps now collects sections into a `groups` array of
  // {name, rows: [{label, value}]} objects, then renders them as a
  // collapsible accordion at the end (Dalux-style). The legacy `h`
  // string concatenation is kept only for the section bridges that
  // get rewritten below; final output is built by renderPropertiesAccordion().
  const groups=[];
  let curGroup=null;
  const beginGroup=(name)=>{ curGroup={name, rows:[]}; groups.push(curGroup); };
  const elementHeader = `Version ${modelIdx===0?'A':'B'} — #${eid}`;
  let h='';

  // ── Identity section ──
  beginGroup('Identity');
  addRow('Category', revitCat);
  addRow('IFC Class', ifcClass);
  addRow('Name', getVal(props.Name));
  addRow('Description', getVal(props.Description));
  addRow('ObjectType', getVal(props.ObjectType));
  addRow('Tag / Element ID', getVal(props.Tag));
  addRow('PredefinedType', getVal(props.PredefinedType));
  addRow('GlobalId', getVal(props.GlobalId));
  /* end-group */;

  // ── Type section (IsTypedBy → IfcElementType) ──
  let typeObj=null;
  try{
    // Prefer the dedicated getTypeProperties when available — handles
    // IsTypedBy traversal natively.
    if(mgr.getTypeProperties){
      const types=await mgr.getTypeProperties(mid, eid, true);
      if(Array.isArray(types)&&types.length>0)typeObj=types[0];
    }
    // Fallback: manual resolve
    if(!typeObj && props.IsTypedBy){
      const refs=Array.isArray(props.IsTypedBy)?props.IsTypedBy:[props.IsTypedBy];
      for(const r of refs){
        const rel=await resolveRef(r);
        if(!rel)continue;
        const to=await resolveRef(rel.RelatingType, true);
        if(to){typeObj=to;break}
      }
    }
  }catch(e){log('Type resolve err:',e?.message)}
  if(typeObj){
    const typeClass=IFC_NAMES[typeObj.type]||('IFC_'+typeObj.type);
    beginGroup('Type');
    addRow('Type Name', getVal(typeObj.Name));
    addRow('Type Class', typeClass);
    addRow('Type Tag', getVal(typeObj.Tag));
    addRow('Type Description', getVal(typeObj.Description));
    addRow('Type PredefinedType', getVal(typeObj.PredefinedType));
    addRow('ElementType', getVal(typeObj.ElementType));
    /* end-group */;
  }

  // ── Material (HasAssociations → IfcRelAssociatesMaterial) ──
  let materialLabel='';
  try{
    if(mgr.getMaterialsProperties){
      const mats=await mgr.getMaterialsProperties(mid, eid, true, true);
      if(Array.isArray(mats)&&mats.length>0){
        const names=[];
        const walk=(m)=>{
          if(!m)return;
          if(m.Name){const n=getVal(m.Name);if(n)names.push(n)}
          if(m.MaterialLayers){
            const layers=Array.isArray(m.MaterialLayers)?m.MaterialLayers:[m.MaterialLayers];
            for(const l of layers)walk(l?.Material||l);
          }
          if(m.ForLayerSet)walk(m.ForLayerSet);
          if(m.Materials){
            const items=Array.isArray(m.Materials)?m.Materials:[m.Materials];
            for(const it of items)walk(it);
          }
          if(m.Material&&typeof m.Material==='object')walk(m.Material);
        };
        for(const m of mats)walk(m);
        materialLabel=[...new Set(names)].join(', ');
      }
    }
  }catch(e){log('Material resolve err:',e?.message)}

  // ── Level / Storey (ContainedInStructure → IfcRelContainedInSpatialStructure) ──
  let levelLabel='';
  try{
    if(props.ContainedInStructure){
      const refs=Array.isArray(props.ContainedInStructure)?props.ContainedInStructure:[props.ContainedInStructure];
      for(const r of refs){
        const rel=await resolveRef(r);
        if(!rel?.RelatingStructure)continue;
        const struct=await resolveRef(rel.RelatingStructure);
        if(struct?.Name){levelLabel=getVal(struct.Name);break}
      }
    }
  }catch(e){}

  // ── System / Group (HasAssignments → IfcRelAssignsToGroup) ──
  let systemLabel='';
  try{
    if(props.HasAssignments){
      const refs=Array.isArray(props.HasAssignments)?props.HasAssignments:[props.HasAssignments];
      for(const r of refs){
        const rel=await resolveRef(r);
        if(!rel?.RelatingGroup)continue;
        const grp=await resolveRef(rel.RelatingGroup);
        if(grp?.Name){
          const gc=IFC_NAMES[grp.type]||('IFC_'+grp.type);
          systemLabel=getVal(grp.Name)+(gc?' ('+gc+')':'');
          break;
        }
      }
    }
  }catch(e){}

  // ── Find current storey index (for computing distances to adjacent ones) ──
  let currentStoreyIdx = -1;
  if(spatial && levelLabel){
    currentStoreyIdx = spatial.storeys.findIndex(s=>s.name===levelLabel);
  }

  // ── Compute elevation info from element bbox (Three.js Y-up space) ──
  // In IFC Z is vertical (up), but three.js uses Y-up. web-ifc-three converts
  // geometry so Z becomes Y. Meaning: Y in three-space == Z in IFC-space.
  let topY=null, botY=null, gX=null, gY=null, gZ=null;
  try{
    const bb=getElementBBox(modelIdx, eid);
    if(bb && bb.center){
      topY = bb.center.y + bb.size.y/2;
      botY = bb.center.y - bb.size.y/2;
      // Global = bbox center. Reverse-apply model offset if model is translated.
      const off = loadedModels[modelIdx]?.position || {x:0,y:0,z:0};
      // Three.js (x,y,z) ↔ IFC (x,z,-y). y is vertical in three → Z in IFC.
      gX = bb.center.x - off.x;
      gY = -(bb.center.z - off.z);  // IFC Y = -three.Z
      gZ = bb.center.y - off.y;     // IFC Z = three.Y
      // Also unshift topY/botY from model offset to get world IFC Z
      topY = topY - off.y;
      botY = botY - off.y;
    }
  }catch(e){}

  // ── Always render Location section if we have ANY data (project/site/
  // building/storey/elevation/coords) ──
  // This mirrors BIMcollab's Location tab: 13 fields of spatial + geometric
  // context that help BIM engineers orient themselves in the model.
  const haveLocation = spatial || materialLabel || systemLabel ||
                       topY!==null || gX!==null;
  if(haveLocation){
    beginGroup('Location');
    // Spatial hierarchy
    if(spatial){
      addRow('Model',          spatial.modelName || loadedModels[modelIdx]?.fileName);
      addRow('Project',        spatial.projectName);
      addRow('Site',           spatial.siteName);
      addRow('Building',       spatial.buildingName);
    }
    addRow('Building Story',   levelLabel);
    addRow('System',           systemLabel);
    addRow('Material',         materialLabel);
    // Elevations (IFC Z in project units → convert to mm via lengthFactor)
    // Note: we use the model position offset so these are in project global
    // coords, matching BIMcollab's "Top Elevation" / "Bottom Elevation".
    if(topY!==null)addRow('Top Elevation',    fmtLength(topY));
    if(botY!==null)addRow('Bottom Elevation', fmtLength(botY));
    // Distances to adjacent storeys — find the storey ABOVE current and the
    // one BELOW current (sorted by elevation). Compute signed distance from
    // element top to next storey and from element bottom to storey below.
    if(spatial && spatial.storeys.length>1 && topY!==null && botY!==null){
      let next=null, prev=null;
      for(const s of spatial.storeys){
        if(s.elevation > topY && (!next || s.elevation<next.elevation))next=s;
        if(s.elevation < botY && (!prev || s.elevation>prev.elevation))prev=s;
      }
      if(next)addRow('Top distance to next Story',    fmtLength(topY - next.elevation));
      if(prev)addRow('Bottom distance to next Story', fmtLength(botY - prev.elevation));
    }
    // Global coords — element bbox center in IFC coord system
    if(gX!==null)addRow('Global X', fmtLength(gX));
    if(gY!==null)addRow('Global Y', fmtLength(gY));
    if(gZ!==null)addRow('Global Z', fmtLength(gZ));
    // "Elevation" in BIMcollab is usually the bottom Z of the element (aka
    // floor-level elevation). Provide as an alias for convenience.
    if(botY!==null)addRow('Elevation', fmtLength(botY));
    /* end-group */;
  }

  // ── All Property Sets (instance + type, merged by web-ifc) ──
  // Passing (recursive=true, includeTypeProperties=true) means web-ifc walks
  // the IsDefinedBy and IsTypedBy relationships for us and returns every pset
  // (both instance-level and type-level) in one call. This is the canonical
  // way to get comprehensive property data.
  let allPsets=[];
  try{
    const data=await mgr.getPropertySets(mid, eid, true, true);
    if(Array.isArray(data))allPsets=data;
  }catch(e){log('Pset resolve err:',e?.message)}

  // De-duplicate by pset expressID in case the API returns an inst+type combo
  const seenPset=new Set();
  for(const pset of allPsets){
    if(!pset)continue;
    if(pset.expressID && seenPset.has(pset.expressID))continue;
    if(pset.expressID)seenPset.add(pset.expressID);
    const psetName=getVal(pset.Name)||'Properties';
    // Mark type-level psets (those attached via IfcRelDefinesByType typically
    // appear after instance ones; heuristic: pset name contains "TypeCommon"
    // or came from the resolved type object).
    const isType=/TypeCommon$/i.test(psetName);
    const displayName = isType ? `[${psetName}]` : psetName;
    beginGroup(displayName);
    let rowCount=0;
    // HasProperties (IfcPropertySet)
    if(pset.HasProperties){
      const hps=Array.isArray(pset.HasProperties)?pset.HasProperties:[pset.HasProperties];
      for(const hp of hps){
        const p = typeof hp?.value==='number' ? await resolveRef(hp) : hp;
        if(!p)continue;
        const n=getVal(p.Name);
        const v=extractPropValue(p);
        if(n){addRow(n, v||'—');rowCount++}
      }
    }
    // Quantities (IfcElementQuantity)
    if(pset.Quantities){
      const qs=Array.isArray(pset.Quantities)?pset.Quantities:[pset.Quantities];
      for(const q of qs){
        const qp = typeof q?.value==='number' ? await resolveRef(q) : q;
        if(!qp)continue;
        const n=getVal(qp.Name);
        const v=extractPropValue(qp);
        if(n){addRow(n, v||'—');rowCount++}
      }
    }
    if(rowCount===0){
      if(curGroup){curGroup.rows.push({label:'', value:'(no properties)', _empty:true})};
    }
    /* end-group */;
  }

  // ── All Raw Attributes (everything web-ifc returned on this entity) ──
  // Collapsible catch-all so user can verify no data was missed. Shown as
  // key-value pairs with resolved references expanded. Useful for debugging
  // and for non-standard props the authoring tool stuffed at entity level.
  const IDENTITY_KEYS=new Set(['Name','Description','ObjectType','Tag','PredefinedType','GlobalId','OwnerHistory','ObjectPlacement','Representation','expressID','type']);
  const REL_KEYS=new Set(['IsDefinedBy','IsTypedBy','HasAssociations','HasAssignments','ContainedInStructure','Decomposes','IsDecomposedBy','ReferencedBy','HasOpenings','FillsVoids','ConnectedFrom','ConnectedTo','HasProjections','HasStructuralMember','ReferencedInStructures']);
  const attrRows=[];
  for(const k of Object.keys(props)){
    if(IDENTITY_KEYS.has(k))continue;
    if(REL_KEYS.has(k))continue; // already surfaced above
    const v=props[k];
    if(v===null||v===undefined)continue;
    const val=getVal(v);
    if(val)attrRows.push({k,v:val});
  }
  if(attrRows.length>0){
    beginGroup('Raw Attributes');
    for(const {k,v} of attrRows)addRow(k, v);
    /* end-raw-group */;
  }

  renderPropertiesAccordion(elementHeader, groups);
}
// Public alias so other modules (plan view shift-click select) can invoke
window.showProps = showProps;

// ══ Controls ══
window.zoomFit=function(){
  let mn=new THREE.Vector3(Infinity,Infinity,Infinity),mx=new THREE.Vector3(-Infinity,-Infinity,-Infinity),ok=false;
  scene.traverse(c=>{if(c.isMesh&&c.visible&&c.geometry?.attributes?.position){const p=c.geometry.attributes.position.array,wm=c.matrixWorld,v=new THREE.Vector3();for(let i=0;i<p.length;i+=3){if(isNaN(p[i]))continue;v.set(p[i],p[i+1],p[i+2]).applyMatrix4(wm);if(isNaN(v.x))continue;mn.min(v);mx.max(v);ok=true}}});
  if(!ok)return;const ct=new THREE.Vector3().addVectors(mn,mx).multiplyScalar(.5),sz=new THREE.Vector3().subVectors(mx,mn),d=Math.max(sz.x,sz.y,sz.z)*1.5;
  camera.near=Math.max(d*.001,.01);camera.far=Math.max(d*50,5000);camera.updateProjectionMatrix();
  camera.position.set(ct.x+d*.6,ct.y+d*.5,ct.z+d*.6);controls.target.copy(ct);controls.update();
};
window.resetCam=function(){camera.position.set(30,25,30);controls.target.set(0,0,0);controls.update();if(loadedModels.some(m=>!!m))zoomFit()};
window.toggleWire=function(){scene.traverse(c=>{if(c.isMesh){const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach(m=>m.wireframe=!m.wireframe)}})};

// ══ Screenshot ══
window.captureScreenshot=function(){
  renderer.render(scene,camera);
  const dataURL=renderer.domElement.toDataURL('image/png');
  const a=document.createElement('a');
  a.href=dataURL;
  a.download='ifc-screenshot-'+new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')+'.png';
  a.click();
  log('Screenshot saved');
};

// ══ Measurement Tool ══
let measureMode=false;
let measureType='distance'; // 'distance' or 'level'
let measurePoints=[];
let measureMarkers=[];
let measureLine=null;
let measureLabel=null;

window.setMeasureMode=function(type){
  measureType=type;
  clearMeasure();
  // Update button styles
  const dBtn=document.getElementById('modeDistance');
  const lBtn=document.getElementById('modeLevel');
  if(type==='distance'){
    dBtn.style.borderColor='var(--blue)';dBtn.style.background='var(--blue-lt)';dBtn.style.color='var(--blue)';dBtn.style.fontWeight='600';
    lBtn.style.borderColor='var(--border)';lBtn.style.background='var(--bg-card)';lBtn.style.color='var(--text-dim)';lBtn.style.fontWeight='400';
    document.getElementById('measureText').textContent='Click first point';
  }else{
    lBtn.style.borderColor='var(--blue)';lBtn.style.background='var(--blue-lt)';lBtn.style.color='var(--blue)';lBtn.style.fontWeight='600';
    dBtn.style.borderColor='var(--border)';dBtn.style.background='var(--bg-card)';dBtn.style.color='var(--text-dim)';dBtn.style.fontWeight='400';
    document.getElementById('measureText').textContent='Click a point to read elevation';
  }
};

window.toggleMeasure=function(){
  measureMode=!measureMode;
  document.getElementById('btnMeasure').classList.toggle('active',measureMode);
  document.getElementById('measureInfo').style.display=measureMode?'flex':'none';
  if(!measureMode){
    clearMeasure();
  }else{
    setMeasureMode(measureType);
    renderer.domElement.style.cursor='crosshair';
  }
};

window.clearMeasure=function(){
  measurePoints=[];
  measureMarkers.forEach(m=>{if(m.parent)m.parent.remove(m)});
  measureMarkers=[];
  if(measureLine){if(measureLine.parent)measureLine.parent.remove(measureLine);measureLine=null}
  if(measureLabel){if(measureLabel.parent)measureLabel.parent.remove(measureLabel);measureLabel=null}
  renderer.domElement.style.cursor=measureMode?'crosshair':'';
  if(measureMode){
    document.getElementById('measureText').textContent=measureType==='distance'?'Click first point':'Click a point to read elevation';
  }
};

function addMeasurePoint(point){
  // Create sphere marker
  const geo=new THREE.SphereGeometry(0.08,12,12);
  const color=measureType==='level'?0xf59e0b:0x2563eb;
  const mat=new THREE.MeshBasicMaterial({color,depthTest:false});
  const sphere=new THREE.Mesh(geo,mat);
  sphere.position.copy(point);
  sphere.renderOrder=999;
  scene.add(sphere);
  measureMarkers.push(sphere);
  measurePoints.push(point.clone());
  
