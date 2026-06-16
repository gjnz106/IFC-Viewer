import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three';
import { IFCSPACE, IFCOPENINGELEMENT, IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT } from 'web-ifc';

let scene, camera, renderer, controls, ifcLoader;
let files=[null,null], loadedModels=[null,null], compareResult=null, activeFilter='all';
// Federation: slots 0,1 = Compare A/B; slots 2+ = federation discipline files.
// loadedModels is a sparse array — indices can be null if file was removed.
const FED_COLORS = ['#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#84cc16','#f97316'];
const FED_LABELS = ['C','D','E','F','G','H','I'];
let fedNextSlot = 2; // next slot index for federation files
let ctxTarget=null; // Right-click context menu target
let activeCategories=new Set(); // empty = show all
let modelBounds={min:new THREE.Vector3(),max:new THREE.Vector3()};
let sharedCenterOffset=null; // Shared center offset so both models align to same coord system
let clipPlanes=[], sectionActive=false;

const IFC_NAMES={};
IFC_NAMES[IFCWALL]='IfcWall';IFC_NAMES[IFCWALLSTANDARDCASE]='IfcWallStandardCase';IFC_NAMES[IFCSLAB]='IfcSlab';IFC_NAMES[IFCCOLUMN]='IfcColumn';IFC_NAMES[IFCBEAM]='IfcBeam';IFC_NAMES[IFCDOOR]='IfcDoor';IFC_NAMES[IFCWINDOW]='IfcWindow';IFC_NAMES[IFCROOF]='IfcRoof';IFC_NAMES[IFCSTAIR]='IfcStair';IFC_NAMES[IFCSTAIRFLIGHT]='IfcStairFlight';IFC_NAMES[IFCRAILING]='IfcRailing';IFC_NAMES[IFCPLATE]='IfcPlate';IFC_NAMES[IFCMEMBER]='IfcMember';IFC_NAMES[IFCCURTAINWALL]='IfcCurtainWall';IFC_NAMES[IFCFOOTING]='IfcFooting';IFC_NAMES[IFCBUILDINGELEMENTPROXY]='IfcBuildingElementProxy';IFC_NAMES[IFCFURNISHINGELEMENT]='IfcFurnishingElement';IFC_NAMES[IFCFLOWSEGMENT]='IfcFlowSegment';IFC_NAMES[IFCFLOWTERMINAL]='IfcFlowTerminal';IFC_NAMES[IFCFLOWFITTING]='IfcFlowFitting';IFC_NAMES[IFCSITE]='IfcSite';IFC_NAMES[IFCBUILDING]='IfcBuilding';IFC_NAMES[IFCBUILDINGSTOREY]='IfcBuildingStorey';IFC_NAMES[IFCPROJECT]='IfcProject';IFC_NAMES[IFCSPACE]='IfcSpace';

// ── Numeric IFC type codes (for entities found via Method 2 full-scan) ──
// These codes come from web-ifc's internal type registry. Without these,
// the Colorize legend shows raw hex-like numbers ("IFC_3612865200"). With
// them, it shows the canonical IFC class name.
IFC_NAMES[3612865200]='IfcPipeSegment';
IFC_NAMES[310824031]='IfcPipeFitting';
IFC_NAMES[3518393246]='IfcDuctSegment';
IFC_NAMES[342316401]='IfcDuctFitting';
IFC_NAMES[1360408905]='IfcDuctSilencer';
IFC_NAMES[4207607924]='IfcValve';
IFC_NAMES[1634111441]='IfcElectricAppliance';
IFC_NAMES[264262732]='IfcElectricGenerator';
IFC_NAMES[3310460725]='IfcElectricMotor';
IFC_NAMES[402227799]='IfcElectricDistributionBoard';
IFC_NAMES[1904799276]='IfcElectricFlowStorageDevice';
IFC_NAMES[862014818]='IfcElectricTimeControl';
IFC_NAMES[76236018]='IfcLamp';
IFC_NAMES[629592764]='IfcLightFixture';
IFC_NAMES[707683696]='IfcOutlet';
IFC_NAMES[90941305]='IfcPump';
IFC_NAMES[819412036]='IfcFilter';
IFC_NAMES[1426591983]='IfcFireSuppressionTerminal';
IFC_NAMES[4074379575]='IfcHumidifier';
IFC_NAMES[2176052936]='IfcJunctionBox';
IFC_NAMES[2474470126]='IfcSanitaryTerminal';
IFC_NAMES[1973544240]='IfcSensor';
IFC_NAMES[3825984169]='IfcTransformer';
IFC_NAMES[3026737570]='IfcTubeBundle';
IFC_NAMES[2391406946]='IfcWasteTerminal';
IFC_NAMES[1945004755]='IfcDistributionElement';
IFC_NAMES[3040386961]='IfcDistributionFlowElement';
IFC_NAMES[3132237377]='IfcFlowStorageDevice';
IFC_NAMES[3508470533]='IfcFlowTreatmentDevice';
IFC_NAMES[2058353004]='IfcFlowController';
IFC_NAMES[4278956645]='IfcFlowMovingDevice';
IFC_NAMES[1658829314]='IfcEnergyConversionDevice';
IFC_NAMES[1335981549]='IfcDiscreteAccessory';
IFC_NAMES[3493046030]='IfcDistributionPort';
IFC_NAMES[3415622556]='IfcDistributionChamberElement';
IFC_NAMES[1437502449]='IfcMedicalDevice';
IFC_NAMES[3640358203]='IfcProtectiveDevice';
IFC_NAMES[2295281155]='IfcProtectiveDeviceTrippingUnit';
IFC_NAMES[3588315303]='IfcOpening';
IFC_NAMES[3512223829]='IfcCableCarrierFitting';
IFC_NAMES[1051757585]='IfcCableCarrierSegment';
IFC_NAMES[3999819293]='IfcCableSegment';
IFC_NAMES[753842376]='IfcBoiler';
IFC_NAMES[2082059205]='IfcAirTerminal';
IFC_NAMES[3304561284]='IfcAirTerminalBox';
IFC_NAMES[2979338954]='IfcAlarm';
IFC_NAMES[331165859]='IfcFan';
IFC_NAMES[4252922144]='IfcStackTerminal';
IFC_NAMES[763608111]='IfcCooledBeam';
IFC_NAMES[626022354]='IfcController';
IFC_NAMES[1469388950]='IfcCoolingTower';
IFC_NAMES[1281925730]='IfcCondenser';
IFC_NAMES[4136498852]='IfcCoil';
IFC_NAMES[3171933400]='IfcDamper';
IFC_NAMES[1758889154]='IfcCompressor';
IFC_NAMES[4237592921]='IfcChiller';
IFC_NAMES[987401354]='IfcFlowMeter';
IFC_NAMES[3024970846]='IfcSwitchingDevice';
IFC_NAMES[3283111854]='IfcSpaceHeater';
IFC_NAMES[1687234759]='IfcShadingDevice';
IFC_NAMES[900683007]='IfcFooting';
IFC_NAMES[25142252]='IfcUnitaryEquipment';

