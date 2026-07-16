import { describe, it, expect } from 'vitest';
import { IFCWALL } from 'web-ifc';
import { IFC_NAMES } from '../../lib/constants.js';
import { sgIfcCodeToClass } from './validator-json-loader.js';

// Regression guard for Phase 18 bug #1: getAllProps stores entity `type` as a
// class-name STRING (e.g. 'IfcWall'), but the old code only handled numeric
// type codes, so every string bucketed under a garbage key ('Ifc#IfcWall') and
// every class-scoped rule reported "No X elements found".
describe('sgIfcCodeToClass', () => {
  it('passes a class-name string through unchanged', () => {
    expect(sgIfcCodeToClass('IfcWall')).toBe('IfcWall');
    expect(sgIfcCodeToClass('IfcSpace')).toBe('IfcSpace');
  });

  it('trims surrounding whitespace on string input', () => {
    expect(sgIfcCodeToClass('  IfcDoor  ')).toBe('IfcDoor');
  });

  it('resolves a numeric IFC type code to the same class name getAllProps uses', () => {
    // The numeric branch mirrors getAllProps' own IFC_NAMES lookup, so both
    // sides of the pipeline agree on the bucket key for a given type code.
    expect(sgIfcCodeToClass(IFCWALL)).toBe(IFC_NAMES[IFCWALL]);
  });

  it('never produces the "Ifc#" garbage bucket key for a known string type', () => {
    // The old code ran string types through the numeric map, yielding
    // 'Ifc#IfcWall' which no rule queries — the core Phase 18 regression.
    expect(sgIfcCodeToClass('IfcWall')).not.toContain('#');
  });
});
