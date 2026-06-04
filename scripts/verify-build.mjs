#!/usr/bin/env node
// Verifies the committed build is consistent with its sources, and that
// index.html wires the modules in a load order the browser accepts.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok   = m => console.log('  ok  ' + m);
const bad  = m => { console.error('  FAIL ' + m); failed++; };

// 1. js/app.js must equal a fresh concatenation of src/app/*.js
const SRC = join(ROOT, 'src/app');
const stripOne = s => s.endsWith('\n') ? s.slice(0, -1) : s;
const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
const fresh = files.map(f => stripOne(readFileSync(join(SRC, f), 'utf8'))).join('\n');
const onDisk = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
fresh === onDisk
  ? ok(`js/app.js is up to date with ${files.length} sources`)
  : bad('js/app.js is stale — run `node build.mjs`');

// 2. index.html wiring + load order (importmap before module scripts)
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const need = ['css/styles.css', 'js/auth.js', 'js/app.js', '<script type="importmap">'];
for (const n of need) html.includes(n) ? ok(`references ${n}`) : bad(`missing ${n}`);
const iMap = html.indexOf('<script type="importmap">');
const iApp = html.indexOf('src="js/app.js"');
iMap !== -1 && iMap < iApp
  ? ok('importmap precedes the app module script')
  : bad('importmap must come before <script type="module" src="js/app.js">');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
