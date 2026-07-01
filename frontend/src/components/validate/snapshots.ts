/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — SNAPSHOTS theo thời gian (plan 2.4)
   ───────────────────────────────────────────────────────────────────────
   Lưu kết quả validate (và sau này clash) theo mốc thời gian vào LocalStorage
   để theo dõi thay đổi giữa các lần chạy (findings tăng/giảm ra sao).

   Logic thuần (makeSnapshot/addSnapshot/diffStats) tách khỏi phần LocalStorage
   để unit-test được; recordSnapshot() là glue đọc/ghi store.
═══════════════════════════════════════════════════════════════════════ */

export interface Snapshot { id: string; ts: number; kind: string; label: string; stats: Record<string, any>; }
export interface StatDelta { key: string; prev: number; curr: number; delta: number; }

export function makeSnapshot(kind: string, stats: Record<string, any>, label?: string): Snapshot {
  const id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return { id, ts: Date.now(), kind, label: label || new Date().toLocaleString(), stats: { ...stats } };
}

// Thêm snapshot mới lên đầu, giới hạn số bản giữ lại (mới nhất trước).
export function addSnapshot(list: Snapshot[], snap: Snapshot, maxKeep = 50): Snapshot[] {
  return [snap, ...(list || [])].slice(0, Math.max(1, maxKeep));
}

// So thống kê 2 lần chạy theo các trường số quan tâm. Không truyền `keys` thì
// tự suy ra: hợp các khoá xuất hiện ở prev hoặc curr mà giá trị là number ở
// ít nhất một bên (bỏ qua khoá kiểu chuỗi như "gateway") — nhờ vậy dùng chung
// được cho mọi loại snapshot (validate: findings/fail/warn/…, clash: total/hard/near…)
// mà không cần hardcode danh sách khoá theo từng loại.
function inferNumericKeys(a: Record<string, any> | null | undefined, b: Record<string, any> | null | undefined): string[] {
  const keys = new Set<string>();
  for (const obj of [a, b]) {
    if (!obj) continue;
    for (const k of Object.keys(obj)) if (typeof obj[k] === 'number') keys.add(k);
  }
  return [...keys].sort();
}

export function diffStats(
  prev: Record<string, any> | null | undefined,
  curr: Record<string, any> | null | undefined,
  keys?: string[],
): StatDelta[] {
  const ks = keys && keys.length ? keys : inferNumericKeys(prev, curr);
  return ks.map(k => {
    const p = Number((prev && prev[k]) ?? 0);
    const c = Number((curr && curr[k]) ?? 0);
    return { key: k, prev: p, curr: c, delta: c - p };
  });
}

// ── LocalStorage glue ──
const STORE_KEY = 'ifcDeltaSnapshots';

export function loadSnapshots(): Snapshot[] {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

export function saveSnapshots(list: Snapshot[]): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* quota/private mode */ }
}

// Ghi 1 snapshot + trả về delta so với snapshot cùng kind gần nhất.
export function recordSnapshot(kind: string, stats: Record<string, any>, label?: string): {
  snap: Snapshot; prev: Snapshot | null; delta: StatDelta[];
} {
  const list = loadSnapshots();
  const prev = list.find(s => s.kind === kind) || null;
  const snap = makeSnapshot(kind, stats, label);
  saveSnapshots(addSnapshot(list, snap));
  return { snap, prev, delta: prev ? diffStats(prev.stats, stats) : [] };
}
