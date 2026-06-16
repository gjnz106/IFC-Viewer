# Refactor Map — index.html monolith → module files

Ghi lại chính xác phép tách đã thực hiện, để truy vết và để kiểm chứng lại nếu cần.

## Nguồn gốc

`index.html` gốc = 13.559 dòng / 684.687 byte, gồm CSS + HTML + 2 module inline.
Phép tách **byte-identical**: code JS sau ghép trùng từng byte với bản gốc đang chạy.

## Bản đồ dòng (theo index.html GỐC)

| Dải dòng (gốc) | Nội dung | Đích |
|----------------|----------|------|
| 1–9 | `<head>` (meta, font, Google GSI/GAPI) | `index.html` (giữ) |
| 10–949 | `<style>…</style>` | `css/styles.css` (11–948) |
| 950–951 | `</head><body>` | `index.html` (giữ) |
| 952–1734 | Markup giao diện | `index.html` (giữ inline) |
| 1735–2025 | `<script type=module>` Firebase Auth | `js/auth.js` (1736–2024) |
| 2027–2029 | `<script type=importmap>` | `index.html` (giữ) |
| 2030–13557 | `<script type=module>` ứng dụng chính | `js/app.js` ← `src/app/*.js` (2031–13556) |
| 13558–13559 | `</body></html>` | `index.html` (giữ) |

## Cắt module chính (dòng bắt đầu trong index.html gốc)

| Dòng | File |
|------|------|
| 2031 | `src/app/01-imports-state.js` |
| 2119 | `src/app/02-ifc-category.js` |
| 2297 | `src/app/03-viewer-core.js` |
| 2900 | `src/app/04-viewcube.js` |
| 3059 | `src/app/05-colorize.js` |
| 3710 | `src/app/06-color-schemes.js` |
| 4175 | `src/app/07-section-visibility.js` |
| 5156 | `src/app/08-federation-load.js` |
| 5606 | `src/app/09-compare.js` |
| 5952 | `src/app/10-properties.js` |
| 6484 | `src/app/11-measure.js` |
| 6948 | `src/app/12-focus-highlight.js` |
| 7330 | `src/app/13-clash.js` |
| 8557 | `src/app/14-walk.js` |
| 8701 | `src/app/15-plan-overlay.js` |
| 9364 | `src/app/16-validator-rules.js` |
| 10344 | `src/app/17-validator-json-loader.js` |
| 11285 | `src/app/18-validator-export.js` |
| 11615 | `src/app/19-drive.js` |
| 11801 | `src/app/20-search.js` |
| 12158 | `src/app/21-fieldmode.js` |
| 12928 | `src/app/22-ai.js` |

Mỗi điểm cắt nằm ở banner comment cột-0 (ranh giới giữa các khai báo top-level).

## Kiểm chứng

```
node build.mjs            # ghép src/app/*.js → js/app.js
node scripts/verify-build.mjs
```

`verify-build.mjs` khẳng định: (1) `js/app.js` khớp với nguồn `src/app/*.js`;
(2) `index.html` tham chiếu đủ css/auth/app + importmap; (3) importmap đứng trước
script module của app (yêu cầu của trình duyệt khi module là file ngoài).

Tính đúng đắn ở thời điểm tách được bảo đảm vì `js/app.js`, `js/auth.js`,
`css/styles.css` trùng từng byte với code đã chạy production.
