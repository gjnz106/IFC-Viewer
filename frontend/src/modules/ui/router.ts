// Hash-based client-side router for T3LAB.IFC
// Each page maps to existing window.* mode-switching globals.
// The sidebar nav buttons update the hash; this module reacts to hashchange.

import { appState } from '../../state/index.js';

export type Page = 'viewer' | 'compare' | 'clash' | 'validate' | 'field';

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
  document.querySelectorAll<HTMLElement>('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const lbl = document.getElementById('headerModeLbl');
  if (lbl) lbl.textContent = PAGE_LABELS[page];
}

function applyPage(page: Page, isInit = false) {
  if (page === activePage && !isInit) return;
  activePage = page;
  syncNav(page);

  // Exit modes that conflict with target page
  const sg = appState.sgState as any;
  const exitClash = () => { if (appState.clashMode) (window as any).exitClashMode?.(); };
  const exitSG    = () => { if (sg.open) (window as any).toggleSGCheckPanel?.(); };

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
      if (!appState.clashMode) (window as any).toggleClashMode?.();
      break;

    case 'validate':
      exitClash();
      if (!sg.open) (window as any).toggleSGCheckPanel?.();
      break;

    case 'field':
      exitClash();
      exitSG();
      (window as any).fieldEnterMode?.();
      break;
  }

  try { localStorage.setItem('ifc.page', page); } catch { /* quota */ }
}

export function navigateTo(page: Page) {
  if (window.location.hash !== '#' + page) {
    history.pushState(null, '', '#' + page);
  }
  applyPage(page);
}

export function initRouter() {
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

// Expose on window so onclick="navigateTo('...')" works in HTML
(window as any).navigateTo = navigateTo;
