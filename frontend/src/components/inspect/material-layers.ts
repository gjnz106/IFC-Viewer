/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — MATERIAL LAYER SET parser (plan 2.3)
   ───────────────────────────────────────────────────────────────────────
   Trích cấu trúc IfcMaterialLayerSet (từng lớp + độ dày) từ kết quả
   ifcManager.getMaterialsProperties(). Thuần, không side-effect → test được.

   Cấu trúc IFC (giá trị có thể bọc {value:x}):
     IfcMaterialLayerSetUsage → ForLayerSet → IfcMaterialLayerSet
       ├─ LayerSetName
       └─ MaterialLayers[]: IfcMaterialLayer
            ├─ Material.Name        (tên vật liệu lớp)
            └─ LayerThickness       (độ dày, theo đơn vị dài của model)
═══════════════════════════════════════════════════════════════════════ */

export interface MaterialLayer { name: string; thickness: number | null; }
export interface MaterialLayerSet {
  setName: string | null;
  layers: MaterialLayer[];
  /** Tổng độ dày (đơn vị model) — null nếu không lớp nào có độ dày. */
  totalThickness: number | null;
}

const unwrap = (v: any): any => (v && typeof v === 'object' && 'value' in v ? v.value : v);

// Tìm node chứa MaterialLayers trong cấu trúc (có thể lồng qua ForLayerSet).
function findLayerSetNode(m: any, depth = 0): any {
  if (!m || depth > 6) return null;
  if (m.MaterialLayers) return m;
  if (m.ForLayerSet) return findLayerSetNode(m.ForLayerSet, depth + 1);
  return null;
}

export function parseMaterialLayers(mats: any): MaterialLayerSet | null {
  const list = Array.isArray(mats) ? mats : (mats ? [mats] : []);
  let node: any = null;
  for (const m of list) { node = findLayerSetNode(m); if (node) break; }
  if (!node) return null;

  const setName = node.LayerSetName != null ? unwrap(node.LayerSetName)
    : (node.Name != null ? unwrap(node.Name) : null);

  const raw = Array.isArray(node.MaterialLayers) ? node.MaterialLayers : [node.MaterialLayers];
  const layers: MaterialLayer[] = [];
  for (const l of raw) {
    if (!l) continue;
    const mat = l.Material;
    const nameRaw = mat ? unwrap(mat.Name) : (l.Name != null ? unwrap(l.Name) : null);
    const t = l.LayerThickness != null ? Number(unwrap(l.LayerThickness)) : null;
    layers.push({
      name: nameRaw != null && String(nameRaw).trim() ? String(nameRaw) : '(unnamed)',
      thickness: t != null && isFinite(t) ? t : null,
    });
  }
  if (layers.length === 0) return null;

  const withT = layers.filter(l => l.thickness != null);
  const totalThickness = withT.length ? withT.reduce((s, l) => s + (l.thickness as number), 0) : null;
  return { setName: setName != null ? String(setName) : null, layers, totalThickness };
}
