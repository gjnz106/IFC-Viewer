import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { appState } from '../../state/index.js';

// ── IFC class → Revit Category friendly name ──────────────────────────
// Sourced from the Autodesk IFC-for-Revit mapping table
// (importIFCClassMapping.txt / ICE_IFC_Mapping.txt). This is what BIM
// engineers actually recognize. When null/missing, fall back to raw IFC
// class name. Used by Colorize Auto mode for Category dropdown.
const IFC_TO_REVIT_CAT: Record<string, string> = {
  'IfcAirTerminal':'Air Terminals',
  'IfcAirTerminalType':'Air Terminals',
  'IfcAirTerminalBox':'Air Terminals',
  'IfcAlarm':'Fire Alarm Devices',
  'IfcBeam':'Structural Framing',
  'IfcBoiler':'Mechanical Equipment',
  'IfcBuildingElementPart':'Parts',
  'IfcBuildingElementProxy':'Generic Models',
  'IfcCableCarrierFitting':'Cable Tray Fittings',
  'IfcCableCarrierSegment':'Cable Trays',
  'IfcCableSegment':'Wires',
  'IfcChiller':'Mechanical Equipment',
  'IfcCoil':'Mechanical Equipment',
  'IfcColumn':'Columns',
  'IfcCompressor':'Mechanical Equipment',
  'IfcCondenser':'Mechanical Equipment',
  'IfcController':'Electrical Equipment',
  'IfcCooledBeam':'Mechanical Equipment',
  'IfcCoolingTower':'Mechanical Equipment',
  'IfcCovering':'Ceilings',
  'IfcCurtainWall':'Curtain Systems',
  'IfcDamper':'Mechanical Equipment',
  'IfcDiscreteAccessory':'Specialty Equipment',
  'IfcDistributionChamberElement':'Mechanical Equipment',
  'IfcDistributionControlElement':'Electrical Equipment',
  'IfcDistributionElement':'Generic Models',
  'IfcDistributionFlowElement':'Mechanical Equipment',
  'IfcDistributionPort':'Generic Models',
  'IfcDoor':'Doors',
  'IfcDuctFitting':'Duct Fittings',
  'IfcDuctSegment':'Ducts',
  'IfcDuctSilencer':'Duct Accessories',
  'IfcElectricAppliance':'Specialty Equipment',
  'IfcElectricDistributionBoard':'Electrical Equipment',
  'IfcElectricFlowStorageDevice':'Electrical Equipment',
  'IfcElectricGenerator':'Electrical Equipment',
  'IfcElectricMotor':'Electrical Equipment',
  'IfcElectricTimeControl':'Electrical Equipment',
  'IfcEnergyConversionDevice':'Mechanical Equipment',
  'IfcEvaporativeCooler':'Mechanical Equipment',
  'IfcEvaporator':'Mechanical Equipment',
  'IfcFan':'Mechanical Equipment',
  'IfcFastener':'Parts',
  'IfcFilter':'Mechanical Equipment',
  'IfcFireSuppressionTerminal':'Sprinklers',
  'IfcFlowController':'Pipe Accessories',
  'IfcFlowFitting':'Pipe Fittings',
  'IfcFlowInstrument':'Electrical Equipment',
  'IfcFlowMeter':'Pipe Accessories',
  'IfcFlowMovingDevice':'Mechanical Equipment',
  'IfcFlowSegment':'Pipes',
  'IfcFlowStorageDevice':'Mechanical Equipment',
  'IfcFlowTerminal':'Plumbing Fixtures',
  'IfcFlowTreatmentDevice':'Mechanical Equipment',
  'IfcFooting':'Structural Foundations',
  'IfcFurnishingElement':'Furniture',
  'IfcFurniture':'Furniture',
  'IfcGeographicElement':'Site',
  'IfcHeatExchanger':'Mechanical Equipment',
  'IfcHumidifier':'Mechanical Equipment',
  'IfcJunctionBox':'Electrical Fixtures',
  'IfcLamp':'Lighting Fixtures',
  'IfcLightFixture':'Lighting Fixtures',
  'IfcMechanicalFastener':'Generic Models',
  'IfcMedicalDevice':'Specialty Equipment',
  'IfcMember':'Structural Framing',
  'IfcOpening':'Generic Models',
  'IfcOpeningElement':'Generic Models',
  'IfcOutlet':'Electrical Fixtures',
  'IfcPile':'Structural Columns',
  'IfcPipeFitting':'Pipe Fittings',
  'IfcPipeSegment':'Pipes',
  'IfcPlate':'Generic Models',
  'IfcProtectiveDevice':'Electrical Equipment',
  'IfcProtectiveDeviceTrippingUnit':'Electrical Equipment',
  'IfcPump':'Mechanical Equipment',
  'IfcRailing':'Railings',
  'IfcRamp':'Ramps',
  'IfcRampFlight':'Ramps',
  'IfcReinforcingBar':'Structural Rebar',
  'IfcReinforcingMesh':'Structural Fabric Reinforcement',
  'IfcRoof':'Roofs',
  'IfcSanitaryTerminal':'Plumbing Fixtures',
  'IfcSensor':'Electrical Fixtures',
  'IfcShadingDevice':'Generic Models',
  'IfcSite':'Site',
  'IfcSlab':'Floors',
  'IfcSpace':'Spaces',
  'IfcSpaceHeater':'Mechanical Equipment',
  'IfcStackTerminal':'Plumbing Fixtures',
  'IfcStair':'Stairs',
  'IfcStairFlight':'Stairs',
  'IfcSwitchingDevice':'Electrical Fixtures',
  'IfcSystemFurnitureElement':'Casework',
  'IfcTank':'Mechanical Equipment',
  'IfcTransformer':'Electrical Equipment',
  'IfcTransportElement':'Entourage',
  'IfcTubeBundle':'Mechanical Equipment',
  'IfcUnitaryEquipment':'Mechanical Equipment',
  'IfcValve':'Pipe Accessories',
  'IfcWall':'Walls',
  'IfcWallStandardCase':'Walls',
  'IfcWasteTerminal':'Plumbing Fixtures',
  'IfcWindow':'Windows',
  'IfcBuilding':'(Building)',
  'IfcBuildingStorey':'(Level)',
  'IfcProject':'(Project)',
};

// Resolve a raw IFC class name (e.g. 'IfcDoor') into the Revit Category
// equivalent ('Doors'). Returns the input if no mapping exists, and strips
// unknown 'IFC_' numeric prefixes that slipped through. Pure function.
export function ifcClassToRevitCategory(cls: string): string {
  if(!cls)return cls||'Unknown';
  // Normalize: sometimes we get an ALL-CAPS IFCDOOR from numeric lookups
  // — try title-case variant too
  return IFC_TO_REVIT_CAT[cls] || IFC_TO_REVIT_CAT[cls.charAt(0)+cls.slice(1).toLowerCase()] || cls;
}

export function log(...a: any[]): void { console.log('[IFC]',...a) }

// ══ Three.js ══
export function initThree(): void {
  // Renderer attaches to #vpCanvas (the flex child inside vpArea), NOT vpArea
  // itself. vpArea now also contains the resizable clash bottom panel; sizing
  // the canvas to vpCanvas means the 3D view automatically reflows when the
  // bottom panel grows/shrinks via its row-resize handle.
  const c = document.getElementById('vpCanvas')!;
  appState.scene = new THREE.Scene();
  appState.scene.background = new THREE.Color(0xe8ecf2);

  // 6 clipping planes for section box — initialized to not clip anything
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(-1,0,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(1,0,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,-1,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,1,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,0,-1), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,0,1), 99999));

  appState.camera = new THREE.PerspectiveCamera(50,c.clientWidth/c.clientHeight,0.01,100000);
  appState.camera.position.set(30,25,30);

  appState.renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  appState.renderer.setSize(c.clientWidth,c.clientHeight);
  appState.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  appState.renderer.outputColorSpace = THREE.SRGBColorSpace;
  appState.renderer.localClippingEnabled = true;
  c.appendChild(appState.renderer.domElement);

  appState.controls = new OrbitControls(appState.camera, appState.renderer.domElement);
  // Smooth Revit-like navigation
  appState.controls.enableDamping = true;
  appState.controls.dampingFactor = 0.06;        // Smooth deceleration (lower = more glide)
  appState.controls.rotateSpeed = 0.7;           // Orbit speed
  appState.controls.panSpeed = 0.8;              // Pan speed
  // NOTE: Built-in wheel zoom is DISABLED — we implement our own in the
  // wheel event handler below. OrbitControls' zoomToCursor + minDistance
  // together create the "zoom stops after a few scrolls" bug because the
  // camera-to-target distance hits minDistance. Our custom handler raycasts
  // the cursor into the scene and moves BOTH camera and target toward the
  // hit point, so user can always zoom further.
  appState.controls.enableZoom = false;
  appState.controls.maxDistance = 50000;
  appState.controls.minDistance = 0.001;
  appState.controls.enablePan = true;
  appState.controls.screenSpacePanning = true;   // Pan parallel to screen (like Revit)
  // Mouse buttons: Left=Orbit, Middle=Pan, Right=context menu (handled separately)
  appState.controls.mouseButtons = {LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:null as any};
  appState.controls.enablePan = true;
  // Touch: one finger=orbit, two=pan/zoom
  appState.controls.touches = {ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};

  // ── Custom wheel zoom: Revit-style zoom-to-cursor with infinite zoom depth ──
  // Built-in OrbitControls zoom hits the minDistance wall because camera-to-
  // target distance shrinks. Our approach:
  //   1. Each wheel event accumulates a `zoomAccum` exponent (positive = zoom in,
  //      negative = zoom out). On first event, raycast the cursor into the
  //      scene to find a pivot point — cached until zoom settles.
  //   2. Every frame, consume a fraction of zoomAccum (smoothing) and scale the
  //      camera-to-pivot distance by exp(consumed * stepBase). Target moves
  //      by the same vector so camera-to-target distance stays constant — no
  //      minDistance wall, truly infinite zoom depth.
  //   3. The per-frame easing factor gives Revit-like smooth glide instead of
  //      instant 10% steps.
  window._zoomState={
    accum:0,                         // remaining zoom to apply (log factor)
    pivot:new THREE.Vector3(),       // zoom anchor (raycasted scene point)
    pivotValid:false,                // false means recompute on next event
    stepBase:Math.log(1.08),         // log factor per wheel tick (~8%) — smaller = finer
    easing:0.15,                     // fraction of accum consumed per frame — lower = smoother glide
  };
  {
    const zoomRay=new THREE.Raycaster();
    const mouseNDC=new THREE.Vector2();
    appState.renderer.domElement.addEventListener('wheel',(e: WheelEvent)=>{
      e.preventDefault();
      const zs=window._zoomState;
      // Recompute pivot when starting fresh (no zoom in flight) OR when direction
      // flips — stale pivot gives jumpy behavior.
      const direction = e.deltaY>0 ? 1 : -1;
      const prevDir   = zs.accum>0 ? 1 : (zs.accum<0 ? -1 : 0);
      if(!zs.pivotValid || (prevDir!==0 && prevDir!==direction)){
        const rect=appState.renderer.domElement.getBoundingClientRect();
        mouseNDC.x=((e.clientX-rect.left)/rect.width)*2-1;
        mouseNDC.y=-((e.clientY-rect.top)/rect.height)*2+1;
        zoomRay.setFromCamera(mouseNDC,appState.camera);
        const targets: THREE.Object3D[]=[];
        appState.scene.traverse((o: THREE.Object3D)=>{if((o as THREE.Mesh).isMesh&&o.visible)targets.push(o)});
        const hits=zoomRay.intersectObjects(targets,false);
        if(hits.length>0){
          zs.pivot.copy(hits[0].point);
        }else{
          // Miss: project a point along the ray at current target distance
          const d=appState.camera.position.distanceTo(appState.controls.target);
          zs.pivot.copy(zoomRay.ray.origin).addScaledVector(zoomRay.ray.direction,d);
        }
        zs.pivotValid=true;
      }
      // ── Normalize wheel input to consistent ticks ──
      // Browsers report deltaY differently:
      //   deltaMode 0 (pixels): Chrome trackpad ~4-16, mouse wheel ~100-150
      //   deltaMode 1 (lines):  Firefox usually sends 3 per notch
      //   deltaMode 2 (pages):  rare
      // We convert all to a normalized "tick" where 1 tick = 1 mouse-wheel notch,
      // then clamp the per-event delta so a fast trackpad fling doesn't blast
      // the camera through the model in one frame.
      let ticks: number;
      if(e.deltaMode===1){           // lines (Firefox)
        ticks = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 3);
      }else if(e.deltaMode===2){     // pages
        ticks = Math.sign(e.deltaY) * 3;
      }else{                          // pixels (default)
        // 100px ≈ one wheel notch on most mice; trackpad sends much smaller
        // amounts more frequently — divide by 100 then clamp to 1 max per
        // event so trackpad scrolls feel paced like wheel notches.
        ticks = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY)/100, 1);
      }
      zs.accum += ticks * zs.stepBase;
    },{passive:false});
  }
  // Apply pending zoom each frame. Hooked into the render loop further down.
  function applyZoomVelocity(){
    const zs=window._zoomState;
    if(Math.abs(zs.accum)<1e-4){zs.pivotValid=false;return}
    // Consume a fraction of the accumulated zoom — gives smooth glide
    const step = zs.accum * zs.easing;
    zs.accum -= step;
    const factor = Math.exp(step); // > 1 = zoom out, < 1 = zoom in
    // Move camera radially away from / toward the pivot by factor
    const from=new THREE.Vector3().subVectors(appState.camera.position, zs.pivot).multiplyScalar(factor);
    const newCamPos=zs.pivot.clone().add(from);
    // Translate target by the same vector so orbit target tracks camera motion
    // (keeps camera-to-target constant → no minDistance clamp ever).
    const camMove=new THREE.Vector3().subVectors(newCamPos, appState.camera.position);
    appState.camera.position.copy(newCamPos);
    appState.controls.target.add(camMove);
  }

  appState.scene.add(new THREE.AmbientLight(0xffffff,0.8));

  // ── Pinch-to-zoom toward finger midpoint (touch devices) ──
  // OrbitControls' built-in pinch zooms toward controls.target (model center).
  // This override zooms toward the MIDPOINT between the two fingers, raycast
  // to the model surface, giving intuitive "zoom where I'm looking" behavior.
  {
    let pinchDist0 = 0;
    let pinchMid = {x:0, y:0};
    let pinchActive = false;
    const pinchRay = new THREE.Raycaster();

    appState.renderer.domElement.addEventListener('touchstart', (e: TouchEvent) => {
      if(e.touches.length === 2 && !appState.walkActive){
        pinchActive = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        pinchDist0 = Math.sqrt(Math.pow(t1.clientX-t0.clientX,2) + Math.pow(t1.clientY-t0.clientY,2));
        pinchMid = { x: (t0.clientX+t1.clientX)/2, y: (t0.clientY+t1.clientY)/2 };

        // Raycast from midpoint to find zoom pivot
        const rect = appState.renderer.domElement.getBoundingClientRect();
        const mx = ((pinchMid.x - rect.left)/rect.width)*2-1;
        const my = -((pinchMid.y - rect.top)/rect.height)*2+1;
        pinchRay.setFromCamera(new THREE.Vector2(mx, my), appState.camera);
        const targets: THREE.Object3D[] = [];
        appState.scene.traverse((o: THREE.Object3D) => { if((o as THREE.Mesh).isMesh && o.visible) targets.push(o); });
        const hits = pinchRay.intersectObjects(targets, false);

        const zs = window._zoomState;
        if(hits.length > 0){
          zs.pivot.copy(hits[0].point);
        } else {
          const d = appState.camera.position.distanceTo(appState.controls.target);
          zs.pivot.copy(pinchRay.ray.origin).addScaledVector(pinchRay.ray.direction, d);
        }
        zs.pivotValid = true;

        // Disable OrbitControls zoom to prevent double-zoom
        appState.controls.enableZoom = false;
      }
    }, {passive:true});

    appState.renderer.domElement.addEventListener('touchmove', (e: TouchEvent) => {
      if(!pinchActive || e.touches.length !== 2 || appState.walkActive) return;
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX-t0.clientX,2) + Math.pow(t1.clientY-t0.clientY,2));
      if(pinchDist0 > 0){
        const scale = dist / pinchDist0;
        // Feed into the same zoom velocity system used by mouse wheel
        // Higher multiplier = more responsive (matching 2D plan feel)
        const zs = window._zoomState;
        const delta = Math.log(scale) * -2.5;
        zs.accum = delta;
        pinchDist0 = dist;
      }
    }, {passive:true});

    appState.renderer.domElement.addEventListener('touchend', () => {
      if(pinchActive){
        pinchActive = false;
        appState.controls.enableZoom = true; // re-enable OrbitControls zoom
      }
    }, {passive:true});
  }
  const d1=new THREE.DirectionalLight(0xffffff,1.5);d1.position.set(80,120,80);appState.scene.add(d1);
  const d2=new THREE.DirectionalLight(0x99aacc,0.5);d2.position.set(-50,80,-50);appState.scene.add(d2);
  appState.scene.add(new THREE.HemisphereLight(0xddeeff,0x99aa88,0.5));

  // Picking
  const ray=new THREE.Raycaster();const mouse=new THREE.Vector2();
  let downX: number, downY: number;
  // Restore the camera/target captured at pointerdown — used when a click
  // resolves to empty space so deselecting can't move/zoom the view.
  function restoreViewSnap(): void {
    const s = (window as any)._viewSnap; if(!s) return;
    appState.camera.position.set(s.px, s.py, s.pz);
    appState.controls.target.set(s.tx, s.ty, s.tz);
    appState.controls.update();
  }
  appState.renderer.domElement.addEventListener('pointerdown',(e: PointerEvent)=>{downX=e.clientX;downY=e.clientY;});
  appState.renderer.domElement.addEventListener('pointerup',async (e: PointerEvent)=>{
    if(Math.abs(e.clientX-downX)>3||Math.abs(e.clientY-downY)>3)return;
    // Don't pick if we just finished dragging a section handle
    if((window as any).dragHandle)return;
    const r=appState.renderer.domElement.getBoundingClientRect();
    mouse.x=((e.clientX-r.left)/r.width)*2-1;
    mouse.y=-((e.clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(mouse,appState.camera);

    // Collect only VISIBLE model meshes
    const visA=(document.getElementById('visA') as HTMLInputElement)?.checked??true;
    const visB=(document.getElementById('visB') as HTMLInputElement)?.checked??true;
    const ms: THREE.Object3D[]=[];
    appState.scene.traverse((ch: THREE.Object3D)=>{
      const mesh = ch as THREE.Mesh;
      if(mesh.isMesh && ch.visible && mesh.geometry?.attributes?.position
         && ch.parent?.name!=='sectionBox'
         && !ch.userData?.isHandle){
        // Skip meshes from unticked models
        const srcIdx=ch.userData?.srcModelIdx;
        if(srcIdx===0&&!visA)return;
        if(srcIdx===1&&!visB)return;
        ms.push(ch);
      }
    });

    const hits=ray.intersectObjects(ms,false);
    
    if(!hits.length){restoreViewSnap();(window as any).clearHighlight();document.getElementById('propArea')!.innerHTML='<div class="prop-empty">Click element in 3D to inspect</div>';return}

    // Find first hit that is INSIDE the clipping planes (section box)
    // After Compare, prefer diff subset hits over faded base-model hits
    // (both may be at near-identical depths since subsets overlap base geometry)
    let validHit: THREE.Intersection|null=null;
    let validHitBase: THREE.Intersection|null=null;  // fallback: faded base-model hit
    for(const hit of hits){
      if(appState.sectionActive && appState.clipPlanes.length===6){
        const pt=hit.point;
        let inside=true;
        for(const cp of appState.clipPlanes){
          if(cp.distanceToPoint(pt)<-0.01){inside=false;break}
        }
        if(!inside)continue;
      }
      // Prefer diff-subset hits (they have userData.diffSubset) when compare is active
      if(appState.compareResult && hit.object.userData?.diffSubset){
        validHit=hit;
        break;
      }
      if(!validHit) validHit=hit;
      break;
    }
    if(!validHit){restoreViewSnap();(window as any).clearHighlight();document.getElementById('propArea')!.innerHTML='<div class="prop-empty">Click element in 3D to inspect</div>';return}

    // ── Measure mode: add point and return ──
    if((window as any).measureMode){
      if((window as any).measurePoints.length>=2)(window as any).clearMeasure();
      (window as any).addMeasurePoint(validHit.point);
      return;
    }

    const hit=validHit;

    // Determine which model this hit belongs to
    let targetModelIdx=-1;

    // Check if hit is a diff subset
    if(hit.object.userData?.srcModelIdx!==undefined){
      targetModelIdx=hit.object.userData.srcModelIdx;
    }else{
      targetModelIdx = (window as any).findModelIdx(hit.object);
    }

    // Check model is ticked (visible)
    if(targetModelIdx===0&&!visA){log('Pick: model A unticked');return}
    if(targetModelIdx===1&&!visB){log('Pick: model B unticked');return}
    if(targetModelIdx>=2){
      const fedChk=document.getElementById('fedVis'+targetModelIdx) as HTMLInputElement;
      if(fedChk && !fedChk.checked){log('Pick: federation model '+targetModelIdx+' unticked');return}
    }
    if(targetModelIdx<0||!appState.loadedModels[targetModelIdx]||!appState.ifcLoader){return}

    const modelID=(appState.loadedModels[targetModelIdx] as any).modelID;
    let foundEid: number|null=null;

    // Try getExpressId (works on base model geometry)
    try{
      const eid=appState.ifcLoader.ifcManager.getExpressId((hit.object as THREE.Mesh).geometry,hit.faceIndex!);
      if(eid>0)foundEid=eid;
    }catch(e){}

    // Fallback: expressID attribute (works on both base and subset geometry)
    if(!foundEid&&(hit.object as THREE.Mesh).geometry.attributes.expressID){
      try{
        const geom = (hit.object as THREE.Mesh).geometry;
        const idx2=geom.index
          ? geom.index.array[hit.faceIndex!*3]
          : hit.faceIndex!*3;
        if(idx2 >= 0 && idx2 < geom.attributes.expressID.array.length){
          const eid=(geom.attributes.expressID.array as any)[idx2];
          if(eid>0)foundEid=eid;
        }
      }catch(e){}
    }

    if(!foundEid){return}

    log('Pick: expressID='+foundEid+' model='+targetModelIdx+(hit.object.userData?.diffSubset?' (diff:'+hit.object.userData.diffSubset+')':''));

    // ── Field Mode: tap does NOT show properties or highlight ──
    // User must long-press → context menu → Properties/Zoom for inspection.
    // Tap only sets the orbit pivot so subsequent pinch/rotate centers on element.
    if((window as any).fieldActive){
      try{
        const bb=(window as any).getElementBBox(targetModelIdx, foundEid);
        if(bb && bb.center){
          window._pendingPivot = new THREE.Vector3(bb.center.x, bb.center.y, bb.center.z);
          if(window._zoomState){
            window._zoomState.pivot.copy(window._pendingPivot);
            window._zoomState.pivotValid=true;
            window._zoomState.accum=0;
          }
        }
      }catch(e){}
      return; // skip properties, highlight, auto-zoom
    }

    try{
      const props=await appState.ifcLoader.ifcManager.getItemProperties(modelID,foundEid,true);
      if(props){
        (window as any).showProps(props,targetModelIdx);
        // Highlight — use customID 'userHighlight' to avoid colliding with diff subsets
        try{
          (window as any).clearHighlight();
          if(!window._hlMat)window._hlMat=new THREE.MeshPhongMaterial({color:0x2563eb,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthTest:true,clippingPlanes:appState.clipPlanes});
          const sub=appState.ifcLoader.ifcManager.createSubset({modelID,ids:[foundEid],material:window._hlMat,scene:appState.scene,removePrevious:true,customID:'userHighlight'});
          if(sub){sub.position.copy(appState.loadedModels[targetModelIdx]!.position);sub.updateMatrixWorld(true);window._lastHL={subset:sub,mid:modelID}}
        }catch(he: any){log('Highlight err:',he.message)}
        // ── Set orbit pivot to the picked element (deferred) ──
        // Revit-style: clicking should NOT move the camera or change the view
        // at all. The pivot is only switched when the user starts rotating.
        //
        // We store the picked element's center as `_pendingPivot`. The
        // pointerdown handler (set up at bottom of init) checks this and,
        // when a rotate-drag is starting, switches controls.target to the
        // pending pivot atomically — preserving the camera's screen-space
        // view (camera position is shifted by the same delta as target so
        // the relative offset is unchanged → no visible jump).
        try{
          const bb=(window as any).getElementBBox(targetModelIdx, foundEid);
          if(bb && bb.center){
            // Stash for the rotation handler. We do NOT touch controls.target
            // here — that would trigger OrbitControls to recompute spherical
            // and (depending on damping) animate a small shift.
            window._pendingPivot = new THREE.Vector3(bb.center.x, bb.center.y, bb.center.z);
            // Stop any in-flight damping motion. After a rotate gesture, the
            // OrbitControls' internal sphericalDelta keeps decaying for a few
            // frames. If we left it alive, the camera would keep drifting
            // while the user is reading the click highlight — looks like a
            // small jump. Calling update() once with damping disabled flushes
            // the delta, then re-enable damping for the next interaction.
            const wasDamping=appState.controls.enableDamping;
            appState.controls.enableDamping=false;
            appState.controls.update();
            appState.controls.enableDamping=wasDamping;
            // Update zoom pivot so a wheel scroll right after click zooms
            // toward the picked element. This is fine — wheel zoom doesn't
            // change view orientation, just distance.
            if(window._zoomState){
              window._zoomState.pivot.copy(window._pendingPivot);
              window._zoomState.pivotValid=true;
              window._zoomState.accum=0;
            }
          }
        }catch(pe: any){log('Pivot err:',pe?.message||pe)}
      }
    }catch(pe: any){log('Props err:',pe.message)}
  });

  // ── Apply pending pivot when the user starts a rotate drag ──
  // We intercept pointerdown in the CAPTURE phase (third arg = true) so this
  // handler runs BEFORE OrbitControls' own pointerdown. That way, by the
  // time OrbitControls captures the initial camera/target state for its
  // rotation gesture, our pivot swap is already done — OrbitControls sees
  // the new target and the (offset) camera, computes spherical from the
  // post-swap offset, and rotation behaves correctly.
  //
  // View preservation: target moves to bb.center; camera shifts by the same
  // delta. Since the camera-to-target offset is unchanged, the rendered
  // frame is identical (no visible jump). From this drag onwards the orbit
  // pivots around the picked element.
  //
  // Only consume the pivot on LEFT button (rotate). Right/middle (pan) keep
  // the pivot pending until the user actually rotates.
  appState.renderer.domElement.addEventListener('pointerdown',(e: PointerEvent)=>{
    // Snapshot camera + target BEFORE any pivot work, so a click that turns
    // out to be on empty space (deselect) can restore the exact view.
    (window as any)._viewSnap={px:appState.camera.position.x,py:appState.camera.position.y,pz:appState.camera.position.z,tx:appState.controls.target.x,ty:appState.controls.target.y,tz:appState.controls.target.z};
    // ── Stale-pivot guard ──
    // If the user clicked an element earlier (which staged a pendingPivot),
    // then performed a pan or middle-click drag (which moves controls.target
    // independently), the pivot is now stale: applying it on the next rotate
    // would shift camera by a huge accumulated delta → view jumps to fit.
    // So: any non-left button click invalidates the pending pivot before it
    // can do harm. The user's next click on a fresh element will set a new one.
    if(e.button!==0){
      window._pendingPivot=null;
      return;
    }
    if(!window._pendingPivot)return;
    const newT=window._pendingPivot;
    const dx=newT.x-appState.controls.target.x;
    const dy=newT.y-appState.controls.target.y;
    const dz=newT.z-appState.controls.target.z;
    // Skip if delta is negligible (target already at pivot — no work needed)
    if(Math.abs(dx)<1e-6 && Math.abs(dy)<1e-6 && Math.abs(dz)<1e-6){
      window._pendingPivot=null;
      return;
    }
    // Sanity check: if the pivot is unreasonably far from the current target
    // (more than 10× the camera-to-target distance), it's stale — discard
    // rather than blast the camera into orbit. This catches cases where
    // panning + wheel zoom moved the target hundreds of metres while the
    // pivot still points at the originally clicked element.
    const camDist=appState.camera.position.distanceTo(appState.controls.target)||1;
    const pivotDist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(pivotDist > camDist*10){
      log('Pivot rejected: stale (delta '+pivotDist.toFixed(1)+' >> camDist '+camDist.toFixed(1)+')');
      window._pendingPivot=null;
      return;
    }
    // Atomic shift: target and camera move by the same delta → camera-to-
    // target offset is unchanged → view is pixel-identical.
    appState.controls.target.x = newT.x;
    appState.controls.target.y = newT.y;
    appState.controls.target.z = newT.z;
    appState.camera.position.x += dx;
    appState.camera.position.y += dy;
    appState.camera.position.z += dz;
    // No controls.update() here — letting OrbitControls' own pointerdown
    // (which fires next, in bubble phase) capture the new state freshly.
    // Calling update() here can interfere with damping state.
    window._pendingPivot=null;
  }, true /* capture phase: run before OrbitControls' bubble-phase listener */);

  // Wheel zoom also invalidates pendingPivot — wheel moves both camera and
  // target via our custom wheel handler, so the pivot's relationship to the
  // current target is broken. Without this guard, scrolling after a click
  // leaves the pivot stale → next rotate jumps.
  appState.renderer.domElement.addEventListener('wheel',()=>{
    window._pendingPivot=null;
  }, {passive:true, capture:true});

  // ── Reusable resize hook ──
  // Called from window 'resize' event AND from the column/row drag handlers
  // below so the 3D view matches whatever size #vpCanvas is currently. We
  // read the size from the layout (clientWidth/Height) rather than tracking
  // it manually — works regardless of CSS grid changes.
  window._vpResize=function(){
    const w=c.clientWidth, h=c.clientHeight;
    if(!w||!h)return;
    appState.camera.aspect=w/h;
    appState.camera.updateProjectionMatrix();
    appState.renderer.setSize(w,h);
    // One render so user sees the change immediately during drag
    if(appState.scene)appState.renderer.render(appState.scene,appState.camera);
  };
  window.addEventListener('resize',()=>window._vpResize());

  // ── Column/row drag handlers ──
  // Three drag handles wired up: left sidebar width, right Properties width,
  // bottom clash panel height. Each updates a CSS var on document root and
  // calls _vpResize() on every mousemove so the 3D view tracks the drag.
  // Bounds are clamped to keep panels usable (no zero-width panels, no
  // squashed canvas).
  const root=document.documentElement;
  const setupColResize=(handleId: string, varName: string, getCurrent: any, fromLeft: boolean, minPx: number, maxPx: number)=>{
    const handle=document.getElementById(handleId);
    if(!handle)return;
    let dragging=false;
    handle.addEventListener('pointerdown',(e: PointerEvent)=>{
      e.preventDefault();
      dragging=true;
      handle.classList.add('dragging');
      document.body.classList.add('resizing');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove',(e: PointerEvent)=>{
      if(!dragging)return;
      // Compute new width: for left sidebar, width = clientX (distance from
      // viewport left edge). For right, width = window.innerWidth - clientX.
      const raw = fromLeft ? e.clientX : (window.innerWidth - e.clientX);
      const clamped = Math.max(minPx, Math.min(maxPx, raw));
      root.style.setProperty(varName, clamped+'px');
      window._vpResize();
    });
    const stop=(e: PointerEvent)=>{
      if(!dragging)return;
      dragging=false;
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      try{handle.releasePointerCapture(e.pointerId)}catch(err){}
    };
    handle.addEventListener('pointerup',stop);
    handle.addEventListener('pointercancel',stop);
  };
  setupColResize('lresize','--lcol', null, true, 180, 480);
  setupColResize('rresize','--rcol', null, false, 220, 600);

  // Row resize for bottom clash panel — drag handle at the top of it.
  // Clash panel anchors to bottom of viewport-area; new height = vpArea
  // bottom edge - clientY. Clamp 200..70vh.
  {
    const handle=document.getElementById('bresize');
    if(handle){
      let dragging=false;
      handle.addEventListener('pointerdown',(e: PointerEvent)=>{
        e.preventDefault();
        dragging=true;
        handle.classList.add('dragging');
        document.body.classList.add('resizing-row');
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove',(e: PointerEvent)=>{
        if(!dragging)return;
        const vpRect=c.parentElement!.getBoundingClientRect(); // vpArea bbox
        const newH = vpRect.bottom - e.clientY - 3; // 3px = half handle height
        const maxH = Math.floor(window.innerHeight * 0.7);
        const clamped = Math.max(200, Math.min(maxH, newH));
        root.style.setProperty('--bottom-h', clamped+'px');
        window._vpResize();
      });
      const stopR=(e: PointerEvent)=>{
        if(!dragging)return;
        dragging=false;
        handle.classList.remove('dragging');
        document.body.classList.remove('resizing-row');
        try{handle.releasePointerCapture(e.pointerId)}catch(err){}
      };
      handle.addEventListener('pointerup',stopR);
      handle.addEventListener('pointercancel',stopR);
    }
  }

  // ── Right-click context menu using contextmenu event ──
  const ctxRay=new THREE.Raycaster();
  const ctxMouse=new THREE.Vector2();

  appState.renderer.domElement.addEventListener('contextmenu',async (e: MouseEvent)=>{
    e.preventDefault();
    e.stopPropagation();

    const r=appState.renderer.domElement.getBoundingClientRect();
    ctxMouse.x=((e.clientX-r.left)/r.width)*2-1;
    ctxMouse.y=-((e.clientY-r.top)/r.height)*2+1;
    ctxRay.setFromCamera(ctxMouse,appState.camera);

    const visA=(document.getElementById('visA') as HTMLInputElement)?.checked??true;
    const visB=(document.getElementById('visB') as HTMLInputElement)?.checked??true;
    const ms: THREE.Object3D[]=[];
    appState.scene.traverse((ch: THREE.Object3D)=>{
      const mesh = ch as THREE.Mesh;
      if(mesh.isMesh&&ch.visible&&mesh.geometry?.attributes?.position&&ch.parent?.name!=='sectionBox'&&!ch.userData?.isHandle){
        const si=ch.userData?.srcModelIdx;
        if(si===0&&!visA)return;if(si===1&&!visB)return;
        ms.push(ch);
      }
    });

    const hits=ctxRay.intersectObjects(ms,false);
    appState.ctxTarget=null;

    if(hits.length>0){
      const hit=hits[0];
      let mi=hit.object.userData?.srcModelIdx??-1;
      if(mi<0) mi = (window as any).findModelIdx(hit.object);

      if(mi>=0&&appState.loadedModels[mi]){
        let eid: number|null=null;
        try{eid=appState.ifcLoader.ifcManager.getExpressId((hit.object as THREE.Mesh).geometry,hit.faceIndex!)}catch(ex){}
        if(!eid&&(hit.object as THREE.Mesh).geometry.attributes.expressID){
          const geom = (hit.object as THREE.Mesh).geometry;
          const idx2=geom.index?geom.index.array[hit.faceIndex!*3]:hit.faceIndex!*3;
          eid=(geom.attributes.expressID.array as any)[idx2];
        }

        if(eid&&eid>0){
          const bbox=(window as any).getElementBBox(mi,eid);
          let typeName='';
          try{const tn=(appState.ifcLoader.ifcManager as any).state.api.GetLineType((appState.loadedModels[mi] as any).modelID,eid);typeName=(window as any).IFC_NAMES?.[tn]||('IFC_'+tn)}catch(ex){}
          let elName='';
          try{const p=await appState.ifcLoader.ifcManager.getItemProperties((appState.loadedModels[mi] as any).modelID,eid,false);if((p as any)?.Name?.value)elName=(p as any).Name.value}catch(ex){}

          // Capture face normal for section plan
          let faceNormal: THREE.Vector3|null=null;
          let hitPoint: THREE.Vector3|null=null;
          try{
            hitPoint=hit.point.clone();
            if(hit.face&&hit.face.normal){
              faceNormal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            }
          }catch(ex){}

          appState.ctxTarget={expressID:eid,modelIdx:mi,bbox,typeName,name:elName,faceNormal,hitPoint};
          document.getElementById('ctxTitle')!.textContent=(elName||typeName||'Element').substring(0,40)+' #'+eid;
          log('Right-click: found #'+eid+' ('+typeName+') bbox='+(bbox?'yes':'null')+' normal='+(faceNormal?faceNormal.toArray().map((v: number)=>v.toFixed(2)).join(','):'null'));
        }
      }
    }

    if(!appState.ctxTarget){
      document.getElementById('ctxTitle')!.textContent='No element';
      log('Right-click: no element hit');
    }

    const menu=document.getElementById('ctxMenu')!;
    menu.style.left=Math.min(e.clientX,window.innerWidth-220)+'px';
    menu.style.top=Math.min(e.clientY,window.innerHeight-400)+'px';
    menu.classList.add('show');
  });

  // Close context menu on left click anywhere
  document.addEventListener('click',(e: MouseEvent)=>{
    const menu=document.getElementById('ctxMenu');
    if(menu&&!menu.contains(e.target as Node)){
      menu.classList.remove('show');
    }
  });

  // Render loop: update controls, refresh section-box handle sizes so they stay
  // screen-constant (Revit-like), sync view cube orientation, then draw.
  // Note: updateSectionBox3DPositions() is only called when sliders change
  // (via input event handlers) — not every frame — to avoid 60fps DOM reads.
  // Only the cheap handle-size rescaling runs per frame.
  (function loop(){
    requestAnimationFrame(loop);
    // Apply any pending smooth wheel-zoom BEFORE controls.update() so that
    // damping picks up the small camera movement each frame — gives Revit-
    // like glide instead of a series of instant steps.
    applyZoomVelocity();
    appState.controls.update();
    if((window as any).sectionBox)(window as any).updateSectionHandleSizes();
    if(typeof (window as any).updateViewCube==='function')(window as any).updateViewCube();
    appState.renderer.render(appState.scene,appState.camera);
  })();
}

// ══════════════════════════════════════════════════════════════════════
// VIEW CUBE (Revit-style navigation gizmo)
// A small 90×90 canvas in the top-right corner. Renders a cube that mirrors
// the main camera's orientation. Clicking a face snaps the main camera to
// that orthogonal view. Clicking a corner snaps to a 45° isometric-ish view.

// Extend window type for custom properties
declare global {
  interface Window {
    _zoomState: {
      accum: number;
      pivot: THREE.Vector3;
      pivotValid: boolean;
      stepBase: number;
      easing: number;
    };
    _pendingPivot: THREE.Vector3 | null;
    _vpResize: () => void;
    _hlMat: THREE.MeshPhongMaterial | null;
    _lastHL: { subset: THREE.Object3D; mid: number } | null;
    dragHandle: any;
  }
}
