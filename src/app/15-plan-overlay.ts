// ══════════════════════════════════════════════════════════════════════
// ── 2D Plan Overlay (Option A: top-down ortho mini-renderer) ─────────
// ══════════════════════════════════════════════════════════════════════
// A floating panel inside vpCanvas hosts a 2nd Three.js renderer that
// shares the main `scene`. The 2nd renderer uses an OrthographicCamera
// looking straight down (eye on +Y, target at origin in XZ). Storey
// clipping is achieved by appending two horizontal clip planes to the
// camera's render path so only geometry between two elevations draws.
//
// Why a 2nd renderer (not a 2nd canvas with copied geometry):
//   - No geometry duplication / memory bloat
//   - Section box, hide/isolate, colorize, compare diff subsets ALL
//     reflect automatically because they're on the same scene.
//   - Adding/removing clip planes for storey gating doesn't disturb the
//     main 3D view because we swap renderer.clippingPlanes per draw.
//
// Performance: ~10-15% extra GPU per frame (one extra full draw). We
// throttle plan render to only run when (a) the 3D camera moved, (b)
// storey changed, or (c) scene materials changed. A dirty flag set by
// OrbitControls + storey/material updates keeps this cheap.
let planView = null;     // {renderer, camera, panel, canvas, storey, follow, storeyClip[], dirty}
let planStoreys = [];    // [{name, elevation, topElev, modelIdx}] from spatial cache
let planDragState = null;

window.togglePlanOverlay = function(){
  const panel = document.getElementById('planOverlay');
  const btn = document.getElementById('btnPlan');
  const showing = panel.classList.contains('show');
  if(showing){
    panel.classList.remove('show');
    btn.classList.remove('active');
    if(planView) planView.dirty = false; // stop rendering
  }else{
    panel.classList.add('show');
    btn.classList.add('active');
    if(!planView) initPlanView();
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};

// Read storey list from the spatial cache. Each loadedModels[i].spatial
// has storeys sorted ascending by elevation. We compute topElev for each
// storey as the next storey's elevation, with a 3.5m fallback for the
// topmost. Storeys from both files are merged + sorted.
function rebuildPlanStoreyList(){
  planStoreys = [];
  const multiModel = loadedModels.filter(m=>m?.spatial?.storeys?.length).length > 1;
  for(let mi=0; mi<loadedModels.length; mi++){
    const m = loadedModels[mi];
    if(!m || !m.spatial || !m.spatial.storeys) continue;
    const arr = m.spatial.storeys;
    const slotLabel = mi===0?'A' : mi===1?'B' : FED_LABELS[(mi-2) % FED_LABELS.length];
    for(let i=0; i<arr.length; i++){
      const next = arr[i+1];
      const top  = next ? next.elevation : (arr[i].elevation + 3.5);
      planStoreys.push({
        name: arr[i].name + (multiModel ? ' ('+slotLabel+')' : ''),
        elevation: arr[i].elevation,
        topElev: top,
        modelIdx: mi
      });
    }
  }
  // De-duplicate when both files have the same storey at the same elev
  const seen = new Set();
  planStoreys = planStoreys.filter(s=>{
    const k = s.name.replace(/ \([AB]\)$/,'') + '@' + s.elevation.toFixed(2);
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });
  planStoreys.sort((a,b)=>a.elevation-b.elevation);

  // Populate the dropdown
  const sel = document.getElementById('planStoreySelect');
  if(planStoreys.length === 0){
    sel.innerHTML = '<option value="">— No storeys found —</option>';
    document.getElementById('planEmpty').style.display = 'flex';
    return;
  }
  document.getElementById('planEmpty').style.display = 'none';
  sel.innerHTML = planStoreys.map((s,i)=>{
    const elevStr = s.elevation>=0 ? '+'+s.elevation.toFixed(2)+'m' : s.elevation.toFixed(2)+'m';
    return `<option value="${i}">${s.name} (${elevStr})</option>`;
  }).join('');
  // Pick a sensible default storey: closest to the current camera Y, else middle one
  if(planView && planView.storey === null){
    const camY = camera.position.y;
    let bestI = 0, bestD = Infinity;
    planStoreys.forEach((s,i)=>{
      const d = Math.abs((s.elevation+s.topElev)/2 - camY);
      if(d < bestD){bestD = d; bestI = i}
    });
    sel.value = bestI;
    planSelectStorey(bestI);
  }
}

// One-time setup of the 2nd renderer + camera + clip planes.
function initPlanView(){
  if(planView) return;
  const canvas = document.getElementById('planCanvas');
  // Use the SAME WebGL context-creation strategy as the main renderer for
  // material compatibility (each renderer manages its own GL state).
  const planRenderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, preserveDrawingBuffer: true
  });
  planRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  planRenderer.localClippingEnabled = true;

  // Orthographic top-down camera. Bounds get set in planFit() per storey.
  const planCam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 5000);
  planCam.position.set(0, 1000, 0);
  // North direction: default is -Z in Three.js (IFC Y+ after Z-up→Y-up swap).
  // TrueNorth rotation will be applied when storey is selected / models load.
  planCam.up.set(0, 0, -1);
  planCam.lookAt(0, 0, 0);

  // Two extra clip planes to gate one storey:
  //   storeyClipBottom: keeps geometry above storey.elevation
  //   storeyClipTop:    keeps geometry below storey.topElev
  // We use the standard Three.js Y-up orientation here; the importer
  // already transformed from IFC Z-up to Three.js Y-up at load time, so
  // 'elevation' lives on the Y axis in scene space.
  const storeyClip = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),    // y >= bottom
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)    // y <= top
  ];

  planView = {
    renderer: planRenderer,
    camera: planCam,
    canvas,
    storey: null,
    follow: false,
    storeyClip,
    dirty: true
  };

  // Wire controls
  setupPlanInteraction();
  // Hook into render loop
  setupPlanRenderHook();
}

// Pick a storey by index → set storey clip planes + frame the camera.
window.planSelectStorey = function(idxStr){
  if(!planView || planStoreys.length === 0) return;
  const idx = +idxStr;
  if(idx < 0 || idx >= planStoreys.length) return;
  planView.storey = idx;
  const s = planStoreys[idx];
  // storeyClip[0]: keeps y >= s.elevation - 0.1 (small epsilon below floor)
  //   Plane equation: normal·p + constant = 0 ; we want n=(0,1,0), constant=-bottom
  // For three.js Plane: (n·p) + constant >= 0 means visible side
  //   n=(0,1,0), constant=-bottom → y - bottom >= 0 → y >= bottom ✓
  planView.storeyClip[0].constant = -(s.elevation - 0.1);
  // storeyClip[1]: keeps y <= s.topElev + 0.1; n=(0,-1,0), constant=+top → -y+top >= 0 → y <= top ✓
  planView.storeyClip[1].constant =  (s.topElev + 0.1);
  document.getElementById('planInfoStorey').textContent = s.name + ' [' + s.elevation.toFixed(2) + ' → ' + s.topElev.toFixed(2) + 'm]';
  planFit();
  requestPlanRender();
};

// Frame the ortho camera to fit the current storey footprint.
window.planFit = function(){
  if(!planView) return;
  // Use modelBounds X/Z extents (Y is the up axis, so XZ is the floor plane).
  const b = modelBounds;
  if(!b || !b.min || !b.max) return;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const sx = (b.max.x - b.min.x);
  const sz = (b.max.z - b.min.z);
  // Aspect of canvas
  const w = planView.canvas.clientWidth || 320;
  const h = planView.canvas.clientHeight || 240;
  const canvasAspect = w / h;
  const modelAspect = sx / sz;
  // Choose ortho size: fit the larger axis with 5% padding
  let halfW, halfH;
  if(modelAspect > canvasAspect){
    halfW = sx * 0.55;
    halfH = halfW / canvasAspect;
  }else{
    halfH = sz * 0.55;
    halfW = halfH * canvasAspect;
  }
  const cam = planView.camera;
  cam.left = -halfW; cam.right = halfW;
  cam.top = halfH; cam.bottom = -halfH;
  cam.position.set(cx, b.max.y + 100, cz);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();
  // Resize canvas to its CSS pixel size now (must be done after window/panel resize)
  planView.renderer.setSize(w, h, false);
  requestPlanRender();
};

window.planToggleFollow = function(){
  if(!planView) return;
  planView.follow = !planView.follow;
  document.getElementById('planFollowBtn').classList.toggle('active', planView.follow);
};

// Render hook: piggyback on the main render loop so we don't run a
// separate rAF. We call this from the existing animation frame loop
// AFTER the main scene draws, with our extra clip planes appended.
function setupPlanRenderHook(){
  const fn = window._renderPlan = function(){
    if(!planView) return;
    const panel = document.getElementById('planOverlay');
    if(!panel.classList.contains('show')) return;
    if(planView.storey === null) return;

    // Resize on the fly if the canvas's CSS size changed (panel resize)
    const w = planView.canvas.clientWidth, h = planView.canvas.clientHeight;
    if(w > 0 && h > 0){
      const drawSize = planView.renderer.getSize(new THREE.Vector2());
      if(Math.abs(drawSize.x - w) > 1 || Math.abs(drawSize.y - h) > 1){
        planFit();
        planView.dirty = true;
      }
    }

    // Re-render scene only when something actually changed (camera moved,
    // storey changed, geometry modified). This is the expensive part —
    // ~10ms for a non-trivial model.
    if(planView.dirty){
      // Combine main clipPlanes (section box, etc.) with our storey gates
      const combined = clipPlanes.concat(planView.storeyClip);
      planView.renderer.clippingPlanes = combined;
      planView.renderer.render(scene, planView.camera);
      planView.dirty = false;
    }

    // Marker is cheap (SVG only) — redraw every frame so it tracks the
    // 3D camera smoothly even during damping/animation.
    drawPlanCameraMarker();
  };

  // Set dirty whenever camera moves or controls update — the same render
  // tick that re-renders 3D will re-render the plan. We hook through
  // controls' 'change' event.
  if(controls && controls.addEventListener){
    controls.addEventListener('change', ()=>{
      if(planView) planView.dirty = true;
      // Also redraw camera marker since camera moved
      if(planView && planView.follow) drawPlanCameraMarker();
    });
  }

  // Patch into the main render loop. The loop is an IIFE so we add an
  // extra call via requestAnimationFrame that mirrors the main one.
  function planLoop(){
    requestAnimationFrame(planLoop);
    fn();
  }
  planLoop();
}

// Public helper: anywhere in the app that materially changes scene
// content (compare run, colorize apply, hide/isolate, section box drag)
// should call this to flag the plan for re-render.
window.requestPlanRender = function(){ if(planView) planView.dirty = true; };

// Draw a cone marker showing the 3D camera's XZ position + heading on
// the plan canvas via an SVG overlay (cheaper than mixing into the GL
// scene and lets us style it freely).
//
// Math: ortho camera positioned at (cx, h, cz) looking down -Y with
// up = (0, 0, -1). That means in screen space:
//   screen-X-axis = world +X
//   screen-Y-axis (up) = world -Z
// SVG y is top-down, so we flip when computing px/py in [0..100].
// Draw a marker showing the 3D camera's XZ position + viewing frustum
// on the plan. SVG overlay is sized to match the canvas (1:1 with the
// underlying ortho frustum) so positions are pixel-accurate.
//
// Visualization layers (back → front):
//   1. Section box outline    — dashed orange rectangle showing the
//                                horizontal extent of the active section
//                                clip planes (so user knows what's
//                                clipped without leaving plan view).
//   2. Camera FOV cone        — the actual horizontal FOV of the 3D
//                                camera scaled to its real distance, so
//                                user sees "this much of the floor is
//                                visible right now".
//   3. Eye position circle    — solid blue, white halo for visibility.
//   4. Heading arrow          — short white line inside the eye circle
//                                pointing toward the look direction.
//   5. North arrow + scale    — orientation reference in corners.
//   6. Off-storey indicator   — fades the cone + shows camera elevation
//                                badge if 3D camera Y is outside the
//                                current storey range.
function drawPlanCameraMarker(){
  if(!planView) return;
  const svg = document.getElementById('planMarkerSvg');
  if(!svg) return;
  const pcam = planView.camera;
  // Frustum (in world units) and canvas dimensions
  const fw = pcam.right - pcam.left;
  const fh = pcam.top - pcam.bottom;
  if(fw <= 0 || fh <= 0) return;
  const cw = planView.canvas.clientWidth || 1;
  const ch = planView.canvas.clientHeight || 1;

  // Set viewBox to match canvas aspect so the marker isn't stretched
  if(svg.getAttribute('viewBox') !== `0 0 ${cw} ${ch}`){
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  }

  // World → SVG pixel conversion
  const worldToPx = (wx, wz)=>{
    const relX = wx - pcam.position.x;
    const relZup = pcam.position.z - wz;        // world -Z = screen up
    const u = (relX - pcam.left) / fw;
    const v = 1 - (relZup - pcam.bottom) / fh;
    return [u * cw, v * ch];
  };

  // 3D camera world XZ
  const wx = camera.position.x, wz = camera.position.z;
  const [px, py] = worldToPx(wx, wz);

  // ── Build the FOV cone using the real 3D camera frustum ──
  const vFovRad = (camera.fov || 50) * Math.PI / 180;
  const renderEl = renderer.domElement;
  const aspect = renderEl ? (renderEl.clientWidth / Math.max(1, renderEl.clientHeight)) : 1.6;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
  const halfH = hFovRad / 2;

  const dx = controls.target.x - camera.position.x;
  const dz = controls.target.z - camera.position.z;
  const dirLen = Math.hypot(dx, dz) || 1;
  const dxn = dx / dirLen, dzn = dz / dirLen;
  const headingWorld = Math.atan2(dzn, dxn);

  const planReachMax = Math.min(fw, fh) * 0.45;
  const planReachMin = Math.min(fw, fh) * 0.12;
  const camToTargetDist = Math.hypot(dx, dz);
  const reachWorld = Math.max(planReachMin, Math.min(planReachMax, camToTargetDist));

  const edge1Ang = headingWorld - halfH;
  const edge2Ang = headingWorld + halfH;

  // Build a smooth fan shape using a polyline of intermediate angles
  const fanPts = [`${px.toFixed(1)},${py.toFixed(1)}`];
  const STEPS = 12;
  for(let i = 0; i <= STEPS; i++){
    const t = i / STEPS;
    const ang = edge1Ang + (edge2Ang - edge1Ang) * t;
    const fwx = wx + Math.cos(ang) * reachWorld;
    const fwz = wz + Math.sin(ang) * reachWorld;
    const [fx, fy] = worldToPx(fwx, fwz);
    fanPts.push(`${fx.toFixed(1)},${fy.toFixed(1)}`);
  }

  // Center direction line
  const ctrWx = wx + dxn * reachWorld;
  const ctrWz = wz + dzn * reachWorld;
  const [ctrX, ctrY] = worldToPx(ctrWx, ctrWz);
  const svgAngle = Math.atan2(ctrY - py, ctrX - px);

  // ── Off-storey detection ──
  const storey = planStoreys[planView.storey];
  let onStorey = true;
  if(storey){
    const camY = camera.position.y;
    onStorey = (camY >= storey.elevation - 0.5) && (camY <= storey.topElev + 0.5);
  }
  const fanFill   = onStorey ? 'rgba(37,99,235,0.18)' : 'rgba(120,120,120,0.10)';
  const fanStroke = onStorey ? '#2563eb' : '#9ca3af';
  const eyeFill   = onStorey ? '#2563eb' : '#6b7280';

  const ARROW_LEN = 5;
  const ax = px + Math.cos(svgAngle) * ARROW_LEN;
  const ay = py + Math.sin(svgAngle) * ARROW_LEN;

  const elevTxt = camera.position.y.toFixed(1) + 'm';

  // ── Section box rectangle ──
  // If section is active, derive its XZ rectangle from the slider
  // values (the easiest route — clipPlanes are world-aligned but
  // sliders are the canonical source of truth used by all UI).
  let sectionRect = '';
  if(sectionActive && document.getElementById('slXp')){
    const b = modelBounds;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const xp = +document.getElementById('slXp').value/100;
    const xn = +document.getElementById('slXn').value/100;
    const zp = +document.getElementById('slZp').value/100;
    const zn = +document.getElementById('slZn').value/100;
    const sxn = b.min.x + sx * xn, sxp = b.min.x + sx * xp;
    const szn = b.min.z + sz * zn, szp = b.min.z + sz * zp;
    const [r1x, r1y] = worldToPx(sxn, szn);
    const [r2x, r2y] = worldToPx(sxp, szn);
    const [r3x, r3y] = worldToPx(sxp, szp);
    const [r4x, r4y] = worldToPx(sxn, szp);
    sectionRect = `<polygon points="${r1x.toFixed(1)},${r1y.toFixed(1)} ${r2x.toFixed(1)},${r2y.toFixed(1)} ${r3x.toFixed(1)},${r3y.toFixed(1)} ${r4x.toFixed(1)},${r4y.toFixed(1)}"
      fill="rgba(245,158,11,0.07)" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="6 3"/>`;
  }

  // ── North arrow (top-right corner) ──
  // Read TrueNorth angle from the first loaded model that has it
  let tnAngle = 0; // radians, positive CW from default north
  for(let i=0; i<loadedModels.length; i++){
    if(loadedModels[i]?.spatial?.trueNorthAngle){
      tnAngle = loadedModels[i].spatial.trueNorthAngle;
      break;
    }
  }
  // Apply TrueNorth rotation to the plan camera's up vector so the
  // top-down view is oriented with true north pointing up on screen.
  // In Three.js Y-up, the default plan up is (0,0,-1) → north.
  // With TrueNorth, rotate: up = (-sin(θ), 0, -cos(θ))
  if(planView && planView.camera){
    planView.camera.up.set(-Math.sin(tnAngle), 0, -Math.cos(tnAngle));
    planView.camera.updateProjectionMatrix();
  }
  const tnDeg = tnAngle * 180 / Math.PI; // degrees for SVG rotation
  const NORTH_X = cw - 22, NORTH_Y = 22;
  const northArrow = `
    <g transform="translate(${NORTH_X},${NORTH_Y}) rotate(${(-tnDeg).toFixed(1)})">
      <circle cx="0" cy="0" r="14" fill="white" opacity="0.9" stroke="#374151" stroke-width="0.8"/>
      <polygon points="0,-9 -4,7 0,4 4,7" fill="#dc2626" stroke="white" stroke-width="0.5"/>
      <text x="0" y="-2" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#dc2626" stroke="white" stroke-width="2.5" paint-order="stroke">N</text>
    </g>`;

  // ── Scale bar (bottom-left corner) ──
  // Pick a "nice" length: round to 1, 2, 5, 10, 20, 50, 100… meters
  const targetPx = 80;
  const worldPerPx = fw / cw;
  const targetWorld = targetPx * worldPerPx;
  const niceLengths = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let nice = niceLengths[0];
  for(const n of niceLengths){
    if(n <= targetWorld) nice = n;
  }
  const scalePx = nice / worldPerPx;
  const scaleX = 12, scaleY = ch - 16;
  const scaleBar = `
    <g transform="translate(${scaleX},${scaleY})">
      <rect x="0" y="-2" width="${scalePx.toFixed(1)}" height="4" fill="white" opacity="0.85"/>
      <line x1="0" y1="0" x2="${scalePx.toFixed(1)}" y2="0" stroke="#374151" stroke-width="1.5"/>
      <line x1="0" y1="-3" x2="0" y2="3" stroke="#374151" stroke-width="1.2"/>
      <line x1="${scalePx.toFixed(1)}" y1="-3" x2="${scalePx.toFixed(1)}" y2="3" stroke="#374151" stroke-width="1.2"/>
      <text x="${(scalePx/2).toFixed(1)}" y="-6" text-anchor="middle" font-family="Inter" font-size="10" font-weight="600" fill="#374151" stroke="white" stroke-width="2.5" paint-order="stroke">${nice >= 1 ? nice + ' m' : (nice*1000).toFixed(0) + ' mm'}</text>
    </g>`;

  // ── Compose the full SVG ──
  svg.innerHTML = `
    ${sectionRect}
    <polygon points="${fanPts.join(' ')}"
             fill="${fanFill}" stroke="${fanStroke}" stroke-width="1.2"
             stroke-linejoin="round" stroke-dasharray="${onStorey?'':'4 3'}"/>
    <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}"
          x2="${ctrX.toFixed(1)}" y2="${ctrY.toFixed(1)}"
          stroke="${fanStroke}" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.6"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9"
            fill="white" opacity="0.85"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"
            fill="${eyeFill}" stroke="white" stroke-width="2"/>
    <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}"
          x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}"
          stroke="white" stroke-width="2" stroke-linecap="round"/>
    ${onStorey ? '' :
      `<text x="${(px+11).toFixed(1)}" y="${(py-7).toFixed(1)}"
             fill="${eyeFill}" font-size="10" font-family="Inter"
             font-weight="600" stroke="white" stroke-width="3"
             paint-order="stroke">${elevTxt}</text>`}
    ${northArrow}
    ${scaleBar}
  `;
  document.getElementById('planInfoCam').textContent =
    'cam: ' + camera.position.x.toFixed(1) + ', ' +
              camera.position.y.toFixed(1) + ', ' +
              camera.position.z.toFixed(1) +
              (onStorey ? '' : ' • off storey');
}

function setupPlanInteraction(){
  const panel = document.getElementById('planOverlay');
  const hdr = document.getElementById('planHdr');
  const resize = document.getElementById('planResize');
  const wrap = document.getElementById('planCanvasWrap');

  // ── Drag panel by header ──
  hdr.addEventListener('pointerdown', e=>{
    if(e.target.tagName === 'SELECT') return; // don't drag while opening dropdown
    if(e.target.closest('.plan-hdr-btn')) return; // ignore button clicks
    planDragState = {
      mode: 'move',
      sx: e.clientX, sy: e.clientY,
      l: panel.offsetLeft, t: panel.offsetTop,
      pid: e.pointerId
    };
    hdr.setPointerCapture(e.pointerId);
  });
  hdr.addEventListener('pointermove', e=>{
    if(!planDragState || planDragState.mode !== 'move') return;
    const vp = document.getElementById('vpCanvas').getBoundingClientRect();
    const newL = planDragState.l + (e.clientX - planDragState.sx);
    const newT = planDragState.t + (e.clientY - planDragState.sy);
    panel.style.left  = Math.max(0, Math.min(vp.width  - panel.offsetWidth,  newL)) + 'px';
    panel.style.top   = Math.max(0, Math.min(vp.height - panel.offsetHeight, newT)) + 'px';
    panel.style.right = 'auto';
  });
  hdr.addEventListener('pointerup', ()=>{ planDragState = null; });

  // ── Resize via corner ──
  resize.addEventListener('pointerdown', e=>{
    e.stopPropagation();
    planDragState = {
      mode: 'resize',
      sx: e.clientX, sy: e.clientY,
      w: panel.offsetWidth, h: panel.offsetHeight,
      pid: e.pointerId
    };
    resize.setPointerCapture(e.pointerId);
  });
  resize.addEventListener('pointermove', e=>{
    if(!planDragState || planDragState.mode !== 'resize') return;
    const w = Math.max(220, Math.min(800, planDragState.w + (e.clientX - planDragState.sx)));
    const h = Math.max(180, Math.min(700, planDragState.h + (e.clientY - planDragState.sy)));
    panel.style.width  = w + 'px';
    panel.style.height = h + 'px';
    if(planView) planFit();
  });
  resize.addEventListener('pointerup', ()=>{ planDragState = null; });

  // ── Click on plan ──
  // Plain click   → jump 3D camera to that XZ (keep eye height + angle)
  // Shift+click   → select element under cursor (raycast through plan
  //                  camera, find nearest mesh in scene). Triggers the
  //                  same property-panel + highlight flow as a 3D click.
  wrap.addEventListener('click', e=>{
    if(!planView || planDragState) return;
    if(planView.storey === null) return;
    const rect = planView.canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top)  / rect.height;
    const pcam = planView.camera;
    const fw = pcam.right - pcam.left;
    const fh = pcam.top - pcam.bottom;
    const relX   = u * fw + pcam.left;
    const relZup = (1 - v) * fh + pcam.bottom;
    const wx = pcam.position.x + relX;
    const wz = pcam.position.z - relZup;

    if(e.shiftKey){
      // ── Element selection via raycast through plan camera ──
      // Ortho camera from above — ray points straight down. We restrict
      // candidates to meshes within the current storey's Y range so the
      // user picks the floor they're looking at, not something above/below.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2(u * 2 - 1, -(v * 2 - 1));
      ray.setFromCamera(ndc, pcam);
      const ms = [];
      scene.traverse(ch=>{
        if(ch.isMesh && ch.visible && ch.geometry?.attributes?.position
           && ch.parent?.name !== 'sectionBox' && !ch.userData?.isHandle){
          ms.push(ch);
        }
      });
      const hits = ray.intersectObjects(ms, false);
      // Filter by storey range — only count hits inside the current storey
      const s = planStoreys[planView.storey];
      const yLo = s.elevation - 0.5, yHi = s.topElev + 0.5;
      const validHit = hits.find(h=>{
        if(h.point.y < yLo || h.point.y > yHi) return false;
        // Also respect existing section box if active
        if(sectionActive && clipPlanes.length === 6){
          for(const cp of clipPlanes){
            if(cp.distanceToPoint(h.point) < -0.01) return false;
          }
        }
        return true;
      });
      if(!validHit){
        log('Plan shift-click: no element on this storey at that point');
        return;
      }
      // Find expressID like the 3D pick does
      const hit = validHit;
      const eid = hit.object?.geometry?.attributes?.expressID?.array?.[hit.faceIndex * 3];
      if(eid == null){
        log('Plan shift-click: hit has no expressID');
        return;
      }
      // Determine which model
      let modelIdx = hit.object?.userData?.srcModelIdx ?? -1;
      if(modelIdx < 0){
        // Walk up scene graph to find which loadedModel this belongs to
        let p = hit.object;
        while(p && modelIdx < 0){
          for(let mi=0; mi<loadedModels.length; mi++){
            if(loadedModels[mi] && p === loadedModels[mi]){ modelIdx = mi; break; }
          }
          p = p.parent;
        }
      }
      if(modelIdx < 0){
        log('Plan shift-click: could not determine model index');
        return;
      }
      // Highlight + show props using the existing 3D pick flow
      try{
        clearHighlight();
        if(!window._hlMat){
          window._hlMat = new THREE.MeshPhongMaterial({
            color:0x2563eb, transparent:true, opacity:0.6,
            side:THREE.DoubleSide, depthTest:true, clippingPlanes:clipPlanes
          });
        }
        const mid = loadedModels[modelIdx]?.modelID;
        if(mid !== undefined){
          const sub = ifcLoader.ifcManager.createSubset({
            modelID:mid, ids:[eid], material:window._hlMat,
            scene, removePrevious:true
          });
          if(sub){
            sub.position.copy(loadedModels[modelIdx].position);
            sub.updateMatrixWorld(true);
            window._lastHL = {subset:sub, mid};
          }
        }
        // Fetch + show props (same path as 3D pick uses)
        ifcLoader.ifcManager.getItemProperties(mid, eid, true).then(props=>{
          if(window.showProps) window.showProps(props, modelIdx);
        }).catch(err=>log('Plan props error:', err?.message));
      }catch(err){log('Plan select err:', err?.message)}
      log('Plan: selected element eid=' + eid + ' from model ' + modelIdx);
      planView.dirty = true;
      return;
    }

    // ── Plain click: jump 3D camera ──
    const eyeY = camera.position.y;
    const targetY = controls.target.y;
    const offX = camera.position.x - controls.target.x;
    const offZ = camera.position.z - controls.target.z;
    controls.target.set(wx, targetY, wz);
    camera.position.set(wx + offX, eyeY, wz + offZ);
    controls.update();
    if(planView) planView.dirty = true;
    log('Plan: jumped 3D camera to ' + wx.toFixed(1) + ', ' + wz.toFixed(1));
  });
}

// Tie into model load: rebuild storey list whenever a model finishes loading
const _origReadSpatialThen = null;
// We hook by adding a listener pattern: any code that writes spatial cache
// also calls window.requestPlanRebuild(); existing places already trigger
// after `loadedModels[idx].spatial = ...`.
window.requestPlanRebuild = function(){
  if(document.getElementById('planOverlay')?.classList.contains('show')){
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};


