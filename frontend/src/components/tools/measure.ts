import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { polygonArea3D, angleAt, type Pt } from '../../lib/measure-math.js';
import { formatLengthMm, formatAreaM2, getUnitPref, cycleUnitPref, worldToMm } from '../../lib/units.js';

// ── Module-level measure state ──
// measureMode + measurePoints live on window so viewer-core's pick handler and
// the floating-toolbar buttons share one source of truth. measurePoints is
// mutated in place (never reassigned) so the window reference stays valid.
let measureType: string = 'distance';
const measurePoints: THREE.Vector3[] = [];
let measureMarkers: THREE.Object3D[] = [];
let measureLine: THREE.Line | null = null;
let measureLabel: THREE.Sprite | null = null;
(window as any).measureMode = false;
(window as any).measurePoints = measurePoints;

// Area mode accumulates points across many clicks (unlike distance/angle's
// fixed count), so it needs an explicit "start a new polygon" flag instead
// of an auto-clear-at-N-points rule.
let areaOutline: THREE.Line | null = null;
let areaFill: THREE.Mesh | null = null;
let areaLabel: THREE.Sprite | null = null;
let areaFinished = false;

function mm(v: number): number {
  return worldToMm(v, appState.loadedModels);
}

function fmtLen(v: number): string {
  return formatLengthMm(mm(v), getUnitPref());
}

// Remove one tracked marker from both the scene and measureMarkers (used to
// redraw a live in-progress shape — e.g. area's outline — without touching
// the other markers like the per-vertex spheres, which addMeasurePoint
// already tracks separately and must persist across redraws).
function removeMarker(obj: THREE.Object3D | null): void {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  const idx = measureMarkers.indexOf(obj);
  if (idx >= 0) measureMarkers.splice(idx, 1);
}

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true }));
  sprite.renderOrder = 1000;
  return sprite;
}

function centroid(pts: THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  return c.multiplyScalar(1 / pts.length);
}

// ── Area mode: click any number of points, Enter finishes the polygon ──
function handleAreaPoint(): void {
  removeMarker(areaOutline); areaOutline = null;
  removeMarker(areaFill); areaFill = null;
  removeMarker(areaLabel); areaLabel = null;

  const pts = measurePoints;
  if (pts.length < 2) {
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click at least 3 points to outline an area';
    return;
  }

  const loopPts = [...pts, pts[0]];
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(loopPts);
  areaOutline = new THREE.Line(outlineGeo, new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false }));
  areaOutline.renderOrder = 999;
  appState.scene.add(areaOutline);
  measureMarkers.push(areaOutline);

  if (pts.length >= 3) {
    const positions: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) {
      positions.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fillGeo.computeVertexNormals();
    areaFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthTest: false }));
    areaFill.renderOrder = 998;
    appState.scene.add(areaFill);
    measureMarkers.push(areaFill);

    const rawArea = polygonArea3D(pts as unknown as Pt[]);
    const factorM = mm(1) / 1000; // world-units -> metres, per-axis
    const areaM2 = rawArea * factorM * factorM;
    const areaText = formatAreaM2(areaM2, getUnitPref());

    areaLabel = makeLabelSprite(areaText, 'rgba(37,99,235,0.9)');
    const c = centroid(pts);
    areaLabel.position.copy(c).add(new THREE.Vector3(0, 0.3, 0));
    areaLabel.scale.set(2, 0.5, 1);
    appState.scene.add(areaLabel);
    measureMarkers.push(areaLabel);

    (document.getElementById('measureText') as HTMLElement).textContent =
      `▱ ${areaText} (${pts.length} pts) | Enter to finish, keep clicking to add points`;
    log('Measure area: ' + areaText);
  }
}

(window as any).finishAreaMeasure = function (): void {
  if (measureType !== 'area' || measurePoints.length < 3 || areaFinished) return;
  areaFinished = true;
  (document.getElementById('measureText') as HTMLElement).textContent += ' — finished, click to start a new area';
};

// ── Angle mode: exactly 3 clicks — A, vertex B, C ──
let angleLineA: THREE.Line | null = null;
let angleLineB: THREE.Line | null = null;
let angleLabel: THREE.Sprite | null = null;

function handleAnglePoint(): void {
  removeMarker(angleLineA); angleLineA = null;
  removeMarker(angleLineB); angleLineB = null;
  removeMarker(angleLabel); angleLabel = null;

  const pts = measurePoints;
  if (pts.length === 1) {
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click the vertex (2nd point)';
    return;
  }

  const [a, vertex, c] = pts;
  const lineAGeo = new THREE.BufferGeometry().setFromPoints([vertex, a]);
  angleLineA = new THREE.Line(lineAGeo, new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false }));
  angleLineA.renderOrder = 999;
  appState.scene.add(angleLineA);
  measureMarkers.push(angleLineA);

  if (pts.length === 2) {
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click the second point (C)';
    return;
  }

  const lineBGeo = new THREE.BufferGeometry().setFromPoints([vertex, c]);
  angleLineB = new THREE.Line(lineBGeo, new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false }));
  angleLineB.renderOrder = 999;
  appState.scene.add(angleLineB);
  measureMarkers.push(angleLineB);

  const deg = angleAt(a as unknown as Pt, vertex as unknown as Pt, c as unknown as Pt);
  const degText = deg.toFixed(1) + '°';
  angleLabel = makeLabelSprite(degText, 'rgba(37,99,235,0.9)');
  angleLabel.position.copy(vertex).add(new THREE.Vector3(0, 0.3, 0));
  angleLabel.scale.set(1.4, 0.35, 1);
  appState.scene.add(angleLabel);
  measureMarkers.push(angleLabel);

  (document.getElementById('measureText') as HTMLElement).textContent = `∠ ${degText} | Click to start a new angle`;
  log('Measure angle: ' + degText);
}

// Decides whether a newly-clicked point should start a fresh measurement
// (clearing the previous one first) or extend the current one. Centralized
// here (rather than in viewer-core's pick handler) since only this module
// knows the per-mode point-count rules.
(window as any).measureShouldAutoClear = function (): boolean {
  if (measureType === 'distance') return measurePoints.length >= 2;
  if (measureType === 'angle') return measurePoints.length >= 3;
  if (measureType === 'area') return areaFinished;
  return false; // 'level' self-resets its own point list every click
};

// ── Level mode: single click = show elevation ──
function handleMeasurePoint(point: THREE.Vector3): void {
  if (measureType === 'area') { handleAreaPoint(); return; }
  if (measureType === 'angle') { handleAnglePoint(); return; }

  if (measureType === 'level') {
    const el = point.y;
    const elStr = fmtLen(el);

    // Draw vertical line from point down to Y=0
    const vPts = [point.clone(), new THREE.Vector3(point.x, 0, point.z)];
    const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
    const vMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.3, gapSize: 0.15, depthTest: false });
    const vLine = new THREE.Line(vGeo, vMat);
    vLine.computeLineDistances();
    vLine.renderOrder = 999;
    appState.scene.add(vLine);
    measureMarkers.push(vLine);

    // Draw horizontal reference line at Y=0
    const refLen = 2;
    const hPts = [new THREE.Vector3(point.x - refLen, 0, point.z), new THREE.Vector3(point.x + refLen, 0, point.z)];
    const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
    const hMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: false });
    const hLine = new THREE.Line(hGeo, hMat);
    hLine.renderOrder = 999;
    appState.scene.add(hLine);
    measureMarkers.push(hLine);

    // Draw horizontal line at point elevation
    const ePts = [new THREE.Vector3(point.x - refLen, el, point.z), new THREE.Vector3(point.x + refLen, el, point.z)];
    const eGeo = new THREE.BufferGeometry().setFromPoints(ePts);
    const eMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false });
    const eLine = new THREE.Line(eGeo, eMat);
    eLine.renderOrder = 999;
    appState.scene.add(eLine);
    measureMarkers.push(eLine);

    // 3D label
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(245,158,11,0.9)';
    ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EL ' + elStr, 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.set(point.x + 1.5, el, point.z);
    measureLabel.scale.set(2, 0.5, 1);
    measureLabel.renderOrder = 1000;
    appState.scene.add(measureLabel);
    measureMarkers.push(measureLabel); // Track for cleanup

    (document.getElementById('measureText') as HTMLElement).textContent = `📐 EL ${elStr} | Click another point or Clear`;

    // Allow clicking more points without clearing
    measurePoints.length = 0;
    return;
  }

  // ── Distance mode: 2 points ──
  if (measurePoints.length === 1) {
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click second point';
  }

  if (measurePoints.length === 2) {
    const p1 = measurePoints[0], p2 = measurePoints[1];

    // Draw line between points
    const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 2, depthTest: false });
    measureLine = new THREE.Line(lineGeo, lineMat);
    measureLine.renderOrder = 999;
    appState.scene.add(measureLine);
    measureMarkers.push(measureLine);

    // Draw vertical dashed line for elevation difference
    if (Math.abs(p1.y - p2.y) > 0.01) {
      const vPts = [p2.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
      const vMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const vLine = new THREE.Line(vGeo, vMat);
      vLine.computeLineDistances();
      vLine.renderOrder = 999;
      appState.scene.add(vLine);
      measureMarkers.push(vLine);

      const hPts = [p1.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
      const hMat = new THREE.LineDashedMaterial({ color: 0x16a34a, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const hLine = new THREE.Line(hGeo, hMat);
      hLine.computeLineDistances();
      hLine.renderOrder = 999;
      appState.scene.add(hLine);
      measureMarkers.push(hLine);
    }

    // Calculate distances
    const dist = p1.distanceTo(p2);
    const dy = Math.abs(p2.y - p1.y);
    const hDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
    const distStr = fmtLen(dist);

    (document.getElementById('measureText') as HTMLElement).textContent = `📏 ${distStr} | ↕ΔEL ${fmtLen(dy)} | ↔ ${fmtLen(hDist)}`;

    // 3D label at midpoint
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(37,99,235,0.9)';
    ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(distStr, 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.copy(mid).add(new THREE.Vector3(0, 0.3, 0));
    measureLabel.scale.set(dist * 0.3 + 0.8, dist * 0.075 + 0.2, 1);
    measureLabel.renderOrder = 1000;
    appState.scene.add(measureLabel);
    measureMarkers.push(measureLabel); // Track for cleanup

    log('Measure: ' + dist.toFixed(3) + 'm');
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

// ══ Measure tool wiring (toolbar buttons + viewer-core pick handler) ══
// Ported from the deployed standalone (src/app/10-properties.ts) so the
// floating-toolbar Measure button, the Distance/Level mode buttons, Clear, and
// the 3D-pick → addMeasurePoint flow all work in the Vite build.
const MEASURE_MODE_BTNS: { type: string; id: string; placeholder: string }[] = [
  { type: 'distance', id: 'modeDistance', placeholder: 'Click first point' },
  { type: 'level', id: 'modeLevel', placeholder: 'Click a point to read elevation' },
  { type: 'area', id: 'modeArea', placeholder: 'Click points to outline an area' },
  { type: 'angle', id: 'modeAngle', placeholder: 'Click the first point' },
];

(window as any).setMeasureMode = function (type: string): void {
  measureType = type;
  (window as any).clearMeasure();
  let placeholder = 'Click first point';
  for (const b of MEASURE_MODE_BTNS) {
    const btn = document.getElementById(b.id);
    if (!btn) continue;
    const active = b.type === type;
    btn.style.borderColor = active ? 'var(--blue)' : 'var(--border)';
    btn.style.background = active ? 'var(--blue-lt)' : 'var(--bg-card)';
    btn.style.color = active ? 'var(--blue)' : 'var(--text-dim)';
    btn.style.fontWeight = active ? '600' : '400';
    if (active) placeholder = b.placeholder;
  }
  (document.getElementById('measureText') as HTMLElement).textContent = placeholder;
};

(window as any).toggleMeasure = function (): void {
  const on = !(window as any).measureMode;
  (window as any).measureMode = on;
  document.getElementById('btnMeasure')?.classList.toggle('active', on);
  const info = document.getElementById('measureInfo');
  if (info) info.style.display = on ? 'flex' : 'none';
  if (!on) {
    (window as any).clearMeasure();
  } else {
    (window as any).setMeasureMode(measureType);
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
};

(window as any).clearMeasure = function (): void {
  measurePoints.length = 0;
  measureMarkers.forEach(m => { if (m.parent) m.parent.remove(m); });
  measureMarkers = [];
  if (measureLine) { if (measureLine.parent) measureLine.parent.remove(measureLine); measureLine = null; }
  if (measureLabel) { if (measureLabel.parent) measureLabel.parent.remove(measureLabel); measureLabel = null; }
  areaOutline = null; areaFill = null; areaLabel = null; areaFinished = false;
  angleLineA = null; angleLineB = null; angleLabel = null;
  const on = (window as any).measureMode;
  appState.renderer.domElement.style.cursor = on ? 'crosshair' : '';
  if (on) {
    const mode = MEASURE_MODE_BTNS.find(b => b.type === measureType);
    (document.getElementById('measureText') as HTMLElement).textContent = mode?.placeholder || 'Click first point';
  }
};

// Enter finishes the current area polygon (the only mode that needs an
// explicit "done" signal — distance/angle have a fixed point count and
// level self-resets every click).
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!(window as any).measureMode || measureType !== 'area') return;
  if (e.key === 'Enter') { (window as any).finishAreaMeasure(); e.preventDefault(); }
});

// ── Unit preference chip (cycles mm -> m -> ft-in) ──────────────────────
function updateMeasureUnitBtn(): void {
  const btn = document.getElementById('measureUnitBtn');
  if (btn) btn.textContent = getUnitPref() === 'ftin' ? 'ft' : getUnitPref();
}
(window as any).cycleUnitPref = function (): void {
  cycleUnitPref();
};
window.addEventListener('ifc:unitschange', () => {
  updateMeasureUnitBtn();
  // Existing labels were baked as canvas text in the old unit — simplest
  // correct fix is to drop the in-progress measurement rather than try to
  // re-render every marker type in place.
  if ((window as any).measureMode) (window as any).clearMeasure();
});
updateMeasureUnitBtn();

// Called by viewer-core's pick handler with the clicked world point.
(window as any).addMeasurePoint = function (point: THREE.Vector3): void {
  const geo = new THREE.SphereGeometry(0.08, 12, 12);
  const color = measureType === 'level' ? 0xf59e0b : 0x2563eb;
  const sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false }));
  sphere.position.copy(point);
  sphere.renderOrder = 999;
  appState.scene.add(sphere);
  measureMarkers.push(sphere);
  measurePoints.push(point.clone());
  handleMeasurePoint(point);
};

// ══ Global Opacity ══
window.setGlobalOpacity = function (val: number): void {
  const op = val / 100;
  (document.getElementById('opVal') as HTMLElement).textContent = val + '%';
  appState.scene.traverse((c: any) => {
    if (!c.isMesh || c.parent?.name === 'sectionBox' || c.userData?.isHandle) return;
    if (c.type === 'GridHelper' || c.type === 'AxesHelper') return;
    const ms: any[] = Array.isArray(c.material) ? c.material : [c.material];
    ms.forEach((m: any) => {
      if (!m._origOpacity) m._origOpacity = m.opacity;
      m.opacity = m._origOpacity * op;
      m.transparent = m.opacity < 0.99;
      m.needsUpdate = true;
    });
  });
};

// NOTE: this module used to carry a near-identical copy of the whole
// category-filter / compare-tab / issues UI block that compare.ts owns
// (setFilter, switchTab, buildIssues, applyCatVis, …). Because measure.ts
// loads after compare.ts, its copies silently won the window.* assignments
// and the two versions drifted. The block now lives ONLY in compare.ts —
// don't re-add compare UI handlers here.

export { handleMeasurePoint };
