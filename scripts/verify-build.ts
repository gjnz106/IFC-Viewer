#!/usr/bin/env tsx
// Verifies the committed standalone build is consistent with its TypeScript
// sources, and that index.html carries the wiring the browser needs.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (m: string): void => console.log('  ok  ' + m);
const bad = (m: string): void => { console.error('  FAIL ' + m); failed++; };

const stripOne = (s: string): string => (s.endsWith('\n') ? s.slice(0, -1) : s);

// Must match build.ts's injected CDN import header.
const IMPORT_HEADER = [
  "import * as THREE from 'three';",
  "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
  "import { IFCLoader } from 'web-ifc-three';",
  'import { IFCSPACE, IFCOPENINGELEMENT, IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT } from \'web-ifc\';',
].join('\n');
const tsToJs = (code: string, sourcefile: string): Promise<string> =>
  transform(code, { loader: 'ts', format: 'esm', target: 'esnext', sourcefile, legalComments: 'inline' })
    .then((r) => r.code);

async function main(): Promise<void> {
  // 1. js/app.js must equal a fresh transpile of the concatenated src/app/*.ts
  const SRC = join(ROOT, 'src/app');
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
  const appTs = IMPORT_HEADER + '\n' + files.map((f) => stripOne(readFileSync(join(SRC, f), 'utf8'))).join('\n');
  const freshApp = await tsToJs(appTs, 'app.ts');
  readFileSync(join(ROOT, 'js/app.js'), 'utf8') === freshApp
    ? ok(`js/app.js is up to date with ${files.length} TypeScript sources`)
    : bad('js/app.js is stale — run `npm run build:standalone`');

  // 2. js/auth.js must equal a fresh transpile of js/auth.ts
  const freshAuth = await tsToJs(readFileSync(join(ROOT, 'js/auth.ts'), 'utf8'), 'auth.ts');
  readFileSync(join(ROOT, 'js/auth.js'), 'utf8') === freshAuth
    ? ok('js/auth.js is up to date with js/auth.ts')
    : bad('js/auth.js is stale — run `npm run build:standalone`');

  // 3. index.html wiring. The standalone references external CSS/JS,
  //    so check for the stylesheet, the auth module, the app module, and
  //    the import map.
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const need = ['css/styles.css', 'js/auth.js', 'js/app.js', '<script type="importmap">'];
  for (const n of need) {
    html.includes(n) ? ok(`references ${n}`) : bad(`missing ${n}`);
  }
  const iMap = html.indexOf('<script type="importmap">');
  const iApp = html.indexOf('src="js/app.js"');
  iMap !== -1 && iApp !== -1 && iMap < iApp
    ? ok('importmap precedes the app module script')
    : bad('importmap must come before <script type="module" src="js/app.js">');

  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
