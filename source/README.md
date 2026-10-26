<div align="center">

# SnappingTool — Source

**Lưu lại toàn bộ phiên làm việc — ứng dụng, tab trình duyệt, vị trí cửa sổ, bố cục đa màn hình — và khôi phục nguyên trạng chỉ với một thao tác.**

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-orange)
![electron](https://img.shields.io/badge/Electron-44-5ee0c8)
![license](https://img.shields.io/badge/license-MIT-a992ff)
![no native deps](https://img.shields.io/badge/npm%20install-no%20C%2B%2B%20toolchain-ff7eb6)

[Cài đặt](docs/SETUP.md) · [Hướng dẫn sử dụng](docs/USAGE.md) · [Phát hành](docs/PUBLISH.md) · [Bảo mật](SECURITY.md) · [Đóng góp](CONTRIBUTING.md)

</div>

---

Thư mục này chứa **toàn bộ mã nguồn** của SnappingTool, dành cho người muốn đọc code, chạy ứng dụng từ terminal hoặc tự build bản chạy. Nếu bạn chỉ muốn cài và dùng, hãy xem thư mục [`../download`](../download).

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Yêu cầu](#yêu-cầu)
- [Chạy từ mã nguồn](#chạy-từ-mã-nguồn)
- [Build bản chạy (.exe)](#build-bản-chạy-exe)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Bảo mật](#bảo-mật)
- [Hỗ trợ nền tảng](#hỗ-trợ-nền-tảng)
- [Lộ trình](#lộ-trình)
- [Giấy phép](#giấy-phép)

## Giới thiệu

Mỗi ngày bạn mở lại cùng một bộ công cụ: vài cửa sổ code, các tab tài liệu, ứng dụng chat, trình phát nhạc… rồi sắp xếp từng cửa sổ về đúng vị trí trên đúng màn hình. SnappingTool ghi lại toàn bộ trạng thái đó thành một **phiên (session)** và dựng lại nguyên vẹn bất cứ lúc nào — thủ công, bằng phím tắt, hoặc tự động khi đăng nhập Windows.

Ứng dụng chạy **hoàn toàn cục bộ**: không máy chủ, không tài khoản, không gửi dữ liệu ra Internet.

## Tính năng

| Tính năng | Mô tả |
|---|---|
| Snap có chọn lọc | Chọn từng ứng dụng, từng tab cần lưu trước khi lưu phiên |
| Khôi phục đúng vị trí | Mở lại ứng dụng và tab, đặt cửa sổ về đúng chỗ; tự điều chỉnh khi số màn hình thay đổi |
| Xem chi tiết | Xem toàn bộ ứng dụng và tab trong một phiên ở chế độ chỉ đọc |
| Catalogs | Nhóm phiên theo mục đích; gán catalog ngay khi snap hoặc sau đó |
| Ghim & nhân bản | Ghim phiên quan trọng lên đầu (nhận `Ctrl+Alt+1`); nhân bản để tạo biến thể |
| Quick actions | Một phím tắt mở cùng lúc nhiều ứng dụng và URL |
| Ghi phím trực tiếp | Đặt phím tắt bằng cách bấm tổ hợp phím thật |
| Chạy nền ở khay hệ thống | Đóng cửa sổ không tắt ứng dụng; gọi lại bằng `Ctrl+Alt+Space` |
| Profile hiệu năng | Lite / Balanced / Full — tự đề xuất theo cấu hình máy |

## Yêu cầu

- Windows 10/11 (để có đầy đủ tính năng capture và khôi phục vị trí cửa sổ)
- [Node.js](https://nodejs.org) 18 trở lên (khuyến nghị bản LTS mới nhất)
- Chrome hoặc Edge nếu muốn lưu và khôi phục tab trình duyệt

## Chạy từ mã nguồn

```bash
git clone https://github.com/thuanmitom/snappingtool.git
cd snappingtool/source
npm install
npm start
```

`npm install` không cần Visual Studio hay trình biên dịch C++. Dùng `npm run dev` thay cho `npm start` để mở kèm DevTools khi phát triển.

**Kết nối extension trình duyệt** (để lưu tab):

1. Mở `chrome://extensions` (Edge: `edge://extensions`) → bật **Developer mode** → **Load unpacked** → chọn thư mục `source/extension/`.
2. Trong SnappingTool: **Settings → Browser extension → Copy pairing code**.
3. Dán mã vào trang ghép cặp của extension (bấm vào icon extension) → **Save & test**.

Khi ứng dụng hiển thị **"tabs: connected"** ở góc trên là đã kết nối. Hướng dẫn chi tiết và xử lý sự cố: [`docs/SETUP.md`](docs/SETUP.md).

## Build bản chạy (.exe)

```bash
npm run build:win        # bộ cài (NSIS) + bản portable
npm run build:portable   # chỉ bản portable
```

Kết quả được ghi thẳng vào thư mục [`../download`](../download), kèm thư mục `extension/` và file `SHA256SUMS.txt`. Người dùng bản chạy **không cần cài Node.js**. Quy trình phát hành, ký số và đăng lên GitHub: [`docs/PUBLISH.md`](docs/PUBLISH.md).

## Cấu trúc mã nguồn

```
source/
├─ src/
│  ├─ main/                Electron main process (Node)
│  │  ├─ main.js             cửa sổ, tray, phím tắt, IPC, lịch snapshot, khởi động
│  │  ├─ config.js           đường dẫn và profile hiệu năng
│  │  ├─ store.js            lưu trữ JSON được niêm phong AES-256-GCM
│  │  ├─ secrets.js          khoá dữ liệu và khoá ghép cặp, bảo vệ bằng safeStorage (DPAPI)
│  │  ├─ capture.js          liệt kê cửa sổ và màn hình (PowerShell trên Windows)
│  │  ├─ snapshotBuilder.js  ghép ứng dụng, cửa sổ trình duyệt và tab thành phiên
│  │  ├─ restore.js          mở lại ứng dụng, đặt vị trí, điều chỉnh theo màn hình
│  │  ├─ launcher.js         mở ứng dụng và URL — không bao giờ qua shell
│  │  ├─ powershell.js       chạy script .ps1 cố định, dữ liệu truyền qua file JSON
│  │  ├─ security.js         kiểm tra URL, đường dẫn .exe, id, phím tắt
│  │  └─ tabServer.js        cầu localhost cho extension (mã hoá, yêu cầu ghép cặp)
│  ├─ preload/preload.js   bề mặt IPC an toàn (contextBridge)
│  └─ renderer/            giao diện (HTML/CSS/JS thuần, không bundler)
├─ extension/              extension MV3 cho Chrome/Edge, kèm trang ghép cặp
├─ build/                  icon dùng khi đóng gói
├─ scripts/                kiểm tra cú pháp, hoàn thiện thư mục download sau khi build
└─ docs/                   tài liệu cài đặt, sử dụng, phát hành
```

**Nguyên tắc thiết kế:**

- **Không native module** — lưu trữ bằng JSON, dữ liệu cửa sổ lấy qua PowerShell; `npm install` không cần toolchain C++.
- **Renderer không bundler** — giao diện là HTML/CSS/JS thuần, không có bước build nào có thể hỏng.
- **Một hợp đồng IPC** — mọi lệnh giữa renderer và main đi qua các kênh có tên trong `preload.js`.

Chi tiết cách mở rộng và cấu trúc dữ liệu: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Bảo mật

- Mở ứng dụng và URL **không qua shell**; URL chỉ nhận `http(s)` và `file://` cục bộ, chương trình chỉ nhận file `.exe` trên ổ đĩa cục bộ.
- Cầu tab chỉ nhận dữ liệu **mã hoá bằng mã ghép cặp**; trang web và chương trình khác trên máy không thể chèn hay đọc trộm dữ liệu.
- File phiên được **mã hoá và chống chỉnh sửa** (AES-256-GCM, khoá được Windows DPAPI bảo vệ).
- Renderer chạy trong sandbox; Electron luôn ở phiên bản còn được hỗ trợ; bản build bật Electron Fuses.

Mô hình bảo mật đầy đủ và cách báo lỗ hổng: [`SECURITY.md`](SECURITY.md).

## Hỗ trợ nền tảng

| Tính năng | Windows | macOS | Linux |
|---|:---:|:---:|:---:|
| Dashboard, catalogs, phím tắt, quick actions | ✅ | ✅ | ✅ |
| Lưu và khôi phục tab trình duyệt (extension) | ✅ | ✅ | ✅ |
| Lưu ứng dụng và vị trí cửa sổ | ✅ | ⏳ | ⏳ |

## Lộ trình

- [x] Capture/restore trên Windows, snap chọn lọc, catalogs, phím tắt, tray, quick actions, profile hiệu năng, ghim/nhân bản, xem chi tiết
- [ ] Ảnh thu nhỏ thật của cửa sổ (nén, tuỳ chọn bật)
- [ ] Capture trên macOS (Accessibility API)
- [ ] Capture trên Linux (X11)
- [ ] Gợi ý thông minh từ thói quen sử dụng

## Giấy phép

Phát hành theo giấy phép [MIT](LICENSE).
