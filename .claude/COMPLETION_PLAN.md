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
| 5 | Verify & phòng thủ | ⬜ Not started |

Ký hiệu Status: `⬜ Not started` · `🟡 In progress` · `✅ Done — PR #<n>`.

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

## Phase 5 — Verify & phòng thủ
**Status:** ⬜ Not started

- [ ] Test browser thật với 2 file IFC mẫu: compare, compare slider, clash e2e, walk mode.
- [ ] Thêm unit test: smart-match (10 thêm/3 xoá cùng loại), clearance (`bboxGap`), geometry hash.
- [ ] Rà sâu phần chưa review kỹ: viewer-core, validator rules, fieldmode touch handlers.
- **Done khi:** có test hồi quy cho các fix chính + đã kiểm thử tương tác trên trình duyệt.
