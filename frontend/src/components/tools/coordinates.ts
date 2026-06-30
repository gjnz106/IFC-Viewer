import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

// ══ Coordinate readout tool ══
// Toggled from the floating viewport toolbar (#btnCoord). When active, moving the
// cursor over the model raycasts against visible meshes and prints the world XYZ
// of the point under the cursor into #coordReadout. Purely a read-out — it does
// not change selection or any other tool state.

let coordActive = false;
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function collectPickables(): THREE.Object3D[] {
  const ms: THREE.Object3D[] = [];
  appState.scene.traverse((ch: any) => {
    if (ch.isMesh && ch.visible && ch.geometry?.attributes?.position
        && ch.parent?.name !== 'sectionBox' && !ch.userData?.isHandle) {
      ms.push(ch);
    }
  });
  return ms;
}

function onMove(e: PointerEvent): void {
  const readout = document.getElementById('coordReadout');
  if (!readout) return;
  const rect = appState.renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(mouse, appState.camera);
  const hits = ray.intersectObjects(collectPickables(), false);
  if (hits.length) {
    const p = hits[0].point;
    readout.innerHTML = `X <b>${p.x.toFixed(3)}</b>&nbsp;&nbsp;Y <b>${p.y.toFixed(3)}</b>&nbsp;&nbsp;Z <b>${p.z.toFixed(3)}</b>&nbsp;m`;
  } else {
    readout.innerHTML = 'X —&nbsp;&nbsp;Y —&nbsp;&nbsp;Z —';
  }
}

(window as any).toggleCoordinates = function (): void {
  coordActive = !coordActive;
  document.getElementById('btnCoord')?.classList.toggle('active', coordActive);
  const readout = document.getElementById('coordReadout');
  if (readout) readout.style.display = coordActive ? 'block' : 'none';
  const canvas = appState.renderer?.domElement;
  if (!canvas) return;
  if (coordActive) {
    canvas.addEventListener('pointermove', onMove);
    log('Coordinates readout ON');
  } else {
    canvas.removeEventListener('pointermove', onMove);
  }
};
