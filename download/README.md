# SnappingTool — Bản chạy (.exe)

Thư mục này là nơi chứa **bản chạy của SnappingTool cho Windows**.

> [!NOTE]
> File `.exe` của SnappingTool nặng khoảng **106 MB**, vượt giới hạn 100 MB mỗi file của GitHub, nên không được lưu sẵn trong repo. Hãy làm theo hướng dẫn dưới đây để tự build bản chạy từ mã nguồn trong thư mục [`../source`](../source). Toàn bộ quá trình chỉ cần vài lệnh và mất vài phút.

## Mục lục

- [Yêu cầu](#yêu-cầu)
- [Build bản chạy](#build-bản-chạy)
- [Kết quả sau khi build](#kết-quả-sau-khi-build)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Cài extension trình duyệt](#cài-extension-trình-duyệt)
- [Kiểm tra tính toàn vẹn (SHA-256)](#kiểm-tra-tính-toàn-vẹn-sha-256)
- [Tài liệu liên quan](#tài-liệu-liên-quan)

## Yêu cầu

| Thành phần | Ghi chú |
|---|---|
| Windows 10/11 (64-bit) | Hệ điều hành chạy SnappingTool |
| [Node.js](https://nodejs.org) 18 trở lên | Chỉ cần để build; máy chạy file `.exe` không cần Node.js |
| [Git](https://git-scm.com/download/win) | Không bắt buộc — có thể tải mã nguồn dạng ZIP |
| Kết nối Internet | Lần build đầu cần tải Electron và công cụ đóng gói |

## Build bản chạy

**1. Tải mã nguồn**

```bash
git clone https://github.com/thuanmitom/snappingtool.git
cd snappingtool/source
```

Không dùng Git: trên trang GitHub chọn **Code → Download ZIP**, giải nén, rồi mở terminal trong thư mục `source/`.

**2. Cài phụ thuộc**

```bash
npm install
```

**3. Build**

```bash
npm run build:win        # bộ cài + bản portable
```

Hoặc chỉ build bản portable:

```bash
npm run build:portable
```

## Kết quả sau khi build

Các file được ghi thẳng vào **thư mục này** (`download/`):

| File / thư mục | Mô tả |
|---|---|
| `SnappingTool Setup <phiên bản>.exe` | **Bộ cài** — cài như phần mềm thông thường, có shortcut Desktop/Start Menu, gỡ qua Settings → Apps |
| `SnappingTool <phiên bản>.exe` | **Bản portable** — một file chạy trực tiếp, không cần cài |
| `SHA256SUMS.txt` | Mã kiểm tra SHA-256 của các file `.exe` |
| `extension/` | Extension trình duyệt dùng để lưu tab |

Các file này chỉ nằm trên máy của bạn; `.gitignore` đã loại chúng khỏi repo.

## Cài đặt và chạy

- **Bộ cài:** chạy `SnappingTool Setup <phiên bản>.exe` và làm theo hướng dẫn.
- **Bản portable:** chạy trực tiếp `SnappingTool <phiên bản>.exe`.

Sau khi mở, SnappingTool chạy nền ở khay hệ thống. Bấm `Ctrl+Alt+Space` để bật/ẩn cửa sổ chính.

> [!WARNING]
> File tự build không có chữ ký số nên Windows SmartScreen có thể cảnh báo *"Windows protected your PC"*. Chỉ chạy file do chính bạn build hoặc file có mã SHA-256 khớp với nguồn bạn tin cậy.

## Cài extension trình duyệt

Extension cho phép SnappingTool lưu và khôi phục tab của Chrome/Edge.

1. Mở `chrome://extensions` (Edge: `edge://extensions`) và bật **Developer mode**.
2. Chọn **Load unpacked** và trỏ tới thư mục `download/extension/`.
3. Trang ghép cặp của extension sẽ tự mở (hoặc bấm vào icon extension).
4. Trong SnappingTool, vào **Settings → Browser extension → Copy pairing code**, dán mã vào trang ghép cặp và chọn **Save & test**.

Khi ứng dụng hiển thị **"tabs: connected"** là đã kết nối thành công. Dữ liệu tab được mã hoá và chỉ gửi tới chính máy của bạn (`127.0.0.1`).

## Kiểm tra tính toàn vẹn (SHA-256)

Khi chia sẻ file `.exe` cho người khác, hãy gửi kèm `SHA256SUMS.txt`. Người nhận kiểm tra bằng:

```bash
certutil -hashfile "SnappingTool Setup 0.2.0.exe" SHA256
```

Kết quả phải trùng với dòng tương ứng trong `SHA256SUMS.txt`.

## Tài liệu liên quan

- [Hướng dẫn cài đặt chi tiết và xử lý sự cố](../source/docs/SETUP.md)
- [Hướng dẫn sử dụng](../source/docs/USAGE.md)
- [Ký số và phát hành](../source/docs/PUBLISH.md)
- [Bảo mật](../source/SECURITY.md)
