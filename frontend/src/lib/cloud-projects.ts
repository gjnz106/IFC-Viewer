/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — CLOUD PROJECTS (Firestore-backed registry, Phase 12)
   ───────────────────────────────────────────────────────────────────────
   Parallel layer on top of projects-store.ts's local-first registry — does
   NOT replace it. Pure helpers (payload building, validation, merge) below
   have zero Firestore import so they're unit-testable without the SDK; the
   thin glue functions at the bottom lazy-`import('firebase/firestore')`
   (same pattern as main.ts's idle-loaded ai.ts) so the ~300KB SDK never
   lands in the main chunk for logged-out / local-only users.

   `files/{fileId}` subcollection CRUD is Phase 13's job — only the shape
   is declared here so Phase 13 doesn't need to touch this file's schema.
═══════════════════════════════════════════════════════════════════════ */

import type { Project } from './projects-store.js';

export interface CloudProjectSettings {
  units?: 'mm' | 'm' | 'ftin';
}

// Per-project role, distinct from the app-wide `window.isAdmin` flag (which
// only gates who may CREATE a cloud project — see auth.ts / firestore.rules
// isAdmin()). Ordered least → most privileged so callers can compare with
// ROLE_RANK instead of an if/else chain per permission.
export type ProjectRole = 'viewer' | 'editor' | 'admin' | 'owner';

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: ProjectRole | null | undefined, min: ProjectRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface CloudProject {
  id: string;
  name: string;
  code: string;
  ownerUid: string;
  ownerEmail: string;
  /**
   * Membership existence — kept as a flat string array (not folded into
   * memberRoles) because Firestore can only run a cheap `array-contains`
   * query against a primitive array; fetchCloudProjects() depends on that.
   * Always a superset match of memberRoles' keys — every entry here has a
   * role in memberRoles, enforced by normalizeMemberRoles below.
   */
  memberEmails: string[];
  /** email (lower-cased) -> role. The owner's entry is always 'owner'. */
  memberRoles: Record<string, ProjectRole>;
  settings: CloudProjectSettings;
  createdAt: number;
  updatedAt: number;
}

// Phase 13 fills in the actual upload/list/delete glue against this shape.
export interface CloudProjectFile {
  id: string;
  name: string;
  size: number;
  slot: 'A' | 'B' | number;
  storagePath: string;
  contentType: string;
  uploadedBy: string;
  uploadedAt: number;
}

export interface MergedProjectItem {
  source: 'cloud' | 'local';
  id: string;
  name: string;
  code: string;
  active: boolean;
  raw: CloudProject | Project;
}

function makeId(): string {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

function normEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

// ── Pure helpers (no Firestore import — unit-testable standalone) ───────

// memberEmails must always contain ownerEmail (rules check membership off
// this single array — see firestore.rules). Dedupes + normalizes to lower
// case so `canAccess` stays a plain case-insensitive `includes`.
export function normalizeMemberEmails(ownerEmail: string, memberEmails: string[] = []): string[] {
  const owner = normEmail(ownerEmail);
  const set = new Set<string>([owner, ...memberEmails.map(normEmail)].filter(Boolean));
  return Array.from(set);
}

export function canAccess(memberEmails: string[], email: string): boolean {
  const target = normEmail(email);
  if (!target) return false;
  return memberEmails.some(m => normEmail(m) === target);
}

// Mirrors firestore.rules' owner-only delete check (email() == ownerEmail)
// so the UI can hide the delete button from non-owners.
export function isProjectOwner(project: Pick<CloudProject, 'ownerEmail'>, email: string | null | undefined): boolean {
  const target = normEmail(email || '');
  return !!target && normEmail(project.ownerEmail) === target;
}

// Fills in a role for every memberEmails entry that's missing one, and drops
// stale roles for emails no longer in memberEmails. The owner's role is
// always forced to 'owner' regardless of what's stored.
//
// This is also the migration path for docs written before memberRoles
// existed (memberRoles: undefined): every existing member defaults to
// 'editor', matching the full read/write access they already had — nobody
// who could edit yesterday silently becomes a read-only viewer today just
// because this field shipped.
export function normalizeMemberRoles(
  ownerEmail: string,
  memberEmails: string[],
  memberRoles: Record<string, ProjectRole> = {},
): Record<string, ProjectRole> {
  const owner = normEmail(ownerEmail);
  const out: Record<string, ProjectRole> = {};
  for (const raw of memberEmails) {
    const email = normEmail(raw);
    if (!email) continue;
    out[email] = email === owner ? 'owner' : (memberRoles[email] || 'editor');
  }
  out[owner] = 'owner'; // present even if the caller forgot to include the owner in memberEmails
  return out;
}

// Ownership is always read from ownerEmail, never trusted from memberRoles —
// mirrors firestore.rules'/storage.rules' roleOf() exactly (see
// firestore.rules' header comment), so a stray 'owner' string under a
// non-owner key here is inert client-side too, not just server-side.
// Callers are expected to pass an already-normalized project (every project
// this module returns from Firestore has been through normalizeMemberRoles),
// so a member absent from memberRoles is a genuine "not a member" rather
// than the pre-normalization "assume editor" default.
export function roleOf(
  project: Pick<CloudProject, 'ownerEmail' | 'memberRoles'>,
  email: string | null | undefined,
): ProjectRole | null {
  const target = normEmail(email || '');
  if (!target) return null;
  if (target === normEmail(project.ownerEmail)) return 'owner';
  const stored = project.memberRoles?.[target];
  return stored && stored !== 'owner' ? stored : null;
}

export function canManageMembers(
  project: Pick<CloudProject, 'ownerEmail' | 'memberRoles'>,
  email: string | null | undefined,
): boolean {
  return roleAtLeast(roleOf(project, email), 'admin');
}

export function canEditProject(
  project: Pick<CloudProject, 'ownerEmail' | 'memberRoles'>,
  email: string | null | undefined,
): boolean {
  return roleAtLeast(roleOf(project, email), 'editor');
}

// Builds the doc payload for `projects/{id}` create — pure, no Firestore.
export function buildCloudProjectDoc(
  name: string,
  code: string,
  ownerUid: string,
  ownerEmail: string,
  settings: CloudProjectSettings = {},
): Omit<CloudProject, 'id'> {
  const now = Date.now();
  const cleanSettings: CloudProjectSettings = {};
  if (settings.units) cleanSettings.units = settings.units;
  const memberEmails = normalizeMemberEmails(ownerEmail, []);
  return {
    name: name.trim() || 'Untitled Project',
    code: code.trim(),
    ownerUid,
    ownerEmail: normEmail(ownerEmail),
    memberEmails,
    memberRoles: normalizeMemberRoles(ownerEmail, memberEmails, {}),
    settings: cleanSettings,
    createdAt: now,
    updatedAt: now,
  };
}

// Copies name/code/settings only — file upload/migration is Phase 13.
export function buildMigrationDoc(project: Project, ownerUid: string, ownerEmail: string): Omit<CloudProject, 'id'> {
  return buildCloudProjectDoc(project.name, project.code, ownerUid, ownerEmail, {
    units: project.state.units,
  });
}

// Merges cloud + local registries into one display list. Cloud and local
// ids are both crypto.randomUUID() from disjoint stores — a raw collision
// is astronomically unlikely but we still namespace the *display* key
// (`source:id`) so the UI never has to worry about it, while `id` stays
// the real underlying id for switch/rename/delete calls.
export function mergeProjectRegistries(
  cloudList: CloudProject[],
  localList: Project[],
  activeLocalId: string | null,
  activeCloudId: string | null,
): MergedProjectItem[] {
  const cloud: MergedProjectItem[] = cloudList.map(p => ({
    source: 'cloud',
    id: p.id,
    name: p.name,
    code: p.code,
    active: p.id === activeCloudId,
    raw: p,
  }));
  const local: MergedProjectItem[] = localList.map(p => ({
    source: 'local',
    id: p.id,
    name: p.name,
    code: p.code,
    active: !activeCloudId && p.id === activeLocalId,
    raw: p,
  }));
  return [...cloud, ...local];
}

export function displayKey(item: MergedProjectItem): string {
  return item.source + ':' + item.id;
}

// ── Member sharing + roles (Phase 14, extended with per-project roles) ──

export interface MembershipUpdate {
  memberEmails: string[];
  memberRoles: Record<string, ProjectRole>;
}

// Adds a member with the given role (default 'editor' — the access level
// every member had before roles existed, so the default add stays
// behaviorally identical to the old addMemberEmail). 'owner' can't be
// granted this way — ownership has no transfer UI/rules support yet — a
// request for it silently downgrades to 'admin'. No-op (same references) if
// already a member; use setMemberRole to change an existing member instead.
export function addMember(
  memberEmails: string[], memberRoles: Record<string, ProjectRole>, email: string, role: ProjectRole = 'editor',
): MembershipUpdate {
  const target = normEmail(email);
  if (!target || canAccess(memberEmails, target)) return { memberEmails, memberRoles };
  const grantedRole: ProjectRole = role === 'owner' ? 'admin' : role;
  return {
    memberEmails: [...memberEmails, target],
    memberRoles: { ...memberRoles, [target]: grantedRole },
  };
}

// Removing the owner's own email is never allowed — the owner is always a
// member (see normalizeMemberEmails). No-op (same references) if the email
// isn't a member or is the owner.
export function removeMember(
  memberEmails: string[], memberRoles: Record<string, ProjectRole>, ownerEmail: string, email: string,
): MembershipUpdate {
  const target = normEmail(email);
  if (!target || target === normEmail(ownerEmail)) return { memberEmails, memberRoles };
  if (!canAccess(memberEmails, target)) return { memberEmails, memberRoles };
  const nextRoles = { ...memberRoles };
  delete nextRoles[target];
  return { memberEmails: memberEmails.filter(m => normEmail(m) !== target), memberRoles: nextRoles };
}

// Changes an existing member's role. Refuses to touch the owner (no
// ownership-transfer flow yet) and refuses to grant 'owner' to anyone else —
// the same two invariants firestore.rules enforces server-side, so a UI bug
// here fails safe rather than relying on the rules alone. No-op (same
// reference) if the target isn't a member or already has that role.
export function setMemberRole(
  memberRoles: Record<string, ProjectRole>, ownerEmail: string, email: string, role: ProjectRole,
): Record<string, ProjectRole> {
  const target = normEmail(email);
  if (!target || target === normEmail(ownerEmail) || role === 'owner') return memberRoles;
  if (!(target in memberRoles) || memberRoles[target] === role) return memberRoles;
  return { ...memberRoles, [target]: role };
}

// Full membership replace — used for add/remove, where memberEmails and
// memberRoles must land together (a partial write could leave an email in
// one field but not the other).
export async function updateProjectMembership(id: string, update: MembershipUpdate): Promise<boolean> {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'projects', id), {
      memberEmails: update.memberEmails,
      memberRoles: update.memberRoles,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.warn('[cloud-projects] updateProjectMembership failed:', e);
    return false;
  }
}

// Patches a single member's role via a Firestore map-field path
// (`memberRoles.<email>`) instead of rewriting the whole map, so two admins
// changing different members' roles at the same time don't clobber each
// other the way a full-object replace would.
export async function updateMemberRole(id: string, email: string, role: ProjectRole): Promise<boolean> {
  const target = normEmail(email);
  if (!target) return false;
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'projects', id), { [`memberRoles.${target}`]: role, updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn('[cloud-projects] updateMemberRole failed:', e);
    return false;
  }
}

// Best-effort mirror of per-project settings (units, and later viewpoints)
// up to the cloud doc — never blocks the local-first flow (Phase 6/8/9
// remain the source of truth; this is purely an additive sync for
// cross-machine convenience). Swallows all errors.
export async function syncProjectSettings(id: string, settings: Partial<CloudProjectSettings> & Record<string, unknown>): Promise<void> {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(settings)) if (v !== undefined) patch['settings.' + k] = v;
    await updateDoc(doc(db, 'projects', id), patch);
  } catch (e) {
    console.warn('[cloud-projects] syncProjectSettings failed (best-effort, ignored):', e);
  }
}

// ── Firestore glue (lazy-imported SDK — never in the main bundle) ───────

async function getDb() {
  const [{ getApps, getApp }, { getFirestore }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ]);
  // auth.ts already calls initializeApp(firebaseConfig) at module load —
  // reuse that instance instead of re-initializing with a second config copy.
  if (!getApps().length) throw new Error('Firebase app not initialized (auth.ts should run first)');
  return getFirestore(getApp());
}

// Returns null on failure (network/permission) so callers can distinguish
// "couldn't load" from a genuinely empty [] project list.
export async function fetchCloudProjects(email: string): Promise<CloudProject[] | null> {
  const target = normEmail(email);
  if (!target) return [];
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = await getDb();
    const q = query(collection(db, 'projects'), where('memberEmails', 'array-contains', target));
    const snap = await getDocs(q);
    // normalizeMemberRoles fills in 'editor' for any doc written before
    // memberRoles existed (field absent → {} default) — this is the read-path
    // migration, so projects created before this shipped don't need a
    // one-off backfill script; every read just self-heals.
    return snap.docs.map(d => {
      const data = d.data() as Omit<CloudProject, 'id'>;
      return { id: d.id, ...data, memberRoles: normalizeMemberRoles(data.ownerEmail, data.memberEmails, data.memberRoles) };
    });
  } catch (e) {
    console.warn('[cloud-projects] fetchCloudProjects failed, falling back to local-only:', e);
    return null;
  }
}

export async function createCloudProject(
  name: string,
  code: string,
  ownerUid: string,
  ownerEmail: string,
  settings: CloudProjectSettings = {},
): Promise<CloudProject | null> {
  try {
    const { doc, setDoc, collection } = await import('firebase/firestore');
    const db = await getDb();
    const id = makeId();
    const payload = buildCloudProjectDoc(name, code, ownerUid, ownerEmail, settings);
    await setDoc(doc(collection(db, 'projects'), id), payload);
    return { id, ...payload };
  } catch (e) {
    console.warn('[cloud-projects] createCloudProject failed:', e);
    return null;
  }
}

export async function renameCloudProject(id: string, name: string, code: string): Promise<boolean> {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'projects', id), { name: name.trim(), code: code.trim(), updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn('[cloud-projects] renameCloudProject failed:', e);
    return false;
  }
}

export async function deleteCloudProject(id: string): Promise<boolean> {
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    const db = await getDb();
    await deleteDoc(doc(db, 'projects', id));
    return true;
  } catch (e) {
    console.warn('[cloud-projects] deleteCloudProject failed:', e);
    return false;
  }
}

// Migrates a local project's name/code/settings up to a new cloud project.
// Does NOT touch/delete the local project or move any IFC files (Phase 13).
export async function migrateLocalToCloud(project: Project, ownerUid: string, ownerEmail: string): Promise<CloudProject | null> {
  try {
    const { doc, setDoc, collection } = await import('firebase/firestore');
    const db = await getDb();
    const id = makeId();
    const payload = buildMigrationDoc(project, ownerUid, ownerEmail);
    await setDoc(doc(collection(db, 'projects'), id), payload);
    return { id, ...payload };
  } catch (e) {
    console.warn('[cloud-projects] migrateLocalToCloud failed:', e);
    return null;
  }
}
