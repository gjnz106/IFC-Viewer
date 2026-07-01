/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — CROSS-DISCIPLINE runner (side-effectful glue cho plan 2.1)
   ───────────────────────────────────────────────────────────────────────
   Thu thập dữ liệu từ appState (AI index cho GUID, spatial cho tầng + geo)
   rồi gọi logic thuần trong ./cross-discipline.ts. Expose
   window.crossDisciplineChecks() — in báo cáo ra console (giống aiIndexSummary),
   sẵn để nối vào UI Compare/Clash sau này.
═══════════════════════════════════════════════════════════════════════ */
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { compoundToDeg } from '../validate/validator-rules.js';
import {
  buildCrossDisciplineReport, type ModelStoreys, type ModelGeo, type CrossDisciplineReport,
} from './cross-discipline.js';

async function runCrossDisciplineChecks(): Promise<CrossDisciplineReport | null> {
  const models = appState.loadedModels;
  if (!models.some((m: any) => !!m)) { log('Cross-discipline: chưa có model nào được load.'); return null; }

  // Elements (cho GUID trùng) lấy từ AI data index đã có sẵn.
  let elements: any[] = [];
  try {
    const build = (window as any).buildAIIndex;
    if (typeof build === 'function') { const ix = await build(); elements = (ix && ix.elements) || []; }
  } catch (e: any) { log('Cross-discipline: AI index err', e?.message); }

  const storeyModels: ModelStoreys[] = [];
  const geoModels: ModelGeo[] = [];
  for (let i = 0; i < models.length; i++) {
    const m: any = models[i];
    if (!m) continue;
    const name = m.fileName || m.spatial?.modelName || ('Model ' + i);
    storeyModels.push({
      idx: i, name,
      storeys: (m.spatial?.storeys || []).map((s: any) => s.name || '').filter(Boolean),
    });
    const site: any = (m.spatial?.sites || [])[0];
    let lat: number | null = null, lon: number | null = null, elev: number | null = null;
    if (site) {
      try { lat = site.refLat != null ? compoundToDeg(site.refLat) : null; } catch { }
      try { lon = site.refLon != null ? compoundToDeg(site.refLon) : null; } catch { }
      elev = typeof site.refElev === 'number' ? site.refElev : null;
    }
    geoModels.push({ modelIdx: i, modelName: name, lat, lon, elev });
  }

  const report = buildCrossDisciplineReport(elements, storeyModels, geoModels);

  console.log('%c═══ CROSS-DISCIPLINE CHECKS ═══', 'color:#2563eb;font-weight:700');
  console.log(`Model: ${report.modelCount}`);
  console.log(`— GUID trùng giữa các model: ${report.duplicateGuids.length}`);
  if (report.duplicateGuids.length) {
    console.table(report.duplicateGuids.slice(0, 20).map(c => ({ guid: c.guid, models: c.modelCount, elements: c.occurrences.length })));
  }
  console.log(`— Tên tầng nhất quán giữa các file: ${report.storeyNaming.consistent ? 'CÓ' : 'KHÔNG'}`);
  report.storeyNaming.perModel.forEach(p => { if (p.missing.length) console.log(`   • ${p.name} thiếu tầng: ${p.missing.join(', ')}`); });
  const g = report.geoReference;
  console.log(`— Geo-reference căn chỉnh: ${g.reference ? (g.aligned ? 'CÓ' : 'KHÔNG') : 'không có IfcSite'}`);
  if (g.missingGeo.length) console.log('   • Thiếu geo-ref:', g.missingGeo.map(x => x.modelName).join(', '));
  g.mismatches.forEach(mm => console.log(
    `   • ${mm.modelName} lệch gốc toạ độ: Δlat=${mm.dLatDeg.toExponential(2)}° Δlon=${mm.dLonDeg.toExponential(2)}°` +
    (mm.dElev != null ? ` Δelev=${mm.dElev.toFixed(3)}m` : '')));
  return report;
}

(window as any).crossDisciplineChecks = runCrossDisciplineChecks;
log('Cross-discipline checks sẵn sàng — window.crossDisciplineChecks()');
