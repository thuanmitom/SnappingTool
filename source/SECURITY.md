# Chính sách bảo mật

SnappingTool có quyền mở chương trình và trang web trên máy người dùng. Vì vậy, mọi dữ liệu ứng dụng lưu trữ hoặc nhận được đều được coi là **không tin cậy** cho tới khi đã được kiểm tra.

## Mục lục

- [Báo cáo lỗ hổng](#báo-cáo-lỗ-hổng)
- [Mô hình bảo mật](#mô-hình-bảo-mật)
- [Giới hạn đã biết](#giới-hạn-đã-biết)

## Báo cáo lỗ hổng

**Không mở issue công khai cho lỗ hổng bảo mật.** Hãy báo cáo riêng qua **GitHub → Security → Report a vulnerability** (Private vulnerability reporting) của repo, hoặc liên hệ trực tiếp với người duy trì.

Vui lòng cung cấp:

- Phiên bản SnappingTool bị ảnh hưởng
- Các bước tái hiện
- Mức độ và phạm vi ảnh hưởng

## Mô hình bảo mật

| Thành phần | Biện pháp bảo vệ |
|---|---|
| Mở ứng dụng / URL khi khôi phục và trong quick action | Không bao giờ chạy qua shell (`cmd.exe`, `start`). URL chỉ nhận `http(s)` và `file://` trên ổ đĩa cục bộ; chương trình chỉ nhận file `.exe` (quick action: thêm `.lnk`) trên ổ đĩa cục bộ, không nhận đường dẫn mạng `\\server\…`. |
| Đặt lại vị trí cửa sổ (PowerShell) | Script là chuỗi cố định; tiêu đề cửa sổ và toạ độ chỉ được truyền dưới dạng file JSON, không bao giờ ghép vào mã. Script chạy trong thư mục tạm riêng (`mkdtemp`) và gọi `powershell.exe` bằng đường dẫn tuyệt đối. |
| Cầu tab `127.0.0.1:47615` | Chỉ nhận nội dung mã hoá AES-256-GCM bằng **mã ghép cặp** (32 byte ngẫu nhiên). Không có CORS; từ chối Origin của trang web, Host lạ (DNS rebinding), Content-Type không phải JSON và gói tin cũ/phát lại. Dữ liệu tab được kiểm tra lại (URL, kích thước). |
| Extension trình duyệt | Không gửi dữ liệu khi chưa ghép cặp. Dữ liệu được mã hoá trước khi gửi, nên chương trình khác chiếm cổng 47615 cũng chỉ nhận được bản mã. |
| File dữ liệu (`snapshots.json`, `catalogs.json`, `quickActions.json`) | Niêm phong bằng AES-256-GCM. Khoá nằm trong `keystore.json` ở thư mục dữ liệu ứng dụng, được bọc bằng Electron `safeStorage` (Windows DPAPI). File bị sửa, chép từ tài khoản/máy khác hoặc là JSON thường sẽ bị bỏ qua và đổi tên thành `*.rejected-<thời gian>`. Thư mục lưu trữ không được là đường dẫn mạng. |
| Giao diện (renderer) | Bật `sandbox` và `contextIsolation`, tắt `nodeIntegration`; CSP chặt; chặn điều hướng, cửa sổ mới, webview và mọi quyền (camera, micro…). Mọi kênh IPC đều kiểm tra nguồn gọi và kiểu dữ liệu. |
| Bản build | Electron ở phiên bản còn được hỗ trợ; Electron Fuses tắt `RunAsNode`, `NODE_OPTIONS`, `--inspect` và bật kiểm tra toàn vẹn `app.asar`. Mỗi bản build có `SHA256SUMS.txt`; bản phát hành nên được ký số (xem [`docs/PUBLISH.md`](docs/PUBLISH.md)). |

## Giới hạn đã biết

- Mã độc **đang chạy dưới chính tài khoản Windows của bạn** có cùng quyền với SnappingTool (đọc được khoá, giả lập extension…). Không ứng dụng desktop nào chống được trường hợp này; hãy giữ máy sạch.
- Ổ mạng đã gán ký tự (ví dụ `Z:\`) trông giống ổ cục bộ — tránh chọn chúng làm thư mục lưu trữ.
- Khi chuyển sang máy mới, các phiên cũ không mở được (khoá gắn với tài khoản Windows). Đây là chủ ý, nhằm chống chép file phiên giả mạo.
- Công cụ build (electron-builder) có cảnh báo `npm audit` mức trung bình ở `sprintf-js` (thư viện log của `@electron/get`). Gói này chỉ dùng khi build, không nằm trong ứng dụng phát hành.
