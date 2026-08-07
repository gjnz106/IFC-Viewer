// ── Baseline: what IFC Delta collects TODAY ──────────────────────────────
// Mirrors frontend/src/components/compare/federation-load.ts's getAllProps()
// as closely as a standalone script can: every line that has a GlobalId and a
// Representation (i.e. real geometry) becomes one comparable element, carrying
// exactly the fields Compare diffs on.
//
// Deliberately uses the raw web-ifc IfcAPI rather than web-ifc-three: the app's
// IFCLoader is only a Three.js wrapper over these same calls, and the point
// here is the DATA, not the meshes.
import * as WEBIFC from 'web-ifc';

/** The per-element shape Compare works with. Keep in sync with getAllProps(). */
export interface BaselineElement {
  expressID: number;
  globalId: string;
  type: string;
  name: string;
  description: string;
  objectType: string;
  tag: string;
  OverallWidth: number | null;
  OverallHeight: number | null;
  PredefinedType: string | null;
  LongName: string | null;
}

export interface BaselineResult {
  elements: Map<string, BaselineElement>;
  totalLines: number;
  parseMs: number;
  /**
   * Elements web-ifc can actually TESSELLATE, as opposed to those merely
   * carrying a Representation attribute. Fragments only stores items with real
   * geometry, so comparing its item count against `elements.size` would be
   * apples-to-oranges and could report a false FAIL on any model containing
   * elements whose geometry fails to generate.
   */
  meshedGlobalIds: Set<string>;
  /** Raw-IFC facts Compare/Validate read that fragments may or may not carry. */
  contextData: {
    units: { type: string; value: string } | null;
    trueNorth: number[] | null;
    storeyCount: number;
    siteCount: number;
    buildingCount: number;
    materialLayerSets: number;
  };
}

// web-ifc returns attributes as {value, type} wrappers, or raw, or null.
function attr(v: any): any {
  if (v === null || v === undefined) return null;
  return v.value !== undefined ? v.value : v;
}

function str(v: any): string {
  const a = attr(v);
  return a === null ? '' : String(a);
}

function num(v: any): number | null {
  const a = attr(v);
  return typeof a === 'number' ? a : null;
}

export async function runBaseline(
  bytes: Uint8Array,
  wasmPath: string,
  onProgress: (msg: string) => void,
): Promise<BaselineResult> {
  const api = new WEBIFC.IfcAPI();
  api.SetWasmPath(wasmPath, true);
  await api.Init();

  onProgress('Baseline: parsing IFC with web-ifc…');
  const t0 = performance.now();
  const modelID = api.OpenModel(bytes);
  const parseMs = performance.now() - t0;

  onProgress('Baseline: scanning all lines for GlobalId + Representation…');
  const elements = new Map<string, BaselineElement>();
  const all = api.GetAllLines(modelID);
  const totalLines = all.size();

  for (let i = 0; i < totalLines; i++) {
    const eid = all.get(i);
    let line: any;
    try { line = api.GetLine(modelID, eid, false); } catch { continue; }
    if (!line) continue;
    const globalId = str(line.GlobalId);
    // Same two gates getAllProps() applies: identity + real geometry.
    if (!globalId || !line.Representation) continue;

    let typeName = 'Unknown';
    try {
      const t = api.GetLineType(modelID, eid);
      typeName = (WEBIFC as any).IfcElements?.[t] || String(t);
    } catch { /* keep Unknown */ }

    elements.set(globalId, {
      expressID: eid,
      globalId,
      type: typeName,
      name: str(line.Name),
      description: str(line.Description),
      objectType: str(line.ObjectType),
      tag: str(line.Tag),
      OverallWidth: num(line.OverallWidth),
      OverallHeight: num(line.OverallHeight),
      PredefinedType: attr(line.PredefinedType) === null ? null : str(line.PredefinedType),
      LongName: attr(line.LongName) === null ? null : str(line.LongName),
    });
  }

  // Which of those elements actually produce a mesh. Done by expressID →
  // GlobalId so it can be intersected with the fragments side directly.
  onProgress('Baseline: tessellating to see which elements really have geometry…');
  const byExpressId = new Map<number, string>();
  for (const el of elements.values()) byExpressId.set(el.expressID, el.globalId);
  const meshedGlobalIds = new Set<string>();
  try {
    api.StreamAllMeshes(modelID, (mesh: any) => {
      const guid = byExpressId.get(mesh.expressID);
      if (guid) meshedGlobalIds.add(guid);
    });
  } catch (e) {
    console.warn('[baseline] StreamAllMeshes failed:', e);
  }

  onProgress('Baseline: reading units / TrueNorth / spatial structure…');
  const contextData = readContext(api, modelID);

  api.CloseModel(modelID);
  return { elements, totalLines, parseMs, meshedGlobalIds, contextData };
}

// The raw-IFC reads that live in section-visibility.ts (readProjectUnits /
// readSpatialInfo) and material-layers.ts. These are the ones most at risk of
// not surviving conversion, so the spike establishes the ground truth here.
function readContext(api: WEBIFC.IfcAPI, modelID: number): BaselineResult['contextData'] {
  const count = (type: number): number => {
    try { return api.GetLineIDsWithType(modelID, type).size(); } catch { return 0; }
  };

  let units: { type: string; value: string } | null = null;
  try {
    const projects = api.GetLineIDsWithType(modelID, WEBIFC.IFCPROJECT);
    if (projects.size()) {
      const project = api.GetLine(modelID, projects.get(0), true);
      const assignment = project?.UnitsInContext;
      const list = assignment?.Units;
      if (Array.isArray(list)) {
        for (const u of list) {
          const unitType = str(u?.UnitType);
          if (unitType === 'LENGTHUNIT') {
            units = { type: unitType, value: str(u?.Prefix) + str(u?.Name) };
            break;
          }
        }
      }
    }
  } catch { /* leave null — the spike reports the absence */ }

  let trueNorth: number[] | null = null;
  try {
    // IfcGeometricRepresentationContext — same numeric type the app uses.
    const ctxs = api.GetLineIDsWithType(modelID, 3448662350);
    for (let i = 0; i < ctxs.size(); i++) {
      const ctx = api.GetLine(modelID, ctxs.get(i), true);
      const ratios = ctx?.TrueNorth?.DirectionRatios;
      if (Array.isArray(ratios) && ratios.length >= 2) {
        trueNorth = ratios.map((r: any) => Number(attr(r)));
        break;
      }
    }
  } catch { /* leave null */ }

  return {
    units,
    trueNorth,
    storeyCount: count(WEBIFC.IFCBUILDINGSTOREY),
    siteCount: count(WEBIFC.IFCSITE),
    buildingCount: count(WEBIFC.IFCBUILDING),
    materialLayerSets: count(WEBIFC.IFCMATERIALLAYERSET),
  };
}
