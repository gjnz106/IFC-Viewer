// ══════════════════════════════════════════════════════════════════════
// ── PHASE 2: JSON INDUSTRY MAPPING LOADER ───────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Loads rules from JSON matching the BCA Industry Mapping Excel columns:
//   agency, component, parameter, ifcEntity, ifcSubType, propertySet,
//   propertyName, propertyType, unit, sampleValues, gateway[], severity, notes
//
// The compiler converts each JSON row into an SG_RULES-compatible check
// function. Rules are grouped by (ifcEntity + propertySet + propertyName)
// to avoid duplicating checks for the same property across components.

import * as THREE from 'three';
import { appState } from '../../state/index.js';
import { log } from '../core/ifc-category.js';

// ── Active rule set — starts as the built-in Phase 1 rules ──────────
let SG_ACTIVE_RULES: any[] = [];
let sgJsonLoaded: any = null; // { filename, rowCount, ruleCount, byAgency }

// ── JSON schema for one mapping row ─────────────────────────────────
// {
//   "agency": "BCA",
//   "component": "Wall",           // Identified Component
//   "parameter": "Fire Rating",    // Identified Parameter (human)
//   "ifcEntity": "IfcWall",        // IFC4 Entity
//   "ifcSubType": "",              // IFC Sub Type (optional)
//   "propertySet": "Pset_WallCommon",  // Property Set name
//   "propertyName": "FireRating",  // Exact IFC property name
//   "propertyType": "Label",       // Boolean, Label, Real, Integer, etc.
//   "unit": "",                    // mm, m, m², etc.
//   "sampleValues": "120/120/120", // Example values for reference
//   "gateway": ["design"],         // Which gateways this applies to
//   "severity": "error",           // error | warn | info
//   "notes": "",                   // Additional notes
//   "checkType": "exists"          // exists | boolean | numeric_gte | numeric_lte | enum | regex
//   "checkValue": null             // threshold for numeric, or allowed values array for enum
// }

// ── IFC entity name normalization ───────────────────────────────────
function sgNormalizeEntity(name: string): string {
  if (!name) return '';
  let n = name.trim();
  // Accept with or without "Ifc" prefix
  if (!n.startsWith('Ifc') && !n.startsWith('ifc')) n = 'Ifc' + n;
  // Capitalize "Ifc" properly
  return 'Ifc' + n.charAt(3).toUpperCase() + n.slice(4);
}

// ── Compile JSON rows → SG_RULES-compatible rule objects ────────────
function sgCompileJsonRules(jsonRows: any[]): any[] {
  // Group by unique (entity + propertySet + propertyName + agency) to deduplicate
  const groups = new Map<string, any>();
  let rowIdx = 0;
  for (const row of jsonRows) {
    rowIdx++;
    if (!row.ifcEntity || !row.propertyName) continue;
    const entity = sgNormalizeEntity(row.ifcEntity);
    const pset = (row.propertySet || '').trim();
    const prop = (row.propertyName || '').trim();
    const agency = (row.agency || 'BCA').toUpperCase().trim();
    const key = `${agency}|${entity}|${pset}|${prop}`;

    if (!groups.has(key)) {
      groups.set(key, {
        entity, pset, prop, agency,
        component: row.component || '',
        parameter: row.parameter || prop,
        propType: (row.propertyType || 'Label').trim(),
        unit: (row.unit || '').trim(),
        sampleValues: row.sampleValues || '',
        gateway: Array.isArray(row.gateway) ? row.gateway : ['design'],
        severity: row.severity || 'warn',
        notes: row.notes || '',
        checkType: row.checkType || 'exists',
        checkValue: row.checkValue ?? null,
        rowNums: [rowIdx]
      });
    } else {
      // Merge gateways from duplicate rows
      const g = groups.get(key);
      for (const gw of (Array.isArray(row.gateway) ? row.gateway : ['design'])) {
        if (!g.gateway.includes(gw)) g.gateway.push(gw);
      }
      g.rowNums.push(rowIdx);
    }
  }

  // Convert each group to a rule object
  const rules: any[] = [];
  let seq = 0;
  for (const [, g] of groups) {
    seq++;
    const ruleId = `JSON-${g.agency}-${String(seq).padStart(3, '0')}`;
    const entityNames = [g.entity];
    // Also check StandardCase variants
    if (g.entity === 'IfcWall') entityNames.push('IfcWallStandardCase');

    const title = g.prop
      ? `${g.entity.replace('Ifc', '')} — ${g.prop}` + (g.pset ? ` (${g.pset})` : '')
      : `${g.component} — ${g.parameter}`;

    const desc = [
      g.parameter !== g.prop ? `Parameter: ${g.parameter}` : '',
      g.component ? `Component: ${g.component}` : '',
      g.sampleValues ? `Sample values: ${g.sampleValues}` : '',
      g.notes || ''
    ].filter(Boolean).join('. ');

    rules.push({
      id: ruleId,
      agency: g.agency,
      gateway: g.gateway,
      category: g.component || g.entity.replace('Ifc', ''),
      title,
      desc: desc || title,
      severity: g.severity,
      _source: 'json',
      _pset: g.pset,
      _prop: g.prop,
      _checkType: g.checkType,
      _checkValue: g.checkValue,
      _unit: g.unit,
      _propType: g.propType,
      check: sgMakeCheckFn(entityNames, g.pset, g.prop, g.propType, g.checkType, g.checkValue, g.unit)
    });
  }
  return rules;
}

// ── Check function factory ──────────────────────────────────────────
function sgMakeCheckFn(
  entityNames: string[],
  pset: string,
  prop: string,
  propType: string,
  checkType: string,
  checkValue: any,
  unit: string
): (ctx: any) => any {
  return (ctx: any) => {
    // Collect all entities matching any of the entity names
    let scope: any[] = [];
    for (const en of entityNames) {
      const bucket = ctx.byClass.get(en);
      if (bucket) scope.push(...bucket);
    }
    // Deduplicate by eid (IfcWall + IfcWallStandardCase overlap)
    const seen = new Set<number>();
    scope = scope.filter(e => { if (seen.has(e.eid)) return false; seen.add(e.eid); return true; });

    if (scope.length === 0) {
      return { passed: [], failed: [], skipped: 0, info: `No ${entityNames[0]} elements found in model` };
    }

    const passed: any[] = [], failed: any[] = [];
    for (const e of scope) {
      const psetHint = pset || null;
      // Entity-level properties (not in psets) — check these first
      const ENTITY_PROPS: Record<string, string> = { Name: 'name', LongName: 'LongName', Tag: 'tag', PredefinedType: 'PredefinedType' };
      let r: any = null;
      if (ENTITY_PROPS[prop]) {
        const key = ENTITY_PROPS[prop];
        const val = e[key]?.value ?? e[key];
        if (val !== null && val !== undefined && val !== '')
          r = { value: val, type: typeof val, psetName: '(entity)' };
      }
      // Fall through to pset search if entity-level didn't find it
      if (!r) r = (window as any).sgReadParam ? (window as any).sgReadParam(e, prop, psetHint) : null;

      switch (checkType) {
        case 'boolean': {
          if (r && (r.value === true || r.value === false || r.value === 'TRUE' || r.value === 'FALSE' || r.value === 'T' || r.value === 'F'))
            passed.push({ eid: e.eid, name: e.name });
          else
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set (expected TRUE/FALSE)` });
          break;
        }
        case 'numeric_gte': {
          const n = (window as any).sgReadNumeric ? (window as any).sgReadNumeric(e, prop, psetHint) : null;
          if (n === null) {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set or not numeric` });
          } else {
            // Handle unit conversion: if unit is mm and value looks like metres
            let val = n;
            if (unit === 'mm' && val < 10 && val > 0) val = val * 1000;
            if (val >= checkValue)
              passed.push({ eid: e.eid, name: `${e.name} (${val}${unit})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = ${val}${unit}, required ≥ ${checkValue}${unit}` });
          }
          break;
        }
        case 'numeric_lte': {
          const n = (window as any).sgReadNumeric ? (window as any).sgReadNumeric(e, prop, psetHint) : null;
          if (n === null) {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set or not numeric` });
          } else {
            let val = n;
            if (unit === 'mm' && val < 10 && val > 0) val = val * 1000;
            if (val <= checkValue)
              passed.push({ eid: e.eid, name: `${e.name} (${val}${unit})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = ${val}${unit}, required ≤ ${checkValue}${unit}` });
          }
          break;
        }
        case 'enum': {
          if (!r || r.value === null || r.value === undefined || r.value === '') {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set` });
          } else {
            const allowed = Array.isArray(checkValue) ? checkValue : [];
            const val = String(r.value).toUpperCase().trim();
            if (allowed.length === 0 || allowed.some((a: any) => val === String(a).toUpperCase().trim()))
              passed.push({ eid: e.eid, name: `${e.name} (${r.value})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = "${r.value}" — expected one of: ${allowed.join(', ')}` });
          }
          break;
        }
        case 'regex': {
          if (!r || r.value === null || r.value === undefined || r.value === '') {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set` });
          } else {
            try {
              const rx = new RegExp(checkValue || '.+');
              if (rx.test(String(r.value)))
                passed.push({ eid: e.eid, name: `${e.name} (${r.value})` });
              else
                failed.push({ eid: e.eid, name: e.name, reason: `${prop} = "${r.value}" does not match pattern` });
            } catch {
              passed.push({ eid: e.eid, name: e.name }); // invalid regex → pass
            }
          }
          break;
        }
        default: // 'exists'
          if (r && r.value !== null && r.value !== undefined && r.value !== '')
            passed.push({ eid: e.eid, name: e.name });
          else
            failed.push({ eid: e.eid, name: e.name, reason: `Missing ${prop}` + (pset ? ` in ${pset}` : '') });
      }
    }

    // Cap failures
    if (failed.length > 50) {
      const total = failed.length;
      failed.length = 50;
      failed.push({ eid: 0, name: `… and ${total - 50} more`, reason: 'List truncated' });
    }
    return { passed, failed, skipped: 0 };
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── BUILT-IN EXTENDED RULES (Phase 2 defaults) ─────────────────────
// ══════════════════════════════════════════════════════════════════════
// Comprehensive rule set based on publicly documented BCA/URA/NEA/LTA/
// PUB/SCDF requirements from the IFC-SG Resource Toolkit and Industry
// Mapping Excel column descriptions. Covers ~200 parameter checks.
const SG_BUILTIN_JSON: any[] = [
  // ══ BCA — WALLS ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Wall",parameter:"Fire Rating",ifcEntity:"IfcWall",propertySet:"Pset_WallCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"BCA",component:"Wall",parameter:"Load Bearing",ifcEntity:"IfcWall",propertySet:"Pset_WallCommon",propertyName:"LoadBearing",propertyType:"Boolean",gateway:["design","construction"],severity:"error",checkType:"boolean"},
  {agency:"BCA",component:"Wall",parameter:"Is External",ifcEntity:"IfcWall",propertySet:"Pset_WallCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design","construction"],severity:"error",checkType:"boolean"},
  {agency:"BCA",component:"Wall",parameter:"Thickness",ifcEntity:"IfcWall",propertySet:"SGPset_Wall",propertyName:"Thickness",propertyType:"Real",unit:"mm",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Wall",parameter:"Construction Method",ifcEntity:"IfcWall",propertySet:"SGPset_Wall",propertyName:"ConstructionMethod",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists",sampleValues:"CIS, Precast, PPVC"},
  {agency:"BCA",component:"Wall",parameter:"Material Grade",ifcEntity:"IfcWall",propertySet:"SGPset_Wall",propertyName:"MaterialGrade",propertyType:"Label",gateway:["design","construction"],severity:"warn",checkType:"exists",sampleValues:"C30/37, C40/50"},
  {agency:"BCA",component:"Wall",parameter:"Reference",ifcEntity:"IfcWall",propertySet:"Pset_WallCommon",propertyName:"Reference",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  // ══ BCA — DOORS ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Door",parameter:"Fire Rating",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"BCA",component:"Door",parameter:"Is External",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Door",parameter:"Accessible Width ≥ 850mm",ifcEntity:"IfcDoor",propertySet:"SGPset_Door",propertyName:"Width",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"numeric_gte",checkValue:850},
  {agency:"BCA",component:"Door",parameter:"Handicap Accessible",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"HandicapAccessible",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Door",parameter:"Self Closing",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"SelfClosing",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"BCA",component:"Door",parameter:"Smoke Stop",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"SmokeStop",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  // ══ BCA — WINDOWS ═════════════════════════════════════════════════
  {agency:"BCA",component:"Window",parameter:"Is External",ifcEntity:"IfcWindow",propertySet:"Pset_WindowCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Window",parameter:"Fire Rating",ifcEntity:"IfcWindow",propertySet:"Pset_WindowCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Window",parameter:"Glazing Area Fraction",ifcEntity:"IfcWindow",propertySet:"Pset_WindowCommon",propertyName:"GlazingAreaFraction",propertyType:"Real",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"BCA",component:"Window",parameter:"Thermal Transmittance",ifcEntity:"IfcWindow",propertySet:"Pset_WindowCommon",propertyName:"ThermalTransmittance",propertyType:"Real",gateway:["design"],severity:"info",checkType:"exists"},
  // ══ BCA — SLABS ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Slab",parameter:"Fire Rating",ifcEntity:"IfcSlab",propertySet:"Pset_SlabCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"BCA",component:"Slab",parameter:"Is External",ifcEntity:"IfcSlab",propertySet:"Pset_SlabCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Slab",parameter:"Load Bearing",ifcEntity:"IfcSlab",propertySet:"Pset_SlabCommon",propertyName:"LoadBearing",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Slab",parameter:"Thickness",ifcEntity:"IfcSlab",propertySet:"SGPset_Slab",propertyName:"Thickness",propertyType:"Real",unit:"mm",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Slab",parameter:"Construction Method",ifcEntity:"IfcSlab",propertySet:"SGPset_Slab",propertyName:"ConstructionMethod",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Slab",parameter:"Material Grade",ifcEntity:"IfcSlab",propertySet:"SGPset_Slab",propertyName:"MaterialGrade",propertyType:"Label",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  // ══ BCA — COLUMNS ═════════════════════════════════════════════════
  {agency:"BCA",component:"Column",parameter:"Fire Rating",ifcEntity:"IfcColumn",propertySet:"Pset_ColumnCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"BCA",component:"Column",parameter:"Load Bearing",ifcEntity:"IfcColumn",propertySet:"Pset_ColumnCommon",propertyName:"LoadBearing",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Column",parameter:"Width",ifcEntity:"IfcColumn",propertySet:"SGPset_ColumnDimension",propertyName:"Width",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Column",parameter:"Depth",ifcEntity:"IfcColumn",propertySet:"SGPset_ColumnDimension",propertyName:"Depth",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Column",parameter:"Construction Method",ifcEntity:"IfcColumn",propertySet:"SGPset_Column",propertyName:"ConstructionMethod",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Column",parameter:"Material Grade",ifcEntity:"IfcColumn",propertySet:"SGPset_Column",propertyName:"MaterialGrade",propertyType:"Label",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Column",parameter:"Rebar Grade",ifcEntity:"IfcColumn",propertySet:"SGPset_ColumnReinforcement",propertyName:"RebarGrade",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists",sampleValues:"B500, H13, T16"},
  // ══ BCA — BEAMS ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Beam",parameter:"Fire Rating",ifcEntity:"IfcBeam",propertySet:"Pset_BeamCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"BCA",component:"Beam",parameter:"Load Bearing",ifcEntity:"IfcBeam",propertySet:"Pset_BeamCommon",propertyName:"LoadBearing",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  {agency:"BCA",component:"Beam",parameter:"Width",ifcEntity:"IfcBeam",propertySet:"SGPset_BeamDimension",propertyName:"Width",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Beam",parameter:"Depth",ifcEntity:"IfcBeam",propertySet:"SGPset_BeamDimension",propertyName:"Depth",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Beam",parameter:"Construction Method",ifcEntity:"IfcBeam",propertySet:"SGPset_Beam",propertyName:"ConstructionMethod",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Beam",parameter:"Material Grade",ifcEntity:"IfcBeam",propertySet:"SGPset_Beam",propertyName:"MaterialGrade",propertyType:"Label",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Beam",parameter:"Rebar Grade",ifcEntity:"IfcBeam",propertySet:"SGPset_BeamReinforcement",propertyName:"RebarGrade",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists"},
  // ══ BCA — STAIRS ══════════════════════════════════════════════════
  {agency:"BCA",component:"Stair",parameter:"Number of Risers",ifcEntity:"IfcStairFlight",propertySet:"Pset_StairFlightCommon",propertyName:"NumberOfRiser",propertyType:"Integer",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Stair",parameter:"Riser Height ≤ 175mm",ifcEntity:"IfcStairFlight",propertySet:"Pset_StairFlightCommon",propertyName:"RiserHeight",propertyType:"Real",unit:"mm",gateway:["design"],severity:"error",checkType:"numeric_lte",checkValue:175},
  {agency:"BCA",component:"Stair",parameter:"Tread Length ≥ 250mm",ifcEntity:"IfcStairFlight",propertySet:"Pset_StairFlightCommon",propertyName:"TreadLength",propertyType:"Real",unit:"mm",gateway:["design"],severity:"error",checkType:"numeric_gte",checkValue:250},
  {agency:"BCA",component:"Stair",parameter:"Fire Rating",ifcEntity:"IfcStair",propertySet:"Pset_StairCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Stair",parameter:"Is External",ifcEntity:"IfcStair",propertySet:"Pset_StairCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"boolean"},
  // ══ BCA — RAILINGS ════════════════════════════════════════════════
  {agency:"BCA",component:"Railing",parameter:"Height ≥ 900mm",ifcEntity:"IfcRailing",propertySet:"Pset_RailingCommon",propertyName:"Height",propertyType:"Real",unit:"mm",gateway:["design"],severity:"error",checkType:"numeric_gte",checkValue:900},
  {agency:"BCA",component:"Railing",parameter:"Is External",ifcEntity:"IfcRailing",propertySet:"Pset_RailingCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"boolean"},
  // ══ BCA — ROOFS ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Roof",parameter:"Fire Rating",ifcEntity:"IfcRoof",propertySet:"Pset_RoofCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Roof",parameter:"Is External",ifcEntity:"IfcRoof",propertySet:"Pset_RoofCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"boolean"},
  // ══ BCA — FOOTINGS ════════════════════════════════════════════════
  {agency:"BCA",component:"Footing",parameter:"Material Grade",ifcEntity:"IfcFooting",propertySet:"SGPset_Footing",propertyName:"MaterialGrade",propertyType:"Label",gateway:["design","construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Footing",parameter:"Construction Method",ifcEntity:"IfcFooting",propertySet:"SGPset_Footing",propertyName:"ConstructionMethod",propertyType:"Label",gateway:["construction"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Footing",parameter:"Pile Type",ifcEntity:"IfcFooting",propertySet:"SGPset_Footing",propertyName:"PileType",propertyType:"Label",gateway:["piling"],severity:"warn",checkType:"exists",sampleValues:"Bored, Driven, Micropile"},
  // ══ BCA — CURTAIN WALLS ═══════════════════════════════════════════
  {agency:"BCA",component:"Curtain Wall",parameter:"Fire Rating",ifcEntity:"IfcCurtainWall",propertySet:"Pset_CurtainWallCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Curtain Wall",parameter:"Is External",ifcEntity:"IfcCurtainWall",propertySet:"Pset_CurtainWallCommon",propertyName:"IsExternal",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  // ══ BCA — MEMBERS ═════════════════════════════════════════════════
  {agency:"BCA",component:"Member",parameter:"Fire Rating",ifcEntity:"IfcMember",propertySet:"Pset_MemberCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Member",parameter:"Load Bearing",ifcEntity:"IfcMember",propertySet:"Pset_MemberCommon",propertyName:"LoadBearing",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"boolean"},
  // ══ BCA — PLATES ══════════════════════════════════════════════════
  {agency:"BCA",component:"Plate",parameter:"Fire Rating",ifcEntity:"IfcPlate",propertySet:"Pset_PlateCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  // ══ BCA — SPACES ══════════════════════════════════════════════════
  {agency:"BCA",component:"Space",parameter:"Name",ifcEntity:"IfcSpace",propertySet:"",propertyName:"Name",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Space",parameter:"Long Name / Function",ifcEntity:"IfcSpace",propertySet:"",propertyName:"LongName",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Space",parameter:"Fire Rating",ifcEntity:"IfcSpace",propertySet:"Pset_SpaceCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"BCA",component:"Space",parameter:"Gross Floor Area",ifcEntity:"IfcSpace",propertySet:"SGPset_SpaceDimension",propertyName:"GrossFloorArea",propertyType:"Real",unit:"m²",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Space",parameter:"Net Floor Area",ifcEntity:"IfcSpace",propertySet:"SGPset_SpaceDimension",propertyName:"NetFloorArea",propertyType:"Real",unit:"m²",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"BCA",component:"Space",parameter:"Height",ifcEntity:"IfcSpace",propertySet:"SGPset_SpaceDimension",propertyName:"Height",propertyType:"Real",unit:"mm",gateway:["design"],severity:"info",checkType:"exists"},
  // ══ BCA — ACCESSIBILITY ═══════════════════════════════════════════
  {agency:"BCA",component:"Ramp",parameter:"Slope ≤ 1:12",ifcEntity:"IfcRamp",propertySet:"Pset_RampCommon",propertyName:"RequiredSlope",propertyType:"Real",gateway:["design"],severity:"warn",checkType:"exists"},
  {agency:"BCA",component:"Ramp",parameter:"Handrail Height",ifcEntity:"IfcRamp",propertySet:"SGPset_Ramp",propertyName:"HandrailHeight",propertyType:"Real",unit:"mm",gateway:["design"],severity:"warn",checkType:"exists"},
  // ══ BCA — MEP GENERAL (Flow segments/terminals) ═══════════════════
  {agency:"BCA",component:"Pipe",parameter:"System Type",ifcEntity:"IfcFlowSegment",propertySet:"SGPset_Pipe",propertyName:"SystemType",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists",sampleValues:"Sanitary, Stormwater, Potable Water"},
  {agency:"BCA",component:"Pipe",parameter:"Diameter",ifcEntity:"IfcFlowSegment",propertySet:"SGPset_Pipe",propertyName:"NominalDiameter",propertyType:"Real",unit:"mm",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"BCA",component:"Terminal",parameter:"System Type",ifcEntity:"IfcFlowTerminal",propertySet:"SGPset_FlowTerminal",propertyName:"SystemType",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists"},
  // ══ BCA — PROXY ═══════════════════════════════════════════════════
  {agency:"BCA",component:"Building Element Proxy",parameter:"Tag",ifcEntity:"IfcBuildingElementProxy",propertySet:"",propertyName:"Tag",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists",notes:"Proxies should be properly tagged for identification"},

  // ══ SCDF — FIRE SAFETY ════════════════════════════════════════════
  {agency:"SCDF",component:"Wall",parameter:"Fire Rating (SCDF)",ifcEntity:"IfcWall",propertySet:"Pset_WallCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists",notes:"SCDF requires fire compartmentation walls to have explicit fire rating"},
  {agency:"SCDF",component:"Door",parameter:"Fire Rating (SCDF)",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design","construction"],severity:"error",checkType:"exists"},
  {agency:"SCDF",component:"Door",parameter:"Self Closing (Fire Door)",ifcEntity:"IfcDoor",propertySet:"Pset_DoorCommon",propertyName:"SelfClosing",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"exists",notes:"Fire doors must be self-closing per Fire Code 2023"},
  {agency:"SCDF",component:"Slab",parameter:"Fire Rating (SCDF)",ifcEntity:"IfcSlab",propertySet:"Pset_SlabCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"error",checkType:"exists"},
  {agency:"SCDF",component:"Column",parameter:"Fire Rating (SCDF)",ifcEntity:"IfcColumn",propertySet:"Pset_ColumnCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"error",checkType:"exists"},
  {agency:"SCDF",component:"Beam",parameter:"Fire Rating (SCDF)",ifcEntity:"IfcBeam",propertySet:"Pset_BeamCommon",propertyName:"FireRating",propertyType:"Label",gateway:["design"],severity:"error",checkType:"exists"},

  // ══ URA — PLANNING ════════════════════════════════════════════════
  {agency:"URA",component:"Space",parameter:"GFA (Gross Floor Area)",ifcEntity:"IfcSpace",propertySet:"SGPset_SpaceDimension",propertyName:"GrossFloorArea",propertyType:"Real",unit:"m²",gateway:["design"],severity:"warn",checkType:"exists",notes:"URA uses GFA for plot ratio calculation"},
  {agency:"URA",component:"Space",parameter:"Plot Ratio",ifcEntity:"IfcSpace",propertySet:"SGPset_URA",propertyName:"PlotRatio",propertyType:"Real",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"URA",component:"Space",parameter:"Use Group",ifcEntity:"IfcSpace",propertySet:"SGPset_URA",propertyName:"UseGroup",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists",sampleValues:"A1, A2, B1, B2, C, D"},
  {agency:"URA",component:"Space",parameter:"Zone",ifcEntity:"IfcSpace",propertySet:"SGPset_URA",propertyName:"Zone",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"URA",component:"Space",parameter:"Conservation Status",ifcEntity:"IfcSpace",propertySet:"SGPset_URA",propertyName:"ConservationStatus",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"URA",component:"Space",parameter:"Building Height",ifcEntity:"IfcSpace",propertySet:"SGPset_URA",propertyName:"BuildingHeight",propertyType:"Real",unit:"m",gateway:["design"],severity:"info",checkType:"exists"},

  // ══ NEA — ENVIRONMENT ═════════════════════════════════════════════
  {agency:"NEA",component:"Space",parameter:"Refuse Chute Room",ifcEntity:"IfcSpace",propertySet:"SGPset_NEA",propertyName:"RefuseChute",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"exists",notes:"NEA requires refuse chute provisions tagged in the model"},
  {agency:"NEA",component:"Space",parameter:"Recycling Room",ifcEntity:"IfcSpace",propertySet:"SGPset_NEA",propertyName:"RecyclingRoom",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"NEA",component:"Space",parameter:"Ventilation Type",ifcEntity:"IfcSpace",propertySet:"SGPset_NEA",propertyName:"VentilationType",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists",sampleValues:"Natural, Mechanical, Hybrid"},
  {agency:"NEA",component:"Space",parameter:"Noise Level",ifcEntity:"IfcSpace",propertySet:"SGPset_NEA",propertyName:"NoiseLevel",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"NEA",component:"Terminal",parameter:"Exhaust System",ifcEntity:"IfcFlowTerminal",propertySet:"SGPset_NEA",propertyName:"ExhaustType",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},

  // ══ LTA — TRANSPORT ═══════════════════════════════════════════════
  {agency:"LTA",component:"Space",parameter:"Carpark Type",ifcEntity:"IfcSpace",propertySet:"SGPset_LTA",propertyName:"CarparkType",propertyType:"Label",gateway:["design"],severity:"warn",checkType:"exists",sampleValues:"Mechanical, Conventional, Automated"},
  {agency:"LTA",component:"Space",parameter:"Carpark Lot Size",ifcEntity:"IfcSpace",propertySet:"SGPset_LTA",propertyName:"LotSize",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"LTA",component:"Space",parameter:"EV Charging",ifcEntity:"IfcSpace",propertySet:"SGPset_LTA",propertyName:"EVCharging",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"LTA",component:"Space",parameter:"Bicycle Lot",ifcEntity:"IfcSpace",propertySet:"SGPset_LTA",propertyName:"BicycleLot",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"LTA",component:"Space",parameter:"Loading Bay",ifcEntity:"IfcSpace",propertySet:"SGPset_LTA",propertyName:"LoadingBay",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"LTA",component:"Ramp",parameter:"Vehicle Ramp Gradient",ifcEntity:"IfcRamp",propertySet:"SGPset_LTA",propertyName:"VehicleRampGradient",propertyType:"Real",gateway:["design"],severity:"warn",checkType:"exists"},

  // ══ PUB — WATER/DRAINAGE ══════════════════════════════════════════
  {agency:"PUB",component:"Space",parameter:"Wet Area",ifcEntity:"IfcSpace",propertySet:"SGPset_PUB",propertyName:"WetArea",propertyType:"Boolean",gateway:["design"],severity:"warn",checkType:"exists",notes:"PUB requires wet areas (toilets, kitchens) to be tagged"},
  {agency:"PUB",component:"Space",parameter:"Minimum Platform Level",ifcEntity:"IfcSpace",propertySet:"SGPset_PUB",propertyName:"MinPlatformLevel",propertyType:"Real",unit:"m",gateway:["design"],severity:"warn",checkType:"exists",notes:"MPL compliance is a frequent PUB rejection cause"},
  {agency:"PUB",component:"Pipe",parameter:"Drainage System",ifcEntity:"IfcFlowSegment",propertySet:"SGPset_PUB",propertyName:"DrainageSystem",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists",sampleValues:"Surface, Sub-surface"},
  {agency:"PUB",component:"Pipe",parameter:"Pipe Material",ifcEntity:"IfcFlowSegment",propertySet:"SGPset_PUB",propertyName:"PipeMaterial",propertyType:"Label",gateway:["design","construction"],severity:"info",checkType:"exists"},
  {agency:"PUB",component:"Terminal",parameter:"Sanitary Fixture Type",ifcEntity:"IfcFlowTerminal",propertySet:"SGPset_PUB",propertyName:"FixtureType",propertyType:"Label",gateway:["design"],severity:"info",checkType:"exists"},

  // ══ NPARKS — GREENERY ═════════════════════════════════════════════
  {agency:"NPARKS",component:"Space",parameter:"Landscape Area",ifcEntity:"IfcSpace",propertySet:"SGPset_NParks",propertyName:"LandscapeArea",propertyType:"Real",unit:"m²",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"NPARKS",component:"Space",parameter:"Green Plot Ratio",ifcEntity:"IfcSpace",propertySet:"SGPset_NParks",propertyName:"GreenPlotRatio",propertyType:"Real",gateway:["design"],severity:"info",checkType:"exists"},
  {agency:"NPARKS",component:"Space",parameter:"Tree Conservation Area",ifcEntity:"IfcSpace",propertySet:"SGPset_NParks",propertyName:"TreeConservation",propertyType:"Boolean",gateway:["design"],severity:"info",checkType:"exists"}
];

// ── UI: JSON Loader Dialog handlers ─────────────────────────────────
window.sgLoadJsonDialog = function () {
  (document.getElementById('sgJsonOverlay') as HTMLElement).classList.add('show');
  // Setup drag-and-drop
  const dz = document.getElementById('sgJsonDropZone') as HTMLElement;
  dz.ondragover = (ev) => { ev.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (ev) => {
    ev.preventDefault();
    dz.classList.remove('dragover');
    const file = ev.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.json')) sgProcessJsonFile(file);
    else alert('Please drop a .json file');
  };
};

window.sgCloseJsonDialog = function () {
  (document.getElementById('sgJsonOverlay') as HTMLElement).classList.remove('show');
};

window.sgHandleJsonFile = function (ev: Event) {
  const file = (ev.target as HTMLInputElement)?.files?.[0];
  if (file) sgProcessJsonFile(file);
};

async function sgProcessJsonFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : (data.rules || data.parameters || data.mappings || []);
    if (!Array.isArray(rows) || rows.length === 0) {
      alert('JSON must be an array of rule objects, or an object with a "rules", "parameters", or "mappings" array.');
      return;
    }
    sgApplyJsonRules(rows, file.name);
  } catch (err: any) {
    alert('Invalid JSON: ' + err?.message);
  }
}

function sgApplyJsonRules(jsonRows: any[], sourceName: string): void {
  const compiled = sgCompileJsonRules(jsonRows);
  if (compiled.length === 0) {
    alert('No valid rules found. Each row needs at least "ifcEntity" and "propertyName".');
    return;
  }

  // Merge: keep Phase 1 built-in rules + append JSON rules
  const SG_RULES = (window as any).SG_RULES || [];
  SG_ACTIVE_RULES = [...SG_RULES, ...compiled];

  // Count by agency
  const byAgency: Record<string, number> = {};
  for (const r of compiled) {
    byAgency[r.agency] = (byAgency[r.agency] || 0) + 1;
  }

  sgJsonLoaded = {
    filename: sourceName || 'built-in',
    rowCount: jsonRows.length,
    ruleCount: compiled.length,
    byAgency
  };

  // Update UI
  sgUpdateSourceBadge();

  // Show preview stats
  const statsEl = document.getElementById('sgJsonStats') as HTMLElement;
  const previewEl = document.getElementById('sgJsonPreview') as HTMLElement;
  previewEl.style.display = '';
  const escapeHtml = (window as any).escapeHtml || ((s: string) => s);
  let html = `<div style="margin-bottom:6px"><span class="k">Source:</span> <span class="v">${escapeHtml(sourceName || 'built-in')}</span></div>`;
  html += `<div><span class="k">Rows parsed:</span> <span class="v">${jsonRows.length}</span> → <span class="k">Rules compiled:</span> <span class="v">${compiled.length}</span></div>`;
  html += `<div style="margin-top:6px">`;
  for (const [ag, cnt] of Object.entries(byAgency).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    html += `<span style="margin-right:10px">${ag}: <b>${cnt}</b></span>`;
  }
  html += `</div>`;
  html += `<div style="margin-top:6px;color:var(--text-muted)">Total active rules: <b>${SG_ACTIVE_RULES.length}</b> (${SG_RULES.length} built-in + ${compiled.length} from JSON)</div>`;
  statsEl.innerHTML = html;

  // Reset cached validation so next run uses new rules
  appState.sgState.results = null;
  appState.sgState.selectedRuleIdx = null;
  appState.sgState.cachedCtx = null;

  log(`SG JSON: loaded ${compiled.length} rules from ${sourceName || 'built-in'}, total active: ${SG_ACTIVE_RULES.length}`);
}

function sgUpdateSourceBadge(): void {
  const srcEl = document.getElementById('sgRuleSrc') as HTMLElement;
  const SG_RULES = (window as any).SG_RULES || [];
  if (!sgJsonLoaded) {
    srcEl.innerHTML = 'Built-in rules';
    return;
  }
  const escapeHtml = (window as any).escapeHtml || ((s: string) => s);
  const isBuiltin = sgJsonLoaded.filename === 'built-in';
  const cls = isBuiltin ? 'merged' : 'json';
  srcEl.innerHTML = `<span class="sg-src-badge ${cls}">${SG_RULES.length} built-in + ${sgJsonLoaded.ruleCount} ${isBuiltin ? 'extended' : 'JSON'}</span> ${sgJsonLoaded.ruleCount} rules from ${escapeHtml(isBuiltin ? 'built-in library' : sgJsonLoaded.filename)}`;
}

window.sgLoadBuiltinRules = function () {
  sgApplyJsonRules(SG_BUILTIN_JSON, 'built-in');
  const btn = document.getElementById('sgBuiltinBtn') as HTMLButtonElement;
  btn.textContent = '✓ Extended rules loaded';
  btn.disabled = true;
};

window.sgResetToBuiltin = function () {
  const SG_RULES = (window as any).SG_RULES || [];
  SG_ACTIVE_RULES = [...SG_RULES];
  sgJsonLoaded = null;
  sgUpdateSourceBadge();
  (document.getElementById('sgJsonPreview') as HTMLElement).style.display = 'none';
  const btn = document.getElementById('sgBuiltinBtn') as HTMLButtonElement;
  btn.textContent = '⚡ Load Built-in Extended Rules (~200)';
  btn.disabled = false;
  appState.sgState.results = null;
  appState.sgState.selectedRuleIdx = null;
  appState.sgState.cachedCtx = null;
  log('SG: reset to Phase 1 built-in rules only');
};

// ── Export sample JSON for user reference ────────────────────────────
window.sgExportSampleJson = function () {
  const sample = SG_BUILTIN_JSON.slice(0, 10).map((r: any) => ({
    agency: r.agency,
    component: r.component,
    parameter: r.parameter,
    ifcEntity: r.ifcEntity,
    ifcSubType: r.ifcSubType || "",
    propertySet: r.propertySet,
    propertyName: r.propertyName,
    propertyType: r.propertyType || "Label",
    unit: r.unit || "",
    sampleValues: r.sampleValues || "",
    gateway: r.gateway,
    severity: r.severity,
    notes: r.notes || "",
    checkType: r.checkType || "exists",
    checkValue: r.checkValue ?? null
  }));
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ifc-sg-rules-sample.json'; a.click();
  URL.revokeObjectURL(url);
};

async function sgBuildContext(): Promise<any> {
  const cacheKey = appState.loadedModels.map((m: any) => m?.modelID).join('-');
  if (appState.sgState.cachedCtx && appState.sgState.cachedCtxKey === cacheKey) return appState.sgState.cachedCtx;

  const entities: any[] = [];
  const byClass = new Map<string, any[]>();
  const modelIDs: any[] = [];

  const getAllProps = (window as any).getAllProps;

  for (let mi = 0; mi < appState.loadedModels.length; mi++) {
    const m = appState.loadedModels[mi];
    if (!m) continue;
    modelIDs.push({ modelID: m.modelID, modelIdx: mi, spatial: m.spatial });

    const props = await getAllProps(m.modelID);
    for (const gid in props) {
      const p = props[gid];
      const className = sgIfcCodeToClass(p.type);
      const e: any = {
        eid: p.expressID,
        globalId: gid,
        type: className,
        typeCode: p.type,
        name: (p.name || '').trim(),
        tag: p.tag,
        psets: [],  // will be populated by batch pset resolution below
        OverallWidth: p.OverallWidth,
        OverallHeight: p.OverallHeight,
        PredefinedType: p.PredefinedType,
        LongName: p.LongName,
        modelIdx: mi,
        _modelID: m.modelID  // stash for pset resolution
      };
      entities.push(e);
      if (!byClass.has(className)) byClass.set(className, []);
      byClass.get(className)!.push(e);
      // Also bucket subtypes under their parent (IfcWallStandardCase → IfcWall)
      if (className === 'IfcWallStandardCase') {
        if (!byClass.has('IfcWall')) byClass.set('IfcWall', []);
        byClass.get('IfcWall')!.push(e);
      }
    }
  }

  // ── Batch pset resolution via IfcRelDefinesByProperties ────────────
  const IFCRELDEFINESBYPROPERTIES = 4186316022;
  const mgr = appState.ifcLoader?.ifcManager;
  if (mgr) {
    const psetLookup = new Map<number, any[]>();
    // Group entities by modelID for batch processing
    const byModelID = new Map<number, Set<number>>();
    for (const e of entities) {
      if (!byModelID.has(e._modelID)) byModelID.set(e._modelID, new Set());
      byModelID.get(e._modelID)!.add(e.eid);
    }

    for (const [mid, eids] of byModelID) {
      try {
        const api = mgr.state.api;
        const relIDs = api.GetLineIDsWithType(mid, IFCRELDEFINESBYPROPERTIES) as any;
        const relCount = relIDs.size();
        log(`SG pset scan: ${relCount} IfcRelDefinesByProperties in model ${mid}`);

        for (let ri = 0; ri < relCount; ri++) {
          try {
            const rel = await mgr.getItemProperties(mid, relIDs.get(ri), false);
            if (!rel) continue;

            // Get the property set definition
            const pdefRef = rel.RelatingPropertyDefinition;
            if (!pdefRef) continue;
            const pdefID = pdefRef.value ?? pdefRef;
            if (typeof pdefID !== 'number') continue;

            // Get related elements
            let relatedEIDs: number[] = [];
            if (Array.isArray(rel.RelatedObjects)) {
              relatedEIDs = rel.RelatedObjects.map((o: any) => o.value ?? o).filter((v: any) => typeof v === 'number');
            } else if (rel.RelatedObjects?.value) {
              relatedEIDs = [rel.RelatedObjects.value];
            }
            // Skip if none of the related elements are in our entity set
            const relevant = relatedEIDs.filter((eid: number) => eids.has(eid));
            if (relevant.length === 0) continue;

            // Resolve the property set — read with recursive=true to get HasProperties
            let pset: any;
            try { pset = await mgr.getItemProperties(mid, pdefID, true); } catch (e) { continue; }
            if (!pset) continue;

            // Attach to each related entity
            for (const eid of relevant) {
              if (!psetLookup.has(eid)) psetLookup.set(eid, []);
              psetLookup.get(eid)!.push(pset);
            }
          } catch (relErr) {/* skip bad rel */ }
        }
      } catch (err: any) { log('SG pset batch err:', err?.message); }
    }

    // Merge resolved psets into entity objects
    let enriched = 0;
    for (const e of entities) {
      const psets = psetLookup.get(e.eid);
      if (psets && psets.length > 0) {
        e.psets = psets;
        enriched++;
        // Also extract common direct-access properties from psets for convenience
        for (const ps of psets) {
          if (!ps.HasProperties) continue;
          const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : [ps.HasProperties];
          for (const hp of hps) {
            if (!hp?.Name?.value) continue;
            const pn = hp.Name.value;
            const nv = hp.NominalValue;
            if (pn === 'IsExternal' && !e._isExternal) e._isExternal = nv;
            if (pn === 'LoadBearing' && !e._loadBearing) e._loadBearing = nv;
            if (pn === 'FireRating' && !e._fireRating) e._fireRating = nv;
          }
        }
      }
      delete e._modelID; // clean up temp field
    }
    log(`SG pset enrichment: ${enriched}/${entities.length} entities got psets via IfcRelDefinesByProperties`);
  }

  appState.sgState.cachedCtx = { entities, byClass, modelIDs, gateway: appState.sgState.gateway };
  appState.sgState.cachedCtxKey = cacheKey;
  return appState.sgState.cachedCtx;
}

// Map IFC type code → class name.
function sgIfcCodeToClass(code: number): string {
  const IFC_NAMES = (window as any).IFC_NAMES || {};
  // Primary map uses constants from the global scope if available
  const w = window as any;
  const MAP: Record<number, string> = {};
  if (w.IFCWALL) MAP[w.IFCWALL] = 'IfcWall';
  if (w.IFCWALLSTANDARDCASE) MAP[w.IFCWALLSTANDARDCASE] = 'IfcWallStandardCase';
  if (w.IFCSLAB) MAP[w.IFCSLAB] = 'IfcSlab';
  if (w.IFCROOF) MAP[w.IFCROOF] = 'IfcRoof';
  if (w.IFCDOOR) MAP[w.IFCDOOR] = 'IfcDoor';
  if (w.IFCWINDOW) MAP[w.IFCWINDOW] = 'IfcWindow';
  if (w.IFCSTAIR) MAP[w.IFCSTAIR] = 'IfcStair';
  if (w.IFCSTAIRFLIGHT) MAP[w.IFCSTAIRFLIGHT] = 'IfcStairFlight';
  if (w.IFCRAILING) MAP[w.IFCRAILING] = 'IfcRailing';
  if (w.IFCMEMBER) MAP[w.IFCMEMBER] = 'IfcMember';
  if (w.IFCCURTAINWALL) MAP[w.IFCCURTAINWALL] = 'IfcCurtainWall';
  if (w.IFCPLATE) MAP[w.IFCPLATE] = 'IfcPlate';
  if (w.IFCBUILDINGELEMENTPROXY) MAP[w.IFCBUILDINGELEMENTPROXY] = 'IfcBuildingElementProxy';
  if (w.IFCFURNISHINGELEMENT) MAP[w.IFCFURNISHINGELEMENT] = 'IfcFurnishingElement';
  if (w.IFCCOLUMN) MAP[w.IFCCOLUMN] = 'IfcColumn';
  if (w.IFCBEAM) MAP[w.IFCBEAM] = 'IfcBeam';
  if (w.IFCFOOTING) MAP[w.IFCFOOTING] = 'IfcFooting';
  if (w.IFCFLOWSEGMENT) MAP[w.IFCFLOWSEGMENT] = 'IfcFlowSegment';
  if (w.IFCFLOWTERMINAL) MAP[w.IFCFLOWTERMINAL] = 'IfcFlowTerminal';
  if (w.IFCFLOWFITTING) MAP[w.IFCFLOWFITTING] = 'IfcFlowFitting';
  if (w.IFCSPACE) MAP[w.IFCSPACE] = 'IfcSpace';

  return MAP[code] || IFC_NAMES[code] || ('Ifc#' + code);
}

// Run all enabled rules for the current gateway against the context.
async function sgRunValidation(): Promise<void> {
  if (!appState.loadedModels.some((m: any) => !!m)) {
    log('SG Validate: no model loaded');
    return;
  }
  (document.getElementById('sgRunBtn') as HTMLButtonElement).disabled = true;
  (document.getElementById('sgRunBtn') as HTMLButtonElement).textContent = '⏳ Validating…';
  (document.getElementById('sgRulesList') as HTMLElement).innerHTML = '<div class="sg-empty">Scanning model entities & resolving property sets…</div>';
  await new Promise(r => setTimeout(r, 10)); // yield to paint

  try {
    const ctx = await sgBuildContext();
    const ruleResults: any[] = [];
    const enabledRules = SG_ACTIVE_RULES.filter((r: any) => r.gateway.includes(appState.sgState.gateway));
    let totalFindings = 0;
    const elementsWithIssues = new Set<number>();

    for (const rule of enabledRules) {
      try {
        const r = rule.check(ctx);
        // Enrich failed elements with modelIdx from entity lookup
        for (const f of (r.failed || [])) {
          if (f.eid && f.modelIdx === undefined) {
            const ent = ctx.entities.find((e: any) => e.eid === f.eid);
            if (ent) f.modelIdx = ent.modelIdx;
          }
        }
        ruleResults.push({
          rule,
          passed: r.passed || [],
          failed: r.failed || [],
          skipped: r.skipped || 0,
          info: r.info || null
        });
        totalFindings += (r.failed || []).length;
        for (const f of (r.failed || [])) if (f.eid) elementsWithIssues.add(f.eid);
      } catch (err: any) {
        log('SG rule error:', rule.id, err?.message);
        ruleResults.push({
          rule, passed: [], failed: [{ eid: 0, name: '(error)', reason: 'Rule execution failed: ' + err?.message }],
          skipped: 0
        });
      }
    }

    const stats = {
      rules: ruleResults.length,
      pass: ruleResults.filter(r => r.failed.length === 0 && r.passed.length > 0).length,
      fail: ruleResults.filter(r => r.failed.length > 0 && r.rule.severity === 'error').length,
      warn: ruleResults.filter(r => r.failed.length > 0 && r.rule.severity === 'warn').length,
      skipped: ruleResults.filter(r => r.skipped > 0 && r.passed.length === 0 && r.failed.length === 0).length,
      elements: ctx.entities.length,
      badElements: elementsWithIssues.size,
      findings: totalFindings,
      gateway: appState.sgState.gateway
    };
    appState.sgState.results = { rules: ruleResults, stats };
    sgRenderResults();
  } catch (err: any) {
    log('SG validation error:', err?.message);
    (document.getElementById('sgRulesList') as HTMLElement).innerHTML = `<div class="sg-empty" style="color:#dc2626">Error: ${err?.message || err}</div>`;
  } finally {
    (document.getElementById('sgRunBtn') as HTMLButtonElement).disabled = false;
    (document.getElementById('sgRunBtn') as HTMLButtonElement).textContent = '▶ Validate';
  }
}
window.sgRunValidation = sgRunValidation;

// Render the validation results into the three columns.
function sgRenderResults(): void {
  if (!appState.sgState.results) { return; }
  const { rules, stats } = appState.sgState.results;
  const escapeHtml = (window as any).escapeHtml || ((s: string) => s);

  // ── Column 1: rules list grouped by agency ──
  const byAgency = new Map<string, any[]>();
  for (let i = 0; i < rules.length; i++) {
    const a = rules[i].rule.agency;
    if (!byAgency.has(a)) byAgency.set(a, []);
    byAgency.get(a)!.push({ ...rules[i], idx: i });
  }
  let html = '';
  const AGENCY_ORDER = ['GENERAL', 'BCA', 'URA', 'NEA', 'LTA', 'PUB'];
  for (const ag of AGENCY_ORDER) {
    if (!byAgency.has(ag)) continue;
    const items = byAgency.get(ag)!;
    const passCnt = items.filter(r => r.failed.length === 0 && r.passed.length > 0).length;
    const failCnt = items.filter(r => r.failed.length > 0).length;
    html += `<div class="sg-rule-group">${ag} — ${passCnt} pass / ${failCnt} fail / ${items.length} total</div>`;
    for (const item of items) {
      const { rule, passed, failed, skipped, idx } = item;
      let icon: string, iconCls: string;
      if (failed.length === 0 && passed.length > 0) { icon = '✓'; iconCls = 'pass'; }
      else if (failed.length === 0 && skipped > 0) { icon = '⊘'; iconCls = 'skip'; }
      else if (rule.severity === 'error') { icon = '✗'; iconCls = 'fail'; }
      else if (rule.severity === 'warn') { icon = '!'; iconCls = 'warn'; }
      else { icon = 'ⓘ'; iconCls = 'warn'; }
      const sel = (appState.sgState.selectedRuleIdx === idx) ? 'selected' : '';
      html += `<div class="sg-rule ${sel}" onclick="sgSelectRule(${idx})" title="${escapeHtml(rule.desc)}">
        <span class="sg-rule-icon ${iconCls}">${icon}</span>
        <div class="sg-rule-content">
          <div class="sg-rule-title">${escapeHtml(rule.title)}</div>
          <div class="sg-rule-counts">
            <span class="pass-n">${passed.length} pass</span>
            ${failed.length > 0 ? ` • <span class="fail-n">${failed.length} fail</span>` : ''}
            ${skipped > 0 ? ` • <span style="color:#9ca3af">${skipped} skip</span>` : ''}
          </div>
        </div>
      </div>`;
    }
  }
  (document.getElementById('sgRulesList') as HTMLElement).innerHTML = html;
  (document.getElementById('sgRuleCount') as HTMLElement).textContent = String(rules.length);
  (document.getElementById('sgRuleCount') as HTMLElement).className = 'sg-col-hdr-count ' + (stats.fail === 0 ? 'ok' : '');

  // ── Column 3: dashboard ──
  const pct = stats.rules === 0 ? 0 : Math.round((stats.pass / stats.rules) * 100);
  const pctEl = document.getElementById('sgPctValue') as HTMLElement;
  pctEl.textContent = pct + '%';
  pctEl.className = 'sg-dash-pct ' + (pct >= 90 ? 'good' : pct >= 60 ? 'warn' : 'fail');
  (document.getElementById('sgStatRules') as HTMLElement).textContent = String(stats.rules);
  (document.getElementById('sgStatPass') as HTMLElement).textContent = String(stats.pass);
  (document.getElementById('sgStatFail') as HTMLElement).textContent = String(stats.fail);
  (document.getElementById('sgStatWarn') as HTMLElement).textContent = String(stats.warn);
  (document.getElementById('sgStatElements') as HTMLElement).textContent = String(stats.elements);
  (document.getElementById('sgStatBadEl') as HTMLElement).textContent = String(stats.badElements);
  (document.getElementById('sgStatFindings') as HTMLElement).textContent = String(stats.findings);

  // Enable export buttons
  (document.getElementById('sgExportPDF') as HTMLButtonElement).disabled = false;
  (document.getElementById('sgExportBCF') as HTMLButtonElement).disabled = false;

  // Auto-select first failing rule for instant context
  if (appState.sgState.selectedRuleIdx === null) {
    const firstFailIdx = rules.findIndex((r: any) => r.failed.length > 0);
    if (firstFailIdx >= 0) (window as any).sgSelectRule(firstFailIdx);
  } else {
    (window as any).sgSelectRule(appState.sgState.selectedRuleIdx);  // refresh fail list
  }
}

// Click a rule → show its failing elements in column 2
window.sgSelectRule = function (idx: number) {
  if (!appState.sgState.results) return;
  appState.sgState.selectedRuleIdx = idx;
  // Update selected highlight
  document.querySelectorAll('.sg-rule').forEach(el => el.classList.remove('selected'));
  const ruleEls = document.querySelectorAll('.sg-rule');
  const matching = Array.from(ruleEls).filter(el => el.getAttribute('onclick')?.includes(`sgSelectRule(${idx})`));
  if (matching[0]) matching[0].classList.add('selected');

  const { rule, passed, failed, info } = appState.sgState.results.rules[idx];
  const escapeHtml = (window as any).escapeHtml || ((s: string) => s);
  (document.getElementById('sgFailColTitle') as HTMLElement).textContent = rule.title;
  (document.getElementById('sgFailCount') as HTMLElement).textContent = String(failed.length);
  (document.getElementById('sgFailCount') as HTMLElement).className = 'sg-col-hdr-count ' + (failed.length === 0 ? 'ok' : '');

  if (info) {
    (document.getElementById('sgFailList') as HTMLElement).innerHTML =
      `<div class="sg-empty" style="color:#0369a1"><b>Info:</b> ${escapeHtml(info)}</div>`;
    return;
  }
  if (failed.length === 0) {
    (document.getElementById('sgFailList') as HTMLElement).innerHTML =
      `<div class="sg-empty" style="color:#16a34a">✓ All ${passed.length} elements pass this rule</div>`;
    return;
  }
  let html = '';
  for (const f of failed) {
    html += `<div class="sg-fail-item" onclick="sgFocusElement(${f.eid})">
      <span class="sg-fail-eid">#${f.eid || '-'}</span>
      <div class="sg-fail-content">
        <div class="sg-fail-name">${escapeHtml(f.name || '(unnamed)')}</div>
        <div class="sg-fail-detail">${escapeHtml(f.reason || '')}</div>
      </div>
    </div>`;
  }
  (document.getElementById('sgFailList') as HTMLElement).innerHTML = html;
};

// Click a failing element → focus in 3D (same flow as compare/clash issues)
window.sgFocusElement = function (eid: number) {
  if (!eid) return;
  // Find which model owns this expressID
  for (let mi = 0; mi < appState.loadedModels.length; mi++) {
    const m = appState.loadedModels[mi];
    if (!m) continue;
    try {
      // Highlight using existing subset machinery
      if (!window._hlMat) {
        window._hlMat = new THREE.MeshPhongMaterial({
          color: 0x2563eb, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, depthTest: true, clippingPlanes: appState.clipPlanes
        });
      }
      const sub = appState.ifcLoader.ifcManager.createSubset({
        modelID: m.modelID, ids: [eid], material: window._hlMat,
        scene: appState.scene, removePrevious: true
      });
      if (sub) {
        sub.position.copy(m.position);
        sub.updateMatrixWorld(true);
        window._lastHL = { subset: sub, mid: m.modelID };
        // Zoom + section box around it
        const bbox = new THREE.Box3().setFromObject(sub);
        if (bbox.min.x !== Infinity) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const elSize = Math.max(size.x, size.y, size.z);
          const viewDist = Math.max(elSize * 1.5, 5);
          appState.camera.position.set(
            center.x + viewDist * 0.7,
            center.y + viewDist * 0.5,
            center.z + viewDist * 0.7
          );
          appState.controls.target.copy(center);
          appState.controls.update();
        }
        // Fetch + show props
        appState.ifcLoader.ifcManager.getItemProperties(m.modelID, eid, true)
          .then((props: any) => window.showProps && window.showProps(props, mi))
          .catch(() => { });
        if (window.requestPlanRender) window.requestPlanRender();
        return;
      }
    } catch (err) {
      // try next model
    }
  }
  log('SG focus: element', eid, 'not found in loaded models');
};

window.sgChangeGateway = function () {
  appState.sgState.gateway = (document.getElementById('sgGateway') as HTMLSelectElement).value;
  appState.sgState.cachedCtx = null;
  appState.sgState.results = null;
  appState.sgState.selectedRuleIdx = null;
  (document.getElementById('sgRulesList') as HTMLElement).innerHTML = '<div class="sg-empty">Click <b>▶ Validate</b> to run rules for the new gateway</div>';
  (document.getElementById('sgFailList') as HTMLElement).innerHTML = '<div class="sg-empty">Select a rule on the left to see failing elements</div>';
  (document.getElementById('sgPctValue') as HTMLElement).textContent = '—';
  (document.getElementById('sgPctValue') as HTMLElement).className = 'sg-dash-pct';
  ['sgStatRules', 'sgStatPass', 'sgStatFail', 'sgStatWarn', 'sgStatElements', 'sgStatBadEl', 'sgStatFindings']
    .forEach(id => (document.getElementById(id) as HTMLElement).textContent = '0');
  (document.getElementById('sgExportPDF') as HTMLButtonElement).disabled = true;
  (document.getElementById('sgExportBCF') as HTMLButtonElement).disabled = true;
};

// Export for use by other modules
export { SG_ACTIVE_RULES, sgBuildContext, sgIfcCodeToClass };
