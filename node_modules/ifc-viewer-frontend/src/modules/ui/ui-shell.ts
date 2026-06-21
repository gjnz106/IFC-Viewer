// ── UI shell controls ────────────────────────────────────────────────
// Small header/panel handlers that were previously an inline <script> in
// index.html. They only touch the DOM, so they live here as a leaf module
// with no app-state dependencies. Exposed on window because the markup
// wires them through onclick="…" attributes.

// Panel toggles — the button's active (dark) state always mirrors whether
// its panel is visible. Uses computed display so it can't desync from the
// initial inline styles.
function setPanel(panelId: string, btnId: string, open: boolean): void {
  const p = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!p || !btn) return;
  p.style.display = open ? 'flex' : 'none';
  if (open) p.style.flexDirection = 'column';
  btn.classList.toggle('hdr-panel-btn-active', open);
}

window.toggleLeftPanel = function (): void {
  const p = document.getElementById('leftPanel');
  if (!p) return;
  setPanel('leftPanel', 'btnToggleLeft', getComputedStyle(p).display === 'none');
};

window.toggleRightPanel = function (): void {
  const p = document.getElementById('rightPanel');
  if (!p) return;
  setPanel('rightPanel', 'btnToggleRight', getComputedStyle(p).display === 'none');
};

window.toggleExportMenu = function (): void {
  const d = document.getElementById('exportMenuDrop') as HTMLElement | null;
  const bg = document.getElementById('exportMenuBg') as HTMLElement | null;
  if (!d || !bg) return;
  const open = d.style.display !== 'none';
  d.style.display = open ? 'none' : 'block';
  bg.style.display = open ? 'none' : 'block';
};

// Reveal the Properties (right) panel and light its toggle. Called when an
// element is selected so its properties are visible even though the panel
// starts closed. No-op in Field Mode, which mirrors properties into its own
// bottom sheet instead.
window.openRightPanel = function (): void {
  if (document.body.classList.contains('field-mode')) return;
  const p = document.getElementById('rightPanel');
  if (!p) return;
  p.style.display = 'flex';
  p.style.flexDirection = 'column';
  document.getElementById('btnToggleRight')?.classList.add('hdr-panel-btn-active');
};

// Auto-open the Properties panel whenever real property content is rendered
// into #propArea (any selection path: 3D click, compare, clash, search, …).
// Empty/placeholder states use the `.prop-empty` class, so they don't trigger
// it. Only opens — never auto-closes — so it can't fight a manual toggle.
(() => {
  const propArea = document.getElementById('propArea');
  if (!propArea) return;
  new MutationObserver(() => {
    if (!propArea.querySelector('.prop-empty') && propArea.children.length > 0) {
      window.openRightPanel!();
    }
  }).observe(propArea, { childList: true });
})();

// Colorize "Color by" segmented control — drives the (hidden) #czProp select
// that colorize.ts reads, then re-applies the colorize pass.
window.colorizeSetProp = function (v: string): void {
  const sel = document.getElementById('czProp') as HTMLSelectElement | null;
  if (sel) sel.value = v;
  document.querySelectorAll('#czSeg .cz-seg-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-v') === v);
  });
  if ((window as any).applyColorize) (window as any).applyColorize();
};
