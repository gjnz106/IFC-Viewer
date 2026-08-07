// Verifies the SHIPPED bundle (dist/, served statically) rather than the dev
// server — that is what the user actually runs, and a build-only path can break
// in ways `npm run dev` never shows (worker URL rewriting, asset base paths).
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// resolve(), not join(): the argument is often an absolute path, and join()
// would splice it onto the cwd instead of replacing it.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
const sample = join(root, 'sample.ifc');
const PORT = 8078;

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`[verify] no index.html in ${dist} — run: npm run build`);
  process.exit(1);
}
if (!existsSync(sample)) {
  console.error('[verify] sample.ifc missing — run: node scripts/make-sample-ifc.mjs');
  process.exit(1);
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: dist, stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise(r => setTimeout(r, 1500));

const pre = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(pre) ? { executablePath: pre } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let failed = false;
try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.setInputFiles('#file', sample);
  await page.click('#run');
  await page.waitForSelector('.verdict', { timeout: 240_000 });
  const badge = (await page.textContent('.verdict-badge'))?.trim();
  console.log('[verify] bundle verdict: ' + badge);
  for (const el of await page.$$('.check')) {
    const head = await el.$eval('.check-head', n => n.textContent?.replace(/\s+/g, ' ').trim());
    console.log('[verify]   ' + head);
  }
  if (badge === 'ERROR') { console.error('[verify] the bundle errored'); failed = true; }
} catch (e) {
  console.error('[verify] FAILED:', e.message);
  failed = true;
} finally {
  if (errors.length) { console.error('[verify] page errors:'); errors.slice(0, 8).forEach(e => console.error('  ' + e)); failed = true; }
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
