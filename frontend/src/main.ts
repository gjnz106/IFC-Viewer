// ── Auth must load first (shows overlay if not signed in) ────────────────
import './auth.js';

// ── Core modules (order matters: state → utilities → Three.js → features) ─
import { initThree, log } from './modules/viewer-core.js';
import { initViewCube } from './modules/viewcube.js';
import './modules/ifc-category.js';
import './modules/colorize.js';
import './modules/color-schemes.js';
import './modules/section-visibility.js';
import './modules/federation-load.js';
import './modules/compare.js';
import './modules/properties.js';
import './modules/measure.js';
import './modules/focus-highlight.js';
import './modules/clash.js';
import './modules/walk.js';
import './modules/plan-overlay.js';
import './modules/validator-rules.js';
import './modules/validator-json-loader.js';
import './modules/validator-export.js';
import './modules/drive.js';
import './modules/search.js';
import './modules/fieldmode.js';
import './modules/ai.js';
import './modules/ui-shell.js';

// ── Initialize the viewer ─────────────────────────────────────────────────
initThree();
// initSectionDrag is registered from color-schemes.ts via window or exported
if (typeof (window as any).initSectionDrag === 'function') {
  (window as any).initSectionDrag();
}
initViewCube();
log('IFC Delta ready');
