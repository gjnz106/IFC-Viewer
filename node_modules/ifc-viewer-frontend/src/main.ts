// ── Auth must load first (shows overlay if not signed in) ────────────────
import './auth.js';

// ── Core modules (order matters: state → utilities → Three.js → features) ─
import { initThree, log } from './modules/core/viewer-core.js';
import { initViewCube } from './modules/core/viewcube.js';
import './modules/core/ifc-category.js';
import './modules/tools/colorize.js';
import './modules/tools/color-schemes.js';
import './modules/tools/section-visibility.js';
import './modules/compare/federation-load.js';
import './modules/compare/compare.js';
import './modules/inspect/properties.js';
import './modules/tools/measure.js';
import './modules/tools/focus-highlight.js';
import './modules/compare/clash.js';
import './modules/tools/walk.js';
import './modules/tools/plan-overlay.js';
import './modules/validate/validator-rules.js';
import './modules/validate/validator-json-loader.js';
import './modules/validate/validator-export.js';
import './modules/integrations/drive.js';
import './modules/inspect/search.js';
import './modules/ui/fieldmode.js';
import './modules/integrations/ai.js';
import './modules/ui/ui-shell.js';

// ── Initialize the viewer ─────────────────────────────────────────────────
initThree();
// initSectionDrag is registered from color-schemes.ts via window or exported
if (typeof (window as any).initSectionDrag === 'function') {
  (window as any).initSectionDrag();
}
initViewCube();
log('IFC Delta ready');
