// ── Turning the two runs into a go / no-go ───────────────────────────────
// Pure functions: no DOM, no library imports. The whole point of the spike is
// this file's output, so it says PASS/PARTIAL/FAIL plainly and never rounds a
// bad result up to a good-looking one.
import type { BaselineResult } from './baseline.js';
import type { FragmentsResult } from './fragments-path.js';

export type Status = 'PASS' | 'PARTIAL' | 'FAIL';

export interface Check {
  id: number;
  title: string;
  status: Status;
  headline: string;
  detail: string[];
  /** True when a FAIL here makes the whole migration pointless. */
  blocking: boolean;
}

/** The properties getAllProps() feeds into the Compare diff. */
export const COMPARE_PROPERTIES = [
  'Name', 'Description', 'ObjectType', 'Tag',
  'PredefinedType', 'LongName', 'OverallWidth', 'OverallHeight',
] as const;

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return ((part / whole) * 100).toFixed(1) + '%';
}

// Check 1 — GlobalId survival. Compare matches elements across versions by
// GlobalId alone, so anything less than near-total coverage sinks the feature.
export function checkGlobalIds(base: BaselineResult, frag: FragmentsResult): Check {
  // Compare against elements that actually TESSELLATE, not merely those with a
  // Representation attribute: fragments only stores items with real geometry,
  // so using the wider set would blame the format for elements web-ifc itself
  // could never draw.
  const meshed = base.meshedGlobalIds.size;
  const withRepresentation = base.elements.size;
  let matched = 0;
  for (const guid of base.meshedGlobalIds) if (frag.elements.has(guid)) matched++;
  const missing = meshed - matched;

  const detail = [
    `Baseline elements with a Representation attribute: ${withRepresentation}`,
    `Baseline elements web-ifc can actually tessellate: ${meshed}`,
    `Fragment items with geometry: ${frag.itemsWithGeometry}`,
    `Fragment items with NO guid: ${frag.itemsMissingGuid}`,
    `Fragment size: ${frag.fragBytes} bytes`,
  ];

  // Distinguish "the format lost the ids" from "there was nothing to convert".
  // Reporting the second as a format failure would be a false negative that
  // kills a viable migration.
  if (meshed === 0) {
    return {
      id: 1,
      title: 'GlobalId survives conversion',
      status: 'FAIL',
      blocking: true,
      headline: 'INCONCLUSIVE — web-ifc produced no geometry from this file at all',
      detail: [
        ...detail,
        'Nothing was tessellated even by the baseline, so this run says nothing about fragments.',
        'Either the IFC has no drawable geometry, or web-ifc could not read it. Try a real project model before drawing any conclusion.',
      ],
    };
  }
  if (frag.fragBytes === 0) {
    return {
      id: 1,
      title: 'GlobalId survives conversion',
      status: 'FAIL',
      blocking: true,
      headline: 'INCONCLUSIVE — the importer returned an empty fragment buffer',
      detail: [
        ...detail,
        `The baseline tessellated ${meshed} element(s), so the geometry is there — but the conversion produced 0 bytes.`,
        'That is a conversion/setup failure (wasm path, importer config, worker), not evidence that GlobalIds are lost. Check the browser console before concluding anything.',
      ],
    };
  }

  const status: Status = matched === meshed ? 'PASS' : matched / meshed >= 0.99 ? 'PARTIAL' : 'FAIL';
  return {
    id: 1,
    title: 'GlobalId survives conversion',
    status,
    blocking: true,
    headline: `${matched} / ${meshed} tessellated elements matched by GlobalId (${pct(matched, meshed)})`,
    detail: [
      ...detail,
      `Present in baseline but missing from fragments: ${missing}`,
      missing === 0
        ? 'Every element Compare can see today is still addressable after conversion.'
        : `${missing} element(s) would become invisible to Compare — it could not report them as added, removed or modified.`,
    ],
  };
}

// Check 2 — the properties the diff is actually computed from. A miss here is
// often an importer-config issue, so the message points at that before letting
// anyone conclude the format is at fault.
export function checkProperties(base: BaselineResult, frag: FragmentsResult, includeAllAttributes: boolean): Check {
  const detail: string[] = [];
  let anyMissing = false;
  let anyPartial = false;

  // Only compare over elements present on BOTH sides — a GlobalId miss is
  // check 1's problem, and counting it twice would misattribute the cause.
  const shared: string[] = [];
  for (const guid of base.meshedGlobalIds) if (frag.elements.has(guid)) shared.push(guid);
  if (shared.length === 0) {
    return {
      id: 2, title: 'Compare properties survive conversion', status: 'FAIL', blocking: false,
      headline: 'INCONCLUSIVE — no elements matched on both sides, so there was nothing to compare',
      detail: ['Fix check 1 first; this check is meaningless until elements match.'],
    };
  }

  for (const prop of COMPARE_PROPERTIES) {
    let baseHas = 0;
    let fragHas = 0;
    for (const guid of shared) {
      const b = base.elements.get(guid)! as unknown as Record<string, any>;
      const f = frag.elements.get(guid)!;
      // Baseline field names are lower-cased for a few (name/tag/objectType).
      const bv = b[prop] ?? b[prop[0].toLowerCase() + prop.slice(1)];
      if (bv !== null && bv !== undefined && bv !== '') baseHas++;
      const fv = f.attributes[prop];
      if (fv !== null && fv !== undefined && fv !== '') fragHas++;
    }
    if (baseHas === 0) {
      detail.push(`${prop}: not present in this model (nothing to preserve)`);
      continue;
    }
    const ratio = fragHas / baseHas;
    if (ratio >= 0.999) detail.push(`${prop}: ${fragHas}/${baseHas} preserved ✓`);
    else if (ratio > 0) { anyPartial = true; detail.push(`${prop}: ${fragHas}/${baseHas} preserved (${pct(fragHas, baseHas)}) — PARTIAL`); }
    else { anyMissing = true; detail.push(`${prop}: 0/${baseHas} preserved — MISSING`); }
  }

  detail.push(`Attribute keys the fragment actually carries: ${[...frag.attributeKeys].sort().join(', ') || '(none)'}`);
  if ((anyMissing || anyPartial) && !includeAllAttributes) {
    detail.push('⚠ This run used the importer defaults. Re-run with "Include all attributes" before concluding the format cannot carry these — IfcImporter trims attributes unless told otherwise.');
  }

  return {
    id: 2,
    title: 'Compare properties survive conversion',
    status: anyMissing ? 'FAIL' : anyPartial ? 'PARTIAL' : 'PASS',
    blocking: false,
    headline: anyMissing
      ? 'At least one property Compare diffs on was lost'
      : anyPartial ? 'Some properties only partially preserved' : 'All Compare properties preserved',
    detail,
  };
}

// Check 3 — the raw-IFC reads scattered around the app (units, TrueNorth,
// spatial structure, material layers). Losing these does not kill Compare, but
// it is real migration work, so it is reported separately rather than folded in.
export function checkContextData(base: BaselineResult, frag: FragmentsResult): Check {
  const detail: string[] = [];
  const misses: string[] = [];

  detail.push(`Spatial structure available from fragments: ${frag.hasSpatialStructure ? 'yes ✓' : 'NO'}`);
  if (!frag.hasSpatialStructure && base.contextData.storeyCount > 0) misses.push('spatial structure (Walk levels, Plan overlay)');

  detail.push(`Baseline storeys: ${base.contextData.storeyCount}, sites: ${base.contextData.siteCount}, buildings: ${base.contextData.buildingCount}`);
  detail.push(`Baseline units (LENGTHUNIT): ${base.contextData.units ? JSON.stringify(base.contextData.units) : 'not found in this model'}`);
  detail.push(`Baseline TrueNorth: ${base.contextData.trueNorth ? JSON.stringify(base.contextData.trueNorth) : 'not set in this model'}`);
  detail.push(`Baseline IfcMaterialLayerSet count: ${base.contextData.materialLayerSets}`);
  detail.push(`Fragment categories exposed: ${frag.categories.length}`);

  // These come from IFC entities that carry no geometry, so they are NOT in
  // getItemsWithGeometry(). Absence here means "extract at conversion time
  // into a sidecar", not "impossible".
  if (base.contextData.units) misses.push('project units (IfcUnitAssignment)');
  if (base.contextData.trueNorth) misses.push('TrueNorth (IfcGeometricRepresentationContext)');
  if (base.contextData.materialLayerSets > 0) misses.push('material layers (IfcMaterialLayerSet)');

  detail.push(
    misses.length
      ? `Needs explicit handling during migration: ${misses.join('; ')}. These are non-geometric entities, so they must be extracted at conversion time into a sidecar JSON (or read via relations) — not automatic.`
      : 'This model uses none of the at-risk context data.',
  );

  return {
    id: 3,
    title: 'Units / TrueNorth / spatial / materials reachable',
    status: misses.length === 0 ? 'PASS' : frag.hasSpatialStructure ? 'PARTIAL' : 'FAIL',
    blocking: false,
    headline: misses.length === 0 ? 'No at-risk context data in this model' : `${misses.length} item(s) need explicit migration work`,
    detail,
  };
}

// Check 4 — geometry reachable per element, so Compare can still flag moved or
// resized elements rather than degrading to a property-only diff.
export function checkGeometry(frag: FragmentsResult): Check {
  const ok = !!frag.boxSample;
  return {
    id: 4,
    title: 'Per-element geometry reachable (for geometry hash)',
    status: ok ? 'PASS' : 'FAIL',
    blocking: false,
    headline: ok ? 'Bounding boxes are queryable per element' : 'Could not read per-element geometry',
    detail: ok
      ? [
          `Sample box for localId ${frag.boxSample!.localId}:`,
          `  min = [${frag.boxSample!.min.map(n => n.toFixed(3)).join(', ')}]`,
          `  max = [${frag.boxSample!.max.map(n => n.toFixed(3)).join(', ')}]`,
          'getBoxes() / getItemsGeometry() give Compare what it needs to detect moved and resized elements.',
        ]
      : ['Without per-element geometry, Compare degrades to a property-only diff: it would no longer detect an element that merely moved.'],
  };
}

export function overallVerdict(checks: Check[]): { status: Status; message: string } {
  const blockingFail = checks.find(c => c.blocking && c.status === 'FAIL');
  if (blockingFail) {
    return { status: 'FAIL', message: `Blocked by check ${blockingFail.id} (${blockingFail.title}). Compare cannot be rebuilt on fragments for this model — stop here.` };
  }
  if (checks.some(c => c.status === 'FAIL')) {
    return { status: 'PARTIAL', message: 'Compare is viable, but at least one supporting feature would have to be rebuilt. Read the FAIL rows before committing.' };
  }
  if (checks.some(c => c.status === 'PARTIAL')) {
    return { status: 'PARTIAL', message: 'Compare is viable with caveats. Check the PARTIAL rows — most are importer configuration, not format limits.' };
  }
  return { status: 'PASS', message: 'Everything Compare depends on survived conversion for this model. Migration is technically viable; the remaining question is effort (~80 web-ifc touchpoints) and the three@0.182 / web-ifc@0.0.77 upgrades it forces.' };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return ms.toFixed(0) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
}
