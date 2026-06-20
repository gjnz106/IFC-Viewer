/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI DATA INDEX  (bước 1: nền tảng cho truy vấn AI)
   ───────────────────────────────────────────────────────────────────────
   Gom mọi element của các model đang load thành MỘT bảng phẳng, đủ thông
   tin để sau này AI gọi hàm count/sum trên đó (countElements, sumQuantity...).

   AI sẽ KHÔNG đọc trực tiếp bảng này để tự đếm — code mới đếm. Bảng này chỉ
   là "nguồn sự thật" để các tool chạy trên đó cho ra số chính xác.
═══════════════════════════════════════════════════════════════════════ */

import { appState } from '../../state/index.js';
import { log } from '../core/ifc-category.js';

// Đọc giá trị thô từ wrapper của web-ifc ({value:x} hoặc primitive)
function aiRaw(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

// ── Resolve tên vật liệu từ RelatingMaterial (đệ quy, có guard độ sâu) ──
async function aiResolveMaterialNames(modelID: number, ref: any, depth = 0): Promise<string[]> {
  const mgr = appState.ifcLoader.ifcManager;
  if (depth > 6 || ref === null || ref === undefined) return [];
  let obj: any = ref;
  const id = (typeof ref === 'number') ? ref : (ref?.value ?? null);
  if (typeof id === 'number') {
    try { obj = await mgr.getItemProperties(modelID, id, false); } catch (e) { return []; }
  }
  if (!obj) return [];
  const out: string[] = [];
  const pushName = (m: any) => { const n = aiRaw(m?.Name); if (n) out.push(String(n).trim()); };

  // Lá: IfcMaterial
  if (obj.Name && !obj.MaterialLayers && !obj.Materials && !obj.MaterialConstituents
    && !obj.MaterialProfiles && !obj.ForLayerSet) {
    pushName(obj);
    return out;
  }
  // Các container — gom đệ quy
  const childRefs: any[] = [];
  if (obj.ForLayerSet) childRefs.push(obj.ForLayerSet);
  if (obj.MaterialLayers) childRefs.push(...(Array.isArray(obj.MaterialLayers) ? obj.MaterialLayers : [obj.MaterialLayers]));
  if (obj.Materials) childRefs.push(...(Array.isArray(obj.Materials) ? obj.Materials : [obj.Materials]));
  if (obj.MaterialConstituents) childRefs.push(...(Array.isArray(obj.MaterialConstituents) ? obj.MaterialConstituents : [obj.MaterialConstituents]));
  if (obj.MaterialProfiles) childRefs.push(...(Array.isArray(obj.MaterialProfiles) ? obj.MaterialProfiles : [obj.MaterialProfiles]));
  if (obj.Material) childRefs.push(obj.Material);
  if (childRefs.length === 0) { pushName(obj); return out; }
  for (const c of childRefs) {
    const names = await aiResolveMaterialNames(modelID, c, depth + 1);
    out.push(...names);
  }
  return out;
}

// ── Build index chính ──
async function buildAIIndex(opts: { force?: boolean } = {}): Promise<any> {
  const key = appState.loadedModels.map((m: any) => m?.modelID ?? '_').join('-');
  if (appState.aiIndex && appState.aiIndexKey === key && !opts.force) return appState.aiIndex; // cache hit
  if (!appState.loadedModels.some((m: any) => !!m)) {
    appState.aiIndex = null;
    appState.aiIndexKey = null;
    return null;
  }

  const mgr = appState.ifcLoader.ifcManager;
  const api = mgr.state.api;
  const elements: any[] = [];
  const getAllProps = (window as any).getAllProps;
  const ifcClassToRevitCategory = (window as any).ifcClassToRevitCategory;

  // web-ifc type codes
  const TYPE_REL_MATERIAL = 2851387026; // IfcRelAssociatesMaterial
  const TYPE_REL_PROPS = 4186316022;    // IfcRelDefinesByProperties

  for (let mi = 0; mi < appState.loadedModels.length; mi++) {
    const model = appState.loadedModels[mi];
    if (!model) continue;
    const modelID = model.modelID;
    const units = model.units || { lengthFactor: 1000, areaFactor: 1, volumeFactor: 1 };
    const spatial = model.spatial || { storeys: [] };

    // 1) Danh sách element gốc
    const props = await getAllProps(modelID);

    // 2) Gán TẦNG cho từng element qua cây không gian
    const eidToStorey: Record<number, string> = {};
    try {
      const storeyName: Record<number, string> = {};
      for (const s of spatial.storeys) storeyName[s.expressID] = s.name;
      const tree = await mgr.getSpatialStructure(modelID, false);
      const walk = (node: any, cur: string | null) => {
        if (!node) return;
        const st = storeyName[node.expressID] || cur;
        if (st && node.expressID) eidToStorey[node.expressID] = st;
        if (node.children) for (const c of node.children) walk(c, st);
      };
      walk(tree, null);
    } catch (e: any) { log('AI index: spatial tree err', e?.message); }

    // 3) Gán VẬT LIỆU cho element — batch đọc IfcRelAssociatesMaterial
    const eidToMaterials: Record<number, string[]> = {};
    try {
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_MATERIAL);
      for (let i = 0; i < relIDs.size(); i++) {
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        if (!rel?.RelatingMaterial) continue;
        const names = await aiResolveMaterialNames(modelID, rel.RelatingMaterial);
        if (!names.length) continue;
        let related: number[] = [];
        if (Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map((o: any) => o.value ?? o).filter((v: any) => typeof v === 'number');
        else if (rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        for (const eid of related) {
          if (!eidToMaterials[eid]) eidToMaterials[eid] = [];
          for (const n of names) if (n && !eidToMaterials[eid].includes(n)) eidToMaterials[eid].push(n);
        }
      }
    } catch (e: any) { log('AI index: material err', e?.message); }

    // 4) Gán KHỐI LƯỢNG (Base Quantities) — batch đọc IfcRelDefinesByProperties
    const eidToQty: Record<number, any> = {};
    try {
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_PROPS);
      for (let i = 0; i < relIDs.size(); i++) {
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        const pdef = rel?.RelatingPropertyDefinition;
        const pdefId = pdef?.value ?? pdef;
        if (typeof pdefId !== 'number') continue;
        let related: number[] = [];
        if (Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map((o: any) => o.value ?? o).filter((v: any) => typeof v === 'number');
        else if (rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        if (!related.length) continue;
        const pset = await mgr.getItemProperties(modelID, pdefId, true);
        if (!pset?.Quantities) continue; // chỉ quan tâm IfcElementQuantity
        const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
        const q: any = { volume: null, area: null, length: null, count: null };
        for (const item of qs) {
          const qq = (typeof item?.value === 'number') ? await mgr.getItemProperties(modelID, item.value, false) : item;
          if (!qq) continue;
          const vv = aiRaw(qq.VolumeValue), av = aiRaw(qq.AreaValue), lv = aiRaw(qq.LengthValue), cv = aiRaw(qq.CountValue);
          if (vv != null) q.volume = vv;
          else if (av != null) q.area = av;
          else if (lv != null) q.length = lv;
          else if (cv != null) q.count = cv;
        }
        for (const eid of related) {
          if (!eidToQty[eid]) eidToQty[eid] = { volume: null, area: null, length: null, count: null };
          for (const k of ['volume', 'area', 'length', 'count']) if (q[k] != null) eidToQty[eid][k] = q[k];
        }
      }
    } catch (e: any) { log('AI index: qty err', e?.message); }

    // 5) Gộp tất cả thành bản ghi element
    for (const gid in props) {
      const p = props[gid];
      const ifcClass = p.type; // getAllProps trả type là TÊN class, vd 'IfcSlab'
      const rawQ = eidToQty[p.expressID];
      let quantities: any = null, quantitySource = 'missing';
      if (rawQ && (rawQ.volume != null || rawQ.area != null || rawQ.length != null || rawQ.count != null)) {
        quantities = {
          volume: rawQ.volume != null ? +(rawQ.volume * units.volumeFactor).toFixed(4) : null, // m³
          area: rawQ.area != null ? +(rawQ.area * units.areaFactor).toFixed(4) : null,          // m²
          length: rawQ.length != null ? Math.round(rawQ.length * units.lengthFactor) : null,    // mm
          count: rawQ.count != null ? rawQ.count : null,
        };
        quantitySource = 'model';
      }
      elements.push({
        expressID: p.expressID,
        globalId: gid,
        modelIdx: mi,
        ifcClass,                                        // 'IfcSlab'
        category: ifcClassToRevitCategory(ifcClass),     // 'Floors'
        name: p.name || '',
        objectType: p.objectType || '',
        tag: p.tag || '',
        storey: eidToStorey[p.expressID] || null,
        materials: eidToMaterials[p.expressID] || [],
        quantities,                                       // {volume,area,length,count} hoặc null
        quantitySource,                                   // 'model' | 'missing'
      });
    }
  }

  appState.aiIndex = makeAIIndexAggregates(elements);
  appState.aiIndexKey = key;
  log(`AI index built: ${elements.length} elements / ${appState.loadedModels.filter((m: any) => m).length} model(s)`);
  return appState.aiIndex;
}

// ── Tạo các bảng tổng hợp + summary ──
function makeAIIndexAggregates(elements: any[]): any {
  const byClass: Record<string, number> = {}, byCategory: Record<string, number> = {},
    byStorey: Record<string, number> = {}, matCount: Record<string, number> = {};
  const cov = { volume: 0, area: 0, length: 0, count: 0, missing: 0 };
  for (const e of elements) {
    byClass[e.ifcClass] = (byClass[e.ifcClass] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    const st = e.storey || '(không gán tầng)';
    byStorey[st] = (byStorey[st] || 0) + 1;
    for (const m of e.materials) matCount[m] = (matCount[m] || 0) + 1;
    if (e.quantitySource === 'missing') { cov.missing++; }
    else {
      if (e.quantities.volume != null) cov.volume++;
      if (e.quantities.area != null) cov.area++;
      if (e.quantities.length != null) cov.length++;
      if (e.quantities.count != null) cov.count++;
    }
  }
  const sortDesc = (obj: Record<string, number>) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, count: v }));
  return {
    elements,
    count: elements.length,
    models: appState.loadedModels.map((m: any, i: number) =>
      m ? { idx: i, fileName: m.fileName || ('Model ' + i), count: elements.filter(e => e.modelIdx === i).length } : null
    ).filter(Boolean),
    categories: sortDesc(byCategory),
    ifcClasses: sortDesc(byClass),
    storeys: Object.keys(byStorey),
    materials: sortDesc(matCount),
    quantityCoverage: cov,
    // tra cứu nhanh cho tool sau này:
    _byCategory: byCategory, _byClass: byClass, _byStorey: byStorey,
  };
}

// ── In tóm tắt ra console để kiểm tra index ──
window.aiIndexSummary = async function () {
  const ix = await buildAIIndex();
  if (!ix) { console.log('[AI INDEX] Chưa có model nào được load.'); return; }
  console.log('%c═══ AI DATA INDEX ═══', 'color:#2563eb;font-weight:700');
  console.log('Tổng element:', ix.count, '|', ix.models.map((m: any) => m.fileName + ': ' + m.count).join('  '));
  console.log('— Theo Category (Revit):'); console.table(ix.categories);
  console.log('— Theo tầng (storey):'); console.table(ix.storeys.map((s: string) => ({ storey: s, count: ix._byStorey[s] })));
  console.log('— Vật liệu (top):'); console.table(ix.materials.slice(0, 15));
  const c = ix.quantityCoverage;
  console.log(`— Độ phủ khối lượng: volume=${c.volume}, area=${c.area}, length=${c.length}, count=${c.count}, THIẾU=${c.missing} / ${ix.count}`);
  console.log('Gợi ý: window.aiIndexSummary() để xem lại. Truy cập dữ liệu thô: await buildAIIndex() rồi .elements');
  return ix;
};

window.buildAIIndex = buildAIIndex;

/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI QUERY TOOLS  (bước 2: tool chạy trên data index)
═══════════════════════════════════════════════════════════════════════ */

// — chuẩn hoá chuỗi để so khớp không phân biệt hoa thường / khoảng trắng —
function _aiNorm(s: any): string { return (s == null ? '' : String(s)).toLowerCase().trim(); }

// — lọc danh sách element theo bộ lọc —
function _aiApplyFilter(elements: any[], f: Record<string, any> = {}): any[] {
  const cat = f.category != null ? _aiNorm(f.category) : null;
  const sto = f.storey != null ? _aiNorm(f.storey) : null;
  const cls = f.ifcClass != null ? _aiNorm(f.ifcClass) : null;
  const mat = f.material != null ? _aiNorm(f.material) : null;
  const nm = f.nameContains != null ? _aiNorm(f.nameContains) : null;
  const mi = (f.modelIdx != null && f.modelIdx !== '') ? Number(f.modelIdx) : null;
  return elements.filter(e => {
    if (cat != null && !_aiNorm(e.category).includes(cat)) return false;
    if (sto != null) {
      const es = e.storey == null ? '' : _aiNorm(e.storey);
      if (!es.includes(sto)) return false;
    }
    if (cls != null && !_aiNorm(e.ifcClass).includes(cls)) return false;
    if (mat != null && !(e.materials || []).some((m: string) => _aiNorm(m).includes(mat!))) return false;
    if (nm != null && !_aiNorm(e.name).includes(nm)) return false;
    if (mi != null && e.modelIdx !== mi) return false;
    return true;
  });
}

// — phân nhóm + đếm, sắp giảm dần —
function _aiGroupCount(els: any[], key: string): { name: string; count: number }[] {
  const o: Record<string, number> = {};
  for (const e of els) {
    const k = (e[key] == null || e[key] === '') ? '(không xác định)' : e[key];
    o[k] = (o[k] || 0) + 1;
  }
  return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// ── TOOL 1: đếm element ──
async function countElements(filter: Record<string, any> = {}): Promise<any> {
  const idx = await buildAIIndex();
  const els = _aiApplyFilter((idx && idx.elements) || [], filter);
  return {
    count: els.length,
    filter,
    byCategory: _aiGroupCount(els, 'category'),
    byStorey: _aiGroupCount(els, 'storey'),
  };
}

// ── TOOL 2: cộng khối lượng ──
async function sumQuantity(filter: Record<string, any> = {}, quantity = 'volume'): Promise<any> {
  const idx = await buildAIIndex();
  const q = _aiNorm(quantity);
  const keyMap: Record<string, string> = {
    volume: 'volume', 'thể tích': 'volume', area: 'area', 'diện tích': 'area',
    length: 'length', 'chiều dài': 'length', count: 'count', 'số lượng': 'count'
  };
  const key = keyMap[q] || 'volume';
  const els = _aiApplyFilter((idx && idx.elements) || [], filter);
  let total = 0, withQty = 0, missing = 0;
  for (const e of els) {
    const v = e.quantities ? e.quantities[key] : null;
    if (typeof v === 'number' && isFinite(v)) { total += v; withQty++; }
    else missing++;
  }
  const unit = key === 'volume' ? 'm³' : key === 'area' ? 'm²' : key === 'length' ? 'mm' : 'cái';
  return {
    quantity: key,
    total: Math.round(total * 1000) / 1000,
    unit,
    elementsMatched: els.length,
    elementsWithQuantity: withQty,
    elementsMissing: missing,
    filter,
  };
}

// — định nghĩa tool chuẩn Anthropic Tool Use —
const AI_TOOLS = [
  {
    name: 'count_elements',
    description: 'Đếm số lượng element trong (các) model IFC đang mở, lọc theo category kiểu Revit, tầng, lớp IFC, vật liệu hoặc tên. Trả về số chính xác kèm phân nhóm theo category và theo tầng. Dùng cho câu hỏi như "có bao nhiêu cột ở tầng L3", "đếm số cửa ở basement".',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category kiểu Revit, vd "Columns","Floors","Doors","Walls". Khớp gần đúng, không phân biệt hoa thường.' },
        storey: { type: 'string', description: 'Tên tầng, vd "L2","L3","Parking". Khớp gần đúng.' },
        ifcClass: { type: 'string', description: 'Lớp IFC, vd "IfcColumn","IfcSlab","IfcDoor".' },
        material: { type: 'string', description: 'Tên vật liệu, vd "Concrete","Steel".' },
        nameContains: { type: 'string', description: 'Chuỗi con cần có trong tên element.' }
      }
    }
  },
  {
    name: 'sum_quantity',
    description: 'Cộng tổng khối lượng các element khớp bộ lọc: thể tích (volume, m³), diện tích (area, m²), chiều dài (length, mm) hoặc số lượng (count). Trả về tổng chính xác, đơn vị, và số element bị thiếu đại lượng. Dùng cho "tổng thể tích bê tông sàn tầng 1".',
    input_schema: {
      type: 'object',
      properties: {
        quantity: { type: 'string', enum: ['volume', 'area', 'length', 'count'], description: 'Đại lượng cần cộng.' },
        category: { type: 'string', description: 'Category Revit để lọc.' },
        storey: { type: 'string', description: 'Tầng để lọc.' },
        ifcClass: { type: 'string', description: 'Lớp IFC để lọc.' },
        material: { type: 'string', description: 'Vật liệu để lọc.' },
        nameContains: { type: 'string', description: 'Chuỗi con trong tên.' }
      },
      required: ['quantity']
    }
  }
];

// — dispatcher: AI gọi tool theo tên → chạy hàm tương ứng —
async function runAITool(name: string, input: any): Promise<any> {
  input = input || {};
  if (name === 'count_elements') return await countElements(input);
  if (name === 'sum_quantity') {
    const { quantity, ...f } = input;
    return await sumQuantity(f, quantity || 'volume');
  }
  throw new Error('Unknown AI tool: ' + name);
}

// expose để test trong console + dùng ở bước chat
window.countElements = countElements;
window.sumQuantity = sumQuantity;
window.runAITool = runAITool;
window.AI_TOOLS = AI_TOOLS;

console.log('%c═══ AI QUERY TOOLS sẵn sàng ═══', 'color:#16a34a;font-weight:700');
console.log('Thử:  await countElements({category:"Columns"})');
console.log('      await sumQuantity({category:"Floors"}, "volume")');

/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI CHAT UI  (bước 3a: ô chat + vòng lặp tool-use)
   ───────────────────────────────────────────────────────────────────────
   Panel chat nổi góc phải. Người dùng hỏi tiếng Việt → gửi câu hỏi + AI_TOOLS
   lên backend proxy → Claude chọn tool → runAITool() chạy ra SỐ CHÍNH XÁC
   → Claude diễn đạt lại. AI không tự đoán số.

   Gọi API qua backend proxy /api/ai/chat thay vì trực tiếp Anthropic.
═══════════════════════════════════════════════════════════════════════ */
(function () {
  const AI_CONFIG = {
    model: 'claude-haiku-4-5-20251001',  // Haiku rẻ, hợp truy vấn thường
    maxTokens: 1024,
    proxyUrl: '/api/ai/chat',             // Backend proxy — không cần API key ở client
  };
  (window as any).AI_CONFIG = AI_CONFIG;

  // ── styles (scoped .aic-) khớp biến màu app ──
  const css = `
  .aic-fab{position:fixed;right:20px;bottom:20px;z-index:9998;width:52px;height:52px;border-radius:50%;
    background:var(--blue,#2563eb);color:#fff;border:none;cursor:pointer;font-size:22px;
    box-shadow:0 4px 14px rgba(37,99,235,.4);display:flex;align-items:center;justify-content:center;transition:transform .15s ease}
  .aic-fab:hover{transform:scale(1.06)}
  .aic-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:380px;max-width:calc(100vw - 40px);
    height:560px;max-height:calc(100vh - 40px);background:var(--bg-panel,#fff);border:1px solid var(--border,#d5d9e2);
    border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;
    font-family:Inter,system-ui,sans-serif;color:var(--text,#1a1d26)}
  .aic-panel.open{display:flex}
  .aic-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#d5d9e2);background:var(--bg-card,#f0f1f4)}
  .aic-head b{font-size:14px;flex:1}
  .aic-head .aic-dot{width:8px;height:8px;border-radius:50%;background:var(--green,#16a34a)}
  .aic-iconbtn{background:none;border:none;cursor:pointer;color:var(--text-dim,#4a5068);font-size:16px;padding:4px;border-radius:6px;line-height:1}
  .aic-iconbtn:hover{background:var(--bg-hover,#e8eaef)}
  .aic-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f5f6f8)}
  .aic-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .aic-msg.user{align-self:flex-end;background:var(--blue,#2563eb);color:#fff;border-bottom-right-radius:4px}
  .aic-msg.assistant{align-self:flex-start;background:var(--bg-panel,#fff);border:1px solid var(--border,#d5d9e2);border-bottom-left-radius:4px}
  .aic-msg.error{align-self:stretch;background:var(--red-bg,#fdeaea);color:var(--red,#dc2626);border:1px solid var(--red,#dc2626);font-size:12px;max-width:100%}
  .aic-tool{align-self:flex-start;font-size:11px;color:var(--text-muted,#8590a6);background:var(--bg-card,#f0f1f4);
    border:1px solid var(--border,#d5d9e2);border-radius:8px;padding:5px 9px;font-family:'JetBrains Mono',monospace}
  .aic-think{align-self:flex-start;font-size:12px;color:var(--text-muted,#8590a6);font-style:italic;padding:4px 8px}
  .aic-foot{display:flex;gap:8px;padding:10px;border-top:1px solid var(--border,#d5d9e2);background:var(--bg-panel,#fff)}
  .aic-foot textarea{flex:1;resize:none;border:1px solid var(--border,#d5d9e2);border-radius:8px;padding:9px 11px;font-size:13px;
    font-family:inherit;max-height:90px;min-height:38px;box-sizing:border-box}
  .aic-send{background:var(--blue,#2563eb);color:#fff;border:none;border-radius:8px;width:40px;cursor:pointer;font-size:16px;flex-shrink:0}
  .aic-send:disabled{opacity:.5;cursor:default}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── DOM ──
  const fab = document.createElement('button');
  fab.className = 'aic-fab'; fab.title = 'Trợ lý AI'; fab.textContent = '✦';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'aic-panel';
  panel.innerHTML = `
    <div class="aic-head">
      <span class="aic-dot"></span><b>Trợ lý AI · IFC Delta</b>
      <button class="aic-iconbtn" data-act="clear" title="Xoá hội thoại">🗑</button>
      <button class="aic-iconbtn" data-act="close" title="Đóng">✕</button>
    </div>
    <div class="aic-msgs"></div>
    <div class="aic-foot">
      <textarea class="aic-in" rows="1" placeholder="Hỏi về mô hình… vd: có bao nhiêu cột ở tầng L3?"></textarea>
      <button class="aic-send" title="Gửi">➤</button>
    </div>`;
  document.body.appendChild(panel);

  const $ = (s: string) => panel.querySelector(s) as HTMLElement;
  const msgs = $('.aic-msgs') as HTMLElement,
    inputEl = $('.aic-in') as HTMLTextAreaElement,
    sendBtn = $('.aic-send') as HTMLButtonElement;

  // ── render helpers ──
  function render(role: string, text: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'aic-msg ' + role;
    d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function toolBadge(name: string, input: any): void {
    const d = document.createElement('div');
    d.className = 'aic-tool';
    d.textContent = '🔧 ' + name + ' ' + JSON.stringify(input || {});
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  function thinking(on: boolean, el?: HTMLElement): HTMLElement | undefined {
    if (on) {
      const d = document.createElement('div');
      d.className = 'aic-think'; d.textContent = 'Đang suy nghĩ…';
      msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
    } else if (el) { el.remove(); }
    return undefined;
  }

  // ── system prompt + ngữ cảnh model ──
  async function buildSystem(): Promise<string> {
    let ctx = 'Hiện chưa có model IFC nào được load.';
    try {
      const idx = await buildAIIndex();
      if (idx) {
        const cats = idx.categories.map((c: any) => c.name + '(' + c.count + ')').join(', ');
        const stos = idx.storeys.join(', ');
        const cls = idx.ifcClasses.map((c: any) => c.name).join(', ');
        ctx = 'Model đang mở: ' + idx.models.map((m: any) => m.fileName).join(', ') + '. Tổng ' + idx.count + ' element.\n'
          + 'Category (Revit) có sẵn: ' + cats + '.\n'
          + 'Tầng (storey) có sẵn: ' + stos + '.\n'
          + 'Lớp IFC có sẵn: ' + cls + '.';
      }
    } catch (e) { }
    return [
      'Bạn là trợ lý của IFC Delta — công cụ xem & truy vấn mô hình IFC trên web cho kỹ sư BIM.',
      'QUY TẮC BẮT BUỘC: với mọi câu hỏi cần con số (đếm số lượng, tổng khối lượng/diện tích/chiều dài), PHẢI gọi tool count_elements hoặc sum_quantity để lấy số CHÍNH XÁC. TUYỆT ĐỐI không tự đoán, không tự bịa số.',
      'Khi đặt giá trị lọc (category, storey, ifcClass), hãy dùng đúng tên có trong danh sách ngữ cảnh bên dưới (vd "tầng 3" → storey "L3"; "cột" → category "Columns").',
      'Trả lời bằng tiếng Việt, ngắn gọn, nêu rõ con số kèm đơn vị. Nếu kết quả = 0 hoặc có element thiếu khối lượng, nói rõ điều đó.',
      '',
      'NGỮ CẢNH MÔ HÌNH HIỆN TẠI:',
      ctx,
    ].join('\n');
  }

  // ── vòng lặp hỏi-đáp + tool use ──
  // Messages sent to backend proxy: [{role, content}]
  const history: { role: string; content: any }[] = [];
  let busy = false;

  async function ask(question: string): Promise<void> {
    if (busy) return;
    busy = true; sendBtn.disabled = true;
    history.push({ role: 'user', content: question });
    render('user', question);
    const system = await buildSystem();
    const thinkEl = thinking(true);
    try {
      let guard = 0;
      while (guard++ < 6) {
        // Call backend proxy instead of Anthropic API directly
        const res = await fetch(AI_CONFIG.proxyUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: AI_CONFIG.model,
            max_tokens: AI_CONFIG.maxTokens,
            system,
            tools: window.AI_TOOLS,
            messages: history,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error('API ' + res.status + ': ' + t.slice(0, 400));
        }
        const data = await res.json();
        history.push({ role: 'assistant', content: data.content });
        const texts = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
        if (texts) render('assistant', texts);
        if (data.stop_reason === 'tool_use') {
          const toolUses = (data.content || []).filter((b: any) => b.type === 'tool_use');
          const results: any[] = [];
          for (const tu of toolUses) {
            toolBadge(tu.name, tu.input);
            let out: any;
            try { out = await window.runAITool(tu.name, tu.input); }
            catch (err: any) { out = { error: String((err && err.message) || err) }; }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
          }
          history.push({ role: 'user', content: results });
          continue;
        }
        break;
      }
    } catch (e: any) {
      render('error', (e && e.message) || String(e));
    } finally {
      thinking(false, thinkEl);
      busy = false; sendBtn.disabled = false; inputEl.focus();
    }
  }
  (window as any).aiAsk = ask;

  // ── events ──
  fab.onclick = () => { panel.classList.add('open'); fab.style.display = 'none'; inputEl.focus(); };
  panel.querySelector('[data-act=close]')!.addEventListener('click', () => { panel.classList.remove('open'); fab.style.display = 'flex'; });
  panel.querySelector('[data-act=clear]')!.addEventListener('click', () => { history.length = 0; msgs.innerHTML = ''; });
  function autoGrow() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 90) + 'px'; }
  inputEl.oninput = autoGrow;
  function submit() {
    const q = inputEl.value.trim();
    if (!q || busy) return;
    inputEl.value = ''; autoGrow(); ask(q);
  }
  sendBtn.onclick = submit;
  inputEl.onkeydown = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };

  console.log('%c═══ AI CHAT UI sẵn sàng ═══', 'color:#2563eb;font-weight:700');
  console.log('Nhấn nút ✦ góc phải-dưới để mở chat.');
})();
