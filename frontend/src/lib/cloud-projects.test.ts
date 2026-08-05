import { describe, it, expect } from 'vitest';
import {
  buildCloudProjectDoc, buildMigrationDoc, normalizeMemberEmails, canAccess,
  mergeProjectRegistries, displayKey, addMember, removeMember, setMemberRole, isProjectOwner,
  normalizeMemberRoles, roleOf, roleAtLeast, canManageMembers, canEditProject, type CloudProject,
} from './cloud-projects.js';
import { createProject, type ProjectRegistry } from './projects-store.js';

function emptyReg(): ProjectRegistry {
  return { activeId: '', list: [] };
}

describe('cloud-projects — buildCloudProjectDoc', () => {
  it('produces the exact spec shape', () => {
    const doc = buildCloudProjectDoc('City Tower', 'CT-P1', 'uid-1', 'Owner@Example.com', { units: 'mm' });
    expect(doc.name).toBe('City Tower');
    expect(doc.code).toBe('CT-P1');
    expect(doc.ownerUid).toBe('uid-1');
    expect(doc.ownerEmail).toBe('owner@example.com');
    expect(doc.memberEmails).toEqual(['owner@example.com']);
    expect(doc.memberRoles).toEqual({ 'owner@example.com': 'owner' });
    expect(doc.settings).toEqual({ units: 'mm' });
    expect(typeof doc.createdAt).toBe('number');
    expect(doc.createdAt).toBe(doc.updatedAt);
  });

  it('falls back to "Untitled Project" for a blank name', () => {
    const doc = buildCloudProjectDoc('   ', '', 'uid', 'a@b.com');
    expect(doc.name).toBe('Untitled Project');
  });
});

describe('cloud-projects — buildMigrationDoc', () => {
  it('copies name/code/settings from a local project, not files', () => {
    const reg = createProject(emptyReg(), 'Bridge B', 'BR-2');
    const local = reg.list[0];
    local.state.units = 'm';
    const doc = buildMigrationDoc(local, 'uid-9', 'me@co.com');
    expect(doc.name).toBe('Bridge B');
    expect(doc.code).toBe('BR-2');
    expect(doc.settings.units).toBe('m');
    expect(doc.ownerEmail).toBe('me@co.com');
    expect(doc.memberEmails).toContain('me@co.com');
  });
});

describe('cloud-projects — normalizeMemberEmails', () => {
  it('always includes the owner even if omitted', () => {
    const emails = normalizeMemberEmails('Owner@X.com', []);
    expect(emails).toEqual(['owner@x.com']);
  });

  it('dedupes and lower-cases everything', () => {
    const emails = normalizeMemberEmails('Owner@X.com', ['OWNER@x.com', 'Bob@Y.com', 'bob@y.com']);
    expect(emails.sort()).toEqual(['bob@y.com', 'owner@x.com']);
  });

  it('drops blank entries', () => {
    const emails = normalizeMemberEmails('a@b.com', ['', '  ']);
    expect(emails).toEqual(['a@b.com']);
  });
});

describe('cloud-projects — canAccess', () => {
  const members = ['owner@x.com', 'bob@y.com'];
  it('matches case-insensitively', () => {
    expect(canAccess(members, 'Bob@Y.com')).toBe(true);
    expect(canAccess(members, 'BOB@Y.COM')).toBe(true);
  });
  it('rejects non-members', () => {
    expect(canAccess(members, 'eve@z.com')).toBe(false);
  });
  it('rejects empty email', () => {
    expect(canAccess(members, '')).toBe(false);
  });
});

describe('cloud-projects — mergeProjectRegistries', () => {
  it('dedupes by display key and never collides cloud/local ids', () => {
    const cloud: CloudProject[] = [
      { id: 'same-id', name: 'Cloud One', code: 'C1', ownerUid: 'u', ownerEmail: 'a@b.com', memberEmails: ['a@b.com'], memberRoles: { 'a@b.com': 'owner' }, settings: {}, createdAt: 1, updatedAt: 1 },
    ];
    let reg = createProject(emptyReg(), 'Local One', 'L1');
    reg.list[0].id = 'same-id'; // force a raw id collision on purpose
    const merged = mergeProjectRegistries(cloud, reg.list, reg.activeId, null);
    expect(merged).toHaveLength(2);
    const keys = merged.map(displayKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain('cloud:same-id');
    expect(keys).toContain('local:same-id');
  });

  it('marks the correct item active depending on activeCloudId', () => {
    const cloud: CloudProject[] = [
      { id: 'c1', name: 'Cloud', code: '', ownerUid: 'u', ownerEmail: 'a@b.com', memberEmails: ['a@b.com'], memberRoles: { 'a@b.com': 'owner' }, settings: {}, createdAt: 1, updatedAt: 1 },
    ];
    let reg = createProject(emptyReg(), 'Local', '');
    const localId = reg.list[0].id;

    const withCloudActive = mergeProjectRegistries(cloud, reg.list, localId, 'c1');
    expect(withCloudActive.find(i => i.source === 'cloud')?.active).toBe(true);
    expect(withCloudActive.find(i => i.source === 'local')?.active).toBe(false);

    const withLocalActive = mergeProjectRegistries(cloud, reg.list, localId, null);
    expect(withLocalActive.find(i => i.source === 'cloud')?.active).toBe(false);
    expect(withLocalActive.find(i => i.source === 'local')?.active).toBe(true);
  });
});

describe('cloud-projects — addMember', () => {
  it('adds a new email as editor by default, normalized to lower case', () => {
    const out = addMember(['owner@x.com'], { 'owner@x.com': 'owner' }, 'Bob@Y.com');
    expect(out.memberEmails).toEqual(['owner@x.com', 'bob@y.com']);
    expect(out.memberRoles).toEqual({ 'owner@x.com': 'owner', 'bob@y.com': 'editor' });
  });

  it('adds with an explicit role', () => {
    const out = addMember(['owner@x.com'], { 'owner@x.com': 'owner' }, 'bob@y.com', 'viewer');
    expect(out.memberRoles['bob@y.com']).toBe('viewer');
  });

  it('downgrades a requested "owner" role to "admin" — ownership is not grantable via add', () => {
    const out = addMember(['owner@x.com'], { 'owner@x.com': 'owner' }, 'bob@y.com', 'owner');
    expect(out.memberRoles['bob@y.com']).toBe('admin');
  });

  it('is a no-op (same references) for a duplicate, case-insensitive', () => {
    const emails = ['owner@x.com', 'bob@y.com'];
    const roles = { 'owner@x.com': 'owner' as const, 'bob@y.com': 'editor' as const };
    const out = addMember(emails, roles, 'BOB@Y.COM');
    expect(out.memberEmails).toBe(emails);
    expect(out.memberRoles).toBe(roles);
  });

  it('is a no-op for a blank email', () => {
    const emails = ['owner@x.com'];
    const roles = { 'owner@x.com': 'owner' as const };
    expect(addMember(emails, roles, '  ').memberEmails).toBe(emails);
  });
});

describe('cloud-projects — removeMember', () => {
  const roles = { 'owner@x.com': 'owner' as const, 'bob@y.com': 'editor' as const };

  it('removes a non-owner member from both fields', () => {
    const out = removeMember(['owner@x.com', 'bob@y.com'], roles, 'owner@x.com', 'bob@y.com');
    expect(out.memberEmails).toEqual(['owner@x.com']);
    expect(out.memberRoles).toEqual({ 'owner@x.com': 'owner' });
  });

  it('refuses to remove the owner, even with different case', () => {
    const emails = ['owner@x.com', 'bob@y.com'];
    const out = removeMember(emails, roles, 'Owner@X.com', 'OWNER@X.COM');
    expect(out.memberEmails).toBe(emails);
    expect(out.memberRoles).toBe(roles);
  });

  it('is a no-op for a non-member email', () => {
    const emails = ['owner@x.com', 'bob@y.com'];
    const out = removeMember(emails, roles, 'owner@x.com', 'eve@z.com');
    expect(out.memberEmails).toBe(emails);
  });
});

describe('cloud-projects — setMemberRole', () => {
  const roles = { 'owner@x.com': 'owner' as const, 'bob@y.com': 'editor' as const };

  it('changes an existing member to a new role', () => {
    expect(setMemberRole(roles, 'owner@x.com', 'bob@y.com', 'viewer')).toEqual({ 'owner@x.com': 'owner', 'bob@y.com': 'viewer' });
  });

  it('refuses to touch the owner, even with different case', () => {
    expect(setMemberRole(roles, 'Owner@X.com', 'OWNER@X.COM', 'viewer')).toBe(roles);
  });

  it('refuses to grant owner to anyone else', () => {
    expect(setMemberRole(roles, 'owner@x.com', 'bob@y.com', 'owner')).toBe(roles);
  });

  it('is a no-op for a non-member', () => {
    expect(setMemberRole(roles, 'owner@x.com', 'eve@z.com', 'admin')).toBe(roles);
  });

  it('is a no-op when the role is unchanged', () => {
    expect(setMemberRole(roles, 'owner@x.com', 'bob@y.com', 'editor')).toBe(roles);
  });
});

describe('cloud-projects — normalizeMemberRoles', () => {
  it('assigns "editor" to members with no stored role — the pre-roles migration default', () => {
    expect(normalizeMemberRoles('owner@x.com', ['owner@x.com', 'bob@y.com'])).toEqual({
      'owner@x.com': 'owner', 'bob@y.com': 'editor',
    });
  });

  it('forces the owner to "owner" even if a stale doc says otherwise', () => {
    expect(normalizeMemberRoles('owner@x.com', ['owner@x.com'], { 'owner@x.com': 'viewer' }))
      .toEqual({ 'owner@x.com': 'owner' });
  });

  it('drops roles for emails no longer in memberEmails', () => {
    expect(normalizeMemberRoles('owner@x.com', ['owner@x.com'], { 'owner@x.com': 'owner', 'gone@y.com': 'editor' }))
      .toEqual({ 'owner@x.com': 'owner' });
  });

  it('preserves an existing explicit role', () => {
    expect(normalizeMemberRoles('owner@x.com', ['owner@x.com', 'bob@y.com'], { 'bob@y.com': 'viewer' }))
      .toEqual({ 'owner@x.com': 'owner', 'bob@y.com': 'viewer' });
  });
});

describe('cloud-projects — roleOf / roleAtLeast / canManageMembers / canEditProject', () => {
  const proj = { ownerEmail: 'owner@x.com', memberRoles: { 'owner@x.com': 'owner' as const, 'bob@y.com': 'viewer' as const } };

  it('roleOf reads the stored role', () => {
    expect(roleOf(proj, 'bob@y.com')).toBe('viewer');
    expect(roleOf(proj, 'BOB@Y.COM')).toBe('viewer');
  });

  it('roleOf falls back to owner for the owner even without a memberRoles entry', () => {
    expect(roleOf({ ownerEmail: 'owner@x.com', memberRoles: {} }, 'owner@x.com')).toBe('owner');
  });

  it('roleOf returns null for a non-member or blank email', () => {
    expect(roleOf(proj, 'eve@z.com')).toBeNull();
    expect(roleOf(proj, '')).toBeNull();
    expect(roleOf(proj, null)).toBeNull();
  });

  it('roleAtLeast ranks owner > admin > editor > viewer', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'admin')).toBe(true);
    expect(roleAtLeast('editor', 'admin')).toBe(false);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast(null, 'viewer')).toBe(false);
  });

  it('canManageMembers requires admin or owner', () => {
    expect(canManageMembers(proj, 'owner@x.com')).toBe(true);
    expect(canManageMembers(proj, 'bob@y.com')).toBe(false);
  });

  it('canEditProject requires editor or above — a viewer cannot', () => {
    expect(canEditProject(proj, 'owner@x.com')).toBe(true);
    expect(canEditProject(proj, 'bob@y.com')).toBe(false);
  });
});

describe('cloud-projects — isProjectOwner', () => {
  const proj = { ownerEmail: 'owner@x.com' };

  it('matches the owner case-insensitively', () => {
    expect(isProjectOwner(proj, 'owner@x.com')).toBe(true);
    expect(isProjectOwner(proj, '  Owner@X.COM ')).toBe(true);
  });

  it('rejects non-owner members and empty emails', () => {
    expect(isProjectOwner(proj, 'bob@y.com')).toBe(false);
    expect(isProjectOwner(proj, '')).toBe(false);
    expect(isProjectOwner(proj, null)).toBe(false);
    expect(isProjectOwner(proj, undefined)).toBe(false);
  });
});
