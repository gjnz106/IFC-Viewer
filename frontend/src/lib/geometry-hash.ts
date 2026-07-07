import * as THREE from 'three';
import { appState } from '../store/index.js';

// ── Per-element geometry fingerprint, used by Compare to flag geometry/size/
// position changes between two loaded models. Previously duplicated (and
// drifting) between compare.ts and federation-load.ts — this is the single
// source of truth for both.

export interface GeometryHashEntry {
  vertCount: number;
  hash: number;
  bboxStr: string;
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

// Quantization grain shared by the hash fingerprint AND the position/size
// "changed" thresholds compare.ts checks against (10mm). Using one constant
// for both means a hash mismatch can only happen when the underlying geometry
// differs by more than what the explicit numeric checks already consider
// significant — previously the hash quantized raw vertex samples to 1cm while
// the position/size checks compared un-quantized floats against a 10mm
// threshold, an inconsistency that could flip the hash for changes the
// explicit checks correctly judged as noise.
const QUANT_PER_METER = 100; // 1cm = 10mm buckets
const q = (n: number): number => Math.round(n * QUANT_PER_METER);

export function computeGeometryHashes(modelIdx: number): Record<number, GeometryHashEntry> {
  const hashes: Record<number, GeometryHashEntry> = {};
  const model = appState.loadedModels[modelIdx];
  if (!model) return hashes;

  model.traverse((c: any) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    const geo = c.geometry;
    const eidArr: ArrayLike<number> = geo.attributes.expressID.array;
    const posArr: ArrayLike<number> = geo.attributes.position.array;
    const idxArr: ArrayLike<number> | null = geo.index ? geo.index.array : null;
    // Transform to world space so federation slots / offset models compare
    // correctly — the old implementation hashed local coordinates, which
    // made "Position Moved" fire for elements whose model-level offset
    // differed even though the element hadn't actually moved.
    const wm: THREE.Matrix4 = c.matrixWorld;

    interface Stat { count: number; mnX: number; mnY: number; mnZ: number; mxX: number; mxY: number; mxZ: number; vol6: number; }
    const stats: Record<number, Stat> = {};
    const getStat = (eid: number): Stat => {
      let s = stats[eid];
      if (!s) s = stats[eid] = { count: 0, mnX: Infinity, mnY: Infinity, mnZ: Infinity, mxX: -Infinity, mxY: -Infinity, mxZ: -Infinity, vol6: 0 };
      return s;
    };

    const nVerts = posArr.length / 3;
    const worldPos = new Float32Array(posArr.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < nVerts; i++) {
      const eid = eidArr[i];
      const pi = i * 3;
      if (isNaN(posArr[pi])) continue;
      v.set(posArr[pi], posArr[pi + 1], posArr[pi + 2]).applyMatrix4(wm);
      worldPos[pi] = v.x; worldPos[pi + 1] = v.y; worldPos[pi + 2] = v.z;
      if (!eid || eid <= 0) continue;
      const s = getStat(eid);
      s.count++;
      if (v.x < s.mnX) s.mnX = v.x; if (v.x > s.mxX) s.mxX = v.x;
      if (v.y < s.mnY) s.mnY = v.y; if (v.y > s.mxY) s.mxY = v.y;
      if (v.z < s.mnZ) s.mnZ = v.z; if (v.z > s.mxZ) s.mxZ = v.z;
    }

    // Signed-volume-of-tetrahedra-from-origin sum (divergence theorem): summing
    // this over every face of a closed mesh gives 6× the enclosed volume,
    // independent of face/vertex traversal order — unlike sampling the first
    // 50 vertices in buffer order, which flips whenever the exporter re-orders
    // (or re-triangulates) identical geometry, producing false "Geometry
    // Changed" hits on a clean re-export.
    const faceCount = idxArr ? idxArr.length / 3 : Math.floor(nVerts / 3);
    for (let f = 0; f < faceCount; f++) {
      const ia = idxArr ? idxArr[f * 3] : f * 3;
      const ib = idxArr ? idxArr[f * 3 + 1] : f * 3 + 1;
      const ic = idxArr ? idxArr[f * 3 + 2] : f * 3 + 2;
      const eid = eidArr[ia];
      if (!eid || eid <= 0) continue;
      const pa = ia * 3, pb = ib * 3, pc = ic * 3;
      if (isNaN(worldPos[pa]) || isNaN(worldPos[pb]) || isNaN(worldPos[pc])) continue;
      const ax = worldPos[pa], ay = worldPos[pa + 1], az = worldPos[pa + 2];
      const bx = worldPos[pb], by = worldPos[pb + 1], bz = worldPos[pb + 2];
      const cx = worldPos[pc], cy = worldPos[pc + 1], cz = worldPos[pc + 2];
      const vol6 = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      getStat(eid).vol6 += vol6;
    }

    for (const [eidStr, s] of Object.entries(stats)) {
      const sx = s.mxX - s.mnX, sy = s.mxY - s.mnY, sz = s.mxZ - s.mnZ;
      const cx = (s.mnX + s.mxX) / 2, cy = (s.mnY + s.mxY) / 2, cz = (s.mnZ + s.mxZ) / 2;
      const volume = Math.abs(s.vol6) / 6;

      // Hash combines: vertex count + quantized volume + quantized bbox size.
      // All three are invariant to vertex/face ordering, unlike raw samples.
      const hashStr = `${s.count}|${q(volume)}|${q(sx)},${q(sy)},${q(sz)}`;
      let hash = 0;
      for (let i = 0; i < hashStr.length; i++) { hash = ((hash << 5) - hash) + hashStr.charCodeAt(i); hash |= 0; }

      hashes[parseInt(eidStr, 10)] = {
        vertCount: s.count,
        hash,
        bboxStr: `${sx.toFixed(2)}×${sy.toFixed(2)}×${sz.toFixed(2)} @(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)})`,
        size: { x: sx, y: sy, z: sz },
        center: { x: cx, y: cy, z: cz },
      };
    }
  });

  return hashes;
}
