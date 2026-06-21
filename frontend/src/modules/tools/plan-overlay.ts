// ══════════════════════════════════════════════════════════════════════
// ── 2D Plan Overlay (Option A: top-down ortho mini-renderer) ─────────
// ══════════════════════════════════════════════════════════════════════
import { appState } from '../../state/index.js';
import { log } from '../core/ifc-category.js';

interface PlanStorey {
  name: string;
  elevation: number;
  topElev: number;
  modelIdx: number;
}

interface PlanView {
  renderer: any;
  camera: any;
  canvas: HTMLCanvasElement;
  storey: number | null;
  follow: boolean;
  storeyClip: any[];
  dirty: boolean;
}

interface PlanDragState {
  mode: 'move' | 'resize';
  sx: number;
  sy: number;
  l?: number;
  t?: number;
  w?: number;
  h?: number;
  pid?: number;
}

let planView: PlanView | null = null;
let planStoreys: PlanStorey[] = [];
let planDragState: PlanDragState | null = null;

declare const THREE: any;
declare const FED_LABELS: string[];

// Forward declarations to satisfy TypeScript's linear scoping
declare function planSelectStorey(idx: number | string): void;
declare function planFit(): void;
declare function requestPlanRender(): void;

window.togglePlanOverlay = function(): void {
  const panel = document.getElementById('planOverlay') as HTMLElement;
  const btn = document.getElementById('btnPlan') as HTMLElement;
  const showing = panel.classList.contains('show');
  if (showing) {
    panel.classList.remove('show');
    btn.classList.remove('active');
    if (planView) planView.dirty = false;
  } else {
    panel.classList.add('show');
    btn.classList.add('active');
    if (!planView) initPlanView();
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};

function rebuildPlanStoreyList(): void {
  planStoreys = [];
  const multiModel = appState.loadedModels.filter((m: any) => m?.spatial?.storeys?.length).length > 1;
  for (let mi = 0; mi < appState.loadedModels.length; mi++) {
    const m = appState.loadedModels[mi];
    if (!m || !m.spatial || !m.spatial.storeys) continue;
    const arr = m.spatial.storeys;
    const slotLabel = mi === 0 ? 'A' : mi === 1 ? 'B' : FED_LABELS[(mi - 2) % FED_LABELS.length];
    for (let i = 0; i < arr.length; i++) {
      const next = arr[i + 1];
      const top = next ? next.elevation : (arr[i].elevation + 3.5);
      planStoreys.push({
        name: arr[i].name + (multiModel ? ' (' + slotLabel + ')' : ''),
        elevation: arr[i].elevation,
        topElev: top,
        modelIdx: mi
      });
    }
  }
  const seen = new Set<string>();
  planStoreys = planStoreys.filter(s => {
    const k = s.name.replace(/ \([AB]\)$/, '') + '@' + s.elevation.toFixed(2);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  planStoreys.sort((a, b) => a.elevation - b.elevation);

  const sel = document.getElementById('planStoreySelect') as HTMLSelectElement;
  if (planStoreys.length === 0) {
    sel.innerHTML = '<option value="">— No storeys found —</option>';
    (document.getElementById('planEmpty') as HTMLElement).style.display = 'flex';
    return;
  }
  (document.getElementById('planEmpty') as HTMLElement).style.display = 'none';
  sel.innerHTML = planStoreys.map((s, i) => {
    const elevStr = s.elevation >= 0 ? '+' + s.elevation.toFixed(2) + 'm' : s.elevation.toFixed(2) + 'm';
    return `<option value="${i}">${s.name} (${elevStr})</option>`;
  }).join('');
  if (planView && planView.storey === null) {
    const camY = appState.camera.position.y;
    let bestI = 0, bestD = Infinity;
    planStoreys.forEach((s, i) => {
      const d = Math.abs((s.elevation + s.topElev) / 2 - camY);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    sel.value = String(bestI);
    planSelectStorey(bestI);
  }
}

function initPlanView(): void {
  if (planView) return;
  const canvas = document.getElementById('planCanvas') as HTMLCanvasElement;
  const planRenderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, preserveDrawingBuffer: true
  });
  planRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  planRenderer.localClippingEnabled = true;

  const planCam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 5000);
  planCam.position.set(0, 1000, 0);
  planCam.up.set(0, 0, -1);
  planCam.lookAt(0, 0, 0);

  const storeyClip = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
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

  setupPlanInteraction();
  setupPlanRenderHook();
}

window.planSelectStorey = function(idxStr: number | string): void {
  if (!planView || planStoreys.length === 0) return;
  const idx = +idxStr;
  if (idx < 0 || idx >= planStoreys.length) return;
  planView.storey = idx;
  const s = planStoreys[idx];
  planView.storeyClip[0].constant = -(s.elevation - 0.1);
  planView.storeyClip[1].constant = (s.topElev + 0.1);
  (document.getElementById('planInfoStorey') as HTMLElement).textContent =
    s.name + ' [' + s.elevation.toFixed(2) + ' → ' + s.topElev.toFixed(2) + 'm]';
  planFit();
  requestPlanRender();
};

window.planFit = function(): void {
  if (!planView) return;
  const b = appState.modelBounds;
  if (!b || !b.min || !b.max) return;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const sx = (b.max.x - b.min.x);
  const sz = (b.max.z - b.min.z);
  const w = planView.canvas.clientWidth || 320;
  const h = planView.canvas.clientHeight || 240;
  const canvasAspect = w / h;
  const modelAspect = sx / sz;
  let halfW: number, halfH: number;
  if (modelAspect > canvasAspect) {
    halfW = sx * 0.55;
    halfH = halfW / canvasAspect;
  } else {
    halfH = sz * 0.55;
    halfW = halfH * canvasAspect;
  }
  const cam = planView.camera;
  cam.left = -halfW; cam.right = halfW;
  cam.top = halfH; cam.bottom = -halfH;
  cam.position.set(cx, b.max.y + 100, cz);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();
  planView.renderer.setSize(w, h, false);
  requestPlanRender();
};

window.planToggleFollow = function(): void {
  if (!planView) return;
  planView.follow = !planView.follow;
  (document.getElementById('planFollowBtn') as HTMLElement).classList.toggle('active', planView.follow);
};

function setupPlanRenderHook(): void {
  const fn = (window as any)._renderPlan = function(): void {
    if (!planView) return;
    const panel = document.getElementById('planOverlay') as HTMLElement;
    if (!panel.classList.contains('show')) return;
    if (planView.storey === null) return;

    const w = planView.canvas.clientWidth, h = planView.canvas.clientHeight;
    if (w > 0 && h > 0) {
      const drawSize = planView.renderer.getSize(new THREE.Vector2());
      if (Math.abs(drawSize.x - w) > 1 || Math.abs(drawSize.y - h) > 1) {
        planFit();
        planView.dirty = true;
      }
    }

    if (planView.dirty) {
      const combined = appState.clipPlanes.concat(planView.storeyClip);
      planView.renderer.clippingPlanes = combined;
      planView.renderer.render(appState.scene, planView.camera);
      planView.dirty = false;
    }

    drawPlanCameraMarker();
  };

  if (appState.controls && appState.controls.addEventListener) {
    appState.controls.addEventListener('change', () => {
      if (planView) planView.dirty = true;
      if (planView && planView.follow) drawPlanCameraMarker();
    });
  }

  function planLoop(): void {
    requestAnimationFrame(planLoop);
    fn();
  }
  planLoop();
}

window.requestPlanRender = function(): void {
  if (planView) planView.dirty = true;
};

function drawPlanCameraMarker(): void {
  if (!planView) return;
  const svg = document.getElementById('planMarkerSvg') as unknown as SVGElement | null;
  if (!svg) return;
  const pcam = planView.camera;
  const fw = pcam.right - pcam.left;
  const fh = pcam.top - pcam.bottom;
  if (fw <= 0 || fh <= 0) return;
  const cw = planView.canvas.clientWidth || 1;
  const ch = planView.canvas.clientHeight || 1;

  if (svg.getAttribute('viewBox') !== `0 0 ${cw} ${ch}`) {
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  }

  const worldToPx = (wx: number, wz: number): [number, number] => {
    const relX = wx - pcam.position.x;
    const relZup = pcam.position.z - wz;
    const u = (relX - pcam.left) / fw;
    const v = 1 - (relZup - pcam.bottom) / fh;
    return [u * cw, v * ch];
  };

  const wx = appState.camera.position.x, wz = appState.camera.position.z;
  const [px, py] = worldToPx(wx, wz);

  const vFovRad = (appState.camera.fov || 50) * Math.PI / 180;
  const renderEl = appState.renderer.domElement;
  const aspect = renderEl ? (renderEl.clientWidth / Math.max(1, renderEl.clientHeight)) : 1.6;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
  const halfH = hFovRad / 2;

  const dx = appState.controls.target.x - appState.camera.position.x;
  const dz = appState.controls.target.z - appState.camera.position.z;
  const dirLen = Math.hypot(dx, dz) || 1;
  const dxn = dx / dirLen, dzn = dz / dirLen;
  const headingWorld = Math.atan2(dzn, dxn);

  const planReachMax = Math.min(fw, fh) * 0.45;
  const planReachMin = Math.min(fw, fh) * 0.12;
  const camToTargetDist = Math.hypot(dx, dz);
  const reachWorld = Math.max(planReachMin, Math.min(planReachMax, camToTargetDist));

  const edge1Ang = headingWorld - halfH;
  const edge2Ang = headingWorld + halfH;

  const fanPts: string[] = [`${px.toFixed(1)},${py.toFixed(1)}`];
  const STEPS = 12;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const ang = edge1Ang + (edge2Ang - edge1Ang) * t;
    const fwx = wx + Math.cos(ang) * reachWorld;
    const fwz = wz + Math.sin(ang) * reachWorld;
    const [fx, fy] = worldToPx(fwx, fwz);
    fanPts.push(`${fx.toFixed(1)},${fy.toFixed(1)}`);
  }

  const ctrWx = wx + dxn * reachWorld;
  const ctrWz = wz + dzn * reachWorld;
  const [ctrX, ctrY] = worldToPx(ctrWx, ctrWz);
  const svgAngle = Math.atan2(ctrY - py, ctrX - px);

  const storey = planStoreys[planView.storey as number];
  let onStorey = true;
  if (storey) {
    const camY = appState.camera.position.y;
    onStorey = (camY >= storey.elevation - 0.5) && (camY <= storey.topElev + 0.5);
  }
  const fanFill   = onStorey ? 'rgba(37,99,235,0.18)' : 'rgba(120,120,120,0.10)';
  const fanStroke = onStorey ? '#2563eb' : '#9ca3af';
  const eyeFill   = onStorey ? '#2563eb' : '#6b7280';

  const ARROW_LEN = 5;
  const ax = px + Math.cos(svgAngle) * ARROW_LEN;
  const ay = py + Math.sin(svgAngle) * ARROW_LEN;

  const elevTxt = appState.camera.position.y.toFixed(1) + 'm';

  let sectionRect = '';
  if (appState.sectionActive && document.getElementById('slXp')) {
    const b = appState.modelBounds;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const xp = +(document.getElementById('slXp') as HTMLInputElement).value / 100;
    const xn = +(document.getElementById('slXn') as HTMLInputElement).value / 100;
    const zp = +(document.getElementById('slZp') as HTMLInputElement).value / 100;
    const zn = +(document.getElementById('slZn') as HTMLInputElement).value / 100;
    const sxn = b.min.x + sx * xn, sxp = b.min.x + sx * xp;
    const szn = b.min.z + sz * zn, szp = b.min.z + sz * zp;
    const [r1x, r1y] = worldToPx(sxn, szn);
    const [r2x, r2y] = worldToPx(sxp, szn);
    const [r3x, r3y] = worldToPx(sxp, szp);
    const [r4x, r4y] = worldToPx(sxn, szp);
    sectionRect = `<polygon points="${r1x.toFixed(1)},${r1y.toFixed(1)} ${r2x.toFixed(1)},${r2y.toFixed(1)} ${r3x.toFixed(1)},${r3y.toFixed(1)} ${r4x.toFixed(1)},${r4y.toFixed(1)}"
      fill="rgba(245,158,11,0.07)" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="6 3"/>`;
  }

  let tnAngle = 0;
  for (let i = 0; i < appState.loadedModels.length; i++) {
    if (appState.loadedModels[i]?.spatial?.trueNorthAngle) {
      tnAngle = appState.loadedModels[i].spatial.trueNorthAngle;
      break;
    }
  }
  if (planView && planView.camera) {
    planView.camera.up.set(-Math.sin(tnAngle), 0, -Math.cos(tnAngle));
    planView.camera.updateProjectionMatrix();
  }
  const tnDeg = tnAngle * 180 / Math.PI;
  const NORTH_X = cw - 22, NORTH_Y = 22;
  const northArrow = `
    <g transform="translate(${NORTH_X},${NORTH_Y}) rotate(${(-tnDeg).toFixed(1)})">
      <circle cx="0" cy="0" r="14" fill="white" opacity="0.9" stroke="#374151" stroke-width="0.8"/>
      <polygon points="0,-9 -4,7 0,4 4,7" fill="#dc2626" stroke="white" stroke-width="0.5"/>
      <text x="0" y="-2" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#dc2626" stroke="white" stroke-width="2.5" paint-order="stroke">N</text>
    </g>`;

  const targetPx = 80;
  const worldPerPx = fw / cw;
  const targetWorld = targetPx * worldPerPx;
  const niceLengths = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let nice = niceLengths[0];
  for (const n of niceLengths) {
    if (n <= targetWorld) nice = n;
  }
  const scalePx = nice / worldPerPx;
  const scaleX = 12, scaleY = ch - 16;
  const scaleBar = `
    <g transform="translate(${scaleX},${scaleY})">
      <rect x="0" y="-2" width="${scalePx.toFixed(1)}" height="4" fill="white" opacity="0.85"/>
      <line x1="0" y1="0" x2="${scalePx.toFixed(1)}" y2="0" stroke="#374151" stroke-width="1.5"/>
      <line x1="0" y1="-3" x2="0" y2="3" stroke="#374151" stroke-width="1.2"/>
      <line x1="${scalePx.toFixed(1)}" y1="-3" x2="${scalePx.toFixed(1)}" y2="3" stroke="#374151" stroke-width="1.2"/>
      <text x="${(scalePx / 2).toFixed(1)}" y="-6" text-anchor="middle" font-family="Inter" font-size="10" font-weight="600" fill="#374151" stroke="white" stroke-width="2.5" paint-order="stroke">${nice >= 1 ? nice + ' m' : (nice * 1000).toFixed(0) + ' mm'}</text>
    </g>`;

  svg.innerHTML = `
    ${sectionRect}
    <polygon points="${fanPts.join(' ')}"
             fill="${fanFill}" stroke="${fanStroke}" stroke-width="1.2"
             stroke-linejoin="round" stroke-dasharray="${onStorey ? '' : '4 3'}"/>
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
      `<text x="${(px + 11).toFixed(1)}" y="${(py - 7).toFixed(1)}"
             fill="${eyeFill}" font-size="10" font-family="Inter"
             font-weight="600" stroke="white" stroke-width="3"
             paint-order="stroke">${elevTxt}</text>`}
    ${northArrow}
    ${scaleBar}
  `;
  (document.getElementById('planInfoCam') as HTMLElement).textContent =
    'cam: ' + appState.camera.position.x.toFixed(1) + ', ' +
    appState.camera.position.y.toFixed(1) + ', ' +
    appState.camera.position.z.toFixed(1) +
    (onStorey ? '' : ' • off storey');
}

function setupPlanInteraction(): void {
  const panel = document.getElementById('planOverlay') as HTMLElement;
  const hdr = document.getElementById('planHdr') as HTMLElement;
  const resize = document.getElementById('planResize') as HTMLElement;
  const wrap = document.getElementById('planCanvasWrap') as HTMLElement;

  hdr.addEventListener('pointerdown', (e: PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    if ((e.target as HTMLElement).closest('.plan-hdr-btn')) return;
    planDragState = {
      mode: 'move',
      sx: e.clientX, sy: e.clientY,
      l: panel.offsetLeft, t: panel.offsetTop,
      pid: e.pointerId
    };
    hdr.setPointerCapture(e.pointerId);
  });
  hdr.addEventListener('pointermove', (e: PointerEvent) => {
    if (!planDragState || planDragState.mode !== 'move') return;
    const vp = (document.getElementById('vpCanvas') as HTMLElement).getBoundingClientRect();
    const newL = planDragState.l! + (e.clientX - planDragState.sx);
    const newT = planDragState.t! + (e.clientY - planDragState.sy);
    panel.style.left  = Math.max(0, Math.min(vp.width  - panel.offsetWidth,  newL)) + 'px';
    panel.style.top   = Math.max(0, Math.min(vp.height - panel.offsetHeight, newT)) + 'px';
    panel.style.right = 'auto';
  });
  hdr.addEventListener('pointerup', () => { planDragState = null; });

  resize.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    planDragState = {
      mode: 'resize',
      sx: e.clientX, sy: e.clientY,
      w: panel.offsetWidth, h: panel.offsetHeight,
      pid: e.pointerId
    };
    resize.setPointerCapture(e.pointerId);
  });
  resize.addEventListener('pointermove', (e: PointerEvent) => {
    if (!planDragState || planDragState.mode !== 'resize') return;
    const w = Math.max(220, Math.min(800, planDragState.w! + (e.clientX - planDragState.sx)));
    const h = Math.max(180, Math.min(700, planDragState.h! + (e.clientY - planDragState.sy)));
    panel.style.width  = w + 'px';
    panel.style.height = h + 'px';
    if (planView) planFit();
  });
  resize.addEventListener('pointerup', () => { planDragState = null; });

  wrap.addEventListener('click', (e: MouseEvent) => {
    if (!planView || planDragState) return;
    if (planView.storey === null) return;
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

    if (e.shiftKey) {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2(u * 2 - 1, -(v * 2 - 1));
      ray.setFromCamera(ndc, pcam);
      const ms: any[] = [];
      appState.scene.traverse((ch: any) => {
        if (ch.isMesh && ch.visible && ch.geometry?.attributes?.position
           && ch.parent?.name !== 'sectionBox' && !ch.userData?.isHandle) {
          ms.push(ch);
        }
      });
      const hits = ray.intersectObjects(ms, false);
      const s = planStoreys[planView.storey as number];
      const yLo = s.elevation - 0.5, yHi = s.topElev + 0.5;
      const validHit = hits.find((h: any) => {
        if (h.point.y < yLo || h.point.y > yHi) return false;
        if (appState.sectionActive && appState.clipPlanes.length === 6) {
          for (const cp of appState.clipPlanes) {
            if (cp.distanceToPoint(h.point) < -0.01) return false;
          }
        }
        return true;
      });
      if (!validHit) {
        log('Plan shift-click: no element on this storey at that point');
        return;
      }
      const hit = validHit;
      const eid = hit.object?.geometry?.attributes?.expressID?.array?.[hit.faceIndex * 3];
      if (eid == null) {
        log('Plan shift-click: hit has no expressID');
        return;
      }
      let modelIdx = hit.object?.userData?.srcModelIdx ?? -1;
      if (modelIdx < 0) {
        let p = hit.object;
        while (p && modelIdx < 0) {
          for (let mi = 0; mi < appState.loadedModels.length; mi++) {
            if (appState.loadedModels[mi] && p === appState.loadedModels[mi]) { modelIdx = mi; break; }
          }
          p = p.parent;
        }
      }
      if (modelIdx < 0) {
        log('Plan shift-click: could not determine model index');
        return;
      }
      try {
        (window as any).clearHighlight();
        if (!(window as any)._hlMat) {
          (window as any)._hlMat = new THREE.MeshPhongMaterial({
            color: 0x2563eb, transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, depthTest: true, clippingPlanes: appState.clipPlanes
          });
        }
        const mid = appState.loadedModels[modelIdx]?.modelID;
        if (mid !== undefined) {
          const sub = appState.ifcLoader.ifcManager.createSubset({
            modelID: mid, ids: [eid], material: (window as any)._hlMat,
            scene: appState.scene, removePrevious: true
          });
          if (sub) {
            sub.position.copy(appState.loadedModels[modelIdx].position);
            sub.updateMatrixWorld(true);
            (window as any)._lastHL = { subset: sub, mid };
          }
        }
        appState.ifcLoader.ifcManager.getItemProperties(mid, eid, true).then((props: any) => {
          if ((window as any).showProps) (window as any).showProps(props, modelIdx);
        }).catch((err: any) => log('Plan props error:', err?.message));
      } catch (err: any) { log('Plan select err:', err?.message); }
      log('Plan: selected element eid=' + eid + ' from model ' + modelIdx);
      planView.dirty = true;
      return;
    }

    const eyeY = appState.camera.position.y;
    const targetY = appState.controls.target.y;
    const offX = appState.camera.position.x - appState.controls.target.x;
    const offZ = appState.camera.position.z - appState.controls.target.z;
    appState.controls.target.set(wx, targetY, wz);
    appState.camera.position.set(wx + offX, eyeY, wz + offZ);
    appState.controls.update();
    if (planView) planView.dirty = true;
    log('Plan: jumped 3D camera to ' + wx.toFixed(1) + ', ' + wz.toFixed(1));
  });
}

const _origReadSpatialThen = null;

window.requestPlanRebuild = function(): void {
  if (document.getElementById('planOverlay')?.classList.contains('show')) {
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};
