import type * as THREE from 'three';

// ── IFC / Model types ──────────────────────────────────────────────────
export interface StoreyInfo {
  expressID: number;
  name: string;
  elevation: number;
}

export interface SpatialInfo {
  storeys: StoreyInfo[];
  siteName?: string;
  buildingName?: string;
  sites?: any[];
  trueNorthAngle?: number;
}

export interface LoadedModel {
  modelID: number;
  mesh?: THREE.Object3D;
  units?: {
    lengthFactor: number; lengthUnit: string;
    areaFactor: number; areaUnit: string;
    volumeFactor: number; volumeUnit: string;
  };
  spatial?: SpatialInfo;
  fileName?: string;
  visible?: boolean;
  [key: string]: any;
}

export interface ModelBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

// ── Router ─────────────────────────────────────────────────────────────
export type Page = 'viewer' | 'compare' | 'clash' | 'validate' | 'field';

// ── Compare types ──────────────────────────────────────────────────────
export type CompareStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface CompareItem {
  globalId: string;
  type: string;
  name: string;
  tag?: string;
  status: CompareStatus;
  details?: string;
  expressIdA?: number;
  expressIdB?: number;
  modelIdA?: number;
  modelIdB?: number;
}

export interface CompareEntity {
  gid: string;
  entity?: any;
  a?: any;
  b?: any;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  diffs?: any[];
}

export interface CompareResult {
  added: CompareEntity[];
  removed: CompareEntity[];
  modified: CompareEntity[];
  unchanged: CompareEntity[];
}

// ── Colorize types ─────────────────────────────────────────────────────
export interface ColorizeCondition {
  prop: string;
  op: 'equals' | 'contains' | 'starts' | 'ne';
  value: string;
}

export interface ColorizeRule {
  id: string;
  name: string;
  color: string;
  conditions: ColorizeCondition[];
}

export interface ColorizeState {
  active: boolean;
  mode: 'auto' | 'rules';
  property: 'category' | 'type' | 'name' | 'tag' | 'file';
  valueColors: Record<string, string>;
  valueVisible: Record<string, boolean>;
  rules: ColorizeRule[];
  subsets: THREE.Mesh[];
  propsCache: [any, any];
}

// ── Clash Detection types ──────────────────────────────────────────────
export interface ClashRuleRow {
  side: 'A' | 'B';
  category: string;
  property?: string;
  value?: string;
}

export interface ClashResult {
  indexA: number;
  indexB: number;
  expressIdA: number;
  expressIdB: number;
  modelIdA: number;
  modelIdB: number;
  point: THREE.Vector3;
  distance: number;
  nameA?: string;
  nameB?: string;
  typeA?: string;
  typeB?: string;
}

// ── Validator types ────────────────────────────────────────────────────
export interface SGValidationContext {
  entities: any[];
  byClass: Map<string, any[]>;
  modelIDs: any[];
  gateway: string;
}

export interface SGRuleResult {
  ruleId?: string;
  expressId?: number;
  modelId?: number;
  status?: 'pass' | 'fail' | 'warning';
  message?: string;
  element?: string;
  [key: string]: any;
}

export interface SGRule {
  id: string;
  agency: string;
  gateway: string | string[];
  category: string;
  severity?: string;
  check: (ctx: SGValidationContext) => any;
  description?: string;
}

export interface SGState {
  open?: boolean;
  results: { rules: any[]; stats: any } | null;
  gateway: string;
  cachedCtx: SGValidationContext | null;
  cachedCtxKey: string | null;
  selectedRuleIdx: number;
}

// ── Section / Clip types ───────────────────────────────────────────────
export interface SectionState {
  active: boolean;
  box: {
    xMin: number; xMax: number;
    yMin: number; yMax: number;
    zMin: number; zMax: number;
  };
}

// ── Measure types ──────────────────────────────────────────────────────
export type MeasureMode = 'distance' | 'level' | null;

export interface MeasurePoint {
  position: THREE.Vector3;
  marker: THREE.Object3D;
}

// ── Plan overlay types ─────────────────────────────────────────────────
export interface PlanView {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  canvas: HTMLCanvasElement;
  dirty: boolean;
  follow: boolean;
  currentStoreyIdx: number;
}

// ── Google Drive types ─────────────────────────────────────────────────
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

// ── AI types ──────────────────────────────────────────────────────────
export interface AIElement {
  modelId: number;
  expressId: number;
  type: string;
  category: string;
  name: string;
  tag?: string;
  storey?: string;
  materials?: string[];
  area?: number;
  volume?: number;
  length?: number;
}

export interface AIIndex {
  elements: AIElement[];
  modelIds: number[];
  builtAt: number;
}

// ── Walk mode types ───────────────────────────────────────────────────
export interface WalkState {
  active: boolean;
  speed: number;
  yaw: number;
  pitch: number;
  keys: Record<string, boolean>;
}

// ── ViewCube types ────────────────────────────────────────────────────
export interface ViewCubeState {
  scene: THREE.Scene | null;
  cam: THREE.OrthographicCamera | null;
  renderer: THREE.WebGLRenderer | null;
  mesh: THREE.Mesh | null;
  pickables: THREE.Object3D[];
  host?: HTMLElement;
}

// ── Window interface extensions ───────────────────────────────────────
declare global {
  interface Window {
    // Router (hash-based page navigation)
    navigateTo?: (page: Page) => void;

    // Viewer core
    zoomFit?: () => void;
    resetCam?: () => void;
    toggleWire?: () => void;
    captureScreenshot?: () => void;
    _camTweenId?: number | null;
    _zoomState?: {
      accum: number;
      pivot: THREE.Vector3;
      pivotValid: boolean;
      stepBase: number;
      easing: number;
    };

    // Auth
    checkVerifiedNow?: () => void;
    signOutFromVerify?: () => void;
    showResetView?: () => void;
    toggleUserMenu?: () => void;
    doLogout?: () => void;
    getAuthToken?: () => Promise<string | null>;
    isAdmin?: boolean;

    // Properties
    showProps?: (expressId: number, modelId: number) => void;
    propAccordionToggle?: (hdr: HTMLElement) => void;
    propAccordionToggleAll?: (expand: boolean) => void;
    rpSelect?: (tab: 'props' | 'sg') => void;

    // Compare
    exitCompare?: () => void;
    resetSection?: () => void;
    focusSectionOnChanges?: () => void;
    renderTree?: () => void;
    togG?: (h: HTMLElement) => void;
    selI?: (gid: string) => void;
    navIssue?: (dir: number) => void;
    exportCSV?: () => void;
    exportBCF?: () => Promise<void>;
    buildIssues?: () => void;
    runCompare?: (a: Record<string, any>, b: Record<string, any>) => any;

    // File handling
    handleFile?: (idx: number) => Promise<void>;

    // Measure
    setMeasureMode?: (type: MeasureMode) => void;
    toggleMeasure?: () => void;
    clearMeasure?: () => void;
    setGlobalOpacity?: (val: number) => void;

    // Category filter
    toggleCatDropdown?: () => void;
    filterCatDropdown?: () => void;
    onCatCheck?: () => void;
    catSelectAll?: () => void;
    catSelectNone?: () => void;
    catSelectChanged?: () => void;
    removeCatTag?: (cat: string) => void;
    toggleModelVis?: (idx: number) => void;
    setFilter?: (f: string) => void;
    switchTab?: (tab: string) => void;
    focusIssue?: (idx: number) => void;

    // Colorize
    toggleColorize?: () => Promise<void>;
    _colorizeInvalidate?: (modelIdx: number) => void;
    colorizeSetProp?: (v: string) => void;
    colorizeSetMode?: (mode: string) => void;
    applyColorize?: () => Promise<void>;
    colorizeAddRule?: () => void;
    colorizeDeleteRule?: (idx: number) => void;
    colorizeSetRuleColor?: (idx: number, color: string) => void;
    colorizeSetRuleName?: (idx: number, name: string) => void;
    colorizeAddCondition?: (ruleIdx: number) => void;
    colorizeRemoveCondition?: (ruleIdx: number, condIdx: number) => void;
    colorizeUpdateCondition?: (ruleIdx: number, condIdx: number, field: string, value: string) => void;
    colorizeSetColor?: (key: string, color: string) => void;
    colorizeToggleValue?: (key: string) => void;
    colorizeResetColors?: () => void;
    colorizeClear?: () => void;
    colorizeToggleCollapse?: () => void;
    colorizeSaveScheme?: (name: string) => void;
    colorizeToggleSchemesPanel?: () => void;
    colorizeLoadScheme?: (name: string) => void;
    colorizeDeleteScheme?: (name: string) => void;

    // UI shell (header / panel toggles)
    toggleLeftPanel?: () => void;
    toggleRightPanel?: () => void;
    toggleExportMenu?: () => void;
    openRightPanel?: () => void;

    // Section
    toggleSectionBox?: () => void;

    // Federation
    fedAddSlot?: () => void;
    fedHandleFile?: (ev: Event) => void;
    fedRemoveSlot?: (idx: number) => void;
    fedToggleVis?: (idx: number) => void;

    // Clash
    addClashRow?: (side: 'A' | 'B') => void;
    removeLastClashRow?: (side: 'A' | 'B') => void;
    deleteClashRow?: (side: 'A' | 'B', idx: number) => void;
    updateClashRow?: (side: 'A' | 'B', idx: number, field: string, value: string) => void;
    applyClashPreset?: (presetKey: string) => void;
    swapClashSets?: () => void;
    toggleClashMode?: () => void;
    exitClashMode?: () => void;
    runClashDetection?: () => Promise<void>;
    regroupClashes?: () => void;
    toggleClashGroup?: (gid: string) => void;
    focusClash?: (idx: number) => void;
    exportClashCSV?: () => void;
    exportClashBCF?: () => Promise<void>;

    // Walk
    toggleWalkMode?: () => void;
    walkTouchUD?: (dir: 'up' | 'down', pressed: boolean) => void;

    // Plan overlay
    togglePlanOverlay?: () => void;
    planSelectStorey?: (idxStr: string) => void;
    planFit?: () => void;
    planToggleFollow?: () => void;
    requestPlanRender?: () => void;
    requestPlanRebuild?: () => void;

    // Validator
    toggleSGCheckPanel?: () => void;
    sgExportReport?: () => Promise<void>;
    sgExportBCF?: () => Promise<void>;
    sgLoadJsonDialog?: () => void;
    sgCloseJsonDialog?: () => void;
    sgHandleJsonFile?: (ev: Event) => void;
    sgLoadBuiltinRules?: () => void;
    sgResetToBuiltin?: () => void;
    sgExportSampleJson?: () => void;
    sgRunValidation?: () => Promise<void>;
    sgSelectRule?: (idx: number) => void;
    sgFocusElement?: (eid: number) => void;
    sgChangeGateway?: () => void;

    // Drive
    odToggle?: () => void;
    gdLogin?: () => void;
    gdOpenFolder?: (folderId: string, folderName: string) => void;
    gdNavigateTo?: (idx: number) => void;
    gdLoadFile?: (fileId: string, fileName: string) => Promise<void>;
    gdLogout?: () => void;

    // Search
    searchSelect?: (idx: number) => Promise<void>;
    searchIsolateAll?: () => void;
    searchHideAll?: () => void;
    searchSelectAll?: () => void;
    searchClear?: () => void;
    searchToggleChip?: (el: HTMLElement, mode: string) => void;
    searchToggleAdvanced?: () => void;

    // Field mode
    fieldActive?: boolean;
    fieldEnterMode?: () => void;
    fieldExitMode?: () => void;
    fieldOpenLoader?: () => void;
    fieldCloseLoader?: () => void;
    fieldLoadFile?: (ev: Event) => Promise<void>;
    fieldCloseSheet?: () => void;
    fieldOpenSheet?: (html: string, title: string) => void;
    fieldToggleSection?: () => void;
    fieldToggleMeasure?: () => void;
    fieldToggleWalk?: () => void;
    fieldScreenshot?: () => void;
    fieldShowAll?: () => void;
    fieldToggleStoreys?: () => void;
    fieldSelectStorey?: (idx: number, elevation: number) => void;
    fieldTogglePlan2D?: () => void;
    fieldOpenPlan2D?: () => void;
    fieldClosePlan2D?: () => void;
    fieldPlan2DSelectStorey?: (idx: number) => void;

    // AI
    aiIndexSummary?: () => void;
    buildAIIndex?: () => Promise<void>;
    countElements?: (...args: any[]) => any;
    sumQuantity?: (...args: any[]) => any;
    runAITool?: (name: string, args: any) => any;
    AI_TOOLS?: any[];

    // Context menu / color-schemes
    ctxAction?: (action: string, extra?: any) => void;
    showAllHidden?: () => void;

    // Internal state
    _catData?: Record<string, any>;
    _catModelIDs?: number[];
    _pendingPivot?: THREE.Vector3 | null;
    _vpResize?: () => void;
    _hlMat?: any;
    _lastHL?: { subset: any; mid: number } | null;
    dragHandle?: any;
    getAllProps?: (modelID: number) => Promise<Record<string, any>>;
    findModelIdx?: (obj: any) => number;
    clearHighlight?: () => void;
    initIFC?: () => Promise<boolean>;
    loadIFC?: (idx: number) => Promise<void>;
    escapeHtml?: (s: string) => string;
    DEBUG?: boolean;
    IFC_NAMES?: Record<number, string>;
    measureMode?: boolean;
    measurePoints?: any[];
    addMeasurePoint?: (pt: any) => void;
    updateSectionFromSliders?: () => void;
    storey?: number | null;
  }
}

export {};
