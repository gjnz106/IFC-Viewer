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
  driveLink?: string;
}

export interface CloudProject {
  id: string;
  name: string;
  code: string;
  ownerUid: string;
  ownerEmail: string;
  memberEmails: string[];
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
  driveLink: string;
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

// Builds the doc payload for `projects/{id}` create — pure, no Firestore.
export function buildCloudProjectDoc(
  name: string,
  code: string,
  ownerUid: string,
  ownerEmail: string,
  settings: CloudProjectSettings = {},
): Omit<CloudProject, 'id'> {
  const now = Date.now();
  return {
    name: name.trim() || 'Untitled Project',
    code: code.trim(),
    ownerUid,
    ownerEmail: normEmail(ownerEmail),
    memberEmails: normalizeMemberEmails(ownerEmail, []),
    settings: { units: settings.units, driveLink: (settings.driveLink || '').trim() },
    createdAt: now,
    updatedAt: now,
  };
}

// Copies name/code/settings only — file upload/migration is Phase 13.
export function buildMigrationDoc(project: Project, ownerUid: string, ownerEmail: string): Omit<CloudProject, 'id'> {
  return buildCloudProjectDoc(project.name, project.code, ownerUid, ownerEmail, {
    units: project.state.units,
    driveLink: project.state.driveLink,
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
    driveLink: p.settings.driveLink || '',
    active: p.id === activeCloudId,
    raw: p,
  }));
  const local: MergedProjectItem[] = localList.map(p => ({
    source: 'local',
    id: p.id,
    name: p.name,
    code: p.code,
    driveLink: p.state.driveLink || '',
    active: !activeCloudId && p.id === activeLocalId,
    raw: p,
  }));
  return [...cloud, ...local];
}

export function displayKey(item: MergedProjectItem): string {
  return item.source + ':' + item.id;
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

export async function fetchCloudProjects(email: string): Promise<CloudProject[]> {
  const target = normEmail(email);
  if (!target) return [];
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = await getDb();
    const q = query(collection(db, 'projects'), where('memberEmails', 'array-contains', target));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CloudProject, 'id'>) }));
  } catch (e) {
    console.warn('[cloud-projects] fetchCloudProjects failed, falling back to local-only:', e);
    return [];
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
