import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../store/index.js';
import { saveCameraForProject, restoreCameraForProject, clearCameraForProject } from './state-persist.js';

// Minimal stand-ins for the THREE camera/controls the persistence functions
// read from / write to. Vector-like objects with x/y/z + a set().
const vec = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(nx: number, ny: number, nz: number) { this.x = nx; this.y = ny; this.z = nz; },
});

beforeEach(() => {
  localStorage.clear();
  (appState as any).camera = { position: vec() };
  (appState as any).controls = { target: vec(), update() {} };
});

describe('per-project camera persistence', () => {
  it('round-trips a project camera under its own key', () => {
    appState.camera!.position.set(10, 20, 30);
    (appState.controls as any).target.set(1, 2, 3);
    saveCameraForProject('projA');

    // Move the camera elsewhere, then restore projA — it should come back.
    appState.camera!.position.set(0, 0, 0);
    (appState.controls as any).target.set(0, 0, 0);
    restoreCameraForProject('projA');

    expect(appState.camera!.position).toMatchObject({ x: 10, y: 20, z: 30 });
    expect((appState.controls as any).target).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('keeps each project on its own camera (no bleed)', () => {
    appState.camera!.position.set(5, 5, 5);
    saveCameraForProject('projA');
    appState.camera!.position.set(9, 9, 9);
    saveCameraForProject('projB');

    restoreCameraForProject('projA');
    expect(appState.camera!.position).toMatchObject({ x: 5, y: 5, z: 5 });
    restoreCameraForProject('projB');
    expect(appState.camera!.position).toMatchObject({ x: 9, y: 9, z: 9 });
  });

  it('restore is a no-op when the project has no saved camera', () => {
    appState.camera!.position.set(7, 7, 7);
    restoreCameraForProject('never-saved');
    expect(appState.camera!.position).toMatchObject({ x: 7, y: 7, z: 7 });
  });

  it('clearCameraForProject removes the stored camera', () => {
    appState.camera!.position.set(1, 1, 1);
    saveCameraForProject('projA');
    clearCameraForProject('projA');
    appState.camera!.position.set(2, 2, 2);
    restoreCameraForProject('projA');
    // Nothing to restore → stays where it was.
    expect(appState.camera!.position).toMatchObject({ x: 2, y: 2, z: 2 });
  });
});
