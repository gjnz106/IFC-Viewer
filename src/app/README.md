# src/app/ — nguồn của js/app.js

22 file tính năng được **ghép** (không phải import ESM) thành `js/app.js` qua `build.mjs`.
Tất cả nằm trong **một** module scope chung — dùng chung biến/hàm như khi còn inline.

```
node build.mjs              # ghép src/app/*.js → js/app.js
node scripts/verify-build.mjs
```

⚠️ Đây **không** phải module độc lập:
- Đừng thêm `import`/`export` giữa các file này (cho tới Giai đoạn R trong plan).
- Editor báo "biến chưa định nghĩa" là bình thường — biến nằm ở file khác cùng scope.
- Thứ tự ghép theo tên file (tiền tố số). Biến state khai báo ở `01-imports-state.js`.

Bản đồ vai trò từng file: `.claude/ARCHITECTURE.md`.
