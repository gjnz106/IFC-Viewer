#!/usr/bin/env tsx
// Type-checks the standalone app as a single unit. The src/app/*.ts feature
// files share one scope and are split mid-construct across file boundaries
// (e.g. a function opens in one file and closes in the next), so they can
// only be parsed concatenated. This script assembles the same bundle build.ts
// produces, writes it to a temp file, and runs `tsc --noEmit` over it.
import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/app');
const stripOne = (s: string): string => (s.endsWith('\n') ? s.slice(0, -1) : s);

const IMPORT_HEADER = [
  "import * as THREE from 'three';",
  "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
  "import { IFCLoader } from 'web-ifc-three';",
  'import { IFCSPACE, IFCOPENINGELEMENT, IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT } from \'web-ifc\';',
].join('\n');

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
const bundle = IMPORT_HEADER + '\n' + files.map((f) => stripOne(readFileSync(join(SRC, f), 'utf8'))).join('\n');

const tmp = join(ROOT, '.standalone-bundle.ts');
writeFileSync(tmp, bundle);
try {
  execFileSync(
    'npx',
    ['tsc', '--noEmit', '--skipLibCheck', '--target', 'ES2020', '--module', 'ESNext',
      '--moduleResolution', 'Bundler', '--lib', 'ES2020,DOM,DOM.Iterable',
      '--strict', 'false', '--noImplicitAny', 'false',
      tmp, join(SRC, 'globals.d.ts')],
    { cwd: ROOT, stdio: 'inherit' },
  );
  console.log('Standalone bundle type-check passed.');
} catch {
  process.exitCode = 1;
} finally {
  rmSync(tmp, { force: true });
}
