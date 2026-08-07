// Generates a small synthetic IFC4 file so the spike can be smoke-tested
// without a real project model. It is NOT a substitute for running the spike
// on your own files — it exists only to prove the harness works end to end.
//
// Every element carries the fields Compare diffs on (Name, Description,
// ObjectType, Tag, PredefinedType) plus real extruded geometry, and the file
// has units + TrueNorth + a full spatial structure, so all four checks have
// something to measure.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WALLS = Number(process.argv[2] || 25);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'sample.ifc');

// IFC GlobalIds are 22 chars from this base-64 variant.
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_$abcdefghijklmnopqrstuvwxyz';
const guid = (n) => {
  let s = '';
  for (let i = 0; i < 22; i++) s += B64[(n * 31 + i * 7) % 64];
  return s;
};

const L = [];
let id = 0;
const add = (body) => { L.push(`#${++id}=${body};`); return id; };

const person = add(`IFCPERSON($,$,'spike',$,$,$,$,$)`);
const org = add(`IFCORGANIZATION($,'Spike',$,$,$)`);
const pao = add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
const app = add(`IFCAPPLICATION(#${org},'1','Spike Generator','SPIKE')`);
const owner = add(`IFCOWNERHISTORY(#${pao},#${app},$,.ADDED.,$,$,$,0)`);

const origin = add(`IFCCARTESIANPOINT((0.,0.,0.))`);
const axisPlacement = add(`IFCAXIS2PLACEMENT3D(#${origin},$,$)`);
// TrueNorth deliberately rotated so check 3 has a non-default value to find.
const trueNorth = add(`IFCDIRECTION((0.258819,0.965926))`);
const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axisPlacement},#${trueNorth})`);

const lenUnit = add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
const areaUnit = add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
const volUnit = add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
const units = add(`IFCUNITASSIGNMENT((#${lenUnit},#${areaUnit},#${volUnit}))`);

const project = add(`IFCPROJECT('${guid(1)}',#${owner},'Spike Project','Synthetic fixture',$,$,$,(#${ctx}),#${units})`);
const worldPlacement = add(`IFCLOCALPLACEMENT($,#${axisPlacement})`);
const site = add(`IFCSITE('${guid(2)}',#${owner},'Site',$,$,#${worldPlacement},$,$,.ELEMENT.,$,$,$,$,$)`);
const building = add(`IFCBUILDING('${guid(3)}',#${owner},'Building',$,$,#${worldPlacement},$,$,.ELEMENT.,$,$,$)`);
const storey = add(`IFCBUILDINGSTOREY('${guid(4)}',#${owner},'Level 1',$,$,#${worldPlacement},$,$,.ELEMENT.,0.)`);

// Shared profile + extrusion direction for every wall (mirrors how a real
// exporter reuses geometry — and is exactly what fragments instances).
const profileOrigin = add(`IFCCARTESIANPOINT((0.,0.))`);
const profilePlacement = add(`IFCAXIS2PLACEMENT2D(#${profileOrigin},$)`);
const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,'WallProfile',#${profilePlacement},1000.,200.)`);
const extrudeDir = add(`IFCDIRECTION((0.,0.,1.))`);

const wallIds = [];
const materials = [];
for (let i = 0; i < WALLS; i++) {
  const pt = add(`IFCCARTESIANPOINT((${(i * 1200).toFixed(1)},0.,0.))`);
  const place3d = add(`IFCAXIS2PLACEMENT3D(#${pt},$,$)`);
  const local = add(`IFCLOCALPLACEMENT(#${worldPlacement},#${place3d})`);
  const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${axisPlacement},#${extrudeDir},${(2400 + i * 10).toFixed(1)})`);
  const shape = add(`IFCSHAPEREPRESENTATION(#${ctx},'Body','SweptSolid',(#${solid}))`);
  const prodShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`);
  const wall = add(
    `IFCWALL('${guid(100 + i)}',#${owner},'Wall ${i + 1}','Synthetic wall ${i + 1}','WallType-${i % 3}',` +
    `#${local},#${prodShape},'TAG-${1000 + i}',.SOLIDWALL.)`,
  );
  wallIds.push(wall);

  // Material layer set — check 3 looks for these.
  const mat = add(`IFCMATERIAL('Concrete ${i % 3}',$,$)`);
  const layer = add(`IFCMATERIALLAYER(#${mat},200.,$,'Core',$,$,$)`);
  const layerSet = add(`IFCMATERIALLAYERSET((#${layer}),'Wall Layers',$)`);
  materials.push(add(`IFCRELASSOCIATESMATERIAL('${guid(500 + i)}',#${owner},$,$,(#${wall}),#${layerSet})`));
}

add(`IFCRELAGGREGATES('${guid(10)}',#${owner},$,$,#${project},(#${site}))`);
add(`IFCRELAGGREGATES('${guid(11)}',#${owner},$,$,#${site},(#${building}))`);
add(`IFCRELAGGREGATES('${guid(12)}',#${owner},$,$,#${building},(#${storey}))`);
add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(13)}',#${owner},$,$,(${wallIds.map(w => `#${w}`).join(',')}),#${storey})`);

const ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('sample.ifc','2026-01-01T00:00:00',(''),(''),'Spike Generator','Spike Generator','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${L.join('\n')}
ENDSEC;
END-ISO-10303-21;
`;

writeFileSync(out, ifc, 'utf8');
console.log(`[make-sample-ifc] wrote ${out} — ${WALLS} walls, ${id} lines, ${(ifc.length / 1024).toFixed(1)} KB`);
