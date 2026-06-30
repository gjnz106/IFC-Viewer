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

### 1.1 Proxy bảo mật API key (Cloudflare Worker) 🔴 BẮT BUỘC
Khoá API key ở server trước khi mở AI cho team. Không bao giờ deploy file kèm API key (§6).
- [ ] Worker nhận request từ trình duyệt → gọi Anthropic API bằng key lưu ở Worker secret.
- [ ] Bật prompt caching + giới hạn chi tiêu trên Console (ước tính ~$70–100/tháng cho ~20 người).
- [ ] Rate-limit theo người dùng (gắn với Firebase Auth token).
- [ ] Sửa `src/app/22-ai.js`: đổi endpoint chat sang URL Worker, bỏ mọi key phía client.
- **Done khi:** không còn secret nào trong bundle; AI chạy qua proxy; mở thử cho nhóm nhỏ.

### 1.2 Mở rộng tool AI
- [ ] `src/app/22-ai.js`: thêm lọc đa điều kiện (category + tầng + vật liệu + lớp IFC).
- [ ] Tool liệt kê cấu kiện (trả danh sách, không chỉ con số).
- [ ] Tool xuất bảng khối lượng (quantity takeoff) → CSV/markdown.
- **Done khi:** trả lời được "liệt kê cột tầng L3 kèm khối lượng" và xuất bảng.

---

## Giai đoạn 2 — Trung bình (báo cáo §4)

### 2.1 Cross-discipline checks
- [ ] Căn chỉnh geo-reference giữa các bộ môn (so IfcSite/MapConversion).
- [ ] Kiểm tra quy ước đặt tên tầng (storey) nhất quán giữa file.
- [ ] Phát hiện xung đột GUID trùng giữa các bộ môn.
- Liên quan: `src/app/08-federation-load.js`, `09-compare.js`.

### 2.2 Hoàn thiện BCF export cho Validator (hiện là stub)
- [ ] `src/app/18-validator-export.js`: nối BCF thật cho lỗi validation (tham chiếu logic
      BCF đã chạy tốt ở `13-clash.js`).

### 2.3 Đào sâu thuộc tính vật liệu
- [ ] `src/app/10-properties.js`: đọc `IfcMaterialLayerSet`, hiển thị cấp độ/lớp vật liệu.

### 2.4 Snapshot kiểm tra theo thời gian
- [ ] Lưu kết quả validate/clash theo mốc thời gian để theo dõi thay đổi.

---

## Giai đoạn 3 — Khi có thời gian (báo cáo §4)

- [ ] Chế độ so sánh dạng thanh trượt side-by-side (`09-compare.js`).
- [ ] Firebase Auth nâng cao: đa người dùng / phân quyền (`js/auth.js`).
- [ ] Tối ưu hiệu năng mô hình lớn; responsive di động; tinh chỉnh UI.

---

## Bug đang theo dõi (báo cáo §5)

- [ ] Chọn cấu kiện sau khi chạy Compare đôi khi không nhận → `09-compare.js` + `12-focus-highlight.js`.
- [ ] Xoay theo TrueNorth cho mặt bằng 2D → `15-plan-overlay.js`.
- [x] (Đã sửa) Crash listener phím ở Walk mode.

---

## Rủi ro & lưu ý (báo cáo §6)

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Phụ thuộc một developer | **Giai đoạn 0 đã tách module + viết tài liệu**; đào tạo người thứ hai |
| Trần bộ nhớ trình duyệt (file >200 MB hiếm) | Có phương án dự phòng bằng công cụ khác |
| Bảo mật AI | **Bắt buộc proxy (1.1)** trước khi mở; không deploy kèm API key |
| Chi phí AI (~$70–100/tháng) | Haiku + prompt caching + giới hạn chi tiêu trên Console |

---

## Giai đoạn R — Migrate sang `frontend/` (Vite), nghỉ hưu `src/app/`

**Quyết định (2026-06-30):** thay vì chỉ tách module trong `src/app/` (kế hoạch cũ bên dưới,
nay đã lỗi thời), hướng đi đã chọn là **hoàn thiện `frontend/` rồi cắt deploy sang đó**, cuối
cùng xoá hẳn `src/app/*.ts` + `build.ts` + root `index.html`/`js/`/`css/`.

### Phát hiện quan trọng: `frontend/` đã là app hoàn chỉnh, KHÔNG phải code rời rạc cần "wire"

`frontend/src/main.ts` đã import + khởi tạo **toàn bộ 23 module** theo đúng thứ tự phụ thuộc
(auth → core → tools → compare → validate → integrations → ui), và `frontend/index.html` +
`vite.config.ts` đã là một Vite app build được, chạy được (`npm run dev`/`npm run build`).
→ Việc còn thiếu **không phải "wiring"**, mà là **đối chiếu hành vi (behavioral parity)**:
hai codebase đã phát triển tách rời nhau một thời gian và lệch nhau theo **cả hai hướng**
(không chỉ frontend "chậm hơn" — có module frontend còn *nhiều* hơn, có module *ít* hơn).

### Mức độ lệch thực tế (đo `wc -l` + `git log --oneline` từng file, 2026-06-30)

| Module (`src/app/NN-*.ts` → `frontend/.../*.ts`) | Dòng (src/app) | Dòng (frontend) | Lệch | Commit (src/app) | Commit (frontend) |
|---|---:|---:|---:|---:|---:|
| 22-ai → integrations/ai.ts | 908 | 927 | +19 | **12** | 3 |
| 23-router → ui/router.ts | 242 | 111 | **−131** | 4 | 3 |
| 07-section-visibility → tools/section-visibility.ts | 981 | 1018 | +37 | 3 | 1 |
| 03-viewer-core → core/viewer-core.ts | 615 | 800 | **+185** | 3 | 1 |
| 09-compare → compare/compare.ts | 346 | 754 | **+408** | 1 | 1 |
| 19-drive → integrations/drive.ts | 295 | 362 | +67 | 2 | 3 |
| 16-validator-rules → validate/validator-rules.ts | 980 | 887 | **−93** | 1 | 1 |
| 06-color-schemes → tools/color-schemes.ts | 465 | 307 | **−158** | 2 | 1 |
| 15-plan-overlay → tools/plan-overlay.ts | 663 | 564 | −99 | 2 | 1 |
| 05-colorize → tools/colorize.ts | 651 | 835 | +184 | 1 | 1 |
| 10-properties → inspect/properties.ts | 532 | 449 | −83 | 1 | 1 |
| 21-fieldmode → ui/fieldmode.ts | 770 | 788 | +18 | 1 | 1 |
| 14-walk → tools/walk.ts | 144 | 196 | +52 | 1 | 1 |
| 02/04/08/11/12/13/17/18/20 (còn lại) | — | — | lệch nhỏ (<10%) | 1 | 1 |
| *(frontend-only, không có trong src/app)* ui/state-persist.ts | — | 118 | n/a | — | 1 |

Kết luận: **mọi cặp module đều lệch**, không có cặp nào "giống hệt". `09-compare` và
`03-viewer-core` lệch lớn nhất theo hướng frontend *nhiều hơn* (có thể chứa tính năng/refactor
chưa đưa ngược vào `src/app`); `16-validator-rules` và `06-color-schemes` lệch theo hướng
frontend *ít hơn* (nghi thiếu rule/tính năng so với bản đang chạy production). `22-ai` đáng lo
nhất vì là module được sửa nhiều nhất trên `src/app` (12 commit, gần nhất chính là fix icon FAB
vừa làm) — khả năng cao còn fix khác chưa đưa sang `frontend/`.

### Nguyên tắc

- **`src/app/*.ts` là nguồn sự thật về hành vi** (đó là code đang chạy production) cho tới khi
  từng module ở `frontend/` được xác minh tương đương hoặc tốt hơn.
- Đi **từng module một**, không "big-bang" — đúng tinh thần cảnh báo cũ của tài liệu này: không
  có test tự động, phải kiểm chứng bằng tay trên trình duyệt sau mỗi bước.
- **Không cắt deploy production sang `frontend/` cho tới khi toàn bộ 23 module đã đối chiếu xong.**
  Trước đó hai codebase tiếp tục tồn tại song song; mọi fix hành vi quan trọng (như fix AI gần
  đây) vẫn cần áp dụng ở **cả hai nơi** cho tới lúc cắt hẳn.

### Quy trình cho mỗi module

1. Diff `src/app/NN-x.ts` và `frontend/.../x.ts` theo hàm — liệt kê: (a) hành vi chỉ có ở
   `src/app` (cần port sang frontend), (b) hành vi chỉ có ở `frontend` (đánh giá: giữ lại hay là
   code thừa/dở dang?), (c) khác biệt khiến hành vi không tương đương.
2. Sửa `frontend/.../x.ts` cho tới khi tương đương (hoặc tốt hơn có chủ đích) so với `src/app`.
3. Kiểm chứng trên trình duyệt: `cd frontend && npm run dev`, test golden path + 1-2 edge case
   của module đó (theo route/tính năng tương ứng).
4. Đánh dấu module "đã đối chiếu" trong bảng trên (cập nhật file này); **chưa xoá `src/app/NN-x.ts`**
   — chỉ xoá sau bước cắt deploy ở cuối.

### Thứ tự đề xuất (rủi ro thấp → cao, dựa trên độ lệch + tần suất sửa)

1. **Lệch nhỏ, ít sửa** — làm trước để kiểm chứng quy trình: `02-ifc-category`, `04-viewcube`,
   `12-focus-highlight`, `14-walk`, `18-validator-export`, `20-search`.
2. **Lệch vừa**: `08-federation-load`, `10-properties`, `11-measure`, `17-validator-json-loader`,
   `19-drive`, `21-fieldmode`.
3. **Lệch lớn, cần đối chiếu kỹ**: `05-colorize`, `06-color-schemes`, `09-compare`,
   `13-clash`, `15-plan-overlay`, `16-validator-rules`, `23-router`.
4. **Rủi ro cao nhất, làm cuối** (sửa nhiều nhất trên production → nhiều khả năng frontend thiếu
   fix mới nhất): `03-viewer-core`, `07-section-visibility`, `22-ai`.
5. **Trước bước 4**: hợp nhất state — `01-imports-state.ts` (biến global trong `src/app`) vs
   `frontend/src/store/index.ts` (`appState`, 92 dòng) cần đối chiếu xong trước, vì mọi module
   khác phụ thuộc vào nó.

### Bước cắt deploy (chỉ làm sau khi cả 23 module đã đối chiếu xong)

1. Lập checklist smoke-test thủ công cho toàn bộ tính năng (không có test tự động) — chạy trên
   `frontend/` build production (`npm run build` + serve `dist/`).
2. Đổi `vercel.json`: `buildCommand` từ `npm run build:standalone` sang build `frontend/`,
   `outputDirectory` trỏ vào `frontend/dist`.
3. Đổi `firebase.json`: bỏ exclude `frontend/**`, trỏ `public` vào `frontend/dist`, build trước
   khi deploy (Firebase hiện không có build step riêng — cần thêm bước build vào quy trình deploy).
4. Deploy thử lên preview, kiểm chứng đầy đủ checklist, rồi mới deploy production.
5. Sau khi production ổn định trên `frontend/` (theo dõi ít nhất vài ngày sử dụng thực tế): xoá
   `src/app/`, `build.ts`, root `index.html`/`js/`/`css/`, các script `*:standalone` trong
   `package.json`, và cập nhật `.claude/ARCHITECTURE.md`/`README.md` để chỉ còn mô tả một codebase.

> Đây là việc nhiều phiên làm việc (22+ module cần đối chiếu thủ công), không làm trong 1 PR.
> Mỗi module nên là 1 PR riêng để dễ review/rollback.

---

## Đề xuất bước tiếp theo (báo cáo §7)

1. **Dựng Cloudflare Worker proxy (1.1)** → mở thử AI cho một nhóm nhỏ.
2. Thu thập phản hồi → mở rộng tool AI (1.2) theo nhu cầu thực (khối lượng, thống kê).
3. Song song: cross-discipline checks (2.1) + wiring BCF cho validator (2.2).
