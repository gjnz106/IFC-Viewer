// Ambient declarations for the IFC Delta standalone build.
//
// The src/app/*.ts feature files share ONE module scope: the build
// concatenates them and injects the CDN imports at the very top (see
// build.ts). On disk the feature files therefore have no import/export, so
// TypeScript treats them as scripts sharing a single global scope — exactly
// the runtime model. These ambient declarations stand in for the symbols the
// injected header imports, plus the bare CDN module specifiers resolved by
// the import map in index.html.

// ── Injected library bindings (runtime: import * / named imports) ──
declare const THREE: any;
declare const OrbitControls: any;
declare const IFCLoader: any;

// ── web-ifc entity type constants ──
declare const IFCSPACE: number;
declare const IFCOPENINGELEMENT: number;
declare const IFCWALL: number;
declare const IFCWALLSTANDARDCASE: number;
declare const IFCSLAB: number;
declare const IFCCOLUMN: number;
declare const IFCBEAM: number;
declare const IFCDOOR: number;
declare const IFCWINDOW: number;
declare const IFCROOF: number;
declare const IFCSTAIR: number;
declare const IFCRAILING: number;
declare const IFCPLATE: number;
declare const IFCMEMBER: number;
declare const IFCCURTAINWALL: number;
declare const IFCFOOTING: number;
declare const IFCBUILDINGELEMENTPROXY: number;
declare const IFCFURNISHINGELEMENT: number;
declare const IFCFLOWSEGMENT: number;
declare const IFCFLOWTERMINAL: number;
declare const IFCFLOWFITTING: number;
declare const IFCSITE: number;
declare const IFCBUILDING: number;
declare const IFCBUILDINGSTOREY: number;
declare const IFCPROJECT: number;
declare const IFCSTAIRFLIGHT: number;

// ── Bare CDN specifiers (resolved at runtime by the import map) ──
declare module 'three';
declare module 'three/addons/controls/OrbitControls.js';
declare module 'web-ifc-three';
declare module 'web-ifc';

// ── Firebase URL modules used by js/auth.ts ──
declare module 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
declare module 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';

// ── Other CDN ESM modules imported dynamically at runtime ──
declare module 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';

// ── Third-party globals loaded via <script>/CDN ──
declare const JSZip: any;
declare const google: any;
declare const gapi: any;

// App handlers assigned onto window (called from inline HTML onclick=…)
// are also referenced bare across feature files; declare them as globals.
interface Window { [key: string]: any; }
declare function applyColorize(...args: any[]): any;
declare function captureScreenshot(...args: any[]): any;
declare function clearMeasure(...args: any[]): any;
declare function colorizeClear(...args: any[]): any;
declare function exitClashMode(...args: any[]): any;
declare function exitCompare(...args: any[]): any;
declare function fieldCloseLoader(...args: any[]): any;
declare function fieldClosePlan2D(...args: any[]): any;
declare function fieldCloseSheet(...args: any[]): any;
declare function fieldEnterMode(...args: any[]): any;
declare function fieldOpenPlan2D(...args: any[]): any;
declare function fieldOpenSheet(...args: any[]): any;
declare function fieldPlan2DSelectStorey(...args: any[]): any;
declare function focusIssue(...args: any[]): any;
declare function onCatCheck(...args: any[]): any;
declare function planFit(...args: any[]): any;
declare function planSelectStorey(...args: any[]): any;
declare function renderTree(...args: any[]): any;
declare function requestPlanRender(...args: any[]): any;
declare function searchSelect(...args: any[]): any;
declare function setMeasureMode(...args: any[]): any;
declare function sgSelectRule(...args: any[]): any;
declare function showAllHidden(...args: any[]): any;
declare function switchTab(...args: any[]): any;
declare function toggleClashMode(...args: any[]): any;
declare function toggleMeasure(...args: any[]): any;
declare function toggleSectionBox(...args: any[]): any;
declare function toggleWalkMode(...args: any[]): any;
declare function zoomFit(...args: any[]): any;
