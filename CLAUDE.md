# CLAUDE.md — IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt, deploy GitHub Pages / Vercel.
Giao diện tiếng Việt.

## Cấu trúc dự án

```
IFC-Viewer/
├── frontend/                   # Vite + TypeScript (trình duyệt)
│   ├── src/
│   │   ├── auth.ts             # Firebase Auth (module độc lập)
│   │   ├── main.ts             # Entry point — import tất cả module theo thứ tự
│   │   ├── constants.ts        # IFC_NAMES, FED_COLORS, FED_LABELS
│   │   ├── state/
│   │   │   └── index.ts        # appState — trạng thái dùng chung toàn app
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript interfaces + Window declarations
│   │   └── modules/            # 22 tính năng (nguồn sự thật của app logic)
│   │       ├── ifc-category.ts
│   │       ├── viewer-core.ts
│   │       ├── viewcube.ts
│   │       ├── colorize.ts
│   │       ├── color-schemes.ts
│   │       ├── section-visibility.ts
│   │       ├── federation-load.ts
│   │       ├── compare.ts
│   │       ├── properties.ts
│   │       ├── measure.ts
│   │       ├── focus-highlight.ts
│   │       ├── clash.ts
│   │       ├── walk.ts
│   │       ├── plan-overlay.ts
│   │       ├── validator-rules.ts
│   │       ├── validator-json-loader.ts
│   │       ├── validator-export.ts
│   │       ├── drive.ts
│   │       ├── search.ts
│   │       ├── fieldmode.ts
│   │       └── ai.ts
│   ├── public/
│   │   └── css/
│   │       └── styles.css      # Giao diện
│   ├── index.html              # Shell HTML (dùng Vite, không có importmap)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                    # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts            # Express server (port 3000)
│   │   ├── routes/
│   │   │   ├── ai.ts           # POST /api/ai/chat — proxy Anthropic API
│   │   │   └── health.ts       # GET /api/health
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── package.json                # Root workspace (npm workspaces)
```

## Quy tắc làm việc

### Frontend (TypeScript)
- **Sửa logic app:** chỉnh file trong `frontend/src/modules/`
- **Sửa giao diện:** `frontend/public/css/styles.css` hoặc `frontend/index.html`
- **Shared state:** tất cả trạng thái dùng chung qua `appState` trong `frontend/src/state/index.ts`
- **Types:** TypeScript interfaces trong `frontend/src/types/index.ts`
- **Build dev:** `cd frontend && npm run dev` (Vite dev server, port 5173)
- **Build prod:** `cd frontend && npm run build`

### Backend (TypeScript)
- **Sửa API:** `backend/src/routes/`
- **Dev:** `cd backend && npm run dev` (tsx watch, port 3000)
- **Môi trường:** copy `backend/.env.example` → `backend/.env`, điền `ANTHROPIC_API_KEY`
- **AI proxy:** Frontend gọi `POST /api/ai/chat` thay vì gọi Anthropic trực tiếp

### Module Pattern
- Mỗi module: `import { appState } from '../state/index.js';`
- Thay biến global bằng `appState.xxx` (scene → appState.scene, camera → appState.camera, v.v.)
- Handler HTML (`onclick`) vẫn dùng `window.*`
- Hàm dùng chung giữa module: export từ module định nghĩa, import ở module dùng

### appState (trạng thái dùng chung)
Xem `frontend/src/state/index.ts`. Quan trọng nhất:
- `appState.scene`, `.camera`, `.renderer`, `.controls`, `.ifcLoader` — Three.js core
- `appState.files`, `.loadedModels` — file/model slots (index 0,1 = A/B; 2+ = federation)
- `appState.compareResult`, `.clashMode`, `.sgState` — tính năng so sánh/clash/validate
- `appState.colorize`, `.walkActive`, `.clipPlanes` — UI state

## Lưu ý bảo mật
- **Không bao giờ** đưa API key vào bundle frontend
- AI (`frontend/src/modules/ai.ts`) gọi qua backend proxy `/api/ai/chat`
- Backend lấy `ANTHROPIC_API_KEY` từ biến môi trường (`backend/.env`)
- `frontend/src/auth.ts` chứa Firebase config (public theo thiết kế Firebase)

## Bản đồ module: xem `.claude/ARCHITECTURE.md`. Lộ trình: `.claude/IMPLEMENTATION_PLAN.md`.
