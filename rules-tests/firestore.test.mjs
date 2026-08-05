// Rules test for IFC Delta per-project roles.
// Reproduces the reported bug: an EDITOR cannot upload a file.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PROJECT_ID = 'ifc-delta-test';
const OWNER = 'owner@x.com';
const ADMIN = 'admin@x.com';
const EDITOR = 'editor@x.com';
const VIEWER = 'viewer@x.com';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1', port: 8080,
  },
});

// Seed: allowlist docs + one project WITH memberRoles, one WITHOUT (legacy).
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const e of [OWNER, ADMIN, EDITOR, VIEWER]) {
    await setDoc(doc(db, 'allowedUsers', e), { admin: e === OWNER });
  }
  await setDoc(doc(db, 'projects', 'p1'), {
    name: 'P1', code: 'C1', ownerUid: 'u1', ownerEmail: OWNER,
    memberEmails: [OWNER, ADMIN, EDITOR, VIEWER],
    memberRoles: { [OWNER]: 'owner', [ADMIN]: 'admin', [EDITOR]: 'editor', [VIEWER]: 'viewer' },
    settings: {}, createdAt: 1, updatedAt: 1,
  });
  // Legacy doc: written before memberRoles existed — field entirely absent.
  await setDoc(doc(db, 'projects', 'legacy'), {
    name: 'Legacy', code: 'L1', ownerUid: 'u1', ownerEmail: OWNER,
    memberEmails: [OWNER, EDITOR],
    settings: {}, createdAt: 1, updatedAt: 1,
  });
});

function ctxFor(email) {
  return testEnv.authenticatedContext(email.replace(/[^a-z]/g, ''), { email }).firestore();
}

const fileDoc = { name: 'a.ifc', size: 1, slot: 0, storagePath: 'p', contentType: 'x', uploadedBy: EDITOR, uploadedAt: 1 };
let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); console.log('  PASS  ' + label); pass++; }
  catch (e) { console.log('  FAIL  ' + label + '\n        ' + String(e).split('\n')[0].slice(0, 160)); fail++; }
}

console.log('\n--- files/{fileId} write (the reported bug) ---');
await check('owner CAN write a file doc', () =>
  assertSucceeds(setDoc(doc(ctxFor(OWNER), 'projects/p1/files/f1'), fileDoc)));
await check('admin CAN write a file doc', () =>
  assertSucceeds(setDoc(doc(ctxFor(ADMIN), 'projects/p1/files/f2'), fileDoc)));
await check('EDITOR CAN write a file doc  <-- reported as failing', () =>
  assertSucceeds(setDoc(doc(ctxFor(EDITOR), 'projects/p1/files/f3'), fileDoc)));
await check('viewer CANNOT write a file doc', () =>
  assertFails(setDoc(doc(ctxFor(VIEWER), 'projects/p1/files/f4'), fileDoc)));
await check('viewer CAN read a file doc', () =>
  assertSucceeds(getDoc(doc(ctxFor(VIEWER), 'projects/p1/files/f1'))));

console.log('\n--- legacy project (no memberRoles field) ---');
await check('legacy: editor-by-default CAN write a file doc', () =>
  assertSucceeds(setDoc(doc(ctxFor(EDITOR), 'projects/legacy/files/f5'), fileDoc)));
await check('legacy: owner CAN write a file doc', () =>
  assertSucceeds(setDoc(doc(ctxFor(OWNER), 'projects/legacy/files/f6'), fileDoc)));

console.log('\n--- results/{resultId} write ---');
await check('editor CAN write a result doc', () =>
  assertSucceeds(setDoc(doc(ctxFor(EDITOR), 'projects/p1/results/r1'), { kind: 'compare' })));
await check('viewer CANNOT write a result doc', () =>
  assertFails(setDoc(doc(ctxFor(VIEWER), 'projects/p1/results/r2'), { kind: 'compare' })));

console.log(`\n${pass} passed, ${fail} failed\n`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
