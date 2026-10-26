<div align="center">

# SnappingTool

**Lưu lại toàn bộ phiên làm việc — ứng dụng, tab trình duyệt, vị trí cửa sổ, bố cục đa màn hình — và khôi phục nguyên trạng chỉ với một thao tác.**

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-orange)
![electron](https://img.shields.io/badge/Electron-44-5ee0c8)
![license](https://img.shields.io/badge/license-MIT-a992ff)

</div>

---

## Giới thiệu

SnappingTool ghi lại những gì đang mở trên máy — các ứng dụng, cửa sổ trình duyệt cùng tab, vị trí từng cửa sổ trên từng màn hình — thành một **phiên (session)**, và dựng lại nguyên vẹn bất cứ lúc nào: thủ công, bằng phím tắt, hoặc tự động khi đăng nhập Windows.

Ứng dụng chạy **hoàn toàn cục bộ**: không máy chủ, không tài khoản, không gửi dữ liệu ra Internet.

## Cấu trúc repo

| Thư mục | Dành cho | Nội dung |
|---|---|---|
| [`download/`](download) | Người dùng muốn có bản chạy `.exe` | Hướng dẫn build bản chạy Windows; sau khi build, file `.exe` và extension trình duyệt xuất hiện tại đây |
| [`source/`](source) | Lập trình viên, người muốn xem mã nguồn | Toàn bộ mã nguồn, chạy trực tiếp bằng terminal; kèm tài liệu, giấy phép và chính sách bảo mật |

## Bắt đầu nhanh

**Chạy từ mã nguồn** (yêu cầu [Node.js](https://nodejs.org) 18+):

```bash
git clone https://github.com/thuanmitom/snappingtool.git
cd snappingtool/source
npm install
npm start
```

**Build bản chạy `.exe`:**

```bash
cd snappingtool/source
npm install
npm run build:win
```

File `.exe` được tạo trong thư mục `download/`. Chi tiết: [`download/README.md`](download/README.md).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [Tổng quan mã nguồn](source/README.md) | Tính năng, cấu trúc mã nguồn, kiến trúc |
| [Cài đặt](source/docs/SETUP.md) | Cài đặt, kết nối extension, xử lý sự cố |
| [Sử dụng](source/docs/USAGE.md) | Snap, khôi phục, catalogs, quick actions, phím tắt |
| [Phát hành](source/docs/PUBLISH.md) | Đưa lên GitHub, build, ký số, phát hành |
| [Bảo mật](source/SECURITY.md) | Mô hình bảo mật và cách báo lỗ hổng |
| [Đóng góp](source/CONTRIBUTING.md) | Quy ước phát triển và quy tắc bảo mật khi viết code |

## Giấy phép

Phát hành theo giấy phép [MIT](source/LICENSE).
