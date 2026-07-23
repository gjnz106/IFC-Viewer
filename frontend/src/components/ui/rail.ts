// ── v5 shell: icon rail + status bar wiring ──────────────────────────────
// Pure DOM glue for the icon rail (Files/Tree/Issues/Search) that drives the
// left panel's #lpFiles/#lpModel sections, plus the bottom status bar. No
// appState dependency beyond what's already exposed on window by other
// modules (switchTab, issue count text) — this module only touches the DOM.

type RailTab = 'files' | 'tree' | 'issues' | 'search' | 'overview' | 'team' | 'invite' | 'settings';
let _railTab: RailTab = 'overview';

function updateRailActive(): void {
  (['files', 'tree', 'issues', 'search', 'overview', 'team', 'invite', 'settings'] as const).forEach((t) => {
    document.getElementById('rail-' + t)?.classList.toggle('active', _railTab === t && !isLeftCollapsed());
  });
}

function isLeftCollapsed(): boolean {
  return document.getElementById('leftPanel')?.style.display === 'none';
}

const RAIL_TITLES: Record<string, string> = {
  overview: 'Navigation',
  files: 'Model Files',
  tree: 'Entity Tree',
  issues: 'Changes',
  search: 'Search',
  team: 'Team Workloads',
  invite: 'Invite Members',
  settings: 'Project Settings',
};

function showLeftPanel(): void {
  const p = document.getElementById('leftPanel');
  const btn = document.getElementById('btnToggleLeft');
  if (p) p.style.display = 'flex';
  btn?.classList.add('hdr-panel-btn-active');
  document.getElementById('app')?.classList.remove('left-collapsed');
  (window as any)._vpResize?.();
}

// Clicking a rail button: show its section, and if it's the already-active
// tab, collapse the left panel instead (matches the icon-rail toggle pattern
// used elsewhere in the shell).
(window as any).railSelect = function (tab: RailTab): void {
  if (tab === 'team') {
    (window as any).toggleTeamPanel?.();
    return;
  }
  if (tab === 'invite') {
    (window as any).toggleInvitePanel?.();
    return;
  }
  if (tab === 'settings') {
    (window as any).toggleSettingsPanel?.();
    return;
  }
  const alreadyOpen = !isLeftCollapsed();
  if (alreadyOpen && _railTab === tab) {
    (window as any).toggleLeftPanel?.();
    updateRailActive();
    return;
  }
  _railTab = tab;
  showLeftPanel();
  const files = document.getElementById('lpFiles');
  const model = document.getElementById('lpModel');
  const overview = document.getElementById('lpOverview');
  const title = document.getElementById('lpHeadTitle');
  files?.classList.toggle('hide', tab !== 'files');
  overview?.classList.toggle('hide', tab !== 'overview');
  model?.classList.toggle('hide', tab === 'files' || tab === 'overview');
  if (tab === 'overview') {
    (window as any).navRefresh?.();  // renders the active Navigation tab (Models/Objects/Structure)
  } else if (tab !== 'files') {
    (window as any).switchTab?.(tab);
  }
  if (title) title.textContent = RAIL_TITLES[tab] || '';
  updateRailActive();
};

(window as any).railCollapse = function (): void {
  (window as any).toggleLeftPanel?.();
  updateRailActive();
};

// switchTab() (compare.ts) is also called programmatically (e.g. after a
// compare run always jumps to the Issues tab) — keep the rail's own active
// state and left-panel section in sync whenever that happens from elsewhere.
(function wrapSwitchTab() {
  const orig = (window as any).switchTab;
  if (typeof orig !== 'function' || (orig as any)._railWrapped) return;
  const wrapped = function (tab: string) {
    orig(tab);
    if (tab === 'tree' || tab === 'issues' || tab === 'search') {
      _railTab = tab as any;
      showLeftPanel();
      document.getElementById('lpFiles')?.classList.add('hide');
      document.getElementById('lpOverview')?.classList.add('hide');
      document.getElementById('lpModel')?.classList.remove('hide');
      const title = document.getElementById('lpHeadTitle');
      if (title) title.textContent = RAIL_TITLES[tab];
      updateRailActive();
    }
  };
  (wrapped as any)._railWrapped = true;
  (window as any).switchTab = wrapped;
})();

// Mirror the Issues tab's change count onto the rail badge.
(function watchIssueCount() {
  const src = document.getElementById('issueCount');
  if (!src) return;
  const sync = () => {
    const n = parseInt(src.textContent || '0', 10) || 0;
    const badge = document.getElementById('railIssueBadge');
    if (badge) {
      badge.textContent = String(n);
      badge.classList.toggle('show', n > 0);
    }
  };
  new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  sync();
})();

// ── Status bar: mode dot + label + info, driven by the router's page events ──
const MODE_META: Record<string, { color: string; label: string }> = {
  viewer: { color: 'var(--indigo)', label: '3D Viewer' },
  compare: { color: 'var(--amber)', label: 'Version Compare' },
  clash: { color: 'var(--red)', label: 'Clash Detection' },
  validate: { color: 'var(--green)', label: 'SG Validate' },
  field: { color: 'var(--green)', label: 'Field Mode' },
};

window.addEventListener('ifc:pagechange', (e: Event) => {
  const page = (e as CustomEvent).detail?.page as string | undefined;
  const meta = (page && MODE_META[page]) || MODE_META.viewer;
  const dot = document.getElementById('sbDot');
  const lbl = document.getElementById('sbModeLbl');
  if (dot) dot.style.background = meta.color;
  if (lbl) lbl.textContent = meta.label;
});

updateRailActive();
