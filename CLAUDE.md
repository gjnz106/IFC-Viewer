# CLAUDE.md — IFC Delta

Web-based BIM viewer (xem · so sánh · clash · validate · AI) cho team BIM nội bộ.
Three.js + web-ifc (WASM), chạy 100% trong trình duyệt, deploy GitHub Pages (không build server).
Giao diện tiếng Việt.

## Cấu trúc

```
index.html                 # shell: css link + importmap + auth + app (slim, ~800 dòng)
css/styles.css             # toàn bộ giao diện
js/auth.js                 # Firebase Auth (module độc lập)
js/app.js                  # GENERATED — ghép từ src/app/*.js. KHÔNG sửa trực tiếp.
src/app/*.js               # 22 file tính năng (nguồn sự thật của app logic)
build.mjs                  # node build.mjs → ghép src/app/*.js thành js/app.js
scripts/verify-build.mjs   # kiểm tra build & wiring index.html
.claude/                   # IMPLEMENTATION_PLAN · ARCHITECTURE · REFACTOR_MAP
```

## Quy tắc làm việc

- **Sửa logic app:** chỉnh file trong `src/app/`, rồi chạy `node build.mjs`. **Đừng** sửa `js/app.js`.
- **Sửa giao diện:** `css/styles.css` hoặc markup trong `index.html` (không cần build).
- Sau khi đổi, chạy `node scripts/verify-build.mjs` trước khi commit.
- `src/app/*.js` **không** phải ESM độc lập — chúng là mảnh ghép của một module scope chung,
  dùng chung biến/hàm. Editor báo "undefined variable" là bình thường. **Đừng** thêm
  `import`/`export` giữa chúng (xem `.claude/IMPLEMENTATION_PLAN.md` › Giai đoạn R).
- Handler gọi từ HTML `onclick` phải nằm trên `window.*`.

## Bản đồ module: xem `.claude/ARCHITECTURE.md`. Lộ trình: `.claude/IMPLEMENTATION_PLAN.md`.

## Lưu ý bảo mật

- **Không bao giờ** đưa API key vào bundle. Tính năng AI (`src/app/22-ai.js`) phải gọi qua
  Cloudflare Worker proxy trước khi mở cho team (xem plan §1.1).
- `js/auth.js` chứa Firebase config (public theo thiết kế của Firebase) — không phải secret.
