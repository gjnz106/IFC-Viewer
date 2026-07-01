# Kiến trúc IFC Delta

> Web-based BIM viewer (xem · so sánh · clash · validate · AI) — Three.js + web-ifc,
> chạy hoàn toàn trong trình duyệt, deploy trên Vercel và Firebase Hosting tại
> https://ifc.t3lab.space.

> ℹ️ **Một codebase duy nhất:** `frontend/` (Vite + TypeScript, ESM thật). Bản standalone
> `src/app/` (ghép byte qua `build.ts`, từng phục vụ `index.html` ở root) đã được hợp nhất
> và xoá. Production build trực tiếp từ `frontend/` → `frontend/dist`, deploy lên cả Vercel
> (`vercel.json`) và Firebase Hosting (`firebase.json`).

## Tổng quan runtime

```
frontend/index.html (Vite shell)
 ├─ <link> public/css/styles.css            ← toàn bộ giao diện
 ├─ <script> Google Identity + GAPI (CDN)   ← Drive
 └─ <script type=module> src/main.ts        ← entry: import auth + 23 module theo thứ tự
        │
        ├─ lib/auth.ts        Firebase Auth (window.getAuthToken, window.isAdmin)
        ├─ store/index.ts     appState — shared state (thay cho ~90 biến global cũ)
        ├─ types/index.ts     TypeScript interfaces + Window declarations
        └─ components/…        các module tính năng (ESM import/export)
```

- Các module giao tiếp qua **ESM import/export** + `appState` (shared state) + `window.*`
  (chỉ cho handler `onclick` trong HTML).
- Build bằng **Vite**: tách CSS/JS, asset hash + cache, tree-shake, HMR khi dev.
  WASM của web-ifc được `frontend/scripts/copy-wasm.mjs` đồng bộ vào
  `frontend/public/vendor/web-ifc/` lúc prebuild/predev để khớp đúng glue đang bundle.

## Bản đồ module (`frontend/src/components/`)

| Nhóm | File | Vai trò |
|------|------|---------|
| core | `core/viewer-core.ts` | `initThree`, camera/controls, wheel-zoom, pinch, resize, context-menu |
| core | `core/viewcube.ts` | ViewCube điều hướng kiểu Revit |
| core | `core/ifc-category.ts` | Map IFC class → Revit Category (tên thân thiện) |
| tools | `tools/colorize.ts` | Tô màu theo thuộc tính (Dalux-style) + rule CRUD |
| tools | `tools/color-schemes.ts` | Lưu/khôi phục color scheme (LocalStorage) |
| tools | `tools/section-visibility.ts` | Section box/plane, clipping, hide/isolate, opacity, wireframe |
| tools | `tools/measure.ts` | Đo khoảng cách & cao độ |
| tools | `tools/coordinates.ts` | Toạ độ / geo-reference helper |
| tools | `tools/walk.ts` | First-person Walk mode |
| tools | `tools/plan-overlay.ts` | Lớp phủ mặt bằng 2D (top-down ortho) |
| tools | `tools/focus-highlight.ts` | Zoom-to-element, highlight, section theo cấu kiện |
| compare | `compare/federation-load.ts` | Nạp IFC, N-file federation (đa bộ môn) |
| compare | `compare/compare.ts` | So sánh 2 phiên bản (GlobalId + smart match + geometry hash) |
| compare | `compare/clash.ts` | Clash detection kiểu Navisworks (bbox + mesh BVH) + export BCF |
| validate | `validate/validator-rules.ts` | CORENET X / IFC-SG — Phase 1 (~35 rule built-in) |
| validate | `validate/validator-json-loader.ts` | Phase 2 — nạp rule JSON + ~100 rule mở rộng |
| validate | `validate/validator-export.ts` | Export PDF (jsPDF) / BCF 2.1 (zip) |
| inspect | `inspect/properties.ts` | Panel Properties / Property Sets (accordion) |
| inspect | `inspect/search.ts` | Tìm kiếm & lọc cấu kiện |
| integrations | `integrations/drive.ts` | Tích hợp Google Drive |
| integrations | `integrations/ai.ts` | Trợ lý AI: data index · query tools (count/sum) · chat UI |
| ui | `ui/ui-shell.ts` | Vỏ UI: topbar, sidebar, panel toggles, menu |
| ui | `ui/fieldmode.ts` | Field mode (tablet/công trường): touch, joystick, storey, plan 2D |
| ui | `ui/router.ts` | Router hash-based (viewer/compare/clash/validate/field) |
| ui | `ui/state-persist.ts` | Lưu/khôi phục UI prefs qua LocalStorage |

Thứ tự khởi tạo: `frontend/src/main.ts` (auth → core → tools → compare → validate →
integrations → ui → router/persist).

## Phụ thuộc ngoài

- `three@0.160.0`, `three/addons` (OrbitControls, BufferGeometryUtils)
- `web-ifc@0.0.57` (WASM), `web-ifc-three@0.0.126` (IFCLoader) — Vite `resolve.dedupe`
  ép một bản web-ifc duy nhất để wasm khớp glue
- `three-mesh-bvh@0.5.23` (clash)
- Firebase (auth), Google Identity Services + GAPI (Drive)
- `jspdf` (export báo cáo / BCF zip)

## Quy ước giao tiếp

- Handler gọi từ HTML `onclick` được gắn lên `window.*` (vd `window.sgRunValidation`,
  `window.fieldEnterMode`) trong module định nghĩa.
- State dùng chung (scene, camera, loadedModels, activeFilter, …) đọc/ghi qua
  `appState` (`frontend/src/store/index.ts`).
- Backend proxy AI: dev ở `backend/` (Express, đa provider), production ở
  `api/ai/chat.js` (Vercel serverless, DeepSeek). Cả hai xác thực Firebase ID token + rate-limit.
