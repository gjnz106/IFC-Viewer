# Fragments spike — bản chạy ngay

Hoàn toàn độc lập. **Không liên quan gì tới IFC Delta đang chạy** — không sửa,
không đụng, không cần repo. Test xong thì xoá cả thư mục.

## Chạy

Giải nén, mở terminal trong thư mục này, chạy **một** trong hai lệnh:

```sh
python3 -m http.server 8000
```

hoặc nếu bạn có Node:

```sh
npx serve -p 8000
```

Rồi mở trình duyệt: **http://localhost:8000**

> Phải chạy qua HTTP server, **không mở trực tiếp file index.html** — trang này
> dùng Web Worker và WebAssembly, trình duyệt chặn cả hai khi mở bằng `file://`.

## Dùng

1. Chọn file IFC **thật** của bạn (càng giống model bạn làm hàng ngày càng tốt)
2. Để nguyên ô **Include all attributes** ở lần chạy đầu
3. Bấm **Run**, chờ — file lớn có thể mất vài phút

File của bạn **không đi đâu cả** — mọi thứ chạy trong tab trình duyệt, không
upload lên đâu hết.

## Đọc kết quả

| Kết quả | Nghĩa là |
|---|---|
| **Check 1 FAIL** | Dừng. Compare không dựng lại được trên fragments. |
| **Check 2 PARTIAL** | Xem *property nào* thiếu. Bỏ tick "Include all attributes" rồi chạy lại — nếu kết quả đổi thì đó là lỗi cấu hình, không phải giới hạn định dạng. |
| **Check 3 FAIL/PARTIAL** | Khắc phục được, nhưng phải trích units/TrueNorth/material ra file phụ lúc convert. Là công việc thật, cần tính vào ước lượng. |
| **Check 4 FAIL** | Compare mất khả năng phát hiện phần tử bị **dịch chuyển**, chỉ còn so property. |

### Nếu gặp FAIL bất ngờ — nghi ngờ công cụ trước

Chính tôi đã bị bộ đo này lừa **hai lần**, cả hai đều báo FAIL rất thuyết phục
nhưng là lỗi của tôi, không phải của fragments:

- `models.load()` chuyển buffer sang worker và **detach** nó → đọc kích thước
  sau đó ra 0 byte, trông y hệt "convert thất bại" (thực tế convert vẫn chạy tốt).
- ID nằm ở `_localId` chứ không phải `localId` → đọc sai key ra 0 phần tử,
  trông y hệt "mất sạch GlobalId".

Giờ bộ đo đã tự nhận ra hai trường hợp này và báo **INCONCLUSIVE** thay vì FAIL.
Nhưng nguyên tắc vẫn đúng: kết quả xấu bất thường thì nghi công cụ trước.

## Lưu ý về số đo tốc độ

Model parse dưới 2 giây sẽ cho con số speed-up **vô nghĩa** — chi phí khởi động
worker (~1 giây) át hết. Trang sẽ tự cảnh báo. Muốn số thật thì dùng file đủ lớn.

Bản này đo bằng: `@thatopen/fragments` 3.4.7 · `web-ifc` 0.0.77+ · `three` 0.182+

## Không đo được ở đây

- **RAM đỉnh** — xem trong Task Manager của trình duyệt (Chrome: Shift+Esc)
- Fragments 3.4.7 đòi `three >= 0.182` và `web-ifc >= 0.0.77`, trong khi IFC
  Delta đang ở `three@0.160` / `web-ifc@0.0.57` → chuyển sang fragments **kéo
  theo cả hai lần nâng cấp đó**, với rủi ro riêng mà bộ đo này không thấy được.
- Độ ổn định định dạng giữa các phiên bản thư viện.
