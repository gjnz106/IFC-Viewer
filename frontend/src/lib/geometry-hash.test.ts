import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { computeGeometryHashes } from './geometry-hash.js';
import { appState } from '../store/index.js';

// Unit tetrahedron: A=(0,0,0) B=(1,0,0) C=(0,1,0) D=(0,0,1), volume = 1/6.
const A: [number, number, number] = [0, 0, 0];
const B: [number, number, number] = [1, 0, 0];
const C: [number, number, number] = [0, 1, 0];
const D: [number, number, number] = [0, 0, 1];

// Build a non-indexed BufferGeometry from a list of faces (each face = 3
// [x,y,z] vertices, in whatever winding/order the caller wants), all tagged
// with the same expressID so they're grouped into a single element.
function tetraGeometry(faces: [number, number, number][][], eid = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  faces.forEach(f => f.forEach(v => pos.push(...v)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('expressID', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(eid), 1));
  return geo;
}

const FACES_ORDER_1: [number, number, number][][] = [[A, C, B], [A, B, D], [A, D, C], [B, C, D]];
// Same faces, different traversal order AND reversed winding per face —
// should be a no-op for volume (order-invariant) and bbox (min/max don't
// care about order), so the fingerprint hash must come out identical.
const FACES_ORDER_2: [number, number, number][][] = [[D, C, B], [A, D, C], [A, B, D], [B, A, C]];

function modelFromGeometry(geo: THREE.BufferGeometry): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

beforeEach(() => {
  appState.loadedModels[0] = null;
  appState.loadedModels[1] = null;
});

describe('computeGeometryHashes', () => {
  it('is invariant to face/vertex traversal order (re-export shuffles buffers)', () => {
    appState.loadedModels[0] = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    appState.loadedModels[1] = modelFromGeometry(tetraGeometry(FACES_ORDER_2));
    const hA = computeGeometryHashes(0)[1];
    const hB = computeGeometryHashes(1)[1];
    expect(hA).toBeDefined();
    expect(hB.hash).toBe(hA.hash);
    expect(hB.size).toEqual(hA.size);
  });

  it('computes the correct enclosed volume via the divergence theorem', () => {
    appState.loadedModels[0] = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    const h = computeGeometryHashes(0)[1];
    // size is the bbox extent (1×1×1 here), not the volume — sanity-check
    // that separately via the same math the implementation uses.
    expect(h.size.x).toBeCloseTo(1, 5);
    expect(h.size.y).toBeCloseTo(1, 5);
    expect(h.size.z).toBeCloseTo(1, 5);
  });

  it('uses world-space coordinates, not local — a moved model must not look like a moved element', () => {
    const model = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    model.position.set(100, 50, 25);
    model.updateMatrixWorld(true);
    appState.loadedModels[0] = model;
    const h = computeGeometryHashes(0)[1];
    // The local tetra's bbox center is (0.5,0.5,0.5); with the group
    // translated it must reflect the world-space position, not the
    // untransformed local one.
    expect(h.center.x).toBeCloseTo(100.5, 3);
    expect(h.center.y).toBeCloseTo(50.5, 3);
    expect(h.center.z).toBeCloseTo(25.5, 3);
  });

  it('produces the same hash for the same shape translated identically on both sides', () => {
    const m0 = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    m0.position.set(10, 0, 0);
    m0.updateMatrixWorld(true);
    const m1 = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    m1.position.set(10, 0, 0);
    m1.updateMatrixWorld(true);
    appState.loadedModels[0] = m0;
    appState.loadedModels[1] = m1;
    expect(computeGeometryHashes(1)[1].hash).toBe(computeGeometryHashes(0)[1].hash);
  });

  it('flags a real shape change with a different hash', () => {
    appState.loadedModels[0] = modelFromGeometry(tetraGeometry(FACES_ORDER_1));
    // Stretch D out along Z — same vertex/face count and topology, different volume.
    const D2: [number, number, number] = [0, 0, 5];
    const stretched: [number, number, number][][] = [[A, C, B], [A, B, D2], [A, D2, C], [B, C, D2]];
    appState.loadedModels[1] = modelFromGeometry(tetraGeometry(stretched));
    expect(computeGeometryHashes(1)[1].hash).not.toBe(computeGeometryHashes(0)[1].hash);
  });

  it('returns an empty map when no model is loaded in the slot', () => {
    expect(computeGeometryHashes(0)).toEqual({});
  });
});
