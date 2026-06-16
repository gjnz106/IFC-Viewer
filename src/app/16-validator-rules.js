// ══════════════════════════════════════════════════════════════════════
// ── CORENET X / IFC-SG VALIDATOR ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Phase 1 MVP. Ships a hard-coded subset (~35) of the most critical
// BCA Architectural Design Gateway rules. The rule schema is designed
// so later phases can load the full IFC+SG Industry Mapping Excel
// (294 BCA + URA + NEA + LTA + PUB parameters) without changing the
// runner — just append to SG_RULES.
//
// Rule shape:
//   {
//     id:        'BCA-ARCH-001',          // stable identifier
//     agency:    'BCA' | 'URA' | 'NEA' | 'LTA' | 'PUB' | 'GENERAL',
//     gateway:   ['design'] | ['design','construction'] | ...
//     category:  'Spatial' | 'Geo-referencing' | 'Wall' | 'Door' | ...,
//     title:     short human label shown in UI,
//     desc:      one-line explanation for tooltip / report,
//     severity:  'error' | 'warn' | 'info',
//     check:     (ctx) => { passed: [...], failed: [{eid, name, reason}], skipped: int }
//   }
//
// `ctx` provided to each check has:
//   ctx.entities    — flat array of {eid, type, name, tag, psets[], modelIdx}
//   ctx.byClass     — Map: 'IfcWall' → entities[]
//   ctx.modelIDs    — [{modelID, modelIdx, spatial}]
//   ctx.gateway     — 'design' | etc.
//
// The runner iterates rules sequentially. Each rule decides which
// entities are in-scope and returns three buckets: passed, failed,
// skipped. The UI aggregates them into a compliance dashboard.
//
// Phase 1 limitations (publicly disclaimed):
//   • Only a curated subset of rules — NOT a complete BCA submission check.
//   • No federation across multiple discipline files yet (single A or A+B compare files).
//   • Industry Mapping table is hardcoded; will load from JSON in Phase 2.
//   • Gateway-specific differences not fully modelled — focus is Design Gateway.

let sgState = {
  open: false,
  gateway: 'design',
  results: null,         // {rules:[{rule, passed, failed, skipped}], stats:{...}}
  selectedRuleIdx: null,
  // Cached scan of all entities in loaded models — built lazily on first run
  cachedCtx: null,
  cachedCtxKey: null     // 'modelHash' of loadedModels — invalidated on reload
};

// ── Helper: read a parameter value from an entity's psets ────────────
// IFC+SG often defines parameters in psets named either:
//   - Standard IFC psets: Pset_WallCommon, Pset_DoorCommon, etc.
//   - SG-specific: SGPset_<ElementClass>_<Group> (e.g. SGPset_Wall_Fire)
// Some authoring tools place properties at the entity root, in
// QuantitySets, or as type properties. We do a wide search to maximise
// recall — if Revit/Archicad/Tekla put the value anywhere reasonable,
// we find it. Returns null if not present.
// ── Compound angle measure → decimal degrees ───────────────────────
// IfcCompoundPlaneAngleMeasure = [deg, min, sec, millionths_of_sec]
function compoundToDeg(v){
  if(!Array.isArray(v)) return Number(v);
  const sign = v[0] < 0 ? -1 : 1;
  return sign * (Math.abs(v[0]) + (v[1]||0)/60 + (v[2]||0)/3600 + (v[3]||0)/3600000000);
}

function sgReadParam(entity, paramName, psetNameHint){
  if(!entity || !entity.psets) return null;
  for(const ps of entity.psets){
    // If a pset name hint is given, narrow to that pset for stricter checks
    if(psetNameHint && ps.Name?.value !== psetNameHint) continue;
    // Check HasProperties (IfcPropertySet)
    if(ps.HasProperties){
      const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : [ps.HasProperties];
      for(const p of hps){
        // Skip unresolved refs (just numbers or {value: number})
        if(!p || typeof p === 'number') continue;
        if(typeof p.value === 'number' && !p.Name) continue;
        if(p.Name?.value === paramName){
          // IfcPropertySingleValue → NominalValue.value is the actual value
          const nv = p.NominalValue;
          if(nv == null) return { value: null, type: null, psetName: ps.Name?.value };
          return {
            value: nv.value,
            type: nv.type || nv.label || typeof nv.value,
            psetName: ps.Name?.value
          };
        }
      }
    }
    // Check Quantities (IfcElementQuantity)
    if(ps.Quantities){
      const qs = Array.isArray(ps.Quantities) ? ps.Quantities : [ps.Quantities];
      for(const q of qs){
        if(!q || typeof q === 'number') continue;
        if(typeof q.value === 'number' && !q.Name) continue;
        if(q.Name?.value === paramName){
          // IfcQuantity types: LengthValue, AreaValue, VolumeValue, WeightValue, CountValue
          const val = q.LengthValue?.value ?? q.AreaValue?.value ?? q.VolumeValue?.value
                   ?? q.WeightValue?.value ?? q.CountValue?.value ?? q.NominalValue?.value ?? null;
          return { value: val, type: 'quantity', psetName: ps.Name?.value };
        }
      }
    }
  }
  return null;
}

// Check if entity has ANY non-empty value for a parameter (regardless of pset)
function sgHasParam(entity, paramName){
  const r = sgReadParam(entity, paramName);
  if(!r) return false;
  return r.value !== null && r.value !== undefined && r.value !== '';
}

// Read a numeric value, returns null if absent or not numeric
function sgReadNumeric(entity, paramName, psetNameHint){
  const r = sgReadParam(entity, paramName, psetNameHint);
  if(!r || r.value === null || r.value === undefined) return null;
  const n = Number(r.value);
  return isNaN(n) ? null : n;
}

// ── Rule library (Phase 1: ~35 rules) ────────────────────────────────
// Organised by agency. Each rule is independently testable. The order
// here roughly matches the BCA submission workflow: project-level
// metadata first, then spatial structure, then by element class.
const SG_RULES = [
  // ── GENERAL: project & spatial structure ──────────────────────────
  {
    id: 'GEN-001', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Project', title: 'IfcProject exists',
    desc: 'Every IFC file must have exactly one IfcProject as the root spatial container.',
    severity: 'error',
    check: (ctx) => {
      const projects = ctx.modelIDs.flatMap(m=>m.spatial?.projects || []);
      if(projects.length === 0)
        return { passed:[], failed:[{eid:0, name:'(root)', reason:'No IfcProject found in any loaded file'}], skipped:0 };
      if(projects.length > 1)
        return { passed:[], failed:projects.map(p=>({eid:p.expressID, name:p.name, reason:'Multiple IfcProjects — federation expects one project per file'})), skipped:0 };
      return { passed:[{eid:projects[0].expressID, name:projects[0].name}], failed:[], skipped:0 };
    }
  },
  {
    id: 'GEN-002', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Project', title: 'IfcProject has a name',
    desc: 'The project name should be set (not blank, not "Project Number"). CORENET X uses this for submission identification.',
    severity: 'warn',
    check: (ctx) => {
      const projects = ctx.modelIDs.flatMap(m=>m.spatial?.projects || []);
      const passed=[], failed=[];
      for(const p of projects){
        const nm = (p.name||'').trim();
        if(!nm || /^(project\s*number|untitled|default|0001)$/i.test(nm))
          failed.push({eid:p.expressID, name:p.name||'(blank)', reason:'Project name is blank or default placeholder'});
        else passed.push({eid:p.expressID, name:nm});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'GEN-003', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Spatial', title: 'IfcSite has geo-referencing',
    desc: 'IfcSite must have RefLatitude, RefLongitude, and RefElevation. CORENET X uses these for SVY21 alignment.',
    severity: 'error',
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap(m=>m.spatial?.sites || []);
      const passed=[], failed=[];
      for(const s of sites){
        const missing = [];
        if(s.refLat == null || (Array.isArray(s.refLat) && s.refLat.every(v=>v===0))) missing.push('RefLatitude');
        if(s.refLon == null || (Array.isArray(s.refLon) && s.refLon.every(v=>v===0))) missing.push('RefLongitude');
        if(s.refElev == null) missing.push('RefElevation');
        if(missing.length>0) failed.push({eid:s.expressID, name:s.name||'(IfcSite)', reason:'Missing: '+missing.join(', ')});
        else passed.push({eid:s.expressID, name:s.name||'(IfcSite)'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'GEN-004', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Spatial', title: 'IfcSite coordinates within Singapore bounds',
    desc: 'RefLatitude must be 1.15° – 1.50° N, RefLongitude 103.60° – 104.10° E. Outside this range suggests wrong coordinate system or wrong file.',
    severity: 'warn',
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap(m=>m.spatial?.sites || []);
      const passed=[], failed=[];
      for(const s of sites){
        if(s.refLat == null || s.refLon == null){
          // Already flagged in GEN-003; skip here
          continue;
        }
        const lat = compoundToDeg(s.refLat);
        const lon = compoundToDeg(s.refLon);
        if(lat < 1.15 || lat > 1.50 || lon < 103.60 || lon > 104.10){
          failed.push({eid:s.expressID, name:s.name||'(IfcSite)',
            reason:`Lat ${lat.toFixed(4)}°, Lon ${lon.toFixed(4)}° — outside Singapore range`});
        }else{
          passed.push({eid:s.expressID, name:s.name||'(IfcSite)'});
        }
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'GEN-005', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Spatial', title: 'IfcBuilding present',
    desc: 'Every project must have at least one IfcBuilding inside IfcSite.',
    severity: 'error',
    check: (ctx) => {
      const blds = ctx.modelIDs.flatMap(m=>m.spatial?.buildings || []);
      if(blds.length===0) return { passed:[], failed:[{eid:0,name:'(root)',reason:'No IfcBuilding found'}], skipped:0 };
      return { passed: blds.map(b=>({eid:b.expressID, name:b.name||'(IfcBuilding)'})), failed:[], skipped:0 };
    }
  },
  {
    id: 'GEN-006', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Spatial', title: 'IfcBuildingStorey with valid elevation',
    desc: 'Every storey must have a numeric Elevation. Missing or NaN elevations break level-based regulatory checks.',
    severity: 'error',
    check: (ctx) => {
      const storeys = ctx.modelIDs.flatMap(m=>m.spatial?.storeys || []);
      const passed=[], failed=[];
      for(const s of storeys){
        if(s.elevation == null || isNaN(Number(s.elevation)))
          failed.push({eid:s.expressID, name:s.name||'(Storey)', reason:'Elevation is missing or not numeric'});
        else passed.push({eid:s.expressID, name:`${s.name||'(Storey)'} @ ${(+s.elevation).toFixed(2)}m`});
      }
      if(passed.length+failed.length === 0) return { passed:[], failed:[{eid:0,name:'(root)',reason:'No IfcBuildingStorey found'}], skipped:0 };
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'GEN-007', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Spatial', title: 'Storey names follow naming convention',
    desc: 'CORENET X recommends storey names like "L1", "L2", "B1", "RF" — not "Floor 1" or "Storey 1". This is a soft warning.',
    severity: 'warn',
    check: (ctx) => {
      const storeys = ctx.modelIDs.flatMap(m=>m.spatial?.storeys || []);
      const passed=[], failed=[];
      const validPattern = /^(L\d{1,3}|B\d{1,2}|RF|MEZZ|GF|G|UR\d?)$/i;
      for(const s of storeys){
        const nm = (s.name||'').trim();
        if(validPattern.test(nm)) passed.push({eid:s.expressID, name:nm});
        else failed.push({eid:s.expressID, name:nm||'(blank)', reason:'Recommend pattern: L1, L2, B1, RF, MEZZ, GF'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA ARCHITECTURAL: Walls ──────────────────────────────────────
  {
    id: 'BCA-ARCH-W01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Wall', title: 'Walls have FireRating in Pset_WallCommon',
    desc: 'BCA Fire Code requires fire-rating values on walls (e.g. "1HR", "2HR", "-/-/-").',
    severity: 'error',
    check: (ctx) => {
      const walls = (ctx.byClass.get('IfcWall')||[]).concat(ctx.byClass.get('IfcWallStandardCase')||[]);
      const passed=[], failed=[];
      for(const w of walls){
        if(sgHasParam(w, 'FireRating')) passed.push({eid:w.eid, name:w.name});
        else failed.push({eid:w.eid, name:w.name, reason:'Missing FireRating'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-W02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Wall', title: 'Walls have LoadBearing flag',
    desc: 'Pset_WallCommon.LoadBearing must be set to TRUE/FALSE so structural responsibility is clear.',
    severity: 'warn',
    check: (ctx) => {
      const walls = (ctx.byClass.get('IfcWall')||[]).concat(ctx.byClass.get('IfcWallStandardCase')||[]);
      const passed=[], failed=[];
      for(const w of walls){
        const r = sgReadParam(w, 'LoadBearing');
        if(r && (r.value === true || r.value === false || r.value === 'T' || r.value === 'F'))
          passed.push({eid:w.eid, name:w.name});
        else failed.push({eid:w.eid, name:w.name, reason:'LoadBearing not set (must be TRUE or FALSE)'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-W03', agency: 'BCA', gateway: ['design','construction'],
    category: 'Wall', title: 'Walls have IsExternal flag',
    desc: 'External walls have different code requirements; this flag must be set.',
    severity: 'error',
    check: (ctx) => {
      const walls = (ctx.byClass.get('IfcWall')||[]).concat(ctx.byClass.get('IfcWallStandardCase')||[]);
      const passed=[], failed=[];
      for(const w of walls){
        const r = sgReadParam(w, 'IsExternal');
        if(r && (r.value === true || r.value === false))
          passed.push({eid:w.eid, name:w.name});
        else failed.push({eid:w.eid, name:w.name, reason:'IsExternal not set'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA ARCHITECTURAL: Doors ──────────────────────────────────────
  {
    id: 'BCA-ARCH-D01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Door', title: 'Doors have FireRating',
    desc: 'Fire-rated doors must have a FireRating value. Non-rated doors should explicitly say "-/-/-" or "None".',
    severity: 'error',
    check: (ctx) => {
      const doors = ctx.byClass.get('IfcDoor')||[];
      const passed=[], failed=[];
      for(const d of doors){
        if(sgHasParam(d, 'FireRating')) passed.push({eid:d.eid, name:d.name});
        else failed.push({eid:d.eid, name:d.name, reason:'Missing FireRating'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-D02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Door', title: 'Doors have width ≥ 850mm for accessible routes',
    desc: 'BCA Accessibility Code requires accessible doors to have ≥ 850mm clear width. This rule flags doors where width is below threshold OR width is missing entirely.',
    severity: 'warn',
    check: (ctx) => {
      const doors = ctx.byClass.get('IfcDoor')||[];
      const passed=[], failed=[];
      for(const d of doors){
        const ow = d.OverallWidth?.value;
        if(ow == null){
          failed.push({eid:d.eid, name:d.name, reason:'OverallWidth not set'});
          continue;
        }
        // IFC stores in metres (model units may be mm); web-ifc-three uses the
        // file's unit. Heuristic: if value > 10 assume mm, else metres.
        const widthMM = ow > 10 ? ow : ow * 1000;
        if(widthMM < 850) failed.push({eid:d.eid, name:d.name, reason:`Width ${widthMM.toFixed(0)}mm < 850mm threshold`});
        else passed.push({eid:d.eid, name:`${d.name} (${widthMM.toFixed(0)}mm)`});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-D03', agency: 'BCA', gateway: ['design','construction'],
    category: 'Door', title: 'Doors have OverallHeight',
    desc: 'OverallHeight must be present for clearance calculations.',
    severity: 'warn',
    check: (ctx) => {
      const doors = ctx.byClass.get('IfcDoor')||[];
      const passed=[], failed=[];
      for(const d of doors){
        if(d.OverallHeight?.value != null) passed.push({eid:d.eid, name:d.name});
        else failed.push({eid:d.eid, name:d.name, reason:'OverallHeight not set'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA ARCHITECTURAL: Windows ────────────────────────────────────
  {
    id: 'BCA-ARCH-WIN01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Window', title: 'Windows have OverallWidth and OverallHeight',
    desc: 'Window dimensions needed for daylight + ventilation calculations.',
    severity: 'warn',
    check: (ctx) => {
      const wins = ctx.byClass.get('IfcWindow')||[];
      const passed=[], failed=[];
      for(const w of wins){
        const missing = [];
        if(w.OverallWidth?.value == null) missing.push('OverallWidth');
        if(w.OverallHeight?.value == null) missing.push('OverallHeight');
        if(missing.length>0) failed.push({eid:w.eid, name:w.name, reason:'Missing: '+missing.join(', ')});
        else passed.push({eid:w.eid, name:w.name});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-WIN02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Window', title: 'Windows have IsExternal flag',
    desc: 'External windows count toward facade glazing area for energy-efficiency review.',
    severity: 'warn',
    check: (ctx) => {
      const wins = ctx.byClass.get('IfcWindow')||[];
      const passed=[], failed=[];
      for(const w of wins){
        const r = sgReadParam(w, 'IsExternal');
        if(r && (r.value === true || r.value === false)) passed.push({eid:w.eid, name:w.name});
        else failed.push({eid:w.eid, name:w.name, reason:'IsExternal not set'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA ARCHITECTURAL: Slabs ──────────────────────────────────────
  {
    id: 'BCA-ARCH-S01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Slab', title: 'Slabs have FireRating',
    desc: 'Floor/roof slabs are fire compartmentation boundaries; rating required.',
    severity: 'error',
    check: (ctx) => {
      const slabs = ctx.byClass.get('IfcSlab')||[];
      const passed=[], failed=[];
      for(const s of slabs){
        if(sgHasParam(s, 'FireRating')) passed.push({eid:s.eid, name:s.name});
        else failed.push({eid:s.eid, name:s.name, reason:'Missing FireRating'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-S02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Slab', title: 'Slabs have PredefinedType (FLOOR/ROOF/LANDING)',
    desc: 'IfcSlab.PredefinedType must be one of FLOOR, ROOF, LANDING, BASESLAB so the agency knows which code applies.',
    severity: 'error',
    check: (ctx) => {
      const slabs = ctx.byClass.get('IfcSlab')||[];
      const passed=[], failed=[];
      const VALID = new Set(['FLOOR','ROOF','LANDING','BASESLAB','USERDEFINED']);
      for(const s of slabs){
        const pt = s.PredefinedType?.value || s.PredefinedType;
        if(pt && VALID.has(String(pt).toUpperCase())) passed.push({eid:s.eid, name:`${s.name} [${pt}]`});
        else failed.push({eid:s.eid, name:s.name, reason:`PredefinedType "${pt||'null'}" not in FLOOR/ROOF/LANDING/BASESLAB`});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA STRUCTURAL: Beams, Columns ────────────────────────────────
  {
    id: 'BCA-STR-B01', agency: 'BCA', gateway: ['design','piling','construction'],
    category: 'Beam', title: 'Beams have FireRating',
    desc: 'Structural beams need fire-rating for compartmentation review.',
    severity: 'warn',
    check: (ctx) => {
      const beams = ctx.byClass.get('IfcBeam')||[];
      const passed=[], failed=[];
      for(const b of beams){
        if(sgHasParam(b, 'FireRating')) passed.push({eid:b.eid, name:b.name});
        else failed.push({eid:b.eid, name:b.name, reason:'Missing FireRating'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-STR-C01', agency: 'BCA', gateway: ['design','piling','construction'],
    category: 'Column', title: 'Columns have FireRating',
    desc: 'Structural columns need fire-rating for compartmentation review.',
    severity: 'warn',
    check: (ctx) => {
      const cols = ctx.byClass.get('IfcColumn')||[];
      const passed=[], failed=[];
      for(const c of cols){
        if(sgHasParam(c, 'FireRating')) passed.push({eid:c.eid, name:c.name});
        else failed.push({eid:c.eid, name:c.name, reason:'Missing FireRating'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-STR-M01', agency: 'BCA', gateway: ['design','piling','construction'],
    category: 'Material', title: 'Structural elements have a material grade',
    desc: 'Beams and columns should have material info in IfcMaterial or Pset_*Common.Reference. Missing material blocks structural review.',
    severity: 'warn',
    check: (ctx) => {
      const items = (ctx.byClass.get('IfcBeam')||[]).concat(ctx.byClass.get('IfcColumn')||[]);
      const passed=[], failed=[];
      for(const it of items){
        // Material can come from many places — check pset Reference, Material, MaterialGrade
        const r = sgReadParam(it, 'Reference') || sgReadParam(it, 'Material') || sgReadParam(it, 'MaterialGrade');
        if(r && r.value) passed.push({eid:it.eid, name:`${it.name} [${r.value}]`});
        else failed.push({eid:it.eid, name:it.name, reason:'No Reference / Material / MaterialGrade found'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA: Spaces (IfcSpace) ────────────────────────────────────────
  {
    id: 'BCA-SP01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Space', title: 'Spaces have a Name',
    desc: 'Every IfcSpace must have a name describing its function (e.g. "Bedroom", "Kitchen").',
    severity: 'error',
    check: (ctx) => {
      const spaces = ctx.byClass.get('IfcSpace')||[];
      const passed=[], failed=[];
      for(const s of spaces){
        if(s.name && s.name.trim()) passed.push({eid:s.eid, name:s.name});
        else failed.push({eid:s.eid, name:'(blank)', reason:'IfcSpace has no name'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-SP02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Space', title: 'Spaces have a LongName / Function',
    desc: 'IfcSpace.LongName or Pset_SpaceCommon.Reference should describe the regulatory category (e.g. "RESIDENTIAL/Bedroom").',
    severity: 'warn',
    check: (ctx) => {
      const spaces = ctx.byClass.get('IfcSpace')||[];
      const passed=[], failed=[];
      for(const s of spaces){
        const longName = s.LongName?.value || s.LongName;
        const ref = sgReadParam(s, 'Reference');
        if((longName && String(longName).trim()) || (ref && ref.value)) passed.push({eid:s.eid, name:s.name});
        else failed.push({eid:s.eid, name:s.name, reason:'No LongName or Pset_SpaceCommon.Reference'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── URA: GFA / Site information ───────────────────────────────────
  {
    id: 'URA-001', agency: 'URA', gateway: ['design'],
    category: 'Site', title: 'Site has plot ratio / GFA parameter',
    desc: 'URA requires Gross Floor Area (GFA) values for plot ratio compliance. Look for "GFA", "PlotRatio", or SGPset_Site_GFA values.',
    severity: 'warn',
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap(m=>m.spatial?.sites || []);
      const passed=[], failed=[];
      for(const s of sites){
        // Site doesn't have psets in our spatial cache, so this is a stub —
        // proper implementation needs reading IfcRelDefinesByProperties.
        // For Phase 1 we flag as "manual check needed".
        failed.push({eid:s.expressID, name:s.name||'(IfcSite)',
          reason:'Manual check: GFA/PlotRatio must be in SGPset_Site or Pset_BuildingCommon'});
      }
      return { passed, failed, skipped: sites.length === 0 ? 1 : 0 };
    }
  },

  // ── NEA: Environmental / waste ────────────────────────────────────
  {
    id: 'NEA-001', agency: 'NEA', gateway: ['design'],
    category: 'Environmental', title: 'Refuse rooms / chutes marked',
    desc: 'NEA requires refuse storage areas and chutes to be identified via IfcSpace.LongName containing "REFUSE" or "BIN CENTRE".',
    severity: 'info',
    check: (ctx) => {
      const spaces = ctx.byClass.get('IfcSpace')||[];
      const passed=[], failed=[];
      let foundAny = false;
      for(const s of spaces){
        const ln = (s.LongName?.value || s.LongName || s.name || '').toUpperCase();
        if(/\b(REFUSE|BIN\s*CENTRE|BIN\s*CHUTE|WASTE)\b/.test(ln)){
          passed.push({eid:s.eid, name:s.name||'(Space)'});
          foundAny = true;
        }
      }
      // This is an INFO-level rule — we don't fail if none found, just notify
      if(!foundAny){
        return { passed:[], failed:[], skipped:1,
          info:'No spaces tagged REFUSE/BIN CENTRE found — verify this is correct for project type' };
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── LTA: Carpark spaces ───────────────────────────────────────────
  {
    id: 'LTA-001', agency: 'LTA', gateway: ['design'],
    category: 'Transport', title: 'Carpark spaces identified',
    desc: 'LTA requires carpark spaces to be IfcSpace with LongName like "CARPARK" or "PARKING".',
    severity: 'info',
    check: (ctx) => {
      const spaces = ctx.byClass.get('IfcSpace')||[];
      const passed=[];
      for(const s of spaces){
        const ln = (s.LongName?.value || s.LongName || s.name || '').toUpperCase();
        if(/\b(CARPARK|PARKING|CAR\s*PARK|MOTORCYCLE)\b/.test(ln)){
          passed.push({eid:s.eid, name:s.name||'(Space)'});
        }
      }
      if(passed.length===0)
        return { passed:[], failed:[], skipped:1,
          info:'No carpark spaces found — verify LTA submission requirements for project type' };
      return { passed, failed:[], skipped:0 };
    }
  },

  // ── PUB: Drainage / wet areas ─────────────────────────────────────
  {
    id: 'PUB-001', agency: 'PUB', gateway: ['design'],
    category: 'Drainage', title: 'Wet area spaces (toilet/kitchen) identified',
    desc: 'PUB drainage review needs wet areas tagged as IfcSpace with relevant function.',
    severity: 'info',
    check: (ctx) => {
      const spaces = ctx.byClass.get('IfcSpace')||[];
      const passed=[];
      for(const s of spaces){
        const ln = (s.LongName?.value || s.LongName || s.name || '').toUpperCase();
        if(/\b(TOILET|WC|BATHROOM|KITCHEN|LAUNDRY|SHOWER|WET\s*AREA)\b/.test(ln)){
          passed.push({eid:s.eid, name:s.name||'(Space)'});
        }
      }
      if(passed.length===0)
        return { passed:[], failed:[], skipped:1,
          info:'No wet area spaces found — verify this matches project scope' };
      return { passed, failed:[], skipped:0 };
    }
  },

  // ── BCA: Stairs ───────────────────────────────────────────────────
  {
    id: 'BCA-ARCH-ST01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Stair', title: 'Stairs have NumberOfRiser',
    desc: 'Pset_StairCommon.NumberOfRiser needed for capacity review.',
    severity: 'warn',
    check: (ctx) => {
      const stairs = ctx.byClass.get('IfcStair')||[];
      const passed=[], failed=[];
      for(const s of stairs){
        if(sgReadNumeric(s, 'NumberOfRiser') != null) passed.push({eid:s.eid, name:s.name});
        else failed.push({eid:s.eid, name:s.name, reason:'Missing NumberOfRiser'});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-ST02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Stair', title: 'Stairs have RiserHeight ≤ 175mm',
    desc: 'BCA accessibility requires riser height ≤ 175mm.',
    severity: 'warn',
    check: (ctx) => {
      const stairs = ctx.byClass.get('IfcStair')||[];
      const passed=[], failed=[];
      for(const s of stairs){
        const rh = sgReadNumeric(s, 'RiserHeight');
        if(rh == null){ failed.push({eid:s.eid, name:s.name, reason:'RiserHeight not set'}); continue; }
        const rhMM = rh > 1 ? rh : rh * 1000;
        if(rhMM > 175) failed.push({eid:s.eid, name:s.name, reason:`RiserHeight ${rhMM.toFixed(0)}mm > 175mm`});
        else passed.push({eid:s.eid, name:`${s.name} (${rhMM.toFixed(0)}mm)`});
      }
      return { passed, failed, skipped:0 };
    }
  },
  {
    id: 'BCA-ARCH-ST03', agency: 'BCA', gateway: ['design','construction'],
    category: 'Stair', title: 'Stairs have TreadLength ≥ 250mm',
    desc: 'BCA accessibility requires tread length ≥ 250mm.',
    severity: 'warn',
    check: (ctx) => {
      const stairs = ctx.byClass.get('IfcStair')||[];
      const passed=[], failed=[];
      for(const s of stairs){
        const tl = sgReadNumeric(s, 'TreadLength');
        if(tl == null){ failed.push({eid:s.eid, name:s.name, reason:'TreadLength not set'}); continue; }
        const tlMM = tl > 1 ? tl : tl * 1000;
        if(tlMM < 250) failed.push({eid:s.eid, name:s.name, reason:`TreadLength ${tlMM.toFixed(0)}mm < 250mm`});
        else passed.push({eid:s.eid, name:`${s.name} (${tlMM.toFixed(0)}mm)`});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA: Railings ─────────────────────────────────────────────────
  {
    id: 'BCA-ARCH-R01', agency: 'BCA', gateway: ['design','construction'],
    category: 'Railing', title: 'Railings have a Height parameter',
    desc: 'BCA accessibility requires railing height ≥ 1000mm (residential balcony) or ≥ 900mm (interior stair).',
    severity: 'warn',
    check: (ctx) => {
      const rails = ctx.byClass.get('IfcRailing')||[];
      const passed=[], failed=[];
      for(const r of rails){
        const h = sgReadNumeric(r, 'Height') || sgReadNumeric(r, 'OverallHeight');
        if(h == null){ failed.push({eid:r.eid, name:r.name, reason:'Height/OverallHeight not set'}); continue; }
        const hMM = h > 10 ? h : h * 1000;
        if(hMM < 900) failed.push({eid:r.eid, name:r.name, reason:`Height ${hMM.toFixed(0)}mm < 900mm BCA minimum`});
        else passed.push({eid:r.eid, name:`${r.name} (${hMM.toFixed(0)}mm)`});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ── BCA: Naming sanity (GUID conflicts) ───────────────────────────
  {
    id: 'BCA-G01', agency: 'BCA', gateway: ['design','construction','completion'],
    category: 'Data Quality', title: 'No duplicate GlobalIds',
    desc: 'Every element must have a unique GlobalId. Duplicates indicate model corruption or improper federation.',
    severity: 'error',
    check: (ctx) => {
      const seen = new Map(); // globalId -> first entity
      const dupes = [];
      for(const e of ctx.entities){
        const gid = e.globalId;
        if(!gid) continue;
        if(seen.has(gid)) dupes.push({eid:e.eid, name:e.name, reason:`Duplicate GlobalId — also on element ${seen.get(gid).name}`});
        else seen.set(gid, e);
      }
      if(dupes.length===0) return { passed:[{eid:0, name:`${ctx.entities.length} unique GlobalIds`}], failed:[], skipped:0 };
      return { passed:[], failed:dupes, skipped:0 };
    }
  },
  {
    id: 'BCA-G02', agency: 'BCA', gateway: ['design','construction'],
    category: 'Data Quality', title: 'Element names are not blank or default',
    desc: 'Elements with names like "Wall", "Door:Default", or blank suggest the model was not properly authored.',
    severity: 'info',
    check: (ctx) => {
      const passed=[], failed=[];
      const DEFAULTS = /^(wall|door|window|slab|beam|column|stair|railing|space|<unnamed>|untitled|default|new)$/i;
      for(const e of ctx.entities){
        const nm = (e.name || '').trim();
        if(!nm || DEFAULTS.test(nm)) failed.push({eid:e.eid, name:nm||'(blank)', reason:`Default/blank name on ${e.type}`});
        else passed.push({eid:e.eid, name:nm});
      }
      // Cap failures to first 50 to avoid overwhelming the UI
      if(failed.length > 50){
        const totalFailed = failed.length;
        failed.length = 50;
        failed.push({eid:0, name:`… and ${totalFailed-50} more`, reason:'List truncated for performance'});
      }
      return { passed, failed, skipped:0 };
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // ── CROSS-DISCIPLINE CHECKS (multi-file federation) ──────────────
  // ══════════════════════════════════════════════════════════════════
  // These rules only produce meaningful results when 2+ models are loaded.
  // They check alignment, consistency, and conflicts across discipline files.

  {
    id: 'FED-001', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'Geo-reference alignment across models',
    desc: 'All federated IFC files must share the same IfcSite RefLatitude / RefLongitude / RefElevation. Mismatched geo-ref means models will not align correctly in CORENET X.',
    severity: 'error',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      // Collect geo-ref from each model's spatial data
      const geoRefs = [];
      for(const m of models){
        const sites = m.spatial?.sites || [];
        const mName = m.spatial?.modelName || ('Model ' + m.modelIdx);
        if(sites.length === 0){
          failed.push({eid:0, name:mName, reason:'No IfcSite found — cannot verify geo-reference'});
          continue;
        }
        const s = sites[0];
        const lat = s.refLat != null ? compoundToDeg(s.refLat) : null;
        const lon = s.refLon != null ? compoundToDeg(s.refLon) : null;
        const elev = typeof s.refElev === 'number' ? s.refElev : null;
        geoRefs.push({ mName, lat, lon, elev, modelIdx: m.modelIdx });
        if(lat == null || lon == null){
          failed.push({eid:0, name:mName, reason:'Missing RefLatitude or RefLongitude'});
        }
      }
      // Compare all pairs
      const valid = geoRefs.filter(g => g.lat != null && g.lon != null);
      if(valid.length >= 2){
        const ref = valid[0];
        for(let i=1; i<valid.length; i++){
          const g = valid[i];
          const dLat = Math.abs(g.lat - ref.lat);
          const dLon = Math.abs(g.lon - ref.lon);
          const dElev = g.elev != null && ref.elev != null ? Math.abs(g.elev - ref.elev) : 0;
          // Tolerance: ~11m lat/lon, 0.5m elevation
          if(dLat > 0.0001 || dLon > 0.0001){
            failed.push({eid:0, name:`${g.mName} vs ${ref.mName}`,
              reason:`Lat diff ${(dLat*111000).toFixed(1)}m, Lon diff ${(dLon*111000*Math.cos(ref.lat*Math.PI/180)).toFixed(1)}m — models will not align`});
          } else if(dElev > 0.5){
            failed.push({eid:0, name:`${g.mName} vs ${ref.mName}`,
              reason:`Elevation diff ${dElev.toFixed(2)}m — vertical misalignment`});
          } else {
            passed.push({eid:0, name:`${g.mName} ↔ ${ref.mName}: aligned (Δ${(dLat*111000).toFixed(1)}m, Δ${(dLon*111000).toFixed(1)}m)`});
          }
        }
      }
      return { passed, failed, skipped:0 };
    }
  },

  {
    id: 'FED-002', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'Storey naming consistency across models',
    desc: 'Building storeys should have matching names and elevations across all discipline files. Inconsistent naming causes problems in BIM coordination and CORENET X submission.',
    severity: 'warn',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      // Collect storeys from each model
      const modelStoreys = models.map(m => ({
        name: m.spatial?.modelName || ('Model ' + m.modelIdx),
        storeys: (m.spatial?.storeys || []).map(s => ({
          name: (s.name || '').trim().toUpperCase(),
          origName: s.name || '',
          elevation: s.elevation
        }))
      })).filter(m => m.storeys.length > 0);

      if(modelStoreys.length < 2){
        return { passed:[{eid:0,name:'Only one model has storeys — cross-check not applicable'}], failed:[], skipped:0 };
      }

      // Use first model as reference
      const ref = modelStoreys[0];
      for(let mi=1; mi<modelStoreys.length; mi++){
        const other = modelStoreys[mi];
        // Check storey count
        if(ref.storeys.length !== other.storeys.length){
          failed.push({eid:0, name:`${ref.name} vs ${other.name}`,
            reason:`Different storey count: ${ref.storeys.length} vs ${other.storeys.length}`});
        }
        // Match storeys by elevation (±0.1m tolerance)
        for(const rs of ref.storeys){
          const match = other.storeys.find(os => Math.abs(os.elevation - rs.elevation) < 0.1);
          if(!match){
            failed.push({eid:0, name:`${other.name}`,
              reason:`Missing storey at elevation ${rs.elevation.toFixed(2)}m (${rs.origName} in ${ref.name})`});
          } else if(match.name !== rs.name){
            failed.push({eid:0, name:`Elev ${rs.elevation.toFixed(1)}m`,
              reason:`Name mismatch: "${rs.origName}" (${ref.name}) vs "${match.origName}" (${other.name})`});
          } else {
            passed.push({eid:0, name:`${rs.origName} @ ${rs.elevation.toFixed(1)}m — consistent`});
          }
        }
        // Check for extra storeys in the other model
        for(const os of other.storeys){
          const match = ref.storeys.find(rs => Math.abs(rs.elevation - os.elevation) < 0.1);
          if(!match){
            failed.push({eid:0, name:`${other.name}`,
              reason:`Extra storey "${os.origName}" at ${os.elevation.toFixed(2)}m — not in ${ref.name}`});
          }
        }
      }
      // Deduplicate passed (same storey found consistent across multiple models)
      const seen = new Set();
      const dedupPassed = passed.filter(p => { if(seen.has(p.name)) return false; seen.add(p.name); return true; });
      return { passed: dedupPassed, failed, skipped:0 };
    }
  },

  {
    id: 'FED-003', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'No GlobalId conflicts across models',
    desc: 'When federating multiple IFC files, GlobalIds must be unique across all models. Duplicate GlobalIds indicate copy-paste errors or improper federation and will cause issues in CORENET X.',
    severity: 'error',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      // Build globalId → model map
      const gidMap = new Map(); // globalId → {name, modelIdx, type}
      let totalChecked = 0;
      let conflicts = 0;
      for(const e of ctx.entities){
        if(!e.globalId) continue;
        totalChecked++;
        if(gidMap.has(e.globalId)){
          const existing = gidMap.get(e.globalId);
          if(existing.modelIdx !== e.modelIdx){
            conflicts++;
            if(conflicts <= 50){
              failed.push({eid:e.eid, name:e.name || e.globalId,
                reason:`GlobalId "${e.globalId.substring(0,12)}…" exists in model ${existing.modelIdx} (${existing.name}) AND model ${e.modelIdx}`});
            }
          }
        } else {
          gidMap.set(e.globalId, { name:e.name, modelIdx:e.modelIdx, type:e.type });
        }
      }
      if(conflicts > 50){
        failed.push({eid:0, name:`… and ${conflicts-50} more conflicts`, reason:'List truncated'});
      }
      if(conflicts === 0){
        passed.push({eid:0, name:`${totalChecked} GlobalIds checked across ${models.length} models — all unique`});
      }
      return { passed, failed, skipped:0 };
    }
  },

  {
    id: 'FED-004', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'Project name consistency across models',
    desc: 'All federated IFC files should reference the same IfcProject name to confirm they belong to the same project.',
    severity: 'warn',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      const names = models.map(m => ({
        mName: m.spatial?.modelName || ('Model ' + m.modelIdx),
        projName: (m.spatial?.projectName || '').trim()
      }));
      const ref = names[0];
      for(let i=1; i<names.length; i++){
        if(!ref.projName || !names[i].projName){
          failed.push({eid:0, name:names[i].mName, reason:'IfcProject name is empty — cannot verify consistency'});
        } else if(ref.projName.toUpperCase() !== names[i].projName.toUpperCase()){
          failed.push({eid:0, name:`${names[i].mName}`,
            reason:`Project name "${names[i].projName}" ≠ "${ref.projName}" (${ref.mName})`});
        } else {
          passed.push({eid:0, name:`${names[i].mName}: "${names[i].projName}" ✓`});
        }
      }
      return { passed, failed, skipped:0 };
    }
  },

  {
    id: 'FED-005', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'TrueNorth alignment across models',
    desc: 'All federated IFC files should have the same TrueNorth direction. Mismatched TrueNorth means models are rotated relative to each other.',
    severity: 'error',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      const angles = models.map(m => ({
        mName: m.spatial?.modelName || ('Model ' + m.modelIdx),
        angle: m.spatial?.trueNorthAngle ?? 0
      }));
      const ref = angles[0];
      for(let i=1; i<angles.length; i++){
        const diff = Math.abs(angles[i].angle - ref.angle);
        const diffDeg = diff * 180 / Math.PI;
        if(diffDeg > 0.5){
          failed.push({eid:0, name:`${angles[i].mName} vs ${ref.mName}`,
            reason:`TrueNorth differs by ${diffDeg.toFixed(1)}° — models rotated relative to each other`});
        } else {
          passed.push({eid:0, name:`${angles[i].mName} ↔ ${ref.mName}: TrueNorth aligned (Δ${diffDeg.toFixed(2)}°)`});
        }
      }
      return { passed, failed, skipped:0 };
    }
  },

  {
    id: 'FED-006', agency: 'GENERAL', gateway: ['design','piling','construction','completion'],
    category: 'Federation', title: 'Bounding box overlap between models',
    desc: 'Federated models should occupy overlapping 3D space. Non-overlapping bounding boxes indicate wrong coordinate origin or wrong file.',
    severity: 'warn',
    check: (ctx) => {
      const passed=[], failed=[];
      const models = ctx.modelIDs;
      if(models.length < 2){
        return { passed:[{eid:0,name:'Single model — cross-check not applicable'}], failed:[], skipped:0 };
      }
      // Compute per-model bounding boxes from entities
      const bboxes = [];
      for(const m of models){
        const mName = m.spatial?.modelName || ('Model ' + m.modelIdx);
        const model = loadedModels[m.modelIdx];
        if(!model) continue;
        const box = new THREE.Box3().setFromObject(model);
        if(box.isEmpty()) continue;
        bboxes.push({ mName, box, modelIdx: m.modelIdx });
      }
      if(bboxes.length < 2){
        return { passed:[], failed:[], skipped:1, info:'Cannot compute bounding boxes' };
      }
      // Check overlap between first model and each subsequent
      const ref = bboxes[0];
      for(let i=1; i<bboxes.length; i++){
        const other = bboxes[i];
        const overlap = ref.box.clone().intersect(other.box);
        if(overlap.isEmpty()){
          const dist = ref.box.distanceToPoint(other.box.getCenter(new THREE.Vector3()));
          failed.push({eid:0, name:`${other.mName} vs ${ref.mName}`,
            reason:`No bounding box overlap — ${dist.toFixed(1)}m apart. Models may use different coordinate origins.`});
        } else {
          const oSize = new THREE.Vector3(); overlap.getSize(oSize);
          const rSize = new THREE.Vector3(); ref.box.getSize(rSize);
          const pct = (oSize.x*oSize.y*oSize.z) / (rSize.x*rSize.y*rSize.z) * 100;
          passed.push({eid:0, name:`${other.mName} ↔ ${ref.mName}: ${Math.min(pct,100).toFixed(0)}% overlap`});
        }
      }
      return { passed, failed, skipped:0 };
    }
  }
];

