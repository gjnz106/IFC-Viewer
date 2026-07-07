# IFC Delta — Completion Plan (theo phase)

> **Nguồn chân lý cho lệnh `/ifc`.** Mỗi lần chạy `/ifc`, Claude đọc file này, chọn
> **phase chưa Done thấp nhất**, làm trọn phase đó, verify, mở PR, rồi cập nhật `Status`
> ở đây **và** trên Notion.
>
> - **Notion plan:** https://app.notion.com/p/394e88f51f7d81aea852e6e45f0d1570
>   (page id `394e88f5-1f7d-81ae-a852-e6e45f0d1570`)
> - **Nhánh phát triển:** `claude/festive-ride-ftow0a` (dựng lại từ `origin/main` mỗi lần)
> - **Quy ước:** code nằm ở `frontend/` (Vite + TS). Giữ nguyên mọi element ID + `window.*`
>   handler. Verify bắt buộc: `typecheck` + `vitest` + `build` phải pass trước khi commit.

## Trạng thái tổng quan

| Phase | Nội dung | Status |
|------:|----------|--------|
| 0 | Khôi phục hosting + standalone review | ✅ Done — PR #42 |
| 1 | Sửa bug chức năng (XSS, clash, smart-match) | ✅ Done — PR #41 |
| 2 | Bộ nhớ & hiệu năng | ✅ Done — PR #47 |
| 3 | Độ chính xác Compare (geometry hash) | ✅ Done — PR #48 |
| 4 | Export & polish | ✅ Done — PR #49 |
| 5 | Verify & phòng thủ | ✅ Done — PR #50 |
| 6 | Project management (local-first) | ⬜ Not started |
| 7 | Walk levels (storey picker + clip tầng) | ⬜ Not started |
| 8 | Measure area/angle + unit setting | ⬜ Not started |
| 9 | Saved viewpoints (per-project) | ⬜ Not started |
| 10 | Bật clash options (box filter, duplicate, self-clash) | ⬜ Not started |

Ký hiệu Status: `⬜ Not started` · `🟡 In progress` · `✅ Done — PR #<n>`.

> **Thứ tự phụ thuộc (Phase 6–10):** Phase 6 đi trước — Phase 9 cần `projectId`,
> Phase 8 lưu unit per-project (có fallback global nên vẫn chạy độc lập được).
> Phase 7 và 10 độc lập hoàn toàn. Quy ước chung: logic thuần đặt ở
> `frontend/src/lib/*.ts` + test Vitest colocated; handler gắn `window.*` + khai báo
> `types/index.ts`; không đổi/xoá element ID + handler hiện có.

---

## Phase 0 — Khôi phục hosting + standalone review ✅ Done
**Status:** ✅ Done — PR #42 (2026-07-05)

Người dùng xác nhận **hosting = Vercel + Firebase tại https://ifc.t3lab.space** (KHÔNG dùng
GitHub Pages — URL `gjnz106.github.io/IFC-Viewer` bị bỏ). `vercel.json`/`firebase.json` đã
build `frontend` → `frontend/dist`, có SPA rewrite + header WASM đúng → cấu hình hợp lệ,
không cần workflow Pages.

- [x] Chốt hosting: Vercel/Firebase (bỏ Pages).
- [x] Rà `vercel.json`/`firebase.json`: buildCommand + outputDirectory + rewrites + WASM headers OK.
- [x] **Bản standalone review** (yêu cầu người dùng): `npm run build:standalone` → 1 file
      `frontend/dist-standalone/index.html` tự chứa; web-ifc WASM tải từ CDN qua
      `window.__WASM_BASE__` (mở được từ `file://`). `vite.config.standalone.ts` +
      `viteSingleFile`. `setWasmPath` giờ đọc `window.__WASM_BASE__` (production không đổi).
- [x] Quy trình `/ifc` cập nhật: mỗi update tự build + gửi file standalone cho người dùng review.
- **Done khi:** app chạy ở ifc.t3lab.space + mỗi update có file standalone để review. ✅

## Phase 1 — Sửa bug chức năng ✅ Done — PR #41
**Status:** ✅ Done — PR #41 (2026-07-05)

- [x] XSS: thêm `frontend/src/lib/escape.ts` (`escapeHtml`+`escapeCsv`); escape mọi chuỗi IFC
      ở compare (tree/issues/properties/category chips) và clash (cards/group/detail).
- [x] GlobalId ra `data-g` + `selIEl(this)` thay vì onclick JS string; `selI` dùng `CSS.escape`.
- [x] Clash clearance thật (`bboxGap`, chấp nhận gap ≤ min distance).
- [x] Cảnh báo khi chạm cap 2000 candidates.
- [x] Disable các clash option chưa hoạt động (Duplicate, box size/vol, Include parts, single).
- [x] Smart-match bắt buộc bằng chứng Name/Tag (không cho ObjectType-only).
- [x] CSV export: escape + chống formula injection + revoke object URL.
- Kiểm thử: typecheck sạch · 81/81 test · build OK · boot 0 lỗi.
- Ghi chú: "Element Search chết" là false positive (đã bind qua `Object.assign(window,…)`).

## Phase 2 — Bộ nhớ & hiệu năng ✅ Done
**Status:** ✅ Done — PR #47 (2026-07-07)

- [x] Pipeline `dispose`: thêm `disposeModel()` dùng chung (viewer-core.ts), gọi khi thay model
      trong slot A/B/federation (section-visibility.ts, federation-load.ts), khi rebuild diff
      subset lúc re-run Compare/đổi category filter (federation-load.ts, compare.ts), khi thoát
      Compare (`exitCompare`), và khi thoát/chạy lại Clash (dispose clash marker box/wire mesh +
      focus highlight trong clash.ts). Object URL đã revoke đúng cặp từ trước (không cần sửa).
      (Không còn dùng `ifcManager.removeSubset` cho các subset diff — theo đúng ghi chú đã có ở
      colorize.ts về bug hiển thị #83 của web-ifc-three khi removeSubset; thay vào đó dispose trực
      tiếp mesh bị orphan vì `createSubset` sinh `subsetID` mới mỗi lần material đổi.)
- [x] Clash: **không** chuyển Web Worker (out of scope cho phase này — cần refactor lớn hơn); đã
      precompute vertex world-position theo expressID một lần (`buildEidVertexMap`) thay vì traverse
      lại toàn bộ model 2 lần cho **mỗi** candidate pair trong `meshIntersectionTest` (tới 4000 lượt
      traverse full-model với cap 2000 candidates → còn 2 lượt traverse tổng). Bỏ `getItemProperties`
      trong `buildFilteredSet` khi category không có property filter (luôn pass); tên phần tử được
      backfill sau đó chỉ cho tập kết quả clash cuối cùng (nhỏ hơn nhiều so với toàn bộ tập lọc).
- [x] Code-split: `ai.ts` (không module nào khác import, không có UI hook khởi động) chuyển từ
      static import sang `import()` động, tải lúc browser idle (`requestIdleCallback`/`setTimeout`
      fallback) — giảm ~41KB khỏi chunk chính. web-ifc (3.7MB) giữ nguyên static: cần ngay khi mở
      file IFC đầu tiên (thường ngay khi vào app), lazy-load sẽ chỉ dời chậm trễ chứ không giảm tải
      thực tế cho use-case chính — không đáng đánh đổi độ phức tạp.
- **Done khi:** load→unload→reload nhiều lần không tăng bộ nhớ; clash model lớn không treo tab. ✅
  (Verify: typecheck sạch, 81/81 test, build OK, 0 pageerror headless smoke-test.)

## Phase 3 — Độ chính xác Compare (geometry hash) ✅ Done
**Status:** ✅ Done — PR #48 (2026-07-07)

- [x] Module dùng chung mới `frontend/src/lib/geometry-hash.ts`, transform mỗi vertex qua
      `c.matrixWorld` trước khi tính bbox/volume — sửa đúng bug hash dùng toạ độ local (biến
      `wm` từng bị khai báo nhưng không dùng ở bản compare.ts cũ) khiến model có offset (federation
      slot, shared center offset) báo "Position Moved" giả dù phần tử không di chuyển thật.
- [x] Hash giờ bất biến thứ tự vertex/face: tính volume bằng divergence theorem (tổng thể tích
      tứ diện ký hiệu từ gốc toạ độ qua mỗi mặt tam giác, hỗ trợ cả geometry indexed/non-indexed)
      thay vì sample 50 vertex đầu theo thứ tự buffer — bản cũ đổi hash mỗi khi exporter re-order/
      re-triangulate hình học giống hệt, gây false "Geometry Changed".
- [x] Quantize hash thống nhất về lưới 1cm (10mm) — cùng độ phân giải với ngưỡng "Position Moved"/
      "Size Changed" hiện có, nên hash chỉ khác khi khác biệt thật vượt ngưỡng các phép so sánh
      tường minh đã coi là đáng kể (loại bỏ trường hợp hash lệch do nhiễu làm tròn dưới ngưỡng).
- [x] Gộp 2 bản `computeGeometryHashes` (compare.ts + federation-load.ts, đã trôi lệch — bản
      federation-load.ts còn không dùng `matrixWorld` chút nào) thành 1 hàm duy nhất; xoá bản
      federation-load.ts (không có nơi nào khác gọi tới, đã xác minh).
- [x] Thêm `frontend/src/lib/geometry-hash.test.ts`: bất biến thứ tự face/vertex, tính đúng thể
      tích tứ diện đơn vị, dùng world-space thay vì local, cùng hash cho cùng hình dịch chuyển
      giống nhau ở cả 2 model, phát hiện đúng khi hình dạng thực sự đổi, model rỗng trả về `{}`.
- **Done khi:** re-export cùng model không sinh "Geometry/Position Changed" giả. ✅
  (Verify: typecheck sạch, 87/87 test (+6 test mới), build OK, 0 pageerror headless smoke-test.)

## Phase 4 — Export & polish ✅ Done
**Status:** ✅ Done — PR #49 (2026-07-07)

- [x] BCF clash: `<n>` → `<Name>` trong `project.bcfp` (clash.ts) — đúng schema BCF 2.1.
- [x] Federation checkbox: `fedRenderSlots()` từng hardcode `checked` theo `loaded` mỗi lần
      render lại danh sách — nên mỗi khi 1 file federation khác load xong (gọi lại
      `fedRenderSlots()`), mọi checkbox bị reset về checked kể cả cái người dùng vừa tắt.
      Giờ đọc đúng `model.visible` hiện tại (nguồn chân lý duy nhất, do `fedToggleVis` set)
      thay vì suy ra từ trạng thái loaded.
- [x] `focusClash`: thêm guard chia 0 cho `toSl()` (model phẳng tuyệt đối trên 1 trục → range=0
      → NaN slider) — fallback về 50%. Sửa comment sai lệch ở `focus-highlight.ts`
      ("10%/0.5m" trong khi code thực tế dùng 30%/1–5m, đã ghi đúng ở comment dưới).
- [x] Rà + vá 3 chỗ thiếu `URL.revokeObjectURL`: `exportCSV`/`exportBCF` (Compare,
      focus-highlight.ts) và `exportClashBCF` (clash.ts) — Compare CSV cũng phát hiện **chưa
      từng được escape** dù Phase 1 đã thêm `escapeCsv` cho Clash CSV (bỏ sót export CSV thứ 2
      của Compare) → đã áp `escapeCsv` cho mọi cell, chặn CSV injection + ký tự `,"` phá cấu trúc.
      Rà toàn bộ `addEventListener`: chỉ 1 chỗ leak thật — `fieldSetupLongPress()` (fieldmode.ts)
      add lại 4 touch listener trên `<canvas>` mỗi lần vào Field Mode mà `exitFieldMode()` không
      gỡ; canvas sống suốt vòng đời app nên bật/tắt N lần → N bộ listener chồng nhau. Thêm guard
      idempotent (`_longPressReady`) để chỉ setup đúng 1 lần.
- **Done khi:** export BCF mở được ở BIMcollab/Solibri; không còn NaN/bug nhẹ đã liệt kê. ✅
  (Verify: typecheck sạch, 87/87 test, build OK, 0 pageerror headless smoke-test cả dist/ và
  dist-standalone/.)

## Phase 5 — Verify & phòng thủ ✅ Done
**Status:** ✅ Done — PR #50 (2026-07-07)

- [x] Test browser thật (headless Chromium + 2 file IFC tự tạo có wall thêm/xoá/dịch chuyển):
      **Compare** phát hiện đúng added/removed/modified, kể cả "Position Moved" chính xác đúng
      0.5m dịch chuyển đã cố ý tạo (xác nhận fix Phase 3 hoạt động đúng trên dữ liệu IFC thật, không
      chỉ unit test). **Compare Slider** toggle bật/tắt không lỗi. **Clash e2e**: chạy full pipeline
      với model thật, phát hiện đúng 2 vụ va chạm (self-overlap của phần tử không đổi + overlap của
      phần tử dịch chuyển 0.5m còn chồng lấn). **Walk mode** bật/tắt không lỗi. Cả 4 luồng: 0
      pageerror. (App yêu cầu Firebase Auth — sandbox không có mạng ra ngoài để đăng nhập thật, nên
      test bypass overlay auth qua DOM thuần tuý để lái các luồng nghiệp vụ; không đụng tới logic
      ứng dụng.)
- [x] Thêm 14 unit test mới: `compare.test.ts` (smart-match — 10 thêm/3 xoá cùng loại/ObjectType
      không bị ghép bừa; ghép đúng qua Tag/Name khi GlobalId đổi), `clash.test.ts` (`bboxGap` —
      overlap/touch/gap 1 trục/gap chéo đa trục/near-miss trong ngưỡng), `viewer-core.test.ts`
      (`ifcClassToRevitCategory` — bao gồm case ALL-CAPS nhiều từ vừa fix).
      (`geometry-hash.test.ts` đã thêm ở Phase 3.)
- [x] Rà sâu viewer-core/validator-rules/fieldmode, tìm và sửa 4 bug thật:
  - `fieldmode.ts` `fieldClosePlan2D()`: zero hẳn `appState.clipPlanes` (length=0) khi đóng Plan 2D
    thay vì khôi phục 6 plane fully-open chuẩn — mọi module khác (section-visibility sliders,
    clash markers, picking) giữ tham chiếu tới mảng này và index `[0..5]` trực tiếp, nên section
    box của cả app hỏng vĩnh viễn cho tới khi reload trang. Giờ khôi phục đúng 6 plane gốc.
  - `validator-rules.ts` FED-005 (TrueNorth alignment): tính `abs(a1-a2)` không xử lý wrap-around
    0°/360° → 2 model lệch thật ~2° nhưng gần mốc 0°/360° bị báo sai lệch ~358°. Thêm wrap-around.
  - `viewer-core.ts` context menu (right-click): chỉ check expressID của vertex đầu tiên của face,
    trong khi left-click pick đã check cả 3 vertex (tránh vertex expressID=0 trên diff-subset sau
    Compare) — right-click cùng vị trí có thể báo "No element" dù left-click chọn được. Đồng bộ.
  - `viewer-core.ts` `ifcClassToRevitCategory`: fallback title-case chỉ viết hoa ký tự đầu
    (`Ifcwallstandardcase`) nên không bao giờ khớp key nhiều từ như `IfcWallStandardCase` khi input
    là ALL-CAPS từ numeric lookup. Đổi sang so khớp lowercase-to-lowercase qua index dựng 1 lần.
- **Done khi:** có test hồi quy cho các fix chính + đã kiểm thử tương tác trên trình duyệt. ✅
  (Verify: typecheck sạch, 101/101 test (+14 mới), build OK, 0 pageerror cả dist/ và
  dist-standalone/, E2E headless đầy đủ 4 luồng nghiệp vụ chính.)

## Phase 6 — Project management (local-first) · Size M–L
**Status:** ⬜ Not started

Người dùng đã chốt: project = **local-first**, KHÔNG backend/Firestore. Project =
`{id, name, code, driveLink, state}` trong localStorage; nút switch trên topbar + modal
quản lý (list/create/rename/delete/switch). Switch = unload TẤT CẢ model + khôi phục
Drive link/state của project đích; model nạp lại từ Drive folder hoặc re-upload thủ công.

- [ ] **Data layer `frontend/src/lib/projects-store.ts`** (mới, theo pattern pure+glue của
      `validate/snapshots.ts`): `Project {id, name, code, state:{driveLink, units?, page?,
      camera?}, createdAt, updatedAt}`; `ProjectRegistry {activeId, list}` lưu key
      **`ifc.projects.v1`** (1 key JSON atomic). Pure ops: `createProject`, `renameProject`,
      `deleteProject` (xoá active → kích hoạt cái còn lại; xoá cái cuối → tạo lại "Default
      Project"), `setActive`, `migrateLegacy(driveLink)` (first-run: dựng registry 1 project
      từ key cũ). Glue `loadRegistry/saveRegistry` (try/catch quota), `getActiveProject`.
      Test `projects-store.test.ts`: create/rename/delete round-trip, delete-active promote,
      delete-last recreate default, migrateLegacy, setActive id lạ = no-op.
- [ ] **Mirror key cũ `'projectDriveLink'`:** KHÔNG sửa các chỗ đang đọc key này
      (drive.ts `loadProjectDriveModelsViewer`, router.ts `applyWorkspace`, ui-shell.ts
      toggleSettingsPanel) — khi switch/save, ghi `active.state.driveLink` vào key cũ
      (hoặc removeItem khi rỗng). Giữ diff nhỏ, tích hợp miễn phí với card
      `#projectDriveViewerCard` sẵn có.
- [ ] **`unloadAllModels()`** (mới, đặt ở `federation-load.ts` — nơi đã own slot lifecycle;
      export + gắn window). Thứ tự: ① caller `navigateTo('viewer')` trước (router tự exit
      compare/clash/SG/field — không duplicate logic); ② clear measure/highlight/colorize/
      hidden (`clearMeasure`, `clearHighlight`, `colorizeClear`, `showAllHidden`); ③ sweep
      diff subsets còn sót (export lại `disposeDiffSubsets` để tái dùng); ④ per-slot
      `disposeModel` + `scene.remove` + `_colorizeInvalidate(i)`; ⑤ reset state:
      `files/loadedModels`, `fedNextSlot=2`, `sharedCenterOffset=null`, `modelBounds`,
      `compareResult=null`, `clashResults=[]`, `sgState.cachedCtx=null`, aiIndex,
      `_catData/_catModelIDs`, `activeCategories`; ⑥ reset 6 `clipPlanes` constant về 99999 —
      **KHÔNG truncate mảng** (bài học `fieldClosePlan2D` Phase 5); nếu `sectionActive` →
      `toggleSectionBox()` để tắt; ⑦ reset DOM: `#uc0/#uc1` bỏ class loaded, clear
      `#fn*/#fs*/#us*`, ẩn `#visRow*`, `fedRenderSlots()`, hiện `#emptyVP`, disable
      `#btnCompare/#btnRunComparePanel`, `#catFilter` bỏ show, `#propArea` về placeholder,
      `requestPlanRebuild()`; ⑧ nếu đang walk → `toggleWalkMode()` trước tiên.
      ⚠️ **Verify trước khi code:** grep module nào giữ reference mảng
      `appState.files/loadedModels` — nếu có thì mutate in-place (`length=0; push(null,null)`)
      thay vì reassign.
- [ ] **UI:** chip `#btnProjects` + `#tbProjectName` trên topbar (sau brand, CSS
      `.tb-proj-chip` mới trong styles.css); modal `#projectsOverlay` clone pattern
      `#teamOverlay` (`.modal-overlay`/`.modal-content`, backdrop-click đóng): list
      `#projList` (row: name/code/drive-dot + nút Switch/Rename/Delete, render bởi
      `renderProjectList()`, escape bằng `escapeHtml`) + form tạo mới `#projNewName/
      #projNewCode/#projNewDrive` + `projCreate()`. Handlers trên window (khai báo
      types/index.ts): `toggleProjectsPanel/projCreate/projRename/projDelete/projSwitch`,
      đặt trong module mới `frontend/src/components/ui/projects.ts` (import ở main.ts sau
      ui-shell, trước initRouter).
- [ ] **`projSwitch(id)`:** guard `#loadOv.on` (đang load) → abort; có model/compareResult →
      `confirm()`; lưu state project cũ (camera + page + driveLink); `setActive` + mirror
      key cũ; `navigateTo('viewer')`; `unloadAllModels()`; cập nhật chip + re-render list;
      dispatch `CustomEvent('ifc:projectchange')`. KHÔNG tự gọi
      `loadProjectDriveModelsViewer()` (tránh popup OAuth bất ngờ — card Drive là affordance).
- [ ] **Settings modal rework:** gắn id `#projName/#projCode` cho 2 input mock (bỏ value
      hardcode "City Tower Phase 1"/"CT-P1"); populate/save qua hook `projFillSettings/
      projSaveSettings` (định nghĩa ở projects.ts) gọi từ `toggleSettingsPanel` (ui-shell.ts).
- Edge: 2 tab mở song song = last-writer-wins trên `ifc.projects.v1` (ghi comment chấp nhận);
  các key `state-persist.ts` (`ifc.panels`, `ifc.camera`…) giữ **global** phase này (chỉ lưu
  camera vào project record lúc switch); registry hỏng/JSON lỗi → try/catch tạo lại default.
- **Done khi:** tạo → switch → mọi model unload sạch (reload lại model chạy như lần đầu,
  test unload→reload 2 lần) → switch lại khôi phục đúng Drive link; typecheck + test + build
  pass, 0 pageerror smoke-test.

## Phase 7 — Walk levels (storey picker + teleport + clip tầng) · Size M
**Status:** ⬜ Not started

Người dùng đã chốt: chọn level khi walk → **teleport tới tầm mắt ~1.6m trên sàn tầng đó +
clip ẩn các tầng khác** (toggle tắt được); danh sách level **lọc bỏ storey rác** (0 phần tử,
trùng cao độ). Quy ước toạ độ bắt buộc: `worldY = elevation − appState.sharedCenterOffset.y`
(chuẩn = fieldmode.ts `fieldSelectStorey`; plan-overlay.ts đang dùng elevation thô = bug).

- [ ] **`frontend/src/lib/storeys.ts`** (mới, pure): `WalkStorey {name, modelIdx, expressID,
      elevation, topElevation, elementCount}`; `mergeStoreys(perModel)` — bỏ storey
      elementCount=0, dedup elevation ±0.1m (giữ bản count cao hơn), sort tăng dần,
      `topElevation` = elevation storey kế tiếp CÒN GIỮ (fallback +3.5m — convention
      plan-overlay); `storeyWorldY(elevation, offsetY)`. Glue `ensureStoreyCounts(modelIdx)`:
      đếm phần tử per-storey qua `mgr.getSpatialStructure` (pattern sẵn có ở ai.ts
      `buildAiIndex`), cache `model.spatial.storeyCounts`, chạy **lazy** lần đầu build picker
      (getSpatialStructure chậm trên model lớn). Fallback an toàn: lỗi đếm → count = Infinity
      (không bao giờ bị lọc); lọc xong rỗng → dùng danh sách chưa lọc.
      Test `storeys.test.ts`: lọc 0-count, dedup giữ count cao, topElevation fallback +
      next-kept, dấu `storeyWorldY`, fallback all-junk.
- [ ] **walk.ts + index.html:** strip pill `#walkLevels` cạnh `#walkHUD` + checkbox
      `#walkClipChk` ("Clip storey", mặc định bật). **Pointer lock chặn click chuột trên
      desktop** → phím là chính: `PageUp/PageDown` (và `[`/`]`) đổi tầng, `L` toggle clip
      (thêm vào keydown listener sẵn có, guard `walkActive`); pill vẫn click được trên touch
      (Field Mode walk không pointer-lock), highlight tầng active. HUD hint thêm
      `⇞⇟ Level · L Clip`. Hàm mới trên window: `walkBuildLevels` (async, gọi khi vào walk:
      ensureStoreyCounts → mergeStoreys → render pill; render list chưa lọc ngay, re-render
      khi count về), `walkGoToStorey(idx)`, `walkCycleStorey(dir)`, `walkToggleStoreyClip`.
- [ ] **`walkGoToStorey`:** `floorY = storeyWorldY(s.elevation, offset.y)`; camera.y =
      floorY + 1.6m quy đổi đơn vị model (`1.6*1000/units.lengthFactor`); giữ x/z hiện tại
      (clamp vào modelBounds XZ, ngoài bounds → về center); pitch=0 qua bridge `walkSetPose`
      (dùng chung desktop + Field Mode). Clip bật: ghi thẳng
      `clipPlanes[2].constant = storeyWorldY(s.topElevation) + 0.1` và
      `clipPlanes[3].constant = −(floorY − 0.3)` (quy ước fieldSelectStorey), X/Z không đụng,
      KHÔNG gọi `updateSectionFromSliders` (sẽ bị slider ghi đè).
- [ ] **Restore clip** khi tắt toggle **và cả 2 đường exit walk** (`toggleWalkMode` exit
      branch + `pointerlockchange` force-exit — dễ sót): `sectionActive` →
      `updateSectionFromSliders()` (trả section box của user), ngược lại constant về 99999.
      Show/hide `#walkLevels` cùng `#walkHUD` ở cả 2 đường.
- [ ] **Sửa bug plan-overlay elevation thô** (cùng quy ước, tránh 2 convention song song):
      `planSelectStorey` (storeyClip :195–196), best-storey pick (:142), `onStorey` check
      (:360), shift-click Y-window (:548) → chuyển qua `storeyWorldY`. Giữ elevation thô cho
      chuỗi hiển thị (`+3.00m`).
- Edge: nhiều model federation → merge + dedup, nhãn `(A)/(B)` (FED_LABELS) chỉ khi trùng tên
  khác cao độ; model không storey/all-junk → pill "No storeys" disabled, phím no-op; section
  box đang bật + storey clip → storey clip thắng khi walk, restore khi exit.
- **Done khi:** model có offset ≠ 0 → walk chọn tầng 2 → camera đúng tầm mắt tầng 2, các tầng
  khác bị clip; tắt clip thấy lại toàn bộ; exit walk khôi phục section; Plan overlay chọn
  storey khớp Field Mode; typecheck + test + build pass, 0 pageerror.

## Phase 8 — Measure area + angle + unit setting toàn cục · Size M
**Status:** ⬜ Not started

Thêm 2 mode đo mới (diện tích, góc) + 1 cài đặt đơn vị hiển thị (mm/m/ft-in) dùng chung cho
measure, coordinates readout, properties panel. Lưu ý nền tảng: world coords = project units;
`readProjectUnits` đã chuẩn hoá `lengthFactor` (project→mm) — pref chỉ đổi **hiển thị**,
không convert 2 lần.

- [ ] **`frontend/src/lib/units.ts`** (mới): `UnitPref = 'mm'|'m'|'ftin'`; pure
      `formatLengthMm(mm, pref)`, `formatFtIn(mm)` (làm tròn 1/8", rút gọn phân số 6/8→3/4,
      xử lý âm), `formatAreaM2(m2, pref)` (m²|ft²), `formatVolumeM3(m3, pref)`. Glue:
      `getUnitPref()` (project active `state.units` → localStorage `ifc.units` → 'mm'),
      `setUnitPref(u)` (ghi cả 2 nơi + dispatch `CustomEvent('ifc:unitschange')`),
      `worldToMm(v, modelIdx=0)` = `v * (units.lengthFactor ?? 1000)` (dùng factor slot 0
      cho scene-level; federation lệch đơn vị thì geometry đã lệch sẵn — ghi comment).
      Test `units.test.ts`: mm/m/ft-in incl. formatFtIn exact (0, 304.8→1'-0", 1619, âm,
      làm tròn 1/8"), factor ft²/ft³.
- [ ] **`frontend/src/lib/measure-math.ts`** (mới, pure): `polygonArea3D(points)` (Newell —
      đúng cho polygon 3D gần phẳng, "projected area lên best-fit plane"), `angleAt(p1,
      vertex, p2)` độ. Test `measure-math.test.ts`: vuông đơn vị=1, vuông xoay/tịnh tiến=1,
      tam giác 3-4-5, colinear→0, góc 90°/180°/nhọn, degenerate (vertex==endpoint) guard.
- [ ] **measure.ts:** `measureType` mở rộng `'distance'|'level'|'area'|'angle'`; refactor
      `setMeasureMode` styling thành loop (giữ nguyên ID/behavior cũ). Nút `#modeArea/
      #modeAngle` sau `#modeLevel` (copy pattern button inline sẵn có) + chip
      `#measureUnitBtn` (`onclick="cycleUnitPref()"`, hiện mm|m|ft). **Area:** mỗi click thêm
      điểm; từ điểm 3 vẽ outline khép kín + fill mesh (triangle fan, DoubleSide,
      depthTest:false) + label sống `formatAreaM2(polygonArea3D(pts)·(worldToMm(1)/1000)²)`;
      Enter/double-click chốt; mọi object transient đẩy vào `measureMarkers` (đường cleanup
      sẵn có). **Angle:** đúng 3 click A–B–C, vẽ B→A, B→C + label `xx.x°` tại B; click thứ 4
      bắt đầu lại. Thay hết format hardcode (distance `${dist.toFixed(3)}m`, level
      `(el*1000).toFixed(0)` + `EL … m`) bằng `formatLengthMm(worldToMm(v), pref)`. Nghe
      `'ifc:unitschange'` → `clearMeasure()` (sprite đã bake chữ) + update chip.
- [ ] **Consumers:** coordinates.ts format X/Y/Z qua units (giữ layout compact; mm → số
      nguyên); properties.ts `fmtLength/fmtArea/fmtVolume` route qua formatter mới (nhân
      per-model `units.*Factor` — conversion IFC-internal→mm sẵn có — rồi format theo pref);
      thêm `<select id="unitSelect" onchange="setUnitPrefFromUI()">` vào `#settingsOverlay`,
      populate lúc mở. Khai báo `cycleUnitPref/setUnitPrefFromUI` trên window + types.
- Edge: IFC internal units = feet → `lengthFactor` đã xử lý, chỉ verify không double-convert;
  ft-in âm (elevation dưới datum) → dấu `-` đầu; polygon colinear/duplicate → area 0 không
  crash; unit pref hoạt động cả khi có project (per-project) lẫn không (global `ifc.units`).
- **Done khi:** 4 mode đo hoạt động; đổi đơn vị cập nhật measure + coords + properties;
  typecheck + test + build pass, 0 pageerror.

## Phase 9 — Saved viewpoints (gallery per-project) · Size M–L · phụ thuộc Phase 6
**Status:** ⬜ Not started

Viewpoint có tên = camera + visibility + section state, lưu per-project, khôi phục từ gallery
thumbnail ở left panel.

- [ ] **`frontend/src/lib/viewpoints-store.ts`** (mới): `Viewpoint {id, name, createdAt,
      camera{px..tz}, anchor, section:{active, sliders[6]}, visibility:{slotVisible,
      hiddenKeys, isolated}, modelsKey, thumb}` — key `ifc.viewpoints.<projectId>`
      ('default' khi chưa có registry), cap 30/project (`addViewpoint(list, vp, maxKeep)`).
      **`anchor` = sharedCenterOffset LÚC CHỤP** + `remapCamera(vp, currentOffset)`:
      `newWorld = savedWorld + (savedOffset − currentOffset)` (identity khi 1 trong 2 null) —
      bắt buộc vì offset do model load ĐẦU TIÊN quyết định, reload đổi thứ tự → camera lệch
      nếu không remap. `modelsFingerprint(fileNames)` (sorted join — mismatch → warn khi
      restore). Test: remap identity/shift/null, cap, fingerprint không phụ thuộc thứ tự.
- [ ] **`frontend/src/components/tools/viewpoints.ts`** (mới; import main.ts sau
      color-schemes): **`vpSave()`** — name qua prompt; camera từ position + controls.target;
      anchor = sharedCenterOffset; section = `sectionActive` + giá trị 6 slider `slXp…slZn`
      (phần trăm theo modelBounds → offset-proof cho cùng bộ model); visibility qua accessor
      mới **export từ color-schemes.ts**: `getVisibilityState()/applyVisibilityState()`
      (set `hiddenExpressIDs/isolatedIDs` hiện module-private — export accessor rồi
      `rebuildModelSubset(mi)` per model); `slotVisible` từ `model.visible`; thumbnail JPEG
      ~160×100 q0.6 từ `renderer.domElement` qua offscreen canvas (renderer đã
      `preserveDrawingBuffer:true`). **`vpRestore(id)`** — chưa load model → chỉ camera
      (remap với currentOffset=null) + toast "Models not loaded — camera only"; fingerprint
      lệch → vẫn apply + warn; đang compare (`compareResult`) → chặn "Exit compare first";
      thứ tự áp: camera (remap) → sliders + `toggleSectionBox()` nếu active lệch →
      `updateSectionFromSliders()` → visibility (checkbox `#visA/#visB` + `toggleModelVis`
      semantics slot 0/1, `model.visible` + `fedRenderSlots()` slot 2+ → applyVisibilityState).
      `vpDelete` (confirm) / `vpRename`.
- [ ] **Gallery UI:** panel `.od-panel` `#vpPanel` ở left panel (sau block Drive),
      `data-pages="viewer compare clash validate"`; header "Viewpoints" + badge `#vpBadge`;
      body `#vpGalleryBody`: nút "+ Save viewpoint" (`vpSave`) + grid `#vpGrid` (card = img
      thumb + name + ✎/✕, click = `vpRestore`); render bởi `renderVpGallery()`, escape tên.
      CSS mới `.vp-card/.vp-grid`. Handlers + types: `vpSave/vpRestore/vpDelete/vpRename/
      vpTogglePanel`.
- [ ] **Tích hợp project:** nghe `'ifc:projectchange'` để re-read gallery (Phase 6 dispatch
      trong `projSwitch` — nếu chưa có thì thêm ở phase này); `projDelete` xoá kèm
      `ifc.viewpoints.<id>`.
- Edge: quota localStorage (thumb ~5–8KB, cap 30) → try/catch, fail retry bỏ thumb mới nhất;
  lưu khi đang walk → lưu camera tương đương orbit (position + lookDir·10 làm target, như
  walk-exit); restore KHÔNG tự vào lại walk (descope, ghi chú).
- **Done khi:** lưu 2 viewpoint (1 cái có section + hidden) → F5 → load lại model → restore
  đúng cả 2; load model đổi thứ tự slot → restore vẫn frame đúng hình (remap hoạt động);
  typecheck + test + build pass, 0 pageerror.

## Phase 10 — Bật clash options (đánh giá từng cái) · Size M · độc lập
**Status:** ⬜ Not started

Các option disabled từ Phase 1 (index.html, `title="Chưa hỗ trợ (roadmap)"`) — đánh giá
từng cái: **làm** box size/volume filter + Duplicate type + Single Model (self-clash);
**descope có lý do** Include parts + Single System/Component.

- [ ] **Box size/volume filter (S):** overlap box `ox,oy,oz` đã có ở `bboxPenetration`
      (clash.ts) → pure export `passesBoxFilter(ox, oy, oz, cfg{sizeOn, sizeMm,
      side:'shortest'|'longest', volOn, volM3})` — bỏ hard clash khi cạnh chọn của overlap
      box < sizeMm hoặc volume < volM3 (semantics BIMcollab: suppress clash vụn); đọc input
      trong `runClashDetection` (cạnh `clashTolMinDist`), áp ở nhánh accept cho **hard clash
      only** (clearance không có overlap box). Bật 5 input: `#clashTolBoxSize/
      #clashTolBoxSizeVal/#clashTolShortest/#clashTolLongest/#clashTolBoxVol/#clashTolBoxVolVal`.
- [ ] **Duplicate type (M):** dùng `computeGeometryHashes(modelIdx)` từ `lib/geometry-hash.ts`
      (entry có `hash` + `center/size` world-space 1cm-quantized — đã bao vị trí, xác nhận):
      khi `#clashTypeDuplicate` checked, cặp (a∈setA, b∈setB) `hashA===hashB && cùng IFC
      type` → result `isDuplicate:true`, bỏ qua mesh-test (theo định nghĩa đã trùng); badge
      riêng trong card list + stat card `#clashDup` mới (cạnh `#clashTotal/#clashHard/
      #clashNear`); CSV/BCF export mang flag mới (mirror mọi chỗ dùng `isHard`). Duplicate
      bypass box filter (overlap box = element box).
- [ ] **Single Model = self-clash A×A (M):** helpers `buildElementBBoxes/buildFilteredSet`
      đã parameterized theo modelIdx → khi `#clashSingleModel` checked và chỉ slot 0 loaded
      (hoặc 2 slot cùng model): setA=setB=model 0; skip `a.eid===b.eid`, dedup cặp đối xứng
      (`a.eid < b.eid`); nới gate `#btnRunClash` ở `enterClashMode` (hiện đòi cả 2 model)
      cho phép chỉ slot 0 khi checked, giữ behavior cũ khi không. Chú ý `CAND_CAP` (n²/2
      self-pairs — cảnh báo cap sẵn có vẫn áp dụng). Disable checkbox Duplicate khi ở
      single-model mode (self-pair identical-position sẽ flag mọi cặp — vô nghĩa).
- [ ] **Descope (giữ disabled, đổi tooltip tiếng Anh "Not supported — …"):** Include parts
      (`#clashIncludePartsA/B` — cần expand IfcRelAggregates/Nests, hiếm trong IFC Revit,
      không có fixture test); Single System (`#clashSingleSystem` — cần index
      IfcRelAssignsToGroup chỉ để lọc, cost/benefit kém); Single Component
      (`#clashSingleComponent` — phụ thuộc Include parts).
- Test: mở rộng `clash.test.ts` — `passesBoxFilter` (shortest/longest side, volume, boundary,
  off=pass-through), dedup cặp đối xứng, ghép duplicate từ hash map synthetic;
  regression-guard `bboxGap` bằng test sẵn có.
- **Done khi:** 3 option mới chạy đúng trên fixture Phase 5 (duplicate flag đúng cặp wall
  không đổi; box filter suppress clash nhỏ khi nâng ngưỡng; self-clash phát hiện
  self-overlap); typecheck + test + build pass, 0 pageerror.
