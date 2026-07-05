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
| 2 | Bộ nhớ & hiệu năng | ⬜ Not started |
| 3 | Độ chính xác Compare (geometry hash) | ⬜ Not started |
| 4 | Export & polish | ⬜ Not started |
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

## Phase 2 — Bộ nhớ & hiệu năng
**Status:** ⬜ Not started

- [ ] Pipeline `dispose`: khi unload/re-compare/xoá federation slot → dispose geometry+material,
      `ifcManager.removeSubset` cho các subset (`added`/`removed`/`clashFocus_*`), `releaseMemory`;
      revoke mọi object URL. (Hiện KHÔNG có lệnh dispose nào → rò GPU/WASM, dùng lâu crash tab.)
- [ ] Clash sang **Web Worker** + spatial hash/BVH thay vòng lặp O(nA×nB); precompute vertex
      range mỗi element (không traverse lại toàn model mỗi cặp). Bỏ đọc properties khi không có filter.
- [ ] Code-split: dynamic import web-ifc / AI panel để giảm chunk 3.7MB tải lần đầu.
- **Done khi:** load→unload→reload nhiều lần không tăng bộ nhớ; clash model lớn không treo tab.

## Phase 3 — Độ chính xác Compare (geometry hash)
**Status:** ⬜ Not started

- [ ] Áp `matrixWorld` vào hash (hiện dùng toạ độ local → false "Position Moved" nếu lệch offset).
- [ ] Hash bất biến thứ tự vertex (volume + bbox + count) thay vì 50 vertex đầu theo buffer.
- [ ] Thống nhất quantize (1cm) vs threshold (10mm) để hết false "Position Moved" đúng 10mm.
- [ ] Gộp `computeGeometryHashes` (đang duplicate ở compare.ts + federation-load.ts) về 1 module.
- **Done khi:** re-export cùng model không sinh "Geometry/Position Changed" giả.

## Phase 4 — Export & polish
**Status:** ⬜ Not started

- [ ] BCF clash: sửa `<n>` → `<Name>` (schema BCF 2.1) để reader nghiêm ngặt chấp nhận.
- [ ] Giữ trạng thái checkbox ẩn/hiện federation khi file khác load xong (đang bị reset về checked).
- [ ] `focusClash` guard chia 0 (model phẳng → NaN slider); sửa comment pad 10% vs code 5%.
- [ ] Rà các object URL khác chưa revoke; các listener module-scope không có đường gỡ.
- **Done khi:** export BCF mở được ở BIMcollab/Solibri; không còn NaN/bug nhẹ đã liệt kê.

## Phase 5 — Verify & phòng thủ
**Status:** ⬜ Not started

- [ ] Test browser thật với 2 file IFC mẫu: compare, compare slider, clash e2e, walk mode.
- [ ] Thêm unit test: smart-match (10 thêm/3 xoá cùng loại), clearance (`bboxGap`), geometry hash.
- [ ] Rà sâu phần chưa review kỹ: viewer-core, validator rules, fieldmode touch handlers.
- **Done khi:** có test hồi quy cho các fix chính + đã kiểm thử tương tác trên trình duyệt.
