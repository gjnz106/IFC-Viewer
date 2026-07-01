/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — SIDE-BY-SIDE COMPARE SLIDER (plan 3)
   ───────────────────────────────────────────────────────────────────────
   Chế độ so sánh dạng thanh trượt: một viewport chia đôi bằng đường trượt kéo
   được — nửa trái hiện model A, nửa phải hiện model B, cùng một camera. Nhờ mọi
   mesh đã gắn userData.srcModelIdx (0=A, 1=B), ta render scene 2 lần mỗi frame
   với scissor: trái giới hạn vùng A, phải vùng B.

   Tích hợp render loop: viewer-core gọi window.__compareSplitRender() ở cuối loop;
   nếu trả true nghĩa là đã tự render (bỏ qua render thường).
═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';

let active = false;
let dividerFrac = 0.5;              // vị trí đường trượt (0..1 theo bề ngang)
let overlay: HTMLElement | null = null;

function collectByModel(): { a: any[]; b: any[] } {
  const a: any[] = [], b: any[] = [];
  appState.scene.traverse((c: any) => {
    if (!c.isMesh) return;
    const mi = c.userData?.srcModelIdx;
    if (mi === 0) a.push(c); else if (mi === 1) b.push(c);
  });
  return { a, b };
}

// Gọi từ render loop. Trả true nếu đã tự render (loop bỏ render thường).
function renderSplit(): boolean {
  if (!active) return false;
  const r = appState.renderer, scene = appState.scene, cam = appState.camera;
  if (!r || !scene || !cam) return false;

  const size = r.getSize(new THREE.Vector2());
  const W = size.x, H = size.y;
  const split = Math.round(W * dividerFrac);
  const { a, b } = collectByModel();
  // Không có đủ 2 model → thoát chế độ split cho an toàn.
  if (a.length === 0 && b.length === 0) { exitSplit(); return false; }

  const aVis = a.map(m => m.visible), bVis = b.map(m => m.visible);

  // scissorTest bật + autoClear mặc định → clear() của mỗi render bị giới hạn
  // đúng vùng scissor, nên 2 vùng không xoá đè lên nhau.
  r.setScissorTest(true);
  r.setViewport(0, 0, W, H);

  // Nửa trái: model A (ẩn B)
  for (const m of b) m.visible = false;
  r.setScissor(0, 0, split, H);
  r.render(scene, cam);

  // Nửa phải: model B (khôi phục B, ẩn A)
  for (let i = 0; i < b.length; i++) b[i].visible = bVis[i];
  for (const m of a) m.visible = false;
  r.setScissor(split, 0, W - split, H);
  r.render(scene, cam);

  // Khôi phục hiển thị gốc + reset state
  for (let i = 0; i < a.length; i++) a[i].visible = aVis[i];
  r.setScissorTest(false);
  r.setViewport(0, 0, W, H);
  return true;
}
(window as any).__compareSplitRender = renderSplit;

function positionDivider(): void {
  const d = overlay?.querySelector('.cmp-split-divider') as HTMLElement | null;
  if (d) d.style.left = (dividerFrac * 100) + '%';
}

function buildOverlay(): void {
  const host = document.getElementById('vpCanvas');
  if (!host) return;
  overlay = document.createElement('div');
  overlay.className = 'cmp-split-overlay';
  overlay.innerHTML =
    '<div class="cmp-split-label cmp-split-a">A</div>' +
    '<div class="cmp-split-label cmp-split-b">B</div>' +
    '<div class="cmp-split-divider"><div class="cmp-split-handle">⟺</div></div>';
  host.appendChild(overlay);
  positionDivider();

  const handle = overlay.querySelector('.cmp-split-handle') as HTMLElement;
  const onMove = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    let f = (e.clientX - rect.left) / rect.width;
    f = Math.max(0.05, Math.min(0.95, f));
    dividerFrac = f;
    positionDivider();
  };
  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
  };
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();   // đừng để OrbitControls xoay
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
  });
}

function exitSplit(): void {
  active = false;
  if (overlay) { overlay.remove(); overlay = null; }
  document.getElementById('btnCompareSlider')?.classList.remove('active');
}

function toggleCompareSlider(): void {
  if (active) { exitSplit(); return; }
  if (!appState.loadedModels[0] || !appState.loadedModels[1]) {
    log('Compare slider: cần 2 model (A và B) được load trước.');
    return;
  }
  active = true;
  buildOverlay();
  document.getElementById('btnCompareSlider')?.classList.add('active');
}
(window as any).toggleCompareSlider = toggleCompareSlider;

// ── CSS + nút trên vp-toolbar (không cần sửa index.html) ──
function injectStyle(): void {
  if (document.getElementById('cmp-split-style')) return;
  const s = document.createElement('style');
  s.id = 'cmp-split-style';
  s.textContent = `
  .cmp-split-overlay{position:absolute;inset:0;pointer-events:none;z-index:5}
  .cmp-split-label{position:absolute;top:12px;padding:3px 11px;border-radius:8px;font:700 12px/1.4 inherit;color:#fff}
  .cmp-split-a{left:12px;background:rgba(37,99,235,.9)}
  .cmp-split-b{right:12px;background:rgba(220,38,38,.9)}
  .cmp-split-divider{position:absolute;top:0;bottom:0;width:0;border-left:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.3);transform:translateX(-1px)}
  .cmp-split-handle{position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:#fff;color:#1a1d26;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:ew-resize;pointer-events:auto;user-select:none}`;
  document.head.appendChild(s);
}

function injectButton(): void {
  const tb = document.getElementById('vpToolbar');
  if (!tb || document.getElementById('btnCompareSlider')) return;
  const grp = document.createElement('div');
  grp.className = 'vp-tg';
  grp.innerHTML =
    '<button id="btnCompareSlider" class="vp-tool" title="Side-by-side compare (A | B)" onclick="toggleCompareSlider()">' +
    '<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round">' +
    '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16"/><path d="M8.5 10l-2 2 2 2M15.5 10l2 2-2 2"/></svg>' +
    '</button>';
  tb.appendChild(grp);
}

injectStyle();
injectButton();
log('Compare slider sẵn sàng — nút ⟺ trên viewport toolbar (cần 2 model A/B).');
