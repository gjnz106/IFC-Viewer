import { describe, it, expect } from 'vitest';
import {
  buildOverviewTree, filterOverviewTree, normalizeIfcType,
  buildPrettyTypeLookup, isSpatialType, countStoreys,
  type RawSpatialNode,
} from './spatial-tree.js';

const PRETTY = buildPrettyTypeLookup(['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcWall', 'IfcDoor', 'IfcWallStandardCase']);

// Project → Site → Building → 2 storeys; L1 has 2 walls + 1 door, L2 has 1 wall.
function sampleRaw(): RawSpatialNode {
  return {
    expressID: 1, type: 'IFCPROJECT', children: [{
      expressID: 2, type: 'IFCSITE', children: [{
        expressID: 3, type: 'IFCBUILDING', children: [
          {
            expressID: 10, type: 'IFCBUILDINGSTOREY', children: [
              { expressID: 101, type: 'IFCWALL', children: [] },
              { expressID: 102, type: 'IFCWALL', children: [] },
              { expressID: 103, type: 'IFCDOOR', children: [] },
            ],
          },
          {
            expressID: 20, type: 'IFCBUILDINGSTOREY', children: [
              { expressID: 201, type: 'IFCWALL', children: [] },
            ],
          },
        ],
      }],
    }],
  };
}

describe('normalizeIfcType', () => {
  it('uses the pretty lookup when available', () => {
    expect(normalizeIfcType('IFCWALLSTANDARDCASE', PRETTY)).toBe('IfcWallStandardCase');
  });
  it('falls back to Ifc + capitalized remainder for unknown types', () => {
    expect(normalizeIfcType('IFCSANITARYTERMINAL', PRETTY)).toBe('IfcSanitaryterminal');
  });
  it('handles empty input', () => {
    expect(normalizeIfcType('', PRETTY)).toBe('Unknown');
  });
});

describe('isSpatialType', () => {
  it('classifies containers vs products', () => {
    expect(isSpatialType('IFCBUILDINGSTOREY')).toBe(true);
    expect(isSpatialType('IFCWALL')).toBe(false);
  });
});

describe('buildOverviewTree', () => {
  it('keeps the spatial hierarchy and groups products per type', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    expect(root.ifcType).toBe('IfcProject');
    const building = root.children[0].children[0];
    expect(building.ifcType).toBe('IfcBuilding');
    expect(building.children).toHaveLength(2); // two storeys

    const l1 = building.children[0];
    expect(l1.kind).toBe('spatial');
    // groups sorted by member count desc: Wall(2) before Door(1)
    expect(l1.children.map(g => `${g.label}×${g.count}`)).toEqual(['Wall×2', 'Door×1']);
    expect(l1.children[0].kind).toBe('group');
    expect(l1.children[0].children.map(e => e.eid)).toEqual([101, 102]);
    expect(l1.children[0].children[0].kind).toBe('element');
  });

  it('propagates element counts up the spatial chain', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    expect(root.count).toBe(4);              // 3 on L1 + 1 on L2
    const building = root.children[0].children[0];
    expect(building.children[0].count).toBe(3);
    expect(building.children[1].count).toBe(1);
  });

  it('assigns stable, unique keys usable for expand-state', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    const l1Walls = root.children[0].children[0].children[0].children[0];
    expect(l1Walls.key).toBe('1/2/3/10/g:IfcWall');
    expect(l1Walls.children[1].key).toBe('1/2/3/10/g:IfcWall/102');
  });
});

describe('filterOverviewTree', () => {
  it('returns the node untouched for an empty query', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    expect(filterOverviewTree(root, '  ')).toBe(root);
  });

  it('keeps ancestors of matching nodes and prunes the rest', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    const hit = filterOverviewTree(root, 'door');
    expect(hit).not.toBeNull();
    const l1 = hit!.children[0].children[0].children[0];
    expect(l1.children).toHaveLength(1);
    expect(l1.children[0].label).toBe('Door');
    // the storey without doors is pruned entirely
    expect(hit!.children[0].children[0].children).toHaveLength(1);
  });

  it('matches by expressID', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    const hit = filterOverviewTree(root, '#201');
    expect(hit).not.toBeNull();
    expect(hit!.children[0].children[0].children[0].children[0].children[0].eid).toBe(201);
  });

  it('returns null when nothing matches', () => {
    const root = buildOverviewTree(sampleRaw(), PRETTY);
    expect(filterOverviewTree(root, 'nonexistent-zzz')).toBeNull();
  });
});

describe('countStoreys', () => {
  it('counts storeys across the tree', () => {
    expect(countStoreys(buildOverviewTree(sampleRaw(), PRETTY))).toBe(2);
  });
});
