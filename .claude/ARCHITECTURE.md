# Kiến trúc IFC Delta

> Web-based BIM viewer (xem · so sánh · clash · validate · AI) — Three.js + web-ifc,
> chạy hoàn toàn trong trình duyệt, deploy trên GitHub Pages (không build server).

## Tổng quan runtime

```
index.html
 ├─ <link  css/styles.css>                  ← toàn bộ giao diện
 ├─ <script importmap>                       ← three, web-ifc, three-mesh-bvh (CDN)
 ├─ <script type=module src=js/auth.js>      ← Firebase Auth (module độc lập)
 └─ <script type=module src=js/app.js>       ← ứng dụng chính (1 module scope)
```

- `js/auth.js` và `js/app.js` **không** chia sẻ lexical scope — chúng giao tiếp qua
  `window.*` và DOM (giống bản gốc khi còn nằm inline trong index.html).
- `js/app.js` là **artifact build**, được ghép từ `src/app/*.js`. Mọi cấu kiện code
  nằm trong **một** module scope chung, nên các file con vẫn dùng chung biến/hàm như cũ.

## Vì sao split bằng concatenation (không phải ESM import/export)?

Bản gốc là một `<script type="module">` ~11.500 dòng với ~90 biến state có thể gán lại
và 153 hàm dùng chung lexical scope. Tách thành ESM thật (import/export giữa các file)
buộc phải định tuyến **mọi** phép gán lại state qua setter — rủi ro hồi quy rất cao khi
không có test/trình duyệt để kiểm chứng.

Giải pháp đã chọn: **source partials + build ghép file**. Mỗi tính năng là một file
biên tập được trong `src/app/`; `build.mjs` ghép lại thành `js/app.js` **byte-identical**
với code đang chạy production. Lợi ích:

- Tách module ngay, an toàn tuyệt đối (hành vi runtime không đổi — đã chứng minh bằng so byte).
- GitHub Pages vẫn serve file tĩnh, không cần build server.
- Lộ trình tiến hoá lên ESM thật theo từng module có kiểm chứng — xem `IMPLEMENTATION_PLAN.md` › Giai đoạn R.

> ⚠️ Các file trong `src/app/*.js` **không** phải module độc lập — chúng là mảnh
> ghép của một scope chung. Editor có thể báo "biến chưa định nghĩa"; đó là bình thường.
> Đừng thêm `import`/`export` giữa chúng cho tới khi thực hiện Giai đoạn R.

## Bản đồ module (`src/app/`)

| File | Vai trò |
|------|---------|
| `01-imports-state.js` | `import` three/web-ifc; toàn bộ biến state top-level; bảng tên IFC |
| `02-ifc-category.js` | Map IFC class → Revit Category (tên thân thiện) |
| `03-viewer-core.js` | `initThree`, camera/controls, wheel-zoom, pinch, resize, context-menu |
| `04-viewcube.js` | ViewCube điều hướng kiểu Revit |
| `05-colorize.js` | Tô màu theo thuộc tính (Dalux-style) + rule CRUD |
| `06-color-schemes.js` | Lưu/khôi phục color scheme (LocalStorage) |
| `07-section-visibility.js` | Section box/plane, clipping, hide/isolate, opacity, wireframe |
| `08-federation-load.js` | Nạp IFC, N-file federation (đa bộ môn) |
| `09-compare.js` | Engine so sánh 2 phiên bản (GlobalId + smart match + geometry hash) |
| `10-properties.js` | Panel Properties / Property Sets (accordion) |
| `11-measure.js` | Đo khoảng cách & cao độ |
| `12-focus-highlight.js` | Zoom-to-element, highlight, section theo cấu kiện |
| `13-clash.js` | Clash detection kiểu Navisworks (bbox + mesh BVH) + export BCF |
| `14-walk.js` | First-person Walk mode |
| `15-plan-overlay.js` | Lớp phủ mặt bằng 2D (top-down ortho) |
| `16-validator-rules.js` | CORENET X / IFC-SG — Phase 1 (~35 rule built-in) |
| `17-validator-json-loader.js` | Phase 2 — nạp rule JSON + ~100 rule mở rộng |
| `18-validator-export.js` | Validator export PDF / BCF (BCF còn stub) |
| `19-drive.js` | Tích hợp Google Drive |
| `20-search.js` | Tìm kiếm & lọc cấu kiện |
| `21-fieldmode.js` | Field mode (tablet/công trường): touch, joystick, storey, plan 2D |
| `22-ai.js` | Trợ lý AI: data index · query tools (count/sum) · chat UI |

## Phụ thuộc ngoài (CDN, qua importmap)

- `three@0.160.0`, `three/addons` (OrbitControls, BufferGeometryUtils)
- `web-ifc@0.0.57` (WASM), `web-ifc-three@0.0.126` (IFCLoader)
- `three-mesh-bvh@0.5.23` (clash)
- Firebase `12.12.0` (auth), Google Identity Services + GAPI (Drive)
- jsPDF (dynamic `import` khi xuất báo cáo)

## Quy ước giao tiếp

- Handler gọi từ HTML `onclick` được gắn lên `window.*` (vd `window.sgRunValidation`,
  `window.fieldEnterMode`). Khi tách module sau này, các symbol này **phải** giữ trên `window`.
- State dùng chung (scene, camera, loadedModels, activeFilter, …) khai báo ở
  `01-imports-state.js`.
