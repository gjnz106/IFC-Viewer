# Firestore Security Rules tests

Emulator-backed tests for `../firestore.rules` — specifically the per-project
role model (`owner` > `admin` > `editor` > `viewer`, see
`frontend/src/lib/cloud-projects.ts`).

These exist because a role-gating change shipped without them and broke every
upload in production. Run them before touching `firestore.rules`.

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
