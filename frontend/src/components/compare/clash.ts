// ══════════════════════════════════════════════════════════════
// ══ CLASH DETECTION MODULE ══
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { appState } from '../../store/index.js';
import { log } from '../core/ifc-category.js';
import { recordSnapshot, loadSnapshots } from '../validate/snapshots.js';

// Lịch sử snapshot clash theo thời gian (plan 2.4) — xem trong console: clashListSnapshots()
(window as any).clashListSnapshots = () => loadSnapshots().filter(s => s.kind === 'clash');

// Module-level variables (not in appState)
let clashSubsets: THREE.Group[] = [];
let currentClashIdx = -1;
let clashFilterCounterA = 0, clashFilterCounterB = 0;
let clashPropertyCacheA: Record<number, any> = {}, clashPropertyCacheB: Record<number, any> = {}; // eid→{propName:value}

// ── Populate category selects for Source/Target sets ──
// ── BIMcollab-style rule-row clash configuration ──
// Each set (Source / Target) is an array of rule rows. Each row has:
//   {elementType, property, operator, value, action}
// Rows are OR'd within a set (a row with action=Add includes elements
// matching it; action=Remove excludes them from the matched pool).
// Property/Operator/Value are optional — leave Property=None for an
// element-type-only rule.
interface ClashRuleRow {
  elementType: string;
  property: string;
  operator: string;
  value: string;
  action: 'Add' | 'Remove';
}

let clashRuleRows: { A: ClashRuleRow[]; B: ClashRuleRow[] } = { A: [], B: [] };

interface ClashResultData {
  idx: number;
  elA: { eid: number; name: string; type: string; objectType: string; tag: string; modelIdx: number; bbox: any };
  elB: { eid: number; name: string; type: string; objectType: string; tag: string; modelIdx: number; bbox: any };
  penetration: number;
  isHard: boolean;
  verticesAinB: number;
  verticesBinA: number;
  point: { x: number; y: number; z: number };
}

let clashResultsData: ClashResultData[] = [];

interface ClashGroup {
  key: string;
  items: { cl: ClashResultData; origIdx: number }[];
}

let clashGroups: ClashGroup[] = [];
let clashGroupMode = 'none';
let clashSelectedGroup: string | null = null;
let clashDisplayMode = 'all';

const CLASH_OPERATORS = [
  { v: '', label: '' },
  { v: 'equals', label: '=' },
  { v: 'not_equals', label: '≠' },
  { v: 'contains', label: '⊃' },
  { v: 'not_contains', label: '⊅' },
  { v: 'starts', label: 'starts' },
  { v: 'gt', label: '>' },
  { v: 'lt', label: '<' },
];
const CLASH_PROPERTIES = [
  { v: 'None', label: 'None' },
  { v: 'Name', label: 'Name' },
  { v: 'ObjectType', label: 'ObjectType' },
  { v: 'Tag', label: 'Tag / ElementID' },
  { v: 'Description', label: 'Description' },
  { v: 'PredefinedType', label: 'PredefinedType' },
];

// Build Revit category list for the Element Type dropdown. We collect IFC
// classes present in the model, map them to Revit categories via
// ifcClassToRevitCategory(), and de-duplicate. This means the user picks
// "Walls" once instead of having to pick IfcWall + IfcWallStandardCase
// + IfcCurtainWall separately. The reverse map (category → ifc classes)
// is built alongside so resolveClashElementTypes can expand a category
// pick back to the full IFC class set when running clash.
function getClashElementTypes(side: string): string[] {
  const catIDs: Record<string, any[]> = (window as any)._catModelIDs || {};
  const mi = side === 'A' ? 0 : 1;
  const revitCats = new Set<string>();
  Object.entries(catIDs).forEach(([ifcClass, models]) => {
    if (models[mi] && models[mi].length > 0) {
      revitCats.add((window as any).ifcClassToRevitCategory(ifcClass));
    }
  });
  return [...revitCats].sort();
}

// Map a Revit category label back to the set of IFC class names that map to
// it within the loaded model. Multiple classes commonly fall into the same
// category (Walls = IfcWall + IfcWallStandardCase + IfcCurtainWall).
function revitCategoryToIfcClasses(catLabel: string, side: string): Set<string> {
  const catIDs: Record<string, any[]> = (window as any)._catModelIDs || {};
  const mi = side === 'A' ? 0 : 1;
  const out = new Set<string>();
  Object.entries(catIDs).forEach(([ifcClass, models]) => {
    if (!models[mi] || !models[mi].length) return;
    if ((window as any).ifcClassToRevitCategory(ifcClass) === catLabel) out.add(ifcClass);
  });
  return out;
}

// Render the table body for one set. Each row is an editable form.
function renderClashRules(side: string): void {
  const tbody = document.getElementById('clashRules' + side);
  if (!tbody) return;
  const rows = clashRuleRows[side as 'A' | 'B'];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:8px;font-style:italic">Click + to add element types</td></tr>';
    return;
  }
  const elTypes = getClashElementTypes(side);
  const escA = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = '';
  rows.forEach((r, i) => {
    const typeOpts = ['<option value="">— select —</option>']
      .concat(elTypes.map(t => {
        // t is the Revit category label (e.g. "Walls", "Pipes"). The data
        // model stores the label directly; resolveClashElementTypes() expands
        // it back to the IFC class set when running clash.
        return `<option value="${escA(t)}"${r.elementType === t ? ' selected' : ''}>${escA(t)}</option>`;
      }))
      .join('');
    const propOpts = CLASH_PROPERTIES.map(p => `<option value="${p.v}"${r.property === p.v ? ' selected' : ''}>${p.label}</option>`).join('');
    const opOpts = CLASH_OPERATORS.map(o => `<option value="${o.v}"${r.operator === o.v ? ' selected' : ''}>${o.label || '—'}</option>`).join('');
    const valDisabled = (!r.property || r.property === 'None') ? 'disabled' : '';
    const opDisabled  = (!r.property || r.property === 'None') ? 'disabled' : '';
    const actionOpts = ['<option value="Add"' + (r.action === 'Add' ? ' selected' : '') + '>Add</option>',
                        '<option value="Remove"' + (r.action === 'Remove' ? ' selected' : '') + '>Remove</option>'].join('');
    html += `<tr data-row-idx="${i}">
      <td><select onchange="updateClashRow('${side}',${i},'elementType',this.value)">${typeOpts}</select></td>
      <td><select onchange="updateClashRow('${side}',${i},'property',this.value)">${propOpts}</select></td>
      <td><select ${opDisabled} onchange="updateClashRow('${side}',${i},'operator',this.value)">${opOpts}</select></td>
      <td><input type="text" ${valDisabled} value="${escA(r.value)}" placeholder="value" onchange="updateClashRow('${side}',${i},'value',this.value)"></td>
      <td><div class="clash-rule-row-action">
        <select onchange="updateClashRow('${side}',${i},'action',this.value)">${actionOpts}</select>
        <button class="clash-row-del" onclick="deleteClashRow('${side}',${i})" title="Delete row">×</button>
      </div></td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

window.addClashRow = function(side: string): void {
  clashRuleRows[side as 'A' | 'B'].push({
    elementType: '', property: 'None', operator: '', value: '', action: 'Add'
  });
  renderClashRules(side);
};

window.removeLastClashRow = function(side: string): void {
  if (clashRuleRows[side as 'A' | 'B'].length > 0) {
    clashRuleRows[side as 'A' | 'B'].pop();
    renderClashRules(side);
  }
};

window.deleteClashRow = function(side: string, idx: number): void {
  clashRuleRows[side as 'A' | 'B'].splice(idx, 1);
  renderClashRules(side);
};

window.updateClashRow = function(side: string, idx: number, field: string, value: string): void {
  const r = clashRuleRows[side as 'A' | 'B'][idx];
  if (!r) return;
  (r as any)[field] = value;
  // When property changes, may need to enable/disable operator+value cells
  if (field === 'property') {
    if (value === 'None') {
      r.operator = '';
      r.value = '';
    }
    renderClashRules(side); // re-render to update disabled state
  }
};

// Initialize default rows when entering clash mode (one Add row per set).
function initClashRulesDefault(): void {
  if (clashRuleRows.A.length === 0) {
    clashRuleRows.A.push({ elementType: '', property: 'None', operator: '', value: '', action: 'Add' });
  }
  if (clashRuleRows.B.length === 0) {
    clashRuleRows.B.push({ elementType: '', property: 'None', operator: '', value: '', action: 'Add' });
  }
  renderClashRules('A');
  renderClashRules('B');
}

// Resolve final element-type set from the rules (apply Add/Remove logic).
// Returns Set<string> of IFC class names. Only Add rows that have a non-empty
// elementType count; Remove rows subtract from the accumulated set.
function resolveClashElementTypes(side: string): Set<string> {
  // Each rule's elementType is a Revit category label (e.g. "Walls").
  // Expand each label to the set of IFC class names it covers so the
  // clash engine — which works on IFC class buckets — gets the right
  // input. Add rows union; Remove rows subtract.
  const set = new Set<string>();
  for (const r of clashRuleRows[side as 'A' | 'B']) {
    if (!r.elementType) continue;
    const ifcClasses = revitCategoryToIfcClasses(r.elementType, side);
    if (r.action === 'Add') {
      ifcClasses.forEach(c => set.add(c));
    } else if (r.action === 'Remove') {
      ifcClasses.forEach(c => set.delete(c));
    }
  }
  return set;
}

// Resolve property filters from rule rows. Returns array of filter clauses
// keyed by element type. Each clause: {prop, op, val} — applies only to
// elements of the matching elementType (per-type filtering).
function resolveClashFilters(side: string): Record<string, { prop: string; op: string; val: string }[]> {
  // Each rule's elementType is a Revit category label. Expand it to the
  // covered IFC class names and key the filter map by those classes, so
  // when the engine filters elements with `entity.type === IFC_CLASS`
  // the lookup matches.
  const byType: Record<string, { prop: string; op: string; val: string }[]> = {};
  for (const r of clashRuleRows[side as 'A' | 'B']) {
    if (!r.elementType || r.action !== 'Add') continue;
    if (!r.property || r.property === 'None' || !r.operator || !r.value) continue;
    const ifcClasses = revitCategoryToIfcClasses(r.elementType, side);
    ifcClasses.forEach(c => {
      if (!byType[c]) byType[c] = [];
      byType[c].push({ prop: r.property, op: r.operator, val: r.value });
    });
  }
  return byType;
}

// Apply a preset selection by replacing the rule rows with one row per
// preset elementType. Resets prior rows.
const CLASH_PRESETS: Record<string, { A: string[] | '*'; B: string[] | '*' }> = {
  'struct-mep': {
    A: ['IfcBeam', 'IfcColumn', 'IfcSlab', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting', 'IfcMember', 'IfcPlate', 'IfcRoof', 'IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight'],
    B: ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting', 'IfcCableCarrierSegment', 'IfcCableCarrierFitting', 'IfcCableSegment', 'IfcFlowSegment', 'IfcFlowFitting', 'IfcFlowTerminal', 'IfcFlowController', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcFlowMovingDevice', 'IfcFlowStorageDevice', 'IfcFlowTreatmentDevice', 'IfcSanitaryTerminal', 'IfcAirTerminal', 'IfcLightFixture', 'IfcElectricAppliance', 'IfcElectricDistributionBoard', 'IfcElectricMotor', 'IfcSwitchingDevice', 'IfcOutlet', 'IfcSensor', 'IfcAlarm', 'IfcController', 'IfcUnitaryEquipment', 'IfcValve', 'IfcPump', 'IfcFan', 'IfcBoiler', 'IfcChiller'],
  },
  'arch-mep': {
    A: ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcStair', 'IfcStairFlight', 'IfcRailing', 'IfcCovering', 'IfcCurtainWall', 'IfcFurnishingElement'],
    B: ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting', 'IfcCableCarrierSegment', 'IfcCableCarrierFitting', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcAirTerminal', 'IfcLightFixture'],
  },
  'struct-arch': {
    A: ['IfcBeam', 'IfcColumn', 'IfcSlab', 'IfcFooting', 'IfcMember', 'IfcPlate'],
    B: ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcStair', 'IfcStairFlight', 'IfcRailing', 'IfcCovering', 'IfcCurtainWall'],
  },
  'all-all': { A: '*', B: '*' },
};

window.applyClashPreset = function(presetKey: string): void {
  const preset = CLASH_PRESETS[presetKey];
  if (!preset) { log('Unknown clash preset: ' + presetKey); return; }
  ['A', 'B'].forEach(side => {
    const list = preset[side as 'A' | 'B'];
    let categories: string[]; // final list of Revit category labels for this side
    const available = new Set(getClashElementTypes(side));
    if (list === '*') {
      categories = [...available];
    } else {
      // Convert preset's IFC class list to Revit category labels, then
      // dedupe and intersect with what's actually present in the model.
      // This means a preset listing IfcWall + IfcWallStandardCase produces
      // a single "Walls" row (not two duplicate rows).
      const catSet = new Set<string>();
      (list as string[]).forEach(ifcClass => {
        const cat = (window as any).ifcClassToRevitCategory(ifcClass);
        if (available.has(cat)) catSet.add(cat);
      });
      categories = [...catSet].sort();
    }
    clashRuleRows[side as 'A' | 'B'] = categories.map(t => ({
      elementType: t, property: 'None', operator: '', value: '', action: 'Add' as const
    }));
    renderClashRules(side);
  });
  // Update rule name to reflect preset
  const nameMap: Record<string, string> = { 'struct-mep': 'Structure ↔ MEP', 'arch-mep': 'Architecture ↔ MEP', 'struct-arch': 'Structure ↔ Architecture', 'all-all': 'All ↔ All' };
  const nameEl = document.getElementById('clashRuleName') as HTMLInputElement | null;
  if (nameEl && nameMap[presetKey]) nameEl.value = nameMap[presetKey];
  log('Applied clash preset: ' + presetKey);
};

window.swapClashSets = function(): void {
  const a = clashRuleRows.A, b = clashRuleRows.B;
  // Filter to types that exist in the OPPOSITE side's model. A type might
  // exist in A but not B; can't swap those.
  const availA = new Set(getClashElementTypes('A'));
  const availB = new Set(getClashElementTypes('B'));
  clashRuleRows.A = b.filter(r => !r.elementType || availA.has(r.elementType));
  clashRuleRows.B = a.filter(r => !r.elementType || availB.has(r.elementType));
  renderClashRules('A');
  renderClashRules('B');
  log('Swapped Source ↔ Target sets');
};

// Compatibility shim — old code referenced these but they're no longer in UI.
function getSelectedCats(side: string): string[] { return [...resolveClashElementTypes(side)]; }
function passesFilters(entity: any, filters: any[]): boolean {
  // Old function — replaced by passesClashFiltersForType. Kept for any
  // remaining call sites.
  if (!filters || !filters.length) return true;
  for (const f of filters) {
    const v = String(entity[f.prop] || entity[f.prop?.toLowerCase?.() ] || '').toLowerCase();
    const fv = String(f.val || f.value || '').toLowerCase();
    let pass = false;
    if (f.op === 'contains') pass = v.includes(fv);
    else if (f.op === 'equals') pass = v === fv;
    else if (f.op === 'not_contains') pass = !v.includes(fv);
    else if (f.op === 'not_equals') pass = v !== fv;
    else if (f.op === 'starts') pass = v.startsWith(fv);
    else if (f.op === 'gt') pass = parseFloat(v) > parseFloat(fv);
    else if (f.op === 'lt') pass = parseFloat(v) < parseFloat(fv);
    if (!pass) return false;
  }
  return true;
}
function getClashFilters(side: string): any[] {
  // Old API: a flat list of filter objects. Build by flattening all
  // elementType-keyed filters from the new rule rows.
  const byType = resolveClashFilters(side);
  const flat: any[] = [];
  for (const t in byType) {
    for (const f of byType[t]) flat.push({ ...f, elementType: t });
  }
  return flat;
}

// Enter/exit are the primitives the router reconciles page state against.
// window.toggleClashMode stays only as a navigation alias for legacy callers
// (hidden #btnClash) — it routes through navigateTo so the hash, sidebar
// highlight and persisted page can never drift from the real mode.
export function enterClashMode(): void {
  if (appState.clashMode) return;
  // The router exits compare before entering the clash page; this guard only
  // protects direct programmatic calls.
  if (appState.compareResult) { log('Clash: exit compare first'); return; }
  appState.clashMode = true;
  document.getElementById('btnClash')!.classList.add('active');

  document.getElementById('clashPanel')!.classList.add('show');
  // Show the bottom panel resize handle (sits between 3D canvas and panel)
  const br = document.getElementById('bresize'); if (br) br.style.display = '';
  document.getElementById('eTree')!.style.display = 'none';
  document.getElementById('issuesList')!.classList.remove('show');
  document.getElementById('panelTabs')?.classList.remove('show');
  document.getElementById('issueNav')!.classList.remove('show');
  document.getElementById('btnRunClash')!.style.display = '';
  document.getElementById('btnCompare')!.style.display = 'none';

  if (appState.files[0]) document.getElementById('clashFileA')!.textContent = appState.files[0]!.name;
  if (appState.files[1]) document.getElementById('clashFileB')!.textContent = appState.files[1]!.name;
  (document.getElementById('btnRunClash') as HTMLButtonElement).disabled = !(appState.loadedModels[0] && appState.loadedModels[1]);

  // Initialize default rule rows (reads loaded model categories internally)
  initClashRulesDefault();
  // The bottom panel just claimed ~320px of viewport height — reflow 3D
  if ((window as any)._vpResize) (window as any)._vpResize();
}

window.toggleClashMode = function(): void {
  window.navigateTo?.(appState.clashMode ? 'viewer' : 'clash');
};

export function exitClashMode(): void {
  appState.clashMode = false;
  document.getElementById('btnClash')!.classList.remove('active');
  document.getElementById('clashPanel')!.classList.remove('show');
  // Hide the bottom panel resize handle when there's no panel to resize
  const br = document.getElementById('bresize'); if (br) br.style.display = 'none';
  document.getElementById('eTree')!.style.display = '';
  document.getElementById('btnRunClash')!.style.display = 'none';
  document.getElementById('btnExitClash')!.style.display = 'none';
  document.getElementById('btnExportClashCSV')!.style.display = 'none';
  document.getElementById('btnExportClashBCF')!.style.display = 'none';
  document.getElementById('btnCompare')!.style.display = '';
  document.getElementById('vpClashLegend')!.classList.remove('show');
  const bothLoaded = !!(appState.loadedModels[0] && appState.loadedModels[1]);
  (document.getElementById('btnCompare') as HTMLButtonElement).disabled = !bothLoaded;
  const panelBtn2 = document.getElementById('btnRunComparePanel') as HTMLButtonElement|null;
  if(panelBtn2){panelBtn2.disabled=!bothLoaded;panelBtn2.style.opacity=bothLoaded?'1':'.35';}
  document.getElementById('clashGroupBar')!.style.display = 'none';

  clashSubsets.forEach(s => { if ((s as any).parent) (s as any).parent.remove(s); });
  clashSubsets = []; appState.clashResults = []; currentClashIdx = -1;
  clashPropertyCacheA = {}; clashPropertyCacheB = {};
  // Remove focus highlights
  const oldFocus: THREE.Object3D[] = [];
  appState.scene.traverse(c => { if ((c as any).userData?.clashFocus) oldFocus.push(c); });
  oldFocus.forEach(c => { if (c.parent) c.parent.remove(c); });

  for (let i = 0; i < 2; i++) {
    if (!appState.loadedModels[i]) continue;
    const vis = (document.getElementById(i === 0 ? 'visA' : 'visB') as HTMLInputElement).checked;
    appState.loadedModels[i]!.visible = vis;
    appState.loadedModels[i]!.traverse(c => {
      if ((c as any).isMesh) {
        if ((c as any).userData._clashOrigMats) { (c as any).material = (c as any).userData._clashOrigMats; delete (c as any).userData._clashOrigMats; }
        (c as any).visible = true;
      }
    });
  }

  document.getElementById('clashStats')!.style.display = 'none';
  document.getElementById('clashList')!.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Configure Source &amp; Target sets, then click <b>▶ Run Clash</b></div>';
  // (Formerly wiped #clashFiltersA/B here — those IDs died with the pre-rule-row
  // clash UI, so the two lines threw every exit and aborted the reflow below.
  // Rule rows persist in clashRuleRows and re-render on the next enter.)
  // Bottom panel just released its height back to the canvas — reflow 3D
  if ((window as any)._vpResize) (window as any)._vpResize();
  log('Exited clash mode');
}
window.exitClashMode = exitClashMode;

// ── Build per-element bounding boxes for a model ──
function buildElementBBoxes(modelIdx: number): Record<number, any> {
  const model = appState.loadedModels[modelIdx];
  if (!model) return {};
  const elements: Record<number, any> = {};

  model.traverse(c => {
    if (!(c as any).isMesh || !(c as any).geometry?.attributes?.expressID || !(c as any).geometry?.attributes?.position) return;
    const eidArr: ArrayLike<number> = (c as any).geometry.attributes.expressID.array;
    const posArr: ArrayLike<number> = (c as any).geometry.attributes.position.array;
    const wm = (c as THREE.Mesh).matrixWorld;
    const v = new THREE.Vector3();

    for (let i = 0; i < eidArr.length; i++) {
      const eid = eidArr[i];
      if (!eid || eid <= 0) continue;
      const pi = i * 3;
      if (pi + 2 >= posArr.length) continue;
      const x = posArr[pi], y = posArr[pi + 1], z = posArr[pi + 2];
      if (isNaN(x)) continue;

      v.set(x, y, z).applyMatrix4(wm);

      if (!elements[eid]) {
        elements[eid] = {
          eid, modelIdx,
          mnX: v.x, mnY: v.y, mnZ: v.z, mxX: v.x, mxY: v.y, mxZ: v.z,
          vertCount: 0
        };
      }
      const el = elements[eid];
      el.vertCount++;
      if (v.x < el.mnX) el.mnX = v.x; if (v.x > el.mxX) el.mxX = v.x;
      if (v.y < el.mnY) el.mnY = v.y; if (v.y > el.mxY) el.mxY = v.y;
      if (v.z < el.mnZ) el.mnZ = v.z; if (v.z > el.mxZ) el.mxZ = v.z;
    }
  });

  return elements;
}

// ── Check if two axis-aligned bboxes overlap (with tolerance) ──
function bboxOverlap(a: any, b: any, tol: number): boolean {
  return a.mnX <= b.mxX + tol && a.mxX >= b.mnX - tol &&
         a.mnY <= b.mxY + tol && a.mxY >= b.mnY - tol &&
         a.mnZ <= b.mxZ + tol && a.mxZ >= b.mnZ - tol;
}

// ── Compute penetration depth between two bboxes ──
function bboxPenetration(a: any, b: any): number {
  const ox = Math.min(a.mxX, b.mxX) - Math.max(a.mnX, b.mnX);
  const oy = Math.min(a.mxY, b.mxY) - Math.max(a.mnY, b.mnY);
  const oz = Math.min(a.mxZ, b.mxZ) - Math.max(a.mnZ, b.mnZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz); // penetration depth = smallest overlap axis
}

// ── Sample-based mesh intersection test ──
// Instead of full triangle-triangle intersection (very expensive),
// we sample vertices from element A and check if any are inside element B's bbox
// For more accurate results, we do a bidirectional check
function meshIntersectionTest(elA: any, elB: any, modelA: THREE.Group, modelB: THREE.Group): any {
  // Collect vertices of A that are inside B's bbox (expanded slightly)
  const pad = 0.01;

  const checkInside = (srcModel: THREE.Group, srcEid: number, targetBBox: any) => {
    let inside = 0, total = 0;
    srcModel.traverse(c => {
      if (!(c as any).isMesh || !(c as any).geometry?.attributes?.expressID || !(c as any).geometry?.attributes?.position) return;
      const eids: ArrayLike<number> = (c as any).geometry.attributes.expressID.array;
      const pos: ArrayLike<number> = (c as any).geometry.attributes.position.array;
      const wm = (c as THREE.Mesh).matrixWorld;
      const v = new THREE.Vector3();
      for (let i = 0; i < eids.length; i++) {
        if (eids[i] !== srcEid) continue;
        total++;
        const pi = i * 3;
        v.set(pos[pi], pos[pi + 1], pos[pi + 2]).applyMatrix4(wm);
        if (v.x >= targetBBox.mnX - pad && v.x <= targetBBox.mxX + pad &&
            v.y >= targetBBox.mnY - pad && v.y <= targetBBox.mxY + pad &&
            v.z >= targetBBox.mnZ - pad && v.z <= targetBBox.mxZ + pad) {
          inside++;
        }
      }
    });
    return { inside, total };
  };

  const rAB = checkInside(modelA, elA.eid, elB);
  const rBA = checkInside(modelB, elB.eid, elA);

  return {
    verticesAinB: rAB.inside,
    totalA: rAB.total,
    verticesBinA: rBA.inside,
    totalB: rBA.total,
    isHard: rAB.inside > 0 || rBA.inside > 0
  };
}

// ── Main Clash Detection ──
window.runClashDetection = async function(): Promise<void> {
  if (!appState.loadedModels[0] || !appState.loadedModels[1]) return;
  const lo = document.getElementById('loadOv')!, lt = document.getElementById('loadTxt')!, lf = document.getElementById('loadFill')!;
  lo.classList.add('on');

  // ── Read configuration from new BIMcollab-style UI ──
  // Tolerances. The "Minimum distance" field controls what previously was the
  // single tolerance slider — clearance threshold in mm.
  const minDistMm = parseFloat((document.getElementById('clashTolMinDist') as HTMLInputElement)?.value) || 0;
  const tolerance = minDistMm / 1000;  // m
  // Type checkboxes (Clash / Duplicate / Distance). For now we map:
  //   Clash → hard clash
  //   Distance (with minDistMm > 0) → clearance
  //   Both checked → 'both'
  const cClash     = (document.getElementById('clashTypeClash') as HTMLInputElement)?.checked;
  const cDuplicate = (document.getElementById('clashTypeDuplicate') as HTMLInputElement)?.checked;
  const cDistance  = (document.getElementById('clashTypeDistance') as HTMLInputElement)?.checked || minDistMm > 0;
  let clashTypeFilter: string = 'hard';
  if (cClash && cDistance) clashTypeFilter = 'both';
  else if (cDistance)      clashTypeFilter = 'clearance';
  else                     clashTypeFilter = 'hard';

  // ── Collect filter configuration from rule rows ──
  const catsA = resolveClashElementTypes('A');
  const catsB = resolveClashElementTypes('B');
  const filtersA = getClashFilters('A');
  const filtersB = getClashFilters('B');

  if (catsA.size === 0 || catsB.size === 0) {
    lo.classList.remove('on');
    alert('Please add at least one Element Type to both Source Set and Target Set.');
    return;
  }

  log('Clash config: Source types=' + catsA.size + ', Target types=' + catsB.size + ', filtersA=' + filtersA.length + ', filtersB=' + filtersB.length + ', tolerance=' + tolerance + 'm, type=' + clashTypeFilter);

  // ── Phase 1: Build filtered element sets ──
  lt.textContent = 'Building Source Set (Model A)...'; lf.style.width = '5%';
  await new Promise(r => setTimeout(r, 30));

  const catIDs: Record<string, any[]> = (window as any)._catModelIDs || {};
  const api = appState.ifcLoader?.ifcManager?.state?.api;

  // Build element properties for filtering
  const buildFilteredSet = async (modelIdx: number, selectedCats: Set<string>, propFilters: any[]) => {
    const elements: Record<number, any> = {};
    const propCache: Record<number, any> = {};
    for (const cat of selectedCats) {
      const ids = catIDs[cat]?.[modelIdx];
      if (!ids) continue;
      for (const eid of ids) {
        // Get properties for filter matching
        let entity: any = { expressID: eid, type: cat, name: '', objectType: '', tag: '', description: '', predefinedType: '' };
        try {
          const p = await appState.ifcLoader.ifcManager.getItemProperties((appState.loadedModels[modelIdx] as any).modelID, eid, false);
          if (p) {
            entity.name = p.Name?.value || '';
            entity.objectType = p.ObjectType?.value || '';
            entity.tag = p.Tag?.value || '';
            entity.description = p.Description?.value || '';
            entity.predefinedType = p.PredefinedType?.value || '';
            entity.Name = entity.name; entity.ObjectType = entity.objectType;
            entity.Tag = entity.tag; entity.Description = entity.description;
            entity.PredefinedType = entity.predefinedType;
          }
        } catch (e) {}

        // Apply property filters
        if (!passesFilters(entity, propFilters)) continue;

        elements[eid] = entity;
        propCache[eid] = entity;
      }
    }
    return { elements, propCache };
  };

  const setA = await buildFilteredSet(0, catsA, filtersA);
  lt.textContent = 'Building Target Set (Model B)...'; lf.style.width = '15%';
  await new Promise(r => setTimeout(r, 20));
  const setB = await buildFilteredSet(1, catsB, filtersB);

  clashPropertyCacheA = setA.propCache;
  clashPropertyCacheB = setB.propCache;

  const sourceEids = new Set(Object.keys(setA.elements).map(Number));
  const targetEids = new Set(Object.keys(setB.elements).map(Number));

  log(`Filtered sets: Source=${sourceEids.size} elements, Target=${targetEids.size} elements`);

  // ── Phase 2: Build BBoxes only for filtered elements ──
  lt.textContent = 'Computing bounding boxes...'; lf.style.width = '20%';
  await new Promise(r => setTimeout(r, 20));

  const allBBoxA = buildElementBBoxes(0);
  const allBBoxB = buildElementBBoxes(1);

  // Filter to only Source/Target set elements
  const arrA = Object.values(allBBoxA).filter(e => sourceEids.has(e.eid));
  const arrB = Object.values(allBBoxB).filter(e => targetEids.has(e.eid));

  log(`BBoxes: Source=${arrA.length}, Target=${arrB.length}`);
  lt.textContent = `BBox pre-filter (${arrA.length} × ${arrB.length})...`; lf.style.width = '30%';
  await new Promise(r => setTimeout(r, 20));

  // ── Phase 3: BBox overlap ──
  const candidates: { a: any; b: any; penetration: number }[] = [];
  let checked = 0;
  const total = arrA.length * arrB.length;

  for (const a of arrA) {
    for (const b of arrB) {
      if (bboxOverlap(a, b, tolerance)) {
        const pen = bboxPenetration(a, b);
        candidates.push({ a, b, penetration: pen });
      }
      checked++;
    }
    if (checked % 50000 === 0) {
      lt.textContent = `BBox: ${candidates.length} candidates (${Math.round(checked / total * 100)}%)`;
      lf.style.width = (30 + 30 * (checked / total)) + '%';
      await new Promise(r => setTimeout(r, 0));
    }
  }

  log(`BBox pre-filter: ${candidates.length} candidates`);
  lt.textContent = `Mesh intersection (${candidates.length} pairs)...`; lf.style.width = '60%';
  await new Promise(r => setTimeout(r, 20));

  // ── Phase 4: Mesh intersection + property enrichment ──
  appState.clashResults = [];
  const maxCheck = Math.min(candidates.length, 2000);
  candidates.sort((a, b) => b.penetration - a.penetration);
  const skipTypes = new Set(['IfcSpace', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcProject']);

  for (let i = 0; i < maxCheck; i++) {
    const { a, b, penetration } = candidates[i];

    const meshTest = meshIntersectionTest(a, b, appState.loadedModels[0]!, appState.loadedModels[1]!);
    const isHard = meshTest.isHard;

    // Apply clash type filter
    if (clashTypeFilter === 'hard' && !isHard) continue;
    if (clashTypeFilter === 'clearance' && isHard) continue;

    if (isHard || penetration > tolerance) {
      const entA = clashPropertyCacheA[a.eid] || {};
      const entB = clashPropertyCacheB[b.eid] || {};
      const typeA = entA.type || '';
      const typeB = entB.type || '';

      if (skipTypes.has(typeA) || skipTypes.has(typeB)) continue;

      appState.clashResults.push({
        idx: appState.clashResults.length,
        elA: { eid: a.eid, name: entA.name || '', type: typeA, objectType: entA.objectType || '', tag: entA.tag || '', modelIdx: 0, bbox: a },
        elB: { eid: b.eid, name: entB.name || '', type: typeB, objectType: entB.objectType || '', tag: entB.tag || '', modelIdx: 1, bbox: b },
        penetration, isHard,
        verticesAinB: meshTest.verticesAinB,
        verticesBinA: meshTest.verticesBinA,
        point: {
          x: (Math.max(a.mnX, b.mnX) + Math.min(a.mxX, b.mxX)) / 2,
          y: (Math.max(a.mnY, b.mnY) + Math.min(a.mxY, b.mxY)) / 2,
          z: (Math.max(a.mnZ, b.mnZ) + Math.min(a.mxZ, b.mxZ)) / 2
        }
      });
    }

    if (i % 100 === 0) {
      lt.textContent = `Mesh: ${i}/${maxCheck} (${appState.clashResults.length} clashes)`;
      lf.style.width = (60 + 30 * (i / maxCheck)) + '%';
      await new Promise(r => setTimeout(r, 0));
    }
  }

  log(`Clash detection complete: ${appState.clashResults.length} clashes found`);
  lt.textContent = `Done! ${appState.clashResults.length} clashes`; lf.style.width = '100%';
  await new Promise(r => setTimeout(r, 300));
  lo.classList.remove('on');

  showClashResults();
};

function showClashResults(): void {
  document.getElementById('btnExitClash')!.style.display = '';
  document.getElementById('btnRunClash')!.style.display = 'none';
  document.getElementById('vpClashLegend')!.classList.add('show');
  document.getElementById('clashGroupBar')!.style.display = 'flex';
  if (appState.clashResults.length > 0) { document.getElementById('btnExportClashCSV')!.style.display = ''; document.getElementById('btnExportClashBCF')!.style.display = ''; }

  // Keep models mostly visible — only slightly fade them
  for (let i = 0; i < 2; i++) {
    if (!appState.loadedModels[i]) continue;
    appState.loadedModels[i]!.traverse(c => {
      if ((c as any).isMesh) {
        if (!(c as any).userData._clashOrigMats) {
          (c as any).userData._clashOrigMats = Array.isArray((c as any).material) ? (c as any).material.map((m: THREE.Material) => (m as any).clone()) : (c as any).material.clone();
        }
        const ms: THREE.Material[] = Array.isArray((c as any).material) ? (c as any).material : [(c as any).material];
        ms.forEach(m => {
          (m as any).transparent = true; (m as any).opacity = 0.55; (m as any).depthWrite = true; (m as any).needsUpdate = true;
          (m as any).clippingPlanes = appState.clipPlanes;
        });
      }
    });
  }

  // ── Create clash zone markers at each intersection point ──
  // For each clash, create a glowing box at the overlap region (not the full element)
  const clashGroup = new THREE.Group();
  clashGroup.name = 'clashMarkers';
  (clashGroup as any).userData.clashSubset = true;

  appState.clashResults.forEach((cl: any, i: number) => {
    // Compute the actual overlap box between the two element bboxes
    const overlapMnX = Math.max(cl.elA.bbox.mnX, cl.elB.bbox.mnX);
    const overlapMnY = Math.max(cl.elA.bbox.mnY, cl.elB.bbox.mnY);
    const overlapMnZ = Math.max(cl.elA.bbox.mnZ, cl.elB.bbox.mnZ);
    const overlapMxX = Math.min(cl.elA.bbox.mxX, cl.elB.bbox.mxX);
    const overlapMxY = Math.min(cl.elA.bbox.mxY, cl.elB.bbox.mxY);
    const overlapMxZ = Math.min(cl.elA.bbox.mxZ, cl.elB.bbox.mxZ);

    const sx = Math.max(overlapMxX - overlapMnX, 0.05);
    const sy = Math.max(overlapMxY - overlapMnY, 0.05);
    const sz = Math.max(overlapMxZ - overlapMnZ, 0.05);
    const cx = (overlapMnX + overlapMxX) / 2;
    const cy = (overlapMnY + overlapMxY) / 2;
    const cz = (overlapMnZ + overlapMxZ) / 2;

    // Solid semi-transparent red box at the clash zone
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    const boxMat = new THREE.MeshPhongMaterial({
      color: cl.isHard ? 0xff1744 : 0xff9100,
      transparent: true, opacity: 0.65,
      side: THREE.DoubleSide, depthWrite: false,
      emissive: new THREE.Color(cl.isHard ? 0x660000 : 0x663300),
      clippingPlanes: appState.clipPlanes
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(cx, cy, cz);
    box.renderOrder = 900;
    box.userData.clashIdx = i;
    box.userData.clashSubset = true;
    clashGroup.add(box);

    // Wireframe outline for clarity
    const wireGeo = new THREE.BoxGeometry(sx * 1.02, sy * 1.02, sz * 1.02);
    const wireMat = new THREE.MeshBasicMaterial({
      color: cl.isHard ? 0xff1744 : 0xff9100,
      wireframe: true, depthTest: false,
      transparent: true, opacity: 0.9
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.set(cx, cy, cz);
    wire.renderOrder = 901;
    wire.userData.clashSubset = true;
    clashGroup.add(wire);
  });

  appState.scene.add(clashGroup);
  clashSubsets.push(clashGroup);
  log('Created ' + appState.clashResults.length + ' clash zone markers');

  // Stats
  const hard = appState.clashResults.filter((c: any) => c.isHard).length;
  const near = appState.clashResults.length - hard;
  document.getElementById('clashStats')!.style.display = '';
  document.getElementById('clashTotal')!.textContent = String(appState.clashResults.length);
  document.getElementById('clashHard')!.textContent = String(hard);
  document.getElementById('clashNear')!.textContent = String(near);

  // Snapshot theo thời gian (plan 2.4, giống Validate): lưu + so với lần chạy trước.
  try {
    const stats = { total: appState.clashResults.length, hard, near };
    const { delta } = recordSnapshot('clash', stats);
    const d = delta.find(x => x.key === 'total');
    if (d && d.delta !== 0) log(`Clash snapshot đã lưu — total ${d.prev}→${d.curr} (${d.delta > 0 ? '+' : ''}${d.delta} so với lần trước).`);
    else log('Clash snapshot đã lưu.');
  } catch (e: any) { log('Clash snapshot err:', e?.message); }

  // Render clash cards
  let html = '';
  appState.clashResults.forEach((cl: any, i: number) => {
    const penMM = (cl.penetration * 1000).toFixed(0);
    html += `<div class="clash-card" id="clash-${i}" onclick="focusClash(${i})">
      <div class="cc-hdr">
        <span class="cc-num">#${i + 1} ${cl.isHard ? '⛔' : '⚠️'}</span>
        <span class="cc-dist">${penMM}mm</span>
      </div>
      <div class="cc-el">A: ${cl.elA.name || '#' + cl.elA.eid}</div>
      <div class="cc-type">${(cl.elA.type || '').replace('Ifc', '')}</div>
      <div class="cc-el" style="margin-top:2px">B: ${cl.elB.name || '#' + cl.elB.eid}</div>
      <div class="cc-type">${(cl.elB.type || '').replace('Ifc', '')}</div>
    </div>`;
  });
  if (!html) html = '<div style="padding:20px;text-align:center;color:var(--green);font-size:14px;font-weight:600">✓ No clashes detected!</div>';
  document.getElementById('clashList')!.innerHTML = html;
}

// ── Regroup clash results by chosen criterion ──
window.regroupClashes = function(): void {
  const groupBy = (document.getElementById('clashGroupBy') as HTMLSelectElement).value;
  const list = document.getElementById('clashList')!;

  if (groupBy === 'none' || !appState.clashResults.length) {
    // Flat list — re-render
    let html = '';
    appState.clashResults.forEach((cl: any, i: number) => {
      const penMM = (cl.penetration * 1000).toFixed(0);
      html += `<div class="clash-card" id="clash-${i}" onclick="focusClash(${i})">
        <div class="cc-hdr"><span class="cc-num">#${i + 1} ${cl.isHard ? '⛔' : '⚠️'}</span><span class="cc-dist">${penMM}mm</span></div>
        <div class="cc-el">A: ${cl.elA.name || '#' + cl.elA.eid}</div>
        <div class="cc-type">${(cl.elA.type || '').replace('Ifc', '')}</div>
        <div class="cc-el" style="margin-top:2px">B: ${cl.elB.name || '#' + cl.elB.eid}</div>
        <div class="cc-type">${(cl.elB.type || '').replace('Ifc', '')}</div>
      </div>`;
    });
    list.innerHTML = html;
    return;
  }

  // Group clashes
  const groups: Record<string, { cl: any; origIdx: number }[]> = {};
  appState.clashResults.forEach((cl: any, i: number) => {
    let key = 'Other';
    if (groupBy === 'categoryA') key = cl.elA.type || 'Unknown';
    else if (groupBy === 'categoryB') key = cl.elB.type || 'Unknown';
    else if (groupBy === 'level') {
      // Group by Y-level (approximate storey)
      const y = cl.point.y;
      const level = Math.round(y / 3) * 3; // bucket to ~3m floors
      key = 'Level ≈ ' + level.toFixed(0) + 'm';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push({ cl, origIdx: i });
  });

  let html = '';
  const sortedKeys = Object.keys(groups).sort();
  sortedKeys.forEach(key => {
    const items = groups[key];
    const gid = 'cg_' + key.replace(/\W/g, '_');
    html += `<div class="clash-group-hdr" onclick="toggleClashGroup('${gid}')">
      <span class="cg-arr" id="arr_${gid}">▼</span>
      <span>${key.replace('Ifc', '')}</span>
      <span class="cg-count">${items.length}</span>
    </div>
    <div class="clash-group-body" id="body_${gid}">`;
    items.forEach(({ cl, origIdx }) => {
      const penMM = (cl.penetration * 1000).toFixed(0);
      html += `<div class="clash-card" id="clash-${origIdx}" onclick="focusClash(${origIdx})">
        <div class="cc-hdr"><span class="cc-num">#${origIdx + 1} ${cl.isHard ? '⛔' : '⚠️'}</span><span class="cc-dist">${penMM}mm</span></div>
        <div class="cc-el">A: ${cl.elA.name || '#' + cl.elA.eid}</div>
        <div class="cc-el" style="margin-top:1px">B: ${cl.elB.name || '#' + cl.elB.eid}</div>
      </div>`;
    });
    html += `</div>`;
  });
  list.innerHTML = html;
};

window.toggleClashGroup = function(gid: string): void {
  const arr = document.getElementById('arr_' + gid);
  const body = document.getElementById('body_' + gid);
  if (arr) arr.classList.toggle('col');
  if (body) body.classList.toggle('col');
};

window.focusClash = function(idx: number): void {
  if (idx < 0 || idx >= appState.clashResults.length) return;
  currentClashIdx = idx;
  const cl = appState.clashResults[idx];

  // Highlight card
  document.querySelectorAll('.clash-card').forEach(c => c.classList.remove('active'));
  const card = document.getElementById('clash-' + idx);
  if (card) card.classList.add('active');

  // ── Remove old focus highlights ──
  const oldFocus: THREE.Object3D[] = [];
  appState.scene.traverse(c => { if ((c as any).userData?.clashFocus) oldFocus.push(c); });
  oldFocus.forEach(c => { if (c.parent) c.parent.remove(c); });

  // ── Highlight the two specific clashing elements with colored subsets ──
  const matFocusA = new THREE.MeshPhongMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });
  const matFocusB = new THREE.MeshPhongMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: appState.clipPlanes });

  [
    { mi: 0, eid: cl.elA.eid, mat: matFocusA },
    { mi: 1, eid: cl.elB.eid, mat: matFocusB }
  ].forEach(({ mi, eid, mat }) => {
    if (!appState.loadedModels[mi]) return;
    try {
      const sub = appState.ifcLoader.ifcManager.createSubset({ modelID: (appState.loadedModels[mi] as any).modelID, ids: [eid], material: mat, scene: appState.scene, removePrevious: false, customID: 'clashFocus_' + mi + '_' + eid });
      if (sub) {
        (sub as any).position.copy(appState.loadedModels[mi]!.position); (sub as any).updateMatrixWorld(true);
        (sub as any).userData.clashFocus = true;
        (sub as any).traverse((ch: any) => { if (ch.isMesh) ch.userData.clashFocus = true; });
      }
    } catch (e) {}
  });

  // ── Pulse the clash zone marker ──
  if (clashSubsets[0] && clashSubsets[0].name === 'clashMarkers') {
    clashSubsets[0].children.forEach(ch => {
      if ((ch as any).userData.clashIdx === idx && (ch as any).material && !(ch as any).material.wireframe) {
        (ch as any).material.opacity = 0.95; (ch as any).material.needsUpdate = true;
      } else if ((ch as any).material && !(ch as any).material.wireframe && (ch as any).userData.clashIdx !== undefined) {
        (ch as any).material.opacity = 0.35; (ch as any).material.needsUpdate = true;
      }
    });
  }

  // Zoom + section box around CLASH ZONE ONLY (overlap region, not full elements)
  const overlapMnX = Math.max(cl.elA.bbox.mnX, cl.elB.bbox.mnX);
  const overlapMnY = Math.max(cl.elA.bbox.mnY, cl.elB.bbox.mnY);
  const overlapMnZ = Math.max(cl.elA.bbox.mnZ, cl.elB.bbox.mnZ);
  const overlapMxX = Math.min(cl.elA.bbox.mxX, cl.elB.bbox.mxX);
  const overlapMxY = Math.min(cl.elA.bbox.mxY, cl.elB.bbox.mxY);
  const overlapMxZ = Math.min(cl.elA.bbox.mxZ, cl.elB.bbox.mxZ);

  // Overlap zone size + a small context padding (show a bit of surrounding geometry)
  const ozX = Math.max(overlapMxX - overlapMnX, 0.1);
  const ozY = Math.max(overlapMxY - overlapMnY, 0.1);
  const ozZ = Math.max(overlapMxZ - overlapMnZ, 0.1);
  const contextPad = Math.max(ozX, ozY, ozZ) * 1.5 + 1.5; // ~1.5x clash zone + 1.5m

  const mnX = ((overlapMnX + overlapMxX) / 2) - contextPad;
  const mnY = ((overlapMnY + overlapMxY) / 2) - contextPad;
  const mnZ = ((overlapMnZ + overlapMxZ) / 2) - contextPad;
  const mxX = ((overlapMnX + overlapMxX) / 2) + contextPad;
  const mxY = ((overlapMnY + overlapMxY) / 2) + contextPad;
  const mxZ = ((overlapMnZ + overlapMxZ) / 2) + contextPad;

  const viewDist = contextPad * 2.5;
  const pt = cl.point;
  appState.camera.position.set(pt.x + viewDist * 0.45, pt.y + viewDist * 0.35, pt.z + viewDist * 0.45);
  appState.controls.target.set(pt.x, pt.y, pt.z);
  appState.controls.update();

  const b = appState.modelBounds;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSl = (val: number, mn: number, range: number) => Math.max(0, Math.min(100, Math.round(((val - mn) / range) * 100)));

  (document.getElementById('slXp') as HTMLInputElement).value = String(toSl(mxX, b.min.x, sx));
  (document.getElementById('slXn') as HTMLInputElement).value = String(toSl(mnX, b.min.x, sx));
  (document.getElementById('slYp') as HTMLInputElement).value = String(toSl(mxY, b.min.y, sy));
  (document.getElementById('slYn') as HTMLInputElement).value = String(toSl(mnY, b.min.y, sy));
  (document.getElementById('slZp') as HTMLInputElement).value = String(toSl(mxZ, b.min.z, sz));
  (document.getElementById('slZn') as HTMLInputElement).value = String(toSl(mnZ, b.min.z, sz));

  if (!appState.sectionActive) {
    appState.sectionActive = true;
    document.getElementById('sectionPanel')!.classList.add('show');
    document.getElementById('btnSection')!.classList.add('active');
    (window as any).createSectionBox3D();
  }
  (window as any).updateSectionFromSliders();

  // Show clash details in properties panel
  const penMM = (cl.penetration * 1000).toFixed(1);
  let h = `<div style="padding:8px 12px;background:var(--red-lt);border-bottom:1px solid var(--border)">
    <span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:var(--red)">CLASH #${idx + 1} — ${cl.isHard ? 'HARD CLASH' : 'CLEARANCE'}</span>
  </div>
  <div class="ps"><div class="ps-t">Clash Info</div>
    <div class="pr"><div class="pk">Penetration</div><div class="pv" style="color:var(--red);font-weight:700">${penMM} mm</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.isHard ? 'Hard (geometry intersects)' : 'Clearance (bbox overlap)'}</div></div>
  </div>
  <div class="ps"><div class="ps-t"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ef4444;margin-right:4px"></span>Element A — Source</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${cl.elA.name || '—'}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.elA.type || '—'}</div></div>
    <div class="pr"><div class="pk">Tag</div><div class="pv">${cl.elA.tag || '—'}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${cl.elA.eid}</div></div>
  </div>
  <div class="ps"><div class="ps-t"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#3b82f6;margin-right:4px"></span>Element B — Target</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${cl.elB.name || '—'}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.elB.type || '—'}</div></div>
    <div class="pr"><div class="pk">Tag</div><div class="pv">${cl.elB.tag || '—'}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${cl.elB.eid}</div></div>
  </div>`;
  document.getElementById('propArea')!.innerHTML = h;

  log(`Focused clash #${idx + 1}: ${cl.elA.name} vs ${cl.elB.name} (${penMM}mm)`);
};

window.exportClashCSV = function(): void {
  if (!appState.clashResults.length) return;
  let csv = '#,Type,Penetration_mm,ElementA_Name,ElementA_Type,ElementA_ID,ElementB_Name,ElementB_Type,ElementB_ID,X,Y,Z\n';
  appState.clashResults.forEach((cl: any, i: number) => {
    csv += `${i + 1},${cl.isHard ? 'Hard' : 'Clearance'},${(cl.penetration * 1000).toFixed(1)},"${cl.elA.name}",${cl.elA.type},${cl.elA.eid},"${cl.elB.name}",${cl.elB.type},${cl.elB.eid},${cl.point.x.toFixed(3)},${cl.point.y.toFixed(3)},${cl.point.z.toFixed(3)}\n`;
  });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'ifc-clash-report.csv'; a.click();
  log('Clash CSV exported: ' + appState.clashResults.length + ' clashes');
};

// ══ Clash BCF Export ══
window.exportClashBCF = async function(): Promise<void> {
  if (!appState.clashResults.length) { log('No clashes to export'); return; }
  if (!(window as any).JSZip) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(s);
    await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
  }

  (window as any).setStatus('loading', 'Exporting Clash BCF...');
  log('Exporting BCF for ' + appState.clashResults.length + ' clashes...');
  const zip = new (window as any).JSZip();
  const now = new Date().toISOString();
  const pid = crypto.randomUUID();

  // ── Coord transform: Three.js Y-up → IFC Z-up (BCF spec) ──
  // Same logic as exportBCF (compare). The previous clash exporter only added
  // the model offset back without doing the axis swap, so all viewpoint
  // coordinates were in Three-space. Result: BCF Reader saw "viewpoint near
  // origin" → no zoom-to-issue and the snapshot framing camera was also wrong.
  const mdlPos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2; i++) { if (appState.loadedModels[i]) { mdlPos.x = appState.loadedModels[i]!.position.x; mdlPos.y = appState.loadedModels[i]!.position.y; mdlPos.z = appState.loadedModels[i]!.position.z; break; } }
  // Three (x,y,z) → IFC (x, z, -y): reverse offset first, then swap Y↔Z, negate Y.
  const threeToIfc = (x: number, y: number, z: number) => {
    const tx = x - mdlPos.x, ty = y - mdlPos.y, tz = z - mdlPos.z;
    return { x: tx, y: tz, z: -ty };
  };
  log('Clash BCF model offset (three-space): (' + mdlPos.x.toFixed(2) + ', ' + mdlPos.y.toFixed(2) + ', ' + mdlPos.z.toFixed(2) + ')');

  // Save camera + section box + previous focus state before mutating the scene
  // for snapshot rendering. focusClash() modifies all of these; we restore at end.
  const saveCam = appState.camera.position.clone();
  const saveTgt = appState.controls.target.clone();
  const saveSectionActive = appState.sectionActive;
  const savePrevClashIdx = (typeof currentClashIdx !== 'undefined') ? currentClashIdx : -1;
  // Snapshot section box slider values so we can restore the user's previous
  // section box exactly. focusClash overwrites them per issue.
  const saveSlider = {
    Xp: (document.getElementById('slXp') as HTMLInputElement)?.value, Xn: (document.getElementById('slXn') as HTMLInputElement)?.value,
    Yp: (document.getElementById('slYp') as HTMLInputElement)?.value, Yn: (document.getElementById('slYn') as HTMLInputElement)?.value,
    Zp: (document.getElementById('slZp') as HTMLInputElement)?.value, Zn: (document.getElementById('slZn') as HTMLInputElement)?.value,
  };

  zip.file('bcf.version', '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file('project.bcfp', '<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="' + pid + '"><n>IFC Delta Clash Detection</n></Project></ProjectExtension>');

  for (let i = 0; i < appState.clashResults.length; i++) {
    const cl = appState.clashResults[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();

    // GlobalIds for both elements
    let guidA = '', guidB = '';
    try {
      const pA = await appState.ifcLoader.ifcManager.getItemProperties((appState.loadedModels[0] as any).modelID, cl.elA.eid, false);
      if (pA?.GlobalId?.value) guidA = pA.GlobalId.value;
    } catch (e) {}
    try {
      const pB = await appState.ifcLoader.ifcManager.getItemProperties((appState.loadedModels[1] as any).modelID, cl.elB.eid, false);
      if (pB?.GlobalId?.value) guidB = pB.GlobalId.value;
    } catch (e) {}

    // ── Compute clash zone in Three-space, then transform for BCF ──
    // The "clash zone" is the OVERLAP region of the two element bboxes. We
    // size camera distance from this overlap so floor-vs-WC clashes don't
    // frame the entire floor — only the small intersection volume.
    const A = cl.elA.bbox, B = cl.elB.bbox;
    const ovMnX = Math.max(A.mnX, B.mnX), ovMxX = Math.min(A.mxX, B.mxX);
    const ovMnY = Math.max(A.mnY, B.mnY), ovMxY = Math.min(A.mxY, B.mxY);
    const ovMnZ = Math.max(A.mnZ, B.mnZ), ovMxZ = Math.min(A.mxZ, B.mxZ);
    // Overlap could be degenerate (line/point) for clearance clashes — use
    // penetration as a floor on size so camera doesn't get plastered against
    // the surface.
    const ovSx = Math.max(0.5, (ovMxX - ovMnX));
    const ovSy = Math.max(0.5, (ovMxY - ovMnY));
    const ovSz = Math.max(0.5, (ovMxZ - ovMnZ));
    const ovSize = Math.max(ovSx, ovSy, ovSz);
    // Section box around the overlap with padding so the user can see context
    // (not just the intersection plane). Padding scales with element size.
    const elSize = Math.max(
      A.mxX - A.mnX, A.mxY - A.mnY, A.mxZ - A.mnZ,
      B.mxX - B.mnX, B.mxY - B.mnY, B.mxZ - B.mnZ
    );
    const sbPad = Math.max(1.5, Math.min(elSize * 0.3, 5)); // 1.5–5m of context
    const sbMnX = ovMnX - sbPad, sbMxX = ovMxX + sbPad;
    const sbMnY = ovMnY - sbPad, sbMxY = ovMxY + sbPad;
    const sbMnZ = ovMnZ - sbPad, sbMxZ = ovMxZ + sbPad;

    // Clash centre in Three-space (use overlap centre, fall back to clash point)
    const cxT = (ovMxX > ovMnX) ? (ovMnX + ovMxX) / 2 : cl.point.x;
    const cyT = (ovMxY > ovMnY) ? (ovMnY + ovMxY) / 2 : cl.point.y;
    const czT = (ovMxZ > ovMnZ) ? (ovMnZ + ovMxZ) / 2 : cl.point.z;

    // ── Snapshot rendering ──
    // CRITICAL: Reuse focusClash() — the in-app function the user already sees
    // working (Image 1). It applies the section box (clip planes) tightly
    // around the overlap zone, sets the camera to the clash centre at proper
    // distance, and creates the red+blue highlights for both elements.
    //
    // Without calling focusClash, the snapshot just renders the full scene
    // from a guessed camera position — for floor-vs-pipe clashes the slab
    // (huge planar element) fills the entire frame and you see nothing else.
    //
    // After capturing, we restore the section box state below the loop.
    let snap64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==';
    try {
      // Apply the same focus the user gets when clicking a clash card. This
      // sets clipPlanes (section box) around the overlap, places camera at
      // a proper 3/4 angle to the clash zone, and highlights both elements.
      window.focusClash(i);
      // focusClash uses requestAnimationFrame implicitly (controls.update);
      // wait two frames for the renderer to commit the new state, then read
      // the canvas pixels.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r as FrameRequestCallback)));
      appState.renderer.render(appState.scene, appState.camera);
      try { snap64 = appState.renderer.domElement.toDataURL('image/png').split(',')[1]; } catch (e) {}
    } catch (e: any) { log('Clash snapshot err #' + (i + 1) + ':', e?.message); }

    // ── BCF camera in IFC coords ──
    // Position the BCF perspective camera at the same 3/4 angle that
    // focusClash() uses for the in-app view, so the BCF Reader's
    // "Zoom to Issue" frames the same view the user saw when reviewing
    // in IFC Delta. focusClash uses Three-space offset (0.45, 0.35, 0.45)
    // from the clash centre. Mapping Three (x,y,z) → IFC (x,z,-y), this
    // becomes IFC offset (0.45, 0.45, -0.35) from the IFC centre.
    const ifcCenter = threeToIfc(cxT, cyT, czT);
    const ix = ifcCenter.x, iy = ifcCenter.y, iz = ifcCenter.z;
    // Camera distance based on section-box size in IFC space (overlap + pad,
    // NOT combined element bbox — combined bbox is huge for slabs).
    const ifcSx = Math.abs(threeToIfc(sbMxX, 0, 0).x - threeToIfc(sbMnX, 0, 0).x);
    const ifcSy = Math.abs(threeToIfc(0, 0, sbMxZ).y - threeToIfc(0, 0, sbMnZ).y);
    const ifcSz = Math.abs(threeToIfc(0, sbMxY, 0).z - threeToIfc(0, sbMnY, 0).z);
    const viewR = Math.max(ifcSx, ifcSy, ifcSz) * 2.5 + 2;
    const camX = ix + viewR * 0.45, camY = iy + viewR * 0.45, camZ = iz - viewR * 0.35;
    const ddx = ix - camX, ddy = iy - camY, ddz = iz - camZ;
    const ln = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;

    // ── Section box in IFC coords ──
    // Convert the 8 Three-space corners of the section box to IFC, then take
    // the IFC-space extents. Direction vectors per BCF spec point OUTWARD.
    const cornersIfc = [
      threeToIfc(sbMnX, sbMnY, sbMnZ), threeToIfc(sbMxX, sbMnY, sbMnZ),
      threeToIfc(sbMnX, sbMxY, sbMnZ), threeToIfc(sbMxX, sbMxY, sbMnZ),
      threeToIfc(sbMnX, sbMnY, sbMxZ), threeToIfc(sbMxX, sbMnY, sbMxZ),
      threeToIfc(sbMnX, sbMxY, sbMxZ), threeToIfc(sbMxX, sbMxY, sbMxZ),
    ];
    let cMnX = Infinity, cMnY = Infinity, cMnZ = Infinity, cMxX = -Infinity, cMxY = -Infinity, cMxZ = -Infinity;
    cornersIfc.forEach(c => { cMnX = Math.min(cMnX, c.x); cMnY = Math.min(cMnY, c.y); cMnZ = Math.min(cMnZ, c.z); cMxX = Math.max(cMxX, c.x); cMxY = Math.max(cMxY, c.y); cMxZ = Math.max(cMxZ, c.z); });
    const clips =
      '<ClippingPlanes>' +
      '<ClippingPlane><Location><X>' + cMxX.toFixed(6) + '</X><Y>' + iy.toFixed(6) + '</Y><Z>' + iz.toFixed(6) + '</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + cMnX.toFixed(6) + '</X><Y>' + iy.toFixed(6) + '</Y><Z>' + iz.toFixed(6) + '</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + ix.toFixed(6) + '</X><Y>' + cMxY.toFixed(6) + '</Y><Z>' + iz.toFixed(6) + '</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + ix.toFixed(6) + '</X><Y>' + cMnY.toFixed(6) + '</Y><Z>' + iz.toFixed(6) + '</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + ix.toFixed(6) + '</X><Y>' + iy.toFixed(6) + '</Y><Z>' + cMxZ.toFixed(6) + '</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane>' +
      '<ClippingPlane><Location><X>' + ix.toFixed(6) + '</X><Y>' + iy.toFixed(6) + '</Y><Z>' + cMnZ.toFixed(6) + '</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane>' +
      '</ClippingPlanes>';

    const penMM = (cl.penetration * 1000).toFixed(1);
    const title = 'Clash #' + (i + 1) + ' ' + (cl.isHard ? 'HARD' : 'CLEARANCE') + ' (' + penMM + 'mm) — ' + (cl.elA.name || cl.elA.type) + ' vs ' + (cl.elB.name || cl.elB.type);
    const desc = 'Penetration: ' + penMM + 'mm | Source: ' + (cl.elA.name || '#' + cl.elA.eid) + ' (' + cl.elA.type + ') | Target: ' + (cl.elB.name || '#' + cl.elB.eid) + ' (' + cl.elB.type + ')';

    // Build schema-valid <Component> XML (same structure as compare BCF)
    const tagA = cl.elA.tag || '';
    const tagB = cl.elB.tag || '';
    const makeComponent = (guid: string, tag: string) => {
      if (!guid && !tag) return '';
      let x = '<Component' + (guid ? ' IfcGuid="' + (window as any).escXml(guid) + '"' : '') + '>';
      x += '<OriginatingSystem>Autodesk Revit</OriginatingSystem>';
      if (tag) x += '<AuthoringToolId>' + (window as any).escXml(tag) + '</AuthoringToolId>';
      x += '</Component>';
      return x;
    };
    const compA = makeComponent(guidA, tagA);
    const compB = makeComponent(guidB, tagB);
    let selectionXml = '<Selection>';
    let colorXml = '<Coloring>';
    if (compA) { selectionXml += compA; colorXml += '<Color Color="FFEF4444">' + compA + '</Color>'; }
    if (compB) { selectionXml += compB; colorXml += '<Color Color="FFF97316">' + compB + '</Color>'; }
    selectionXml += '</Selection>';
    colorXml += '</Coloring>';

    // markup.bcf — Header with file references for BCF Reader to resolve elements
    zip.file(tid + '/markup.bcf', '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '<Header>' +
      (appState.files[0] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + (window as any).escXml(appState.files[0]!.name) + '</Filename><Date>' + now + '</Date></File>' : '') +
      (appState.files[1] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + (window as any).escXml(appState.files[1]!.name) + '</Filename><Date>' + now + '</Date></File>' : '') +
      '</Header>\n' +
      '<Topic Guid="' + tid + '" TopicType="Clash" TopicStatus="Active">' +
      '<Title>' + (window as any).escXml(title) + '</Title>' +
      '<Description>' + (window as any).escXml(desc) + '</Description>' +
      '<CreationDate>' + now + '</CreationDate><CreationAuthor>IFC Delta</CreationAuthor>' +
      '<ModifiedDate>' + now + '</ModifiedDate>' +
      '<Priority>' + (cl.isHard ? 'Critical' : 'Normal') + '</Priority>' +
      '<Labels><Label>Clash Detection</Label><Label>' + (cl.isHard ? 'Hard Clash' : 'Clearance') + '</Label></Labels>' +
      '</Topic>\n' +
      '<Comment Guid="' + crypto.randomUUID() + '"><Date>' + now + '</Date><Author>IFC Delta</Author><Comment>' + (window as any).escXml(desc) + '</Comment><Viewpoint Guid="' + vid + '"/></Comment>\n' +
      '<Viewpoints Guid="' + vid + '"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n' +
      '</Markup>');

    // viewpoint.bcfv — PerspectiveCamera with proper IFC-coord viewpoint.
    // Critical fix: was OrthogonalCamera with origin (0,0,0) — that's why
    // BCF Reader couldn't zoom to the issue. Now matches compare BCF's working
    // pattern: PerspectiveCamera with FieldOfView=60 + UpVector=(0,0,1).
    zip.file(tid + '/viewpoint.bcfv', '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="' + vid + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '<Components>' +
      selectionXml +
      '<Visibility DefaultVisibility="true"><Exceptions/></Visibility>' +
      colorXml +
      '</Components>\n' +
      '<PerspectiveCamera>' +
      '<CameraViewPoint><X>' + camX.toFixed(6) + '</X><Y>' + camY.toFixed(6) + '</Y><Z>' + camZ.toFixed(6) + '</Z></CameraViewPoint>' +
      '<CameraDirection><X>' + (ddx / ln).toFixed(6) + '</X><Y>' + (ddy / ln).toFixed(6) + '</Y><Z>' + (ddz / ln).toFixed(6) + '</Z></CameraDirection>' +
      '<CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>' +
      '<FieldOfView>60</FieldOfView>' +
      '</PerspectiveCamera>\n' +
      clips + '\n' +
      '</VisualizationInfo>');

    zip.file(tid + '/snapshot.png', snap64, { base64: true });

    if (i % 10 === 0) (window as any).setStatus('loading', 'BCF: ' + (i + 1) + '/' + appState.clashResults.length + '...');
  }

  // ── Restore scene state after snapshot loop ──
  // focusClash mutates: clipPlanes (section box), camera, target, section
  // panel UI, clashFocus highlight subsets, and currentClashIdx. Undo all of
  // these so the user's view returns to whatever it was before they clicked
  // "Clash BCF".
  // 1. Remove clashFocus highlights (focusClash leaves them in scene by design,
  //    we don't want them piled up).
  const focusHL: THREE.Object3D[] = [];
  appState.scene.traverse(c => { if ((c as any).userData?.clashFocus) focusHL.push(c); });
  focusHL.forEach(c => { if (c.parent) c.parent.remove(c); });
  // 2. If user wasn't in a section box before, deactivate section panel.
  if (!saveSectionActive && appState.sectionActive) {
    appState.sectionActive = false;
    document.getElementById('sectionPanel')!.classList.remove('show');
    document.getElementById('btnSection')!.classList.remove('active');
    // Remove the visual section box wireframe
    const sb = appState.scene.getObjectByName('sectionBox');
    if (sb) { appState.scene.remove(sb); }
    // Reset clipPlanes to no-clip
    if (appState.clipPlanes && appState.clipPlanes.length === 6) {
      appState.clipPlanes[0].constant = 99999; appState.clipPlanes[1].constant = 99999;
      appState.clipPlanes[2].constant = 99999; appState.clipPlanes[3].constant = 99999;
      appState.clipPlanes[4].constant = 99999; appState.clipPlanes[5].constant = 99999;
    }
  } else if (saveSectionActive) {
    // User had section box — restore its slider values exactly.
    const setSl = (id: string, v: string | undefined) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el && v !== undefined) el.value = v; };
    setSl('slXp', saveSlider.Xp); setSl('slXn', saveSlider.Xn);
    setSl('slYp', saveSlider.Yp); setSl('slYn', saveSlider.Yn);
    setSl('slZp', saveSlider.Zp); setSl('slZn', saveSlider.Zn);
    if (typeof (window as any).updateSectionFromSliders === 'function') (window as any).updateSectionFromSliders();
  }
  // 3. If user had a clash focused before, re-focus it (so highlights are back).
  //    Otherwise just restore camera position.
  if (savePrevClashIdx >= 0 && savePrevClashIdx < appState.clashResults.length) {
    try { window.focusClash(savePrevClashIdx); } catch (e) {}
  } else {
    appState.camera.position.copy(saveCam); appState.controls.target.copy(saveTgt); appState.controls.update();
  }
  appState.renderer.render(appState.scene, appState.camera);

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ifc-delta-clashes.bcf'; a.click();
  (window as any).setStatus('done', 'BCF exported'); setTimeout(() => (window as any).setStatus('', ''), 3000);
  log('Clash BCF exported: ' + appState.clashResults.length + ' issues');
};
