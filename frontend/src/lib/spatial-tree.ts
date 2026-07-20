// ── Spatial tree for the Overview tab ────────────────────────────────────
// Pure transforms from web-ifc-three's getSpatialStructure() output
// ({ expressID, type, children }, type = UPPERCASE like "IFCBUILDINGSTOREY")
// into a render-ready hierarchy: spatial containers keep their place, and
// each container's product children are grouped per IFC class so a storey
// with 3,000 walls renders as one expandable "Wall ×3000" group, not 3,000
// rows. No DOM/appState here — everything is unit-testable.

export interface RawSpatialNode {
  expressID: number;
  type: string;
  children?: RawSpatialNode[];
}

export interface OvNode {
  eid: number;            // expressID (0 for synthetic group nodes)
  ifcType: string;        // normalized display type, e.g. "IfcBuildingStorey"
  kind: 'spatial' | 'group' | 'element';
  label: string;          // display label (type for spatial/group; overridden by real names in the UI layer)
  count: number;          // product elements in this subtree (1 for an element)
  children: OvNode[];
  /** stable path key for expand/collapse state, e.g. "123/456/g:IfcWall" */
  key: string;
}

// Spatial containers stay as individual rows; everything else becomes a
// grouped product. IfcSpace is spatial in the schema but usually excluded
// from parsing (setupOptionalCategories) — harmless to keep here.
const SPATIAL_UPPER = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE']);

export function isSpatialType(rawType: string): boolean {
  return SPATIAL_UPPER.has((rawType || '').toUpperCase());
}

/**
 * Build an UPPERCASE → pretty lookup ("IFCWALLSTANDARDCASE" → "IfcWallStandardCase")
 * from any iterable of properly-cased IFC names (e.g. Object.values(IFC_NAMES)).
 */
export function buildPrettyTypeLookup(prettyNames: Iterable<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of prettyNames) out[name.toUpperCase()] = name;
  return out;
}

/** Normalize a raw (usually UPPERCASE) IFC type to a display name. */
export function normalizeIfcType(rawType: string, prettyByUpper: Record<string, string> = {}): string {
  if (!rawType) return 'Unknown';
  const u = rawType.toUpperCase();
  if (prettyByUpper[u]) return prettyByUpper[u];
  // Fallback for types we have no pretty name for: "IFCSANITARYTERMINAL" →
  // "IfcSanitaryterminal". Imperfect casing, but stable and readable.
  if (u.startsWith('IFC') && u.length > 3) {
    return 'Ifc' + u.charAt(3) + u.slice(4).toLowerCase();
  }
  return rawType;
}

/**
 * Transform one model's raw spatial structure into an OvNode tree.
 * Product children of each spatial container are grouped per normalized type
 * (groups sorted by count desc, then name; elements sorted by expressID).
 */
export function buildOverviewTree(
  raw: RawSpatialNode,
  prettyByUpper: Record<string, string> = {},
  parentKey = '',
): OvNode {
  const key = parentKey ? `${parentKey}/${raw.expressID}` : String(raw.expressID);
  const node: OvNode = {
    eid: raw.expressID,
    ifcType: normalizeIfcType(raw.type, prettyByUpper),
    kind: 'spatial',
    label: normalizeIfcType(raw.type, prettyByUpper),
    count: 0,
    children: [],
    key,
  };

  const spatialKids: OvNode[] = [];
  const productsByType = new Map<string, RawSpatialNode[]>();
  for (const child of raw.children || []) {
    if (isSpatialType(child.type)) {
      spatialKids.push(buildOverviewTree(child, prettyByUpper, key));
    } else {
      const t = normalizeIfcType(child.type, prettyByUpper);
      if (!productsByType.has(t)) productsByType.set(t, []);
      productsByType.get(t)!.push(child);
    }
  }

  const groups: OvNode[] = [...productsByType.entries()]
    .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]))
    .map(([type, members]) => {
      const gKey = `${key}/g:${type}`;
      return {
        eid: 0,
        ifcType: type,
        kind: 'group' as const,
        label: type.replace(/^Ifc/, ''),
        count: members.length,
        key: gKey,
        children: members
          .slice()
          .sort((a, b) => a.expressID - b.expressID)
          .map(m => ({
            eid: m.expressID,
            ifcType: type,
            kind: 'element' as const,
            label: '#' + m.expressID, // UI layer swaps in the real Name lazily
            count: 1,
            children: [],
            key: `${gKey}/${m.expressID}`,
          })),
      };
    });

  node.children = [...spatialKids, ...groups];
  node.count = spatialKids.reduce((n, c) => n + c.count, 0)
    + groups.reduce((n, g) => n + g.count, 0);
  return node;
}

/**
 * Prune a tree to nodes matching `query` (case-insensitive, matches label or
 * ifcType or "#eid") plus their ancestors. Returns null when nothing matches.
 * Matching containers keep their full subtree so results stay explorable.
 */
export function filterOverviewTree(node: OvNode, query: string): OvNode | null {
  const q = query.trim().toLowerCase();
  if (!q) return node;
  const selfMatch =
    node.label.toLowerCase().includes(q) ||
    node.ifcType.toLowerCase().includes(q) ||
    ('#' + node.eid).includes(q);
  if (selfMatch) return node;
  const kept = node.children
    .map(c => filterOverviewTree(c, q))
    .filter((c): c is OvNode => c !== null);
  if (kept.length === 0) return null;
  return { ...node, children: kept, count: kept.reduce((n, c) => n + c.count, 0) };
}

/** Total storeys in a tree (for the summary strip). */
export function countStoreys(node: OvNode): number {
  const self = node.ifcType === 'IfcBuildingStorey' ? 1 : 0;
  return self + node.children.reduce((n, c) => n + countStoreys(c), 0);
}
