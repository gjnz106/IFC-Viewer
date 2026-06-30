// ── UI shell controls ────────────────────────────────────────────────
// Small header/panel handlers that were previously an inline <script> in
// index.html. They only touch the DOM, so they live here as a leaf module
// with no app-state dependencies. Exposed on window because the markup
// wires them through onclick="…" attributes.

// Panel toggles — the button's active (dark) state always mirrors whether
// its panel is visible. Uses computed display so it can't desync from the
// initial inline styles.
function setPanel(panelId: string, btnId: string, open: boolean): void {
  const p = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!p || !btn) return;
  p.style.display = open ? 'flex' : 'none';
  if (open) p.style.flexDirection = 'column';
  btn.classList.toggle('hdr-panel-btn-active', open);
}

window.toggleLeftPanel = function (): void {
  const p = document.getElementById('leftPanel');
  if (!p) return;
  setPanel('leftPanel', 'btnToggleLeft', getComputedStyle(p).display === 'none');
};

window.toggleRightPanel = function (): void {
  const p = document.getElementById('rightPanel');
  if (!p) return;
  setPanel('rightPanel', 'btnToggleRight', getComputedStyle(p).display === 'none');
};

window.toggleExportMenu = function (): void {
  const d = document.getElementById('exportMenuDrop') as HTMLElement | null;
  const bg = document.getElementById('exportMenuBg') as HTMLElement | null;
  if (!d || !bg) return;
  const open = d.style.display !== 'none';
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

