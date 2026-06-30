# CLAUDE.md — IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt, deploy trên cả Vercel và Firebase Hosting tại https://ifc.t3lab.space.
Giao diện tiếng Anh. Assistant có thể trả lời bằng tiếng Anh hoặc tiếng Việt và xử lý được thông tin tiếng Việt từ model.

> ⚠️ **Repo có HAI codebase song song.** Bản **đang deploy production** là `src/app/*.ts`
> (build qua `build.ts`/esbuild → `js/app.js`, phục vụ bởi `index.html` ở root). Bản
> `frontend/` (Vite) mô tả dưới đây là **đích migrate, CHƯA deploy** (xem
> `.claude/IMPLEMENTATION_PLAN.md` › Giai đoạn R). Mọi fix hành vi quan trọng phải áp
> dụng ở **cả hai nơi** cho tới khi cắt deploy. Xem `.claude/ARCHITECTURE.md` để có bản
> đồ module của bản standalone `src/app/`.

## Cấu trúc dự án

```
IFC-Viewer/
├── frontend/                   # Vite + TypeScript (trình duyệt)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── auth.ts         # Firebase Auth
│   │   │   └── constants.ts    # IFC_NAMES, FED_COLORS, FED_LABELS
│   │   ├── main.ts             # Entry point — import tất cả component theo thứ tự
│   │   ├── store/
│   │   │   └── index.ts        # appState — trạng thái dùng chung toàn app
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript interfaces + Window declarations
│   │   └── components/         # component tính năng (25 file .ts), gom nhóm theo vai trò
│   │       ├── core/           # nền tảng Three.js + IFC
│   │       │   ├── viewer-core.ts
│   │       │   ├── viewcube.ts
│   │       │   └── ifc-category.ts
│   │       ├── tools/          # công cụ viewport
│   │       │   ├── colorize.ts
│   │       │   ├── color-schemes.ts
│   │       │   ├── section-visibility.ts
│   │       │   ├── measure.ts
│   │       │   ├── walk.ts
│   │       │   ├── plan-overlay.ts
│   │       │   └── focus-highlight.ts
│   │       ├── compare/        # so sánh nhiều model
│   │       │   ├── compare.ts
│   │       │   ├── federation-load.ts
│   │       │   └── clash.ts
│   │       ├── validate/       # IFC-SG validator
│   │       │   ├── validator-rules.ts
│   │       │   ├── validator-json-loader.ts
│   │       │   └── validator-export.ts
│   │       ├── inspect/        # tra cứu phần tử
│   │       │   ├── properties.ts
│   │       │   └── search.ts
│   │       ├── integrations/   # dịch vụ ngoài
│   │       │   ├── drive.ts
│   │       │   └── ai.ts
│   │       └── ui/             # vỏ UI + chế độ
│   │           ├── ui-shell.ts
│   │           └── fieldmode.ts
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
- **Sửa logic app:** chỉnh file trong `frontend/src/components/`
- **Sửa giao diện:** `frontend/public/css/styles.css` hoặc `frontend/index.html`
- **Shared state:** tất cả trạng thái dùng chung qua `appState` trong `frontend/src/store/index.ts`
- **Types:** TypeScript interfaces trong `frontend/src/types/index.ts`
- **Build dev:** `cd frontend && npm run dev` (Vite dev server, port 5173)
- **Build prod:** `cd frontend && npm run build`

### Backend (TypeScript)
- **Sửa API:** `backend/src/routes/`
- **Dev:** `cd backend && npm run dev` (tsx watch, port 3000)
- **Môi trường:** copy `backend/.env.example` → `backend/.env`, điền `ANTHROPIC_API_KEY`
- **AI proxy:** Frontend gọi `POST /api/ai/chat` thay vì gọi Anthropic trực tiếp
- **Đa provider:** proxy hỗ trợ thử nghiệm nhiều nhà cung cấp qua field `provider` (`anthropic` | `openai` | `deepseek` | `google`). Backend dịch request/response sang định dạng Anthropic để vòng lặp tool-use ở client không đổi. Key đặt trong `.env`; `GET /api/ai/status` liệt kê provider đã cấu hình. UI chat có nút ⚙ để chọn provider/model.
- **Lưu ý:** đây là proxy **Express** (`backend/`), CHƯA deploy. Production trên Vercel dùng serverless `api/ai/chat.js` (provider DeepSeek). Cả hai đều yêu cầu Firebase ID token + rate-limit theo uid.

### Module Pattern
- Mỗi module: `import { appState } from '../store/index.js';`
- Thay biến global bằng `appState.xxx` (scene → appState.scene, camera → appState.camera, v.v.)
- Handler HTML (`onclick`) vẫn dùng `window.*`
- Hàm dùng chung giữa module: export từ module định nghĩa, import ở module dùng

### appState (trạng thái dùng chung)
Xem `frontend/src/store/index.ts`. Quan trọng nhất:
- `appState.scene`, `.camera`, `.renderer`, `.controls`, `.ifcLoader` — Three.js core
- `appState.files`, `.loadedModels` — file/model slots (index 0,1 = A/B; 2+ = federation)
- `appState.compareResult`, `.clashMode`, `.sgState` — tính năng so sánh/clash/validate
- `appState.colorize`, `.walkActive`, `.clipPlanes` — UI state

## Lưu ý bảo mật
- **Không bao giờ** đưa API key vào bundle frontend
- AI gọi qua proxy `/api/ai/chat` (client: `frontend/src/components/integrations/ai.ts` cho bản Vite, `src/app/22-ai.ts` cho bản đang deploy)
- Proxy lấy API key từ biến môi trường (`backend/.env` cho Express; Vercel env cho `api/ai/chat.js`)
- `frontend/src/lib/auth.ts` chứa Firebase config (public theo thiết kế Firebase)

## Lưu ý Deploy & Tối ưu hóa (Vercel & Firebase)
- Web được deploy trên cả **Vercel** và **Firebase Hosting**. Khi update project, cần đặc biệt chú ý tương thích và optimize cho cả 2 bên.
- Đảm bảo SPA Routing, headers, rewrites/redirects, và caching cho các tài nguyên tĩnh (đặc biệt là file WASM dung lượng lớn của web-ifc) được cấu hình đúng trên cả Vercel (`vercel.json` ở root dự án) và Firebase. Đảm bảo các asset tải mượt mà, không gặp lỗi 404 hoặc bị cache phiên bản cũ.

## Bản đồ module: xem `.claude/ARCHITECTURE.md`. Lộ trình: `.claude/IMPLEMENTATION_PLAN.md`.

