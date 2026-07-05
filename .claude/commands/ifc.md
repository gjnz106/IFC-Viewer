---
description: Chạy phase tiếp theo trong .claude/COMPLETION_PLAN.md, verify, mở PR, cập nhật status (repo + Notion)
---

Bạn đang tự động thực thi kế hoạch hoàn thiện app IFC Delta. Làm **đúng một phase mỗi lần chạy**.

## Quy trình bắt buộc

1. **Đọc** `.claude/COMPLETION_PLAN.md`.
   - Nếu người dùng truyền số phase (ví dụ `/ifc 2`), làm phase đó.
   - Nếu không, chọn **phase có `Status:` chưa `✅ Done` với số nhỏ nhất**.
   - Nếu tất cả đã Done → báo "Tất cả phase đã hoàn thành" và DỪNG (không tự bịa việc mới).

2. **Kiểm tra rào chắn của phase.** Nếu phase ghi cần người dùng quyết định (ví dụ Phase 0
   chọn hosting a/b, hay bật Pages source) → **HỎI người dùng trước** bằng AskUserQuestion,
   đừng tự chọn. Các phase kỹ thuật thuần thì cứ làm.

3. **Đồng bộ nhánh:** `git fetch origin main` rồi `git checkout -B claude/festive-ride-ftow0a origin/main`.
   Đặt `git config user.email noreply@anthropic.com && git config user.name Claude`.
   ⚠️ TUYỆT ĐỐI không chạy lệnh git huỷ thay đổi chưa commit (`git checkout -- .`, `reset --hard`,
   `clean`) khi đang có sửa đổi trong cây làm việc.

4. **Thực thi mọi task của phase**, theo `CLAUDE.md` và `.claude/ARCHITECTURE.md`:
   - Code ở `frontend/` (Vite + TS). Giữ nguyên mọi element ID và `window.*` handler.
   - Ưu tiên thay đổi nhỏ, có chủ đích; thêm unit test khi hợp lý.

5. **Verify (bắt buộc pass hết trước khi commit):**
   - `npm run typecheck --workspace=frontend`
   - `npx vitest run --root frontend`
   - `npm run build --workspace=frontend`
   - Nếu đổi UI/handler: chạy headless smoke-test (serve `frontend/dist`, mở bằng Chromium ở
     `/opt/pw-browsers/chromium-*/chrome-linux/chrome`, kiểm tra 0 pageerror) khi khả thi.
   - Nếu có gì fail → sửa cho pass; nếu bế tắc → DỪNG, báo rõ chỗ kẹt, KHÔNG commit.

6. **Bản standalone để review (bắt buộc mỗi update):**
   - Chạy `npm run build:standalone --workspace=frontend` → tạo `frontend/dist-standalone/index.html`
     (1 file HTML tự chứa; web-ifc WASM tải từ CDN qua `window.__WASM_BASE__` để mở được từ `file://`).
   - Smoke-test headless (mở file bằng Chromium, kiểm tra 0 pageerror).
   - **Gửi file cho người dùng bằng `SendUserFile`** (đổi tên có ngày, ví dụ `IFC-Delta-review-<YYYYMMDD>.html`),
     kèm caption ngắn nói phase nào + review thế nào — TRƯỚC hoặc CÙNG khi mở PR để họ review trước khi merge.

7. **Commit + push + PR (draft):**
   - Chỉ `git add` các file đã đổi (đừng add `frontend/dist`).
   - Commit message rõ ràng (dùng `-F <file>` nếu message có ký tự đặc biệt/backtick).
     Kết thúc bằng:
     ```
     Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
     ```
   - `git push -u origin claude/festive-ride-ftow0a`.
   - Mở **draft PR** vào `main` (dùng GitHub MCP). KHÔNG tự merge — để người dùng merge.

8. **Cập nhật status ở HAI nơi:**
   - **Repo:** trong `.claude/COMPLETION_PLAN.md` đổi `Status:` của phase → `✅ Done — PR #<n> (<ngày>)`,
     tick các checkbox `[ ]`→`[x]`, cập nhật bảng tổng quan. Commit thay đổi này cùng PR.
   - **Notion:** cập nhật page `394e88f5-1f7d-81ae-a852-e6e45f0d1570` (dùng Notion MCP:
     `notion-fetch` để lấy nội dung rồi `notion-update-page`) — đánh dấu phase đó Done + link PR.
     Nếu Notion MCP chưa kết nối trong phiên này → ghi chú "Notion chưa kết nối, bỏ qua" và tiếp tục
     (đừng để lỗi Notion chặn việc còn lại).

9. **Báo cáo** ngắn gọn: đã làm phase nào, thay đổi chính, kết quả verify, link PR + file standalone,
   status mới. Rồi DỪNG (một phase mỗi lần).

## Nguyên tắc
- Một phase/lần. Không gộp nhiều phase trừ khi người dùng yêu cầu.
- Không merge lên main. Không đổi hosting/secret nếu chưa được xác nhận.
- Nếu phát hiện phase phụ thuộc phase chưa xong, báo và hỏi thay vì làm nhảy cóc.
