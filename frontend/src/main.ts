// ── Auth must load first (shows overlay if not signed in) ────────────────
import './lib/auth.js';

// ── Core modules (order matters: state → utilities → Three.js → features) ─
import { initThree, log } from './components/core/viewer-core.js';
import { initViewCube } from './components/core/viewcube.js';
import './components/core/ifc-category.js';
import './components/tools/colorize.js';
import './components/tools/color-schemes.js';
import './components/tools/section-visibility.js';
import './components/compare/federation-load.js';
import './components/compare/compare.js';
import './components/inspect/properties.js';
import './components/tools/measure.js';
import './components/tools/coordinates.js';
import './components/tools/focus-highlight.js';
import './components/compare/clash.js';
import './components/compare/cross-discipline-run.js';
import './components/compare/compare-slider.js';
import './components/tools/walk.js';
import './components/tools/plan-overlay.js';
import './components/validate/validator-rules.js';
import './components/validate/validator-json-loader.js';
import './components/validate/validator-export.js';
import './components/integrations/drive.js';
import './components/inspect/search.js';
import './components/ui/fieldmode.js';
import './components/integrations/ai.js';
import './components/ui/ui-shell.js';
import { initRouter } from './components/ui/router.js';
import { initStatePersist } from './components/ui/state-persist.js';

// ── Initialize the viewer ─────────────────────────────────────────────────
initThree();
if (typeof (window as any).initSectionDrag === 'function') {
  (window as any).initSectionDrag();
}
initViewCube();
initStatePersist();  // restore UI prefs from localStorage
initRouter();        // set up hash routing + restore last page
log('T3LAB.IFC ready');
