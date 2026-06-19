#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
//  IFC Delta — standalone build
//  Assembles the editable per-feature TypeScript sources in src/app/*.ts into
//  the single deployable module js/app.js (loaded/inlined by index.html), and
//  transpiles js/auth.ts → js/auth.js.
//
//  The src/app files share ONE module scope: they are concatenated in order
//  (01, 02, …) into a single TypeScript unit — exactly as when everything
//  lived inline — so the feature files keep sharing state/functions with no
//  import/export rewiring. esbuild then strips the TypeScript types and emits
//  plain ESM JavaScript.
//
//      npm run build:standalone     # regenerates js/app.js + js/auth.js
//
//  GitHub Pages serves the committed js/app.js directly; the build is a
//  dev-time convenience for regenerating it after editing the sources.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src', 'app');

// CDN imports injected at the top of the concatenated bundle. They live here
// (not in the sources) so the src/app/*.ts files stay in shared script scope
// for type-checking; at runtime the import map in index.html resolves them.
const IMPORT_HEADER = [
  "import * as THREE from 'three';",
  "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
  "import { IFCLoader } from 'web-ifc-three';",
  'import { IFCSPACE, IFCOPENINGELEMENT, IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT } from \'web-ifc\';',
].join('\n');

// Each source is stored with a single trailing newline; strip it so the
// concatenation joins cleanly with '\n' (reproducing the original module).
const stripOne = (s: string): string => (s.endsWith('\n') ? s.slice(0, -1) : s);

// Transpile a TypeScript string to ESM JavaScript, preserving syntax/comments
// (target esnext + no minify) so the emitted file stays readable and close to
// the source — it is the artifact GitHub Pages serves.
async function tsToJs(code: string, sourcefile: string): Promise<string> {
  const out = await transform(code, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
    sourcefile,
    legalComments: 'inline',
  });
  return out.code;
}

async function main(): Promise<void> {
  // 1. App: concat src/app/*.ts (one shared scope) → transpile → js/app.js
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
  if (!files.length) {
    console.error('No source files found in src/app/');
    process.exit(1);
  }
  const appTs = IMPORT_HEADER + '\n' + files.map((f) => stripOne(readFileSync(join(SRC, f), 'utf8'))).join('\n');
  const appJs = await tsToJs(appTs, 'app.ts');
  writeFileSync(join(ROOT, 'js', 'app.js'), appJs);
  console.log(`Built js/app.js from ${files.length} TypeScript sources (${appJs.length} bytes):`);
  for (const f of files) console.log('  •', f);

  // 2. Auth: js/auth.ts → js/auth.js
  const authJs = await tsToJs(readFileSync(join(ROOT, 'js', 'auth.ts'), 'utf8'), 'auth.ts');
  writeFileSync(join(ROOT, 'js', 'auth.js'), authJs);
  console.log(`Built js/auth.js (${authJs.length} bytes).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
