  // ── Find element bbox by scanning scene meshes for matching expressID ──
  // We scan EVERY mesh in the scene that has an expressID attribute. This
  // covers: diff subsets (added/removed/modified-a/modified-b/unchanged-b)
  // created during compare, AND the base models. Whichever finds the
  // element first wins. Tracking which mesh matched lets us also use it
  // directly for highlighting without needing createSubset.
  let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
  let found=false;
  let scanCount=0, hitCount=0;

  scene.traverse(c=>{
    if(!c.isMesh||!c.geometry?.attributes?.expressID||!c.geometry?.attributes?.position)return;
    scanCount++;
    const eidArr=c.geometry.attributes.expressID.array;
    const posArr=c.geometry.attributes.position.array;
    const wm=c.matrixWorld;
    const v=new THREE.Vector3();
    let localHit=false;
    for(let i=0;i<eidArr.length;i++){
      if(eidArr[i]!==targetEID)continue;
      const pi=i*3;
      if(pi+2>=posArr.length||isNaN(posArr[pi]))continue;
      v.set(posArr[pi],posArr[pi+1],posArr[pi+2]).applyMatrix4(wm);
      if(isNaN(v.x))continue;
      if(v.x<mnX)mnX=v.x;if(v.x>mxX)mxX=v.x;
      if(v.y<mnY)mnY=v.y;if(v.y>mxY)mxY=v.y;
      if(v.z<mnZ)mnZ=v.z;if(v.z>mxZ)mxZ=v.z;
      found=true;localHit=true;
    }
    if(localHit)hitCount++;
  });
  log(`focusIssue: scanned ${scanCount} meshes, ${hitCount} contained eid ${targetEID}, found=${found}`);

  if(!found){
    log('Issue focus FAILED: geometry not in scene. Showing properties only.');
    showIssueProps(iss);
    return;
  }

  // Compute element center + a generous frame distance
  const cx=(mnX+mxX)/2, cy=(mnY+mxY)/2, cz=(mnZ+mxZ)/2;
  const elSize=Math.max(mxX-mnX, mxY-mnY, mxZ-mnZ);
  log(`focusIssue: element bbox center=(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}) size=${elSize.toFixed(2)}`);

  // ── Camera move ──
  // Move camera FIRST (before section box so the user sees the new view
  // even if section box update fails for some reason). Camera distance is
  // 1.5× the largest element dimension + a 5m floor so tiny elements still
  // get a comfortable framing.
  const viewDist=Math.max(elSize*1.5, 5);
  camera.position.set(cx+viewDist*0.5, cy+viewDist*0.4, cz+viewDist*0.5);
  controls.target.set(cx, cy, cz);
  controls.update();
  // Invalidate any stale pivot — we just moved the camera explicitly, so
  // the next click should set a fresh pivot from the new state.
  if(window._pendingPivot)window._pendingPivot=null;

  // ── Section box ──
  // Tighten section box around element + small padding (10% or 0.5m floor).
  // If section box wasn't active, activate it. If sliders fail to compute
  // for any reason, skip section box but still keep camera + highlight.
  try{
    // Padding around element: 30% of element size, minimum 1m, maximum 5m.
    // Thin elements (50mm walls, 25mm pipes) get a generous 1m floor so the
    // section box doesn't hug the geometry so tightly that the user can't see
    // any context. Big elements get capped at 5m to avoid framing the whole
    // building when zooming to a slab.
    const sbPad = Math.max(Math.min(elSize*0.3, 5), 1);
    const sbMnX=mnX-sbPad, sbMxX=mxX+sbPad;
    const sbMnY=mnY-sbPad, sbMxY=mxY+sbPad;
    const sbMnZ=mnZ-sbPad, sbMxZ=mxZ+sbPad;
    const b=modelBounds;
    const sx=b.max.x-b.min.x, sy=b.max.y-b.min.y, sz=b.max.z-b.min.z;
    if(sx>0 && sy>0 && sz>0){
      // ── Directional rounding to prevent slider collapse ──
      // Sliders are 0-100 integer percentages of model bounds. For tiny
      // elements (e.g. a 50mm pipe wall in a 100m project), both edges
      // round to the same integer → section box dimension = 0 → element
      // gets clipped to nothing → user sees empty viewport. Fix: ceil the
      // upper edge and floor the lower edge so the resulting integer pair
      // always brackets the element. Also enforce a minimum 2% spread so
      // even degenerate-dimension elements (flat planes) get a thin slice
      // around them.
      const slUp  =(val,mn,range)=>Math.max(0,Math.min(100,Math.ceil( ((val-mn)/range)*100)));
      const slDn  =(val,mn,range)=>Math.max(0,Math.min(100,Math.floor(((val-mn)/range)*100)));
      const ensureMin=(lo,hi,minSpread)=>{
        if(hi-lo>=minSpread)return [lo,hi];
        // Expand symmetrically around midpoint, but clamp to 0..100
        const mid=(lo+hi)/2;
        const half=minSpread/2;
        let nlo=Math.max(0, Math.floor(mid-half));
        let nhi=Math.min(100, Math.ceil(mid+half));
        // If we hit a wall, push from the other side
        if(nhi-nlo<minSpread){
          if(nlo===0)nhi=Math.min(100, nlo+minSpread);
          else nlo=Math.max(0, nhi-minSpread);
        }
        return [nlo,nhi];
      };
      let xLo=slDn(sbMnX,b.min.x,sx), xHi=slUp(sbMxX,b.min.x,sx);
      let yLo=slDn(sbMnY,b.min.y,sy), yHi=slUp(sbMxY,b.min.y,sy);
      let zLo=slDn(sbMnZ,b.min.z,sz), zHi=slUp(sbMxZ,b.min.z,sz);
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
    }else{
      log('focusIssue: skipping section box (modelBounds invalid)');
    }
  }catch(e){log('focusIssue section box err:',e?.message)}

  // ── Highlight ──
  // Try web-ifc-three subset first. If it returns null (issue #83 with
  // stale cache after compare), fall back to a manually-built geometry
  // copy of just the matching faces.
  try{
    clearHighlight();
    if(!window._hlMat)window._hlMat=new THREE.MeshPhongMaterial({color:0x2563eb,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthTest:true,clippingPlanes:clipPlanes});
    const mid=loadedModels[targetModelIdx]?.modelID;
    let sub=null;
    if(mid!==undefined){
      sub=ifcLoader.ifcManager.createSubset({modelID:mid,ids:[targetEID],material:window._hlMat,scene,removePrevious:true});
      if(sub){
        sub.position.copy(loadedModels[targetModelIdx].position);
        sub.updateMatrixWorld(true);
        window._lastHL={subset:sub,mid};
        log('focusIssue: highlight subset created');
      }else{
        log('focusIssue: createSubset returned null (issue #83?). Highlight skipped — element still visible via diff subsets.');
      }
    }
  }catch(e){log('focusIssue highlight err:',e?.message)}

  // Show properties
  showIssueProps(iss);
};

function showIssueProps(iss){
  const colors={added:'var(--green)',removed:'var(--red)',modified:'var(--amber)'};
  const bgs={added:'var(--green-lt)',removed:'var(--red-lt)',modified:'var(--amber-lt)'};
  let h=`<div style="padding:8px 12px;background:${bgs[iss.status]};border-bottom:1px solid var(--border)">
    <span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${colors[iss.status]}">ISSUE #${iss.num} — ${iss.status.toUpperCase()}</span>
  </div>
  <div class="ps"><div class="ps-t">Element</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${iss.name}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${iss.type}</div></div>
    <div class="pr"><div class="pk">Tag / Element ID</div><div class="pv">${iss.tag||'—'}</div></div>
    <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${iss.gid}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${iss.expressID}</div></div>
    <div class="pr"><div class="pk">Source</div><div class="pv">Version ${iss.modelIdx===0?'A':'B'}</div></div>
  </div>
  <div class="ps"><div class="ps-t">How to find in BIM software</div>
    <div class="pr"><div class="pk">Revit</div><div class="pv" style="font-size:12px">Select by ID → <b>${iss.tag||'N/A'}</b></div></div>
    <div class="pr"><div class="pk">Tekla</div><div class="pv" style="font-size:12px">Inquire → GUID: <b style="word-break:break-all">${iss.gid}</b></div></div>
    <div class="pr"><div class="pk">ArchiCAD</div><div class="pv" style="font-size:12px">Find by IFC GlobalId: <b style="word-break:break-all">${iss.gid}</b></div></div>
  </div>`;
  
  if(iss.diffs&&iss.diffs.length>0){
    h+=`<div class="ps"><div class="ps-t">Property Changes</div>`;
    iss.diffs.forEach(d=>{
      h+=`<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`;
    });
    h+='</div>';
  }
  
  document.getElementById('propArea').innerHTML=h;
}

window.navIssue=function(dir){
  if(issuesList.length===0)return;
  let next=currentIssueIdx+dir;
  if(next<0)next=issuesList.length-1;
  if(next>=issuesList.length)next=0;
  focusIssue(next);
  // Scroll card into view
  document.getElementById('issue-'+next)?.scrollIntoView({block:'nearest',behavior:'smooth'});
};
window.exportCSV=function(){if(!compareResult)return;const r=compareResult;let csv='Status,Type,GlobalId,Tag/ElementID,Name,Details\n';
  csv+='# Revit: use Tag/ElementID with Select by ID. Tekla/ArchiCAD: use GlobalId to find elements.\n';
  r.added.forEach(e=>csv+=`Added,${e.entity.type},"${e.gid}","${e.entity.tag||''}","${e.entity.name}",New in B\n`);
  r.removed.forEach(e=>csv+=`Removed,${e.entity.type},"${e.gid}","${e.entity.tag||''}","${e.entity.name}",Only in A\n`);
  r.modified.forEach(e=>{const en=e.a||e.b;csv+=`Modified,${en.type},"${e.gid}","${en.tag||''}","${en.name}","${e.diffs.map(d=>d.prop+':'+d.oldVal+'→'+d.newVal).join('; ')}"\n`});
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='ifc-compare.csv';a.click()};

// ══ BCF Export ══
window.exportBCF=async function(){
  if(!compareResult||!issuesList.length){log('No issues to export');return}
  if(!window.JSZip){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(s);
    await new Promise((res,rej)=>{s.onload=res;s.onerror=rej});
  }
  log('Exporting BCF for '+issuesList.length+' issues...');
  const zip=new JSZip();
  const now=new Date().toISOString();
  const pid=crypto.randomUUID();
  
  // Coord transform: Three.js is Y-up, BCF/IFC is Z-up.
  // Three (x,y,z) -> IFC (x, z, -y). First reverse the sharedCenterOffset applied on load
  // (model.position is the Three-space offset), then swap axes.
  // threeToIfc(v) returns the IFC-space coordinates for a Three-space point v.
  const mdlPos={x:0,y:0,z:0};
  for(let i=0;i<2;i++){if(loadedModels[i]){mdlPos.x=loadedModels[i].position.x;mdlPos.y=loadedModels[i].position.y;mdlPos.z=loadedModels[i].position.z;break}}
  const threeToIfc=(x,y,z)=>{
    // reverse offset in Three-space first
    const tx=x-mdlPos.x, ty=y-mdlPos.y, tz=z-mdlPos.z;
    // Y-up -> Z-up: (x, y, z)_three -> (x, z, -y)_ifc
    return {x:tx, y:tz, z:-ty};
  };
  // Axis swap for direction vectors (no offset)
  const dirThreeToIfc=(x,y,z)=>({x:x, y:z, z:-y});
  log('Compare BCF model offset (three-space): ('+mdlPos.x.toFixed(2)+', '+mdlPos.y.toFixed(2)+', '+mdlPos.z.toFixed(2)+')');
  
  // Save camera
  const saveCam=camera.position.clone();
  const saveTgt=controls.target.clone();
  
  zip.file('bcf.version','<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file('project.bcfp','<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="'+pid+'"><Name>IFC Delta Compare</Name></Project></ProjectExtension>');
  
  for(let i=0;i<issuesList.length;i++){
    const iss=issuesList[i];
    const tid=crypto.randomUUID();
    const vid=crypto.randomUUID();
    
    // Element bbox center in Three-space → transform to IFC (Z-up) coords
    const bbox=iss.modelIdx!==undefined?getElementBBox(iss.modelIdx,iss.expressID):null;
    const ifcCenter=bbox?.center?threeToIfc(bbox.center.x,bbox.center.y,bbox.center.z):{x:0,y:0,z:0};
    const ix=ifcCenter.x, iy=ifcCenter.y, iz=ifcCenter.z;
    const d=bbox?Math.max(bbox.size.x,bbox.size.y,bbox.size.z)*2+5:20;
    
    // Snapshot: zoom to element, highlight it, wait for render, capture.
    // Highlighting makes the element visible as a colored overlay in the snapshot
    // thumbnail shown in BCF Manager, so the user can see which element is the issue.
    let snap64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==';
    if(bbox?.center){
      camera.position.set(bbox.center.x+d*0.4,bbox.center.y+d*0.3,bbox.center.z+d*0.4);
      controls.target.set(bbox.center.x,bbox.center.y,bbox.center.z);
      controls.update();
      // Colored highlight so the element pops in the snapshot thumbnail
      let snapHL=null;
      try{
        const hlColor={added:0x16a34a,removed:0xdc2626,modified:0xd97706}[iss.status]||0x2563eb;
        const hlMat=new THREE.MeshPhongMaterial({color:hlColor,transparent:true,opacity:0.75,side:THREE.DoubleSide,depthTest:true});
        const mid=loadedModels[iss.modelIdx]?.modelID;
        if(mid!==undefined){
          snapHL=ifcLoader.ifcManager.createSubset({modelID:mid,ids:[iss.expressID],material:hlMat,scene,removePrevious:false,customID:'bcfSnap'});
          if(snapHL){snapHL.position.copy(loadedModels[iss.modelIdx].position);snapHL.updateMatrixWorld(true);}
        }
      }catch(e){}
      renderer.render(scene,camera);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      renderer.render(scene,camera);
      try{snap64=renderer.domElement.toDataURL('image/png').split(',')[1]}catch(e){}
      // Remove the highlight subset so it doesn't persist between issues
      if(snapHL){try{scene.remove(snapHL);snapHL.geometry?.dispose();}catch(e){}}
    }
    
    let desc=iss.status.toUpperCase()+': '+(iss.name||'');
    if(iss.tag)desc+=' | Element ID: '+iss.tag;
    if(iss.detail)desc+=' | '+iss.detail;
    // Add position info for elements that may not exist in target Revit project
    if(bbox?.center){
      desc+=' | Position: ('+ix.toFixed(2)+', '+iy.toFixed(2)+', '+iz.toFixed(2)+')';
      if(iss.status==='added')desc+=' | NOTE: This element is NEW in Version B. Look at this location in Revit to see where it should be placed.';
      if(iss.status==='removed')desc+=' | NOTE: This element was REMOVED. It existed at this location in Version A.';
    }
    
    // BCF camera and section box in IFC coords.
    // Section box padding scales with element size so small objects still get
    // a reasonable surrounding context in BIMcollab.
    // Three.js bbox.size axes: IFC-X = Three-X, IFC-Y = Three-Z, IFC-Z = Three-Y.
    const rawSx=bbox?bbox.size.x/2:5;
    const rawSy=bbox?bbox.size.z/2:5;
    const rawSz=bbox?bbox.size.y/2:5;
    const elMax=Math.max(rawSx,rawSy,rawSz);
    // padding: at least 2m, or 1.5x element half-size (scales for large elements)
    const pad=Math.max(2, elMax*1.5);
    const sx=rawSx+pad, sy=rawSy+pad, sz=rawSz+pad;
    // Camera sits back from the element at a 3/4 perspective angle.
    // Distance scales with section-box size so we frame the whole section nicely.
    const viewR=Math.max(sx,sy,sz)*1.8+3;
    const camX=ix+viewR*0.55, camY=iy-viewR*0.75, camZ=iz+viewR*0.45;
    const ddx=ix-camX, ddy=iy-camY, ddz=iz-camZ;
    const ln=Math.sqrt(ddx*ddx+ddy*ddy+ddz*ddz)||1;
    const col={added:'FF16A34A',removed:'FFDC2626',modified:'FFD97706'}[iss.status]||'FF2563EB';
    
    // 6 ClippingPlanes forming a section box around element in IFC coords.
    // BCF spec: Direction "points in the invisible direction" = outward from box
    const clips=
      '<ClippingPlanes>'+
      '<ClippingPlane><Location><X>'+(ix+sx).toFixed(6)+'</X><Y>'+(iy).toFixed(6)+'</Y><Z>'+(iz).toFixed(6)+'</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix-sx).toFixed(6)+'</X><Y>'+(iy).toFixed(6)+'</Y><Z>'+(iz).toFixed(6)+'</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix).toFixed(6)+'</X><Y>'+(iy+sy).toFixed(6)+'</Y><Z>'+(iz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix).toFixed(6)+'</X><Y>'+(iy-sy).toFixed(6)+'</Y><Z>'+(iz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix).toFixed(6)+'</X><Y>'+(iy).toFixed(6)+'</Y><Z>'+(iz+sz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix).toFixed(6)+'</X><Y>'+(iy).toFixed(6)+'</Y><Z>'+(iz-sz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane>'+
      '</ClippingPlanes>';
    
    // Build <Component> XML per BCF 2.1 schema (visinfo.xsd).
    // CRITICAL: IfcGuid is an XML attribute, BUT OriginatingSystem and AuthoringToolId
    // are CHILD ELEMENTS (not attributes). Writing them as attributes makes the whole
    // Component non-conformant and BIMcollab BCF Manager silently ignores the extra
    // attrs — falling back to IfcGuid-only match, which fails for Revit because
    // Revit's internal IfcGuid param differs from the exported IFC GlobalId by ~1 char.
    // Result: BCF Manager picks the wrong element (Floor instead of Door) because
    // it has no reliable key.
    const tag=iss.tag||'';
    // buildComponent() emits a schema-valid <Component> with nested child elements.
    // Same helper is used for Selection, Visibility/Exceptions, and Coloring so all
    // three component references are identical and unambiguous.
    const buildComponent=()=>{
      let x='<Component IfcGuid="'+escXml(iss.gid)+'">';
      x+='<OriginatingSystem>Autodesk Revit</OriginatingSystem>';
      if(tag)x+='<AuthoringToolId>'+escXml(tag)+'</AuthoringToolId>';
      x+='</Component>';
      return x;
    };
    const compXml=buildComponent();
    
    // markup.bcf — include Header with IFC filename references so Revit BCF Manager
    // knows which model the components belong to. Without Header, BIMcollab can't
    // correlate components to any model and the viewpoint stays empty.
    const headerXml='<Header>'+
      (files[0]?'<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>'+escXml(files[0].name)+'</Filename><Date>'+now+'</Date></File>':'')+
      (files[1]?'<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>'+escXml(files[1].name)+'</Filename><Date>'+now+'</Date></File>':'')+
      '</Header>';
    
    zip.file(tid+'/markup.bcf','<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'+headerXml+'\n<Topic Guid="'+tid+'" TopicType="Issue" TopicStatus="Active"><Title>'+escXml('#'+iss.num+' '+iss.name+' ['+iss.status.toUpperCase()+']')+'</Title><Description>'+escXml(desc)+'</Description><CreationDate>'+now+'</CreationDate><CreationAuthor>IFC Delta</CreationAuthor><ModifiedDate>'+now+'</ModifiedDate></Topic>\n<Comment Guid="'+crypto.randomUUID()+'"><Date>'+now+'</Date><Author>IFC Delta</Author><Comment>'+escXml(desc)+'</Comment><Viewpoint Guid="'+vid+'"/></Comment>\n<Viewpoints Guid="'+vid+'"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n</Markup>');
    
    // viewpoint.bcfv — MUST follow BCF 2.1 visinfo.xsd element order:
    //   Components (optional) → OrthogonalCamera XOR PerspectiveCamera → Lines →
    //   ClippingPlanes → Bitmap*
    // AND within Components:
    //   ViewSetupHints? → Selection? → Visibility (REQUIRED) → Coloring?
    // Previously we wrote Visibility BEFORE Selection, which breaks the XSD sequence
    // constraint and causes strict parsers (incl. BIMcollab) to fail silently or
    // mis-parse the Selection block. Fixing the order is essential for the component
    // to actually be highlighted in Revit.
    const viewpointXml='<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="'+vid+'" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'+
      '<Components>'+
      '<Selection>'+compXml+'</Selection>'+
      '<Visibility DefaultVisibility="true"><Exceptions/></Visibility>'+
      '<Coloring><Color Color="'+col+'">'+compXml+'</Color></Coloring>'+
      '</Components>\n'+
      '<PerspectiveCamera>'+
      '<CameraViewPoint><X>'+camX.toFixed(6)+'</X><Y>'+camY.toFixed(6)+'</Y><Z>'+camZ.toFixed(6)+'</Z></CameraViewPoint>'+
      '<CameraDirection><X>'+(ddx/ln).toFixed(6)+'</X><Y>'+(ddy/ln).toFixed(6)+'</Y><Z>'+(ddz/ln).toFixed(6)+'</Z></CameraDirection>'+
      '<CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>'+
      '<FieldOfView>60</FieldOfView>'+
      '</PerspectiveCamera>\n'+
      clips+'\n'+
      '</VisualizationInfo>';
    zip.file(tid+'/viewpoint.bcfv',viewpointXml);
    
    zip.file(tid+'/snapshot.png',snap64,{base64:true});
  }
  
  // Restore camera
  camera.position.copy(saveCam);controls.target.copy(saveTgt);controls.update();renderer.render(scene,camera);
  
  const blob=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ifc-delta-issues.bcf';a.click();
  log('BCF exported: '+issuesList.length+' issues');
};

function escXml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function setStatus(t,x){const b=document.getElementById('statusBadge');b.className='status-badge show '+t;document.getElementById('statusText').textContent=x}

