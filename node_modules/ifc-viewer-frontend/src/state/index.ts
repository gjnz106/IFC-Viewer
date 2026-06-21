import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { IFCLoader } from 'web-ifc-three';
import type {
  ModelBounds,
  CompareResult,
  ColorizeState,
  SGState,
  AIIndex,
  ViewCubeState,
} from '../types/index.js';

// Central mutable application state.
// All modules import this object and read/write its properties in-place.
export const appState = {
  // ── Three.js core ───────────────────────────────────────────────────
  scene: null as unknown as THREE.Scene,
  camera: null as unknown as THREE.PerspectiveCamera,
  renderer: null as unknown as THREE.WebGLRenderer,
  controls: null as unknown as OrbitControls,
  ifcLoader: null as unknown as IFCLoader,

  // ── Model data ───────────────────────────────────────────────────────
  // slots 0,1 = Compare A/B; slots 2+ = federation discipline files
  files: [null, null] as (File | null)[],
  loadedModels: [null, null] as (any | null)[],
  compareResult: null as CompareResult | null,
  activeFilter: 'all' as string,

  // ── Federation ───────────────────────────────────────────────────────
  fedNextSlot: 2,

  // ── UI state ─────────────────────────────────────────────────────────
  ctxTarget: null as any,
  activeCategories: new Set<string>(),
  modelBounds: {
    min: new THREE.Vector3(),
    max: new THREE.Vector3(),
  } as ModelBounds,
  sharedCenterOffset: null as THREE.Vector3 | null,

  // ── Section / clipping ───────────────────────────────────────────────
  clipPlanes: [] as THREE.Plane[],
  sectionActive: false,

  // ── Colorize (managed by colorize module) ────────────────────────────
  colorize: {
    active: false,
    mode: 'auto',
    property: 'category',
    valueColors: {},
    valueVisible: {},
    rules: [],
    subsets: [],
    propsCache: [null, null],
  } as ColorizeState,

  // ── Validator ────────────────────────────────────────────────────────
  sgState: {
    results: null,
    gateway: 'BE',
    cachedCtx: null,
    cachedCtxKey: null,
    selectedRuleIdx: -1,
  } as SGState,

  // ── ViewCube ─────────────────────────────────────────────────────────
  viewCube: {
    scene: null,
    cam: null,
    renderer: null,
    mesh: null,
    pickables: [],
  } as ViewCubeState,

  // ── AI ───────────────────────────────────────────────────────────────
  aiIndex: null as AIIndex | null,
  aiIndexKey: null as string | null,

  // ── Walk ─────────────────────────────────────────────────────────────
  walkActive: false,

  // ── Compare / Issues ─────────────────────────────────────────────────
  issuesList: [] as any[],
  currentIssueIdx: -1,

  // ── Clash ────────────────────────────────────────────────────────────
  clashMode: false,
  clashResults: [] as any[],
};

export type AppState = typeof appState;
