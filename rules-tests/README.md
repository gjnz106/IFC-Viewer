# Firestore Security Rules tests

Emulator-backed tests for the per-project role model (`owner` > `admin` >
`editor` > `viewer`, see `frontend/src/lib/cloud-projects.ts`).

- **`firestore.test.mjs`** — `../firestore.rules`: who can read/write project
  docs, files, and results at each role, including legacy documents with no
  `memberRoles` field.
- **`member-role-write.test.mjs`** — that `updateMemberRole()` writes to the
  key it means to. `updateDoc()` parses a *string* key as a dotted field path
  and every email contains dots, so the obvious
  `{ ['memberRoles.' + email]: role }` wrote to `memberRoles → 'bob@corp' →
  'com'`, reported success, and silently changed nothing. `FieldPath` is
  required.

These exist because two bugs shipped without them: a role-gating change that
broke every upload in production, and the field-path bug above. Run them
before touching `firestore.rules` or the membership write path.

## Run

```sh
cd rules-tests
npm install
npm test
```

Requires Java (the Firestore emulator is a JAR). If the emulator prints
`Unexpected rules runtime error: Picked up JAVA_TOOL_OPTIONS: ...`, that
banner is corrupting the emulator's stdio — clear the variable for the run:

```sh
env -u JAVA_TOOL_OPTIONS npm test
```

## What is NOT covered

`../storage.rules` is **not** tested here. The Storage emulator's
cross-service `firestore.get()/exists()` does not work under
`@firebase/rules-unit-testing` in this setup — even a known-good version of
`storage.rules` fails every check, so a run proves nothing either way. That
is exactly why `storage.rules` is deliberately membership-only rather than
role-aware; see the comment at the top of that file before changing it.
