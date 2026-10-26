# Hướng dẫn cài đặt

Tài liệu này mô tả hai cách sử dụng SnappingTool:

- **Cách A — Chạy từ mã nguồn:** phù hợp khi bạn muốn đọc, chỉnh sửa hoặc đóng góp code.
- **Cách B — Build bản chạy (.exe):** đóng gói thành phần mềm Windows để dùng hằng ngày hoặc chia sẻ cho người khác.

> [!NOTE]
> Nếu bạn chỉ muốn cài và dùng bản đã build sẵn, hãy xem [`download/README.md`](../../download/README.md).

## Mục lục

- [Yêu cầu](#yêu-cầu)
- [Cách A — Chạy từ mã nguồn](#cách-a--chạy-từ-mã-nguồn)
- [Cách B — Build bản chạy](#cách-b--build-bản-chạy)
- [Khởi động cùng Windows](#khởi-động-cùng-windows)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Gỡ cài đặt](#gỡ-cài-đặt)

## Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10/11 (đầy đủ tính năng capture và khôi phục vị trí cửa sổ) |
| Trình duyệt | Chrome hoặc Edge, nếu muốn lưu và khôi phục tab |
| Node.js | Bản 18 trở lên (khuyến nghị LTS mới nhất) — chỉ cần cho Cách A và để build ở Cách B. Người dùng bản `.exe` **không cần** Node.js. Tải tại https://nodejs.org |

Kiểm tra Node.js:

```bash
node --version
npm --version
```

## Cách A — Chạy từ mã nguồn

### A1. Tải mã nguồn

Với Git:

```bash
git clone https://github.com/thuanmitom/snappingtool.git
cd snappingtool/source
```

Không dùng Git: trên trang GitHub của repo chọn **Code → Download ZIP**, giải nén, rồi mở thư mục `source/` bên trong.

### A2. Cài phụ thuộc và chạy

```bash
npm install
npm start
```

- `npm install` **không cần** Visual Studio hay trình biên dịch C++ (dự án không dùng native module).
- Cửa sổ SnappingTool sẽ tự mở. Nếu không thấy, tìm icon ở **khay hệ thống** hoặc bấm `Ctrl+Alt+Space`.
- Dùng `npm run dev` thay cho `npm start` để mở kèm DevTools khi cần xem log.

### A3. Cài extension trình duyệt

Trình duyệt không cho phép ứng dụng bên ngoài đọc danh sách tab, vì vậy SnappingTool đi kèm một extension nhỏ.

1. Mở Chrome và vào `chrome://extensions` (Edge: `edge://extensions`).
2. Bật **Developer mode** ở góc trên bên phải.
3. Chọn **Load unpacked** và trỏ tới **thư mục** `source/extension/` (chọn cả thư mục, không phải một file).
4. Trang **ghép cặp** của extension sẽ tự mở (hoặc bấm vào icon extension trên thanh công cụ).
5. Trong SnappingTool, vào **Settings → Browser extension → Copy pairing code**, dán mã vào trang ghép cặp và chọn **Save & test**.

**Kiểm tra:** trang ghép cặp hiển thị **"Connected ✓"** và ứng dụng hiển thị **"tabs: connected"** ở góc trên bên trái.

> [!IMPORTANT]
> Khi chưa ghép cặp, extension không gửi bất kỳ dữ liệu nào. Sau khi ghép cặp, URL và tiêu đề tab được **mã hoá** bằng mã ghép cặp trước khi gửi tới `127.0.0.1` (chính máy của bạn) — không bao giờ ra Internet.
>
> Hãy giữ mã ghép cặp cho riêng mình. Nếu nghi ngờ bị lộ, vào **Settings → Browser extension → New code** rồi dán mã mới vào extension.

## Cách B — Build bản chạy

### B1. Build

Trong thư mục `source/` (đã chạy `npm install` ở bước A2):

```bash
npm run build:win        # bộ cài (installer) + bản portable
npm run build:portable   # chỉ bản portable
```

Lần build đầu mất vài phút vì phải tải các công cụ đóng gói. Kết quả được ghi vào thư mục **`download/`** ở gốc repo:

| File / thư mục | Mô tả |
|---|---|
| `SnappingTool Setup 0.2.0.exe` | **Bộ cài** — cài như phần mềm thông thường, có shortcut Desktop/Start Menu, gỡ qua Settings → Apps |
| `SnappingTool 0.2.0.exe` | **Bản portable** — một file chạy trực tiếp, không cần cài |
| `SHA256SUMS.txt` | Mã kiểm tra SHA-256 của các file `.exe` |
| `extension/` | Bản sao extension trình duyệt dành cho người dùng bản chạy |

Các file này chỉ nằm trên máy của bạn và không được đưa lên GitHub (mỗi file `.exe` khoảng 106 MB, vượt giới hạn 100 MB của GitHub).

### B2. Chia sẻ bản chạy

- Người nhận **không cần cài Node.js**.
- Gửi kèm `SHA256SUMS.txt` để người nhận kiểm tra file `.exe` chưa bị chỉnh sửa.
- File chưa ký số sẽ bị Windows SmartScreen cảnh báo. Bản phát hành công khai nên được ký số — xem [`PUBLISH.md`](PUBLISH.md).
- Extension trình duyệt vẫn cần được cài và ghép cặp trên từng máy (bước A3, dùng thư mục `download/extension/`).

## Khởi động cùng Windows

- **Settings → Behaviour → Launch on startup:** ứng dụng tự khởi động ẩn ở khay hệ thống khi đăng nhập Windows.
- **Settings → Behaviour → Restore a session at startup:** chọn một phiên để tự khôi phục khoảng 8 giây sau khi đăng nhập.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `npm install` báo lỗi | Cập nhật Node.js lên bản LTS mới nhất, xoá `node_modules` rồi chạy lại. |
| `npm start` báo *Electron failed to install correctly* | Chạy `node node_modules/electron/install.js` để tải lại Electron, rồi `npm start`. |
| Không thấy cửa sổ ứng dụng | Tìm icon ở khay hệ thống hoặc bấm `Ctrl+Alt+Space`. |
| Luôn hiển thị "tabs: off" | Kiểm tra đã nạp đúng thư mục `extension/` và đã ghép cặp (bước A3). Nếu trang ghép cặp báo mã bị từ chối, mã đã được tạo mới — copy lại mã hiện tại từ Settings. Nếu vẫn lỗi, bấm **Reload** trên thẻ extension trong `chrome://extensions`. |
| Snap không thấy ứng dụng nào | Chạy SnappingTool bằng **cùng tài khoản Windows** với các ứng dụng cần lưu. Nếu ứng dụng đích chạy quyền Administrator, SnappingTool cũng cần chạy quyền Administrator. |
| Một ứng dụng không mở lại khi khôi phục | Kiểm tra ứng dụng đó vẫn được cài ở đúng đường dẫn như lúc snap. |
| Capture/khôi phục chậm hoặc báo *timed out* | Windows Defender quét script PowerShell ở lần chạy đầu; lần thứ hai thường nhanh hơn. |
| Không đặt được phím tắt dạng `Ctrl+O+B` | Giới hạn của Windows: phím tắt toàn cục chỉ nhận *phím bổ trợ (Ctrl/Alt/Shift) + một phím thường*, ví dụ `Ctrl+Alt+B`. |
| Thông báo *"… was set aside as \*.rejected-…"* | File dữ liệu đã bị sửa ngoài ứng dụng, được chép từ máy/tài khoản khác, hoặc là file JSON thường. Ứng dụng bỏ qua file đó để không mở chương trình lạ; file gốc vẫn được giữ lại trong thư mục dữ liệu. |

## Gỡ cài đặt

- **Bản chạy từ mã nguồn:** xoá thư mục repo.
- **Bản installer:** gỡ qua **Settings → Apps** của Windows.
- **Dữ liệu phiên:** mở bằng **Settings → Storage → Open** và xoá nếu muốn dọn sạch. Các file này được mã hoá; khoá nằm trong `keystore.json` tại `%APPDATA%\SnappingTool`, được Windows bảo vệ theo tài khoản người dùng.
