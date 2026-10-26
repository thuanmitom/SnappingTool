# Hướng dẫn phát hành

Tài liệu dành cho người duy trì dự án: đưa mã nguồn lên GitHub, build bản chạy `.exe`, ký số và phát hành.

## Mục lục

- [Phần 1 — Đưa dự án lên GitHub](#phần-1--đưa-dự-án-lên-github)
- [Phần 2 — Build bản chạy](#phần-2--build-bản-chạy)
- [Phần 3 — Ký số](#phần-3--ký-số)
- [Phần 4 — Mã kiểm tra SHA-256](#phần-4--mã-kiểm-tra-sha-256)
- [Phần 5 — Phát hành qua GitHub Releases](#phần-5--phát-hành-qua-github-releases)
- [Lưu ý khi phát hành](#lưu-ý-khi-phát-hành)

## Phần 1 — Đưa dự án lên GitHub

### Chuẩn bị (thực hiện một lần)

1. Tạo tài khoản tại https://github.com nếu chưa có.
2. Cài Git: https://git-scm.com/download/win (giữ các tuỳ chọn mặc định).
3. Khai báo danh tính Git:

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email-github-cua-ban@example.com"
```

### Tạo repo trên GitHub

1. Truy cập https://github.com/new.
2. **Repository name:** `snappingtool` · chọn **Public** · **không** chọn "Add a README" (repo đã có sẵn).
3. Chọn **Create repository**.

### Đẩy mã nguồn lên

Mở terminal tại **thư mục gốc của repo** (thư mục chứa `README.md`, `source/` và `download/`), rồi chạy:

```bash
git init
git add .
git commit -m "Initial release: SnappingTool v0.2.0"
git branch -M main
git remote add origin https://github.com/TEN-GITHUB-CUA-BAN/snappingtool.git
git push -u origin main
```

> [!NOTE]
> Thay `TEN-GITHUB-CUA-BAN` bằng username GitHub. Ở lần push đầu, Git sẽ mở trình duyệt để đăng nhập GitHub.

`.gitignore` đã loại trừ `source/node_modules/` và mọi file build trong `download/` (chỉ giữ `download/README.md`).

### Các lần cập nhật sau

```bash
git add .
git commit -m "Mô tả ngắn thay đổi"
git push
```

## Phần 2 — Build bản chạy

Trong thư mục `source/`:

```bash
npm install
npm run build:win        # bộ cài + bản portable
npm run build:portable   # chỉ bản portable
```

Kết quả được ghi vào thư mục `download/` ở gốc repo:

| File / thư mục | Mô tả |
|---|---|
| `SnappingTool Setup 0.2.0.exe` | **Bộ cài** — cài như phần mềm thông thường, có shortcut Desktop/Start Menu, gỡ qua Settings → Apps |
| `SnappingTool 0.2.0.exe` | **Bản portable** — một file chạy trực tiếp, không cần cài |
| `SHA256SUMS.txt` | Mã kiểm tra SHA-256 của các file `.exe` |
| `extension/` | Bản sao extension trình duyệt cho người dùng bản chạy |

> [!IMPORTANT]
> Mỗi file `.exe` nặng khoảng 106 MB, vượt giới hạn 100 MB mỗi file của GitHub, vì vậy không commit vào repo. Dùng [GitHub Releases](#phần-5--phát-hành-qua-github-releases) để chia sẻ bản chạy.

## Phần 3 — Ký số

File chưa ký số bị Windows SmartScreen cảnh báo, và người dùng không có cách phân biệt bản gốc với bản đã bị chỉnh sửa rồi phát tán lại. **Không hướng dẫn người dùng bấm "Run anyway"** — điều đó tập cho họ bỏ qua đúng lớp bảo vệ chống mã độc.

electron-builder tự động ký khi có chứng chỉ, không cần sửa `package.json`:

- **Chứng chỉ dạng file `.pfx`** — đặt biến môi trường trước khi build:

  ```bash
  set CSC_LINK=C:\duong-dan\chung-chi.pfx
  set CSC_KEY_PASSWORD=mat-khau-chung-chi
  npm run build:win
  ```

  Không commit file `.pfx` hay mật khẩu lên GitHub (`.gitignore` đã chặn `*.pfx` và `*.p12`).
- **Azure Trusted Signing** (chi phí thấp hơn chứng chỉ OV/EV truyền thống) — cấu hình `win.azureSignOptions` theo tài liệu electron-builder.

## Phần 4 — Mã kiểm tra SHA-256

Mỗi lần `npm run build:win` / `npm run build:portable`, file **`download/SHA256SUMS.txt`** được tạo tự động (hoặc chạy riêng `npm run prepare-download`). Đăng file này kèm bản build. Người dùng kiểm tra bằng:

```bash
certutil -hashfile "SnappingTool Setup 0.2.0.exe" SHA256
```

và so sánh với dòng tương ứng trong `SHA256SUMS.txt`.

## Phần 5 — Phát hành qua GitHub Releases

1. Trên trang repo, mở tab **Releases** → **Create a new release**.
2. **Tag:** `v0.2.0` · **Title:** `SnappingTool v0.2.0`.
3. Kéo thả hai file `.exe` và `SHA256SUMS.txt` từ thư mục `download/` vào mục **Attach binaries**.
4. Viết mô tả thay đổi → **Publish release**.

Với mỗi phiên bản mới: tăng `version` trong `source/package.json` → build lại → tạo Release mới với tag tương ứng (ví dụ `v0.3.0`).

## Lưu ý khi phát hành

- Người dùng bản chạy **không cần cài Node.js**.
- Bản build bật **Electron Fuses** (tắt `RunAsNode`, `NODE_OPTIONS`, `--inspect`; bật kiểm tra toàn vẹn `app.asar`), nên không thể bị biến thành trình chạy Node tuỳ ý hoặc bị sửa mã sau khi cài.
- Extension trình duyệt vẫn phải được cài thủ công và ghép cặp trên từng máy (xem [`SETUP.md`](SETUP.md#a3-cài-extension-trình-duyệt)). Để thuận tiện hơn cho người dùng cuối, có thể đưa extension lên **Chrome Web Store** (phí đăng ký một lần): người dùng không cần bật Developer mode và extension được cập nhật tự động. Nếu chưa lên Store, đính kèm `extension.zip` (nén thư mục `download/extension/`) trong Release.
- Mỗi bản phát hành nên dùng phiên bản Electron còn được hỗ trợ (ba bản major mới nhất). Kiểm tra bằng `npm outdated electron`.
