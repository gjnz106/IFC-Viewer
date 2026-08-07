// ── Spike UI wiring ──────────────────────────────────────────────────────
// Deliberately plain DOM: this is throwaway diagnostic code, and adding a
// framework would make it harder to read than the thing it is measuring.
import { runBaseline, type BaselineResult } from './baseline.js';
import { runFragments, type FragmentsResult } from './fragments-path.js';
import {
  checkGlobalIds, checkProperties, checkContextData, checkGeometry,
  overallVerdict, formatDuration, formatBytes, type Check,
} from './verdict.js';

const WASM_PATH = new URL('/wasm/', window.location.origin).href;

// Stamped into the report: a result is only meaningful against known versions,
// and these move fast enough that "it worked in the spike" needs a date on it.
const VERSIONS = '@thatopen/fragments 3.4.7 · web-ifc 0.0.77+ · three 0.182+';

const $ = (id: string) => document.getElementById(id)!;
const fileInput = $('file') as HTMLInputElement;
const allAttrsInput = $('allAttrs') as HTMLInputElement;
const runBtn = $('run') as HTMLButtonElement;
const statusEl = $('status');
const resultsEl = $('results');

let selectedFile: File | null = null;

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files?.[0] || null;
  runBtn.disabled = !selectedFile;
  statusEl.textContent = selectedFile
    ? `Ready: ${selectedFile.name} (${formatBytes(selectedFile.size)})`
    : '';
});

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderCheck(c: Check): string {
  return `<div class="check ${c.status}">
    <div class="check-head">
      <span class="badge ${c.status}">${c.status}</span>
      <strong>Check ${c.id} — ${esc(c.title)}</strong>
      ${c.blocking ? '<span class="blocking">blocking</span>' : ''}
    </div>
    <div class="headline">${esc(c.headline)}</div>
    <ul>${c.detail.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
  </div>`;
}

function renderMeasurements(base: BaselineResult, frag: FragmentsResult): string {
  // convertMs is paid once by the uploader; loadMs is paid by everyone, every
  // open. Presenting them in one column would hide exactly that distinction.
  const speedup = frag.loadMs > 0 ? (base.parseMs / frag.loadMs) : 0;
  // Fragment load carries a fixed worker-startup cost of roughly a second. On a
  // small model that dominates entirely and the ratio reads as a slowdown,
  // which would be a wrong conclusion — say so rather than showing "0.0×" bare.
  const tooSmallToTime = base.parseMs < 2000;
  const rows: [string, string][] = [
    ['IFC size', formatBytes(frag.ifcBytes)],
    ['Fragment size', `${formatBytes(frag.fragBytes)} (${((frag.fragBytes / frag.ifcBytes) * 100).toFixed(0)}% of IFC)`],
    ['— — —', '— — —'],
    ['IFC parse (today, every open)', formatDuration(base.parseMs)],
    ['Fragment load (after migration, every open)', formatDuration(frag.loadMs)],
    ['Speed-up on the path users feel', speedup > 0 ? `${speedup.toFixed(1)}×` : 'n/a'],
    ...(tooSmallToTime
      ? [['⚠ Timing note', 'This model parses in under 2 s, so fragment load is dominated by fixed worker startup (~1 s) and the speed-up figure is meaningless. Re-run on a model that takes real time to parse.'] as [string, string]]
      : []),
    ['— — —', '— — —'],
    ['IFC → fragment convert (paid once)', formatDuration(frag.convertMs)],
    ['Total lines in IFC', String(base.totalLines)],
  ];
  return `<h2>Measurements</h2><table>${rows.map(([k, v]) =>
    k.startsWith('—') ? '<tr class="sep"><td colspan="2"></td></tr>'
      : `<tr><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`).join('')}</table>`;
}

runBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  runBtn.disabled = true;
  resultsEl.innerHTML = '';
  const includeAll = allAttrsInput.checked;

  try {
    setStatus('Reading file…');
    const bytes = new Uint8Array(await selectedFile.arrayBuffer());

    // Baseline first: if this throws, the file itself is the problem, not
    // fragments, and saying so plainly saves a wrong conclusion.
    const base = await runBaseline(bytes, WASM_PATH, setStatus);
    // Fresh copy — OpenModel may consume/detach the buffer.
    const bytes2 = new Uint8Array(await selectedFile.arrayBuffer());
    const frag = await runFragments(bytes2, WASM_PATH, includeAll, setStatus);

    setStatus('Evaluating…');
    const checks: Check[] = [
      checkGlobalIds(base, frag),
      checkProperties(base, frag, includeAll),
      checkContextData(base, frag),
      checkGeometry(frag),
    ];
    const verdict = overallVerdict(checks);

    resultsEl.innerHTML = `
      <div class="verdict ${verdict.status}">
        <div class="verdict-badge">${verdict.status}</div>
        <div class="verdict-msg">${esc(verdict.message)}</div>
      </div>
      ${renderMeasurements(base, frag)}
      <h2>Checks</h2>
      ${checks.map(renderCheck).join('')}
      ${frag.warnings.length ? `<h2>Warnings</h2><ul>${frag.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <p class="foot">Config: importer ${includeAll ? 'WITH addAllAttributes() + addAllRelations()' : 'at DEFAULTS'} · ${esc(VERSIONS)}</p>
    `;
    setStatus('Done.');
  } catch (e: any) {
    console.error(e);
    resultsEl.innerHTML = `<div class="verdict FAIL"><div class="verdict-badge">ERROR</div>
      <div class="verdict-msg">${esc(e?.message || String(e))}</div></div>
      <p class="foot">A crash here is itself a finding — check the console. If the baseline threw, the file may be malformed; if the fragments path threw, note the exact message before concluding anything about the format.</p>`;
    setStatus('Failed — see above.');
  } finally {
    runBtn.disabled = false;
  }
});
