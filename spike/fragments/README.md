# Fragments spike — throwaway

**Not part of the app.** Nothing here is imported by `frontend/`, nothing is
deployed, and the root workspace (`frontend`, `backend`) does not include it.
Delete the whole directory when the question below is answered.

## The question

IFC Delta runs on `web-ifc-three@0.0.126`, which That Open has stopped
developing in favour of `@thatopen/fragments`. Moving would fix the deprecated
dependency and the ~250 MB parse ceiling — but IFC Delta's core feature is
**Compare**, which needs GlobalId + a specific set of properties on every
element. If conversion to fragments loses any of that, the move is off.

This spike measures that on **your** models instead of guessing.

## What it checks

Loads one IFC twice — once through raw `web-ifc` (the baseline, mirroring what
`getAllProps()` collects today) and once by converting to fragments and reading
it back — then diffs the two.

| # | Question | Why it decides the move |
|---|---|---|
| 1 | Does every element keep its **GlobalId**? | Compare matches elements by GlobalId. No GlobalId, no Compare. |
| 2 | Do the **properties `getAllProps()` reads** survive? | `Name`, `Tag`, `ObjectType`, `PredefinedType`, `LongName`, `OverallWidth/Height` — the diff is computed from these. |
| 3 | Are **units, TrueNorth, spatial structure, material layers** reachable? | Read today from raw IFC entities that fragments may not carry. |
| 4 | Can a **geometry hash / bbox** be computed? | Compare uses geometry to spot moved/resized elements. |

It also reports parse time, convert time, fragment load time, and file sizes —
the numbers that justify (or sink) the whole idea.

## Run

```sh
cd spike/fragments
npm install
npm run dev
```

Open the page, drop in a real IFC, press **Run**. Use a model that is
representative of your actual work — a tiny sample proves nothing about the
250 MB case, and a Revit export behaves differently from an Archicad one.

### Smoke test

```sh
node scripts/make-sample-ifc.mjs 25   # writes sample.ifc (synthetic)
node scripts/smoke.mjs                # drives the page headlessly, prints every check
```

This proves the **harness** works; it says nothing about your models. On the
synthetic fixture it currently reports checks 1, 2 and 4 PASS and check 3
PARTIAL. `scripts/debug-requests.mjs` dumps every network request if a run
misbehaves.

Two traps this harness already had to be fixed for — worth knowing before you
trust a bad-looking result:

- `models.load()` **detaches** the fragment buffer (it is transferred to the
  worker), so its `byteLength` must be read *before* loading. Reading it after
  reports 0 bytes and looks exactly like a failed conversion.
- The item id is `_localId`, not `localId`. Reading the wrong key yields zero
  usable ids and looks exactly like "GlobalIds were lost".

Both produced a confident-looking **FAIL** that was purely a harness bug. The
checks now detect and label that case as INCONCLUSIVE instead — but if you get
a surprising FAIL, suspect the harness before the format.

## Reading the result

Each check reports **PASS / PARTIAL / FAIL** with the counts behind it. The
verdict is deliberately blunt:

- **Check 1 FAIL** → stop. Compare cannot work; nothing else matters.
- **Check 2 PARTIAL** → look at *which* properties are missing. `IfcImporter`
  has `attributesToExclude`, `includeUniqueAttributes` and `addAllAttributes()`
  — a miss here is often a config issue, not a format limit. Re-run with
  **Include all attributes** ticked before concluding anything.
- **Check 3 FAIL** → recoverable, but it means extracting those values at
  conversion time into a sidecar JSON. Real work; budget for it.
- **Check 4 FAIL** → Compare degrades to property-only diff (no moved/resized
  detection).

## Known costs this spike does not measure

- `@thatopen/fragments@3.4.7` needs **`three >= 0.182`** and
  **`web-ifc >= 0.0.77`**. IFC Delta is on `three@0.160` / `web-ifc@0.0.57`, so
  adopting it forces those upgrades too — a separate migration with its own
  breakage surface (this spike installs its own copies and cannot tell you what
  the Three.js jump breaks in the app).
- Peak RAM. Read it from the browser's task manager while the run is going;
  the page cannot measure it reliably (`performance.memory` is Chrome-only,
  heap-only, and does not see the WASM arena).
- Fragment format stability across library versions — an operational risk for
  anything cached in Storage, not something a single run can show.
