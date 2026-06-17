import * as THREE from 'three';
import { appState } from '../state/index.js';
import { log } from './ifc-category.js';

// ══════════════════════════════════════════════════════════════
// ══ FIRST PERSON WALK MODE ══
// ══════════════════════════════════════════════════════════════

// appState.walkActive tracks the active/inactive state
let walkSpeed: number = 0.15; // m per frame
const walkKeys: Record<string, boolean> = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
let walkYaw: number = 0;
let walkPitch: number = 0;
let walkAnimId: number | null = null;

window.toggleWalkMode = function (): void {
  appState.walkActive = !appState.walkActive;
  document.getElementById('btnWalk')!.classList.toggle('active', appState.walkActive);
  (document.getElementById('walkHUD') as HTMLElement).style.display = appState.walkActive ? 'block' : 'none';
  (document.getElementById('walkCross') as HTMLElement).style.display = appState.walkActive ? 'block' : 'none';

  if (appState.walkActive) {
    // Enter walk mode
    appState.controls.enabled = false;
    // Set initial yaw/pitch from current camera direction
    const dir = new THREE.Vector3();
    appState.camera.getWorldDirection(dir);
    walkYaw = Math.atan2(dir.x, dir.z);
    walkPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    // Request pointer lock for smooth mouse look
    appState.renderer.domElement.requestPointerLock && appState.renderer.domElement.requestPointerLock();
    walkLoop();
    log('Walk mode ON — WASD to move, mouse to look');
  } else {
    // Exit walk mode
    appState.controls.enabled = true;
    appState.controls.target.copy(appState.camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(appState.camera.quaternion));
    appState.controls.update();
    document.exitPointerLock && document.exitPointerLock();
    if (walkAnimId) { cancelAnimationFrame(walkAnimId); walkAnimId = null; }
    log('Walk mode OFF');
  }
};

// Keyboard
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!appState.walkActive) return;
  const k = (e.key || '').toLowerCase();
  if (k === 'w') walkKeys.w = true;
  if (k === 'a') walkKeys.a = true;
  if (k === 's') walkKeys.s = true;
  if (k === 'd') walkKeys.d = true;
  if (k === 'q') walkKeys.q = true;
  if (k === 'e') walkKeys.e = true;
  if (k === 'shift' || e.shiftKey) walkKeys.shift = true;
  if (k === 'escape') { window.toggleWalkMode!(); e.preventDefault(); }
});
document.addEventListener('keyup', (e: KeyboardEvent) => {
  const k = (e.key || '').toLowerCase();
  if (k === 'w') walkKeys.w = false;
  if (k === 'a') walkKeys.a = false;
  if (k === 's') walkKeys.s = false;
  if (k === 'd') walkKeys.d = false;
  if (k === 'q') walkKeys.q = false;
  if (k === 'e') walkKeys.e = false;
  if (k === 'shift' || !e.shiftKey) walkKeys.shift = false;
});

// Mouse look (pointer lock)
document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!appState.walkActive) return;
  if (document.pointerLockElement === appState.renderer.domElement) {
    walkYaw -= e.movementX * 0.002;
    walkPitch -= e.movementY * 0.002;
    walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, walkPitch));
  }
});

// Scroll = adjust speed
document.addEventListener('wheel', (e: WheelEvent) => {
  if (!appState.walkActive) return;
  walkSpeed *= e.deltaY > 0 ? 0.85 : 1.18;
  walkSpeed = Math.max(0.01, Math.min(5, walkSpeed));
  e.preventDefault();
}, { passive: false });

// Pointer lock change — exit walk if user presses Esc via browser
document.addEventListener('pointerlockchange', () => {
  if (appState.walkActive && document.pointerLockElement !== appState.renderer.domElement) {
    // User exited pointer lock (Esc) — exit walk mode
    appState.walkActive = false;
    document.getElementById('btnWalk')!.classList.remove('active');
    (document.getElementById('walkHUD') as HTMLElement).style.display = 'none';
    (document.getElementById('walkCross') as HTMLElement).style.display = 'none';
    appState.controls.enabled = true;
    appState.controls.target.copy(appState.camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(appState.camera.quaternion));
    appState.controls.update();
    if (walkAnimId) { cancelAnimationFrame(walkAnimId); walkAnimId = null; }
  }
});

function walkLoop(): void {
  if (!appState.walkActive) return;

  const spd = walkKeys.shift ? walkSpeed * 3 : walkSpeed;

  // Direction vectors
  const forward = new THREE.Vector3(-Math.sin(walkYaw), 0, -Math.cos(walkYaw));
  const right = new THREE.Vector3(Math.cos(walkYaw), 0, -Math.sin(walkYaw));
  const up = new THREE.Vector3(0, 1, 0);

  // Movement from keyboard (WASD)
  const move = new THREE.Vector3(0, 0, 0);
  if (walkKeys.w) move.add(forward.clone().multiplyScalar(spd));
  if (walkKeys.s) move.add(forward.clone().multiplyScalar(-spd));
  if (walkKeys.a) move.add(right.clone().multiplyScalar(-spd));
  if (walkKeys.d) move.add(right.clone().multiplyScalar(spd));
  if (walkKeys.e) move.add(up.clone().multiplyScalar(spd));
  if (walkKeys.q) move.add(up.clone().multiplyScalar(-spd));

  // Movement from touch joystick (Field Mode)
  const _walkJoyVec: any = (window as any)._walkJoyVec;
  if (_walkJoyVec && (Math.abs(_walkJoyVec.x) > 0.05 || Math.abs(_walkJoyVec.y) > 0.05)) {
    // Joystick Y axis (up = forward), X axis (right = strafe right)
    move.add(forward.clone().multiplyScalar(-_walkJoyVec.y * spd));
    move.add(right.clone().multiplyScalar(_walkJoyVec.x * spd));
  }

  // Look rotation from touch look joystick (Field Mode)
  const _walkLookVec: any = (window as any)._walkLookVec;
  if (_walkLookVec && (Math.abs(_walkLookVec.x) > 0.08 || Math.abs(_walkLookVec.y) > 0.08)) {
    walkYaw -= _walkLookVec.x * 0.03;   // horizontal look speed
    walkPitch -= _walkLookVec.y * 0.02;  // vertical look speed (slower)
    walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, walkPitch));
  }

  appState.camera.position.add(move);

  // Look direction from yaw/pitch
  const lookDir = new THREE.Vector3(
    -Math.sin(walkYaw) * Math.cos(walkPitch),
    Math.sin(walkPitch),
    -Math.cos(walkYaw) * Math.cos(walkPitch)
  );
  appState.camera.lookAt(appState.camera.position.clone().add(lookDir));

  // Render
  appState.renderer.render(appState.scene, appState.camera);

  walkAnimId = requestAnimationFrame(walkLoop);
}

export { walkLoop };
