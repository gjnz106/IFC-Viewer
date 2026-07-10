import { describe, it, expect } from 'vitest';
import { addViewpoint, removeViewpoint, renameViewpoint, remapCamera, modelsFingerprint, loadViewpoints, saveViewpoints, type Viewpoint } from './viewpoints-store.js';

function makeVp(id: string, name: string): Viewpoint {
  return {
    id, name, createdAt: Date.now(),
    camera: { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 },
    anchor: null,
    section: null,
    visibility: { slotVisible: [true, true], hiddenKeys: [], isolated: null },
    modelsKey: 'a.ifc|b.ifc',
    thumb: 'data:image/jpeg;base64,x',
  };
}

describe('addViewpoint', () => {
  it('prepends the new viewpoint (newest first)', () => {
    const list = addViewpoint([makeVp('1', 'old')], makeVp('2', 'new'));
    expect(list.map(v => v.id)).toEqual(['2', '1']);
  });

  it('caps the list at maxKeep, dropping the oldest', () => {
    let list: Viewpoint[] = [];
    for (let i = 0; i < 5; i++) list = addViewpoint(list, makeVp(String(i), 'v' + i), 3);
    expect(list).toHaveLength(3);
    expect(list.map(v => v.id)).toEqual(['4', '3', '2']);
  });
});

describe('removeViewpoint / renameViewpoint', () => {
  it('removes only the matching id', () => {
    const list = [makeVp('1', 'a'), makeVp('2', 'b')];
    expect(removeViewpoint(list, '1').map(v => v.id)).toEqual(['2']);
  });

  it('renames, trimming whitespace, and keeps the old name when blank', () => {
    const list = [makeVp('1', 'old')];
    expect(renameViewpoint(list, '1', '  New Name  ')[0].name).toBe('New Name');
    expect(renameViewpoint(list, '1', '   ')[0].name).toBe('old');
  });
});

describe('remapCamera', () => {
  const cam = { px: 10, py: 2, pz: -5, tx: 0, ty: 2, tz: 0 };

  it('is identity when the offset is unchanged', () => {
    const anchor = { x: 100, y: 5, z: -20 };
    expect(remapCamera(cam, anchor, anchor)).toEqual(cam);
  });

  it('is identity when either anchor is null (e.g. no models loaded yet)', () => {
    expect(remapCamera(cam, null, { x: 1, y: 1, z: 1 })).toEqual(cam);
    expect(remapCamera(cam, { x: 1, y: 1, z: 1 }, null)).toEqual(cam);
  });

  it('shifts the camera by the delta between saved and current offset', () => {
    const saved = { x: 100, y: 5, z: -20 };
    const current = { x: 100, y: 10, z: -20 }; // model reloaded, offset.y changed by +5
    const remapped = remapCamera(cam, saved, current);
    // dy = saved.y - current.y = 5 - 10 = -5
    expect(remapped.py).toBeCloseTo(cam.py - 5);
    expect(remapped.ty).toBeCloseTo(cam.ty - 5);
    expect(remapped.px).toBeCloseTo(cam.px); // x/z unaffected in this case
  });
});

describe('modelsFingerprint', () => {
  it('is order-insensitive', () => {
    expect(modelsFingerprint(['b.ifc', 'a.ifc'])).toBe(modelsFingerprint(['a.ifc', 'b.ifc']));
  });

  it('ignores null/undefined slots', () => {
    expect(modelsFingerprint(['a.ifc', undefined, null, 'b.ifc'])).toBe('a.ifc|b.ifc');
  });

  it('differs when the file set actually differs', () => {
    expect(modelsFingerprint(['a.ifc'])).not.toBe(modelsFingerprint(['a.ifc', 'b.ifc']));
  });
});

describe('loadViewpoints / saveViewpoints (localStorage glue)', () => {
  it('round-trips a saved list', () => {
    const list = [makeVp('1', 'a')];
    expect(saveViewpoints('proj-x', list)).toBe(true);
    expect(loadViewpoints('proj-x')).toEqual(list);
  });

  it('returns an empty list for a project with nothing saved', () => {
    expect(loadViewpoints('proj-never-saved')).toEqual([]);
  });

  it('treats non-array JSON at the key as empty instead of returning it raw', () => {
    // A key overwritten by something else (manual edit, an older/incompatible
    // version) can be valid JSON that isn't an array — every caller does
    // list.find/.map/.slice, which throws on a bare object.
    localStorage.setItem('ifc.viewpoints.proj-corrupt', JSON.stringify({ not: 'an array' }));
    expect(loadViewpoints('proj-corrupt')).toEqual([]);
  });

  it('falls back to stripping thumbnails when the full payload exceeds quota', () => {
    const list = [makeVp('1', 'a')];
    const realSetItem = localStorage.setItem.bind(localStorage);
    let calls = 0;
    localStorage.setItem = (k: string, v: string) => {
      calls++;
      if (calls === 1) throw new DOMException('quota', 'QuotaExceededError');
      realSetItem(k, v);
    };
    try {
      expect(saveViewpoints('proj-quota', list)).toBe(true);
      const saved = loadViewpoints('proj-quota');
      expect(saved[0].thumb).toBe('');
      expect(saved[0].id).toBe('1'); // the rest of the data survived
    } finally {
      localStorage.setItem = realSetItem;
    }
  });

  it('reports failure (does not throw) when even the stripped retry exceeds quota', () => {
    const list = [makeVp('1', 'a')];
    const realSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    try {
      expect(saveViewpoints('proj-full', list)).toBe(false);
    } finally {
      localStorage.setItem = realSetItem;
    }
  });
});
