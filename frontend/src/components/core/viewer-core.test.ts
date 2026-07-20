import { describe, it, expect } from 'vitest';
import { ifcClassToRevitCategory } from './viewer-core.js';

describe('ifcClassToRevitCategory', () => {
  it('resolves a well-formed PascalCase class name', () => {
    expect(ifcClassToRevitCategory('IfcDoor')).toBe('Doors');
    expect(ifcClassToRevitCategory('IfcColumn')).toBe('Columns');
  });

  it('resolves multi-word PascalCase names ALL-CAPS numeric lookups return', () => {
    // Reconstructing PascalCase from an all-caps string by only capitalizing
    // the first letter produces 'Ifcwallstandardcase', which can never match
    // a multi-word key — this is the bug case-insensitive lookup fixes.
    expect(ifcClassToRevitCategory('IFCCABLECARRIERFITTING')).toBe('Cable Tray Fittings');
  });

  it('is case-insensitive in general (mixed case input)', () => {
    expect(ifcClassToRevitCategory('ifcdoor')).toBe('Doors');
    expect(ifcClassToRevitCategory('IFCDOOR')).toBe('Doors');
  });

  it('falls back to the raw input when there is no mapping', () => {
    expect(ifcClassToRevitCategory('IfcSomeUnknownThing')).toBe('IfcSomeUnknownThing');
  });

  it('handles empty/falsy input without throwing', () => {
    expect(ifcClassToRevitCategory('')).toBe('Unknown');
  });
});
