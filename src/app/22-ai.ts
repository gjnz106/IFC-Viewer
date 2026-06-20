/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI DATA INDEX  (bước 1: nền tảng cho truy vấn AI)
   ───────────────────────────────────────────────────────────────────────
   Gom mọi element của các model đang load thành MỘT bảng phẳng, đủ thông
   tin để sau này AI gọi hàm count/sum trên đó (countElements, sumQuantity...).

   AI sẽ KHÔNG đọc trực tiếp bảng này để tự đếm — code mới đếm. Bảng này chỉ
   là "nguồn sự thật" để các tool chạy trên đó cho ra số chính xác.

   ── Cách dùng ──
   1. Dán toàn bộ block này vào TRONG <script type="module"> của index.html
      (đặt ở đâu cũng được, miễn cùng scope với getAllProps / loadedModels).
   2. Gọi:  await buildAIIndex();        // build (có cache, tự rebuild khi đổi model)
            window.aiIndexSummary();     // in tóm tắt ra console để kiểm tra
   3. KHÔNG cần sửa loadIFC: cache key dựa trên modelID nên tự làm mới khi
      load/xoá model.

   Tận dụng sẵn từ code của bạn:
     - getAllProps(modelID)            → danh sách element + name/tag/type
     - loadedModels[i].units           → hệ số đổi đơn vị (mm / m² / m³)
     - loadedModels[i].spatial.storeys → danh sách tầng (expressID → tên)
     - ifcClassToRevitCategory()       → 'IfcDoor' → 'Doors'
     - mgr.getSpatialStructure()       → cây không gian để gán tầng cho element
═══════════════════════════════════════════════════════════════════════ */

let aiIndex = null;      // kết quả đã build (object, xem makeAIIndexAggregates)
let aiIndexKey = null;   // cache key = tổ hợp modelID đang load

// Đọc giá trị thô từ wrapper của web-ifc ({value:x} hoặc primitive)
function aiRaw(v){
  if(v===null||v===undefined) return null;
  if(typeof v==='object' && 'value' in v) return v.value;
  return v;
}

// ── Resolve tên vật liệu từ RelatingMaterial (đệ quy, có guard độ sâu) ──
// RelatingMaterial có thể là: IfcMaterial / IfcMaterialList /
// IfcMaterialLayerSet(Usage) / IfcMaterialConstituentSet / IfcMaterialProfileSet
async function aiResolveMaterialNames(modelID, ref, depth=0){
  const mgr = ifcLoader.ifcManager;
  if(depth>6 || ref===null || ref===undefined) return [];
  let obj = ref;
  const id = (typeof ref==='number') ? ref : (ref?.value ?? null);
  if(typeof id==='number'){
    try{ obj = await mgr.getItemProperties(modelID, id, false); }catch(e){ return []; }
  }
  if(!obj) return [];
  const out = [];
  const pushName = (m)=>{ const n=aiRaw(m?.Name); if(n) out.push(String(n).trim()); };

  // Lá: IfcMaterial
  if(obj.Name && !obj.MaterialLayers && !obj.Materials && !obj.MaterialConstituents
     && !obj.MaterialProfiles && !obj.ForLayerSet){
    pushName(obj);
    return out;
  }
  // Các container — gom đệ quy
  const childRefs = [];
  if(obj.ForLayerSet) childRefs.push(obj.ForLayerSet);
  if(obj.MaterialLayers) childRefs.push(...(Array.isArray(obj.MaterialLayers)?obj.MaterialLayers:[obj.MaterialLayers]));
  if(obj.Materials)      childRefs.push(...(Array.isArray(obj.Materials)?obj.Materials:[obj.Materials]));
  if(obj.MaterialConstituents) childRefs.push(...(Array.isArray(obj.MaterialConstituents)?obj.MaterialConstituents:[obj.MaterialConstituents]));
  if(obj.MaterialProfiles)     childRefs.push(...(Array.isArray(obj.MaterialProfiles)?obj.MaterialProfiles:[obj.MaterialProfiles]));
  if(obj.Material)             childRefs.push(obj.Material);
  if(childRefs.length===0){ pushName(obj); return out; }
  for(const c of childRefs){
    const names = await aiResolveMaterialNames(modelID, c, depth+1);
    out.push(...names);
  }
  return out;
}

// ── Build index chính ──
async function buildAIIndex(opts={}){
  const key = loadedModels.map(m=>m?.modelID ?? '_').join('-');
  if(aiIndex && aiIndexKey===key && !opts.force) return aiIndex;     // cache hit
  if(!loadedModels.some(m=>!!m)){ aiIndex=null; aiIndexKey=null; return null; }

  const mgr = ifcLoader.ifcManager;
  const api = mgr.state.api;
  const elements = [];

  // web-ifc type codes (lấy từ chính code của bạn để chắc đúng):
  const TYPE_REL_MATERIAL = 2851387026; // IfcRelAssociatesMaterial (có trong SKIP_TYPES của bạn)
  const TYPE_REL_PROPS    = 4186316022; // IfcRelDefinesByProperties (dùng trong sgBuildContext)

  for(let mi=0; mi<loadedModels.length; mi++){
    const model = loadedModels[mi];
    if(!model) continue;
    const modelID = model.modelID;
    const units = model.units || {lengthFactor:1000, areaFactor:1, volumeFactor:1};
    const spatial = model.spatial || {storeys:[]};

    // 1) Danh sách element gốc (đã có name/tag/type, đã lọc chỉ element có geometry)
    const props = await getAllProps(modelID);

    // 2) Gán TẦNG cho từng element qua cây không gian
    //    getSpatialStructure trả về cây Project→Site→Building→Storey→(elements).
    //    Ta dò xuống, mỗi khi gặp node là IfcBuildingStorey thì mọi con cháu
    //    của nó thuộc tầng đó. Tên tầng lấy từ spatial cache (theo expressID).
    const eidToStorey = {};
    try{
      const storeyName = {};
      for(const s of spatial.storeys) storeyName[s.expressID] = s.name;
      const tree = await mgr.getSpatialStructure(modelID, false);
      const walk = (node, cur)=>{
        if(!node) return;
        const st = storeyName[node.expressID] || cur;
        if(st && node.expressID) eidToStorey[node.expressID] = st;
        if(node.children) for(const c of node.children) walk(c, st);
      };
      walk(tree, null);
    }catch(e){ log('AI index: spatial tree err', e?.message); }

    // 3) Gán VẬT LIỆU cho element — batch đọc IfcRelAssociatesMaterial 1 lần
    const eidToMaterials = {};
    try{
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_MATERIAL);
      for(let i=0;i<relIDs.size();i++){
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        if(!rel?.RelatingMaterial) continue;
        const names = await aiResolveMaterialNames(modelID, rel.RelatingMaterial);
        if(!names.length) continue;
        let related = [];
        if(Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map(o=>o.value??o).filter(v=>typeof v==='number');
        else if(rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        for(const eid of related){
          if(!eidToMaterials[eid]) eidToMaterials[eid] = [];
          for(const n of names) if(n && !eidToMaterials[eid].includes(n)) eidToMaterials[eid].push(n);
        }
      }
    }catch(e){ log('AI index: material err', e?.message); }

    // 4) Gán KHỐI LƯỢNG (Base Quantities) — batch đọc IfcRelDefinesByProperties,
    //    chỉ lấy các pset là IfcElementQuantity. Giá trị thô được đổi đơn vị
    //    sang m³ / m² / mm bằng hệ số units của model.
    const eidToQty = {};
    try{
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_PROPS);
      for(let i=0;i<relIDs.size();i++){
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        const pdef = rel?.RelatingPropertyDefinition;
        const pdefId = pdef?.value ?? pdef;
        if(typeof pdefId!=='number') continue;
        let related = [];
        if(Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map(o=>o.value??o).filter(v=>typeof v==='number');
        else if(rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        if(!related.length) continue;
        const pset = await mgr.getItemProperties(modelID, pdefId, true);
        if(!pset?.Quantities) continue; // chỉ quan tâm IfcElementQuantity
        const qs = Array.isArray(pset.Quantities)?pset.Quantities:[pset.Quantities];
        const q = {volume:null, area:null, length:null, count:null};
        for(const item of qs){
          const qq = (typeof item?.value==='number') ? await mgr.getItemProperties(modelID, item.value, false) : item;
          if(!qq) continue;
          const vv=aiRaw(qq.VolumeValue), av=aiRaw(qq.AreaValue), lv=aiRaw(qq.LengthValue), cv=aiRaw(qq.CountValue);
          if(vv!=null) q.volume = vv;
          else if(av!=null) q.area = av;
          else if(lv!=null) q.length = lv;
          else if(cv!=null) q.count = cv;
        }
        for(const eid of related){
          if(!eidToQty[eid]) eidToQty[eid] = {volume:null, area:null, length:null, count:null};
          for(const k of ['volume','area','length','count']) if(q[k]!=null) eidToQty[eid][k] = q[k];
        }
      }
    }catch(e){ log('AI index: qty err', e?.message); }

    // 5) Gộp tất cả thành bản ghi element
    for(const gid in props){
      const p = props[gid];
      const ifcClass = p.type; // getAllProps trả type là TÊN class, vd 'IfcSlab'
      const rawQ = eidToQty[p.expressID];
      let quantities = null, quantitySource = 'missing';
      if(rawQ && (rawQ.volume!=null || rawQ.area!=null || rawQ.length!=null || rawQ.count!=null)){
        quantities = {
          volume: rawQ.volume!=null ? +(rawQ.volume*units.volumeFactor).toFixed(4) : null, // m³
          area:   rawQ.area!=null   ? +(rawQ.area*units.areaFactor).toFixed(4)     : null, // m²
          length: rawQ.length!=null ? Math.round(rawQ.length*units.lengthFactor)   : null, // mm
          count:  rawQ.count!=null  ? rawQ.count : null,
        };
        quantitySource = 'model';
      }
      elements.push({
        expressID: p.expressID,
        globalId:  gid,
        modelIdx:  mi,
        ifcClass,                                   // 'IfcSlab'
        category:  ifcClassToRevitCategory(ifcClass), // 'Floors'
        name:      p.name || '',
        objectType: p.objectType || '',
        tag:       p.tag || '',
        storey:    eidToStorey[p.expressID] || null,
        materials: eidToMaterials[p.expressID] || [],
        quantities,                                  // {volume,area,length,count} hoặc null
        quantitySource,                              // 'model' | 'missing'
      });
    }
  }

  aiIndex = makeAIIndexAggregates(elements);
  aiIndexKey = key;
  log(`AI index built: ${elements.length} elements / ${loadedModels.filter(m=>m).length} model(s)`);
  return aiIndex;
}

// ── Tạo các bảng tổng hợp + summary (để kiểm tra & cho tool dùng sau) ──
function makeAIIndexAggregates(elements){
  const byClass = {}, byCategory = {}, byStorey = {}, matCount = {};
  const cov = {volume:0, area:0, length:0, count:0, missing:0};
  for(const e of elements){
    byClass[e.ifcClass]   = (byClass[e.ifcClass]||0)+1;
    byCategory[e.category]= (byCategory[e.category]||0)+1;
    const st = e.storey || '(không gán tầng)';
    byStorey[st] = (byStorey[st]||0)+1;
    for(const m of e.materials) matCount[m] = (matCount[m]||0)+1;
    if(e.quantitySource==='missing'){ cov.missing++; }
    else{
      if(e.quantities.volume!=null) cov.volume++;
      if(e.quantities.area!=null)   cov.area++;
      if(e.quantities.length!=null) cov.length++;
      if(e.quantities.count!=null)  cov.count++;
    }
  }
  const sortDesc = (obj)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({name:k,count:v}));
  return {
    elements,
    count: elements.length,
    models: loadedModels.map((m,i)=>m?{idx:i, fileName:m.fileName||('Model '+i), count:elements.filter(e=>e.modelIdx===i).length}:null).filter(Boolean),
    categories: sortDesc(byCategory),
    ifcClasses: sortDesc(byClass),
    storeys:    Object.keys(byStorey),
    materials:  sortDesc(matCount),
    quantityCoverage: cov,   // bao nhiêu element có volume/area/length/count, bao nhiêu thiếu
    // tra cứu nhanh cho tool sau này:
    _byCategory: byCategory, _byClass: byClass, _byStorey: byStorey,
  };
}

// ── In tóm tắt ra console để bạn kiểm tra index đã đúng chưa ──
window.aiIndexSummary = async function(){
  const ix = await buildAIIndex();
  if(!ix){ console.log('[AI INDEX] Chưa có model nào được load.'); return; }
  console.log('%c═══ AI DATA INDEX ═══','color:#2563eb;font-weight:700');
  console.log('Tổng element:', ix.count, '|', ix.models.map(m=>m.fileName+': '+m.count).join('  '));
  console.log('— Theo Category (Revit):'); console.table(ix.categories);
  console.log('— Theo tầng (storey):');     console.table(ix.storeys.map(s=>({storey:s, count:ix._byStorey[s]})));
  console.log('— Vật liệu (top):');          console.table(ix.materials.slice(0,15));
  const c=ix.quantityCoverage;
  console.log(`— Độ phủ khối lượng: volume=${c.volume}, area=${c.area}, length=${c.length}, count=${c.count}, THIẾU=${c.missing} / ${ix.count}`);
  console.log('Gợi ý: window.aiIndexSummary() để xem lại. Truy cập dữ liệu thô: await buildAIIndex() rồi .elements');
  return ix;
};

// Cho phép gọi từ console / module khác
window.buildAIIndex = buildAIIndex;

/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI QUERY TOOLS  (bước 2: tool chạy trên data index)
   ───────────────────────────────────────────────────────────────────────
   countElements / sumQuantity tính SỐ CHÍNH XÁC trên bảng index (buildAIIndex).
   AI chỉ GỌI HÀM rồi diễn đạt kết quả — KHÔNG tự đếm, KHÔNG tự đoán số.

   Thử nhanh trong console:
     await countElements({category:"Columns"})
     await countElements({storey:"L3", category:"Columns"})
     await sumQuantity({category:"Floors"}, "volume")
   AI_TOOLS = định nghĩa tool chuẩn Anthropic Tool Use (dùng ở bước chat sau).
═══════════════════════════════════════════════════════════════════════ */

// — chuẩn hoá chuỗi để so khớp không phân biệt hoa thường / khoảng trắng —
function _aiNorm(s){ return (s==null ? '' : String(s)).toLowerCase().trim(); }

// — lọc danh sách element theo bộ lọc (khớp gần đúng cho dễ dùng với câu hỏi tự nhiên) —
function _aiApplyFilter(elements, f={}){
  const cat = f.category!=null     ? _aiNorm(f.category)     : null;
  const sto = f.storey!=null       ? _aiNorm(f.storey)       : null;
  const cls = f.ifcClass!=null     ? _aiNorm(f.ifcClass)     : null;
  const mat = f.material!=null     ? _aiNorm(f.material)     : null;
  const nm  = f.nameContains!=null ? _aiNorm(f.nameContains) : null;
  const mi  = (f.modelIdx!=null && f.modelIdx!=='') ? Number(f.modelIdx) : null;
  return elements.filter(e=>{
    if(cat!=null && !_aiNorm(e.category).includes(cat)) return false;
    if(sto!=null){
      const es = e.storey==null ? '' : _aiNorm(e.storey);
      if(!es.includes(sto)) return false;
    }
    if(cls!=null && !_aiNorm(e.ifcClass).includes(cls)) return false;
    if(mat!=null && !(e.materials||[]).some(m=>_aiNorm(m).includes(mat))) return false;
    if(nm!=null  && !_aiNorm(e.name).includes(nm)) return false;
    if(mi!=null  && e.modelIdx!==mi) return false;
    return true;
  });
}

// — phân nhóm + đếm, sắp giảm dần —
function _aiGroupCount(els, key){
  const o = {};
  for(const e of els){
    const k = (e[key]==null || e[key]==='') ? '(không xác định)' : e[key];
    o[k] = (o[k]||0)+1;
  }
  return Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
}

// ── TOOL 1: đếm element ──
async function countElements(filter={}){
  const idx = await buildAIIndex();                 // có cache, rẻ
  const els = _aiApplyFilter((idx&&idx.elements)||[], filter);
  return {
    count: els.length,
    filter,
    byCategory: _aiGroupCount(els, 'category'),
    byStorey:   _aiGroupCount(els, 'storey'),
  };
}

// ── TOOL 2: cộng khối lượng ──
async function sumQuantity(filter={}, quantity='volume'){
  const idx = await buildAIIndex();
  const q = _aiNorm(quantity);
  const key = ({ volume:'volume', 'thể tích':'volume', area:'area', 'diện tích':'area',
                 length:'length', 'chiều dài':'length', count:'count', 'số lượng':'count'
               })[q] || 'volume';
  const els = _aiApplyFilter((idx&&idx.elements)||[], filter);
  let total=0, withQty=0, missing=0;
  for(const e of els){
    const v = e.quantities ? e.quantities[key] : null;
    if(typeof v==='number' && isFinite(v)){ total+=v; withQty++; }
    else missing++;
  }
  const unit = key==='volume' ? 'm³' : key==='area' ? 'm²' : key==='length' ? 'mm' : 'cái';
  return {
    quantity: key,
    total: Math.round(total*1000)/1000,
    unit,
    elementsMatched: els.length,
    elementsWithQuantity: withQty,
    elementsMissing: missing,       // khớp lọc nhưng THIẾU đại lượng này (không tính vào tổng)
    filter,
  };
}

// — định nghĩa tool chuẩn Anthropic Tool Use (gần như y hệt MCP) —
const AI_TOOLS = [
  {
    name: 'count_elements',
    description: 'Đếm số lượng element trong (các) model IFC đang mở, lọc theo category kiểu Revit, tầng, lớp IFC, vật liệu hoặc tên. Trả về số chính xác kèm phân nhóm theo category và theo tầng. Dùng cho câu hỏi như "có bao nhiêu cột ở tầng L3", "đếm số cửa ở basement".',
    input_schema: {
      type: 'object',
      properties: {
        category:     { type:'string', description:'Category kiểu Revit, vd "Columns","Floors","Doors","Walls". Khớp gần đúng, không phân biệt hoa thường.' },
        storey:       { type:'string', description:'Tên tầng, vd "L2","L3","Parking". Khớp gần đúng.' },
        ifcClass:     { type:'string', description:'Lớp IFC, vd "IfcColumn","IfcSlab","IfcDoor".' },
        material:     { type:'string', description:'Tên vật liệu, vd "Concrete","Steel".' },
        nameContains: { type:'string', description:'Chuỗi con cần có trong tên element.' }
      }
    }
  },
  {
    name: 'sum_quantity',
    description: 'Cộng tổng khối lượng các element khớp bộ lọc: thể tích (volume, m³), diện tích (area, m²), chiều dài (length, mm) hoặc số lượng (count). Trả về tổng chính xác, đơn vị, và số element bị thiếu đại lượng. Dùng cho "tổng thể tích bê tông sàn tầng 1".',
    input_schema: {
      type: 'object',
      properties: {
        quantity:     { type:'string', enum:['volume','area','length','count'], description:'Đại lượng cần cộng.' },
        category:     { type:'string', description:'Category Revit để lọc.' },
        storey:       { type:'string', description:'Tầng để lọc.' },
        ifcClass:     { type:'string', description:'Lớp IFC để lọc.' },
        material:     { type:'string', description:'Vật liệu để lọc.' },
        nameContains: { type:'string', description:'Chuỗi con trong tên.' }
      },
      required: ['quantity']
    }
  }
];

// — dispatcher: AI gọi tool theo tên → chạy hàm tương ứng (dùng ở bước chat) —
async function runAITool(name, input){
  input = input || {};
  if(name === 'count_elements') return await countElements(input);
  if(name === 'sum_quantity'){
    const { quantity, ...f } = input;
    return await sumQuantity(f, quantity || 'volume');
  }
  throw new Error('Unknown AI tool: ' + name);
}

// expose để test trong console + dùng ở bước chat
window.countElements = countElements;
window.sumQuantity   = sumQuantity;
window.runAITool     = runAITool;
window.AI_TOOLS      = AI_TOOLS;

console.log('%c═══ AI QUERY TOOLS sẵn sàng ═══','color:#16a34a;font-weight:700');
console.log('Thử:  await countElements({category:"Columns"})');
console.log('      await sumQuantity({category:"Floors"}, "volume")');

/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — AI CHAT UI  (bước 3a: ô chat + vòng lặp tool-use)
   ───────────────────────────────────────────────────────────────────────
   Panel chat nổi góc phải. Người dùng hỏi tiếng Việt → gửi câu hỏi + AI_TOOLS
   lên Claude → Claude chọn tool → runAITool() chạy ra SỐ CHÍNH XÁC → Claude
   diễn đạt lại. AI không tự đoán số.

   ⚠ KEY: ô nhập key bên dưới CHỈ để TEST LOCAL. KHÔNG commit/deploy kèm key
   (ai mở DevTools cũng thấy). Khi xong proxy: đặt AI_CONFIG.useProxy=true +
   proxyUrl, lúc đó không cần key ở client nữa.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  const AI_CONFIG = {
    model:     'claude-haiku-4-5-20251001',  // Haiku rẻ, hợp truy vấn thường
    maxTokens: 1024,
    useProxy:  false,                         // ĐỔI true khi proxy sẵn sàng
    proxyUrl:  '',                            // vd 'https://your-worker.workers.dev'
    apiKey:    '',                            // chỉ test local
  };
  window.AI_CONFIG = AI_CONFIG;

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
  .aic-cfg{display:none;padding:10px 14px;border-bottom:1px solid var(--border,#d5d9e2);background:var(--amber-bg,#fef9ed);font-size:12px}
  .aic-cfg.show{display:block}
  .aic-cfg label{display:block;font-weight:600;margin-bottom:4px;color:var(--text-dim,#4a5068)}
  .aic-cfg input{width:100%;padding:7px 9px;border:1px solid var(--border,#d5d9e2);border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box}
  .aic-cfg .aic-note{margin-top:7px;color:var(--amber,#d97706);line-height:1.4}
  .aic-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f5f6f8)}
  .aic-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .aic-msg.user{align-self:flex-end;background:var(--blue,#2563eb);color:#fff;border-bottom-right-radius:4px}
  .aic-msg.assistant{align-self:flex-start;background:var(--bg-panel,#fff);border:1px solid var(--border,#d5d9e2);border-bottom-left-radius:4px}
  .aic-msg.error{align-self:stretch;background:var(--red-bg,#fdeaea);color:var(--red,#D05050);border:1px solid var(--red,#D05050);font-size:12px;max-width:100%}
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
      <button class="aic-iconbtn" data-act="cfg" title="Cài đặt">⚙</button>
      <button class="aic-iconbtn" data-act="clear" title="Xoá hội thoại">🗑</button>
      <button class="aic-iconbtn" data-act="close" title="Đóng">✕</button>
    </div>
    <div class="aic-cfg">
      <label>API key (test local)</label>
      <input type="password" class="aic-key" placeholder="sk-ant-..." autocomplete="off">
      <div class="aic-note">⚠ Chỉ dùng để chạy thử trên máy. Đừng commit/deploy file kèm key. Khi xong proxy sẽ không cần key ở đây.</div>
    </div>
    <div class="aic-msgs"></div>
    <div class="aic-foot">
      <textarea class="aic-in" rows="1" placeholder="Hỏi về mô hình… vd: có bao nhiêu cột ở tầng L3?"></textarea>
      <button class="aic-send" title="Gửi">➤</button>
    </div>`;
  document.body.appendChild(panel);

  const $ = s => panel.querySelector(s);
  const msgs = $('.aic-msgs'), keyInput = $('.aic-key'), inputEl = $('.aic-in'),
        sendBtn = $('.aic-send'), cfgBox = $('.aic-cfg');

  // ── render helpers ──
  function render(role, text){
    const d = document.createElement('div');
    d.className = 'aic-msg ' + role;
    d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function toolBadge(name, input){
    const d = document.createElement('div');
    d.className = 'aic-tool';
    d.textContent = '🔧 ' + name + ' ' + JSON.stringify(input || {});
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  function thinking(on, el){
    if(on){
      const d = document.createElement('div');
      d.className = 'aic-think'; d.textContent = 'Đang suy nghĩ…';
      msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
    } else if(el){ el.remove(); }
  }

  function endpoint(){ return AI_CONFIG.useProxy ? AI_CONFIG.proxyUrl : 'https://api.anthropic.com/v1/messages'; }
  function headers(){
    const h = { 'content-type':'application/json' };
    if(!AI_CONFIG.useProxy){
      h['x-api-key'] = AI_CONFIG.apiKey;
      h['anthropic-version'] = '2023-06-01';
      h['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    return h;
  }

  // ── system prompt + ngữ cảnh model (giúp Claude chọn đúng tên category/tầng) ──
  async function buildSystem(){
    let ctx = 'Hiện chưa có model IFC nào được load.';
    try{
      const idx = await buildAIIndex();
      if(idx){
        const cats = idx.categories.map(c=>c.name+'('+c.count+')').join(', ');
        const stos = idx.storeys.join(', ');
        const cls  = idx.ifcClasses.map(c=>c.name).join(', ');
        ctx = 'Model đang mở: ' + idx.models.map(m=>m.fileName).join(', ') + '. Tổng ' + idx.count + ' element.\n'
            + 'Category (Revit) có sẵn: ' + cats + '.\n'
            + 'Tầng (storey) có sẵn: ' + stos + '.\n'
            + 'Lớp IFC có sẵn: ' + cls + '.';
      }
    }catch(e){}
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
  const history = [];   // {role, content}
  let busy = false;

  async function ask(question){
    if(busy) return;
    if(!AI_CONFIG.useProxy && !AI_CONFIG.apiKey){
      cfgBox.classList.add('show');
      render('error', 'Chưa có API key. Mở ⚙ và dán key để test, hoặc bật proxy trong AI_CONFIG.');
      return;
    }
    busy = true; sendBtn.disabled = true;
    history.push({ role:'user', content: question });
    render('user', question);
    const system = await buildSystem();
    const thinkEl = thinking(true);
    try{
      let guard = 0;
      while(guard++ < 6){
        const res = await fetch(endpoint(), {
          method:'POST', headers: headers(),
          body: JSON.stringify({
            model: AI_CONFIG.model,
            max_tokens: AI_CONFIG.maxTokens,
            system,
            tools: window.AI_TOOLS,
            messages: history,
          }),
        });
        if(!res.ok){
          const t = await res.text().catch(()=> '');
          throw new Error('API ' + res.status + ': ' + t.slice(0,400));
        }
        const data = await res.json();
        history.push({ role:'assistant', content: data.content });
        const texts = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
        if(texts) render('assistant', texts);
        if(data.stop_reason === 'tool_use'){
          const toolUses = (data.content||[]).filter(b=>b.type==='tool_use');
          const results = [];
          for(const tu of toolUses){
            toolBadge(tu.name, tu.input);
            let out;
            try{ out = await window.runAITool(tu.name, tu.input); }
            catch(err){ out = { error: String((err && err.message) || err) }; }
            results.push({ type:'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
          }
          history.push({ role:'user', content: results });
          continue;
        }
        break;
      }
    }catch(e){
      render('error', (e && e.message) || String(e));
    }finally{
      thinking(false, thinkEl);
      busy = false; sendBtn.disabled = false; inputEl.focus();
    }
  }
  window.aiAsk = ask;

  // ── events ──
  fab.onclick = ()=>{ panel.classList.add('open'); fab.style.display='none'; inputEl.focus(); };
  panel.querySelector('[data-act=close]').onclick = ()=>{ panel.classList.remove('open'); fab.style.display='flex'; };
  panel.querySelector('[data-act=cfg]').onclick   = ()=>{ cfgBox.classList.toggle('show'); };
  panel.querySelector('[data-act=clear]').onclick = ()=>{ history.length=0; msgs.innerHTML=''; };
  keyInput.oninput = (e)=>{ AI_CONFIG.apiKey = e.target.value.trim(); };
  function autoGrow(){ inputEl.style.height='auto'; inputEl.style.height=Math.min(inputEl.scrollHeight,90)+'px'; }
  inputEl.oninput = autoGrow;
  function submit(){
    const q = inputEl.value.trim();
    if(!q || busy) return;
    inputEl.value=''; autoGrow(); ask(q);
  }
  sendBtn.onclick = submit;
  inputEl.onkeydown = (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); submit(); } };

  console.log('%c═══ AI CHAT UI sẵn sàng ═══','color:#2563eb;font-weight:700');
  console.log('Nhấn nút ✦ góc phải-dưới để mở chat. Dán API key trong ⚙ để test.');
})();

initThree();initSectionDrag();initViewCube();log('Ready');
