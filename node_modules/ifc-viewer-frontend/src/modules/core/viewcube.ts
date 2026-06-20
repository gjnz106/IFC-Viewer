import * as THREE from 'three';
import { appState } from '../../state/index.js';

// ══════════════════════════════════════════════════════════════════════
// Note: viewCube is a local object that mirrors appState.viewCube.
// It is initialized in initViewCube() and assigned to appState.viewCube.
let viewCube: {
  scene: THREE.Scene | null;
  cam: THREE.OrthographicCamera | null;
  renderer: THREE.WebGLRenderer | null;
  mesh: THREE.Mesh | null;
  pickables: THREE.Object3D[];
  host?: HTMLElement;
} = {scene:null,cam:null,renderer:null,mesh:null,pickables:[]};

export function initViewCube(): void {
  const host=document.getElementById('viewCube');
  if(!host)return;

  // Dedicated renderer/scene/camera — rendered separately from main scene.
  // Using its own canvas avoids viewport/clipping-plane conflicts with main viewer.
  const vr=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:false});
  vr.setPixelRatio(Math.min(window.devicePixelRatio,2));
  vr.setSize(host.clientWidth,host.clientHeight);
  vr.setClearColor(0x000000,0);
  host.appendChild(vr.domElement);

  const vs=new THREE.Scene();
  const vc=new THREE.OrthographicCamera(-1.7,1.7,1.7,-1.7,0.1,100);
  vc.position.set(0,0,5);
  vc.lookAt(0,0,0);

  // Build the cube with labeled face textures.
  // Each face gets a canvas-drawn texture with a short label — mirrors Revit.
  const makeFaceTex=(label: string)=>{
    const c=document.createElement('canvas');
    c.width=c.height=128;
    const ctx=c.getContext('2d')!;
    // Background: off-white with subtle inner border
    ctx.fillStyle='#f4f5f7';
    ctx.fillRect(0,0,128,128);
    ctx.strokeStyle='#b0b8c9';
    ctx.lineWidth=3;
    ctx.strokeRect(1.5,1.5,125,125);
    // Label
    ctx.fillStyle='#4a5068';
    ctx.font='600 22px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(label,64,68);
    const tex=new THREE.CanvasTexture(c);
    tex.anisotropy=4;
    return tex;
  };
  // Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  // We treat world as Three's Y-up in the main scene, so:
  //   +Y=TOP  -Y=BOTTOM  -Z=FRONT  +Z=BACK  +X=RIGHT  -X=LEFT
  const labels=['RIGHT','LEFT','TOP','BOTTOM','BACK','FRONT'];
  const cubeMats=labels.map(l=>new THREE.MeshBasicMaterial({map:makeFaceTex(l)}));
  const cubeGeo=new THREE.BoxGeometry(1.3,1.3,1.3);
  const cubeMesh=new THREE.Mesh(cubeGeo,cubeMats);
  vs.add(cubeMesh);

  // Edge outline — thin black wire on top of the cube faces for definition
  const edges=new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeGeo),
    new THREE.LineBasicMaterial({color:0x8590a6,transparent:true,opacity:0.6})
  );
  cubeMesh.add(edges);

  // Subtle ground ring beneath the cube for visual anchor
  const ringGeo=new THREE.RingGeometry(1.1,1.25,48);
  const ringMat=new THREE.MeshBasicMaterial({color:0xd5d9e2,side:THREE.DoubleSide,transparent:true,opacity:0.5});
  const ring=new THREE.Mesh(ringGeo,ringMat);
  ring.rotation.x=-Math.PI/2;
  ring.position.y=-0.82;
  vs.add(ring);

  viewCube={scene:vs,cam:vc,renderer:vr,mesh:cubeMesh,host};
  // Sync local object to appState
  appState.viewCube=viewCube as any;

  // Click handling — raycast against the cube to determine which face was hit.
  // Each face maps to an orthogonal view direction for the main camera.
  const ray=new THREE.Raycaster();
  const m=new THREE.Vector2();
  host.addEventListener('pointerdown',ev=>{
    // Drag vs click: track pointer movement; if tiny, treat as click
    const startX=ev.clientX, startY=ev.clientY;
    let moved=false;
    const mv=(e: PointerEvent)=>{
      if(Math.abs(e.clientX-startX)>3||Math.abs(e.clientY-startY)>3)moved=true;
    };
    const up=(e: PointerEvent)=>{
      host.removeEventListener('pointermove',mv);
      host.removeEventListener('pointerup',up);
      if(moved)return; // drag: ignore (main camera OrbitControls already handles rotate)
      // Click: raycast the cube
      const r=host.getBoundingClientRect();
      m.x=((e.clientX-r.left)/r.width)*2-1;
      m.y=-((e.clientY-r.top)/r.height)*2+1;
      ray.setFromCamera(m,vc);
      const hits=ray.intersectObject(cubeMesh,false);
      if(!hits.length)return;
      const faceIdx=Math.floor(hits[0].faceIndex!/2); // 12 triangles → 6 faces
      snapMainCameraToFace(faceIdx);
    };
    host.addEventListener('pointermove',mv);
    host.addEventListener('pointerup',up,{once:true});
  });
}

// Map face index (0-5, matching BoxGeometry order +X/-X/+Y/-Y/+Z/-Z) to a main
// camera direction and snap to it. Preserves look-at target, adjusts distance to
// keep current framing.
export function snapMainCameraToFace(faceIdx: number): void {
  if(!appState.camera||!appState.controls)return;
  // Direction FROM target TO camera for each face, in Three-space (Y-up)
  const dirs=[
    new THREE.Vector3( 1, 0, 0), // RIGHT  (+X)
    new THREE.Vector3(-1, 0, 0), // LEFT   (-X)
    new THREE.Vector3( 0, 1, 0), // TOP    (+Y)
    new THREE.Vector3( 0,-1, 0), // BOTTOM (-Y)
    new THREE.Vector3( 0, 0, 1), // BACK   (+Z)
    new THREE.Vector3( 0, 0,-1), // FRONT  (-Z)
  ];
  const dir=dirs[faceIdx]||dirs[5];
  const target=appState.controls.target.clone();
  const currentDist=appState.camera.position.distanceTo(target)||20;
  const newPos=target.clone().addScaledVector(dir,currentDist);
  // Animate smoothly from current to new position for nicer feel
  animateCameraTo(newPos, target, 350);
}

// Tween camera position + target over `duration` ms. Avoids snap-teleport feel.
export function animateCameraTo(endPos: THREE.Vector3, endTarget: THREE.Vector3, duration=300): void {
  if(!appState.camera||!appState.controls)return;
  const startPos=appState.camera.position.clone();
  const startTarget=appState.controls.target.clone();
  const t0=performance.now();
  // Cancel any previous tween so rapid clicks don't fight each other
  if(window._camTweenId)cancelAnimationFrame(window._camTweenId);
  const step=()=>{
    const t=Math.min((performance.now()-t0)/duration,1);
    // ease-out cubic
    const e=1-Math.pow(1-t,3);
    appState.camera.position.lerpVectors(startPos,endPos,e);
    appState.controls.target.lerpVectors(startTarget,endTarget,e);
    appState.controls.update();
    if(t<1)window._camTweenId=requestAnimationFrame(step);
    else window._camTweenId=null;
  };
  step();
}

// Called every frame from the main render loop — syncs cube orientation with
// main camera and renders the cube's own scene. The cube rotates INVERSELY to
// the main camera so it always shows "which face you're currently looking at".
export function updateViewCube(): void {
  if(!viewCube.mesh||!viewCube.renderer||!appState.camera||!appState.controls)return;
  // Orientation: the cube face nearest the main camera should face the viewer.
  // Equivalent to: rotate cube by inverse of main-camera's view rotation around
  // its target. We use a matrix-based approach: build a matrix that looks FROM
  // target to camera, then use its inverse rotation for the cube.
  const m=new THREE.Matrix4();
  m.lookAt(appState.camera.position,appState.controls.target,appState.camera.up);
  // Extract rotation quaternion; cube's orientation = inverse (so facing viewer)
  const q=new THREE.Quaternion().setFromRotationMatrix(m);
  viewCube.mesh.quaternion.copy(q.invert());
  viewCube.renderer.render(viewCube.scene!,viewCube.cam!);
}
