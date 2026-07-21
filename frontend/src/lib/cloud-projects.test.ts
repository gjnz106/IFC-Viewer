import { describe, it, expect } from 'vitest';
import {
  buildCloudProjectDoc, buildMigrationDoc, normalizeMemberEmails, canAccess,
  mergeProjectRegistries, displayKey, addMemberEmail, removeMemberEmail, isProjectOwner, type CloudProject,
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
      { id: 'same-id', name: 'Cloud One', code: 'C1', ownerUid: 'u', ownerEmail: 'a@b.com', memberEmails: ['a@b.com'], settings: {}, createdAt: 1, updatedAt: 1 },
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
      { id: 'c1', name: 'Cloud', code: '', ownerUid: 'u', ownerEmail: 'a@b.com', memberEmails: ['a@b.com'], settings: {}, createdAt: 1, updatedAt: 1 },
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

describe('cloud-projects — addMemberEmail', () => {
  it('adds a new email, normalized to lower case', () => {
    const out = addMemberEmail(['owner@x.com'], 'Bob@Y.com');
    expect(out).toEqual(['owner@x.com', 'bob@y.com']);
  });

  it('is a no-op (same reference) for a duplicate, case-insensitive', () => {
    const list = ['owner@x.com', 'bob@y.com'];
    const out = addMemberEmail(list, 'BOB@Y.COM');
    expect(out).toBe(list);
  });

  it('is a no-op for a blank email', () => {
    const list = ['owner@x.com'];
    expect(addMemberEmail(list, '  ')).toBe(list);
  });
});

describe('cloud-projects — removeMemberEmail', () => {
  it('removes a non-owner member', () => {
    const out = removeMemberEmail(['owner@x.com', 'bob@y.com'], 'owner@x.com', 'bob@y.com');
    expect(out).toEqual(['owner@x.com']);
  });

  it('refuses to remove the owner, even with different case', () => {
    const list = ['owner@x.com', 'bob@y.com'];
    expect(removeMemberEmail(list, 'Owner@X.com', 'OWNER@X.COM')).toBe(list);
  });

  it('is a no-op for a non-member email', () => {
    const list = ['owner@x.com', 'bob@y.com'];
    expect(removeMemberEmail(list, 'owner@x.com', 'eve@z.com')).toBe(list);
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
