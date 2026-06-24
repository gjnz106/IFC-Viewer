import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three";
import { IFCSPACE, IFCOPENINGELEMENT, IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCRAILING, IFCPLATE, IFCMEMBER, IFCCURTAINWALL, IFCFOOTING, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, IFCFLOWTERMINAL, IFCFLOWFITTING, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSTAIRFLIGHT } from "web-ifc";
let scene, camera, renderer, controls, ifcLoader;
let files = [null, null], loadedModels = [null, null], compareResult = null, activeFilter = "all";
const FED_COLORS = ["#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
const FED_LABELS = ["C", "D", "E", "F", "G", "H", "I"];
let fedNextSlot = 2;
let ctxTarget = null;
let activeCategories = /* @__PURE__ */ new Set();
let modelBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
let sharedCenterOffset = null;
let clipPlanes = [], sectionActive = false;
const IFC_NAMES = {};
IFC_NAMES[IFCWALL] = "IfcWall";
IFC_NAMES[IFCWALLSTANDARDCASE] = "IfcWallStandardCase";
IFC_NAMES[IFCSLAB] = "IfcSlab";
IFC_NAMES[IFCCOLUMN] = "IfcColumn";
IFC_NAMES[IFCBEAM] = "IfcBeam";
IFC_NAMES[IFCDOOR] = "IfcDoor";
IFC_NAMES[IFCWINDOW] = "IfcWindow";
IFC_NAMES[IFCROOF] = "IfcRoof";
IFC_NAMES[IFCSTAIR] = "IfcStair";
IFC_NAMES[IFCSTAIRFLIGHT] = "IfcStairFlight";
IFC_NAMES[IFCRAILING] = "IfcRailing";
IFC_NAMES[IFCPLATE] = "IfcPlate";
IFC_NAMES[IFCMEMBER] = "IfcMember";
IFC_NAMES[IFCCURTAINWALL] = "IfcCurtainWall";
IFC_NAMES[IFCFOOTING] = "IfcFooting";
IFC_NAMES[IFCBUILDINGELEMENTPROXY] = "IfcBuildingElementProxy";
IFC_NAMES[IFCFURNISHINGELEMENT] = "IfcFurnishingElement";
IFC_NAMES[IFCFLOWSEGMENT] = "IfcFlowSegment";
IFC_NAMES[IFCFLOWTERMINAL] = "IfcFlowTerminal";
IFC_NAMES[IFCFLOWFITTING] = "IfcFlowFitting";
IFC_NAMES[IFCSITE] = "IfcSite";
IFC_NAMES[IFCBUILDING] = "IfcBuilding";
IFC_NAMES[IFCBUILDINGSTOREY] = "IfcBuildingStorey";
IFC_NAMES[IFCPROJECT] = "IfcProject";
IFC_NAMES[IFCSPACE] = "IfcSpace";
IFC_NAMES[3612865200] = "IfcPipeSegment";
IFC_NAMES[310824031] = "IfcPipeFitting";
IFC_NAMES[3518393246] = "IfcDuctSegment";
IFC_NAMES[342316401] = "IfcDuctFitting";
IFC_NAMES[1360408905] = "IfcDuctSilencer";
IFC_NAMES[4207607924] = "IfcValve";
IFC_NAMES[1634111441] = "IfcElectricAppliance";
IFC_NAMES[264262732] = "IfcElectricGenerator";
IFC_NAMES[3310460725] = "IfcElectricMotor";
IFC_NAMES[402227799] = "IfcElectricDistributionBoard";
IFC_NAMES[1904799276] = "IfcElectricFlowStorageDevice";
IFC_NAMES[862014818] = "IfcElectricTimeControl";
IFC_NAMES[76236018] = "IfcLamp";
IFC_NAMES[629592764] = "IfcLightFixture";
IFC_NAMES[707683696] = "IfcOutlet";
IFC_NAMES[90941305] = "IfcPump";
IFC_NAMES[819412036] = "IfcFilter";
IFC_NAMES[1426591983] = "IfcFireSuppressionTerminal";
IFC_NAMES[4074379575] = "IfcHumidifier";
IFC_NAMES[2176052936] = "IfcJunctionBox";
IFC_NAMES[2474470126] = "IfcSanitaryTerminal";
IFC_NAMES[1973544240] = "IfcSensor";
IFC_NAMES[3825984169] = "IfcTransformer";
IFC_NAMES[3026737570] = "IfcTubeBundle";
IFC_NAMES[2391406946] = "IfcWasteTerminal";
IFC_NAMES[1945004755] = "IfcDistributionElement";
IFC_NAMES[3040386961] = "IfcDistributionFlowElement";
IFC_NAMES[3132237377] = "IfcFlowStorageDevice";
IFC_NAMES[3508470533] = "IfcFlowTreatmentDevice";
IFC_NAMES[2058353004] = "IfcFlowController";
IFC_NAMES[4278956645] = "IfcFlowMovingDevice";
IFC_NAMES[1658829314] = "IfcEnergyConversionDevice";
IFC_NAMES[1335981549] = "IfcDiscreteAccessory";
IFC_NAMES[3493046030] = "IfcDistributionPort";
IFC_NAMES[3415622556] = "IfcDistributionChamberElement";
IFC_NAMES[1437502449] = "IfcMedicalDevice";
IFC_NAMES[3640358203] = "IfcProtectiveDevice";
IFC_NAMES[2295281155] = "IfcProtectiveDeviceTrippingUnit";
IFC_NAMES[3588315303] = "IfcOpening";
IFC_NAMES[3512223829] = "IfcCableCarrierFitting";
IFC_NAMES[1051757585] = "IfcCableCarrierSegment";
IFC_NAMES[3999819293] = "IfcCableSegment";
IFC_NAMES[753842376] = "IfcBoiler";
IFC_NAMES[2082059205] = "IfcAirTerminal";
IFC_NAMES[3304561284] = "IfcAirTerminalBox";
IFC_NAMES[2979338954] = "IfcAlarm";
IFC_NAMES[331165859] = "IfcFan";
IFC_NAMES[4252922144] = "IfcStackTerminal";
IFC_NAMES[763608111] = "IfcCooledBeam";
IFC_NAMES[626022354] = "IfcController";
IFC_NAMES[1469388950] = "IfcCoolingTower";
IFC_NAMES[1281925730] = "IfcCondenser";
IFC_NAMES[4136498852] = "IfcCoil";
IFC_NAMES[3171933400] = "IfcDamper";
IFC_NAMES[1758889154] = "IfcCompressor";
IFC_NAMES[4237592921] = "IfcChiller";
IFC_NAMES[987401354] = "IfcFlowMeter";
IFC_NAMES[3024970846] = "IfcSwitchingDevice";
IFC_NAMES[3283111854] = "IfcSpaceHeater";
IFC_NAMES[1687234759] = "IfcShadingDevice";
IFC_NAMES[900683007] = "IfcFooting";
IFC_NAMES[25142252] = "IfcUnitaryEquipment";
const IFC_TO_REVIT_CAT = {
  "IfcAirTerminal": "Air Terminals",
  "IfcAirTerminalType": "Air Terminals",
  "IfcAirTerminalBox": "Air Terminals",
  "IfcAlarm": "Fire Alarm Devices",
  "IfcBeam": "Structural Framing",
  "IfcBoiler": "Mechanical Equipment",
  "IfcBuildingElementPart": "Parts",
  "IfcBuildingElementProxy": "Generic Models",
  "IfcCableCarrierFitting": "Cable Tray Fittings",
  "IfcCableCarrierSegment": "Cable Trays",
  "IfcCableSegment": "Wires",
  "IfcChiller": "Mechanical Equipment",
  "IfcCoil": "Mechanical Equipment",
  "IfcColumn": "Columns",
  "IfcCompressor": "Mechanical Equipment",
  "IfcCondenser": "Mechanical Equipment",
  "IfcController": "Electrical Equipment",
  "IfcCooledBeam": "Mechanical Equipment",
  "IfcCoolingTower": "Mechanical Equipment",
  "IfcCovering": "Ceilings",
  "IfcCurtainWall": "Curtain Systems",
  "IfcDamper": "Mechanical Equipment",
  "IfcDiscreteAccessory": "Specialty Equipment",
  "IfcDistributionChamberElement": "Mechanical Equipment",
  "IfcDistributionControlElement": "Electrical Equipment",
  "IfcDistributionElement": "Generic Models",
  "IfcDistributionFlowElement": "Mechanical Equipment",
  "IfcDistributionPort": "Generic Models",
  "IfcDoor": "Doors",
  "IfcDuctFitting": "Duct Fittings",
  "IfcDuctSegment": "Ducts",
  "IfcDuctSilencer": "Duct Accessories",
  "IfcElectricAppliance": "Specialty Equipment",
  "IfcElectricDistributionBoard": "Electrical Equipment",
  "IfcElectricFlowStorageDevice": "Electrical Equipment",
  "IfcElectricGenerator": "Electrical Equipment",
  "IfcElectricMotor": "Electrical Equipment",
  "IfcElectricTimeControl": "Electrical Equipment",
  "IfcEnergyConversionDevice": "Mechanical Equipment",
  "IfcEvaporativeCooler": "Mechanical Equipment",
  "IfcEvaporator": "Mechanical Equipment",
  "IfcFan": "Mechanical Equipment",
  "IfcFastener": "Parts",
  "IfcFilter": "Mechanical Equipment",
  "IfcFireSuppressionTerminal": "Sprinklers",
  "IfcFlowController": "Pipe Accessories",
  "IfcFlowFitting": "Pipe Fittings",
  "IfcFlowInstrument": "Electrical Equipment",
  "IfcFlowMeter": "Pipe Accessories",
  "IfcFlowMovingDevice": "Mechanical Equipment",
  "IfcFlowSegment": "Pipes",
  "IfcFlowStorageDevice": "Mechanical Equipment",
  "IfcFlowTerminal": "Plumbing Fixtures",
  "IfcFlowTreatmentDevice": "Mechanical Equipment",
  "IfcFooting": "Structural Foundations",
  "IfcFurnishingElement": "Furniture",
  "IfcFurniture": "Furniture",
  "IfcGeographicElement": "Site",
  "IfcHeatExchanger": "Mechanical Equipment",
  "IfcHumidifier": "Mechanical Equipment",
  "IfcJunctionBox": "Electrical Fixtures",
  "IfcLamp": "Lighting Fixtures",
  "IfcLightFixture": "Lighting Fixtures",
  "IfcMechanicalFastener": "Generic Models",
  "IfcMedicalDevice": "Specialty Equipment",
  "IfcMember": "Structural Framing",
  "IfcOpening": "Generic Models",
  "IfcOpeningElement": "Generic Models",
  "IfcOutlet": "Electrical Fixtures",
  "IfcPile": "Structural Columns",
  "IfcPipeFitting": "Pipe Fittings",
  "IfcPipeSegment": "Pipes",
  "IfcPlate": "Generic Models",
  "IfcProtectiveDevice": "Electrical Equipment",
  "IfcProtectiveDeviceTrippingUnit": "Electrical Equipment",
  "IfcPump": "Mechanical Equipment",
  "IfcRailing": "Railings",
  "IfcRamp": "Ramps",
  "IfcRampFlight": "Ramps",
  "IfcReinforcingBar": "Structural Rebar",
  "IfcReinforcingMesh": "Structural Fabric Reinforcement",
  "IfcRoof": "Roofs",
  "IfcSanitaryTerminal": "Plumbing Fixtures",
  "IfcSensor": "Electrical Fixtures",
  "IfcShadingDevice": "Generic Models",
  "IfcSite": "Site",
  "IfcSlab": "Floors",
  "IfcSpace": "Spaces",
  "IfcSpaceHeater": "Mechanical Equipment",
  "IfcStackTerminal": "Plumbing Fixtures",
  "IfcStair": "Stairs",
  "IfcStairFlight": "Stairs",
  "IfcSwitchingDevice": "Electrical Fixtures",
  "IfcSystemFurnitureElement": "Casework",
  "IfcTank": "Mechanical Equipment",
  "IfcTransformer": "Electrical Equipment",
  "IfcTransportElement": "Entourage",
  "IfcTubeBundle": "Mechanical Equipment",
  "IfcUnitaryEquipment": "Mechanical Equipment",
  "IfcValve": "Pipe Accessories",
  "IfcWall": "Walls",
  "IfcWallStandardCase": "Walls",
  "IfcWasteTerminal": "Plumbing Fixtures",
  "IfcWindow": "Windows",
  "IfcBuilding": "(Building)",
  "IfcBuildingStorey": "(Level)",
  "IfcProject": "(Project)"
};
function ifcClassToRevitCategory(cls) {
  if (!cls) return cls || "Unknown";
  return IFC_TO_REVIT_CAT[cls] || IFC_TO_REVIT_CAT[cls.charAt(0) + cls.slice(1).toLowerCase()] || cls;
}
function log(...a) {
  if (window.DEBUG) console.log("[IFC]", ...a);
}
function initThree() {
  const c = document.getElementById("vpCanvas");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(15265010);
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), 99999));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), 99999));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), 99999));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), 99999));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), 99999));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), 99999));
  camera = new THREE.PerspectiveCamera(50, c.clientWidth / c.clientHeight, 0.01, 1e5);
  camera.position.set(30, 25, 30);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setSize(c.clientWidth, c.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  c.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.7;
  controls.panSpeed = 0.8;
  controls.enableZoom = false;
  controls.maxDistance = 5e4;
  controls.minDistance = 1e-3;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
  controls.enablePan = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  window._zoomState = {
    accum: 0,
    // remaining zoom to apply (log factor)
    pivot: new THREE.Vector3(),
    // zoom anchor (raycasted scene point)
    pivotValid: false,
    // false means recompute on next event
    stepBase: Math.log(1.08),
    // log factor per wheel tick (~8%) — smaller = finer
    easing: 0.15
    // fraction of accum consumed per frame — lower = smoother glide
  };
  {
    const zoomRay = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();
    renderer.domElement.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zs = window._zoomState;
      const direction = e.deltaY > 0 ? 1 : -1;
      const prevDir = zs.accum > 0 ? 1 : zs.accum < 0 ? -1 : 0;
      if (!zs.pivotValid || prevDir !== 0 && prevDir !== direction) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouseNDC.x = (e.clientX - rect.left) / rect.width * 2 - 1;
        mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        zoomRay.setFromCamera(mouseNDC, camera);
        const targets = [];
        scene.traverse((o) => {
          if (o.isMesh && o.visible) targets.push(o);
        });
        const hits = zoomRay.intersectObjects(targets, false);
        if (hits.length > 0) {
          zs.pivot.copy(hits[0].point);
        } else {
          const d = camera.position.distanceTo(controls.target);
          zs.pivot.copy(zoomRay.ray.origin).addScaledVector(zoomRay.ray.direction, d);
        }
        zs.pivotValid = true;
      }
      let ticks;
      if (e.deltaMode === 1) {
        ticks = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 3);
      } else if (e.deltaMode === 2) {
        ticks = Math.sign(e.deltaY) * 3;
      } else {
        ticks = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) / 100, 1);
      }
      zs.accum += ticks * zs.stepBase;
    }, { passive: false });
  }
  function applyZoomVelocity() {
    const zs = window._zoomState;
    if (Math.abs(zs.accum) < 1e-4) {
      zs.pivotValid = false;
      return;
    }
    const step = zs.accum * zs.easing;
    zs.accum -= step;
    const factor = Math.exp(step);
    const from = new THREE.Vector3().subVectors(camera.position, zs.pivot).multiplyScalar(factor);
    const newCamPos = zs.pivot.clone().add(from);
    const camMove = new THREE.Vector3().subVectors(newCamPos, camera.position);
    camera.position.copy(newCamPos);
    controls.target.add(camMove);
  }
  scene.add(new THREE.AmbientLight(16777215, 0.8));
  {
    let pinchDist0 = 0;
    let pinchMid = { x: 0, y: 0 };
    let pinchActive = false;
    const pinchRay = new THREE.Raycaster();
    renderer.domElement.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2 && !walkActive) {
        pinchActive = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        pinchDist0 = Math.sqrt(Math.pow(t1.clientX - t0.clientX, 2) + Math.pow(t1.clientY - t0.clientY, 2));
        pinchMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
        const rect = renderer.domElement.getBoundingClientRect();
        const mx = (pinchMid.x - rect.left) / rect.width * 2 - 1;
        const my = -((pinchMid.y - rect.top) / rect.height) * 2 + 1;
        pinchRay.setFromCamera(new THREE.Vector2(mx, my), camera);
        const targets = [];
        scene.traverse((o) => {
          if (o.isMesh && o.visible) targets.push(o);
        });
        const hits = pinchRay.intersectObjects(targets, false);
        const zs = window._zoomState;
        if (hits.length > 0) {
          zs.pivot.copy(hits[0].point);
        } else {
          const d = camera.position.distanceTo(controls.target);
          zs.pivot.copy(pinchRay.ray.origin).addScaledVector(pinchRay.ray.direction, d);
        }
        zs.pivotValid = true;
        controls.enableZoom = false;
      }
    }, { passive: true });
    renderer.domElement.addEventListener("touchmove", (e) => {
      if (!pinchActive || e.touches.length !== 2 || walkActive) return;
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX - t0.clientX, 2) + Math.pow(t1.clientY - t0.clientY, 2));
      if (pinchDist0 > 0) {
        const scale = dist / pinchDist0;
        const zs = window._zoomState;
        const delta = Math.log(scale) * -2.5;
        zs.accum = delta;
        pinchDist0 = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener("touchend", () => {
      if (pinchActive) {
        pinchActive = false;
        controls.enableZoom = true;
      }
    }, { passive: true });
  }
  const d1 = new THREE.DirectionalLight(16777215, 1.5);
  d1.position.set(80, 120, 80);
  scene.add(d1);
  const d2 = new THREE.DirectionalLight(10070732, 0.5);
  d2.position.set(-50, 80, -50);
  scene.add(d2);
  scene.add(new THREE.HemisphereLight(14544639, 10070664, 0.5));
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downX, downY;
  function restoreViewSnap() {
    const s = window._viewSnap;
    if (!s) return;
    camera.position.set(s.px, s.py, s.pz);
    controls.target.set(s.tx, s.ty, s.tz);
    controls.update();
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  renderer.domElement.addEventListener("pointerup", async (e) => {
    if (Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3) return;
    if (dragHandle) return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const visA = document.getElementById("visA")?.checked ?? true;
    const visB = document.getElementById("visB")?.checked ?? true;
    const ms = [];
    scene.traverse((ch) => {
      if (ch.isMesh && ch.visible && ch.geometry?.attributes?.position && ch.parent?.name !== "sectionBox" && !ch.userData?.isHandle) {
        const srcIdx = ch.userData?.srcModelIdx;
        if (srcIdx === 0 && !visA) return;
        if (srcIdx === 1 && !visB) return;
        ms.push(ch);
      }
    });
    const hits = ray.intersectObjects(ms, false);
    if (!hits.length) {
      restoreViewSnap();
      clearHighlight();
      document.getElementById("propArea").innerHTML = '<div class="prop-empty">Click element in 3D to inspect</div>';
      return;
    }
    let validHit = null;
    let validHitBase = null;
    for (const hit2 of hits) {
      if (sectionActive && clipPlanes.length === 6) {
        const pt = hit2.point;
        let inside = true;
        for (const cp of clipPlanes) {
          if (cp.distanceToPoint(pt) < -0.01) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
      }
      if (compareResult && hit2.object.userData?.diffSubset) {
        validHit = hit2;
        break;
      }
      if (!validHit) validHit = hit2;
      break;
    }
    if (!validHit) {
      restoreViewSnap();
      clearHighlight();
      document.getElementById("propArea").innerHTML = '<div class="prop-empty">Click element in 3D to inspect</div>';
      return;
    }
    if (measureMode) {
      if (measurePoints.length >= 2) clearMeasure();
      addMeasurePoint(validHit.point);
      return;
    }
    const hit = validHit;
    let targetModelIdx = -1;
    if (hit.object.userData?.srcModelIdx !== void 0) {
      targetModelIdx = hit.object.userData.srcModelIdx;
    } else {
      targetModelIdx = findModelIdx(hit.object);
    }
    if (targetModelIdx === 0 && !visA) {
      log("Pick: model A unticked");
      return;
    }
    if (targetModelIdx === 1 && !visB) {
      log("Pick: model B unticked");
      return;
    }
    if (targetModelIdx >= 2) {
      const fedChk = document.getElementById("fedVis" + targetModelIdx);
      if (fedChk && !fedChk.checked) {
        log("Pick: federation model " + targetModelIdx + " unticked");
        return;
      }
    }
    if (targetModelIdx < 0 || !loadedModels[targetModelIdx] || !ifcLoader) {
      return;
    }
    const modelID = loadedModels[targetModelIdx].modelID;
    let foundEid = null;
    try {
      const eid = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
      if (eid > 0) foundEid = eid;
    } catch (e2) {
    }
    if (!foundEid && hit.object.geometry.attributes.expressID) {
      try {
        const idx2 = hit.object.geometry.index ? hit.object.geometry.index.array[hit.faceIndex * 3] : hit.faceIndex * 3;
        if (idx2 >= 0 && idx2 < hit.object.geometry.attributes.expressID.array.length) {
          const eid = hit.object.geometry.attributes.expressID.array[idx2];
          if (eid > 0) foundEid = eid;
        }
      } catch (e2) {
      }
    }
    if (!foundEid) {
      return;
    }
    log("Pick: expressID=" + foundEid + " model=" + targetModelIdx + (hit.object.userData?.diffSubset ? " (diff:" + hit.object.userData.diffSubset + ")" : ""));
    if (fieldActive) {
      try {
        const bb = getElementBBox(targetModelIdx, foundEid);
        if (bb && bb.center) {
          window._pendingPivot = new THREE.Vector3(bb.center.x, bb.center.y, bb.center.z);
          if (window._zoomState) {
            window._zoomState.pivot.copy(window._pendingPivot);
            window._zoomState.pivotValid = true;
            window._zoomState.accum = 0;
          }
        }
      } catch (e2) {
      }
      return;
    }
    try {
      const props = await ifcLoader.ifcManager.getItemProperties(modelID, foundEid, true);
      if (props) {
        showProps(props, targetModelIdx);
        try {
          clearHighlight();
          if (!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({ color: 2450411, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: clipPlanes });
          const sub = ifcLoader.ifcManager.createSubset({ modelID, ids: [foundEid], material: window._hlMat, scene, removePrevious: true, customID: "userHighlight" });
          if (sub) {
            sub.position.copy(loadedModels[targetModelIdx].position);
            sub.updateMatrixWorld(true);
            window._lastHL = { subset: sub, mid: modelID };
          }
        } catch (he) {
          log("Highlight err:", he.message);
        }
        try {
          const bb = getElementBBox(targetModelIdx, foundEid);
          if (bb && bb.center) {
            window._pendingPivot = new THREE.Vector3(bb.center.x, bb.center.y, bb.center.z);
            const wasDamping = controls.enableDamping;
            controls.enableDamping = false;
            controls.update();
            controls.enableDamping = wasDamping;
            if (window._zoomState) {
              window._zoomState.pivot.copy(window._pendingPivot);
              window._zoomState.pivotValid = true;
              window._zoomState.accum = 0;
            }
          }
        } catch (pe) {
          log("Pivot err:", pe?.message || pe);
        }
      }
    } catch (pe) {
      log("Props err:", pe.message);
    }
  });
  renderer.domElement.addEventListener(
    "pointerdown",
    (e) => {
      window._viewSnap = { px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
      if (e.button !== 0) {
        window._pendingPivot = null;
        return;
      }
      if (!window._pendingPivot) return;
      const newT = window._pendingPivot;
      const dx = newT.x - controls.target.x;
      const dy = newT.y - controls.target.y;
      const dz = newT.z - controls.target.z;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) {
        window._pendingPivot = null;
        return;
      }
      const camDist = camera.position.distanceTo(controls.target) || 1;
      const pivotDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (pivotDist > camDist * 10) {
        log("Pivot rejected: stale (delta " + pivotDist.toFixed(1) + " >> camDist " + camDist.toFixed(1) + ")");
        window._pendingPivot = null;
        return;
      }
      controls.target.x = newT.x;
      controls.target.y = newT.y;
      controls.target.z = newT.z;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
      window._pendingPivot = null;
    },
    true
    /* capture phase: run before OrbitControls' bubble-phase listener */
  );
  renderer.domElement.addEventListener("wheel", () => {
    window._pendingPivot = null;
  }, { passive: true, capture: true });
  window._vpResize = function() {
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (scene) renderer.render(scene, camera);
  };
  window.addEventListener("resize", () => window._vpResize());
  const root = document.documentElement;
  const setupColResize = (handleId, varName, getCurrent, fromLeft, minPx, maxPx) => {
    const handle = document.getElementById(handleId);
    if (!handle) return;
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      handle.classList.add("dragging");
      document.body.classList.add("resizing");
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const raw = fromLeft ? e.clientX : window.innerWidth - e.clientX;
      const clamped = Math.max(minPx, Math.min(maxPx, raw));
      root.style.setProperty(varName, clamped + "px");
      window._vpResize();
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      document.body.classList.remove("resizing");
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (err) {
      }
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };
  setupColResize("lresize", "--lcol", null, true, 180, 480);
  setupColResize("rresize", "--rcol", null, false, 220, 600);
  {
    const handle = document.getElementById("bresize");
    if (handle) {
      let dragging = false;
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        dragging = true;
        handle.classList.add("dragging");
        document.body.classList.add("resizing-row");
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const vpRect = c.parentElement.getBoundingClientRect();
        const newH = vpRect.bottom - e.clientY - 3;
        const maxH = Math.floor(window.innerHeight * 0.7);
        const clamped = Math.max(200, Math.min(maxH, newH));
        root.style.setProperty("--bottom-h", clamped + "px");
        window._vpResize();
      });
      const stopR = (e) => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove("dragging");
        document.body.classList.remove("resizing-row");
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch (err) {
        }
      };
      handle.addEventListener("pointerup", stopR);
      handle.addEventListener("pointercancel", stopR);
    }
  }
  const ctxRay = new THREE.Raycaster();
  const ctxMouse = new THREE.Vector2();
  renderer.domElement.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = renderer.domElement.getBoundingClientRect();
    ctxMouse.x = (e.clientX - r.left) / r.width * 2 - 1;
    ctxMouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ctxRay.setFromCamera(ctxMouse, camera);
    const visA = document.getElementById("visA")?.checked ?? true;
    const visB = document.getElementById("visB")?.checked ?? true;
    const ms = [];
    scene.traverse((ch) => {
      if (ch.isMesh && ch.visible && ch.geometry?.attributes?.position && ch.parent?.name !== "sectionBox" && !ch.userData?.isHandle) {
        const si = ch.userData?.srcModelIdx;
        if (si === 0 && !visA) return;
        if (si === 1 && !visB) return;
        ms.push(ch);
      }
    });
    const hits = ctxRay.intersectObjects(ms, false);
    ctxTarget = null;
    if (hits.length > 0) {
      const hit = hits[0];
      let mi = hit.object.userData?.srcModelIdx ?? -1;
      if (mi < 0) mi = findModelIdx(hit.object);
      if (mi >= 0 && loadedModels[mi]) {
        let eid = null;
        try {
          eid = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
        } catch (ex) {
        }
        if (!eid && hit.object.geometry.attributes.expressID) {
          const idx2 = hit.object.geometry.index ? hit.object.geometry.index.array[hit.faceIndex * 3] : hit.faceIndex * 3;
          eid = hit.object.geometry.attributes.expressID.array[idx2];
        }
        if (eid > 0) {
          const bbox = getElementBBox(mi, eid);
          let typeName = "";
          try {
            const tn = ifcLoader.ifcManager.state.api.GetLineType(loadedModels[mi].modelID, eid);
            typeName = IFC_NAMES[tn] || "IFC_" + tn;
          } catch (ex) {
          }
          let elName = "";
          try {
            const p = await ifcLoader.ifcManager.getItemProperties(loadedModels[mi].modelID, eid, false);
            if (p?.Name?.value) elName = p.Name.value;
          } catch (ex) {
          }
          let faceNormal = null;
          let hitPoint = null;
          try {
            hitPoint = hit.point.clone();
            if (hit.face && hit.face.normal) {
              faceNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            }
          } catch (ex) {
          }
          ctxTarget = { expressID: eid, modelIdx: mi, bbox, typeName, name: elName, faceNormal, hitPoint };
          document.getElementById("ctxTitle").textContent = (elName || typeName || "Element").substring(0, 40) + " #" + eid;
          log("Right-click: found #" + eid + " (" + typeName + ") bbox=" + (bbox ? "yes" : "null") + " normal=" + (faceNormal ? faceNormal.toArray().map((v) => v.toFixed(2)).join(",") : "null"));
        }
      }
    }
    if (!ctxTarget) {
      document.getElementById("ctxTitle").textContent = "No element";
      log("Right-click: no element hit");
    }
    const menu = document.getElementById("ctxMenu");
    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + "px";
    menu.style.top = Math.min(e.clientY, window.innerHeight - 400) + "px";
    menu.classList.add("show");
  });
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("ctxMenu");
    if (menu && !menu.contains(e.target)) {
      menu.classList.remove("show");
    }
  });
  (function loop() {
    requestAnimationFrame(loop);
    applyZoomVelocity();
    controls.update();
    if (sectionBox) updateSectionHandleSizes();
    if (typeof updateViewCube === "function") updateViewCube();
    renderer.render(scene, camera);
  })();
}
let viewCube = { scene: null, cam: null, renderer: null, mesh: null, pickables: [] };
function initViewCube() {
  const host = document.getElementById("viewCube");
  if (!host) return;
  const vr = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false });
  vr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  vr.setSize(host.clientWidth, host.clientHeight);
  vr.setClearColor(0, 0);
  host.appendChild(vr.domElement);
  const vs = new THREE.Scene();
  const vc = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 100);
  vc.position.set(0, 0, 5);
  vc.lookAt(0, 0, 0);
  const makeFaceTex = (label) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#b0b8c9";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 125, 125);
    ctx.fillStyle = "#4a5068";
    ctx.font = "600 22px Inter,system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  };
  const labels = ["RIGHT", "LEFT", "TOP", "BOTTOM", "BACK", "FRONT"];
  const cubeMats = labels.map((l) => new THREE.MeshBasicMaterial({ map: makeFaceTex(l) }));
  const cubeGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMats);
  vs.add(cubeMesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeGeo),
    new THREE.LineBasicMaterial({ color: 8753318, transparent: true, opacity: 0.6 })
  );
  cubeMesh.add(edges);
  const ringGeo = new THREE.RingGeometry(1.1, 1.25, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 14014946, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.82;
  vs.add(ring);
  viewCube = { scene: vs, cam: vc, renderer: vr, mesh: cubeMesh, host };
  const ray = new THREE.Raycaster();
  const m = new THREE.Vector2();
  host.addEventListener("pointerdown", (ev) => {
    const startX = ev.clientX, startY = ev.clientY;
    let moved = false;
    const mv = (e) => {
      if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
    };
    const up = (e) => {
      host.removeEventListener("pointermove", mv);
      host.removeEventListener("pointerup", up);
      if (moved) return;
      const r = host.getBoundingClientRect();
      m.x = (e.clientX - r.left) / r.width * 2 - 1;
      m.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(m, vc);
      const hits = ray.intersectObject(cubeMesh, false);
      if (!hits.length) return;
      const faceIdx = Math.floor(hits[0].faceIndex / 2);
      snapMainCameraToFace(faceIdx);
    };
    host.addEventListener("pointermove", mv);
    host.addEventListener("pointerup", up, { once: true });
  });
}
function snapMainCameraToFace(faceIdx) {
  if (!camera || !controls) return;
  const dirs = [
    new THREE.Vector3(1, 0, 0),
    // RIGHT  (+X)
    new THREE.Vector3(-1, 0, 0),
    // LEFT   (-X)
    new THREE.Vector3(0, 1, 0),
    // TOP    (+Y)
    new THREE.Vector3(0, -1, 0),
    // BOTTOM (-Y)
    new THREE.Vector3(0, 0, 1),
    // BACK   (+Z)
    new THREE.Vector3(0, 0, -1)
    // FRONT  (-Z)
  ];
  const dir = dirs[faceIdx] || dirs[5];
  const target = controls.target.clone();
  const currentDist = camera.position.distanceTo(target) || 20;
  const newPos = target.clone().addScaledVector(dir, currentDist);
  animateCameraTo(newPos, target, 350);
}
function animateCameraTo(endPos, endTarget, duration = 300) {
  if (!camera || !controls) return;
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const t0 = performance.now();
  if (window._camTweenId) cancelAnimationFrame(window._camTweenId);
  const step = () => {
    const t = Math.min((performance.now() - t0) / duration, 1);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    controls.update();
    if (t < 1) window._camTweenId = requestAnimationFrame(step);
    else window._camTweenId = null;
  };
  step();
}
function updateViewCube() {
  if (!viewCube.mesh || !viewCube.renderer || !camera || !controls) return;
  const m = new THREE.Matrix4();
  m.lookAt(camera.position, controls.target, camera.up);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  viewCube.mesh.quaternion.copy(q.invert());
  viewCube.renderer.render(viewCube.scene, viewCube.cam);
}
let colorize = {
  active: false,
  mode: "auto",
  // 'auto' | 'rules'
  property: "category",
  // Auto mode: 'category' | 'type'
  valueColors: {},
  // Auto mode: {value: '#rrggbb'} — user overrides
  valueVisible: {},
  // Auto mode: {value: bool} — false = hidden
  rules: [],
  // Rules mode: [{id, name, color, conditions:[{prop,op,value}]}]
  subsets: [],
  // THREE.Mesh[] currently in scene (either mode)
  propsCache: [null, null]
  // per-model: {expressID: entity}
};
const CZ_OPERATORS = [
  { v: "equals", label: "equals" },
  { v: "contains", label: "contains" },
  { v: "starts", label: "starts with" },
  { v: "ne", label: "not equals" }
];
const CZ_RULE_PROPS = [
  { v: "category", label: "Category" },
  { v: "type", label: "Type" },
  { v: "name", label: "Name" },
  { v: "tag", label: "Tag / Element ID" },
  { v: "file", label: "File (A vs B)" }
];
const COLORIZE_PALETTE = [
  "#2563eb",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#a855f7",
  "#84cc16",
  "#f43f5e",
  "#0ea5e9",
  "#eab308",
  "#6366f1",
  "#d946ef",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a3e635",
  "#fb7185",
  "#38bdf8",
  "#fbbf24",
  "#c084fc",
  "#4ade80"
];
function colorizeHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
  return h;
}
function colorForValue(v) {
  if (colorize.valueColors[v]) return colorize.valueColors[v];
  return COLORIZE_PALETTE[colorizeHash(String(v)) % COLORIZE_PALETTE.length];
}
window.toggleColorize = async function() {
  if (colorize.active) {
    colorizeClear();
    return;
  }
  if (!loadedModels.some((m) => !!m)) {
    log("Colorize: no models loaded");
    return;
  }
  if (compareResult) {
    log("Colorize: exiting compare mode first (mutex)");
    try {
      window.exitCompare && exitCompare();
    } catch (e) {
    }
  }
  colorize.active = true;
  document.getElementById("btnColorize").classList.add("active");
  document.getElementById("colorizePanel").classList.add("show");
  document.getElementById("czTabAuto").classList.toggle("active", colorize.mode === "auto");
  document.getElementById("czTabRules").classList.toggle("active", colorize.mode === "rules");
  document.getElementById("czViewAuto").style.display = colorize.mode === "auto" ? "" : "none";
  document.getElementById("czViewRules").style.display = colorize.mode === "rules" ? "flex" : "none";
  if (colorize.mode === "rules") colorizeRenderRules();
  await applyColorize();
};
window.applyColorize = async function() {
  if (!colorize.active) return;
  colorizeDisposeSubsets();
  colorizeFadeBase(true);
  await colorizeLoadPropsCache();
  if (colorize.mode === "rules") {
    await applyColorizeRules();
  } else {
    await applyColorizeAuto();
  }
};
async function colorizeLoadPropsCache() {
  for (let mi = 0; mi < 2; mi++) {
    if (!loadedModels[mi]) continue;
    if (colorize.propsCache[mi]) continue;
    try {
      const p = await getAllProps(loadedModels[mi].modelID);
      const byEid = {};
      const slotLabel = mi === 0 ? "A" : "B";
      const fname = files[mi]?.name || "(Model " + slotLabel + ")";
      const sourceLabel = slotLabel + " \u2014 " + fname;
      for (const gid in p) {
        p[gid]._sourceFile = sourceLabel;
        byEid[p[gid].expressID] = p[gid];
      }
      colorize.propsCache[mi] = byEid;
    } catch (e) {
      log("Colorize: getAllProps failed for model " + mi, e?.message);
      colorize.propsCache[mi] = {};
    }
  }
}
async function applyColorizeAuto() {
  const sel = document.getElementById("czProp");
  if (sel) colorize.property = sel.value || "category";
  const idx = {};
  for (let mi = 0; mi < 2; mi++) {
    const props = colorize.propsCache[mi];
    if (!props) continue;
    for (const eid in props) {
      const e = props[eid];
      const v = colorizeGetValue(e, colorize.property);
      if (v === null || v === void 0 || v === "") continue;
      if (!idx[v]) idx[v] = { 0: /* @__PURE__ */ new Set(), 1: /* @__PURE__ */ new Set() };
      idx[v][mi].add(+eid);
    }
  }
  const entries = Object.entries(idx).map(([v, perModel]) => ({
    value: v,
    count: perModel[0].size + perModel[1].size,
    perModel
  })).sort((a, b) => b.count - a.count);
  const cycleId = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  for (const e of entries) {
    if (colorize.valueVisible[e.value] === false) continue;
    const hex = colorForValue(e.value);
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(hex),
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      clippingPlanes: clipPlanes
    });
    for (let mi = 0; mi < 2; mi++) {
      const ids = [...e.perModel[mi]];
      if (!ids.length) continue;
      try {
        const sub = ifcLoader.ifcManager.createSubset({
          modelID: loadedModels[mi].modelID,
          ids,
          material: mat,
          scene,
          removePrevious: false,
          customID: "cz_" + cycleId + "_" + mi + "_" + colorizeHash(e.value)
        });
        if (sub) {
          sub.position.copy(loadedModels[mi].position);
          sub.updateMatrixWorld(true);
          sub.userData.colorizeValue = e.value;
          sub.userData.srcModelIdx = mi;
          sub.traverse((ch) => {
            if (ch.isMesh) {
              ch.userData.srcModelIdx = mi;
              ch.userData.colorizeValue = e.value;
            }
          });
          const visChk = document.getElementById(mi === 0 ? "visA" : "visB");
          if (visChk && !visChk.checked) sub.visible = false;
          colorize.subsets.push(sub);
        }
      } catch (err) {
        log("Colorize subset error for value " + e.value, err?.message);
      }
    }
  }
  colorizeRenderLegend(entries);
  log("Colorize[auto]: " + entries.length + " values for " + colorize.property);
}
async function applyColorizeRules() {
  const buckets = colorize.rules.map(() => ({ 0: /* @__PURE__ */ new Set(), 1: /* @__PURE__ */ new Set(), count: 0 }));
  for (let mi = 0; mi < 2; mi++) {
    const props = colorize.propsCache[mi];
    if (!props) continue;
    for (const eid in props) {
      const e = props[eid];
      const ri = evaluateRules(e);
      if (ri < 0) continue;
      buckets[ri][mi].add(+eid);
      buckets[ri].count++;
    }
  }
  colorize.rules.forEach((r, ri) => {
    r._count = buckets[ri].count;
  });
  const cycleId = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  for (let ri = 0; ri < colorize.rules.length; ri++) {
    const rule = colorize.rules[ri];
    const bucket = buckets[ri];
    if (!bucket.count) continue;
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(rule.color),
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      clippingPlanes: clipPlanes
    });
    for (let mi = 0; mi < 2; mi++) {
      const ids = [...bucket[mi]];
      if (!ids.length) continue;
      try {
        const sub = ifcLoader.ifcManager.createSubset({
          modelID: loadedModels[mi].modelID,
          ids,
          material: mat,
          scene,
          removePrevious: false,
          customID: "czr_" + cycleId + "_" + mi + "_" + ri
        });
        if (sub) {
          sub.position.copy(loadedModels[mi].position);
          sub.updateMatrixWorld(true);
          sub.userData.colorizeRuleId = rule.id;
          sub.userData.srcModelIdx = mi;
          sub.traverse((ch) => {
            if (ch.isMesh) {
              ch.userData.srcModelIdx = mi;
              ch.userData.colorizeRuleId = rule.id;
            }
          });
          const visChk = document.getElementById(mi === 0 ? "visA" : "visB");
          if (visChk && !visChk.checked) sub.visible = false;
          colorize.subsets.push(sub);
        }
      } catch (err) {
        log("Colorize rule subset error for rule " + ri, err?.message);
      }
    }
  }
  colorizeRenderRules();
  log("Colorize[rules]: " + colorize.rules.length + " rules, " + colorize.subsets.length + " subsets created");
}
function evaluateRules(entity) {
  for (let i = 0; i < colorize.rules.length; i++) {
    const rule = colorize.rules[i];
    if (!rule.conditions || rule.conditions.length === 0) continue;
    let allMatch = true;
    for (const c of rule.conditions) {
      if (!evaluateCondition(entity, c)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return i;
  }
  return -1;
}
function evaluateCondition(entity, cond) {
  if (!cond || !cond.prop || !cond.op) return false;
  const want = (cond.value ?? "").toString().trim().toLowerCase();
  if (want === "") return false;
  let got = (colorizeGetValue(entity, cond.prop) || "").toString().trim().toLowerCase();
  if (cond.prop === "file" && (want === "a" || want === "b") && cond.op === "equals") {
    return got.startsWith(want + " ") || got === want;
  }
  switch (cond.op) {
    case "equals":
      return got === want;
    case "contains":
      return got.indexOf(want) >= 0;
    case "starts":
      return got.startsWith(want);
    case "ne":
      return got !== want;
    default:
      return false;
  }
}
window.colorizeSetMode = async function(mode) {
  colorize.mode = mode === "rules" ? "rules" : "auto";
  document.getElementById("czTabAuto").classList.toggle("active", colorize.mode === "auto");
  document.getElementById("czTabRules").classList.toggle("active", colorize.mode === "rules");
  document.getElementById("czViewAuto").style.display = colorize.mode === "auto" ? "" : "none";
  document.getElementById("czViewRules").style.display = colorize.mode === "rules" ? "flex" : "none";
  await applyColorize();
};
window.colorizeAddRule = async function() {
  const id = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const idx = colorize.rules.length;
  const used = new Set(colorize.rules.map((r) => r.color?.toLowerCase()));
  let color = COLORIZE_PALETTE[idx % COLORIZE_PALETTE.length];
  for (const c of COLORIZE_PALETTE) {
    if (!used.has(c.toLowerCase())) {
      color = c;
      break;
    }
  }
  colorize.rules.push({
    id,
    name: "Rule " + (idx + 1),
    color,
    conditions: [{ prop: "category", op: "equals", value: "" }]
  });
  colorizeRenderRules();
  await applyColorize();
};
window.colorizeDeleteRule = async function(ruleIdx) {
  if (ruleIdx < 0 || ruleIdx >= colorize.rules.length) return;
  colorize.rules.splice(ruleIdx, 1);
  colorizeRenderRules();
  await applyColorize();
};
window.colorizeSetRuleColor = function(ruleIdx, hex) {
  const rule = colorize.rules[ruleIdx];
  if (!rule) return;
  rule.color = hex;
  const color = new THREE.Color(hex);
  for (const sub of colorize.subsets) {
    if (sub.userData.colorizeRuleId === rule.id) {
      sub.traverse((ch) => {
        if (ch.isMesh) {
          const ms = Array.isArray(ch.material) ? ch.material : [ch.material];
          ms.forEach((m) => {
            m.color = color;
            m.needsUpdate = true;
          });
        }
      });
    }
  }
  const sw = document.querySelector(`.cz-rule[data-rule-idx="${ruleIdx}"] .cz-swatch`);
  if (sw) sw.style.background = hex;
};
window.colorizeSetRuleName = function(ruleIdx, name) {
  const rule = colorize.rules[ruleIdx];
  if (!rule) return;
  rule.name = name;
};
window.colorizeAddCondition = function(ruleIdx) {
  const rule = colorize.rules[ruleIdx];
  if (!rule) return;
  rule.conditions.push({ prop: "category", op: "equals", value: "" });
  colorizeRenderRules();
};
window.colorizeRemoveCondition = async function(ruleIdx, condIdx) {
  const rule = colorize.rules[ruleIdx];
  if (!rule) return;
  rule.conditions.splice(condIdx, 1);
  if (rule.conditions.length === 0) {
    colorize.rules.splice(ruleIdx, 1);
  }
  colorizeRenderRules();
  await applyColorize();
};
window.colorizeUpdateCondition = async function(ruleIdx, condIdx, field, value) {
  const rule = colorize.rules[ruleIdx];
  if (!rule) return;
  const cond = rule.conditions[condIdx];
  if (!cond) return;
  cond[field] = value;
  if (field === "prop") {
    cond.value = "";
    colorizeRenderRules();
  }
  await applyColorize();
};
function colorizeRenderRules() {
  const host = document.getElementById("czRules");
  if (!host) return;
  if (!colorize.rules.length) {
    host.innerHTML = '<div class="cz-list-empty">No rules yet.<br>Click <b>+ Add rule</b> to create one.<br><span style="font-size:11px">First matching rule wins.</span></div>';
    return;
  }
  const safeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const distinctByProp = {
    category: colorizeGetDistinctValues("category"),
    file: colorizeGetDistinctValues("file")
  };
  let html = "";
  colorize.rules.forEach((rule, ri) => {
    const cnt = rule._count || 0;
    let condsHtml = "";
    rule.conditions.forEach((cond, ci) => {
      const prefix = ci === 0 ? '<span class="cz-cond-and"></span>' : '<span class="cz-cond-and">AND</span>';
      const propOpts = CZ_RULE_PROPS.map((p) => `<option value="${p.v}"${cond.prop === p.v ? " selected" : ""}>${p.label}</option>`).join("");
      const opOpts = CZ_OPERATORS.map((o) => `<option value="${o.v}"${cond.op === o.v ? " selected" : ""}>${o.label}</option>`).join("");
      let valueHtml;
      const enumVals = distinctByProp[cond.prop];
      if (enumVals && enumVals.length) {
        const valOpts = ['<option value="">\u2014 pick \u2014</option>'].concat(enumVals.map((v) => `<option value="${safeAttr(v)}"${cond.value === v ? " selected" : ""}>${safeAttr(v)}</option>`)).join("");
        valueHtml = `<select class="cz-cond-val" onchange="colorizeUpdateCondition(${ri},${ci},'value',this.value)">${valOpts}</select>`;
      } else {
        valueHtml = `<input class="cz-cond-val" type="text" value="${safeAttr(cond.value || "")}" placeholder="value"
          onchange="colorizeUpdateCondition(${ri},${ci},'value',this.value)">`;
      }
      condsHtml += `<div class="cz-cond">
        ${prefix}
        <select class="cz-cond-prop" onchange="colorizeUpdateCondition(${ri},${ci},'prop',this.value)">${propOpts}</select>
        <select class="cz-cond-op" onchange="colorizeUpdateCondition(${ri},${ci},'op',this.value)">${opOpts}</select>
        ${valueHtml}
        <button class="cz-cond-del" onclick="colorizeRemoveCondition(${ri},${ci})" title="Remove condition">\xD7</button>
      </div>`;
    });
    html += `<div class="cz-rule" data-rule-idx="${ri}">
      <div class="cz-rule-head">
        <span class="cz-rule-prio">#${ri + 1}</span>
        <label class="cz-swatch" style="background:${rule.color}" title="Change color">
          <input type="color" value="${rule.color}" oninput="colorizeSetRuleColor(${ri}, this.value)">
        </label>
        <input class="cz-rule-name" type="text" value="${safeAttr(rule.name)}"
          onchange="colorizeSetRuleName(${ri}, this.value)" placeholder="Rule name">
        <span class="cz-rule-cnt" title="Matched elements">${cnt}</span>
        <button class="cz-rule-del" onclick="colorizeDeleteRule(${ri})" title="Delete rule">\u{1F5D1}</button>
      </div>
      <div class="cz-rule-conds">
        ${condsHtml}
        <button class="cz-cond-add" onclick="colorizeAddCondition(${ri})">+ condition</button>
      </div>
    </div>`;
  });
  host.innerHTML = html;
}
function colorizeGetDistinctValues(prop) {
  if (prop !== "category" && prop !== "file") return [];
  const set = /* @__PURE__ */ new Set();
  for (let mi = 0; mi < 2; mi++) {
    const props = colorize.propsCache[mi];
    if (!props) continue;
    for (const eid in props) {
      const v = colorizeGetValue(props[eid], prop);
      if (v) set.add(v);
    }
  }
  const arr = [...set];
  arr.sort((a, b) => a.localeCompare(b));
  return arr;
}
function colorizeGetValue(e, prop) {
  if (!e) return null;
  let v;
  switch (prop) {
    case "category":
      v = ifcClassToRevitCategory(e.type);
      break;
    case "type":
      v = e.objectType || e.type;
      break;
    case "name":
      v = e.name;
      break;
    case "tag":
      v = e.tag;
      break;
    case "file":
      v = e._sourceFile;
      break;
    default:
      v = e[prop];
  }
  if (v === null || v === void 0) return null;
  v = String(v).trim();
  return v === "" ? null : v;
}
function colorizeRenderLegend(entries) {
  const list = document.getElementById("czList");
  if (!entries.length) {
    list.innerHTML = '<div class="cz-list-empty">No values found for this property.</div>';
    return;
  }
  const safeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let html = "";
  for (const e of entries) {
    const hex = colorForValue(e.value);
    const hidden = colorize.valueVisible[e.value] === false;
    const encVal = encodeURIComponent(e.value);
    html += `<div class="cz-row${hidden ? " hidden-value" : ""}" data-value="${encVal}">
      <span class="cz-row-visible" onclick="colorizeToggleValue('${encVal}')" title="${hidden ? "Show" : "Hide"}">${hidden ? "\u25CB" : "\u25CF"}</span>
      <label class="cz-swatch" style="background:${hex}" title="Click to change color">
        <input type="color" value="${hex}" oninput="colorizeSetColor('${encVal}', this.value)">
      </label>
      <span class="cz-val" title="${safeHtml(e.value)}">${safeHtml(e.value)}</span>
      <span class="cz-cnt">${e.count}</span>
    </div>`;
  }
  list.innerHTML = html;
}
window.colorizeSetColor = function(encVal, hex) {
  const v = decodeURIComponent(encVal);
  colorize.valueColors[v] = hex;
  const row = document.querySelector(`.cz-row[data-value="${encVal}"] .cz-swatch`);
  if (row) row.style.background = hex;
  const color = new THREE.Color(hex);
  for (const sub of colorize.subsets) {
    if (sub.userData.colorizeValue === v) {
      sub.traverse((ch) => {
        if (ch.isMesh) {
          const ms = Array.isArray(ch.material) ? ch.material : [ch.material];
          ms.forEach((m) => {
            m.color = color;
            m.needsUpdate = true;
          });
        }
      });
    }
  }
};
window.colorizeToggleValue = async function(encVal) {
  const v = decodeURIComponent(encVal);
  const cur = colorize.valueVisible[v] !== false;
  colorize.valueVisible[v] = !cur;
  await applyColorize();
};
window.colorizeResetColors = async function() {
  if (colorize.mode === "rules") {
    colorize.rules = [];
    colorizeRenderRules();
  } else {
    colorize.valueColors = {};
  }
  await applyColorize();
};
window.colorizeClear = function() {
  colorizeDisposeSubsets();
  colorizeFadeBase(false);
  colorize.active = false;
  colorize.valueVisible = {};
  document.getElementById("btnColorize").classList.remove("active");
  document.getElementById("colorizePanel").classList.remove("show");
  document.getElementById("colorizePanel").classList.remove("collapsed");
  const sp = document.getElementById("czSchemesPanel");
  if (sp) sp.style.display = "none";
};
window.colorizeToggleCollapse = function() {
  const panel = document.getElementById("colorizePanel");
  const btn = document.getElementById("czCollapseBtn");
  const title = document.getElementById("czTitle");
  const collapsed = panel.classList.toggle("collapsed");
  btn.textContent = collapsed ? "+" : "\u2013";
  btn.title = collapsed ? "Expand" : "Collapse";
  if (collapsed) {
    const hint = colorize.mode === "rules" ? `Colorize \u2014 ${colorize.rules.length} rule${colorize.rules.length === 1 ? "" : "s"}` : `Colorize \u2014 ${colorize.property || "category"}`;
    title.textContent = hint;
  } else {
    title.textContent = "Colorize";
  }
};
const CZ_STORAGE_KEY = "ifc-delta-color-schemes-v1";
function colorizeReadSchemes() {
  try {
    const raw = localStorage.getItem(CZ_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    log("Colorize: schemes read error", e?.message);
    return {};
  }
}
function colorizeWriteSchemes(schemes) {
  try {
    localStorage.setItem(CZ_STORAGE_KEY, JSON.stringify(schemes));
    return true;
  } catch (e) {
    log("Colorize: schemes write error", e?.message);
    alert("Could not save scheme: browser storage is full or blocked.");
    return false;
  }
}
window.colorizeSaveScheme = function() {
  if (!colorize.active) {
    alert("Turn on Colorize first, then save.");
    return;
  }
  const name = (prompt("Name for this color scheme:", "My scheme") || "").trim();
  if (!name) return;
  const schemes = colorizeReadSchemes();
  if (schemes[name]) {
    if (!confirm('A scheme named "' + name + '" already exists. Overwrite?')) return;
  }
  schemes[name] = {
    mode: colorize.mode,
    property: colorize.property,
    rules: JSON.parse(JSON.stringify(colorize.rules || [])),
    // deep clone
    valueColors: { ...colorize.valueColors || {} },
    savedAt: Date.now()
  };
  if (colorizeWriteSchemes(schemes)) {
    log('Colorize: saved scheme "' + name + '"');
    const sp = document.getElementById("czSchemesPanel");
    if (sp && sp.style.display !== "none") colorizeRenderSchemes();
  }
};
window.colorizeToggleSchemesPanel = function() {
  const sp = document.getElementById("czSchemesPanel");
  if (!sp) return;
  if (sp.style.display === "none" || !sp.style.display) {
    colorizeRenderSchemes();
    sp.style.display = "block";
  } else {
    sp.style.display = "none";
  }
};
function colorizeRenderSchemes() {
  const sp = document.getElementById("czSchemesPanel");
  if (!sp) return;
  const schemes = colorizeReadSchemes();
  const names = Object.keys(schemes).sort((a, b) => (schemes[b].savedAt || 0) - (schemes[a].savedAt || 0));
  if (!names.length) {
    sp.innerHTML = '<div class="cz-schemes-empty">No saved schemes yet.<br><span style="font-size:11px">Click \u{1F4BE} Save to save the current setup.</span></div>';
    return;
  }
  const safeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  for (const n of names) {
    const s = schemes[n];
    const when = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : "";
    const modeLabel = s.mode === "rules" ? (s.rules || []).length + "r" : s.property || "auto";
    html += `<div class="cz-scheme-row" onclick="colorizeLoadScheme('${safeAttr(n)}')">
      <span class="cz-scheme-name" title="${safeAttr(n)}">${safeAttr(n)}</span>
      <span class="cz-scheme-meta" title="${when}">${modeLabel}</span>
      <button class="cz-scheme-del" onclick="event.stopPropagation();colorizeDeleteScheme('${safeAttr(n)}')" title="Delete">\u{1F5D1}</button>
    </div>`;
  }
  sp.innerHTML = html;
}
window.colorizeLoadScheme = async function(name) {
  const schemes = colorizeReadSchemes();
  const s = schemes[name];
  if (!s) {
    alert("Scheme not found: " + name);
    return;
  }
  colorize.mode = s.mode === "rules" ? "rules" : "auto";
  colorize.property = s.property || "category";
  colorize.rules = JSON.parse(JSON.stringify(s.rules || []));
  colorize.valueColors = { ...s.valueColors || {} };
  document.getElementById("czTabAuto").classList.toggle("active", colorize.mode === "auto");
  document.getElementById("czTabRules").classList.toggle("active", colorize.mode === "rules");
  document.getElementById("czViewAuto").style.display = colorize.mode === "auto" ? "" : "none";
  document.getElementById("czViewRules").style.display = colorize.mode === "rules" ? "flex" : "none";
  const sel = document.getElementById("czProp");
  if (sel && colorize.mode === "auto") sel.value = colorize.property;
  if (colorize.mode === "rules") colorizeRenderRules();
  document.getElementById("czSchemesPanel").style.display = "none";
  if (!colorize.active) {
    if (compareResult) {
      try {
        window.exitCompare && exitCompare();
      } catch (e) {
      }
    }
    colorize.active = true;
    document.getElementById("btnColorize").classList.add("active");
    document.getElementById("colorizePanel").classList.add("show");
  }
  await applyColorize();
  log('Colorize: loaded scheme "' + name + '"');
};
window.colorizeDeleteScheme = function(name) {
  if (!confirm('Delete scheme "' + name + '"?')) return;
  const schemes = colorizeReadSchemes();
  delete schemes[name];
  colorizeWriteSchemes(schemes);
  colorizeRenderSchemes();
};
function colorizeDisposeSubsets() {
  for (const sub of colorize.subsets) {
    if (sub.parent) sub.parent.remove(sub);
  }
  colorize.subsets = [];
}
function colorizeFadeBase(fade) {
  for (let i = 0; i < 2; i++) {
    if (!loadedModels[i]) continue;
    loadedModels[i].traverse((c) => {
      if (!c.isMesh) return;
      if (fade) {
        if (!c.userData._origMaterials) {
          c.userData._origMaterials = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
        }
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.color = new THREE.Color(12633292);
          m.transparent = true;
          m.opacity = 0.15;
          m.depthWrite = false;
          m.needsUpdate = true;
        });
      } else {
        if (c.userData._origMaterials) {
          c.material = c.userData._origMaterials;
          delete c.userData._origMaterials;
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m) => {
            m.needsUpdate = true;
          });
        }
      }
    });
  }
}
window._colorizeInvalidate = function(mi) {
  if (mi === void 0) {
    colorize.propsCache = [null, null];
  } else colorize.propsCache[mi] = null;
};
function getElementBBox(modelIdx, expressID) {
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  let found = false;
  const scan = (mesh) => {
    if (!mesh.geometry?.attributes?.expressID || !mesh.geometry?.attributes?.position) return;
    const eids = mesh.geometry.attributes.expressID.array;
    const pos = mesh.geometry.attributes.position.array;
    const wm = mesh.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < eids.length; i++) {
      if (eids[i] !== expressID) continue;
      const pi = i * 3;
      if (pi + 2 >= pos.length || isNaN(pos[pi])) continue;
      v.set(pos[pi], pos[pi + 1], pos[pi + 2]).applyMatrix4(wm);
      if (isNaN(v.x)) continue;
      mnX = Math.min(mnX, v.x);
      mxX = Math.max(mxX, v.x);
      mnY = Math.min(mnY, v.y);
      mxY = Math.max(mxY, v.y);
      mnZ = Math.min(mnZ, v.z);
      mxZ = Math.max(mxZ, v.z);
      found = true;
    }
  };
  if (loadedModels[modelIdx]) loadedModels[modelIdx].traverse((c) => {
    if (c.isMesh) scan(c);
  });
  scene.traverse((c) => {
    if (c.isMesh && c.userData?.srcModelIdx === modelIdx) scan(c);
  });
  if (!found) return null;
  return {
    size: { x: mxX - mnX, y: mxY - mnY, z: mxZ - mnZ },
    center: { x: (mnX + mxX) / 2, y: (mnY + mxY) / 2, z: (mnZ + mxZ) / 2 }
  };
}
let hiddenExpressIDs = /* @__PURE__ */ new Set();
let hiddenTypes = /* @__PURE__ */ new Set();
window.ctxAction = function(action) {
  const menu = document.getElementById("ctxMenu");
  menu.classList.remove("show");
  if (action === "showAll") {
    showAllHidden();
    return;
  }
  if (!ctxTarget) {
    return;
  }
  const eid = ctxTarget.expressID;
  const mi = ctxTarget.modelIdx;
  const bbox = ctxTarget.bbox;
  const typeName = ctxTarget.typeName;
  if (action === "hide") {
    hideExpressID(eid, mi);
    return;
  }
  if (action === "isolate") {
    isolateExpressID(eid, mi);
    return;
  }
  if (action === "hideType" && typeName) {
    hideByType(typeName);
    return;
  }
  if (action === "isolateType" && typeName) {
    isolateByType(typeName, mi);
    return;
  }
  if (action === "sectionFit" && bbox) {
    sectionAroundElement(bbox);
    return;
  }
  if (action === "sectionPlane") {
    sectionPlanParallelToFace();
    return;
  }
  if (action === "zoom" && bbox) {
    zoomToElement(bbox);
    return;
  }
  if (action === "props" && eid != null && mi >= 0) {
    ifcLoader.ifcManager.getItemProperties(loadedModels[mi].modelID, eid, true).then((p) => {
      if (p) showProps(p, mi);
    });
    return;
  }
};
function hideExpressID(eid, mi) {
  if (!ifcLoader || !loadedModels[mi]) return;
  hiddenExpressIDs.add(mi + "_" + eid);
  if (compareResult) {
    applyCatVis();
  } else {
    rebuildModelSubset(mi);
  }
  document.getElementById("btnShowAll").style.display = "";
}
function hideByType(typeName) {
  const catIDs = window._catModelIDs || {};
  const ids = catIDs[typeName];
  if (ids) {
    for (let mi = 0; mi < 2; mi++) {
      if (ids[mi] && ids[mi].length > 0) {
        ids[mi].forEach((id) => hiddenExpressIDs.add(mi + "_" + id));
        if (compareResult) {
          applyCatVis();
        } else {
          rebuildModelSubset(mi);
        }
      }
    }
  }
  document.getElementById("btnShowAll").style.display = "";
}
function rebuildModelSubset(mi) {
  if (!ifcLoader || !loadedModels[mi]) return;
  const allIDs = getAllExpressIDsForModel(mi);
  let showIDs = allIDs;
  if (isolatedIDs) {
    showIDs = showIDs.filter((id) => isolatedIDs.has(id));
  }
  if (hiddenExpressIDs.size > 0) {
    showIDs = showIDs.filter((id) => !hiddenExpressIDs.has(mi + "_" + id));
  }
  const hiddenCount = allIDs.length - showIDs.length;
  visSubsets = visSubsets.filter((s) => {
    if (s.userData?.srcModelIdx === mi) {
      if (s.parent) s.parent.remove(s);
      return false;
    }
    return true;
  });
  loadedModels[mi].visible = false;
  if (showIDs.length === 0) return;
  if (!isolatedIDs && hiddenCount === 0) {
    loadedModels[mi].visible = true;
    return;
  }
  try {
    const sub = ifcLoader.ifcManager.createSubset({ modelID: loadedModels[mi].modelID, ids: showIDs, removePrevious: true, customID: "vis_" + mi, scene });
    if (sub) {
      sub.position.copy(loadedModels[mi].position);
      sub.updateMatrixWorld(true);
      sub.userData.srcModelIdx = mi;
      sub.traverse((c) => {
        if (c.isMesh) {
          c.userData.srcModelIdx = mi;
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m) => {
            m.clippingPlanes = clipPlanes;
            m.side = THREE.DoubleSide;
          });
        }
      });
      visSubsets.push(sub);
    }
  } catch (e) {
    console.error("[REBUILD] error:", e);
  }
}
let isolatedIDs = null;
function isolateExpressID(eid, mi) {
  isolatedIDs = /* @__PURE__ */ new Set([eid]);
  for (let i = 0; i < 2; i++) {
    if (!loadedModels[i]) continue;
    rebuildModelSubset(i);
  }
  document.getElementById("btnShowAll").style.display = "";
}
function isolateByType(typeName, mi) {
  const catIDs = window._catModelIDs || {};
  isolatedIDs = /* @__PURE__ */ new Set();
  const ids = catIDs[typeName];
  if (ids) {
    for (let i = 0; i < 2; i++) {
      if (ids[i]) ids[i].forEach((id) => isolatedIDs.add(id));
    }
  }
  for (let i = 0; i < 2; i++) {
    if (loadedModels[i]) rebuildModelSubset(i);
  }
  document.getElementById("btnShowAll").style.display = "";
}
function getAllExpressIDsForModel(mi) {
  const ids = /* @__PURE__ */ new Set();
  if (!loadedModels[mi]) return [];
  loadedModels[mi].traverse((c) => {
    if (c.isMesh && c.geometry?.attributes?.expressID) {
      const arr = c.geometry.attributes.expressID.array;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] > 0) ids.add(arr[i]);
      }
    }
  });
  return [...ids];
}
let visSubsets = [];
window.showAllHidden = function() {
  hiddenExpressIDs.clear();
  hiddenTypes.clear();
  isolatedIDs = null;
  visSubsets.forEach((s) => {
    if (s.parent) s.parent.remove(s);
  });
  visSubsets = [];
  const visA = document.getElementById("visA")?.checked ?? true;
  const visB = document.getElementById("visB")?.checked ?? true;
  if (loadedModels[0]) loadedModels[0].visible = visA;
  if (loadedModels[1]) loadedModels[1].visible = visB;
  if (compareResult) applyCatVis();
  else if (typeof applyCategoryVisibilityViewMode === "function") applyCategoryVisibilityViewMode();
  document.getElementById("btnShowAll").style.display = "none";
};
function sectionThroughElement(bbox, axis) {
  if (!bbox) {
    return;
  }
  const b = modelBounds;
  const c = bbox.center;
  const s = bbox.size;
  ["slXp", "slYp", "slZp"].forEach((id) => {
    document.getElementById(id).value = 100;
  });
  ["slXn", "slYn", "slZn"].forEach((id) => {
    document.getElementById(id).value = 0;
  });
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSl = (val, mn, range) => Math.max(0, Math.min(100, Math.round((val - mn) / range * 100)));
  const thickness = Math.max(s.x, s.y, s.z) * 0.5 + 1;
  if (axis === "x") {
    document.getElementById("slXp").value = toSl(c.x + thickness, b.min.x, sx);
    document.getElementById("slXn").value = toSl(c.x - thickness, b.min.x, sx);
  } else if (axis === "y") {
    document.getElementById("slYp").value = toSl(c.y + thickness, b.min.y, sy);
    document.getElementById("slYn").value = toSl(c.y - thickness, b.min.y, sy);
  } else {
    document.getElementById("slZp").value = toSl(c.z + thickness, b.min.z, sz);
    document.getElementById("slZn").value = toSl(c.z - thickness, b.min.z, sz);
  }
  if (!sectionActive) {
    sectionActive = true;
    document.getElementById("sectionPanel").classList.add("show");
    document.getElementById("btnSection").classList.add("active");
    createSectionBox3D();
  }
  updateSectionFromSliders();
  zoomToElement(bbox);
}
function sectionAroundElement(bbox) {
  if (!bbox) return;
  const b = modelBounds;
  const c = bbox.center, s = bbox.size;
  const pad = Math.max(Math.min(Math.max(s.x, s.y, s.z) * 0.3, 5), 1);
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const slUp = (v, mn, r) => Math.max(0, Math.min(100, Math.ceil((v - mn) / r * 100)));
  const slDn = (v, mn, r) => Math.max(0, Math.min(100, Math.floor((v - mn) / r * 100)));
  const ensureMin = (lo, hi, m) => {
    if (hi - lo >= m) return [lo, hi];
    const mid = (lo + hi) / 2, half = m / 2;
    let nlo = Math.max(0, Math.floor(mid - half)), nhi = Math.min(100, Math.ceil(mid + half));
    if (nhi - nlo < m) {
      if (nlo === 0) nhi = Math.min(100, nlo + m);
      else nlo = Math.max(0, nhi - m);
    }
    return [nlo, nhi];
  };
  let xLo = slDn(c.x - s.x / 2 - pad, b.min.x, sx), xHi = slUp(c.x + s.x / 2 + pad, b.min.x, sx);
  let yLo = slDn(c.y - s.y / 2 - pad, b.min.y, sy), yHi = slUp(c.y + s.y / 2 + pad, b.min.y, sy);
  let zLo = slDn(c.z - s.z / 2 - pad, b.min.z, sz), zHi = slUp(c.z + s.z / 2 + pad, b.min.z, sz);
  [xLo, xHi] = ensureMin(xLo, xHi, 2);
  [yLo, yHi] = ensureMin(yLo, yHi, 2);
  [zLo, zHi] = ensureMin(zLo, zHi, 2);
  document.getElementById("slXp").value = xHi;
  document.getElementById("slXn").value = xLo;
  document.getElementById("slYp").value = yHi;
  document.getElementById("slYn").value = yLo;
  document.getElementById("slZp").value = zHi;
  document.getElementById("slZn").value = zLo;
  if (!sectionActive) {
    sectionActive = true;
    document.getElementById("sectionPanel").classList.add("show");
    document.getElementById("btnSection").classList.add("active");
    createSectionBox3D();
  }
  updateSectionFromSliders();
  zoomToElement(bbox);
}
function sectionPlanParallelToFace() {
  if (!ctxTarget) {
    return;
  }
  const normal = ctxTarget.faceNormal;
  const point = ctxTarget.hitPoint;
  if (!normal || !point) {
    return;
  }
  const b = modelBounds;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSl = (val, mn, range) => Math.max(0, Math.min(100, Math.round((val - mn) / range * 100)));
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  ["slXp", "slYp", "slZp"].forEach((id) => {
    document.getElementById(id).value = 100;
  });
  ["slXn", "slYn", "slZn"].forEach((id) => {
    document.getElementById(id).value = 0;
  });
  if (ax >= ay && ax >= az) {
    if (normal.x > 0) {
      document.getElementById("slXp").value = toSl(point.x, b.min.x, sx);
    } else {
      document.getElementById("slXn").value = toSl(point.x, b.min.x, sx);
    }
  } else if (ay >= ax && ay >= az) {
    if (normal.y > 0) {
      document.getElementById("slYp").value = toSl(point.y, b.min.y, sy);
    } else {
      document.getElementById("slYn").value = toSl(point.y, b.min.y, sy);
    }
  } else {
    if (normal.z > 0) {
      document.getElementById("slZp").value = toSl(point.z, b.min.z, sz);
    } else {
      document.getElementById("slZn").value = toSl(point.z, b.min.z, sz);
    }
  }
  if (!sectionActive) {
    sectionActive = true;
    document.getElementById("sectionPanel").classList.add("show");
    document.getElementById("btnSection").classList.add("active");
    createSectionBox3D();
  }
  updateSectionFromSliders();
  log("Section plane created at face");
}
function zoomToElement(bbox) {
  if (!bbox || !bbox.center) {
    return;
  }
  const c = bbox.center, s = bbox.size;
  const dist = Math.max(s.x, s.y, s.z) * 2 + 5;
  camera.position.set(c.x + dist * 0.5, c.y + dist * 0.4, c.z + dist * 0.5);
  controls.target.set(c.x, c.y, c.z);
  controls.update();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") {
    if (ctxTarget) hideExpressID(ctxTarget.expressID, ctxTarget.modelIdx);
  }
  if (e.key === "i" || e.key === "I") {
    if (ctxTarget) isolateExpressID(ctxTarget.expressID, ctxTarget.modelIdx);
  }
  if (e.key === "Escape") {
    clearHighlight();
    document.getElementById("propArea").innerHTML = '<div class="prop-empty">Click element in 3D to inspect</div>';
    if (sectionActive) {
      toggleSectionBox();
    }
  }
});
function clearHighlight() {
  if (window._lastHL) {
    try {
      if (window._lastHL.subset && window._lastHL.subset.parent) {
        window._lastHL.subset.parent.remove(window._lastHL.subset);
      }
      try {
        ifcLoader.ifcManager.removeSubset(window._lastHL.mid, window._hlMat, "userHighlight");
      } catch (e2) {
        try {
          ifcLoader.ifcManager.removeSubset(window._lastHL.mid, window._hlMat);
        } catch (e3) {
        }
      }
    } catch (e) {
    }
    window._lastHL = null;
  }
}
async function initIFC() {
  setStatus("loading", "Loading WASM...");
  try {
    ifcLoader = new IFCLoader();
    await ifcLoader.ifcManager.setWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/");
    await ifcLoader.ifcManager.applyWebIfcConfig({ USE_FAST_BOOLS: false });
    await ifcLoader.ifcManager.parser.setupOptionalCategories({ [IFCSPACE]: false, [IFCOPENINGELEMENT]: false });
    log("WASM ready");
    setStatus("done", "Ready");
    setTimeout(() => setStatus("", ""), 2e3);
    return true;
  } catch (e) {
    log("WASM err:", e.message);
    setStatus("error", e.message);
    return false;
  }
}
function fileA_name_if_set(idx) {
  try {
    const span = document.querySelector(`#uc${idx} .uc-file`);
    return span?.textContent?.trim() || "Model " + (idx === 0 ? "A" : "B");
  } catch (e) {
    return "Model " + (idx === 0 ? "A" : "B");
  }
}
async function readProjectUnits(modelID) {
  const out = {
    lengthFactor: 1e3,
    lengthUnit: "mm",
    // default: assume metres → *1000 to get mm
    areaFactor: 1,
    areaUnit: "m\xB2",
    volumeFactor: 1,
    volumeUnit: "m\xB3"
  };
  const mgr = ifcLoader.ifcManager;
  try {
    const api = mgr.state.api;
    const projIDs = await api.GetLineIDsWithType(modelID, IFCPROJECT);
    const cnt = projIDs.size();
    if (!cnt) return out;
    const projID = projIDs.get(0);
    const project = await mgr.getItemProperties(modelID, projID, true);
    const unitsRoot = project?.UnitsInContext;
    let unitAssignment = unitsRoot;
    if (unitsRoot?.value !== void 0 && typeof unitsRoot.value === "number") {
      unitAssignment = await mgr.getItemProperties(modelID, unitsRoot.value, true);
    }
    if (!unitAssignment?.Units) return out;
    const units = Array.isArray(unitAssignment.Units) ? unitAssignment.Units : [unitAssignment.Units];
    const SI_PREFIX = {
      EXA: 1e18,
      PETA: 1e15,
      TERA: 1e12,
      GIGA: 1e9,
      MEGA: 1e6,
      KILO: 1e3,
      HECTO: 100,
      DECA: 10,
      DECI: 0.1,
      CENTI: 0.01,
      MILLI: 1e-3,
      MICRO: 1e-6,
      NANO: 1e-9,
      PICO: 1e-12,
      FEMTO: 1e-15,
      ATTO: 1e-18
    };
    const resolveUnit = async (u) => {
      if (typeof u?.value === "number") return await mgr.getItemProperties(modelID, u.value, true);
      return u;
    };
    for (const uRef of units) {
      const u = await resolveUnit(uRef);
      if (!u) continue;
      const ut = u.UnitType?.value || u.UnitType;
      const className = IFC_NAMES[u.type] || "";
      if (!ut) continue;
      let factor = 1;
      if (className === "IfcSIUnit") {
        const prefix = u.Prefix?.value || u.Prefix;
        if (prefix && SI_PREFIX[prefix]) factor = SI_PREFIX[prefix];
      } else if (className === "IfcConversionBasedUnit") {
        const convRef = u.ConversionFactor;
        if (convRef) {
          const conv = typeof convRef?.value === "number" ? await mgr.getItemProperties(modelID, convRef.value, true) : convRef;
          const vc = conv?.ValueComponent;
          const numFactor = vc?.value ?? vc;
          if (typeof numFactor === "number") factor = numFactor;
        }
      }
      if (ut === "LENGTHUNIT") {
        out.lengthFactor = factor * 1e3;
        out.lengthUnit = "mm";
      } else if (ut === "AREAUNIT") {
        out.areaFactor = className === "IfcConversionBasedUnit" ? factor * factor : factor;
        out.areaUnit = "m\xB2";
      } else if (ut === "VOLUMEUNIT") {
        out.volumeFactor = className === "IfcConversionBasedUnit" ? factor * factor * factor : factor;
        out.volumeUnit = "m\xB3";
      }
    }
  } catch (e) {
    log("readProjectUnits err:", e?.message);
  }
  return out;
}
async function readSpatialInfo(modelID, modelName) {
  const mgr = ifcLoader.ifcManager;
  const info = {
    projectName: "",
    siteName: "",
    buildingName: "",
    storeys: [],
    // [{expressID, name, elevation}] sorted asc by elev
    sites: [],
    // [{expressID, name, refLat, refLon, refElev}]
    modelName: modelName || "",
    trueNorthAngle: 0
    // rotation angle in radians (0 = Y+ is north, positive = CW)
  };
  try {
    const api = mgr.state.api;
    const projIDs = await api.GetLineIDsWithType(modelID, IFCPROJECT);
    if (projIDs.size()) {
      const p = await mgr.getItemProperties(modelID, projIDs.get(0), false);
      info.projectName = p?.Name?.value || p?.LongName?.value || "";
      try {
        const ctxIDs = await api.GetLineIDsWithType(modelID, 3448662350);
        for (let ci = 0; ci < ctxIDs.size(); ci++) {
          const ctx = await mgr.getItemProperties(modelID, ctxIDs.get(ci), false);
          if (!ctx?.TrueNorth) continue;
          let tn = ctx.TrueNorth;
          if (tn.value !== void 0) tn = await mgr.getItemProperties(modelID, tn.value, false);
          const coords = tn?.DirectionRatios;
          if (coords && coords.length >= 2) {
            const nx = coords[0]?.value ?? coords[0] ?? 0;
            const ny = coords[1]?.value ?? coords[1] ?? 0;
            if (Math.abs(nx) > 1e-4 || Math.abs(ny) > 1e-4) {
              info.trueNorthAngle = Math.atan2(nx, ny);
              log(`TrueNorth: direction=(${nx.toFixed(4)}, ${ny.toFixed(4)}), angle=${(info.trueNorthAngle * 180 / Math.PI).toFixed(1)}\xB0`);
            }
          }
          break;
        }
      } catch (tnErr) {
        log("TrueNorth read err:", tnErr?.message);
      }
    }
    const siteIDs = await api.GetLineIDsWithType(modelID, IFCSITE);
    for (let si = 0; si < siteIDs.size(); si++) {
      const s = await mgr.getItemProperties(modelID, siteIDs.get(si), false);
      if (!s) continue;
      if (si === 0) info.siteName = s?.Name?.value || s?.LongName?.value || "";
      info.sites.push({
        expressID: siteIDs.get(si),
        name: s?.Name?.value || s?.LongName?.value || "",
        refLat: s?.RefLatitude ?? null,
        refLon: s?.RefLongitude ?? null,
        refElev: s?.RefElevation?.value ?? s?.RefElevation ?? null
      });
    }
    const bldgIDs = await api.GetLineIDsWithType(modelID, IFCBUILDING);
    if (bldgIDs.size()) {
      const b = await mgr.getItemProperties(modelID, bldgIDs.get(0), false);
      info.buildingName = b?.Name?.value || b?.LongName?.value || "";
    }
    const storeyIDs = await api.GetLineIDsWithType(modelID, IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyIDs.size(); i++) {
      const sid = storeyIDs.get(i);
      const s = await mgr.getItemProperties(modelID, sid, false);
      if (!s) continue;
      const elev = s.Elevation?.value ?? 0;
      info.storeys.push({
        expressID: sid,
        name: s.Name?.value || s.LongName?.value || "Storey " + sid,
        elevation: elev
      });
    }
    info.storeys.sort((a, b) => a.elevation - b.elevation);
  } catch (e) {
    log("readSpatialInfo err:", e?.message);
  }
  return info;
}
async function loadIFC(idx) {
  const file = files[idx];
  if (!file || !ifcLoader) return;
  const st = idx < 2 ? document.getElementById("us" + idx) : null;
  if (st) {
    st.className = "uc-status prog";
    st.textContent = "\u23F3 Parsing...";
  }
  try {
    if (loadedModels[idx]) {
      scene.remove(loadedModels[idx]);
      loadedModels[idx] = null;
    }
    if (window._colorizeInvalidate) window._colorizeInvalidate(idx);
    if (!loadedModels.some((m) => !!m)) {
      sharedCenterOffset = null;
      modelBounds.min.set(0, 0, 0);
      modelBounds.max.set(0, 0, 0);
    }
    const buf = await file.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf]));
    const model = await new Promise((ok, no) => {
      ifcLoader.load(url, (m) => ok(m), (p) => {
        if (p.total > 0 && st) st.textContent = "\u23F3 " + Math.round(p.loaded / p.total * 100) + "%";
      }, (e) => no(e));
    });
    URL.revokeObjectURL(url);
    let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity, vc = 0;
    const scan = (g) => {
      if (!g?.attributes?.position) return;
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        if (isNaN(a[i])) {
          a[i] = a[i + 1] = a[i + 2] = 0;
          continue;
        }
        vc++;
        if (a[i] < mnX) mnX = a[i];
        if (a[i] > mxX) mxX = a[i];
        if (a[i + 1] < mnY) mnY = a[i + 1];
        if (a[i + 1] > mxY) mxY = a[i + 1];
        if (a[i + 2] < mnZ) mnZ = a[i + 2];
        if (a[i + 2] > mxZ) mxZ = a[i + 2];
      }
      g.attributes.position.needsUpdate = true;
    };
    if (model.geometry) scan(model.geometry);
    model.traverse((c) => {
      if (c.isMesh) scan(c.geometry);
    });
    if (!isFinite(mnX) || vc === 0) throw new Error("No valid geometry");
    let cx, cy, cz;
    const anyOtherLoaded = loadedModels.some((m) => !!m);
    if (sharedCenterOffset && anyOtherLoaded) {
      cx = sharedCenterOffset.x;
      cy = sharedCenterOffset.y;
      cz = sharedCenterOffset.z;
      log(`Model ${idx}: reusing shared offset (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`);
    } else {
      cx = (mnX + mxX) / 2;
      cy = (mnY + mxY) / 2;
      cz = (mnZ + mxZ) / 2;
      sharedCenterOffset = { x: cx, y: cy, z: cz };
      log(`Model ${idx}: setting shared offset (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`);
    }
    model.position.set(-cx, -cy, -cz);
    model.updateMatrixWorld(true);
    log(`Model ${idx}: ${vc} verts, size ${(mxX - mnX).toFixed(0)}\xD7${(mxY - mnY).toFixed(0)}\xD7${(mxZ - mnZ).toFixed(0)}`);
    const wMnX = mnX - cx, wMnY = mnY - cy, wMnZ = mnZ - cz;
    const wMxX = mxX - cx, wMxY = mxY - cy, wMxZ = mxZ - cz;
    if (!anyOtherLoaded) {
      modelBounds.min.set(wMnX, wMnY, wMnZ);
      modelBounds.max.set(wMxX, wMxY, wMxZ);
    } else {
      modelBounds.min.set(Math.min(modelBounds.min.x, wMnX), Math.min(modelBounds.min.y, wMnY), Math.min(modelBounds.min.z, wMnZ));
      modelBounds.max.set(Math.max(modelBounds.max.x, wMxX), Math.max(modelBounds.max.y, wMxY), Math.max(modelBounds.max.z, wMxZ));
    }
    model.traverse((c) => {
      if (c.isMesh) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.side = THREE.DoubleSide;
          m.clippingPlanes = clipPlanes;
          m.clipShadows = true;
          if (m.opacity < 0.1) {
            m.opacity = 0.85;
            m.transparent = true;
          }
          if (m.color && m.color.r < 0.05 && m.color.g < 0.05 && m.color.b < 0.05) {
            m.color.set(8952234);
          }
          m.depthWrite = !m.transparent || m.opacity > 0.5;
        });
      }
    });
    while (loadedModels.length <= idx) loadedModels.push(null);
    loadedModels[idx] = model;
    scene.add(model);
    document.getElementById("emptyVP").style.display = "none";
    try {
      const units = await readProjectUnits(model.modelID);
      const spatial = await readSpatialInfo(model.modelID, fileA_name_if_set(idx));
      loadedModels[idx].units = units;
      loadedModels[idx].spatial = spatial;
      loadedModels[idx].fileName = files[idx]?.name || "model_" + idx;
      log(`Model ${idx}: lengthFactor=${units.lengthFactor}mm, areaFactor=${units.areaFactor}m\xB2, ${spatial.storeys.length} storeys`);
      if (window.requestPlanRebuild) window.requestPlanRebuild();
    } catch (ue) {
      log("Units/spatial read error:", ue?.message);
    }
    const bSize = new THREE.Vector3().subVectors(modelBounds.max, modelBounds.min);
    const mx2 = Math.max(bSize.x, bSize.y, bSize.z, mxX - mnX, mxY - mnY, mxZ - mnZ);
    const dist = mx2 * 1.5;
    camera.near = Math.max(mx2 * 1e-3, 0.01);
    camera.far = Math.max(mx2 * 50, 5e3);
    camera.updateProjectionMatrix();
    const bCenter = new THREE.Vector3().addVectors(modelBounds.min, modelBounds.max).multiplyScalar(0.5);
    camera.position.set(bCenter.x + dist * 0.6, bCenter.y + dist * 0.5, bCenter.z + dist * 0.6);
    controls.target.copy(bCenter);
    controls.update();
    if (idx < 2) {
      if (st) {
        st.className = "uc-status ok";
        st.textContent = "\u2713 Loaded";
      }
      document.getElementById("visRow" + idx).style.display = "block";
      document.getElementById("btnCompare").disabled = !(loadedModels[0] && loadedModels[1]);
    } else {
      fedRenderSlots();
    }
    if (clashMode) {
      if (files[0]) document.getElementById("clashFileA").textContent = files[0].name;
      if (files[1]) document.getElementById("clashFileB").textContent = files[1].name;
      document.getElementById("clashFileA").classList.toggle("loaded", !!loadedModels[0]);
      document.getElementById("clashFileB").classList.toggle("loaded", !!loadedModels[1]);
      document.getElementById("btnRunClash").disabled = !(loadedModels[0] && loadedModels[1]);
    }
    await buildCatFromModels();
    sgState.cachedCtx = null;
  } catch (e) {
    log("Load err:", e.message);
    if (st) {
      st.className = "uc-status err";
      st.textContent = "\u2715 " + e.message;
    }
    if (idx >= 2) fedRenderSlots();
  }
}
async function buildCatFromModels() {
  const api = ifcLoader?.ifcManager?.state?.api;
  if (!api) return;
  window._catData = {};
  window._catModelIDs = {};
  const PRODUCT_TYPES = [
    // Architectural & structural (named imports from web-ifc)
    IFCWALL,
    IFCWALLSTANDARDCASE,
    IFCSLAB,
    IFCCOLUMN,
    IFCBEAM,
    IFCDOOR,
    IFCWINDOW,
    IFCROOF,
    IFCSTAIR,
    IFCSTAIRFLIGHT,
    IFCRAILING,
    IFCPLATE,
    IFCMEMBER,
    IFCCURTAINWALL,
    IFCFOOTING,
    IFCBUILDINGELEMENTPROXY,
    IFCFURNISHINGELEMENT,
    // Abstract MEP parents (occasionally emitted directly)
    IFCFLOWSEGMENT,
    IFCFLOWTERMINAL,
    IFCFLOWFITTING,
    // ── Concrete MEP subtypes (the ones Revit actually exports) ──
    // Plumbing
    3612865200,
    // IfcPipeSegment
    310824031,
    // IfcPipeFitting
    2474470126,
    // IfcSanitaryTerminal
    4252922144,
    // IfcStackTerminal
    2391406946,
    // IfcWasteTerminal
    1426591983,
    // IfcFireSuppressionTerminal
    4207607924,
    // IfcValve
    90941305,
    // IfcPump
    819412036,
    // IfcFilter
    // HVAC
    3518393246,
    // IfcDuctSegment
    342316401,
    // IfcDuctFitting
    1360408905,
    // IfcDuctSilencer
    2082059205,
    // IfcAirTerminal
    3304561284,
    // IfcAirTerminalBox
    331165859,
    // IfcFan
    763608111,
    // IfcCooledBeam
    1469388950,
    // IfcCoolingTower
    1281925730,
    // IfcCondenser
    4136498852,
    // IfcCoil
    3171933400,
    // IfcDamper
    1758889154,
    // IfcCompressor
    4237592921,
    // IfcChiller
    753842376,
    // IfcBoiler
    4074379575,
    // IfcHumidifier
    25142252,
    // IfcUnitaryEquipment
    3283111854,
    // IfcSpaceHeater
    3026737570,
    // IfcTubeBundle
    // Electrical
    3512223829,
    // IfcCableCarrierFitting
    1051757585,
    // IfcCableCarrierSegment
    3999819293,
    // IfcCableSegment
    1634111441,
    // IfcElectricAppliance
    402227799,
    // IfcElectricDistributionBoard
    264262732,
    // IfcElectricGenerator
    3310460725,
    // IfcElectricMotor
    1904799276,
    // IfcElectricFlowStorageDevice
    862014818,
    // IfcElectricTimeControl
    629592764,
    // IfcLightFixture
    76236018,
    // IfcLamp
    707683696,
    // IfcOutlet
    2176052936,
    // IfcJunctionBox
    3825984169,
    // IfcTransformer
    1973544240,
    // IfcSensor
    2979338954,
    // IfcAlarm
    626022354,
    // IfcController
    3024970846,
    // IfcSwitchingDevice
    987401354,
    // IfcFlowMeter
    3640358203,
    // IfcProtectiveDevice
    2295281155,
    // IfcProtectiveDeviceTrippingUnit
    // Generic distribution
    1945004755,
    // IfcDistributionElement
    3040386961,
    // IfcDistributionFlowElement
    1658829314,
    // IfcEnergyConversionDevice
    4278956645,
    // IfcFlowMovingDevice
    3132237377,
    // IfcFlowStorageDevice
    3508470533,
    // IfcFlowTreatmentDevice
    2058353004,
    // IfcFlowController
    3415622556,
    // IfcDistributionChamberElement
    1335981549,
    // IfcDiscreteAccessory
    1437502449,
    // IfcMedicalDevice
    1687234759,
    // IfcShadingDevice
    900683007
    // IfcFooting (duplicate of IFCFOOTING just to be safe)
  ];
  for (let idx = 0; idx < 2; idx++) {
    if (!loadedModels[idx]) continue;
    const mid = loadedModels[idx].modelID;
    for (const typeNum of PRODUCT_TYPES) {
      try {
        const lines = api.GetLineIDsWithType(mid, typeNum);
        const cnt = lines.size();
        if (cnt === 0) continue;
        const typeName = IFC_NAMES[typeNum] || "IFC_" + typeNum;
        if (!window._catData[typeName]) window._catData[typeName] = { total: 0, added: 0, removed: 0, modified: 0 };
        if (!window._catModelIDs[typeName]) window._catModelIDs[typeName] = {};
        if (!window._catModelIDs[typeName][idx]) window._catModelIDs[typeName][idx] = [];
        for (let i = 0; i < cnt; i++) window._catModelIDs[typeName][idx].push(lines.get(i));
        window._catData[typeName].total += cnt;
      } catch (e) {
      }
    }
  }
  log("Categories found:", Object.keys(window._catData).length, "types");
  document.getElementById("catFilter").classList.add("show");
  document.getElementById("panelTabs").classList.add("show");
  activeCategories = /* @__PURE__ */ new Set();
  buildCatDropdown();
  updateCatTags();
}
let viewSubsets = [];
function applyCategoryVisibilityViewMode() {
  if (!ifcLoader) return;
  if (compareResult) return;
  const showAll = activeCategories.size === 0;
  const showNone = activeCategories.has("__none__");
  const catIDs = window._catModelIDs || {};
  viewSubsets.forEach((s) => {
    if (s.parent) s.parent.remove(s);
  });
  viewSubsets = [];
  for (let idx = 0; idx < 2; idx++) {
    if (!loadedModels[idx]) continue;
    const vis = document.getElementById(idx === 0 ? "visA" : "visB").checked;
    if (!vis || showNone) {
      loadedModels[idx].visible = false;
      continue;
    }
    if (showAll) {
      loadedModels[idx].visible = vis;
      if (vis) loadedModels[idx].traverse((c) => {
        if (c.isMesh) c.visible = true;
      });
      continue;
    }
    loadedModels[idx].visible = false;
    const ids = [];
    activeCategories.forEach((cat) => {
      const catIds = catIDs[cat]?.[idx];
      if (catIds) ids.push(...catIds);
    });
    if (ids.length === 0) continue;
    try {
      const sub = ifcLoader.ifcManager.createSubset({
        modelID: loadedModels[idx].modelID,
        ids,
        removePrevious: true,
        customID: "viewFilter_" + idx,
        scene
        // No material = use original IFC materials
      });
      if (sub) {
        sub.position.copy(loadedModels[idx].position);
        sub.updateMatrixWorld(true);
        sub.traverse((c) => {
          if (c.isMesh) {
            const ms = Array.isArray(c.material) ? c.material : [c.material];
            ms.forEach((m) => {
              m.clippingPlanes = clipPlanes;
              m.side = THREE.DoubleSide;
            });
          }
        });
        viewSubsets.push(sub);
      }
    } catch (e) {
      log("View subset error:", e.message);
    }
  }
}
window.exitCompare = function() {
  const toRemove = [];
  scene.traverse((c) => {
    if (c.isMesh && c.userData?.diffSubset) toRemove.push(c);
  });
  toRemove.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });
  viewSubsets.forEach((s) => {
    if (s.parent) s.parent.remove(s);
  });
  viewSubsets = [];
  compareResult = null;
  for (let idx = 0; idx < 2; idx++) {
    if (!loadedModels[idx]) continue;
    const vis = document.getElementById(idx === 0 ? "visA" : "visB").checked;
    loadedModels[idx].visible = vis;
    loadedModels[idx].traverse((c) => {
      if (c.isMesh) {
        c.visible = true;
        if (c.userData._origMaterials) {
          c.material = c.userData._origMaterials;
          delete c.userData._origMaterials;
        }
      }
    });
  }
  applyCategoryVisibilityViewMode();
  document.getElementById("sumStrip").classList.remove("show");
  document.getElementById("searchW").classList.remove("show");
  document.getElementById("filterB").classList.remove("show");
  document.getElementById("vpLegend").classList.remove("show");
  document.getElementById("btnExport").style.display = "none";
  document.getElementById("btnExportBCF").style.display = "none";
  document.getElementById("btnExitCompare").style.display = "none";
  document.getElementById("eTree").innerHTML = "";
  document.getElementById("eTree").style.display = "";
  document.getElementById("panelTabs").classList.remove("show");
  document.getElementById("issuesList").classList.remove("show");
  document.getElementById("issuesList").innerHTML = "";
  document.getElementById("issueNav").classList.remove("show");
  issuesList = [];
  currentIssueIdx = -1;
  if (sectionActive) {
    sectionActive = false;
    document.getElementById("sectionPanel").classList.remove("show");
    document.getElementById("btnSection").classList.remove("active");
    removeSectionBox3D();
    clipPlanes.forEach((p) => p.constant = 99999);
  }
  log("Exited compare mode");
};
let sectionBox = null;
window.toggleSectionBox = function() {
  sectionActive = !sectionActive;
  document.getElementById("sectionPanel").classList.toggle("show", sectionActive);
  document.getElementById("btnSection").classList.toggle("active", sectionActive);
  if (sectionActive) {
    createSectionBox3D();
    updateSectionFromSliders();
  } else {
    removeSectionBox3D();
    clipPlanes[0].set(new THREE.Vector3(-1, 0, 0), 99999);
    clipPlanes[1].set(new THREE.Vector3(1, 0, 0), 99999);
    clipPlanes[2].set(new THREE.Vector3(0, -1, 0), 99999);
    clipPlanes[3].set(new THREE.Vector3(0, 1, 0), 99999);
    clipPlanes[4].set(new THREE.Vector3(0, 0, -1), 99999);
    clipPlanes[5].set(new THREE.Vector3(0, 0, 1), 99999);
  }
};
function createSectionBox3D() {
  if (sectionBox) removeSectionBox3D();
  const b = modelBounds;
  const group = new THREE.Group();
  group.name = "sectionBox";
  const edgesMat = new THREE.LineBasicMaterial({ color: 2450411, linewidth: 2, depthTest: false, transparent: true, opacity: 0.8 });
  const faceMats = [
    new THREE.MeshBasicMaterial({ color: 15680580, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false }),
    // X+
    new THREE.MeshBasicMaterial({ color: 15680580, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false }),
    // X-
    new THREE.MeshBasicMaterial({ color: 2278750, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false }),
    // Y+
    new THREE.MeshBasicMaterial({ color: 2278750, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false }),
    // Y-
    new THREE.MeshBasicMaterial({ color: 3900150, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false }),
    // Z+
    new THREE.MeshBasicMaterial({ color: 3900150, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false })
    // Z-
  ];
  const arrowMats = [
    new THREE.MeshBasicMaterial({ color: 15680580, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 15680580, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 2278750, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 2278750, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 3900150, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 3900150, depthTest: false })
  ];
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const faces = [];
  const arrows = [];
  const faceConfigs = [
    { axis: "x", dir: 1, rot: [0, Math.PI / 2, 0] },
    // X+
    { axis: "x", dir: -1, rot: [0, -Math.PI / 2, 0] },
    // X-
    { axis: "y", dir: 1, rot: [Math.PI / 2, 0, 0] },
    // Y+
    { axis: "y", dir: -1, rot: [-Math.PI / 2, 0, 0] },
    // Y-
    { axis: "z", dir: 1, rot: [0, 0, 0] },
    // Z+
    { axis: "z", dir: -1, rot: [0, Math.PI, 0] }
    // Z-
  ];
  faceConfigs.forEach((cfg, i) => {
    const pw = cfg.axis === "x" ? sz : sx;
    const ph = cfg.axis === "y" ? sz : sy;
    const faceGeo = new THREE.PlaneGeometry(pw * 1.01, ph * 1.01);
    const face = new THREE.Mesh(faceGeo, faceMats[i]);
    face.renderOrder = 999;
    face.userData = { faceIdx: i, axis: cfg.axis, dir: cfg.dir };
    face.raycast = () => {
    };
    group.add(face);
    faces.push(face);
    const coneGeo = new THREE.ConeGeometry(1, 2.4, 12);
    const cone = new THREE.Mesh(coneGeo, arrowMats[i]);
    cone.renderOrder = 1e3;
    cone.userData = { faceIdx: i, axis: cfg.axis, dir: cfg.dir, isHandle: true };
    group.add(cone);
    arrows.push(cone);
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), edgesMat);
  edges.renderOrder = 998;
  edges.raycast = () => {
  };
  group.add(edges);
  scene.add(group);
  sectionBox = { group, faces, arrows, edges };
  updateSectionBox3DPositions();
  updateSectionHandleSizes();
}
function updateSectionHandleSizes() {
  if (!sectionBox || !camera || !renderer) return;
  const vh = renderer.domElement.clientHeight || 1;
  const fov = (camera.fov || 50) * Math.PI / 180;
  const tanHalfFov = Math.tan(fov / 2);
  const camPos = camera.position;
  const targetRadiusPx = 9;
  const targetOffsetPx = 16;
  for (let i = 0; i < sectionBox.arrows.length; i++) {
    const arrow = sectionBox.arrows[i];
    const face = sectionBox.faces[i];
    if (!face) continue;
    const { axis, dir } = arrow.userData;
    const n = { x: axis === "x" ? dir : 0, y: axis === "y" ? dir : 0, z: axis === "z" ? dir : 0 };
    const d = camPos.distanceTo(face.position);
    const worldPerPx = 2 * d * tanHalfFov / vh;
    const r = worldPerPx * targetRadiusPx;
    const off = worldPerPx * targetOffsetPx;
    arrow.scale.set(r, r, r);
    arrow.position.set(
      face.position.x + n.x * off,
      face.position.y + n.y * off,
      face.position.z + n.z * off
    );
  }
}
function removeSectionBox3D() {
  if (sectionBox) {
    scene.remove(sectionBox.group);
    sectionBox = null;
  }
}
function updateSectionBox3DPositions() {
  if (!sectionBox) return;
  const b = modelBounds;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const xp = +document.getElementById("slXp").value / 100;
  const xn = +document.getElementById("slXn").value / 100;
  const yp = +document.getElementById("slYp").value / 100;
  const yn = +document.getElementById("slYn").value / 100;
  const zp = +document.getElementById("slZp").value / 100;
  const zn = +document.getElementById("slZn").value / 100;
  const cxn = b.min.x + sx * xn, cxp = b.min.x + sx * xp;
  const cyn = b.min.y + sy * yn, cyp = b.min.y + sy * yp;
  const czn = b.min.z + sz * zn, czp = b.min.z + sz * zp;
  const bsx = cxp - cxn, bsy = cyp - cyn, bsz = czp - czn;
  const bcx = (cxn + cxp) / 2, bcy = (cyn + cyp) / 2, bcz = (czn + czp) / 2;
  sectionBox.edges.scale.set(Math.max(bsx, 0.01), Math.max(bsy, 0.01), Math.max(bsz, 0.01));
  sectionBox.edges.position.set(bcx, bcy, bcz);
  sectionBox.faces[0].position.set(cxp, bcy, bcz);
  sectionBox.faces[0].rotation.set(0, Math.PI / 2, 0);
  sectionBox.faces[0].scale.set(Math.max(bsz, 0.01) / sz, Math.max(bsy, 0.01) / sy, 1);
  sectionBox.arrows[0].rotation.set(0, 0, -Math.PI / 2);
  sectionBox.faces[1].position.set(cxn, bcy, bcz);
  sectionBox.faces[1].rotation.set(0, -Math.PI / 2, 0);
  sectionBox.faces[1].scale.set(Math.max(bsz, 0.01) / sz, Math.max(bsy, 0.01) / sy, 1);
  sectionBox.arrows[1].rotation.set(0, 0, Math.PI / 2);
  sectionBox.faces[2].position.set(bcx, cyp, bcz);
  sectionBox.faces[2].rotation.set(-Math.PI / 2, 0, 0);
  sectionBox.faces[2].scale.set(Math.max(bsx, 0.01) / sx, Math.max(bsz, 0.01) / sz, 1);
  sectionBox.arrows[2].rotation.set(0, 0, 0);
  sectionBox.faces[3].position.set(bcx, cyn, bcz);
  sectionBox.faces[3].rotation.set(Math.PI / 2, 0, 0);
  sectionBox.faces[3].scale.set(Math.max(bsx, 0.01) / sx, Math.max(bsz, 0.01) / sz, 1);
  sectionBox.arrows[3].rotation.set(Math.PI, 0, 0);
  sectionBox.faces[4].position.set(bcx, bcy, czp);
  sectionBox.faces[4].rotation.set(0, 0, 0);
  sectionBox.faces[4].scale.set(Math.max(bsx, 0.01) / sx, Math.max(bsy, 0.01) / sy, 1);
  sectionBox.arrows[4].rotation.set(Math.PI / 2, 0, 0);
  sectionBox.faces[5].position.set(bcx, bcy, czn);
  sectionBox.faces[5].rotation.set(0, Math.PI, 0);
  sectionBox.faces[5].scale.set(Math.max(bsx, 0.01) / sx, Math.max(bsy, 0.01) / sy, 1);
  sectionBox.arrows[5].rotation.set(-Math.PI / 2, 0, 0);
}
let dragHandle = null, dragPlane = null, dragStart = null;
function initSectionDrag() {
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane();
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!sectionActive || !sectionBox) return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(sectionBox.arrows, false);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      dragHandle = { obj: hitObj, faceIdx: hitObj.userData.faceIdx, axis: hitObj.userData.axis, dir: hitObj.userData.dir };
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const axis = dragHandle.axis;
      let pn;
      if (axis === "x") pn = new THREE.Vector3(0, Math.abs(camDir.z) > Math.abs(camDir.y) ? 0 : 1, Math.abs(camDir.z) > Math.abs(camDir.y) ? 1 : 0).normalize();
      else if (axis === "y") pn = new THREE.Vector3(Math.abs(camDir.x) > Math.abs(camDir.z) ? 0 : 1, 0, Math.abs(camDir.x) > Math.abs(camDir.z) ? 1 : 0).normalize();
      else pn = new THREE.Vector3(Math.abs(camDir.x) > Math.abs(camDir.y) ? 0 : 1, Math.abs(camDir.x) > Math.abs(camDir.y) ? 1 : 0, 0).normalize();
      plane.setFromNormalAndCoplanarPoint(pn, hits[0].point);
      dragPlane = plane;
      dragStart = hits[0].point.clone();
      controls.enabled = false;
    }
  }, true);
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragHandle || !dragPlane) return;
    const r = renderer.domElement.getBoundingClientRect();
    const m2 = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const r2 = new THREE.Raycaster();
    r2.setFromCamera(m2, camera);
    const pt = new THREE.Vector3();
    if (!r2.ray.intersectPlane(dragPlane, pt)) return;
    const delta = pt.clone().sub(dragStart), axis = dragHandle.axis;
    const b = modelBounds, axisLen = axis === "x" ? b.max.x - b.min.x : axis === "y" ? b.max.y - b.min.y : b.max.z - b.min.z;
    const d = axis === "x" ? delta.x : axis === "y" ? delta.y : delta.z;
    const sliderIds = ["slXp", "slXn", "slYp", "slYn", "slZp", "slZn"];
    const sl = document.getElementById(sliderIds[dragHandle.faceIdx]);
    sl.value = Math.round(Math.max(0, Math.min(1, +sl.value / 100 + d / axisLen)) * 100);
    dragStart.copy(pt);
    updateSectionFromSliders();
  });
  window.addEventListener("pointerup", () => {
    if (dragHandle) {
      dragHandle = null;
      dragPlane = null;
      dragStart = null;
      controls.enabled = true;
    }
  });
  let lastH = null;
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (dragHandle || !sectionActive || !sectionBox) return;
    const r = renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const r3 = new THREE.Raycaster();
    r3.setFromCamera(m, camera);
    const hits = r3.intersectObjects(sectionBox.arrows, false);
    const h = hits.length > 0 ? hits[0].object : null;
    if (h !== lastH) {
      sectionBox.arrows.forEach((a, i) => {
        a.material.color.set([15680580, 15680580, 2278750, 2278750, 3900150, 3900150][i]);
        a.scale.setScalar(1);
      });
      if (h) {
        h.material.color.set(16777215);
        h.scale.setScalar(1.3);
      }
      lastH = h;
    }
    renderer.domElement.style.cursor = h ? "grab" : "";
  });
}
function updateSectionFromSliders() {
  if (!sectionActive) return;
  const b = modelBounds, mn = b.min, mx = b.max;
  const sx = mx.x - mn.x, sy = mx.y - mn.y, sz = mx.z - mn.z;
  const xp = +document.getElementById("slXp").value / 100;
  const xn = +document.getElementById("slXn").value / 100;
  const yp = +document.getElementById("slYp").value / 100;
  const yn = +document.getElementById("slYn").value / 100;
  const zp = +document.getElementById("slZp").value / 100;
  const zn = +document.getElementById("slZn").value / 100;
  document.getElementById("vXp").textContent = Math.round(xp * 100) + "%";
  document.getElementById("vXn").textContent = Math.round(xn * 100) + "%";
  document.getElementById("vYp").textContent = Math.round(yp * 100) + "%";
  document.getElementById("vYn").textContent = Math.round(yn * 100) + "%";
  document.getElementById("vZp").textContent = Math.round(zp * 100) + "%";
  document.getElementById("vZn").textContent = Math.round(zn * 100) + "%";
  clipPlanes[0].set(new THREE.Vector3(-1, 0, 0), mn.x + sx * xp);
  clipPlanes[1].set(new THREE.Vector3(1, 0, 0), -(mn.x + sx * xn));
  clipPlanes[2].set(new THREE.Vector3(0, -1, 0), mn.y + sy * yp);
  clipPlanes[3].set(new THREE.Vector3(0, 1, 0), -(mn.y + sy * yn));
  clipPlanes[4].set(new THREE.Vector3(0, 0, -1), mn.z + sz * zp);
  clipPlanes[5].set(new THREE.Vector3(0, 0, 1), -(mn.z + sz * zn));
  scene.traverse((c) => {
    if (c.isMesh && !c.userData?.isHandle && c.parent?.name !== "sectionBox") {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      ms.forEach((m) => {
        m.clippingPlanes = clipPlanes;
        m.clipShadows = true;
        m.needsUpdate = true;
      });
    }
  });
  updateSectionBox3DPositions();
  if (window.requestPlanRender) window.requestPlanRender();
}
window.handleFile = async function(idx) {
  const f = document.getElementById("f" + idx).files[0];
  if (!f) return;
  files[idx] = f;
  document.getElementById("uc" + idx).classList.add("loaded");
  document.getElementById("fn" + idx).textContent = f.name;
  document.getElementById("fs" + idx).textContent = (f.size / 1048576).toFixed(2) + " MB";
  if (!ifcLoader) {
    if (!await initIFC()) return;
  }
  await loadIFC(idx);
};
[0, 1].forEach((idx) => {
  const el = document.getElementById("uc" + idx);
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.style.borderColor = "var(--blue)";
  });
  el.addEventListener("dragleave", (e) => {
    e.preventDefault();
    el.style.borderColor = "";
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.style.borderColor = "";
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".ifc")) {
      files[idx] = f;
      el.classList.add("loaded");
      document.getElementById("fn" + idx).textContent = f.name;
      document.getElementById("fs" + idx).textContent = (f.size / 1048576).toFixed(2) + " MB";
      (async () => {
        if (!ifcLoader) {
          if (!await initIFC()) return;
        }
        await loadIFC(idx);
      })();
    }
  });
});
let _fedPendingSlot = -1;
window.fedAddSlot = function() {
  _fedPendingSlot = fedNextSlot;
  document.getElementById("fedFileInput").click();
};
window.fedHandleFile = function(ev) {
  const f = ev.target?.files?.[0];
  if (!f) return;
  const idx = _fedPendingSlot;
  if (idx < 2) return;
  files[idx] = f;
  fedNextSlot = Math.max(fedNextSlot, idx + 1);
  fedRenderSlots();
  (async () => {
    if (!ifcLoader) {
      if (!await initIFC()) return;
    }
    await loadIFC(idx);
    fedRenderSlots();
  })();
  ev.target.value = "";
};
window.fedRemoveSlot = function(idx) {
  if (idx < 2) return;
  if (loadedModels[idx]) {
    scene.remove(loadedModels[idx]);
    loadedModels[idx] = null;
  }
  files[idx] = null;
  if (window._colorizeInvalidate) window._colorizeInvalidate(idx);
  fedRecomputeBounds();
  fedRenderSlots();
  sgState.cachedCtx = null;
  if (window.requestPlanRebuild) window.requestPlanRebuild();
};
window.fedToggleVis = function(idx) {
  if (!loadedModels[idx]) return;
  const chk = document.getElementById("fedVis" + idx);
  loadedModels[idx].visible = chk?.checked ?? true;
  if (window.requestPlanRender) window.requestPlanRender();
};
function fedRecomputeBounds() {
  let first = true;
  for (let i = 0; i < loadedModels.length; i++) {
    const m = loadedModels[i];
    if (!m) continue;
    const b = new THREE.Box3().setFromObject(m);
    if (!b.isEmpty()) {
      if (first) {
        modelBounds.min.copy(b.min);
        modelBounds.max.copy(b.max);
        first = false;
      } else {
        modelBounds.min.min(b.min);
        modelBounds.max.max(b.max);
      }
    }
  }
  if (first) {
    modelBounds.min.set(0, 0, 0);
    modelBounds.max.set(0, 0, 0);
  }
}
function fedRenderSlots() {
  const container = document.getElementById("fedSlots");
  let html = "";
  let count = 0;
  for (let i = 2; i < loadedModels.length || i < files.length; i++) {
    if (!files[i] && !loadedModels[i]) continue;
    count++;
    const colorIdx = (i - 2) % FED_COLORS.length;
    const color = FED_COLORS[colorIdx];
    const loaded = !!loadedModels[i];
    const fname = files[i]?.name || "(unknown)";
    const size = files[i] ? (files[i].size / 1048576).toFixed(1) + "MB" : "";
    const statusText = loaded ? "\u2713 Loaded" : "\u23F3 Loading...";
    const statusCls = loaded ? "color:var(--green)" : "color:var(--amber)";
    html += `<div class="fed-slot ${loaded ? "loaded" : ""}">
      <div class="fed-slot-color" style="background:${color}"></div>
      <div class="fed-slot-info">
        <div class="fed-slot-name" title="${escapeHtml(fname)}">${escapeHtml(fname)}</div>
        <div class="fed-slot-status"><span style="${statusCls}">${statusText}</span> ${size}</div>
      </div>
      <input type="checkbox" class="fed-slot-vis" id="fedVis${i}" ${loaded ? "checked" : ""} onchange="fedToggleVis(${i})" title="Toggle visibility">
      <button class="fed-slot-rm" onclick="fedRemoveSlot(${i})" title="Remove this file">\u2715</button>
    </div>`;
  }
  container.innerHTML = html;
}
function getLoadedModelCount() {
  return loadedModels.filter((m) => !!m).length;
}
function forEachModel(fn) {
  for (let i = 0; i < loadedModels.length; i++) {
    if (loadedModels[i]) fn(loadedModels[i], i);
  }
}
function findModelIdx(obj) {
  for (let i = 0; i < loadedModels.length; i++) {
    if (!loadedModels[i]) continue;
    if (obj === loadedModels[i]) return i;
    let found = false;
    loadedModels[i].traverse((ch) => {
      if (ch === obj) found = true;
    });
    if (found) return i;
  }
  return -1;
}
window.runCompare = async function() {
  if (!loadedModels[0] || !loadedModels[1]) return;
  if (colorize.active) {
    try {
      colorizeClear();
    } catch (e) {
    }
  }
  const lo = document.getElementById("loadOv"), lt = document.getElementById("loadTxt"), lf = document.getElementById("loadFill");
  lo.classList.add("on");
  lt.textContent = "Extracting Version A properties...";
  lf.style.width = "10%";
  try {
    const pA = await getAllProps(loadedModels[0].modelID);
    lt.textContent = "Extracting Version B properties...";
    lf.style.width = "40%";
    const pB = await getAllProps(loadedModels[1].modelID);
    let filteredA = pA, filteredB = pB;
    if (activeCategories.size > 0 && !activeCategories.has("__none__")) {
      filteredA = {};
      filteredB = {};
      for (const [gid, e] of Object.entries(pA)) {
        if (activeCategories.has(e.type)) filteredA[gid] = e;
      }
      for (const [gid, e] of Object.entries(pB)) {
        if (activeCategories.has(e.type)) filteredB[gid] = e;
      }
      log("Category filter applied: A=" + Object.keys(filteredA).length + "/" + Object.keys(pA).length + ", B=" + Object.keys(filteredB).length + "/" + Object.keys(pB).length);
    }
    lt.textContent = "Comparing...";
    lf.style.width = "70%";
    await new Promise((r) => setTimeout(r, 50));
    compareResult = doCompare(filteredA, filteredB);
    lt.textContent = `Done! ${compareResult.added.length + compareResult.removed.length + compareResult.modified.length} changes`;
    lf.style.width = "100%";
    await new Promise((r) => setTimeout(r, 300));
    await applyDiffColors();
    showResultsUI();
  } catch (e) {
    log("Compare err:", e.message);
    lt.textContent = "Error: " + e.message;
  }
  lo.classList.remove("on");
};
async function applyDiffColors() {
  const r = compareResult;
  [0, 1].forEach((i) => {
    if (loadedModels[i]) loadedModels[i].traverse((c) => {
      if (c.isMesh) {
        if (!c.userData._origMaterials) {
          c.userData._origMaterials = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
        }
      }
    });
  });
  [0, 1].forEach((i) => {
    if (loadedModels[i]) loadedModels[i].traverse((c) => {
      if (c.isMesh) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.color = new THREE.Color(12633292);
          m.transparent = true;
          m.opacity = 0.15;
          m.depthWrite = false;
          m.needsUpdate = true;
        });
      }
    });
  });
  const matAdd = new THREE.MeshPhongMaterial({ color: 1483594, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matRem = new THREE.MeshPhongMaterial({ color: 14427686, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matMod = new THREE.MeshPhongMaterial({ color: 16096779, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matUnch = new THREE.MeshPhongMaterial({ color: 13751771, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes });
  const addedIDs = r.added.map((e) => e.entity.expressID);
  const removedIDs = r.removed.map((e) => e.entity.expressID);
  const modifiedIDsA = r.modified.map((e) => e.a.expressID);
  const modifiedIDsB = r.modified.map((e) => e.b.expressID);
  const unchangedIDsA = r.unchanged.map((e) => e.a.expressID);
  const unchangedIDsB = r.unchanged.map((e) => e.b.expressID);
  log("Creating subsets: added=" + addedIDs.length + ", removed=" + removedIDs.length + ", modified=" + modifiedIDsA.length + ", unchanged=" + unchangedIDsA.length);
  const makeSub = (modelIdx, ids, mat, name) => {
    if (!ids.length) return null;
    try {
      const sub = ifcLoader.ifcManager.createSubset({
        modelID: loadedModels[modelIdx].modelID,
        ids,
        material: mat,
        scene,
        removePrevious: false,
        customID: name
      });
      if (sub) {
        sub.position.copy(loadedModels[modelIdx].position);
        sub.updateMatrixWorld(true);
        sub.userData.diffSubset = name;
        sub.userData.srcModelIdx = modelIdx;
        sub.traverse((ch) => {
          if (ch.isMesh) {
            ch.userData.srcModelIdx = modelIdx;
            ch.userData.diffSubset = name;
          }
        });
        log("Subset " + name + ": created with " + ids.length + " elements for model " + modelIdx);
      } else {
        log("Subset " + name + ": createSubset returned null");
      }
      return sub;
    } catch (e) {
      log("Subset error (" + name + "):", e.message);
      return null;
    }
  };
  makeSub(1, addedIDs, matAdd, "added");
  const removedSub = makeSub(0, removedIDs, matRem, "removed");
  if (removedSub) removedSub.visible = true;
  makeSub(1, modifiedIDsB, matMod, "modified-b");
  if (modifiedIDsA.length > 0) {
    const matModA = new THREE.MeshPhongMaterial({ color: 16096779, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes });
    const modSubA = makeSub(0, modifiedIDsA, matModA, "modified-a");
    if (modSubA) modSubA.visible = true;
  }
  makeSub(1, unchangedIDsB, matUnch, "unchanged-b");
  if (loadedModels[0]) {
    loadedModels[0].visible = true;
    loadedModels[0].traverse((c) => {
      if (c.isMesh) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.color = new THREE.Color(12633292);
          m.opacity = 0.04;
          m.transparent = true;
          m.depthWrite = false;
          m.needsUpdate = true;
        });
      }
    });
  }
  if (loadedModels[1]) loadedModels[1].traverse((c) => {
    if (c.isMesh) {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      ms.forEach((m) => {
        m.opacity = 0.04;
        m.transparent = true;
        m.depthWrite = false;
        m.needsUpdate = true;
      });
    }
  });
}
async function getAllProps(modelID) {
  const props = {};
  const api = ifcLoader.ifcManager.state.api;
  const PRODUCT_TYPES = new Set([
    IFCWALL,
    IFCWALLSTANDARDCASE,
    IFCSLAB,
    IFCCOLUMN,
    IFCBEAM,
    IFCDOOR,
    IFCWINDOW,
    IFCROOF,
    IFCSTAIR,
    IFCSTAIRFLIGHT,
    IFCRAILING,
    IFCPLATE,
    IFCMEMBER,
    IFCCURTAINWALL,
    IFCFOOTING,
    IFCBUILDINGELEMENTPROXY,
    IFCFURNISHINGELEMENT,
    IFCFLOWSEGMENT,
    IFCFLOWTERMINAL,
    IFCFLOWFITTING,
    // Numeric IFC type codes for MEP/Electrical/Plumbing
    3512223829,
    3588315303,
    1051757585,
    3999819293,
    753842376,
    2082059205,
    3304561284,
    2979338954,
    331165859,
    4252922144,
    763608111,
    90941305,
    3026737570,
    626022354,
    1469388950,
    1281925730,
    2058353004,
    4136498852,
    3171933400,
    1758889154,
    4237592921,
    987401354,
    3132237377,
    3508470533,
    3024970846,
    3283111854,
    1687234759,
    900683007,
    1973544240,
    25142252,
    // Distribution elements (MEP)
    1945004755,
    // IfcDistributionElement
    3040386961,
    // IfcDistributionFlowElement  
    3132237377,
    // IfcFlowStorageDevice
    3508470533,
    // IfcFlowTreatmentDevice
    2058353004,
    // IfcFlowController
    4278956645,
    // IfcFlowMovingDevice
    1658829314,
    // IfcEnergyConversionDevice
    // Electrical
    402227799,
    // IfcElectricDistributionBoard (IFC4)
    1634111441,
    // IfcElectricAppliance
    264262732,
    // IfcElectricGenerator
    3310460725,
    // IfcElectricMotor
    // Additional common types
    1335981549,
    // IfcDiscreteAccessory
    843113511,
    // IfcColumn (alternate)
    2391368822,
    // IfcBuildingElementProxy (alternate code)
    3493046030,
    // IfcDistributionPort
    3415622556,
    // IfcDistributionChamberElement
    900683007,
    // IfcFooting (alternate)
    819412036,
    // IfcFilter
    342316401,
    // IfcDuctFitting
    3518393246,
    // IfcDuctSegment
    1360408905,
    // IfcDuctSilencer
    1904799276,
    // IfcElectricFlowStorageDevice
    862014818,
    // IfcElectricTimeControl
    1426591983,
    // IfcFireSuppressionTerminal
    4074379575,
    // IfcHumidifier
    2176052936,
    // IfcJunctionBox
    76236018,
    // IfcLamp
    629592764,
    // IfcLightFixture
    1437502449,
    // IfcMedicalDevice
    707683696,
    // IfcOutlet
    310824031,
    // IfcPipeFitting (correct code; was wrongly listed as 3132237377)
    3612865200,
    // IfcPipeSegment
    3640358203,
    // IfcProtectiveDevice
    2295281155,
    // IfcProtectiveDeviceTrippingUnit
    90941305,
    // IfcPump
    2474470126,
    // IfcSanitaryTerminal
    1973544240,
    // IfcSensor
    3825984169,
    // IfcTransformer
    3026737570,
    // IfcTubeBundle
    4207607924,
    // IfcValve
    2391406946
    // IfcWasteTerminal
  ].filter(Boolean));
  const SPATIAL_TYPES = new Set([IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSPACE].filter(Boolean));
  let found = 0;
  const typeCounts = {};
  for (const typeNum of PRODUCT_TYPES) {
    if (SPATIAL_TYPES.has(typeNum)) continue;
    try {
      const lines = api.GetLineIDsWithType(modelID, typeNum);
      const cnt = lines.size();
      if (cnt === 0) continue;
      const typeName = IFC_NAMES[typeNum] || "IFC_" + typeNum;
      typeCounts[typeName] = (typeCounts[typeName] || 0) + cnt;
      for (let i = 0; i < cnt; i++) {
        const eid = lines.get(i);
        try {
          const p = await ifcLoader.ifcManager.getItemProperties(modelID, eid, false);
          if (p?.GlobalId?.value) {
            if (!p.Representation) continue;
            props[p.GlobalId.value] = { expressID: eid, globalId: p.GlobalId.value, type: typeName, name: p.Name?.value || "", description: p.Description?.value || "", objectType: p.ObjectType?.value || "", tag: p.Tag?.value || "" };
            found++;
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }
  log(`getAllProps method1 (by type): found ${found} entities`);
  log("  Types: " + Object.entries(typeCounts).map(([t, c]) => t + "=" + c).join(", "));
  const SKIP_TYPES = new Set([
    3041715199,
    // IfcDistributionPort — internal connection point, no geometry
    4086658281,
    // IfcRelConnectsPortToElement
    3190031847,
    // IfcRelConnectsPorts  
    2565941209,
    // IfcRelConnectsElements
    1204542856,
    // IfcRelConnectsWithRealizingElements
    826625072,
    // IfcRelAssigns
    2851387026,
    // IfcRelAssociatesMaterial
    982818633,
    // IfcRelAssociatesClassification
    2728634034,
    // IfcRelAssociatesDocument
    919958153,
    // IfcRelAssociatesProfileProperties
    4095574036,
    // IfcRelAssociatesApproval
    2043862942,
    // IfcRelAssociatesConstraint
    IFCSPACE,
    // IfcSpace — room volumes, not physical
    IFCOPENINGELEMENT,
    // IfcOpeningElement — void geometry
    IFCSITE,
    IFCBUILDING,
    IFCBUILDINGSTOREY,
    IFCPROJECT
    // Spatial structure
  ].filter(Boolean));
  try {
    const allLines = api.GetAllLines(modelID);
    const total = allLines.size();
    let extra = 0;
    for (let i = 0; i < total; i++) {
      const eid = allLines.get(i);
      try {
        let lineType = 0;
        try {
          lineType = api.GetLineType(modelID, eid);
        } catch (e) {
        }
        if (SKIP_TYPES.has(lineType)) continue;
        const p = await ifcLoader.ifcManager.getItemProperties(modelID, eid, false);
        if (!p?.GlobalId?.value) continue;
        if (props[p.GlobalId.value]) continue;
        if (p.Representation) {
          let typeName = "Unknown";
          try {
            typeName = IFC_NAMES[lineType] || "IFC_" + lineType;
          } catch (e) {
          }
          props[p.GlobalId.value] = { expressID: eid, globalId: p.GlobalId.value, type: typeName, name: p.Name?.value || "", description: p.Description?.value || "", objectType: p.ObjectType?.value || "", tag: p.Tag?.value || "" };
          extra++;
          found++;
        }
      } catch (e) {
      }
    }
    if (extra > 0) log(`getAllProps method2 (full scan): found ${extra} additional entities (types not in predefined list)`);
  } catch (e) {
    log("getAllProps method2 error:", e.message);
  }
  return props;
}
function computeGeometryHashes(modelIdx) {
  const hashes = {};
  const model = loadedModels[modelIdx];
  if (!model) return hashes;
  model.traverse((c) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    const eidArr = c.geometry.attributes.expressID.array;
    const posArr = c.geometry.attributes.position.array;
    const eidVerts = {};
    for (let i = 0; i < eidArr.length; i++) {
      const eid = eidArr[i];
      if (!eid || eid <= 0) continue;
      if (!eidVerts[eid]) eidVerts[eid] = { verts: [], count: 0, mnX: Infinity, mnY: Infinity, mnZ: Infinity, mxX: -Infinity, mxY: -Infinity, mxZ: -Infinity };
      const ev = eidVerts[eid];
      const pi = i * 3;
      if (pi + 2 >= posArr.length) continue;
      const x = posArr[pi], y = posArr[pi + 1], z = posArr[pi + 2];
      if (isNaN(x)) continue;
      ev.count++;
      if (x < ev.mnX) ev.mnX = x;
      if (x > ev.mxX) ev.mxX = x;
      if (y < ev.mnY) ev.mnY = y;
      if (y > ev.mxY) ev.mxY = y;
      if (z < ev.mnZ) ev.mnZ = z;
      if (z > ev.mxZ) ev.mxZ = z;
      if (ev.verts.length < 50) ev.verts.push(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    }
    for (const [eid, ev] of Object.entries(eidVerts)) {
      const sx = (ev.mxX - ev.mnX).toFixed(2);
      const sy = (ev.mxY - ev.mnY).toFixed(2);
      const sz = (ev.mxZ - ev.mnZ).toFixed(2);
      const cx = ((ev.mnX + ev.mxX) / 2).toFixed(2);
      const cy = ((ev.mnY + ev.mxY) / 2).toFixed(2);
      const cz = ((ev.mnZ + ev.mxZ) / 2).toFixed(2);
      const hashStr = ev.verts.join(",") + `|${ev.count}|${sx},${sy},${sz}`;
      let hash = 0;
      for (let i = 0; i < hashStr.length; i++) {
        hash = (hash << 5) - hash + hashStr.charCodeAt(i);
        hash |= 0;
      }
      hashes[parseInt(eid)] = {
        vertCount: ev.count,
        hash,
        bboxStr: `${sx}\xD7${sy}\xD7${sz} @(${cx},${cy},${cz})`,
        size: { x: parseFloat(sx), y: parseFloat(sy), z: parseFloat(sz) },
        center: { x: parseFloat(cx), y: parseFloat(cy), z: parseFloat(cz) }
      };
    }
  });
  return hashes;
}
function doCompare(a, b) {
  const added = [], removed = [], modified = [], unchanged = [];
  const geoHashA = computeGeometryHashes(0);
  const geoHashB = computeGeometryHashes(1);
  log(`Geometry hashes: A=${Object.keys(geoHashA).length}, B=${Object.keys(geoHashB).length}`);
  const sampleA = Object.entries(geoHashA).slice(0, 3);
  const sampleB = Object.entries(geoHashB).slice(0, 3);
  sampleA.forEach(([eid, h]) => log(`  GeoHash A #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));
  sampleB.forEach(([eid, h]) => log(`  GeoHash B #${eid}: verts=${h.vertCount} center=(${h.center.x.toFixed(2)},${h.center.y.toFixed(2)},${h.center.z.toFixed(2)}) size=(${h.size.x.toFixed(2)},${h.size.y.toFixed(2)},${h.size.z.toFixed(2)})`));
  const allGids = /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]);
  const unmatchedA = [];
  const unmatchedB = [];
  for (const gid of allGids) {
    const ea = a[gid], eb = b[gid];
    if (ea && eb) {
      const d = [];
      if (ea.name !== eb.name) d.push({ prop: "Name", oldVal: ea.name || "(empty)", newVal: eb.name || "(empty)" });
      if (ea.type !== eb.type) d.push({ prop: "Type", oldVal: ea.type, newVal: eb.type });
      if (ea.description !== eb.description) d.push({ prop: "Description", oldVal: ea.description || "\u2014", newVal: eb.description || "\u2014" });
      if (ea.objectType !== eb.objectType) d.push({ prop: "ObjectType", oldVal: ea.objectType || "\u2014", newVal: eb.objectType || "\u2014" });
      if (ea.tag !== eb.tag) d.push({ prop: "Element ID", oldVal: ea.tag || "\u2014", newVal: eb.tag || "\u2014" });
      const ghA = geoHashA[ea.expressID];
      const ghB = geoHashB[eb.expressID];
      if (ghA && ghB) {
        const vcA = ghA.vertCount, vcB = ghB.vertCount;
        const vcDiff = Math.abs(vcA - vcB) / Math.max(vcA, vcB, 1);
        if (vcDiff > 0.05) {
          d.push({ prop: "Geometry (vertices)", oldVal: String(vcA), newVal: String(vcB) });
        }
        const sA = ghA.size, sB = ghB.size;
        if (sA && sB) {
          const maxDim = Math.max(sA.x, sA.y, sA.z, sB.x, sB.y, sB.z, 0.01);
          const dxS = Math.abs(sA.x - sB.x) / maxDim;
          const dyS = Math.abs(sA.y - sB.y) / maxDim;
          const dzS = Math.abs(sA.z - sB.z) / maxDim;
          if (dxS > 5e-3 || dyS > 5e-3 || dzS > 5e-3) {
            d.push({ prop: "Size Changed", oldVal: `${sA.x.toFixed(3)}\xD7${sA.y.toFixed(3)}\xD7${sA.z.toFixed(3)}`, newVal: `${sB.x.toFixed(3)}\xD7${sB.y.toFixed(3)}\xD7${sB.z.toFixed(3)}` });
          }
          const cA = ghA.center, cB = ghB.center;
          if (cA && cB) {
            const posDist = Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2 + (cA.z - cB.z) ** 2);
            if (posDist > 0.01) {
              d.push({ prop: "Position Moved", oldVal: `(${cA.x.toFixed(3)},${cA.y.toFixed(3)},${cA.z.toFixed(3)})`, newVal: `(${cB.x.toFixed(3)},${cB.y.toFixed(3)},${cB.z.toFixed(3)})`, distance: (posDist * 1e3).toFixed(0) + "mm" });
            }
          }
        }
        if (ghA.hash !== ghB.hash && d.length === 0) {
          d.push({ prop: "Geometry Changed", oldVal: "hash:" + ghA.hash, newVal: "hash:" + ghB.hash });
        }
      }
      d.length ? modified.push({ gid, a: ea, b: eb, status: "modified", diffs: d }) : unchanged.push({ gid, a: ea, b: eb, status: "unchanged" });
    } else if (ea && !eb) {
      unmatchedA.push(ea);
    } else if (!ea && eb) {
      unmatchedB.push(eb);
    }
  }
  log(`Phase1 (GlobalId+Geometry): modified=${modified.length}, unchanged=${unchanged.length}, unmatchedA=${unmatchedA.length}, unmatchedB=${unmatchedB.length}`);
  let geoFoundBoth = 0, geoMissingA = 0, geoMissingB = 0, geoMissingBoth = 0;
  [...modified, ...unchanged].forEach((e) => {
    const hA = geoHashA[e.a.expressID], hB = geoHashB[e.b.expressID];
    if (hA && hB) geoFoundBoth++;
    else if (!hA && !hB) geoMissingBoth++;
    else if (!hA) geoMissingA++;
    else geoMissingB++;
  });
  log(`  Geo data: both=${geoFoundBoth}, missingA=${geoMissingA}, missingB=${geoMissingB}, missingBoth=${geoMissingBoth}`);
  const matchedA = /* @__PURE__ */ new Set();
  const matchedB = /* @__PURE__ */ new Set();
  for (let i = 0; i < unmatchedA.length; i++) {
    if (matchedA.has(i)) continue;
    const ea = unmatchedA[i];
    let bestIdx = -1;
    let bestScore = 0;
    for (let j = 0; j < unmatchedB.length; j++) {
      if (matchedB.has(j)) continue;
      const eb = unmatchedB[j];
      if (ea.type !== eb.type) continue;
      let score = 0;
      if (ea.name && eb.name && ea.name === eb.name) score += 10;
      if (ea.objectType && eb.objectType && ea.objectType === eb.objectType) score += 5;
      if (ea.tag && eb.tag && ea.tag === eb.tag) score += 20;
      if (ea.name && eb.name) {
        const baseA = ea.name.replace(/[:\-\.]\d+$/, "").trim();
        const baseB = eb.name.replace(/[:\-\.]\d+$/, "").trim();
        if (baseA && baseB && baseA === baseB) score += 8;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0 && bestScore >= 5) {
      const eb = unmatchedB[bestIdx];
      matchedA.add(i);
      matchedB.add(bestIdx);
      const d = [];
      d.push({ prop: "GlobalId", oldVal: ea.globalId, newVal: eb.globalId });
      if (ea.name !== eb.name) d.push({ prop: "Name", oldVal: ea.name || "(empty)", newVal: eb.name || "(empty)" });
      if (ea.tag !== eb.tag) d.push({ prop: "Element ID", oldVal: ea.tag || "\u2014", newVal: eb.tag || "\u2014" });
      if (ea.description !== eb.description) d.push({ prop: "Description", oldVal: ea.description || "\u2014", newVal: eb.description || "\u2014" });
      modified.push({
        gid: eb.globalId,
        a: ea,
        b: eb,
        status: "modified",
        diffs: d.length > 0 ? d : [{ prop: "Element", oldVal: "Recreated", newVal: "New GlobalId assigned" }]
      });
    }
  }
  for (let i = 0; i < unmatchedA.length; i++) {
    if (!matchedA.has(i)) {
      removed.push({ gid: unmatchedA[i].globalId, entity: unmatchedA[i], status: "removed" });
    }
  }
  for (let j = 0; j < unmatchedB.length; j++) {
    if (!matchedB.has(j)) {
      added.push({ gid: unmatchedB[j].globalId, entity: unmatchedB[j], status: "added" });
    }
  }
  log(`Phase2 (smart match): +${modified.length - modified.length} modified via Type+Name`);
  log(`Final: added=${added.length}, removed=${removed.length}, modified=${modified.length}, unchanged=${unchanged.length}`);
  return { added, removed, modified, unchanged };
}
window.resetSection = function() {
  ["slXp", "slYp", "slZp"].forEach((id) => {
    document.getElementById(id).value = 100;
  });
  ["slXn", "slYn", "slZn"].forEach((id) => {
    document.getElementById(id).value = 0;
  });
  updateSectionFromSliders();
};
window.focusSectionOnChanges = function() {
  if (!compareResult) return;
  const r = compareResult;
  const changedIDs = /* @__PURE__ */ new Set();
  r.added.forEach((e) => changedIDs.add(e.entity.expressID));
  r.removed.forEach((e) => changedIDs.add(e.entity.expressID));
  r.modified.forEach((e) => {
    changedIDs.add(e.a.expressID);
    changedIDs.add(e.b.expressID);
  });
  if (changedIDs.size === 0) {
    log("No changes to focus on");
    return;
  }
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  let found = false;
  scene.traverse((c) => {
    if (!c.isMesh || !c.userData?.diffSubset) return;
    if (c.userData.diffSubset === "unchanged-b" || c.userData.diffSubset === "unchanged-b_cat") return;
    if (!c.geometry?.attributes?.position) return;
    const pos = c.geometry.attributes.position.array;
    const wm = c.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      if (isNaN(pos[i])) continue;
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(wm);
      if (isNaN(v.x)) continue;
      if (v.x < mnX) mnX = v.x;
      if (v.x > mxX) mxX = v.x;
      if (v.y < mnY) mnY = v.y;
      if (v.y > mxY) mxY = v.y;
      if (v.z < mnZ) mnZ = v.z;
      if (v.z > mxZ) mxZ = v.z;
      found = true;
    }
  });
  if (!found) {
    log("Could not compute bounds of changes");
    return;
  }
  const b = modelBounds;
  const padX = (b.max.x - b.min.x) * 0.05;
  const padY = (b.max.y - b.min.y) * 0.05;
  const padZ = (b.max.z - b.min.z) * 0.05;
  mnX -= padX;
  mnY -= padY;
  mnZ -= padZ;
  mxX += padX;
  mxY += padY;
  mxZ += padZ;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSlider = (val, mn, range) => Math.max(0, Math.min(100, Math.round((val - mn) / range * 100)));
  document.getElementById("slXp").value = toSlider(mxX, b.min.x, sx);
  document.getElementById("slXn").value = toSlider(mnX, b.min.x, sx);
  document.getElementById("slYp").value = toSlider(mxY, b.min.y, sy);
  document.getElementById("slYn").value = toSlider(mnY, b.min.y, sy);
  document.getElementById("slZp").value = toSlider(mxZ, b.min.z, sz);
  document.getElementById("slZn").value = toSlider(mnZ, b.min.z, sz);
  if (!sectionActive) {
    sectionActive = true;
    document.getElementById("sectionPanel").classList.add("show");
    document.getElementById("btnSection").classList.add("active");
    createSectionBox3D();
  }
  updateSectionFromSliders();
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;
  const maxDim = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ) * 1.5;
  camera.position.set(cx + maxDim * 0.6, cy + maxDim * 0.5, cz + maxDim * 0.6);
  controls.target.set(cx, cy, cz);
  controls.update();
  log(`Focused on changes: (${mnX.toFixed(1)},${mnY.toFixed(1)},${mnZ.toFixed(1)}) \u2192 (${mxX.toFixed(1)},${mxY.toFixed(1)},${mxZ.toFixed(1)})`);
};
function colorModel(m, color, opacity) {
  m.traverse((c) => {
    if (c.isMesh) {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      ms.forEach((mt) => {
        mt.color = new THREE.Color(color);
        mt.transparent = true;
        mt.opacity = opacity;
        mt.needsUpdate = true;
      });
    }
  });
}
function showResultsUI() {
  const r = compareResult;
  document.getElementById("sumStrip").classList.add("show");
  document.getElementById("searchW").classList.add("show");
  document.getElementById("filterB").classList.add("show");
  document.getElementById("catFilter").classList.add("show");
  document.getElementById("vpLegend").classList.add("show");
  document.getElementById("btnExport").style.display = "";
  document.getElementById("btnExportBCF").style.display = "";
  document.getElementById("btnExitCompare").style.display = "";
  document.getElementById("sA").textContent = "+" + r.added.length;
  document.getElementById("sR").textContent = "\u2212" + r.removed.length;
  document.getElementById("sM").textContent = "~" + r.modified.length;
  document.getElementById("sU").textContent = r.unchanged.length;
  activeFilter = "all";
  activeCategories = /* @__PURE__ */ new Set();
  document.querySelectorAll(".fchip").forEach((c) => c.classList.toggle("on", c.dataset.f === "all"));
  const allItems = [...r.added, ...r.removed, ...r.modified, ...r.unchanged];
  Object.values(window._catData || {}).forEach((d) => {
    d.added = 0;
    d.removed = 0;
    d.modified = 0;
  });
  allItems.forEach((e) => {
    const en = e.entity || e.a || e.b;
    const t = en?.type || "Unknown";
    if (!window._catData[t]) window._catData[t] = { total: 0, added: 0, removed: 0, modified: 0 };
    if (e.status === "added") window._catData[t].added++;
    if (e.status === "removed") window._catData[t].removed++;
    if (e.status === "modified") window._catData[t].modified++;
  });
  buildCatDropdown();
  updateCatTags();
  renderTree();
  buildIssues();
}
window.renderTree = function() {
  const r = compareResult;
  if (!r) return;
  const q = (document.getElementById("searchIn")?.value || "").toLowerCase();
  let items = [];
  if (activeFilter === "all" || activeFilter === "added") items.push(...r.added);
  if (activeFilter === "all" || activeFilter === "removed") items.push(...r.removed);
  if (activeFilter === "all" || activeFilter === "modified") items.push(...r.modified);
  if (activeFilter === "all" || activeFilter === "unchanged") items.push(...r.unchanged);
  if (activeCategories.size > 0) {
    items = items.filter((e) => {
      const en = e.entity || e.a || e.b;
      return activeCategories.has(en?.type || "Unknown");
    });
  }
  if (q) items = items.filter((e) => {
    const en = e.entity || e.a || e.b;
    return (en?.name || "").toLowerCase().includes(q) || (en?.type || "").toLowerCase().includes(q) || (e.gid || "").toLowerCase().includes(q);
  });
  const groups = {};
  items.forEach((e) => {
    const en = e.entity || e.a || e.b;
    const t = en?.type || "Unknown";
    (groups[t] = groups[t] || []).push(e);
  });
  const sorted = Object.keys(groups).sort((a, b) => {
    const ac = groups[a].some((e) => e.status !== "unchanged"), bc = groups[b].some((e) => e.status !== "unchanged");
    if (ac !== bc) return bc - ac;
    return groups[b].length - groups[a].length;
  });
  let html = "";
  for (const type of sorted) {
    const list = groups[type];
    const na = list.filter((e) => e.status === "added").length, nr = list.filter((e) => e.status === "removed").length, nm = list.filter((e) => e.status === "modified").length;
    const badges = [na ? `<span class="tg-b ba">+${na}</span>` : "", nr ? `<span class="tg-b br">\u2212${nr}</span>` : "", nm ? `<span class="tg-b bm">~${nm}</span>` : ""].filter(Boolean).join("");
    const col = activeFilter === "all" && list.length > 20 && !list.some((e) => e.status !== "unchanged");
    html += `<div><div class="tg-hdr" onclick="togG(this)"><span class="tg-arr${col ? " col" : ""}">\u25BC</span><span class="tg-n">${type} (${list.length})</span>${badges}</div><div class="tg-items${col ? " col" : ""}">`;
    list.slice(0, 150).forEach((e) => {
      const en = e.entity || e.a || e.b;
      html += `<div class="ti" data-g="${e.gid}" onclick="selI('${e.gid}')"><div class="ti-dot ${e.status}"></div><span class="ti-nm">${en?.name || "(unnamed)"}</span><span class="ti-id">${e.status}</span></div>`;
    });
    if (list.length > 150) html += `<div style="padding:4px 26px;font-size:12px;color:var(--text-muted)">+${list.length - 150} more</div>`;
    html += "</div></div>";
  }
  document.getElementById("eTree").innerHTML = html || `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">${items.length === 0 ? "No changes found for this filter" : "No match"}</div>`;
};
window.togG = function(h) {
  h.querySelector(".tg-arr").classList.toggle("col");
  h.nextElementSibling.classList.toggle("col");
};
window.selI = function(gid) {
  const r = compareResult, all = [...r.added, ...r.removed, ...r.modified, ...r.unchanged];
  const item = all.find((e) => e.gid === gid);
  if (!item) return;
  document.querySelectorAll(".ti").forEach((e) => e.classList.remove("sel"));
  const el = document.querySelector(`.ti[data-g="${gid}"]`);
  if (el) {
    el.classList.add("sel");
    el.scrollIntoView({ block: "nearest" });
  }
  const ent = item.entity || item.a || item.b;
  showEntityProps(item, ent);
};
function showEntityProps(item, ent) {
  const c = { added: "var(--green)", removed: "var(--red)", modified: "var(--amber)", unchanged: "var(--indigo)" };
  const bg = { added: "var(--green-lt)", removed: "var(--red-lt)", modified: "var(--amber-lt)", unchanged: "var(--blue-lt)" };
  let h = `<div style="padding:8px 12px;background:${bg[item.status]};border-bottom:1px solid var(--border)"><span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${c[item.status]}">${item.status.toUpperCase()}</span></div>
  <div class="ps"><div class="ps-t">Identity</div>
  <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${ent?.globalId || "\u2014"}</div></div>
  <div class="pr"><div class="pk">Type</div><div class="pv">${ent?.type || "\u2014"}</div></div>
  <div class="pr"><div class="pk">Name</div><div class="pv">${ent?.name || "\u2014"}</div></div>
  <div class="pr"><div class="pk">Tag</div><div class="pv">${ent?.tag || "\u2014"}</div></div></div>`;
  if (item.diffs) {
    h += `<div class="ps"><div class="ps-t">Changes (${item.diffs.length})</div>`;
    item.diffs.forEach((d) => {
      h += `<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`;
    });
    h += "</div>";
  }
  document.getElementById("propArea").innerHTML = h;
}
function renderPropertiesAccordion(elementHeader, groups) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const visibleGroups = groups.filter((g) => g.rows.length > 0);
  const DEFAULT_OPEN = /* @__PURE__ */ new Set(["Identity"]);
  const totalRows = visibleGroups.reduce((sum, g) => sum + g.rows.filter((r) => !r._empty).length, 0);
  let html = "";
  html += `<div class="prop-toolbar">
    <span class="prop-toolbar-title">${esc(elementHeader)}</span>
    <span class="prop-toolbar-count">${totalRows}</span>
    <button class="prop-toolbar-btn" onclick="propAccordionToggleAll(true)" title="Expand all">\u229E Expand all</button>
    <button class="prop-toolbar-btn" onclick="propAccordionToggleAll(false)" title="Collapse all">\u229F Collapse all</button>
  </div>`;
  for (const g of visibleGroups) {
    const open = DEFAULT_OPEN.has(g.name);
    const rowCount = g.rows.filter((r) => !r._empty).length;
    let rowsHtml = "";
    for (const r of g.rows) {
      if (r._empty) {
        rowsHtml += `<div class="pr"><div class="pk" style="grid-column:1/-1;color:var(--text-muted);font-style:italic;font-size:11px">(no properties)</div></div>`;
      } else {
        rowsHtml += `<div class="pr"><div class="pk">${esc(r.label)}</div><div class="pv">${esc(r.value)}</div></div>`;
      }
    }
    html += `<div class="prop-group">
      <div class="prop-group-hdr${open ? " expanded" : ""}" onclick="propAccordionToggle(this)">
        <span class="prop-group-arr">\u25B6</span>
        <span class="prop-group-name">${esc(g.name)}</span>
        <span class="prop-group-cnt">${rowCount}</span>
      </div>
      <div class="prop-group-body">${rowsHtml}</div>
    </div>`;
  }
  document.getElementById("propArea").innerHTML = html;
}
window.propAccordionToggle = function(hdr) {
  if (!hdr) return;
  hdr.classList.toggle("expanded");
};
window.propAccordionToggleAll = function(expand) {
  const headers = document.querySelectorAll("#propArea .prop-group-hdr");
  headers.forEach((h) => {
    if (expand) h.classList.add("expanded");
    else h.classList.remove("expanded");
  });
};
async function showProps(props, modelIdx) {
  const mid = loadedModels[modelIdx]?.modelID;
  const eid = props.expressID;
  const mgr = ifcLoader?.ifcManager;
  const getVal = (v) => {
    if (v === null || v === void 0) return "";
    if (Array.isArray(v)) return v.map(getVal).filter((x) => x !== "").join(", ");
    if (typeof v === "object" && "value" in v) {
      const inner = v.value;
      if (inner === null || inner === void 0) return "";
      if (typeof inner === "number") return Number.isInteger(inner) ? String(inner) : (+inner.toFixed(6) + "").replace(/\.?0+$/, "");
      return String(inner);
    }
    if (typeof v === "object") {
      if ("type" in v && "expressID" in v) return `#${v.expressID} <${IFC_NAMES[v.type] || "IFC_" + v.type}>`;
      return "";
    }
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : (+v.toFixed(6) + "").replace(/\.?0+$/, "");
    return String(v);
  };
  const units = loadedModels[modelIdx]?.units || {
    lengthFactor: 1e3,
    lengthUnit: "mm",
    areaFactor: 1,
    areaUnit: "m\xB2",
    volumeFactor: 1,
    volumeUnit: "m\xB3"
  };
  const spatial = loadedModels[modelIdx]?.spatial || null;
  const fmtLength = (raw) => {
    if (typeof raw !== "number" || isNaN(raw)) return "";
    const mm = raw * units.lengthFactor;
    const rounded = Math.round(mm);
    return rounded.toLocaleString("en-US") + " " + units.lengthUnit;
  };
  const fmtArea = (raw) => {
    if (typeof raw !== "number" || isNaN(raw)) return "";
    const m2 = raw * units.areaFactor;
    return m2.toFixed(2) + " " + units.areaUnit;
  };
  const fmtVolume = (raw) => {
    if (typeof raw !== "number" || isNaN(raw)) return "";
    const m3 = raw * units.volumeFactor;
    return m3.toFixed(3) + " " + units.volumeUnit;
  };
  const extractPropValue = (p) => {
    if (!p) return "";
    if (p.LengthValue !== void 0) return fmtLength(p.LengthValue?.value ?? p.LengthValue);
    if (p.AreaValue !== void 0) return fmtArea(p.AreaValue?.value ?? p.AreaValue);
    if (p.VolumeValue !== void 0) return fmtVolume(p.VolumeValue?.value ?? p.VolumeValue);
    if (p.WeightValue !== void 0) {
      const v = p.WeightValue?.value ?? p.WeightValue;
      return typeof v === "number" ? v.toFixed(2) + " kg" : getVal(p.WeightValue);
    }
    if (p.CountValue !== void 0) return getVal(p.CountValue);
    if (p.TimeValue !== void 0) {
      const v = p.TimeValue?.value ?? p.TimeValue;
      return typeof v === "number" ? v.toFixed(2) + " s" : getVal(p.TimeValue);
    }
    if (p.NominalValue !== void 0) {
      const nv = p.NominalValue;
      const rawV = nv && typeof nv === "object" && "value" in nv ? nv.value : nv;
      const name = (p.Name?.value || p.Name || "").toString();
      if (typeof rawV === "number") {
        if (/^(length|width|height|thickness|diameter|radius|depth|size|perimeter|offset|overall(length|width|height)|nominallength|nominalwidth|nominalheight|nominaldiameter|wall\s*thickness|insulation\s*thickness|invertelevation|elevation)$/i.test(name)) {
          return fmtLength(rawV);
        }
        if (/area$/i.test(name)) {
          return fmtArea(rawV);
        }
        if (/volume$/i.test(name)) {
          return fmtVolume(rawV);
        }
      }
      return getVal(nv);
    }
    if (p.EnumerationValues) return getVal(p.EnumerationValues);
    if (p.ListValues) return getVal(p.ListValues);
    if (p.LowerBoundValue !== void 0 || p.UpperBoundValue !== void 0) {
      const lo = getVal(p.LowerBoundValue), up = getVal(p.UpperBoundValue);
      return `[${lo || "\u2212\u221E"} .. ${up || "+\u221E"}]`;
    }
    return getVal(p);
  };
  const resolveRef = async (ref, recursive = false) => {
    if (!ref || mid === void 0) return null;
    const id = typeof ref === "number" ? ref : ref?.value ?? null;
    if (typeof id !== "number" || id <= 0) return null;
    try {
      return await mgr.getItemProperties(mid, id, recursive);
    } catch (e) {
      return null;
    }
  };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const addRow = (label, val) => {
    if (val === "" || val === void 0 || val === null) return;
    if (!curGroup) {
      beginGroup("Other");
    }
    curGroup.rows.push({ label, value: val });
  };
  const ifcClass = IFC_NAMES[props.type] || "IFC_" + props.type;
  const revitCat = ifcClassToRevitCategory(ifcClass);
  const groups = [];
  let curGroup = null;
  const beginGroup = (name) => {
    curGroup = { name, rows: [] };
    groups.push(curGroup);
  };
  const elementHeader = `Version ${modelIdx === 0 ? "A" : "B"} \u2014 #${eid}`;
  let h = "";
  beginGroup("Identity");
  addRow("Category", revitCat);
  addRow("IFC Class", ifcClass);
  addRow("Name", getVal(props.Name));
  addRow("Description", getVal(props.Description));
  addRow("ObjectType", getVal(props.ObjectType));
  addRow("Tag / Element ID", getVal(props.Tag));
  addRow("PredefinedType", getVal(props.PredefinedType));
  addRow("GlobalId", getVal(props.GlobalId));
  ;
  let typeObj = null;
  try {
    if (mgr.getTypeProperties) {
      const types = await mgr.getTypeProperties(mid, eid, true);
      if (Array.isArray(types) && types.length > 0) typeObj = types[0];
    }
    if (!typeObj && props.IsTypedBy) {
      const refs = Array.isArray(props.IsTypedBy) ? props.IsTypedBy : [props.IsTypedBy];
      for (const r of refs) {
        const rel = await resolveRef(r);
        if (!rel) continue;
        const to = await resolveRef(rel.RelatingType, true);
        if (to) {
          typeObj = to;
          break;
        }
      }
    }
  } catch (e) {
    log("Type resolve err:", e?.message);
  }
  if (typeObj) {
    const typeClass = IFC_NAMES[typeObj.type] || "IFC_" + typeObj.type;
    beginGroup("Type");
    addRow("Type Name", getVal(typeObj.Name));
    addRow("Type Class", typeClass);
    addRow("Type Tag", getVal(typeObj.Tag));
    addRow("Type Description", getVal(typeObj.Description));
    addRow("Type PredefinedType", getVal(typeObj.PredefinedType));
    addRow("ElementType", getVal(typeObj.ElementType));
    ;
  }
  let materialLabel = "";
  try {
    if (mgr.getMaterialsProperties) {
      const mats = await mgr.getMaterialsProperties(mid, eid, true, true);
      if (Array.isArray(mats) && mats.length > 0) {
        const names = [];
        const walk = (m) => {
          if (!m) return;
          if (m.Name) {
            const n = getVal(m.Name);
            if (n) names.push(n);
          }
          if (m.MaterialLayers) {
            const layers = Array.isArray(m.MaterialLayers) ? m.MaterialLayers : [m.MaterialLayers];
            for (const l of layers) walk(l?.Material || l);
          }
          if (m.ForLayerSet) walk(m.ForLayerSet);
          if (m.Materials) {
            const items = Array.isArray(m.Materials) ? m.Materials : [m.Materials];
            for (const it of items) walk(it);
          }
          if (m.Material && typeof m.Material === "object") walk(m.Material);
        };
        for (const m of mats) walk(m);
        materialLabel = [...new Set(names)].join(", ");
      }
    }
  } catch (e) {
    log("Material resolve err:", e?.message);
  }
  let levelLabel = "";
  try {
    if (props.ContainedInStructure) {
      const refs = Array.isArray(props.ContainedInStructure) ? props.ContainedInStructure : [props.ContainedInStructure];
      for (const r of refs) {
        const rel = await resolveRef(r);
        if (!rel?.RelatingStructure) continue;
        const struct = await resolveRef(rel.RelatingStructure);
        if (struct?.Name) {
          levelLabel = getVal(struct.Name);
          break;
        }
      }
    }
  } catch (e) {
  }
  let systemLabel = "";
  try {
    if (props.HasAssignments) {
      const refs = Array.isArray(props.HasAssignments) ? props.HasAssignments : [props.HasAssignments];
      for (const r of refs) {
        const rel = await resolveRef(r);
        if (!rel?.RelatingGroup) continue;
        const grp = await resolveRef(rel.RelatingGroup);
        if (grp?.Name) {
          const gc = IFC_NAMES[grp.type] || "IFC_" + grp.type;
          systemLabel = getVal(grp.Name) + (gc ? " (" + gc + ")" : "");
          break;
        }
      }
    }
  } catch (e) {
  }
  let currentStoreyIdx = -1;
  if (spatial && levelLabel) {
    currentStoreyIdx = spatial.storeys.findIndex((s) => s.name === levelLabel);
  }
  let topY = null, botY = null, gX = null, gY = null, gZ = null;
  try {
    const bb = getElementBBox(modelIdx, eid);
    if (bb && bb.center) {
      topY = bb.center.y + bb.size.y / 2;
      botY = bb.center.y - bb.size.y / 2;
      const off = loadedModels[modelIdx]?.position || { x: 0, y: 0, z: 0 };
      gX = bb.center.x - off.x;
      gY = -(bb.center.z - off.z);
      gZ = bb.center.y - off.y;
      topY = topY - off.y;
      botY = botY - off.y;
    }
  } catch (e) {
  }
  const haveLocation = spatial || materialLabel || systemLabel || topY !== null || gX !== null;
  if (haveLocation) {
    beginGroup("Location");
    if (spatial) {
      addRow("Model", spatial.modelName || loadedModels[modelIdx]?.fileName);
      addRow("Project", spatial.projectName);
      addRow("Site", spatial.siteName);
      addRow("Building", spatial.buildingName);
    }
    addRow("Building Story", levelLabel);
    addRow("System", systemLabel);
    addRow("Material", materialLabel);
    if (topY !== null) addRow("Top Elevation", fmtLength(topY));
    if (botY !== null) addRow("Bottom Elevation", fmtLength(botY));
    if (spatial && spatial.storeys.length > 1 && topY !== null && botY !== null) {
      let next = null, prev = null;
      for (const s of spatial.storeys) {
        if (s.elevation > topY && (!next || s.elevation < next.elevation)) next = s;
        if (s.elevation < botY && (!prev || s.elevation > prev.elevation)) prev = s;
      }
      if (next) addRow("Top distance to next Story", fmtLength(topY - next.elevation));
      if (prev) addRow("Bottom distance to next Story", fmtLength(botY - prev.elevation));
    }
    if (gX !== null) addRow("Global X", fmtLength(gX));
    if (gY !== null) addRow("Global Y", fmtLength(gY));
    if (gZ !== null) addRow("Global Z", fmtLength(gZ));
    if (botY !== null) addRow("Elevation", fmtLength(botY));
    ;
  }
  let allPsets = [];
  try {
    const data = await mgr.getPropertySets(mid, eid, true, true);
    if (Array.isArray(data)) allPsets = data;
  } catch (e) {
    log("Pset resolve err:", e?.message);
  }
  const seenPset = /* @__PURE__ */ new Set();
  for (const pset of allPsets) {
    if (!pset) continue;
    if (pset.expressID && seenPset.has(pset.expressID)) continue;
    if (pset.expressID) seenPset.add(pset.expressID);
    const psetName = getVal(pset.Name) || "Properties";
    const isType = /TypeCommon$/i.test(psetName);
    const displayName = isType ? `[${psetName}]` : psetName;
    beginGroup(displayName);
    let rowCount = 0;
    if (pset.HasProperties) {
      const hps = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
      for (const hp of hps) {
        const p = typeof hp?.value === "number" ? await resolveRef(hp) : hp;
        if (!p) continue;
        const n = getVal(p.Name);
        const v = extractPropValue(p);
        if (n) {
          addRow(n, v || "\u2014");
          rowCount++;
        }
      }
    }
    if (pset.Quantities) {
      const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
      for (const q of qs) {
        const qp = typeof q?.value === "number" ? await resolveRef(q) : q;
        if (!qp) continue;
        const n = getVal(qp.Name);
        const v = extractPropValue(qp);
        if (n) {
          addRow(n, v || "\u2014");
          rowCount++;
        }
      }
    }
    if (rowCount === 0) {
      if (curGroup) {
        curGroup.rows.push({ label: "", value: "(no properties)", _empty: true });
      }
      ;
    }
    ;
  }
  const IDENTITY_KEYS = /* @__PURE__ */ new Set(["Name", "Description", "ObjectType", "Tag", "PredefinedType", "GlobalId", "OwnerHistory", "ObjectPlacement", "Representation", "expressID", "type"]);
  const REL_KEYS = /* @__PURE__ */ new Set(["IsDefinedBy", "IsTypedBy", "HasAssociations", "HasAssignments", "ContainedInStructure", "Decomposes", "IsDecomposedBy", "ReferencedBy", "HasOpenings", "FillsVoids", "ConnectedFrom", "ConnectedTo", "HasProjections", "HasStructuralMember", "ReferencedInStructures"]);
  const attrRows = [];
  for (const k of Object.keys(props)) {
    if (IDENTITY_KEYS.has(k)) continue;
    if (REL_KEYS.has(k)) continue;
    const v = props[k];
    if (v === null || v === void 0) continue;
    const val = getVal(v);
    if (val) attrRows.push({ k, v: val });
  }
  if (attrRows.length > 0) {
    beginGroup("Raw Attributes");
    for (const { k, v } of attrRows) addRow(k, v);
    ;
  }
  renderPropertiesAccordion(elementHeader, groups);
}
window.showProps = showProps;
window.zoomFit = function() {
  let mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity), ok = false;
  scene.traverse((c) => {
    if (c.isMesh && c.visible && c.geometry?.attributes?.position) {
      const p = c.geometry.attributes.position.array, wm = c.matrixWorld, v = new THREE.Vector3();
      for (let i = 0; i < p.length; i += 3) {
        if (isNaN(p[i])) continue;
        v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(wm);
        if (isNaN(v.x)) continue;
        mn.min(v);
        mx.max(v);
        ok = true;
      }
    }
  });
  if (!ok) return;
  const ct = new THREE.Vector3().addVectors(mn, mx).multiplyScalar(0.5), sz = new THREE.Vector3().subVectors(mx, mn), d = Math.max(sz.x, sz.y, sz.z) * 1.5;
  camera.near = Math.max(d * 1e-3, 0.01);
  camera.far = Math.max(d * 50, 5e3);
  camera.updateProjectionMatrix();
  camera.position.set(ct.x + d * 0.6, ct.y + d * 0.5, ct.z + d * 0.6);
  controls.target.copy(ct);
  controls.update();
};
window.resetCam = function() {
  camera.position.set(30, 25, 30);
  controls.target.set(0, 0, 0);
  controls.update();
  if (loadedModels.some((m) => !!m)) zoomFit();
};
window.toggleWire = function() {
  scene.traverse((c) => {
    if (c.isMesh) {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      ms.forEach((m) => m.wireframe = !m.wireframe);
    }
  });
};
window.captureScreenshot = function() {
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "ifc-screenshot-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png";
  a.click();
  log("Screenshot saved");
};
let measureMode = false;
let measureType = "distance";
let measurePoints = [];
let measureMarkers = [];
let measureLine = null;
let measureLabel = null;
window.setMeasureMode = function(type) {
  measureType = type;
  clearMeasure();
  const dBtn = document.getElementById("modeDistance");
  const lBtn = document.getElementById("modeLevel");
  if (type === "distance") {
    dBtn.style.borderColor = "var(--blue)";
    dBtn.style.background = "var(--blue-lt)";
    dBtn.style.color = "var(--blue)";
    dBtn.style.fontWeight = "600";
    lBtn.style.borderColor = "var(--border)";
    lBtn.style.background = "var(--bg-card)";
    lBtn.style.color = "var(--text-dim)";
    lBtn.style.fontWeight = "400";
    document.getElementById("measureText").textContent = "Click first point";
  } else {
    lBtn.style.borderColor = "var(--blue)";
    lBtn.style.background = "var(--blue-lt)";
    lBtn.style.color = "var(--blue)";
    lBtn.style.fontWeight = "600";
    dBtn.style.borderColor = "var(--border)";
    dBtn.style.background = "var(--bg-card)";
    dBtn.style.color = "var(--text-dim)";
    dBtn.style.fontWeight = "400";
    document.getElementById("measureText").textContent = "Click a point to read elevation";
  }
};
window.toggleMeasure = function() {
  measureMode = !measureMode;
  document.getElementById("btnMeasure").classList.toggle("active", measureMode);
  document.getElementById("measureInfo").style.display = measureMode ? "flex" : "none";
  if (!measureMode) {
    clearMeasure();
  } else {
    setMeasureMode(measureType);
    renderer.domElement.style.cursor = "crosshair";
  }
};
window.clearMeasure = function() {
  measurePoints = [];
  measureMarkers.forEach((m) => {
    if (m.parent) m.parent.remove(m);
  });
  measureMarkers = [];
  if (measureLine) {
    if (measureLine.parent) measureLine.parent.remove(measureLine);
    measureLine = null;
  }
  if (measureLabel) {
    if (measureLabel.parent) measureLabel.parent.remove(measureLabel);
    measureLabel = null;
  }
  renderer.domElement.style.cursor = measureMode ? "crosshair" : "";
  if (measureMode) {
    document.getElementById("measureText").textContent = measureType === "distance" ? "Click first point" : "Click a point to read elevation";
  }
};
function addMeasurePoint(point) {
  const geo = new THREE.SphereGeometry(0.08, 12, 12);
  const color = measureType === "level" ? 16096779 : 2450411;
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.copy(point);
  sphere.renderOrder = 999;
  scene.add(sphere);
  measureMarkers.push(sphere);
  measurePoints.push(point.clone());
  if (measureType === "level") {
    const el = point.y;
    const elMM = (el * 1e3).toFixed(0);
    const vPts = [point.clone(), new THREE.Vector3(point.x, 0, point.z)];
    const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
    const vMat = new THREE.LineDashedMaterial({ color: 16096779, dashSize: 0.3, gapSize: 0.15, depthTest: false });
    const vLine = new THREE.Line(vGeo, vMat);
    vLine.computeLineDistances();
    vLine.renderOrder = 999;
    scene.add(vLine);
    measureMarkers.push(vLine);
    const refLen = 2;
    const hPts = [new THREE.Vector3(point.x - refLen, 0, point.z), new THREE.Vector3(point.x + refLen, 0, point.z)];
    const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
    const hMat = new THREE.LineBasicMaterial({ color: 8947848, depthTest: false });
    const hLine = new THREE.Line(hGeo, hMat);
    hLine.renderOrder = 999;
    scene.add(hLine);
    measureMarkers.push(hLine);
    const ePts = [new THREE.Vector3(point.x - refLen, el, point.z), new THREE.Vector3(point.x + refLen, el, point.z)];
    const eGeo = new THREE.BufferGeometry().setFromPoints(ePts);
    const eMat = new THREE.LineBasicMaterial({ color: 16096779, depthTest: false });
    const eLine = new THREE.Line(eGeo, eMat);
    eLine.renderOrder = 999;
    scene.add(eLine);
    measureMarkers.push(eLine);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(245,158,11,0.9)";
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.fillText("EL " + el.toFixed(3) + "m", 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.set(point.x + 1.5, el, point.z);
    measureLabel.scale.set(2, 0.5, 1);
    measureLabel.renderOrder = 1e3;
    scene.add(measureLabel);
    measureMarkers.push(measureLabel);
    document.getElementById("measureText").textContent = `\u{1F4D0} EL ${el.toFixed(3)}m (${elMM}mm) | Click another point or Clear`;
    measurePoints = [];
    return;
  }
  if (measurePoints.length === 1) {
    document.getElementById("measureText").textContent = "Click second point";
  }
  if (measurePoints.length === 2) {
    const p1 = measurePoints[0], p2 = measurePoints[1];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 2450411, linewidth: 2, depthTest: false });
    measureLine = new THREE.Line(lineGeo, lineMat);
    measureLine.renderOrder = 999;
    scene.add(measureLine);
    measureMarkers.push(measureLine);
    if (Math.abs(p1.y - p2.y) > 0.01) {
      const vPts = [p2.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
      const vMat = new THREE.LineDashedMaterial({ color: 16096779, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const vLine = new THREE.Line(vGeo, vMat);
      vLine.computeLineDistances();
      vLine.renderOrder = 999;
      scene.add(vLine);
      measureMarkers.push(vLine);
      const hPts = [p1.clone(), new THREE.Vector3(p2.x, p1.y, p2.z)];
      const hGeo = new THREE.BufferGeometry().setFromPoints(hPts);
      const hMat = new THREE.LineDashedMaterial({ color: 1483594, dashSize: 0.2, gapSize: 0.1, depthTest: false });
      const hLine = new THREE.Line(hGeo, hMat);
      hLine.computeLineDistances();
      hLine.renderOrder = 999;
      scene.add(hLine);
      measureMarkers.push(hLine);
    }
    const dist = p1.distanceTo(p2);
    const dy = Math.abs(p2.y - p1.y);
    const hDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
    document.getElementById("measureText").textContent = `\u{1F4CF} ${dist.toFixed(3)}m | \u2195\u0394EL ${dy.toFixed(3)}m | \u2194 ${hDist.toFixed(3)}m`;
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(37,99,235,0.9)";
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText(dist.toFixed(3) + " m", 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    measureLabel = new THREE.Sprite(spriteMat);
    measureLabel.position.copy(mid).add(new THREE.Vector3(0, 0.3, 0));
    measureLabel.scale.set(dist * 0.3 + 0.8, dist * 0.075 + 0.2, 1);
    measureLabel.renderOrder = 1e3;
    scene.add(measureLabel);
    measureMarkers.push(measureLabel);
    log("Measure: " + dist.toFixed(3) + "m");
    renderer.domElement.style.cursor = "crosshair";
  }
}
window.setGlobalOpacity = function(val) {
  const op = val / 100;
  document.getElementById("opVal").textContent = val + "%";
  scene.traverse((c) => {
    if (!c.isMesh || c.parent?.name === "sectionBox" || c.userData?.isHandle) return;
    if (c.type === "GridHelper" || c.type === "AxesHelper") return;
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    ms.forEach((m) => {
      if (!m._origOpacity) m._origOpacity = m.opacity;
      m.opacity = m._origOpacity * op;
      m.transparent = m.opacity < 0.99;
      m.needsUpdate = true;
    });
  });
};
window.toggleCatDropdown = function() {
  const dd = document.getElementById("catDropdown");
  const btn = document.getElementById("catBtn");
  const isOpen = dd.classList.contains("open");
  dd.classList.toggle("open");
  btn.classList.toggle("open");
  if (!isOpen) document.getElementById("catSearch").focus();
};
document.addEventListener("click", (e) => {
  const dd = document.getElementById("catDropdown");
  const btn = document.getElementById("catBtn");
  if (dd && !dd.contains(e.target) && !btn?.contains(e.target)) {
    dd.classList.remove("open");
    btn?.classList.remove("open");
  }
});
function buildCatDropdown(filter = "") {
  const data = window._catData || {};
  const sorted = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  const q = filter.toLowerCase();
  let html = "";
  sorted.forEach(([cat, info]) => {
    const name = cat.replace("Ifc", "").replace("IFC_", "");
    if (q && !name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) return;
    const checked = activeCategories.size === 0 || activeCategories.has(cat) ? "checked" : "";
    const changes = [];
    if (info.added) changes.push(`<span class="cat-dd-ch a">+${info.added}</span>`);
    if (info.removed) changes.push(`<span class="cat-dd-ch r">\u2212${info.removed}</span>`);
    if (info.modified) changes.push(`<span class="cat-dd-ch m">~${info.modified}</span>`);
    html += `<label class="cat-dd-item"><input type="checkbox" class="cat-dd-cb" data-cat="${cat}" ${checked} onchange="onCatCheck()"><span class="cat-dd-name">${name}</span><span class="cat-dd-changes">${changes.join("")}</span><span class="cat-dd-count">${info.total}</span></label>`;
  });
  document.getElementById("catList").innerHTML = html;
}
window.filterCatDropdown = function() {
  buildCatDropdown(document.getElementById("catSearch").value);
};
window.onCatCheck = function() {
  const boxes = document.querySelectorAll(".cat-dd-cb");
  const checked = /* @__PURE__ */ new Set();
  boxes.forEach((b) => {
    if (b.checked) checked.add(b.dataset.cat);
  });
  const allCats = Object.keys(window._catData || {});
  if (checked.size === allCats.length || checked.size === 0) {
    activeCategories = /* @__PURE__ */ new Set();
  } else {
    activeCategories = checked;
  }
  updateCatTags();
  renderTree();
  applyCatVis();
};
window.catSelectAll = function() {
  document.querySelectorAll(".cat-dd-cb").forEach((b) => b.checked = true);
  activeCategories = /* @__PURE__ */ new Set();
  updateCatTags();
  renderTree();
  applyCatVis();
};
window.catSelectNone = function() {
  document.querySelectorAll(".cat-dd-cb").forEach((b) => b.checked = false);
  activeCategories = /* @__PURE__ */ new Set(["__none__"]);
  updateCatTags();
  renderTree();
  applyCatVis();
};
window.catSelectChanged = function() {
  const data = window._catData || {};
  document.querySelectorAll(".cat-dd-cb").forEach((b) => {
    const info = data[b.dataset.cat];
    b.checked = info && (info.added > 0 || info.removed > 0 || info.modified > 0);
  });
  onCatCheck();
};
function updateCatTags() {
  const tags = document.getElementById("catTags");
  if (activeCategories.size === 0) {
    tags.innerHTML = '<span style="color:var(--text-muted);font-size:13px">All categories</span>';
    return;
  }
  if (activeCategories.has("__none__")) {
    tags.innerHTML = '<span style="color:var(--red);font-size:13px">None selected</span>';
    return;
  }
  let html = "";
  activeCategories.forEach((cat) => {
    const name = cat.replace("Ifc", "").replace("IFC_", "");
    html += `<span class="cat-tag">${name}<span class="tag-x" onclick="event.stopPropagation();removeCatTag('${cat}')">\xD7</span></span>`;
  });
  tags.innerHTML = html;
}
window.removeCatTag = function(cat) {
  activeCategories.delete(cat);
  if (activeCategories.size === 0) {
    document.querySelectorAll(".cat-dd-cb").forEach((b) => b.checked = true);
  } else {
    document.querySelectorAll(".cat-dd-cb").forEach((b) => b.checked = activeCategories.has(b.dataset.cat));
  }
  updateCatTags();
  renderTree();
  applyCatVis();
};
window.toggleModelVis = function(idx) {
  const vis = document.getElementById(idx === 0 ? "visA" : "visB").checked;
  log("toggleModelVis: model " + idx + " \u2192 " + vis);
  if (compareResult) {
    applyCatVis();
  } else {
    if (loadedModels[idx]) loadedModels[idx].visible = vis;
    viewSubsets.forEach((s) => {
      if (s.userData?.srcModelIdx === idx) s.visible = vis;
    });
    visSubsets.forEach((s) => {
      if (s.userData?.srcModelIdx === idx) s.visible = vis;
    });
    if (typeof colorize !== "undefined" && colorize.subsets) {
      colorize.subsets.forEach((s) => {
        if (s.userData?.srcModelIdx === idx) s.visible = vis;
      });
    }
    applyCategoryVisibilityViewMode();
  }
};
function applyCatVis() {
  if (compareResult) applyCategoryVisibility3D();
  else applyCategoryVisibilityViewMode();
}
function applyCategoryVisibility3D() {
  if (!ifcLoader || !compareResult) return;
  const r = compareResult;
  const showAll = activeCategories.size === 0;
  const showNone = activeCategories.has("__none__");
  const toRemove = [];
  scene.traverse((c) => {
    if (c.isMesh && c.userData?.diffSubset) toRemove.push(c);
  });
  toRemove.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });
  const filterByCat = (items) => {
    if (showNone) return [];
    if (showAll) return items;
    return items.filter((e) => {
      const en = e.entity || e.a || e.b;
      return activeCategories.has(en?.type || "Unknown");
    });
  };
  const matAdd = new THREE.MeshPhongMaterial({ color: 1483594, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matRem = new THREE.MeshPhongMaterial({ color: 14427686, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matMod = new THREE.MeshPhongMaterial({ color: 16096779, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matUnch = new THREE.MeshPhongMaterial({ color: 13751771, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipPlanes });
  const makeSub = (mi, ids, mat, name) => {
    if (!ids.length || !loadedModels[mi]) return;
    try {
      const sub = ifcLoader.ifcManager.createSubset({ modelID: loadedModels[mi].modelID, ids, material: mat, scene, removePrevious: false, customID: name + "_cat" });
      if (sub) {
        sub.position.copy(loadedModels[mi].position);
        sub.updateMatrixWorld(true);
        sub.userData.diffSubset = name;
        sub.userData.srcModelIdx = mi;
        sub.visible = document.getElementById(mi === 0 ? "visA" : "visB").checked;
      }
    } catch (e) {
    }
  };
  const fA = filterByCat(r.added), fR = filterByCat(r.removed), fM = filterByCat(r.modified), fU = filterByCat(r.unchanged);
  makeSub(1, fA.map((e) => e.entity.expressID), matAdd, "added");
  makeSub(0, fR.map((e) => e.entity.expressID), matRem, "removed");
  makeSub(1, fM.map((e) => e.b.expressID), matMod, "modified-b");
  makeSub(1, fU.map((e) => e.b.expressID), matUnch, "unchanged-b");
  const visAChecked = document.getElementById("visA").checked;
  const visBChecked = document.getElementById("visB").checked;
  if (loadedModels[0]) {
    loadedModels[0].visible = visAChecked && !showNone;
    if (visAChecked) {
      loadedModels[0].traverse((c) => {
        if (c.isMesh) {
          c.visible = true;
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m) => {
            m.color = new THREE.Color(15245472);
            m.opacity = 0.12;
            m.transparent = true;
            m.depthWrite = false;
            m.needsUpdate = true;
            m.clippingPlanes = clipPlanes;
          });
        }
      });
    }
  }
  if (loadedModels[1]) {
    loadedModels[1].visible = visBChecked && !showNone;
    loadedModels[1].traverse((c) => {
      if (c.isMesh) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.opacity = 0.04;
          m.transparent = true;
          m.depthWrite = false;
          m.needsUpdate = true;
        });
      }
    });
  }
}
window.setFilter = function(f) {
  activeFilter = f;
  document.querySelectorAll(".fchip").forEach((c) => c.classList.toggle("on", c.dataset.f === f));
  renderTree();
  filterIssuesList();
};
function filterIssuesList() {
  document.querySelectorAll(".issue-card").forEach((card) => {
    if (activeFilter === "all") {
      card.style.display = "";
      return;
    }
    const status = card.querySelector(".issue-status");
    if (status) {
      const s = status.textContent.toLowerCase();
      card.style.display = s === activeFilter ? "" : "none";
    }
  });
  const visible = document.querySelectorAll('.issue-card:not([style*="display: none"])');
  document.getElementById("issueNavInfo").textContent = visible.length + " issues";
}
let issuesList = [];
let currentIssueIdx = -1;
window.switchTab = function(tab) {
  const tabs = document.querySelectorAll(".ptab");
  tabs.forEach((t, i) => t.classList.toggle("on", tab === "tree" && i === 0 || tab === "issues" && i === 1 || tab === "search" && i === 2));
  document.getElementById("eTree").style.display = tab === "tree" ? "" : "none";
  document.getElementById("issuesList").classList.toggle("show", tab === "issues");
  document.getElementById("issueNav").classList.toggle("show", tab === "issues");
  document.getElementById("searchPanel").classList.toggle("show", tab === "search");
  if (tab === "search") searchInit();
};
function buildIssues() {
  if (!compareResult) return;
  const r = compareResult;
  issuesList = [];
  let num = 1;
  r.added.forEach((e) => {
    const en = e.entity;
    issuesList.push({
      num: num++,
      status: "added",
      gid: e.gid,
      name: en.name || "(unnamed)",
      type: en.type,
      tag: en.tag || "",
      detail: "New element in Version B",
      expressID: en.expressID,
      modelIdx: 1,
      diffs: null
    });
  });
  r.removed.forEach((e) => {
    const en = e.entity;
    issuesList.push({
      num: num++,
      status: "removed",
      gid: e.gid,
      name: en.name || "(unnamed)",
      type: en.type,
      tag: en.tag || "",
      detail: "Removed from Version A",
      expressID: en.expressID,
      modelIdx: 0,
      diffs: null
    });
  });
  r.modified.forEach((e) => {
    const en = e.b || e.a;
    const details = e.diffs.map((d) => `${d.prop}: ${d.oldVal} \u2192 ${d.newVal}`).join(", ");
    issuesList.push({
      num: num++,
      status: "modified",
      gid: e.gid,
      name: en.name || "(unnamed)",
      type: en.type,
      tag: en.tag || "",
      detail: details,
      expressID: en.expressID,
      modelIdx: 1,
      diffs: e.diffs
    });
  });
  document.getElementById("issueCount").textContent = issuesList.length;
  let html = "";
  if (issuesList.length === 0) {
    html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">No changes detected</div>';
  } else {
    issuesList.forEach((iss, i) => {
      html += `<div class="issue-card" id="issue-${i}" onclick="focusIssue(${i})">
        <div class="issue-hdr">
          <span class="issue-num">#${iss.num}</span>
          <span class="issue-status ${iss.status}">${iss.status.toUpperCase()}</span>
          <span class="issue-type">${(iss.type || "").replace("Ifc", "")}</span>
        </div>
        <div class="issue-name">${iss.name}</div>
        <div class="issue-detail">${iss.detail}</div>
      </div>`;
    });
  }
  document.getElementById("issuesList").innerHTML = html;
  document.getElementById("panelTabs").classList.add("show");
  switchTab("issues");
}
window.focusIssue = function(idx) {
  if (idx < 0 || idx >= issuesList.length) {
    log("focusIssue: bad idx", idx);
    return;
  }
  currentIssueIdx = idx;
  const iss = issuesList[idx];
  const targetEID = iss.expressID;
  const targetModelIdx = iss.modelIdx;
  log(`focusIssue #${iss.num}: eid=${targetEID} model=${targetModelIdx} status=${iss.status}`);
  document.querySelectorAll(".issue-card").forEach((c, i) => c.classList.toggle("active", i === idx));
  document.getElementById("issueNavInfo").textContent = `${idx + 1} / ${issuesList.length}`;
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity, mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  let found = false;
  let scanCount = 0, hitCount = 0;
  scene.traverse((c) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    scanCount++;
    const eidArr = c.geometry.attributes.expressID.array;
    const posArr = c.geometry.attributes.position.array;
    const wm = c.matrixWorld;
    const v = new THREE.Vector3();
    let localHit = false;
    for (let i = 0; i < eidArr.length; i++) {
      if (eidArr[i] !== targetEID) continue;
      const pi = i * 3;
      if (pi + 2 >= posArr.length || isNaN(posArr[pi])) continue;
      v.set(posArr[pi], posArr[pi + 1], posArr[pi + 2]).applyMatrix4(wm);
      if (isNaN(v.x)) continue;
      if (v.x < mnX) mnX = v.x;
      if (v.x > mxX) mxX = v.x;
      if (v.y < mnY) mnY = v.y;
      if (v.y > mxY) mxY = v.y;
      if (v.z < mnZ) mnZ = v.z;
      if (v.z > mxZ) mxZ = v.z;
      found = true;
      localHit = true;
    }
    if (localHit) hitCount++;
  });
  log(`focusIssue: scanned ${scanCount} meshes, ${hitCount} contained eid ${targetEID}, found=${found}`);
  if (!found) {
    log("Issue focus FAILED: geometry not in scene. Showing properties only.");
    showIssueProps(iss);
    return;
  }
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;
  const elSize = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ);
  log(`focusIssue: element bbox center=(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}) size=${elSize.toFixed(2)}`);
  const viewDist = Math.max(elSize * 1.5, 5);
  camera.position.set(cx + viewDist * 0.5, cy + viewDist * 0.4, cz + viewDist * 0.5);
  controls.target.set(cx, cy, cz);
  controls.update();
  if (window._pendingPivot) window._pendingPivot = null;
  try {
    const sbPad = Math.max(Math.min(elSize * 0.3, 5), 1);
    const sbMnX = mnX - sbPad, sbMxX = mxX + sbPad;
    const sbMnY = mnY - sbPad, sbMxY = mxY + sbPad;
    const sbMnZ = mnZ - sbPad, sbMxZ = mxZ + sbPad;
    const b = modelBounds;
    const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    if (sx > 0 && sy > 0 && sz > 0) {
      const slUp = (val, mn, range) => Math.max(0, Math.min(100, Math.ceil((val - mn) / range * 100)));
      const slDn = (val, mn, range) => Math.max(0, Math.min(100, Math.floor((val - mn) / range * 100)));
      const ensureMin = (lo, hi, minSpread) => {
        if (hi - lo >= minSpread) return [lo, hi];
        const mid = (lo + hi) / 2;
        const half = minSpread / 2;
        let nlo = Math.max(0, Math.floor(mid - half));
        let nhi = Math.min(100, Math.ceil(mid + half));
        if (nhi - nlo < minSpread) {
          if (nlo === 0) nhi = Math.min(100, nlo + minSpread);
          else nlo = Math.max(0, nhi - minSpread);
        }
        return [nlo, nhi];
      };
      let xLo = slDn(sbMnX, b.min.x, sx), xHi = slUp(sbMxX, b.min.x, sx);
      let yLo = slDn(sbMnY, b.min.y, sy), yHi = slUp(sbMxY, b.min.y, sy);
      let zLo = slDn(sbMnZ, b.min.z, sz), zHi = slUp(sbMxZ, b.min.z, sz);
      [xLo, xHi] = ensureMin(xLo, xHi, 2);
      [yLo, yHi] = ensureMin(yLo, yHi, 2);
      [zLo, zHi] = ensureMin(zLo, zHi, 2);
      document.getElementById("slXp").value = xHi;
      document.getElementById("slXn").value = xLo;
      document.getElementById("slYp").value = yHi;
      document.getElementById("slYn").value = yLo;
      document.getElementById("slZp").value = zHi;
      document.getElementById("slZn").value = zLo;
      if (!sectionActive) {
        sectionActive = true;
        document.getElementById("sectionPanel").classList.add("show");
        document.getElementById("btnSection").classList.add("active");
        createSectionBox3D();
      }
      updateSectionFromSliders();
    } else {
      log("focusIssue: skipping section box (modelBounds invalid)");
    }
  } catch (e) {
    log("focusIssue section box err:", e?.message);
  }
  try {
    clearHighlight();
    if (!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({ color: 2450411, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: clipPlanes });
    const mid = loadedModels[targetModelIdx]?.modelID;
    let sub = null;
    if (mid !== void 0) {
      sub = ifcLoader.ifcManager.createSubset({ modelID: mid, ids: [targetEID], material: window._hlMat, scene, removePrevious: true });
      if (sub) {
        sub.position.copy(loadedModels[targetModelIdx].position);
        sub.updateMatrixWorld(true);
        window._lastHL = { subset: sub, mid };
        log("focusIssue: highlight subset created");
      } else {
        log("focusIssue: createSubset returned null (issue #83?). Highlight skipped \u2014 element still visible via diff subsets.");
      }
    }
  } catch (e) {
    log("focusIssue highlight err:", e?.message);
  }
  showIssueProps(iss);
};
function showIssueProps(iss) {
  const colors = { added: "var(--green)", removed: "var(--red)", modified: "var(--amber)" };
  const bgs = { added: "var(--green-lt)", removed: "var(--red-lt)", modified: "var(--amber-lt)" };
  let h = `<div style="padding:8px 12px;background:${bgs[iss.status]};border-bottom:1px solid var(--border)">
    <span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:${colors[iss.status]}">ISSUE #${iss.num} \u2014 ${iss.status.toUpperCase()}</span>
  </div>
  <div class="ps"><div class="ps-t">Element</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${iss.name}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${iss.type}</div></div>
    <div class="pr"><div class="pk">Tag / Element ID</div><div class="pv">${iss.tag || "\u2014"}</div></div>
    <div class="pr"><div class="pk">GlobalId</div><div class="pv" style="font-family:JetBrains Mono;font-size:10px">${iss.gid}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${iss.expressID}</div></div>
    <div class="pr"><div class="pk">Source</div><div class="pv">Version ${iss.modelIdx === 0 ? "A" : "B"}</div></div>
  </div>
  <div class="ps"><div class="ps-t">How to find in BIM software</div>
    <div class="pr"><div class="pk">Revit</div><div class="pv" style="font-size:12px">Select by ID \u2192 <b>${iss.tag || "N/A"}</b></div></div>
    <div class="pr"><div class="pk">Tekla</div><div class="pv" style="font-size:12px">Inquire \u2192 GUID: <b style="word-break:break-all">${iss.gid}</b></div></div>
    <div class="pr"><div class="pk">ArchiCAD</div><div class="pv" style="font-size:12px">Find by IFC GlobalId: <b style="word-break:break-all">${iss.gid}</b></div></div>
  </div>`;
  if (iss.diffs && iss.diffs.length > 0) {
    h += `<div class="ps"><div class="ps-t">Property Changes</div>`;
    iss.diffs.forEach((d) => {
      h += `<div class="pr"><div class="pk">${d.prop}</div><div class="pv"><div class="dv-old">${d.oldVal}</div><div class="dv-new" style="margin-top:2px">${d.newVal}</div></div></div>`;
    });
    h += "</div>";
  }
  document.getElementById("propArea").innerHTML = h;
}
window.navIssue = function(dir) {
  if (issuesList.length === 0) return;
  let next = currentIssueIdx + dir;
  if (next < 0) next = issuesList.length - 1;
  if (next >= issuesList.length) next = 0;
  focusIssue(next);
  document.getElementById("issue-" + next)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
};
window.exportCSV = function() {
  if (!compareResult) return;
  const r = compareResult;
  let csv = "Status,Type,GlobalId,Tag/ElementID,Name,Details\n";
  csv += "# Revit: use Tag/ElementID with Select by ID. Tekla/ArchiCAD: use GlobalId to find elements.\n";
  r.added.forEach((e) => csv += `Added,${e.entity.type},"${e.gid}","${e.entity.tag || ""}","${e.entity.name}",New in B
`);
  r.removed.forEach((e) => csv += `Removed,${e.entity.type},"${e.gid}","${e.entity.tag || ""}","${e.entity.name}",Only in A
`);
  r.modified.forEach((e) => {
    const en = e.a || e.b;
    csv += `Modified,${en.type},"${e.gid}","${en.tag || ""}","${en.name}","${e.diffs.map((d) => d.prop + ":" + d.oldVal + "\u2192" + d.newVal).join("; ")}"
`;
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "ifc-compare.csv";
  a.click();
};
window.exportBCF = async function() {
  if (!compareResult || !issuesList.length) {
    log("No issues to export");
    return;
  }
  if (!window.JSZip) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
    await new Promise((res, rej) => {
      s.onload = res;
      s.onerror = rej;
    });
  }
  log("Exporting BCF for " + issuesList.length + " issues...");
  const zip = new JSZip();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const pid = crypto.randomUUID();
  const mdlPos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2; i++) {
    if (loadedModels[i]) {
      mdlPos.x = loadedModels[i].position.x;
      mdlPos.y = loadedModels[i].position.y;
      mdlPos.z = loadedModels[i].position.z;
      break;
    }
  }
  const threeToIfc = (x, y, z) => {
    const tx = x - mdlPos.x, ty = y - mdlPos.y, tz = z - mdlPos.z;
    return { x: tx, y: tz, z: -ty };
  };
  const dirThreeToIfc = (x, y, z) => ({ x, y: z, z: -y });
  log("Compare BCF model offset (three-space): (" + mdlPos.x.toFixed(2) + ", " + mdlPos.y.toFixed(2) + ", " + mdlPos.z.toFixed(2) + ")");
  const saveCam = camera.position.clone();
  const saveTgt = controls.target.clone();
  zip.file("bcf.version", '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file("project.bcfp", '<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="' + pid + '"><Name>IFC Delta Compare</Name></Project></ProjectExtension>');
  for (let i = 0; i < issuesList.length; i++) {
    const iss = issuesList[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();
    const bbox = iss.modelIdx !== void 0 ? getElementBBox(iss.modelIdx, iss.expressID) : null;
    const ifcCenter = bbox?.center ? threeToIfc(bbox.center.x, bbox.center.y, bbox.center.z) : { x: 0, y: 0, z: 0 };
    const ix = ifcCenter.x, iy = ifcCenter.y, iz = ifcCenter.z;
    const d = bbox ? Math.max(bbox.size.x, bbox.size.y, bbox.size.z) * 2 + 5 : 20;
    let snap64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==";
    if (bbox?.center) {
      camera.position.set(bbox.center.x + d * 0.4, bbox.center.y + d * 0.3, bbox.center.z + d * 0.4);
      controls.target.set(bbox.center.x, bbox.center.y, bbox.center.z);
      controls.update();
      let snapHL = null;
      try {
        const hlColor = { added: 1483594, removed: 14427686, modified: 14251782 }[iss.status] || 2450411;
        const hlMat = new THREE.MeshPhongMaterial({ color: hlColor, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: true });
        const mid = loadedModels[iss.modelIdx]?.modelID;
        if (mid !== void 0) {
          snapHL = ifcLoader.ifcManager.createSubset({ modelID: mid, ids: [iss.expressID], material: hlMat, scene, removePrevious: false, customID: "bcfSnap" });
          if (snapHL) {
            snapHL.position.copy(loadedModels[iss.modelIdx].position);
            snapHL.updateMatrixWorld(true);
          }
        }
      } catch (e) {
      }
      renderer.render(scene, camera);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      renderer.render(scene, camera);
      try {
        snap64 = renderer.domElement.toDataURL("image/png").split(",")[1];
      } catch (e) {
      }
      if (snapHL) {
        try {
          scene.remove(snapHL);
          snapHL.geometry?.dispose();
        } catch (e) {
        }
      }
    }
    let desc = iss.status.toUpperCase() + ": " + (iss.name || "");
    if (iss.tag) desc += " | Element ID: " + iss.tag;
    if (iss.detail) desc += " | " + iss.detail;
    if (bbox?.center) {
      desc += " | Position: (" + ix.toFixed(2) + ", " + iy.toFixed(2) + ", " + iz.toFixed(2) + ")";
      if (iss.status === "added") desc += " | NOTE: This element is NEW in Version B. Look at this location in Revit to see where it should be placed.";
      if (iss.status === "removed") desc += " | NOTE: This element was REMOVED. It existed at this location in Version A.";
    }
    const rawSx = bbox ? bbox.size.x / 2 : 5;
    const rawSy = bbox ? bbox.size.z / 2 : 5;
    const rawSz = bbox ? bbox.size.y / 2 : 5;
    const elMax = Math.max(rawSx, rawSy, rawSz);
    const pad = Math.max(2, elMax * 1.5);
    const sx = rawSx + pad, sy = rawSy + pad, sz = rawSz + pad;
    const viewR = Math.max(sx, sy, sz) * 1.8 + 3;
    const camX = ix + viewR * 0.55, camY = iy - viewR * 0.75, camZ = iz + viewR * 0.45;
    const ddx = ix - camX, ddy = iy - camY, ddz = iz - camZ;
    const ln = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    const col = { added: "FF16A34A", removed: "FFDC2626", modified: "FFD97706" }[iss.status] || "FF2563EB";
    const clips = "<ClippingPlanes><ClippingPlane><Location><X>" + (ix + sx).toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + (ix - sx).toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + (iy + sy).toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + (iy - sy).toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + (iz + sz).toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + (iz - sz).toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane></ClippingPlanes>";
    const tag = iss.tag || "";
    const buildComponent = () => {
      let x = '<Component IfcGuid="' + escXml(iss.gid) + '">';
      x += "<OriginatingSystem>Autodesk Revit</OriginatingSystem>";
      if (tag) x += "<AuthoringToolId>" + escXml(tag) + "</AuthoringToolId>";
      x += "</Component>";
      return x;
    };
    const compXml = buildComponent();
    const headerXml = "<Header>" + (files[0] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(files[0].name) + "</Filename><Date>" + now + "</Date></File>" : "") + (files[1] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(files[1].name) + "</Filename><Date>" + now + "</Date></File>" : "") + "</Header>";
    zip.file(tid + "/markup.bcf", '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' + headerXml + '\n<Topic Guid="' + tid + '" TopicType="Issue" TopicStatus="Active"><Title>' + escXml("#" + iss.num + " " + iss.name + " [" + iss.status.toUpperCase() + "]") + "</Title><Description>" + escXml(desc) + "</Description><CreationDate>" + now + "</CreationDate><CreationAuthor>IFC Delta</CreationAuthor><ModifiedDate>" + now + '</ModifiedDate></Topic>\n<Comment Guid="' + crypto.randomUUID() + '"><Date>' + now + "</Date><Author>IFC Delta</Author><Comment>" + escXml(desc) + '</Comment><Viewpoint Guid="' + vid + '"/></Comment>\n<Viewpoints Guid="' + vid + '"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n</Markup>');
    const viewpointXml = '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="' + vid + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<Components><Selection>' + compXml + '</Selection><Visibility DefaultVisibility="true"><Exceptions/></Visibility><Coloring><Color Color="' + col + '">' + compXml + "</Color></Coloring></Components>\n<PerspectiveCamera><CameraViewPoint><X>" + camX.toFixed(6) + "</X><Y>" + camY.toFixed(6) + "</Y><Z>" + camZ.toFixed(6) + "</Z></CameraViewPoint><CameraDirection><X>" + (ddx / ln).toFixed(6) + "</X><Y>" + (ddy / ln).toFixed(6) + "</Y><Z>" + (ddz / ln).toFixed(6) + "</Z></CameraDirection><CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector><FieldOfView>60</FieldOfView></PerspectiveCamera>\n" + clips + "\n</VisualizationInfo>";
    zip.file(tid + "/viewpoint.bcfv", viewpointXml);
    zip.file(tid + "/snapshot.png", snap64, { base64: true });
  }
  camera.position.copy(saveCam);
  controls.target.copy(saveTgt);
  controls.update();
  renderer.render(scene, camera);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ifc-delta-issues.bcf";
  a.click();
  log("BCF exported: " + issuesList.length + " issues");
};
function escXml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function setStatus(t, x) {
  const b = document.getElementById("statusBadge");
  b.className = "status-badge show " + t;
  document.getElementById("statusText").textContent = x;
}
let clashMode = false;
let clashResults = [];
let clashSubsets = [];
let currentClashIdx = -1;
let clashFilterCounterA = 0, clashFilterCounterB = 0;
let clashPropertyCacheA = {}, clashPropertyCacheB = {};
let clashRuleRows = { A: [], B: [] };
const CLASH_OPERATORS = [
  { v: "", label: "" },
  { v: "equals", label: "=" },
  { v: "not_equals", label: "\u2260" },
  { v: "contains", label: "\u2283" },
  { v: "not_contains", label: "\u2285" },
  { v: "starts", label: "starts" },
  { v: "gt", label: ">" },
  { v: "lt", label: "<" }
];
const CLASH_PROPERTIES = [
  { v: "None", label: "None" },
  { v: "Name", label: "Name" },
  { v: "ObjectType", label: "ObjectType" },
  { v: "Tag", label: "Tag / ElementID" },
  { v: "Description", label: "Description" },
  { v: "PredefinedType", label: "PredefinedType" }
];
function getClashElementTypes(side) {
  const catIDs = window._catModelIDs || {};
  const mi = side === "A" ? 0 : 1;
  const revitCats = /* @__PURE__ */ new Set();
  Object.entries(catIDs).forEach(([ifcClass, models]) => {
    if (models[mi] && models[mi].length > 0) {
      revitCats.add(ifcClassToRevitCategory(ifcClass));
    }
  });
  return [...revitCats].sort();
}
function revitCategoryToIfcClasses(catLabel, side) {
  const catIDs = window._catModelIDs || {};
  const mi = side === "A" ? 0 : 1;
  const out = /* @__PURE__ */ new Set();
  Object.entries(catIDs).forEach(([ifcClass, models]) => {
    if (!models[mi] || !models[mi].length) return;
    if (ifcClassToRevitCategory(ifcClass) === catLabel) out.add(ifcClass);
  });
  return out;
}
function renderClashRules(side) {
  const tbody = document.getElementById("clashRules" + side);
  if (!tbody) return;
  const rows = clashRuleRows[side];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:8px;font-style:italic">Click + to add element types</td></tr>';
    return;
  }
  const elTypes = getClashElementTypes(side);
  const escA = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  let html = "";
  rows.forEach((r, i) => {
    const typeOpts = ['<option value="">\u2014 select \u2014</option>'].concat(elTypes.map((t) => {
      return `<option value="${escA(t)}"${r.elementType === t ? " selected" : ""}>${escA(t)}</option>`;
    })).join("");
    const propOpts = CLASH_PROPERTIES.map((p) => `<option value="${p.v}"${r.property === p.v ? " selected" : ""}>${p.label}</option>`).join("");
    const opOpts = CLASH_OPERATORS.map((o) => `<option value="${o.v}"${r.operator === o.v ? " selected" : ""}>${o.label || "\u2014"}</option>`).join("");
    const valDisabled = !r.property || r.property === "None" ? "disabled" : "";
    const opDisabled = !r.property || r.property === "None" ? "disabled" : "";
    const actionOpts = [
      '<option value="Add"' + (r.action === "Add" ? " selected" : "") + ">Add</option>",
      '<option value="Remove"' + (r.action === "Remove" ? " selected" : "") + ">Remove</option>"
    ].join("");
    html += `<tr data-row-idx="${i}">
      <td><select onchange="updateClashRow('${side}',${i},'elementType',this.value)">${typeOpts}</select></td>
      <td><select onchange="updateClashRow('${side}',${i},'property',this.value)">${propOpts}</select></td>
      <td><select ${opDisabled} onchange="updateClashRow('${side}',${i},'operator',this.value)">${opOpts}</select></td>
      <td><input type="text" ${valDisabled} value="${escA(r.value)}" placeholder="value" onchange="updateClashRow('${side}',${i},'value',this.value)"></td>
      <td><div class="clash-rule-row-action">
        <select onchange="updateClashRow('${side}',${i},'action',this.value)">${actionOpts}</select>
        <button class="clash-row-del" onclick="deleteClashRow('${side}',${i})" title="Delete row">\xD7</button>
      </div></td>
    </tr>`;
  });
  tbody.innerHTML = html;
}
window.addClashRow = function(side) {
  clashRuleRows[side].push({
    elementType: "",
    property: "None",
    operator: "",
    value: "",
    action: "Add"
  });
  renderClashRules(side);
};
window.removeLastClashRow = function(side) {
  if (clashRuleRows[side].length > 0) {
    clashRuleRows[side].pop();
    renderClashRules(side);
  }
};
window.deleteClashRow = function(side, idx) {
  clashRuleRows[side].splice(idx, 1);
  renderClashRules(side);
};
window.updateClashRow = function(side, idx, field, value) {
  const r = clashRuleRows[side][idx];
  if (!r) return;
  r[field] = value;
  if (field === "property") {
    if (value === "None") {
      r.operator = "";
      r.value = "";
    }
    renderClashRules(side);
  }
};
function initClashRulesDefault() {
  if (clashRuleRows.A.length === 0) {
    clashRuleRows.A.push({ elementType: "", property: "None", operator: "", value: "", action: "Add" });
  }
  if (clashRuleRows.B.length === 0) {
    clashRuleRows.B.push({ elementType: "", property: "None", operator: "", value: "", action: "Add" });
  }
  renderClashRules("A");
  renderClashRules("B");
}
function resolveClashElementTypes(side) {
  const set = /* @__PURE__ */ new Set();
  for (const r of clashRuleRows[side]) {
    if (!r.elementType) continue;
    const ifcClasses = revitCategoryToIfcClasses(r.elementType, side);
    if (r.action === "Add") {
      ifcClasses.forEach((c) => set.add(c));
    } else if (r.action === "Remove") {
      ifcClasses.forEach((c) => set.delete(c));
    }
  }
  return set;
}
function resolveClashFilters(side) {
  const byType = {};
  for (const r of clashRuleRows[side]) {
    if (!r.elementType || r.action !== "Add") continue;
    if (!r.property || r.property === "None" || !r.operator || !r.value) continue;
    const ifcClasses = revitCategoryToIfcClasses(r.elementType, side);
    ifcClasses.forEach((c) => {
      if (!byType[c]) byType[c] = [];
      byType[c].push({ prop: r.property, op: r.operator, val: r.value });
    });
  }
  return byType;
}
const CLASH_PRESETS = {
  "struct-mep": {
    A: ["IfcBeam", "IfcColumn", "IfcSlab", "IfcWall", "IfcWallStandardCase", "IfcFooting", "IfcMember", "IfcPlate", "IfcRoof", "IfcStair", "IfcStairFlight", "IfcRamp", "IfcRampFlight"],
    B: ["IfcPipeSegment", "IfcPipeFitting", "IfcDuctSegment", "IfcDuctFitting", "IfcCableCarrierSegment", "IfcCableCarrierFitting", "IfcCableSegment", "IfcFlowSegment", "IfcFlowFitting", "IfcFlowTerminal", "IfcFlowController", "IfcDistributionElement", "IfcDistributionFlowElement", "IfcEnergyConversionDevice", "IfcFlowMovingDevice", "IfcFlowStorageDevice", "IfcFlowTreatmentDevice", "IfcSanitaryTerminal", "IfcAirTerminal", "IfcLightFixture", "IfcElectricAppliance", "IfcElectricDistributionBoard", "IfcElectricMotor", "IfcSwitchingDevice", "IfcOutlet", "IfcSensor", "IfcAlarm", "IfcController", "IfcUnitaryEquipment", "IfcValve", "IfcPump", "IfcFan", "IfcBoiler", "IfcChiller"]
  },
  "arch-mep": {
    A: ["IfcWall", "IfcWallStandardCase", "IfcDoor", "IfcWindow", "IfcStair", "IfcStairFlight", "IfcRailing", "IfcCovering", "IfcCurtainWall", "IfcFurnishingElement"],
    B: ["IfcPipeSegment", "IfcPipeFitting", "IfcDuctSegment", "IfcDuctFitting", "IfcCableCarrierSegment", "IfcCableCarrierFitting", "IfcFlowTerminal", "IfcSanitaryTerminal", "IfcAirTerminal", "IfcLightFixture"]
  },
  "struct-arch": {
    A: ["IfcBeam", "IfcColumn", "IfcSlab", "IfcFooting", "IfcMember", "IfcPlate"],
    B: ["IfcWall", "IfcWallStandardCase", "IfcDoor", "IfcWindow", "IfcStair", "IfcStairFlight", "IfcRailing", "IfcCovering", "IfcCurtainWall"]
  },
  "all-all": { A: "*", B: "*" }
};
window.applyClashPreset = function(presetKey) {
  const preset = CLASH_PRESETS[presetKey];
  if (!preset) {
    log("Unknown clash preset: " + presetKey);
    return;
  }
  ["A", "B"].forEach((side) => {
    const list = preset[side];
    let categories;
    const available = new Set(getClashElementTypes(side));
    if (list === "*") {
      categories = [...available];
    } else {
      const catSet = /* @__PURE__ */ new Set();
      list.forEach((ifcClass) => {
        const cat = ifcClassToRevitCategory(ifcClass);
        if (available.has(cat)) catSet.add(cat);
      });
      categories = [...catSet].sort();
    }
    clashRuleRows[side] = categories.map((t) => ({
      elementType: t,
      property: "None",
      operator: "",
      value: "",
      action: "Add"
    }));
    renderClashRules(side);
  });
  const nameMap = { "struct-mep": "Structure \u2194 MEP", "arch-mep": "Architecture \u2194 MEP", "struct-arch": "Structure \u2194 Architecture", "all-all": "All \u2194 All" };
  const nameEl = document.getElementById("clashRuleName");
  if (nameEl && nameMap[presetKey]) nameEl.value = nameMap[presetKey];
  log("Applied clash preset: " + presetKey);
};
window.swapClashSets = function() {
  const a = clashRuleRows.A, b = clashRuleRows.B;
  const availA = new Set(getClashElementTypes("A"));
  const availB = new Set(getClashElementTypes("B"));
  clashRuleRows.A = b.filter((r) => !r.elementType || availA.has(r.elementType));
  clashRuleRows.B = a.filter((r) => !r.elementType || availB.has(r.elementType));
  renderClashRules("A");
  renderClashRules("B");
  log("Swapped Source \u2194 Target sets");
};
function getSelectedCats(side) {
  return [...resolveClashElementTypes(side)];
}
function passesFilters(entity, filters) {
  if (!filters || !filters.length) return true;
  for (const f of filters) {
    const v = String(entity[f.prop] || entity[f.prop?.toLowerCase?.()] || "").toLowerCase();
    const fv = String(f.val || f.value || "").toLowerCase();
    let pass = false;
    if (f.op === "contains") pass = v.includes(fv);
    else if (f.op === "equals") pass = v === fv;
    else if (f.op === "not_contains") pass = !v.includes(fv);
    else if (f.op === "not_equals") pass = v !== fv;
    else if (f.op === "starts") pass = v.startsWith(fv);
    else if (f.op === "gt") pass = parseFloat(v) > parseFloat(fv);
    else if (f.op === "lt") pass = parseFloat(v) < parseFloat(fv);
    if (!pass) return false;
  }
  return true;
}
function getClashFilters(side) {
  const byType = resolveClashFilters(side);
  const flat = [];
  for (const t in byType) {
    for (const f of byType[t]) flat.push({ ...f, elementType: t });
  }
  return flat;
}
window.toggleClashMode = function() {
  if (compareResult) {
    log("Exit compare first");
    return;
  }
  clashMode = !clashMode;
  document.getElementById("btnClash").classList.toggle("active", clashMode);
  if (clashMode) {
    document.getElementById("clashPanel").classList.add("show");
    const br = document.getElementById("bresize");
    if (br) br.style.display = "";
    document.getElementById("eTree").style.display = "none";
    document.getElementById("issuesList").classList.remove("show");
    document.getElementById("panelTabs").classList.remove("show");
    document.getElementById("issueNav").classList.remove("show");
    document.getElementById("btnRunClash").style.display = "";
    document.getElementById("btnCompare").style.display = "none";
    if (files[0]) document.getElementById("clashFileA").textContent = files[0].name;
    if (files[1]) document.getElementById("clashFileB").textContent = files[1].name;
    document.getElementById("btnRunClash").disabled = !(loadedModels[0] && loadedModels[1]);
    initClashRulesDefault();
    if (window._vpResize) window._vpResize();
  } else {
    exitClashMode();
  }
};
window.exitClashMode = function() {
  clashMode = false;
  document.getElementById("btnClash").classList.remove("active");
  document.getElementById("clashPanel").classList.remove("show");
  const br = document.getElementById("bresize");
  if (br) br.style.display = "none";
  document.getElementById("eTree").style.display = "";
  document.getElementById("btnRunClash").style.display = "none";
  document.getElementById("btnExitClash").style.display = "none";
  document.getElementById("btnExportClashCSV").style.display = "none";
  document.getElementById("btnExportClashBCF").style.display = "none";
  document.getElementById("btnCompare").style.display = "";
  document.getElementById("vpClashLegend").classList.remove("show");
  document.getElementById("btnCompare").disabled = !(loadedModels[0] && loadedModels[1]);
  document.getElementById("clashGroupBar").style.display = "none";
  clashSubsets.forEach((s) => {
    if (s.parent) s.parent.remove(s);
  });
  clashSubsets = [];
  clashResults = [];
  currentClashIdx = -1;
  clashPropertyCacheA = {};
  clashPropertyCacheB = {};
  const oldFocus = [];
  scene.traverse((c) => {
    if (c.userData?.clashFocus) oldFocus.push(c);
  });
  oldFocus.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });
  for (let i = 0; i < 2; i++) {
    if (!loadedModels[i]) continue;
    const vis = document.getElementById(i === 0 ? "visA" : "visB").checked;
    loadedModels[i].visible = vis;
    loadedModels[i].traverse((c) => {
      if (c.isMesh) {
        if (c.userData._clashOrigMats) {
          c.material = c.userData._clashOrigMats;
          delete c.userData._clashOrigMats;
        }
        c.visible = true;
      }
    });
  }
  document.getElementById("clashStats").style.display = "none";
  document.getElementById("clashList").innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Configure Source &amp; Target sets, then click <b>\u25B6 Run Clash</b></div>';
  document.getElementById("clashFiltersA").innerHTML = "";
  document.getElementById("clashFiltersB").innerHTML = "";
  if (window._vpResize) window._vpResize();
  log("Exited clash mode");
};
function buildElementBBoxes(modelIdx) {
  const model = loadedModels[modelIdx];
  if (!model) return {};
  const elements = {};
  model.traverse((c) => {
    if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
    const eidArr = c.geometry.attributes.expressID.array;
    const posArr = c.geometry.attributes.position.array;
    const wm = c.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < eidArr.length; i++) {
      const eid = eidArr[i];
      if (!eid || eid <= 0) continue;
      const pi = i * 3;
      if (pi + 2 >= posArr.length) continue;
      const x = posArr[pi], y = posArr[pi + 1], z = posArr[pi + 2];
      if (isNaN(x)) continue;
      v.set(x, y, z).applyMatrix4(wm);
      if (!elements[eid]) {
        elements[eid] = {
          eid,
          modelIdx,
          mnX: v.x,
          mnY: v.y,
          mnZ: v.z,
          mxX: v.x,
          mxY: v.y,
          mxZ: v.z,
          vertCount: 0
        };
      }
      const el = elements[eid];
      el.vertCount++;
      if (v.x < el.mnX) el.mnX = v.x;
      if (v.x > el.mxX) el.mxX = v.x;
      if (v.y < el.mnY) el.mnY = v.y;
      if (v.y > el.mxY) el.mxY = v.y;
      if (v.z < el.mnZ) el.mnZ = v.z;
      if (v.z > el.mxZ) el.mxZ = v.z;
    }
  });
  return elements;
}
function bboxOverlap(a, b, tol) {
  return a.mnX <= b.mxX + tol && a.mxX >= b.mnX - tol && a.mnY <= b.mxY + tol && a.mxY >= b.mnY - tol && a.mnZ <= b.mxZ + tol && a.mxZ >= b.mnZ - tol;
}
function bboxPenetration(a, b) {
  const ox = Math.min(a.mxX, b.mxX) - Math.max(a.mnX, b.mnX);
  const oy = Math.min(a.mxY, b.mxY) - Math.max(a.mnY, b.mnY);
  const oz = Math.min(a.mxZ, b.mxZ) - Math.max(a.mnZ, b.mnZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz);
}
function meshIntersectionTest(elA, elB, modelA, modelB) {
  const pad = 0.01;
  let insideCount = 0;
  let totalChecked = 0;
  const checkInside = (srcModel, srcEid, targetBBox) => {
    let inside = 0, total = 0;
    srcModel.traverse((c) => {
      if (!c.isMesh || !c.geometry?.attributes?.expressID || !c.geometry?.attributes?.position) return;
      const eids = c.geometry.attributes.expressID.array;
      const pos = c.geometry.attributes.position.array;
      const wm = c.matrixWorld;
      const v = new THREE.Vector3();
      for (let i = 0; i < eids.length; i++) {
        if (eids[i] !== srcEid) continue;
        total++;
        const pi = i * 3;
        v.set(pos[pi], pos[pi + 1], pos[pi + 2]).applyMatrix4(wm);
        if (v.x >= targetBBox.mnX - pad && v.x <= targetBBox.mxX + pad && v.y >= targetBBox.mnY - pad && v.y <= targetBBox.mxY + pad && v.z >= targetBBox.mnZ - pad && v.z <= targetBBox.mxZ + pad) {
          inside++;
        }
      }
    });
    return { inside, total };
  };
  const rAB = checkInside(modelA, elA.eid, elB);
  const rBA = checkInside(modelB, elB.eid, elA);
  return {
    verticesAinB: rAB.inside,
    totalA: rAB.total,
    verticesBinA: rBA.inside,
    totalB: rBA.total,
    isHard: rAB.inside > 0 || rBA.inside > 0
  };
}
window.runClashDetection = async function() {
  if (!loadedModels[0] || !loadedModels[1]) return;
  const lo = document.getElementById("loadOv"), lt = document.getElementById("loadTxt"), lf = document.getElementById("loadFill");
  lo.classList.add("on");
  const minDistMm = parseFloat(document.getElementById("clashTolMinDist")?.value) || 0;
  const tolerance = minDistMm / 1e3;
  const cClash = document.getElementById("clashTypeClash")?.checked;
  const cDuplicate = document.getElementById("clashTypeDuplicate")?.checked;
  const cDistance = document.getElementById("clashTypeDistance")?.checked || minDistMm > 0;
  let clashTypeFilter = "hard";
  if (cClash && cDistance) clashTypeFilter = "both";
  else if (cDistance) clashTypeFilter = "clearance";
  else clashTypeFilter = "hard";
  const catsA = resolveClashElementTypes("A");
  const catsB = resolveClashElementTypes("B");
  const filtersA = getClashFilters("A");
  const filtersB = getClashFilters("B");
  if (catsA.size === 0 || catsB.size === 0) {
    lo.classList.remove("on");
    alert("Please add at least one Element Type to both Source Set and Target Set.");
    return;
  }
  log("Clash config: Source types=" + catsA.size + ", Target types=" + catsB.size + ", filtersA=" + filtersA.length + ", filtersB=" + filtersB.length + ", tolerance=" + tolerance + "m, type=" + clashTypeFilter);
  lt.textContent = "Building Source Set (Model A)...";
  lf.style.width = "5%";
  await new Promise((r) => setTimeout(r, 30));
  const catIDs = window._catModelIDs || {};
  const api = ifcLoader?.ifcManager?.state?.api;
  const buildFilteredSet = async (modelIdx, selectedCats, propFilters) => {
    const elements = {};
    const propCache = {};
    for (const cat of selectedCats) {
      const ids = catIDs[cat]?.[modelIdx];
      if (!ids) continue;
      for (const eid of ids) {
        let entity = { expressID: eid, type: cat, name: "", objectType: "", tag: "", description: "", predefinedType: "" };
        try {
          const p = await ifcLoader.ifcManager.getItemProperties(loadedModels[modelIdx].modelID, eid, false);
          if (p) {
            entity.name = p.Name?.value || "";
            entity.objectType = p.ObjectType?.value || "";
            entity.tag = p.Tag?.value || "";
            entity.description = p.Description?.value || "";
            entity.predefinedType = p.PredefinedType?.value || "";
            entity.Name = entity.name;
            entity.ObjectType = entity.objectType;
            entity.Tag = entity.tag;
            entity.Description = entity.description;
            entity.PredefinedType = entity.predefinedType;
          }
        } catch (e) {
        }
        if (!passesFilters(entity, propFilters)) continue;
        elements[eid] = entity;
        propCache[eid] = entity;
      }
    }
    return { elements, propCache };
  };
  const setA = await buildFilteredSet(0, catsA, filtersA);
  lt.textContent = "Building Target Set (Model B)...";
  lf.style.width = "15%";
  await new Promise((r) => setTimeout(r, 20));
  const setB = await buildFilteredSet(1, catsB, filtersB);
  clashPropertyCacheA = setA.propCache;
  clashPropertyCacheB = setB.propCache;
  const sourceEids = new Set(Object.keys(setA.elements).map(Number));
  const targetEids = new Set(Object.keys(setB.elements).map(Number));
  log(`Filtered sets: Source=${sourceEids.size} elements, Target=${targetEids.size} elements`);
  lt.textContent = "Computing bounding boxes...";
  lf.style.width = "20%";
  await new Promise((r) => setTimeout(r, 20));
  const allBBoxA = buildElementBBoxes(0);
  const allBBoxB = buildElementBBoxes(1);
  const arrA = Object.values(allBBoxA).filter((e) => sourceEids.has(e.eid));
  const arrB = Object.values(allBBoxB).filter((e) => targetEids.has(e.eid));
  log(`BBoxes: Source=${arrA.length}, Target=${arrB.length}`);
  lt.textContent = `BBox pre-filter (${arrA.length} \xD7 ${arrB.length})...`;
  lf.style.width = "30%";
  await new Promise((r) => setTimeout(r, 20));
  const candidates = [];
  let checked = 0;
  const total = arrA.length * arrB.length;
  for (const a of arrA) {
    for (const b of arrB) {
      if (bboxOverlap(a, b, tolerance)) {
        const pen = bboxPenetration(a, b);
        candidates.push({ a, b, penetration: pen });
      }
      checked++;
    }
    if (checked % 5e4 === 0) {
      lt.textContent = `BBox: ${candidates.length} candidates (${Math.round(checked / total * 100)}%)`;
      lf.style.width = 30 + 30 * (checked / total) + "%";
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  log(`BBox pre-filter: ${candidates.length} candidates`);
  lt.textContent = `Mesh intersection (${candidates.length} pairs)...`;
  lf.style.width = "60%";
  await new Promise((r) => setTimeout(r, 20));
  clashResults = [];
  const maxCheck = Math.min(candidates.length, 2e3);
  candidates.sort((a, b) => b.penetration - a.penetration);
  const skipTypes = /* @__PURE__ */ new Set(["IfcSpace", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcProject"]);
  for (let i = 0; i < maxCheck; i++) {
    const { a, b, penetration } = candidates[i];
    const meshTest = meshIntersectionTest(a, b, loadedModels[0], loadedModels[1]);
    const isHard = meshTest.isHard;
    if (clashTypeFilter === "hard" && !isHard) continue;
    if (clashTypeFilter === "clearance" && isHard) continue;
    if (isHard || penetration > tolerance) {
      const entA = clashPropertyCacheA[a.eid] || {};
      const entB = clashPropertyCacheB[b.eid] || {};
      const typeA = entA.type || "";
      const typeB = entB.type || "";
      if (skipTypes.has(typeA) || skipTypes.has(typeB)) continue;
      clashResults.push({
        idx: clashResults.length,
        elA: { eid: a.eid, name: entA.name || "", type: typeA, objectType: entA.objectType || "", tag: entA.tag || "", modelIdx: 0, bbox: a },
        elB: { eid: b.eid, name: entB.name || "", type: typeB, objectType: entB.objectType || "", tag: entB.tag || "", modelIdx: 1, bbox: b },
        penetration,
        isHard,
        verticesAinB: meshTest.verticesAinB,
        verticesBinA: meshTest.verticesBinA,
        point: {
          x: (Math.max(a.mnX, b.mnX) + Math.min(a.mxX, b.mxX)) / 2,
          y: (Math.max(a.mnY, b.mnY) + Math.min(a.mxY, b.mxY)) / 2,
          z: (Math.max(a.mnZ, b.mnZ) + Math.min(a.mxZ, b.mxZ)) / 2
        }
      });
    }
    if (i % 100 === 0) {
      lt.textContent = `Mesh: ${i}/${maxCheck} (${clashResults.length} clashes)`;
      lf.style.width = 60 + 30 * (i / maxCheck) + "%";
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  log(`Clash detection complete: ${clashResults.length} clashes found`);
  lt.textContent = `Done! ${clashResults.length} clashes`;
  lf.style.width = "100%";
  await new Promise((r) => setTimeout(r, 300));
  lo.classList.remove("on");
  showClashResults();
};
function showClashResults() {
  document.getElementById("btnExitClash").style.display = "";
  document.getElementById("btnRunClash").style.display = "none";
  document.getElementById("vpClashLegend").classList.add("show");
  document.getElementById("clashGroupBar").style.display = "flex";
  if (clashResults.length > 0) {
    document.getElementById("btnExportClashCSV").style.display = "";
    document.getElementById("btnExportClashBCF").style.display = "";
  }
  for (let i = 0; i < 2; i++) {
    if (!loadedModels[i]) continue;
    loadedModels[i].traverse((c) => {
      if (c.isMesh) {
        if (!c.userData._clashOrigMats) {
          c.userData._clashOrigMats = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
        }
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          m.transparent = true;
          m.opacity = 0.55;
          m.depthWrite = true;
          m.needsUpdate = true;
          m.clippingPlanes = clipPlanes;
        });
      }
    });
  }
  const clashGroup = new THREE.Group();
  clashGroup.name = "clashMarkers";
  clashGroup.userData.clashSubset = true;
  clashResults.forEach((cl, i) => {
    const overlapMnX = Math.max(cl.elA.bbox.mnX, cl.elB.bbox.mnX);
    const overlapMnY = Math.max(cl.elA.bbox.mnY, cl.elB.bbox.mnY);
    const overlapMnZ = Math.max(cl.elA.bbox.mnZ, cl.elB.bbox.mnZ);
    const overlapMxX = Math.min(cl.elA.bbox.mxX, cl.elB.bbox.mxX);
    const overlapMxY = Math.min(cl.elA.bbox.mxY, cl.elB.bbox.mxY);
    const overlapMxZ = Math.min(cl.elA.bbox.mxZ, cl.elB.bbox.mxZ);
    const sx = Math.max(overlapMxX - overlapMnX, 0.05);
    const sy = Math.max(overlapMxY - overlapMnY, 0.05);
    const sz = Math.max(overlapMxZ - overlapMnZ, 0.05);
    const cx = (overlapMnX + overlapMxX) / 2;
    const cy = (overlapMnY + overlapMxY) / 2;
    const cz = (overlapMnZ + overlapMxZ) / 2;
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    const boxMat = new THREE.MeshPhongMaterial({
      color: cl.isHard ? 16717636 : 16748800,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: new THREE.Color(cl.isHard ? 6684672 : 6697728),
      clippingPlanes: clipPlanes
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(cx, cy, cz);
    box.renderOrder = 900;
    box.userData.clashIdx = i;
    box.userData.clashSubset = true;
    clashGroup.add(box);
    const wireGeo = new THREE.BoxGeometry(sx * 1.02, sy * 1.02, sz * 1.02);
    const wireMat = new THREE.MeshBasicMaterial({
      color: cl.isHard ? 16717636 : 16748800,
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.9
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.set(cx, cy, cz);
    wire.renderOrder = 901;
    wire.userData.clashSubset = true;
    clashGroup.add(wire);
  });
  scene.add(clashGroup);
  clashSubsets.push(clashGroup);
  log("Created " + clashResults.length + " clash zone markers");
  const hard = clashResults.filter((c) => c.isHard).length;
  const near = clashResults.length - hard;
  document.getElementById("clashStats").style.display = "";
  document.getElementById("clashTotal").textContent = clashResults.length;
  document.getElementById("clashHard").textContent = hard;
  document.getElementById("clashNear").textContent = near;
  let html = "";
  clashResults.forEach((cl, i) => {
    const penMM = (cl.penetration * 1e3).toFixed(0);
    html += `<div class="clash-card" id="clash-${i}" onclick="focusClash(${i})">
      <div class="cc-hdr">
        <span class="cc-num">#${i + 1} ${cl.isHard ? "\u26D4" : "\u26A0\uFE0F"}</span>
        <span class="cc-dist">${penMM}mm</span>
      </div>
      <div class="cc-el">A: ${cl.elA.name || "#" + cl.elA.eid}</div>
      <div class="cc-type">${(cl.elA.type || "").replace("Ifc", "")}</div>
      <div class="cc-el" style="margin-top:2px">B: ${cl.elB.name || "#" + cl.elB.eid}</div>
      <div class="cc-type">${(cl.elB.type || "").replace("Ifc", "")}</div>
    </div>`;
  });
  if (!html) html = '<div style="padding:20px;text-align:center;color:var(--green);font-size:14px;font-weight:600">\u2713 No clashes detected!</div>';
  document.getElementById("clashList").innerHTML = html;
}
window.regroupClashes = function() {
  const groupBy = document.getElementById("clashGroupBy").value;
  const list = document.getElementById("clashList");
  if (groupBy === "none" || !clashResults.length) {
    let html2 = "";
    clashResults.forEach((cl, i) => {
      const penMM = (cl.penetration * 1e3).toFixed(0);
      html2 += `<div class="clash-card" id="clash-${i}" onclick="focusClash(${i})">
        <div class="cc-hdr"><span class="cc-num">#${i + 1} ${cl.isHard ? "\u26D4" : "\u26A0\uFE0F"}</span><span class="cc-dist">${penMM}mm</span></div>
        <div class="cc-el">A: ${cl.elA.name || "#" + cl.elA.eid}</div>
        <div class="cc-type">${(cl.elA.type || "").replace("Ifc", "")}</div>
        <div class="cc-el" style="margin-top:2px">B: ${cl.elB.name || "#" + cl.elB.eid}</div>
        <div class="cc-type">${(cl.elB.type || "").replace("Ifc", "")}</div>
      </div>`;
    });
    list.innerHTML = html2;
    return;
  }
  const groups = {};
  clashResults.forEach((cl, i) => {
    let key = "Other";
    if (groupBy === "categoryA") key = cl.elA.type || "Unknown";
    else if (groupBy === "categoryB") key = cl.elB.type || "Unknown";
    else if (groupBy === "level") {
      const y = cl.point.y;
      const level = Math.round(y / 3) * 3;
      key = "Level \u2248 " + level.toFixed(0) + "m";
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push({ cl, origIdx: i });
  });
  let html = "";
  const sortedKeys = Object.keys(groups).sort();
  sortedKeys.forEach((key) => {
    const items = groups[key];
    const gid = "cg_" + key.replace(/\W/g, "_");
    html += `<div class="clash-group-hdr" onclick="toggleClashGroup('${gid}')">
      <span class="cg-arr" id="arr_${gid}">\u25BC</span>
      <span>${key.replace("Ifc", "")}</span>
      <span class="cg-count">${items.length}</span>
    </div>
    <div class="clash-group-body" id="body_${gid}">`;
    items.forEach(({ cl, origIdx }) => {
      const penMM = (cl.penetration * 1e3).toFixed(0);
      html += `<div class="clash-card" id="clash-${origIdx}" onclick="focusClash(${origIdx})">
        <div class="cc-hdr"><span class="cc-num">#${origIdx + 1} ${cl.isHard ? "\u26D4" : "\u26A0\uFE0F"}</span><span class="cc-dist">${penMM}mm</span></div>
        <div class="cc-el">A: ${cl.elA.name || "#" + cl.elA.eid}</div>
        <div class="cc-el" style="margin-top:1px">B: ${cl.elB.name || "#" + cl.elB.eid}</div>
      </div>`;
    });
    html += `</div>`;
  });
  list.innerHTML = html;
};
window.toggleClashGroup = function(gid) {
  const arr = document.getElementById("arr_" + gid);
  const body = document.getElementById("body_" + gid);
  if (arr) arr.classList.toggle("col");
  if (body) body.classList.toggle("col");
};
window.focusClash = function(idx) {
  if (idx < 0 || idx >= clashResults.length) return;
  currentClashIdx = idx;
  const cl = clashResults[idx];
  document.querySelectorAll(".clash-card").forEach((c) => c.classList.remove("active"));
  const card = document.getElementById("clash-" + idx);
  if (card) card.classList.add("active");
  const oldFocus = [];
  scene.traverse((c) => {
    if (c.userData?.clashFocus) oldFocus.push(c);
  });
  oldFocus.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });
  const matFocusA = new THREE.MeshPhongMaterial({ color: 15680580, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  const matFocusB = new THREE.MeshPhongMaterial({ color: 3900150, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: true, clippingPlanes: clipPlanes });
  [
    { mi: 0, eid: cl.elA.eid, mat: matFocusA },
    { mi: 1, eid: cl.elB.eid, mat: matFocusB }
  ].forEach(({ mi, eid, mat }) => {
    if (!loadedModels[mi]) return;
    try {
      const sub = ifcLoader.ifcManager.createSubset({ modelID: loadedModels[mi].modelID, ids: [eid], material: mat, scene, removePrevious: false, customID: "clashFocus_" + mi + "_" + eid });
      if (sub) {
        sub.position.copy(loadedModels[mi].position);
        sub.updateMatrixWorld(true);
        sub.userData.clashFocus = true;
        sub.traverse((ch) => {
          if (ch.isMesh) ch.userData.clashFocus = true;
        });
      }
    } catch (e) {
    }
  });
  if (clashSubsets[0] && clashSubsets[0].name === "clashMarkers") {
    clashSubsets[0].children.forEach((ch) => {
      if (ch.userData.clashIdx === idx && ch.material && !ch.material.wireframe) {
        ch.material.opacity = 0.95;
        ch.material.needsUpdate = true;
      } else if (ch.material && !ch.material.wireframe && ch.userData.clashIdx !== void 0) {
        ch.material.opacity = 0.35;
        ch.material.needsUpdate = true;
      }
    });
  }
  const overlapMnX = Math.max(cl.elA.bbox.mnX, cl.elB.bbox.mnX);
  const overlapMnY = Math.max(cl.elA.bbox.mnY, cl.elB.bbox.mnY);
  const overlapMnZ = Math.max(cl.elA.bbox.mnZ, cl.elB.bbox.mnZ);
  const overlapMxX = Math.min(cl.elA.bbox.mxX, cl.elB.bbox.mxX);
  const overlapMxY = Math.min(cl.elA.bbox.mxY, cl.elB.bbox.mxY);
  const overlapMxZ = Math.min(cl.elA.bbox.mxZ, cl.elB.bbox.mxZ);
  const ozX = Math.max(overlapMxX - overlapMnX, 0.1);
  const ozY = Math.max(overlapMxY - overlapMnY, 0.1);
  const ozZ = Math.max(overlapMxZ - overlapMnZ, 0.1);
  const contextPad = Math.max(ozX, ozY, ozZ) * 1.5 + 1.5;
  const mnX = (overlapMnX + overlapMxX) / 2 - contextPad;
  const mnY = (overlapMnY + overlapMxY) / 2 - contextPad;
  const mnZ = (overlapMnZ + overlapMxZ) / 2 - contextPad;
  const mxX = (overlapMnX + overlapMxX) / 2 + contextPad;
  const mxY = (overlapMnY + overlapMxY) / 2 + contextPad;
  const mxZ = (overlapMnZ + overlapMxZ) / 2 + contextPad;
  const viewDist = contextPad * 2.5;
  const pt = cl.point;
  camera.position.set(pt.x + viewDist * 0.45, pt.y + viewDist * 0.35, pt.z + viewDist * 0.45);
  controls.target.set(pt.x, pt.y, pt.z);
  controls.update();
  const b = modelBounds;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const toSl = (val, mn, range) => Math.max(0, Math.min(100, Math.round((val - mn) / range * 100)));
  document.getElementById("slXp").value = toSl(mxX, b.min.x, sx);
  document.getElementById("slXn").value = toSl(mnX, b.min.x, sx);
  document.getElementById("slYp").value = toSl(mxY, b.min.y, sy);
  document.getElementById("slYn").value = toSl(mnY, b.min.y, sy);
  document.getElementById("slZp").value = toSl(mxZ, b.min.z, sz);
  document.getElementById("slZn").value = toSl(mnZ, b.min.z, sz);
  if (!sectionActive) {
    sectionActive = true;
    document.getElementById("sectionPanel").classList.add("show");
    document.getElementById("btnSection").classList.add("active");
    createSectionBox3D();
  }
  updateSectionFromSliders();
  const penMM = (cl.penetration * 1e3).toFixed(1);
  let h = `<div style="padding:8px 12px;background:var(--red-lt);border-bottom:1px solid var(--border)">
    <span style="font-family:JetBrains Mono;font-size:13px;font-weight:700;color:var(--red)">CLASH #${idx + 1} \u2014 ${cl.isHard ? "HARD CLASH" : "CLEARANCE"}</span>
  </div>
  <div class="ps"><div class="ps-t">Clash Info</div>
    <div class="pr"><div class="pk">Penetration</div><div class="pv" style="color:var(--red);font-weight:700">${penMM} mm</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.isHard ? "Hard (geometry intersects)" : "Clearance (bbox overlap)"}</div></div>
  </div>
  <div class="ps"><div class="ps-t"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ef4444;margin-right:4px"></span>Element A \u2014 Source</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${cl.elA.name || "\u2014"}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.elA.type || "\u2014"}</div></div>
    <div class="pr"><div class="pk">Tag</div><div class="pv">${cl.elA.tag || "\u2014"}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${cl.elA.eid}</div></div>
  </div>
  <div class="ps"><div class="ps-t"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#3b82f6;margin-right:4px"></span>Element B \u2014 Target</div>
    <div class="pr"><div class="pk">Name</div><div class="pv">${cl.elB.name || "\u2014"}</div></div>
    <div class="pr"><div class="pk">Type</div><div class="pv">${cl.elB.type || "\u2014"}</div></div>
    <div class="pr"><div class="pk">Tag</div><div class="pv">${cl.elB.tag || "\u2014"}</div></div>
    <div class="pr"><div class="pk">ExpressID</div><div class="pv">${cl.elB.eid}</div></div>
  </div>`;
  document.getElementById("propArea").innerHTML = h;
  log(`Focused clash #${idx + 1}: ${cl.elA.name} vs ${cl.elB.name} (${penMM}mm)`);
};
window.exportClashCSV = function() {
  if (!clashResults.length) return;
  let csv = "#,Type,Penetration_mm,ElementA_Name,ElementA_Type,ElementA_ID,ElementB_Name,ElementB_Type,ElementB_ID,X,Y,Z\n";
  clashResults.forEach((cl, i) => {
    csv += `${i + 1},${cl.isHard ? "Hard" : "Clearance"},${(cl.penetration * 1e3).toFixed(1)},"${cl.elA.name}",${cl.elA.type},${cl.elA.eid},"${cl.elB.name}",${cl.elB.type},${cl.elB.eid},${cl.point.x.toFixed(3)},${cl.point.y.toFixed(3)},${cl.point.z.toFixed(3)}
`;
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "ifc-clash-report.csv";
  a.click();
  log("Clash CSV exported: " + clashResults.length + " clashes");
};
window.exportClashBCF = async function() {
  if (!clashResults.length) {
    log("No clashes to export");
    return;
  }
  if (!window.JSZip) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
    await new Promise((res, rej) => {
      s.onload = res;
      s.onerror = rej;
    });
  }
  setStatus("loading", "Exporting Clash BCF...");
  log("Exporting BCF for " + clashResults.length + " clashes...");
  const zip = new JSZip();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const pid = crypto.randomUUID();
  const mdlPos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2; i++) {
    if (loadedModels[i]) {
      mdlPos.x = loadedModels[i].position.x;
      mdlPos.y = loadedModels[i].position.y;
      mdlPos.z = loadedModels[i].position.z;
      break;
    }
  }
  const threeToIfc = (x, y, z) => {
    const tx = x - mdlPos.x, ty = y - mdlPos.y, tz = z - mdlPos.z;
    return { x: tx, y: tz, z: -ty };
  };
  log("Clash BCF model offset (three-space): (" + mdlPos.x.toFixed(2) + ", " + mdlPos.y.toFixed(2) + ", " + mdlPos.z.toFixed(2) + ")");
  const saveCam = camera.position.clone();
  const saveTgt = controls.target.clone();
  const saveSectionActive = sectionActive;
  const savePrevClashIdx = typeof currentClashIdx !== "undefined" ? currentClashIdx : -1;
  const saveSlider = {
    Xp: document.getElementById("slXp")?.value,
    Xn: document.getElementById("slXn")?.value,
    Yp: document.getElementById("slYp")?.value,
    Yn: document.getElementById("slYn")?.value,
    Zp: document.getElementById("slZp")?.value,
    Zn: document.getElementById("slZn")?.value
  };
  zip.file("bcf.version", '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file("project.bcfp", '<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="' + pid + '"><n>IFC Delta Clash Detection</n></Project></ProjectExtension>');
  for (let i = 0; i < clashResults.length; i++) {
    const cl = clashResults[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();
    let guidA = "", guidB = "";
    try {
      const pA = await ifcLoader.ifcManager.getItemProperties(loadedModels[0].modelID, cl.elA.eid, false);
      if (pA?.GlobalId?.value) guidA = pA.GlobalId.value;
    } catch (e) {
    }
    try {
      const pB = await ifcLoader.ifcManager.getItemProperties(loadedModels[1].modelID, cl.elB.eid, false);
      if (pB?.GlobalId?.value) guidB = pB.GlobalId.value;
    } catch (e) {
    }
    const A = cl.elA.bbox, B = cl.elB.bbox;
    const ovMnX = Math.max(A.mnX, B.mnX), ovMxX = Math.min(A.mxX, B.mxX);
    const ovMnY = Math.max(A.mnY, B.mnY), ovMxY = Math.min(A.mxY, B.mxY);
    const ovMnZ = Math.max(A.mnZ, B.mnZ), ovMxZ = Math.min(A.mxZ, B.mxZ);
    const ovSx = Math.max(0.5, ovMxX - ovMnX);
    const ovSy = Math.max(0.5, ovMxY - ovMnY);
    const ovSz = Math.max(0.5, ovMxZ - ovMnZ);
    const ovSize = Math.max(ovSx, ovSy, ovSz);
    const elSize = Math.max(
      A.mxX - A.mnX,
      A.mxY - A.mnY,
      A.mxZ - A.mnZ,
      B.mxX - B.mnX,
      B.mxY - B.mnY,
      B.mxZ - B.mnZ
    );
    const sbPad = Math.max(1.5, Math.min(elSize * 0.3, 5));
    const sbMnX = ovMnX - sbPad, sbMxX = ovMxX + sbPad;
    const sbMnY = ovMnY - sbPad, sbMxY = ovMxY + sbPad;
    const sbMnZ = ovMnZ - sbPad, sbMxZ = ovMxZ + sbPad;
    const cxT = ovMxX > ovMnX ? (ovMnX + ovMxX) / 2 : cl.point.x;
    const cyT = ovMxY > ovMnY ? (ovMnY + ovMxY) / 2 : cl.point.y;
    const czT = ovMxZ > ovMnZ ? (ovMnZ + ovMxZ) / 2 : cl.point.z;
    let snap64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==";
    try {
      window.focusClash(i);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      renderer.render(scene, camera);
      try {
        snap64 = renderer.domElement.toDataURL("image/png").split(",")[1];
      } catch (e) {
      }
    } catch (e) {
      log("Clash snapshot err #" + (i + 1) + ":", e?.message);
    }
    const ifcCenter = threeToIfc(cxT, cyT, czT);
    const ix = ifcCenter.x, iy = ifcCenter.y, iz = ifcCenter.z;
    const ifcSx = Math.abs(threeToIfc(sbMxX, 0, 0).x - threeToIfc(sbMnX, 0, 0).x);
    const ifcSy = Math.abs(threeToIfc(0, 0, sbMxZ).y - threeToIfc(0, 0, sbMnZ).y);
    const ifcSz = Math.abs(threeToIfc(0, sbMxY, 0).z - threeToIfc(0, sbMnY, 0).z);
    const viewR = Math.max(ifcSx, ifcSy, ifcSz) * 2.5 + 2;
    const camX = ix + viewR * 0.45, camY = iy + viewR * 0.45, camZ = iz - viewR * 0.35;
    const ddx = ix - camX, ddy = iy - camY, ddz = iz - camZ;
    const ln = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    const cornersIfc = [
      threeToIfc(sbMnX, sbMnY, sbMnZ),
      threeToIfc(sbMxX, sbMnY, sbMnZ),
      threeToIfc(sbMnX, sbMxY, sbMnZ),
      threeToIfc(sbMxX, sbMxY, sbMnZ),
      threeToIfc(sbMnX, sbMnY, sbMxZ),
      threeToIfc(sbMxX, sbMnY, sbMxZ),
      threeToIfc(sbMnX, sbMxY, sbMxZ),
      threeToIfc(sbMxX, sbMxY, sbMxZ)
    ];
    let cMnX = Infinity, cMnY = Infinity, cMnZ = Infinity, cMxX = -Infinity, cMxY = -Infinity, cMxZ = -Infinity;
    cornersIfc.forEach((c) => {
      cMnX = Math.min(cMnX, c.x);
      cMnY = Math.min(cMnY, c.y);
      cMnZ = Math.min(cMnZ, c.z);
      cMxX = Math.max(cMxX, c.x);
      cMxY = Math.max(cMxY, c.y);
      cMxZ = Math.max(cMxZ, c.z);
    });
    const clips = "<ClippingPlanes><ClippingPlane><Location><X>" + cMxX.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + cMnX.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + cMxY.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + cMnY.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + cMxZ.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + cMnZ.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane></ClippingPlanes>";
    const penMM = (cl.penetration * 1e3).toFixed(1);
    const title = "Clash #" + (i + 1) + " " + (cl.isHard ? "HARD" : "CLEARANCE") + " (" + penMM + "mm) \u2014 " + (cl.elA.name || cl.elA.type) + " vs " + (cl.elB.name || cl.elB.type);
    const desc = "Penetration: " + penMM + "mm | Source: " + (cl.elA.name || "#" + cl.elA.eid) + " (" + cl.elA.type + ") | Target: " + (cl.elB.name || "#" + cl.elB.eid) + " (" + cl.elB.type + ")";
    const tagA = cl.elA.tag || "";
    const tagB = cl.elB.tag || "";
    const makeComponent = (guid, tag) => {
      if (!guid && !tag) return "";
      let x = "<Component" + (guid ? ' IfcGuid="' + escXml(guid) + '"' : "") + ">";
      x += "<OriginatingSystem>Autodesk Revit</OriginatingSystem>";
      if (tag) x += "<AuthoringToolId>" + escXml(tag) + "</AuthoringToolId>";
      x += "</Component>";
      return x;
    };
    const compA = makeComponent(guidA, tagA);
    const compB = makeComponent(guidB, tagB);
    let selectionXml = "<Selection>";
    let colorXml = "<Coloring>";
    if (compA) {
      selectionXml += compA;
      colorXml += '<Color Color="FFEF4444">' + compA + "</Color>";
    }
    if (compB) {
      selectionXml += compB;
      colorXml += '<Color Color="FFF97316">' + compB + "</Color>";
    }
    selectionXml += "</Selection>";
    colorXml += "</Coloring>";
    zip.file(tid + "/markup.bcf", '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<Header>' + (files[0] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(files[0].name) + "</Filename><Date>" + now + "</Date></File>" : "") + (files[1] ? '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(files[1].name) + "</Filename><Date>" + now + "</Date></File>" : "") + '</Header>\n<Topic Guid="' + tid + '" TopicType="Clash" TopicStatus="Active"><Title>' + escXml(title) + "</Title><Description>" + escXml(desc) + "</Description><CreationDate>" + now + "</CreationDate><CreationAuthor>IFC Delta</CreationAuthor><ModifiedDate>" + now + "</ModifiedDate><Priority>" + (cl.isHard ? "Critical" : "Normal") + "</Priority><Labels><Label>Clash Detection</Label><Label>" + (cl.isHard ? "Hard Clash" : "Clearance") + '</Label></Labels></Topic>\n<Comment Guid="' + crypto.randomUUID() + '"><Date>' + now + "</Date><Author>IFC Delta</Author><Comment>" + escXml(desc) + '</Comment><Viewpoint Guid="' + vid + '"/></Comment>\n<Viewpoints Guid="' + vid + '"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n</Markup>');
    zip.file(tid + "/viewpoint.bcfv", '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="' + vid + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<Components>' + selectionXml + '<Visibility DefaultVisibility="true"><Exceptions/></Visibility>' + colorXml + "</Components>\n<PerspectiveCamera><CameraViewPoint><X>" + camX.toFixed(6) + "</X><Y>" + camY.toFixed(6) + "</Y><Z>" + camZ.toFixed(6) + "</Z></CameraViewPoint><CameraDirection><X>" + (ddx / ln).toFixed(6) + "</X><Y>" + (ddy / ln).toFixed(6) + "</Y><Z>" + (ddz / ln).toFixed(6) + "</Z></CameraDirection><CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector><FieldOfView>60</FieldOfView></PerspectiveCamera>\n" + clips + "\n</VisualizationInfo>");
    zip.file(tid + "/snapshot.png", snap64, { base64: true });
    if (i % 10 === 0) setStatus("loading", "BCF: " + (i + 1) + "/" + clashResults.length + "...");
  }
  const focusHL = [];
  scene.traverse((c) => {
    if (c.userData?.clashFocus) focusHL.push(c);
  });
  focusHL.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });
  if (!saveSectionActive && sectionActive) {
    sectionActive = false;
    document.getElementById("sectionPanel").classList.remove("show");
    document.getElementById("btnSection").classList.remove("active");
    const sb = scene.getObjectByName("sectionBox");
    if (sb) {
      scene.remove(sb);
    }
    if (clipPlanes && clipPlanes.length === 6) {
      clipPlanes[0].constant = 99999;
      clipPlanes[1].constant = 99999;
      clipPlanes[2].constant = 99999;
      clipPlanes[3].constant = 99999;
      clipPlanes[4].constant = 99999;
      clipPlanes[5].constant = 99999;
    }
  } else if (saveSectionActive) {
    const setSl = (id, v) => {
      const el = document.getElementById(id);
      if (el && v !== void 0) el.value = v;
    };
    setSl("slXp", saveSlider.Xp);
    setSl("slXn", saveSlider.Xn);
    setSl("slYp", saveSlider.Yp);
    setSl("slYn", saveSlider.Yn);
    setSl("slZp", saveSlider.Zp);
    setSl("slZn", saveSlider.Zn);
    if (typeof updateSectionFromSliders === "function") updateSectionFromSliders();
  }
  if (savePrevClashIdx >= 0 && savePrevClashIdx < clashResults.length) {
    try {
      window.focusClash(savePrevClashIdx);
    } catch (e) {
    }
  } else {
    camera.position.copy(saveCam);
    controls.target.copy(saveTgt);
    controls.update();
  }
  renderer.render(scene, camera);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ifc-delta-clashes.bcf";
  a.click();
  setStatus("done", "BCF exported");
  setTimeout(() => setStatus("", ""), 3e3);
  log("Clash BCF exported: " + clashResults.length + " issues");
};
let walkActive = false;
let walkSpeed = 0.15;
const walkKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
let walkYaw = 0, walkPitch = 0;
let walkAnimId = null;
window.toggleWalkMode = function() {
  walkActive = !walkActive;
  document.getElementById("btnWalk").classList.toggle("active", walkActive);
  document.getElementById("walkHUD").style.display = walkActive ? "block" : "none";
  document.getElementById("walkCross").style.display = walkActive ? "block" : "none";
  if (walkActive) {
    controls.enabled = false;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    walkYaw = Math.atan2(dir.x, dir.z);
    walkPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    walkLoop();
    log("Walk mode ON \u2014 WASD to move, mouse to look");
  } else {
    controls.enabled = true;
    controls.target.copy(camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(camera.quaternion));
    controls.update();
    document.exitPointerLock && document.exitPointerLock();
    if (walkAnimId) {
      cancelAnimationFrame(walkAnimId);
      walkAnimId = null;
    }
    log("Walk mode OFF");
  }
};
document.addEventListener("keydown", (e) => {
  if (!walkActive) return;
  const k = (e.key || "").toLowerCase();
  if (k === "w") walkKeys.w = true;
  if (k === "a") walkKeys.a = true;
  if (k === "s") walkKeys.s = true;
  if (k === "d") walkKeys.d = true;
  if (k === "q") walkKeys.q = true;
  if (k === "e") walkKeys.e = true;
  if (k === "shift" || e.shiftKey) walkKeys.shift = true;
  if (k === "escape") {
    toggleWalkMode();
    e.preventDefault();
  }
});
document.addEventListener("keyup", (e) => {
  const k = (e.key || "").toLowerCase();
  if (k === "w") walkKeys.w = false;
  if (k === "a") walkKeys.a = false;
  if (k === "s") walkKeys.s = false;
  if (k === "d") walkKeys.d = false;
  if (k === "q") walkKeys.q = false;
  if (k === "e") walkKeys.e = false;
  if (k === "shift" || !e.shiftKey) walkKeys.shift = false;
});
document.addEventListener("mousemove", (e) => {
  if (!walkActive) return;
  if (document.pointerLockElement === renderer.domElement) {
    walkYaw -= e.movementX * 2e-3;
    walkPitch -= e.movementY * 2e-3;
    walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, walkPitch));
  }
});
document.addEventListener("wheel", (e) => {
  if (!walkActive) return;
  walkSpeed *= e.deltaY > 0 ? 0.85 : 1.18;
  walkSpeed = Math.max(0.01, Math.min(5, walkSpeed));
  e.preventDefault();
}, { passive: false });
document.addEventListener("pointerlockchange", () => {
  if (walkActive && document.pointerLockElement !== renderer.domElement) {
    walkActive = false;
    document.getElementById("btnWalk").classList.remove("active");
    document.getElementById("walkHUD").style.display = "none";
    document.getElementById("walkCross").style.display = "none";
    controls.enabled = true;
    controls.target.copy(camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(camera.quaternion));
    controls.update();
    if (walkAnimId) {
      cancelAnimationFrame(walkAnimId);
      walkAnimId = null;
    }
  }
});
function walkLoop() {
  if (!walkActive) return;
  const spd = walkKeys.shift ? walkSpeed * 3 : walkSpeed;
  const forward = new THREE.Vector3(-Math.sin(walkYaw), 0, -Math.cos(walkYaw));
  const right = new THREE.Vector3(Math.cos(walkYaw), 0, -Math.sin(walkYaw));
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3(0, 0, 0);
  if (walkKeys.w) move.add(forward.clone().multiplyScalar(spd));
  if (walkKeys.s) move.add(forward.clone().multiplyScalar(-spd));
  if (walkKeys.a) move.add(right.clone().multiplyScalar(-spd));
  if (walkKeys.d) move.add(right.clone().multiplyScalar(spd));
  if (walkKeys.e) move.add(up.clone().multiplyScalar(spd));
  if (walkKeys.q) move.add(up.clone().multiplyScalar(-spd));
  if (_walkJoyVec && (Math.abs(_walkJoyVec.x) > 0.05 || Math.abs(_walkJoyVec.y) > 0.05)) {
    move.add(forward.clone().multiplyScalar(-_walkJoyVec.y * spd));
    move.add(right.clone().multiplyScalar(_walkJoyVec.x * spd));
  }
  if (_walkLookVec && (Math.abs(_walkLookVec.x) > 0.08 || Math.abs(_walkLookVec.y) > 0.08)) {
    walkYaw -= _walkLookVec.x * 0.03;
    walkPitch -= _walkLookVec.y * 0.02;
    walkPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, walkPitch));
  }
  camera.position.add(move);
  const lookDir = new THREE.Vector3(
    -Math.sin(walkYaw) * Math.cos(walkPitch),
    Math.sin(walkPitch),
    -Math.cos(walkYaw) * Math.cos(walkPitch)
  );
  camera.lookAt(camera.position.clone().add(lookDir));
  renderer.render(scene, camera);
  walkAnimId = requestAnimationFrame(walkLoop);
}
let planView = null;
let planStoreys = [];
let planDragState = null;
window.togglePlanOverlay = function() {
  const panel = document.getElementById("planOverlay");
  const btn = document.getElementById("btnPlan");
  const showing = panel.classList.contains("show");
  if (showing) {
    panel.classList.remove("show");
    btn.classList.remove("active");
    if (planView) planView.dirty = false;
  } else {
    panel.classList.add("show");
    btn.classList.add("active");
    if (!planView) initPlanView();
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};
function rebuildPlanStoreyList() {
  planStoreys = [];
  const multiModel = loadedModels.filter((m) => m?.spatial?.storeys?.length).length > 1;
  for (let mi = 0; mi < loadedModels.length; mi++) {
    const m = loadedModels[mi];
    if (!m || !m.spatial || !m.spatial.storeys) continue;
    const arr = m.spatial.storeys;
    const slotLabel = mi === 0 ? "A" : mi === 1 ? "B" : FED_LABELS[(mi - 2) % FED_LABELS.length];
    for (let i = 0; i < arr.length; i++) {
      const next = arr[i + 1];
      const top = next ? next.elevation : arr[i].elevation + 3.5;
      planStoreys.push({
        name: arr[i].name + (multiModel ? " (" + slotLabel + ")" : ""),
        elevation: arr[i].elevation,
        topElev: top,
        modelIdx: mi
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  planStoreys = planStoreys.filter((s) => {
    const k = s.name.replace(/ \([AB]\)$/, "") + "@" + s.elevation.toFixed(2);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  planStoreys.sort((a, b) => a.elevation - b.elevation);
  const sel = document.getElementById("planStoreySelect");
  if (planStoreys.length === 0) {
    sel.innerHTML = '<option value="">\u2014 No storeys found \u2014</option>';
    document.getElementById("planEmpty").style.display = "flex";
    return;
  }
  document.getElementById("planEmpty").style.display = "none";
  sel.innerHTML = planStoreys.map((s, i) => {
    const elevStr = s.elevation >= 0 ? "+" + s.elevation.toFixed(2) + "m" : s.elevation.toFixed(2) + "m";
    return `<option value="${i}">${s.name} (${elevStr})</option>`;
  }).join("");
  if (planView && planView.storey === null) {
    const camY = camera.position.y;
    let bestI = 0, bestD = Infinity;
    planStoreys.forEach((s, i) => {
      const d = Math.abs((s.elevation + s.topElev) / 2 - camY);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    sel.value = bestI;
    planSelectStorey(bestI);
  }
}
function initPlanView() {
  if (planView) return;
  const canvas = document.getElementById("planCanvas");
  const planRenderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true
  });
  planRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  planRenderer.localClippingEnabled = true;
  const planCam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 5e3);
  planCam.position.set(0, 1e3, 0);
  planCam.up.set(0, 0, -1);
  planCam.lookAt(0, 0, 0);
  const storeyClip = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    // y >= bottom
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
    // y <= top
  ];
  planView = {
    renderer: planRenderer,
    camera: planCam,
    canvas,
    storey: null,
    follow: false,
    storeyClip,
    dirty: true
  };
  setupPlanInteraction();
  setupPlanRenderHook();
}
window.planSelectStorey = function(idxStr) {
  if (!planView || planStoreys.length === 0) return;
  const idx = +idxStr;
  if (idx < 0 || idx >= planStoreys.length) return;
  planView.storey = idx;
  const s = planStoreys[idx];
  planView.storeyClip[0].constant = -(s.elevation - 0.1);
  planView.storeyClip[1].constant = s.topElev + 0.1;
  document.getElementById("planInfoStorey").textContent = s.name + " [" + s.elevation.toFixed(2) + " \u2192 " + s.topElev.toFixed(2) + "m]";
  planFit();
  requestPlanRender();
};
window.planFit = function() {
  if (!planView) return;
  const b = modelBounds;
  if (!b || !b.min || !b.max) return;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const sx = b.max.x - b.min.x;
  const sz = b.max.z - b.min.z;
  const w = planView.canvas.clientWidth || 320;
  const h = planView.canvas.clientHeight || 240;
  const canvasAspect = w / h;
  const modelAspect = sx / sz;
  let halfW, halfH;
  if (modelAspect > canvasAspect) {
    halfW = sx * 0.55;
    halfH = halfW / canvasAspect;
  } else {
    halfH = sz * 0.55;
    halfW = halfH * canvasAspect;
  }
  const cam = planView.camera;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.position.set(cx, b.max.y + 100, cz);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();
  planView.renderer.setSize(w, h, false);
  requestPlanRender();
};
window.planToggleFollow = function() {
  if (!planView) return;
  planView.follow = !planView.follow;
  document.getElementById("planFollowBtn").classList.toggle("active", planView.follow);
};
function setupPlanRenderHook() {
  const fn = window._renderPlan = function() {
    if (!planView) return;
    const panel = document.getElementById("planOverlay");
    if (!panel.classList.contains("show")) return;
    if (planView.storey === null) return;
    const w = planView.canvas.clientWidth, h = planView.canvas.clientHeight;
    if (w > 0 && h > 0) {
      const drawSize = planView.renderer.getSize(new THREE.Vector2());
      if (Math.abs(drawSize.x - w) > 1 || Math.abs(drawSize.y - h) > 1) {
        planFit();
        planView.dirty = true;
      }
    }
    if (planView.dirty) {
      const combined = clipPlanes.concat(planView.storeyClip);
      planView.renderer.clippingPlanes = combined;
      planView.renderer.render(scene, planView.camera);
      planView.dirty = false;
    }
    drawPlanCameraMarker();
  };
  if (controls && controls.addEventListener) {
    controls.addEventListener("change", () => {
      if (planView) planView.dirty = true;
      if (planView && planView.follow) drawPlanCameraMarker();
    });
  }
  function planLoop() {
    requestAnimationFrame(planLoop);
    fn();
  }
  planLoop();
}
window.requestPlanRender = function() {
  if (planView) planView.dirty = true;
};
function drawPlanCameraMarker() {
  if (!planView) return;
  const svg = document.getElementById("planMarkerSvg");
  if (!svg) return;
  const pcam = planView.camera;
  const fw = pcam.right - pcam.left;
  const fh = pcam.top - pcam.bottom;
  if (fw <= 0 || fh <= 0) return;
  const cw = planView.canvas.clientWidth || 1;
  const ch = planView.canvas.clientHeight || 1;
  if (svg.getAttribute("viewBox") !== `0 0 ${cw} ${ch}`) {
    svg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
  }
  const worldToPx = (wx2, wz2) => {
    const relX = wx2 - pcam.position.x;
    const relZup = pcam.position.z - wz2;
    const u = (relX - pcam.left) / fw;
    const v = 1 - (relZup - pcam.bottom) / fh;
    return [u * cw, v * ch];
  };
  const wx = camera.position.x, wz = camera.position.z;
  const [px, py] = worldToPx(wx, wz);
  const vFovRad = (camera.fov || 50) * Math.PI / 180;
  const renderEl = renderer.domElement;
  const aspect = renderEl ? renderEl.clientWidth / Math.max(1, renderEl.clientHeight) : 1.6;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
  const halfH = hFovRad / 2;
  const dx = controls.target.x - camera.position.x;
  const dz = controls.target.z - camera.position.z;
  const dirLen = Math.hypot(dx, dz) || 1;
  const dxn = dx / dirLen, dzn = dz / dirLen;
  const headingWorld = Math.atan2(dzn, dxn);
  const planReachMax = Math.min(fw, fh) * 0.45;
  const planReachMin = Math.min(fw, fh) * 0.12;
  const camToTargetDist = Math.hypot(dx, dz);
  const reachWorld = Math.max(planReachMin, Math.min(planReachMax, camToTargetDist));
  const edge1Ang = headingWorld - halfH;
  const edge2Ang = headingWorld + halfH;
  const fanPts = [`${px.toFixed(1)},${py.toFixed(1)}`];
  const STEPS = 12;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const ang = edge1Ang + (edge2Ang - edge1Ang) * t;
    const fwx = wx + Math.cos(ang) * reachWorld;
    const fwz = wz + Math.sin(ang) * reachWorld;
    const [fx, fy] = worldToPx(fwx, fwz);
    fanPts.push(`${fx.toFixed(1)},${fy.toFixed(1)}`);
  }
  const ctrWx = wx + dxn * reachWorld;
  const ctrWz = wz + dzn * reachWorld;
  const [ctrX, ctrY] = worldToPx(ctrWx, ctrWz);
  const svgAngle = Math.atan2(ctrY - py, ctrX - px);
  const storey = planStoreys[planView.storey];
  let onStorey = true;
  if (storey) {
    const camY = camera.position.y;
    onStorey = camY >= storey.elevation - 0.5 && camY <= storey.topElev + 0.5;
  }
  const fanFill = onStorey ? "rgba(37,99,235,0.18)" : "rgba(120,120,120,0.10)";
  const fanStroke = onStorey ? "#2563eb" : "#8B8680";
  const eyeFill = onStorey ? "#2563eb" : "#8B8680";
  const ARROW_LEN = 5;
  const ax = px + Math.cos(svgAngle) * ARROW_LEN;
  const ay = py + Math.sin(svgAngle) * ARROW_LEN;
  const elevTxt = camera.position.y.toFixed(1) + "m";
  let sectionRect = "";
  if (sectionActive && document.getElementById("slXp")) {
    const b = modelBounds;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const xp = +document.getElementById("slXp").value / 100;
    const xn = +document.getElementById("slXn").value / 100;
    const zp = +document.getElementById("slZp").value / 100;
    const zn = +document.getElementById("slZn").value / 100;
    const sxn = b.min.x + sx * xn, sxp = b.min.x + sx * xp;
    const szn = b.min.z + sz * zn, szp = b.min.z + sz * zp;
    const [r1x, r1y] = worldToPx(sxn, szn);
    const [r2x, r2y] = worldToPx(sxp, szn);
    const [r3x, r3y] = worldToPx(sxp, szp);
    const [r4x, r4y] = worldToPx(sxn, szp);
    sectionRect = `<polygon points="${r1x.toFixed(1)},${r1y.toFixed(1)} ${r2x.toFixed(1)},${r2y.toFixed(1)} ${r3x.toFixed(1)},${r3y.toFixed(1)} ${r4x.toFixed(1)},${r4y.toFixed(1)}"
      fill="rgba(245,158,11,0.07)" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="6 3"/>`;
  }
  let tnAngle = 0;
  for (let i = 0; i < loadedModels.length; i++) {
    if (loadedModels[i]?.spatial?.trueNorthAngle) {
      tnAngle = loadedModels[i].spatial.trueNorthAngle;
      break;
    }
  }
  if (planView && planView.camera) {
    planView.camera.up.set(-Math.sin(tnAngle), 0, -Math.cos(tnAngle));
    planView.camera.updateProjectionMatrix();
  }
  const tnDeg = tnAngle * 180 / Math.PI;
  const NORTH_X = cw - 22, NORTH_Y = 22;
  const northArrow = `
    <g transform="translate(${NORTH_X},${NORTH_Y}) rotate(${(-tnDeg).toFixed(1)})">
      <circle cx="0" cy="0" r="14" fill="white" opacity="0.9" stroke="#4A4541" stroke-width="0.8"/>
      <polygon points="0,-9 -4,7 0,4 4,7" fill="#D05050" stroke="white" stroke-width="0.5"/>
      <text x="0" y="-2" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#D05050" stroke="white" stroke-width="2.5" paint-order="stroke">N</text>
    </g>`;
  const targetPx = 80;
  const worldPerPx = fw / cw;
  const targetWorld = targetPx * worldPerPx;
  const niceLengths = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let nice = niceLengths[0];
  for (const n of niceLengths) {
    if (n <= targetWorld) nice = n;
  }
  const scalePx = nice / worldPerPx;
  const scaleX = 12, scaleY = ch - 16;
  const scaleBar = `
    <g transform="translate(${scaleX},${scaleY})">
      <rect x="0" y="-2" width="${scalePx.toFixed(1)}" height="4" fill="white" opacity="0.85"/>
      <line x1="0" y1="0" x2="${scalePx.toFixed(1)}" y2="0" stroke="#4A4541" stroke-width="1.5"/>
      <line x1="0" y1="-3" x2="0" y2="3" stroke="#4A4541" stroke-width="1.2"/>
      <line x1="${scalePx.toFixed(1)}" y1="-3" x2="${scalePx.toFixed(1)}" y2="3" stroke="#4A4541" stroke-width="1.2"/>
      <text x="${(scalePx / 2).toFixed(1)}" y="-6" text-anchor="middle" font-family="Inter" font-size="10" font-weight="600" fill="#4A4541" stroke="white" stroke-width="2.5" paint-order="stroke">${nice >= 1 ? nice + " m" : (nice * 1e3).toFixed(0) + " mm"}</text>
    </g>`;
  svg.innerHTML = `
    ${sectionRect}
    <polygon points="${fanPts.join(" ")}"
             fill="${fanFill}" stroke="${fanStroke}" stroke-width="1.2"
             stroke-linejoin="round" stroke-dasharray="${onStorey ? "" : "4 3"}"/>
    <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}"
          x2="${ctrX.toFixed(1)}" y2="${ctrY.toFixed(1)}"
          stroke="${fanStroke}" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.6"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9"
            fill="white" opacity="0.85"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"
            fill="${eyeFill}" stroke="white" stroke-width="2"/>
    <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}"
          x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}"
          stroke="white" stroke-width="2" stroke-linecap="round"/>
    ${onStorey ? "" : `<text x="${(px + 11).toFixed(1)}" y="${(py - 7).toFixed(1)}"
             fill="${eyeFill}" font-size="10" font-family="Inter"
             font-weight="600" stroke="white" stroke-width="3"
             paint-order="stroke">${elevTxt}</text>`}
    ${northArrow}
    ${scaleBar}
  `;
  document.getElementById("planInfoCam").textContent = "cam: " + camera.position.x.toFixed(1) + ", " + camera.position.y.toFixed(1) + ", " + camera.position.z.toFixed(1) + (onStorey ? "" : " \u2022 off storey");
}
function setupPlanInteraction() {
  const panel = document.getElementById("planOverlay");
  const hdr = document.getElementById("planHdr");
  const resize = document.getElementById("planResize");
  const wrap = document.getElementById("planCanvasWrap");
  hdr.addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.target.closest(".plan-hdr-btn")) return;
    planDragState = {
      mode: "move",
      sx: e.clientX,
      sy: e.clientY,
      l: panel.offsetLeft,
      t: panel.offsetTop,
      pid: e.pointerId
    };
    hdr.setPointerCapture(e.pointerId);
  });
  hdr.addEventListener("pointermove", (e) => {
    if (!planDragState || planDragState.mode !== "move") return;
    const vp = document.getElementById("vpCanvas").getBoundingClientRect();
    const newL = planDragState.l + (e.clientX - planDragState.sx);
    const newT = planDragState.t + (e.clientY - planDragState.sy);
    panel.style.left = Math.max(0, Math.min(vp.width - panel.offsetWidth, newL)) + "px";
    panel.style.top = Math.max(0, Math.min(vp.height - panel.offsetHeight, newT)) + "px";
    panel.style.right = "auto";
  });
  hdr.addEventListener("pointerup", () => {
    planDragState = null;
  });
  resize.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    planDragState = {
      mode: "resize",
      sx: e.clientX,
      sy: e.clientY,
      w: panel.offsetWidth,
      h: panel.offsetHeight,
      pid: e.pointerId
    };
    resize.setPointerCapture(e.pointerId);
  });
  resize.addEventListener("pointermove", (e) => {
    if (!planDragState || planDragState.mode !== "resize") return;
    const w = Math.max(220, Math.min(800, planDragState.w + (e.clientX - planDragState.sx)));
    const h = Math.max(180, Math.min(700, planDragState.h + (e.clientY - planDragState.sy)));
    panel.style.width = w + "px";
    panel.style.height = h + "px";
    if (planView) planFit();
  });
  resize.addEventListener("pointerup", () => {
    planDragState = null;
  });
  wrap.addEventListener("click", (e) => {
    if (!planView || planDragState) return;
    if (planView.storey === null) return;
    const rect = planView.canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const pcam = planView.camera;
    const fw = pcam.right - pcam.left;
    const fh = pcam.top - pcam.bottom;
    const relX = u * fw + pcam.left;
    const relZup = (1 - v) * fh + pcam.bottom;
    const wx = pcam.position.x + relX;
    const wz = pcam.position.z - relZup;
    if (e.shiftKey) {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2(u * 2 - 1, -(v * 2 - 1));
      ray.setFromCamera(ndc, pcam);
      const ms = [];
      scene.traverse((ch) => {
        if (ch.isMesh && ch.visible && ch.geometry?.attributes?.position && ch.parent?.name !== "sectionBox" && !ch.userData?.isHandle) {
          ms.push(ch);
        }
      });
      const hits = ray.intersectObjects(ms, false);
      const s = planStoreys[planView.storey];
      const yLo = s.elevation - 0.5, yHi = s.topElev + 0.5;
      const validHit = hits.find((h) => {
        if (h.point.y < yLo || h.point.y > yHi) return false;
        if (sectionActive && clipPlanes.length === 6) {
          for (const cp of clipPlanes) {
            if (cp.distanceToPoint(h.point) < -0.01) return false;
          }
        }
        return true;
      });
      if (!validHit) {
        log("Plan shift-click: no element on this storey at that point");
        return;
      }
      const hit = validHit;
      const eid = hit.object?.geometry?.attributes?.expressID?.array?.[hit.faceIndex * 3];
      if (eid == null) {
        log("Plan shift-click: hit has no expressID");
        return;
      }
      let modelIdx = hit.object?.userData?.srcModelIdx ?? -1;
      if (modelIdx < 0) {
        let p = hit.object;
        while (p && modelIdx < 0) {
          for (let mi = 0; mi < loadedModels.length; mi++) {
            if (loadedModels[mi] && p === loadedModels[mi]) {
              modelIdx = mi;
              break;
            }
          }
          p = p.parent;
        }
      }
      if (modelIdx < 0) {
        log("Plan shift-click: could not determine model index");
        return;
      }
      try {
        clearHighlight();
        if (!window._hlMat) {
          window._hlMat = new THREE.MeshPhongMaterial({
            color: 2450411,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthTest: true,
            clippingPlanes: clipPlanes
          });
        }
        const mid = loadedModels[modelIdx]?.modelID;
        if (mid !== void 0) {
          const sub = ifcLoader.ifcManager.createSubset({
            modelID: mid,
            ids: [eid],
            material: window._hlMat,
            scene,
            removePrevious: true
          });
          if (sub) {
            sub.position.copy(loadedModels[modelIdx].position);
            sub.updateMatrixWorld(true);
            window._lastHL = { subset: sub, mid };
          }
        }
        ifcLoader.ifcManager.getItemProperties(mid, eid, true).then((props) => {
          if (window.showProps) window.showProps(props, modelIdx);
        }).catch((err) => log("Plan props error:", err?.message));
      } catch (err) {
        log("Plan select err:", err?.message);
      }
      log("Plan: selected element eid=" + eid + " from model " + modelIdx);
      planView.dirty = true;
      return;
    }
    const eyeY = camera.position.y;
    const targetY = controls.target.y;
    const offX = camera.position.x - controls.target.x;
    const offZ = camera.position.z - controls.target.z;
    controls.target.set(wx, targetY, wz);
    camera.position.set(wx + offX, eyeY, wz + offZ);
    controls.update();
    if (planView) planView.dirty = true;
    log("Plan: jumped 3D camera to " + wx.toFixed(1) + ", " + wz.toFixed(1));
  });
}
const _origReadSpatialThen = null;
window.requestPlanRebuild = function() {
  if (document.getElementById("planOverlay")?.classList.contains("show")) {
    rebuildPlanStoreyList();
    requestPlanRender();
  }
};
let sgState = {
  open: false,
  gateway: "design",
  results: null,
  // {rules:[{rule, passed, failed, skipped}], stats:{...}}
  selectedRuleIdx: null,
  // Cached scan of all entities in loaded models — built lazily on first run
  cachedCtx: null,
  cachedCtxKey: null
  // 'modelHash' of loadedModels — invalidated on reload
};
function compoundToDeg(v) {
  if (!Array.isArray(v)) return Number(v);
  const sign = v[0] < 0 ? -1 : 1;
  return sign * (Math.abs(v[0]) + (v[1] || 0) / 60 + (v[2] || 0) / 3600 + (v[3] || 0) / 36e8);
}
function sgReadParam(entity, paramName, psetNameHint) {
  if (!entity || !entity.psets) return null;
  for (const ps of entity.psets) {
    if (psetNameHint && ps.Name?.value !== psetNameHint) continue;
    if (ps.HasProperties) {
      const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : [ps.HasProperties];
      for (const p of hps) {
        if (!p || typeof p === "number") continue;
        if (typeof p.value === "number" && !p.Name) continue;
        if (p.Name?.value === paramName) {
          const nv = p.NominalValue;
          if (nv == null) return { value: null, type: null, psetName: ps.Name?.value };
          return {
            value: nv.value,
            type: nv.type || nv.label || typeof nv.value,
            psetName: ps.Name?.value
          };
        }
      }
    }
    if (ps.Quantities) {
      const qs = Array.isArray(ps.Quantities) ? ps.Quantities : [ps.Quantities];
      for (const q of qs) {
        if (!q || typeof q === "number") continue;
        if (typeof q.value === "number" && !q.Name) continue;
        if (q.Name?.value === paramName) {
          const val = q.LengthValue?.value ?? q.AreaValue?.value ?? q.VolumeValue?.value ?? q.WeightValue?.value ?? q.CountValue?.value ?? q.NominalValue?.value ?? null;
          return { value: val, type: "quantity", psetName: ps.Name?.value };
        }
      }
    }
  }
  return null;
}
function sgHasParam(entity, paramName) {
  const r = sgReadParam(entity, paramName);
  if (!r) return false;
  return r.value !== null && r.value !== void 0 && r.value !== "";
}
function sgReadNumeric(entity, paramName, psetNameHint) {
  const r = sgReadParam(entity, paramName, psetNameHint);
  if (!r || r.value === null || r.value === void 0) return null;
  const n = Number(r.value);
  return isNaN(n) ? null : n;
}
const SG_RULES = [
  // ── GENERAL: project & spatial structure ──────────────────────────
  {
    id: "GEN-001",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Project",
    title: "IfcProject exists",
    desc: "Every IFC file must have exactly one IfcProject as the root spatial container.",
    severity: "error",
    check: (ctx) => {
      const projects = ctx.modelIDs.flatMap((m) => m.spatial?.projects || []);
      if (projects.length === 0)
        return { passed: [], failed: [{ eid: 0, name: "(root)", reason: "No IfcProject found in any loaded file" }], skipped: 0 };
      if (projects.length > 1)
        return { passed: [], failed: projects.map((p) => ({ eid: p.expressID, name: p.name, reason: "Multiple IfcProjects \u2014 federation expects one project per file" })), skipped: 0 };
      return { passed: [{ eid: projects[0].expressID, name: projects[0].name }], failed: [], skipped: 0 };
    }
  },
  {
    id: "GEN-002",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Project",
    title: "IfcProject has a name",
    desc: 'The project name should be set (not blank, not "Project Number"). CORENET X uses this for submission identification.',
    severity: "warn",
    check: (ctx) => {
      const projects = ctx.modelIDs.flatMap((m) => m.spatial?.projects || []);
      const passed = [], failed = [];
      for (const p of projects) {
        const nm = (p.name || "").trim();
        if (!nm || /^(project\s*number|untitled|default|0001)$/i.test(nm))
          failed.push({ eid: p.expressID, name: p.name || "(blank)", reason: "Project name is blank or default placeholder" });
        else passed.push({ eid: p.expressID, name: nm });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "GEN-003",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Spatial",
    title: "IfcSite has geo-referencing",
    desc: "IfcSite must have RefLatitude, RefLongitude, and RefElevation. CORENET X uses these for SVY21 alignment.",
    severity: "error",
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap((m) => m.spatial?.sites || []);
      const passed = [], failed = [];
      for (const s of sites) {
        const missing = [];
        if (s.refLat == null || Array.isArray(s.refLat) && s.refLat.every((v) => v === 0)) missing.push("RefLatitude");
        if (s.refLon == null || Array.isArray(s.refLon) && s.refLon.every((v) => v === 0)) missing.push("RefLongitude");
        if (s.refElev == null) missing.push("RefElevation");
        if (missing.length > 0) failed.push({ eid: s.expressID, name: s.name || "(IfcSite)", reason: "Missing: " + missing.join(", ") });
        else passed.push({ eid: s.expressID, name: s.name || "(IfcSite)" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "GEN-004",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Spatial",
    title: "IfcSite coordinates within Singapore bounds",
    desc: "RefLatitude must be 1.15\xB0 \u2013 1.50\xB0 N, RefLongitude 103.60\xB0 \u2013 104.10\xB0 E. Outside this range suggests wrong coordinate system or wrong file.",
    severity: "warn",
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap((m) => m.spatial?.sites || []);
      const passed = [], failed = [];
      for (const s of sites) {
        if (s.refLat == null || s.refLon == null) {
          continue;
        }
        const lat = compoundToDeg(s.refLat);
        const lon = compoundToDeg(s.refLon);
        if (lat < 1.15 || lat > 1.5 || lon < 103.6 || lon > 104.1) {
          failed.push({
            eid: s.expressID,
            name: s.name || "(IfcSite)",
            reason: `Lat ${lat.toFixed(4)}\xB0, Lon ${lon.toFixed(4)}\xB0 \u2014 outside Singapore range`
          });
        } else {
          passed.push({ eid: s.expressID, name: s.name || "(IfcSite)" });
        }
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "GEN-005",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Spatial",
    title: "IfcBuilding present",
    desc: "Every project must have at least one IfcBuilding inside IfcSite.",
    severity: "error",
    check: (ctx) => {
      const blds = ctx.modelIDs.flatMap((m) => m.spatial?.buildings || []);
      if (blds.length === 0) return { passed: [], failed: [{ eid: 0, name: "(root)", reason: "No IfcBuilding found" }], skipped: 0 };
      return { passed: blds.map((b) => ({ eid: b.expressID, name: b.name || "(IfcBuilding)" })), failed: [], skipped: 0 };
    }
  },
  {
    id: "GEN-006",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Spatial",
    title: "IfcBuildingStorey with valid elevation",
    desc: "Every storey must have a numeric Elevation. Missing or NaN elevations break level-based regulatory checks.",
    severity: "error",
    check: (ctx) => {
      const storeys = ctx.modelIDs.flatMap((m) => m.spatial?.storeys || []);
      const passed = [], failed = [];
      for (const s of storeys) {
        if (s.elevation == null || isNaN(Number(s.elevation)))
          failed.push({ eid: s.expressID, name: s.name || "(Storey)", reason: "Elevation is missing or not numeric" });
        else passed.push({ eid: s.expressID, name: `${s.name || "(Storey)"} @ ${(+s.elevation).toFixed(2)}m` });
      }
      if (passed.length + failed.length === 0) return { passed: [], failed: [{ eid: 0, name: "(root)", reason: "No IfcBuildingStorey found" }], skipped: 0 };
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "GEN-007",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Spatial",
    title: "Storey names follow naming convention",
    desc: 'CORENET X recommends storey names like "L1", "L2", "B1", "RF" \u2014 not "Floor 1" or "Storey 1". This is a soft warning.',
    severity: "warn",
    check: (ctx) => {
      const storeys = ctx.modelIDs.flatMap((m) => m.spatial?.storeys || []);
      const passed = [], failed = [];
      const validPattern = /^(L\d{1,3}|B\d{1,2}|RF|MEZZ|GF|G|UR\d?)$/i;
      for (const s of storeys) {
        const nm = (s.name || "").trim();
        if (validPattern.test(nm)) passed.push({ eid: s.expressID, name: nm });
        else failed.push({ eid: s.expressID, name: nm || "(blank)", reason: "Recommend pattern: L1, L2, B1, RF, MEZZ, GF" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA ARCHITECTURAL: Walls ──────────────────────────────────────
  {
    id: "BCA-ARCH-W01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Wall",
    title: "Walls have FireRating in Pset_WallCommon",
    desc: 'BCA Fire Code requires fire-rating values on walls (e.g. "1HR", "2HR", "-/-/-").',
    severity: "error",
    check: (ctx) => {
      const walls = (ctx.byClass.get("IfcWall") || []).concat(ctx.byClass.get("IfcWallStandardCase") || []);
      const passed = [], failed = [];
      for (const w of walls) {
        if (sgHasParam(w, "FireRating")) passed.push({ eid: w.eid, name: w.name });
        else failed.push({ eid: w.eid, name: w.name, reason: "Missing FireRating" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-W02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Wall",
    title: "Walls have LoadBearing flag",
    desc: "Pset_WallCommon.LoadBearing must be set to TRUE/FALSE so structural responsibility is clear.",
    severity: "warn",
    check: (ctx) => {
      const walls = (ctx.byClass.get("IfcWall") || []).concat(ctx.byClass.get("IfcWallStandardCase") || []);
      const passed = [], failed = [];
      for (const w of walls) {
        const r = sgReadParam(w, "LoadBearing");
        if (r && (r.value === true || r.value === false || r.value === "T" || r.value === "F"))
          passed.push({ eid: w.eid, name: w.name });
        else failed.push({ eid: w.eid, name: w.name, reason: "LoadBearing not set (must be TRUE or FALSE)" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-W03",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Wall",
    title: "Walls have IsExternal flag",
    desc: "External walls have different code requirements; this flag must be set.",
    severity: "error",
    check: (ctx) => {
      const walls = (ctx.byClass.get("IfcWall") || []).concat(ctx.byClass.get("IfcWallStandardCase") || []);
      const passed = [], failed = [];
      for (const w of walls) {
        const r = sgReadParam(w, "IsExternal");
        if (r && (r.value === true || r.value === false))
          passed.push({ eid: w.eid, name: w.name });
        else failed.push({ eid: w.eid, name: w.name, reason: "IsExternal not set" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA ARCHITECTURAL: Doors ──────────────────────────────────────
  {
    id: "BCA-ARCH-D01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Door",
    title: "Doors have FireRating",
    desc: 'Fire-rated doors must have a FireRating value. Non-rated doors should explicitly say "-/-/-" or "None".',
    severity: "error",
    check: (ctx) => {
      const doors = ctx.byClass.get("IfcDoor") || [];
      const passed = [], failed = [];
      for (const d of doors) {
        if (sgHasParam(d, "FireRating")) passed.push({ eid: d.eid, name: d.name });
        else failed.push({ eid: d.eid, name: d.name, reason: "Missing FireRating" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-D02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Door",
    title: "Doors have width \u2265 850mm for accessible routes",
    desc: "BCA Accessibility Code requires accessible doors to have \u2265 850mm clear width. This rule flags doors where width is below threshold OR width is missing entirely.",
    severity: "warn",
    check: (ctx) => {
      const doors = ctx.byClass.get("IfcDoor") || [];
      const passed = [], failed = [];
      for (const d of doors) {
        const ow = d.OverallWidth?.value;
        if (ow == null) {
          failed.push({ eid: d.eid, name: d.name, reason: "OverallWidth not set" });
          continue;
        }
        const widthMM = ow > 10 ? ow : ow * 1e3;
        if (widthMM < 850) failed.push({ eid: d.eid, name: d.name, reason: `Width ${widthMM.toFixed(0)}mm < 850mm threshold` });
        else passed.push({ eid: d.eid, name: `${d.name} (${widthMM.toFixed(0)}mm)` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-D03",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Door",
    title: "Doors have OverallHeight",
    desc: "OverallHeight must be present for clearance calculations.",
    severity: "warn",
    check: (ctx) => {
      const doors = ctx.byClass.get("IfcDoor") || [];
      const passed = [], failed = [];
      for (const d of doors) {
        if (d.OverallHeight?.value != null) passed.push({ eid: d.eid, name: d.name });
        else failed.push({ eid: d.eid, name: d.name, reason: "OverallHeight not set" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA ARCHITECTURAL: Windows ────────────────────────────────────
  {
    id: "BCA-ARCH-WIN01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Window",
    title: "Windows have OverallWidth and OverallHeight",
    desc: "Window dimensions needed for daylight + ventilation calculations.",
    severity: "warn",
    check: (ctx) => {
      const wins = ctx.byClass.get("IfcWindow") || [];
      const passed = [], failed = [];
      for (const w of wins) {
        const missing = [];
        if (w.OverallWidth?.value == null) missing.push("OverallWidth");
        if (w.OverallHeight?.value == null) missing.push("OverallHeight");
        if (missing.length > 0) failed.push({ eid: w.eid, name: w.name, reason: "Missing: " + missing.join(", ") });
        else passed.push({ eid: w.eid, name: w.name });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-WIN02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Window",
    title: "Windows have IsExternal flag",
    desc: "External windows count toward facade glazing area for energy-efficiency review.",
    severity: "warn",
    check: (ctx) => {
      const wins = ctx.byClass.get("IfcWindow") || [];
      const passed = [], failed = [];
      for (const w of wins) {
        const r = sgReadParam(w, "IsExternal");
        if (r && (r.value === true || r.value === false)) passed.push({ eid: w.eid, name: w.name });
        else failed.push({ eid: w.eid, name: w.name, reason: "IsExternal not set" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA ARCHITECTURAL: Slabs ──────────────────────────────────────
  {
    id: "BCA-ARCH-S01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Slab",
    title: "Slabs have FireRating",
    desc: "Floor/roof slabs are fire compartmentation boundaries; rating required.",
    severity: "error",
    check: (ctx) => {
      const slabs = ctx.byClass.get("IfcSlab") || [];
      const passed = [], failed = [];
      for (const s of slabs) {
        if (sgHasParam(s, "FireRating")) passed.push({ eid: s.eid, name: s.name });
        else failed.push({ eid: s.eid, name: s.name, reason: "Missing FireRating" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-S02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Slab",
    title: "Slabs have PredefinedType (FLOOR/ROOF/LANDING)",
    desc: "IfcSlab.PredefinedType must be one of FLOOR, ROOF, LANDING, BASESLAB so the agency knows which code applies.",
    severity: "error",
    check: (ctx) => {
      const slabs = ctx.byClass.get("IfcSlab") || [];
      const passed = [], failed = [];
      const VALID = /* @__PURE__ */ new Set(["FLOOR", "ROOF", "LANDING", "BASESLAB", "USERDEFINED"]);
      for (const s of slabs) {
        const pt = s.PredefinedType?.value || s.PredefinedType;
        if (pt && VALID.has(String(pt).toUpperCase())) passed.push({ eid: s.eid, name: `${s.name} [${pt}]` });
        else failed.push({ eid: s.eid, name: s.name, reason: `PredefinedType "${pt || "null"}" not in FLOOR/ROOF/LANDING/BASESLAB` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA STRUCTURAL: Beams, Columns ────────────────────────────────
  {
    id: "BCA-STR-B01",
    agency: "BCA",
    gateway: ["design", "piling", "construction"],
    category: "Beam",
    title: "Beams have FireRating",
    desc: "Structural beams need fire-rating for compartmentation review.",
    severity: "warn",
    check: (ctx) => {
      const beams = ctx.byClass.get("IfcBeam") || [];
      const passed = [], failed = [];
      for (const b of beams) {
        if (sgHasParam(b, "FireRating")) passed.push({ eid: b.eid, name: b.name });
        else failed.push({ eid: b.eid, name: b.name, reason: "Missing FireRating" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-STR-C01",
    agency: "BCA",
    gateway: ["design", "piling", "construction"],
    category: "Column",
    title: "Columns have FireRating",
    desc: "Structural columns need fire-rating for compartmentation review.",
    severity: "warn",
    check: (ctx) => {
      const cols = ctx.byClass.get("IfcColumn") || [];
      const passed = [], failed = [];
      for (const c of cols) {
        if (sgHasParam(c, "FireRating")) passed.push({ eid: c.eid, name: c.name });
        else failed.push({ eid: c.eid, name: c.name, reason: "Missing FireRating" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-STR-M01",
    agency: "BCA",
    gateway: ["design", "piling", "construction"],
    category: "Material",
    title: "Structural elements have a material grade",
    desc: "Beams and columns should have material info in IfcMaterial or Pset_*Common.Reference. Missing material blocks structural review.",
    severity: "warn",
    check: (ctx) => {
      const items = (ctx.byClass.get("IfcBeam") || []).concat(ctx.byClass.get("IfcColumn") || []);
      const passed = [], failed = [];
      for (const it of items) {
        const r = sgReadParam(it, "Reference") || sgReadParam(it, "Material") || sgReadParam(it, "MaterialGrade");
        if (r && r.value) passed.push({ eid: it.eid, name: `${it.name} [${r.value}]` });
        else failed.push({ eid: it.eid, name: it.name, reason: "No Reference / Material / MaterialGrade found" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA: Spaces (IfcSpace) ────────────────────────────────────────
  {
    id: "BCA-SP01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Space",
    title: "Spaces have a Name",
    desc: 'Every IfcSpace must have a name describing its function (e.g. "Bedroom", "Kitchen").',
    severity: "error",
    check: (ctx) => {
      const spaces = ctx.byClass.get("IfcSpace") || [];
      const passed = [], failed = [];
      for (const s of spaces) {
        if (s.name && s.name.trim()) passed.push({ eid: s.eid, name: s.name });
        else failed.push({ eid: s.eid, name: "(blank)", reason: "IfcSpace has no name" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-SP02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Space",
    title: "Spaces have a LongName / Function",
    desc: 'IfcSpace.LongName or Pset_SpaceCommon.Reference should describe the regulatory category (e.g. "RESIDENTIAL/Bedroom").',
    severity: "warn",
    check: (ctx) => {
      const spaces = ctx.byClass.get("IfcSpace") || [];
      const passed = [], failed = [];
      for (const s of spaces) {
        const longName = s.LongName?.value || s.LongName;
        const ref = sgReadParam(s, "Reference");
        if (longName && String(longName).trim() || ref && ref.value) passed.push({ eid: s.eid, name: s.name });
        else failed.push({ eid: s.eid, name: s.name, reason: "No LongName or Pset_SpaceCommon.Reference" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── URA: GFA / Site information ───────────────────────────────────
  {
    id: "URA-001",
    agency: "URA",
    gateway: ["design"],
    category: "Site",
    title: "Site has plot ratio / GFA parameter",
    desc: 'URA requires Gross Floor Area (GFA) values for plot ratio compliance. Look for "GFA", "PlotRatio", or SGPset_Site_GFA values.',
    severity: "warn",
    check: (ctx) => {
      const sites = ctx.modelIDs.flatMap((m) => m.spatial?.sites || []);
      const passed = [], failed = [];
      for (const s of sites) {
        failed.push({
          eid: s.expressID,
          name: s.name || "(IfcSite)",
          reason: "Manual check: GFA/PlotRatio must be in SGPset_Site or Pset_BuildingCommon"
        });
      }
      return { passed, failed, skipped: sites.length === 0 ? 1 : 0 };
    }
  },
  // ── NEA: Environmental / waste ────────────────────────────────────
  {
    id: "NEA-001",
    agency: "NEA",
    gateway: ["design"],
    category: "Environmental",
    title: "Refuse rooms / chutes marked",
    desc: 'NEA requires refuse storage areas and chutes to be identified via IfcSpace.LongName containing "REFUSE" or "BIN CENTRE".',
    severity: "info",
    check: (ctx) => {
      const spaces = ctx.byClass.get("IfcSpace") || [];
      const passed = [], failed = [];
      let foundAny = false;
      for (const s of spaces) {
        const ln = (s.LongName?.value || s.LongName || s.name || "").toUpperCase();
        if (/\b(REFUSE|BIN\s*CENTRE|BIN\s*CHUTE|WASTE)\b/.test(ln)) {
          passed.push({ eid: s.eid, name: s.name || "(Space)" });
          foundAny = true;
        }
      }
      if (!foundAny) {
        return {
          passed: [],
          failed: [],
          skipped: 1,
          info: "No spaces tagged REFUSE/BIN CENTRE found \u2014 verify this is correct for project type"
        };
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── LTA: Carpark spaces ───────────────────────────────────────────
  {
    id: "LTA-001",
    agency: "LTA",
    gateway: ["design"],
    category: "Transport",
    title: "Carpark spaces identified",
    desc: 'LTA requires carpark spaces to be IfcSpace with LongName like "CARPARK" or "PARKING".',
    severity: "info",
    check: (ctx) => {
      const spaces = ctx.byClass.get("IfcSpace") || [];
      const passed = [];
      for (const s of spaces) {
        const ln = (s.LongName?.value || s.LongName || s.name || "").toUpperCase();
        if (/\b(CARPARK|PARKING|CAR\s*PARK|MOTORCYCLE)\b/.test(ln)) {
          passed.push({ eid: s.eid, name: s.name || "(Space)" });
        }
      }
      if (passed.length === 0)
        return {
          passed: [],
          failed: [],
          skipped: 1,
          info: "No carpark spaces found \u2014 verify LTA submission requirements for project type"
        };
      return { passed, failed: [], skipped: 0 };
    }
  },
  // ── PUB: Drainage / wet areas ─────────────────────────────────────
  {
    id: "PUB-001",
    agency: "PUB",
    gateway: ["design"],
    category: "Drainage",
    title: "Wet area spaces (toilet/kitchen) identified",
    desc: "PUB drainage review needs wet areas tagged as IfcSpace with relevant function.",
    severity: "info",
    check: (ctx) => {
      const spaces = ctx.byClass.get("IfcSpace") || [];
      const passed = [];
      for (const s of spaces) {
        const ln = (s.LongName?.value || s.LongName || s.name || "").toUpperCase();
        if (/\b(TOILET|WC|BATHROOM|KITCHEN|LAUNDRY|SHOWER|WET\s*AREA)\b/.test(ln)) {
          passed.push({ eid: s.eid, name: s.name || "(Space)" });
        }
      }
      if (passed.length === 0)
        return {
          passed: [],
          failed: [],
          skipped: 1,
          info: "No wet area spaces found \u2014 verify this matches project scope"
        };
      return { passed, failed: [], skipped: 0 };
    }
  },
  // ── BCA: Stairs ───────────────────────────────────────────────────
  {
    id: "BCA-ARCH-ST01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Stair",
    title: "Stairs have NumberOfRiser",
    desc: "Pset_StairCommon.NumberOfRiser needed for capacity review.",
    severity: "warn",
    check: (ctx) => {
      const stairs = ctx.byClass.get("IfcStair") || [];
      const passed = [], failed = [];
      for (const s of stairs) {
        if (sgReadNumeric(s, "NumberOfRiser") != null) passed.push({ eid: s.eid, name: s.name });
        else failed.push({ eid: s.eid, name: s.name, reason: "Missing NumberOfRiser" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-ST02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Stair",
    title: "Stairs have RiserHeight \u2264 175mm",
    desc: "BCA accessibility requires riser height \u2264 175mm.",
    severity: "warn",
    check: (ctx) => {
      const stairs = ctx.byClass.get("IfcStair") || [];
      const passed = [], failed = [];
      for (const s of stairs) {
        const rh = sgReadNumeric(s, "RiserHeight");
        if (rh == null) {
          failed.push({ eid: s.eid, name: s.name, reason: "RiserHeight not set" });
          continue;
        }
        const rhMM = rh > 1 ? rh : rh * 1e3;
        if (rhMM > 175) failed.push({ eid: s.eid, name: s.name, reason: `RiserHeight ${rhMM.toFixed(0)}mm > 175mm` });
        else passed.push({ eid: s.eid, name: `${s.name} (${rhMM.toFixed(0)}mm)` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "BCA-ARCH-ST03",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Stair",
    title: "Stairs have TreadLength \u2265 250mm",
    desc: "BCA accessibility requires tread length \u2265 250mm.",
    severity: "warn",
    check: (ctx) => {
      const stairs = ctx.byClass.get("IfcStair") || [];
      const passed = [], failed = [];
      for (const s of stairs) {
        const tl = sgReadNumeric(s, "TreadLength");
        if (tl == null) {
          failed.push({ eid: s.eid, name: s.name, reason: "TreadLength not set" });
          continue;
        }
        const tlMM = tl > 1 ? tl : tl * 1e3;
        if (tlMM < 250) failed.push({ eid: s.eid, name: s.name, reason: `TreadLength ${tlMM.toFixed(0)}mm < 250mm` });
        else passed.push({ eid: s.eid, name: `${s.name} (${tlMM.toFixed(0)}mm)` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA: Railings ─────────────────────────────────────────────────
  {
    id: "BCA-ARCH-R01",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Railing",
    title: "Railings have a Height parameter",
    desc: "BCA accessibility requires railing height \u2265 1000mm (residential balcony) or \u2265 900mm (interior stair).",
    severity: "warn",
    check: (ctx) => {
      const rails = ctx.byClass.get("IfcRailing") || [];
      const passed = [], failed = [];
      for (const r of rails) {
        const h = sgReadNumeric(r, "Height") || sgReadNumeric(r, "OverallHeight");
        if (h == null) {
          failed.push({ eid: r.eid, name: r.name, reason: "Height/OverallHeight not set" });
          continue;
        }
        const hMM = h > 10 ? h : h * 1e3;
        if (hMM < 900) failed.push({ eid: r.eid, name: r.name, reason: `Height ${hMM.toFixed(0)}mm < 900mm BCA minimum` });
        else passed.push({ eid: r.eid, name: `${r.name} (${hMM.toFixed(0)}mm)` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ── BCA: Naming sanity (GUID conflicts) ───────────────────────────
  {
    id: "BCA-G01",
    agency: "BCA",
    gateway: ["design", "construction", "completion"],
    category: "Data Quality",
    title: "No duplicate GlobalIds",
    desc: "Every element must have a unique GlobalId. Duplicates indicate model corruption or improper federation.",
    severity: "error",
    check: (ctx) => {
      const seen = /* @__PURE__ */ new Map();
      const dupes = [];
      for (const e of ctx.entities) {
        const gid = e.globalId;
        if (!gid) continue;
        if (seen.has(gid)) dupes.push({ eid: e.eid, name: e.name, reason: `Duplicate GlobalId \u2014 also on element ${seen.get(gid).name}` });
        else seen.set(gid, e);
      }
      if (dupes.length === 0) return { passed: [{ eid: 0, name: `${ctx.entities.length} unique GlobalIds` }], failed: [], skipped: 0 };
      return { passed: [], failed: dupes, skipped: 0 };
    }
  },
  {
    id: "BCA-G02",
    agency: "BCA",
    gateway: ["design", "construction"],
    category: "Data Quality",
    title: "Element names are not blank or default",
    desc: 'Elements with names like "Wall", "Door:Default", or blank suggest the model was not properly authored.',
    severity: "info",
    check: (ctx) => {
      const passed = [], failed = [];
      const DEFAULTS = /^(wall|door|window|slab|beam|column|stair|railing|space|<unnamed>|untitled|default|new)$/i;
      for (const e of ctx.entities) {
        const nm = (e.name || "").trim();
        if (!nm || DEFAULTS.test(nm)) failed.push({ eid: e.eid, name: nm || "(blank)", reason: `Default/blank name on ${e.type}` });
        else passed.push({ eid: e.eid, name: nm });
      }
      if (failed.length > 50) {
        const totalFailed = failed.length;
        failed.length = 50;
        failed.push({ eid: 0, name: `\u2026 and ${totalFailed - 50} more`, reason: "List truncated for performance" });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  // ══════════════════════════════════════════════════════════════════
  // ── CROSS-DISCIPLINE CHECKS (multi-file federation) ──────────────
  // ══════════════════════════════════════════════════════════════════
  // These rules only produce meaningful results when 2+ models are loaded.
  // They check alignment, consistency, and conflicts across discipline files.
  {
    id: "FED-001",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "Geo-reference alignment across models",
    desc: "All federated IFC files must share the same IfcSite RefLatitude / RefLongitude / RefElevation. Mismatched geo-ref means models will not align correctly in CORENET X.",
    severity: "error",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const geoRefs = [];
      for (const m of models) {
        const sites = m.spatial?.sites || [];
        const mName = m.spatial?.modelName || "Model " + m.modelIdx;
        if (sites.length === 0) {
          failed.push({ eid: 0, name: mName, reason: "No IfcSite found \u2014 cannot verify geo-reference" });
          continue;
        }
        const s = sites[0];
        const lat = s.refLat != null ? compoundToDeg(s.refLat) : null;
        const lon = s.refLon != null ? compoundToDeg(s.refLon) : null;
        const elev = typeof s.refElev === "number" ? s.refElev : null;
        geoRefs.push({ mName, lat, lon, elev, modelIdx: m.modelIdx });
        if (lat == null || lon == null) {
          failed.push({ eid: 0, name: mName, reason: "Missing RefLatitude or RefLongitude" });
        }
      }
      const valid = geoRefs.filter((g) => g.lat != null && g.lon != null);
      if (valid.length >= 2) {
        const ref = valid[0];
        for (let i = 1; i < valid.length; i++) {
          const g = valid[i];
          const dLat = Math.abs(g.lat - ref.lat);
          const dLon = Math.abs(g.lon - ref.lon);
          const dElev = g.elev != null && ref.elev != null ? Math.abs(g.elev - ref.elev) : 0;
          if (dLat > 1e-4 || dLon > 1e-4) {
            failed.push({
              eid: 0,
              name: `${g.mName} vs ${ref.mName}`,
              reason: `Lat diff ${(dLat * 111e3).toFixed(1)}m, Lon diff ${(dLon * 111e3 * Math.cos(ref.lat * Math.PI / 180)).toFixed(1)}m \u2014 models will not align`
            });
          } else if (dElev > 0.5) {
            failed.push({
              eid: 0,
              name: `${g.mName} vs ${ref.mName}`,
              reason: `Elevation diff ${dElev.toFixed(2)}m \u2014 vertical misalignment`
            });
          } else {
            passed.push({ eid: 0, name: `${g.mName} \u2194 ${ref.mName}: aligned (\u0394${(dLat * 111e3).toFixed(1)}m, \u0394${(dLon * 111e3).toFixed(1)}m)` });
          }
        }
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "FED-002",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "Storey naming consistency across models",
    desc: "Building storeys should have matching names and elevations across all discipline files. Inconsistent naming causes problems in BIM coordination and CORENET X submission.",
    severity: "warn",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const modelStoreys = models.map((m) => ({
        name: m.spatial?.modelName || "Model " + m.modelIdx,
        storeys: (m.spatial?.storeys || []).map((s) => ({
          name: (s.name || "").trim().toUpperCase(),
          origName: s.name || "",
          elevation: s.elevation
        }))
      })).filter((m) => m.storeys.length > 0);
      if (modelStoreys.length < 2) {
        return { passed: [{ eid: 0, name: "Only one model has storeys \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const ref = modelStoreys[0];
      for (let mi = 1; mi < modelStoreys.length; mi++) {
        const other = modelStoreys[mi];
        if (ref.storeys.length !== other.storeys.length) {
          failed.push({
            eid: 0,
            name: `${ref.name} vs ${other.name}`,
            reason: `Different storey count: ${ref.storeys.length} vs ${other.storeys.length}`
          });
        }
        for (const rs of ref.storeys) {
          const match = other.storeys.find((os) => Math.abs(os.elevation - rs.elevation) < 0.1);
          if (!match) {
            failed.push({
              eid: 0,
              name: `${other.name}`,
              reason: `Missing storey at elevation ${rs.elevation.toFixed(2)}m (${rs.origName} in ${ref.name})`
            });
          } else if (match.name !== rs.name) {
            failed.push({
              eid: 0,
              name: `Elev ${rs.elevation.toFixed(1)}m`,
              reason: `Name mismatch: "${rs.origName}" (${ref.name}) vs "${match.origName}" (${other.name})`
            });
          } else {
            passed.push({ eid: 0, name: `${rs.origName} @ ${rs.elevation.toFixed(1)}m \u2014 consistent` });
          }
        }
        for (const os of other.storeys) {
          const match = ref.storeys.find((rs) => Math.abs(rs.elevation - os.elevation) < 0.1);
          if (!match) {
            failed.push({
              eid: 0,
              name: `${other.name}`,
              reason: `Extra storey "${os.origName}" at ${os.elevation.toFixed(2)}m \u2014 not in ${ref.name}`
            });
          }
        }
      }
      const seen = /* @__PURE__ */ new Set();
      const dedupPassed = passed.filter((p) => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      });
      return { passed: dedupPassed, failed, skipped: 0 };
    }
  },
  {
    id: "FED-003",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "No GlobalId conflicts across models",
    desc: "When federating multiple IFC files, GlobalIds must be unique across all models. Duplicate GlobalIds indicate copy-paste errors or improper federation and will cause issues in CORENET X.",
    severity: "error",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const gidMap = /* @__PURE__ */ new Map();
      let totalChecked = 0;
      let conflicts = 0;
      for (const e of ctx.entities) {
        if (!e.globalId) continue;
        totalChecked++;
        if (gidMap.has(e.globalId)) {
          const existing = gidMap.get(e.globalId);
          if (existing.modelIdx !== e.modelIdx) {
            conflicts++;
            if (conflicts <= 50) {
              failed.push({
                eid: e.eid,
                name: e.name || e.globalId,
                reason: `GlobalId "${e.globalId.substring(0, 12)}\u2026" exists in model ${existing.modelIdx} (${existing.name}) AND model ${e.modelIdx}`
              });
            }
          }
        } else {
          gidMap.set(e.globalId, { name: e.name, modelIdx: e.modelIdx, type: e.type });
        }
      }
      if (conflicts > 50) {
        failed.push({ eid: 0, name: `\u2026 and ${conflicts - 50} more conflicts`, reason: "List truncated" });
      }
      if (conflicts === 0) {
        passed.push({ eid: 0, name: `${totalChecked} GlobalIds checked across ${models.length} models \u2014 all unique` });
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "FED-004",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "Project name consistency across models",
    desc: "All federated IFC files should reference the same IfcProject name to confirm they belong to the same project.",
    severity: "warn",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const names = models.map((m) => ({
        mName: m.spatial?.modelName || "Model " + m.modelIdx,
        projName: (m.spatial?.projectName || "").trim()
      }));
      const ref = names[0];
      for (let i = 1; i < names.length; i++) {
        if (!ref.projName || !names[i].projName) {
          failed.push({ eid: 0, name: names[i].mName, reason: "IfcProject name is empty \u2014 cannot verify consistency" });
        } else if (ref.projName.toUpperCase() !== names[i].projName.toUpperCase()) {
          failed.push({
            eid: 0,
            name: `${names[i].mName}`,
            reason: `Project name "${names[i].projName}" \u2260 "${ref.projName}" (${ref.mName})`
          });
        } else {
          passed.push({ eid: 0, name: `${names[i].mName}: "${names[i].projName}" \u2713` });
        }
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "FED-005",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "TrueNorth alignment across models",
    desc: "All federated IFC files should have the same TrueNorth direction. Mismatched TrueNorth means models are rotated relative to each other.",
    severity: "error",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const angles = models.map((m) => ({
        mName: m.spatial?.modelName || "Model " + m.modelIdx,
        angle: m.spatial?.trueNorthAngle ?? 0
      }));
      const ref = angles[0];
      for (let i = 1; i < angles.length; i++) {
        const diff = Math.abs(angles[i].angle - ref.angle);
        const diffDeg = diff * 180 / Math.PI;
        if (diffDeg > 0.5) {
          failed.push({
            eid: 0,
            name: `${angles[i].mName} vs ${ref.mName}`,
            reason: `TrueNorth differs by ${diffDeg.toFixed(1)}\xB0 \u2014 models rotated relative to each other`
          });
        } else {
          passed.push({ eid: 0, name: `${angles[i].mName} \u2194 ${ref.mName}: TrueNorth aligned (\u0394${diffDeg.toFixed(2)}\xB0)` });
        }
      }
      return { passed, failed, skipped: 0 };
    }
  },
  {
    id: "FED-006",
    agency: "GENERAL",
    gateway: ["design", "piling", "construction", "completion"],
    category: "Federation",
    title: "Bounding box overlap between models",
    desc: "Federated models should occupy overlapping 3D space. Non-overlapping bounding boxes indicate wrong coordinate origin or wrong file.",
    severity: "warn",
    check: (ctx) => {
      const passed = [], failed = [];
      const models = ctx.modelIDs;
      if (models.length < 2) {
        return { passed: [{ eid: 0, name: "Single model \u2014 cross-check not applicable" }], failed: [], skipped: 0 };
      }
      const bboxes = [];
      for (const m of models) {
        const mName = m.spatial?.modelName || "Model " + m.modelIdx;
        const model = loadedModels[m.modelIdx];
        if (!model) continue;
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) continue;
        bboxes.push({ mName, box, modelIdx: m.modelIdx });
      }
      if (bboxes.length < 2) {
        return { passed: [], failed: [], skipped: 1, info: "Cannot compute bounding boxes" };
      }
      const ref = bboxes[0];
      for (let i = 1; i < bboxes.length; i++) {
        const other = bboxes[i];
        const overlap = ref.box.clone().intersect(other.box);
        if (overlap.isEmpty()) {
          const dist = ref.box.distanceToPoint(other.box.getCenter(new THREE.Vector3()));
          failed.push({
            eid: 0,
            name: `${other.mName} vs ${ref.mName}`,
            reason: `No bounding box overlap \u2014 ${dist.toFixed(1)}m apart. Models may use different coordinate origins.`
          });
        } else {
          const oSize = new THREE.Vector3();
          overlap.getSize(oSize);
          const rSize = new THREE.Vector3();
          ref.box.getSize(rSize);
          const pct = oSize.x * oSize.y * oSize.z / (rSize.x * rSize.y * rSize.z) * 100;
          passed.push({ eid: 0, name: `${other.mName} \u2194 ${ref.mName}: ${Math.min(pct, 100).toFixed(0)}% overlap` });
        }
      }
      return { passed, failed, skipped: 0 };
    }
  }
];
let SG_ACTIVE_RULES = [...SG_RULES];
let sgJsonLoaded = null;
function sgNormalizeEntity(name) {
  if (!name) return "";
  let n = name.trim();
  if (!n.startsWith("Ifc") && !n.startsWith("ifc")) n = "Ifc" + n;
  return "Ifc" + n.charAt(3).toUpperCase() + n.slice(4);
}
function sgCompileJsonRules(jsonRows) {
  const groups = /* @__PURE__ */ new Map();
  let rowIdx = 0;
  for (const row of jsonRows) {
    rowIdx++;
    if (!row.ifcEntity || !row.propertyName) continue;
    const entity = sgNormalizeEntity(row.ifcEntity);
    const pset = (row.propertySet || "").trim();
    const prop = (row.propertyName || "").trim();
    const agency = (row.agency || "BCA").toUpperCase().trim();
    const key = `${agency}|${entity}|${pset}|${prop}`;
    if (!groups.has(key)) {
      groups.set(key, {
        entity,
        pset,
        prop,
        agency,
        component: row.component || "",
        parameter: row.parameter || prop,
        propType: (row.propertyType || "Label").trim(),
        unit: (row.unit || "").trim(),
        sampleValues: row.sampleValues || "",
        gateway: Array.isArray(row.gateway) ? row.gateway : ["design"],
        severity: row.severity || "warn",
        notes: row.notes || "",
        checkType: row.checkType || "exists",
        checkValue: row.checkValue ?? null,
        rowNums: [rowIdx]
      });
    } else {
      const g = groups.get(key);
      for (const gw of Array.isArray(row.gateway) ? row.gateway : ["design"]) {
        if (!g.gateway.includes(gw)) g.gateway.push(gw);
      }
      g.rowNums.push(rowIdx);
    }
  }
  const rules = [];
  let seq = 0;
  for (const [, g] of groups) {
    seq++;
    const ruleId = `JSON-${g.agency}-${String(seq).padStart(3, "0")}`;
    const entityNames = [g.entity];
    if (g.entity === "IfcWall") entityNames.push("IfcWallStandardCase");
    const title = g.prop ? `${g.entity.replace("Ifc", "")} \u2014 ${g.prop}` + (g.pset ? ` (${g.pset})` : "") : `${g.component} \u2014 ${g.parameter}`;
    const desc = [
      g.parameter !== g.prop ? `Parameter: ${g.parameter}` : "",
      g.component ? `Component: ${g.component}` : "",
      g.sampleValues ? `Sample values: ${g.sampleValues}` : "",
      g.notes || ""
    ].filter(Boolean).join(". ");
    rules.push({
      id: ruleId,
      agency: g.agency,
      gateway: g.gateway,
      category: g.component || g.entity.replace("Ifc", ""),
      title,
      desc: desc || title,
      severity: g.severity,
      _source: "json",
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
function sgMakeCheckFn(entityNames, pset, prop, propType, checkType, checkValue, unit) {
  return (ctx) => {
    let scope = [];
    for (const en of entityNames) {
      const bucket = ctx.byClass.get(en);
      if (bucket) scope.push(...bucket);
    }
    const seen = /* @__PURE__ */ new Set();
    scope = scope.filter((e) => {
      if (seen.has(e.eid)) return false;
      seen.add(e.eid);
      return true;
    });
    if (scope.length === 0) {
      return { passed: [], failed: [], skipped: 0, info: `No ${entityNames[0]} elements found in model` };
    }
    const passed = [], failed = [];
    for (const e of scope) {
      const psetHint = pset || null;
      const ENTITY_PROPS = { Name: "name", LongName: "LongName", Tag: "tag", PredefinedType: "PredefinedType" };
      let r = null;
      if (ENTITY_PROPS[prop]) {
        const key = ENTITY_PROPS[prop];
        const val = e[key]?.value ?? e[key];
        if (val !== null && val !== void 0 && val !== "")
          r = { value: val, type: typeof val, psetName: "(entity)" };
      }
      if (!r) r = sgReadParam(e, prop, psetHint);
      switch (checkType) {
        case "boolean": {
          if (r && (r.value === true || r.value === false || r.value === "TRUE" || r.value === "FALSE" || r.value === "T" || r.value === "F"))
            passed.push({ eid: e.eid, name: e.name });
          else
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set (expected TRUE/FALSE)` });
          break;
        }
        case "numeric_gte": {
          const n = sgReadNumeric(e, prop, psetHint);
          if (n === null) {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set or not numeric` });
          } else {
            let val = n;
            if (unit === "mm" && val < 10 && val > 0) val = val * 1e3;
            if (val >= checkValue)
              passed.push({ eid: e.eid, name: `${e.name} (${val}${unit})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = ${val}${unit}, required \u2265 ${checkValue}${unit}` });
          }
          break;
        }
        case "numeric_lte": {
          const n = sgReadNumeric(e, prop, psetHint);
          if (n === null) {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set or not numeric` });
          } else {
            let val = n;
            if (unit === "mm" && val < 10 && val > 0) val = val * 1e3;
            if (val <= checkValue)
              passed.push({ eid: e.eid, name: `${e.name} (${val}${unit})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = ${val}${unit}, required \u2264 ${checkValue}${unit}` });
          }
          break;
        }
        case "enum": {
          if (!r || r.value === null || r.value === void 0 || r.value === "") {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set` });
          } else {
            const allowed = Array.isArray(checkValue) ? checkValue : [];
            const val = String(r.value).toUpperCase().trim();
            if (allowed.length === 0 || allowed.some((a) => val === String(a).toUpperCase().trim()))
              passed.push({ eid: e.eid, name: `${e.name} (${r.value})` });
            else
              failed.push({ eid: e.eid, name: e.name, reason: `${prop} = "${r.value}" \u2014 expected one of: ${allowed.join(", ")}` });
          }
          break;
        }
        case "regex": {
          if (!r || r.value === null || r.value === void 0 || r.value === "") {
            failed.push({ eid: e.eid, name: e.name, reason: `${prop} not set` });
          } else {
            try {
              const rx = new RegExp(checkValue || ".+");
              if (rx.test(String(r.value)))
                passed.push({ eid: e.eid, name: `${e.name} (${r.value})` });
              else
                failed.push({ eid: e.eid, name: e.name, reason: `${prop} = "${r.value}" does not match pattern` });
            } catch {
              passed.push({ eid: e.eid, name: e.name });
            }
          }
          break;
        }
        default:
          if (r && r.value !== null && r.value !== void 0 && r.value !== "")
            passed.push({ eid: e.eid, name: e.name });
          else
            failed.push({ eid: e.eid, name: e.name, reason: `Missing ${prop}` + (pset ? ` in ${pset}` : "") });
      }
    }
    if (failed.length > 50) {
      const total = failed.length;
      failed.length = 50;
      failed.push({ eid: 0, name: `\u2026 and ${total - 50} more`, reason: "List truncated" });
    }
    return { passed, failed, skipped: 0 };
  };
}
const SG_BUILTIN_JSON = [
  // ══ BCA — WALLS ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Wall", parameter: "Fire Rating", ifcEntity: "IfcWall", propertySet: "Pset_WallCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "BCA", component: "Wall", parameter: "Load Bearing", ifcEntity: "IfcWall", propertySet: "Pset_WallCommon", propertyName: "LoadBearing", propertyType: "Boolean", gateway: ["design", "construction"], severity: "error", checkType: "boolean" },
  { agency: "BCA", component: "Wall", parameter: "Is External", ifcEntity: "IfcWall", propertySet: "Pset_WallCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design", "construction"], severity: "error", checkType: "boolean" },
  { agency: "BCA", component: "Wall", parameter: "Thickness", ifcEntity: "IfcWall", propertySet: "SGPset_Wall", propertyName: "Thickness", propertyType: "Real", unit: "mm", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Wall", parameter: "Construction Method", ifcEntity: "IfcWall", propertySet: "SGPset_Wall", propertyName: "ConstructionMethod", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists", sampleValues: "CIS, Precast, PPVC" },
  { agency: "BCA", component: "Wall", parameter: "Material Grade", ifcEntity: "IfcWall", propertySet: "SGPset_Wall", propertyName: "MaterialGrade", propertyType: "Label", gateway: ["design", "construction"], severity: "warn", checkType: "exists", sampleValues: "C30/37, C40/50" },
  { agency: "BCA", component: "Wall", parameter: "Reference", ifcEntity: "IfcWall", propertySet: "Pset_WallCommon", propertyName: "Reference", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ BCA — DOORS ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Door", parameter: "Fire Rating", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "BCA", component: "Door", parameter: "Is External", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Door", parameter: "Accessible Width \u2265 850mm", ifcEntity: "IfcDoor", propertySet: "SGPset_Door", propertyName: "Width", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "numeric_gte", checkValue: 850 },
  { agency: "BCA", component: "Door", parameter: "Handicap Accessible", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "HandicapAccessible", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Door", parameter: "Self Closing", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "SelfClosing", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "BCA", component: "Door", parameter: "Smoke Stop", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "SmokeStop", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ BCA — WINDOWS ═════════════════════════════════════════════════
  { agency: "BCA", component: "Window", parameter: "Is External", ifcEntity: "IfcWindow", propertySet: "Pset_WindowCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Window", parameter: "Fire Rating", ifcEntity: "IfcWindow", propertySet: "Pset_WindowCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Window", parameter: "Glazing Area Fraction", ifcEntity: "IfcWindow", propertySet: "Pset_WindowCommon", propertyName: "GlazingAreaFraction", propertyType: "Real", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "BCA", component: "Window", parameter: "Thermal Transmittance", ifcEntity: "IfcWindow", propertySet: "Pset_WindowCommon", propertyName: "ThermalTransmittance", propertyType: "Real", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ BCA — SLABS ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Slab", parameter: "Fire Rating", ifcEntity: "IfcSlab", propertySet: "Pset_SlabCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "BCA", component: "Slab", parameter: "Is External", ifcEntity: "IfcSlab", propertySet: "Pset_SlabCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Slab", parameter: "Load Bearing", ifcEntity: "IfcSlab", propertySet: "Pset_SlabCommon", propertyName: "LoadBearing", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Slab", parameter: "Thickness", ifcEntity: "IfcSlab", propertySet: "SGPset_Slab", propertyName: "Thickness", propertyType: "Real", unit: "mm", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Slab", parameter: "Construction Method", ifcEntity: "IfcSlab", propertySet: "SGPset_Slab", propertyName: "ConstructionMethod", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Slab", parameter: "Material Grade", ifcEntity: "IfcSlab", propertySet: "SGPset_Slab", propertyName: "MaterialGrade", propertyType: "Label", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  // ══ BCA — COLUMNS ═════════════════════════════════════════════════
  { agency: "BCA", component: "Column", parameter: "Fire Rating", ifcEntity: "IfcColumn", propertySet: "Pset_ColumnCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "BCA", component: "Column", parameter: "Load Bearing", ifcEntity: "IfcColumn", propertySet: "Pset_ColumnCommon", propertyName: "LoadBearing", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Column", parameter: "Width", ifcEntity: "IfcColumn", propertySet: "SGPset_ColumnDimension", propertyName: "Width", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Column", parameter: "Depth", ifcEntity: "IfcColumn", propertySet: "SGPset_ColumnDimension", propertyName: "Depth", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Column", parameter: "Construction Method", ifcEntity: "IfcColumn", propertySet: "SGPset_Column", propertyName: "ConstructionMethod", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Column", parameter: "Material Grade", ifcEntity: "IfcColumn", propertySet: "SGPset_Column", propertyName: "MaterialGrade", propertyType: "Label", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Column", parameter: "Rebar Grade", ifcEntity: "IfcColumn", propertySet: "SGPset_ColumnReinforcement", propertyName: "RebarGrade", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists", sampleValues: "B500, H13, T16" },
  // ══ BCA — BEAMS ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Beam", parameter: "Fire Rating", ifcEntity: "IfcBeam", propertySet: "Pset_BeamCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "BCA", component: "Beam", parameter: "Load Bearing", ifcEntity: "IfcBeam", propertySet: "Pset_BeamCommon", propertyName: "LoadBearing", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  { agency: "BCA", component: "Beam", parameter: "Width", ifcEntity: "IfcBeam", propertySet: "SGPset_BeamDimension", propertyName: "Width", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Beam", parameter: "Depth", ifcEntity: "IfcBeam", propertySet: "SGPset_BeamDimension", propertyName: "Depth", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Beam", parameter: "Construction Method", ifcEntity: "IfcBeam", propertySet: "SGPset_Beam", propertyName: "ConstructionMethod", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Beam", parameter: "Material Grade", ifcEntity: "IfcBeam", propertySet: "SGPset_Beam", propertyName: "MaterialGrade", propertyType: "Label", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Beam", parameter: "Rebar Grade", ifcEntity: "IfcBeam", propertySet: "SGPset_BeamReinforcement", propertyName: "RebarGrade", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists" },
  // ══ BCA — STAIRS ══════════════════════════════════════════════════
  { agency: "BCA", component: "Stair", parameter: "Number of Risers", ifcEntity: "IfcStairFlight", propertySet: "Pset_StairFlightCommon", propertyName: "NumberOfRiser", propertyType: "Integer", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Stair", parameter: "Riser Height \u2264 175mm", ifcEntity: "IfcStairFlight", propertySet: "Pset_StairFlightCommon", propertyName: "RiserHeight", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "error", checkType: "numeric_lte", checkValue: 175 },
  { agency: "BCA", component: "Stair", parameter: "Tread Length \u2265 250mm", ifcEntity: "IfcStairFlight", propertySet: "Pset_StairFlightCommon", propertyName: "TreadLength", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "error", checkType: "numeric_gte", checkValue: 250 },
  { agency: "BCA", component: "Stair", parameter: "Fire Rating", ifcEntity: "IfcStair", propertySet: "Pset_StairCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Stair", parameter: "Is External", ifcEntity: "IfcStair", propertySet: "Pset_StairCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "boolean" },
  // ══ BCA — RAILINGS ════════════════════════════════════════════════
  { agency: "BCA", component: "Railing", parameter: "Height \u2265 900mm", ifcEntity: "IfcRailing", propertySet: "Pset_RailingCommon", propertyName: "Height", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "error", checkType: "numeric_gte", checkValue: 900 },
  { agency: "BCA", component: "Railing", parameter: "Is External", ifcEntity: "IfcRailing", propertySet: "Pset_RailingCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "boolean" },
  // ══ BCA — ROOFS ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Roof", parameter: "Fire Rating", ifcEntity: "IfcRoof", propertySet: "Pset_RoofCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Roof", parameter: "Is External", ifcEntity: "IfcRoof", propertySet: "Pset_RoofCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "boolean" },
  // ══ BCA — FOOTINGS ════════════════════════════════════════════════
  { agency: "BCA", component: "Footing", parameter: "Material Grade", ifcEntity: "IfcFooting", propertySet: "SGPset_Footing", propertyName: "MaterialGrade", propertyType: "Label", gateway: ["design", "construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Footing", parameter: "Construction Method", ifcEntity: "IfcFooting", propertySet: "SGPset_Footing", propertyName: "ConstructionMethod", propertyType: "Label", gateway: ["construction"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Footing", parameter: "Pile Type", ifcEntity: "IfcFooting", propertySet: "SGPset_Footing", propertyName: "PileType", propertyType: "Label", gateway: ["piling"], severity: "warn", checkType: "exists", sampleValues: "Bored, Driven, Micropile" },
  // ══ BCA — CURTAIN WALLS ═══════════════════════════════════════════
  { agency: "BCA", component: "Curtain Wall", parameter: "Fire Rating", ifcEntity: "IfcCurtainWall", propertySet: "Pset_CurtainWallCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Curtain Wall", parameter: "Is External", ifcEntity: "IfcCurtainWall", propertySet: "Pset_CurtainWallCommon", propertyName: "IsExternal", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  // ══ BCA — MEMBERS ═════════════════════════════════════════════════
  { agency: "BCA", component: "Member", parameter: "Fire Rating", ifcEntity: "IfcMember", propertySet: "Pset_MemberCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Member", parameter: "Load Bearing", ifcEntity: "IfcMember", propertySet: "Pset_MemberCommon", propertyName: "LoadBearing", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "boolean" },
  // ══ BCA — PLATES ══════════════════════════════════════════════════
  { agency: "BCA", component: "Plate", parameter: "Fire Rating", ifcEntity: "IfcPlate", propertySet: "Pset_PlateCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  // ══ BCA — SPACES ══════════════════════════════════════════════════
  { agency: "BCA", component: "Space", parameter: "Name", ifcEntity: "IfcSpace", propertySet: "", propertyName: "Name", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Space", parameter: "Long Name / Function", ifcEntity: "IfcSpace", propertySet: "", propertyName: "LongName", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Space", parameter: "Fire Rating", ifcEntity: "IfcSpace", propertySet: "Pset_SpaceCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "BCA", component: "Space", parameter: "Gross Floor Area", ifcEntity: "IfcSpace", propertySet: "SGPset_SpaceDimension", propertyName: "GrossFloorArea", propertyType: "Real", unit: "m\xB2", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Space", parameter: "Net Floor Area", ifcEntity: "IfcSpace", propertySet: "SGPset_SpaceDimension", propertyName: "NetFloorArea", propertyType: "Real", unit: "m\xB2", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "BCA", component: "Space", parameter: "Height", ifcEntity: "IfcSpace", propertySet: "SGPset_SpaceDimension", propertyName: "Height", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ BCA — ACCESSIBILITY ═══════════════════════════════════════════
  { agency: "BCA", component: "Ramp", parameter: "Slope \u2264 1:12", ifcEntity: "IfcRamp", propertySet: "Pset_RampCommon", propertyName: "RequiredSlope", propertyType: "Real", gateway: ["design"], severity: "warn", checkType: "exists" },
  { agency: "BCA", component: "Ramp", parameter: "Handrail Height", ifcEntity: "IfcRamp", propertySet: "SGPset_Ramp", propertyName: "HandrailHeight", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "warn", checkType: "exists" },
  // ══ BCA — MEP GENERAL (Flow segments/terminals) ═══════════════════
  { agency: "BCA", component: "Pipe", parameter: "System Type", ifcEntity: "IfcFlowSegment", propertySet: "SGPset_Pipe", propertyName: "SystemType", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists", sampleValues: "Sanitary, Stormwater, Potable Water" },
  { agency: "BCA", component: "Pipe", parameter: "Diameter", ifcEntity: "IfcFlowSegment", propertySet: "SGPset_Pipe", propertyName: "NominalDiameter", propertyType: "Real", unit: "mm", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "BCA", component: "Terminal", parameter: "System Type", ifcEntity: "IfcFlowTerminal", propertySet: "SGPset_FlowTerminal", propertyName: "SystemType", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists" },
  // ══ BCA — PROXY ═══════════════════════════════════════════════════
  { agency: "BCA", component: "Building Element Proxy", parameter: "Tag", ifcEntity: "IfcBuildingElementProxy", propertySet: "", propertyName: "Tag", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists", notes: "Proxies should be properly tagged for identification" },
  // ══ SCDF — FIRE SAFETY ════════════════════════════════════════════
  { agency: "SCDF", component: "Wall", parameter: "Fire Rating (SCDF)", ifcEntity: "IfcWall", propertySet: "Pset_WallCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists", notes: "SCDF requires fire compartmentation walls to have explicit fire rating" },
  { agency: "SCDF", component: "Door", parameter: "Fire Rating (SCDF)", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design", "construction"], severity: "error", checkType: "exists" },
  { agency: "SCDF", component: "Door", parameter: "Self Closing (Fire Door)", ifcEntity: "IfcDoor", propertySet: "Pset_DoorCommon", propertyName: "SelfClosing", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "exists", notes: "Fire doors must be self-closing per Fire Code 2023" },
  { agency: "SCDF", component: "Slab", parameter: "Fire Rating (SCDF)", ifcEntity: "IfcSlab", propertySet: "Pset_SlabCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "error", checkType: "exists" },
  { agency: "SCDF", component: "Column", parameter: "Fire Rating (SCDF)", ifcEntity: "IfcColumn", propertySet: "Pset_ColumnCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "error", checkType: "exists" },
  { agency: "SCDF", component: "Beam", parameter: "Fire Rating (SCDF)", ifcEntity: "IfcBeam", propertySet: "Pset_BeamCommon", propertyName: "FireRating", propertyType: "Label", gateway: ["design"], severity: "error", checkType: "exists" },
  // ══ URA — PLANNING ════════════════════════════════════════════════
  { agency: "URA", component: "Space", parameter: "GFA (Gross Floor Area)", ifcEntity: "IfcSpace", propertySet: "SGPset_SpaceDimension", propertyName: "GrossFloorArea", propertyType: "Real", unit: "m\xB2", gateway: ["design"], severity: "warn", checkType: "exists", notes: "URA uses GFA for plot ratio calculation" },
  { agency: "URA", component: "Space", parameter: "Plot Ratio", ifcEntity: "IfcSpace", propertySet: "SGPset_URA", propertyName: "PlotRatio", propertyType: "Real", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "URA", component: "Space", parameter: "Use Group", ifcEntity: "IfcSpace", propertySet: "SGPset_URA", propertyName: "UseGroup", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists", sampleValues: "A1, A2, B1, B2, C, D" },
  { agency: "URA", component: "Space", parameter: "Zone", ifcEntity: "IfcSpace", propertySet: "SGPset_URA", propertyName: "Zone", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "URA", component: "Space", parameter: "Conservation Status", ifcEntity: "IfcSpace", propertySet: "SGPset_URA", propertyName: "ConservationStatus", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "URA", component: "Space", parameter: "Building Height", ifcEntity: "IfcSpace", propertySet: "SGPset_URA", propertyName: "BuildingHeight", propertyType: "Real", unit: "m", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ NEA — ENVIRONMENT ═════════════════════════════════════════════
  { agency: "NEA", component: "Space", parameter: "Refuse Chute Room", ifcEntity: "IfcSpace", propertySet: "SGPset_NEA", propertyName: "RefuseChute", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "exists", notes: "NEA requires refuse chute provisions tagged in the model" },
  { agency: "NEA", component: "Space", parameter: "Recycling Room", ifcEntity: "IfcSpace", propertySet: "SGPset_NEA", propertyName: "RecyclingRoom", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "NEA", component: "Space", parameter: "Ventilation Type", ifcEntity: "IfcSpace", propertySet: "SGPset_NEA", propertyName: "VentilationType", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists", sampleValues: "Natural, Mechanical, Hybrid" },
  { agency: "NEA", component: "Space", parameter: "Noise Level", ifcEntity: "IfcSpace", propertySet: "SGPset_NEA", propertyName: "NoiseLevel", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "NEA", component: "Terminal", parameter: "Exhaust System", ifcEntity: "IfcFlowTerminal", propertySet: "SGPset_NEA", propertyName: "ExhaustType", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ LTA — TRANSPORT ═══════════════════════════════════════════════
  { agency: "LTA", component: "Space", parameter: "Carpark Type", ifcEntity: "IfcSpace", propertySet: "SGPset_LTA", propertyName: "CarparkType", propertyType: "Label", gateway: ["design"], severity: "warn", checkType: "exists", sampleValues: "Mechanical, Conventional, Automated" },
  { agency: "LTA", component: "Space", parameter: "Carpark Lot Size", ifcEntity: "IfcSpace", propertySet: "SGPset_LTA", propertyName: "LotSize", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "LTA", component: "Space", parameter: "EV Charging", ifcEntity: "IfcSpace", propertySet: "SGPset_LTA", propertyName: "EVCharging", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "LTA", component: "Space", parameter: "Bicycle Lot", ifcEntity: "IfcSpace", propertySet: "SGPset_LTA", propertyName: "BicycleLot", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "LTA", component: "Space", parameter: "Loading Bay", ifcEntity: "IfcSpace", propertySet: "SGPset_LTA", propertyName: "LoadingBay", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "LTA", component: "Ramp", parameter: "Vehicle Ramp Gradient", ifcEntity: "IfcRamp", propertySet: "SGPset_LTA", propertyName: "VehicleRampGradient", propertyType: "Real", gateway: ["design"], severity: "warn", checkType: "exists" },
  // ══ PUB — WATER/DRAINAGE ══════════════════════════════════════════
  { agency: "PUB", component: "Space", parameter: "Wet Area", ifcEntity: "IfcSpace", propertySet: "SGPset_PUB", propertyName: "WetArea", propertyType: "Boolean", gateway: ["design"], severity: "warn", checkType: "exists", notes: "PUB requires wet areas (toilets, kitchens) to be tagged" },
  { agency: "PUB", component: "Space", parameter: "Minimum Platform Level", ifcEntity: "IfcSpace", propertySet: "SGPset_PUB", propertyName: "MinPlatformLevel", propertyType: "Real", unit: "m", gateway: ["design"], severity: "warn", checkType: "exists", notes: "MPL compliance is a frequent PUB rejection cause" },
  { agency: "PUB", component: "Pipe", parameter: "Drainage System", ifcEntity: "IfcFlowSegment", propertySet: "SGPset_PUB", propertyName: "DrainageSystem", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists", sampleValues: "Surface, Sub-surface" },
  { agency: "PUB", component: "Pipe", parameter: "Pipe Material", ifcEntity: "IfcFlowSegment", propertySet: "SGPset_PUB", propertyName: "PipeMaterial", propertyType: "Label", gateway: ["design", "construction"], severity: "info", checkType: "exists" },
  { agency: "PUB", component: "Terminal", parameter: "Sanitary Fixture Type", ifcEntity: "IfcFlowTerminal", propertySet: "SGPset_PUB", propertyName: "FixtureType", propertyType: "Label", gateway: ["design"], severity: "info", checkType: "exists" },
  // ══ NPARKS — GREENERY ═════════════════════════════════════════════
  { agency: "NPARKS", component: "Space", parameter: "Landscape Area", ifcEntity: "IfcSpace", propertySet: "SGPset_NParks", propertyName: "LandscapeArea", propertyType: "Real", unit: "m\xB2", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "NPARKS", component: "Space", parameter: "Green Plot Ratio", ifcEntity: "IfcSpace", propertySet: "SGPset_NParks", propertyName: "GreenPlotRatio", propertyType: "Real", gateway: ["design"], severity: "info", checkType: "exists" },
  { agency: "NPARKS", component: "Space", parameter: "Tree Conservation Area", ifcEntity: "IfcSpace", propertySet: "SGPset_NParks", propertyName: "TreeConservation", propertyType: "Boolean", gateway: ["design"], severity: "info", checkType: "exists" }
];
window.sgLoadJsonDialog = function() {
  document.getElementById("sgJsonOverlay").classList.add("show");
  const dz = document.getElementById("sgJsonDropZone");
  dz.ondragover = (ev) => {
    ev.preventDefault();
    dz.classList.add("dragover");
  };
  dz.ondragleave = () => dz.classList.remove("dragover");
  dz.ondrop = (ev) => {
    ev.preventDefault();
    dz.classList.remove("dragover");
    const file = ev.dataTransfer?.files?.[0];
    if (file && file.name.endsWith(".json")) sgProcessJsonFile(file);
    else alert("Please drop a .json file");
  };
};
window.sgCloseJsonDialog = function() {
  document.getElementById("sgJsonOverlay").classList.remove("show");
};
window.sgHandleJsonFile = function(ev) {
  const file = ev.target?.files?.[0];
  if (file) sgProcessJsonFile(file);
};
async function sgProcessJsonFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data.rules || data.parameters || data.mappings || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      alert('JSON must be an array of rule objects, or an object with a "rules", "parameters", or "mappings" array.');
      return;
    }
    sgApplyJsonRules(rows, file.name);
  } catch (err) {
    alert("Invalid JSON: " + err?.message);
  }
}
function sgApplyJsonRules(jsonRows, sourceName) {
  const compiled = sgCompileJsonRules(jsonRows);
  if (compiled.length === 0) {
    alert('No valid rules found. Each row needs at least "ifcEntity" and "propertyName".');
    return;
  }
  SG_ACTIVE_RULES = [...SG_RULES, ...compiled];
  const byAgency = {};
  for (const r of compiled) {
    byAgency[r.agency] = (byAgency[r.agency] || 0) + 1;
  }
  sgJsonLoaded = {
    filename: sourceName || "built-in",
    rowCount: jsonRows.length,
    ruleCount: compiled.length,
    byAgency
  };
  sgUpdateSourceBadge();
  const statsEl = document.getElementById("sgJsonStats");
  const previewEl = document.getElementById("sgJsonPreview");
  previewEl.style.display = "";
  let html = `<div style="margin-bottom:6px"><span class="k">Source:</span> <span class="v">${escapeHtml(sourceName || "built-in")}</span></div>`;
  html += `<div><span class="k">Rows parsed:</span> <span class="v">${jsonRows.length}</span> \u2192 <span class="k">Rules compiled:</span> <span class="v">${compiled.length}</span></div>`;
  html += `<div style="margin-top:6px">`;
  for (const [ag, cnt] of Object.entries(byAgency).sort((a, b) => b[1] - a[1])) {
    html += `<span style="margin-right:10px">${ag}: <b>${cnt}</b></span>`;
  }
  html += `</div>`;
  html += `<div style="margin-top:6px;color:var(--text-muted)">Total active rules: <b>${SG_ACTIVE_RULES.length}</b> (${SG_RULES.length} built-in + ${compiled.length} from JSON)</div>`;
  statsEl.innerHTML = html;
  sgState.results = null;
  sgState.selectedRuleIdx = null;
  sgState.cachedCtx = null;
  log(`SG JSON: loaded ${compiled.length} rules from ${sourceName || "built-in"}, total active: ${SG_ACTIVE_RULES.length}`);
}
function sgUpdateSourceBadge() {
  const srcEl = document.getElementById("sgRuleSrc");
  if (!sgJsonLoaded) {
    srcEl.innerHTML = "Built-in rules";
    return;
  }
  const isBuiltin = sgJsonLoaded.filename === "built-in";
  const cls = isBuiltin ? "merged" : "json";
  srcEl.innerHTML = `<span class="sg-src-badge ${cls}">${SG_RULES.length} built-in + ${sgJsonLoaded.ruleCount} ${isBuiltin ? "extended" : "JSON"}</span> ${sgJsonLoaded.ruleCount} rules from ${escapeHtml(isBuiltin ? "built-in library" : sgJsonLoaded.filename)}`;
}
window.sgLoadBuiltinRules = function() {
  sgApplyJsonRules(SG_BUILTIN_JSON, "built-in");
  document.getElementById("sgBuiltinBtn").textContent = "\u2713 Extended rules loaded";
  document.getElementById("sgBuiltinBtn").disabled = true;
};
window.sgResetToBuiltin = function() {
  SG_ACTIVE_RULES = [...SG_RULES];
  sgJsonLoaded = null;
  sgUpdateSourceBadge();
  document.getElementById("sgJsonPreview").style.display = "none";
  document.getElementById("sgBuiltinBtn").textContent = "\u26A1 Load Built-in Extended Rules (~200)";
  document.getElementById("sgBuiltinBtn").disabled = false;
  sgState.results = null;
  sgState.selectedRuleIdx = null;
  sgState.cachedCtx = null;
  log("SG: reset to Phase 1 built-in rules only");
};
window.sgExportSampleJson = function() {
  const sample = SG_BUILTIN_JSON.slice(0, 10).map((r) => ({
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
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ifc-sg-rules-sample.json";
  a.click();
  URL.revokeObjectURL(url);
};
async function sgBuildContext() {
  const cacheKey = loadedModels.map((m) => m?.modelID).join("-");
  if (sgState.cachedCtx && sgState.cachedCtxKey === cacheKey) return sgState.cachedCtx;
  const entities = [];
  const byClass = /* @__PURE__ */ new Map();
  const modelIDs = [];
  for (let mi = 0; mi < loadedModels.length; mi++) {
    const m = loadedModels[mi];
    if (!m) continue;
    modelIDs.push({ modelID: m.modelID, modelIdx: mi, spatial: m.spatial });
    const props = await getAllProps(m.modelID);
    for (const gid in props) {
      const p = props[gid];
      const className = sgIfcCodeToClass(p.type);
      const e = {
        eid: p.expressID,
        globalId: gid,
        type: className,
        typeCode: p.type,
        name: (p.name || "").trim(),
        tag: p.tag,
        psets: [],
        // will be populated by batch pset resolution below
        OverallWidth: p.OverallWidth,
        OverallHeight: p.OverallHeight,
        PredefinedType: p.PredefinedType,
        LongName: p.LongName,
        modelIdx: mi,
        _modelID: m.modelID
        // stash for pset resolution
      };
      entities.push(e);
      if (!byClass.has(className)) byClass.set(className, []);
      byClass.get(className).push(e);
      if (className === "IfcWallStandardCase") {
        if (!byClass.has("IfcWall")) byClass.set("IfcWall", []);
        byClass.get("IfcWall").push(e);
      }
    }
  }
  const IFCRELDEFINESBYPROPERTIES = 4186316022;
  const mgr = ifcLoader?.ifcManager;
  if (mgr) {
    const psetLookup = /* @__PURE__ */ new Map();
    const byModelID = /* @__PURE__ */ new Map();
    for (const e of entities) {
      if (!byModelID.has(e._modelID)) byModelID.set(e._modelID, /* @__PURE__ */ new Set());
      byModelID.get(e._modelID).add(e.eid);
    }
    for (const [mid, eids] of byModelID) {
      try {
        const api = mgr.state.api;
        const relIDs = api.GetLineIDsWithType(mid, IFCRELDEFINESBYPROPERTIES);
        const relCount = relIDs.size();
        log(`SG pset scan: ${relCount} IfcRelDefinesByProperties in model ${mid}`);
        for (let ri = 0; ri < relCount; ri++) {
          try {
            const rel = await mgr.getItemProperties(mid, relIDs.get(ri), false);
            if (!rel) continue;
            const pdefRef = rel.RelatingPropertyDefinition;
            if (!pdefRef) continue;
            const pdefID = pdefRef.value ?? pdefRef;
            if (typeof pdefID !== "number") continue;
            let relatedEIDs = [];
            if (Array.isArray(rel.RelatedObjects)) {
              relatedEIDs = rel.RelatedObjects.map((o) => o.value ?? o).filter((v) => typeof v === "number");
            } else if (rel.RelatedObjects?.value) {
              relatedEIDs = [rel.RelatedObjects.value];
            }
            const relevant = relatedEIDs.filter((eid) => eids.has(eid));
            if (relevant.length === 0) continue;
            let pset;
            try {
              pset = await mgr.getItemProperties(mid, pdefID, true);
            } catch (e) {
              continue;
            }
            if (!pset) continue;
            for (const eid of relevant) {
              if (!psetLookup.has(eid)) psetLookup.set(eid, []);
              psetLookup.get(eid).push(pset);
            }
          } catch (relErr) {
          }
        }
      } catch (err) {
        log("SG pset batch err:", err?.message);
      }
    }
    let enriched = 0;
    for (const e of entities) {
      const psets = psetLookup.get(e.eid);
      if (psets && psets.length > 0) {
        e.psets = psets;
        enriched++;
        for (const ps of psets) {
          if (!ps.HasProperties) continue;
          const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : [ps.HasProperties];
          for (const hp of hps) {
            if (!hp?.Name?.value) continue;
            const pn = hp.Name.value;
            const nv = hp.NominalValue;
            if (pn === "IsExternal" && !e._isExternal) e._isExternal = nv;
            if (pn === "LoadBearing" && !e._loadBearing) e._loadBearing = nv;
            if (pn === "FireRating" && !e._fireRating) e._fireRating = nv;
          }
        }
      }
      delete e._modelID;
    }
    log(`SG pset enrichment: ${enriched}/${entities.length} entities got psets via IfcRelDefinesByProperties`);
  }
  sgState.cachedCtx = { entities, byClass, modelIDs, gateway: sgState.gateway };
  sgState.cachedCtxKey = cacheKey;
  return sgState.cachedCtx;
}
function sgIfcCodeToClass(code) {
  const MAP = {
    // Architectural
    [IFCWALL]: "IfcWall",
    [IFCWALLSTANDARDCASE]: "IfcWallStandardCase",
    [IFCSLAB]: "IfcSlab",
    [IFCROOF]: "IfcRoof",
    [IFCDOOR]: "IfcDoor",
    [IFCWINDOW]: "IfcWindow",
    [IFCSTAIR]: "IfcStair",
    [IFCSTAIRFLIGHT]: "IfcStairFlight",
    [IFCRAILING]: "IfcRailing",
    [IFCMEMBER]: "IfcMember",
    [IFCCURTAINWALL]: "IfcCurtainWall",
    [IFCPLATE]: "IfcPlate",
    [IFCBUILDINGELEMENTPROXY]: "IfcBuildingElementProxy",
    [IFCFURNISHINGELEMENT]: "IfcFurnishingElement",
    // Structural
    [IFCCOLUMN]: "IfcColumn",
    [IFCBEAM]: "IfcBeam",
    [IFCFOOTING]: "IfcFooting",
    // MEP
    [IFCFLOWSEGMENT]: "IfcFlowSegment",
    [IFCFLOWTERMINAL]: "IfcFlowTerminal",
    [IFCFLOWFITTING]: "IfcFlowFitting",
    // Spaces
    [IFCSPACE]: "IfcSpace"
  };
  return MAP[code] || IFC_NAMES[code] || "Ifc#" + code;
}
async function sgRunValidation() {
  if (!loadedModels.some((m) => !!m)) {
    log("SG Validate: no model loaded");
    return;
  }
  document.getElementById("sgRunBtn").disabled = true;
  document.getElementById("sgRunBtn").textContent = "\u23F3 Validating\u2026";
  document.getElementById("sgRulesList").innerHTML = '<div class="sg-empty">Scanning model entities & resolving property sets\u2026</div>';
  await new Promise((r) => setTimeout(r, 10));
  try {
    const ctx = await sgBuildContext();
    const ruleResults = [];
    const enabledRules = SG_ACTIVE_RULES.filter((r) => r.gateway.includes(sgState.gateway));
    let totalFindings = 0;
    const elementsWithIssues = /* @__PURE__ */ new Set();
    for (const rule of enabledRules) {
      try {
        const r = rule.check(ctx);
        for (const f of r.failed || []) {
          if (f.eid && f.modelIdx === void 0) {
            const ent = ctx.entities.find((e) => e.eid === f.eid);
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
        for (const f of r.failed || []) if (f.eid) elementsWithIssues.add(f.eid);
      } catch (err) {
        log("SG rule error:", rule.id, err?.message);
        ruleResults.push({
          rule,
          passed: [],
          failed: [{ eid: 0, name: "(error)", reason: "Rule execution failed: " + err?.message }],
          skipped: 0
        });
      }
    }
    const stats = {
      rules: ruleResults.length,
      pass: ruleResults.filter((r) => r.failed.length === 0 && r.passed.length > 0).length,
      fail: ruleResults.filter((r) => r.failed.length > 0 && r.rule.severity === "error").length,
      warn: ruleResults.filter((r) => r.failed.length > 0 && r.rule.severity === "warn").length,
      skipped: ruleResults.filter((r) => r.skipped > 0 && r.passed.length === 0 && r.failed.length === 0).length,
      elements: ctx.entities.length,
      badElements: elementsWithIssues.size,
      findings: totalFindings,
      gateway: sgState.gateway
    };
    sgState.results = { rules: ruleResults, stats };
    sgRenderResults();
  } catch (err) {
    log("SG validation error:", err?.message);
    document.getElementById("sgRulesList").innerHTML = `<div class="sg-empty" style="color:#D05050">Error: ${err?.message || err}</div>`;
  } finally {
    document.getElementById("sgRunBtn").disabled = false;
    document.getElementById("sgRunBtn").textContent = "\u25B6 Validate";
  }
}
window.sgRunValidation = sgRunValidation;
function sgRenderResults() {
  if (!sgState.results) {
    return;
  }
  const { rules, stats } = sgState.results;
  const byAgency = /* @__PURE__ */ new Map();
  for (let i = 0; i < rules.length; i++) {
    const a = rules[i].rule.agency;
    if (!byAgency.has(a)) byAgency.set(a, []);
    byAgency.get(a).push({ ...rules[i], idx: i });
  }
  let html = "";
  const AGENCY_ORDER = ["GENERAL", "BCA", "URA", "NEA", "LTA", "PUB"];
  for (const ag of AGENCY_ORDER) {
    if (!byAgency.has(ag)) continue;
    const items = byAgency.get(ag);
    const passCnt = items.filter((r) => r.failed.length === 0 && r.passed.length > 0).length;
    const failCnt = items.filter((r) => r.failed.length > 0).length;
    html += `<div class="sg-rule-group">${ag} \u2014 ${passCnt} pass / ${failCnt} fail / ${items.length} total</div>`;
    for (const item of items) {
      const { rule, passed, failed, skipped, idx } = item;
      let icon, iconCls;
      if (failed.length === 0 && passed.length > 0) {
        icon = "\u2713";
        iconCls = "pass";
      } else if (failed.length === 0 && skipped > 0) {
        icon = "\u2298";
        iconCls = "skip";
      } else if (rule.severity === "error") {
        icon = "\u2717";
        iconCls = "fail";
      } else if (rule.severity === "warn") {
        icon = "!";
        iconCls = "warn";
      } else {
        icon = "\u24D8";
        iconCls = "warn";
      }
      const sel = sgState.selectedRuleIdx === idx ? "selected" : "";
      html += `<div class="sg-rule ${sel}" onclick="sgSelectRule(${idx})" title="${escapeHtml(rule.desc)}">
        <span class="sg-rule-icon ${iconCls}">${icon}</span>
        <div class="sg-rule-content">
          <div class="sg-rule-title">${escapeHtml(rule.title)}</div>
          <div class="sg-rule-counts">
            <span class="pass-n">${passed.length} pass</span>
            ${failed.length > 0 ? ` \u2022 <span class="fail-n">${failed.length} fail</span>` : ""}
            ${skipped > 0 ? ` \u2022 <span style="color:#8B8680">${skipped} skip</span>` : ""}
          </div>
        </div>
      </div>`;
    }
  }
  document.getElementById("sgRulesList").innerHTML = html;
  document.getElementById("sgRuleCount").textContent = rules.length;
  document.getElementById("sgRuleCount").className = "sg-col-hdr-count " + (stats.fail === 0 ? "ok" : "");
  const pct = stats.rules === 0 ? 0 : Math.round(stats.pass / stats.rules * 100);
  const pctEl = document.getElementById("sgPctValue");
  pctEl.textContent = pct + "%";
  pctEl.className = "sg-dash-pct " + (pct >= 90 ? "good" : pct >= 60 ? "warn" : "fail");
  document.getElementById("sgStatRules").textContent = stats.rules;
  document.getElementById("sgStatPass").textContent = stats.pass;
  document.getElementById("sgStatFail").textContent = stats.fail;
  document.getElementById("sgStatWarn").textContent = stats.warn;
  document.getElementById("sgStatElements").textContent = stats.elements;
  document.getElementById("sgStatBadEl").textContent = stats.badElements;
  document.getElementById("sgStatFindings").textContent = stats.findings;
  document.getElementById("sgExportPDF").disabled = false;
  document.getElementById("sgExportBCF").disabled = false;
  if (sgState.selectedRuleIdx === null) {
    const firstFailIdx = rules.findIndex((r) => r.failed.length > 0);
    if (firstFailIdx >= 0) sgSelectRule(firstFailIdx);
  } else {
    sgSelectRule(sgState.selectedRuleIdx);
  }
}
window.sgSelectRule = function(idx) {
  if (!sgState.results) return;
  sgState.selectedRuleIdx = idx;
  document.querySelectorAll(".sg-rule").forEach((el) => el.classList.remove("selected"));
  const ruleEls = document.querySelectorAll(".sg-rule");
  const matching = Array.from(ruleEls).filter((el) => el.getAttribute("onclick")?.includes(`sgSelectRule(${idx})`));
  if (matching[0]) matching[0].classList.add("selected");
  const { rule, passed, failed, info } = sgState.results.rules[idx];
  document.getElementById("sgFailColTitle").textContent = rule.title;
  document.getElementById("sgFailCount").textContent = failed.length;
  document.getElementById("sgFailCount").className = "sg-col-hdr-count " + (failed.length === 0 ? "ok" : "");
  if (info) {
    document.getElementById("sgFailList").innerHTML = `<div class="sg-empty" style="color:#0369a1"><b>Info:</b> ${escapeHtml(info)}</div>`;
    return;
  }
  if (failed.length === 0) {
    document.getElementById("sgFailList").innerHTML = `<div class="sg-empty" style="color:#16a34a">\u2713 All ${passed.length} elements pass this rule</div>`;
    return;
  }
  let html = "";
  for (const f of failed) {
    html += `<div class="sg-fail-item" onclick="sgFocusElement(${f.eid})">
      <span class="sg-fail-eid">#${f.eid || "-"}</span>
      <div class="sg-fail-content">
        <div class="sg-fail-name">${escapeHtml(f.name || "(unnamed)")}</div>
        <div class="sg-fail-detail">${escapeHtml(f.reason || "")}</div>
      </div>
    </div>`;
  }
  document.getElementById("sgFailList").innerHTML = html;
};
window.sgFocusElement = function(eid) {
  if (!eid) return;
  for (let mi = 0; mi < loadedModels.length; mi++) {
    const m = loadedModels[mi];
    if (!m) continue;
    try {
      if (!window._hlMat) {
        window._hlMat = new THREE.MeshPhongMaterial({
          color: 2450411,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          depthTest: true,
          clippingPlanes: clipPlanes
        });
      }
      const sub = ifcLoader.ifcManager.createSubset({
        modelID: m.modelID,
        ids: [eid],
        material: window._hlMat,
        scene,
        removePrevious: true
      });
      if (sub) {
        sub.position.copy(m.position);
        sub.updateMatrixWorld(true);
        window._lastHL = { subset: sub, mid: m.modelID };
        const bbox = new THREE.Box3().setFromObject(sub);
        if (bbox.min.x !== Infinity) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const elSize = Math.max(size.x, size.y, size.z);
          const viewDist = Math.max(elSize * 1.5, 5);
          camera.position.set(
            center.x + viewDist * 0.7,
            center.y + viewDist * 0.5,
            center.z + viewDist * 0.7
          );
          controls.target.copy(center);
          controls.update();
        }
        ifcLoader.ifcManager.getItemProperties(m.modelID, eid, true).then((props) => window.showProps && window.showProps(props, mi)).catch(() => {
        });
        if (window.requestPlanRender) window.requestPlanRender();
        return;
      }
    } catch (err) {
    }
  }
  log("SG focus: element", eid, "not found in loaded models");
};
window.sgChangeGateway = function() {
  sgState.gateway = document.getElementById("sgGateway").value;
  sgState.cachedCtx = null;
  sgState.results = null;
  sgState.selectedRuleIdx = null;
  document.getElementById("sgRulesList").innerHTML = '<div class="sg-empty">Click <b>\u25B6 Validate</b> to run rules for the new gateway</div>';
  document.getElementById("sgFailList").innerHTML = '<div class="sg-empty">Select a rule on the left to see failing elements</div>';
  document.getElementById("sgPctValue").textContent = "\u2014";
  document.getElementById("sgPctValue").className = "sg-dash-pct";
  ["sgStatRules", "sgStatPass", "sgStatFail", "sgStatWarn", "sgStatElements", "sgStatBadEl", "sgStatFindings"].forEach((id) => document.getElementById(id).textContent = "0");
  document.getElementById("sgExportPDF").disabled = true;
  document.getElementById("sgExportBCF").disabled = true;
};
window.toggleSGCheckPanel = function() {
  const panel = document.getElementById("sgPanel");
  const btn = document.getElementById("btnSGCheck");
  sgState.open = !sgState.open;
  btn.classList.toggle("active", sgState.open);
  if (sgState.open) {
    if (clashMode) toggleClashMode();
    panel.classList.add("show");
    const br = document.getElementById("bresize");
    if (br) br.style.display = "";
    if (window._vpResize) window._vpResize();
  } else {
    panel.classList.remove("show");
    if (!clashMode) {
      const br = document.getElementById("bresize");
      if (br) br.style.display = "none";
    }
    if (window._vpResize) window._vpResize();
  }
};
window.sgExportReport = async function() {
  if (!sgState.results) {
    log("SG: no results to export");
    return;
  }
  try {
    if (!window.jspdf) {
      const mod = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
      window.jspdf = mod;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 15;
    let y = M;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CORENET X / IFC-SG Validation Report", M, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text((/* @__PURE__ */ new Date()).toLocaleString("en-SG"), M, 17);
    y = 32;
    doc.setTextColor(15, 23, 42);
    const s = sgState.results.stats;
    const pct = s.rules === 0 ? 0 : Math.round(s.pass / s.rules * 100);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Compliance: ${pct}% (${s.pass}/${s.rules} rules passing)`, M, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gateway: ${s.gateway.toUpperCase()}  \u2022  Elements scanned: ${s.elements}  \u2022  Findings: ${s.findings}`, M, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Rule results:", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const r of sgState.results.rules) {
      if (y > 270) {
        doc.addPage();
        y = M;
      }
      const icon = r.failed.length === 0 && r.passed.length > 0 ? "[PASS]" : r.failed.length > 0 ? "[FAIL]" : "[SKIP]";
      const color = r.failed.length === 0 && r.passed.length > 0 ? [22, 163, 74] : r.failed.length > 0 ? [220, 38, 38] : [156, 163, 175];
      doc.setTextColor(...color);
      doc.text(icon, M, y);
      doc.setTextColor(15, 23, 42);
      doc.text(`${r.rule.id}  ${r.rule.title}`, M + 12, y);
      doc.setTextColor(100, 116, 139);
      doc.text(`${r.passed.length} pass / ${r.failed.length} fail`, W - M - 35, y);
      doc.setTextColor(15, 23, 42);
      y += 4;
      if (r.failed.length > 0) {
        const sample = r.failed.slice(0, 3);
        for (const f of sample) {
          if (y > 275) {
            doc.addPage();
            y = M;
          }
          doc.setTextColor(220, 38, 38);
          doc.text(`  \xB7 #${f.eid} ${(f.name || "").substring(0, 30)} \u2014 ${(f.reason || "").substring(0, 55)}`, M + 4, y);
          doc.setTextColor(15, 23, 42);
          y += 3.5;
        }
        if (r.failed.length > 3) {
          doc.setTextColor(100, 116, 139);
          doc.text(`  \xB7 \u2026and ${r.failed.length - 3} more`, M + 4, y);
          doc.setTextColor(15, 23, 42);
          y += 3.5;
        }
      }
      y += 1;
    }
    doc.addPage();
    y = M;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Disclaimer", M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const disclaimer = "This validation is a pre-submission helper based on a subset of CORENET X IFC+SG rules. The official validator is the CORENET X portal at info.corenet.gov.sg. Always cross-check with the latest BCA Industry Mapping Excel before submission. IFC Delta and DQT BIM team accept no liability for submissions rejected based on this report.";
    const lines = doc.splitTextToSize(disclaimer, W - 2 * M);
    doc.text(lines, M, y);
    doc.save(`IFC-SG_Validation_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`);
    log("SG: PDF report saved");
  } catch (err) {
    log("SG PDF export err:", err?.message);
    alert("PDF export failed: " + err?.message);
  }
};
window.sgExportBCF = async function() {
  if (!sgState.results) {
    return;
  }
  const issues = [];
  for (const r of sgState.results.rules) {
    if (r.failed.length === 0) continue;
    for (const f of r.failed) {
      if (!f.eid || f.eid === 0) continue;
      issues.push({
        title: `[${r.rule.id}] ${r.rule.title}`,
        desc: `${r.rule.desc}

Element: ${f.name}
Finding: ${f.reason}
Agency: ${r.rule.agency}
Severity: ${r.rule.severity}`,
        eid: f.eid,
        name: f.name || "",
        reason: f.reason || "",
        severity: r.rule.severity,
        agency: r.rule.agency,
        ruleId: r.rule.id,
        modelIdx: f.modelIdx ?? 0
        // default to first model
      });
    }
  }
  if (issues.length === 0) {
    alert("No failures with element IDs to export.");
    return;
  }
  log(`SG BCF: exporting ${issues.length} failures\u2026`);
  const maxIssues = Math.min(issues.length, 200);
  if (!window.JSZip) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
    await new Promise((res, rej) => {
      s.onload = res;
      s.onerror = rej;
    });
  }
  const zip = new JSZip();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const pid = crypto.randomUUID();
  const mdlPos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < loadedModels.length; i++) {
    if (loadedModels[i]) {
      mdlPos.x = loadedModels[i].position.x;
      mdlPos.y = loadedModels[i].position.y;
      mdlPos.z = loadedModels[i].position.z;
      break;
    }
  }
  const threeToIfc = (x, y, z) => {
    const tx = x - mdlPos.x, ty = y - mdlPos.y, tz = z - mdlPos.z;
    return { x: tx, y: tz, z: -ty };
  };
  const saveCam = camera.position.clone();
  const saveTgt = controls.target.clone();
  zip.file("bcf.version", '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>');
  zip.file("project.bcfp", '<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Project ProjectId="' + pid + '"><Name>IFC-SG Validation</Name></Project></ProjectExtension>');
  let headerXml = "<Header>";
  for (let fi = 0; fi < files.length; fi++) {
    if (!files[fi]) continue;
    headerXml += '<File IfcProject="" IfcSpatialStructureElement="" isExternal="true"><Filename>' + escXml(files[fi].name) + "</Filename><Date>" + now + "</Date></File>";
  }
  headerXml += "</Header>";
  for (let i = 0; i < maxIssues; i++) {
    const iss = issues[i];
    const tid = crypto.randomUUID();
    const vid = crypto.randomUUID();
    let modelIdx = iss.modelIdx;
    if (!loadedModels[modelIdx]) {
      modelIdx = loadedModels.findIndex((m) => !!m);
      if (modelIdx < 0) continue;
    }
    const bbox = getElementBBox(modelIdx, iss.eid);
    const ifcCenter = bbox?.center ? threeToIfc(bbox.center.x, bbox.center.y, bbox.center.z) : { x: 0, y: 0, z: 0 };
    const ix = ifcCenter.x, iy = ifcCenter.y, iz = ifcCenter.z;
    const d = bbox ? Math.max(bbox.size.x, bbox.size.y, bbox.size.z) * 2 + 5 : 20;
    let snap64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BHgAIBwJ+Qil1RAAAAABJRU5ErkJggg==";
    if (bbox?.center) {
      camera.position.set(bbox.center.x + d * 0.4, bbox.center.y + d * 0.3, bbox.center.z + d * 0.4);
      controls.target.set(bbox.center.x, bbox.center.y, bbox.center.z);
      controls.update();
      let snapHL = null;
      try {
        const hlColor = iss.severity === "error" ? 14427686 : iss.severity === "warn" ? 14251782 : 2450411;
        const hlMat = new THREE.MeshPhongMaterial({ color: hlColor, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: true });
        const mid = loadedModels[modelIdx]?.modelID;
        if (mid !== void 0) {
          snapHL = ifcLoader.ifcManager.createSubset({ modelID: mid, ids: [iss.eid], material: hlMat, scene, removePrevious: false, customID: "sgBcfSnap" });
          if (snapHL) {
            snapHL.position.copy(loadedModels[modelIdx].position);
            snapHL.updateMatrixWorld(true);
          }
        }
      } catch (e) {
      }
      renderer.render(scene, camera);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      renderer.render(scene, camera);
      try {
        snap64 = renderer.domElement.toDataURL("image/png").split(",")[1];
      } catch (e) {
      }
      if (snapHL) {
        try {
          scene.remove(snapHL);
          snapHL.geometry?.dispose();
        } catch (e) {
        }
      }
    }
    let desc = `[${iss.ruleId}] ${iss.title}

${iss.reason}`;
    if (iss.name) desc += `
Element: ${iss.name}`;
    desc += `
Agency: ${iss.agency} | Severity: ${iss.severity}`;
    if (bbox?.center) desc += `
Position: (${ix.toFixed(2)}, ${iy.toFixed(2)}, ${iz.toFixed(2)})`;
    const rawSx = bbox ? bbox.size.x / 2 : 5;
    const rawSy = bbox ? bbox.size.z / 2 : 5;
    const rawSz = bbox ? bbox.size.y / 2 : 5;
    const elMax = Math.max(rawSx, rawSy, rawSz);
    const pad = Math.max(2, elMax * 1.5);
    const sx = rawSx + pad, sy = rawSy + pad, sz = rawSz + pad;
    const clips = "<ClippingPlanes><ClippingPlane><Location><X>" + (ix + sx).toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + (ix - sx).toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>-1</X><Y>0</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + (iy + sy).toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + (iy - sy).toFixed(6) + "</Y><Z>" + iz.toFixed(6) + "</Z></Location><Direction><X>0</X><Y>-1</Y><Z>0</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + (iz + sz).toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>1</Z></Direction></ClippingPlane><ClippingPlane><Location><X>" + ix.toFixed(6) + "</X><Y>" + iy.toFixed(6) + "</Y><Z>" + (iz - sz).toFixed(6) + "</Z></Location><Direction><X>0</X><Y>0</Y><Z>-1</Z></Direction></ClippingPlane></ClippingPlanes>";
    const viewR = Math.max(sx, sy, sz) * 1.8 + 3;
    const camX = ix + viewR * 0.55, camY = iy - viewR * 0.75, camZ = iz + viewR * 0.45;
    const ddx = ix - camX, ddy = iy - camY, ddz = iz - camZ;
    const ln = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    const col = iss.severity === "error" ? "FFDC2626" : iss.severity === "warn" ? "FFD97706" : "FF2563EB";
    let gid = "";
    try {
      const mid = loadedModels[modelIdx]?.modelID;
      if (mid !== void 0) {
        const props = await ifcLoader.ifcManager.getItemProperties(mid, iss.eid, false);
        gid = props?.GlobalId?.value || "";
      }
    } catch (e) {
    }
    const compXml = gid ? '<Component IfcGuid="' + escXml(gid) + '"><OriginatingSystem>IFC-SG Validator</OriginatingSystem></Component>' : '<Component IfcGuid="' + escXml(tid.substring(0, 22)) + '"><OriginatingSystem>IFC-SG Validator</OriginatingSystem></Component>';
    const topicType = iss.severity === "error" ? "Error" : iss.severity === "warn" ? "Warning" : "Information";
    zip.file(
      tid + "/markup.bcf",
      '<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' + headerXml + '\n<Topic Guid="' + tid + '" TopicType="' + topicType + '" TopicStatus="Active"><Title>' + escXml(iss.title) + "</Title><Description>" + escXml(desc) + "</Description><CreationDate>" + now + "</CreationDate><CreationAuthor>IFC Delta SG Validator</CreationAuthor><ModifiedDate>" + now + "</ModifiedDate><Labels><Label>IFC-SG</Label><Label>" + escXml(iss.agency) + "</Label><Label>" + escXml(iss.severity) + '</Label></Labels></Topic>\n<Comment Guid="' + crypto.randomUUID() + '"><Date>' + now + "</Date><Author>IFC Delta</Author><Comment>" + escXml(iss.reason) + '</Comment><Viewpoint Guid="' + vid + '"/></Comment>\n<Viewpoints Guid="' + vid + '"><Viewpoint>viewpoint.bcfv</Viewpoint><Snapshot>snapshot.png</Snapshot></Viewpoints>\n</Markup>'
    );
    zip.file(
      tid + "/viewpoint.bcfv",
      '<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="' + vid + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<Components><Selection>' + compXml + '</Selection><Visibility DefaultVisibility="true"><Exceptions/></Visibility><Coloring><Color Color="' + col + '">' + compXml + "</Color></Coloring></Components>\n<PerspectiveCamera><CameraViewPoint><X>" + camX.toFixed(6) + "</X><Y>" + camY.toFixed(6) + "</Y><Z>" + camZ.toFixed(6) + "</Z></CameraViewPoint><CameraDirection><X>" + (ddx / ln).toFixed(6) + "</X><Y>" + (ddy / ln).toFixed(6) + "</Y><Z>" + (ddz / ln).toFixed(6) + "</Z></CameraDirection><CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector><FieldOfView>60</FieldOfView></PerspectiveCamera>\n" + clips + "\n</VisualizationInfo>"
    );
    zip.file(tid + "/snapshot.png", snap64, { base64: true });
  }
  camera.position.copy(saveCam);
  controls.target.copy(saveTgt);
  controls.update();
  renderer.render(scene, camera);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ifc-sg-validation.bcf";
  a.click();
  URL.revokeObjectURL(a.href);
  log(`SG BCF exported: ${maxIssues} issues` + (issues.length > maxIssues ? ` (${issues.length - maxIssues} truncated)` : ""));
};
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const GD_CONFIG = {
  CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID_HERE",
  SCOPES: "https://www.googleapis.com/auth/drive.readonly",
  ROOT_FOLDER: "IFC-Projects"
};
let _gdToken = null;
let _gdUser = null;
let _gdCurrentFolder = null;
let _gdFolderStack = [];
let _odExpanded = false;
let _gdTokenClient = null;
window.odToggle = function() {
  _odExpanded = !_odExpanded;
  document.getElementById("odBody").classList.toggle("show", _odExpanded);
};
function odUpdateBadge(state) {
  const b = document.getElementById("odBadge");
  b.textContent = state === "on" ? "connected" : "offline";
  b.classList.toggle("on", state === "on");
}
window.gdLogin = function() {
  if (GD_CONFIG.CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID_HERE") {
    alert("Google Drive not configured.\n\n1. Go to console.cloud.google.com\n2. Create project \u2192 Enable Google Drive API\n3. Credentials \u2192 Create OAuth 2.0 Client ID\n4. Authorized JS origins: https://gjnz106.github.io\n5. Open this HTML \u2192 search GD_CONFIG\n6. Replace YOUR_GOOGLE_CLIENT_ID_HERE");
    return;
  }
  if (!_gdTokenClient) {
    _gdTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GD_CONFIG.CLIENT_ID,
      scope: GD_CONFIG.SCOPES,
      callback: (resp) => {
        if (resp.error) {
          log("GDrive auth error:", resp.error);
          return;
        }
        _gdToken = resp.access_token;
        odUpdateBadge("on");
        gdGetUserInfo();
        gdBrowseRoot();
      }
    });
  }
  _gdTokenClient.requestAccessToken();
};
async function gdGetUserInfo() {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { "Authorization": "Bearer " + _gdToken } });
    _gdUser = await r.json();
    log("GDrive: signed in as " + _gdUser.name);
  } catch (e) {
  }
}
async function gdFetch(url) {
  const r = await fetch(url, { headers: { "Authorization": "Bearer " + _gdToken } });
  if (r.status === 401) {
    _gdTokenClient.requestAccessToken();
    return null;
  }
  return r;
}
async function gdBrowseRoot() {
  const content = document.getElementById("odContent");
  content.innerHTML = '<div class="od-loading">Loading\u2026</div>';
  try {
    const q = `name='${GD_CONFIG.ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const r = await gdFetch("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)");
    const data = await r.json();
    let rootId;
    if (data.files && data.files.length > 0) {
      rootId = data.files[0].id;
    } else {
      const cr = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { "Authorization": "Bearer " + _gdToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name: GD_CONFIG.ROOT_FOLDER, mimeType: "application/vnd.google-apps.folder" })
      });
      const cf = await cr.json();
      rootId = cf.id;
    }
    _gdFolderStack = [{ id: rootId, name: GD_CONFIG.ROOT_FOLDER }];
    _gdCurrentFolder = { id: rootId, name: GD_CONFIG.ROOT_FOLDER };
    await gdBrowseFolder(rootId);
  } catch (e) {
    content.innerHTML = '<div class="od-status" style="color:var(--red)">Error: ' + escapeHtml(e.message) + "</div>";
  }
}
async function gdBrowseFolder(folderId) {
  const content = document.getElementById("odContent");
  content.innerHTML = '<div class="od-loading">Loading\u2026</div>';
  try {
    const q = "'" + folderId + "' in parents and trashed=false";
    const r = await gdFetch("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name,size,mimeType,modifiedTime)&orderBy=folder,name&pageSize=100");
    const data = await r.json();
    const items = data.files || [];
    let bcHtml = '<div class="od-breadcrumb">';
    _gdFolderStack.forEach((p, i) => {
      if (i > 0) bcHtml += '<span class="od-crumb-sep">\u203A</span>';
      bcHtml += '<span class="od-crumb" onclick="gdNavigateTo(' + i + ')">' + escapeHtml(p.name) + "</span>";
    });
    bcHtml += "</div>";
    let listHtml = '<div class="od-file-list">';
    const folders = items.filter((i) => i.mimeType === "application/vnd.google-apps.folder");
    const fls = items.filter((i) => i.mimeType !== "application/vnd.google-apps.folder");
    for (const f of folders) {
      listHtml += `<div class="od-file" onclick="gdOpenFolder('` + f.id + "','" + escapeHtml(f.name) + `')"><span class="od-file-icon">\u{1F4C1}</span><span class="od-file-name">` + escapeHtml(f.name) + "</span></div>";
    }
    for (const f of fls) {
      const isIfc = f.name.toLowerCase().endsWith(".ifc");
      const sz = f.size ? Number(f.size) < 1048576 ? (Number(f.size) / 1024).toFixed(0) + "KB" : (Number(f.size) / 1048576).toFixed(1) + "MB" : "";
      listHtml += '<div class="od-file" ' + (isIfc ? `ondblclick="gdLoadFile('` + f.id + "','" + escapeHtml(f.name) + `')"` : "") + '><span class="od-file-icon">' + (isIfc ? "\u{1F4D0}" : "\u{1F4C4}") + '</span><span class="od-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</span><span class="od-file-size">' + sz + "</span>" + (isIfc ? `<button class="od-file-load" onclick="event.stopPropagation();gdLoadFile('` + f.id + "','" + escapeHtml(f.name) + `')">Load</button>` : "") + "</div>";
    }
    if (items.length === 0) listHtml += '<div class="od-status">Empty folder</div>';
    listHtml += "</div>";
    const userHtml = '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-bottom:4px"><span class="od-status">\u2601\uFE0F ' + escapeHtml(_gdUser?.name || "Connected") + `</span><button style="font-size:9px;border:none;background:none;color:var(--text-muted);cursor:pointer;font-family:'JetBrains Mono'" onclick="gdLogout()">Sign out</button></div>`;
    content.innerHTML = userHtml + bcHtml + listHtml;
  } catch (e) {
    content.innerHTML = '<div class="od-status" style="color:var(--red)">Error: ' + escapeHtml(e.message) + "</div>";
  }
}
window.gdOpenFolder = function(folderId, folderName) {
  _gdFolderStack.push({ id: folderId, name: folderName });
  _gdCurrentFolder = { id: folderId, name: folderName };
  gdBrowseFolder(folderId);
};
window.gdNavigateTo = function(idx) {
  _gdFolderStack = _gdFolderStack.slice(0, idx + 1);
  _gdCurrentFolder = _gdFolderStack[idx];
  gdBrowseFolder(_gdCurrentFolder.id);
};
window.gdLoadFile = async function(fileId, fileName) {
  const content = document.getElementById("odContent");
  const origHtml = content.innerHTML;
  content.innerHTML = '<div class="od-loading">\u23F3 Downloading ' + escapeHtml(fileName) + "\u2026</div>";
  try {
    const r = await gdFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
    if (!r || !r.ok) throw new Error("Download failed");
    const blob = await r.blob();
    content.innerHTML = '<div class="od-loading">\u23F3 Loading into viewer\u2026</div>';
    const file = new File([blob], fileName, { type: "application/octet-stream" });
    let targetSlot = -1;
    if (!loadedModels[0]) targetSlot = 0;
    else if (!loadedModels[1]) targetSlot = 1;
    else {
      targetSlot = fedNextSlot;
      fedNextSlot++;
    }
    files[targetSlot] = file;
    if (targetSlot < 2) {
      const uc = document.getElementById("uc" + targetSlot);
      if (uc) uc.classList.add("loaded");
      const fn = document.getElementById("fn" + targetSlot);
      if (fn) fn.textContent = fileName;
      const fs2 = document.getElementById("fs" + targetSlot);
      if (fs2) fs2.textContent = (blob.size / 1048576).toFixed(1) + " MB";
    }
    if (!ifcLoader) {
      if (!await initIFC()) {
        throw new Error("IFC init failed");
      }
    }
    await loadIFC(targetSlot);
    if (targetSlot >= 2) fedRenderSlots();
    log("GDrive: " + fileName + " loaded into slot " + targetSlot);
    content.innerHTML = origHtml;
  } catch (e) {
    log("GDrive load err:", e.message);
    content.innerHTML = origHtml;
    alert("Failed to load: " + e.message);
  }
};
window.gdLogout = function() {
  if (_gdToken) try {
    google.accounts.oauth2.revoke(_gdToken);
  } catch (e) {
  }
  _gdToken = null;
  _gdUser = null;
  odUpdateBadge("offline");
  document.getElementById("odContent").innerHTML = '<button class="od-login-btn" onclick="gdLogin()" style="border-color:#4285f4;color:#4285f4;background:rgba(66,133,244,.06)"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Sign in with Google</button><div class="od-status">Connect Google Drive to browse IFC files</div>';
};
let _searchCache = null;
let _searchResults = [];
let _searchTimer = null;
let _searchSelectedIdx = -1;
async function searchBuildCache() {
  const key = loadedModels.map((m) => m?.modelID).join("-");
  if (_searchCache && _searchCache.key === key) return _searchCache;
  const elements = [];
  const typeSet = /* @__PURE__ */ new Set();
  const propNameSet = /* @__PURE__ */ new Set();
  for (let mi = 0; mi < loadedModels.length; mi++) {
    const m = loadedModels[mi];
    if (!m) continue;
    const props = await getAllProps(m.modelID);
    const mgr = ifcLoader?.ifcManager;
    const api = mgr?.state?.api;
    const psetLookup = /* @__PURE__ */ new Map();
    if (api) {
      try {
        const relIDs = api.GetLineIDsWithType(m.modelID, 4186316022);
        for (let ri = 0; ri < relIDs.size(); ri++) {
          try {
            const rel = await mgr.getItemProperties(m.modelID, relIDs.get(ri), false);
            if (!rel?.RelatingPropertyDefinition) continue;
            const pdefID = rel.RelatingPropertyDefinition.value ?? rel.RelatingPropertyDefinition;
            if (typeof pdefID !== "number") continue;
            let relatedEIDs = [];
            if (Array.isArray(rel.RelatedObjects)) relatedEIDs = rel.RelatedObjects.map((o) => o.value ?? o).filter((v) => typeof v === "number");
            else if (rel.RelatedObjects?.value) relatedEIDs = [rel.RelatedObjects.value];
            let pset;
            try {
              pset = await mgr.getItemProperties(m.modelID, pdefID, true);
            } catch (e) {
              continue;
            }
            if (!pset) continue;
            for (const eid of relatedEIDs) {
              if (!psetLookup.has(eid)) psetLookup.set(eid, []);
              psetLookup.get(eid).push(pset);
            }
          } catch (e) {
          }
        }
      } catch (e) {
      }
    }
    for (const gid in props) {
      const p = props[gid];
      const typeName = IFC_NAMES[p.type] || sgIfcCodeToClass(p.type);
      typeSet.add(typeName);
      const psets = psetLookup.get(p.expressID) || [];
      const propMap = /* @__PURE__ */ new Map();
      for (const ps of psets) {
        const psetName = ps.Name?.value || "";
        const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : ps.HasProperties ? [ps.HasProperties] : [];
        for (const hp of hps) {
          if (!hp?.Name?.value) continue;
          const pn = hp.Name.value;
          propNameSet.add(pn);
          const nv = hp.NominalValue;
          propMap.set(pn, { value: nv?.value ?? nv ?? null, psetName });
        }
        const qs = Array.isArray(ps.Quantities) ? ps.Quantities : ps.Quantities ? [ps.Quantities] : [];
        for (const q of qs) {
          if (!q?.Name?.value) continue;
          propNameSet.add(q.Name.value);
          const val = q.LengthValue?.value ?? q.AreaValue?.value ?? q.VolumeValue?.value ?? q.CountValue?.value ?? null;
          propMap.set(q.Name.value, { value: val, psetName: ps.Name?.value || "" });
        }
      }
      elements.push({
        eid: p.expressID,
        globalId: gid,
        name: (p.name || "").trim(),
        type: typeName,
        typeCode: p.type,
        tag: p.tag || "",
        modelIdx: mi,
        modelID: m.modelID,
        props: propMap,
        // Searchable text: concatenate name + type + tag + all prop values
        _text: [p.name || "", typeName, p.tag || "", ...Array.from(propMap.values()).map((v) => String(v.value || ""))].join(" ").toLowerCase()
      });
    }
  }
  _searchCache = {
    elements,
    propNames: Array.from(propNameSet).sort(),
    typeNames: Array.from(typeSet).sort(),
    key
  };
  log(`Search cache: ${elements.length} elements, ${propNameSet.size} property names, ${typeSet.size} types`);
  return _searchCache;
}
async function searchInit() {
  if (!loadedModels.some((m) => !!m)) {
    document.getElementById("searchStatsText").textContent = "Load a model to search";
    return;
  }
  document.getElementById("searchStatsText").textContent = "\u23F3 Building search index\u2026";
  await new Promise((r) => setTimeout(r, 10));
  const cache = await searchBuildCache();
  const sel = document.getElementById("searchTypeFilter");
  const curVal = sel.value;
  sel.innerHTML = '<option value="">All types (' + cache.typeNames.length + ")</option>";
  for (const t of cache.typeNames) {
    sel.innerHTML += '<option value="' + escapeHtml(t) + '">' + t.replace("Ifc", "") + "</option>";
  }
  sel.value = curVal;
  const dl = document.getElementById("searchPropList");
  dl.innerHTML = cache.propNames.slice(0, 200).map((n) => '<option value="' + escapeHtml(n) + '">').join("");
  document.getElementById("searchStatsText").textContent = cache.elements.length + " elements indexed";
}
function searchDebounce() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(searchRun, 250);
}
async function searchRun() {
  if (!_searchCache) await searchBuildCache();
  if (!_searchCache) return;
  const query = (document.getElementById("searchInput").value || "").trim().toLowerCase();
  const typeFilter = document.getElementById("searchTypeFilter").value;
  const advProp = (document.getElementById("searchAdvProp").value || "").trim();
  const advOp = document.getElementById("searchAdvOp").value;
  const advVal = (document.getElementById("searchAdvVal").value || "").trim();
  const advActive = document.getElementById("searchAdv").classList.contains("show") && advProp;
  const chips = document.querySelectorAll("#searchPanel .search-chip");
  const missingMode = chips[0]?.classList.contains("on");
  const hasMode = chips[1]?.classList.contains("on");
  const chipProp = missingMode || hasMode ? advProp : "";
  let results = _searchCache.elements;
  if (query) {
    const terms = query.split(/\s+/);
    results = results.filter((e) => terms.every((t) => e._text.includes(t)));
  }
  if (typeFilter) {
    results = results.filter((e) => e.type === typeFilter);
  }
  if (chipProp && (missingMode || hasMode)) {
    results = results.filter((e) => {
      const has = e.props.has(chipProp);
      const val = e.props.get(chipProp)?.value;
      const hasValue = has && val !== null && val !== void 0 && val !== "";
      return missingMode ? !hasValue : hasValue;
    });
  }
  if (advActive && !missingMode && !hasMode) {
    results = results.filter((e) => {
      const p = e.props.get(advProp);
      const val = p?.value;
      switch (advOp) {
        case "exists":
          return val !== null && val !== void 0 && val !== "";
        case "empty":
          return val === null || val === void 0 || val === "";
        case "eq":
          return String(val).toLowerCase() === advVal.toLowerCase();
        case "neq":
          return String(val).toLowerCase() !== advVal.toLowerCase();
        case "contains":
          return String(val || "").toLowerCase().includes(advVal.toLowerCase());
        case "gt":
          return Number(val) > Number(advVal);
        case "lt":
          return Number(val) < Number(advVal);
        case "gte":
          return Number(val) >= Number(advVal);
        case "lte":
          return Number(val) <= Number(advVal);
        default:
          return true;
      }
    });
  }
  _searchResults = results;
  _searchSelectedIdx = -1;
  searchRenderResults();
}
function searchRenderResults() {
  const container = document.getElementById("searchResults");
  const statsText = document.getElementById("searchStatsText");
  const countBadge = document.getElementById("searchCount");
  const actionsBar = document.getElementById("searchActions");
  const total = _searchCache?.elements?.length || 0;
  const count = _searchResults.length;
  statsText.textContent = count + " / " + total + " elements";
  countBadge.textContent = count;
  countBadge.style.display = count > 0 ? "" : "none";
  actionsBar.style.display = count > 0 ? "" : "none";
  const maxShow = Math.min(count, 500);
  let html = "";
  for (let i = 0; i < maxShow; i++) {
    const e = _searchResults[i];
    const shortType = e.type.replace("Ifc", "");
    const tagHtml = e.tag ? '<span class="search-item-tag">#' + escapeHtml(e.tag) + "</span>" : "";
    html += `<div class="search-item" onclick="searchSelect(${i})" data-idx="${i}">
      <div class="search-item-name">${escapeHtml(e.name || "(unnamed)")}</div>
      <div class="search-item-meta"><span>${shortType}</span>${tagHtml}<span style="opacity:.5">M${e.modelIdx}</span></div>
    </div>`;
  }
  if (count > maxShow) html += `<div class="search-item" style="text-align:center;color:var(--text-muted);font-size:10px">\u2026 and ${count - maxShow} more (narrow your search)</div>`;
  if (count === 0) html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">No elements match</div>';
  container.innerHTML = html;
}
window.searchSelect = async function(idx) {
  if (idx < 0 || idx >= _searchResults.length) return;
  _searchSelectedIdx = idx;
  const e = _searchResults[idx];
  document.querySelectorAll(".search-item").forEach((el, i) => el.classList.toggle("selected", i === idx));
  if (!loadedModels[e.modelIdx]) return;
  const modelID = loadedModels[e.modelIdx].modelID;
  try {
    const props = await ifcLoader.ifcManager.getItemProperties(modelID, e.eid, true);
    if (props) showProps(props, e.modelIdx);
  } catch (err) {
  }
  try {
    clearHighlight();
    if (!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({ color: 2450411, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: clipPlanes });
    const sub = ifcLoader.ifcManager.createSubset({ modelID, ids: [e.eid], material: window._hlMat, scene, removePrevious: true, customID: "userHighlight" });
    if (sub) {
      sub.position.copy(loadedModels[e.modelIdx].position);
      sub.updateMatrixWorld(true);
      window._lastHL = { subset: sub, mid: modelID };
    }
  } catch (err) {
  }
  const bbox = getElementBBox(e.modelIdx, e.eid);
  if (bbox?.center) {
    const size = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
    const d = Math.max(size * 2.5, 3);
    camera.position.set(bbox.center.x + d * 0.5, bbox.center.y + d * 0.4, bbox.center.z + d * 0.5);
    controls.target.copy(bbox.center);
    controls.update();
  }
};
window.searchIsolateAll = function() {
  if (!_searchResults.length) return;
  forEachModel((model) => {
    model.traverse((c) => {
      if (c.isMesh) c.visible = false;
    });
  });
  const byModel = /* @__PURE__ */ new Map();
  for (const e of _searchResults) {
    if (!byModel.has(e.modelIdx)) byModel.set(e.modelIdx, []);
    byModel.get(e.modelIdx).push(e.eid);
  }
  for (const [mi, eids] of byModel) {
    if (!loadedModels[mi]) continue;
    try {
      const mat = new THREE.MeshPhongMaterial({ color: 2278750, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: true, clippingPlanes: clipPlanes });
      const sub = ifcLoader.ifcManager.createSubset({ modelID: loadedModels[mi].modelID, ids: eids, material: mat, scene, removePrevious: false, customID: "searchIsolate_" + mi });
      if (sub) {
        sub.position.copy(loadedModels[mi].position);
        sub.updateMatrixWorld(true);
      }
    } catch (e) {
    }
  }
  document.getElementById("btnShowAll").style.display = "";
  log(`Search: isolated ${_searchResults.length} elements`);
};
window.searchHideAll = function() {
  if (!_searchResults.length) return;
  const hideSet = new Set(_searchResults.map((e) => e.eid));
  forEachModel((model) => {
    model.traverse((c) => {
      if (!c.isMesh) return;
      if (c.geometry?.attributes?.expressID) {
        const arr = c.geometry.attributes.expressID.array;
        const eids = /* @__PURE__ */ new Set();
        for (let i = 0; i < arr.length; i++) eids.add(arr[i]);
        for (const eid of eids) {
          if (hideSet.has(eid)) {
            c.visible = false;
            break;
          }
        }
      }
    });
  });
  document.getElementById("btnShowAll").style.display = "";
  log(`Search: hidden ${_searchResults.length} elements`);
};
window.searchSelectAll = function() {
  if (_searchResults.length > 0) searchSelect(0);
};
window.searchClear = function() {
  document.getElementById("searchInput").value = "";
  document.getElementById("searchTypeFilter").value = "";
  document.getElementById("searchAdvProp").value = "";
  document.getElementById("searchAdvVal").value = "";
  document.querySelectorAll("#searchPanel .search-chip").forEach((c) => c.classList.remove("on"));
  document.getElementById("searchAdv").classList.remove("show");
  _searchResults = [];
  _searchSelectedIdx = -1;
  document.getElementById("searchResults").innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">Type to search elements</div>';
  document.getElementById("searchCount").style.display = "none";
  document.getElementById("searchActions").style.display = "none";
  document.getElementById("searchStatsText").textContent = (_searchCache?.elements?.length || 0) + " elements indexed";
};
window.searchToggleChip = function(el, mode) {
  const wasOn = el.classList.contains("on");
  document.querySelectorAll("#searchPanel .search-chip").forEach((c) => c.classList.remove("on"));
  if (!wasOn) {
    el.classList.add("on");
    document.getElementById("searchAdv").classList.add("show");
    document.getElementById("searchAdvProp").focus();
    document.getElementById("searchAdvOp").value = mode === "missing" ? "empty" : "exists";
  }
  searchRun();
};
window.searchToggleAdvanced = function() {
  document.getElementById("searchAdv").classList.toggle("show");
};
let fieldActive = false;
let _fieldLongPressTimer = null;
let _fieldToastTimer = null;
window.fieldEnterMode = function() {
  fieldActive = true;
  document.body.classList.add("field-mode");
  setTimeout(() => {
    if (renderer) {
      const vp = document.getElementById("vpCanvas");
      renderer.setSize(vp.clientWidth, vp.clientHeight);
      camera.aspect = vp.clientWidth / vp.clientHeight;
      camera.updateProjectionMatrix();
    }
  }, 100);
  fieldToast("Field Mode \u2014 tap elements to inspect");
  fieldSetupLongPress();
  log("Field mode activated");
};
window.fieldExitMode = function() {
  fieldActive = false;
  document.body.classList.remove("field-mode");
  fieldCloseSheet();
  document.getElementById("fieldStoreys").classList.remove("show");
  setTimeout(() => {
    if (renderer) {
      const vp = document.getElementById("vpCanvas");
      renderer.setSize(vp.clientWidth, vp.clientHeight);
      camera.aspect = vp.clientWidth / vp.clientHeight;
      camera.updateProjectionMatrix();
    }
  }, 100);
  log("Field mode deactivated");
};
function fieldToast(msg, duration = 2500) {
  const el = document.getElementById("fieldToast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_fieldToastTimer);
  _fieldToastTimer = setTimeout(() => el.classList.remove("show"), duration);
}
window.fieldOpenLoader = function() {
  document.getElementById("fieldLoader").classList.add("show");
};
window.fieldCloseLoader = function() {
  document.getElementById("fieldLoader").classList.remove("show");
};
window.fieldLoadFile = async function(ev) {
  const f = ev.target?.files?.[0];
  if (!f) return;
  const statusEl = document.getElementById("fieldLoaderStatus");
  statusEl.textContent = "\u23F3 Loading " + f.name + "...";
  files[0] = f;
  if (!ifcLoader) {
    if (!await initIFC()) {
      statusEl.textContent = "\u2715 Init failed";
      return;
    }
  }
  try {
    await loadIFC(0);
    statusEl.textContent = "\u2713 " + f.name + " loaded";
    setTimeout(fieldCloseLoader, 800);
    fieldBuildStoreys();
  } catch (e) {
    statusEl.textContent = "\u2715 " + (e?.message || "Load failed");
  }
  ev.target.value = "";
};
window.fieldCloseSheet = function() {
  document.getElementById("fieldSheet").classList.remove("open");
};
window.fieldOpenSheet = function(html, title) {
  const sheet = document.getElementById("fieldSheet");
  document.getElementById("fieldSheetTitle").textContent = title || "Properties";
  document.getElementById("fieldSheetBody").innerHTML = html;
  sheet.classList.add("open");
};
const _origShowProps = window.showProps;
if (typeof showProps === "function") {
  const _showPropsOrig = showProps;
  const _propObserver = new MutationObserver(() => {
    if (!fieldActive) return;
    const propArea = document.getElementById("propArea");
    if (!propArea) return;
    const content = propArea.innerHTML;
    if (content && !content.includes("prop-empty")) {
      fieldOpenSheet(content, "Element Properties");
    }
  });
  setTimeout(() => {
    const propArea = document.getElementById("propArea");
    if (propArea) _propObserver.observe(propArea, { childList: true, subtree: true });
  }, 500);
}
window.fieldToggleSection = function() {
  toggleSectionBox();
  const btn = document.getElementById("fieldBtnSection");
  btn.classList.toggle("on", sectionActive);
  fieldToast(sectionActive ? "Section box ON" : "Section box OFF");
};
window.fieldToggleMeasure = function() {
  toggleMeasure();
  const btn = document.getElementById("fieldBtnMeasure");
  btn.classList.toggle("on", measureMode);
  fieldToast(measureMode ? "Measure mode ON \u2014 tap 2 points" : "Measure OFF");
};
window.fieldToggleWalk = function() {
  toggleWalkMode();
  const btn = document.getElementById("fieldBtnWalk");
  btn.classList.toggle("on", walkActive);
  document.getElementById("walkTouch").classList.toggle("show", walkActive);
  if (walkActive) {
    fieldToast("Walk mode \u2014 drag left joystick to move, drag right to look");
    walkTouchInit();
    if ("ontouchstart" in window) {
      try {
        document.exitPointerLock?.();
      } catch (e) {
      }
    }
  } else {
    fieldToast("Walk mode OFF");
  }
};
let _walkJoyActive = false;
let _walkJoyCenter = { x: 0, y: 0 };
let _walkJoyVec = { x: 0, y: 0 };
let _walkLookJoyActive = false;
let _walkLookJoyCenter = { x: 0, y: 0 };
let _walkLookVec = { x: 0, y: 0 };
function walkTouchInit() {
  const joy = document.getElementById("walkJoy");
  const knob = document.getElementById("walkJoyKnob");
  const lookJoy = document.getElementById("walkLookJoy");
  const lookKnob = document.getElementById("walkLookKnob");
  joy.ontouchstart = (e) => {
    e.preventDefault();
    _walkJoyActive = true;
    const rect = joy.getBoundingClientRect();
    _walkJoyCenter = { x: rect.left + 65, y: rect.top + 65 };
    walkJoyMove(e.touches[0], knob, _walkJoyCenter, (v) => {
      _walkJoyVec = v;
    });
  };
  joy.ontouchmove = (e) => {
    e.preventDefault();
    if (_walkJoyActive && e.touches[0]) walkJoyMove(e.touches[0], knob, _walkJoyCenter, (v) => {
      _walkJoyVec = v;
    });
  };
  joy.ontouchend = joy.ontouchcancel = (e) => {
    e.preventDefault();
    _walkJoyActive = false;
    _walkJoyVec = { x: 0, y: 0 };
    knob.style.transform = "translate(0px, 0px)";
  };
  lookJoy.ontouchstart = (e) => {
    e.preventDefault();
    _walkLookJoyActive = true;
    const rect = lookJoy.getBoundingClientRect();
    _walkLookJoyCenter = { x: rect.left + 65, y: rect.top + 65 };
    walkJoyMove(e.touches[0], lookKnob, _walkLookJoyCenter, (v) => {
      _walkLookVec = v;
    });
  };
  lookJoy.ontouchmove = (e) => {
    e.preventDefault();
    if (_walkLookJoyActive && e.touches[0]) walkJoyMove(e.touches[0], lookKnob, _walkLookJoyCenter, (v) => {
      _walkLookVec = v;
    });
  };
  lookJoy.ontouchend = lookJoy.ontouchcancel = (e) => {
    e.preventDefault();
    _walkLookJoyActive = false;
    _walkLookVec = { x: 0, y: 0 };
    lookKnob.style.transform = "translate(0px, 0px)";
  };
}
function walkJoyMove(touch, knobEl, center, setVec) {
  const dx = touch.clientX - center.x;
  const dy = touch.clientY - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = 44;
  const clamped = Math.min(dist, maxR);
  const angle = Math.atan2(dy, dx);
  const cx = Math.cos(angle) * clamped;
  const cy = Math.sin(angle) * clamped;
  knobEl.style.transform = `translate(${cx}px, ${cy}px)`;
  setVec({ x: cx / maxR, y: cy / maxR });
}
window.walkTouchUD = function(dir, pressed) {
  if (dir === "up") walkKeys.e = pressed;
  if (dir === "down") walkKeys.q = pressed;
};
window.fieldScreenshot = function() {
  captureScreenshot();
  fieldToast("Screenshot saved");
};
window.fieldShowAll = function() {
  if (window.showAllHidden) showAllHidden();
  fieldToast("All elements visible");
};
window.fieldToggleStoreys = function() {
  const el = document.getElementById("fieldStoreys");
  const wasShown = el.classList.contains("show");
  el.classList.toggle("show");
  const btn = document.getElementById("fieldBtnStoreys");
  btn.classList.toggle("on", !wasShown);
  if (!wasShown) fieldBuildStoreys();
};
function fieldBuildStoreys() {
  const container = document.getElementById("fieldStoreys");
  let allStoreys = [];
  for (let i = 0; i < loadedModels.length; i++) {
    const m = loadedModels[i];
    if (!m?.spatial?.storeys) continue;
    for (const s of m.spatial.storeys) {
      allStoreys.push({ name: s.name, elevation: s.elevation });
    }
  }
  const unique = [];
  for (const s of allStoreys) {
    if (!unique.some((u) => Math.abs(u.elevation - s.elevation) < 0.1)) {
      unique.push(s);
    }
  }
  unique.sort((a, b) => a.elevation - b.elevation);
  if (unique.length === 0) {
    container.innerHTML = '<span class="field-storey-pill" style="opacity:.5">No storeys found</span>';
    return;
  }
  container.innerHTML = unique.map(
    (s, i) => `<button class="field-storey-pill" data-elev="${s.elevation}" onclick="fieldSelectStorey(${i},${s.elevation})">${s.name}</button>`
  ).join("");
}
window.fieldSelectStorey = function(idx, elevation) {
  const pills = document.querySelectorAll(".field-storey-pill");
  pills.forEach((p, i) => p.classList.toggle("on", i === idx));
  if (!sectionActive) toggleSectionBox();
  const h = 4;
  const cy = sharedCenterOffset?.y || 0;
  const yBot = elevation - cy;
  const yTop = yBot + h;
  if (clipPlanes.length >= 6) {
    clipPlanes[2].constant = yTop;
    clipPlanes[3].constant = -yBot;
    clipPlanes[0].constant = modelBounds.max.x + 10;
    clipPlanes[1].constant = -modelBounds.min.x + 10;
    clipPlanes[4].constant = modelBounds.max.z + 10;
    clipPlanes[5].constant = -modelBounds.min.z + 10;
  }
  const cx = (modelBounds.min.x + modelBounds.max.x) / 2;
  const cz = (modelBounds.min.z + modelBounds.max.z) / 2;
  const span = Math.max(modelBounds.max.x - modelBounds.min.x, modelBounds.max.z - modelBounds.min.z);
  camera.position.set(cx + span * 0.4, yBot + h * 0.6, cz + span * 0.4);
  controls.target.set(cx, yBot + h * 0.3, cz);
  controls.update();
  fieldToast(`Storey: ${document.querySelectorAll(".field-storey-pill")[idx]?.textContent || ""}`);
};
function fieldSetupLongPress() {
  const canvas = renderer?.domElement;
  if (!canvas) return;
  let lpTimer = null;
  let lpPos = { x: 0, y: 0 };
  let lpMoved = false;
  let lastTapTime = 0;
  let lastTapPos = { x: 0, y: 0 };
  canvas.addEventListener("touchstart", (e) => {
    if (!fieldActive) return;
    if (e.touches.length !== 1) return;
    const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
    lpPos = { x: tx, y: ty };
    lpMoved = false;
    const now = Date.now();
    const dt = now - lastTapTime;
    const dist = Math.sqrt(Math.pow(tx - lastTapPos.x, 2) + Math.pow(ty - lastTapPos.y, 2));
    if (dt < 300 && dist < 30) {
      e.preventDefault();
      lastTapTime = 0;
      fieldDoubleTapZoom(tx, ty);
      return;
    }
    lastTapTime = now;
    lastTapPos = { x: tx, y: ty };
    lpTimer = setTimeout(() => {
      if (!lpMoved) {
        const ev = new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: lpPos.x,
          clientY: lpPos.y
        });
        canvas.dispatchEvent(ev);
        e.preventDefault();
      }
    }, 600);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (!fieldActive || !lpTimer) return;
    const dx = e.touches[0].clientX - lpPos.x;
    const dy = e.touches[0].clientY - lpPos.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      lpMoved = true;
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  });
  canvas.addEventListener("touchend", () => {
    clearTimeout(lpTimer);
    lpTimer = null;
  });
  canvas.addEventListener("touchcancel", () => {
    clearTimeout(lpTimer);
    lpTimer = null;
  });
}
function fieldDoubleTapZoom(clientX, clientY) {
  if (!renderer || !camera) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = (clientX - rect.left) / rect.width * 2 - 1;
  const my = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(mx, my), camera);
  const ms = [];
  scene.traverse((c) => {
    if (c.isMesh && c.visible) ms.push(c);
  });
  const hits = ray.intersectObjects(ms, false);
  if (hits.length === 0) {
    fieldToast("No element at tap point");
    return;
  }
  const hit = hits[0];
  const point = hit.point;
  let targetModelIdx = -1;
  if (hit.object.userData?.srcModelIdx !== void 0) {
    targetModelIdx = hit.object.userData.srcModelIdx;
  } else {
    targetModelIdx = findModelIdx(hit.object);
  }
  let foundEid = null;
  try {
    const eid = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
    if (eid > 0) foundEid = eid;
  } catch (e) {
  }
  if (!foundEid && hit.object.geometry.attributes.expressID) {
    try {
      const idx = hit.object.geometry.index ? hit.object.geometry.index.array[hit.faceIndex * 3] : hit.faceIndex * 3;
      if (idx >= 0 && idx < hit.object.geometry.attributes.expressID.array.length) {
        foundEid = hit.object.geometry.attributes.expressID.array[idx];
      }
    } catch (e) {
    }
  }
  if (foundEid && targetModelIdx >= 0) {
    const bbox = getElementBBox(targetModelIdx, foundEid);
    if (bbox?.center) {
      const sz = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
      const d2 = Math.max(sz * 2.5, 3);
      if (walkActive) {
        camera.position.set(bbox.center.x + sz + 1.5, bbox.center.y + 1.6, bbox.center.z + sz + 1.5);
        walkYaw = Math.atan2(bbox.center.x - camera.position.x, bbox.center.z - camera.position.z);
        walkPitch = 0;
      } else {
        camera.position.set(bbox.center.x + d2 * 0.45, bbox.center.y + d2 * 0.35, bbox.center.z + d2 * 0.45);
        controls.target.copy(bbox.center);
        controls.update();
      }
      fieldToast("Zoomed to element");
      return;
    }
  }
  const d = 5;
  if (walkActive) {
    camera.position.set(point.x + 2, point.y + 1.6, point.z + 2);
    walkYaw = Math.atan2(point.x - camera.position.x, point.z - camera.position.z);
    walkPitch = 0;
  } else {
    camera.position.set(point.x + d * 0.5, point.y + d * 0.4, point.z + d * 0.5);
    controls.target.copy(point);
    controls.update();
  }
  fieldToast("Zoomed to point");
}
let fieldPlan2DActive = false;
let fieldPlan2DRenderer = null;
let fieldPlan2DCamera = null;
let fieldPlan2DStoreyIdx = -1;
let _fp2dAnimId = null;
window.fieldTogglePlan2D = function() {
  if (fieldPlan2DActive) {
    fieldClosePlan2D();
  } else {
    fieldOpenPlan2D();
  }
  document.getElementById("fieldBtnPlan2D").classList.toggle("on", fieldPlan2DActive);
};
window.fieldOpenPlan2D = function() {
  if (!loadedModels.some((m) => !!m)) {
    fieldToast("Load a model first");
    return;
  }
  fieldPlan2DActive = true;
  document.getElementById("fieldPlan2D").classList.add("show");
  fieldPlan2DBuildStoreys();
  const container = document.getElementById("fieldPlan2DCanvas");
  if (!fieldPlan2DRenderer) {
    fieldPlan2DRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    fieldPlan2DRenderer.localClippingEnabled = true;
    fieldPlan2DRenderer.setClearColor(16316923, 1);
    container.appendChild(fieldPlan2DRenderer.domElement);
    fieldPlan2DCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 5e3);
    fieldPlan2DCamera.position.set(0, 500, 0);
    let tnAngle = 0;
    for (let i = 0; i < loadedModels.length; i++) {
      if (loadedModels[i]?.spatial?.trueNorthAngle) {
        tnAngle = loadedModels[i].spatial.trueNorthAngle;
        break;
      }
    }
    fieldPlan2DCamera.up.set(-Math.sin(tnAngle), 0, -Math.cos(tnAngle));
    fieldPlan2DCamera.lookAt(0, 0, 0);
  }
  fieldPlan2DResize();
  fieldPlan2DSetupTouch();
  fieldPlan2DRender();
  if (fieldPlan2DStoreyIdx < 0) {
    const storeys = fieldPlan2DGetStoreys();
    if (storeys.length > 0) fieldPlan2DSelectStorey(0);
  }
};
window.fieldClosePlan2D = function() {
  fieldPlan2DActive = false;
  document.getElementById("fieldPlan2D").classList.remove("show");
  document.getElementById("fieldBtnPlan2D").classList.remove("on");
  if (_fp2dAnimId) {
    cancelAnimationFrame(_fp2dAnimId);
    _fp2dAnimId = null;
  }
  clipPlanes.length = 0;
};
function fieldPlan2DResize() {
  if (!fieldPlan2DRenderer) return;
  const container = document.getElementById("fieldPlan2DCanvas");
  const w = container.clientWidth, h = container.clientHeight;
  if (w === 0 || h === 0) return;
  fieldPlan2DRenderer.setSize(w, h);
  fieldPlan2DRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
function fieldPlan2DGetStoreys() {
  const all = [];
  for (let i = 0; i < loadedModels.length; i++) {
    const m = loadedModels[i];
    if (!m?.spatial?.storeys) continue;
    for (const s of m.spatial.storeys) {
      if (!all.some((u) => Math.abs(u.elevation - s.elevation) < 0.1)) {
        all.push({ name: s.name, elevation: s.elevation });
      }
    }
  }
  all.sort((a, b) => a.elevation - b.elevation);
  return all;
}
function fieldPlan2DBuildStoreys() {
  const container = document.getElementById("fieldPlan2DStoreys");
  const storeys = fieldPlan2DGetStoreys();
  if (storeys.length === 0) {
    container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No storeys</span>';
    return;
  }
  container.innerHTML = storeys.map(
    (s, i) => `<button class="field-plan2d-pill${i === fieldPlan2DStoreyIdx ? " on" : ""}" onclick="fieldPlan2DSelectStorey(${i})">${s.name}</button>`
  ).join("");
}
window.fieldPlan2DSelectStorey = function(idx) {
  const storeys = fieldPlan2DGetStoreys();
  if (idx < 0 || idx >= storeys.length) return;
  fieldPlan2DStoreyIdx = idx;
  const s = storeys[idx];
  document.querySelectorAll(".field-plan2d-pill").forEach((p, i) => p.classList.toggle("on", i === idx));
  const cy = sharedCenterOffset?.y || 0;
  const elevBot = s.elevation - cy;
  const nextStorey = storeys[idx + 1];
  const elevTop = nextStorey ? nextStorey.elevation - cy : elevBot + 3.5;
  const cutY = elevBot + (elevTop - elevBot) * 0.4;
  clipPlanes.length = 0;
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY + 0.5));
  clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevBot + 0.1));
  if (fieldPlan2DCamera) {
    const cx = (modelBounds.min.x + modelBounds.max.x) / 2;
    const cz = (modelBounds.min.z + modelBounds.max.z) / 2;
    fieldPlan2DCamera.position.set(cx, cutY + 200, cz);
    const spanX = modelBounds.max.x - modelBounds.min.x;
    const spanZ = modelBounds.max.z - modelBounds.min.z;
    const container = document.getElementById("fieldPlan2DCanvas");
    const aspect = container.clientWidth / (container.clientHeight || 1);
    const pad = 1.15;
    let halfW, halfH;
    if (spanX / aspect > spanZ) {
      halfW = spanX * pad / 2;
      halfH = halfW / aspect;
    } else {
      halfH = spanZ * pad / 2;
      halfW = halfH * aspect;
    }
    fieldPlan2DCamera.left = -halfW;
    fieldPlan2DCamera.right = halfW;
    fieldPlan2DCamera.top = halfH;
    fieldPlan2DCamera.bottom = -halfH;
    fieldPlan2DCamera.updateProjectionMatrix();
  }
  document.getElementById("fieldPlan2DInfo").textContent = `${s.name} \u2014 Elev: ${s.elevation.toFixed(2)}m \u2014 Cut height: ${(s.elevation + (elevTop - elevBot + cy) * 0.4).toFixed(2)}m`;
  fieldToast(`Plan: ${s.name}`);
};
function fieldPlan2DRender() {
  if (!fieldPlan2DActive) return;
  if (fieldPlan2DRenderer && fieldPlan2DCamera) {
    fieldPlan2DRenderer.render(scene, fieldPlan2DCamera);
  }
  _fp2dAnimId = requestAnimationFrame(fieldPlan2DRender);
}
function fieldPlan2DSetupTouch() {
  const container = document.getElementById("fieldPlan2DCanvas");
  let panActive = false;
  let panPrev = { x: 0, y: 0 };
  let pinchDist0 = 0;
  container.ontouchstart = (e) => {
    if (e.touches.length === 1) {
      panActive = true;
      panPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      panActive = false;
      const t0 = e.touches[0], t1 = e.touches[1];
      pinchDist0 = Math.sqrt(Math.pow(t1.clientX - t0.clientX, 2) + Math.pow(t1.clientY - t0.clientY, 2));
    }
  };
  container.ontouchmove = (e) => {
    e.preventDefault();
    if (!fieldPlan2DCamera) return;
    if (e.touches.length === 1 && panActive) {
      const dx = e.touches[0].clientX - panPrev.x;
      const dy = e.touches[0].clientY - panPrev.y;
      panPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const w = fieldPlan2DCamera.right - fieldPlan2DCamera.left;
      const h = fieldPlan2DCamera.top - fieldPlan2DCamera.bottom;
      const rect = container.getBoundingClientRect();
      const panX = -dx / rect.width * w;
      const panZ = dy / rect.height * h;
      fieldPlan2DCamera.position.x += panX;
      fieldPlan2DCamera.position.z += panZ;
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX - t0.clientX, 2) + Math.pow(t1.clientY - t0.clientY, 2));
      if (pinchDist0 > 0) {
        const scale = pinchDist0 / dist;
        const cx = (fieldPlan2DCamera.left + fieldPlan2DCamera.right) / 2;
        const cy = (fieldPlan2DCamera.top + fieldPlan2DCamera.bottom) / 2;
        const hw = (fieldPlan2DCamera.right - fieldPlan2DCamera.left) / 2 * scale;
        const hh = (fieldPlan2DCamera.top - fieldPlan2DCamera.bottom) / 2 * scale;
        if (hw > 0.5 && hw < 5e3) {
          fieldPlan2DCamera.left = cx - hw;
          fieldPlan2DCamera.right = cx + hw;
          fieldPlan2DCamera.top = cy + hh;
          fieldPlan2DCamera.bottom = cy - hh;
          fieldPlan2DCamera.updateProjectionMatrix();
        }
        pinchDist0 = dist;
      }
    }
  };
  container.ontouchend = container.ontouchcancel = () => {
    panActive = false;
  };
  container.onclick = async (e) => {
    if (!fieldPlan2DRenderer || !fieldPlan2DCamera) return;
    const rect = container.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mx, my), fieldPlan2DCamera);
    const ms = [];
    scene.traverse((c) => {
      if (c.isMesh && c.visible) ms.push(c);
    });
    const hits = ray.intersectObjects(ms, false);
    if (hits.length === 0) return;
    const hit = hits[0];
    let targetModelIdx = hit.object.userData?.srcModelIdx ?? -1;
    if (targetModelIdx < 0) targetModelIdx = findModelIdx(hit.object);
    if (targetModelIdx < 0 || !loadedModels[targetModelIdx]) return;
    let foundEid = null;
    try {
      const eid = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
      if (eid > 0) foundEid = eid;
    } catch (e2) {
    }
    if (!foundEid && hit.object.geometry.attributes.expressID) {
      try {
        const idx2 = hit.object.geometry.index ? hit.object.geometry.index.array[hit.faceIndex * 3] : hit.faceIndex * 3;
        if (idx2 >= 0) foundEid = hit.object.geometry.attributes.expressID.array[idx2];
      } catch (e2) {
      }
    }
    if (!foundEid) return;
    const modelID = loadedModels[targetModelIdx].modelID;
    try {
      const props = await ifcLoader.ifcManager.getItemProperties(modelID, foundEid, true);
      if (props) showProps(props, targetModelIdx);
    } catch (e2) {
    }
    try {
      clearHighlight();
      if (!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({ color: 2450411, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: true, clippingPlanes: clipPlanes });
      const sub = ifcLoader.ifcManager.createSubset({ modelID, ids: [foundEid], material: window._hlMat, scene, removePrevious: true, customID: "userHighlight" });
      if (sub) {
        sub.position.copy(loadedModels[targetModelIdx].position);
        sub.updateMatrixWorld(true);
        window._lastHL = { subset: sub, mid: modelID };
      }
    } catch (e2) {
    }
    fieldToast("Element selected");
  };
}
if ("ontouchstart" in window && window.innerWidth <= 1200) {
  const _origLoadIFC = loadIFC;
  let _fieldHinted = false;
  const _checkFieldHint = () => {
    if (_fieldHinted || fieldActive) return;
    if (loadedModels.some((m) => !!m)) {
      _fieldHinted = true;
      setTimeout(() => {
        if (!fieldActive && confirm("Touch device detected. Switch to Field Mode for easier on-site viewing?")) {
          fieldEnterMode();
        }
      }, 1500);
    }
  };
  setTimeout(() => {
    if (controls) controls.addEventListener("change", () => {
      if (!_fieldHinted) _checkFieldHint();
    });
  }, 2e3);
}
let aiIndex = null;
let aiIndexKey = null;
function aiRaw(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "object" && "value" in v) return v.value;
  return v;
}
async function aiResolveMaterialNames(modelID, ref, depth = 0) {
  const mgr = ifcLoader.ifcManager;
  if (depth > 6 || ref === null || ref === void 0) return [];
  let obj = ref;
  const id = typeof ref === "number" ? ref : ref?.value ?? null;
  if (typeof id === "number") {
    try {
      obj = await mgr.getItemProperties(modelID, id, false);
    } catch (e) {
      return [];
    }
  }
  if (!obj) return [];
  const out = [];
  const pushName = (m) => {
    const n = aiRaw(m?.Name);
    if (n) out.push(String(n).trim());
  };
  if (obj.Name && !obj.MaterialLayers && !obj.Materials && !obj.MaterialConstituents && !obj.MaterialProfiles && !obj.ForLayerSet) {
    pushName(obj);
    return out;
  }
  const childRefs = [];
  if (obj.ForLayerSet) childRefs.push(obj.ForLayerSet);
  if (obj.MaterialLayers) childRefs.push(...Array.isArray(obj.MaterialLayers) ? obj.MaterialLayers : [obj.MaterialLayers]);
  if (obj.Materials) childRefs.push(...Array.isArray(obj.Materials) ? obj.Materials : [obj.Materials]);
  if (obj.MaterialConstituents) childRefs.push(...Array.isArray(obj.MaterialConstituents) ? obj.MaterialConstituents : [obj.MaterialConstituents]);
  if (obj.MaterialProfiles) childRefs.push(...Array.isArray(obj.MaterialProfiles) ? obj.MaterialProfiles : [obj.MaterialProfiles]);
  if (obj.Material) childRefs.push(obj.Material);
  if (childRefs.length === 0) {
    pushName(obj);
    return out;
  }
  for (const c of childRefs) {
    const names = await aiResolveMaterialNames(modelID, c, depth + 1);
    out.push(...names);
  }
  return out;
}
async function buildAIIndex(opts = {}) {
  const key = loadedModels.map((m) => m?.modelID ?? "_").join("-");
  if (aiIndex && aiIndexKey === key && !opts.force) return aiIndex;
  if (!loadedModels.some((m) => !!m)) {
    aiIndex = null;
    aiIndexKey = null;
    return null;
  }
  const mgr = ifcLoader.ifcManager;
  const api = mgr.state.api;
  const elements = [];
  const TYPE_REL_MATERIAL = 2851387026;
  const TYPE_REL_PROPS = 4186316022;
  for (let mi = 0; mi < loadedModels.length; mi++) {
    const model = loadedModels[mi];
    if (!model) continue;
    const modelID = model.modelID;
    const units = model.units || { lengthFactor: 1e3, areaFactor: 1, volumeFactor: 1 };
    const spatial = model.spatial || { storeys: [] };
    const props = await getAllProps(modelID);
    const eidToStorey = {};
    try {
      const storeyName = {};
      for (const s of spatial.storeys) storeyName[s.expressID] = s.name;
      const tree = await mgr.getSpatialStructure(modelID, false);
      const walk = (node, cur) => {
        if (!node) return;
        const st = storeyName[node.expressID] || cur;
        if (st && node.expressID) eidToStorey[node.expressID] = st;
        if (node.children) for (const c of node.children) walk(c, st);
      };
      walk(tree, null);
    } catch (e) {
      log("AI index: spatial tree err", e?.message);
    }
    const eidToMaterials = {};
    try {
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_MATERIAL);
      for (let i = 0; i < relIDs.size(); i++) {
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        if (!rel?.RelatingMaterial) continue;
        const names = await aiResolveMaterialNames(modelID, rel.RelatingMaterial);
        if (!names.length) continue;
        let related = [];
        if (Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map((o) => o.value ?? o).filter((v) => typeof v === "number");
        else if (rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        for (const eid of related) {
          if (!eidToMaterials[eid]) eidToMaterials[eid] = [];
          for (const n of names) if (n && !eidToMaterials[eid].includes(n)) eidToMaterials[eid].push(n);
        }
      }
    } catch (e) {
      log("AI index: material err", e?.message);
    }
    const eidToQty = {};
    try {
      const relIDs = api.GetLineIDsWithType(modelID, TYPE_REL_PROPS);
      for (let i = 0; i < relIDs.size(); i++) {
        const rel = await mgr.getItemProperties(modelID, relIDs.get(i), false);
        const pdef = rel?.RelatingPropertyDefinition;
        const pdefId = pdef?.value ?? pdef;
        if (typeof pdefId !== "number") continue;
        let related = [];
        if (Array.isArray(rel.RelatedObjects)) related = rel.RelatedObjects.map((o) => o.value ?? o).filter((v) => typeof v === "number");
        else if (rel.RelatedObjects?.value) related = [rel.RelatedObjects.value];
        if (!related.length) continue;
        const pset = await mgr.getItemProperties(modelID, pdefId, true);
        if (!pset?.Quantities) continue;
        const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
        const q = { volume: null, area: null, length: null, count: null };
        for (const item of qs) {
          const qq = typeof item?.value === "number" ? await mgr.getItemProperties(modelID, item.value, false) : item;
          if (!qq) continue;
          const vv = aiRaw(qq.VolumeValue), av = aiRaw(qq.AreaValue), lv = aiRaw(qq.LengthValue), cv = aiRaw(qq.CountValue);
          if (vv != null) q.volume = vv;
          else if (av != null) q.area = av;
          else if (lv != null) q.length = lv;
          else if (cv != null) q.count = cv;
        }
        for (const eid of related) {
          if (!eidToQty[eid]) eidToQty[eid] = { volume: null, area: null, length: null, count: null };
          for (const k of ["volume", "area", "length", "count"]) if (q[k] != null) eidToQty[eid][k] = q[k];
        }
      }
    } catch (e) {
      log("AI index: qty err", e?.message);
    }
    for (const gid in props) {
      const p = props[gid];
      const ifcClass = p.type;
      const rawQ = eidToQty[p.expressID];
      let quantities = null, quantitySource = "missing";
      if (rawQ && (rawQ.volume != null || rawQ.area != null || rawQ.length != null || rawQ.count != null)) {
        quantities = {
          volume: rawQ.volume != null ? +(rawQ.volume * units.volumeFactor).toFixed(4) : null,
          // m³
          area: rawQ.area != null ? +(rawQ.area * units.areaFactor).toFixed(4) : null,
          // m²
          length: rawQ.length != null ? Math.round(rawQ.length * units.lengthFactor) : null,
          // mm
          count: rawQ.count != null ? rawQ.count : null
        };
        quantitySource = "model";
      }
      elements.push({
        expressID: p.expressID,
        globalId: gid,
        modelIdx: mi,
        ifcClass,
        // 'IfcSlab'
        category: ifcClassToRevitCategory(ifcClass),
        // 'Floors'
        name: p.name || "",
        objectType: p.objectType || "",
        tag: p.tag || "",
        storey: eidToStorey[p.expressID] || null,
        materials: eidToMaterials[p.expressID] || [],
        quantities,
        // {volume,area,length,count} hoặc null
        quantitySource
        // 'model' | 'missing'
      });
    }
  }
  aiIndex = makeAIIndexAggregates(elements);
  aiIndexKey = key;
  log(`AI index built: ${elements.length} elements / ${loadedModels.filter((m) => m).length} model(s)`);
  return aiIndex;
}
function makeAIIndexAggregates(elements) {
  const byClass = {}, byCategory = {}, byStorey = {}, matCount = {};
  const cov = { volume: 0, area: 0, length: 0, count: 0, missing: 0 };
  for (const e of elements) {
    byClass[e.ifcClass] = (byClass[e.ifcClass] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    const st = e.storey || "(kh\xF4ng g\xE1n t\u1EA7ng)";
    byStorey[st] = (byStorey[st] || 0) + 1;
    for (const m of e.materials) matCount[m] = (matCount[m] || 0) + 1;
    if (e.quantitySource === "missing") {
      cov.missing++;
    } else {
      if (e.quantities.volume != null) cov.volume++;
      if (e.quantities.area != null) cov.area++;
      if (e.quantities.length != null) cov.length++;
      if (e.quantities.count != null) cov.count++;
    }
  }
  const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, count: v }));
  return {
    elements,
    count: elements.length,
    models: loadedModels.map((m, i) => m ? { idx: i, fileName: m.fileName || "Model " + i, count: elements.filter((e) => e.modelIdx === i).length } : null).filter(Boolean),
    categories: sortDesc(byCategory),
    ifcClasses: sortDesc(byClass),
    storeys: Object.keys(byStorey),
    materials: sortDesc(matCount),
    quantityCoverage: cov,
    // bao nhiêu element có volume/area/length/count, bao nhiêu thiếu
    // tra cứu nhanh cho tool sau này:
    _byCategory: byCategory,
    _byClass: byClass,
    _byStorey: byStorey
  };
}
window.aiIndexSummary = async function() {
  const ix = await buildAIIndex();
  if (!ix) {
    console.log("[AI INDEX] Ch\u01B0a c\xF3 model n\xE0o \u0111\u01B0\u1EE3c load.");
    return;
  }
  console.log("%c\u2550\u2550\u2550 AI DATA INDEX \u2550\u2550\u2550", "color:#2563eb;font-weight:700");
  console.log("T\u1ED5ng element:", ix.count, "|", ix.models.map((m) => m.fileName + ": " + m.count).join("  "));
  console.log("\u2014 Theo Category (Revit):");
  console.table(ix.categories);
  console.log("\u2014 Theo t\u1EA7ng (storey):");
  console.table(ix.storeys.map((s) => ({ storey: s, count: ix._byStorey[s] })));
  console.log("\u2014 V\u1EADt li\u1EC7u (top):");
  console.table(ix.materials.slice(0, 15));
  const c = ix.quantityCoverage;
  console.log(`\u2014 \u0110\u1ED9 ph\u1EE7 kh\u1ED1i l\u01B0\u1EE3ng: volume=${c.volume}, area=${c.area}, length=${c.length}, count=${c.count}, THI\u1EBEU=${c.missing} / ${ix.count}`);
  console.log("G\u1EE3i \xFD: window.aiIndexSummary() \u0111\u1EC3 xem l\u1EA1i. Truy c\u1EADp d\u1EEF li\u1EC7u th\xF4: await buildAIIndex() r\u1ED3i .elements");
  return ix;
};
window.buildAIIndex = buildAIIndex;
function _aiNorm(s) {
  return (s == null ? "" : String(s)).toLowerCase().trim();
}
function _aiApplyFilter(elements, f = {}) {
  const cat = f.category != null ? _aiNorm(f.category) : null;
  const sto = f.storey != null ? _aiNorm(f.storey) : null;
  const cls = f.ifcClass != null ? _aiNorm(f.ifcClass) : null;
  const mat = f.material != null ? _aiNorm(f.material) : null;
  const nm = f.nameContains != null ? _aiNorm(f.nameContains) : null;
  const mi = f.modelIdx != null && f.modelIdx !== "" ? Number(f.modelIdx) : null;
  return elements.filter((e) => {
    if (cat != null && !_aiNorm(e.category).includes(cat)) return false;
    if (sto != null) {
      const es = e.storey == null ? "" : _aiNorm(e.storey);
      if (!es.includes(sto)) return false;
    }
    if (cls != null && !_aiNorm(e.ifcClass).includes(cls)) return false;
    if (mat != null && !(e.materials || []).some((m) => _aiNorm(m).includes(mat))) return false;
    if (nm != null && !_aiNorm(e.name).includes(nm)) return false;
    if (mi != null && e.modelIdx !== mi) return false;
    return true;
  });
}
function _aiGroupCount(els, key) {
  const o = {};
  for (const e of els) {
    const k = e[key] == null || e[key] === "" ? "(kh\xF4ng x\xE1c \u0111\u1ECBnh)" : e[key];
    o[k] = (o[k] || 0) + 1;
  }
  return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}
async function countElements(filter = {}) {
  const idx = await buildAIIndex();
  const els = _aiApplyFilter(idx && idx.elements || [], filter);
  return {
    count: els.length,
    filter,
    byCategory: _aiGroupCount(els, "category"),
    byStorey: _aiGroupCount(els, "storey")
  };
}
async function sumQuantity(filter = {}, quantity = "volume") {
  const idx = await buildAIIndex();
  const q = _aiNorm(quantity);
  const key = {
    volume: "volume",
    "th\u1EC3 t\xEDch": "volume",
    area: "area",
    "di\u1EC7n t\xEDch": "area",
    length: "length",
    "chi\u1EC1u d\xE0i": "length",
    count: "count",
    "s\u1ED1 l\u01B0\u1EE3ng": "count"
  }[q] || "volume";
  const els = _aiApplyFilter(idx && idx.elements || [], filter);
  let total = 0, withQty = 0, missing = 0;
  for (const e of els) {
    const v = e.quantities ? e.quantities[key] : null;
    if (typeof v === "number" && isFinite(v)) {
      total += v;
      withQty++;
    } else missing++;
  }
  const unit = key === "volume" ? "m\xB3" : key === "area" ? "m\xB2" : key === "length" ? "mm" : "c\xE1i";
  return {
    quantity: key,
    total: Math.round(total * 1e3) / 1e3,
    unit,
    elementsMatched: els.length,
    elementsWithQuantity: withQty,
    elementsMissing: missing,
    // khớp lọc nhưng THIẾU đại lượng này (không tính vào tổng)
    filter
  };
}
const AI_TOOLS = [
  {
    name: "count_elements",
    description: '\u0110\u1EBFm s\u1ED1 l\u01B0\u1EE3ng element trong (c\xE1c) model IFC \u0111ang m\u1EDF, l\u1ECDc theo category ki\u1EC3u Revit, t\u1EA7ng, l\u1EDBp IFC, v\u1EADt li\u1EC7u ho\u1EB7c t\xEAn. Tr\u1EA3 v\u1EC1 s\u1ED1 ch\xEDnh x\xE1c k\xE8m ph\xE2n nh\xF3m theo category v\xE0 theo t\u1EA7ng. D\xF9ng cho c\xE2u h\u1ECFi nh\u01B0 "c\xF3 bao nhi\xEAu c\u1ED9t \u1EDF t\u1EA7ng L3", "\u0111\u1EBFm s\u1ED1 c\u1EEDa \u1EDF basement".',
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: 'Category ki\u1EC3u Revit, vd "Columns","Floors","Doors","Walls". Kh\u1EDBp g\u1EA7n \u0111\xFAng, kh\xF4ng ph\xE2n bi\u1EC7t hoa th\u01B0\u1EDDng.' },
        storey: { type: "string", description: 'T\xEAn t\u1EA7ng, vd "L2","L3","Parking". Kh\u1EDBp g\u1EA7n \u0111\xFAng.' },
        ifcClass: { type: "string", description: 'L\u1EDBp IFC, vd "IfcColumn","IfcSlab","IfcDoor".' },
        material: { type: "string", description: 'T\xEAn v\u1EADt li\u1EC7u, vd "Concrete","Steel".' },
        nameContains: { type: "string", description: "Chu\u1ED7i con c\u1EA7n c\xF3 trong t\xEAn element." }
      }
    }
  },
  {
    name: "sum_quantity",
    description: 'C\u1ED9ng t\u1ED5ng kh\u1ED1i l\u01B0\u1EE3ng c\xE1c element kh\u1EDBp b\u1ED9 l\u1ECDc: th\u1EC3 t\xEDch (volume, m\xB3), di\u1EC7n t\xEDch (area, m\xB2), chi\u1EC1u d\xE0i (length, mm) ho\u1EB7c s\u1ED1 l\u01B0\u1EE3ng (count). Tr\u1EA3 v\u1EC1 t\u1ED5ng ch\xEDnh x\xE1c, \u0111\u01A1n v\u1ECB, v\xE0 s\u1ED1 element b\u1ECB thi\u1EBFu \u0111\u1EA1i l\u01B0\u1EE3ng. D\xF9ng cho "t\u1ED5ng th\u1EC3 t\xEDch b\xEA t\xF4ng s\xE0n t\u1EA7ng 1".',
    input_schema: {
      type: "object",
      properties: {
        quantity: { type: "string", enum: ["volume", "area", "length", "count"], description: "\u0110\u1EA1i l\u01B0\u1EE3ng c\u1EA7n c\u1ED9ng." },
        category: { type: "string", description: "Category Revit \u0111\u1EC3 l\u1ECDc." },
        storey: { type: "string", description: "T\u1EA7ng \u0111\u1EC3 l\u1ECDc." },
        ifcClass: { type: "string", description: "L\u1EDBp IFC \u0111\u1EC3 l\u1ECDc." },
        material: { type: "string", description: "V\u1EADt li\u1EC7u \u0111\u1EC3 l\u1ECDc." },
        nameContains: { type: "string", description: "Chu\u1ED7i con trong t\xEAn." }
      },
      required: ["quantity"]
    }
  }
];
async function runAITool(name, input) {
  input = input || {};
  if (name === "count_elements") return await countElements(input);
  if (name === "sum_quantity") {
    const { quantity, ...f } = input;
    return await sumQuantity(f, quantity || "volume");
  }
  throw new Error("Unknown AI tool: " + name);
}
window.countElements = countElements;
window.sumQuantity = sumQuantity;
window.runAITool = runAITool;
window.AI_TOOLS = AI_TOOLS;
if (window.DEBUG) console.log("%c\u2550\u2550\u2550 AI QUERY TOOLS s\u1EB5n s\xE0ng \u2550\u2550\u2550", "color:#16a34a;font-weight:700");
if (window.DEBUG) console.log('Th\u1EED:  await countElements({category:"Columns"})');
if (window.DEBUG) console.log('      await sumQuantity({category:"Floors"}, "volume")');
(function() {
  const AI_CONFIG = {
    model: "",
    // proxy tự chọn model (DEEPSEEK_MODEL); để trống
    maxTokens: 1024,
    proxyUrl: "/api/ai/chat"
    // serverless proxy — key giữ ở server
  };
  window.AI_CONFIG = AI_CONFIG;
  const css = `
  .aic-fab{position:fixed;right:20px;bottom:20px;z-index:9998;width:52px;height:52px;border-radius:50%;
    background:var(--blue,#2563eb);color:#fff;border:none;cursor:pointer;font-size:22px;
    box-shadow:0 4px 14px rgba(37,99,235,.4);display:flex;align-items:center;justify-content:center;transition:transform .15s ease}
  .aic-fab:hover{transform:scale(1.06)}
  .aic-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:380px;max-width:calc(100vw - 40px);
    height:560px;max-height:calc(100vh - 40px);background:var(--bg-panel,#fff);border:1px solid var(--border,#d5d9e2);
    border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;
    font-family:Inter,system-ui,sans-serif;color:var(--text,#1a1d26)}
  .aic-panel.open{display:flex}
  .aic-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#d5d9e2);background:var(--bg-card,#f0f1f4)}
  .aic-head b{font-size:14px;flex:1}
  .aic-head .aic-dot{width:8px;height:8px;border-radius:50%;background:var(--green,#16a34a)}
  .aic-iconbtn{background:none;border:none;cursor:pointer;color:var(--text-dim,#4a5068);font-size:16px;padding:4px;border-radius:6px;line-height:1}
  .aic-iconbtn:hover{background:var(--bg-hover,#e8eaef)}
  .aic-cfg{display:none;padding:10px 14px;border-bottom:1px solid var(--border,#d5d9e2);background:var(--amber-bg,#fef9ed);font-size:12px}
  .aic-cfg.show{display:block}
  .aic-cfg label{display:block;font-weight:600;margin-bottom:4px;color:var(--text-dim,#4a5068)}
  .aic-cfg input{width:100%;padding:7px 9px;border:1px solid var(--border,#d5d9e2);border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box}
  .aic-cfg .aic-note{margin-top:7px;color:var(--amber,#d97706);line-height:1.4}
  .aic-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f5f6f8)}
  .aic-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .aic-msg.user{align-self:flex-end;background:var(--blue,#2563eb);color:#fff;border-bottom-right-radius:4px}
  .aic-msg.assistant{align-self:flex-start;background:var(--bg-panel,#fff);border:1px solid var(--border,#d5d9e2);border-bottom-left-radius:4px}
  .aic-msg.error{align-self:stretch;background:var(--red-bg,#fdeaea);color:var(--red,#D05050);border:1px solid var(--red,#D05050);font-size:12px;max-width:100%}
  .aic-tool{align-self:flex-start;font-size:11px;color:var(--text-muted,#8590a6);background:var(--bg-card,#f0f1f4);
    border:1px solid var(--border,#d5d9e2);border-radius:8px;padding:5px 9px;font-family:'JetBrains Mono',monospace}
  .aic-think{align-self:flex-start;font-size:12px;color:var(--text-muted,#8590a6);font-style:italic;padding:4px 8px}
  .aic-foot{display:flex;gap:8px;padding:10px;border-top:1px solid var(--border,#d5d9e2);background:var(--bg-panel,#fff)}
  .aic-foot textarea{flex:1;resize:none;border:1px solid var(--border,#d5d9e2);border-radius:8px;padding:9px 11px;font-size:13px;
    font-family:inherit;max-height:90px;min-height:38px;box-sizing:border-box}
  .aic-send{background:var(--blue,#2563eb);color:#fff;border:none;border-radius:8px;width:40px;cursor:pointer;font-size:16px;flex-shrink:0}
  .aic-send:disabled{opacity:.5;cursor:default}
  .aic-msg.assistant strong{font-weight:600}
  .aic-msg.assistant em{font-style:italic}
  .aic-msg.assistant code{font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--bg-card,#f0f1f4);padding:1px 4px;border-radius:4px}
  .aic-md-h{font-weight:600;margin:3px 0 1px}
  .aic-md-ul{margin:4px 0;padding-left:18px}
  .aic-md-ul li{margin:1px 0}
  .aic-md-sp{height:6px}
  .aic-md-table{border-collapse:collapse;margin:6px 0;font-size:12px;width:100%}
  .aic-md-table th,.aic-md-table td{border:1px solid var(--border,#d5d9e2);padding:3px 7px;text-align:left;vertical-align:top}
  .aic-md-table th{background:var(--bg-card,#f0f1f4);font-weight:600}
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
  const fab = document.createElement("button");
  fab.className = "aic-fab";
  fab.title = "Tr\u1EE3 l\xFD AI";
  fab.textContent = "\u2726";
  document.body.appendChild(fab);
  const panel = document.createElement("div");
  panel.className = "aic-panel";
  panel.innerHTML = `
    <div class="aic-head">
      <span class="aic-dot"></span><b>Tr\u1EE3 l\xFD AI \xB7 IFC Delta</b>
      <button class="aic-iconbtn" data-act="clear" title="Xo\xE1 h\u1ED9i tho\u1EA1i">\u{1F5D1}</button>
      <button class="aic-iconbtn" data-act="close" title="\u0110\xF3ng">\u2715</button>
    </div>
    <div class="aic-msgs"></div>
    <div class="aic-foot">
      <textarea class="aic-in" rows="1" placeholder="H\u1ECFi v\u1EC1 m\xF4 h\xECnh\u2026 vd: c\xF3 bao nhi\xEAu c\u1ED9t \u1EDF t\u1EA7ng L3?"></textarea>
      <button class="aic-send" title="G\u1EEDi">\u27A4</button>
    </div>`;
  document.body.appendChild(panel);
  const $ = (s) => panel.querySelector(s);
  const msgs = $(".aic-msgs"), inputEl = $(".aic-in"), sendBtn = $(".aic-send");
  function aicEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function aicInline(s) {
    return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  }
  function aicMd(src) {
    const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
    const isSep = (r) => /-/.test(r) && /^\s*\|?[\s:|-]+\|?\s*$/.test(r);
    const splitRow = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    let html = "", i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && isSep(lines[i + 1])) {
        const headers2 = splitRow(line);
        i += 2;
        let body = "";
        while (i < lines.length && lines[i].indexOf("|") !== -1 && lines[i].trim() !== "") {
          const cells = splitRow(lines[i]);
          body += "<tr>" + cells.map((c) => "<td>" + aicInline(aicEsc(c)) + "</td>").join("") + "</tr>";
          i++;
        }
        html += '<table class="aic-md-table"><thead><tr>' + headers2.map((h2) => "<th>" + aicInline(aicEsc(h2)) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table>";
        continue;
      }
      if (/^\s*[-*▸•]\s+/.test(line)) {
        let items = "";
        while (i < lines.length && /^\s*[-*▸•]\s+/.test(lines[i])) {
          items += "<li>" + aicInline(aicEsc(lines[i].replace(/^\s*[-*▸•]\s+/, ""))) + "</li>";
          i++;
        }
        html += '<ul class="aic-md-ul">' + items + "</ul>";
        continue;
      }
      const h = line.match(/^\s*#{1,3}\s+(.*)$/);
      if (h) {
        html += '<div class="aic-md-h">' + aicInline(aicEsc(h[1])) + "</div>";
        i++;
        continue;
      }
      if (line.trim() === "") {
        html += '<div class="aic-md-sp"></div>';
        i++;
        continue;
      }
      html += "<div>" + aicInline(aicEsc(line)) + "</div>";
      i++;
    }
    return html;
  }
  function render(role, text) {
    const d = document.createElement("div");
    d.className = "aic-msg " + role;
    if (role === "assistant") d.innerHTML = aicMd(text);
    else d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function toolBadge(name, input) {
    const d = document.createElement("div");
    d.className = "aic-tool";
    d.textContent = "\u{1F527} " + name + " " + JSON.stringify(input || {});
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function thinking(on, el) {
    if (on) {
      const d = document.createElement("div");
      d.className = "aic-think";
      d.textContent = "\u0110ang x\u1EED l\xFD\u2026";
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
      return d;
    } else if (el) {
      el.remove();
    }
  }
  function endpoint() {
    return AI_CONFIG.proxyUrl;
  }
  function headers() {
    return { "content-type": "application/json" };
  }
  const CAP_LIST = 40, CAP_STOREY = 60;
  function capNames(items, n) {
    const names = items.map((c) => c.name);
    return names.length > n ? names.slice(0, n).join(", ") + `, \u2026(+${names.length - n} m\u1EE5c kh\xE1c)` : names.join(", ");
  }
  async function buildSystem() {
    let ctx = "Hi\u1EC7n ch\u01B0a c\xF3 model IFC n\xE0o \u0111\u01B0\u1EE3c load.";
    try {
      const idx = await buildAIIndex();
      if (idx) {
        const cats = capNames(idx.categories, CAP_LIST);
        const cls = capNames(idx.ifcClasses, CAP_LIST);
        const stoArr = idx.storeys;
        const stos = stoArr.length > CAP_STOREY ? stoArr.slice(0, CAP_STOREY).join(", ") + `, \u2026(+${stoArr.length - CAP_STOREY})` : stoArr.join(", ");
        ctx = "Model \u0111ang m\u1EDF: " + idx.models.map((m) => m.fileName).join(", ") + ". T\u1ED5ng " + idx.count + " element.\nCategory (Revit) c\xF3 s\u1EB5n: " + cats + ".\nT\u1EA7ng (storey) c\xF3 s\u1EB5n: " + stos + ".\nL\u1EDBp IFC c\xF3 s\u1EB5n: " + cls + ".";
      }
    } catch (e) {
    }
    return [
      "B\u1EA1n l\xE0 tr\u1EE3 l\xFD c\u1EE7a IFC Delta \u2014 c\xF4ng c\u1EE5 xem & truy v\u1EA5n m\xF4 h\xECnh IFC tr\xEAn web cho k\u1EF9 s\u01B0 BIM.",
      "PH\u1EA0M VI: CH\u1EC8 h\u1ED7 tr\u1EE3 v\u1EC1 (c\xE1c) M\xD4 H\xCCNH IFC \u0111ang m\u1EDF v\xE0 t\xEDnh n\u0103ng c\u1EE7a IFC Delta (\u0111\u1EBFm element, t\u1ED5ng kh\u1ED1i l\u01B0\u1EE3ng/di\u1EC7n t\xEDch/chi\u1EC1u d\xE0i, category, t\u1EA7ng, v\u1EADt li\u1EC7u, thu\u1ED9c t\xEDnh).",
      "T\u1EEA CH\u1ED0I NGO\xC0I PH\u1EA0M VI: n\u1EBFu c\xE2u h\u1ECFi KH\xD4NG li\xEAn quan \u0111\u1EBFn m\xF4 h\xECnh \u0111ang m\u1EDF (ki\u1EBFn th\u1EE9c chung, l\u1EADp tr\xECnh, tin t\u1EE9c, to\xE1n/\u0111\u1EDDi s\u1ED1ng ngo\xE0i l\u1EC1, tr\xF2 chuy\u1EC7n phi\u1EBFm\u2026), h\xE3y l\u1ECBch s\u1EF1 t\u1EEB ch\u1ED1i ng\u1EAFn g\u1ECDn v\xE0 nh\u1EAFc r\u1EB1ng b\u1EA1n ch\u1EC9 tr\u1EA3 l\u1EDDi v\u1EC1 m\xF4 h\xECnh IFC \u0111ang m\u1EDF. Tuy\u1EC7t \u0111\u1ED1i kh\xF4ng d\xF9ng ki\u1EBFn th\u1EE9c ngo\xE0i, kh\xF4ng tr\u1EA3 l\u1EDDi th\xF4ng tin ngo\xE0i m\xF4 h\xECnh.",
      "QUY T\u1EAEC S\u1ED0 LI\u1EC6U: v\u1EDBi m\u1ECDi c\xE2u h\u1ECFi c\u1EA7n con s\u1ED1, PH\u1EA2I g\u1ECDi tool count_elements ho\u1EB7c sum_quantity \u0111\u1EC3 l\u1EA5y s\u1ED1 CH\xCDNH X\xC1C. Ch\u1EC9 d\xF9ng d\u1EEF li\u1EC7u t\u1EEB tool v\xE0 ng\u1EEF c\u1EA3nh b\xEAn d\u01B0\u1EDBi. TUY\u1EC6T \u0110\u1ED0I kh\xF4ng t\u1EF1 \u0111o\xE1n, kh\xF4ng b\u1ECBa s\u1ED1.",
      'Khi \u0111\u1EB7t gi\xE1 tr\u1ECB l\u1ECDc (category, storey, ifcClass), h\xE3y d\xF9ng \u0111\xFAng t\xEAn c\xF3 trong danh s\xE1ch ng\u1EEF c\u1EA3nh b\xEAn d\u01B0\u1EDBi (vd "t\u1EA7ng 3" \u2192 storey "L3"; "c\u1ED9t" \u2192 category "Columns").',
      "NG\xD4N NG\u1EEE: tr\u1EA3 l\u1EDDi C\xD9NG NG\xD4N NG\u1EEE v\u1EDBi c\xE2u h\u1ECFi c\u1EE7a ng\u01B0\u1EDDi d\xF9ng \u2014 h\u1ECFi ti\u1EBFng Vi\u1EC7t th\xEC \u0111\xE1p ti\u1EBFng Vi\u1EC7t, h\u1ECFi ti\u1EBFng Anh th\xEC \u0111\xE1p ti\u1EBFng Anh (m\u1EB7c \u0111\u1ECBnh ti\u1EBFng Vi\u1EC7t n\u1EBFu kh\xF4ng r\xF5).",
      "PHONG C\xC1CH: tr\u1EA3 l\u1EDDi chuy\xEAn nghi\u1EC7p, D\u1EE8T KHO\xC1T, s\xFAc t\xEDch. M\u1EDF \u0111\u1EA7u b\u1EB1ng \u0111\xE1p s\u1ED1/k\u1EBFt lu\u1EADn ch\xEDnh k\xE8m \u0111\u01A1n v\u1ECB, r\u1ED3i m\u1EDBi t\u1EDBi chi ti\u1EBFt. Kh\xF4ng v\xF2ng vo, kh\xF4ng xin l\u1ED7i th\u1EEBa. N\u1EBFu k\u1EBFt qu\u1EA3 = 0 ho\u1EB7c c\xF3 element thi\u1EBFu kh\u1ED1i l\u01B0\u1EE3ng, n\xF3i r\xF5. N\u1EBFu ch\u01B0a load model, y\xEAu c\u1EA7u ng\u01B0\u1EDDi d\xF9ng load model tr\u01B0\u1EDBc.",
      '\u0110\u1ECANH D\u1EA0NG: d\xF9ng Markdown T\u1ED0I GI\u1EA2N \u2014 \u0111\u01B0\u1EE3c ph\xE9p **in \u0111\u1EADm** cho s\u1ED1/k\u1EBFt lu\u1EADn quan tr\u1ECDng, danh s\xE1ch "- " v\xE0 b\u1EA3ng markdown \u0111\u01A1n gi\u1EA3n khi li\u1EC7t k\xEA s\u1ED1 li\u1EC7u. G\u1ECDn g\xE0ng, kh\xF4ng ti\xEAu \u0111\u1EC1 l\u1EDBn r\u01B0\u1EDDm r\xE0.',
      "ICON: ch\u1EC9 d\xF9ng k\xFD hi\u1EC7u t\u1ED1i gi\u1EA3n \u0110\u01A0N S\u1EAEC khi th\u1EADt c\u1EA7n (\u25B8 \u2022 \u2013 \u2192 \u2191 \u2193 \u2502). TUY\u1EC6T \u0110\u1ED0I KH\xD4NG d\xF9ng emoji m\xE0u (\u{1F4CA} \u{1F947} \u{1F948} \u{1F949} \u{1F4A1} \u2705 \u26A0\uFE0F \u{1F525} \u{1F4C8} \u2026).",
      "",
      "NG\u1EEE C\u1EA2NH M\xD4 H\xCCNH HI\u1EC6N T\u1EA0I:",
      ctx
    ].join("\n");
  }
  const history = [];
  let busy = false;
  const MAX_HISTORY_MSGS = 24;
  function trimHistory() {
    if (history.length <= MAX_HISTORY_MSGS) return;
    let start = history.length - MAX_HISTORY_MSGS;
    while (start < history.length && !(history[start].role === "user" && typeof history[start].content === "string")) {
      start++;
    }
    if (start > 0 && start < history.length) history.splice(0, start);
  }
  async function ask(question) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    history.push({ role: "user", content: question });
    trimHistory();
    render("user", question);
    const system = await buildSystem();
    const thinkEl = thinking(true);
    try {
      let guard = 0;
      while (guard++ < 6) {
        const res = await fetch(endpoint(), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model: AI_CONFIG.model,
            max_tokens: AI_CONFIG.maxTokens,
            system,
            tools: window.AI_TOOLS,
            messages: history
          })
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error("API " + res.status + ": " + t.slice(0, 400));
        }
        const data = await res.json();
        history.push({ role: "assistant", content: data.content });
        if (data.stop_reason === "tool_use") {
          const toolUses = (data.content || []).filter((b) => b.type === "tool_use");
          const results = [];
          for (const tu of toolUses) {
            let out;
            try {
              out = await window.runAITool(tu.name, tu.input);
            } catch (err) {
              out = { error: String(err && err.message || err) };
            }
            results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
          }
          history.push({ role: "user", content: results });
          continue;
        }
        const texts = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (texts) render("assistant", texts);
        break;
      }
    } catch (e) {
      render("error", e && e.message || String(e));
    } finally {
      thinking(false, thinkEl);
      busy = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }
  window.aiAsk = ask;
  let composing = false;
  inputEl.addEventListener("compositionstart", () => {
    composing = true;
  });
  inputEl.addEventListener("compositionend", () => {
    composing = false;
  });
  fab.onclick = () => {
    panel.classList.add("open");
    fab.style.display = "none";
    inputEl.focus();
    buildAIIndex().catch(() => {
    });
  };
  panel.querySelector("[data-act=close]").onclick = () => {
    panel.classList.remove("open");
    fab.style.display = "flex";
  };
  panel.querySelector("[data-act=clear]").onclick = () => {
    history.length = 0;
    msgs.innerHTML = "";
  };
  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 90) + "px";
  }
  inputEl.oninput = autoGrow;
  function submit() {
    const q = inputEl.value.trim();
    if (!q || busy) return;
    inputEl.value = "";
    autoGrow();
    ask(q);
  }
  sendBtn.onclick = submit;
  inputEl.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  };
  if (window.DEBUG) console.log("%c\u2550\u2550\u2550 AI CHAT UI s\u1EB5n s\xE0ng \u2550\u2550\u2550", "color:#2563eb;font-weight:700");
  if (window.DEBUG) console.log("Nh\u1EA5n n\xFAt \u2726 g\xF3c ph\u1EA3i-d\u01B0\u1EDBi \u0111\u1EC3 m\u1EDF chat. Key gi\u1EEF \u1EDF server (proxy /api/ai/chat).");
})();
initThree();
initSectionDrag();
initViewCube();
log("Ready");
