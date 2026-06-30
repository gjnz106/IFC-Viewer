# IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt. Deploy trên cả
[Vercel](https://vercel.com) và [Firebase Hosting](https://firebase.google.com/products/hosting)
tại https://ifc.t3lab.space.

## Tính năng chính

- **Xem mô hình IFC**: load, xoay, cắt lớp (section), đo đạc, walk-through, plan overlay.
- **So sánh (Compare)**: federation nhiều model, phát hiện thay đổi giữa các phiên bản.
- **Clash detection**: phát hiện va chạm giữa các discipline.
- **Validate**: kiểm tra mô hình theo bộ quy tắc IFC-SG, export báo cáo.
- **AI Assistant**: trợ lý chat trả lời câu hỏi về mô hình (đếm, tổng hợp số liệu, tra cứu thuộc tính), hỗ trợ tiếng Anh và tiếng Việt.

## Cấu trúc dự án

Repo hiện có **hai codebase song song** triển khai cùng một ứng dụng:

```
t3lab-ifc/
├── src/app/                # ⚠️ ĐANG ĐƯỢC DEPLOY — 23 file TypeScript, build qua build.ts/esbuild
│                            #    thành js/app.js, phục vụ bởi index.html ở root.
├── frontend/                # Vite + TypeScript, componentized theo feature (core/, tools/,
│                            #    compare/, validate/, inspect/, integrations/, ui/).
│                            #    Chưa được wire vào pipeline deploy nào (xem .claude/IMPLEMENTATION_PLAN.md
│                            #    phần "Giai đoạn R" — kế hoạch migrate dần sang codebase này).
├── backend/                 # Node.js + Express + TypeScript — proxy AI (POST /api/ai/chat)
├── api/                     # Vercel serverless functions
├── js/, css/, vendor/       # Build output + assets phục vụ bởi bản standalone (src/app/)
├── index.html                # Shell HTML cho bản standalone
├── build.ts                  # Build script: gộp src/app/*.ts (+ frontend/src/lib/auth.ts) → js/app.js
├── vercel.json                # buildCommand: npm run build:standalone
└── firebase.json              # Hosting tĩnh, serve trực tiếp js/app.js đã build sẵn
```

Xem `.claude/ARCHITECTURE.md` để có bản đồ module chi tiết và
`.claude/IMPLEMENTATION_PLAN.md` để biết roadmap, các bug đang theo dõi, và kế
hoạch hợp nhất hai codebase.

## Phát triển

### Bản đang deploy (`src/app/`)

```bash
npm run build:standalone     # build js/app.js từ src/app/*.ts
npm run typecheck:standalone
npm run verify:standalone
```

### Frontend (Vite, đang migrate dần sang đây)

```bash
cd frontend && npm run dev      # Vite dev server, port 5173
cd frontend && npm run build
```

### Backend

```bash
cd backend && npm run dev       # tsx watch, port 3000
```

Copy `backend/.env.example` → `backend/.env` và điền `ANTHROPIC_API_KEY` (hoặc
key của provider khác — xem `CLAUDE.md` phần "Đa provider").

## Quy ước làm việc & bảo mật

Xem `CLAUDE.md` để biết quy tắc chi tiết: shared state (`appState`), module
pattern, lưu ý bảo mật (không đưa API key vào bundle frontend), và lưu ý khi
deploy đồng thời lên Vercel + Firebase Hosting.
