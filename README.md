# IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt. Deploy trên cả
[Vercel](https://vercel.com) và [Firebase Hosting](https://firebase.google.com/products/hosting)
tại https://ifc.t3lab.space.

## Tính năng chính

- **Xem mô hình IFC**: load, xoay, cắt lớp (section), đo đạc, walk-through, plan overlay.
- **So sánh (Compare)**: federation nhiều model, phát hiện thay đổi giữa các phiên bản.
- **Clash detection**: phát hiện va chạm giữa các discipline.
- **Validate**: kiểm tra mô hình theo bộ quy tắc IFC-SG, export báo cáo (PDF/BCF).
- **AI Assistant**: trợ lý chat trả lời câu hỏi về mô hình (đếm, tổng hợp số liệu, tra cứu thuộc tính), hỗ trợ tiếng Anh và tiếng Việt.

## Cấu trúc dự án

Một codebase duy nhất ở `frontend/` (Vite + TypeScript). Bản standalone `src/app/` cũ
đã được hợp nhất và xoá — production build trực tiếp từ `frontend/`.

```
t3lab-ifc/
├── frontend/                # ỨNG DỤNG CHÍNH — Vite + TypeScript, componentized theo feature
│   ├── src/components/      #   core/ · tools/ · compare/ · validate/ · inspect/ · integrations/ · ui/
│   ├── src/store/index.ts   #   appState — shared state
│   ├── src/types/index.ts   #   TypeScript interfaces
│   ├── public/              #   css/ · icons/ · vendor/web-ifc (wasm copy lúc build)
│   └── index.html           #   Shell HTML (Vite)
├── backend/                 # Node.js + Express — proxy AI dev (POST /api/ai/chat), CHƯA deploy
├── api/ai/chat.js           # Vercel serverless — proxy AI ĐANG DEPLOY (provider DeepSeek)
├── vercel.json              # buildCommand: build frontend → frontend/dist
├── firebase.json            # Hosting: public = frontend/dist (predeploy build frontend)
└── package.json             # Root workspace (npm workspaces: frontend + backend)
```

Xem `.claude/ARCHITECTURE.md` để có bản đồ module chi tiết và
`.claude/IMPLEMENTATION_PLAN.md` để biết roadmap + các bug đang theo dõi.

## Phát triển

### Frontend (ứng dụng chính)

```bash
cd frontend && npm run dev      # Vite dev server, port 5173
cd frontend && npm run build    # tsc && vite build → frontend/dist
cd frontend && npm run typecheck
cd frontend && npm test         # Vitest
```

Hoặc từ root (chạy frontend + backend cùng lúc): `npm run dev`.

### Backend

```bash
cd backend && npm run dev       # tsx watch, port 3000
```

Copy `backend/.env.example` → `backend/.env` và điền `ANTHROPIC_API_KEY` (hoặc
key của provider khác — xem `CLAUDE.md` phần "Đa provider").

## Quy ước làm việc & bảo mật

Xem `CLAUDE.md` để biết quy tắc chi tiết: shared state (`appState`), module
pattern (ESM), lưu ý bảo mật (không đưa API key vào bundle frontend; AI qua proxy
có xác thực Firebase + rate-limit), và lưu ý khi deploy đồng thời lên Vercel +
Firebase Hosting.
