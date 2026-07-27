# Manpower Planning — deploy trên Firebase (dùng chung account + Firestore với IFC Viewer)

App quản lý nhân lực dự án (single-file `index.html`). Trước đây có "online mode"
viết cho **Supabase**; bản này đã được chuyển sang **Firebase** để **dùng chung
Firebase project `ifc-delta` với IFC Viewer** — cùng tài khoản đăng nhập (Auth) và
cùng Firestore.

## Cách hoạt động

- **Đăng nhập**: Firebase Auth (email/password). Người dùng đăng nhập bằng **đúng
  tài khoản** họ dùng cho IFC Viewer.
- **Kiểm soát truy cập**: sau khi đăng nhập, app đọc `allowedUsers/{email}` trong
  Firestore (đúng allowlist IFC Viewer đang dùng, do admin quản lý trong Firebase
  Console). Không có doc → tự đăng xuất, không thấy dữ liệu.
- **Dữ liệu**: lưu trong Firestore, **dùng chung cho cả team** (giống ngữ nghĩa
  Supabase realtime cũ), trong 3 collection tách biệt để không đụng dữ liệu IFC:
  - `manpower_projects` — dự án
  - `manpower_groups` — nhóm (`project_id` trỏ về project)
  - `manpower_positions` — vị trí/nhân sự (`group_id` trỏ về group, `monthly` là map tháng→FTE)
- **Realtime**: `onSnapshot` trên 3 collection → mọi thay đổi (của bất kỳ ai) tự
  reload cho tất cả (có debounce; bỏ qua khi đang gõ trong bảng hoặc mở modal).

## Cấu hình đã có sẵn trong repo

- `manpower/index.html` — app (đã nhúng `firebaseConfig` của project `ifc-delta`;
  config này public theo thiết kế Firebase nên an toàn khi ship ở client).
- `firestore.rules` — đã thêm quyền cho 3 collection `manpower_*` (gate bằng
  `isAllowed()`).
- `firebase.json` — hosting đổi sang **multi-site**: site `ifc-delta` (IFC Viewer,
  giữ nguyên) + site mới `manpower-t3lab` trỏ `public: "manpower"`.

## Các bước deploy (chạy 1 lần)

```bash
# 1. Tạo hosting site mới trong CÙNG project ifc-delta
#    (đổi "manpower-t3lab" nếu muốn tên khác — nhớ sửa khớp trong firebase.json)
firebase hosting:sites:create manpower-t3lab --project ifc-delta

# 2. Đẩy rules đã cập nhật (BẮT BUỘC — nếu không, mọi read/write manpower_* bị chặn)
firebase deploy --only firestore:rules --project ifc-delta

# 3. Deploy app (chỉ site manpower, không đụng site IFC Viewer)
firebase deploy --only hosting:manpower-t3lab --project ifc-delta
```

Sau đó app chạy tại `https://manpower-t3lab.web.app`. Muốn domain riêng
(vd `manpower.t3lab.space`): Firebase Console → Hosting → site `manpower-t3lab`
→ Add custom domain.

> ⚠️ Vì `firebase.json` giờ là multi-site, `firebase deploy --only hosting`
> (không kèm tên site) sẽ deploy **cả hai** site — chỉ chạy được sau khi site
> `manpower-t3lab` đã tồn tại (bước 1). Để an toàn, luôn deploy có tên site:
> `--only hosting:ifc-delta` hoặc `--only hosting:manpower-t3lab`.

## Cấp quyền cho một người dùng

Giống hệt IFC Viewer: Firebase Console → Authentication → Add user (email/password),
rồi Firestore → collection `allowedUsers` → tạo doc id = **email viết thường**
(thêm field `admin: true` nếu muốn là admin). Người đó dùng ngay được cả IFC Viewer
lẫn Manpower Planning bằng một tài khoản.

## Chuyển đổi so với bản Supabase

Chỉ tầng "online" được viết lại — toàn bộ UI/logic nhập liệu, biểu đồ, xuất
JSON/Excel/PPT giữ nguyên. Cụ thể:

| Trước (Supabase)                              | Sau (Firebase)                                    |
|-----------------------------------------------|---------------------------------------------------|
| `<script>` supabase-js UMD                     | `firebase-app/auth/firestore-compat`              |
| `supabase.createClient(URL, KEY)`              | `firebase.initializeApp(firebaseConfig)`          |
| `supa.from('t').insert/update/delete/select`   | `db.collection(...).add/update/delete/get`        |
| FK cascade delete (DB)                          | cascade delete ở client (`dbDeleteProject/Group`) |
| `supa.channel(...).on('postgres_changes')`     | `collection.onSnapshot(...)`                      |
| (không có đăng nhập)                            | Auth + allowlist gate (`allowedUsers/{email}`)    |
