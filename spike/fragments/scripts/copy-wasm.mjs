// Copies the web-ifc WASM next to the app so both the baseline IfcAPI and the
// fragments IfcImporter load the build that matches the bundled glue. Same
// reason as frontend/scripts/copy-wasm.mjs: a version-mismatched wasm fails
// with "expected magic word" or a LinkError, and a CDN fallback can be blocked.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'node_modules', 'web-ifc');
const to = join(here, '..', 'public', 'wasm');

mkdirSync(to, { recursive: true });

let copied = 0;
for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc-mt.worker.js']) {
  const src = join(from, f);
  if (!existsSync(src)) continue; // -mt variants are optional
  copyFileSync(src, join(to, f));
  copied++;
}

if (!copied) {
  console.error('[copy-wasm] found no wasm in node_modules/web-ifc — run npm install first');
  process.exit(1);
}
console.log(`[copy-wasm] copied ${copied} file(s) to public/wasm/`);
