// ── UI shell controls ────────────────────────────────────────────────
// Small header/panel handlers that were previously an inline <script> in
// index.html. They only touch the DOM, so they live here as a leaf module
// with no app-state dependencies. Exposed on window because the markup
// wires them through onclick="…" attributes.

// Panel toggles — the button's active (dark) state always mirrors whether
// its panel is visible. Uses computed display so it can't desync from the
// initial inline styles.
function setPanel(panelId: string, btnId: string, collapsedClass: string, open: boolean): void {
  const p = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const app = document.getElementById('app');
  if (!p || !btn) return;
  p.style.display = open ? 'flex' : 'none';
  if (open) p.style.flexDirection = 'column';
  btn.classList.toggle('hdr-panel-btn-active', open);
  app?.classList.toggle(collapsedClass, !open);
  (window as any)._vpResize?.();
}

window.toggleLeftPanel = function (): void {
  const p = document.getElementById('leftPanel');
  if (!p) return;
  setPanel('leftPanel', 'btnToggleLeft', 'left-collapsed', getComputedStyle(p).display === 'none');
};

window.toggleRightPanel = function (): void {
  const p = document.getElementById('rightPanel');
  if (!p) return;
  setPanel('rightPanel', 'btnToggleRight', 'right-collapsed', getComputedStyle(p).display === 'none');
};

// .topbar sets only overflow-x, which per the CSS spec implicitly computes
// overflow-y to auto too — any position:absolute dropdown nested inside it
// (export/help/notification menus) gets silently clipped past the topbar's
// height instead of showing (same root cause fixed for the account-menu
// dropdown in auth.ts's toggleUserMenu). Switch to position:fixed with
// placement computed from the trigger button so it escapes that clip box.
export function positionDropdownFixed(el: HTMLElement, trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.top = (rect.bottom + 8) + 'px';
  el.style.right = (window.innerWidth - rect.right) + 'px';
  el.style.left = 'auto';
}

window.toggleExportMenu = function (): void {
  const d = document.getElementById('exportMenuDrop') as HTMLElement | null;
  const bg = document.getElementById('exportMenuBg') as HTMLElement | null;
  const btn = document.getElementById('btnExportMenu') as HTMLElement | null;
  if (!d || !bg) return;
  const open = d.style.display !== 'none';
  if (!open && btn) positionDropdownFixed(d, btn);
  d.style.display = open ? 'none' : 'block';
  bg.style.display = open ? 'none' : 'block';
};

// Reveal the Properties (right) panel and light its toggle. Called when an
// element is selected so its properties are visible even though the panel
// starts closed. No-op in Field Mode, which mirrors properties into its own
// bottom sheet instead.
window.openRightPanel = function (): void {
  if (document.body.classList.contains('field-mode')) return;
  const p = document.getElementById('rightPanel');
  if (!p) return;
  p.style.display = 'flex';
  p.style.flexDirection = 'column';
  document.getElementById('btnToggleRight')?.classList.add('hdr-panel-btn-active');
  document.getElementById('app')?.classList.remove('right-collapsed');
  (window as any)._vpResize?.();
};

// Auto-open the Properties panel whenever real property content is rendered
// into #propArea (any selection path: 3D click, compare, clash, search, …).
// Empty/placeholder states use the `.prop-empty` class, so they don't trigger
// it. Only opens — never auto-closes — so it can't fight a manual toggle.
(() => {
  const propArea = document.getElementById('propArea');
  if (!propArea) return;
  new MutationObserver(() => {
    if (!propArea.querySelector('.prop-empty') && propArea.children.length > 0) {
      window.openRightPanel!();
    }
  }).observe(propArea, { childList: true });
})();

// Colorize "Color by" segmented control — drives the (hidden) #czProp select
// that colorize.ts reads, then re-applies the colorize pass.
window.colorizeSetProp = function (v: string): void {
  const sel = document.getElementById('czProp') as HTMLSelectElement | null;
  if (sel) sel.value = v;
  document.querySelectorAll('#czSeg .cz-seg-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-v') === v);
  });
  if ((window as any).applyColorize) (window as any).applyColorize();
};

// ── IDD Sync Extras (Settings, Team, Invite, Notifications, Help Hub) ──

(window as any).toggleSettingsPanel = function (): void {
  const el = document.getElementById('settingsOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    if (!open) {
      (window as any).projFillSettings?.();
      (window as any).projFillSettingsUnits?.();
      el.style.display = 'flex';
    } else {
      (window as any).projSaveSettings?.();
      el.style.display = 'none';
    }
  }
};

(window as any).toggleTeamPanel = function (): void {
  const el = document.getElementById('teamOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
    // Fill with the active cloud project's real member list on open
    // (renderTeamPanel lives in projects.ts, which owns the cloud state).
    // Paint from cache first, then refetch so a role changed by the owner
    // shows up here without needing a full page reload.
    if (!open) {
      (window as any).renderTeamPanel?.();
      (window as any).refreshMembershipPanels?.();
    }
  }
};

(window as any).toggleProfilePanel = function (): void {
  const el = document.getElementById('profileOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
  }
};

// Real member-management body populated by projects.ts (renderMembersPanel)
// — kept a no-op here on open (projects.ts owns the cloud-project state
// needed to decide owner-vs-readonly, so it hooks its own render on top).
(window as any).toggleInvitePanel = function (): void {
  const el = document.getElementById('inviteOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    if (!open) (window as any).renderMembersPanel?.();
    el.style.display = open ? 'none' : 'flex';
    // Same staleness problem as the Team panel — repaint from the server once
    // the overlay is visible so the role dropdowns reflect reality.
    if (!open) (window as any).refreshMembershipPanels?.();
  }
};

(window as any).toggleNotifMenu = function (): void {
  const el = document.getElementById('notifMenuDrop') as HTMLElement | null;
  const bg = document.getElementById('notifMenuBg');
  const btn = document.getElementById('btnNotif') as HTMLElement | null;
  if (el && bg) {
    const open = el.style.display !== 'none';
    if (!open && btn) positionDropdownFixed(el, btn);
    el.style.display = open ? 'none' : 'block';
    bg.style.display = open ? 'none' : 'block';
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  }
};

(window as any).toggleHelpMenu = function (): void {
  const el = document.getElementById('helpMenuDrop') as HTMLElement | null;
  const bg = document.getElementById('helpMenuBg');
  const btn = document.getElementById('btnHelp') as HTMLElement | null;
  if (el && bg) {
    const open = el.style.display !== 'none';
    if (!open && btn) positionDropdownFixed(el, btn);
    el.style.display = open ? 'none' : 'block';
    bg.style.display = open ? 'none' : 'block';
  }
};

// ── Navigation guide overlay ──────────────────────────────────────────────
// Shown once (like BIMcollab's onboarding hint) the first time a model
// appears in an empty viewport — see the wasEmpty check around loadIFC() in
// section-visibility.ts. Dismissal is remembered in localStorage so it
// doesn't reappear on every subsequent load; reachable again anytime via
// Help Hub → "Navigation guide" (which passes force=true).
const NAV_HELP_DISMISSED_KEY = 'ifc.navHelpDismissed';

window.closeNavHelp = function (): void {
  document.getElementById('navHelpOverlay')?.classList.remove('on');
  try { localStorage.setItem(NAV_HELP_DISMISSED_KEY, '1'); } catch { /* storage quota — ignore */ }
};

window.showNavHelp = function (force = false): void {
  // Field Mode has its own bottom toolbar occupying the same screen region —
  // this overlay would visually stack on top of it (CSS also hard-hides it
  // there, but skip flipping the class at all rather than leaving stale
  // "on" state that could flash before the field-mode stylesheet applies).
  if (document.body.classList.contains('field-mode')) return;
  if (!force) {
    try {
      if (localStorage.getItem(NAV_HELP_DISMISSED_KEY) === '1') return;
    } catch { /* private mode — fall through and show anyway */ }
  }
  document.getElementById('navHelpOverlay')?.classList.add('on');
};

(window as any).clearNotifs = function (): void {
  const list = document.getElementById('notifList');
  if (list) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#8590a6;font-size:13.2px">No new notifications</div>';
  }
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';
};

