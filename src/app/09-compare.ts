  // ── Compute geometry hashes for both models ──
  const geoHashA=computeGeometryHashes(0);
  const geoHashB=computeGeometryHashes(1);
  log(`Geometry hashes: A=${Object.keys(geoHashA).length}, B=${Object.keys(geoHashB).length}`);
  
  // Log sample entries for debugging
  const sampleA=Object.entries(geoHashA).slice(0,3);
  const sampleB=Object.entries(geoHashB).slice(0,3);
  sampleA.forEach(([eid,h])=>log(`  GeoHash A #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));
  sampleB.forEach(([eid,h])=>log(`  GeoHash B #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));
  
  // ── Phase 1: Match by GlobalId (exact) ──
  const allGids=new Set([...Object.keys(a),...Object.keys(b)]);
  const unmatchedA=[];
  const unmatchedB=[];
  
  for(const gid of allGids){
    const ea=a[gid],eb=b[gid];
    if(ea&&eb){
      const d=[];
      if(ea.name!==eb.name)d.push({prop:'Name',oldVal:ea.name||'(empty)',newVal:eb.name||'(empty)'});
      if(ea.type!==eb.type)d.push({prop:'Type',oldVal:ea.type,newVal:eb.type});
      if(ea.description!==eb.description)d.push({prop:'Description',oldVal:ea.description||'—',newVal:eb.description||'—'});
      if(ea.objectType!==eb.objectType)d.push({prop:'ObjectType',oldVal:ea.objectType||'—',newVal:eb.objectType||'—'});
      if(ea.tag!==eb.tag)d.push({prop:'Element ID',oldVal:ea.tag||'—',newVal:eb.tag||'—'});
      
      // ── Geometry comparison with tolerance ──
      const ghA=geoHashA[ea.expressID];
      const ghB=geoHashB[eb.expressID];
      if(ghA&&ghB){
        // Vertex count change > 5% = geometry change
        const vcA=ghA.vertCount,vcB=ghB.vertCount;
        const vcDiff=Math.abs(vcA-vcB)/Math.max(vcA,vcB,1);
        if(vcDiff>0.05){
          d.push({prop:'Geometry (vertices)',oldVal:String(vcA),newVal:String(vcB)});
        }
        
        // Bounding box size change > 0.5% = significant
        const sA=ghA.size,sB=ghB.size;
        if(sA&&sB){
          const maxDim=Math.max(sA.x,sA.y,sA.z,sB.x,sB.y,sB.z,0.01);
          const dxS=Math.abs(sA.x-sB.x)/maxDim;
          const dyS=Math.abs(sA.y-sB.y)/maxDim;
          const dzS=Math.abs(sA.z-sB.z)/maxDim;
          if(dxS>0.005||dyS>0.005||dzS>0.005){
            d.push({prop:'Size Changed',oldVal:`${sA.x.toFixed(3)}×${sA.y.toFixed(3)}×${sA.z.toFixed(3)}`,newVal:`${sB.x.toFixed(3)}×${sB.y.toFixed(3)}×${sB.z.toFixed(3)}`});
          }
          
          // Position change > 0.01 units (10mm) = moved
          const cA=ghA.center,cB=ghB.center;
          if(cA&&cB){
            const posDist=Math.sqrt((cA.x-cB.x)**2+(cA.y-cB.y)**2+(cA.z-cB.z)**2);
            if(posDist>0.01){
              d.push({prop:'Position Moved',oldVal:`(${cA.x.toFixed(3)},${cA.y.toFixed(3)},${cA.z.toFixed(3)})`,newVal:`(${cB.x.toFixed(3)},${cB.y.toFixed(3)},${cB.z.toFixed(3)})`,distance:(posDist*1000).toFixed(0)+'mm'});
            }
          }
        }
        
        // Hash comparison — catches any vertex-level change not covered by bbox
        if(ghA.hash!==ghB.hash&&d.length===0){
          d.push({prop:'Geometry Changed',oldVal:'hash:'+ghA.hash,newVal:'hash:'+ghB.hash});
        }
      }
      
      d.length?modified.push({gid,a:ea,b:eb,status:'modified',diffs:d}):unchanged.push({gid,a:ea,b:eb,status:'unchanged'});
    }else if(ea&&!eb){
      unmatchedA.push(ea);
    }else if(!ea&&eb){
      unmatchedB.push(eb);
    }
  }
  
  log(`Phase1 (GlobalId+Geometry): modified=${modified.length}, unchanged=${unchanged.length}, unmatchedA=${unmatchedA.length}, unmatchedB=${unmatchedB.length}`);
  
  // Diagnostic: how many matched pairs had geometry data
  let geoFoundBoth=0,geoMissingA=0,geoMissingB=0,geoMissingBoth=0;
  [...modified,...unchanged].forEach(e=>{
    const hA=geoHashA[e.a.expressID],hB=geoHashB[e.b.expressID];
    if(hA&&hB)geoFoundBoth++;
    else if(!hA&&!hB)geoMissingBoth++;
    else if(!hA)geoMissingA++;
    else geoMissingB++;
  });
  log(`  Geo data: both=${geoFoundBoth}, missingA=${geoMissingA}, missingB=${geoMissingB}, missingBoth=${geoMissingBoth}`);
  
  // ── Phase 2: Smart match unmatched by Type + Name ──
  // When Revit modifies/moves an element, it often creates a new GlobalId.
  // We detect this by matching: same Type + same/similar Name → Modified (with new GlobalId)
  const matchedA=new Set();
  const matchedB=new Set();
  
  for(let i=0;i<unmatchedA.length;i++){
    if(matchedA.has(i))continue;
    const ea=unmatchedA[i];
    
    // Find best match in B: same type + same name (or similar name)
    let bestIdx=-1;
    let bestScore=0;
    
    for(let j=0;j<unmatchedB.length;j++){
      if(matchedB.has(j))continue;
      const eb=unmatchedB[j];
      
      // Must be same type
      if(ea.type!==eb.type)continue;
      
      let score=0;
      
      // Exact name match = strong signal
      if(ea.name&&eb.name&&ea.name===eb.name)score+=10;
      // Same objectType
      if(ea.objectType&&eb.objectType&&ea.objectType===eb.objectType)score+=5;
      // Same tag (Revit ElementId) = very strong signal
      if(ea.tag&&eb.tag&&ea.tag===eb.tag)score+=20;
      // Similar name (contains same base name)
      if(ea.name&&eb.name){
        const baseA=ea.name.replace(/[:\-\.]\d+$/,'').trim();
        const baseB=eb.name.replace(/[:\-\.]\d+$/,'').trim();
        if(baseA&&baseB&&baseA===baseB)score+=8;
      }
      
      if(score>bestScore){bestScore=score;bestIdx=j}
    }
    
    // If we found a good match (score >= 5), treat as Modified
    if(bestIdx>=0&&bestScore>=5){
      const eb=unmatchedB[bestIdx];
      matchedA.add(i);
      matchedB.add(bestIdx);
      
      const d=[];
      d.push({prop:'GlobalId',oldVal:ea.globalId,newVal:eb.globalId});
      if(ea.name!==eb.name)d.push({prop:'Name',oldVal:ea.name||'(empty)',newVal:eb.name||'(empty)'});
      if(ea.tag!==eb.tag)d.push({prop:'Element ID',oldVal:ea.tag||'—',newVal:eb.tag||'—'});
      if(ea.description!==eb.description)d.push({prop:'Description',oldVal:ea.description||'—',newVal:eb.description||'—'});
      
      modified.push({
        gid:eb.globalId, a:ea, b:eb, status:'modified',
        diffs:d.length>0?d:[{prop:'Element',oldVal:'Recreated',newVal:'New GlobalId assigned'}]
      });
    }
  }
  
  // ── Phase 3: Remaining unmatched → truly Added or Removed ──
  for(let i=0;i<unmatchedA.length;i++){
    if(!matchedA.has(i)){
      removed.push({gid:unmatchedA[i].globalId,entity:unmatchedA[i],status:'removed'});
    }
  }
  for(let j=0;j<unmatchedB.length;j++){
    if(!matchedB.has(j)){
      added.push({gid:unmatchedB[j].globalId,entity:unmatchedB[j],status:'added'});
    }
  }
  
  log(`Phase2 (smart match): +${modified.length-modified.length} modified via Type+Name`);
  log(`Final: added=${added.length}, removed=${removed.length}, modified=${modified.length}, unchanged=${unchanged.length}`);
  
  return{added,removed,modified,unchanged};
}

window.resetSection=function(){
  ['slXp','slYp','slZp'].forEach(id=>{document.getElementById(id).value=100});
  ['slXn','slYn','slZn'].forEach(id=>{document.getElementById(id).value=0});
  updateSectionFromSliders();
};

// Auto-focus section box on changed elements
window.focusSectionOnChanges=function(){
  if(!compareResult)return;
  const r=compareResult;
  
  // Collect expressIDs of all changed elements
  const changedIDs=new Set();
  r.added.forEach(e=>changedIDs.add(e.entity.expressID));
  r.removed.forEach(e=>changedIDs.add(e.entity.expressID));
  r.modified.forEach(e=>{changedIDs.add(e.a.expressID);changedIDs.add(e.b.expressID)});
  
  if(changedIDs.size===0){log('No changes to focus on');return}
  
  // Find bounding box of changed elements by scanning diff subsets
  let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
  let found=false;
  
  scene.traverse(c=>{
    if(!c.isMesh||!c.userData?.diffSubset)return;
    if(c.userData.diffSubset==='unchanged-b'||c.userData.diffSubset==='unchanged-b_cat')return;
    if(!c.geometry?.attributes?.position)return;
    
    const pos=c.geometry.attributes.position.array;
    const wm=c.matrixWorld;
    const v=new THREE.Vector3();
    for(let i=0;i<pos.length;i+=3){
      if(isNaN(pos[i]))continue;
      v.set(pos[i],pos[i+1],pos[i+2]).applyMatrix4(wm);
      if(isNaN(v.x))continue;
      if(v.x<mnX)mnX=v.x;if(v.x>mxX)mxX=v.x;
      if(v.y<mnY)mnY=v.y;if(v.y>mxY)mxY=v.y;
      if(v.z<mnZ)mnZ=v.z;if(v.z>mxZ)mxZ=v.z;
      found=true;
    }
  });
  
  if(!found){log('Could not compute bounds of changes');return}
  
  // Add padding around the changes (10% of model size on each side)
  const b=modelBounds;
  const padX=(b.max.x-b.min.x)*0.05;
  const padY=(b.max.y-b.min.y)*0.05;
  const padZ=(b.max.z-b.min.z)*0.05;
  mnX-=padX; mnY-=padY; mnZ-=padZ;
  mxX+=padX; mxY+=padY; mxZ+=padZ;
  
  // Convert world coords to slider percentages (0-100)
  const sx=b.max.x-b.min.x, sy=b.max.y-b.min.y, sz=b.max.z-b.min.z;
  const toSlider=(val,mn,range)=>Math.max(0,Math.min(100,Math.round(((val-mn)/range)*100)));
  
  document.getElementById('slXp').value=toSlider(mxX,b.min.x,sx);
  document.getElementById('slXn').value=toSlider(mnX,b.min.x,sx);
  document.getElementById('slYp').value=toSlider(mxY,b.min.y,sy);
  document.getElementById('slYn').value=toSlider(mnY,b.min.y,sy);
  document.getElementById('slZp').value=toSlider(mxZ,b.min.z,sz);
  document.getElementById('slZn').value=toSlider(mnZ,b.min.z,sz);
  
  // Activate section box if not already
  if(!sectionActive){
    sectionActive=true;
    document.getElementById('sectionPanel').classList.add('show');
    document.getElementById('btnSection').classList.add('active');
    createSectionBox3D();
  }
  
  updateSectionFromSliders();
  
  // Zoom camera to the changes area
  const cx=(mnX+mxX)/2, cy=(mnY+mxY)/2, cz=(mnZ+mxZ)/2;
  const maxDim=Math.max(mxX-mnX,mxY-mnY,mxZ-mnZ)*1.5;
  camera.position.set(cx+maxDim*0.6,cy+maxDim*0.5,cz+maxDim*0.6);
  controls.target.set(cx,cy,cz);
  controls.update();
  
  log(`Focused on changes: (${mnX.toFixed(1)},${mnY.toFixed(1)},${mnZ.toFixed(1)}) → (${mxX.toFixed(1)},${mxY.toFixed(1)},${mxZ.toFixed(1)})`);
};

function colorModel(m,color,opacity){m.traverse(c=>{if(c.isMesh){const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach(mt=>{mt.color=new THREE.Color(color);mt.transparent=true;mt.opacity=opacity;mt.needsUpdate=true})}})}

function showResultsUI(){
  const r=compareResult;
  document.getElementById('sumStrip').classList.add('show');
  document.getElementById('searchW').classList.add('show');
  document.getElementById('filterB').classList.add('show');
  document.getElementById('catFilter').classList.add('show');
  document.getElementById('vpLegend').classList.add('show');
  document.getElementById('btnExport').style.display='';
  document.getElementById('btnExportBCF').style.display='';
  document.getElementById('btnExitCompare').style.display='';
  document.getElementById('sA').textContent='+'+r.added.length;
  document.getElementById('sR').textContent='−'+r.removed.length;
  document.getElementById('sM').textContent='~'+r.modified.length;
  document.getElementById('sU').textContent=r.unchanged.length;
  activeFilter='all';
  activeCategories=new Set();
  document.querySelectorAll('.fchip').forEach(c=>c.classList.toggle('on',c.dataset.f==='all'));
  
  // Update catData with diff status counts
  const allItems=[...r.added,...r.removed,...r.modified,...r.unchanged];
  // Reset diff counts but keep totals from model scan
  Object.values(window._catData||{}).forEach(d=>{d.added=0;d.removed=0;d.modified=0});
  allItems.forEach(e=>{
    const en=e.entity||e.a||e.b;
    const t=en?.type||'Unknown';
    if(!window._catData[t])window._catData[t]={total:0,added:0,removed:0,modified:0};
    if(e.status==='added')window._catData[t].added++;
    if(e.status==='removed')window._catData[t].removed++;
    if(e.status==='modified')window._catData[t].modified++;
  });
  
  buildCatDropdown();
  updateCatTags();
  renderTree();
  buildIssues();
}

// ══ Tree ══
window.renderTree=function(){
  const r=compareResult;if(!r)return;
  const q=(document.getElementById('searchIn')?.value||'').toLowerCase();
  let items=[];
  if(activeFilter==='all'||activeFilter==='added')items.push(...r.added);
  if(activeFilter==='all'||activeFilter==='removed')items.push(...r.removed);
  if(activeFilter==='all'||activeFilter==='modified')items.push(...r.modified);
  if(activeFilter==='all'||activeFilter==='unchanged')items.push(...r.unchanged);
  
  // Category filter
  if(activeCategories.size>0){
    items=items.filter(e=>{const en=e.entity||e.a||e.b;return activeCategories.has(en?.type||'Unknown')});
  }
  
  if(q)items=items.filter(e=>{const en=e.entity||e.a||e.b;return(en?.name||'').toLowerCase().includes(q)||(en?.type||'').toLowerCase().includes(q)||(e.gid||'').toLowerCase().includes(q)});

  const groups={};
  items.forEach(e=>{const en=e.entity||e.a||e.b;const t=en?.type||'Unknown';(groups[t]=groups[t]||[]).push(e)});
  const sorted=Object.keys(groups).sort((a,b)=>{const ac=groups[a].some(e=>e.status!=='unchanged'),bc=groups[b].some(e=>e.status!=='unchanged');if(ac!==bc)return bc-ac;return groups[b].length-groups[a].length});

  let html='';
  for(const type of sorted){
    const list=groups[type];
    const na=list.filter(e=>e.status==='added').length,nr=list.filter(e=>e.status==='removed').length,nm=list.filter(e=>e.status==='modified').length;
    const badges=[na?`<span class="tg-b ba">+${na}</span>`:'',nr?`<span class="tg-b br">−${nr}</span>`:'',nm?`<span class="tg-b bm">~${nm}</span>`:''].filter(Boolean).join('');
    const col=activeFilter==='all'&&list.length>20&&!list.some(e=>e.status!=='unchanged');
    html+=`<div><div class="tg-hdr" onclick="togG(this)"><span class="tg-arr${col?' col':''}">▼</span><span class="tg-n">${type} (${list.length})</span>${badges}</div><div class="tg-items${col?' col':''}">`;
    list.slice(0,150).forEach(e=>{const en=e.entity||e.a||e.b;
      html+=`<div class="ti" data-g="${e.gid}" onclick="selI('${e.gid}')"><div class="ti-dot ${e.status}"></div><span class="ti-nm">${en?.name||'(unnamed)'}</span><span class="ti-id">${e.status}</span></div>`;
    });
    if(list.length>150)html+=`<div style="padding:4px 26px;font-size:12px;color:var(--text-muted)">+${list.length-150} more</div>`;
    html+='</div></div>';
  }
  document.getElementById('eTree').innerHTML=html||`<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">${items.length===0?'No changes found for this filter':'No match'}</div>`;
};
window.togG=function(h){h.querySelector('.tg-arr').classList.toggle('col');h.nextElementSibling.classList.toggle('col')};
window.selI=function(gid){
  const r=compareResult,all=[...r.added,...r.removed,...r.modified,...r.unchanged];
  const item=all.find(e=>e.gid===gid);if(!item)return;
  document.querySelectorAll('.ti').forEach(e=>e.classList.remove('sel'));
  const el=document.querySelector(`.ti[data-g="${gid}"]`);if(el){el.classList.add('sel');el.scrollIntoView({block:'nearest'})}
  const ent=item.entity||item.a||item.b;
  showEntityProps(item,ent);
};

function showEntityProps(item,ent){
  const c={added:'var(--green)',removed:'var(--red)',modified:'var(--amber)',unchanged:'var(--indigo)'};
  const bg={added:'var(--green-lt)',removed:'var(--red-lt)',modified:'var(--amber-lt)',unchanged:'var(--blue-lt)'};
  let h=`<div style="padding:8px 12px;background:${bg[item.status]};border-bottom:1px solid var(--border)"><span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${c[item.status]}">${item.status.toUpperCase()}</span></div>
  <div class="ps"><div class="ps-t">Identity</div>
  <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${ent?.globalId||'—'}</div></div>
  <div class="pr"><div class="pk">Type</div><div class="pv">${ent?.type||'—'}</div></div>
  <div class="pr"><div class="pk">Name</div><div class="pv">${ent?.name||'—'}</div></div>
  <div class="pr"><div class="pk">Tag</div><div class="pv">${ent?.tag||'—'}</div></div></div>`;
  if(item.diffs){
    h+=`<div class="ps"><div class="ps-t">Changes (${item.diffs.length})</div>`;
    item.diffs.forEach(d=>{h+=`<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`});
    h+='</div>';
  }
  document.getElementById('propArea').innerHTML=h;
}

