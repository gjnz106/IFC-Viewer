import { describe, it, expect } from 'vitest';
import * as W from 'web-ifc';
import { IFC_NAMES } from './constants.js';

// Regression guard for the collision that silently broke SG-Validate: the
// numeric-literal block used stale IFC codes, and several (e.g. IFCWALL's
// real code 2391406946) were re-labeled as an MEP type, so getAllProps —
// which stores IFC_NAMES[runtimeCode] — named every wall "IfcWasteTerminal"
// and every class-scoped validate rule found nothing. Each entry must map a
// web-ifc code to *its own* canonical name.
describe('IFC_NAMES has no code collisions', () => {
  const structural = [
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCBEAM', 'IFCCOLUMN', 'IFCSLAB',
    'IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCPLATE',
    'IFCRAMP', 'IFCROOF', 'IFCSPACE', 'IFCBUILDINGSTOREY',
  ] as const;

  for (const name of structural) {
    it(`${name} maps to its canonical class name`, () => {
      const code = (W as any)[name] as number;
      const expected = 'Ifc' + name.slice(3, 4) + name.slice(4).toLowerCase();
      // case-insensitive because canonical casing (e.g. IfcWallStandardCase)
      // differs from the naive slice; the real assertion is "not some other
      // type's name".
      expect((IFC_NAMES[code] || '').toLowerCase()).toBe(expected.toLowerCase());
    });
  }

  it('never labels IFCWALL as an MEP terminal (the original bug)', () => {
    expect(IFC_NAMES[(W as any).IFCWALL]).toBe('IfcWall');
  });
});
