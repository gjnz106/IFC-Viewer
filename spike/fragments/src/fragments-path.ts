// ── Candidate: convert to fragments, then read the same data back ────────
// Two distinct costs are timed separately on purpose:
//   convertMs — paid ONCE, by whoever uploads (or by a backend)
//   loadMs    — paid by EVERY member on EVERY open; this is the number that
//               decides whether the migration is worth it
import * as FRAGS from '@thatopen/fragments';
// Must go through the package's "./worker" export — its `exports` map blocks
// the deep dist/ path. Bundling the worker locally (rather than
// FragmentsModels.getWorker(), which fetches it from unpkg) keeps the spike
// runnable offline and pins the worker to the installed library version.
import workerUrl from '@thatopen/fragments/worker?url';

export interface FragmentElement {
  localId: number;
  globalId: string;
  category: string;
  attributes: Record<string, any>;
}

export interface FragmentsResult {
  elements: Map<string, FragmentElement>;
  /** Every attribute key seen on any item — what the format actually preserved. */
  attributeKeys: Set<string>;
  itemsWithGeometry: number;
  itemsMissingGuid: number;
  convertMs: number;
  loadMs: number;
  fragBytes: number;
  ifcBytes: number;
  categories: string[];
  hasSpatialStructure: boolean;
  boxSample: { localId: number; min: number[]; max: number[] } | null;
  /** Non-fatal problems worth showing rather than swallowing. */
  warnings: string[];
}

// ItemData values are {value, type} wrappers, nested ItemData[], or plain.
function unwrap(v: any): any {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v; // relation arrays — kept as-is
  return v.value !== undefined ? v.value : v;
}

export async function runFragments(
  bytes: Uint8Array,
  wasmPath: string,
  includeAllAttributes: boolean,
  onProgress: (msg: string) => void,
): Promise<FragmentsResult> {
  const warnings: string[] = [];

  // ── Convert ────────────────────────────────────────────────────────────
  onProgress('Fragments: converting IFC → .frag …');
  const importer = new FRAGS.IfcImporter();
  importer.wasm = { path: wasmPath, absolute: true };
  if (includeAllAttributes) {
    // The knob that usually explains a "missing property" result — the
    // importer trims attributes by default to keep output small.
    importer.addAllAttributes();
    importer.addAllRelations();
  }

  console.log('[spike] importer config', {
    wasmPath,
    elementClasses: (importer.classes?.elements as any)?.size,
    abstractClasses: (importer.classes?.abstract as any)?.size,
    excluded: [...(importer.attributesToExclude || [])],
  });

  const t0 = performance.now();
  const fragBytes = await importer.process({ bytes });
  const convertMs = performance.now() - t0;

  // Capture the size NOW. models.load() below hands the buffer to the worker as
  // a transferable, which DETACHES it — reading .byteLength afterwards returns
  // 0 and makes a perfectly good conversion look like it produced nothing.
  const fragByteLength = fragBytes?.byteLength ?? 0;
  console.log('[spike] importer.process ->', fragByteLength, 'bytes', {
    includeAllAttributes, wasmPath, inputBytes: bytes.byteLength,
  });
  if (!fragByteLength) {
    // Fail at the source rather than letting a 0-byte buffer flow downstream
    // and surface as a misleading "GlobalIds were lost" verdict.
    warnings.push('IfcImporter.process() returned an EMPTY buffer — conversion did not happen. Everything below is meaningless; check the console and the wasm path.');
  }

  // ── Load back (the cost every member actually pays) ────────────────────
  onProgress('Fragments: loading .frag back …');
  const models = new FRAGS.FragmentsModels(workerUrl);
  const t1 = performance.now();
  const model = await models.load(fragBytes, { modelId: 'spike' });
  const loadMs = performance.now() - t1;

  // ── Read the same data the baseline collected ──────────────────────────
  onProgress('Fragments: extracting ids, guids and attributes …');
  const items = await model.getItemsWithGeometry();
  // The id lives under different names depending on build: a `localId` getter,
  // the underlying `_localId` field (TS `private` is compile-time only, so it
  // is the enumerable one), or the item may just be a bare number.
  const localIdOf = (item: any): number | null => {
    if (typeof item === 'number') return item;
    for (const key of ['localId', '_localId', 'id']) {
      if (typeof item?.[key] === 'number') return item[key];
    }
    return null;
  };
  const localIds: number[] = [];
  for (const item of items) {
    const id = localIdOf(item);
    if (id !== null) localIds.push(id);
  }
  console.log('[spike] getItemsWithGeometry ->', items.length, 'items,', localIds.length, 'usable localIds',
    'keys=' + (items.length ? Object.keys(items[0] as any).join('|') : '-'));
  if (items.length && !localIds.length) {
    warnings.push(`Could not read a local id off the ${items.length} returned items (keys: ${Object.keys(items[0] as any).join(', ')}). This is a spike bug, not a format limitation — every check below is meaningless.`);
  }

  const guids = await model.getGuidsByLocalIds(localIds);
  const categories = await model.getCategories();

  const data = await model.getItemsData(localIds, {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
  });

  const elements = new Map<string, FragmentElement>();
  const attributeKeys = new Set<string>();
  let itemsMissingGuid = 0;

  for (let i = 0; i < localIds.length; i++) {
    const guid = guids[i];
    const raw = (data[i] || {}) as Record<string, any>;

    const attributes: Record<string, any> = {};
    for (const key of Object.keys(raw)) {
      attributeKeys.add(key);
      attributes[key] = unwrap(raw[key]);
    }

    if (!guid) {
      // The decisive failure mode: an element Compare could never match.
      itemsMissingGuid++;
      continue;
    }
    elements.set(guid, {
      localId: localIds[i],
      globalId: guid,
      category: String(attributes._category ?? attributes.category ?? ''),
      attributes,
    });
  }

  // ── Geometry reachability (check 4) ────────────────────────────────────
  let boxSample: FragmentsResult['boxSample'] = null;
  if (localIds.length) {
    try {
      const boxes = await model.getBoxes([localIds[0]]);
      const b = boxes?.[0];
      if (b) {
        boxSample = {
          localId: localIds[0],
          min: [b.min.x, b.min.y, b.min.z],
          max: [b.max.x, b.max.y, b.max.z],
        };
      } else {
        warnings.push('getBoxes() returned no box for the first item.');
      }
    } catch (e: any) {
      warnings.push('getBoxes() threw: ' + (e?.message || e));
    }
  }

  let hasSpatialStructure = false;
  try {
    const tree = await model.getSpatialStructure();
    hasSpatialStructure = !!tree && typeof tree === 'object';
  } catch (e: any) {
    warnings.push('getSpatialStructure() threw: ' + (e?.message || e));
  }

  await models.disposeModel('spike').catch(() => { /* spike teardown */ });

  return {
    elements,
    attributeKeys,
    itemsWithGeometry: localIds.length,
    itemsMissingGuid,
    convertMs,
    loadMs,
    fragBytes: fragByteLength,
    ifcBytes: bytes.byteLength,
    categories,
    hasSpatialStructure,
    boxSample,
    warnings,
  };
}
