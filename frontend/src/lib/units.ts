/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — UNITS (global display unit preference: mm / m / ft-in)
   ───────────────────────────────────────────────────────────────────────
   This is purely a DISPLAY preference layered on top of the per-model IFC
   unit conversion that already exists (readProjectUnits's lengthFactor/
   areaFactor/volumeFactor, which normalize whatever the IFC file's project
   units are into mm/m²/m³). Callers convert raw IFC values to mm/m²/m³
   themselves (as they already did), then hand the result to the formatters
   below — never double-convert.

   Kept global (not per-project) even though the project registry has an
   optional `state.units` field: projects.ts owns its own in-memory copy of
   the registry and periodically overwrites localStorage with it, so an
   independent read-modify-write from here would race with that and could
   silently drop a unit change. A single `ifc.units` key avoids the
   cross-module sync hazard; per-project override can revisit this later.
═══════════════════════════════════════════════════════════════════════ */

export type UnitPref = 'mm' | 'm' | 'ftin';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Nearest 1/8" fraction, reduced (e.g. 6/8 -> 3/4), omitted when zero.
function eighthsToFraction(eighths: number): string {
  if (eighths === 0) return '';
  const g = gcd(eighths, 8);
  return ` ${eighths / g}/${8 / g}`;
}

export function formatFtIn(mm: number): string {
  if (!isFinite(mm)) return '—';
  const sign = mm < 0 ? '-' : '';
  const totalInches = Math.abs(mm) / 25.4;
  let eighths = Math.round(totalInches * 8);
  const feet = Math.floor(eighths / 96); // 96 = 12 * 8
  eighths -= feet * 96;
  const inches = Math.floor(eighths / 8);
  const remEighths = eighths % 8;
  return `${sign}${feet}'-${inches}${eighthsToFraction(remEighths)}"`;
}

export function formatLengthMm(mm: number, pref: UnitPref): string {
  if (typeof mm !== 'number' || isNaN(mm)) return '';
  if (pref === 'ftin') return formatFtIn(mm);
  if (pref === 'm') return (mm / 1000).toFixed(3) + ' m';
  return Math.round(mm).toLocaleString('en-US') + ' mm';
}

const M2_TO_FT2 = 10.7639;
const M3_TO_FT3 = 35.3147;

export function formatAreaM2(m2: number, pref: UnitPref): string {
  if (typeof m2 !== 'number' || isNaN(m2)) return '';
  if (pref === 'ftin') return (m2 * M2_TO_FT2).toFixed(2) + ' ft²';
  return m2.toFixed(2) + ' m²';
}

export function formatVolumeM3(m3: number, pref: UnitPref): string {
  if (typeof m3 !== 'number' || isNaN(m3)) return '';
  if (pref === 'ftin') return (m3 * M3_TO_FT3).toFixed(2) + ' ft³';
  return m3.toFixed(3) + ' m³';
}

// ── LocalStorage glue ──────────────────────────────────────────────────
const LS_KEY = 'ifc.units';
const CYCLE_ORDER: UnitPref[] = ['mm', 'm', 'ftin'];

export function getUnitPref(): UnitPref {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'mm' || v === 'm' || v === 'ftin') return v;
  } catch { /* private mode */ }
  return 'mm';
}

export function setUnitPref(pref: UnitPref): void {
  try { localStorage.setItem(LS_KEY, pref); } catch { /* private mode / quota */ }
  window.dispatchEvent(new CustomEvent('ifc:unitschange', { detail: { pref } }));
}

export function cycleUnitPref(): UnitPref {
  const cur = getUnitPref();
  const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(cur) + 1) % CYCLE_ORDER.length];
  setUnitPref(next);
  return next;
}

// Converts a scene/world-space length (already in the model's project
// units) to millimetres, using slot 0's lengthFactor. Federation models
// with mismatched project units would already be geometrically misaligned
// in the viewer, so sharing one factor for on-screen measurement is fine.
export function worldToMm(v: number, loadedModels: any[]): number {
  const factor = loadedModels?.[0]?.units?.lengthFactor ?? 1000;
  return v * factor;
}

// ── Settings modal integration (#unitSelect) ─────────────────────────────
(window as any).projFillSettingsUnits = function (): void {
  const sel = document.getElementById('unitSelect') as HTMLSelectElement | null;
  if (sel) sel.value = getUnitPref();
};
(window as any).setUnitPrefFromUI = function (): void {
  const sel = document.getElementById('unitSelect') as HTMLSelectElement | null;
  const v = sel?.value;
  if (v === 'mm' || v === 'm' || v === 'ftin') setUnitPref(v);
};
