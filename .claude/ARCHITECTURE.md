# Kiến trúc IFC Delta

> Web-based BIM viewer (xem · so sánh · clash · validate · AI) — Three.js + web-ifc,
> chạy hoàn toàn trong trình duyệt, deploy trên Vercel và Firebase Hosting tại
> https://ifc.t3lab.space.

> ⚠️ Repo có **2 codebase song song**:
> - **Bản standalone (deploy)** — `index.html` ở root, **inline toàn bộ** CSS + 2 module
>   (auth + app). Đây là bản chạy production (Vercel `build:standalone` + Firebase Hosting tĩnh).
> - **`frontend/` (Vite + TS)** — bản component-hoá, chạy dev, **chưa deploy**.
>
> Tài liệu này mô tả **bản standalone**.

## Tổng quan runtime (bản standalone)

```
index.html (self-contained)
 ├─ <style>…</style>                         ← toàn bộ giao diện (inline)
 ├─ <script importmap>                       ← three, web-ifc, three-mesh-bvh (CDN)
 ├─ <script type=module> Firebase Auth       ← inline (≙ js/auth.ts → js/auth.js)
 └─ <script type=module> ứng dụng chính      ← inline (≙ src/app/*.ts → js/app.js)
```

- Hai module (auth + app) **không** chia sẻ lexical scope — giao tiếp qua `window.*` + DOM.
- `js/app.js` là **artifact build** (esbuild) ghép từ `src/app/*.ts` (TypeScript). Xem
  `build.ts` + `npm run build:standalone`; nguồn đã chuyển sang TS (`src/app/globals.d.ts`).

## Vì sao split bằng concatenation (không phải ESM import/export)?

Bản gốc là một `<script type="module">` ~11.500 dòng với ~90 biến state có thể gán lại
và 153 hàm dùng chung lexical scope. Tách thành ESM thật (import/export giữa các file)
buộc phải định tuyến **mọi** phép gán lại state qua setter — rủi ro hồi quy rất cao khi
không có test/trình duyệt để kiểm chứng.

Giải pháp đã chọn: **source partials + build ghép file**. Mỗi tính năng là một file
biên tập được trong `src/app/`; `build.mjs` ghép lại thành `js/app.js` **byte-identical**
với code đang chạy production. Lợi ích:

- Tách module ngay, an toàn tuyệt đối (hành vi runtime không đổi — đã chứng minh bằng so byte).
- Firebase Hosting vẫn serve file tĩnh trực tiếp, không cần build server riêng (Vercel build qua `build:standalone`).
- Lộ trình tiến hoá lên ESM thật theo từng module có kiểm chứng — xem `IMPLEMENTATION_PLAN.md` › Giai đoạn R.

> ⚠️ Các file trong `src/app/*.js` **không** phải module độc lập — chúng là mảnh
> ghép của một scope chung. Editor có thể báo "biến chưa định nghĩa"; đó là bình thường.
> Đừng thêm `import`/`export` giữa chúng cho tới khi thực hiện Giai đoạn R.

## Bản đồ module (`src/app/`)

| File | Vai trò |
|------|---------|
| `01-imports-state.ts` | `import` three/web-ifc; toàn bộ biến state top-level; bảng tên IFC |
| `02-ifc-category.ts` | Map IFC class → Revit Category (tên thân thiện) |
| `03-viewer-core.ts` | `initThree`, camera/controls, wheel-zoom, pinch, resize, context-menu |
| `04-viewcube.ts` | ViewCube điều hướng kiểu Revit |
| `05-colorize.ts` | Tô màu theo thuộc tính (Dalux-style) + rule CRUD |
| `06-color-schemes.ts` | Lưu/khôi phục color scheme (LocalStorage) |
| `07-section-visibility.ts` | Section box/plane, clipping, hide/isolate, opacity, wireframe |
| `08-federation-load.ts` | Nạp IFC, N-file federation (đa bộ môn) |
| `09-compare.ts` | Engine so sánh 2 phiên bản (GlobalId + smart match + geometry hash) |
| `10-properties.ts` | Panel Properties / Property Sets (accordion) |
| `11-measure.ts` | Đo khoảng cách & cao độ |
| `12-focus-highlight.ts` | Zoom-to-element, highlight, section theo cấu kiện |
| `13-clash.ts` | Clash detection kiểu Navisworks (bbox + mesh BVH) + export BCF |
| `14-walk.ts` | First-person Walk mode |
| `15-plan-overlay.ts` | Lớp phủ mặt bằng 2D (top-down ortho) |
| `16-validator-rules.ts` | CORENET X / IFC-SG — Phase 1 (~35 rule built-in) |
| `17-validator-json-loader.ts` | Phase 2 — nạp rule JSON + ~100 rule mở rộng |
| `18-validator-export.ts` | Validator export PDF (jsPDF) / BCF 2.1 (zip qua JSZip) — đầy đủ |
| `19-drive.ts` | Tích hợp Google Drive |
| `20-search.ts` | Tìm kiếm & lọc cấu kiện |
| `21-fieldmode.ts` | Field mode (tablet/công trường): touch, joystick, storey, plan 2D |
| `22-ai.ts` | Trợ lý AI: data index · query tools (count/sum) · chat UI |
| `23-router.ts` | Router hash-based phía client (viewer/compare/clash/validate/field) |

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
