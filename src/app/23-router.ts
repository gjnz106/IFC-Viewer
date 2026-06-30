// Hash-based client-side router for T3LAB.IFC (standalone build)
// Each page maps to existing window.* mode-switching globals.
// The sidebar nav buttons update the hash; this module reacts to hashchange.

type Page = 'viewer' | 'compare' | 'clash' | 'validate' | 'field';

const PAGE_LABELS: Record<Page, string> = {
  viewer:   '3D Viewer',
  compare:  'Version Compare',
  clash:    'Clash Detection',
  validate: 'SG Validate',
  field:    'Field Mode',
};

let activePage: Page = 'viewer';

function hashToPage(): Page {
  const h = window.location.hash.slice(1) as Page;
  return h in PAGE_LABELS ? h : 'viewer';
}

function syncNav(page: Page) {
  document.querySelectorAll<HTMLElement>('.sb-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const lbl = document.getElementById('headerModeLbl');
  if (lbl) lbl.textContent = PAGE_LABELS[page];
}

function applyPage(page: Page, isInit = false) {
  if (page === activePage && !isInit) return;
  activePage = page;
  syncNav(page);

  // Toggle GDrive panel visibility based on page mode (only in compare)
  const odPanel = document.getElementById('odPanel');
  const odPanelSep = document.getElementById('odPanelSep');
  if (odPanel) odPanel.style.display = page === 'compare' ? 'block' : 'none';
  if (odPanelSep) odPanelSep.style.display = page === 'compare' ? 'block' : 'none';

  // Toggle project drive viewer loader card (only in viewer if link exists)
  const viewerCard = document.getElementById('projectDriveViewerCard');
  if (viewerCard) {
    const hasLink = !!localStorage.getItem('projectDriveLink');
    viewerCard.style.display = (page === 'viewer' && hasLink) ? 'block' : 'none';
  }

  // Exit modes that conflict with target page
  // sgState is declared globally in 16-validator-rules.ts
  const exitClash = () => { if (typeof clashMode !== 'undefined' && clashMode) (window as any).exitClashMode?.(); };
  const exitSG    = () => { if (typeof sgState !== 'undefined' && sgState.open) (window as any).toggleSGCheckPanel?.(); };

  switch (page) {
    case 'viewer':
      exitClash();
      exitSG();
      break;

    case 'compare':
      exitClash();
      exitSG();
      break;

    case 'clash':
      exitSG();
      if (typeof clashMode !== 'undefined' && !clashMode) (window as any).toggleClashMode?.();
      break;

    case 'validate':
      exitClash();
      if (typeof sgState !== 'undefined' && !sgState.open) (window as any).toggleSGCheckPanel?.();
      break;

    case 'field':
      exitClash();
      exitSG();
      (window as any).fieldEnterMode?.();
      break;
  }

  try { localStorage.setItem('ifc.page', page); } catch { /* quota */ }
}

function navigateTo(page: Page) {
  if (window.location.hash !== '#' + page) {
    history.pushState(null, '', '#' + page);
  }
  applyPage(page);
}

// Expose on window
(window as any).navigateTo = navigateTo;

function initRouter() {
  window.addEventListener('popstate', () => applyPage(hashToPage()));

  // Restore: prefer URL hash, fall back to localStorage
  const fromHash   = hashToPage();
  const fromStore  = localStorage.getItem('ifc.page') as Page | null;
  const initial: Page =
    fromHash !== 'viewer'
      ? fromHash
      : fromStore && fromStore in PAGE_LABELS
        ? fromStore as Page
        : 'viewer';

  // Delay so all modules finish registering their window.* globals
  setTimeout(() => applyPage(initial, true), 120);
}

// Start router
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}

// ── Account menu toggle (IDD-style) ──────────────────────────────────
(window as any).toggleUserMenu = function(e: MouseEvent) {
  e.stopPropagation();
  const menu = document.querySelector('.account-menu') as HTMLElement;
  const trigger = document.getElementById('userBadge');
  if (!menu) return;
  const open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'block';
  trigger?.classList.toggle('open', !open);
  // Close on outside click
  if (!open) {
    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node) && ev.target !== trigger) {
        menu.style.display = 'none';
        trigger?.classList.remove('open');
      }
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
};

// ── IDD Sync Extras (Settings, Team, Invite, Notifications, Help Hub) ──

(window as any).toggleSettingsPanel = function (): void {
  const el = document.getElementById('settingsOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    if (!open) {
      const savedLink = localStorage.getItem('projectDriveLink') || '';
      const input = document.getElementById('projectDriveLink') as HTMLInputElement | null;
      if (input) {
        input.value = savedLink;
        if ((window as any).updateDriveActionButtons) (window as any).updateDriveActionButtons();
      }
      el.style.display = 'flex';
    } else {
      const input = document.getElementById('projectDriveLink') as HTMLInputElement | null;
      if (input) {
        localStorage.setItem('projectDriveLink', input.value.trim());
      }
      el.style.display = 'none';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const savedLink = localStorage.getItem('projectDriveLink') || '';
  const input = document.getElementById('projectDriveLink') as HTMLInputElement | null;
  if (input) {
    input.value = savedLink;
    if ((window as any).updateDriveActionButtons) (window as any).updateDriveActionButtons();
  }
});

(window as any).toggleTeamPanel = function (): void {
  const el = document.getElementById('teamOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
  }
};

(window as any).toggleProfilePanel = function (): void {
  const el = document.getElementById('profileOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
  }
};

(window as any).toggleInvitePanel = function (): void {
  const el = document.getElementById('inviteOverlay');
  if (el) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
  }
};

(window as any).setInviteTier = function (tier: 'member' | 'guest'): void {
  const btnM = document.getElementById('btnTierMember');
  const btnG = document.getElementById('btnTierGuest');
  const warning = document.getElementById('guestWarning');
  if (!btnM || !btnG || !warning) return;
  if (tier === 'member') {
    btnM.style.background = '#fff';
    btnM.style.fontWeight = '700';
    btnM.style.color = '#009668';
    btnG.style.background = 'transparent';
    btnG.style.fontWeight = '500';
    btnG.style.color = '#8590a6';
    warning.style.display = 'none';
  } else {
    btnG.style.background = '#fff';
    btnG.style.fontWeight = '700';
    btnG.style.color = '#b75a00';
    btnM.style.background = 'transparent';
    btnM.style.fontWeight = '500';
    btnM.style.color = '#8590a6';
    warning.style.display = 'block';
  }
};

(window as any).toggleNotifMenu = function (): void {
  const el = document.getElementById('notifMenuDrop');
  const bg = document.getElementById('notifMenuBg');
  if (el && bg) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    bg.style.display = open ? 'none' : 'block';
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  }
};

(window as any).toggleHelpMenu = function (): void {
  const el = document.getElementById('helpMenuDrop');
  const bg = document.getElementById('helpMenuBg');
  if (el && bg) {
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    bg.style.display = open ? 'none' : 'block';
  }
};

(window as any).clearNotifs = function (): void {
  const list = document.getElementById('notifList');
  if (list) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#8590a6;font-size:11px">No new notifications</div>';
  }
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';
};
