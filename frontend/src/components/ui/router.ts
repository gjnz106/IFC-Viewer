// Hash-based client-side router for T3LAB.IFC — the single source of truth
// for which page is active. All mode entry points (sidebar, header CTAs,
// right-panel SG tab, field Desktop button, touch hint) call navigateTo();
// applyPage() then *reconciles* the real mode flags (clashMode, sgState.open,
// fieldActive, compareResult) against the page's desired state, so it is
// idempotent and self-heals no matter where a transition started from.

import { appState } from '../../store/index.js';
import type { Page } from '../../types/index.js';
import { enterClashMode, exitClashMode } from '../compare/clash.js';
import { sgSetPanel } from '../validate/validator-export.js';
import { enterFieldMode, exitFieldMode, isFieldActive } from './fieldmode.js';

export type { Page };

const PAGE_LABELS: Record<Page, string> = {
  viewer: '3D Viewer',
  compare: 'Version Compare',
  clash: 'Clash Detection',
  validate: 'SG Validate',
  field: 'Field Mode',
};

function hashToPage(): Page {
  const h = window.location.hash.slice(1) as Page;
  return h in PAGE_LABELS ? h : 'viewer';
}

function syncNav(page: Page) {
  // Only page buttons carry data-page; overlay buttons (Team/Settings/Invite)
  // don't, so they never steal the highlight.
  document.querySelectorAll<HTMLElement>('.sb-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const lbl = document.getElementById('headerModeLbl');
  if (lbl) lbl.textContent = PAGE_LABELS[page];
}

// Show/hide left-panel workspace sections declared via data-pages="a b c"
// in index.html. Uses a .ws-hide class (display:none !important) so it
// composes with — instead of fighting — the inline display / .show toggles
// that feature modules apply on their own axis (e.g. "compare has run").
function applyWorkspace(page: Page) {
  document.querySelectorAll<HTMLElement>('[data-pages]').forEach(el => {
    const pages = (el.dataset.pages || '').split(/\s+/);
    el.classList.toggle('ws-hide', !pages.includes(page));
  });

  // Project drive card has a second condition: a configured drive link.
  const viewerCard = document.getElementById('projectDriveViewerCard');
  if (viewerCard) {
    viewerCard.style.display = localStorage.getItem('projectDriveLink') ? 'block' : 'none';
  }

  // Slot 0 reads as "the model" outside the A/B comparison pages.
  const single = page === 'viewer' || page === 'validate' || page === 'field';
  const verLbl = document.getElementById('ucVerLbl0');
  if (verLbl) verLbl.textContent = single ? 'Model' : 'Version A — Baseline';
  const slotLbl = document.getElementById('ucSlotLbl0');
  if (slotLbl) slotLbl.textContent = single ? 'Model' : 'Version A';
}

function applyPage(page: Page) {
  appState.activePage = page;
  syncNav(page);
  applyWorkspace(page);

  const wantClash = page === 'clash';
  const wantSG = page === 'validate';
  const wantField = page === 'field';

  // ── Reconcile: exit modes the target page doesn't want… ──
  // A compare result only lives on the compare page (it also blocks clash).
  if (page !== 'compare' && appState.compareResult) window.exitCompare?.();
  if (!wantClash && appState.clashMode) exitClashMode();
  if (!wantSG && appState.sgState.open) sgSetPanel(false);
  if (!wantField && isFieldActive()) exitFieldMode();

  // ── …then enter the one it does. Each primitive no-ops when already set. ──
  if (wantClash) enterClashMode();
  if (wantSG) sgSetPanel(true);
  if (wantField) enterFieldMode();

  try { localStorage.setItem('ifc.page', page); } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent('ifc:pagechange', { detail: { page } }));
}

export function navigateTo(page: Page) {
  if (window.location.hash !== '#' + page) {
    history.pushState(null, '', '#' + page);
  }
  applyPage(page);
}

export function initRouter() {
  // hashchange covers back/forward *and* manual hash edits (pushState in
  // navigateTo doesn't fire it — navigateTo applies directly).
  window.addEventListener('hashchange', () => applyPage(hashToPage()));

  // Restore: an explicit hash always wins (including '#viewer'); only an
  // empty hash falls back to the last persisted page.
  const rawHash = window.location.hash.slice(1);
  let initial: Page;
  if (rawHash && rawHash in PAGE_LABELS) {
    initial = rawHash as Page;
  } else {
    const stored = localStorage.getItem('ifc.page');
    initial = stored && stored in PAGE_LABELS ? (stored as Page) : 'viewer';
  }

  // Don't bounce a desktop reload straight back into Field Mode — only
  // restore it on touch devices. An explicit '#field' hash still works.
  if (initial === 'field' && !rawHash && !window.matchMedia('(pointer: coarse)').matches) {
    initial = 'viewer';
  }

  // Reflect the restored page in the URL, then apply synchronously — every
  // module already registered its globals before main.ts calls initRouter()
  // (the old 120 ms timeout only created a window for stale-state clicks).
  history.replaceState(null, '', '#' + initial);
  applyPage(initial);
}

// Expose on window so onclick="navigateTo('...')" works in HTML
window.navigateTo = navigateTo;
