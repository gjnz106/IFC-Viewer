import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

// ── Toggle panel ──
window.toggleSGCheckPanel = function(){
  const panel = document.getElementById('sgPanel');
  const btn = document.getElementById('btnSGCheck');
  const sgState = appState.sgState as any;
  sgState.open = !sgState.open;
  btn!.classList.toggle('active', sgState.open);

  if(sgState.open){
    // Close other bottom panels (clash) to avoid stacking. (Was reading
    // window.clashMode, which is never set — the real flag is appState.clashMode,
    // set in clash.ts's toggleClashMode — so this never actually closed Clash.)
    if(appState.clashMode)(window as any).toggleClashMode();
    panel!.classList.add('show');
    const br = document.getElementById('bresize');
    if(br) br.style.display = '';
    if(window._vpResize) window._vpResize();
  }else{
    panel!.classList.remove('show');
    // If neither bottom panel is open, hide the resize handle
    if(!appState.clashMode){
      const br = document.getElementById('bresize');
      if(br) br.style.display = 'none';
    }
    if(window._vpResize) window._vpResize();
  }
};

// ── PDF export (uses jsPDF via dynamic import — already used by reports elsewhere) ──
window.sgExportReport = async function(){
  const sgState = appState.sgState as any;
  if(!sgState.results){ log('SG: no results to export'); return; }
  try{
    // Use jsPDF from existing import if present, else CDN
    if(!(window as any).jspdf){
      const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm' as any);
      (window as any).jspdf = mod;
    }
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({unit:'mm', format:'a4'});
    const W = 210, M = 15;
    let y = M;
    // Header
    doc.setFillColor(15,23,42); doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('CORENET X / IFC-SG Validation Report', M, 11);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(new Date().toLocaleString('en-SG'), M, 17);
    y = 32;
    doc.setTextColor(15,23,42);
    // KPIs
    const s = sgState.results.stats;
    const pct = s.rules===0 ? 0 : Math.round((s.pass/s.rules)*100);
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text(`Compliance: ${pct}% (${s.pass}/${s.rules} rules passing)`, M, y);
    y += 6;
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(`Gateway: ${s.gateway.toUpperCase()}  •  Elements scanned: ${s.elements}  •  Findings: ${s.findings}`, M, y);
    y += 8;
    // Rule-by-rule
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('Rule results:', M, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    for(const r of sgState.results.rules){
      if(y > 270){ doc.addPage(); y = M; }
      const icon = r.failed.length===0 && r.passed.length>0 ? '[PASS]' : r.failed.length>0 ? '[FAIL]' : '[SKIP]';
      const color = r.failed.length===0 && r.passed.length>0 ? [22,163,74] : r.failed.length>0 ? [220,38,38] : [156,163,175];
      doc.setTextColor(...color);
      doc.text(icon, M, y);
      doc.setTextColor(15,23,42);
      doc.text(`${r.rule.id}  ${r.rule.title}`, M + 12, y);
      doc.setTextColor(100,116,139);
      doc.text(`${r.passed.length} pass / ${r.failed.length} fail`, W - M - 35, y);
      doc.setTextColor(15,23,42);
      y += 4;
      if(r.failed.length > 0){
        const sample = r.failed.slice(0, 3);
        for(const f of sample){
          if(y > 275){ doc.addPage(); y = M; }
          doc.setTextColor(220,38,38);
          doc.text(`  · #${f.eid} ${(f.name||'').substring(0,30)} — ${(f.reason||'').substring(0,55)}`, M + 4, y);
          doc.setTextColor(15,23,42);
          y += 3.5;
        }
        if(r.failed.length > 3){
          doc.setTextColor(100,116,139);
          doc.text(`  · …and ${r.failed.length - 3} more`, M + 4, y);
          doc.setTextColor(15,23,42);
          y += 3.5;
        }
      }
      y += 1;
    }
    // Footer disclaimer
    doc.addPage();
    y = M;
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text('Disclaimer', M, y); y += 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    const disclaimer = 'This validation is a pre-submission helper based on a subset of CORENET X IFC+SG rules. The official validator is the CORENET X portal at info.corenet.gov.sg. Always cross-check with the latest BCA Industry Mapping Excel before submission. IFC Delta and DQT BIM team accept no liability for submissions rejected based on this report.';
    const lines = doc.splitTextToSize(disclaimer, W - 2*M);
    doc.text(lines, M, y);
    doc.save(`IFC-SG_Validation_${new Date().toISOString().slice(0,10)}.pdf`);
    log('SG: PDF report saved');
  }catch(err: any){
    log('SG PDF export err:', err?.message);
    alert('PDF export failed: ' + err?.message);
  }
};

// ── BCF export of SG validation failures ──
window.sgExportBCF = async function(){
  const sgState = appState.sgState as any;
  if(!sgState.results){ return; }

  // Collect all failures with valid expressIDs
  const issues: any[] = [];
  for(const r of sgState.results.rules){
    if(r.failed.length === 0) continue;
    for(const f of r.failed){
      if(!f.eid || f.eid === 0) continue;
      issues.push({
        title: `[${r.rule.id}] ${r.rule.title}`,
        desc: `${r.rule.desc}\n\nElement: ${f.name}\nFinding: ${f.reason}\nAgency: ${r.rule.agency}\nSeverity: ${r.rule.severity}`,
        eid: f.eid,
        name: f.name || '',
        reason: f.reason || '',
        severity: r.rule.severity,
        agency: r.rule.agency,
        ruleId: r.rule.id,
        modelIdx: f.modelIdx ?? 0,  // default to first model
      });
    }
  }
  if(issues.length === 0){ alert('No failures with element IDs to export.'); return; }
  log(`SG BCF: exporting ${issues.length} failures…`);

  // Limit to 200 issues to avoid huge files
  const maxIssues = Math.min(issues.length, 200);

  // Load JSZip
  if(!(window as any).JSZip){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(s);
    await new Promise((res,rej)=>{s.onload=res;s.onerror=rej});
  }

  const zip = new (window as any).JSZip();
  const now = new Date().toISOString();
  const pid = crypto.randomUUID();

  // Coordinate transform: Three.js Y-up → BCF/IFC Z-up
  const mdlPos = {x:0, y:0, z:0};
  for(let i=0; i<appState.loadedModels.length; i++){
    if(appState.loadedModels[i]){
      mdlPos.x=appState.loadedModels[i]!.position.x;
      mdlPos.y=appState.loadedModels[i]!.position.y;
      mdlPos.z=appState.loadedModels[i]!.position.z;
      break;
    }
  }
  const threeToIfc = (x: number,y: number,z: number) => {
    const tx=x-mdlPos.x, ty=y-mdlPos.y, tz=z-mdlPos.z;
    return {x:tx, y:tz, z:-ty};
  };

  // Save camera state
  const saveCam = appState.camera.position.clone();
  const saveTgt = appState.controls.target.clone();

  // BCF version & project files
  zip.file('bcf.version','<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file('project.bcfp','<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="'+pid+'"><Name>IFC-SG Validation</Name></Project></ProjectExtension>');

  // Helper to escape XML special characters
  const escXml=(s: any): string=>{
    if(s==null)return '';
    return String(s).replace(/[&<>"']/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  };

  // Header XML: list all loaded IFC files
  let headerXml = '<Header>';
  for(let fi=0; fi<appState.files.length; fi++){
    if(!appState.files[fi]) continue;
    headerXml += '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>'+escXml(appState.files[fi]!.name)+'</Filename><Date>'+now+'</Date></File>';
  }
  headerXml += '</Header>';

  for(let i=0; i<maxIssues; i++){
    const iss = issues[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();

    // Find the model that owns this element
    let modelIdx = iss.modelIdx;
    if(!appState.loadedModels[modelIdx]){
      // Fallback: find first loaded model
      modelIdx = appState.loadedModels.findIndex(m=>!!m);
      if(modelIdx < 0) continue;
    }

    // Element bounding box in Three-space
    const bbox = (window as any).getElementBBox(modelIdx, iss.eid);
    const ifcCenter = bbox?.center ? threeToIfc(bbox.center.x, bbox.center.y, bbox.center.z) : {x:0,y:0,z:0};
    const ix=ifcCenter.x, iy=ifcCenter.y, iz=ifcCenter.z;
    const d = bbox ? Math.max(bbox.size.x, bbox.size.y, bbox.size.z)*2+5 : 20;

    // Snapshot: zoom to element, capture
    let snap64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==';
    if(bbox?.center){
      appState.camera.position.set(bbox.center.x+d*0.4, bbox.center.y+d*0.3, bbox.center.z+d*0.4);
      appState.controls.target.set(bbox.center.x, bbox.center.y, bbox.center.z);
      appState.controls.update();
      // Highlight with severity-based color
      let snapHL: any = null;
      try{
        const hlColor = iss.severity==='error' ? 0xdc2626 : iss.severity==='warn' ? 0xd97706 : 0x2563eb;
        const hlMat = new THREE.MeshPhongMaterial({color:hlColor, transparent:true, opacity:0.75, side:THREE.DoubleSide, depthTest:true});
        const mid = (appState.loadedModels[modelIdx] as any)?.modelID;
        if(mid !== undefined){
          snapHL = appState.ifcLoader.ifcManager.createSubset({modelID:mid, ids:[iss.eid], material:hlMat, scene:appState.scene, removePrevious:false, customID:'sgBcfSnap'});
          if(snapHL){snapHL.position.copy(appState.loadedModels[modelIdx]!.position); snapHL.updateMatrixWorld(true);}
        }
      }catch(e){}
      appState.renderer.render(appState.scene, appState.camera);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      appState.renderer.render(appState.scene, appState.camera);
      try{snap64 = appState.renderer.domElement.toDataURL('image/png').split(',')[1];}catch(e){}
      if(snapHL){try{appState.scene.remove(snapHL); snapHL.geometry?.dispose();}catch(e){}}
    }

    // Description
    let desc = `[${iss.ruleId}] ${iss.title}\n\n${iss.reason}`;
    if(iss.name) desc += `\nElement: ${iss.name}`;
    desc += `\nAgency: ${iss.agency} | Severity: ${iss.severity}`;
    if(bbox?.center) desc += `\nPosition: (${ix.toFixed(2)}, ${iy.toFixed(2)}, ${iz.toFixed(2)})`;

    // Section box (6 clipping planes) around element
    const rawSx = bbox ? bbox.size.x/2 : 5;
    const rawSy = bbox ? bbox.size.z/2 : 5;
    const rawSz = bbox ? bbox.size.y/2 : 5;
    const elMax = Math.max(rawSx, rawSy, rawSz);
    const pad = Math.max(2, elMax*1.5);
    const sx=rawSx+pad, sy=rawSy+pad, sz=rawSz+pad;

    const clips =
      '<ClippingPlanes>'+
      '<ClippingPlane><Location><X>'+(ix+sx).toFixed(6)+'</X><Y>'+iy.toFixed(6)+'</Y><Z>'+iz.toFixed(6)+'</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+(ix-sx).toFixed(6)+'</X><Y>'+iy.toFixed(6)+'</Y><Z>'+iz.toFixed(6)+'</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+ix.toFixed(6)+'</X><Y>'+(iy+sy).toFixed(6)+'</Y><Z>'+iz.toFixed(6)+'</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+ix.toFixed(6)+'</X><Y>'+(iy-sy).toFixed(6)+'</Y><Z>'+iz.toFixed(6)+'</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+ix.toFixed(6)+'</X><Y>'+iy.toFixed(6)+'</Y><Z>'+(iz+sz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane>'+
      '<ClippingPlane><Location><X>'+ix.toFixed(6)+'</X><Y>'+iy.toFixed(6)+'</Y><Z>'+(iz-sz).toFixed(6)+'</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane>'+
      '</ClippingPlanes>';

    // Camera position in IFC coords
    const viewR = Math.max(sx,sy,sz)*1.8+3;
    const camX=ix+viewR*0.55, camY=iy-viewR*0.75, camZ=iz+viewR*0.45;
    const ddx=ix-camX, ddy=iy-camY, ddz=iz-camZ;
    const ln = Math.sqrt(ddx*ddx+ddy*ddy+ddz*ddz)||1;

    // Severity → BCF color
    const col = iss.severity==='error' ? 'FFDC2626' : iss.severity==='warn' ? 'FFD97706' : 'FF2563EB';

    // Try to get GlobalId for the element
    let gid = '';
    try{
      const mid = (appState.loadedModels[modelIdx] as any)?.modelID;
      if(mid !== undefined){
        const props = await appState.ifcLoader.ifcManager.getItemProperties(mid, iss.eid, false);
        gid = props?.GlobalId?.value || '';
      }
    }catch(e){}

    // Component XML — needs GlobalId for BIMcollab to match
    const compXml = gid
      ? '<Component IfcGuid="'+escXml(gid)+'"><OriginatingSystem>IFC-SG Validator</OriginatingSystem></Component>'
      : '<Component IfcGuid="'+escXml(tid.substring(0,22))+'"><OriginatingSystem>IFC-SG Validator</OriginatingSystem></Component>';

    // Topic type and status based on severity
    const topicType = iss.severity==='error' ? 'Error' : iss.severity==='warn' ? 'Warning' : 'Information';

    // markup.bcf
    zip.file(tid+'/markup.bcf',
      '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'+
      headerXml+'\n'+
      '<Topic Guid="'+tid+'" TopicType="'+topicType+'" TopicStatus="Active">'+
      '<Title>'+escXml(iss.title)+'</Title>'+
      '<Description>'+escXml(desc)+'</Description>'+
      '<CreationDate>'+now+'</CreationDate>'+
      '<CreationAuthor>IFC Delta SG Validator</CreationAuthor>'+
      '<ModifiedDate>'+now+'</ModifiedDate>'+
      '<Labels><Label>IFC-SG</Label><Label>'+escXml(iss.agency)+'</Label><Label>'+escXml(iss.severity)+'</Label></Labels>'+
      '</Topic>\n'+
      '<Comment Guid="'+crypto.randomUUID()+'"><Date>'+now+'</Date><Author>IFC Delta</Author><Comment>'+escXml(iss.reason)+'</Comment><Viewpoint Guid="'+vid+'"/></Comment>\n'+
      '<Viewpoints Guid="'+vid+'"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n'+
      '</Markup>');

    // viewpoint.bcfv — BCF 2.1 element order: Components → Camera → ClippingPlanes
    zip.file(tid+'/viewpoint.bcfv',
      '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="'+vid+'" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'+
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
      '</VisualizationInfo>');

    zip.file(tid+'/snapshot.png', snap64, {base64:true});
  }

  // Restore camera
  appState.camera.position.copy(saveCam); appState.controls.target.copy(saveTgt); appState.controls.update();
  appState.renderer.render(appState.scene, appState.camera);

  // Generate and download
  const blob = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ifc-sg-validation.bcf';
  a.click();
  URL.revokeObjectURL(a.href);
  log(`SG BCF exported: ${maxIssues} issues` + (issues.length > maxIssues ? ` (${issues.length - maxIssues} truncated)` : ''));
};

// Small helper used in HTML templates above
export function escapeHtml(s: any): string {
  if(s == null) return '';
  return String(s).replace(/[&<>"']/g, (c: string) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
}

// federation-load.ts calls window.escapeHtml(fname) non-defensively when rendering
// federation slot names; attach it so that path doesn't throw.
(window as any).escapeHtml = escapeHtml;
