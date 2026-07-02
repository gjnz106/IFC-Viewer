import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

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

// ── Level mode: single click = show elevation ──
function handleMeasurePoint(point: THREE.Vector3): void {
  if (measureType === 'level') {
    const el = point.y;
    const elMM = (el * 1000).toFixed(0);

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
    ctx.fillText('EL ' + el.toFixed(3) + 'm', 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.set(point.x + 1.5, el, point.z);
    measureLabel.scale.set(2, 0.5, 1);
    measureLabel.renderOrder = 1000;
    appState.scene.add(measureLabel);
    measureMarkers.push(measureLabel); // Track for cleanup

    (document.getElementById('measureText') as HTMLElement).textContent = `📐 EL ${el.toFixed(3)}m (${elMM}mm) | Click another point or Clear`;

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

    (document.getElementById('measureText') as HTMLElement).textContent = `📏 ${dist.toFixed(3)}m | ↕ΔEL ${dy.toFixed(3)}m | ↔ ${hDist.toFixed(3)}m`;

    // 3D label at midpoint
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(37,99,235,0.9)';
    ctx.beginPath(); (ctx as any).roundRect(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(dist.toFixed(3) + ' m', 128, 42);
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
(window as any).setMeasureMode = function (type: string): void {
  measureType = type;
  (window as any).clearMeasure();
  const dBtn = document.getElementById('modeDistance');
  const lBtn = document.getElementById('modeLevel');
  if (!dBtn || !lBtn) return;
  if (type === 'distance') {
    dBtn.style.borderColor = 'var(--blue)'; dBtn.style.background = 'var(--blue-lt)'; dBtn.style.color = 'var(--blue)'; dBtn.style.fontWeight = '600';
    lBtn.style.borderColor = 'var(--border)'; lBtn.style.background = 'var(--bg-card)'; lBtn.style.color = 'var(--text-dim)'; lBtn.style.fontWeight = '400';
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click first point';
  } else {
    lBtn.style.borderColor = 'var(--blue)'; lBtn.style.background = 'var(--blue-lt)'; lBtn.style.color = 'var(--blue)'; lBtn.style.fontWeight = '600';
    dBtn.style.borderColor = 'var(--border)'; dBtn.style.background = 'var(--bg-card)'; dBtn.style.color = 'var(--text-dim)'; dBtn.style.fontWeight = '400';
    (document.getElementById('measureText') as HTMLElement).textContent = 'Click a point to read elevation';
  }
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
  const on = (window as any).measureMode;
  appState.renderer.domElement.style.cursor = on ? 'crosshair' : '';
  if (on) {
    (document.getElementById('measureText') as HTMLElement).textContent = measureType === 'distance' ? 'Click first point' : 'Click a point to read elevation';
  }
};

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
