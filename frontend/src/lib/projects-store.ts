/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — PROJECTS (local-first project registry)
   ───────────────────────────────────────────────────────────────────────
   A "project" here is just a name/code + a Drive link + a small bag of
   per-project UI state (camera, last page, unit pref) — there is no
   backend. Logic mirrors validate/snapshots.ts: pure functions operate on
   a plain registry object so they're unit-testable, and a thin LocalStorage
   glue layer at the bottom does the actual reads/writes.
═══════════════════════════════════════════════════════════════════════ */

export interface ProjectState {
  driveLink: string;
  units?: 'mm' | 'm' | 'ftin';
  page?: string;
  camera?: { px: number; py: number; pz: number; tx: number; ty: number; tz: number };
}

export interface Project {
  id: string;
  name: string;
  code: string;
  state: ProjectState;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRegistry {
  activeId: string;
  list: Project[];
}

function makeId(): string {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

function makeProject(name: string, code: string, driveLink = ''): Project {
  const now = Date.now();
  return { id: makeId(), name: name || 'Untitled Project', code, state: { driveLink }, createdAt: now, updatedAt: now };
}

// ── Pure registry operations ────────────────────────────────────────────

export function createProject(reg: ProjectRegistry, name: string, code: string, driveLink = ''): ProjectRegistry {
  const p = makeProject(name.trim(), code.trim(), driveLink.trim());
  return { activeId: p.id, list: [...reg.list, p] };
}

export function renameProject(reg: ProjectRegistry, id: string, name: string, code: string): ProjectRegistry {
  return {
    ...reg,
    list: reg.list.map(p => p.id === id
      ? { ...p, name: name.trim() || p.name, code: code.trim(), updatedAt: Date.now() }
      : p),
  };
}

export function updateProjectState(reg: ProjectRegistry, id: string, patch: Partial<ProjectState>): ProjectRegistry {
  return {
    ...reg,
    list: reg.list.map(p => p.id === id
      ? { ...p, state: { ...p.state, ...patch }, updatedAt: Date.now() }
      : p),
  };
}

// Deleting the active project promotes the first remaining one; deleting the
// last project recreates a fresh "Default Project" so the registry is never
// empty (getActiveProject/UI always have something to point at).
export function deleteProject(reg: ProjectRegistry, id: string): ProjectRegistry {
  const list = reg.list.filter(p => p.id !== id);
  if (list.length === 0) {
    const fresh = makeProject('Default Project', '');
    return { activeId: fresh.id, list: [fresh] };
  }
  const activeId = reg.activeId === id ? list[0].id : reg.activeId;
  return { activeId, list };
}

export function setActive(reg: ProjectRegistry, id: string): ProjectRegistry {
  if (!reg.list.some(p => p.id === id)) return reg;
  return { ...reg, activeId: id };
}

export function getActiveProject(reg: ProjectRegistry): Project | null {
  return reg.list.find(p => p.id === reg.activeId) || reg.list[0] || null;
}

// First-run migration: wrap the legacy single `projectDriveLink` value into
// a one-project registry so existing users don't lose their configured link.
export function migrateLegacy(driveLink: string): ProjectRegistry {
  const p = makeProject('Default Project', '', driveLink || '');
  return { activeId: p.id, list: [p] };
}

// ── LocalStorage glue ──────────────────────────────────────────────────
const STORE_KEY = 'ifc.projects.v1';
const LEGACY_DRIVE_KEY = 'projectDriveLink';

export function loadRegistry(): ProjectRegistry {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.list) && parsed.list.length > 0) return parsed;
    }
  } catch { /* corrupt JSON / quota */ }
  let legacyLink = '';
  try { legacyLink = localStorage.getItem(LEGACY_DRIVE_KEY) || ''; } catch { /* private mode */ }
  return migrateLegacy(legacyLink);
}

export function saveRegistry(reg: ProjectRegistry): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(reg)); } catch { /* quota/private mode */ }
}

// Mirror the active project's Drive link into the legacy key so every
// existing reader (drive.ts, router.ts's applyWorkspace, ui-shell.ts's
// Settings modal) keeps working unmodified.
export function mirrorActiveDriveLink(reg: ProjectRegistry): void {
  const active = getActiveProject(reg);
  const link = active?.state.driveLink || '';
  try {
    if (link) localStorage.setItem(LEGACY_DRIVE_KEY, link);
    else localStorage.removeItem(LEGACY_DRIVE_KEY);
  } catch { /* private mode */ }
}
