// ── Project management (local-first) ─────────────────────────────────────
// A "project" bundles a name/code + a little per-
// project UI state (camera, last page). There is no backend — everything
// lives in LocalStorage via lib/projects-store.ts. Switching (or creating)
// a project unloads every loaded model (federation-load.ts's
// unloadAllModels()) so the next project starts from a clean workspace.

import { appState } from '../../store/index.js';
import { escapeHtml } from '../../lib/escape.js';
import { navigateTo } from './router.js';
import { getLoadedModelCount, fedRenderSlots } from '../compare/federation-load.js';
import {
  loadRegistry, saveRegistry,
  createProject, renameProject, deleteProject, setActive, getActiveProject,
  updateProjectState, type ProjectRegistry, type Project,
} from '../../lib/projects-store.js';
import { deleteProjectViewpoints } from '../../lib/viewpoints-store.js';
import { deleteProjectFilters } from '../../lib/model-filters-store.js';
import {
  fetchCloudProjects, createCloudProject, renameCloudProject, isProjectOwner,
  migrateLocalToCloud, addMember, removeMember, setMemberRole, updateProjectMembership, updateMemberRole,
  roleOf, canManageMembers, syncProjectSettings,
  type CloudProject, type CloudProjectFile, type ProjectRole,
} from '../../lib/cloud-projects.js';
import {
  fetchProjectFiles, downloadProjectFile, uploadProjectFile, deleteCloudProjectDeep,
  orderFilesForAutoLoad, keyToSlotIndex, shouldConfirmOverwrite, syncChipLabel,
  exceedsUploadQuota, sumStorageUsage, formatBytes,
} from '../../lib/cloud-files.js';
import { getCachedFile, putCachedFile, clearCache } from '../../lib/ifc-cache.js';
import { restoreLocalSession, clearLocalSession } from '../../lib/local-session.js';
import {
  fetchResultMetadata, downloadResult, buildModelSignature, signaturesMatch, outdatedBadgeLabel,
  type ResultKind,
} from '../../lib/cloud-results.js';
import { restoreCompareResult } from '../compare/federation-load.js';
import { restoreClashResult } from '../compare/clash.js';
import { log } from '../core/ifc-category.js';
import { getUnitPref, setUnitPref } from '../../lib/units.js';
import { restoreCamera, saveCameraForProject, clearCameraForProject } from './state-persist.js';

function persist(): void {
  saveRegistry(registry);
  try {
    if (appState.activeCloudProjectId) {
      localStorage.setItem('ifc.lastCloudProjectId', appState.activeCloudProjectId);
    } else {
      localStorage.removeItem('ifc.lastCloudProjectId');
    }
  } catch { /* private mode */ }
}

// ── Cloud layer (Phase 12) — additive, never blocks the local-only path ──
let cloudList: CloudProject[] = [];
let cloudLoading = false;
let cloudLoadError = false;

// Bumped on every project activation (local or cloud). In-flight cloud
// auto-loads capture the value at start and bail after each await if it no
// longer matches — otherwise rapid A→B switching dumps A's files/results
// into B's workspace.
let switchGeneration = 0;

function currentAuthUser() {
  const fn = (window as any).getAuthUser;
  return typeof fn === 'function' ? fn() : null;
}

// Fetches (once per panel-open) the cloud project list for the signed-in,
// verified user and re-renders. No-op for logged-out/unverified users so
// their experience stays exactly the local-only Phase 6 flow.
// Guards local-session restore (Phase 21) to run at most once per page
// load — refreshCloudList() is also called later (panel open, sign-in) and
// re-running the restore then would clobber whatever the user has since
// loaded locally.
let _localSessionChecked = false;

// Best-effort restore of whatever was loaded locally (no cloud project) on
// the previous visit. No-op for cloud-project users, who already get their
// files back via autoLoadCloudProjectFiles() above.
async function checkLocalSessionRestore(): Promise<void> {
  if (_localSessionChecked || appState.activeCloudProjectId) return;
  _localSessionChecked = true;
  // Captured so a cloud project activating (auto-restore or explicit
  // switch) mid-loop aborts the rest of this restore instead of racing
  // autoLoadCloudProjectFiles() for the same slot indices — see the
  // switchGeneration comment above.
  const gen = switchGeneration;
  const restored = await restoreLocalSession();
  if (restored.length === 0 || gen !== switchGeneration || appState.activeCloudProjectId) return;
  const lo = document.getElementById('loadOv');
  const lt = document.getElementById('loadTxt');
  const lf = document.getElementById('loadFill') as HTMLElement | null;
  lo?.classList.add('on');
  for (let i = 0; i < restored.length; i++) {
    if (gen !== switchGeneration || appState.activeCloudProjectId) break;
    const { idx, file } = restored[i];
    if (lt) lt.textContent = `Restoring ${file.name} (${i + 1}/${restored.length})…`;
    if (lf) lf.style.width = Math.round(((i + 0.3) / restored.length) * 100) + '%';
    try {
      appState.files[idx] = file;
      if (idx < 2) {
        document.getElementById('uc' + idx)?.classList.add('loaded');
        const fn = document.getElementById('fn' + idx); if (fn) fn.textContent = file.name;
        const fs = document.getElementById('fs' + idx); if (fs) fs.textContent = (file.size / 1048576).toFixed(1) + ' MB';
      } else {
        appState.fedNextSlot = Math.max(appState.fedNextSlot, idx + 1);
      }
      if (!appState.ifcLoader) {
        if (!await (window as any).initIFC?.()) throw new Error('IFC init failed');
      }
      await (window as any).loadIFC?.(idx);
      log(`Local session restore: ${file.name} loaded into slot ${idx}`);
    } catch (e: any) {
      console.warn('[local-session] restore failed for slot', idx, e);
      log(`Local session restore failed for slot ${idx}: ${e?.message || e}`);
    }
  }
  if (lf) lf.style.width = '100%';
  lo?.classList.remove('on');
  if (fedRenderSlots) fedRenderSlots();
  if (gen === switchGeneration && !appState.activeCloudProjectId) restoreCamera();
}

async function refreshCloudList(): Promise<void> {
  const user = currentAuthUser();
  if (!user) {
    cloudList = []; cloudLoadError = false; renderProjectList();
    checkLocalSessionRestore().catch(e => console.warn('[local-session] restore failed:', e));
    return;
  }
  cloudLoading = true;
  renderProjectList();
  const fetched = await fetchCloudProjects(user.email);
  // null = fetch failed — keep the stale list (better than blanking a
  // working UI) and surface an explicit error row instead of "no projects".
  cloudLoadError = fetched === null;
  if (fetched !== null) cloudList = fetched;
  cloudLoading = false;

  // Restore last active cloud project if set and not currently loaded
  if (!appState.activeCloudProjectId && fetched && fetched.length > 0) {
    let savedCloudId = '';
    try { savedCloudId = localStorage.getItem('ifc.lastCloudProjectId') || ''; } catch {}
    if (savedCloudId && fetched.some(p => p.id === savedCloudId)) {
      switchGeneration++; // invalidates any in-flight local-session restore (same slots)
      appState.activeCloudProjectId = savedCloudId;
      appState.activeProjectId = savedCloudId; // key camera restore to this project
      chipLabel();
      applyCloudProjectUnits(fetched.find(p => p.id === savedCloudId));
      autoLoadCloudProjectFiles(savedCloudId).catch(e => console.warn('[cloud-files] auto-restore failed:', e));
    }
  }

  if (!appState.activeCloudProjectId) {
    checkLocalSessionRestore().catch(e => console.warn('[local-session] restore failed:', e));
  }

  renderProjectList();
  chipLabel();
  // Let the Field Mode project sheet re-render once the async cloud list lands.
  try { window.dispatchEvent(new CustomEvent('ifc:cloudprojects')); } catch {}
}

// loadRegistry() migrates a fresh/legacy install in-memory without writing
// anything — persist immediately so the migrated project's id is stable
// across reloads (Phase 9's per-project viewpoints key off this id).
let registry: ProjectRegistry = loadRegistry();
persist();
// Seed the unified active-project id (local by default; refreshCloudList
// overrides it to the cloud id if it restores a cloud project on boot).
appState.activeProjectId = registry.activeId;

// Cloud settings sync was write-only (syncProjectSettings pushes the local
// unit pref up on change, nothing ever read it back) — a project opened on
// a second machine kept whatever unit that machine's browser last had
// instead of the project's saved preference. Best-effort, never blocks
// activation; units.ts's own localStorage remains the source of truth
// otherwise (this only overrides it when the cloud doc actually has a
// saved preference different from the current one).
// Remembers the local/default unit pref the first time a cloud project
// overrides it, so returning to a local project restores the user's own
// choice instead of leaving them stuck on the last cloud project's units.
let localUnitPrefBackup: string | null = null;

function applyCloudProjectUnits(cp: CloudProject | undefined): void {
  const units = cp?.settings?.units;
  if (units && units !== getUnitPref()) {
    if (localUnitPrefBackup === null) localUnitPrefBackup = getUnitPref();
    setUnitPref(units);
  }
}

// Called when activating a LOCAL project — undo any cloud unit override.
function restoreLocalUnitPref(): void {
  if (localUnitPrefBackup !== null) {
    if (localUnitPrefBackup !== getUnitPref()) setUnitPref(localUnitPrefBackup as any);
    localUnitPrefBackup = null;
  }
}

function chipLabel(): void {
  const el = document.getElementById('tbProjectName');
  const subEl = document.getElementById('headerSubLbl');
  let name = '—';
  let rawName = '';
  if (appState.activeCloudProjectId) {
    const cp = cloudList.find(c => c.id === appState.activeCloudProjectId);
    if (cp) {
      name = '☁ ' + (cp.code || cp.name);
      rawName = cp.name;
    }
  } else {
    const p = getActiveProject(registry);
    if (p) {
      name = p.code || p.name;
      rawName = p.name;
    }
  }
  if (el) el.textContent = name;
  if (subEl) subEl.textContent = rawName;
}

function renderProjectList(): void {
  const el = document.getElementById('projList');
  if (!el) return;
  const user = currentAuthUser();
  const canUseCloud = !!user;
  // Cloud project CREATION (new + migrate) is admin-only — enforced in
  // firestore.rules; the UI just hides the entry points for members.
  const canCreateCloud = canUseCloud && !!(window as any).isAdmin;
  // The "Create in cloud" button lives in a static markup block — toggle it
  // here so it tracks admin state whenever the panel re-renders.
  const createCloudBtn = document.getElementById('btnCreateCloud');
  if (createCloudBtn) createCloudBtn.style.display = canCreateCloud ? '' : 'none';

  const localRows = registry.list.map(p => {
    const active = p.id === registry.activeId && !appState.activeCloudProjectId;
    return `<div class="proj-row${active ? ' active' : ''}">
      <div class="proj-row-dot" style="background:${active ? '#16a34a' : '#8590a6'}"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">💻 ${escapeHtml(p.name)}${p.code ? ' <span class="proj-row-code">' + escapeHtml(p.code) + '</span>' : ''}</div>
        <div class="proj-row-sub">${active ? 'Active' : 'Local project'}</div>
      </div>
      <div class="proj-row-actions">
        ${active ? '' : `<button class="proj-row-btn" onclick="projSwitch('${p.id}')" title="Switch to this project">Switch</button>`}
        <button class="proj-row-btn" onclick="projRename('${p.id}')" title="Rename">✎</button>
        ${canCreateCloud ? `<button class="proj-row-btn" onclick="projMigrateToCloud('${p.id}')" title="Copy this project to the cloud">☁ Migrate</button>` : ''}
        <button class="proj-row-btn proj-row-btn-danger" onclick="projDelete('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  });

  const cloudRows = !canUseCloud ? [] : cloudList.map(p => {
    const active = p.id === appState.activeCloudProjectId;
    // Delete is owner-only (mirrors firestore.rules) — hide the button
    // instead of letting members hit a permission-denied.
    const owner = isProjectOwner(p, user?.email);
    return `<div class="proj-row${active ? ' active' : ''}">
      <div class="proj-row-dot" style="background:#2563eb"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">☁ ${escapeHtml(p.name)}${p.code ? ' <span class="proj-row-code">' + escapeHtml(p.code) + '</span>' : ''}</div>
        <div class="proj-row-sub">${active ? 'Active · Cloud' : 'Cloud project'}</div>
      </div>
      <div class="proj-row-actions">
        ${active ? '' : `<button class="proj-row-btn" onclick="projSwitchCloud('${p.id}')" title="Switch to this cloud project">Switch</button>`}
        <button class="proj-row-btn" onclick="projRenameCloud('${p.id}')" title="Rename">✎</button>
        ${owner ? `<button class="proj-row-btn proj-row-btn-danger" onclick="projDeleteCloud('${p.id}')" title="Delete">✕</button>` : ''}
      </div>
    </div>`;
  });

  const loadingRow = cloudLoading ? '<div class="proj-empty">Loading cloud projects…</div>' : '';
  const errorRow = (!cloudLoading && cloudLoadError && canUseCloud)
    ? '<div class="proj-empty">⚠ Couldn\'t load cloud projects — check connection.</div>' : '';
  const rows = loadingRow + errorRow + cloudRows.join('') + localRows.join('');
  el.innerHTML = rows || '<div class="proj-empty">No projects yet.</div>';
}

// ── Field Mode reuse ──────────────────────────────────────────────────
// Field Mode renders its own touch project switcher; expose the same cloud +
// local lists renderProjectList() uses so it can. Switching is done by calling
// window.projSwitchCloud / projSwitch with { fromField: true } (skips the
// desktop navigate + panel toggle).
//
// projFieldData() is a PURE getter — it must NOT kick refreshCloudList(),
// because the field sheet re-renders on the 'ifc:cloudprojects' event that
// refresh fires, which would loop (render → refresh → render → …). The one-shot
// refresh is projFieldRefresh(), called once when the sheet opens.
(window as any).projFieldRefresh = function () { refreshCloudList(); };
(window as any).projFieldData = function () {
  const user = currentAuthUser();
  const canUseCloud = !!user;
  return {
    canUseCloud,
    cloud: !canUseCloud ? [] : cloudList.map(p => ({
      id: p.id, name: p.name, code: (p as any).code || '',
      active: p.id === appState.activeCloudProjectId,
    })),
    local: registry.list.map(p => ({
      id: p.id, name: p.name, code: p.code || '',
      active: p.id === registry.activeId && !appState.activeCloudProjectId,
    })),
  };
};

function saveOutgoingState(): void {
  // Snapshot the outgoing project's camera under its own id (works for both
  // local and cloud projects) so it's restored next time this project opens.
  saveCameraForProject(appState.activeProjectId);
  // Leaving a CLOUD project must not stamp its page/camera onto whatever
  // unrelated local project happens to be the registry's active.
  if (appState.activeCloudProjectId) return;
  const active = getActiveProject(registry);
  if (!active) return;
  const patch: { page: string; camera?: any } = {
    page: appState.activePage,
  };
  if (appState.camera && appState.controls) {
    patch.camera = {
      px: appState.camera.position.x, py: appState.camera.position.y, pz: appState.camera.position.z,
      tx: appState.controls.target.x, ty: appState.controls.target.y, tz: appState.controls.target.z,
    };
  }
  registry = updateProjectState(registry, active.id, patch);
}

// Persist + unload + reflect the now-active project everywhere. Shared by
// projCreate (a new project is always made active) and projSwitch.
function finishActivation(skipNav = false): void {
  switchGeneration++; // invalidates any in-flight cloud auto-load
  // Local activation — the unified active-project id follows the registry.
  appState.activeProjectId = registry.activeId;
  persist();
  // Field Mode is its own page and already shows the viewport; navigating to
  // 'viewer' there would kick the user out of Field Mode, so switches invoked
  // from Field pass skipNav.
  if (!skipNav) navigateTo('viewer');
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
    refreshCloudList(); // fire-and-forget; re-renders when it lands, no-op if logged out
  } else {
    el.style.display = 'none';
  }
};

window.projCreate = function (): void {
  const nameEl = document.getElementById('projNewName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projNewCode') as HTMLInputElement | null;
  const name = nameEl?.value.trim() || '';
  if (!name) { nameEl?.focus(); return; }
  if (!confirmIfHasWork('Creating a new project switches to it and unloads all loaded models. Continue?')) return;

  const code = codeEl?.value.trim() || '';
  saveOutgoingState();
  registry = createProject(registry, name, code);
  if (nameEl) nameEl.value = '';
  if (codeEl) codeEl.value = '';
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
  deleteProjectFilters(id);
  clearCameraForProject(id);
  if (wasActive) {
    finishActivation();
  } else {
    persist();
    chipLabel();
    renderProjectList();
  }
};

window.projSwitch = function (id: string, opts?: { fromField?: boolean }): void {
  const fromField = !!opts?.fromField;
  if (id === registry.activeId && !appState.activeCloudProjectId) { if (!fromField) window.toggleProjectsPanel?.(); return; }
  const loadOv = document.getElementById('loadOv');
  if (loadOv?.classList.contains('on')) { alert('A load is in progress — please wait.'); return; }
  if (!confirmIfHasWork('Switching projects unloads all loaded models and discards unsaved compare/clash results. Continue?')) return;

  saveOutgoingState();
  registry = setActive(registry, id);
  appState.activeCloudProjectId = null;
  appState.cloudFileRecords = {};
  appState.cloudSyncStatus = {};
  restoreLocalUnitPref(); // undo any cloud project's unit override
  document.getElementById('syncChip0')?.replaceChildren();
  document.getElementById('syncChip1')?.replaceChildren();
  finishActivation(fromField);
  if (!fromField) window.toggleProjectsPanel?.();
};

// ── Settings modal integration (Project Name/Code fields) ────────────────
// Must read/write the ACTIVE project — which is the active cloud project
// when one is set, not the local registry's active entry. Filling (and
// worse, saving) from the wrong source silently mis-targets edits: a rename
// while inside a cloud project would otherwise rename the unrelated local
// "Default Project" instead.
window.projFillSettings = function (): void {
  const nameEl = document.getElementById('projName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projCode') as HTMLInputElement | null;
  if (appState.activeCloudProjectId) {
    const cp = activeCloudProject();
    if (nameEl) nameEl.value = cp?.name || '';
    if (codeEl) codeEl.value = cp?.code || '';
    return;
  }
  const active = getActiveProject(registry);
  if (nameEl) nameEl.value = active?.name || '';
  if (codeEl) codeEl.value = active?.code || '';
};

// ── Cloud sync (Phase 13) ─────────────────────────────────────────────────
// Per-slot chip element: 0/1 use the fixed #syncChip0/#syncChip1 spots next
// to the upload cards; federation slots (2+) get theirs re-rendered inline
// by fedRenderSlots() itself, so there's nothing to poke here for those.
function renderSyncChip(idx: number): void {
  if (idx >= 2) { fedRenderSlots(); return; }
  const el = document.getElementById('syncChip' + idx);
  if (!el) return;
  const st = appState.cloudSyncStatus[idx];
  if (!appState.activeCloudProjectId || !st) { el.textContent = ''; return; }
  el.textContent = syncChipLabel(st.status, st.progress);
}

// Background-uploads a just-loaded slot file to the active cloud project.
// No-op for local projects. Called after handleFile/fedHandleFile finish
// their local load — never from the auto-load path itself (that would
// re-upload the very file it just downloaded).
export async function syncUploadSlot(idx: number, file: File): Promise<void> {
  const projectId = appState.activeCloudProjectId;
  if (!projectId) return;
  const user = currentAuthUser();
  if (!user) return;

  // Storage rules reject any file >= 500MB — warn up front instead of
  // letting the upload run and fail server-side with a cryptic error.
  if (exceedsUploadQuota(file.size)) {
    alert(`"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB, over the 500 MB cloud upload limit. It stays local-only for this project.`);
    appState.cloudSyncStatus[idx] = { status: 'local-only' };
    renderSyncChip(idx);
    return;
  }

  const existing = appState.cloudFileRecords[idx];
  if (shouldConfirmOverwrite(existing)) {
    const ok = confirm(`This will replace the cloud file '${existing!.name}' uploaded by ${existing!.uploadedBy}. Continue?`);
    if (!ok) {
      appState.cloudSyncStatus[idx] = { status: 'local-only' };
      renderSyncChip(idx);
      return;
    }
  }

  appState.cloudSyncStatus[idx] = { status: 'uploading', progress: 0 };
  renderSyncChip(idx);
  const record = await uploadProjectFile(projectId, idx, file, user.email, existing, pct => {
    appState.cloudSyncStatus[idx] = { status: 'uploading', progress: pct };
    renderSyncChip(idx);
  });
  // The upload itself went to the right project either way — but if the user
  // switched projects while it ran, don't stamp the record/chip onto the NEW
  // project's slot state.
  if (appState.activeCloudProjectId !== projectId) return;
  if (record) {
    appState.cloudFileRecords[idx] = record;
    appState.cloudSyncStatus[idx] = { status: 'synced' };
    // Seed the local IFC cache with the bytes we just uploaded — they're
    // already in memory. Without this the uploader (the person who works with
    // the model daily) re-downloaded their own file from Storage on every
    // project open, while everyone ELSE got cache hits.
    putCachedFile(record, file); // best-effort, fire-and-forget
    log(`Cloud sync: ${file.name} uploaded to slot ${idx}`);
  } else {
    appState.cloudSyncStatus[idx] = { status: 'error' };
    log(`Cloud sync: upload failed for ${file.name} (slot ${idx})`);
  }
  renderSyncChip(idx);
}

// Downloads + loads every file already on Storage for a cloud project, in
// slot order (A/B first, federation ascending) — the "open on another
// machine and everything's just there" flow. One file's failure doesn't
// block the rest.
async function autoLoadCloudProjectFiles(projectId: string): Promise<void> {
  const gen = switchGeneration;
  const stale = () => gen !== switchGeneration; // another project activated meanwhile
  appState.cloudFileRecords = {};
  appState.cloudSyncStatus = {};
  const records = await fetchProjectFiles(projectId);
  if (stale()) return;
  if (records.length === 0) return;
  const ordered = orderFilesForAutoLoad(records);

  const lo = document.getElementById('loadOv');
  const lt = document.getElementById('loadTxt');
  const lf = document.getElementById('loadFill') as HTMLElement | null;
  lo?.classList.add('on');

  // All downloads (cache-first) start concurrently up front; parsing stays
  // sequential in slot order (web-ifc shares one WASM instance). Previously
  // download i+1 waited for parse i to finish, so wall time was
  // sum(download) + sum(parse); now the network cost is only the slowest
  // single file, overlapped with parsing.
  const fetches = ordered.map(rec => (async () => {
    const cached = await getCachedFile(rec);
    if (cached) { log(`Cloud auto-load: ${rec.name} served from local cache`); return cached; }
    // downloadProjectFile already writes the cache itself. Calling putCachedFile
    // here too meant every downloaded file was written to IndexedDB TWICE,
    // concurrently — on a 450 MB model that is ~900 MB of redundant writes plus
    // two eviction passes racing each other, enough to stall the whole tab.
    return downloadProjectFile(rec);
  })());
  // A later file failing while an earlier one is still parsing would fire
  // "unhandledrejection" before the loop below awaits it — pre-attach a
  // no-op handler; the real await still sees the rejection.
  fetches.forEach(p => p.catch(() => {}));

  // Tracks whether the overlay has already been released by the first
  // successfully parsed model (see inside the loop).
  let firstModelShown = false;

  for (let i = 0; i < ordered.length; i++) {
    if (stale()) { lo?.classList.remove('on'); return; }
    const rec = ordered[i];
    const idx = keyToSlotIndex(rec.slot);
    appState.cloudFileRecords[idx] = rec;
    appState.cloudSyncStatus[idx] = { status: 'synced' };
    if (lt) lt.textContent = `Downloading ${rec.name} (${i + 1}/${ordered.length})…`;
    if (lf) lf.style.width = Math.round(((i + 0.3) / ordered.length) * 100) + '%';
    try {
      const file = await fetches[i];
      if (stale()) { lo?.classList.remove('on'); return; }
      appState.files[idx] = file;
      if (idx < 2) {
        document.getElementById('uc' + idx)?.classList.add('loaded');
        const fn = document.getElementById('fn' + idx); if (fn) fn.textContent = file.name;
        const fs = document.getElementById('fs' + idx); if (fs) fs.textContent = (file.size / 1048576).toFixed(1) + ' MB';
      } else {
        appState.fedNextSlot = Math.max(appState.fedNextSlot, idx + 1);
      }
      if (!appState.ifcLoader) {
        if (!await (window as any).initIFC?.()) throw new Error('IFC init failed');
      }
      if (stale()) { lo?.classList.remove('on'); return; }
      if (lt) lt.textContent = `Loading ${rec.name} (${i + 1}/${ordered.length})…`;
      await (window as any).loadIFC?.(idx);
      log(`Cloud auto-load: ${rec.name} loaded into slot ${idx}`);
      // Release the blocking overlay as soon as the FIRST model is in the
      // scene. Parsing is serialized on one WASM instance, so on a multi-file
      // project the remaining files can take a while — holding the overlay
      // until the last one finished meant staring at a blocked screen even
      // though the viewport already had geometry to look at. Each model is
      // added to the scene as it lands, so the rest stream in behind a usable
      // view. Per-slot progress chips still report the stragglers.
      if (firstModelShown === false) {
        firstModelShown = true;
        lo?.classList.remove('on');
      }
    } catch (e: any) {
      console.warn('[cloud-files] auto-load failed for', rec.name, e);
      appState.cloudSyncStatus[idx] = { status: 'error' };
      log(`Cloud auto-load failed for ${rec.name}: ${e?.message || e}`);
    }
    renderSyncChip(idx);
  }
  if (lf) lf.style.width = '100%';
  lo?.classList.remove('on');
  if (!stale()) restoreCamera();

  await restoreSavedResults(projectId, gen);
}

// Best-effort restore of a previously-saved Compare/Clash result (Phase 15).
// Cheap Firestore metadata read first; only downloads the (potentially
// large) result JSON from Storage if the saved modelSignature still matches
// what's actually loaded. A mismatch (files changed) surfaces a small
// "Outdated — re-run" badge instead of silently applying stale data. Any
// failure here must never disturb the just-completed file auto-load.
async function restoreSavedResults(projectId: string, gen: number): Promise<void> {
  const stale = () => gen !== switchGeneration;
  const currentSignature = buildModelSignature(appState.files);
  const kinds: { kind: ResultKind; badgeId: string }[] = [
    { kind: 'compare', badgeId: 'compareOutdatedBadge' },
    { kind: 'clash', badgeId: 'clashOutdatedBadge' },
  ];
  // Both metadata docs fetched concurrently — they're independent reads;
  // the apply step below stays sequential so Compare keeps priority.
  const metas = kinds.map(k => fetchResultMetadata(projectId, k.kind));
  for (let ki = 0; ki < kinds.length; ki++) {
    const { kind, badgeId } = kinds[ki];
    const badge = document.getElementById(badgeId);
    if (badge) { badge.style.display = 'none'; badge.title = ''; }
    try {
      const meta = await metas[ki];
      if (stale()) return; // don't restore project A's results onto project B
      if (!meta) continue;
      if (!signaturesMatch(meta.modelSignature, currentSignature)) {
        if (badge) { badge.style.display = ''; badge.textContent = outdatedBadgeLabel(); }
        continue;
      }
      // Compare and Clash rendering both restyle the loaded models' materials
      // — mutually exclusive, same as the live-run modes. Compare is
      // processed first (kinds order above); skip Clash if it already won.
      if (kind === 'clash' && appState.compareResult) continue;
      const data = await downloadResult(projectId, kind);
      if (stale()) return;
      if (!data) continue;
      if (kind === 'compare') await restoreCompareResult(data);
      else restoreClashResult(data as any[]);
      log(`Cloud: restored saved ${kind} result (unchanged since last run)`);
    } catch (e) {
      console.warn(`[cloud-results] restoreSavedResults(${kind}) failed:`, e);
    }
  }
}

// ── Cloud project actions (Phase 12/13) ───────────────────────────────────
window.projSwitchCloud = function (id: string, opts?: { fromField?: boolean }): void {
  const fromField = !!opts?.fromField;
  if (id === appState.activeCloudProjectId) { if (!fromField) window.toggleProjectsPanel?.(); return; }
  const loadOv = document.getElementById('loadOv');
  if (loadOv?.classList.contains('on')) { alert('A load is in progress — please wait.'); return; }
  if (!confirmIfHasWork('Switching projects unloads all loaded models and discards unsaved compare/clash results. Continue?')) return;

  saveOutgoingState();
  switchGeneration++; // invalidates any in-flight auto-load for the previous project
  appState.activeCloudProjectId = id;
  appState.activeProjectId = id; // key camera restore to this project
  persist();
  applyCloudProjectUnits(cloudList.find(c => c.id === id));
  // Field Mode stays on its own page (see finishActivation note); desktop jumps
  // to the viewer so the newly-loading models are visible.
  if (!fromField) navigateTo('viewer');
  (window as any).unloadAllModels?.();
  chipLabel();
  renderProjectList();
  window.dispatchEvent(new CustomEvent('ifc:projectchange'));
  autoLoadCloudProjectFiles(id).catch(e => console.warn('[cloud-files] autoLoadCloudProjectFiles failed:', e));
  if (!fromField) window.toggleProjectsPanel?.();
};

window.projRenameCloud = async function (id: string): Promise<void> {
  const p = cloudList.find(c => c.id === id);
  if (!p) return;
  const name = prompt('Project name:', p.name);
  if (name === null) return;
  const code = prompt('Project code:', p.code) ?? p.code;
  const ok = await renameCloudProject(id, name, code);
  if (!ok) { alert('Could not rename the cloud project. Check your connection and try again.'); return; }
  p.name = name.trim() || p.name;
  p.code = code.trim();
  if (id === appState.activeCloudProjectId) chipLabel();
  renderProjectList();
};

window.projDeleteCloud = async function (id: string): Promise<void> {
  const p = cloudList.find(c => c.id === id);
  if (!p) return;
  if (!confirm(`Delete cloud project "${p.name}"? This permanently deletes its uploaded files and saved results for all members.`)) return;
  const ok = await deleteCloudProjectDeep(id);
  if (!ok) { alert('Could not delete the cloud project. Check your connection and try again.'); return; }
  cloudList = cloudList.filter(c => c.id !== id);
  if (id === appState.activeCloudProjectId) {
    appState.activeCloudProjectId = null;
    finishActivation();
  } else {
    renderProjectList();
  }
};

window.projCreateCloud = async function (): Promise<void> {
  const user = currentAuthUser();
  if (!user) { alert('Sign in to create cloud projects.'); return; }
  if (!(window as any).isAdmin) { alert('Only an admin can create cloud projects. Contact your admin.'); return; }
  const nameEl = document.getElementById('projNewName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projNewCode') as HTMLInputElement | null;
  const name = nameEl?.value.trim() || '';
  if (!name) { nameEl?.focus(); return; }
  if (!confirmIfHasWork('Creating a new project switches to it and unloads all loaded models. Continue?')) return;

  const code = codeEl?.value.trim() || '';
  const created = await createCloudProject(name, code, user.uid, user.email, {});
  if (!created) { alert('Could not create the cloud project. Check your connection and try again.'); return; }
  cloudList = [...cloudList, created];
  if (nameEl) nameEl.value = '';
  if (codeEl) codeEl.value = '';
  window.projSwitchCloud?.(created.id);
};

// Copies name/code/settings of a local project up to a brand-new cloud
// project. Does not touch/remove the local project or its files (Phase 13
// handles actual IFC file upload/migration).
window.projMigrateToCloud = async function (id: string): Promise<void> {
  const user = currentAuthUser();
  if (!user) { alert('Sign in to use cloud projects.'); return; }
  if (!(window as any).isAdmin) { alert('Only an admin can create cloud projects. Contact your admin.'); return; }
  const p: Project | undefined = registry.list.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Copy "${p.name}" to the cloud as a new project? (File upload comes in a later update.)`)) return;
  const created = await migrateLocalToCloud(p, user.uid, user.email);
  if (!created) { alert('Could not migrate the project to the cloud. Check your connection and try again.'); return; }
  cloudList = [...cloudList, created];
  renderProjectList();
  alert(`"${p.name}" is now also available in the cloud as "${created.name}".`);
};

window.projSaveSettings = function (): void {
  const nameEl = document.getElementById('projName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projCode') as HTMLInputElement | null;
  if (appState.activeCloudProjectId) {
    const cp = activeCloudProject();
    if (!cp) return;
    const name = nameEl?.value ?? cp.name;
    const code = codeEl?.value ?? cp.code;
    renameCloudProject(cp.id, name, code).then(ok => {
      if (!ok) return;
      cp.name = name.trim(); cp.code = code.trim();
      renderProjectList();
      chipLabel();
    });
    return;
  }
  const active = getActiveProject(registry);
  if (!active) return;
  registry = renameProject(registry, active.id, nameEl?.value ?? active.name, codeEl?.value ?? active.code);
  persist();
  chipLabel();
};

// ── Member sharing + roles ─────────────────────────────────────────────
// The Invite button (index.html #btnInvite) opens this instead of the old
// static demo dialog. Owner/admin can add, remove, and change roles;
// editor/viewer members see a read-only list. No-op (shows the "not a cloud
// project" message) for local projects — there is no memberEmails to manage.
function activeCloudProject(): CloudProject | undefined {
  return cloudList.find(c => c.id === appState.activeCloudProjectId);
}

const ROLE_LABEL: Record<ProjectRole, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

(window as any).renderMembersPanel = function (): void {
  const notCloud = document.getElementById('inviteNotCloud');
  const body = document.getElementById('inviteCloudBody');
  const listEl = document.getElementById('projMemberList');
  const addRow = document.getElementById('inviteAddRow');
  const readOnlyNote = document.getElementById('inviteReadOnlyNote');
  if (!notCloud || !body || !listEl || !addRow || !readOnlyNote) return;

  const proj = activeCloudProject();
  if (!proj) {
    notCloud.style.display = 'block';
    body.style.display = 'none';
    return;
  }
  notCloud.style.display = 'none';
  body.style.display = 'block';

  const user = currentAuthUser();
  const canManage = canManageMembers(proj, user?.email);
  addRow.style.display = canManage ? 'flex' : 'none';
  readOnlyNote.style.display = canManage ? 'none' : 'block';

  listEl.innerHTML = proj.memberEmails.map(email => {
    const owner = email === proj.ownerEmail;
    const role = roleOf(proj, email) || 'editor';
    const canRemove = canManage && !owner;
    const canChangeRole = canManage && !owner;
    const roleCell = canChangeRole
      ? `<select class="proj-row-role" onchange="projSetMemberRole('${escapeHtml(email)}', this.value)">
          ${(['viewer', 'editor', 'admin'] as ProjectRole[]).map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select>`
      : `<div class="proj-row-sub">${ROLE_LABEL[role]}</div>`;
    return `<div class="proj-row">
      <div class="proj-row-dot" style="background:${owner ? '#2563eb' : '#8590a6'}"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">${escapeHtml(email)}</div>
        ${roleCell}
      </div>
      <div class="proj-row-actions">
        ${canRemove ? `<button class="proj-row-btn proj-row-btn-danger" onclick="projRemoveMember('${escapeHtml(email)}')" title="Remove">✕</button>` : ''}
      </div>
    </div>`;
  }).join('') || '<div class="proj-empty">No members yet.</div>';
};

(window as any).projAddMember = async function (): Promise<void> {
  const proj = activeCloudProject();
  if (!proj) return;
  const input = document.getElementById('projMemberEmail') as HTMLInputElement | null;
  const roleSel = document.getElementById('projMemberRole') as HTMLSelectElement | null;
  const email = input?.value.trim() || '';
  if (!email) { input?.focus(); return; }
  const role = (roleSel?.value as ProjectRole) || 'editor';
  const updated = addMember(proj.memberEmails, proj.memberRoles, email, role);
  if (updated.memberEmails === proj.memberEmails) { if (input) input.value = ''; return; } // already a member
  const ok = await updateProjectMembership(proj.id, updated);
  if (!ok) { alert('Could not add member. Check your connection and try again.'); return; }
  proj.memberEmails = updated.memberEmails;
  proj.memberRoles = updated.memberRoles;
  if (input) input.value = '';
  (window as any).renderMembersPanel?.();
};

(window as any).projRemoveMember = async function (email: string): Promise<void> {
  const proj = activeCloudProject();
  if (!proj) return;
  if (!confirm(`Remove ${email} from this project?`)) return;
  const updated = removeMember(proj.memberEmails, proj.memberRoles, proj.ownerEmail, email);
  if (updated.memberEmails === proj.memberEmails) return; // owner or not a member — no-op
  const ok = await updateProjectMembership(proj.id, updated);
  if (!ok) { alert('Could not remove member. Check your connection and try again.'); return; }
  proj.memberEmails = updated.memberEmails;
  proj.memberRoles = updated.memberRoles;
  (window as any).renderMembersPanel?.();
};

(window as any).projSetMemberRole = async function (email: string, role: string): Promise<void> {
  const proj = activeCloudProject();
  if (!proj) return;
  const nextRoles = setMemberRole(proj.memberRoles, proj.ownerEmail, email, role as ProjectRole);
  if (nextRoles === proj.memberRoles) { (window as any).renderMembersPanel?.(); return; } // refused (owner/self-owner/no-op) — re-render to snap the <select> back
  const ok = await updateMemberRole(proj.id, email, role as ProjectRole);
  if (!ok) { alert('Could not update role. Check your connection and try again.'); (window as any).renderMembersPanel?.(); return; }
  proj.memberRoles = nextRoles;
  (window as any).renderMembersPanel?.();
};

// ── Storage usage display (Phase 14) ──────────────────────────────────────
async function refreshStorageUsage(): Promise<void> {
  const row = document.getElementById('projStorageUsageRow');
  const el = document.getElementById('projStorageUsage');
  if (!row || !el) return;
  const projectId = appState.activeCloudProjectId;
  if (!projectId) { row.style.display = 'none'; return; }
  row.style.display = 'block';
  el.textContent = '…';
  const files = await fetchProjectFiles(projectId);
  el.textContent = formatBytes(sumStorageUsage(files));
}
window.addEventListener('ifc:projectchange', () => { refreshStorageUsage(); });

// Sign-out (auth.ts) already nulled activeCloudProjectId + records and
// unloaded models — drop this module's cached cloud list and reflect the
// local active project in the chip so the next user starts clean.
window.addEventListener('ifc:signout', () => {
  switchGeneration++; // kill any in-flight cloud auto-load too
  appState.activeProjectId = registry.activeId; // back to the local project's camera
  cloudList = [];
  cloudLoadError = false;
  // Wipe any locally-cached file bytes so the next user on a shared machine
  // can't F5 and restore this user's model (local-session is keyed by slot
  // index only, and _localSessionChecked resets on the fresh page load).
  clearLocalSession().catch(e => console.warn('[local-session] clear on sign-out failed:', e));
  document.getElementById('syncChip0')?.replaceChildren();
  document.getElementById('syncChip1')?.replaceChildren();
  chipLabel();
  renderProjectList();
  refreshStorageUsage();
});

// ── IndexedDB cache "Clear cache" button (Settings) ───────────────────────
(window as any).ifcCacheClear = async function (): Promise<void> {
  const status = document.getElementById('ifcCacheClearStatus');
  if (status) status.textContent = 'Clearing…';
  await clearCache();
  if (status) { status.textContent = 'Cache cleared.'; setTimeout(() => { status.textContent = ''; }, 2500); }
};

// ── Best-effort cloud settings mirror (Phase 14 polish) ───────────────────
// Local (localStorage) always remains the source of truth — these listeners
// only push a convenience copy up to the cloud doc when online; network
// errors are swallowed inside syncProjectSettings itself.
window.addEventListener('ifc:unitschange', (ev: any) => {
  const projectId = appState.activeCloudProjectId;
  if (!projectId) return;
  syncProjectSettings(projectId, { units: ev?.detail?.pref });
});
window.addEventListener('ifc:viewpointschange', (ev: any) => {
  const projectId = appState.activeCloudProjectId;
  if (!projectId) return;
  syncProjectSettings(projectId, { viewpointCount: ev?.detail?.count });
});

// ── Team panel (topbar 👥) — real membership of the active cloud project ──
// Replaces the old static demo table (fake names + workload bars). Shows the
// actual membership of the open cloud project: a role badge, "You" marker,
// and how many of the project's cloud files each member uploaded.
window.renderTeamPanel = function (): void {
  const box = document.getElementById('teamPanelBody');
  if (!box) return;
  const empty = (msg: string) => {
    box.innerHTML = `<div style="padding:28px 8px;text-align:center;color:#8590a6;font-size:14.4px">${escapeHtml(msg)}</div>`;
  };
  const id = appState.activeCloudProjectId;
  if (!id) { empty('Open a cloud project to see its team. Local projects have no shared members.'); return; }
  const p = cloudList.find(c => c.id === id);
  if (!p) { empty('Cloud project list not loaded yet — open the Projects panel to refresh, then try again.'); return; }

  const me = (currentAuthUser()?.email || '').toLowerCase();
  const owner = (p.ownerEmail || '').toLowerCase();
  // Owner first, then the rest alphabetically.
  const members = [...new Set((p.memberEmails || []).map(m => m.toLowerCase()))]
    .sort((a, b) => (a === owner ? -1 : b === owner ? 1 : a.localeCompare(b)));

  const row = (email: string, count: number | null) => {
    const initial = escapeHtml((email[0] || '?').toUpperCase());
    const role = roleOf(p, email);
    const roleColor = role === 'owner' ? '#0058be' : role === 'admin' ? '#7c3aed' : role === 'viewer' ? '#8590a6' : '#16a34a';
    const badges =
      (role ? `<span style="background:${roleColor};color:#fff;padding:2px 6px;border-radius:4px;font-size:12px;margin-left:6px">${ROLE_LABEL[role]}</span>` : '') +
      (email === me ? '<span style="background:rgba(0,0,0,0.08);padding:2px 6px;border-radius:4px;font-size:12px;margin-left:6px">You</span>' : '');
    const files = count === null
      ? '<span style="color:#8590a6">…</span>'
      : `<b>${count}</b> file${count === 1 ? '' : 's'}`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(0,0,0,0.05);font-size:15px">
      <span style="width:26px;height:26px;border-radius:50%;background:#e8eaef;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14.4px;flex-shrink:0">${initial}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(email)}${badges}</span>
      <span style="flex-shrink:0;color:#374151">${files}</span>
    </div>`;
  };
  const paint = (counts: Record<string, number> | null) => {
    box.innerHTML =
      `<div style="font-size:13.2px;color:#8590a6;margin-bottom:6px">${escapeHtml(p.name)} — ${members.length} member${members.length === 1 ? '' : 's'} · uploads count cloud files in this project</div>` +
      members.map(m => row(m, counts ? (counts[m] || 0) : null)).join('');
  };
  paint(null); // instant paint; per-member upload counts fill in below

  fetchProjectFiles(id).then(records => {
    // Don't stamp counts fetched for project A onto a since-opened project B.
    if (appState.activeCloudProjectId !== id) return;
    const counts: Record<string, number> = {};
    for (const r of records) {
      const k = (r.uploadedBy || '').toLowerCase();
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
    paint(counts);
  }).catch(() => { /* keep the pending "…" — panel still shows membership */ });
};

document.getElementById('btnSettings')?.addEventListener('click', () => refreshStorageUsage());

window.addEventListener('ifc:signin', () => {
  refreshCloudList();
});

// window.isAdmin resolves asynchronously (after the Firestore allowlist read),
// which can land after the projects panel has already rendered — re-render so
// the admin-only cloud "Create"/"Migrate" entry points appear or hide.
window.addEventListener('ifc:adminchange', () => { renderProjectList(); });

window.addEventListener('beforeunload', () => {
  try {
    saveOutgoingState();
    persist();
  } catch {}
});

// Initial startup: reflect chip label and restore last opened cloud project if logged in
chipLabel();
refreshCloudList();
