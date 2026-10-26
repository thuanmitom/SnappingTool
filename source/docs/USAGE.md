# Hướng dẫn sử dụng

> [!NOTE]
> Tên các chức năng trong ứng dụng hiển thị bằng tiếng Anh và khớp với các tiêu đề bên dưới.

## Mục lục

1. [Khái niệm cơ bản](#khái-niệm-cơ-bản)
2. [Lưu một phiên (Snap)](#1-lưu-một-phiên-snap)
3. [Khôi phục một phiên (Restore)](#2-khôi-phục-một-phiên-restore)
4. [Nhóm phiên bằng Catalogs](#3-nhóm-phiên-bằng-catalogs)
5. [Quick actions](#4-quick-actions)
6. [Chạy nền và phím tắt](#5-chạy-nền-và-phím-tắt)
7. [Profile hiệu năng](#6-profile-hiệu-năng)
8. [Tự khôi phục khi khởi động](#7-tự-khôi-phục-khi-khởi-động)
9. [Lưu trữ dữ liệu](#8-lưu-trữ-dữ-liệu)
10. [Mẹo sử dụng](#mẹo-sử-dụng)

## Khái niệm cơ bản

Một **phiên (Session)** là ảnh chụp những gì đang mở tại thời điểm bạn bấm Snap: các ứng dụng, các cửa sổ trình duyệt cùng tab, vị trí từng cửa sổ và bố cục màn hình. Khi **Restore**, SnappingTool mở lại tất cả và đặt mọi thứ về đúng vị trí.

## 1. Lưu một phiên (Snap)

1. Mở sẵn các ứng dụng và tab muốn lưu.
2. Bấm **Snap now** (góc dưới bên trái) hoặc phím tắt `Ctrl+Alt+S`.
3. Hộp thoại hiển thị danh sách ứng dụng và tab đang mở. Chọn những mục cần lưu, bỏ chọn những mục không cần.
   - Với trình duyệt, có thể chọn hoặc bỏ chọn từng tab.
   - Dùng **Toggle all** để chọn/bỏ chọn cả nhóm.
4. (Tuỳ chọn) Đặt tên cho phiên và gán vào catalog.
5. Bấm **Save session**.

Phiên mới xuất hiện ở trang **Sessions** dưới dạng thẻ, kèm sơ đồ thu nhỏ mô phỏng vị trí cửa sổ trên các màn hình.

> [!TIP]
> Để lưu được tab trình duyệt, extension phải được cài và ghép cặp — xem [`SETUP.md`](SETUP.md#a3-cài-extension-trình-duyệt).

## 2. Khôi phục một phiên (Restore)

Có ba cách:

- Bấm **Restore** trên thẻ phiên.
- Dùng phím tắt `Ctrl+Alt+1` … `Ctrl+Alt+9` để khôi phục nhanh 9 phiên đầu danh sách.
- Chuột phải vào icon ở khay hệ thống → **Restore recent**.

SnappingTool mở lần lượt từng ứng dụng (có giãn cách để không gây quá tải cho máy yếu), mở lại các tab trình duyệt, rồi đặt cửa sổ về đúng vị trí.

**Khi số màn hình khác lúc snap:** nếu hiện có ít màn hình hơn, các cửa sổ được dồn về màn hình chính nhưng vẫn giữ vị trí tương đối để không bị lệch ra ngoài vùng hiển thị.

## 3. Nhóm phiên bằng Catalogs

Catalog giúp phân loại phiên theo mục đích.

1. Vào **Catalogs → New catalog** và đặt tên (ví dụ: "Dự án A").
2. Ở trang **Sessions**, bấm **Catalog** trên thẻ phiên và chọn catalog muốn gán.
3. Bấm vào tên catalog ở đầu trang **Sessions** để chỉ hiển thị các phiên thuộc nhóm đó.

Một phiên có thể thuộc nhiều catalog. Xoá catalog **không** xoá các phiên bên trong.

## 4. Quick actions

Quick action cho phép một phím tắt mở cùng lúc nhiều ứng dụng và URL.

1. Vào **Quick actions → New action**.
2. Đặt **Name** (ví dụ: "Morning setup").
3. Ở ô **Hotkey**, click vào rồi **bấm trực tiếp tổ hợp phím** (ví dụ giữ `Ctrl+Alt` rồi bấm `B`). Bấm `Esc` để xoá.
4. Ở phần **Targets**, bấm **+ Add target** để thêm URL hoặc ứng dụng. Tất cả mở cùng lúc khi bấm phím tắt (giãn cách 0,4 giây).
   - **URL** phải bắt đầu bằng `http://` hoặc `https://`.
   - **App** là đường dẫn đầy đủ tới file `.exe` (hoặc shortcut `.lnk`) trên ổ đĩa cục bộ, ví dụ `C:\Program Files\Notepad++\notepad++.exe`.
5. Bấm **Save**. Để chỉnh sửa, bấm **Edit** trên thẻ action.

> [!NOTE]
> Phím tắt toàn cục của Windows chỉ nhận dạng *phím bổ trợ + một phím thường* (`Ctrl+Alt+B` hợp lệ, `Ctrl+O+B` không hợp lệ). Để dùng chuỗi phím, bấm tổ hợp đầu rồi bấm thêm một phím nữa (ví dụ `Ctrl+O` rồi `F`).
>
> Đường dẫn mạng (`\\server\…`) và các loại file khác (`.bat`, `.ps1`…) không được chấp nhận, để quick action không thể bị lợi dụng chạy mã lạ.

## 5. Chạy nền và phím tắt

- Nút **X** không tắt ứng dụng mà thu về khay hệ thống (có thể đổi trong Settings).
- `Ctrl+Alt+Space` bật/ẩn dashboard bất cứ lúc nào.
- Bấm icon ở khay hệ thống để mở menu nhanh.

| Phím tắt mặc định | Hành động |
|---|---|
| `Ctrl+Alt+S` | Snap now (mở hộp thoại chọn mục) |
| `Ctrl+Alt+Space` | Bật/ẩn dashboard |
| `Ctrl+Alt+1` … `Ctrl+Alt+9` | Khôi phục phiên số 1–9 |
| Tuỳ chỉnh | Quick actions do bạn gán |

Đổi phím tắt trong **Settings → Global hotkeys**.

## 6. Profile hiệu năng

Vào **Settings → Performance profile** để chọn một trong ba mức:

| Profile | Phù hợp với | Hành vi |
|---|---|---|
| **Lite** | Máy yếu, ít RAM hoặc ít dung lượng ổ đĩa | Tắt snapshot tự động, giữ tối đa 5 phiên tự động, khôi phục chậm và giãn cách hơn |
| **Balanced** | Máy tầm trung | Snapshot tự động mỗi ngày một lần, giữ khoảng 20 phiên tự động |
| **Full** | Máy mạnh | Snapshot tự động mỗi 6 giờ, khôi phục nhanh, không giới hạn số phiên |

Ở lần chạy đầu, SnappingTool tự đề xuất profile theo cấu hình máy. Bạn có thể đổi bất cứ lúc nào.

## 7. Tự khôi phục khi khởi động

Vào **Settings → Behaviour → Restore a session at startup** và chọn phiên muốn tự mở. Phiên đó sẽ được khôi phục khoảng 8 giây sau khi đăng nhập Windows.

## 8. Lưu trữ dữ liệu

- **Settings → Storage → Open** mở thư mục chứa dữ liệu phiên.
- **Change…** chuyển dữ liệu sang ổ khác nếu ổ C sắp đầy. Chỉ chấp nhận thư mục trên ổ đĩa cục bộ, không chấp nhận thư mục mạng.
- Mỗi phiên chỉ chiếm vài KB. Các file dữ liệu được mã hoá nên không đọc hay sửa trực tiếp được bằng trình soạn thảo.

## Mẹo sử dụng

- **Ghim (★) phiên dùng nhiều nhất:** phiên được ghim luôn nằm đầu danh sách và nhận `Ctrl+Alt+1`.
- **Duplicate** một phiên để tạo biến thể (ví dụ "Dev" và "Dev + Meeting") mà không cần snap lại.
- Đặt tên phiên rõ ràng, ví dụ "Sáng: dev + Jira + Slack", để tìm nhanh.
- Dùng ô **Search** ở trang Sessions để tìm theo tên ứng dụng hoặc URL trong phiên.
- Bấm vào thẻ phiên để xem chi tiết; đổi tên bằng nút **Rename** trong màn hình chi tiết.
