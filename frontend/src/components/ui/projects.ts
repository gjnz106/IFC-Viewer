// ── Project management (local-first) ─────────────────────────────────────
// A "project" bundles a name/code + a Google Drive link + a little per-
// project UI state (camera, last page). There is no backend — everything
// lives in LocalStorage via lib/projects-store.ts. Switching (or creating)
// a project unloads every loaded model (federation-load.ts's
// unloadAllModels()) so the next project starts from a clean workspace.

import { appState } from '../../store/index.js';
import { escapeHtml } from '../../lib/escape.js';
import { navigateTo } from './router.js';
import { getLoadedModelCount } from '../compare/federation-load.js';
import {
  loadRegistry, saveRegistry, mirrorActiveDriveLink,
  createProject, renameProject, deleteProject, setActive, getActiveProject,
  updateProjectState, type ProjectRegistry,
} from '../../lib/projects-store.js';
import { deleteProjectViewpoints } from '../../lib/viewpoints-store.js';

function persist(): void {
  saveRegistry(registry);
  mirrorActiveDriveLink(registry);
}

// loadRegistry() migrates a fresh/legacy install in-memory without writing
// anything — persist immediately so the migrated project's id is stable
// across reloads (Phase 9's per-project viewpoints key off this id).
let registry: ProjectRegistry = loadRegistry();
persist();

function chipLabel(): void {
  const el = document.getElementById('tbProjectName');
  if (!el) return;
  const p = getActiveProject(registry);
  el.textContent = p ? (p.code || p.name) : '—';
}

function renderProjectList(): void {
  const el = document.getElementById('projList');
  if (!el) return;
  if (registry.list.length === 0) { el.innerHTML = '<div class="proj-empty">No projects yet.</div>'; return; }
  el.innerHTML = registry.list.map(p => {
    const active = p.id === registry.activeId;
    return `<div class="proj-row${active ? ' active' : ''}">
      <div class="proj-row-dot" style="background:${p.state.driveLink ? '#16a34a' : '#8590a6'}"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">${escapeHtml(p.name)}${p.code ? ' <span class="proj-row-code">' + escapeHtml(p.code) + '</span>' : ''}</div>
        <div class="proj-row-sub">${active ? 'Active' : (p.state.driveLink ? 'Drive linked' : 'No Drive link')}</div>
      </div>
      <div class="proj-row-actions">
        ${active ? '' : `<button class="proj-row-btn" onclick="projSwitch('${p.id}')" title="Switch to this project">Switch</button>`}
        <button class="proj-row-btn" onclick="projRename('${p.id}')" title="Rename">✎</button>
        <button class="proj-row-btn proj-row-btn-danger" onclick="projDelete('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');
}

function saveOutgoingState(): void {
  const active = getActiveProject(registry);
  if (!active) return;
  const patch: { page: string; camera?: any; driveLink: string } = {
    page: appState.activePage,
    driveLink: '',
  };
  if (appState.camera && appState.controls) {
    patch.camera = {
      px: appState.camera.position.x, py: appState.camera.position.y, pz: appState.camera.position.z,
      tx: appState.controls.target.x, ty: appState.controls.target.y, tz: appState.controls.target.z,
    };
  }
  try { patch.driveLink = localStorage.getItem('projectDriveLink') || ''; } catch { /* private mode */ }
  registry = updateProjectState(registry, active.id, patch);
}

// Persist + unload + reflect the now-active project everywhere. Shared by
// projCreate (a new project is always made active) and projSwitch.
function finishActivation(): void {
  persist();
  navigateTo('viewer');
  (window as any).unloadAllModels?.();
  chipLabel();
  renderProjectList();
  window.dispatchEvent(new CustomEvent('ifc:projectchange'));
}

function confirmIfHasWork(message: string): boolean {
  const hasWork = getLoadedModelCount() > 0 || !!appState.compareResult;
  return !hasWork || confirm(message);
}

window.toggleProjectsPanel = function (): void {
  const el = document.getElementById('projectsOverlay');
  if (!el) return;
  const open = el.style.display !== 'none';
  if (!open) {
    renderProjectList();
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
};

window.projCreate = function (): void {
  const nameEl = document.getElementById('projNewName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projNewCode') as HTMLInputElement | null;
  const driveEl = document.getElementById('projNewDrive') as HTMLInputElement | null;
  const name = nameEl?.value.trim() || '';
  if (!name) { nameEl?.focus(); return; }
  if (!confirmIfHasWork('Creating a new project switches to it and unloads all loaded models. Continue?')) return;

  const code = codeEl?.value.trim() || '';
  const drive = driveEl?.value.trim() || '';
  saveOutgoingState();
  registry = createProject(registry, name, code, drive);
  if (nameEl) nameEl.value = '';
  if (codeEl) codeEl.value = '';
  if (driveEl) driveEl.value = '';
  finishActivation();
};

window.projRename = function (id: string): void {
  const p = registry.list.find(x => x.id === id);
  if (!p) return;
  const name = prompt('Project name:', p.name);
  if (name === null) return;
  const code = prompt('Project code:', p.code) ?? p.code;
  registry = renameProject(registry, id, name, code);
  persist();
  chipLabel();
  renderProjectList();
};

window.projDelete = function (id: string): void {
  const p = registry.list.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete project "${p.name}"? This only removes the project entry — it does not delete any files.`)) return;
  const wasActive = registry.activeId === id;
  registry = deleteProject(registry, id);
  deleteProjectViewpoints(id);
  if (wasActive) {
    finishActivation();
  } else {
    persist();
    chipLabel();
    renderProjectList();
  }
};

window.projSwitch = function (id: string): void {
  if (id === registry.activeId) { window.toggleProjectsPanel?.(); return; }
  const loadOv = document.getElementById('loadOv');
  if (loadOv?.classList.contains('on')) { alert('A load is in progress — please wait.'); return; }
  if (!confirmIfHasWork('Switching projects unloads all loaded models and discards unsaved compare/clash results. Continue?')) return;

  saveOutgoingState();
  registry = setActive(registry, id);
  finishActivation();
  window.toggleProjectsPanel?.();
};

// ── Settings modal integration (Project Name/Code fields) ────────────────
window.projFillSettings = function (): void {
  const active = getActiveProject(registry);
  const nameEl = document.getElementById('projName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projCode') as HTMLInputElement | null;
  if (nameEl) nameEl.value = active?.name || '';
  if (codeEl) codeEl.value = active?.code || '';
};

window.projSaveSettings = function (): void {
  const active = getActiveProject(registry);
  if (!active) return;
  const nameEl = document.getElementById('projName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projCode') as HTMLInputElement | null;
  registry = renameProject(registry, active.id, nameEl?.value ?? active.name, codeEl?.value ?? active.code);
  // Settings' own drive-link input writes the legacy key just before this
  // runs (ui-shell.ts's toggleSettingsPanel close-path) — mirror it into the
  // active project record too so it's reflected even without a switch.
  let link = '';
  try { link = localStorage.getItem('projectDriveLink') || ''; } catch { /* private mode */ }
  registry = updateProjectState(registry, active.id, { driveLink: link });
  persist();
  chipLabel();
};

chipLabel();
