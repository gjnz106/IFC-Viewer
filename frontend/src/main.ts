// ── Auth must load first (shows overlay if not signed in) ────────────────
import './lib/auth.js';

// ── Core modules (order matters: state → utilities → Three.js → features) ─
import { initThree, log } from './components/core/viewer-core.js';
import { initViewCube } from './components/core/viewcube.js';
import './components/core/ifc-category.js';
import './components/tools/colorize.js';
import './components/tools/color-schemes.js';
import './components/tools/viewpoints.js';
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
import './components/tools/fly-nav.js';
import './components/tools/plan-overlay.js';
import './components/validate/validator-rules.js';
import './components/validate/validator-json-loader.js';
import './components/validate/validator-export.js';
import './components/inspect/search.js';
import './components/inspect/overview-tree.js';
import './components/inspect/navigation-panel.js';
import './components/ui/fieldmode.js';
import './components/ui/ui-shell.js';
import './components/ui/projects.js';
import './components/ui/rail.js';
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
log('IFC Viewer ready');

// AI data-index module isn't wired to any startup UI (console debug tool
// only, window.aiIndexSummary()) and nothing else imports it, so defer its
// ~cost out of the critical bundle — load once the browser is idle instead
// of blocking first paint / interactivity.
const _loadAI = () => import('./components/integrations/ai.js');
if ('requestIdleCallback' in window) (window as any).requestIdleCallback(_loadAI);
else setTimeout(_loadAI, 2000);
