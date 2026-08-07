// Diagnostic: logs every network request the page (and its workers) make, so a
// silent empty conversion can be traced to whatever 404s. Not part of the
// spike's output — delete along with the rest.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 5182;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill('SIGTERM'); } catch {} });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite timeout')), 60000);
  server.stdout.on('data', d => { if (String(d).includes('ready in') || String(d).includes('Local:')) { clearTimeout(t); res(); } });
});

const pre = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(pre) ? { executablePath: pre } : {});
const page = await browser.newPage();

const reqs = [];
page.on('response', r => reqs.push([r.status(), r.url()]));
page.on('requestfailed', r => reqs.push(['FAILED', r.url() + ' ' + r.failure()?.errorText]));
page.on('console', m => console.log(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.log('[pageerror] ' + e));
// Workers make their own requests that do not always surface on `page`.
page.on('worker', w => {
  console.log('[worker created] ' + w.url());
  w.on('close', () => console.log('[worker closed]'));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.setInputFiles('#file', join(root, 'sample.ifc'));
await page.click('#run');
await page.waitForSelector('.verdict', { timeout: 240000 });

console.log('\n=== requests with status >= 400 or failed ===');
for (const [s, u] of reqs) if (s === 'FAILED' || Number(s) >= 400) console.log(`  ${s}  ${u}`);
console.log('\n=== all wasm / worker requests ===');
for (const [s, u] of reqs) if (/wasm|worker/i.test(u)) console.log(`  ${s}  ${u}`);

await browser.close();
server.kill('SIGTERM');
process.exit(0);
