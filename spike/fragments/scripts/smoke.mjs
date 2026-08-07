// Smoke test: starts the dev server, drives the page in Chromium with the
// synthetic sample, and fails loudly if the run errors or the verdict block
// never appears. This only proves the HARNESS works — the real answer comes
// from running it manually against your own models.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const sample = join(root, 'sample.ifc');
const PORT = 5181;

if (!existsSync(sample)) {
  console.error('[smoke] sample.ifc missing — run: node scripts/make-sample-ifc.mjs');
  process.exit(1);
}

// No --strictPort: a leftover server from an interrupted run would otherwise
// make this fail with "port in use" rather than doing its job. The real port
// is read back from vite's own output.
const server = spawn('npx', ['vite', '--port', String(PORT)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
});
const stop = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

const baseUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not start in 60s')), 60_000);
  let buf = '';
  server.stdout.on('data', (d) => {
    buf += String(d);
    const m = buf.match(/Local:\s+(http:\/\/[^\s/]+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
  server.stderr.on('data', (d) => process.stderr.write('[vite] ' + d));
  server.on('exit', (c) => { clearTimeout(timer); reject(new Error('vite exited early, code ' + c)); });
});
console.log('[smoke] dev server at ' + baseUrl);

// Use the environment's pre-installed Chromium when present: its build number
// need not match what this playwright version would download, and there is no
// reason to fetch a second browser just to run a smoke test.
const preinstalled = '/opt/pw-browsers/chromium'; // symlink to the real binary
const browser = await chromium.launch(
  existsSync(preinstalled) ? { executablePath: preinstalled } : {},
);
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
  // The library and the spike both log diagnostics here; swallowing them is
  // how the first runs turned a setup failure into a mysterious empty result.
  else if (m.text().startsWith('[spike]') || m.type() === 'warning') console.log('[browser] ' + m.text());
});
// A bare "404 (Not Found)" console line is useless without the URL — a missing
// wasm or worker is the most likely cause of a silent empty conversion.
page.on('requestfailed', (r) => pageErrors.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) pageErrors.push(`HTTP ${r.status()}: ${r.url()}`); });

let failed = false;
try {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.setInputFiles('#file', sample);
  await page.click('#run');

  // The verdict block is only rendered on completion (success or error).
  await page.waitForSelector('.verdict', { timeout: 240_000 });
  const status = await page.textContent('.verdict-badge');
  const message = await page.textContent('.verdict-msg');
  console.log(`\n[smoke] verdict badge: ${status}`);
  console.log(`[smoke] verdict message: ${message?.trim()}\n`);

  if (status?.trim() === 'ERROR') {
    console.error('[smoke] the spike itself errored — the harness is broken, not the format.');
    failed = true;
  }

  // Echo each check so a broken extraction path shows up here rather than
  // silently reporting "0 elements matched" as if it were a real finding.
  for (const el of await page.$$('.check')) {
    const head = await el.$eval('.check-head', n => n.textContent?.replace(/\s+/g, ' ').trim());
    const headline = await el.$eval('.headline', n => n.textContent?.trim());
    console.log(`\n[smoke] ${head}\n        ${headline}`);
    for (const li of await el.$$('li')) console.log('          - ' + (await li.textContent())?.trim());
  }
  const measurements = await page.$('table');
  if (measurements) console.log('\n[smoke] measurements:\n' + (await measurements.textContent())?.replace(/\s{2,}/g, ' | '));
} catch (e) {
  console.error('[smoke] FAILED:', e.message);
  failed = true;
} finally {
  if (pageErrors.length) {
    console.error('\n[smoke] page errors:');
    for (const e of pageErrors.slice(0, 10)) console.error('  ' + e);
    failed = true;
  }
  await browser.close();
  stop();
}

process.exit(failed ? 1 : 0);
