#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  IFC Delta — vendor fetch
//  Mirrors the exact third-party ES modules + WASM that the standalone build
//  used to pull from jsdelivr at runtime into a same-origin `vendor/` folder.
//
//  WHY: index.html previously resolved `three`, `web-ifc`, `web-ifc-three`,
//  etc. via an import map pointing at cdn.jsdelivr.net, and web-ifc loaded its
//  WASM from jsdelivr too. If that CDN is blocked by a firewall / regional
//  policy or has an outage, every ES-module import fails and the whole app
//  silently renders a blank page. Serving these assets from our own origin
//  (ifc.t3lab.space, via Vercel/Firebase) removes that single point of
//  failure. The committed copies in `vendor/` are the source of truth; this
//  script only regenerates them (e.g. when bumping a version).
//
//      node scripts/fetch-vendor.mjs            # download only if missing
//      node scripts/fetch-vendor.mjs --force    # always re-download
//
//  The pinned versions below MUST match the ones referenced by the import map
//  in index.html and `setWasmPath()` in src/app/07-section-visibility.ts.
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');
const FORCE = process.argv.includes('--force');

// pinned versions — keep in sync with index.html import map
const THREE = '0.160.0';
const MESH_BVH = '0.5.23';
const WEB_IFC = '0.0.57';
const WEB_IFC_THREE = '0.0.126';

// [ remote CDN url, local path under vendor/ ]
const FILES = [
  [`https://cdn.jsdelivr.net/npm/three@${THREE}/build/three.module.js`, 'three/three.module.js'],
  [`https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/controls/OrbitControls.js`, 'three/addons/controls/OrbitControls.js'],
  [`https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/utils/BufferGeometryUtils.js`, 'three/addons/utils/BufferGeometryUtils.js'],
  [`https://cdn.jsdelivr.net/npm/three-mesh-bvh@${MESH_BVH}/build/index.module.js`, 'three-mesh-bvh/index.module.js'],
  [`https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC}/web-ifc-api.js`, 'web-ifc/web-ifc-api.js'],
  [`https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC}/web-ifc.wasm`, 'web-ifc/web-ifc.wasm'],
  [`https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC}/web-ifc-mt.wasm`, 'web-ifc/web-ifc-mt.wasm'],
  [`https://cdn.jsdelivr.net/npm/web-ifc-three@${WEB_IFC_THREE}/IFCLoader.js`, 'web-ifc-three/IFCLoader.js'],
];

async function fetchToFile(url, destRel) {
  const dest = join(VENDOR, destRel);
  if (!FORCE && existsSync(dest) && statSync(dest).size > 0) {
    console.log('  • skip (exists)', destRel);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  • ${destRel} (${buf.length} bytes)`);
}

async function main() {
  mkdirSync(VENDOR, { recursive: true });
  console.log(`Fetching vendor assets${FORCE ? ' (--force)' : ''}:`);
  for (const [url, destRel] of FILES) {
    await fetchToFile(url, destRel);
  }
  console.log('Vendor assets ready in vendor/.');
}

main().catch((e) => {
  console.error('fetch-vendor failed:', e.message);
  process.exit(1);
});
