// Regression test: changing a member's role must land on the intended key.
//
// updateDoc() parses a STRING key as a dotted field path, and every email
// contains dots — so `{ ['memberRoles.' + email]: role }` wrote to
// memberRoles -> 'bob@corp' -> 'com' and left the real entry untouched. The
// write reported success and the role change silently did nothing for
// everyone except the person who made it. cloud-projects.ts must therefore
// use FieldPath('memberRoles', email), which treats each argument as one
// literal segment.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, FieldPath } from 'firebase/firestore';

const OPEN_RULES = 'rules_version="2";service cloud.firestore{match /databases/{d}/documents{match /{p=**}{allow read,write:if true;}}}';
const EMAIL = 'bob@corp.com'; // two dots — one in the domain, one in the TLD

const testEnv = await initializeTestEnvironment({
  projectId: 'member-role-write',
  firestore: { rules: OPEN_RULES, host: '127.0.0.1', port: 8080 },
});

let pass = 0, fail = 0;
function expectEqual(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  PASS  ' + label); pass++; }
  else { console.log(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); fail++; }
}

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const ref = doc(ctx.firestore(), 'projects', 'p1');
  const seed = { ownerEmail: 'owner@x.com', memberRoles: { 'owner@x.com': 'owner', [EMAIL]: 'viewer' } };

  // The shape cloud-projects.ts's updateMemberRole must produce.
  await setDoc(ref, seed);
  await updateDoc(ref, new FieldPath('memberRoles', EMAIL), 'admin', 'updatedAt', 123);
  const after = (await getDoc(ref)).data();
  expectEqual('promotes viewer -> admin on the real key', after.memberRoles[EMAIL], 'admin');
  expectEqual('does not disturb other members', after.memberRoles['owner@x.com'], 'owner');
  expectEqual('creates no extra keys', Object.keys(after.memberRoles).sort(), [EMAIL, 'owner@x.com'].sort());
  expectEqual('still stamps updatedAt', after.updatedAt, 123);

  // Guard the exact regression: the dotted-string form must NOT be used.
  await setDoc(ref, seed);
  await updateDoc(ref, { [`memberRoles.${EMAIL}`]: 'admin' });
  const broken = (await getDoc(ref)).data();
  expectEqual('dotted-string form is still broken (why FieldPath is required)', broken.memberRoles[EMAIL], 'viewer');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
