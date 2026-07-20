# IFC Delta — Implementation Plan

> Nguồn: *IFCDelta — Báo cáo tiến độ dự án* (PDF) + tái cấu trúc mã nguồn.
> Cập nhật: 2026-06-04. File này là kế hoạch sống — chỉnh theo trạng thái thực tế.

Công cụ BIM nội bộ chạy web (xem · so sánh · clash · validate · AI), Three.js + web-ifc,
deploy Vercel + Firebase Hosting: https://ifc.t3lab.space — phục vụ team BIM (~20 người).

---

## 0. Tình trạng hiện tại (từ báo cáo)

**Đã hoàn thành:** viewer 3D + Walk + ViewCube · Section box/plane · lọc category/storey ·
2D plan overlay · Field mode · Compare engine (GlobalId + smart match + geometry hash) ·
Clash detection (Navisworks-style, mesh-BVH) · Properties/Psets · đo đạc · screenshot ·
Colorize · export BCF/CSV · context menu · CORENET X Validator (Phase 1 ~35 rule + Phase 2
JSON ~100 rule) · N-file federation · Google Drive · Firebase Auth · giao diện tiếng Việt.

**Vừa xong (chưa mở cho team):** Trợ lý AI — data index (đã verify 1.379 cấu kiện, phủ
khối lượng ~99%), query tools `countElements`/`sumQuantity` (verify Cột→54, L3→225), chat
UI (Claude Haiku). Kiến trúc chống "bịa số" bằng Tool Use: AI gọi hàm JS để tính, không tự đếm.

---

## Giai đoạn 0 — Tái cấu trúc mã nguồn ✅ (đã làm trong lần này)

Trực tiếp giải quyết rủi ro "phụ thuộc một developer / nên ghi tài liệu mã nguồn" (báo cáo §6).

- [x] Tách `index.html` (13.559 dòng) → `css/styles.css`, `js/auth.js`, và 22 file
      tính năng trong `src/app/*.js` ghép thành `js/app.js` qua `build.mjs`.
- [x] Phép tách **byte-identical** — hành vi runtime không đổi (đã chứng minh).
- [x] Tài liệu: `ARCHITECTURE.md`, `REFACTOR_MAP.md`, `CLAUDE.md`.
- [x] Script kiểm chứng `scripts/verify-build.mjs`.

**Quy trình làm việc mới:** sửa file trong `src/app/`, chạy `node build.mjs`, rồi commit.
Xem `ARCHITECTURE.md` cho bản đồ module.

---

## Giai đoạn 1 — Ưu tiên cao (báo cáo §4 + §7)

### 1.1 Proxy bảo mật API key ✅ Đã xong (serverless Vercel + Express, không qua Cloudflare Worker)
Khoá API key ở server trước khi mở AI cho team. Không bao giờ deploy file kèm API key (§6).

> ⚠️ **Hai proxy song song — phân biệt cái nào đang chạy production:**
> - **`api/ai/chat.js` (Vercel serverless) — ĐANG DEPLOY.** Provider **DeepSeek**
>   (`DEEPSEEK_API_KEY`, cấu hình sẵn trên Vercel env). Client gửi `provider` rỗng +
>   `model` rỗng → proxy luôn dùng DeepSeek.
> - **`backend/src/routes/ai.ts` (Express) — CHƯA DEPLOY.** Đa provider (anthropic mặc
>   định / openai / deepseek / google). Dùng cho dev/thử nghiệm cục bộ; chỉ lên production
>   nếu host backend riêng.
> - **UI chọn provider/model (nút `⚙`) đã bị GỠ khỏi panel AI** (2026-07-01) — vì key đã
>   cấu hình sẵn trên Vercel, không cần người dùng chọn provider/model ở client nữa.
>   `AI_CONFIG` giữ mặc định `deepseek` khi gọi proxy.

- [x] Xác thực Firebase ID token qua REST `accounts:lookup` (không cần Admin SDK/service-account
      — Web API key vốn công khai). Từ chối 401 nếu thiếu/sai token hoặc email chưa xác minh.
      Áp dụng ở **cả hai** proxy: `api/ai/chat.js` (production, thêm 2026-06-30) và
      `backend/src/routes/ai.ts` (`requireAuth()`).
- [x] Rate-limit 20 yêu cầu/10 phút theo uid (in-memory; cấu hình qua
      `AI_RATE_LIMIT_MAX`/`AI_RATE_LIMIT_WINDOW_MS`). Ở Express là middleware ổn định;
      ở serverless là **best-effort** (mỗi instance có Map riêng, bị reclaim khi rảnh) —
      lớp bảo vệ chính ở serverless là auth, không phải rate-limit toàn cục.
- [x] Audit log tối thiểu: mỗi request `/chat` ghi 1 dòng JSON (uid, email, provider, model,
      status, usage) ra stdout — không ghi nội dung câu hỏi/trả lời. Đủ để tra cứu chi
      phí/lạm dụng qua log hosting (Vercel/Firebase), không cần DB riêng. Có ở cả hai proxy.
- [x] Client (`src/app/22-ai.ts` + `frontend/.../integrations/ai.ts`): gửi kèm header
      `Authorization: Bearer <Firebase ID token>` qua `window.getAuthToken()`
      (thêm trong `frontend/src/lib/auth.ts`, dùng chung cho cả 2 codebase qua `js/auth.js`).
- [ ] (Còn thiếu so với phương án Cloudflare ban đầu) prompt caching phía provider, giới hạn
      chi tiêu cứng trên Console nhà cung cấp — cân nhắc nếu chi phí thực tế vượt ước tính.
      Đặc biệt nên đặt **hard cap chi tiêu trên Console DeepSeek** vì rate-limit serverless
      chỉ là best-effort.
- **Done khi:** không còn secret nào trong bundle; AI chạy qua proxy có xác thực + rate-limit.
  ✅ Đạt — proxy production (`api/ai/chat.js`) đã có auth + rate-limit + audit từ 2026-06-30;
  chỉ còn giới hạn chi tiêu ở Console provider là tuỳ chọn bổ sung.

### 1.2 Mở rộng tool AI ✅ Đã xong
- [x] Lọc đa điều kiện (category + tầng + vật liệu + lớp IFC + tên + modelIdx) — `count_elements`/
      `sum_quantity` và cả tool mới đều dùng chung `aiApplyFilter` trong
      `frontend/src/components/integrations/ai-query.ts`.
- [x] Tool `list_elements`: liệt kê cấu kiện (expressID/globalId/tên/category/lớp IFC/tầng/vật
      liệu/khối lượng), cắt theo `limit` (mặc định 50, tối đa 500) + cờ `truncated`.
- [x] Tool `quantity_takeoff`: bảng khối lượng nhóm theo category/storey/ifcClass/material,
      cộng volume/area/length/count, kèm chuỗi **markdown** + **CSV** sẵn để trình bày.
- [x] Logic thuần tách sang `ai-query.ts` (không side-effect) + unit test `ai-query.test.ts`
      (17 test). Tool đăng ký trong `AI_TOOLS` + dispatch `runAITool`; expose `window.quantityTakeoff`,
      `window.listElements` để thử trong console.
- **Done khi:** trả lời được "liệt kê cột tầng L3 kèm khối lượng" và xuất bảng. ✅ Đạt.

---

## Giai đoạn 2 — Trung bình (báo cáo §4)

### 2.1 Cross-discipline checks ✅ Đã xong
- [x] Căn chỉnh geo-reference giữa các bộ môn (so IfcSite RefLat/RefLon/RefElev, dung sai).
- [x] Kiểm tra quy ước đặt tên tầng (storey) nhất quán giữa file (tầng nào thiếu ở model nào).
- [x] Phát hiện xung đột GUID trùng giữa các bộ môn (GlobalId xuất hiện ở ≥2 model).
- `compare/cross-discipline.ts` (thuần, 10 test) + `compare/cross-discipline-run.ts` (runner,
  đọc AI index + spatial) → `window.crossDisciplineChecks()`.

### 2.2 BCF export cho Validator ✅ Đã xong (không còn là stub)
- [x] `src/app/18-validator-export.ts:110-324`: export BCF 2.1 (zip) đầy đủ — markup/
      viewpoint/snapshot theo từng lỗi, màu theo mức độ nghiêm trọng, giới hạn 200 issue.
      PDF export (`:27-108`, qua jsPDF) cũng đã đầy đủ. Mục này từng bị ghi nhầm là "stub" —
      đã rà soát lại code thực tế (2026-06-30) và xác nhận hoàn thiện.

### 2.3 Đào sâu thuộc tính vật liệu ✅ Đã xong
- [x] `inspect/material-layers.ts` (thuần, 5 test): đọc `IfcMaterialLayerSet`, hiển thị từng
      lớp + độ dày + tổng độ dày trong panel Properties (`properties.ts`).

### 2.4 Snapshot kiểm tra theo thời gian ✅ Đã xong (validate; clash chưa làm)
- [x] `validate/snapshots.ts` (4 test): tự lưu snapshot sau mỗi lần Validate (LocalStorage,
      tối đa 50 bản) + so delta (findings/fail/warn/pass) với lần chạy trước.
      `window.sgListSnapshots()`.
- [ ] Snapshot cho **Clash** (chỉ Validate đã có) — làm sau nếu cần.

---

## Giai đoạn 3 — Khi có thời gian (báo cáo §4)

- [x] Chế độ so sánh dạng thanh trượt side-by-side ✅ Đã xong — `compare/compare-slider.ts`,
      nút ⟺ trên vp-toolbar, render 2 lần/frame bằng scissor theo `srcModelIdx`.
      **Cần verify trực quan trên web** (chưa test được trên trình duyệt thật).
- [x] Phân quyền tối thiểu (2026-06-30): app không có Firestore/DB nên không có tài
      nguyên dùng chung để bảo vệ bằng RBAC đầy đủ — mọi thao tác export/delete chỉ tác
      động dữ liệu cục bộ của chính người dùng. `window.isAdmin` (allowlist email trong
      `frontend/src/lib/auth.ts`) vẫn còn dùng cho các chỗ khác cần phân quyền sau này.
      *(Cập nhật 2026-07-01: ô chọn provider/model `⚙` từng được gate qua `isAdmin` đã bị
      GỠ khỏi UI — xem ghi chú AI proxy ở trên — nên phần RBAC này hiện không còn gate gì.)*
- [x] Tách vendor chunks — bundle app 5.5MB → 450KB (`frontend/vite.config.ts`, `manualChunks`).
- [ ] Tối ưu hiệu năng mô hình lớn (>200MB); responsive di động (đã làm Field Mode); tinh chỉnh UI thêm.

---

## Bug đang theo dõi (báo cáo §5)

- [x] (Đã sửa) Chọn cấu kiện sau khi chạy Compare đôi khi không nhận — fallback expressID
      giờ dò cả 3 đỉnh của face thay vì chỉ đỉnh đầu (`core/viewer-core.ts`).
      **Cần verify trực quan** (không reproduce được không có browser/model thật).
- [x] (Đã sửa) Nhấp vào issue-card không nhảy tới đúng element — `window.focusIssue` trước
      đây trỏ vào một stub chỉ tô sáng card; giờ trỏ đúng `focusIssueGeometry`, quét lọc
      theo đúng `modelIdx` của issue (`tools/focus-highlight.ts`).
- [x] (Đã sửa) Xoay bị nhảy/giật khi click chọn cấu kiện — bỏ hẳn cơ chế dời tâm xoay tới
      cấu kiện vừa click (giới hạn cấu trúc của OrbitControls: `update()` gọi
      `camera.lookAt()` mỗi frame nên bất kỳ cách dời `target` nào cũng gây snap/teleport).
      Camera giờ luôn xoay quanh tâm ổn định. **Cần verify trực quan.**
- [x] (Đã sửa) Mất mặt công trình khi xoay (z-fighting) — bật `logarithmicDepthBuffer` +
      nâng near-plane 0.01→0.05 (`core/viewer-core.ts`). **Cần verify trực quan.**
- [ ] Xoay theo TrueNorth cho mặt bằng 2D → `frontend/src/components/tools/plan-overlay.ts`.
      *(Đã khảo sát: hiện tại thiết kế là giữ trục màn hình cố định + chỉ xoay mũi tên Bắc —
      là lựa chọn hợp lệ, không phải bug. Xoay cả bản vẽ cần viết lại `worldToPx` + mọi
      overlay theo góc trueNorth — làm nếu người dùng xác nhận muốn kiểu này.)*
- [x] (Đã sửa) Crash listener phím ở Walk mode.

---

## Rủi ro & lưu ý (báo cáo §6)

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Phụ thuộc một developer | **Giai đoạn 0 đã tách module + viết tài liệu**; đào tạo người thứ hai |
| Trần bộ nhớ trình duyệt (file >200 MB hiếm) | Có phương án dự phòng bằng công cụ khác |
| Bảo mật AI | ✅ Proxy có xác thực + rate-limit (1.1) đã xong; không deploy kèm API key |
| Chi phí AI (~$70–100/tháng) | Haiku + prompt caching + giới hạn chi tiêu trên Console |

---

## Giai đoạn R — Hợp nhất về một codebase `frontend/` ✅ ĐÃ XONG

**Hoàn tất (2026-06-30):** dự án chưa release nên đã quyết định hợp nhất **một lần duy nhất**
(big-bang) thay vì migrate từng module qua nhiều PR. Trạng thái cuối:

- **Codebase duy nhất: `frontend/` (Vite + TypeScript, ESM thật).** Production build trực
  tiếp từ đây — `vercel.json` (`buildCommand: npm run build --workspace=frontend`,
  `outputDirectory: frontend/dist`) và `firebase.json` (`public: frontend/dist`, predeploy
  build) **đã trỏ sẵn vào `frontend/`** từ trước; bản standalone thực chất đã là code chết.
- **Đã xoá hẳn bản standalone:** `src/app/`, `build.ts`, root `index.html`/`js/`/`css/`/
  `icons/`/`vendor/`, `scripts/*` (fetch-vendor/verify-build/typecheck-standalone), root
  `tsconfig.json`, `.gitattributes`, CI `verify-standalone.yml`, và `.claude/REFACTOR_MAP.md`.
- **Dọn root `package.json`:** bỏ script `fetch:vendor`/`build:standalone`/`verify:standalone`/
  `typecheck:standalone` và devDep chỉ phục vụ standalone (`esbuild`, `tsx`, `typescript`,
  `@types/node`) — giữ `concurrently` cho script `dev`.
- **Đối chiếu hành vi:** `frontend/` đã là bản đang được deploy + sửa lỗi gần đây (các commit
  web-ifc WASM, fix auth AI `getAuthToken`/`Authorization: Bearer` đã có trong `frontend/`),
  nên nó là nguồn sự thật. Lịch sử git còn giữ `src/app/` nếu cần tra cứu hành vi cũ.

> ⚠️ **Còn lại (kiểm chứng thủ công, vì chưa có test tự động đầy đủ):** chạy smoke-test toàn bộ
> tính năng trên build production `frontend/` (`npm run build` + serve `dist/`) theo từng route
> (viewer/compare/clash/validate/field) trước lần deploy production kế tiếp. Nếu phát hiện tính
> năng nào ở bản standalone cũ tốt hơn, tra `git show <commit>:src/app/NN-x.ts` để port lại.

---

## Đề xuất bước tiếp theo (báo cáo §7)

1. ~~Dựng Cloudflare Worker proxy (1.1)~~ → **đã làm bằng cách khác**: khoá ngay trong
   backend Express hiện có (Firebase ID-token REST verify + rate-limit theo uid), không
   cần hạ tầng Cloudflare mới. Xem 1.1. AI đã có thể mở cho team.
2. Thu thập phản hồi → mở rộng tool AI (1.2) theo nhu cầu thực (khối lượng, thống kê).
3. Song song: cross-discipline checks (2.1); ~~wiring BCF cho validator (2.2)~~ đã xong.
