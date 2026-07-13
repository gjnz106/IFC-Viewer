// ── Project management (local-first) ─────────────────────────────────────
// A "project" bundles a name/code + a Google Drive link + a little per-
// project UI state (camera, last page). There is no backend — everything
// lives in LocalStorage via lib/projects-store.ts. Switching (or creating)
// a project unloads every loaded model (federation-load.ts's
// unloadAllModels()) so the next project starts from a clean workspace.

import { appState } from '../../store/index.js';
import { escapeHtml } from '../../lib/escape.js';
import { navigateTo } from './router.js';
import { getLoadedModelCount, fedRenderSlots } from '../compare/federation-load.js';
import {
  loadRegistry, saveRegistry, mirrorActiveDriveLink,
  createProject, renameProject, deleteProject, setActive, getActiveProject,
  updateProjectState, type ProjectRegistry, type Project,
} from '../../lib/projects-store.js';
import { deleteProjectViewpoints } from '../../lib/viewpoints-store.js';
import {
  fetchCloudProjects, createCloudProject, renameCloudProject, deleteCloudProject,
  migrateLocalToCloud, addMemberEmail, removeMemberEmail, updateProjectMembers, syncProjectSettings,
  type CloudProject, type CloudProjectFile,
} from '../../lib/cloud-projects.js';
import {
  fetchProjectFiles, downloadProjectFile, uploadProjectFile,
  orderFilesForAutoLoad, keyToSlotIndex, shouldConfirmOverwrite, syncChipLabel,
  exceedsUploadQuota, sumStorageUsage, formatBytes,
} from '../../lib/cloud-files.js';
import { getCachedFile, putCachedFile, clearCache } from '../../lib/ifc-cache.js';
import { log } from '../core/ifc-category.js';

function persist(): void {
  saveRegistry(registry);
  mirrorActiveDriveLink(registry);
}

// ── Cloud layer (Phase 12) — additive, never blocks the local-only path ──
let cloudList: CloudProject[] = [];
let cloudLoading = false;

function currentAuthUser() {
  const fn = (window as any).getAuthUser;
  return typeof fn === 'function' ? fn() : null;
}

// Fetches (once per panel-open) the cloud project list for the signed-in,
// verified user and re-renders. No-op for logged-out/unverified users so
// their experience stays exactly the local-only Phase 6 flow.
async function refreshCloudList(): Promise<void> {
  const user = currentAuthUser();
  if (!user || !user.emailVerified) { cloudList = []; renderProjectList(); return; }
  cloudLoading = true;
  renderProjectList();
  cloudList = await fetchCloudProjects(user.email);
  cloudLoading = false;
  renderProjectList();
}

// loadRegistry() migrates a fresh/legacy install in-memory without writing
// anything — persist immediately so the migrated project's id is stable
// across reloads (Phase 9's per-project viewpoints key off this id).
let registry: ProjectRegistry = loadRegistry();
persist();

function chipLabel(): void {
  const el = document.getElementById('tbProjectName');
  if (!el) return;
  if (appState.activeCloudProjectId) {
    const cp = cloudList.find(c => c.id === appState.activeCloudProjectId);
    if (cp) { el.textContent = '☁ ' + (cp.code || cp.name); return; }
  }
  const p = getActiveProject(registry);
  el.textContent = p ? (p.code || p.name) : '—';
}

function renderProjectList(): void {
  const el = document.getElementById('projList');
  if (!el) return;
  const user = currentAuthUser();
  const canUseCloud = !!(user && user.emailVerified);

  const localRows = registry.list.map(p => {
    const active = p.id === registry.activeId && !appState.activeCloudProjectId;
    return `<div class="proj-row${active ? ' active' : ''}">
      <div class="proj-row-dot" style="background:${p.state.driveLink ? '#16a34a' : '#8590a6'}"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">💻 ${escapeHtml(p.name)}${p.code ? ' <span class="proj-row-code">' + escapeHtml(p.code) + '</span>' : ''}</div>
        <div class="proj-row-sub">${active ? 'Active' : (p.state.driveLink ? 'Drive linked' : 'No Drive link')}</div>
      </div>
      <div class="proj-row-actions">
        ${active ? '' : `<button class="proj-row-btn" onclick="projSwitch('${p.id}')" title="Switch to this project">Switch</button>`}
        <button class="proj-row-btn" onclick="projRename('${p.id}')" title="Rename">✎</button>
        ${canUseCloud ? `<button class="proj-row-btn" onclick="projMigrateToCloud('${p.id}')" title="Copy this project to the cloud">☁ Migrate</button>` : ''}
        <button class="proj-row-btn proj-row-btn-danger" onclick="projDelete('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  });

  const cloudRows = !canUseCloud ? [] : cloudList.map(p => {
    const active = p.id === appState.activeCloudProjectId;
    return `<div class="proj-row${active ? ' active' : ''}">
      <div class="proj-row-dot" style="background:#2563eb"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">☁ ${escapeHtml(p.name)}${p.code ? ' <span class="proj-row-code">' + escapeHtml(p.code) + '</span>' : ''}</div>
        <div class="proj-row-sub">${active ? 'Active · Cloud' : 'Cloud project'}</div>
      </div>
      <div class="proj-row-actions">
        ${active ? '' : `<button class="proj-row-btn" onclick="projSwitchCloud('${p.id}')" title="Switch to this cloud project">Switch</button>`}
        <button class="proj-row-btn" onclick="projRenameCloud('${p.id}')" title="Rename">✎</button>
        <button class="proj-row-btn proj-row-btn-danger" onclick="projDeleteCloud('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  });

  const loadingRow = cloudLoading ? '<div class="proj-empty">Loading cloud projects…</div>' : '';
  const rows = loadingRow + cloudRows.join('') + localRows.join('');
  el.innerHTML = rows || '<div class="proj-empty">No projects yet.</div>';
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
    refreshCloudList(); // fire-and-forget; re-renders when it lands, no-op if logged out
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
  if (id === registry.activeId && !appState.activeCloudProjectId) { window.toggleProjectsPanel?.(); return; }
  const loadOv = document.getElementById('loadOv');
  if (loadOv?.classList.contains('on')) { alert('A load is in progress — please wait.'); return; }
  if (!confirmIfHasWork('Switching projects unloads all loaded models and discards unsaved compare/clash results. Continue?')) return;

  saveOutgoingState();
  registry = setActive(registry, id);
  appState.activeCloudProjectId = null;
  appState.cloudFileRecords = {};
  appState.cloudSyncStatus = {};
  document.getElementById('syncChip0')!.textContent = '';
  document.getElementById('syncChip1')!.textContent = '';
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
  if (!user || !user.emailVerified) return;

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
  if (record) {
    appState.cloudFileRecords[idx] = record;
    appState.cloudSyncStatus[idx] = { status: 'synced' };
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
  appState.cloudFileRecords = {};
  appState.cloudSyncStatus = {};
  const records = await fetchProjectFiles(projectId);
  if (records.length === 0) return;
  const ordered = orderFilesForAutoLoad(records);

  const lo = document.getElementById('loadOv');
  const lt = document.getElementById('loadTxt');
  const lf = document.getElementById('loadFill') as HTMLElement | null;
  lo?.classList.add('on');

  for (let i = 0; i < ordered.length; i++) {
    const rec = ordered[i];
    const idx = keyToSlotIndex(rec.slot);
    appState.cloudFileRecords[idx] = rec;
    appState.cloudSyncStatus[idx] = { status: 'synced' };
    if (lt) lt.textContent = `Downloading ${rec.name} (${i + 1}/${ordered.length})…`;
    if (lf) lf.style.width = Math.round(((i + 0.3) / ordered.length) * 100) + '%';
    try {
      let file = await getCachedFile(rec);
      if (file) {
        log(`Cloud auto-load: ${rec.name} served from local cache`);
      } else {
        file = await downloadProjectFile(rec);
        putCachedFile(rec, file); // best-effort, fire-and-forget
      }
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
      if (lt) lt.textContent = `Loading ${rec.name} (${i + 1}/${ordered.length})…`;
      await (window as any).loadIFC?.(idx);
      log(`Cloud auto-load: ${rec.name} loaded into slot ${idx}`);
    } catch (e: any) {
      console.warn('[cloud-files] auto-load failed for', rec.name, e);
      appState.cloudSyncStatus[idx] = { status: 'error' };
      log(`Cloud auto-load failed for ${rec.name}: ${e?.message || e}`);
    }
    renderSyncChip(idx);
  }
  if (lf) lf.style.width = '100%';
  lo?.classList.remove('on');
}

// ── Cloud project actions (Phase 12/13) ───────────────────────────────────
window.projSwitchCloud = function (id: string): void {
  if (id === appState.activeCloudProjectId) { window.toggleProjectsPanel?.(); return; }
  const loadOv = document.getElementById('loadOv');
  if (loadOv?.classList.contains('on')) { alert('A load is in progress — please wait.'); return; }
  if (!confirmIfHasWork('Switching projects unloads all loaded models and discards unsaved compare/clash results. Continue?')) return;

  saveOutgoingState();
  appState.activeCloudProjectId = id;
  persist();
  navigateTo('viewer');
  (window as any).unloadAllModels?.();
  chipLabel();
  renderProjectList();
  window.dispatchEvent(new CustomEvent('ifc:projectchange'));
  autoLoadCloudProjectFiles(id).catch(e => console.warn('[cloud-files] autoLoadCloudProjectFiles failed:', e));
  window.toggleProjectsPanel?.();
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
  if (!confirm(`Delete cloud project "${p.name}"? This does not delete uploaded files.`)) return;
  const ok = await deleteCloudProject(id);
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
  if (!user || !user.emailVerified) { alert('Sign in with a verified email to create cloud projects.'); return; }
  const nameEl = document.getElementById('projNewName') as HTMLInputElement | null;
  const codeEl = document.getElementById('projNewCode') as HTMLInputElement | null;
  const driveEl = document.getElementById('projNewDrive') as HTMLInputElement | null;
  const name = nameEl?.value.trim() || '';
  if (!name) { nameEl?.focus(); return; }
  if (!confirmIfHasWork('Creating a new project switches to it and unloads all loaded models. Continue?')) return;

  const code = codeEl?.value.trim() || '';
  const drive = driveEl?.value.trim() || '';
  const created = await createCloudProject(name, code, user.uid, user.email, { driveLink: drive });
  if (!created) { alert('Could not create the cloud project. Check your connection and try again.'); return; }
  cloudList = [...cloudList, created];
  if (nameEl) nameEl.value = '';
  if (codeEl) codeEl.value = '';
  if (driveEl) driveEl.value = '';
  window.projSwitchCloud?.(created.id);
};

// Copies name/code/settings of a local project up to a brand-new cloud
// project. Does not touch/remove the local project or its files (Phase 13
// handles actual IFC file upload/migration).
window.projMigrateToCloud = async function (id: string): Promise<void> {
  const user = currentAuthUser();
  if (!user || !user.emailVerified) { alert('Sign in with a verified email to use cloud projects.'); return; }
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

// ── Member sharing (Phase 14) ─────────────────────────────────────────────
// The Invite button (index.html #btnInvite) opens this instead of the old
// static demo dialog. Owner-only add/remove; non-owners viewing a shared
// cloud project get a read-only list. No-op (shows the "not a cloud
// project" message) for local projects — there is no memberEmails to manage.
function activeCloudProject(): CloudProject | undefined {
  return cloudList.find(c => c.id === appState.activeCloudProjectId);
}

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
  const isOwner = !!user && user.email?.toLowerCase() === proj.ownerEmail.toLowerCase();
  addRow.style.display = isOwner ? 'flex' : 'none';
  readOnlyNote.style.display = isOwner ? 'none' : 'block';

  listEl.innerHTML = proj.memberEmails.map(email => {
    const owner = email === proj.ownerEmail;
    const canRemove = isOwner && !owner;
    return `<div class="proj-row">
      <div class="proj-row-dot" style="background:${owner ? '#2563eb' : '#8590a6'}"></div>
      <div class="proj-row-info">
        <div class="proj-row-name">${escapeHtml(email)}</div>
        <div class="proj-row-sub">${owner ? 'Owner' : 'Member'}</div>
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
  const email = input?.value.trim() || '';
  if (!email) { input?.focus(); return; }
  const updated = addMemberEmail(proj.memberEmails, email);
  if (updated === proj.memberEmails) { if (input) input.value = ''; return; } // already a member
  const ok = await updateProjectMembers(proj.id, updated);
  if (!ok) { alert('Could not add member. Check your connection and try again.'); return; }
  proj.memberEmails = updated;
  if (input) input.value = '';
  (window as any).renderMembersPanel?.();
};

(window as any).projRemoveMember = async function (email: string): Promise<void> {
  const proj = activeCloudProject();
  if (!proj) return;
  if (!confirm(`Remove ${email} from this project?`)) return;
  const updated = removeMemberEmail(proj.memberEmails, proj.ownerEmail, email);
  if (updated === proj.memberEmails) return; // owner or not a member — no-op
  const ok = await updateProjectMembers(proj.id, updated);
  if (!ok) { alert('Could not remove member. Check your connection and try again.'); return; }
  proj.memberEmails = updated;
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

// Open the Settings dialog also refreshes the storage figure (in addition
// to the projectchange-triggered refresh above, for the first open of a
// session before any switch has fired).
document.getElementById('btnSettings')?.addEventListener('click', () => refreshStorageUsage());

chipLabel();
