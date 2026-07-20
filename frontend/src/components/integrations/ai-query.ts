/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI QUERY (logic thuần, không side-effect)
   ───────────────────────────────────────────────────────────────────────
   Các hàm tính toán trên "AI data index" (bảng element phẳng do buildAIIndex
   dựng ở ai.ts). Tách riêng khỏi ai.ts — vốn dựng UI chat (đụng `document`)
   lúc import — để unit-test được trong môi trường Node (xem ai-query.test.ts).

   Bản ghi element (do buildAIIndex tạo):
     { expressID, globalId, modelIdx, ifcClass, category, name, objectType,
       tag, storey|null, materials[], quantities|null, quantitySource }
   trong đó quantities = { volume, area, length, count } (mỗi trường số | null),
   hoặc null khi element không có Base Quantities.
═══════════════════════════════════════════════════════════════════════ */

export type AIFilter = Record<string, any>;
export type QuantityKey = 'volume' | 'area' | 'length' | 'count';
export type GroupKey = 'category' | 'storey' | 'ifcClass' | 'material';

// — chuẩn hoá chuỗi để so khớp không phân biệt hoa thường / khoảng trắng —
export function aiNorm(s: any): string { return (s == null ? '' : String(s)).toLowerCase().trim(); }

// — lọc danh sách element theo bộ lọc (khớp gần đúng, không phân biệt hoa thường) —
export function aiApplyFilter(elements: any[], f: AIFilter = {}): any[] {
  const cat = f.category != null ? aiNorm(f.category) : null;
  const sto = f.storey != null ? aiNorm(f.storey) : null;
  const cls = f.ifcClass != null ? aiNorm(f.ifcClass) : null;
  const mat = f.material != null ? aiNorm(f.material) : null;
  const nm = f.nameContains != null ? aiNorm(f.nameContains) : null;
  const mi = (f.modelIdx != null && f.modelIdx !== '') ? Number(f.modelIdx) : null;
  return (elements || []).filter(e => {
    if (cat != null && !aiNorm(e.category).includes(cat)) return false;
    if (sto != null) {
      const es = e.storey == null ? '' : aiNorm(e.storey);
      if (!es.includes(sto)) return false;
    }
    if (cls != null && !aiNorm(e.ifcClass).includes(cls)) return false;
    if (mat != null && !(e.materials || []).some((m: string) => aiNorm(m).includes(mat!))) return false;
    if (nm != null && !aiNorm(e.name).includes(nm)) return false;
    if (mi != null && e.modelIdx !== mi) return false;
    return true;
  });
}

// — phân nhóm + đếm, sắp giảm dần —
export function aiGroupCount(els: any[], key: string): { name: string; count: number }[] {
  const o: Record<string, number> = {};
  for (const e of els) {
    const k = (e[key] == null || e[key] === '') ? '(không xác định)' : e[key];
    o[k] = (o[k] || 0) + 1;
  }
  return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// — ánh xạ tên đại lượng (kể cả tiếng Việt) → khoá chuẩn —
export const QUANTITY_KEY_MAP: Record<string, QuantityKey> = {
  volume: 'volume', 'thể tích': 'volume',
  area: 'area', 'diện tích': 'area',
  length: 'length', 'chiều dài': 'length',
  count: 'count', 'số lượng': 'count',
};

export function resolveQuantityKey(quantity: string = 'volume'): QuantityKey {
  return QUANTITY_KEY_MAP[aiNorm(quantity)] || 'volume';
}

export function quantityUnit(key: QuantityKey): string {
  return key === 'volume' ? 'm³' : key === 'area' ? 'm²' : key === 'length' ? 'mm' : 'cái';
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// — cộng một đại lượng đã resolve trên danh sách element —
export function sumQuantityValues(els: any[], key: QuantityKey): { total: number; withQuantity: number; missing: number } {
  let total = 0, withQuantity = 0, missing = 0;
  for (const e of els) {
    const v = e.quantities ? e.quantities[key] : null;
    if (typeof v === 'number' && isFinite(v)) { total += v; withQuantity++; }
    else missing++;
  }
  return { total, withQuantity, missing };
}

export interface TakeoffRow { name: string; count: number; total: number; withQuantity: number; missing: number; }
export interface TakeoffResult {
  groupBy: GroupKey; quantity: QuantityKey; unit: string;
  rows: TakeoffRow[];
  totalElements: number; grandTotal: number;
  elementsWithQuantity: number; elementsMissing: number;
  filter: AIFilter;
}

// — bảng khối lượng (quantity takeoff): nhóm theo groupBy, cộng đại lượng theo nhóm —
export function quantityTakeoff(
  elements: any[],
  opts: { groupBy?: GroupKey; quantity?: string; filter?: AIFilter } = {}
): TakeoffResult {
  const groupBy: GroupKey = (['category', 'storey', 'ifcClass', 'material'] as GroupKey[])
    .includes(opts.groupBy as GroupKey) ? (opts.groupBy as GroupKey) : 'category';
  const key = resolveQuantityKey(opts.quantity);
  const filter = opts.filter || {};
  const els = aiApplyFilter(elements, filter);

  // Gom element theo nhóm. Với 'material' (nhiều vật liệu/element) → element vào
  // mọi vật liệu của nó; các nhóm khác dùng trường đơn trị.
  const groups: Record<string, any[]> = {};
  const push = (name: string, e: any) => { (groups[name] || (groups[name] = [])).push(e); };
  for (const e of els) {
    if (groupBy === 'material') {
      const mats: string[] = (e.materials && e.materials.length) ? e.materials : ['(không gán vật liệu)'];
      for (const m of mats) push(m, e);
    } else {
      const raw = e[groupBy];
      push((raw == null || raw === '') ? '(không xác định)' : String(raw), e);
    }
  }

  const rows: TakeoffRow[] = Object.entries(groups).map(([name, list]) => {
    const s = sumQuantityValues(list, key);
    return { name, count: list.length, total: round3(s.total), withQuantity: s.withQuantity, missing: s.missing };
  }).sort((a, b) => (b.total - a.total) || (b.count - a.count) || a.name.localeCompare(b.name));

  const grand = sumQuantityValues(els, key);
  return {
    groupBy, quantity: key, unit: quantityUnit(key),
    rows,
    totalElements: els.length,
    grandTotal: round3(grand.total),
    elementsWithQuantity: grand.withQuantity,
    elementsMissing: grand.missing,
    filter,
  };
}

const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// — bảng khối lượng dạng Markdown (để AI trình bày ngay) —
export function takeoffToMarkdown(r: TakeoffResult): string {
  const q = `${capFirst(r.quantity)} (${r.unit})`;
  const head = `| ${capFirst(r.groupBy)} | Count | ${q} | Missing |`;
  const sep = '| --- | ---: | ---: | ---: |';
  const body = r.rows.map(x => `| ${x.name} | ${x.count} | ${x.total} | ${x.missing} |`);
  const total = `| **Tổng** | **${r.totalElements}** | **${r.grandTotal}** | **${r.elementsMissing}** |`;
  return [head, sep, ...body, total].join('\n');
}

// — bảng khối lượng dạng CSV —
export function takeoffToCsv(r: TakeoffResult): string {
  const esc = (v: any) => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = [capFirst(r.groupBy), 'count', `${r.quantity}_${r.unit}`, 'with_quantity', 'missing'];
  const lines = [header.join(',')];
  for (const x of r.rows) lines.push([x.name, x.count, x.total, x.withQuantity, x.missing].map(esc).join(','));
  lines.push(['Total', r.totalElements, r.grandTotal, r.elementsWithQuantity, r.elementsMissing].map(esc).join(','));
  return lines.join('\n');
}

export interface ListedElement {
  expressID: number; globalId: string; name: string;
  category: string; ifcClass: string; storey: string | null;
  modelIdx: number; materials: string[]; quantities: any;
}

// — liệt kê element khớp bộ lọc (cắt bớt theo limit để không tràn context AI) —
export function listElements(elements: any[], filter: AIFilter = {}, limit = 50): {
  total: number; returned: number; truncated: boolean; limit: number; items: ListedElement[]; filter: AIFilter;
} {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 500));
  const els = aiApplyFilter(elements, filter);
  const items: ListedElement[] = els.slice(0, lim).map(e => ({
    expressID: e.expressID,
    globalId: e.globalId,
    name: e.name || '',
    category: e.category,
    ifcClass: e.ifcClass,
    storey: e.storey || null,
    modelIdx: e.modelIdx,
    materials: e.materials || [],
    quantities: e.quantities || null,
  }));
  return { total: els.length, returned: items.length, truncated: els.length > items.length, limit: lim, items, filter };
}
