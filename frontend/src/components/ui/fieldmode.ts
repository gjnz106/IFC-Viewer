// ══════════════════════════════════════════════════════════════════════
// ── FIELD MODE — tablet-optimized on-site BIM review ────────────────
// ══════════════════════════════════════════════════════════════════════
// Activated via 📱 Field button. Hides desktop UI (header, sidebars),
// shows full-viewport 3D with bottom toolbar and slide-up property sheet.
// Touch-optimized: 54px button targets, long-press context menu, swipe
// sheet, storey pill strip.

import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

// Cross-module functions
declare const showProps: (props: any, modelIdx: number) => void;
declare const clearHighlight: () => void;
declare const getElementBBox: (modelIdx: number, eid: number) => any;
declare const captureScreenshot: () => void;
declare const showAllHidden: () => void;
declare const toggleSectionBox: () => void;
declare const toggleMeasure: () => void;
declare const toggleWalkMode: () => void;
declare const findModelIdx: (obj: any) => number;
declare const initIFC: () => Promise<boolean>;
declare const loadIFC: (slot: number) => Promise<void>;

// Walk camera is driven via window bridge hooks exposed by the walk module
// (walkSetKey / walkSetPose / walkFrameModel) — see walk.ts.
declare let measureMode: boolean;

let fieldActive = false;
let _fieldLongPressTimer: ReturnType<typeof setTimeout> | null = null;
let _fieldToastTimer: ReturnType<typeof setTimeout> | null = null;

// Resize the 3D viewport to whatever size #vpCanvas currently is. The
// field-mode CSS toggles grid-template-columns/rows with no transition, so
// the new layout is already committed by the time this runs — reading
// clientWidth/Height here forces the (already-pending) reflow instead of
// guessing a timeout long enough to outlast it. Prefer the shared
// window._vpResize() (same calc used by the window 'resize' listener and
// the column-drag handles in viewer-core.ts) so this can't drift from it.
function fieldResizeViewport(){
  if(typeof window._vpResize === 'function'){
    window._vpResize();
    return;
  }
  if(!appState.renderer) return;
  const vp = document.getElementById('vpCanvas')!;
  appState.renderer.setSize(vp.clientWidth, vp.clientHeight);
  appState.camera!.aspect = vp.clientWidth / vp.clientHeight;
  appState.camera!.updateProjectionMatrix();
}

window.fieldEnterMode = function(){
  fieldActive = true;
  document.body.classList.add('field-mode');
  fieldResizeViewport();
  fieldToast('Field Mode — tap elements to inspect');
  // Setup long-press for context menu on touch devices
  fieldSetupLongPress();
  log('Field mode activated');
};

window.fieldExitMode = function(){
  fieldActive = false;
  document.body.classList.remove('field-mode');
  (window as any).fieldCloseSheet();
  document.getElementById('fieldStoreys')!.classList.remove('show');
  fieldResizeViewport();
  // Keep the router/hash/localStorage in sync so a reload doesn't bounce
  // straight back into Field Mode (router persists 'ifc.page' on navigateTo).
  (window as any).navigateTo?.('viewer');
  log('Field mode deactivated');
};

// ── Field toast notification ──
function fieldToast(msg: string, duration = 2500){
  const el = document.getElementById('fieldToast')!;
  el.textContent = msg;
  el.classList.add('show');
  if(_fieldToastTimer) clearTimeout(_fieldToastTimer);
  _fieldToastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Field file loader ──
window.fieldOpenLoader = function(){
  document.getElementById('fieldLoader')!.classList.add('show');
};
window.fieldCloseLoader = function(){
  document.getElementById('fieldLoader')!.classList.remove('show');
};
window.fieldLoadFile = async function(ev: Event){
  const f = (ev.target as HTMLInputElement)?.files?.[0];
  if(!f) return;
  const statusEl = document.getElementById('fieldLoaderStatus')!;
  statusEl.textContent = '⏳ Loading ' + f.name + '...';
  // Load into slot 0 (field mode = single model viewer)
  appState.files[0] = f;
  if(!appState.ifcLoader){ if(!await initIFC()){ statusEl.textContent = '✕ Init failed'; return; } }
  try{
    await loadIFC(0);
    statusEl.textContent = '✓ ' + f.name + ' loaded';
    setTimeout((window as any).fieldCloseLoader, 800);
    fieldBuildStoreys();
  }catch(e: any){
    statusEl.textContent = '✕ ' + (e?.message || 'Load failed');
  }
  (ev.target as HTMLInputElement).value = '';
};

// ── Field properties sheet ──
window.fieldCloseSheet = function(){
  document.getElementById('fieldSheet')!.classList.remove('open');
};
window.fieldOpenSheet = function(html: string, title?: string){
  const sheet = document.getElementById('fieldSheet')!;
  document.getElementById('fieldSheetTitle')!.textContent = title || 'Properties';
  document.getElementById('fieldSheetBody')!.innerHTML = html;
  sheet.classList.add('open');
};

// Hook into showProps to also update field sheet when in field mode
{
  const _propObserver = new MutationObserver(()=>{
    if(!fieldActive) return;
    const propArea = document.getElementById('propArea');
    if(!propArea) return;
    const content = propArea.innerHTML;
    if(content && !content.includes('prop-empty')){
      (window as any).fieldOpenSheet(content, 'Element Properties');
    }
  });
  // Start observing after DOM is ready
  setTimeout(()=>{
    const propArea = document.getElementById('propArea');
    if(propArea) _propObserver.observe(propArea, {childList:true, subtree:true});
  }, 500);
}

// ── Field toolbar button handlers ──
window.fieldToggleSection = function(){
  toggleSectionBox();
  const btn = document.getElementById('fieldBtnSection')!;
  btn.classList.toggle('on', appState.sectionActive);
  fieldToast(appState.sectionActive ? 'Section box ON' : 'Section box OFF');
};

window.fieldToggleMeasure = function(){
  toggleMeasure();
  const btn = document.getElementById('fieldBtnMeasure')!;
  btn.classList.toggle('on', measureMode);
  fieldToast(measureMode ? 'Measure mode ON — tap 2 points' : 'Measure OFF');
};

window.fieldToggleWalk = function(){
  toggleWalkMode();
  const btn = document.getElementById('fieldBtnWalk')!;
  btn.classList.toggle('on', appState.walkActive);
  // Show/hide touch controls
  document.getElementById('walkTouch')!.classList.toggle('show', appState.walkActive);
  if(appState.walkActive){
    fieldToast('Walk mode — drag left joystick to move, drag right to look');
    (window as any).walkTouchInit?.();
    // Reposition to standing eye height facing the model so it's visible.
    (window as any).walkFrameModel?.();
    // On touch devices, skip pointer lock (doesn't work on iPad)
    if('ontouchstart' in window){
      try{ document.exitPointerLock?.(); }catch(e){}
    }
  } else {
    fieldToast('Walk mode OFF');
  }
};

// ── Touch walk controls: virtual joystick + look zone ──
let _walkJoyActive = false;
let _walkJoyCenter = {x:0, y:0};
let _walkJoyVec = {x:0, y:0}; // -1..1 normalized
let _walkLookJoyActive = false;
let _walkLookJoyCenter = {x:0, y:0};
let _walkLookVec = {x:0, y:0}; // -1..1 normalized for continuous look rotation

function walkTouchInit(){
  const joy = document.getElementById('walkJoy')!;
  const knob = document.getElementById('walkJoyKnob')!;
  const lookJoy = document.getElementById('walkLookJoy')!;
  const lookKnob = document.getElementById('walkLookKnob')!;

  // walk.ts reads the live joystick vectors off window, so keep them mirrored.
  (window as any)._walkJoyVec = {x:0, y:0};
  (window as any)._walkLookVec = {x:0, y:0};

  // ── Left joystick: Move ──
  joy.ontouchstart = (e) => {
    e.preventDefault();
    _walkJoyActive = true;
    const rect = joy.getBoundingClientRect();
    _walkJoyCenter = { x: rect.left + 65, y: rect.top + 65 };
    walkJoyMove(e.touches[0], knob, _walkJoyCenter, (v) => { _walkJoyVec = v; (window as any)._walkJoyVec = v; });
  };
  joy.ontouchmove = (e) => {
    e.preventDefault();
    if(_walkJoyActive && e.touches[0]) walkJoyMove(e.touches[0], knob, _walkJoyCenter, (v) => { _walkJoyVec = v; (window as any)._walkJoyVec = v; });
  };
  joy.ontouchend = joy.ontouchcancel = (e) => {
    e.preventDefault();
    _walkJoyActive = false;
    _walkJoyVec = {x:0, y:0};
    (window as any)._walkJoyVec = _walkJoyVec;
    knob.style.transform = 'translate(0px, 0px)';
  };

  // ── Right joystick: Look ──
  lookJoy.ontouchstart = (e) => {
    e.preventDefault();
    _walkLookJoyActive = true;
    const rect = lookJoy.getBoundingClientRect();
    _walkLookJoyCenter = { x: rect.left + 65, y: rect.top + 65 };
    walkJoyMove(e.touches[0], lookKnob, _walkLookJoyCenter, (v) => { _walkLookVec = v; (window as any)._walkLookVec = v; });
  };
  lookJoy.ontouchmove = (e) => {
    e.preventDefault();
    if(_walkLookJoyActive && e.touches[0]) walkJoyMove(e.touches[0], lookKnob, _walkLookJoyCenter, (v) => { _walkLookVec = v; (window as any)._walkLookVec = v; });
  };
  lookJoy.ontouchend = lookJoy.ontouchcancel = (e) => {
    e.preventDefault();
    _walkLookJoyActive = false;
    _walkLookVec = {x:0, y:0};
    (window as any)._walkLookVec = _walkLookVec;
    lookKnob.style.transform = 'translate(0px, 0px)';
  };
}

function walkJoyMove(touch: Touch, knobEl: HTMLElement, center: {x:number; y:number}, setVec: (v:{x:number;y:number}) => void){
  const dx = touch.clientX - center.x;
  const dy = touch.clientY - center.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const maxR = 44;
  const clamped = Math.min(dist, maxR);
  const angle = Math.atan2(dy, dx);
  const cx = Math.cos(angle) * clamped;
  const cy = Math.sin(angle) * clamped;
  knobEl.style.transform = `translate(${cx}px, ${cy}px)`;
  setVec({ x: cx / maxR, y: cy / maxR });
}

window.walkTouchUD = function(dir: string, pressed: boolean){
  if(dir === 'up') (window as any).walkSetKey?.('e', pressed);
  if(dir === 'down') (window as any).walkSetKey?.('q', pressed);
};

window.fieldScreenshot = function(){
  captureScreenshot();
  fieldToast('Screenshot saved');
};

window.fieldShowAll = function(){
  if(window.showAllHidden) showAllHidden();
  fieldToast('All elements visible');
};

// ── Field storey selector ──
window.fieldToggleStoreys = function(){
  const el = document.getElementById('fieldStoreys')!;
  const wasShown = el.classList.contains('show');
  el.classList.toggle('show');
  const btn = document.getElementById('fieldBtnStoreys')!;
  btn.classList.toggle('on', !wasShown);
  if(!wasShown) fieldBuildStoreys();
};

function fieldBuildStoreys(){
  const container = document.getElementById('fieldStoreys')!;
  // Collect storeys from all loaded models
  const allStoreys: Array<{name:string; elevation:number}> = [];
  for(let i=0; i<appState.loadedModels.length; i++){
    const m = appState.loadedModels[i];
    if(!m?.spatial?.storeys) continue;
    for(const s of m.spatial.storeys){
      allStoreys.push({ name: s.name, elevation: s.elevation });
    }
  }
  // Deduplicate by elevation (±0.1m)
  const unique: Array<{name:string; elevation:number}> = [];
  for(const s of allStoreys){
    if(!unique.some(u => Math.abs(u.elevation - s.elevation) < 0.1)){
      unique.push(s);
    }
  }
  unique.sort((a,b) => a.elevation - b.elevation);

  if(unique.length === 0){
    container.innerHTML = '<span class="field-storey-pill" style="opacity:.5">No storeys found</span>';
    return;
  }

  container.innerHTML = unique.map((s, i) =>
    `<button class="field-storey-pill" data-elev="${s.elevation}" onclick="fieldSelectStorey(${i},${s.elevation})">${s.name}</button>`
  ).join('');
}

window.fieldSelectStorey = function(idx: number, elevation: number){
  // Update pill selection
  const pills = document.querySelectorAll('.field-storey-pill');
  pills.forEach((p, i) => p.classList.toggle('on', i===idx));

  // Set section box to show only this storey (±1.5m from elevation)
  if(!appState.sectionActive) toggleSectionBox();
  const h = 4; // storey height estimate
  // Section box: set Y (up) range around the storey elevation, offset by model centering
  const cy = appState.sharedCenterOffset?.y || 0;
  const yBot = elevation - cy;
  const yTop = yBot + h;
  // Update section box planes
  if(appState.clipPlanes.length >= 6){
    // Planes 2,3 are Y+ and Y- (top/bottom)
    appState.clipPlanes[2].constant = yTop;
    appState.clipPlanes[3].constant = -yBot;
    // Expand X,Z to full model bounds
    appState.clipPlanes[0].constant = appState.modelBounds!.max.x + 10;
    appState.clipPlanes[1].constant = -appState.modelBounds!.min.x + 10;
    appState.clipPlanes[4].constant = appState.modelBounds!.max.z + 10;
    appState.clipPlanes[5].constant = -appState.modelBounds!.min.z + 10;
  }
  // Move camera to look at this storey
  const cx = (appState.modelBounds!.min.x + appState.modelBounds!.max.x)/2;
  const cz = (appState.modelBounds!.min.z + appState.modelBounds!.max.z)/2;
  const span = Math.max(appState.modelBounds!.max.x - appState.modelBounds!.min.x, appState.modelBounds!.max.z - appState.modelBounds!.min.z);
  appState.camera!.position.set(cx + span*0.4, yBot + h*0.6, cz + span*0.4);
  appState.controls!.target.set(cx, yBot + h*0.3, cz);
  appState.controls!.update();

  fieldToast(`Storey: ${document.querySelectorAll('.field-storey-pill')[idx]?.textContent || ''}`);
};

// ── Long-press for context menu (touch devices) ──
function fieldSetupLongPress(){
  const canvas = appState.renderer?.domElement;
  if(!canvas) return;
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpPos = {x:0, y:0};
  let lpMoved = false;

  // Double-tap detection for zoom-to-element
  let lastTapTime = 0;
  let lastTapPos = {x:0, y:0};

  canvas.addEventListener('touchstart', (e) => {
    if(!fieldActive) return;
    if(e.touches.length !== 1) return;
    const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
    lpPos = {x: tx, y: ty};
    lpMoved = false;

    // Double-tap detection (300ms window, 30px tolerance)
    const now = Date.now();
    const dt = now - lastTapTime;
    const dist = Math.sqrt(Math.pow(tx - lastTapPos.x, 2) + Math.pow(ty - lastTapPos.y, 2));
    if(dt < 300 && dist < 30){
      // Double-tap → zoom to tapped element
      e.preventDefault();
      lastTapTime = 0; // reset to avoid triple-tap
      fieldDoubleTapZoom(tx, ty);
      return;
    }
    lastTapTime = now;
    lastTapPos = {x: tx, y: ty};

    // Long-press timer
    lpTimer = setTimeout(()=>{
      if(!lpMoved){
        const ev = new MouseEvent('contextmenu', {
          bubbles:true, clientX:lpPos.x, clientY:lpPos.y
        });
        canvas.dispatchEvent(ev);
        e.preventDefault();
      }
    }, 600);
  }, {passive:false});

  canvas.addEventListener('touchmove', (e) => {
    if(!fieldActive || !lpTimer) return;
    const dx = e.touches[0].clientX - lpPos.x;
    const dy = e.touches[0].clientY - lpPos.y;
    if(Math.abs(dx) > 10 || Math.abs(dy) > 10){
      lpMoved = true;
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  });

  canvas.addEventListener('touchend', () => {
    if(lpTimer) clearTimeout(lpTimer);
    lpTimer = null;
  });

  canvas.addEventListener('touchcancel', () => {
    if(lpTimer) clearTimeout(lpTimer);
    lpTimer = null;
  });
}

// ── Double-tap zoom: raycast at tap point, zoom to hit element ──
function fieldDoubleTapZoom(clientX: number, clientY: number){
  if(!appState.renderer || !appState.camera) return;
  const rect = appState.renderer.domElement.getBoundingClientRect();
  const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(mx, my), appState.camera);

  // Collect visible meshes
  const ms: THREE.Object3D[] = [];
  appState.scene!.traverse(c => { if((c as THREE.Mesh).isMesh && c.visible) ms.push(c); });
  const hits = ray.intersectObjects(ms, false);

  if(hits.length === 0){
    fieldToast('No element at tap point');
    return;
  }

  const hit = hits[0];
  const point = hit.point;

  // Try to get element bbox for better framing
  let targetModelIdx = -1;
  if((hit.object as any).userData?.srcModelIdx !== undefined){
    targetModelIdx = (hit.object as any).userData.srcModelIdx;
  } else {
    targetModelIdx = findModelIdx(hit.object);
  }

  let foundEid: number | null = null;
  try{
    const eid = appState.ifcLoader!.ifcManager.getExpressId((hit.object as any).geometry, hit.faceIndex!);
    if(eid > 0) foundEid = eid;
  }catch(e){}
  if(!foundEid && (hit.object as any).geometry?.attributes?.expressID){
    try{
      const idx = (hit.object as any).geometry.index
        ? (hit.object as any).geometry.index.array[hit.faceIndex! * 3]
        : hit.faceIndex! * 3;
      if(idx >= 0 && idx < (hit.object as any).geometry.attributes.expressID.array.length){
        foundEid = (hit.object as any).geometry.attributes.expressID.array[idx];
      }
    }catch(e){}
  }

  if(foundEid && targetModelIdx >= 0){
    const bbox = getElementBBox(targetModelIdx, foundEid);
    if(bbox?.center){
      const sz = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
      const d = Math.max(sz * 2.5, 3);
      if(appState.walkActive){
        const wx = bbox.center.x + sz + 1.5, wy = bbox.center.y + 1.6, wz = bbox.center.z + sz + 1.5;
        (window as any).walkSetPose?.(wx, wy, wz, Math.atan2(bbox.center.x - wx, bbox.center.z - wz), 0);
      } else {
        appState.camera.position.set(bbox.center.x + d*0.45, bbox.center.y + d*0.35, bbox.center.z + d*0.45);
        appState.controls!.target.copy(bbox.center);
        appState.controls!.update();
      }
      fieldToast('Zoomed to element');
      return;
    }
  }

  // Fallback: zoom to hit point
  const d = 5;
  if(appState.walkActive){
    const wx = point.x + 2, wy = point.y + 1.6, wz = point.z + 2;
    (window as any).walkSetPose?.(wx, wy, wz, Math.atan2(point.x - wx, point.z - wz), 0);
  } else {
    appState.camera.position.set(point.x + d*0.5, point.y + d*0.4, point.z + d*0.5);
    appState.controls!.target.copy(point);
    appState.controls!.update();
  }
  fieldToast('Zoomed to point');
}

// ══════════════════════════════════════════════════════════════════════
// ── FULL-SCREEN PLAN 2D (Field Mode) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Uses the existing planView infrastructure (2nd Three.js renderer +
// OrthographicCamera) but renders into a full-viewport container with
// storey pills and touch pan/zoom.

let fieldPlan2DActive = false;
let fieldPlan2DRenderer: THREE.WebGLRenderer | null = null;
let fieldPlan2DCamera: THREE.OrthographicCamera | null = null;
let fieldPlan2DStoreyIdx = -1;
let _fp2dAnimId: number | null = null;

window.fieldTogglePlan2D = function(){
  if(fieldPlan2DActive){
    (window as any).fieldClosePlan2D();
  } else {
    (window as any).fieldOpenPlan2D();
  }
  document.getElementById('fieldBtnPlan2D')!.classList.toggle('on', fieldPlan2DActive);
};

window.fieldOpenPlan2D = function(){
  if(!appState.loadedModels.some((m: any) => !!m)){
    fieldToast('Load a model first');
    return;
  }
  fieldPlan2DActive = true;
  document.getElementById('fieldPlan2D')!.classList.add('show');

  // Build storey pills
  fieldPlan2DBuildStoreys();

  // Create renderer if needed
  const container = document.getElementById('fieldPlan2DCanvas')!;
  if(!fieldPlan2DRenderer){
    fieldPlan2DRenderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    fieldPlan2DRenderer.localClippingEnabled = true;
    fieldPlan2DRenderer.setClearColor(0xf8f9fb, 1);
    container.appendChild(fieldPlan2DRenderer.domElement);

    fieldPlan2DCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 5000);
    fieldPlan2DCamera.position.set(0, 500, 0);
    // Apply TrueNorth
    let tnAngle = 0;
    for(let i=0; i<appState.loadedModels.length; i++){
      if(appState.loadedModels[i]?.spatial?.trueNorthAngle){
        tnAngle = appState.loadedModels[i].spatial.trueNorthAngle; break;
      }
    }
    fieldPlan2DCamera.up.set(-Math.sin(tnAngle), 0, -Math.cos(tnAngle));
    fieldPlan2DCamera.lookAt(0, 0, 0);
  }

  // Resize
  fieldPlan2DResize();

  // Setup touch pan/zoom
  fieldPlan2DSetupTouch();

  // Start render loop
  fieldPlan2DRender();

  // Auto-select first storey
  if(fieldPlan2DStoreyIdx < 0){
    const storeys = fieldPlan2DGetStoreys();
    if(storeys.length > 0) (window as any).fieldPlan2DSelectStorey(0);
  }
};

window.fieldClosePlan2D = function(){
  fieldPlan2DActive = false;
  document.getElementById('fieldPlan2D')!.classList.remove('show');
  document.getElementById('fieldBtnPlan2D')!.classList.remove('on');
  if(_fp2dAnimId){ cancelAnimationFrame(_fp2dAnimId); _fp2dAnimId = null; }
  // Remove storey clip planes
  appState.clipPlanes.length = 0;
};

function fieldPlan2DResize(){
  if(!fieldPlan2DRenderer) return;
  const container = document.getElementById('fieldPlan2DCanvas')!;
  const w = container.clientWidth, h = container.clientHeight;
  if(w === 0 || h === 0) return;
  fieldPlan2DRenderer.setSize(w, h);
  fieldPlan2DRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function fieldPlan2DGetStoreys(){
  const all: Array<{name:string; elevation:number}> = [];
  for(let i=0; i<appState.loadedModels.length; i++){
    const m = appState.loadedModels[i];
    if(!m?.spatial?.storeys) continue;
    for(const s of m.spatial.storeys){
      if(!all.some(u => Math.abs(u.elevation - s.elevation) < 0.1)){
        all.push({ name: s.name, elevation: s.elevation });
      }
    }
  }
  all.sort((a,b) => a.elevation - b.elevation);
  return all;
}

function fieldPlan2DBuildStoreys(){
  const container = document.getElementById('fieldPlan2DStoreys')!;
  const storeys = fieldPlan2DGetStoreys();
  if(storeys.length === 0){
    container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No storeys</span>';
    return;
  }
  container.innerHTML = storeys.map((s, i) =>
    `<button class="field-plan2d-pill${i===fieldPlan2DStoreyIdx?' on':''}" onclick="fieldPlan2DSelectStorey(${i})">${s.name}</button>`
  ).join('');
}

window.fieldPlan2DSelectStorey = function(idx: number){
  const storeys = fieldPlan2DGetStoreys();
  if(idx < 0 || idx >= storeys.length) return;
  fieldPlan2DStoreyIdx = idx;
  const s = storeys[idx];

  // Update pills
  document.querySelectorAll('.field-plan2d-pill').forEach((p, i) => p.classList.toggle('on', i===idx));

  // Setup clipping planes for this storey
  const cy = appState.sharedCenterOffset?.y || 0;
  const elevBot = s.elevation - cy;
  const nextStorey = storeys[idx+1];
  const elevTop = nextStorey ? (nextStorey.elevation - cy) : (elevBot + 3.5);
  const cutY = elevBot + (elevTop - elevBot) * 0.4; // cut at 40% height (window/door level)

  // 2 horizontal clip planes: top and bottom
  appState.clipPlanes.length = 0;
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY + 0.5)); // ceiling
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevBot + 0.1)); // floor

  // Position camera looking down at this storey
  if(fieldPlan2DCamera){
    const cx = (appState.modelBounds!.min.x + appState.modelBounds!.max.x) / 2;
    const cz = (appState.modelBounds!.min.z + appState.modelBounds!.max.z) / 2;
    fieldPlan2DCamera.position.set(cx, cutY + 200, cz);

    // Fit bounds
    const spanX = appState.modelBounds!.max.x - appState.modelBounds!.min.x;
    const spanZ = appState.modelBounds!.max.z - appState.modelBounds!.min.z;
    const container2 = document.getElementById('fieldPlan2DCanvas')!;
    const aspect = container2.clientWidth / (container2.clientHeight || 1);
    const pad = 1.15;
    let halfW: number, halfH: number;
    if(spanX / aspect > spanZ){
      halfW = spanX * pad / 2;
      halfH = halfW / aspect;
    } else {
      halfH = spanZ * pad / 2;
      halfW = halfH * aspect;
    }
    fieldPlan2DCamera.left = -halfW;
    fieldPlan2DCamera.right = halfW;
    fieldPlan2DCamera.top = halfH;
    fieldPlan2DCamera.bottom = -halfH;
    fieldPlan2DCamera.updateProjectionMatrix();
  }

  // Update info
  document.getElementById('fieldPlan2DInfo')!.textContent =
    `${s.name} — Elev: ${s.elevation.toFixed(2)}m — Cut height: ${(s.elevation + (elevTop-elevBot+cy)*0.4).toFixed(2)}m`;

  fieldToast(`Plan: ${s.name}`);
};

function fieldPlan2DRender(){
  if(!fieldPlan2DActive) return;
  if(fieldPlan2DRenderer && fieldPlan2DCamera){
    fieldPlan2DRenderer.render(appState.scene!, fieldPlan2DCamera);
  }
  _fp2dAnimId = requestAnimationFrame(fieldPlan2DRender);
}

// ── Touch pan/zoom for Plan 2D ──
function fieldPlan2DSetupTouch(){
  const container = document.getElementById('fieldPlan2DCanvas')!;
  let panActive = false;
  let panPrev = {x:0, y:0};
  let pinchDist0 = 0;

  container.ontouchstart = (e) => {
    if(e.touches.length === 1){
      panActive = true;
      panPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if(e.touches.length === 2){
      panActive = false;
      const t0 = e.touches[0], t1 = e.touches[1];
      pinchDist0 = Math.sqrt(Math.pow(t1.clientX-t0.clientX,2) + Math.pow(t1.clientY-t0.clientY,2));
    }
  };

  container.ontouchmove = (e) => {
    e.preventDefault();
    if(!fieldPlan2DCamera) return;

    if(e.touches.length === 1 && panActive){
      // Pan
      const dx = e.touches[0].clientX - panPrev.x;
      const dy = e.touches[0].clientY - panPrev.y;
      panPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const w = fieldPlan2DCamera.right - fieldPlan2DCamera.left;
      const h = fieldPlan2DCamera.top - fieldPlan2DCamera.bottom;
      const rect = container.getBoundingClientRect();
      const panX = -dx / rect.width * w;
      const panZ = dy / rect.height * h;

      // Apply pan relative to camera up direction
      fieldPlan2DCamera.position.x += panX;
      fieldPlan2DCamera.position.z += panZ;
    } else if(e.touches.length === 2){
      // Pinch zoom
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX-t0.clientX,2) + Math.pow(t1.clientY-t0.clientY,2));
      if(pinchDist0 > 0){
        const scale = pinchDist0 / dist;
        const cxOrtho = (fieldPlan2DCamera.left + fieldPlan2DCamera.right) / 2;
        const cyOrtho = (fieldPlan2DCamera.top + fieldPlan2DCamera.bottom) / 2;
        const hw = (fieldPlan2DCamera.right - fieldPlan2DCamera.left) / 2 * scale;
        const hh = (fieldPlan2DCamera.top - fieldPlan2DCamera.bottom) / 2 * scale;
        // Clamp: don't zoom in too far or out too far
        if(hw > 0.5 && hw < 5000){
          fieldPlan2DCamera.left = cxOrtho - hw;
          fieldPlan2DCamera.right = cxOrtho + hw;
          fieldPlan2DCamera.top = cyOrtho + hh;
          fieldPlan2DCamera.bottom = cyOrtho - hh;
          fieldPlan2DCamera.updateProjectionMatrix();
        }
        pinchDist0 = dist;
      }
    }
  };

  container.ontouchend = container.ontouchcancel = () => {
    panActive = false;
  };

  // Tap to select element on plan
  container.onclick = async (e) => {
    if(!fieldPlan2DRenderer || !fieldPlan2DCamera) return;
    const rect = container.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mx, my), fieldPlan2DCamera);
    const ms: THREE.Object3D[] = [];
    appState.scene!.traverse(c => { if((c as THREE.Mesh).isMesh && c.visible) ms.push(c); });
    const hits = ray.intersectObjects(ms, false);
    if(hits.length === 0) return;

    const hit = hits[0];
    let targetModelIdx = (hit.object as any).userData?.srcModelIdx ?? -1;
    if(targetModelIdx < 0) targetModelIdx = findModelIdx(hit.object);
    if(targetModelIdx < 0 || !appState.loadedModels[targetModelIdx]) return;

    let foundEid: number | null = null;
    try{
      const eid = appState.ifcLoader!.ifcManager.getExpressId((hit.object as any).geometry, hit.faceIndex!);
      if(eid > 0) foundEid = eid;
    }catch(e2){}
    if(!foundEid && (hit.object as any).geometry?.attributes?.expressID){
      try{
        const idx2 = (hit.object as any).geometry.index
          ? (hit.object as any).geometry.index.array[hit.faceIndex!*3]
          : hit.faceIndex!*3;
        if(idx2 >= 0) foundEid = (hit.object as any).geometry.attributes.expressID.array[idx2];
      }catch(e2){}
    }
    if(!foundEid) return;

    // Show properties in field sheet
    const modelID = appState.loadedModels[targetModelIdx].modelID;
    try{
      const props = await appState.ifcLoader!.ifcManager.getItemProperties(modelID, foundEid, true);
      if(props) showProps(props, targetModelIdx);
    }catch(e2){}

    // Highlight
    try{
      clearHighlight();
      if(!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({color:0x2563eb, transparent:true, opacity:0.6, side:THREE.DoubleSide, depthTest:true, clippingPlanes:appState.clipPlanes});
      const sub = appState.ifcLoader!.ifcManager.createSubset({modelID, ids:[foundEid], material:window._hlMat, scene:appState.scene, removePrevious:true, customID:'userHighlight'});
      if(sub){ sub.position.copy(appState.loadedModels[targetModelIdx].position); sub.updateMatrixWorld(true); window._lastHL={subset:sub, mid:modelID}; }
    }catch(e2){}

    fieldToast('Element selected');
  };
}

// ── Auto-detect touch device → suggest field mode ──
if('ontouchstart' in window && window.innerWidth <= 1200){
  // On touch tablets, show a hint after first model load
  let _fieldHinted = false;
  const _checkFieldHint = ()=>{
    if(_fieldHinted || fieldActive) return;
    if(appState.loadedModels.some((m: any) => !!m)){
      _fieldHinted = true;
      setTimeout(()=>{
        if(!fieldActive && confirm('Touch device detected. Switch to Field Mode for easier on-site viewing?')){
          (window as any).fieldEnterMode();
        }
      }, 1500);
    }
  };
  // Hook into the controls change to detect post-load
  setTimeout(()=>{
    if(appState.controls) appState.controls.addEventListener('change', ()=>{ if(!_fieldHinted) _checkFieldHint(); });
  }, 2000);
}

export { fieldToast, fieldBuildStoreys, walkTouchInit };
