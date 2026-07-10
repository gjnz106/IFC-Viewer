import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { buildWalkStoreys, storeyWorldY, type WalkStorey } from '../../lib/storeys.js';
import { escapeHtml } from '../../lib/escape.js';

// ══════════════════════════════════════════════════════════════
// ══ FIRST PERSON WALK MODE ══
// ══════════════════════════════════════════════════════════════

// appState.walkActive tracks the active/inactive state
// Movement is delta-time based (metres per SECOND) so speed is identical
// regardless of frame rate — the previous per-frame model made fast machines
// zoom and slow ones crawl.
const WALK_BASE_SPEED = 3.5;            // m/s at 1× multiplier
const SPEED_STEPS = [0.5, 1, 2, 4];     // presets cycled by the speed pill
let walkSpeedMult = 1;                  // current speed multiplier
const walkKeys: Record<string, boolean> = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
let walkYaw: number = 0;
let walkPitch: number = 0;
let walkAnimId: number | null = null;
let _walkLast = 0;                      // timestamp of previous frame (ms)

// ── Walk levels (storey picker) ──────────────────────────────────────
let walkLevels: WalkStorey[] = [];
let walkLevelIdx = -1;                  // index into walkLevels, -1 = none selected yet
let walkClipEnabled = true;

function updateSpeedPill(): void {
  const el = document.getElementById('walkSpeedPill');
  if (el) el.textContent = (walkSpeedMult % 1 === 0 ? walkSpeedMult.toFixed(0) : walkSpeedMult.toFixed(1)) + '×';
}

// Cycle through the speed presets (used by the Field-mode speed pill button).
(window as any).walkCycleSpeed = function (): void {
  const idx = SPEED_STEPS.findIndex((s) => s >= walkSpeedMult - 1e-3);
  walkSpeedMult = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
  updateSpeedPill();
};

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
    // Drop to standing eye height facing the model so it is always in view on
    // entry (previously the camera kept its orbit pose, often leaving the model
    // off-screen — the "I can't see anything in walk mode" report).
    (window as any).walkFrameModel?.();
    _walkLast = 0;
    updateSpeedPill();
    walkBuildLevels();
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
    walkRestoreClip();
    walkHideLevels();
    log('Walk mode OFF');
  }
};

// ── Level picker: build/render the storey strip, teleport + clip ────────

function walkHideLevels(): void {
  const el = document.getElementById('walkLevels') as HTMLElement | null;
  if (el) el.style.display = 'none';
}

// Restore whatever clip state the user had before walk-level clipping
// touched planes[2]/[3] (Y top/bottom) — the user's own section box if one
// was active, otherwise fully open. Must run on EVERY walk-exit path
// (toggleWalkMode's exit branch AND the pointerlockchange force-exit below)
// or the Y clip silently persists into orbit mode.
function walkRestoreClip(): void {
  if (walkLevelIdx < 0) return; // never touched the planes
  walkLevelIdx = -1;
  if (appState.sectionActive) {
    (window as any).updateSectionFromSliders?.();
  } else if (appState.clipPlanes.length >= 6) {
    appState.clipPlanes[2].constant = 99999;
    appState.clipPlanes[3].constant = 99999;
  }
}

async function walkBuildLevels(): Promise<void> {
  walkLevels = await buildWalkStoreys();
  walkLevelIdx = -1;
  renderWalkLevelPills();
}

function renderWalkLevelPills(): void {
  const wrap = document.getElementById('walkLevels') as HTMLElement | null;
  const pillsEl = document.getElementById('walkLevelPills');
  const clipChk = document.getElementById('walkClipChk') as HTMLInputElement | null;
  if (!wrap || !pillsEl) return;
  if (clipChk) clipChk.checked = walkClipEnabled;
  if (walkLevels.length === 0) {
    pillsEl.innerHTML = '<span class="field-storey-pill" style="opacity:.5;cursor:default">No storeys</span>';
  } else {
    pillsEl.innerHTML = walkLevels.map((s, i) => {
      const elevStr = s.elevation >= 0 ? '+' + s.elevation.toFixed(1) : s.elevation.toFixed(1);
      return `<button class="field-storey-pill${i === walkLevelIdx ? ' on' : ''}" onclick="walkGoToStorey(${i})">${escapeHtml(s.name)} (${elevStr}m)</button>`;
    }).join('');
  }
  wrap.style.display = appState.walkActive ? 'flex' : 'none';
}

// Teleport to standing eye height above the given storey's floor, clamp
// X/Z into the model bounds, and (if enabled) clip away every other storey.
(window as any).walkGoToStorey = function (idx: number): void {
  const s = walkLevels[idx];
  if (!s) return;
  walkLevelIdx = idx;

  const offsetY = appState.sharedCenterOffset?.y || 0;
  const floorY = storeyWorldY(s.elevation, offsetY);
  const topY = storeyWorldY(s.topElevation, offsetY);

  // Eye height ~1.6m, converted from metres into this model's project units.
  const lengthFactor = appState.loadedModels[s.modelIdx]?.units?.lengthFactor || 1000;
  const eyeOffset = 1.6 * 1000 / lengthFactor;
  const floorMargin = 0.3 * 1000 / lengthFactor;
  const ceilMargin = 0.1 * 1000 / lengthFactor;

  const bounds = appState.modelBounds;
  const px = bounds ? Math.min(Math.max(appState.camera.position.x, bounds.min.x), bounds.max.x) : appState.camera.position.x;
  const pz = bounds ? Math.min(Math.max(appState.camera.position.z, bounds.min.z), bounds.max.z) : appState.camera.position.z;
  (window as any).walkSetPose?.(px, floorY + eyeOffset, pz, walkYaw, 0);

  if (walkClipEnabled && appState.clipPlanes.length >= 6) {
    // Planes 2,3 are Y+ (ceiling) / Y- (floor) — same pair Field Mode's
    // storey clip uses (fieldSelectStorey in fieldmode.ts).
    appState.clipPlanes[2].constant = topY + ceilMargin;
    appState.clipPlanes[3].constant = -(floorY - floorMargin);
  }

  renderWalkLevelPills();
};

(window as any).walkCycleStorey = function (dir: number): void {
  if (walkLevels.length === 0) return;
  const next = walkLevelIdx < 0 ? (dir > 0 ? 0 : walkLevels.length - 1) : Math.max(0, Math.min(walkLevels.length - 1, walkLevelIdx + dir));
  (window as any).walkGoToStorey(next);
};

(window as any).walkToggleStoreyClip = function (): void {
  walkClipEnabled = !walkClipEnabled;
  if (walkClipEnabled && walkLevelIdx >= 0) {
    (window as any).walkGoToStorey(walkLevelIdx); // re-apply clip for the current level
  } else if (!walkClipEnabled && appState.clipPlanes.length >= 6) {
    // Same choice walkRestoreClip() makes on walk-exit: if the user has their
    // own section box active, hand the Y planes back to it instead of
    // blowing it open to 99999 — this toggle used to always force fully
    // open, silently discarding the user's section whenever they turned
    // storey-clip off mid-walk.
    if (appState.sectionActive) {
      (window as any).updateSectionFromSliders?.();
    } else {
      appState.clipPlanes[2].constant = 99999;
      appState.clipPlanes[3].constant = 99999;
    }
  }
  const clipChk = document.getElementById('walkClipChk') as HTMLInputElement | null;
  if (clipChk) clipChk.checked = walkClipEnabled;
};

// ── Bridge for Field Mode (iPad) touch controls ──────────────────────
// Field Mode lives in its own module scope, so it drives the walk camera
// through these window hooks instead of shared module-level variables
// (walkYaw / walkPitch / walkKeys are private to this module).

// Press/release a movement key from the touch up/down buttons.
(window as any).walkSetKey = function (k: string, pressed: boolean): void {
  if (k in walkKeys) walkKeys[k] = pressed;
};

// Place the walk camera explicitly (used by tap-to-go and framing).
(window as any).walkSetPose = function (px: number, py: number, pz: number, yaw: number, pitch: number): void {
  appState.camera.position.set(px, py, pz);
  walkYaw = yaw;
  walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
};

// Frame the whole loaded model at standing eye height so it is visible the
// moment walk mode starts — otherwise the camera keeps the previous orbit
// pose, which on a tablet often leaves the model off-screen.
(window as any).walkFrameModel = function (): void {
  const box = new THREE.Box3();
  let has = false;
  for (const m of appState.loadedModels) {
    if (m) { try { box.expandByObject(m as any); has = true; } catch (e) { /* skip */ } }
  }
  if (!has || box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z) || 5;
  // Eye height ~1.6 m above the model floor (clamped for tiny models).
  const eyeY = box.min.y + Math.min(1.6, Math.max(size.y * 0.5, 0.1));
  const dist = span * 0.6 + 2;
  const px = center.x + dist, pz = center.z + dist;
  appState.camera.position.set(px, eyeY, pz);
  walkYaw = Math.atan2(center.x - px, center.z - pz);
  walkPitch = 0;
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
  // Level picker — keyboard-first on desktop since pointer lock (mouse-look)
  // swallows clicks on the HUD pills. PageUp/PageDown are the primary keys;
  // '[' / ']' mirror them for keyboards/layouts without dedicated Page keys.
  if (k === 'pageup' || k === ']') { (window as any).walkCycleStorey?.(1); e.preventDefault(); }
  if (k === 'pagedown' || k === '[') { (window as any).walkCycleStorey?.(-1); e.preventDefault(); }
  if (k === 'l') { (window as any).walkToggleStoreyClip?.(); }
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

// Scroll = adjust speed (continuous, clamped to the preset range)
document.addEventListener('wheel', (e: WheelEvent) => {
  if (!appState.walkActive) return;
  walkSpeedMult *= e.deltaY > 0 ? 0.85 : 1.18;
  walkSpeedMult = Math.max(0.25, Math.min(8, walkSpeedMult));
  updateSpeedPill();
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
    walkRestoreClip();
    walkHideLevels();
  }
});

// Reused every frame instead of `new THREE.Vector3()`/`.clone()` per key —
// walkLoop used to allocate up to ~9 throwaway vectors every single frame
// (forward/right/up + a clone per active key + lookDir + a position clone
// just to call lookAt), which is enough sustained GC pressure at 60fps to
// read as stutter, especially with the mouse-look pointer-lock loop where
// any hitch is far more noticeable than in static orbit view.
const _wForward = new THREE.Vector3();
const _wRight = new THREE.Vector3();
const _wUp = new THREE.Vector3(0, 1, 0);
const _wMove = new THREE.Vector3();
const _wLookDir = new THREE.Vector3();
const _wLookAt = new THREE.Vector3();

function walkLoop(): void {
  if (!appState.walkActive) return;

  // Delta-time in seconds (clamped so a stall/tab-switch can't teleport us).
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let dt = _walkLast ? (now - _walkLast) / 1000 : 1 / 60;
  _walkLast = now;
  if (dt > 0.1) dt = 0.1;
  const dtScale = dt * 60; // 1.0 at 60fps — keeps look rates feeling the same

  // Metres to move this frame = base × multiplier × (×2.5 sprint) × dt.
  const spd = WALK_BASE_SPEED * walkSpeedMult * (walkKeys.shift ? 2.5 : 1) * dt;

  // Direction vectors
  _wForward.set(-Math.sin(walkYaw), 0, -Math.cos(walkYaw));
  _wRight.set(Math.cos(walkYaw), 0, -Math.sin(walkYaw));

  // Movement from keyboard (WASD)
  _wMove.set(0, 0, 0);
  if (walkKeys.w) _wMove.addScaledVector(_wForward, spd);
  if (walkKeys.s) _wMove.addScaledVector(_wForward, -spd);
  if (walkKeys.a) _wMove.addScaledVector(_wRight, -spd);
  if (walkKeys.d) _wMove.addScaledVector(_wRight, spd);
  if (walkKeys.e) _wMove.addScaledVector(_wUp, spd);
  if (walkKeys.q) _wMove.addScaledVector(_wUp, -spd);

  // Movement from touch joystick (Field Mode)
  const _walkJoyVec: any = (window as any)._walkJoyVec;
  if (_walkJoyVec && (Math.abs(_walkJoyVec.x) > 0.05 || Math.abs(_walkJoyVec.y) > 0.05)) {
    // Joystick Y axis (up = forward), X axis (right = strafe right)
    _wMove.addScaledVector(_wForward, -_walkJoyVec.y * spd);
    _wMove.addScaledVector(_wRight, _walkJoyVec.x * spd);
  }

  // Look rotation from touch look joystick (Field Mode)
  const _walkLookVec: any = (window as any)._walkLookVec;
  if (_walkLookVec && (Math.abs(_walkLookVec.x) > 0.08 || Math.abs(_walkLookVec.y) > 0.08)) {
    // Eased (quadratic) response: small stick deflections rotate gently and
    // only near full deflection do we approach max speed. This stops the view
    // from whipping around when the stick is nudged. Base rates reduced too.
    const ease = (v: number) => Math.sign(v) * v * v;
    walkYaw -= ease(_walkLookVec.x) * 0.022 * dtScale;   // horizontal look speed (reduced + eased)
    walkPitch -= ease(_walkLookVec.y) * 0.015 * dtScale;  // vertical look speed (reduced + eased)
    walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, walkPitch));
  }

  appState.camera.position.add(_wMove);

  // Look direction from yaw/pitch
  _wLookDir.set(
    -Math.sin(walkYaw) * Math.cos(walkPitch),
    Math.sin(walkPitch),
    -Math.cos(walkYaw) * Math.cos(walkPitch)
  );
  _wLookAt.copy(appState.camera.position).add(_wLookDir);
  appState.camera.lookAt(_wLookAt);

  // NOTE: no renderer.render() here — the single main render loop in
  // viewer-core draws every frame. Rendering here too caused two rAF loops to
  // fight over the frame, which showed up as stutter/jitter in walk mode.

  walkAnimId = requestAnimationFrame(walkLoop);
}

export { walkLoop };
