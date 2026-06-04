#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  IFC Delta — build
//  Assembles the editable per-feature sources in src/app/*.js into the single
//  deployable module js/app.js (loaded by index.html).
//
//  The concatenation reproduces ONE module scope, so the feature files keep
//  sharing state/functions exactly as they did when everything lived inline —
//  no import/export rewiring required. Edit files in src/app/, then run:
//
//      node build.mjs        # or:  npm run build
//
//  GitHub Pages serves the committed js/app.js directly; the build is only a
//  dev-time convenience for regenerating it after editing the sources.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC  = join(ROOT, 'src', 'app');
const OUT  = join(ROOT, 'js', 'app.js');

const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
if (!files.length) {
  console.error('No source files found in src/app/');
  process.exit(1);
}

// Each source file is stored with a single trailing newline; strip it so the
// concatenation joins cleanly with '\n' (reproducing the original module).
const stripOne = s => s.endsWith('\n') ? s.slice(0, -1) : s;
const appJs = files.map(f => stripOne(readFileSync(join(SRC, f), 'utf8'))).join('\n');

writeFileSync(OUT, appJs);
console.log(`Built js/app.js from ${files.length} sources (${appJs.length} bytes):`);
for (const f of files) console.log('  •', f);
