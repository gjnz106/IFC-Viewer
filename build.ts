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
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform, build as esbuild } from 'esbuild';

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

  // 2. Auth: frontend/src/lib/auth.ts → js/auth.js
  // Firebase is BUNDLED in from node_modules (not loaded from gstatic at
  // runtime) so the auth flow has zero third-party-CDN dependency — a blocked
  // or down gstatic.com can no longer prevent the app from loading.
  const authOut = await esbuild({
    entryPoints: [join(ROOT, 'frontend', 'src', 'lib', 'auth.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const authJs = authOut.outputFiles[0].text;
  writeFileSync(join(ROOT, 'js', 'auth.js'), authJs);
  console.log(`Built js/auth.js (Firebase bundled) from frontend/src/lib/auth.ts (${authJs.length} bytes).`);

  // 2b. jsPDF: bundle from node_modules → vendor/jspdf/jspdf.esm.js
  // PDF export (src/app/18-validator-export.ts) dynamically imports this at
  // runtime. Bundling it from npm (instead of jsdelivr's +esm endpoint, which
  // chains to further CDN sub-requests) keeps the export feature CDN-free.
  const jspdfOut = await esbuild({
    stdin: { contents: "export { jsPDF } from 'jspdf';", resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const jspdfDir = join(ROOT, 'vendor', 'jspdf');
  if (!existsSync(jspdfDir)) mkdirSync(jspdfDir, { recursive: true });
  const jspdfJs = jspdfOut.outputFiles[0].text;
  writeFileSync(join(jspdfDir, 'jspdf.esm.js'), jspdfJs);
  console.log(`Built vendor/jspdf/jspdf.esm.js from npm (${jspdfJs.length} bytes).`);

  // 3. CSS: frontend/public/css/styles.css → css/styles.css
  const cssDestDir = join(ROOT, 'css');
  if (!existsSync(cssDestDir)) {
    mkdirSync(cssDestDir, { recursive: true });
  }
  const cssSrc = join(ROOT, 'frontend', 'public', 'css', 'styles.css');
  const cssDest = join(cssDestDir, 'styles.css');
  copyFileSync(cssSrc, cssDest);
  console.log(`Copied CSS to ${cssDest} (${statSync(cssSrc).size} bytes).`);

  // 4. HTML: generate root index.html from frontend/index.html
  // The frontend HTML targets the Vite dev server (CSS at /css/styles.css,
  // entry at /src/main.ts). For standalone deploy we:
  //   a) Fix the CSS link to be root-relative (remove leading /)
  //   b) Inject the boot-watchdog script (extract from any pre-existing root
  //      index.html if present, otherwise skip — first build only)
  //   c) Replace the Vite entry <script> with the vendor import map + js/auth.js + js/app.js
  const frontendHtml = readFileSync(join(ROOT, 'frontend', 'index.html'), 'utf8');
  let rootHtml = frontendHtml;

  // a) Fix CSS link
  rootHtml = rootHtml.replace(
    '<link rel="stylesheet" href="/css/styles.css">',
    '<link rel="stylesheet" href="css/styles.css">',
  );

  // b) Inject boot watchdog — extract from the existing root index.html so we
  //    don't have to re-escape the regex literals embedded in the watchdog JS.
  const rootHtmlPath = join(ROOT, 'index.html');
  if (existsSync(rootHtmlPath)) {
    const existingRoot = readFileSync(rootHtmlPath, 'utf8');
    const wdStart = existingRoot.indexOf('<!-- ── Boot watchdog');
    const wdEnd   = existingRoot.indexOf('</script>', wdStart) + '</script>'.length;
    if (wdStart !== -1 && wdEnd > wdStart) {
      const watchdog = existingRoot.slice(wdStart, wdEnd);
      rootHtml = rootHtml.replace('</head>', watchdog + '\n</head>');
    }
  }

  // c) Replace Vite entry with standalone import map + scripts
  const standaloneScripts =
    '<!-- Self-hosted ES modules (mirrored under /vendor/ by scripts/fetch-vendor.mjs).\n' +
    '     Served from our own origin so a blocked/down third-party CDN can never\n' +
    '     blank the app. Keep these paths in sync with scripts/fetch-vendor.mjs. -->\n' +
    '<script type="importmap">\n' +
    '{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/",' +
    '"three/examples/jsm/utils/BufferGeometryUtils":"/vendor/three/addons/utils/BufferGeometryUtils.js",' +
    '"three-mesh-bvh":"/vendor/three-mesh-bvh/index.module.js",' +
    '"web-ifc":"/vendor/web-ifc/web-ifc-api.js","web-ifc-three":"/vendor/web-ifc-three/IFCLoader.js"}}\n' +
    '</script>\n' +
    '<script type="module" src="js/auth.js"></script>\n' +
    '<script type="module" src="js/app.js"></script>';
  rootHtml = rootHtml.replace('<script type="module" src="/src/main.ts"></script>', standaloneScripts);

  writeFileSync(rootHtmlPath, rootHtml);
  console.log(`Generated root index.html from frontend/index.html (${rootHtml.length} bytes).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
