// ══════════════════════════════════════════════════════════════════════
// ── WASD/QE fly navigation in the normal (orbit) 3D view ──────────────
// ══════════════════════════════════════════════════════════════════════
// Dalux-style: press W/A/S/D to fly forward/left/back/right along the
// camera's current look direction, Q/E to drop/rise along world-up, all
// while OrbitControls keeps working normally (mouse still orbits/pans/
// zooms) — unlike Walk Mode (walk.ts), this needs no pointer lock or mode
// switch. Camera and orbit target translate together each frame so a
// subsequent mouse-orbit pivots around the new position, not the old one.
import * as THREE from 'three';
import { appState } from '../../store/index.js';

const flyKeys: Record<string, boolean> = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
let lastTime = 0;

function isTypingTarget(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!(el as HTMLElement | null)?.isContentEditable;
}

document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Walk Mode (walk.ts) owns WASD/QE while pointer-locked; don't double-apply.
  if (appState.walkActive) return;
  if (isTypingTarget(e.target)) return;
  const k = (e.key || '').toLowerCase();
  if (!(k in flyKeys) && k !== 'shift') return;
  if (k === 'shift') flyKeys.shift = true;
  else flyKeys[k] = true;
});

document.addEventListener('keyup', (e: KeyboardEvent) => {
  const k = (e.key || '').toLowerCase();
  if (k === 'shift') flyKeys.shift = false;
  else if (k in flyKeys) flyKeys[k] = false;
});

// A tab-switch or focus loss can leave a key "stuck" down (no keyup ever
// arrives) — release everything so the camera doesn't silently keep flying.
window.addEventListener('blur', () => {
  for (const k of Object.keys(flyKeys)) flyKeys[k] = false;
});

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _move = new THREE.Vector3();

// Called once per frame from viewer-core's render loop, only outside Walk
// Mode. No-ops instantly (and resets the dt clock) when no key is held, so
// there's no drift/jump the moment movement resumes after being idle.
(window as any)._applyFlyMovement = function (): void {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const anyKey = flyKeys.w || flyKeys.a || flyKeys.s || flyKeys.d || flyKeys.q || flyKeys.e;
  if (!anyKey) { lastTime = now; return; }

  let dt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
  lastTime = now;
  if (dt > 0.1) dt = 0.1; // clamp — a stall/tab-switch can't teleport the camera

  const camera = appState.camera, controls = appState.controls;
  if (!camera || !controls) return;

  // Speed scales with the current camera-to-target distance (how "zoomed
  // in" the view is) — same idea Google Earth/Dalux use so a single key
  // feels right whether the model is a doorknob or a stadium, instead of a
  // fixed metres/second that's imperceptible on huge models and a blur on
  // tiny ones. Floored against the model's own scale so it's never ~0 at
  // extreme zoom.
  const b = appState.modelBounds;
  const modelScale = (b && b.min && b.max) ? b.max.distanceTo(b.min) : 10;
  const zoomDist = camera.position.distanceTo(controls.target);
  const spd = Math.max(zoomDist, modelScale * 0.01, 0.05) * 0.45 * (flyKeys.shift ? 2.5 : 1) * dt;

  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();

  _move.set(0, 0, 0);
  if (flyKeys.w) _move.addScaledVector(_fwd, spd);
  if (flyKeys.s) _move.addScaledVector(_fwd, -spd);
  if (flyKeys.d) _move.addScaledVector(_right, spd);
  if (flyKeys.a) _move.addScaledVector(_right, -spd);
  if (flyKeys.e) _move.addScaledVector(_up, spd);
  if (flyKeys.q) _move.addScaledVector(_up, -spd);

  camera.position.add(_move);
  controls.target.add(_move);
};
