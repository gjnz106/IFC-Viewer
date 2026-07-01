import { describe, it, expect } from 'vitest';
import { parseMaterialLayers } from './material-layers.js';

const V = (x: any) => ({ value: x });

describe('parseMaterialLayers', () => {
  it('parses a layer set nested under ForLayerSet (LayerSetUsage)', () => {
    const mats = [{
      ForLayerSet: {
        LayerSetName: V('Wall-200'),
        MaterialLayers: [
          { Material: { Name: V('Concrete') }, LayerThickness: V(0.15) },
          { Material: { Name: V('Insulation') }, LayerThickness: V(0.05) },
        ],
      },
    }];
    const r = parseMaterialLayers(mats)!;
    expect(r.setName).toBe('Wall-200');
    expect(r.layers).toEqual([
      { name: 'Concrete', thickness: 0.15 },
      { name: 'Insulation', thickness: 0.05 },
    ]);
    expect(r.totalThickness).toBeCloseTo(0.2, 6);
  });

  it('parses a bare IfcMaterialLayerSet', () => {
    const r = parseMaterialLayers([{ Name: V('Slab'), MaterialLayers: [{ Material: { Name: V('RC') }, LayerThickness: V(0.3) }] }])!;
    expect(r.setName).toBe('Slab');
    expect(r.layers).toEqual([{ name: 'RC', thickness: 0.3 }]);
    expect(r.totalThickness).toBe(0.3);
  });

  it('handles a single (non-array) layer and missing thickness', () => {
    const r = parseMaterialLayers([{ MaterialLayers: { Material: { Name: V('Brick') } } }])!;
    expect(r.layers).toEqual([{ name: 'Brick', thickness: null }]);
    expect(r.totalThickness).toBeNull();
  });

  it('falls back to (unnamed) when a layer has no material name', () => {
    const r = parseMaterialLayers([{ MaterialLayers: [{ LayerThickness: V(0.1) }] }])!;
    expect(r.layers[0]).toEqual({ name: '(unnamed)', thickness: 0.1 });
  });

  it('returns null when there is no layer set', () => {
    expect(parseMaterialLayers([{ Name: V('Steel') }])).toBeNull();
    expect(parseMaterialLayers(null)).toBeNull();
    expect(parseMaterialLayers([])).toBeNull();
  });
});
