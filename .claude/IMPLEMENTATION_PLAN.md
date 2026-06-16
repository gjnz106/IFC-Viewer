# IFC Delta — Implementation Plan

> Nguồn: *IFCDelta — Báo cáo tiến độ dự án* (PDF) + tái cấu trúc mã nguồn.
> Cập nhật: 2026-06-04. File này là kế hoạch sống — chỉnh theo trạng thái thực tế.

Công cụ BIM nội bộ chạy web (xem · so sánh · clash · validate · AI), Three.js + web-ifc,
deploy GitHub Pages: https://gjnz106.github.io/IFC-Viewer/ — phục vụ team BIM (~20 người).

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

## Giai đoạn R — (Tuỳ chọn) Tiến hoá lên ESM thật

Hiện `src/app/*.js` là các mảnh ghép của **một** scope chung. Nếu muốn module hoá hoàn toàn
(import/export giữa file) thì làm **từng module một, có kiểm chứng**, theo thứ tự ít phụ thuộc:

1. Bắt đầu từ lá độc lập: `02-ifc-category.js`, `16/17-validator-*` (gần như thuần dữ liệu/hàm).
2. Tạo `src/state.js` giữ state dùng chung; chuyển phép gán lại qua setter.
3. Mỗi lần tách 1 module: `export` hàm cần dùng, `import` ở nơi gọi, **giữ symbol cần thiết trên `window`**
   cho các handler HTML `onclick`. Test trên trình duyệt sau mỗi bước trước khi đi tiếp.
4. Cuối cùng `index.html` chỉ còn `<script type=module src=js/main.js>` và main import các module.

> Không làm "big-bang" cả 22 file cùng lúc — không có test tự động nên phải kiểm chứng tiệm tiến.

---

## Đề xuất bước tiếp theo (báo cáo §7)

1. **Dựng Cloudflare Worker proxy (1.1)** → mở thử AI cho một nhóm nhỏ.
2. Thu thập phản hồi → mở rộng tool AI (1.2) theo nhu cầu thực (khối lượng, thống kê).
3. Song song: cross-discipline checks (2.1) + wiring BCF cho validator (2.2).
