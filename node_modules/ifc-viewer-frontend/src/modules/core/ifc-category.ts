import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { appState } from '../../state/index.js';

// ── IFC class → Revit Category friendly name ──────────────────────────
// Sourced from the Autodesk IFC-for-Revit mapping table
// (importIFCClassMapping.txt / ICE_IFC_Mapping.txt). This is what BIM
// engineers actually recognize. When null/missing, fall back to raw IFC
// class name. Used by Colorize Auto mode for Category dropdown.
const IFC_TO_REVIT_CAT: Record<string, string> = {
  'IfcAirTerminal':'Air Terminals',
  'IfcAirTerminalType':'Air Terminals',
  'IfcAirTerminalBox':'Air Terminals',
  'IfcAlarm':'Fire Alarm Devices',
  'IfcBeam':'Structural Framing',
  'IfcBoiler':'Mechanical Equipment',
  'IfcBuildingElementPart':'Parts',
  'IfcBuildingElementProxy':'Generic Models',
  'IfcCableCarrierFitting':'Cable Tray Fittings',
  'IfcCableCarrierSegment':'Cable Trays',
  'IfcCableSegment':'Wires',
  'IfcChiller':'Mechanical Equipment',
  'IfcCoil':'Mechanical Equipment',
  'IfcColumn':'Columns',
  'IfcCompressor':'Mechanical Equipment',
  'IfcCondenser':'Mechanical Equipment',
  'IfcController':'Electrical Equipment',
  'IfcCooledBeam':'Mechanical Equipment',
  'IfcCoolingTower':'Mechanical Equipment',
  'IfcCovering':'Ceilings',
  'IfcCurtainWall':'Curtain Systems',
  'IfcDamper':'Mechanical Equipment',
  'IfcDiscreteAccessory':'Specialty Equipment',
  'IfcDistributionChamberElement':'Mechanical Equipment',
  'IfcDistributionControlElement':'Electrical Equipment',
  'IfcDistributionElement':'Generic Models',
  'IfcDistributionFlowElement':'Mechanical Equipment',
  'IfcDistributionPort':'Generic Models',
  'IfcDoor':'Doors',
  'IfcDuctFitting':'Duct Fittings',
  'IfcDuctSegment':'Ducts',
  'IfcDuctSilencer':'Duct Accessories',
  'IfcElectricAppliance':'Specialty Equipment',
  'IfcElectricDistributionBoard':'Electrical Equipment',
  'IfcElectricFlowStorageDevice':'Electrical Equipment',
  'IfcElectricGenerator':'Electrical Equipment',
  'IfcElectricMotor':'Electrical Equipment',
  'IfcElectricTimeControl':'Electrical Equipment',
  'IfcEnergyConversionDevice':'Mechanical Equipment',
  'IfcEvaporativeCooler':'Mechanical Equipment',
  'IfcEvaporator':'Mechanical Equipment',
  'IfcFan':'Mechanical Equipment',
  'IfcFastener':'Parts',
  'IfcFilter':'Mechanical Equipment',
  'IfcFireSuppressionTerminal':'Sprinklers',
  'IfcFlowController':'Pipe Accessories',
  'IfcFlowFitting':'Pipe Fittings',
  'IfcFlowInstrument':'Electrical Equipment',
  'IfcFlowMeter':'Pipe Accessories',
  'IfcFlowMovingDevice':'Mechanical Equipment',
  'IfcFlowSegment':'Pipes',
  'IfcFlowStorageDevice':'Mechanical Equipment',
  'IfcFlowTerminal':'Plumbing Fixtures',
  'IfcFlowTreatmentDevice':'Mechanical Equipment',
  'IfcFooting':'Structural Foundations',
  'IfcFurnishingElement':'Furniture',
  'IfcFurniture':'Furniture',
  'IfcGeographicElement':'Site',
  'IfcHeatExchanger':'Mechanical Equipment',
  'IfcHumidifier':'Mechanical Equipment',
  'IfcJunctionBox':'Electrical Fixtures',
  'IfcLamp':'Lighting Fixtures',
  'IfcLightFixture':'Lighting Fixtures',
  'IfcMechanicalFastener':'Generic Models',
  'IfcMedicalDevice':'Specialty Equipment',
  'IfcMember':'Structural Framing',
  'IfcOpening':'Generic Models',
  'IfcOpeningElement':'Generic Models',
  'IfcOutlet':'Electrical Fixtures',
  'IfcPile':'Structural Columns',
  'IfcPipeFitting':'Pipe Fittings',
  'IfcPipeSegment':'Pipes',
  'IfcPlate':'Generic Models',
  'IfcProtectiveDevice':'Electrical Equipment',
  'IfcProtectiveDeviceTrippingUnit':'Electrical Equipment',
  'IfcPump':'Mechanical Equipment',
  'IfcRailing':'Railings',
  'IfcRamp':'Ramps',
  'IfcRampFlight':'Ramps',
  'IfcReinforcingBar':'Structural Rebar',
  'IfcReinforcingMesh':'Structural Fabric Reinforcement',
  'IfcRoof':'Roofs',
  'IfcSanitaryTerminal':'Plumbing Fixtures',
  'IfcSensor':'Electrical Fixtures',
  'IfcShadingDevice':'Generic Models',
  'IfcSite':'Site',
  'IfcSlab':'Floors',
  'IfcSpace':'Spaces',
  'IfcSpaceHeater':'Mechanical Equipment',
  'IfcStackTerminal':'Plumbing Fixtures',
  'IfcStair':'Stairs',
  'IfcStairFlight':'Stairs',
  'IfcSwitchingDevice':'Electrical Fixtures',
  'IfcSystemFurnitureElement':'Casework',
  'IfcTank':'Mechanical Equipment',
  'IfcTransformer':'Electrical Equipment',
  'IfcTransportElement':'Entourage',
  'IfcTubeBundle':'Mechanical Equipment',
  'IfcUnitaryEquipment':'Mechanical Equipment',
  'IfcValve':'Pipe Accessories',
  'IfcWall':'Walls',
  'IfcWallStandardCase':'Walls',
  'IfcWasteTerminal':'Plumbing Fixtures',
  'IfcWindow':'Windows',
  'IfcBuilding':'(Building)',
  'IfcBuildingStorey':'(Level)',
  'IfcProject':'(Project)',
};

// Resolve a raw IFC class name (e.g. 'IfcDoor') into the Revit Category
// equivalent ('Doors'). Returns the input if no mapping exists, and strips
// unknown 'IFC_' numeric prefixes that slipped through. Pure function.
export function ifcClassToRevitCategory(cls: string): string {
  if(!cls)return cls||'Unknown';
  // Normalize: sometimes we get an ALL-CAPS IFCDOOR from numeric lookups
  // — try title-case variant too
  return IFC_TO_REVIT_CAT[cls] || IFC_TO_REVIT_CAT[cls.charAt(0)+cls.slice(1).toLowerCase()] || cls;
}

export function log(...a: any[]): void {console.log('[IFC]',...a)}

// ══ Three.js ══
export function initThree(): void {
  // Renderer attaches to #vpCanvas (the flex child inside vpArea), NOT vpArea
  // itself. vpArea now also contains the resizable clash bottom panel; sizing
  // the canvas to vpCanvas means the 3D view automatically reflows when the
  // bottom panel grows/shrinks via its row-resize handle.
  const c = document.getElementById('vpCanvas')!;
  appState.scene = new THREE.Scene();
  appState.scene.background = new THREE.Color(0xe8ecf2);

  // 6 clipping planes for section box — initialized to not clip anything
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(-1,0,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(1,0,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,-1,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,1,0), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,0,-1), 99999));
  appState.clipPlanes.push(new THREE.Plane(new THREE.Vector3(0,0,1), 99999));

  appState.camera=new THREE.PerspectiveCamera(50,c.clientWidth/c.clientHeight,0.01,100000);
  appState.camera.position.set(30,25,30);

  appState.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  appState.renderer.setSize(c.clientWidth,c.clientHeight);
  appState.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  appState.renderer.outputColorSpace=THREE.SRGBColorSpace;
  appState.renderer.localClippingEnabled=true;
  c.appendChild(appState.renderer.domElement);

  appState.controls=new OrbitControls(appState.camera,appState.renderer.domElement);
  // Smooth Revit-like navigation
  appState.controls.enableDamping=true;
  appState.controls.dampingFactor=0.06;        // Smooth deceleration (lower = more glide)
  appState.controls.rotateSpeed=0.7;           // Orbit speed
  appState.controls.panSpeed=0.8;              // Pan speed
  // NOTE: Built-in wheel zoom is DISABLED — we implement our own in the
  // wheel event handler below. OrbitControls' zoomToCursor + minDistance
  // together create the "zoom stops after a few scrolls" bug because the
  // camera-to-target distance hits minDistance. Our custom handler raycasts
  // the cursor into the scene and moves BOTH camera and target toward the
  // hit point, so user can always zoom further.
  appState.controls.enableZoom=false;
  appState.controls.maxDistance=50000;
  appState.controls.minDistance=0.001;
  appState.controls.enablePan=true;
  appState.controls.screenSpacePanning=true;   // Pan parallel to screen (like Revit)
  // Mouse buttons: Left=Orbit, Middle=Pan, Right=context menu (handled separately)
  appState.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:null as any};
  appState.controls.enablePan=true;
  // Touch: one finger=orbit, two=pan/zoom
  appState.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};

  // NOTE: initThree() continues in 03-viewer-core.ts (wheel zoom, ambient light, etc.)
}
