/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — CROSS-DISCIPLINE CHECKS  (plan 2.1)
   ───────────────────────────────────────────────────────────────────────
   Kiểm tra phối hợp giữa nhiều bộ môn (federation): GUID trùng giữa các file,
   quy ước đặt tên tầng nhất quán, và căn chỉnh geo-reference (IfcSite).

   Logic thuần ở đây (không side-effect) để unit-test được; runner async
   runCrossDisciplineChecks() thu thập dữ liệu từ appState rồi gọi các hàm này.
═══════════════════════════════════════════════════════════════════════ */

// ── 1) GUID trùng giữa các model ──
// GlobalId phải duy nhất trong một model; cùng một GlobalId xuất hiện ở ≥2 model
// khác nhau thường là dấu hiệu copy nhầm / lỗi phối hợp giữa các bộ môn.
export interface GuidOccurrence { modelIdx: number; name: string; category: string; }
export interface GuidConflict { guid: string; modelCount: number; occurrences: GuidOccurrence[]; }

export function findDuplicateGuids(
  elements: { globalId?: string; modelIdx: number; name?: string; category?: string }[]
): GuidConflict[] {
  const byGuid: Record<string, GuidOccurrence[]> = {};
  for (const e of elements) {
    if (!e.globalId) continue;
    (byGuid[e.globalId] || (byGuid[e.globalId] = [])).push({
      modelIdx: e.modelIdx, name: e.name || '', category: e.category || '',
    });
  }
  const conflicts: GuidConflict[] = [];
  for (const [guid, occ] of Object.entries(byGuid)) {
    const models = new Set(occ.map(o => o.modelIdx));
    if (models.size >= 2) conflicts.push({ guid, modelCount: models.size, occurrences: occ });
  }
  return conflicts.sort((a, b) => b.modelCount - a.modelCount || b.occurrences.length - a.occurrences.length);
}

// ── 2) Quy ước đặt tên tầng (storey) ──
// So các tập tên tầng giữa file: liệt kê hợp (union), và với mỗi model, tầng nào
// nó THIẾU so với các model khác. "consistent" = mọi model có cùng tập tên tầng.
export interface ModelStoreys { idx: number; name: string; storeys: string[]; }
export interface StoreyNamingReport {
  consistent: boolean;
  allStoreyNames: string[];
  perModel: { idx: number; name: string; storeys: string[]; missing: string[] }[];
}

export function checkStoreyNaming(models: ModelStoreys[]): StoreyNamingReport {
  const norm = (s: string) => s.trim();
  const union = new Set<string>();
  for (const m of models) for (const s of m.storeys) if (s && s.trim()) union.add(norm(s));
  const allStoreyNames = [...union].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const perModel = models.map(m => {
    const have = new Set(m.storeys.filter(s => s && s.trim()).map(norm));
    const missing = allStoreyNames.filter(n => !have.has(n));
    return { idx: m.idx, name: m.name, storeys: [...have], missing };
  });
  const consistent = perModel.every(p => p.missing.length === 0);
  return { consistent, allStoreyNames, perModel };
}

// ── 3) Căn chỉnh geo-reference (IfcSite) ──
// So lat/long/elevation (đã đổi ra độ thập phân) giữa các model. Lệch quá dung
// sai → cảnh báo các bộ môn không cùng gốc toạ độ. Model không có site = thiếu geo-ref.
export interface ModelGeo { modelIdx: number; modelName: string; lat: number | null; lon: number | null; elev: number | null; }
export interface GeoReport {
  aligned: boolean;
  reference: ModelGeo | null;
  withGeo: number;
  missingGeo: { modelIdx: number; modelName: string }[];
  mismatches: { modelIdx: number; modelName: string; dLatDeg: number; dLonDeg: number; dElev: number | null }[];
}

// Dung sai mặc định: 1e-6 độ ≈ 0.11 m; cao độ 0.01 m.
export function checkGeoReference(models: ModelGeo[], tolDeg = 1e-6, tolElev = 0.01): GeoReport {
  const withGeo = models.filter(m => m.lat != null && m.lon != null);
  const missingGeo = models
    .filter(m => m.lat == null || m.lon == null)
    .map(m => ({ modelIdx: m.modelIdx, modelName: m.modelName }));

  if (withGeo.length === 0) {
    return { aligned: false, reference: null, withGeo: 0, missingGeo, mismatches: [] };
  }
  const reference = withGeo[0];
  const mismatches: GeoReport['mismatches'] = [];
  for (const m of withGeo.slice(1)) {
    const dLat = Math.abs((m.lat as number) - (reference.lat as number));
    const dLon = Math.abs((m.lon as number) - (reference.lon as number));
    const dElev = (m.elev != null && reference.elev != null) ? Math.abs(m.elev - reference.elev) : null;
    if (dLat > tolDeg || dLon > tolDeg || (dElev != null && dElev > tolElev)) {
      mismatches.push({ modelIdx: m.modelIdx, modelName: m.modelName, dLatDeg: dLat, dLonDeg: dLon, dElev });
    }
  }
  return { aligned: mismatches.length === 0, reference, withGeo: withGeo.length, missingGeo, mismatches };
}

export interface CrossDisciplineReport {
  modelCount: number;
  duplicateGuids: GuidConflict[];
  storeyNaming: StoreyNamingReport;
  geoReference: GeoReport;
}

// Ghép 3 kiểm tra thành 1 báo cáo (thuần) — runner async chỉ lo thu thập dữ liệu.
export function buildCrossDisciplineReport(
  elements: { globalId?: string; modelIdx: number; name?: string; category?: string }[],
  storeyModels: ModelStoreys[],
  geoModels: ModelGeo[],
): CrossDisciplineReport {
  return {
    modelCount: storeyModels.length,
    duplicateGuids: findDuplicateGuids(elements),
    storeyNaming: checkStoreyNaming(storeyModels),
    geoReference: checkGeoReference(geoModels),
  };
}
