# Phương án cải thiện: Sidebar nav + Workspace (left panel)

> Trạng thái: **ĐÃ TRIỂN KHAI ĐỦ 4 GIAI ĐOẠN** (2026-07-02, branch
> `claude/sidebar-workplace-logic-63xfkw`). Vị trí dòng code bên dưới là theo
> bản khảo sát trước khi sửa. Đã verify: typecheck ✓, 75 unit test ✓, build ✓,
> smoke test Playwright 29 kịch bản ✓ (điều hướng, reconcile, restore, field guard).
>
> **Bug phát hiện thêm khi verify** (ngoài danh sách dưới):
> 1. `exitClashMode` xoá `#clashFiltersA/B` — ID chết từ khi redesign clash UI sang
>    rule-row (`#clashRulesA/B`) → **throw TypeError mỗi lần thoát clash**, nuốt luôn
>    `_vpResize()` (canvas không reflow) và làm gãy chuỗi chuyển page của router cũ.
>    Đã bỏ 2 dòng đó (rule rows vốn persist trong `clashRuleRows`, tự re-render khi vào lại).
> 2. `searchDebounce` được HTML gọi qua `oninput` nhưng chưa từng gán lên `window`
>    (search.ts chỉ expose `searchInit`/`searchRun`) → gõ chữ trong tab Search ném
>    ReferenceError mỗi phím, live-search chết. Đã thêm vào `Object.assign(window…)`.
>    (Phát hiện nhờ chạy đúng bước đối chiếu `onclick=` ↔ `window.*` ở mục §4.)

## 1. Hiện trạng & lỗi đã xác nhận

### A. Sidebar nav (`#sidebarNav`) — highlight chết

1. **Active highlight không bao giờ di chuyển.** `syncNav()` trong
   `frontend/src/components/ui/router.ts:25` query `.nav-item[data-page]`,
   nhưng markup dùng class `.sb-item` (`frontend/index.html:317+`). Selector
   không khớp → không nút nào được toggle; highlight kẹt ở "Viewer" (class
   `active` hardcode trong HTML) bất kể đang ở page nào.
2. **Team / Project Settings / Invite có `data-page` nhưng không phải page.**
   Chúng mở overlay (`toggleTeamPanel()` …), không đi qua router. Trộn hai
   loại nút (điều hướng page vs mở overlay) trong cùng một nav, cùng attribute
   → dễ nhầm khi sửa selector ở (1).

### B. Router ↔ mode — hai nguồn sự thật, dễ lệch nhau

3. **Mode bật/tắt được từ ngoài router.** Header có `btnClash` →
   `toggleClashMode()`, `btnSGCheck` → `toggleSGCheckPanel()`, `btnExitClash` →
   `exitClashMode()`; `properties.ts:82-85` cũng tự mở/đóng SG panel. Các đường
   này **không** cập nhật hash, `ifc.page`, label header, sidebar → UI kể một
   đằng, mode chạy một nẻo.
4. **Bẫy early-return.** `applyPage()` (`router.ts:33`) return sớm khi
   `page === activePage`. Ví dụ: đang ở #clash, bấm "Exit Clash" trên header
   (thoát ngoài router) → bấm lại "Clash" ở sidebar → không có gì xảy ra vì
   `activePage` vẫn là `'clash'`.
5. **Vào Clash bị chặn im lặng khi đang Compare.** `toggleClashMode()`
   (`clash.ts:335`) return sớm nếu `appState.compareResult` tồn tại, chỉ
   `log('Exit compare first')`. Router khi chuyển page **không bao giờ gọi
   `exitCompare()`** (chỉ exit clash + SG, `router.ts:52-53`) → điều hướng
   compare → clash: hash + label đổi thành Clash nhưng mode không bật, người
   dùng không nhận được thông báo nào.
6. **Khôi phục page bằng `setTimeout(120ms)`** (`router.ts:107`) — hack chờ
   `window.*` được gán. Thực tế `main.ts` import mọi module *trước khi* gọi
   `initRouter()` nên timeout là thừa và tạo cửa sổ race (thao tác của user
   trong 120ms đầu có thể bị applyPage đè).
7. **Ưu tiên khôi phục sai khi hash là `#viewer` tường minh.**
   `initRouter()` (`router.ts:97-104`) coi `#viewer` giống như "không có hash"
   → localStorage (vd `compare`) đè lên URL user gõ tay.
8. **Khôi phục `field` không có guard.** Nếu lần trước thoát app khi đang ở
   Field Mode, reload trên desktop sẽ tự vào lại field (ẩn toàn bộ UI desktop)
   sau 120ms — gây bối rối, nhất là khi chưa load model.

### C. Workspace (left panel `#leftPanel`) — không thích ứng theo page

9. **Nội dung luôn là giao diện Compare bất kể page.** Router chỉ toggle 2 thứ
   theo page: `odPanel` (Google Drive, chỉ compare) và
   `projectDriveViewerCard` (`router.ts:38-48`). Còn lại — upload card
   "Version A — Baseline" / "Version B — Updated", nút **Run Compare**,
   federation slots, summary strip Added/Removed/Modified, filter chips,
   Category Filter, tabs Entity Tree/Issues/Search — hiển thị ở **mọi** page.
   Người dùng vào page Viewer để xem 1 model vẫn thấy ngôn ngữ "so sánh phiên
   bản"; page Clash/Validate cũng vậy.
10. **UI kết quả compare không được reset khi rời page.** `sumStrip`,
    `filterB`, `catFilter` được `.show` khi chạy compare
    (`compare.ts:331-334`) nhưng không nơi nào gỡ khi điều hướng sang page
    khác → trạng thái cũ dính lại.
11. **Handler trùng lặp giữa 2 module.** `window.setFilter`, `window.switchTab`,
    `filterIssuesList`, và hàm cập nhật diff-visibility bị định nghĩa ở **cả**
    `compare/compare.ts:435,458` **và** `tools/measure.ts:436,461` (gần giống
    hệt). Theo thứ tự import trong `main.ts` (compare dòng 12, measure dòng
    14), **bản trong measure.ts thắng** — logic compare đang chạy từ… module đo
    đạc. Bản trong compare.ts là dead code, hai bản sẽ drift dần.

## 2. Phương án — 4 giai đoạn

### Giai đoạn 1 — Sửa nhanh, rủi ro thấp (≈ nửa ngày)

- [x] `router.ts:25`: đổi selector thành `.sb-item[data-page]` → highlight
      sidebar sống lại.
- [x] Bỏ `data-page` khỏi Team/Settings/Invite trong `index.html` (triển khai:
      chỉ cần bỏ attribute là đủ phân biệt — selector router chỉ bắt
      `.sb-item[data-page]`, không cần class riêng).
- [x] `router.ts` init: sửa ưu tiên khôi phục — nếu URL **có hash tường minh**
      (kể cả `#viewer`) thì hash thắng; chỉ khi hash rỗng mới đọc localStorage.
- [x] Guard khôi phục `field`: chỉ tự vào lại field nếu thiết bị touch
      (`matchMedia('(pointer: coarse)')`) — nếu không, hạ về `viewer`.
- [x] Bỏ `setTimeout(120)` — gọi `applyPage` đồng bộ (mọi module đã import
      xong trước `initRouter()`).
- [x] Compare → Clash: router `exitCompare()` trước rồi mới `enterClashMode()`
      (triển khai rộng hơn: compare result chỉ sống trong page compare — rời
      page compare là exit; guard trong `enterClashMode` giờ chỉ còn là
      safety-net cho caller trực tiếp, log qua `log()` thay vì ném TypeError
      như cũ — `(window as any).log` vốn chưa từng được gán).

### Giai đoạn 2 — Một nguồn sự thật cho page/mode (≈ 1 ngày)

Mục tiêu: **router là cổng duy nhất** đổi page; mode module chỉ expose
`enter/exit`, không tự quản lý điều hướng.

- [x] Thêm `appState.activePage` (store) — bỏ biến cục bộ `activePage` trong
      router; `applyPage` viết vào store.
- [x] Biến `applyPage` thành **reconcile idempotent**: khai báo trạng thái
      mong muốn theo page (`{clash: bool, sg: bool, field: bool}`), so với
      trạng thái thực (`appState.clashMode`, `sgState.open`, `fieldActive`)
      rồi enter/exit phần lệch. Bỏ early-return theo `activePage` (hết bẫy §4).
- [x] Các nút header (`btnClash`, `btnSGCheck`, `btnExitClash`, Field) đổi
      sang `navigateTo('clash' | 'validate' | 'viewer' | 'field')`. Đường tắt
      trong `properties.ts` (auto mở SG khi click phần tử fail) cũng đi qua
      `navigateTo('validate')`.
- [x] Field mode (triển khai: đảo chiều so với đề xuất — `exitFieldMode` KHÔNG
      gọi `navigateTo` nữa vì giờ router gọi nó khi reconcile; nút Desktop
      trong field UI và hint touch-device đổi sang `navigateTo('viewer'/'field')`).
- [x] Phát event `window.dispatchEvent(new CustomEvent('ifc:pagechange', {detail:{page}}))`
      để module khác (drive, ai, persist) phản ứng mà không cần router biết họ.

### Giai đoạn 3 — Workspace thích ứng theo page (≈ 1–1.5 ngày)

Mục tiêu: left panel chỉ hiện những section liên quan tới page hiện tại,
khai báo bằng attribute thay vì rải `style.display` theo ID trong router.

- [x] Gắn `data-pages="…"` cho từng section trong `#leftPanel`
      (`index.html`), ví dụ:
      | Section | viewer | compare | clash | validate |
      |---|---|---|---|---|
      | Upload card A (model chính) | ✓ | ✓ | ✓ | ✓ |
      | Upload card B + Run Compare | | ✓ | ✓ | |
      | Federation slots | ✓ | ✓ | ✓ | ✓ |
      | Google Drive panel | ✓ | ✓ | | |
      | Summary strip + filter chips | | ✓ | | |
      | Category Filter | ✓ | ✓ | ✓ | ✓ |
      | Tabs Entity Tree / Issues / Search | ✓ (Search) | ✓ | | |
      (đã chốt như trên khi triển khai — Category Filter giữ ở mọi page vì nó
      là công cụ lọc hiển thị của cả view mode, không riêng compare)
- [x] Router thêm 1 hàm `applyWorkspace(page)`: một vòng
      `querySelectorAll('[data-pages]')` toggle hidden — xoá các đoạn toggle
      lẻ tẻ theo ID (`odPanel`, `projectDriveViewerCard`) hiện tại.
- [x] Chính sách compare result (triển khai đơn giản hơn đề xuất): compare
      result **chỉ sống trong page compare** — rời page compare (bất kể sang
      đâu) là router gọi `exitCompare()` thật sự; hàm này vốn đã gỡ `.show`
      khỏi `sumStrip/searchW/filterB` + khôi phục material. Dự đoán được,
      không có trạng thái "kết quả ẩn nửa vời".
- [x] Đổi nhãn upload card theo page: page viewer hiển thị "Model" thay vì
      "Version A — Baseline" (chỉ đổi text, cùng slot 0).

### Giai đoạn 4 — Dọn trùng lặp & chốt hành vi (≈ nửa ngày)

- [x] Xoá `setFilter`/`switchTab`/`filterIssuesList`/hàm diff-visibility trùng
      trong `tools/measure.ts` (bản đang "thắng" nhờ thứ tự import); giữ một
      bản duy nhất trong `compare/compare.ts`, export cho nơi khác import.
      So khớp 2 bản trước khi xoá để không mất khác biệt hành vi nào.
- [x] Persist page: router tự lưu `ifc.page` trong `applyPage()` (mỗi lần đổi
      page, không chờ autosave 30s) — không cần đụng `state-persist.ts`.
- [x] Cập nhật `.claude/ARCHITECTURE.md` (mục ui/router) mô tả luồng mới.

## 3. Kiểm thử

- `cd frontend && npm run typecheck && npm test` sau mỗi giai đoạn.
- Kịch bản tay tối thiểu:
  1. Click lần lượt 4 nút sidebar → highlight + label header đổi đúng, hash đổi đúng.
  2. Đang compare → click Clash: compare thoát, clash panel mở, không kẹt.
  3. Mở clash bằng nút header → sidebar highlight Clash; Exit Clash → về Viewer.
  4. Ở #clash bấm Exit Clash rồi bấm lại Clash ở sidebar → clash mở lại (hết bẫy early-return).
  5. Reload ở từng page → khôi phục đúng page + workspace tương ứng; reload khi
     đang field trên desktop → về viewer.
  6. Page viewer không còn hiện Run Compare/summary strip; page compare đầy đủ như cũ.

## 4. Rủi ro & lưu ý

- Giai đoạn 2 đụng nhiều `window.*` handler — dễ tái phát lớp lỗi "window.X
  chưa gán" từng gặp (commit `cdc72b4`). Sau khi sửa, grep toàn bộ
  `onclick="` trong `index.html` đối chiếu với chỗ gán `window.*`.
- Giai đoạn 3 đổi markup `index.html` — ảnh hưởng cả Field Mode (ẩn/hiện panel
  qua class `field-mode` trong CSS); test lại field trên mobile viewport.
- Không đụng logic compare/clash engine — chỉ lớp điều phối UI.
