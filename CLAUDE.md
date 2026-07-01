# CLAUDE.md — IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt, deploy trên cả Vercel và Firebase Hosting tại https://ifc.t3lab.space.
Giao diện tiếng Anh. Assistant có thể trả lời bằng tiếng Anh hoặc tiếng Việt và xử lý được thông tin tiếng Việt từ model.

> ℹ️ **Một codebase duy nhất.** Toàn bộ ứng dụng nằm ở `frontend/` (Vite + TypeScript,
> ESM thật, componentized). Production build từ chính `frontend/` (`vercel.json` +
> `firebase.json` đều trỏ vào `frontend/dist`). Bản standalone `src/app/*` (ghép byte
> qua `build.ts`) đã **bị xoá** sau khi hợp nhất — xem lịch sử git nếu cần tra cứu hành vi cũ.
> Backend proxy AI ở `backend/` (Express, dev) và `api/ai/chat.js` (Vercel serverless, production).

## Cấu trúc dự án

```
t3lab-ifc/
├── frontend/                   # Vite + TypeScript (trình duyệt) — ỨNG DỤNG CHÍNH
│   ├── src/
│   │   ├── lib/
│   │   │   ├── auth.ts         # Firebase Auth (+ window.getAuthToken, window.isAdmin)
│   │   │   └── constants.ts    # IFC_NAMES, FED_COLORS, FED_LABELS
│   │   ├── main.ts             # Entry point — import tất cả component theo thứ tự phụ thuộc
│   │   ├── store/
│   │   │   └── index.ts        # appState — trạng thái dùng chung toàn app
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript interfaces + Window declarations
│   │   └── components/         # component tính năng (.ts), gom nhóm theo vai trò
│   │       ├── core/           # nền tảng Three.js + IFC
│   │       │   ├── viewer-core.ts
│   │       │   ├── viewcube.ts
│   │       │   └── ifc-category.ts
│   │       ├── tools/          # công cụ viewport
│   │       │   ├── colorize.ts
│   │       │   ├── color-schemes.ts
│   │       │   ├── section-visibility.ts
│   │       │   ├── measure.ts
│   │       │   ├── coordinates.ts
│   │       │   ├── walk.ts
│   │       │   ├── plan-overlay.ts
│   │       │   └── focus-highlight.ts
│   │       ├── compare/        # so sánh nhiều model
│   │       │   ├── compare.ts
│   │       │   ├── federation-load.ts
│   │       │   └── clash.ts
│   │       ├── validate/       # IFC-SG validator
│   │       │   ├── validator-rules.ts
│   │       │   ├── validator-rules.test.ts
│   │       │   ├── validator-json-loader.ts
│   │       │   └── validator-export.ts
│   │       ├── inspect/        # tra cứu phần tử
│   │       │   ├── properties.ts
│   │       │   └── search.ts
│   │       ├── integrations/   # dịch vụ ngoài
│   │       │   ├── drive.ts
│   │       │   └── ai.ts
│   │       └── ui/             # vỏ UI + chế độ + router + persist
│   │           ├── ui-shell.ts
│   │           ├── fieldmode.ts
│   │           ├── router.ts
│   │           └── state-persist.ts
│   ├── public/
│   │   ├── css/styles.css      # Giao diện
│   │   ├── icons/              # Asset (t3lab-assistant.png …)
│   │   └── vendor/web-ifc/     # WASM được copy-wasm.mjs đồng bộ lúc build (không commit)
│   ├── scripts/copy-wasm.mjs   # prebuild/predev: copy web-ifc.wasm khớp glue đang bundle
│   ├── index.html              # Shell HTML (Vite)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                    # Node.js + Express + TypeScript (dev proxy AI, CHƯA deploy)
│   ├── src/
│   │   ├── index.ts            # Express server (port 3000)
│   │   ├── routes/
│   │   │   ├── ai.ts           # POST /api/ai/chat — proxy đa provider
│   │   │   └── health.ts       # GET /api/health
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── api/
│   └── ai/chat.js              # Vercel serverless — proxy AI ĐANG DEPLOY (provider DeepSeek)
│
├── vercel.json                 # buildCommand: build frontend → frontend/dist
├── firebase.json               # public: frontend/dist (predeploy build frontend)
└── package.json                # Root workspace (npm workspaces: frontend + backend)
```

## Quy tắc làm việc

### Frontend (TypeScript) — ứng dụng chính
- **Sửa logic app:** chỉnh file trong `frontend/src/components/`
- **Sửa giao diện:** `frontend/public/css/styles.css` hoặc `frontend/index.html`
- **Shared state:** tất cả trạng thái dùng chung qua `appState` trong `frontend/src/store/index.ts`
- **Types:** TypeScript interfaces trong `frontend/src/types/index.ts`
- **Build dev:** `cd frontend && npm run dev` (Vite dev server, port 5173)
- **Build prod:** `cd frontend && npm run build` (`tsc && vite build` → `frontend/dist`)
- **Typecheck:** `cd frontend && npm run typecheck`
- **Test:** `cd frontend && npm test` (Vitest)

### Backend (TypeScript)
- **Sửa API:** `backend/src/routes/`
- **Dev:** `cd backend && npm run dev` (tsx watch, port 3000)
- **Môi trường:** copy `backend/.env.example` → `backend/.env`, điền `ANTHROPIC_API_KEY`
- **AI proxy:** Frontend gọi `POST /api/ai/chat` thay vì gọi Anthropic trực tiếp
- **Đa provider:** proxy hỗ trợ thử nghiệm nhiều nhà cung cấp qua field `provider` (`anthropic` | `openai` | `deepseek` | `google`). Backend dịch request/response sang định dạng Anthropic để vòng lặp tool-use ở client không đổi. Key đặt trong `.env`; `GET /api/ai/status` liệt kê provider đã cấu hình. UI chat có nút ⚙ để chọn provider/model (chỉ hiện cho admin).
- **Lưu ý:** đây là proxy **Express** (`backend/`), CHƯA deploy. Production trên Vercel dùng serverless `api/ai/chat.js` (provider DeepSeek). Cả hai đều yêu cầu Firebase ID token + rate-limit theo uid.

### Module Pattern (ESM)
- Mỗi module: `import { appState } from '../../store/index.js';` (đường dẫn tương đối, đuôi `.js`)
- State dùng chung đọc/ghi qua `appState.xxx` (scene → `appState.scene`, camera → `appState.camera`, v.v.)
- Handler HTML (`onclick`) gắn lên `window.*` trong module tương ứng
- Hàm dùng chung giữa module: `export` từ module định nghĩa, `import` ở module dùng
- Thứ tự khởi tạo nằm ở `frontend/src/main.ts` (auth → core → tools → compare → validate → integrations → ui)

### appState (trạng thái dùng chung)
Xem `frontend/src/store/index.ts`. Quan trọng nhất:
- `appState.scene`, `.camera`, `.renderer`, `.controls`, `.ifcLoader` — Three.js core
- `appState.files`, `.loadedModels` — file/model slots (index 0,1 = A/B; 2+ = federation)
- `appState.compareResult`, `.clashMode`, `.sgState` — tính năng so sánh/clash/validate
- `appState.colorize`, `.walkActive`, `.clipPlanes` — UI state

## Lưu ý bảo mật
- **Không bao giờ** đưa API key vào bundle frontend
- AI gọi qua proxy `/api/ai/chat` (client: `frontend/src/components/integrations/ai.ts`)
- Client gửi kèm `Authorization: Bearer <Firebase ID token>` qua `window.getAuthToken()`
- Proxy lấy API key từ biến môi trường (`backend/.env` cho Express; Vercel env cho `api/ai/chat.js`), xác thực Firebase ID token + rate-limit theo uid
- `frontend/src/lib/auth.ts` chứa Firebase config (public theo thiết kế Firebase) + allowlist email admin (`window.isAdmin`)

## Lưu ý Deploy & Tối ưu hóa (Vercel & Firebase)
- Web được deploy trên cả **Vercel** và **Firebase Hosting** từ cùng một build `frontend/dist`. Khi update project, chú ý tương thích cho cả 2 bên.
- Đảm bảo SPA Routing, headers, rewrites/redirects, và caching cho tài nguyên tĩnh (đặc biệt file WASM của web-ifc) được cấu hình đúng trên cả Vercel (`vercel.json`) và Firebase (`firebase.json`). WASM được `frontend/scripts/copy-wasm.mjs` đồng bộ vào `frontend/public/vendor/web-ifc/` lúc build để khớp đúng glue đang bundle (tránh lỗi LinkError / "expected magic word").

## Bản đồ module: xem `.claude/ARCHITECTURE.md`. Lộ trình: `.claude/IMPLEMENTATION_PLAN.md`.
