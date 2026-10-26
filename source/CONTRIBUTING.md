# Hướng dẫn đóng góp

Cảm ơn bạn đã quan tâm đến SnappingTool. Tài liệu này mô tả các nguyên tắc thiết kế, quy trình thêm tính năng và các quy tắc bảo mật bắt buộc khi đóng góp mã nguồn.

> Mọi đường dẫn trong tài liệu này tính từ thư mục `source/`.

## Mục lục

- [Nguyên tắc thiết kế](#nguyên-tắc-thiết-kế)
- [Quy trình thêm tính năng](#quy-trình-thêm-tính-năng)
- [Quy tắc bảo mật (bắt buộc)](#quy-tắc-bảo-mật-bắt-buộc)
- [Cấu trúc dữ liệu snapshot](#cấu-trúc-dữ-liệu-snapshot)
- [Hỗ trợ hệ điều hành khác](#hỗ-trợ-hệ-điều-hành-khác)
- [Chất lượng mã nguồn](#chất-lượng-mã-nguồn)
- [Ý tưởng đang chờ](#ý-tưởng-đang-chờ)

## Nguyên tắc thiết kế

1. **Không dùng native module.** Mọi thứ phải cài được bằng `npm install` thuần, không cần trình biên dịch C++. Lưu trữ dùng JSON (được niêm phong AES-GCM); dữ liệu cửa sổ lấy qua PowerShell.
2. **Renderer không cần bundler.** Giao diện là HTML/CSS/JS thuần trong `src/renderer/`. Không thêm React/webpack nếu không có lý do thật sự rõ ràng.
3. **Một hợp đồng IPC duy nhất.** Mọi lệnh gọi từ renderer sang main đi qua các kênh có tên trong `src/preload/preload.js`. Tính năng mới cho giao diện bắt đầu bằng việc thêm kênh tại đây.

## Quy trình thêm tính năng

Ví dụ: thêm nút "Export session".

1. **Main:** viết logic trong module phù hợp dưới `src/main/` (hoặc tạo module mới), rồi đăng ký kênh `snapshots:export` bằng hàm `handle()` trong `main.js`.
2. **Preload:** thêm `export: (id) => ipcRenderer.invoke('snapshots:export', id)` vào object `api.snapshots` trong `preload.js`.
3. **Renderer:** gọi `window.snap.snapshots.export(id)` từ `app.js` và thêm nút vào giao diện.

Mỗi lớp chỉ đảm nhận một trách nhiệm: **main** giữ quyền hệ thống, **preload** là cầu nối an toàn, **renderer** là giao diện.

## Quy tắc bảo mật (bắt buộc)

Dữ liệu của ứng dụng — URL tab, tiêu đề cửa sổ, đường dẫn `.exe`, file trong thư mục dữ liệu — đều có thể bị bên ngoài điều khiển. Vì vậy:

1. **Không bao giờ chạy lệnh qua shell.** Cấm `cmd.exe /c`, `start`, `exec()`, `shell: true`. Mở ứng dụng và URL bằng `src/main/launcher.js` (spawn trực tiếp hoặc `shell.openPath` / `shell.openExternal`).
2. **Kiểm tra đầu vào bằng `src/main/security.js`** trước khi sử dụng: `sanitizeWebUrl` cho URL, `validateExecutablePath` cho file `.exe`, `isId` cho id.
3. **PowerShell:** script phải là chuỗi cố định. Dữ liệu truyền qua tham số `data` của `runPowerShellScript` (được ghi ra `data.json`); tuyệt đối không ghép chuỗi vào mã script.
4. **IPC mới:** đăng ký bằng `handle()` trong `main.js` (đã kiểm tra nguồn gọi) và chỉ nhận đúng các trường giao diện gửi lên — tham khảo các hàm `sanitize…`.
5. **Renderer:** mọi dữ liệu đưa vào `innerHTML` phải qua `esc()`; giá trị số lấy từ dữ liệu lưu trữ phải được ép kiểu (`monNo()`).
6. **Dữ liệu trên đĩa** chỉ đọc/ghi qua `Store` (tự động niêm phong). Không đọc trực tiếp file JSON trong thư mục dữ liệu.

## Cấu trúc dữ liệu snapshot

```jsonc
{
  "id": "snap_ab12…",
  "name": "Session 2026-01-15 09:30",
  "createdAt": 1737000000000,
  "auto": false,
  "monitors": [{ "id": 0, "x": 0, "y": 0, "width": 1920, "height": 1080, "primary": true }],
  "items": [
    { "type": "app", "title": "Code", "path": "C:\\…\\Code.exe",
      "monitorId": 0, "rect": { "x": 0, "y": 0, "width": 1200, "height": 800 },
      "state": "normal", "included": true },
    { "type": "browser", "browser": "chrome", "monitorId": 1,
      "rect": { … }, "state": "maximized", "included": true,
      "tabs": [{ "url": "https://…", "title": "…", "included": true }] }
  ]
}
```

Khi thay đổi cấu trúc này, cần cập nhật đồng thời: `snapshotBuilder.js` (tạo), `restore.js` (đọc) và `renderer/app.js` (hiển thị sơ đồ và thẻ).

Trên đĩa, object này nằm bên trong file niêm phong (`{"format":"snappingtool-sealed", "iv", "tag", "data"}`) và được giải mã bằng `secrets.unseal()`.

## Hỗ trợ hệ điều hành khác

Phần phụ thuộc hệ điều hành gói gọn trong `capture.js` (liệt kê cửa sổ) và `restore.js` (đặt lại vị trí). Để thêm macOS/Linux:

- Thêm nhánh theo `os.platform()` trong hai file trên.
- macOS: dùng Accessibility API (cần cấp quyền); Linux: `wmctrl`/X11.
- Các phần còn lại của ứng dụng không cần thay đổi.

## Chất lượng mã nguồn

- Chạy `npm run lint` (kiểm tra cú pháp toàn bộ file JS) trước khi commit.
- Ưu tiên mã dễ đọc hơn mã ngắn gọn quá mức. Comment giải thích **vì sao**, không mô tả lại **làm gì**.

## Ý tưởng đang chờ

Ảnh thu nhỏ thật của cửa sổ (nén, tuỳ chọn bật) · Capture trên macOS/Linux · Gợi ý thông minh · Đưa extension lên Chrome Web Store. Xem thêm mục Lộ trình trong [`README.md`](README.md#lộ-trình).
